// =============================================================
// SHAFT PRODUCTION RUN — CORE AUTOMATION (FINAL)
// =============================================================

// MOCK MISSING FUNCTION TO PREVENT FRAPPE REFRESH CRASH
window.spr_sync_total_planned_qty_from_jobs = window.spr_sync_total_planned_qty_from_jobs || function() {
    console.log("Mocked missing function to prevent form crash.");
};

var _core_aggregate_timer = null;
var _core_agg_running = false;   // re-entrancy guard
var CORE_CACHE = {};
var CORE_CACHE_FULL = {};

const BAG_MAKING_MACHINES = [
    'VTP-L1 LEADER OYANG MACHINE',
    'VTP-L2 LEADER ZX MACHINE',
    'JVE-L3 B700 BAG MAKING MACHINE',
    'JVE-L2 B700 BAG MAKING MACHINE',
    'JVE-L1 B700 BAG MAKING MACHINE',
    'TTT- L3 - OYANG C900 BAG MAKING LINE',
    'TTT- L2 - OYANG C700 BAG MAKING LINE',
    'TTT- L1 - OYANG C700 BAG MAKING LINE'
];

// Clean inch symbols strictly
function clean_inch(val) {
    return (val || "").toString().replace(/[^\d.]/g, "");
}

// Load cache dynamically
function load_core_cache(callback) {
    frappe.call({
        method: "frappe.client.get_list",
        args: { doctype: "Core Size", fields: ["name", "core_inch", "item_name"], limit_page_length: 500 },
        callback: function(r) {
            CORE_CACHE = {};
            CORE_CACHE_FULL = {};
            if (r.message) {
                r.message.forEach(function(rec) {
                    CORE_CACHE_FULL[rec.name] = rec;
                    
                    var num_key = clean_inch(rec.core_inch);
                    if (num_key) CORE_CACHE[num_key] = rec.name;
                    var name_key = clean_inch(rec.name);
                    if (name_key && !CORE_CACHE[name_key]) CORE_CACHE[name_key] = rec.name;
                });
            }
            console.log("CORE DEBUG: Cache Loaded", CORE_CACHE);
            if (callback) callback();
        }
    });
}

function get_core_name_for_width(width) {
    if (!width || width <= 0) return null;
    var bracket = "";
    if      (width <= 63)  bracket = "63";
    else if (width <= 85)  bracket = "85";
    else if (width <= 90)  bracket = "90";
    else if (width <= 118) bracket = "118";
    else                   bracket = "126";

    // Strict fallback: If cache fails, use exact bracket exact name (which has an inch quote)
    return CORE_CACHE[bracket] || CORE_CACHE[width.toString()] || (bracket + '"');
}

function show_bag_packing_dialog(frm, packing_type) {
    let title = packing_type === 'Box Packing' ? 'Calculate Box' : 'Calculate Bora';
    let item_prefix = packing_type === 'Box Packing' ? 'cs - 2005' : 'bb - 1006';
    let weight_field = packing_type === 'Box Packing' ? 'custom_box_weight_kgs' : 'custom_bora_weight_kgs';

    let d = new frappe.ui.Dialog({
        title: title,
        fields: [
            {
                label: 'Item',
                fieldname: 'item',
                fieldtype: 'Link',
                options: 'Item',
                reqd: 1,
                get_query: function() {
                    return {
                        filters: [
                            ['name', 'like', item_prefix + '%']
                        ]
                    };
                }
            },
            {
                label: 'Weight Per Piece (Kgs)',
                fieldname: 'weight_per_piece',
                fieldtype: 'Float',
                reqd: 1
            }
        ],
        primary_action_label: 'Apply',  
        primary_action(values) {
            let weight = flt(values.weight_per_piece);
            let selected_item = values.item;
            
            if (packing_type === 'Box Packing') frm.__box_weight = weight;
            else frm.__bora_weight_bag = weight;

            let row_count = 0;
            if (frm.doc.items && frm.doc.items.length > 0) {
                row_count = frm.doc.items.length;
                frm.doc.items.forEach(row => {
                    frappe.model.set_value(row.doctype, row.name, weight_field, weight);
                });
                frm.refresh_field("items");
            }
            
            let total_qty = weight * row_count;
            
            frappe.db.get_value('Item', selected_item, 'stock_uom', function(r) {
                let uom = r && r.message ? r.message.stock_uom : 'Nos';
                
                frm.doc.bag_packing_details = [];
                
                let child = frappe.model.add_child(frm.doc, "Bag Packing Detail", "bag_packing_details");
                child.item = selected_item;
                child.quantity_kgs = total_qty;
                child.uom = uom;
                
                frm.refresh_field("bag_packing_details");
            });

            d.hide();
        }
    });
    d.show();
}

