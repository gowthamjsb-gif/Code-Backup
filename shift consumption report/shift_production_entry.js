// Shift Wise Production Entry Client Script
// Optimized for compatibility and robustness

/** One entry per distinct batch prefix: "034263/331, 034263/319" → "034263". Accepts string or array of batch tokens. */
function unique_batch_prefixes(str_or_list) {
    var tokens = [];
    if (Array.isArray(str_or_list)) {
        tokens = str_or_list;
    } else if (str_or_list) {
        tokens = String(str_or_list).replace(/\n/g, ",").split(",");
    } else {
        return "";
    }
    var seen = {};
    var out = [];
    tokens.forEach(function (raw) {
        var t = String(raw || "").trim();
        if (!t) return;
        var slash = t.indexOf("/");
        var prefix = slash >= 0 ? t.substring(0, slash).trim() : t;
        if (prefix && !seen[prefix]) {
            seen[prefix] = true;
            out.push(prefix);
        }
    });
    return out.join(", ");
}

frappe.ui.form.on('Shift Wise Production Entry', {
    setup: function(frm) {
        // Automatically find all child tables that look like recycle/consumption tables
        Object.keys(frm.fields_dict).forEach(function (fieldname) {
            var fdef = frm.fields_dict[fieldname];
            if (fdef && fdef.df && fdef.df.fieldtype === 'Table') {
                var child_dt = fdef.df.options;
                // Separate handler specifically for Wastage tables
                if (fieldname.indexOf('waste') !== -1 || fieldname.indexOf('wastage') !== -1) {
                    frappe.ui.form.on(child_dt, {
                        wastage_qty_kg: function (frm, cdt, cdn) { calculate_totals(frm); },
                        qty: function (frm, cdt, cdn) { calculate_totals(frm); },
                        width_inch: function (frm, cdt, cdn) { calculate_totals(frm); }
                    });
                }
                // Separate handler for Recycle / Consumption tables
                else if (child_dt === 'Shift Consumption Item' || fieldname === 'recycle' || fieldname === 'patty_consumption') {
                    var child_events = {};
                    ["consumption_qty_kg", "qty", "amount"].forEach(function (f) {
                        child_events[f] = function () { calculate_totals(frm); };
                    });

                    child_events.quality = function (frm, cdt, cdn) {
                        var row = locals[cdt][cdn];
                        if (row.parentfield && (row.parentfield.indexOf('waste') !== -1 || row.parentfield.indexOf('wastage') !== -1)) return;
                        row.colour = ""; row.gsm = ""; row.width_inch = 0; row.available_balance = 0;
                        frm.refresh_field(row.parentfield);
                        update_consumption_options(frm, row, 'colour', child_dt);
                    };
                    child_events.colour = function (frm, cdt, cdn) {
                        var row = locals[cdt][cdn];
                        if (row.parentfield && (row.parentfield.indexOf('waste') !== -1 || row.parentfield.indexOf('wastage') !== -1)) return;
                        row.gsm = ""; row.width_inch = 0; row.available_balance = 0;
                        frm.refresh_field(row.parentfield);
                        update_consumption_options(frm, row, 'gsm', child_dt);
                    };
                    child_events.gsm = function (frm, cdt, cdn) {
                        var row = locals[cdt][cdn];
                        if (row.parentfield && (row.parentfield.indexOf('waste') !== -1 || row.parentfield.indexOf('wastage') !== -1)) return;
                        row.width_inch = 0; row.available_balance = 0;
                        frm.refresh_field(row.parentfield);
                        update_consumption_options(frm, row, 'width', child_dt);
                    };
                    child_events.width_inch = function (frm, cdt, cdn) {
                        var row = locals[cdt][cdn];
                        if (row.parentfield && (row.parentfield.indexOf('waste') !== -1 || row.parentfield.indexOf('wastage') !== -1)) return;
                        row.available_balance = 0;
                        frm.refresh_field(row.parentfield);
                        update_consumption_options(frm, row, 'balance', child_dt);
                    };

                    frappe.ui.form.on(child_dt, child_events);
                }
            }
        });
    },

    refresh: function (frm) {
        frm.trigger("setup_barcode_scanner");

        // Auto-fill from redirect: URL params set by Shaft Production Run
        if (frm.is_new()) {
            var url_params = new URLSearchParams(window.location.search);
            var has_redirect_params = url_params.get('shift') || url_params.get('posting_date');
            if (has_redirect_params) {
                setTimeout(function() {
                    var field_map = {
                        'posting_date': url_params.get('posting_date'),
                        'shift': url_params.get('shift'),
                        'company': url_params.get('company'),
                        'unit': url_params.get('unit'),
                        'custom_unit': url_params.get('unit')
                    };
                    Object.keys(field_map).forEach(function(fname) {
                        var val = field_map[fname];
                        if (val && val !== 'undefined' && val !== 'null' && frm.fields_dict[fname]) {
                            frm.set_value(fname, val);
                        }
                    });
                    // Note: 'get_data' is no longer triggered automatically,
                    // allowing user to select company and unit manually before fetching data.
                }, 600);
            }
            
            // Initialize Shift Consumables table with default items
            if (frm.fields_dict.shift_consumables && (!frm.doc.shift_consumables || frm.doc.shift_consumables.length === 0)) {
                var default_items = ['CS - 2001001', 'CS - 2001003', 'DC - 3001001'];
                frm.clear_table('shift_consumables');
                default_items.forEach(function(item_code) {
                    var row = frm.add_child('shift_consumables');
                    row.item_code = item_code;
                });
                frm.refresh_field('shift_consumables');
            }
        }
        var base_target;
        if (frm.doc.docstatus === 0) {
            if (frm.is_new() && !frm.doc.posting_date) {
                frm.set_value("posting_date", frappe.datetime.get_today());
            }
            calculate_totals(frm);
            update_wastage_options(frm);

            // Find appropriate table for options
            var tname = find_recycle_table(frm);
            if (tname && frm.fields_dict[tname]) {
                update_consumption_options(frm, null, 'quality', frm.fields_dict[tname].df.options);
            }

            frm.add_custom_button('Debug Form Data', function () {
                console.log("Full Doc Data:", frm.doc);
                var tname = find_recycle_table(frm);
                if (tname && frm.doc[tname] && frm.doc[tname].length > 0) {
                    console.log("Found Recycle Table:", tname);
                    console.table(frm.doc[tname]);
                    console.log("Field List in First Row:", Object.keys(frm.doc[tname][0]));
                }
                frappe.msgprint("Diagnostics printed to Browser Console (F12).");
            }, "Tools");

            // Add "View All Rolls" button below the Production Items table
            if (frm.fields_dict.production_items && frm.fields_dict.production_items.grid) {
                frm.fields_dict.production_items.grid.add_custom_button(__('View All Rolls (Shift)'), function () {
                    // Collect all stock entries from every production row
                    var all_stock_entries = [];
                    $.each(frm.doc.production_items || [], function (i, row) {
                        if (row.stock_entry && all_stock_entries.indexOf(row.stock_entry) === -1) {
                            all_stock_entries.push(row.stock_entry);
                        }
                    });
                    show_rolls_popup(frm, "", "", all_stock_entries.join(","));
                });
            }
            
            // Bypass Frappe's strict 'Save' validation by making it non-mandatory temporarily
            // so that we can enforce it strictly only on Submit.
            if (frm.fields_dict.consumption_items && frm.fields_dict.consumption_items.grid) {
                frm.fields_dict.consumption_items.grid.update_docfield_property("actual_consumption", "reqd", 0);
            }
            if (frm.fields_dict.fg_consumption_items && frm.fields_dict.fg_consumption_items.grid) {
                frm.fields_dict.fg_consumption_items.grid.update_docfield_property("actual_consumption", "reqd", 0);
                frm.fields_dict.fg_consumption_items.grid.update_docfield_property("actual_consumption", "read_only", 1);
            }
        }
    },

    spinning_waste: function (frm) { calculate_totals(frm); },
    calender_waste: function (frm) { calculate_totals(frm); },
    roll_waste: function (frm) { calculate_totals(frm); },
    lumps_waste: function (frm) { calculate_totals(frm); },
    mixing_waste: function (frm) { calculate_totals(frm); },

    validate: function (frm) {
        calculate_totals(frm);
    },

    before_submit: function(frm) {
        // Ensure actual_consumption is filled for all RM and FG items
        var empty_consumption = false;
        if (frm.doc.consumption_items) {
            $.each(frm.doc.consumption_items, function(i, d) {
                if (!d.actual_consumption || d.actual_consumption <= 0) empty_consumption = true;
            });
        }
        if (frm.doc.fg_consumption_items) {
            $.each(frm.doc.fg_consumption_items, function(i, d) {
                if (!d.actual_consumption || d.actual_consumption <= 0) empty_consumption = true;
            });
        }
        
        if (empty_consumption) {
            frappe.throw(__("Please enter Actual Consumption for all items before submitting."));
        }
    },

    unit: function (frm) { recalculate_target(frm); },

    shift: function (frm) { recalculate_target(frm); },

    batch_no: function (frm) {
        if (!frm.doc.batch_no) return;
        var collapsed = unique_batch_prefixes(frm.doc.batch_no);
        if (collapsed !== frm.doc.batch_no) {
            frm.set_value("batch_no", collapsed);
        }
    },

    get_data: function (frm) {
        if (!frm.doc.posting_date || !frm.doc.shift) {
            frappe.msgprint("Please select Posting Date and Shift first.");
            return;
        }
        var unit_val = frm.doc.custom_unit || frm.doc.unit || '';
        frappe.call({
            method: "get_shift_details",
            args: { posting_date: frm.doc.posting_date, shift: frm.doc.shift, unit: unit_val },
            freeze: true,
            freeze_message: "Fetching shift data, please wait...",
            callback: function (r) {
                if (!r.message) {
                    frappe.msgprint("No data found for the selected Date, Shift and Unit.");
                    return;
                }
                if (r.message.operator) frm.set_value("custom_operator", r.message.operator);
                if (r.message.supervisor) frm.set_value("custom_supervisor", r.message.supervisor);

                    // ── Production Items ─────────────────────────────────────────
                    frm.clear_table("production_items");
                    if (r.message.production_items) {
                        $.each(r.message.production_items, function (i, d) {
                            var row = frm.add_child("production_items");
                            row.work_order = d.work_order;
                            row.stock_entry = d.stock_entry;
                            row.item_code = d.item_code;
                            row.item_name = d.item_name;
                            row.produced_qty = d.produced_qty;
                            row.fg_warehouse = d.fg_warehouse;
                            row.warehouse = d.fg_warehouse; // Fallback
                        });
                    }


                    // ── FG Consumption Items ─────────────────────────────────────
                    if (frm.fields_dict.fg_consumption_items) {
                        frm.clear_table("fg_consumption_items");
                        if (r.message.fg_batches_map) {
                            frm.fg_batches_map = r.message.fg_batches_map;
                        }
                        if (r.message.fg_consumption_items) {
                            $.each(r.message.fg_consumption_items, function (i, d) {
                                var row = frm.add_child("fg_consumption_items");
                                row.item_code = d.item_code;
                                row.item_name = d.item_name;
                                row.batch = d.batch;
                                row.uom = d.uom;
                                row.standard_consumption = d.standard_consumption;
                                row.actual_consumption = ""; // empty initially
                            });
                        }
                        frm.refresh_field("fg_consumption_items");
                    }

                    // ── RM Consumption Items ─────────────────────────────────────
                    frm.clear_table("consumption_items");
                    if (r.message.consumption_items) {
                        $.each(r.message.consumption_items, function (i, d) {
                            var row = frm.add_child("consumption_items");
                            row.item_code = d.item_code;
                            row.item_name = d.item_name;
                            row.uom = d.uom;
                            row.standard_consumption = d.standard_consumption;
                            row.actual_consumption = ""; // empty initially
                            row.sack_weight = 25;
                            row.bags = calc_bags(d.standard_consumption, 25);
                        });
                    }

                    // ── Polybag ──────────────────────────────────────────────────
                    if (r.message.polybag_items && r.message.polybag_items.length > 0 && frm.fields_dict.polybag) {
                        frm.clear_table("polybag");
                        $.each(r.message.polybag_items, function (i, d) {
                            var row = frm.add_child("polybag");
                            row.product = d.product;
                            row.item_name = d.item_name;
                            row.quantity = d.quantity;
                            row.uom = d.uom;
                        });
                        frm.refresh_field("polybag");
                    }

                    // ── Core Consumption ─────────────────────────────────────────
                    var core_table_name = null;
                    $.each(frm.fields_dict, function(k, v) {
                        if (v.df && v.df.fieldtype === 'Table' && (k.indexOf('core') !== -1 || (v.df.options && v.df.options.toLowerCase().indexOf('core') !== -1))) {
                            core_table_name = k;
                        }
                    });
                    
                    if (r.message.core_consumption_items && r.message.core_consumption_items.length > 0 && core_table_name) {
                        frm.clear_table(core_table_name);
                        $.each(r.message.core_consumption_items, function (i, d) {
                            var row = frm.add_child(core_table_name);
                            row.item_code = d.item_code;
                            row.item_name = d.item_name;
                            row.uom = d.uom;
                            row.quantity = d.quantity;
                            row.quantity_kgs = d.quantity;
                            row.custom_quantity_kgs = d.quantity;
                            row.qty = d.quantity;
                        });
                        frm.refresh_field(core_table_name);
                    }

                    // ── Bag Consumables ──────────────────────────────────────────
                    var bag_table_name = null;
                    $.each(frm.fields_dict, function(k, v) {
                        if (v.df && v.df.fieldtype === 'Table' && v.df.options === 'Bag Packing Detail') {
                            bag_table_name = k;
                        }
                    });
                    if (!bag_table_name) {
                        if (frm.fields_dict.bag_consumables) bag_table_name = "bag_consumables";
                        else if (frm.fields_dict.custom_bag_packing_details) bag_table_name = "custom_bag_packing_details";
                        else if (frm.fields_dict.custom_bag_packing_detail) bag_table_name = "custom_bag_packing_detail";
                        else if (frm.fields_dict.bag_packing_details) bag_table_name = "bag_packing_details";
                        else if (frm.fields_dict.bag_packing_detail) bag_table_name = "bag_packing_detail";
                    }
                    if (bag_table_name && r.message.bag_consumables && r.message.bag_consumables.length > 0) {
                        frm.clear_table(bag_table_name);
                        $.each(r.message.bag_consumables, function (i, d) {
                            var row = frm.add_child(bag_table_name);
                            row.item = d.item;
                            row.quantity_kgs = d.quantity_kgs;
                            row.uom = d.uom;
                        });
                        frm.refresh_field(bag_table_name);
                    }

                    // ── Recycle ──────────────────────────────────────────────────
                    var r_table = find_recycle_table(frm);
                    if (r_table && r.message.recycle_items && r.message.recycle_items.length > 0) {
                        frm.clear_table(r_table);
                        $.each(r.message.recycle_items, function (i, d) {
                            var row = frm.add_child(r_table);
                            row.quality = d.quality;
                            row.colour = d.colour;
                            row.gsm = d.gsm;
                            row.width_inch = d.width_inch;
                            row.width_inches = d.width_inch; // Extra fallback
                            row.width = d.width_inch; // Extra fallback
                            row.available_balance = d.quantity_kgs; // Mapping to Quantity (Kgs) as per screenshot
                            row.quantity_kgs = d.quantity_kgs;
                            row.qty = d.quantity_kgs; // Fallback for various child DT fieldnames
                            row.amount = d.quantity_kgs;
                        });
                        frm.refresh_field(r_table);
                    }

                    // ── Running Patty Wastage ───────────────────────────────────
                    var w_table = frm.fields_dict.running_patty_wastage ? 'running_patty_wastage' : (frm.fields_dict.running_patty_waste ? 'running_patty_waste' : null);
                    if (w_table) {
                        frm.clear_table(w_table);

                        // If we have actual wastage data from server, use it
                        if (r.message.wastage_items && r.message.wastage_items.length > 0) {
                            $.each(r.message.wastage_items, function (i, d) {
                                var row = frm.add_child(w_table);
                                row.quality = d.quality;
                                row.colour = d.colour;
                                row.gsm = d.gsm;
                                row.width_inch = d.width_inch;
                                row.wastage_qty_kg = d.wastage_qty_kg;
                                row.qty = d.wastage_qty_kg;
                            });
                        }
                        // Otherwise fallback to template logic based on production attributes
                        else {
                            var attrs = r.message.production_attributes || [];
                            $.each(attrs, function (i, a) {
                                var row = frm.add_child(w_table);
                                row.quality = a.quality;
                                row.colour = a.colour;
                                row.gsm = a.gsm;
                                row.width_inch = 0;
                                row.wastage_qty_kg = 0;
                            });
                        }

                        // Update options for selectivity
                        var q_opts = [""], c_opts = [""], g_opts = [""];
                        $.each(frm.doc[w_table], function (i, d) {
                            if (d.quality && q_opts.indexOf(d.quality) === -1) q_opts.push(d.quality);
                            if (d.colour && c_opts.indexOf(d.colour) === -1) c_opts.push(d.colour);
                            if (d.gsm && g_opts.indexOf(d.gsm) === -1) g_opts.push(d.gsm);
                        });

                        var grid = frm.fields_dict[w_table].grid;
                        grid.update_docfield_property("quality", "options", q_opts.join("\n"));
                        grid.update_docfield_property("colour", "options", c_opts.join("\n"));
                        grid.update_docfield_property("gsm", "options", g_opts.join("\n"));

                        frm.refresh_field(w_table);
                    }

                    console.log("Full Server Response:", r.message);

                    // ── Specific Wastage (Float Fields) ──────────────────────────
                    if (r.message.specific_wastage_totals) {
                        var waste_map = {
                            "WASTE - 001": "spinning_waste",
                            "WASTE - 002": "calender_waste",
                            "WASTE - 003": "roll_waste",
                            "WASTE - 004": "lumps_waste",
                            "WASTE - 005": "mixing_waste",
                            "WASTE - 006": "lamination_trim_waste_kgs",
                            "WASTE - 007": "sheet_waste_kgs",
                            "WASTE - 008": "de_lam_waste_kgs",
                            "WASTE - 009": "without_handle_waste_kgs",
                            "WASTE - 010": "ink_waste_kgs",
                            "WASTE - 011": "punch_waste_kgs"
                        };
                        $.each(waste_map, function (item_code, fieldname) {
                            if (frm.fields_dict[fieldname]) {
                                var val = r.message.specific_wastage_totals[item_code] || 0;
                                frm.set_value(fieldname, val);
                            }
                        });
                    }

                    // ── Batch Number (store unique prefix(es) only, e.g. 034263/… → 034263) ──
                    var batch_list = r.message.all_batch_nos || [];
                    var batch_str = batch_list.length
                        ? unique_batch_prefixes(batch_list)
                        : unique_batch_prefixes(r.message.base_batch_no || "");

                    // Truncate to avoid "Value too big" for Data fields (max 140 chars)
                    if (batch_str && batch_str.length > 140) {
                        batch_str = batch_str.substring(0, 136) + "...";
                    }

                    if (batch_str) frm.set_value("batch_no", batch_str);

                    calculate_totals(frm);
                    
                    // Auto-save the form after data is successfully fetched
                    frm.save();
            }
        });
    },

    setup_barcode_scanner: function(frm) {
        if (!frm.fields_dict.fg_consumption_items || !frm.fields_dict.fg_consumption_items.grid) return;

        // Avoid adding the button multiple times
        if (frm.custom_buttons && frm.custom_buttons['Scan FG Barcode']) return;

        // Add a custom button for scanning FG Barcode below the grid
        var grid = frm.fields_dict.fg_consumption_items.grid;
        grid.add_custom_button(__('Scan FG Barcode'), function() {
            var d = new frappe.ui.Dialog({
                title: 'Scan FG Barcode',
                fields: [
                    {
                        label: 'Barcode / Batch No',
                        fieldname: 'barcode',
                        fieldtype: 'Data',
                        options: 'Barcode',
                        description: 'You can type, use a USB scanner, or click the barcode icon to use your camera.'
                    }
                ],
                primary_action_label: 'Submit',
                primary_action: function(values) {
                    var scanned_val = values.barcode;
                    if (!scanned_val) return;
                    
                    // Fetch Batch details (try matching name or batch_id)
                    frappe.db.get_value('Batch', { 'name': scanned_val }, ['name', 'item', 'custom_net_weight'])
                    .then(r => {
                        if (r && r.message && r.message.name) {
                            process_batch(r.message);
                        } else {
                            // Try matching by batch_id if name doesn't match
                            frappe.db.get_value('Batch', { 'batch_id': scanned_val }, ['name', 'item', 'custom_net_weight'])
                            .then(r2 => {
                                if (r2 && r2.message && r2.message.name) {
                                    process_batch(r2.message);
                                } else {
                                    frappe.msgprint("Batch not found for barcode: " + scanned_val);
                                    reset_scanner();
                                }
                            });
                        }
                    });

                    function process_batch(batch_doc) {
                        var item_code = batch_doc.item;
                        var net_weight = flt(batch_doc.custom_net_weight) || 0;
                        
                        // Check if this item exists in fg_consumption_items
                        var existing_row = null;
                        if (frm.doc.fg_consumption_items) {
                            existing_row = frm.doc.fg_consumption_items.find(row => row.item_code === item_code);
                        }
                        
                        if (existing_row) {
                            // Add to existing actual consumption
                            var current_ac = flt(existing_row.actual_consumption) || 0;
                            frappe.model.set_value(existing_row.doctype, existing_row.name, 'actual_consumption', current_ac + net_weight);
                            calculate_totals(frm);
                            frappe.show_alert({message: 'Added ' + net_weight + ' to existing row for ' + item_code, indicator: 'green'});
                        } else {
                            frappe.msgprint("Item " + item_code + " from the scanned batch is not in the FG Consumption list.");
                        }
                        reset_scanner();
                    }

                    function reset_scanner() {
                        // Clear input and refocus for continuous scanning
                        d.set_value('barcode', '');
                        setTimeout(() => { d.get_input('barcode').focus(); }, 100);
                    }
                }
            });
            d.show();
            // Automatically focus the barcode input
            setTimeout(() => {
                d.get_input('barcode').focus();
            }, 500);
        });
    }
});

