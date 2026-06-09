// Wastage Automation for Shaft Production Run
// DocType: Shaft Production Run

frappe.ui.form.on('Shaft Production Run', {
    onload: function(frm) {
        // Safe initialization of child table triggers
        let wastage_field = ['running_patty_wastage', 'wastage_details', 'custom_wastage_details', 'custom_running_patty_wastage'].find(f => frm.fields_dict[f]);
        if (wastage_field && frm.fields_dict[wastage_field].grid) {
            let child_dt = frm.fields_dict[wastage_field].grid.doctype;
            if (child_dt && !frm.__wastage_bound) {
                frappe.ui.form.on(child_dt, {
                    recycle_to_next: function (frm, cdt, cdn) { recalculate_all_wastage(frm); },
                    custom_recycle_to_next: function (frm, cdt, cdn) { recalculate_all_wastage(frm); },
                    print_label: function (frm, cdt, cdn) { guard_wastage_label_print(frm, locals[cdt][cdn]); },
                    custom_print_label: function (frm, cdt, cdn) { guard_wastage_label_print(frm, locals[cdt][cdn]); }
                });
                frm.__wastage_bound = true;
            }
        }
    },

    refresh: function (frm) {
        bind_wastage_label_click_guard(frm);

        // Trace button to identify internal field names
        frm.add_custom_button('Debug Field Information', function () {
            let packing_f = Object.keys(frm.doc).filter(k => k.toLowerCase().includes('packing'));
            let customer_f = Object.keys(frm.doc).filter(k => k.toLowerCase().includes('customer') || k.toLowerCase().includes('party'));
            let polybag_f = Object.keys(frm.fields_dict).filter(k => k.toLowerCase().includes('polybag'));
            let plan_links = Object.keys(frm.doc).filter(k => String(frm.doc[k]).startsWith('MFG-PP-'));
            
            let msg = `<b>Detected Fields:</b><br>
                Packing: ${packing_f.join(', ') || 'NOT FOUND'}<br>
                Customer: ${customer_f.join(', ') || 'NOT FOUND'}<br>
                Polybag Table: ${polybag_f.join(', ') || 'NOT FOUND'}<br>
                Plan Links Found: ${plan_links.join(', ') || 'NONE'}<br><br>
                <i>All Doc Keys: ${Object.keys(frm.doc).filter(k => !k.startsWith('_')).join(', ')}</i>`;
            
            frappe.msgprint({
                title: 'Data Discovery',
                message: msg,
                indicator: 'blue'
            });
            console.log("Full Doc Data:", frm.doc);
        }, "Tools");

        // --- PATTY STOCK CONSUMPTION ---
        try {
            console.log("Wastage Automation: Initializing Patty Stock tools...");

            // 1. Add to Top-Level Action Bar (Most Visible)
            frm.add_custom_button('View Patty Stock', () => show_patty_stock_dialog(frm));
            
            // 2. Also keep in Tools Menu (As a fallback)
            frm.add_custom_button('View Patty Stock', () => show_patty_stock_dialog(frm), 'Tools');

            // 3. Robust Injection into the Recycled table footer
            let inject_patty_button = () => {
                // Discover the recycled table field name dynamically
                let rec_field = Object.keys(frm.fields_dict).find(f => 
                    f.toLowerCase().includes('recycle') && frm.fields_dict[f].grid
                );

                if (rec_field) {
                    let $wrapper = $(frm.fields_dict[rec_field].wrapper);
                    let $add_row_btn = $wrapper.find('.grid-add-row');
                    
                    if ($add_row_btn.length > 0 && $wrapper.find('.btn-view-patty-stock').length === 0) {
                        // Place right next to standard Add Row
                        $add_row_btn.after(`
                            <button class="btn btn-default btn-sm btn-view-patty-stock" 
                                    style="margin-left: 10px; margin-bottom: 4px; font-weight: bold;">
                                <i class="fa fa-eye"></i> View Patty Stock
                            </button>
                            <button class="btn btn-primary btn-sm btn-scan-rolls" 
                                    style="margin-left: 10px; margin-bottom: 4px; font-weight: bold;">
                                <i class="fa fa-barcode"></i> Scan Rolls
                            </button>
                        `);
                        // Attach global click events
                        $(document).off('click', '.btn-view-patty-stock').on('click', '.btn-view-patty-stock', () => {
                            show_patty_stock_dialog(frm);
                        });
                        $(document).off('click', '.btn-scan-rolls').on('click', '.btn-scan-rolls', () => {
                            show_scan_rolls_dialog(frm);
                        });
                        console.log("Wastage Automation: Success - Buttons placed next to 'Add row' for " + rec_field);
                    }
                }
            };

            // Run injection at different intervals to catch late renders
            inject_patty_button(); 
            setTimeout(inject_patty_button, 1000);
            setTimeout(inject_patty_button, 3000);

        } catch (e) {
            console.error("Wastage Automation Error:", e);
        }

        // Attempt to populate polybags shortly after load only if document is new
        // to prevent dirtying the form repeatedly after save.
        if (frm.is_new()) {
            auto_populate_polybags(frm);
        }

        auto_populate_process_wastage(frm);
        toggle_wastage_columns(frm);

        // Auto-calculate wastage if items are mapped/populated but wastage table is empty,
        // or if it's an invalid unit and we need to clear the table.
        setTimeout(() => {
            let wastage_field = ['running_patty_wastage', 'wastage_details', 'custom_wastage_details', 'custom_running_patty_wastage'].find(f => frm.fields_dict[f]);
            bind_wastage_label_click_guard(frm);
            
            var unit = frm.doc.unit || frm.doc.custom_unit || "";
            var unit_val = String(unit).trim().toUpperCase();
            var is_valid_unit = ["UNIT 1", "UNIT 2", "UNIT 3", "UNIT 4"].some(u => unit_val.includes(u));

            if (wastage_field && frm.doc.items && frm.doc.items.length > 0) {
                if (!frm.doc[wastage_field] || frm.doc[wastage_field].length === 0) {
                    if (is_valid_unit) {
                        calculate_wastage_automation(frm, true);
                    }
                }
            }
        }, 1500);
    },

    unit: function (frm) {
        calculate_wastage_automation(frm, true);
    },

    custom_unit: function (frm) {
        calculate_wastage_automation(frm, true);
        auto_populate_process_wastage(frm);
        toggle_wastage_columns(frm);
    },

    // Trigger when a new roll is added (some buttons add row and then set values)
    items_add: function (frm, cdt, cdn) {
        // Delay slightly to allow the "Create Entry" logic to finish setting values
        setTimeout(() => {
            var row = locals[cdt][cdn];
            add_incremental_wastage(frm, row);
        }, 500);
    },

    // --- POLYBAG AUTOMATION TRIGGERS ---
    custom_packing: function (frm) { auto_populate_polybags(frm); },
    packing: function (frm) { auto_populate_polybags(frm); },
    customer: function (frm) { auto_populate_polybags(frm); },
    party_name: function (frm) { auto_populate_polybags(frm); },
    custom_customer: function (frm) { auto_populate_polybags(frm); },
    custom_party_name: function (frm) { auto_populate_polybags(frm); },
    custom_is_box_bag: function(frm) { 
        auto_populate_process_wastage(frm); 
        toggle_wastage_columns(frm); 
    },
    custom_is_bag: function(frm) { 
        auto_populate_process_wastage(frm); 
        toggle_wastage_columns(frm); 
    },
    custom_is_d_cut: function(frm) { toggle_wastage_columns(frm); },
    custom_is_w_cut: function(frm) { toggle_wastage_columns(frm); }
});

frappe.ui.form.on('Shaft Production Run Item', {
    // Trigger on EVERY possible job field name
    job: function (frm, cdt, cdn) { add_incremental_wastage(frm, locals[cdt][cdn]); },
    job_id: function (frm, cdt, cdn) { add_incremental_wastage(frm, locals[cdt][cdn]); },
    custom_job: function (frm, cdt, cdn) { add_incremental_wastage(frm, locals[cdt][cdn]); },
    custom_job_id: function (frm, cdt, cdn) { add_incremental_wastage(frm, locals[cdt][cdn]); },
    target_job_id: function (frm, cdt, cdn) { add_incremental_wastage(frm, locals[cdt][cdn]); },
    custom_target_job_id: function (frm, cdt, cdn) { add_incremental_wastage(frm, locals[cdt][cdn]); },
    work_order: function (frm, cdt, cdn) { add_incremental_wastage(frm, locals[cdt][cdn]); },

});