function show_jve_packing_dialog(frm) {
    let d = new frappe.ui.Dialog({
        title: 'Enter Packing Details',
        fields: [
            {
                label: 'Bora Size',
                fieldname: 'bora_size',
                fieldtype: 'Link',
                options: 'Item'
            },
            {
                fieldtype: 'Column Break'
            },
            {
                label: 'Bora Weight (Kgs)',
                fieldname: 'bora_weight',
                fieldtype: 'Float',
                reqd: 1
            },
            {
                fieldtype: 'Section Break'
            },
            {
                label: 'Polycover Size',
                fieldname: 'polycover_size',
                fieldtype: 'Link',
                options: 'Item'
            }
        ],
        primary_action_label: 'Apply',  
        primary_action(values) {
            let weight = flt(values.bora_weight);
            frm.__bora_weight = weight;
            if (frm.doc.items && frm.doc.items.length > 0) {
                frm.doc.items.forEach(row => {
                    frappe.model.set_value(row.doctype, row.name, 'custom_polybag_kgs', weight);
                });
                frm.refresh_field("items");
            }
            d.hide();
        }
    });
    d.show();
}

frappe.ui.form.on("Shaft Production Run", {
    refresh: function(frm) {

        if (frm.doc.custom_unit === 'JVE - SHEET CUTTING MACHINE' && frm.doc.docstatus === 0) {
            frm.add_custom_button(__('Bora Weight'), function() {
                show_jve_packing_dialog(frm);
            });
        }

        if (BAG_MAKING_MACHINES.includes(frm.doc.custom_unit) && frm.doc.production_plan && frm.doc.docstatus === 0) {
            frappe.db.get_value("Production Plan", frm.doc.production_plan, "custom_packing", function(r) {
                let packing_type = r && r.custom_packing ? r.custom_packing : null;
                if (packing_type === 'Box Packing') {
                    frm.add_custom_button(__('Calculate Box'), function() {
                        show_bag_packing_dialog(frm, 'Box Packing');
                    });
                } else if (packing_type === 'Bora Packing') {
                    frm.add_custom_button(__('Calculate Bora'), function() {
                        show_bag_packing_dialog(frm, 'Bora Packing');
                    });
                }
            });
        }

        load_core_cache(function() {
            // Auto-fill custom_core_width_mm for rows that already have width_inch but no core width set
            if (frm.doc.items && frm.doc.items.length) {
                frm.doc.items.forEach(function(row) {
                    var width = flt(row.width_inch);
                    if (width > 0 && !row.custom_core_width_mm) {
                        var target = get_core_name_for_width(width);
                        console.log("CORE DEBUG: Auto-filling core width for row", row.idx, "->", target);
                        if (target) {
                            frappe.model.set_value(row.doctype, row.name, "custom_core_width_mm", target);
                        }
                    }
                });
                frm.fields_dict.items.grid.refresh();
            }
            setTimeout(function() { calculate_aggregate_totals(frm); }, 600);
        }); 
    },
    items_add: function(frm, cdt, cdn) {
        if (frm.doc.custom_unit === 'JVE - SHEET CUTTING MACHINE' && frm.__bora_weight) {
            frappe.model.set_value(cdt, cdn, 'custom_polybag_kgs', frm.__bora_weight);
        }
        if (BAG_MAKING_MACHINES.includes(frm.doc.custom_unit)) {
            if (frm.__box_weight) {
                frappe.model.set_value(cdt, cdn, 'custom_box_weight_kgs', frm.__box_weight);
            }
            if (frm.__bora_weight_bag) {
                frappe.model.set_value(cdt, cdn, 'custom_bora_weight_kgs', frm.__bora_weight_bag);
            }
        }
    }
});