frappe.ui.form.on('Shift Production Item', {
    view_rolls: function (frm, cdt, cdn) {
        var row = locals[cdt][cdn];
        if (row.item_code) {
            show_rolls_popup(frm, row.item_code, row.work_order, row.stock_entry);
        }
    }
});

frappe.ui.form.on('Shift Consumption Item', {
    actual_consumption: function (frm, cdt, cdn) {
        var row = locals[cdt][cdn];
        row.variance = flt(row.standard_consumption) - flt(row.actual_consumption);
        row.bags = calc_bags(row.actual_consumption, row.sack_weight);
        frm.refresh_field("consumption_items");
        calculate_totals(frm);
    },
    sack_weight: function (frm, cdt, cdn) {
        var row = locals[cdt][cdn];
        row.bags = calc_bags(row.actual_consumption, row.sack_weight);
        frm.refresh_field("consumption_items");
    }
});

// Bags = actual consumption ÷ sack weight (default 25 kg)
function calc_bags(qty, sack_wt) {
    var w = flt(sack_wt) > 0 ? flt(sack_wt) : 25.0;
    return flt(qty) / w;
}

frappe.ui.form.on('Shift Polybag Detail', {
    product: function (frm, cdt, cdn) {
        var row = locals[cdt][cdn];
        if (row.product) {
            frappe.db.get_value('Item', row.product, 'item_name', (r) => {
                if (r && r.item_name) {
                    frappe.model.set_value(cdt, cdn, 'item_name', r.item_name);
                }
            });
        }
    },
    quantity: function (frm, cdt, cdn) {
        calculate_totals(frm);
    }
});