// Helper functions

function get_wastage_batch_base(batch_value) {
    var base = String(batch_value || "").trim();
    if (!base) return "";
    if (base.includes('/')) {
        base = base.split('/')[0].trim();
    }
    return base.endsWith('W') ? base : base + 'W';
}

function append_wastage_running_series(frm, wastage_field) {
    if (!wastage_field || !frm.fields_dict[wastage_field] || !frm.fields_dict[wastage_field].grid) return;

    var wast_fields = frm.fields_dict[wastage_field].grid.docfields.map(df => df.fieldname);
    var b_f = wast_fields.find(f => f.includes('batch_no')) || 'batch_no';
    if (!wast_fields.includes(b_f)) return;
    var w_chk_f = wast_fields.find(f => f.includes('recycle_to_next')) || 'recycle_to_next';
    var w_net_f = wast_fields.find(f => f.includes('net_wastage')) || 'net_wastage';

    var bases_to_process = {};
    var requires_api_call = false;

    (frm.doc[wastage_field] || []).forEach(row => {
        var is_rec_next = (row[w_chk_f] || row.recycle_to_next || row.custom_recycle_to_next) ? 1 : 0;
        var net_qty = flt(row[w_net_f] || row.net_wastage || 0);
        if (is_rec_next || net_qty <= 0) {
            row[b_f] = "";
            return;
        }

        var base = get_wastage_batch_base(row[b_f] || get_wastage_batch_base_for_row(frm, row));
        if (!base) return;

        if (!bases_to_process[base]) {
            bases_to_process[base] = [];
        }
        bases_to_process[base].push(row);

        if (!row[b_f] || !row[b_f].includes('/')) {
            requires_api_call = true;
        }
    });

    if (!requires_api_call) return;

    Object.keys(bases_to_process).forEach(base => {
        frappe.call({
            method: "frappe.client.get_list",
            args: {
                doctype: "Batch",
                filters: [["name", "like", base + "/%"]],
                fields: ["name"],
                limit_page_length: 500
            },
            callback: function(r) {
                var max_n = 0;
                if (r.message) {
                    r.message.forEach(b => {
                        var parts = b.name.split('/');
                        if (parts.length === 2) {
                            var n = parseInt(parts[1]);
                            if (!isNaN(n) && n > max_n) max_n = n;
                        }
                    });
                }

                bases_to_process[base].forEach(row => {
                    if (row[b_f] && row[b_f].startsWith(base + "/")) {
                        var existing_n = parseInt(row[b_f].split('/')[1]);
                        if (!isNaN(existing_n) && existing_n > max_n) {
                            max_n = existing_n;
                        }
                    }
                });

                var current_n = max_n + 1;
                var changed = false;

                bases_to_process[base].forEach(row => {
                    if (!row[b_f] || !row[b_f].includes('/')) {
                        row[b_f] = base + "/" + current_n;
                        current_n++;
                        changed = true;
                    }
                });

                if (changed) {
                    frm.refresh_field(wastage_field);
                }
            }
        });
    });
}

function get_wastage_batch_base_for_row(frm, row) {
    var job_id = row.job_id || row.job || row.custom_job_id || row.target_job_id || row.work_order;
    if (job_id) {
        var matching_item = (frm.doc.items || []).find(it => {
            var it_jid = it.job_id || it.job || it.custom_job_id || it.target_job_id || it.work_order || it.idx || it.name;
            return it_jid && String(it_jid) === String(job_id);
        });
        if (matching_item) {
            return get_wastage_batch_base(matching_item.batch_no || matching_item.custom_batch_no || "");
        }
    }
    return "";
}

function update_wastage_label_actions(frm, wastage_field) {
    if (!wastage_field || !frm.fields_dict[wastage_field] || !frm.fields_dict[wastage_field].grid) return;

    var wast_fields = frm.fields_dict[wastage_field].grid.docfields.map(df => df.fieldname);
    var w_net_f = wast_fields.find(f => f.includes('net_wastage')) || 'net_wastage';
    var w_chk_f = wast_fields.find(f => f.includes('recycle_to_next')) || 'recycle_to_next';
    var w_label_f = wast_fields.find(f => f.includes('print') && f.includes('label')) || wast_fields.find(f => f.includes('label'));
    if (!w_label_f) return;

    (frm.doc[wastage_field] || []).forEach(row => {
        var is_rec_next = (row[w_chk_f] || row.recycle_to_next || row.custom_recycle_to_next) ? 1 : 0;
        var net_qty = flt(row[w_net_f] || row.net_wastage || 0);
        row[w_label_f] = (!is_rec_next && net_qty > 0) ? "Print Label" : "";
    });
}

function is_final_wastage_label_row(row) {
    if (!row) return;

    var row_fields = Object.keys(row || {});
    var chk_f = row_fields.find(f => f.includes('recycle_to_next')) || 'recycle_to_next';
    var net_f = row_fields.find(f => f.includes('net_wastage')) || 'net_wastage';
    var is_rec_next = (row[chk_f] || row.recycle_to_next || row.custom_recycle_to_next) ? 1 : 0;
    var net_qty = flt(row[net_f] || row.net_wastage || row.custom_net_wastage || 0);
    return !is_rec_next && net_qty > 0;
}

function guard_wastage_label_print(frm, row) {
    if (!is_final_wastage_label_row(row)) {
        frappe.msgprint("Label is only available for the final wastage row.");
        return false;
    }
}

function bind_wastage_label_click_guard(frm) {
    var wastage_field = ['running_patty_wastage', 'wastage_details', 'custom_wastage_details', 'custom_running_patty_wastage'].find(f => frm.fields_dict[f]);
    if (!wastage_field || !frm.fields_dict[wastage_field] || !frm.fields_dict[wastage_field].grid) return;
    if (frm.__wastage_label_click_guard_bound === wastage_field) return;

    var grid = frm.fields_dict[wastage_field].grid;
    var wrapper = grid.wrapper && grid.wrapper.get ? grid.wrapper.get(0) : grid.wrapper;
    if (!wrapper) return;

    var block_label_open = function(e) {
        var field_node = e.target.closest ? e.target.closest('[data-fieldname]') : null;
        var fieldname = field_node ? String(field_node.getAttribute('data-fieldname') || '').toLowerCase() : "";
        if (!(fieldname.includes('print') && fieldname.includes('label'))) return;

        var row_node = e.target.closest ? e.target.closest('.grid-row') : null;
        var cdn = row_node ? (row_node.getAttribute('data-name') || (row_node.dataset ? row_node.dataset.name : "")) : "";
        var row = cdn && locals[grid.doctype] ? locals[grid.doctype][cdn] : null;
        if (is_final_wastage_label_row(row)) return;

        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        frappe.msgprint("Label is only available for the final wastage row.");
        return false;
    };

    wrapper.addEventListener('pointerdown', block_label_open, true);
    wrapper.addEventListener('mousedown', block_label_open, true);
    wrapper.addEventListener('click', block_label_open, true);

    frm.__wastage_label_click_guard_bound = wastage_field;
}