frappe.ui.form.on("Shaft Production Run Item", {
    width_inch: function(frm, cdt, cdn) {
        var row = frappe.get_doc(cdt, cdn);
        if (frm.doc.custom_unit === 'JVE - SHEET CUTTING MACHINE' && frm.__bora_weight && !flt(row.custom_polybag_kgs)) {
            frappe.model.set_value(cdt, cdn, 'custom_polybag_kgs', frm.__bora_weight);
        }
        if (BAG_MAKING_MACHINES.includes(frm.doc.custom_unit)) {
            if (frm.__box_weight && !flt(row.custom_box_weight_kgs)) {
                frappe.model.set_value(cdt, cdn, 'custom_box_weight_kgs', frm.__box_weight);
            }
            if (frm.__bora_weight_bag && !flt(row.custom_bora_weight_kgs)) {
                frappe.model.set_value(cdt, cdn, 'custom_bora_weight_kgs', frm.__bora_weight_bag);
            }
        }
        console.log("CORE DEBUG: width_inch trigger fired for row " + row.idx + "! Value is: " + row.width_inch);
        var target = get_core_name_for_width(flt(row.width_inch));
        console.log("CORE DEBUG: fetch target ->", target);
        
        if (target) {
            console.log("CORE DEBUG: Setting custom_core_width_mm for row", row.idx, "to ->", target);
            frappe.model.set_value(cdt, cdn, "custom_core_width_mm", target);
            frm.fields_dict.items.grid.refresh();
        }
        calculate_net_weight(frm, cdt, cdn);
    },
    gross_weight: function(frm, cdt, cdn) { calculate_net_weight(frm, cdt, cdn); },
    custom_core_width_mm: function(frm, cdt, cdn) { calculate_net_weight(frm, cdt, cdn); },
    custom_polybag_kgs: function(frm, cdt, cdn) { calculate_net_weight(frm, cdt, cdn); },
    custom_box_weight_kgs: function(frm, cdt, cdn) { calculate_net_weight(frm, cdt, cdn); },
    custom_bora_weight_kgs: function(frm, cdt, cdn) { calculate_net_weight(frm, cdt, cdn); }
});