// Core Consumption child table handler
frappe.ui.form.on('Shift Core Consumption Item', {
    quantity: function (frm, cdt, cdn) {
        calculate_totals(frm);
    }
});

// Bag Packing Detail child table handler
frappe.ui.form.on('Bag Packing Detail', {
    quantity_kgs: function (frm, cdt, cdn) {
        calculate_totals(frm);
    }
});

function find_recycle_table(frm) {
    // 1. Check explicit fieldnames
    if (frm.fields_dict.recycle) return 'recycle';
    if (frm.fields_dict.patty_consumption) return 'patty_consumption';

    // 2. Check for DocType options (Most reliable)
    var found = null;
    Object.keys(frm.fields_dict).forEach(function (f) {
        var fdef = frm.fields_dict[f];
        if (fdef && fdef.df && fdef.df.fieldtype === 'Table') {
            var opt = fdef.df.options;
            if (opt === 'Shift Patty Consumption Detail - Recycle') found = f;
            else if (opt === 'Shift Consumption Item' && f.indexOf('waste') === -1) {
                // Secondary check if it's the Generic consumption item but NOT a wastage table
                if (f.indexOf('recycle') !== -1 || f.indexOf('patty') !== -1) {
                    if (!found) found = f;
                }
            }
        }
    });
    return found;
}