function add_incremental_wastage(frm, item_row) {
    var unit = frm.doc.unit || frm.doc.custom_unit || "";
    var unit_val = String(unit).trim().toUpperCase();
    var is_valid_unit = ["UNIT 1", "UNIT 2", "UNIT 3", "UNIT 4"].some(u => unit_val.includes(u));
    if (!is_valid_unit) {
        return; // Bypass wastage calculation for other units
    }

    // Robustly find Job ID from the roll row (fallback to idx or name if no formal Job ID)
    var job_id = item_row.job || item_row.job_id || item_row.custom_job || item_row.custom_job_id || item_row.target_job_id || item_row.custom_target_job_id || item_row.work_order || item_row.idx || item_row.name;
    if (!job_id) {
        console.warn("Wastage Skipped: No unique identifier (Job ID/idx/name) found on item row.", item_row);
        return;
    }

    if (!unit) {
        console.warn("Wastage Warning: Unit is missing from the parent document.");
    }

    var wastage_field = ['running_patty_wastage', 'wastage_details', 'custom_wastage_details', 'custom_running_patty_wastage'].find(f => frm.fields_dict[f]);
    if (!wastage_field) {
        console.warn("Wastage Skipped: Wastage table field not found on form.");
        return;
    }

    // Update existing or add new
    var w_row = (frm.doc[wastage_field] || []).find(w => (w.job_id == job_id || w.job == job_id || w.custom_job_id == job_id || w.target_job_id == job_id || w.work_order == job_id));
    var is_new = false;
    if (!w_row) {
        w_row = frm.add_child(wastage_field);
        is_new = true;
    }

    // Map Job Table fields
    var job_table_field = 'shaft_jobs';
    var job_fields = (frm.fields_dict[job_table_field] && frm.fields_dict[job_table_field].grid) ?
        frm.fields_dict[job_table_field].grid.docfields.map(df => df.fieldname) : [];

    var find_jt = (kw) => job_fields.find(f => f.toLowerCase().includes(kw));

    var wast_fields = frm.fields_dict[wastage_field].grid.docfields.map(df => df.fieldname);
    var w_qty_f = wast_fields.find(f => f.includes('wastage_qty') || f === 'qty' || f === 'wastage') || 'wastage_qty';
    var w_rec_f = wast_fields.find(f => f.includes('recycled')) || 'recycled_qty';
    var w_net_f = wast_fields.find(f => f.includes('net_wastage')) || 'net_wastage';
    var w_osg_f = wast_fields.find(f => f.includes('one_shaft_gross')) || 'one_shaft_gross';
    var w_chk_f = wast_fields.find(f => f.includes('recycle_to_next')) || 'recycle_to_next';

    // Find the corresponding Job details row
    var job_row = (frm.doc.shaft_jobs || []).find(j => (j.job_id == job_id || j.job == job_id || j.idx == job_id || j.name == job_id || j.target_job_id == job_id || j.work_order == job_id));

    if (!job_row) {
        console.warn("Wastage Warning: Job row not found in shaft_jobs for job_id " + job_id + ". Falling back to item_row data.");
    }

    // Calculate One Tail Weight (Always exactly one cycle)
    var row_gsm = flt(job_row ? (job_row[find_jt('gsm')] || 0) : (item_row.gsm || 0));
    var row_m_roll = flt(job_row ? (job_row[find_jt('meter')] || job_row[find_jt('roll')] || 0) : (item_row.meter_roll || item_row.length || 0));
    var row_shafts = flt(job_row ? (job_row[find_jt('shaft')] || 1) : (item_row.no_of_shafts || item_row.shafts || 1));

    var width = 0;
    var unit_val = String(unit).trim().toUpperCase();
    if (unit_val.includes("UNIT 1") || unit_val.includes("UNIT 2")) width = 10;
    else if (unit_val.includes("UNIT 3")) width = 12;
    else if (unit_val.includes("UNIT 4")) width = (row_gsm < 80) ? 15 : 14;

    // --- EXTRA WASTAGE: Machine Total Width − Combination Total Width ---

    // DEBUG: Log all keys to identify correct field names (safe to remove after confirmation)
    console.group("Wastage Extra Width Debug");
    console.log("Parent doc keys with numeric values:", Object.keys(frm.doc).filter(k =>
        !k.startsWith('_') && typeof frm.doc[k] === 'number' && frm.doc[k] > 0
    ).map(k => k + " = " + frm.doc[k]));
    if (job_row) {
        console.log("shaft_jobs row keys:", Object.keys(job_row).filter(k => !k.startsWith('_')));
        console.log("shaft_jobs row values:", JSON.stringify(
            Object.fromEntries(Object.keys(job_row).filter(k => !k.startsWith('_')).map(k => [k, job_row[k]]))
        ));
    }
    console.groupEnd();

    // Step 1: Discover machine width field on parent doc — checks for any field containing 'machine'+'width'
    // OR common names like total_machine_width, custom_machine_width, machine_width
    var machine_width_f = Object.keys(frm.doc).find(k => {
        var kl = k.toLowerCase();
        return (kl.includes('machine') && kl.includes('width')) ||
               kl === 'total_machine_width' ||
               kl === 'custom_machine_width' ||
               kl === 'machine_width';
    });
    var machine_width_val = machine_width_f ? flt(frm.doc[machine_width_f] || 0) : 0;
    
    // Hardcoded defaults if not found in doc
    if (machine_width_val === 0) {
        if (unit_val.includes("UNIT 1")) machine_width_val = 63;
        else if (unit_val.includes("UNIT 2")) machine_width_val = 63;
        else if (unit_val.includes("UNIT 3")) machine_width_val = 63; // Adjust if different
        else if (unit_val.includes("UNIT 4")) machine_width_val = 63;
    }
    
    console.log("Machine width used:", machine_width_val);

    // Step 2: Parse the Combination (Inches) field from the job row.
    // Broadened search: looks for 'combin', 'combo', 'inch', 'combination_inches'
    var combination_total = 0;
    if (job_row) {
        var combo_f = Object.keys(job_row).find(k => {
            var kl = k.toLowerCase();
            return kl.includes('combin') || kl.includes('combo') || kl === 'combination_inches';
        });
        var combo_str = combo_f ? String(job_row[combo_f] || '') : '';
        console.log("Combination field found:", combo_f, "→ value:", combo_str);

        if (combo_str) {
            // Split on '+' or ',' then strip non-numeric chars, parse as float and sum
            combo_str.split(/[+,]/).forEach(function(token) {
                var n = parseFloat(token.replace(/[^\d.]/g, ''));
                if (!isNaN(n) && n > 0) combination_total += n;
            });
        }
    }
    console.log("Combination total parsed:", combination_total);

    // Step 3: Fallback — if combination could not be parsed, use a width field directly
    if (combination_total === 0 && job_row) {
        combination_total = flt(job_row[find_jt('width')] || 0);
    }
    if (combination_total === 0) {
        combination_total = flt(item_row.width || item_row.job_width || item_row.custom_width || 0);
    }

    // Step 4: Compute extra wastage inches and add to base unit width
    var extra_width = (machine_width_val > 0 && combination_total > 0)
        ? Math.max(0, machine_width_val - combination_total)
        : 0;
    width = width + extra_width;
    if (extra_width > 0 || combination_total > 0) {
        console.log("Wastage Width Breakdown → Base: " + (width - extra_width) + "\" + Extra: " + extra_width.toFixed(4) +
            "\" (Machine " + machine_width_val + "\" − Combination " + combination_total.toFixed(4) + "\") = Total: " + width.toFixed(4) + "\"");
    }

    // Tail weight is for exactly ONE production cycle
    var tail_weight = ((row_gsm * flt(width) * row_m_roll * 0.0254) / 1000);

    // FINAL FALLBACK FOR WIDTH: If width is still 0, try parsing from item_code (last 4 digits are width in mm)
    if (width === 0 && item_row.item_code && item_row.item_code.length === 16) {
        var mm = flt(item_row.item_code.substring(12, 16));
        if (mm > 0) {
            width = mm / 25.4;
            // Recalculate tail weight with new width
            tail_weight = ((row_gsm * flt(width) * row_m_roll * 0.0254) / 1000);
            console.log("Width parsed from item_code: " + width + " (mm: " + mm + ")");
        }
    }

    // FINAL FALLBACK FOR METER/ROLL: If row_m_roll is still 0, try other fields
    if (row_m_roll === 0) {
        row_m_roll = flt(item_row.meter_roll || item_row.length || item_row.custom_meter_roll || item_row.qty || 0);
        if (row_m_roll > 0) {
            // Recalculate tail weight with new meter/roll
            tail_weight = ((row_gsm * flt(width) * row_m_roll * 0.0254) / 1000);
        }
    }

    // --- RECYCLING LOGIC ---
    var recycled_from_prev = 0;
    var current_quality = (item_row.quality || item_row.custom_quality || "").toString().trim().toUpperCase();
    var current_color = (item_row.color || item_row.colour || item_row.custom_color || "").toString().trim().toUpperCase();

    var wastage_rows = frm.doc[wastage_field] || [];
    if (wastage_rows.length > 0) {
        var prev_w_row = wastage_rows[wastage_rows.length - 1];
        var prev_recycle = prev_w_row[w_chk_f] || prev_w_row.recycle_to_next || prev_w_row.custom_recycle_to_next;
        var prev_quality = (prev_w_row.quality || prev_w_row.custom_quality || "").toString().trim().toUpperCase();
        var prev_color = (prev_w_row.color || prev_w_row.colour || prev_w_row.custom_color || "").toString().trim().toUpperCase();

        if (prev_recycle && prev_quality === current_quality && prev_color === current_color) {
            recycled_from_prev = flt(prev_w_row[w_qty_f] || prev_w_row.wastage_qty || 0);
        }
    }

    var net_wastage = tail_weight;

    // Row already found or created in dedup check block above
    // (w_row was identified/created at line 170 approx)

    var w_job_field = wast_fields.find(f => f.includes('job_id') || f === 'job') || 'job_id';
    w_row[w_job_field] = job_id;
    w_row.quality = item_row.quality || item_row.custom_quality;
    w_row.color = item_row.color || item_row.colour || item_row.custom_color;

    var w_gsm_f = wast_fields.find(f => f.includes('gsm')) || 'gsm'; w_row[w_gsm_f] = row_gsm;
    var w_wid_f = wast_fields.find(f => f.includes('width')) || 'width'; w_row[w_wid_f] = width;
    var w_mtr_f = wast_fields.find(f => f.includes('meter') || f.includes('roll')) || 'meter_roll'; w_row[w_mtr_f] = row_m_roll;
    var w_shf_f = wast_fields.find(f => f.includes('shaft')) || 'no_of_shafts'; w_row[w_shf_f] = row_shafts;

    w_row[w_qty_f] = tail_weight;
    w_row[w_rec_f] = recycled_from_prev;
    w_row[w_net_f] = net_wastage;
    w_row[w_osg_f] = tail_weight;

    // --- BATCH NO ---
    // Store the wastage base batch here. The submit script adds the running
    // series, e.g. JS-0103261W becomes JS-0103261W/1.
    var b_f = wast_fields.find(f => f.includes('batch_no')) || 'batch_no';
    if (wast_fields.includes(b_f)) {
        var roll_batch = item_row.batch_no || item_row.custom_batch_no || "";
        
        // If row doesn't have it, try finding it from the SPECIFIC row in items table matching this job_id
        if (!roll_batch) {
            var matching_item = (frm.doc.items || []).find(it => {
                var it_jid = it.job_id || it.job || it.custom_job_id || it.target_job_id || it.work_order || it.idx || it.name;
                return it_jid && String(it_jid) === String(job_id);
            });
            if (matching_item) {
                roll_batch = matching_item.batch_no || matching_item.custom_batch_no;
            }
        }
        
        var b_val = get_wastage_batch_base(roll_batch);
        if (b_val) {
            w_row[b_f] = b_val;
        } else {
            // ONLY if absolutely no batch found in items, fall back to SPR name stripping (if it has /)
            var spr_name = frm.doc.name || "";
            if (spr_name.includes('/')) {
                 w_row[b_f] = get_wastage_batch_base(spr_name);
            } else {
                 w_row[b_f] = ""; // Keep empty rather than showing SPR name if no batch yet
            }
        }
    }

    if (recycled_from_prev > 0) {
        w_row[w_chk_f] = 1;
        w_row[w_net_f] = 0;
    }

    append_wastage_running_series(frm, wastage_field);
    update_wastage_label_actions(frm, wastage_field);
    frm.refresh_field(wastage_field);
    update_recycled_table(frm);
}