function calculate_net_weight(frm, cdt, cdn) {
    var row = frappe.get_doc(cdt, cdn);
    var width = flt(row.width_inch);
    
    if (flt(row.gross_weight) <= 0) return;
    if (frm.doc.custom_unit !== 'JVE - SHEET CUTTING MACHINE' && !BAG_MAKING_MACHINES.includes(frm.doc.custom_unit) && width <= 0) return;

    var core_id = row.custom_core_width_mm;
    var cached_core = CORE_CACHE_FULL[core_id];
    var item_name = row.core_item_name || (cached_core ? cached_core.item_name : "");

    var process_calculation = function(desc) {
        var base_weight = 1.3;
        var base_inch = parseFloat(clean_inch(row.core_inch));
        
        // Regex exactly matching "(1.8 KGS/ 1.6M)" to extract 1.8 and 1.6
        var match = (desc || "").match(/\(\s*([\d.]+)\s*KGS\s*\/\s*([\d.]+)\s*M\s*\)/i);
        if (match) {
            base_weight = parseFloat(match[1]); // e.g. 1.8
            var base_m = parseFloat(match[2]);  // e.g. 1.6
            base_inch = Math.round(base_m * 39.3701); // 1.6 * 39.3701 = 63
        }
        
        if (!base_inch || isNaN(base_inch)) {
            base_inch = (width <= 63 ? 63 : (width <= 85 ? 85 : (width <= 90 ? 90 : (width <= 118 ? 118 : 126))));
        }

        var core_weight = width * (base_weight / base_inch);
        if (frm.doc.custom_unit === 'JVE - SHEET CUTTING MACHINE' || BAG_MAKING_MACHINES.includes(frm.doc.custom_unit)) {
            core_weight = 0;
        }

        var polybag_weight = flt(row.custom_polybag_kgs) || 0;
        var box_weight = flt(row.custom_box_weight_kgs) || 0;
        var bora_weight = flt(row.custom_bora_weight_kgs) || 0;
        var calculated_net_weight = flt(flt(row.gross_weight) - core_weight - polybag_weight - box_weight - bora_weight, 2);
        
        if (flt(row.net_weight, 2) !== calculated_net_weight) {
            frappe.model.set_value(cdt, cdn, "net_weight", calculated_net_weight);
        }
        
        if (_core_aggregate_timer) clearTimeout(_core_aggregate_timer);
        _core_aggregate_timer = setTimeout(function() { calculate_aggregate_totals(frm); }, 300);
    };

    if (!item_name && core_id) {
        frappe.db.get_value("Core Size", core_id, "item_name", function(r) {
            var fetched = (r && r.message && r.message.item_name) ? r.message.item_name : "";
            if (fetched) {
                if (!CORE_CACHE_FULL[core_id]) CORE_CACHE_FULL[core_id] = {};
                CORE_CACHE_FULL[core_id].item_name = fetched;
            }
            process_calculation(fetched);
        });
    } else {
        process_calculation(item_name);
    }
}