// ---------------------------------------------------------------------------
// Target calculation — handles all Shift x Unit combinations
// Per-shift targets:  Unit 1=2000  Unit 2=6500  Unit 3=4500  Unit 4=4000
// ---------------------------------------------------------------------------
function recalculate_target(frm) {
    var PER_SHIFT = { "Unit 1": 2000, "Unit 2": 6500, "Unit 3": 4500, "Unit 4": 4000 };
    var ALL_UNITS_SUM = 2000 + 6500 + 4500 + 4000; // 19000
    var is_full_day = (frm.doc.shift === "Full Day");
    var is_all_units = (!frm.doc.unit || frm.doc.unit === "All Units");

    var base_target;
    if (is_all_units) {
        base_target = ALL_UNITS_SUM;
    } else {
        base_target = PER_SHIFT[frm.doc.unit] || 0;
    }

    var final_target = is_full_day ? base_target * 2 : base_target;
    frm.set_value("target", final_target);
}

function calculate_totals(frm) {
    var total_prod = 0, total_rm_std = 0, total_rm_act = 0, total_fg_std = 0, total_fg_act = 0;
    
    if (frm.doc.production_items) {
        $.each(frm.doc.production_items, function (i, d) { total_prod += flt(d.produced_qty); });
    }
    
    if (frm.doc.consumption_items) {
        $.each(frm.doc.consumption_items, function (i, d) {
            total_rm_std += flt(d.standard_consumption);
            total_rm_act += flt(d.actual_consumption);
        });
    }

    if (frm.doc.fg_consumption_items) {
        $.each(frm.doc.fg_consumption_items, function (i, d) {
            total_fg_std += flt(d.standard_consumption);
            total_fg_act += flt(d.actual_consumption);
        });
    }

    var total_std = total_rm_std + total_fg_std;
    var total_act = total_rm_act + total_fg_act;

    frm.set_value("total_production_qty", total_prod);
    
    // Set RM fields (Checking both the new exact names and the old field names you might have renamed!)
    if (frm.fields_dict.total_rm_standard_consumption) frm.set_value("total_rm_standard_consumption", total_rm_std);
    else if (frm.fields_dict.total_standard_consumption) frm.set_value("total_standard_consumption", total_rm_std); // Fallback for old field

    if (frm.fields_dict.total_rm_actual_consumption) frm.set_value("total_rm_actual_consumption", total_rm_act);
    else if (frm.fields_dict.total_actual_consumption) frm.set_value("total_actual_consumption", total_rm_act); // Fallback for old field

    if (frm.fields_dict.total_rm_variance) frm.set_value("total_rm_variance", total_rm_std - total_rm_act);
    else if (frm.fields_dict.total_variance) frm.set_value("total_variance", total_rm_std - total_rm_act); // Fallback for old field
    
    // Set FG fields
    if (frm.fields_dict.total_fg_standard_consumption_kgs) frm.set_value("total_fg_standard_consumption_kgs", total_fg_std);
    if (frm.fields_dict.total_fg_actual_consumption_kgs) frm.set_value("total_fg_actual_consumption_kgs", total_fg_act);
    if (frm.fields_dict.total_fg_variance_kgs) frm.set_value("total_fg_variance_kgs", total_fg_std - total_fg_act);

    // Sum Bags (Poly Bags)
    var total_bags = 0;
    if (frm.doc.polybag) {
        $.each(frm.doc.polybag, function (i, d) { total_bags += flt(d.quantity); });
    }
    if (frm.fields_dict.total_polybag) frm.set_value("total_polybag", total_bags);

    // Core Consumption Total
    var total_core = 0;
    if (frm.doc.core_consumption) {
        $.each(frm.doc.core_consumption, function (i, d) { total_core += flt(d.quantity); });
    }
    if (frm.fields_dict.total_core_consumption) frm.set_value("total_core_consumption", total_core);

    // Bag Consumables Total
    var total_bag_cons = 0;
    var bag_table_name_tot = null;
    $.each(frm.fields_dict, function(k, v) {
        if (v.df && v.df.fieldtype === 'Table' && v.df.options === 'Bag Packing Detail') {
            bag_table_name_tot = k;
        }
    });
    if (!bag_table_name_tot) {
        if (frm.fields_dict.bag_consumables) bag_table_name_tot = "bag_consumables";
        else if (frm.fields_dict.custom_bag_packing_details) bag_table_name_tot = "custom_bag_packing_details";
        else if (frm.fields_dict.custom_bag_packing_detail) bag_table_name_tot = "custom_bag_packing_detail";
        else if (frm.fields_dict.bag_packing_details) bag_table_name_tot = "bag_packing_details";
        else if (frm.fields_dict.bag_packing_detail) bag_table_name_tot = "bag_packing_detail";
    }

    if (bag_table_name_tot && frm.doc[bag_table_name_tot]) {
        $.each(frm.doc[bag_table_name_tot], function (i, d) { total_bag_cons += flt(d.quantity_kgs); });
    }
    if (frm.fields_dict.total_bag_consumables) frm.set_value("total_bag_consumables", total_bag_cons);

    // Wastage Total
    var total_waste = (flt(frm.doc.spinning_waste) || 0) + (flt(frm.doc.calender_waste) || 0) + (flt(frm.doc.roll_waste) || 0) + 
                      (flt(frm.doc.lumps_waste) || 0) + (flt(frm.doc.mixing_waste) || 0) +
                      (flt(frm.doc.lamination_trim_waste_kgs) || 0) + (flt(frm.doc.sheet_waste_kgs) || 0) +
                      (flt(frm.doc.de_lam_waste_kgs) || 0) + (flt(frm.doc.without_handle_waste_kgs) || 0) +
                      (flt(frm.doc.ink_waste_kgs) || 0) + (flt(frm.doc.punch_waste_kgs) || 0);
    var w_table_name = frm.fields_dict.running_patty_wastage ? 'running_patty_wastage' : (frm.fields_dict.running_patty_waste ? 'running_patty_waste' : null);
    if (w_table_name && frm.doc[w_table_name]) {
        $.each(frm.doc[w_table_name], function (i, d) { total_waste += (flt(d.wastage_qty_kg) || flt(d.qty) || 0); });
    }
    frm.set_value("total_wastage", total_waste);

    // Recycle Total
    var total_recycled = 0;
    var r_table_name = find_recycle_table(frm);
    if (r_table_name && frm.doc[r_table_name]) {
        $.each(frm.doc[r_table_name], function (i, d) {
            total_recycled += (flt(d.quantity_kgs) || flt(d.consumption_qty_kg) || flt(d.wastage_qty_kg) || flt(d.qty) || flt(d.amount) || flt(d.available_balance) || 0);
        });
    }
    frm.set_value("total_recycled", total_recycled);

    var denominator = total_act > 0 ? total_act : total_std;

    if (denominator > 0) {
        frm.set_value("production_", (total_prod / denominator) * 100.0);
        frm.set_value("recycle_", (total_recycled / denominator) * 100.0);
    } else {
        frm.set_value("production_", 0);
        frm.set_value("recycle_", 0);
    }

    if (total_prod > 0) {
        frm.set_value("wastage_", (total_waste / total_prod) * 100.0);
    } else {
        frm.set_value("wastage_", 0);
    }
    if (flt(frm.doc.target) > 0) frm.set_value("target_acheived_", (total_prod / flt(frm.doc.target)) * 100.0);
    frm.refresh_fields([
        "total_production_qty", 
        "total_rm_standard_consumption", "total_rm_actual_consumption", "total_rm_variance",
        "total_fg_standard_consumption", "total_fg_actual_consumption", "total_fg_variance",
        "total_standard_consumption", "total_actual_consumption", "total_variance", 
        "total_wastage", "total_recycled", "total_polybag", "total_core_consumption", 
        "production_", "recycle_", "wastage_", "target_acheived_"
    ]);
}