function recalculate_all_wastage(frm) {
    var unit = frm.doc.unit || frm.doc.custom_unit || "";
    var unit_val = String(unit).trim().toUpperCase();
    var is_valid_unit = ["UNIT 1", "UNIT 2", "UNIT 3", "UNIT 4"].some(u => unit_val.includes(u));
    if (!is_valid_unit) {
        return;
    }

    var wastage_field = ['running_patty_wastage', 'wastage_details', 'custom_wastage_details', 'custom_running_patty_wastage'].find(f => frm.fields_dict[f]);
    if (!wastage_field) return;

    var wast_fields = frm.fields_dict[wastage_field].grid.docfields.map(df => df.fieldname);
    var w_qty_f = wast_fields.find(f => f.includes('wastage_qty') || f === 'qty' || f === 'wastage') || 'wastage_qty';
    var w_rec_f = wast_fields.find(f => f.includes('recycled')) || 'recycled_qty';
    var w_net_f = wast_fields.find(f => f.includes('net_wastage')) || 'net_wastage';
    var w_chk_f = wast_fields.find(f => f.includes('recycle_to_next')) || 'recycle_to_next';

    var rows = frm.doc[wastage_field] || [];
    var prev_row = null;

    rows.forEach((row, i) => {
        var recycled_from_prev = 0;
        var current_quality = (row.quality || row.custom_quality || "").toString().trim().toUpperCase();
        var current_color = (row.color || row.colour || row.custom_color || "").toString().trim().toUpperCase();

        if (prev_row) {
            var prev_recycle = prev_row[w_chk_f] || prev_row.recycle_to_next || prev_row.custom_recycle_to_next;
            var prev_quality = (prev_row.quality || prev_row.custom_quality || "").toString().trim().toUpperCase();
            var prev_color = (prev_row.color || prev_row.colour || prev_row.custom_color || "").toString().trim().toUpperCase();

            if (prev_recycle && prev_quality === current_quality && prev_color === current_color) {
                recycled_from_prev = flt(prev_row[w_qty_f] || prev_row.wastage_qty || 0);
            }
        }

        var tail_weight = flt(row[w_qty_f] || row.wastage_qty || 0);
        var is_rec_next = row[w_chk_f] || row.recycle_to_next || row.custom_recycle_to_next;

        row[w_rec_f] = recycled_from_prev;

        // THE BINARY TOGGLE: 0 if checked, else full weight
        row[w_net_f] = is_rec_next ? 0 : tail_weight;

        prev_row = row;
    });

    append_wastage_running_series(frm, wastage_field);
    update_wastage_label_actions(frm, wastage_field);
    frm.refresh_field(wastage_field);
    update_recycled_table(frm);
}

function update_recycled_table(frm) {
    var rec_table_field = Object.keys(frm.fields_dict).find(f => f.toLowerCase().includes('recycle') && frm.fields_dict[f].grid);
    if (!rec_table_field) return;

    var wastage_field = ['running_patty_wastage', 'wastage_details', 'custom_wastage_details', 'custom_running_patty_wastage'].find(f => frm.fields_dict[f]);
    if (!wastage_field) return;

    // Clear only auto-calculated rows; preserve rows added from Patty Stock (job_id = 'Patty')
    frm.doc[rec_table_field] = (frm.doc[rec_table_field] || []).filter(row => {
        var jid = (row.job_id || '').toLowerCase();
        return jid === 'patty';
    });

    var w_rows = frm.doc[wastage_field] || [];
    var wast_fields = frm.fields_dict[wastage_field].grid.docfields.map(df => df.fieldname);
    var w_qty_f = wast_fields.find(f => f.includes('wastage_qty') || f === 'qty' || f === 'wastage') || 'wastage_qty';
    var w_chk_f = wast_fields.find(f => f.includes('recycle_to_next')) || 'recycle_to_next';
    var w_shf_f = wast_fields.find(f => f.includes('shaft')) || 'no_of_shafts';

    var rec_fields = frm.fields_dict[rec_table_field].grid.docfields.map(df => df.fieldname);
    
    // Explicit field names from user's system screenshot
    var r_avail_f = 'available_qty_kgs';
    var r_recy_f = 'recycled_qty_kgs';
    var r_calc_f = 'calculation_details';

    w_rows.forEach((w_row, idx) => {
        var tail_weight = flt(w_row[w_qty_f] || w_row.wastage_qty || 0);
        var is_rec_next = (w_row[w_chk_f] || w_row.recycle_to_next || w_row.custom_recycle_to_next) ? 1 : 0;
        var shafts = flt(w_row[w_shf_f] || w_row.no_of_shafts || w_row.shafts || 1);

        // Available Qty = Total weight of all shafts
        var total_available_qty = shafts * tail_weight;

        // Recycled Qty = Same as available qty (all wastage tails are recycled as patty)
        var total_recycled_qty = total_available_qty;

        if (total_available_qty > 0) {
            var r_row = frm.add_child(rec_table_field);

            // Dynamic lookup for source fields (w_row)
            var get_w_val = (keywords) => {
                var w_f = wast_fields.find(f => keywords.some(kw => f.toLowerCase().includes(kw)));
                return w_f ? w_row[w_f] : undefined;
            };

            // Explicitly map exactly to the provided Recycled Wastage Details fields
            r_row.job_id = get_w_val(['job_id', 'job', 'work_order']) || '';
            r_row.quality = get_w_val(['quality']) || '';
            r_row.color = get_w_val(['color', 'colour']) || '';
            r_row.gsm = get_w_val(['gsm']) || 0;
            r_row.width = get_w_val(['width']) || 0;
            r_row.meter__roll = get_w_val(['meter', 'roll']) || 0; 
            r_row.no_of_shafts = shafts;

            // Set Recycled & Available Qtys Explicitly
            r_row[r_avail_f] = total_available_qty;
            r_row[r_recy_f] = total_recycled_qty;
            
            // Set calculation details string
            r_row[r_calc_f] = shafts + " shaft(s) × " + tail_weight.toFixed(3) + " Kg = " + total_available_qty.toFixed(3) + " Kg recycled";
            
            // Force values through frappe model (to guarantee UI refresh updates them)
            frappe.model.set_value(r_row.doctype, r_row.name, r_avail_f, total_available_qty);
            frappe.model.set_value(r_row.doctype, r_row.name, r_recy_f, total_recycled_qty);
        }
    });

    frm.refresh_field(rec_table_field);
}