function calculate_aggregate_totals(frm) {
    if (!frm.doc.items) return;

    if (frm.doc.custom_unit === 'JVE - SHEET CUTTING MACHINE' || BAG_MAKING_MACHINES.includes(frm.doc.custom_unit)) {
        if (frm.doc.custom_core_details && frm.doc.custom_core_details.length > 0) {
            frm.doc.custom_core_details.forEach(function(r) {
                frappe.model.get_doc(r.doctype, r.name).parent = "";
            });
            frm.doc.custom_core_details = [];
            frm.refresh_field("custom_core_details");
        }
        return;
    }

    var rewinding_machines = [
        'TSNPL - L3 REWINDING MACHINE',
        'JSB - L4 REWINDING MACHINE',
        'JSB - L5 REWINDING MACHINE'
    ];
    if (rewinding_machines.includes(frm.doc.custom_unit)) {
        frm.set_df_property("custom_core_details", "hidden", 0);
        var wos = [];
        
        // Scan parent
        if (frm.doc.work_order && !wos.includes(frm.doc.work_order)) wos.push(frm.doc.work_order);
        
        // Scan all child tables dynamically
        Object.keys(frm.doc).forEach(function(key) {
            if (Array.isArray(frm.doc[key])) {
                frm.doc[key].forEach(function(row) {
                    if (row.work_order && typeof row.work_order === 'string' && !wos.includes(row.work_order)) {
                        wos.push(row.work_order);
                    }
                    if (row.job_id && typeof row.job_id === 'string' && row.job_id.startsWith("MFG-") && !wos.includes(row.job_id)) {
                        wos.push(row.job_id);
                    }
                });
            }
        });
        
        if (wos.length === 0) {
            if (!frm.__no_wo_msg_shown) {
                frappe.show_alert({message: "No Work Order found in document to fetch BOM cores.", indicator: 'orange'});
                frm.__no_wo_msg_shown = true;
            }
            if (frm.doc.custom_core_details && frm.doc.custom_core_details.length > 0) {
                frm.doc.custom_core_details = [];
                frm.refresh_field("custom_core_details");
            }
            return;
        }
        
        var cache_key = wos.sort().join(",");
        if (frm.__bom_cores_fetched_for === cache_key) return;
        
        var promises = wos.map(function(wo) {
            return new Promise(function(resolve) {
                frappe.call({
                    method: "frappe.client.get_value",
                    args: { doctype: "Work Order", filters: { name: wo }, fieldname: "bom_no" },
                    callback: function(r) {
                        if (r.message && r.message.bom_no) {
                            frappe.call({
                                method: "frappe.client.get",
                                args: {
                                    doctype: "BOM",
                                    name: r.message.bom_no
                                },
                                callback: function(res) {
                                    if (res.message && res.message.items) {
                                        resolve(res.message.items);
                                    } else {
                                        resolve([]);
                                    }
                                },
                                error: function(err) { resolve([]); }
                            });
                        } else {
                            resolve([]);
                        }
                    },
                    error: function(err) { resolve([]); }
                });
            });
        });

        Promise.all(promises).then(function(results) {
            var all_core_items = [];
            var total_items_scanned = 0;
            results.forEach(function(bom_items) {
                total_items_scanned += bom_items.length;
                var cores = bom_items.filter(function(i) {
                    var ic = i.item_code || "";
                    var iname = i.item_name || "";
                    return ic.indexOf("PC -") !== -1 || 
                           iname.indexOf("KGS/") !== -1 || 
                           iname.indexOf("KGS /") !== -1 || 
                           iname.toLowerCase().indexOf("core") !== -1;
                });
                all_core_items = all_core_items.concat(cores);
            });

            frm.doc.custom_core_details = [];
            if (all_core_items.length > 0) {
                var aggregated = {};
                all_core_items.forEach(function(ci) {
                    if (!aggregated[ci.item_code]) {
                        aggregated[ci.item_code] = Object.assign({}, ci);
                    } else {
                        aggregated[ci.item_code].qty += ci.qty;
                        aggregated[ci.item_code].stock_qty = (aggregated[ci.item_code].stock_qty || aggregated[ci.item_code].qty) + (ci.stock_qty || ci.qty);
                    }
                });

                Object.values(aggregated).forEach(function(ci) {
                    var child = frappe.model.add_child(frm.doc, "Shaft Core Detail", "custom_core_details");
                    child.core_item = ci.item_code;
                    child.item_name = ci.item_name;
                    child.core_nos = Math.ceil(ci.qty);
                    child.quantity_kgs = ci.stock_qty || ci.qty;
                    child.uom = ci.uom || "Kg";
                    child.conversion_factor = 1;
                });
            } else {
                if (!frm.__no_core_msg_shown) {
                    var scanned_names = [];
                    results.forEach(function(bom_items) {
                        bom_items.forEach(function(i) {
                            scanned_names.push("<b>RAW:</b> " + JSON.stringify(i));
                        });
                    });
                    
                    frappe.msgprint({
                        title: 'Core Identification Failed',
                        indicator: 'red',
                        message: "Scanned " + total_items_scanned + " BOM items from " + wos.join(", ") + " but found no cores matching our filters ('PC -', 'KGS/', 'core'). <br><br><b>Items found in BOM:</b><br><br>" + scanned_names.join("<br><br>") + "<br><br>Please share this screenshot with the developer!"
                    });
                    frm.__no_core_msg_shown = true;
                }
            }
            frm.__bom_cores_fetched_for = cache_key;
            frm.refresh_field("custom_core_details");
        });
        
        return; // Skip standard aggregation
    }

    var totals = {};
    frm.doc.items.forEach(function(row) {
        var width = flt(row.width_inch);
        if (width <= 0) return;
        
        var core_id = row.custom_core_width_mm;
        var cached_core = CORE_CACHE_FULL[core_id];
        var item_name = row.core_item_name || (cached_core ? cached_core.item_name : "");
        
        var base_inch = parseFloat(clean_inch(row.core_inch));
        var match = (item_name || "").match(/\(\s*([\d.]+)\s*KGS\s*\/\s*([\d.]+)\s*M\s*\)/i);
        if (match) {
            var base_m = parseFloat(match[2]);
            base_inch = Math.round(base_m * 39.3701); 
        }
        
        if (!base_inch || isNaN(base_inch)) {
            base_inch = (width <= 63 ? 63 : (width <= 85 ? 85 : (width <= 90 ? 90 : (width <= 118 ? 118 : 126))));
        }
        
        var ic = row.core_item_code;
        var name = row.core_item_name || row.custom_core_width_mm;
        
        if (!ic) {
            if (width <= 63) { ic = "PC - 1005307"; name = "63\""; }
            else if (width <= 85) { ic = "PC - 1005158"; name = "85\""; }
            else if (width <= 90) { ic = "PC - 1005308"; name = "90\""; }
            else if (width <= 118) { ic = "PC - 1005161"; name = "118\""; }
            else { ic = "PC - 1005309"; name = "126\""; }
        }
        
        if (ic) {
            if (!totals[ic]) totals[ic] = { code: ic, name: name, nos: 0, kgs: 0 };
            totals[ic].nos += (width / base_inch); // raw accumulation; ceil applied on write
            totals[ic].kgs += (flt(row.gross_weight) - flt(row.net_weight));
        }
    });

    var existing_details = frm.doc.custom_core_details || [];
    var existing_map = {};
    existing_details.forEach(function(row) {
        existing_map[row.core_item] = row;
    });

    var changed = false;
    
    // 1. Process matching and new rows
    Object.keys(totals).forEach(function(ic) {
        var new_data = totals[ic];
        var exist_data = existing_map[ic];
        
        if (exist_data) {
            // Update existing row in place to avoid table clearing/re-adding spam
            var ceiled_nos = Math.ceil(new_data.nos);
            if (flt(exist_data.quantity_kgs, 2) !== flt(new_data.kgs, 2) || 
                exist_data.core_nos !== ceiled_nos ||
                exist_data.item_name !== new_data.name) {
                
                frappe.model.set_value(exist_data.doctype, exist_data.name, "quantity_kgs", flt(new_data.kgs, 2));
                frappe.model.set_value(exist_data.doctype, exist_data.name, "core_nos", ceiled_nos);
                frappe.model.set_value(exist_data.doctype, exist_data.name, "item_name", new_data.name);
                changed = true;
            }
            existing_map[ic] = null; // Mark as processed
        } else {
            // Add row if it does not exist at all
            var child = frappe.model.add_child(frm.doc, "Shaft Core Detail", "custom_core_details");
            child.core_item = new_data.code;
            child.item_name = new_data.name;
            child.quantity_kgs = flt(new_data.kgs, 2);
            child.core_nos = Math.ceil(new_data.nos);
            child.uom = "Kg";
            child.conversion_factor = 1;
            changed = true;
        }
    });

    // 2. Remove rows that are no longer referenced natively
    var rows_to_remove = [];
    Object.keys(existing_map).forEach(function(ic) {
        if (existing_map[ic] !== null) {
            rows_to_remove.push(existing_map[ic]);
        }
    });

    if (rows_to_remove.length > 0) {
        rows_to_remove.forEach(function(r) {
            frappe.model.get_doc(r.doctype, r.name).parent = ""; // detach
            frm.doc.custom_core_details = frm.doc.custom_core_details.filter(row => row.name !== r.name);
        });
        changed = true;
    }

    if (changed && frm.fields_dict.custom_core_details) {
        frm.fields_dict.custom_core_details.grid.refresh();
    }
}