function update_consumption_options(frm, row, type, child_dt) {
    if (type === 'balance') {
        if (!row || !row.width_inch) return;
        frappe.call({
            method: 'get_patty_balance',
            args: { quality: row.quality, colour: row.colour, gsm: row.gsm, width_inch: row.width_inch },
            callback: function (r) {
                var bal = flt(r.message);
                frappe.model.set_value(row.doctype, row.name, 'available_balance', bal);
                ["consumption_qty_kg", "wastage_qty_kg", "quantity_kgs", "qty", "amount"].forEach(function (f) {
                    if (row[f] !== undefined) frappe.model.set_value(row.doctype, row.name, f, bal);
                });
                calculate_totals(frm);
            }
        });
        return;
    }
    frappe.call({
        method: 'get_patty_stock_options',
        args: { get_type: type, quality: row ? row.quality : null, colour: row ? row.colour : null, gsm: row ? row.gsm : null },
        callback: function (r) {
            var opts = r.message || [];
            var options = [""].concat(opts).join("\n");
            var target = type === 'width' ? 'width_inch' : type;
            var tname = find_recycle_table(frm);
            if (tname && frm.fields_dict[tname].grid) {
                frm.fields_dict[tname].grid.update_docfield_property(target, "options", options);
                frm.refresh_field(tname);
            }
        }
    });
}