function show_patty_stock_dialog(frm) {
    frappe.call({
        method: "frappe.client.get_list",
        args: {
            doctype: "Patty Stock",
            filters: { balance_quantity: [">", 0] },
            fields: ["name", "item_code", "item_name", "quality", "colour", "gsm", "width_inch", "balance_quantity", "batch_no"],
            order_by: "creation desc"
        },
        callback: function (r) {
            if (!r.message || r.message.length === 0) {
                frappe.msgprint("No available Patty Stock found.");
                return;
            }

            r.message.forEach(row => {
                row.consume_qty = row.balance_quantity;
            });

            let d = new frappe.ui.Dialog({
                title: 'Available Patty Stock',
                size: 'extra-large',
                fields: [
                    {
                        label: 'Stock List',
                        fieldname: 'stock_list',
                        fieldtype: 'Table',
                        fields: [
                            { fieldtype: 'Data', fieldname: 'batch_no', label: 'Batch No', read_only: 1, in_list_view: 1 },
                            { fieldtype: 'Data', fieldname: 'quality', label: 'Quality', read_only: 1, in_list_view: 1 },
                            { fieldtype: 'Data', fieldname: 'colour', label: 'Color', read_only: 1, in_list_view: 1 },
                            { fieldtype: 'Data', fieldname: 'gsm', label: 'GSM', read_only: 1, in_list_view: 1 },
                            { fieldtype: 'Data', fieldname: 'width_inch', label: 'Width', read_only: 1, in_list_view: 1 },
                            { fieldtype: 'Float', fieldname: 'balance_quantity', label: 'Available (Kg)', read_only: 1, in_list_view: 1 },
                            { fieldtype: 'Float', fieldname: 'consume_qty', label: 'Consume (Kg)', in_list_view: 1 }
                        ],
                        data: r.message,
                        in_place_edit: true
                    }
                ],
                primary_action_label: 'Consume Selected',
                primary_action(values) {
                    let grids = d.fields_dict.stock_list.grid;
                    let selected = [];
                    
                    // Robust check: use get_checked_items or fall back to iterating data
                    if (grids.get_checked_items) {
                        selected = grids.get_checked_items();
                    }
                    
                    if (!selected || selected.length === 0) {
                        // Fallback: check manually for __checked in data
                        let all_data = grids.data || [];
                        selected = all_data.filter(r => r.__checked);
                    }
                    
                    if (selected.length === 0) {
                        frappe.msgprint("Please select at least one row using the checkbox.");
                        return;
                    }

                    d.hide();
                    consume_patty_stock(frm, selected);
                }
            });

            d.show();
            // Style the dialog table to be more compact
            d.fields_dict.stock_list.grid.wrapper.find('.grid-add-row').hide();
        }
    });
}

function consume_patty_stock(frm, selections) {
    frappe.confirm('Are you sure you want to consume ' + selections.length + ' item(s)?', () => {
        frappe.call({
            method: "shaft_production_run_patty_consumption",
            args: {
                parent_doc: frm.doc.name,
                ps_ids: selections.map(s => s.name).join(','),
                consume_qtys: selections.map(s => s.consume_qty !== undefined ? flt(s.consume_qty) : flt(s.balance_quantity)).join(',')
            },
            freeze: true,
            freeze_message: "Recording Patty Stock consumption...",
            callback: function (r) {
                if (!r.exc) {
                    frm.reload_doc();
                }
            }
        });
    });
}

// --- SCAN ROLLS DIALOG ---
function show_scan_rolls_dialog(frm) {
    let scanned_items = [];  // Accumulates confirmed patty stock hits during session

    let d = new frappe.ui.Dialog({
        title: '<i class="fa fa-barcode"></i> Scan Rolls to Consume from Patty Stock',
        size: 'large',
        fields: [
            {
                label: 'Scan / Enter Roll Barcode or Batch No',
                fieldname: 'barcode_input',
                fieldtype: 'Data',
                description: 'Scan or type the roll barcode / batch number. Press Enter to search.',
            },
            {
                fieldtype: 'Button',
                fieldname: 'scan_btn',
                label: '<i class="fa fa-camera"></i> Open Camera Scanner',
                click: function() {
                    let handle_scanned_value = function(res) {
                        let scanned_value = get_scanner_value(res);
                        if (scanned_value) {
                            set_scan_result_message(d, '<span style="color:#888;"><i class="fa fa-barcode"></i> Scanned value: <b>' + scanned_value + '</b></span>');
                            if (d.__patty_scanner && d.__patty_scanner.stop_scan) {
                                d.__patty_scanner.stop_scan();
                            }
                            scan_patty_stock_roll(d, scanned_value);
                        } else {
                            set_scan_result_message(d, '<span style="color:red;"><i class="fa fa-times-circle"></i> Barcode scanner did not return a readable value.</span>');
                            console.log("Scanner result without readable value:", res);
                        }
                    };

                    d.__patty_scanner = new frappe.ui.Scanner({
                        dialog: true,
                        multiple: false,
                        on_scan: handle_scanned_value
                    });
                }
            },
            {
                fieldtype: 'Button',
                fieldname: 'search_btn',
                label: '<i class="fa fa-search"></i> Search',
                click: function() {
                    scan_patty_stock_roll(d, d.get_value('barcode_input'));
                }
            },
            { fieldtype: 'HTML', fieldname: 'scan_results_html', options: '<div id="scan-result-area" style="margin-top:8px;"></div>' },
            { fieldtype: 'Section Break', label: 'Scanned & Ready to Consume' },
            {
                label: 'Scanned Rolls',
                fieldname: 'scanned_rolls',
                fieldtype: 'Table',
                fields: [
                    { fieldtype: 'Data',  fieldname: 'ps_name',    label: 'Patty Stock ID',    read_only: 1, in_list_view: 1, columns: 2 },
                    { fieldtype: 'Data',  fieldname: 'quality',    label: 'Quality',            read_only: 1, in_list_view: 1, columns: 2 },
                    { fieldtype: 'Data',  fieldname: 'colour',     label: 'Colour',             read_only: 1, in_list_view: 1, columns: 1 },
                    { fieldtype: 'Data',  fieldname: 'gsm',        label: 'GSM',                read_only: 1, in_list_view: 1, columns: 1 },
                    { fieldtype: 'Data',  fieldname: 'batch_no',   label: 'Batch No',           read_only: 1, in_list_view: 1, columns: 2 },
                    { fieldtype: 'Float', fieldname: 'net_weight', label: 'Net Wt',             read_only: 1, in_list_view: 1, columns: 1 },
                    { fieldtype: 'Float', fieldname: 'gross_weight', label: 'Gross Wt',         read_only: 1, in_list_view: 1, columns: 1 },
                    { fieldtype: 'Float', fieldname: 'meter',      label: 'Meter',              read_only: 1, in_list_view: 1, columns: 1 },
                    { fieldtype: 'Float', fieldname: 'consume_qty',label: 'Consume Qty (Kg)',                in_list_view: 1, columns: 2 }
                ],
                data: [],
                in_place_edit: true
            }
        ],
        primary_action_label: '<i class="fa fa-check"></i> Consume All Scanned',
        primary_action(values) {
            let scanned_grid = d.fields_dict.scanned_rolls.grid;
            let rows = d.fields_dict.scanned_rolls.df.data || scanned_grid.data || [];
            let valid = rows.filter(r => r.ps_name && flt(r.consume_qty) > 0);
            if (!valid.length) {
                frappe.msgprint('No valid rows to consume. Please scan rolls first and set Consume Qty.');
                return;
            }
            d.hide();
            let ps_ids     = valid.map(r => r.ps_name).join(',');
            let consume_qtys = valid.map(r => flt(r.consume_qty)).join(',');
            frappe.call({
                method: 'shaft_production_run_patty_consumption',
                args: {
                    parent_doc:   frm.doc.name,
                    ps_ids:       ps_ids,
                    consume_qtys: consume_qtys
                },
                freeze: true,
                freeze_message: 'Recording Patty Stock consumption...',
                callback(r) {
                    if (!r.exc) frm.reload_doc();
                }
            });
        }
    });

    let scan_input_timer = null;
    let run_input_scan = function() {
        let val = (d.get_value('barcode_input') || '').trim();
        if (!val || val.length < 3) return;
        scan_patty_stock_roll(d, val);
    };

    // Barcode search on Enter key
    d.fields_dict.barcode_input.$input.on('keydown', function(e) {
        if (e.which !== 13) return;   // only Enter
        let val = (d.get_value('barcode_input') || '').trim();
        if (!val) return;
        e.preventDefault();
        scan_patty_stock_roll(d, val);
    });

    // Hardware scanners often type into the field without sending Enter.
    d.fields_dict.barcode_input.$input.on('input change', function() {
        clearTimeout(scan_input_timer);
        scan_input_timer = setTimeout(run_input_scan, 500);
    });

    d.show();
    // Focus barcode input automatically
    setTimeout(() => d.fields_dict.barcode_input.$input.focus(), 400);
}