function update_wastage_options(frm) {
    var w_table = frm.fields_dict.running_patty_wastage ? 'running_patty_wastage' : (frm.fields_dict.running_patty_waste ? 'running_patty_waste' : null);
    if (!w_table || !frm.doc[w_table]) return;

    var q_opts = [""], c_opts = [""], g_opts = [""];
    $.each(frm.doc[w_table], function (i, d) {
        if (d.quality && q_opts.indexOf(d.quality) === -1) q_opts.push(d.quality);
        if (d.colour && c_opts.indexOf(d.colour) === -1) c_opts.push(d.colour);
        if (d.gsm && g_opts.indexOf(d.gsm) === -1) g_opts.push(d.gsm);
    });

    var grid = frm.fields_dict[w_table].grid;
    if (grid) {
        grid.update_docfield_property("quality", "options", q_opts.join("\n"));
        grid.update_docfield_property("colour", "options", c_opts.join("\n"));
        grid.update_docfield_property("gsm", "options", g_opts.join("\n"));
    }
}

function show_rolls_popup(frm, item_code, work_order, stock_entry) {
    if (!frm.doc.posting_date || !frm.doc.shift) {
        frappe.msgprint(__("Select Posting Date and Shift first."));
        return;
    }

    frappe.call({
        method: "get_roll_details",
        args: {
            posting_date: frm.doc.posting_date,
            shift: frm.doc.shift,
            unit: frm.doc.unit,
            item_code: item_code || "",
            work_order: work_order || "",
            stock_entry: stock_entry || ""
        },
        freeze: true,
        callback: function (r) {
            var rolls = r.message || [];
            if (rolls.length === 0) {
                frappe.msgprint(__("No rolls found for the selected criteria."));
                return;
            }

            var title = item_code ? ("Rolls for " + item_code) : "All Rolls for Shift";

            // ── Company header HTML (matches print template) ──
            var doc_ref = frm.doc.name || "";
            var company_header = [
                '<div style="border: 2px solid #2e7d32; padding: 10px; text-align: center; margin-bottom: 8px; font-family: Arial, sans-serif;">',
                '  <img src="/private/files/JSB LOGO63b225.png" alt="JSB Logo" style="height:60px; display:block; margin:0 auto 4px;" />',
                '  <div style="font-size:18px; font-weight:900; text-transform:uppercase; color:#000; letter-spacing:1px;">Jayashree Spun Bond</div>',
                '  <div style="font-size:9px; color:#555; margin-top:2px;">Mfrs. of Non Woven Fabrics &amp; Products &nbsp;|&nbsp; A Govt. of India Recognised &#9733; Star Export House</div>',
                '  <div style="font-size:11px; font-weight:800; text-transform:uppercase; color:#000; margin-top:5px; border-top:1px solid #ccc; padding-top:4px;">',
                '    Shift Wise Production Entry &nbsp;|&nbsp; ' + doc_ref,
                '  </div>',
                '</div>'
            ].join('');

            // ── Info Row HTML ──
            var roll_unit = frm.doc.unit || "All Units";
            var roll_shift = frm.doc.shift || "—";
            var roll_date = frm.doc.posting_date ? frappe.datetime.str_to_user(frm.doc.posting_date) : "—";

            if (rolls.length > 0) {
                var unique_units = [];
                var unique_shifts = [];
                var unique_dates = [];
                $.each(rolls, function(i, r) {
                    if (r.unit && unique_units.indexOf(r.unit) === -1) unique_units.push(r.unit);
                    if (r.shift && unique_shifts.indexOf(r.shift) === -1) unique_shifts.push(r.shift);
                    if (r.run_date && unique_dates.indexOf(r.run_date) === -1) unique_dates.push(r.run_date);
                });

                if (unique_units.length === 1 && unique_units[0]) roll_unit = unique_units[0];
                else if (unique_units.length > 1) roll_unit = unique_units.join(", ");

                if (unique_shifts.length === 1 && unique_shifts[0]) roll_shift = unique_shifts[0];
                else if (unique_shifts.length > 1) roll_shift = unique_shifts.join(", ");

                if (unique_dates.length === 1 && unique_dates[0]) roll_date = frappe.datetime.str_to_user(unique_dates[0]);
            }

            var info_cell_style = "border:1px solid #555; padding:0;";
            var lbl_style = "background:#e65100; color:#fff; font-size:8px; font-weight:700; text-transform:uppercase; padding:2px 5px; text-align:center; display:block;";
            var val_style = "font-size:10.5px; font-weight:700; color:#111; padding:3px 5px; text-align:center; display:block;";
            var info_html = [
                '<table style="width:100%; border-collapse:collapse; margin-bottom:6px;">',
                '<tr>',
                '  <td style="' + info_cell_style + '"><span style="' + lbl_style + '">Date</span><span style="' + val_style + '">' + roll_date + '</span></td>',
                '  <td style="' + info_cell_style + '"><span style="' + lbl_style + '">Shift</span><span style="' + val_style + '">' + roll_shift + '</span></td>',
                '  <td style="' + info_cell_style + '"><span style="' + lbl_style + '">Unit</span><span style="' + val_style + '">' + roll_unit + '</span></td>',
                '</tr>',
                '</table>'
            ].join('');

            // ── Shared CSS ──
            var th_style = 'background:#ffb74d; border:1px solid #e65100; padding:5px 6px; font-weight:700; font-size:9px; text-transform:uppercase; color:#000; text-align:center;';
            var td_style = 'border:1px solid #ccc; padding:4px 6px; color:#111; background:#fff; text-align:center;';
            var td_e_style = 'border:1px solid #ccc; padding:4px 6px; color:#111; background:#fafafa; text-align:center;';
            var tf_style = 'border:1px solid #aaa; padding:5px 6px; font-weight:700; background:#c8e6c9; font-size:10px; text-align:center; color:#1b5e20;';

            // ── Section heading ──
            var section_head = '<div style="background:#f57f17; border:1px solid #e65100; border-bottom:none; padding:4px 10px; font-size:10px; font-weight:800; text-transform:uppercase; text-align:center; color:#000;">' + title + '</div>';

            // ── Check if there are bag items ──
            var has_bags = false;
            var has_rolls = false;
            $.each(rolls, function(i, row) {
                if (row.item_name && row.item_name.toUpperCase().indexOf("BAG") !== -1) {
                    has_bags = true;
                } else {
                    has_rolls = true;
                }
            });

            var length_header = 'Length (Mtrs)';
            if (has_bags && !has_rolls) {
                length_header = 'Bag Pcs';
            } else if (has_bags && has_rolls) {
                length_header = 'Length (Mtrs) / Bag Pcs';
            }

            // ── Table HTML ──
            var html = section_head + '<table style="width:100%; border-collapse:collapse; font-size:10px; font-family:Arial,sans-serif;">';
            html += '<thead><tr>' +
                '<th style="' + th_style + '">Batch No</th>' +
                '<th style="' + th_style + '">Item Code</th>' +
                '<th style="' + th_style + '">Quality</th>' +
                '<th style="' + th_style + '">Colour</th>' +
                '<th style="' + th_style + '">' + length_header + '</th>' +
                '<th style="' + th_style + '">Net Weight (Kgs)</th>' +
                '<th style="' + th_style + '">Gross Weight (Kgs)</th>' +
                '<th style="' + th_style + '">Order Code</th>' +
                '<th style="' + th_style + '">Shaft Run</th>' +
                '</tr></thead><tbody>';

            var t_nw = 0, t_gw = 0, t_mtr = 0, t_bags = 0;
            $.each(rolls, function (i, row) {
                var is_bag = row.item_name && row.item_name.toUpperCase().indexOf("BAG") !== -1;
                var bg = (i % 2 === 0) ? td_style : td_e_style;
                html += '<tr>';
                html += '<td style="' + bg + '">' + (row.batch_no || "") + '</td>';
                html += '<td style="' + bg + '">' + (row.item_code || "") + '</td>';
                html += '<td style="' + bg + '">' + (row.quality || "Unknown") + '</td>';
                html += '<td style="' + bg + '">' + (row.colour || "Unknown") + '</td>';
                
                if (is_bag) {
                    html += '<td style="' + bg + '">' + flt(row.custom_achieved_bag_pcs).toFixed(0) + '</td>';
                    t_bags += flt(row.custom_achieved_bag_pcs);
                } else {
                    html += '<td style="' + bg + '">' + flt(row.meter_roll).toFixed(2) + '</td>';
                    t_mtr += flt(row.meter_roll);
                }
                
                html += '<td style="' + bg + '">' + flt(row.net_weight).toFixed(3) + '</td>';
                html += '<td style="' + bg + '">' + flt(row.gross_weight).toFixed(3) + '</td>';
                html += '<td style="' + bg + '">' + (row.party_code || "") + '</td>';
                html += '<td style="' + bg + '"><a href="/app/shaft-production-run/' + row.parent + '" target="_blank">' + (row.parent || "").split('-').pop() + '</a></td>';
                html += '</tr>';
                t_nw += flt(row.net_weight);
                t_gw += flt(row.gross_weight);
            });

            html += '<tr>';
            html += '<td colspan="4" style="' + tf_style + ' text-align: right; padding-right: 15px;">Consolidated Totals</td>';
            
            if (has_bags && !has_rolls) {
                html += '<td style="' + tf_style + ' text-align: center;">' + t_bags.toFixed(0) + '</td>';
            } else if (!has_bags && has_rolls) {
                html += '<td style="' + tf_style + ' text-align: center;">' + t_mtr.toFixed(2) + '</td>';
            } else {
                html += '<td style="' + tf_style + ' text-align: center;">' + t_mtr.toFixed(2) + ' Mtrs / ' + t_bags.toFixed(0) + ' Pcs</td>';
            }
            
            html += '<td style="' + tf_style + ' text-align: center;">' + t_nw.toFixed(3) + '</td>';
            html += '<td style="' + tf_style + ' text-align: center;">' + t_gw.toFixed(3) + '</td>';
            html += '<td colspan="2" style="' + tf_style + '"></td>';
            html += '</tr>';
            html += '</tbody></table>';

            var d = new frappe.ui.Dialog({
                title: __(title),
                size: "extra-large",
                fields: [{ fieldname: "rolls_html", fieldtype: "HTML" }],
                primary_action_label: __('Print'),
                primary_action: function () {
                    var print_w = window.open('', '_blank');
                    print_w.document.write('<html><head><title>' + title + '</title>');
                    print_w.document.write('<style>* { box-sizing: border-box; margin: 0; padding: 0; } body { font-family: Arial, sans-serif; font-size: 11px; padding: 15px; } @media print { @page { size: A4 portrait; margin: 8mm; } }</style>');
                    print_w.document.write('</head><body>');
                    print_w.document.write(company_header);
                    print_w.document.write(info_html);
                    print_w.document.write(html);
                    print_w.document.write('<script>setTimeout(function() { window.print(); window.close(); }, 500);<\/script>');
                    print_w.document.write('</body></html>');
                    print_w.document.close();
                }
            });

            d.fields_dict.rolls_html.$wrapper.html(company_header + info_html + html);
            d.show();
        }
    });
}

// Handler for the FG Consumption child table 'Batch' button
frappe.ui.form.on("Shift FG Consumption item", {
    batch: function(frm, cdt, cdn) {
        var row = locals[cdt][cdn];
        var item_code = row.item_code;
        
        if (!item_code) {
            frappe.msgprint("Please select an item first.");
            return;
        }
        if (!frm.fg_batches_map || !frm.fg_batches_map[item_code]) {
            frappe.msgprint("No batch data available for this item.");
            return;
        }
        var batches = frm.fg_batches_map[item_code];
        
        var html = '<table class="table table-bordered"><thead><tr><th>Batch No</th><th>Item Code</th><th>Net Weight (Kgs)</th><th>Shaft Run</th></tr></thead><tbody>';
        batches.forEach(function(b) {
            html += '<tr><td>' + (b.batch_no || '') + '</td><td>' + b.item_code + '</td><td>' + b.net_weight + '</td><td>' + b.spr + '</td></tr>';
        });
        html += '</tbody></table>';
        
        var d = new frappe.ui.Dialog({
            title: 'Batches for ' + item_code,
            fields: [{ fieldtype: 'HTML', fieldname: 'table_html', options: html }],
            primary_action_label: 'Close',
            primary_action: function() { d.hide(); }
        });
        d.show();
    }
});