function set_scan_result_message(dialog, html) {
    let area = dialog.fields_dict.scan_results_html.$wrapper.find('#scan-result-area');
    area.html(html);
}

function get_scanner_value(data) {
    if (!data) return "";
    if (typeof data === "string") return data.trim();
    if (typeof data === "number") return String(data).trim();

    if (Array.isArray(data)) {
        for (let i = 0; i < data.length; i++) {
            let val = get_scanner_value(data[i]);
            if (val) return val;
        }
        return "";
    }

    let direct_keys = ["result", "text", "decodedText", "rawValue", "barcode", "value", "data", "message"];
    for (let i = 0; i < direct_keys.length; i++) {
        let key = direct_keys[i];
        if (data[key]) {
            let val = get_scanner_value(data[key]);
            if (val) return val;
        }
    }

    return "";
}

function add_unique_search_term(terms, value) {
    let term = String(value || '').trim();
    if (!term) return;
    if (!terms.includes(term)) {
        terms.push(term);
    }
}

function get_barcode_search_terms(raw_value) {
    let terms = [];
    let val = String(raw_value || '').trim();
    let compact = val.replace(/[\s\r\n\t]+/g, '');
    let upper = compact.toUpperCase();

    add_unique_search_term(terms, val);
    add_unique_search_term(terms, compact);
    add_unique_search_term(terms, upper);

    if (compact.includes('/')) {
        let base = compact.split('/')[0].trim();
        add_unique_search_term(terms, base + 'W/%');
    }

    // Some scanners/labels read JS-0103261W/1 as JS-0103261W1.
    let no_slash_w = compact.replace(/W(\d+)$/i, 'W/$1');
    add_unique_search_term(terms, no_slash_w);

    // Some older barcode text used D as a separator. Map JS-0103261D1 -> JS-0103261W/1.
    let d_match = compact.match(/^(.*)D(\d+)$/i);
    if (d_match) {
        add_unique_search_term(terms, d_match[1] + 'W/' + d_match[2]);
        add_unique_search_term(terms, d_match[1] + 'W/%');
    }

    return terms;
}

function scan_patty_stock_roll(dialog, raw_value) {
    let val = String(raw_value || '').trim();
    if (!val) return;

    let search_terms = get_barcode_search_terms(val);
    dialog.set_value('barcode_input', '');
    set_scan_result_message(dialog, '<span style="color:#888;"><i class="fa fa-spinner fa-spin"></i> Searching Patty Stock for scanned value: <b>' + val + '</b></span>');

    search_batch_by_terms(dialog, search_terms, val, 0);
}

function search_batch_by_terms(dialog, search_terms, original_value, term_index) {
    if (term_index >= search_terms.length) {
        scan_patty_stock_fallback(dialog, original_value, search_terms, 0);
        return;
    }

    let term = search_terms[term_index];
    let like_term = term.includes('%') ? term : '%' + term + '%';
    frappe.call({
        method: 'frappe.client.get_list',
        args: {
            doctype: 'Batch',
            filters: [['name', 'like', like_term]],
            fields: ['name', 'batch_id', 'item', 'custom_net_weight', 'custom_gross_weight', 'custom_meter'],
            order_by: 'creation desc',
            limit: 20
        },
        callback(batch_response) {
            let batch_results = batch_response.message || [];
            if (batch_results.length) {
                handle_batch_scan_results(dialog, batch_results, original_value);
                return;
            }

            search_batch_by_terms(dialog, search_terms, original_value, term_index + 1);
        }
    });
}

function scan_patty_stock_fallback(dialog, original_value, search_terms, term_index) {
    if (term_index >= search_terms.length) {
        handle_scan_results(dialog, [], original_value);
        return;
    }

    let term = search_terms[term_index];
    let like_term = term.includes('%') ? term : '%' + term + '%';
    frappe.call({
        method: 'frappe.client.get_list',
        args: {
            doctype: 'Patty Stock',
            filters: [['balance_quantity', '>', 0], ['batch_no', 'like', like_term]],
            fields:  ['name', 'item_code', 'quality', 'colour', 'gsm', 'width_inch', 'balance_quantity', 'batch_no'],
            order_by: 'creation desc',
            limit: 20
        },
        callback(r) {
            let results = r.message || [];
            if (results.length) {
                handle_scan_results(dialog, results, original_value);
                return;
            }

            frappe.call({
                method: 'frappe.client.get_list',
                args: {
                    doctype: 'Patty Stock',
                    filters: [['balance_quantity', '>', 0], ['item_code', 'like', like_term]],
                    fields:  ['name', 'item_code', 'quality', 'colour', 'gsm', 'width_inch', 'balance_quantity', 'batch_no'],
                    order_by: 'creation desc',
                    limit: 20
                },
                callback(r2) {
                    let item_results = r2.message || [];
                    if (item_results.length) {
                        handle_scan_results(dialog, item_results, original_value);
                        return;
                    }

                    scan_patty_stock_fallback(dialog, original_value, search_terms, term_index + 1);
                }
            });
        }
    });
}

function handle_batch_scan_results(dialog, batch_results, scanned_val) {
    let batch_names = batch_results.map(b => b.name || b.batch_id).filter(Boolean);
    if (!batch_names.length) {
        handle_scan_results(dialog, [], scanned_val);
        return;
    }

    frappe.call({
        method: 'frappe.client.get_list',
        args: {
            doctype: 'Patty Stock',
            filters: [['balance_quantity', '>', 0], ['batch_no', 'in', batch_names]],
            fields: ['name', 'item_code', 'quality', 'colour', 'gsm', 'width_inch', 'balance_quantity', 'batch_no'],
            order_by: 'creation desc',
            limit: 20
        },
        callback(patty_response) {
            let patty_rows = patty_response.message || [];
            let merged_rows = [];

            batch_results.forEach(batch_row => {
                let batch_no = batch_row.name || batch_row.batch_id || '';
                let patty_row = patty_rows.find(ps => ps.batch_no === batch_no);
                if (!patty_row) return;

                patty_row.net_weight = batch_row.custom_net_weight || 0;
                patty_row.gross_weight = batch_row.custom_gross_weight || 0;
                patty_row.meter = batch_row.custom_meter || 0;
                merged_rows.push(patty_row);
            });

            handle_scan_results(dialog, merged_rows, scanned_val);
        }
    });
}

function handle_scan_results(dialog, results, scanned_val) {
    if (!results.length) {
        set_scan_result_message(dialog,
            '<span style="color:red;"><i class="fa fa-times-circle"></i> No Patty Stock found for: <b>' + scanned_val + '</b></span>'
        );
        return;
    }

    let grid = dialog.fields_dict.scanned_rolls.grid;
    let table_df = dialog.fields_dict.scanned_rolls.df;
    table_df.data = table_df.data || [];

    results.forEach(ps => {
        let ps_name = ps.name || ps.ps_name || '';
        if (!ps_name) return;

        // Avoid duplicate entries in the scanned table
        let already = (table_df.data || []).find(r => r.ps_name === ps_name);
        if (already) return;

        table_df.data.push({
            ps_name: ps_name,
            quality: ps.quality || '',
            colour: ps.colour || '',
            gsm: ps.gsm || '',
            batch_no: ps.batch_no || '',
            net_weight: flt(ps.net_weight || 0),
            gross_weight: flt(ps.gross_weight || 0),
            meter: flt(ps.meter || 0),
            consume_qty: flt(ps.balance_quantity)
        });
    });

    grid.data = table_df.data;
    grid.refresh();
    dialog.refresh();

    let msg = results.length === 1
        ? '<span style="color:green;"><i class="fa fa-check-circle"></i> Found: <b>' + results[0].name + '</b> — ' + flt(results[0].balance_quantity).toFixed(3) + ' Kg available. Adjust Consume Qty if needed.</span>'
        : '<span style="color:green;"><i class="fa fa-check-circle"></i> Found <b>' + results.length + '</b> matching Patty Stock records — added to table below.</span>';
    set_scan_result_message(dialog, msg);
}

function calculate_wastage_automation(frm, force_all) {
    if (!force_all) return;
    
    var unit = frm.doc.unit || frm.doc.custom_unit || "";
    var unit_val = String(unit).trim().toUpperCase();
    var is_valid_unit = ["UNIT 1", "UNIT 2", "UNIT 3", "UNIT 4"].some(u => unit_val.includes(u));

    var wastage_field = ['running_patty_wastage', 'wastage_details', 'custom_wastage_details', 'custom_running_patty_wastage'].find(f => frm.fields_dict[f]);
    if (!wastage_field) return;

    if (!is_valid_unit) {
        if (frm.doc.custom_is_box_bag) {
            return;
        }
        if (frm.doc[wastage_field] && frm.doc[wastage_field].length > 0) {
            frm.clear_table(wastage_field);
            frm.refresh_field(wastage_field);
            update_recycled_table(frm);
        }
        return;
    }

    frm.clear_table(wastage_field);
    (frm.doc.items || []).forEach(item => add_incremental_wastage(frm, item));
}

// --- POLYBAG AUTOMATION ---
function auto_populate_polybags(frm) {
    // Trigger population regardless of local status if called via event
    do_populate_polybags(frm);
}

function do_populate_polybags(frm) {
    // 0. Prevent modifications on submitted documents
    if (frm.doc.docstatus > 0) return;

    // Determine the polybag table field
    var polybag_field = Object.keys(frm.fields_dict).find(f => f.toLowerCase().includes('polybag') && frm.fields_dict[f].grid);
    if (!polybag_field) {
        console.warn("Polybag Automation: Child table field not found.");
        return;
    }

    var packing_field = Object.keys(frm.doc).find(k => k.toLowerCase().includes('packing') && !k.startsWith('_'));
    var customer_field = Object.keys(frm.doc).find(k => (k.toLowerCase().includes('customer') || k.toLowerCase().includes('party')) && !k.startsWith('_'));
    var plan_field = Object.keys(frm.doc).find(k => String(frm.doc[k]).startsWith('MFG-PP-'));

    var packing = (frm.doc[packing_field] || frm.doc.custom_packing || frm.doc.packing || "").toString().trim();
    var customer = (frm.doc[customer_field] || frm.doc.customer || frm.doc.party_name || frm.doc.custom_customer || frm.doc.custom_party_name || "").toString().trim().toLowerCase();

    if (!packing && plan_field) {
        // Try to fetch from Production Plan if link exists - Using correct fieldname 'custom_packing'
        frappe.db.get_value("Production Plan", frm.doc[plan_field], "custom_packing", (r) => {
            let val = (r && r.custom_packing) ? r.custom_packing : "";
            if (val) {
                console.log("Polybag Automation: Fetched packing from Plan " + frm.doc[plan_field] + ": " + val);
                process_polybag_population(frm, polybag_field, val, customer);
            }
        });
        return; 
    }

    process_polybag_population(frm, polybag_field, packing, customer);
}

function process_polybag_population(frm, polybag_field, packing, customer) {
    if (!packing && !customer) return;
    
    // Prevent multiple triggers if dialog is already open or recently handled
    if (frm.__polybag_processing) return;

    // Prioritize Remex Customer Match
    if (customer && (customer.includes("remex") || customer.includes("tn-0023"))) {
        add_polybag_items(frm, polybag_field, ["PB - 1006105"]);
    } else if (packing) {
        // Fallback to Packing type string match
        if (packing.toLowerCase() === "plain poly") {
            // Only show popup if table is empty OR user hasn't added these items yet
            let existing_items = (frm.doc[polybag_field] || []).map(r => r.polybag_item || r.item_code);
            let has_plain = ["PB - 1006052", "PB - 1006051", "PB - 1006053", "PB - 1006116"].some(p => existing_items.includes(p));
            
            if (!has_plain && !frm.__polybag_dialog_open) {
                show_plain_poly_dialog(frm, polybag_field);
            }
        } else if (packing.toLowerCase() === "orange poly") {
            add_polybag_items(frm, polybag_field, ["PB - 1006103"]);
        } else if (packing.toLowerCase() === "red poly") {
            add_polybag_items(frm, polybag_field, ["PB - 1006104"]);
        } else if (packing.toLowerCase() === "blue poly") {
            add_polybag_items(frm, polybag_field, ["PB - 1006101"]);
        } else if (packing.toLowerCase() === "green poly") {
            add_polybag_items(frm, polybag_field, ["PB - 1006102"]);
        }
    }
}

function show_plain_poly_dialog(frm, polybag_field) {
    let plain_polys = [
        { item: "PB - 1006052", label: "PLAIN POLYTUBE - 200 GAUGE - 26\"" },
        { item: "PB - 1006051", label: "PLAIN POLYTUBE - 200 GAUGE - 38\"" },
        { item: "PB - 1006053", label: "PLAIN POLYTUBE - 200 GAUGE - 19\"" },
        { item: "PB - 1006116", label: "PLAIN POLYTUBE - 200 GAUGE - 19.5\"" }
    ];

    let existing_items = (frm.doc[polybag_field] || []).map(r => r.polybag_item || r.item_code);
    
    let d = new frappe.ui.Dialog({
        title: 'Select Plain Poly Bags',
        fields: plain_polys.map(p => ({
            label: p.label,
            fieldname: p.item,
            fieldtype: 'Check',
            default: existing_items.includes(p.item) ? 1 : 0
        })),
        primary_action_label: 'Add to Table',
        primary_action(values) {
            let to_add = Object.keys(values).filter(v => values[v] == 1);
            add_polybag_items(frm, polybag_field, to_add);
            frm.__polybag_dialog_open = false;
            d.hide();
        },
        on_hide() {
            frm.__polybag_dialog_open = false;
        }
    });

    frm.__polybag_dialog_open = true;
    d.show();
}

function add_polybag_items(frm, polybag_field, items) {
    let existing_rows = frm.doc[polybag_field] || [];
    let p_item_f = "polybag_item"; 
    let p_qty_f = "quantity_kgs"; 
    let p_uom_f = "uom"; 
    let existing_items = existing_rows.map(r => r[p_item_f] || r.item_code);

    let added_count = 0;
    items.forEach(target => {
        if (!existing_items.includes(target) && target) {
            let row = frm.add_child(polybag_field);
            row[p_item_f] = target;
            row[p_qty_f] = 0;
            
            // Set processing lock to prevent dialog re-opening during fetch
            frm.__polybag_processing = true;

            // Fetch UOM from Item Master
            frappe.db.get_value("Item", target, "stock_uom", (r) => {
                if (r && r.stock_uom) {
                    row[p_uom_f] = r.stock_uom;
                    frm.refresh_field(polybag_field);
                }
                setTimeout(() => { frm.__polybag_processing = false; }, 2000);
            });
            
            added_count++;
        }
    });

    if (added_count > 0) {
        frm.refresh_field(polybag_field);
    }
}

// --- PROCESS WASTAGE AUTOMATION ---
function auto_populate_process_wastage(frm) {
    if (frm.doc.docstatus > 0) return;

    let wastage_field = ['running_patty_wastage', 'wastage_details', 'custom_wastage_details', 'custom_running_patty_wastage'].find(f => frm.fields_dict[f]);
    if (!wastage_field) return;

    let target_items = [];

    // Helper to check fields
    let has_check = (keywords) => {
        return Object.keys(frm.doc).some(k => {
            if ((k.startsWith('is_') || k.startsWith('custom_is_')) && frm.doc[k] === 1) {
                let name = k.toLowerCase();
                return keywords.some(kw => name.includes(kw));
            }
            return false;
        });
    };

    let is_bag = has_check(['bag', 'box_bag', 'd_cut', 'w_cut']);
    
    if (is_bag) {
        let unit_val = String(frm.doc.unit || frm.doc.custom_unit || "").toUpperCase();
        let is_box_bag = unit_val.includes('LEADER OYANG') || unit_val.includes('LEADER ZX');
        let is_d_cut = unit_val.includes('OYANG C900') || unit_val.includes('OYANG C700') || unit_val.includes('B700 BAG MAKING');

        if (is_box_bag) {
            target_items = ["WASTE - 007", "WASTE - 008", "WASTE - 009"]; // Sheet, De-lam, Without Handle
        } else if (is_d_cut) {
            target_items = ["WASTE - 007", "WASTE - 011"]; // Sheet, Punch
        }
    } 
    else if (has_check(['printing', 'bopp_film'])) {
        target_items = ["WASTE - 007", "WASTE - 010"]; // Sheet Waste, Ink Waste
    }
    else if (has_check(['lamination'])) {
        target_items = ["WASTE - 006"]; // Lamination Trim
    }
    else if (has_check(['slitting', 'rewinding', 'sheet_cutting'])) {
        target_items = ["WASTE - 007"]; // Sheet Waste
    }

    if (target_items.length === 0) return;
    
    let existing_rows = frm.doc[wastage_field] || [];
    let w_fields = frm.fields_dict[wastage_field].grid.docfields.map(df => df.fieldname);
    
    // Robustly find the fieldname for the Item column
    let item_f = w_fields.find(f => f === 'item' || f === 'item_code' || f === 'custom_item' || f === 'wastage_item' || f.includes('item')) || 'item';
    let qty_f = w_fields.find(f => f.includes('wastage_qty') || f === 'qty' || f === 'quantity' || f === 'net_wastage') || 'wastage_qty';
    let pcs_f = w_fields.find(f => f.includes('pieces') || f === 'pcs') || null;

    let existing_items = existing_rows.map(r => r[item_f] || r.item || r.item_code || r.custom_item).filter(Boolean);
    let added = false;
    let grid = frm.fields_dict[wastage_field].grid;

    // Clean up any old blank rows
    let blank_rows = (grid.data || []).filter(r => !(r[item_f] || r.item || r.item_code || r.custom_item));
    if (blank_rows.length > 0) {
        blank_rows.forEach(r => {
            if (grid.grid_rows_by_docname[r.name]) {
                grid.grid_rows_by_docname[r.name].remove();
            }
        });
        added = true; // Trigger refresh
    }

    // Optional: Clean up items that don't belong to the current machine type
    // If they switched from Box Bag to D-Cut, we might want to remove De-lam waste
    let wrong_items = existing_rows.filter(r => {
        let val = r[item_f] || r.item || r.item_code || r.custom_item;
        return val && !target_items.includes(val);
    });
    if (wrong_items.length > 0) {
        wrong_items.forEach(r => {
            if (grid.grid_rows_by_docname[r.name]) grid.grid_rows_by_docname[r.name].remove();
        });
        added = true;
    }

    target_items.forEach(target => {
        if (!existing_items.includes(target)) {
            let row = frm.add_child(wastage_field);
            frappe.model.set_value(row.doctype, row.name, item_f, target);
            if (qty_f) frappe.model.set_value(row.doctype, row.name, qty_f, 0);
            if (pcs_f) frappe.model.set_value(row.doctype, row.name, pcs_f, 0);
            
            // Fetch UOM and Item Name
            frappe.db.get_value("Item", target, ["stock_uom", "item_name"], (r) => {
                if (r) {
                    let uom_f = w_fields.find(f => f === 'uom' || f === 'stock_uom');
                    if (uom_f && r.stock_uom) frappe.model.set_value(row.doctype, row.name, uom_f, r.stock_uom);
                    
                    let name_f = w_fields.find(f => f === 'item_name' || f === 'wastage_item_name');
                    if (name_f && r.item_name) frappe.model.set_value(row.doctype, row.name, name_f, r.item_name);
                    
                    frm.refresh_field(wastage_field);
                }
            });
            added = true;
        }
    });

    if (added) {
        frm.refresh_field(wastage_field);
    }
}

// --- COLUMN VISIBILITY AUTOMATION ---
function toggle_wastage_columns(frm) {
    let wastage_field = ['running_patty_wastage', 'wastage_details', 'custom_wastage_details', 'custom_running_patty_wastage'].find(f => frm.fields_dict[f]);
    if (!wastage_field || !frm.fields_dict[wastage_field].grid) return;

    let grid = frm.fields_dict[wastage_field].grid;
    
    // Determine the process type based on checkboxes
    let is_bag = frm.doc.custom_is_bag || frm.doc.custom_is_box_bag || frm.doc.custom_is_d_cut || frm.doc.custom_is_w_cut || frm.doc.is_bag || frm.doc.is_box_bag || frm.doc.is_d_cut || frm.doc.is_w_cut;
    let unit_val = String(frm.doc.unit || frm.doc.custom_unit || "").toUpperCase();
    let is_box_bag = is_bag && (unit_val.includes('LEADER OYANG') || unit_val.includes('LEADER ZX'));
    
    let is_other_process = false;
    
    // Check all fields in doc to find if any 'is_...' or 'custom_is_...' is ticked, and isn't a bag or non-woven
    Object.keys(frm.doc).forEach(k => {
        if ((k.startsWith('custom_is_') || k.startsWith('is_')) && frm.doc[k] === 1) {
            let proc_name = k.toLowerCase();
            // mix_roll and non_woven should behave like the default (showing all columns)
            if (!proc_name.includes('box_bag') && !proc_name.includes('d_cut') && !proc_name.includes('w_cut') && !proc_name.includes('non_woven') && !proc_name.includes('mix_roll')) {
                is_other_process = true;
            }
        }
    });

    grid.docfields.forEach(df => {
        let f = df.fieldname;
        let l = (df.label || "").toLowerCase();
        
        // Always show these core fields
        if (f === 'item' || f === 'item_code' || f === 'custom_item' || f === 'wastage_item' || 
            f === 'wastage_qty' || f === 'net_wastage' || f === 'qty' || f === 'item_name') {
            grid.toggle_display(f, true);
        }
        // Pieces field: show only for Box Bag Process
        else if (f === 'pieces' || f === 'custom_pieces' || f === 'pcs' || l.includes('pieces') || l.includes('pcs')) {
            grid.toggle_display(f, !!is_box_bag);
        }
        // All other fields (which belong to non-woven)
        else {
            if (is_bag || is_other_process) {
                // Hide non-woven fields for bag and other processes
                grid.toggle_display(f, false);
            } else {
                // Show non-woven fields if it is the non-woven process
                grid.toggle_display(f, true);
            }
        }
    });
    
    grid.refresh();
}
