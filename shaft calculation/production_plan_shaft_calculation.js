// ============================================================
// ERPNext 16 — Production Plan: Automated Shaft Calculation
// ============================================================
// Paste this as a Client Script for the "Production Plan" DocType
// in ERPNext > Customize > Client Script (or Setup > Client Script)
// ============================================================

frappe.ui.form.on('Production Plan', {
    refresh: function (frm) {
        var unit_val = (frm.doc.custom_unit || '').trim().toUpperCase();
        var is_jve = (unit_val === 'JVE - SHEET CUTTING MACHINE');
        var bag_making_units = [
            'L1 LEADER OYANG MACHINE',
            'L2 LEADER ZX  MACHINE',
            'VTP-L1 LEADER OYANG MACHINE',
            'VTP-L2 LEADER ZX MACHINE',
            'JVE-L3 B700 BAG MAKING MACHINE',
            'JVE-L2 B700 BAG MAKING MACHINE',
            'JVE-L1 B700 BAG MAKING MACHINE',
            'TTT- L3 - OYANG C900 BAG MAKING LINE',
            'TTT- L2 - OYANG C700 BAG MAKING LINE',
            'TTT- L1 - OYANG C700 BAG MAKING LINE'
        ];
        var is_bag_making = bag_making_units.indexOf(unit_val) !== -1;
        var is_bundle_or_packing = is_jve || is_bag_making;

        // Remove existing buttons first to avoid duplicates after unit changes
        frm.remove_custom_button(__('Calculate Shaft'));
        frm.remove_custom_button(__('Calculate Bundle'));
        frm.remove_custom_button(__('Calculate Packing'));

        if (frm.fields_dict.custom_packing) {
            setTimeout(function () {
                var new_opts = [];
                if (is_bag_making) {
                    new_opts = ['', 'Box Packing', 'Bora Packing'];
                } else {
                    var default_options = frappe.meta.get_docfield(frm.doctype, 'custom_packing').options || '';
                    new_opts = typeof default_options === 'string' ? default_options.split('\n') : default_options;
                }

                // Explicitly set the array in the dictionary to bypass Frappe glitches
                frm.fields_dict.custom_packing.df.options = new_opts;
                frm.set_df_property('custom_packing', 'options', new_opts);
                frm.refresh_field('custom_packing');
            }, 500);
        }

        // ---- Table visibility: shaft table for UNIT 1-4, bundle table for JVE/Bag Making ------
        toggle_bundle_shaft_table_visibility(frm, is_bundle_or_packing);

        if (frm.doc.docstatus === 0) {
            if (!is_bundle_or_packing && get_selected_shaft_unit(frm)) {
                var btn = frm.add_custom_button(__('Calculate Shaft'), function () {
                    calculate_shafts(frm);
                });
                if (btn) {
                    btn.addClass('btn-primary').removeClass('btn-default');
                }
            }

            if (is_jve) {
                var bbtn = frm.add_custom_button(__('Calculate Bundle'), function () {
                    calculate_bundles(frm);
                });
                if (bbtn) {
                    bbtn.addClass('btn-primary').removeClass('btn-default');
                }
            } else if (is_bag_making) {
                var pbtn = frm.add_custom_button(__('Calculate Packing'), function () {
                    calculate_packing(frm);
                });
                if (pbtn) {
                    pbtn.addClass('btn-primary').removeClass('btn-default');
                }
            }
        }
    },

    custom_unit: function (frm) {
        frm.trigger('refresh');
    },

    validate: function (frm) {
        if ((frm.doc.custom_shaft_details || []).length === 0 &&
            (frm.doc.po_items || []).length > 0 &&
            get_selected_shaft_unit(frm)) {
            calculate_shafts(frm);
        }
    }
});

// ============================================================
// HELPER: Toggle shaft vs bundle table visibility
// ============================================================
function toggle_bundle_shaft_table_visibility(frm, show_bundle) {
    // Shaft table: visible when NOT bundle
    var shaft_fields = ['custom_shaft_details'];
    // Bundle table: visible only when bundle
    var bundle_fields = ['custom_bundle_calculation'];

    shaft_fields.forEach(function (f) {
        if (frm.fields_dict[f]) {
            frm.set_df_property(f, 'hidden', show_bundle ? 1 : 0);
        }
    });
    bundle_fields.forEach(function (f) {
        if (frm.fields_dict[f]) {
            frm.set_df_property(f, 'hidden', show_bundle ? 0 : 1);
        }
    });
}

frappe.ui.form.on('Production Plan Item', {
    item_code: function (frm, cdt, cdn) {
        var row = locals[cdt][cdn];
        if (row.item_code) {
            frappe.db.get_value('Item', row.item_code, ['custom_gsm', 'custom_width', 'custom_meter_roll', 'custom_no_of_rolls'], (r) => {
                if (r) {
                    if (r.custom_gsm) {
                        frappe.model.set_value(cdt, cdn, 'custom_gsm', r.custom_gsm);
                    }
                    if (r.custom_width) {
                        // Support both variants (trailing underscore and standard)
                        frappe.model.set_value(cdt, cdn, 'custom_width_', r.custom_width);
                        frappe.model.set_value(cdt, cdn, 'custom_width', r.custom_width);
                    }
                    if (r.custom_meter_roll) {
                        // Support all variants (user-specified "custome", standard "custom", etc.)
                        frappe.model.set_value(cdt, cdn, 'custome_meterperroll', r.custom_meter_roll);
                        frappe.model.set_value(cdt, cdn, 'custom_meterperroll', r.custom_meter_roll);
                        frappe.model.set_value(cdt, cdn, 'custom_meter_roll', r.custom_meter_roll);
                        frappe.model.set_value(cdt, cdn, 'custom_meter_roll_', r.custom_meter_roll);
                        frappe.model.set_value(cdt, cdn, 'custom_meter__roll', r.custom_meter_roll);
                        frappe.model.set_value(cdt, cdn, 'meter__roll', r.custom_meter_roll);
                    }
                    if (r.custom_no_of_rolls) {
                        frappe.model.set_value(cdt, cdn, 'custom_no_of_rolls', r.custom_no_of_rolls);
                    }
                    // Inherit Unit from parent if not present
                    if (!row.custom_unit && frm.doc.custom_unit) {
                        frappe.model.set_value(cdt, cdn, 'custom_unit', frm.doc.custom_unit);
                    }
                }
            });
        }
    },
    sales_order: function (frm, cdt, cdn) {
        var row = locals[cdt][cdn];
        if (row.sales_order) {
            // Fecth all items from this Sales Order
            frappe.db.get_list('Sales Order Item', {
                filters: { parent: row.sales_order },
                fields: ['item_code', 'custom_gsm', 'custom_width', 'custom_meter_roll', 'custom_no_of_rolls', 'custom_quality', 'custom_color']
            }).then(items => {
                var plan_quality = (frm.doc.custom_quality || "").trim();
                var plan_color = (frm.doc.custom_color || "").trim();

                // Filter by Quality and Color
                var matches = items.filter(i => {
                    return (i.custom_quality || "").trim() === plan_quality && (i.custom_color || "").trim() === plan_color;
                });

                if (matches.length === 0) {
                    frappe.msgprint({
                        title: __('No Matching Items'),
                        indicator: 'red',
                        message: 'The Sales Order <b>' + row.sales_order + '</b> does not contain any items matching the Plan\'s Quality (<b>' + plan_quality + '</b>) and Color (<b>' + plan_color + '</b>).'
                    });
                    frappe.model.set_value(cdt, cdn, 'sales_order', '');
                } else if (matches.length === 1) {
                    // Single match - select it
                    var m = matches[0];
                    frappe.model.set_value(cdt, cdn, 'item_code', m.item_code);
                    // The item_code trigger will handle the rest of technical fetching
                } else {
                    // Multiple matches - show a selection prompt
                    var options = matches.map(m => m.item_code);
                    frappe.prompt([
                        {
                            label: 'Select Matching Item',
                            fieldname: 'item_code',
                            fieldtype: 'Select',
                            options: options,
                            reqd: 1
                        }
                    ], (values) => {
                        frappe.model.set_value(cdt, cdn, 'item_code', values.item_code);
                    }, 'Choose Item', 'Select');
                }
            });
        }
    },
    custom_party_code: function (frm, cdt, cdn) {
        var row = locals[cdt][cdn];
        var val = (row.custom_party_code || row.custom_paty_code || "").trim();
        if (val) {
            // 1. Try if it's the Sales Order Name itself (e.g., C26420)
            frappe.db.get_list('Sales Order', {
                filters: { name: val },
                limit: 1
            }).then(res => {
                if (res && res.length > 0) {
                    frappe.model.set_value(cdt, cdn, 'sales_order', res[0].name);
                } else {
                    // 2. Search common custom fields, but check meta first to avoid DataError
                    var fields_to_try = ['custom_paty_code', 'custom_party_code', 'custom_order_code'];
                    var meta = frappe.get_meta('Sales Order');
                    var valid_field = fields_to_try.find(f => meta.fields.some(mf => mf.fieldname === f));

                    if (valid_field) {
                        frappe.db.get_list('Sales Order', {
                            filters: [[valid_field, '=', val]],
                            fields: ['name'],
                            limit: 1
                        }).then(res2 => {
                            if (res2 && res2.length > 0) {
                                frappe.model.set_value(cdt, cdn, 'sales_order', res2[0].name);
                            }
                        });
                    }
                }
            });
        }
    }
});

// ============================================================
// GLOBAL HELPERS FOR UNIT CONVERSION
// ============================================================
window.shaft_display_unit = window.shaft_display_unit || 'inch';

window.format_shaft_width = function (inch_val, ignore_unit_str) {
    var v = parseFloat(inch_val);
    if (isNaN(v)) return inch_val;
    if (window.shaft_display_unit === 'cm') {
        var cv = v * 2.54;
        return ignore_unit_str ? cv.toFixed(2) : cv.toFixed(2) + ' cm';
    }
    if (window.shaft_display_unit === 'mm') {
        var mv = v * 25.4;
        return ignore_unit_str ? mv.toFixed(1) : mv.toFixed(1) + ' mm';
    }
    return ignore_unit_str ? v : v + '"';
};

window.parse_shaft_width_to_inch = function (display_val) {
    if (typeof display_val === 'string') {
        var str = display_val.toLowerCase();
        if (str.indexOf('cm') > -1) return parseFloat(display_val) / 2.54;
        if (str.indexOf('mm') > -1) return parseFloat(display_val) / 25.4;
    }
    var v = parseFloat(display_val);
    if (isNaN(v)) return 0;
    if (window.shaft_display_unit === 'cm') return v / 2.54;
    if (window.shaft_display_unit === 'mm') return v / 25.4;
    return v;
};

function get_shaft_units() {
    return {
        "UNIT 1": { name: "UNIT 1", min: 58, max: 63 },
        "UNIT 4": { name: "UNIT 4", min: 78, max: 90 },
        "UNIT 2": { name: "UNIT 2", min: 118, max: 126 },
        "UNIT 3": { name: "UNIT 3", min: 118, max: 126 }
    };
}

function get_selected_shaft_unit(frm) {
    var selected_unit_name = (frm.doc.custom_unit || '').trim().toUpperCase();
    return get_shaft_units()[selected_unit_name] || null;
}

// ============================================================
// MAIN FUNCTION: Orchestrates the shaft calculation
// ============================================================
function calculate_shafts(frm) {
    var all_units = get_shaft_units();

    var selected_unit_name = (frm.doc.custom_unit || '').trim();

    if (!selected_unit_name) {
        frappe.msgprint({
            title: __('Unit Not Selected'),
            indicator: 'red',
            message: 'Please select a <b>Unit</b> in Fabric Specifications before calculating shafts.'
        });
        return;
    }

    var unit = get_selected_shaft_unit(frm);
    if (!unit) {
        return;
    }

    // Group po_items by GSM + MeterPerRoll + Color
    var groups = {};
    (frm.doc.po_items || []).forEach(function (item) {
        item.custom_s_no = '';
        if (item.custom_gsm && (item.custom_width_ || item.custom_width)) {
            var gsm = flt(item.custom_gsm);
            var meter = flt(item.custome_meterperroll || item.custom_meterperroll || item.custom_meter_roll || item.custom_meter_roll_ || item.custom_meter__roll || item.meter__roll) || 0;
            var color = (item.custom_color || 'Default').trim();
            var key = gsm + '-' + meter + '-' + color;
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(item);
        }
    });

    // Generate up to 3 alternative plans, each starting from a different combo choice
    var all_plans = [];
    var seen_sigs = new Set();

    for (var plan_seed = 0; plan_seed < 3; plan_seed++) {
        var plan = generate_shaft_plan(frm, groups, unit, plan_seed);
        if (!plan || (plan.jobs.length === 0 && plan.remainders.length === 0)) continue;

        var sig = get_plan_signature(plan);
        if (!seen_sigs.has(sig)) {
            plan.sig = sig;
            all_plans.push(plan);
            seen_sigs.add(sig);
        }
        if (all_plans.length >= 3) break;
    }

    if (all_plans.length === 0) {
        frappe.msgprint({ title: __('No Items Found'), indicator: 'orange', message: 'No valid items found to calculate.' });
        return;
    }

    show_shaft_dialog(frm, groups, all_plans, unit);
}

// ============================================================
// GENERATE SHAFT PLAN
// Runs PASS 1 + PASS 2 for all groups and returns
// { jobs: [...], remainders: [...] }.
// first_skip: offset used to select the Nth-best combo on the
// very first lookahead iteration, producing a different plan.
// ============================================================
function generate_shaft_plan(frm, groups, unit, first_skip, ignore_existing) {
    var all_jobs = [];
    var approval_jobs = [];
    var final_remainders = [];
    var job_id = 1;

    var existing_jobs = [];
    if (!ignore_existing) {
        (frm.doc.custom_shaft_details || []).forEach(function (row) {
            if (!row.combination || row.combination.indexOf('❌') > -1 || (row.notes && row.notes.indexOf('Cannot Plan') > -1)) {
                return;
            }

            var parsed = parse_combo_string(row.combination);
            var job_num = parseInt(row.s_no);
            if (isNaN(job_num) || job_num <= 0) job_num = job_id;

            var row_unit = unit.name;
            if (row.notes) {
                var match = row.notes.match(/Unit:\s*(UNIT\s*\d)/i);
                if (match) row_unit = match[1].toUpperCase();
            }

            var is_approval = (row.notes && (row.notes.indexOf('⚠') > -1 || row.notes.indexOf('Below Min') > -1));

            var job_data = {
                job: job_num,
                width: flt(row.combined_width),
                shafts: flt(row.no_of_shaft),
                combo: parsed.items,
                unit: row_unit + (is_approval && row_unit.indexOf('Min') === -1 ? ' (Below Min)' : ''),
                note: row.notes || '',
                status: is_approval ? 'approval' : 'ok',
                group_key: row.gsm + '-' + row.meter__roll + '-Manual'
            };

            if (job_num >= job_id) job_id = job_num + 1;

            if (job_data.status === 'approval') approval_jobs.push(job_data);
            else all_jobs.push(job_data);

            existing_jobs.push(job_data);
        });

        // Fix group_key for existing jobs so deduction works across colors
        existing_jobs.forEach(function (ej) {
            var parts = ej.group_key.split('-');
            var gsm = parts[0];
            var meter = parts[1];
            for (var gk in groups) {
                if (gk.indexOf(gsm + '-' + meter) === 0) {
                    ej.group_key = gk;
                    break;
                }
            }
        });
    }

    for (var key in groups) {
        var group_items = groups[key];

        // Build width summary using No of Rolls
        var width_map = {};
        group_items.forEach(function (item) {
            var w = flt(item.custom_width_ || item.custom_width);
            if (!width_map[w]) {
                width_map[w] = { width: w, remaining_qty: 0, rows: [] };
            }
            width_map[w].remaining_qty += flt(item.custom_no_of_rolls);
            width_map[w].rows.push(item);
        });

        existing_jobs.forEach(function (ej) {
            if (ej.group_key === key) {
                ej.combo.forEach(function (c) {
                    if (width_map[c.width]) {
                        width_map[c.width].remaining_qty -= (ej.shafts * c.count);
                    }
                });
            }
        });

        var items = [];
        for (var wk in width_map) {
            items.push(width_map[wk]);
        }
        items.sort(function (a, b) { return b.width - a.width; });

        // ========== PASS 1: Unified full-range lookahead planning [min, max] ==========
        var safety = 0;
        var is_first_iter = true;
        while (items.some(function (i) { return i.remaining_qty > 0; }) && safety < 100) {
            safety++;
            var available = items.filter(function (i) { return i.remaining_qty > 0; });
            // Increase variety by applying the seed offset more effectively.
            // On plan_seed 1, we skip the best on the first iter of EVERY group.
            // On plan_seed 2, we use a different skip pattern.
            var offset = 0;
            if (is_first_iter) {
                if (first_skip === 1) offset = 1;
                else if (first_skip === 2) offset = Math.floor(Math.random() * 2) + 1;
            }
            is_first_iter = false;
            var best = find_best_combination_lookahead(available, unit.min, unit.max, offset);

            if (!best) break;

            var shafts = best.shafts;
            best.combo.forEach(function (c) {
                var item = items.find(function (i) { return i.width === c.width; });
                item.remaining_qty -= shafts * c.count;
            });

            var combo_label = build_combo_label(best.combo);
            var gsm_val = key.split('-')[0];

            all_jobs.push({
                job: job_id,
                width: best.total_width,
                shafts: shafts,
                max_shafts: shafts,
                unit: unit.name,
                note: 'Unit: ' + unit.name + ' | GSM: ' + gsm_val + ' | ' + combo_label,
                combo: best.combo.map(function (c) { return { width: c.width, count: c.count, extra: 0 }; }),
                group_key: key,
                status: 'ok'
            });
            job_id++;
        }

        items.filter(function (i) { return i.remaining_qty > 0; }).forEach(function (item) {
            var max_fit_count = Math.floor(unit.max / item.width);
            if (max_fit_count > 0) {
                var full_shafts = Math.floor(item.remaining_qty / max_fit_count);
                var remainder = item.remaining_qty % max_fit_count;

                // Handle full shafts (no extras)
                if (full_shafts > 0) {
                    var combo_full = [{ width: item.width, count: max_fit_count, extra: 0 }];
                    var label_full = build_combo_label(combo_full);
                    approval_jobs.push({
                        job: job_id++,
                        width: max_fit_count * item.width,
                        shafts: full_shafts,
                        max_shafts: full_shafts,
                        unit: unit.name + ' (Below Min)',
                        note: 'Max Capacity Planning | Unit: ' + unit.name + ' | GSM: ' + key.split('-')[0] + ' | ' + label_full,
                        combo: combo_full,
                        group_key: key,
                        status: 'approval'
                    });
                }

                // Handle remainder shaft (with extras)
                if (remainder > 0) {
                    var combo_rem = [
                        { width: item.width, count: remainder, extra: 0 },
                        { width: item.width, count: max_fit_count - remainder, extra: max_fit_count - remainder }
                    ];
                    var label_rem = build_combo_label(combo_rem);
                    approval_jobs.push({
                        job: job_id++,
                        width: max_fit_count * item.width,
                        shafts: 1,
                        max_shafts: 1,
                        unit: unit.name + ' (Extra Prod.)',
                        note: 'Extra Production Required | Unit: ' + unit.name + ' | GSM: ' + key.split('-')[0] + ' | ' + label_rem,
                        combo: combo_rem.filter(function (c) { return (c.count || 0) > 0; }),
                        group_key: key,
                        status: 'extra'
                    });
                }
                item.remaining_qty = 0;
            }
        });

        // ========== PASS 2: Balancing pass — pair leftovers with ordered sizes ==========
        var ordered_widths_list = [];
        group_items.forEach(function (gi) {
            var gw = flt(gi.custom_width_ || gi.custom_width);
            if (ordered_widths_list.indexOf(gw) === -1) ordered_widths_list.push(gw);
        });

        var safety2 = 0;
        while (items.some(function (i) { return i.remaining_qty > 0; }) && safety2 < 100) {
            safety2++;
            var remaining2 = items.filter(function (i) { return i.remaining_qty > 0; });

            var virtual_avail = ordered_widths_list.map(function (w) {
                var rem = remaining2.find(function (r) { return r.width === w; });
                return {
                    width: w,
                    remaining_qty: rem ? rem.remaining_qty : Math.max(1, Math.floor(unit.max / w))
                };
            });

            var bal_combos = find_fitting_combos(virtual_avail, unit.max, unit.max);
            var best_bal = null;
            var best_bal_score = -Infinity;

            bal_combos.forEach(function (combo) {
                var has_rem = combo.items.some(function (ci) {
                    return remaining2.some(function (r) { return r.width === ci.width; });
                });
                if (!has_rem) return;

                var lim_shafts = Infinity;
                combo.items.forEach(function (ci) {
                    var rem = remaining2.find(function (r) { return r.width === ci.width; });
                    if (rem) lim_shafts = Math.min(lim_shafts, Math.floor(rem.remaining_qty / ci.count));
                });
                if (!isFinite(lim_shafts) || lim_shafts <= 0) lim_shafts = 0;

                var roundup_shafts = lim_shafts + 1;
                var roundup_extra = 0;
                combo.items.forEach(function (ci) {
                    var rem = remaining2.find(function (r) { return r.width === ci.width; });
                    var have = rem ? rem.remaining_qty : 0;
                    roundup_extra += Math.max(0, roundup_shafts * ci.count - have);
                });
                var use_shafts = lim_shafts;
                var use_extra = 0;
                if (roundup_extra <= 1 && (lim_shafts === 0 || roundup_extra <= 1)) {
                    use_shafts = roundup_shafts;
                    use_extra = roundup_extra;
                } else {
                    combo.items.forEach(function (ci) {
                        var rem = remaining2.find(function (r) { return r.width === ci.width; });
                        var have = rem ? rem.remaining_qty : 0;
                        use_extra += Math.max(0, lim_shafts * ci.count - have);
                    });
                }
                if (use_shafts <= 0 || use_extra > 1) return;

                var score = -(use_extra * 10000) + (use_shafts * 10) + combo.items.length;
                if (score > best_bal_score) {
                    best_bal_score = score;
                    best_bal = {
                        combo: combo.items,
                        total_width: combo.total,
                        shafts: use_shafts,
                        total_extra: use_extra
                    };
                }
            });

            if (best_bal) {
                var extra_parts = [];
                best_bal.combo.forEach(function (ci) {
                    var rem = remaining2.find(function (r) { return r.width === ci.width; });
                    var have = rem ? rem.remaining_qty : 0;
                    var extra = Math.max(0, best_bal.shafts * ci.count - have);
                    if (extra > 0) extra_parts.push(ci.width + '" \xd7' + extra);
                });

                best_bal.combo.forEach(function (ci) {
                    var item = items.find(function (i) { return i.width === ci.width; });
                    if (item) item.remaining_qty = Math.max(0, item.remaining_qty - best_bal.shafts * ci.count);
                });

                var combo_label2 = build_combo_label(best_bal.combo);
                var gsm_val2 = key.split('-')[0];
                var extra_note2 = extra_parts.length > 0 ? ' | Extra Rolls: ' + extra_parts.join(', ') : '';
                var status2_label = extra_parts.length > 0 ? '\u26a0 Extra Production Required' : '\u26a0 Needs Approval';

                approval_jobs.push({
                    job: job_id,
                    width: best_bal.total_width,
                    shafts: best_bal.shafts,
                    max_shafts: best_bal.shafts,
                    unit: unit.name + (extra_parts.length > 0 ? ' (Extra Req.)' : ' (Approval)'),
                    note: status2_label + ' | Unit: ' + unit.name + ' | GSM: ' + gsm_val2 + extra_note2 + ' | ' + combo_label2,
                    combo: best_bal.combo.map(function (c) {
                        var extra_count = 0;
                        if (extra_parts.length > 0) {
                            // Identify extra rolls for this width
                            var rem = remaining2.find(function (r) { return r.width === c.width; });
                            var have = rem ? rem.remaining_qty : 0;
                            extra_count = Math.max(0, best_bal.shafts * c.count - have);
                        }
                        return { width: c.width, count: c.count, extra: extra_count };
                    }),
                    group_key: key,
                    status: extra_parts.length > 0 ? 'extra' : 'approval'
                });
                job_id++;
                continue;
            }

            remaining2.forEach(function (i) {
                final_remainders.push({ width: i.width, qty: i.remaining_qty, group_key: key });
                i.remaining_qty = 0;
            });
            break;
        }
    }

    var combined_jobs = all_jobs.concat(approval_jobs);
    combined_jobs.sort(function (a, b) { return a.width - b.width; });
    combined_jobs.forEach(function (j, i) { j.job = i + 1; });

    return { jobs: combined_jobs, remainders: final_remainders };
}

// ============================================================
// HELPER: Format weight to exact decimals
// ============================================================
function format_weight(val) {
    if (val === undefined || val === null || isNaN(val)) return '0.00';
    return parseFloat(val).toFixed(2);
}

function get_per_roll_weight(gsm, width, meter) {
    var val = (parseFloat(gsm) * parseFloat(width) * 0.0254 * parseFloat(meter)) / 1000;
    return parseFloat(val.toFixed(2));
}

// ============================================================
// BUILD THE EDITABLE RESULT DIALOG with Submit & Edit buttons
// ============================================================
function show_shaft_dialog(frm, groups, all_plans, unit) {
    // Keep each assembly row separate so duplicate widths map back to their original rows on submit.
    var valid_specs = {}; // { gsm: [widths] }
    var assembly_items = []; // [{source_name, unit, quality, gsm, width, meter, rolls, item_code, bom_no, color}]

    (frm.doc.po_items || []).forEach(function (item, source_idx) {
        if (item.custom_gsm && (item.custom_width_ || item.custom_width)) {
            var g = flt(item.custom_gsm);
            var w = flt(item.custom_width_ || item.custom_width);
            var m = flt(item.custome_meterperroll || item.custom_meterperroll || item.custom_meter_roll || item.custom_meter_roll_ || item.custom_meter__roll || item.meter__roll) || 0;
            var rolls = flt(item.custom_no_of_rolls || item.no_of_rolls) || 0;
            var u = (item.custom_unit || frm.doc.custom_unit || '').trim();
            var q = (item.custom_quality || '').trim();

            if (!valid_specs[g]) valid_specs[g] = [];
            if (valid_specs[g].indexOf(w) === -1) valid_specs[g].push(w);

            assembly_items.push({
                source_name: item.name || '',
                source_idx: source_idx,
                unit: u, quality: q,
                gsm: g, width: w, meter: m, rolls: rolls,
                item_code: item.item_code || '', bom_no: item.bom_no || '',
                color: item.custom_color || ''
            });
        }
    });

    assembly_items.sort(function (a, b) { return b.gsm - a.gsm || b.width - a.width || a.source_idx - b.source_idx; });

    var summary_html = '<div style="margin-bottom: 15px; padding: 10px; background-color: #f8f9fa; border: 1px solid #d1d8dd; border-radius: 4px;">';
    summary_html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">';
    summary_html += '<b style="display:block;">Assembly Item Details:</b>';
    summary_html += '<div>';
    summary_html += '<button class="btn btn-xs btn-default edit-all-meters-btn" style="margin-right:5px;">Edit Meters</button>';
    summary_html += '<button class="btn btn-xs btn-default edit-all-rolls-btn" style="margin-right:5px;">Edit Rolls</button>';
    summary_html += '<button class="btn btn-xs btn-primary add-planning-row-btn">Add Row</button>';
    summary_html += '</div></div>';
    summary_html += '<table class="table table-bordered table-condensed assembly-summary-table" style="background:#fff; font-size:11px; margin-bottom:0;">';
    summary_html += '<thead><tr style="background:#f1f1f1;"><th>GSM</th><th class="width-header">Width (")</th><th>Meter/Roll</th><th>No of Rolls</th><th>Weight/Roll</th><th style="text-align:center;">Balance</th><th>Action</th></tr></thead><tbody>';

    assembly_items.forEach(function (item, idx) {
        var w_val = get_per_roll_weight(item.gsm, item.width, item.meter);
        summary_html += '<tr data-idx="' + idx + '" data-source-name="' + item.source_name + '" data-quality="' + item.quality + '" data-unit="' + item.unit + '" data-item-code="' + item.item_code + '" data-bom-no="' + item.bom_no + '" data-color="' + item.color + '">';
        summary_html += '<td>' + item.gsm + '</td><td class="display-width-cell" data-original-width="' + item.width + '">' + window.format_shaft_width(item.width) + '</td>';
        summary_html += '<td><input type="number" class="form-control input-xs summary-meter-input" value="' + item.meter + '" disabled style="width:60px; height:20px; padding:2px;"></td>';
        summary_html += '<td><input type="number" class="form-control input-xs summary-rolls-input" value="' + item.rolls + '" disabled style="width:50px; height:20px; padding:2px;"></td>';
        summary_html += '<td class="summary-weight-cell">' + format_weight(w_val) + '</td>';
        summary_html += '<td class="balance-cell" data-gsm="' + item.gsm + '" data-width="' + item.width + '" data-meter="' + item.meter + '" data-initial="' + item.rolls + '" style="text-align:center; font-weight:bold; color: #d9534f;">' + item.rolls + '</td>';
        summary_html += '<td style="text-align:center;"><button class="btn btn-xs btn-danger remove-summary-row-btn" style="padding:0 4px;">&times;</button></td>';
        summary_html += '</tr>';
    });
    summary_html += '</tbody></table></div>';

    // ---- Plan navigation bar (← Plan N of M →) ----
    var plan_nav_html = '<div id="plan-nav-bar" style="display:flex; align-items:center; gap:10px; margin-bottom:10px; padding:8px 12px; background:#e8f0fe; border:1px solid #c5d4f7; border-radius:6px;">';
    plan_nav_html += '<span style="font-weight:bold; color:#3d6ae8;">Auto-Generated Plans:</span>';
    plan_nav_html += '<button id="plan-prev-btn" class="btn btn-xs btn-default" style="min-width:28px;">&#8592;</button>';
    plan_nav_html += '<span id="plan-counter" style="font-weight:bold; min-width:70px; text-align:center;">Plan 1 of ' + all_plans.length + '</span>';
    plan_nav_html += '<button id="plan-next-btn" class="btn btn-xs btn-default" style="min-width:28px;">&#8594;</button>';
    plan_nav_html += '<span style="font-size:11px; color:#666; margin-left:6px;">Navigate through alternatives, then Submit the plan you prefer.</span>';
    plan_nav_html += '</div>';

    // Build editable HTML table shell (tbody will be rendered dynamically)
    var msg = summary_html + plan_nav_html;
    // We add a wrapper with styling to allow smooth horizontal stretch up to 95vw, while avoiding internal horizontal scrolls when possible
    msg += '<div style="overflow-x: auto;">';
    msg += '<table class="table table-bordered table-condensed shaft-result-table" ';
    msg += 'data-min="' + unit.min + '" data-max="' + unit.max + '" data-unit="' + unit.name + '" ';
    msg += 'style="margin-top:5px; width:100%;">';
    msg += '<thead><tr>';
    msg += '<th style="white-space:nowrap; width:30px;">Job</th>';
    msg += '<th style="white-space:nowrap; width:50px;">GSM</th>';
    msg += '<th style="min-width:260px;" class="combination-header">Combination (")</th>';
    msg += '<th style="white-space:nowrap; width:80px;" class="total-width-header">Total Width (")</th>';
    msg += '<th style="white-space:nowrap; width:80px;">Meter/Roll</th>';
    msg += '<th style="white-space:nowrap; width:60px;">Shafts</th>';
    msg += '<th style="white-space:nowrap; width:80px;">No of Rolls</th>';
    msg += '<th style="min-width:180px;">Net Weight</th>';
    msg += '<th style="white-space:nowrap; width:90px;">Total Weight</th>';
    msg += '<th style="white-space:nowrap; width:100px;">Actions</th>';
    msg += '</tr></thead><tbody id="shaft-plan-tbody"></tbody>';
    msg += '<tfoot style="background:#f9f9f9; font-weight:bold;"><tr>';
    msg += '<td colspan="7" style="text-align:right; vertical-align:middle;">CONSOLIDATED TOTAL:</td>';
    msg += '<td id="consolidated-net-weight-footer" style="text-align:center; vertical-align:middle;">0.00</td>';
    msg += '<td id="consolidated-total-weight-footer" style="text-align:center; vertical-align:middle;">0.00</td>';
    msg += '<td></td></tr></tfoot></table>';
    msg += '</div>';

    // ---- Helper: build tbody HTML rows for a given plan ----
    function build_plan_rows(plan) {
        var rows_html = '';
        var all_jobs = plan.jobs;
        var remainders = plan.remainders;

        all_jobs.forEach(function (d, idx) {
            var combo_label = build_combo_label(d.combo);
            var key_parts = d.group_key.split('-');
            var gsm_val = key_parts[0] || '';
            var meter_val = key_parts[1] || '';

            var bg_color = "";
            var has_filler = d.combo.some(function (it) { return it.extra > 0; });

            if (has_filler || d.status === 'extra') {
                bg_color = "#f8d7da"; // Red for Extra Production
                d.status = 'extra';   // Sync status
            } else if (d.status === 'approval') {
                bg_color = "#fff3cd"; // Yellow for Below Min
            }

            var bg = bg_color ? ' style="background:' + bg_color + ' !important;"' : '';
            rows_html += '<tr data-idx="' + idx + '"' + bg + ' data-status="' + (d.status || 'ok') + '" data-group-key="' + d.group_key + '">';
            rows_html += '<td>' + d.job + (d.status === 'approval' || d.status === 'extra' ? ' \u26a0' : '') + '</td>';
            rows_html += '<td>' + gsm_val + '</td>';

            // Editable Combination Input (Initially Disabled)
            rows_html += '<td>';
            rows_html += '<div class="combo-display" style="padding: 2px 5px; font-size: 12px; border: 1px solid transparent;">' + combo_label + '</div>';
            rows_html += '<input type="text" class="form-control input-xs combination-input" ';
            rows_html += 'data-idx="' + idx + '" ';
            rows_html += "value='" + build_combo_label(d.combo, true).replace(/'/g, "&apos;") + "' ";
            rows_html += 'disabled style="width:100%; min-width:240px; font-size:12px; display:none;">';
            rows_html += '</td>';

            rows_html += '<td class="total-width-cell" data-idx="' + idx + '">' + window.format_shaft_width(d.width) + '</td>';
            rows_html += '<td>' + meter_val + '</td>';

            // Editable Shaft Count Input (Initially Disabled)
            rows_html += '<td><input type="number" class="form-control input-sm shaft-input" ';
            rows_html += 'data-idx="' + idx + '" ';
            rows_html += 'value="' + d.shafts + '" ';
            rows_html += 'disabled ';
            rows_html += 'style="width:70px; text-align:center;"></td>';

            var pieces = 0;
            d.combo.forEach(function (c) { pieces += c.count; });
            var rolls = d.shafts * pieces;
            rows_html += '<td class="rolls-cell" data-idx="' + idx + '" style="text-align:center;">' + rolls + '</td>';

            var net_weights = [];
            var total_net = 0;
            d.combo.forEach(function (c) {
                var w_val_exact = get_per_roll_weight(gsm_val, c.width, meter_val);
                for (var k = 0; k < c.count; k++) {
                    net_weights.push(format_weight(w_val_exact));
                    total_net += w_val_exact;
                }
            });
            var total_weight = total_net * d.shafts;
            var net_weight_str = net_weights.length > 0 ? (net_weights.join(' + ') + '<br>= ' + format_weight(total_net)) : '0.00';

            rows_html += '<td class="net-weight-cell" style="font-size:11px;">' + net_weight_str + '</td>';
            rows_html += '<td class="total-weight-cell" style="font-weight:bold;text-align:right;">' + format_weight(total_weight) + '</td>';

            // Actions: Edit + Delete
            rows_html += '<td>';
            rows_html += '<button class="btn btn-xs btn-default shaft-edit-btn" data-idx="' + idx + '" style="margin-right:5px;">Edit</button>';
            rows_html += '<button class="btn btn-xs btn-danger shaft-delete-btn" data-idx="' + idx + '">\u2715</button>';
            rows_html += '</td>';
            rows_html += '</tr>';
        });

        if (remainders.length > 0) {
            remainders.forEach(function (r, r_idx) {
                var r_parts = r.group_key.split('-');
                var r_gsm = r_parts[0] || '';
                var r_meter = r_parts[1] || '';
                var combo_label = window.format_shaft_width(r.width) + ' × ' + r.qty + ' roll(s)';

                rows_html += '<tr style="background:#f8d7da;" data-remainder="' + r_idx + '" data-group-key="' + r.group_key + '">';
                rows_html += '<td>\u274c</td>';
                rows_html += '<td>' + r_gsm + '</td>';

                // Editable Combination Input (Initially Disabled)
                rows_html += '<td>';
                rows_html += '<div class="combo-display" style="padding: 2px 5px; font-size: 12px; border: 1px solid transparent;">' + combo_label + '</div>';
                rows_html += '<input type="text" class="form-control input-xs combination-input" ';
                rows_html += 'data-remainder-idx="' + r_idx + '" ';
                rows_html += "value='" + window.format_shaft_width(r.width) + " x " + r.qty + "' ";
                rows_html += 'disabled style="width:100%; min-width:240px; font-size:12px; display:none;">';
                rows_html += '</td>';

                rows_html += '<td class="total-width-cell">' + window.format_shaft_width(r.width) + '</td>';
                rows_html += '<td>' + r_meter + '</td>';

                // Editable Shaft Count Input (Initially Disabled)
                rows_html += '<td><input type="number" class="form-control input-sm shaft-input" ';
                rows_html += 'value="' + r.qty + '" ';
                rows_html += 'disabled ';
                rows_html += 'style="width:70px; text-align:center;"></td>';

                rows_html += '<td class="rolls-cell" style="text-align:center;">' + r.qty + '</td>';

                var w_val_exact = get_per_roll_weight(r_gsm, r.width, r_meter);
                var total_weight = w_val_exact * r.qty;
                rows_html += '<td class="net-weight-cell" style="font-size:11px;">' + format_weight(w_val_exact) + '</td>';
                rows_html += '<td class="total-weight-cell" style="font-weight:bold;text-align:right;">' + format_weight(total_weight) + '</td>';

                // Actions: Edit + Delete
                rows_html += '<td>';
                rows_html += '<button class="btn btn-xs btn-default shaft-edit-btn" style="margin-right:5px;">Edit</button>';
                rows_html += '<button class="btn btn-xs btn-danger shaft-delete-btn">\u2715</button>';
                rows_html += '</td>';
                rows_html += '</tr>';
            });
        }
        return rows_html;
    }

    // Add Row Button at the bottom of the table
    msg += '<div style="margin-top: 5px; margin-bottom: 10px;">';
    msg += '<button class="btn btn-sm btn-primary add-job-btn">' + __('Add Row') + '</button>';
    msg += '</div>';

    // Legend & Footer
    msg += '<div style="margin-top:10px; font-size:12px;">';
    msg += '<span style="display:inline-block;width:12px;height:12px;background:#fff;border:1px solid #ddd;margin-right:4px;"></span> Standard Job &nbsp;&nbsp;';
    msg += '<span style="display:inline-block;width:12px;height:12px;background:#fff3cd;border:1px solid #ddd;margin-right:4px;"></span> Below Min / Out of Range &nbsp;&nbsp;';
    msg += '<span style="display:inline-block;width:12px;height:12px;background:#f8d7da;border:1px solid #ddd;margin-right:4px;"></span> Extra Production Required / Cannot Plan';
    msg += '</div>';
    msg += '<div style="margin-top:5px; font-size:11px; color:#888;">';
    msg += '<i>You can edit any row or add new ones. GSM and Widths are validated against PO items.</i>';
    msg += '</div>';

    // Track which plan is currently shown
    var current_plan_idx = 0;

    var d = new frappe.ui.Dialog({
        title: __('Shaft Calculation Result'),
        size: 'extra-large',
        fields: [{ fieldtype: 'HTML', fieldname: 'result_html', options: msg }],
        primary_action_label: __('Submit'),
        primary_action: function () {
            // Collect the final state of Assembly Items from the top table
            var final_assembly_items = [];
            d.$wrapper.find('.assembly-summary-table tbody tr').each(function () {
                var row = $(this);
                var is_new = row.hasClass('new-planned-row');
                var unit_val = row.attr('data-unit') || (unit.name || "");
                var quality = row.attr('data-quality') || "";
                var gsm = is_new ? parseFloat(row.find('.new-gsm').val()) : parseFloat(row.find('td:eq(0)').text());
                var width = is_new ? window.parse_shaft_width_to_inch(row.find('.new-width').val()) : parseFloat(row.find('td:eq(1)').attr('data-original-width') || row.find('td:eq(1)').text());
                var meter = parseFloat(row.find('.summary-meter-input').val()) || 0;
                var rolls = is_new ? parseFloat(row.find('.new-rolls').val()) : parseFloat(row.find('.summary-rolls-input').val()) || 0;
                var item_code = row.attr('data-item-code') || "";
                var bom_no = row.attr('data-bom-no') || "";
                var color = row.attr('data-color') || '';

                if (gsm > 0 && width > 0 && rolls >= 0) {
                    final_assembly_items.push({
                        gsm: gsm,
                        width: width,
                        meter: meter,
                        rolls: rolls,
                        requested_rolls: rolls,
                        source_name: (row.attr('data-source-name') || "").trim(),
                        item_code: (row.attr('data-item-code') || "").trim(),
                        bom_no: (row.attr('data-bom-no') || "").trim(),
                        color: (row.attr('data-color') || "").trim(),
                        quality: (row.attr('data-quality') || "").trim(),
                        unit: (row.attr('data-unit') || unit_val).trim()
                    });
                }
            });

            var edited_jobs = [];
            var table = d.$wrapper.find('.shaft-result-table');
            var unit_min = parseFloat(table.attr('data-min')) || 0;
            var unit_max = parseFloat(table.attr('data-max')) || 0;
            var unit_name = table.attr('data-unit') || '';

            table.find('tbody tr').not('.shaft-deleted').each(function () {
                var row_el = $(this);
                var job_cell_text = row_el.find('td:first').text().trim();
                if (job_cell_text.indexOf('\u274c') > -1) return;
                var status = row_el.attr('data-status');
                if (status === 'extra' && !row_el.hasClass('user-confirmed')) return;

                var gsm_val = row_el.find('.gsm-input').length ? row_el.find('.gsm-input').val() : row_el.find('td:eq(1)').text();
                var combo_str = row_el.find('.combination-input').val();
                if (!combo_str || combo_str === "") {
                    // if disabled/locked, take from display
                    combo_str = row_el.find('.combo-display').text().trim();
                }
                var meter_val = row_el.find('.meter-input').length ? row_el.find('.meter-input').val() : row_el.find('td:eq(4)').text();
                var shafts_val = parseInt(row_el.find('.shaft-input').val()) || 0;
                var job_id_val = parseInt(job_cell_text);

                var parsed = parse_combo_string(combo_str);
                var new_width = parsed.total_width;
                var total_weight_val = parseFloat(row_el.find('.total-weight-cell').text()) || 0;
                var net_ws_html = row_el.find('.net-weight-cell').html() || '';
                var full_net_weight_str = net_ws_html.replace(/<br\s*\/?>/gi, ' ');

                var job_data = {
                    job: job_id_val,
                    width: new_width,
                    shafts: shafts_val,
                    combo: parsed.items,
                    unit: unit_name,
                    status: 'ok',
                    gsm: flt(gsm_val),
                    meter: flt(meter_val),
                    group_key: row_el.attr('data-group-key') || (gsm_val + '-' + meter_val + '-Manual'),
                    net_weight: full_net_weight_str,
                    total_weight: total_weight_val
                };

                if (new_width < unit_min || new_width > unit_max) {
                    job_data.status = 'approval';
                    job_data.note = '\u26a0 Out of Range | Unit: ' + unit_name + ' | GSM: ' + gsm_val + ' | ' + build_combo_label(parsed.items);
                } else {
                    job_data.note = 'Unit: ' + unit_name + ' | GSM: ' + gsm_val + ' | ' + build_combo_label(parsed.items);
                }

                edited_jobs.push(job_data);
            });

            sync_assembly_rolls_from_jobs(final_assembly_items, edited_jobs);
            apply_shaft_results(frm, final_assembly_items, edited_jobs);
            d.hide();
            frappe.show_alert({ message: __('Production Plan updated successfully!'), indicator: 'green' }, 5);
        },
        secondary_action_label: __('Cancel'),
        secondary_action: function () { d.hide(); }
    });

    d.$wrapper.find('.modal-dialog').css('max-width', '95vw');
    d.$wrapper.find('.modal-dialog').css('width', 'max-content');
    d.$wrapper.find('.modal-dialog').css('min-width', '900px');

    d.show();

    var title_el = d.$wrapper.find('.modal-title');
    if (title_el.length) {
        title_el.css({ 'display': 'flex', 'justify-content': 'space-between', 'align-items': 'center', 'width': '100%' });
        var btn_html = '<div style="margin-right: 20px;">' +
            '<button class="btn btn-xs btn-info change-inch-btn" style="margin-right:5px;">Change Inch</button>' +
            '<button class="btn btn-xs btn-info change-cm-btn" style="margin-right:5px;">Change CM</button>' +
            '<button class="btn btn-xs btn-info change-mm-btn">Change MM</button>' +
            '</div>';
        if (title_el.find('.change-mm-btn').length === 0) {
            title_el.html('<span>' + title_el.html() + '</span>' + btn_html);
        }
    }

    // ---- Render the first plan into the tbody ----
    function render_plan(idx) {
        var plan = all_plans[idx];
        d.$wrapper.find('#shaft-plan-tbody').html(build_plan_rows(plan));
        d.$wrapper.find('#plan-counter').text('Plan ' + (idx + 1) + ' of ' + all_plans.length);
        d.$wrapper.find('#plan-prev-btn').prop('disabled', idx === 0);
        d.$wrapper.find('#plan-next-btn').prop('disabled', idx === all_plans.length - 1);
        update_consolidated_totals();
    }

    function update_consolidated_totals() {
        var total_net = 0;
        var total_gross = 0;
        d.$wrapper.find('.shaft-result-table tbody tr').not('.shaft-deleted').each(function () {
            var row = $(this);
            // Net Weight cell contains "individual weights <br>= total_net_for_row"
            var net_ws_html = row.find('.net-weight-cell').html() || '';
            if (net_ws_html.indexOf('=') > -1) {
                var parts = net_ws_html.split('=');
                var row_net = parseFloat(parts[parts.length - 1].trim()) || 0;
                total_net += row_net;
            } else {
                total_net += parseFloat(row.find('.net-weight-cell').text()) || 0;
            }
            total_gross += parseFloat(row.find('.total-weight-cell').text()) || 0;
        });
        d.$wrapper.find('#consolidated-net-weight-footer').text(format_weight(total_net));
        d.$wrapper.find('#consolidated-total-weight-footer').text(format_weight(total_gross));
        update_balance_table();
    }

    function update_balance_table() {
        var balances = {};
        // 1. Group requirements from summary table cells (pooling identical specs)
        d.$wrapper.find('.balance-cell').each(function () {
            var cell = $(this);
            var key = parseFloat(cell.attr('data-gsm')) + '-' + parseFloat(cell.attr('data-width')) + '-' + parseFloat(cell.attr('data-meter'));
            if (!balances[key]) {
                balances[key] = { rem: 0, els: [] };
            }
            balances[key].rem += (parseFloat(cell.attr('data-initial')) || 0);
            balances[key].els.push(cell);
        });

        // 2. Loop through all active shaft plan jobs to subtract planned rolls from the pools
        d.$wrapper.find('.shaft-result-table tbody tr').not('.shaft-deleted').each(function () {
            var row = $(this);
            var job_cell_text = row.find('td:first').text().trim();
            // Skip unedited remainder rows (❌)
            if (job_cell_text.indexOf('\u274c') > -1) return;

            var gsm_val = row.find('.gsm-input').length ? row.find('.gsm-input').val() : row.find('td:eq(1)').text();
            var meter_val = row.find('.meter-input').length ? row.find('.meter-input').val() : row.find('td:eq(4)').text();
            var shafts_val = parseFloat(row.find('.shaft-input').val()) || 0;
            var combo_str = row.find('.combination-input').length ? row.find('.combination-input').val() : row.find('.combo-display').text();

            var parsed = parse_combo_string(combo_str);
            parsed.items.forEach(function (item) {
                if (item.extra) return; // Ignore filler rolls for balance calculation

                var key = parseFloat(gsm_val) + '-' + parseFloat(item.width) + '-' + parseFloat(meter_val);
                if (balances[key]) {
                    balances[key].rem -= (shafts_val * item.count);
                }
            });
        });

        // 3. Update UI for all cells in each spec-pool
        for (var k in balances) {
            var b = balances[k];
            var display_val = b.rem % 1 === 0 ? b.rem : b.rem.toFixed(1);
            var color = '#d9534f'; // Default red
            if (b.rem === 0) color = '#5cb85c'; // Green
            else if (b.rem < 0) color = '#f0ad4e'; // Orange

            b.els.forEach(function (cell) {
                cell.text(display_val).css('color', color);
            });
        }
    }

    function get_planned_roll_key(gsm, width, meter) {
        var g = Math.round(flt(gsm) * 1000) / 1000;
        var w = Math.round(flt(width) * 1000) / 1000;
        var m = Math.round(flt(meter) * 1000) / 1000;
        return g + '-' + w + '-' + m;
    }

    function sync_assembly_rolls_from_jobs(final_assembly_items, edited_jobs) {
        var planned_rolls = {};
        var assembly_items_by_key = {};

        edited_jobs.forEach(function (job) {
            var gsm = flt(job.gsm || (job.group_key || '').split('-')[0]);
            var meter = flt(job.meter || (job.group_key || '').split('-')[1]);
            var shafts = flt(job.shafts);

            (job.combo || []).forEach(function (item) {
                var production_count = flt(item.count) - flt(item.extra || 0);
                if (production_count <= 0) return;

                var key = get_planned_roll_key(gsm, item.width, meter);
                planned_rolls[key] = (planned_rolls[key] || 0) + (shafts * production_count);
            });
        });

        final_assembly_items.forEach(function (item) {
            var key = get_planned_roll_key(item.gsm, item.width, item.meter);
            if (!assembly_items_by_key[key]) assembly_items_by_key[key] = [];
            assembly_items_by_key[key].push(item);
        });

        for (var key in assembly_items_by_key) {
            var remaining = planned_rolls[key] || 0;
            var items = assembly_items_by_key[key];

            items.forEach(function (item, idx) {
                var is_last = idx === items.length - 1;
                var requested_rolls = flt(item.requested_rolls);
                var assigned_rolls = is_last ? remaining : Math.min(remaining, requested_rolls);

                item.rolls = assigned_rolls > 0 ? assigned_rolls : 0;
                remaining -= item.rolls;
            });
        }
    }

    // Interactive Planning Handlers
    function trigger_plan_recalc() {
        var new_groups = {};
        d.$wrapper.find('.assembly-summary-table tbody tr').each(function () {
            var row = $(this);
            var is_new = row.hasClass('new-planned-row');
            var gsm = is_new ? parseFloat(row.find('.new-gsm').val()) : parseFloat(row.find('td:eq(0)').text());
            var width = is_new ? window.parse_shaft_width_to_inch(row.find('.new-width').val()) : parseFloat(row.find('td:eq(1)').attr('data-original-width'));
            var meter = parseFloat(row.find('.summary-meter-input').val()) || 0;
            var rolls = is_new ? parseFloat(row.find('.new-rolls').val()) : parseFloat(row.find('.summary-rolls-input').val()) || 0;

            if (gsm > 0 && width > 0 && rolls > 0) {
                var key = gsm + '-' + meter + '-Manual';
                if (!new_groups[key]) new_groups[key] = [];
                new_groups[key].push({
                    custom_gsm: gsm,
                    custom_width_: width, custom_width: width,
                    custom_meter_roll_: meter, custom_meter__roll: meter, meter__roll: meter,
                    custom_no_of_rolls: rolls,
                    // Preserve Metadata
                    item_code: (row.attr('data-item-code') || "").trim(),
                    bom_no: (row.attr('data-bom-no') || "").trim(),
                    custom_quality: (row.attr('data-quality') || "").trim(),
                    custom_color: (row.attr('data-color') || "").trim(),
                    custom_unit: (row.attr('data-unit') || "").trim()
                });
            }
        });

        all_plans = [];
        var seen_sigs = new Set();
        for (var plan_seed = 0; plan_seed < 3; plan_seed++) {
            // PASS ignore_existing = true to prevent reading old data from the form
            var plan = generate_shaft_plan(frm, new_groups, unit, plan_seed, true);
            if (!plan || (plan.jobs.length === 0 && plan.remainders.length === 0)) continue;

            var sig = get_plan_signature(plan);
            if (!seen_sigs.has(sig)) {
                plan.sig = sig;
                all_plans.push(plan);
                seen_sigs.add(sig);
            }
            if (all_plans.length >= 3) break;
        }
        current_plan_idx = 0;
        render_plan(0);
    }

    d.$wrapper.on('click', '.edit-all-meters-btn', function () {
        var btn = $(this);
        var inputs = d.$wrapper.find('.summary-meter-input');
        if (btn.text() === 'Edit Meters') {
            inputs.prop('disabled', false).css('border-color', '#3d6ae8');
            btn.text('Lock Meters').addClass('btn-primary');
        } else {
            inputs.prop('disabled', true).css('border-color', '');
            btn.text('Edit Meters').removeClass('btn-primary');
            trigger_plan_recalc();
        }
    });

    d.$wrapper.on('click', '.edit-all-rolls-btn', function () {
        var btn = $(this);
        var inputs = d.$wrapper.find('.summary-rolls-input');
        if (btn.text().trim() === 'Edit Rolls') {
            inputs.prop('disabled', false).css('border-color', '#3d6ae8');
            btn.text('Lock Rolls').addClass('btn-primary');
        } else {
            inputs.prop('disabled', true).css('border-color', '');
            btn.text('Edit Rolls').removeClass('btn-primary');
            trigger_plan_recalc();
        }
    });

    d.$wrapper.on('change', '.summary-meter-input, .summary-rolls-input, .new-gsm, .new-width, .new-rolls', function () {
        var row = $(this).closest('tr');
        var is_new = row.hasClass('new-planned-row');
        var gsm = is_new ? parseFloat(row.find('.new-gsm').val()) : parseFloat(row.find('td:eq(0)').text());
        var width = is_new ? window.parse_shaft_width_to_inch(row.find('.new-width').val()) : parseFloat(row.find('td:eq(1)').attr('data-original-width'));
        var meter = parseFloat(row.find('.summary-meter-input').val()) || 0;

        // Update Weight cell
        var w_val = get_per_roll_weight(gsm, width, meter);
        row.find('.summary-weight-cell').text(format_weight(w_val));

        // Update Balance cell initial data if rolls changed
        var rolls = is_new ? parseFloat(row.find('.new-rolls').val()) : parseFloat(row.find('.summary-rolls-input').val()) || 0;
        var balance_cell = row.find('.balance-cell');
        if (balance_cell.length) {
            balance_cell.attr('data-initial', rolls);
            balance_cell.attr('data-gsm', gsm);
            balance_cell.attr('data-width', width);
            balance_cell.attr('data-meter', meter);
        }

        // If new row, generate Code/BOM
        if (is_new && gsm > 0 && width > 0) {
            var icode = generate_item_code_logic(gsm, width);
            var bno = generate_bom_no_logic(icode);
            row.attr('data-item-code', icode);
            row.attr('data-bom-no', bno);
        }

        if (!is_new) trigger_plan_recalc();
    });


    d.$wrapper.on('click', '.add-planning-row-btn', function () {
        var btn = $(this);
        var table_body = d.$wrapper.find('.assembly-summary-table tbody');

        if (btn.text().trim() === 'Add Row') {
            // Inherit Quality and Color from existing rows if available
            var first_row = table_body.find('tr').not('.new-planned-row').first();
            var inherit_quality = first_row.attr('data-quality') || "";
            var inherit_color = first_row.attr('data-color') || "";

            var new_row = '<tr class="new-planned-row" style="background:#e7f3ff;" data-quality="' + inherit_quality + '" data-color="' + inherit_color + '" data-unit="' + (unit.name || "") + '">';
            new_row += '<td><input type="number" class="form-control input-xs new-gsm" style="width:50px; height:20px;"></td>';
            new_row += '<td><input type="number" class="form-control input-xs new-width" style="width:50px; height:20px;"></td>';
            new_row += '<td><input type="number" class="form-control input-xs summary-meter-input" value="1000" style="width:60px; height:20px;"></td>';
            new_row += '<td><input type="number" class="form-control input-xs new-rolls" value="1" style="width:50px; height:20px;"></td>';
            new_row += '<td class="summary-weight-cell">0.00</td>';
            new_row += '<td class="balance-cell" style="text-align:center;">-</td>';
            new_row += '<td style="text-align:center;"><button class="btn btn-xs btn-danger remove-summary-row-btn">&times;</button></td>';
            new_row += '</tr>';
            table_body.append(new_row);

            // Toggle button state
            btn.text('Lock Row').removeClass('btn-primary').addClass('btn-warning');
        } else {
            // Lock all currently unlocked "new" rows
            var new_rows = table_body.find('tr.new-planned-row');
            if (new_rows.length > 0) {
                new_rows.each(function () {
                    var row = $(this);
                    // Convert inputs to plain text/disabled inputs
                    row.find('input').prop('disabled', true).css({
                        'border': 'none',
                        'background': 'transparent',
                        'padding': '0',
                        'height': 'auto',
                        'box-shadow': 'none'
                    });
                    row.css('background-color', ''); // Reset background
                    row.removeClass('new-planned-row'); // Now it acts as a regular row for recalc

                    // Explicitly set text values for recalc to pick up if it uses .text()
                    var gsm_val = row.find('.new-gsm').val();
                    var width_val = row.find('.new-width').val();
                    var rolls_val = row.find('.new-rolls').val();
                    var meter_val = row.find('.summary-meter-input').val();

                    row.find('td:eq(0)').html(gsm_val);
                    var target_width_inch = window.parse_shaft_width_to_inch(width_val);
                    row.find('td:eq(1)').attr('data-original-width', target_width_inch).html(window.format_shaft_width(target_width_inch));

                    // Convert rolls to summary-rolls-input structure so Edit Rolls works on it
                    row.find('td:eq(3)').html('<input type="number" class="form-control input-xs summary-rolls-input" value="' + rolls_val + '" disabled style="width:50px; height:20px; padding:2px; border:none; background:transparent;">');
                });
            }

            // Restore button state
            btn.text('Add Row').removeClass('btn-warning').addClass('btn-primary');

            // Trigger re-calculation
            trigger_plan_recalc();
        }
    });

    d.$wrapper.on('click', '.remove-summary-row-btn', function () {
        $(this).closest('tr').remove();
        trigger_plan_recalc();
    });

    render_plan(0);

    // Plan navigation handlers
    d.$wrapper.on('click', '#plan-prev-btn', function () {
        if (current_plan_idx > 0) { current_plan_idx--; render_plan(current_plan_idx); }
    });
    d.$wrapper.on('click', '#plan-next-btn', function () {
        if (current_plan_idx < all_plans.length - 1) { current_plan_idx++; render_plan(current_plan_idx); }
    });

    // Helper: Validates a row and applies color coding
    function validate_row(row) {
        var gsm_input = row.find('.gsm-input');
        var combo_input = row.find('.combination-input');

        var gsm_val = flt(gsm_input.length ? gsm_input.val() : row.find('td:eq(1)').text());
        var meter_input = row.find('.meter-input');
        var meter_val = flt(meter_input.length ? meter_input.val() : row.find('td:eq(4)').text());
        var shaft_input = row.find('.shaft-input');
        var shafts_val = parseFloat(shaft_input.val()) || 0;

        var combo_str = combo_input.val();
        var parsed = parse_combo_string(combo_str);

        var net_weights = [];
        var total_net = 0;
        parsed.items.forEach(function (c) {
            var w_val_exact = get_per_roll_weight(gsm_val, c.width, meter_val);
            for (var k = 0; k < c.count; k++) {
                net_weights.push(format_weight(w_val_exact));
                total_net += w_val_exact;
            }
        });
        var total_weight = total_net * shafts_val;
        var net_weight_str = net_weights.length > 0 ? (net_weights.join(' + ') + '<br>= ' + format_weight(total_net)) : '0.00';

        row.find('.net-weight-cell').html(net_weight_str);
        row.find('.total-weight-cell').text(format_weight(total_weight));

        var total_pieces = net_weights.length;
        var total_rolls = total_pieces * shafts_val;
        row.find('.rolls-cell').text(total_rolls);

        // Update display label in real-time (unless currently focused/editing)
        var display_el = row.find('.combo-display');
        var input_el = row.find('.combination-input');
        if (display_el.is(':visible') || !input_el.is(':focus')) {
            display_el.html(build_combo_label(parsed.items, false));
        }

        // GSM Validation
        if (gsm_input.length) {
            if (valid_specs[gsm_val] === undefined) {
                gsm_input.css('color', 'red').css('font-weight', 'bold');
            } else {
                gsm_input.css('color', '').css('font-weight', '');
            }
        }

        // Combination Validation (Individual widths)
        var allowed_widths = valid_specs[gsm_val] || [];
        var all_widths_ok = true;
        parsed.items.forEach(function (item) {
            if (allowed_widths.indexOf(item.width) === -1) {
                all_widths_ok = false;
            }
        });

        if (!all_widths_ok) {
            combo_input.css('color', 'red').css('font-weight', 'bold');
        } else {
            combo_input.css('color', '').css('font-weight', '');
        }

        // Total Width update and range validation
        var table = row.closest('table');
        var min_w = flt(table.attr('data-min'));
        var max_w = flt(table.attr('data-max'));

        row.find('.total-width-cell').text(window.format_shaft_width(parsed.total_width));

        var job_cell = row.find('td:first');
        // Handle case where cell might just be ❌
        var job_text = job_cell.text().replace(' ⚠', '').trim();

        var has_extra = parsed.items.some(function (it) { return it.extra > 0; });

        if (has_extra) {
            row.css('background-color', '#f8d7da'); // Red for Extra Prod.
            row.attr('data-status', 'extra');
            if (job_text !== '❌' && job_cell.text().indexOf('⚠') === -1) {
                job_cell.text(job_text + ' \u26a0');
            }
        } else if (parsed.total_width < min_w || parsed.total_width > max_w) {
            row.css('background-color', '#fff3cd'); // Yellow for Below Min
            row.attr('data-status', 'approval');
            row.find('.total-width-cell').css({ 'color': 'red', 'font-weight': 'bold' });
            if (job_text !== '❌' && job_cell.text().indexOf('⚠') === -1) {
                job_cell.text(job_text + ' \u26a0');
            }
        } else {
            row.css('background-color', ''); // White for Standard
            row.attr('data-status', 'ok');
            row.find('.total-width-cell').css({ 'color': '', 'font-weight': '' });
            if (job_text !== '❌') {
                job_cell.text(job_text);
            }
        }
        update_consolidated_totals();
    }

    // Add Row Button handler
    d.$wrapper.on('click', '.add-job-btn', function () {
        var table_body = d.$wrapper.find('.shaft-result-table tbody');
        var max_job = 0;
        table_body.find('tr').each(function () {
            var jid = parseInt($(this).find('td:first').text());
            if (!isNaN(jid) && jid > max_job) max_job = jid;
        });
        var next_job = max_job + 1;

        var new_row = '<tr class="manual-row">';
        new_row += '<td>' + next_job + '</td>';
        new_row += '<td><input type="number" class="form-control input-sm gsm-input" style="width:65px;"></td>';
        new_row += '<td><input type="text" class="form-control input-sm combination-input" style="width:100%; font-size:12px;"></td>';
        new_row += '<td class="total-width-cell">' + window.format_shaft_width(0) + '</td>';
        new_row += '<td><input type="number" class="form-control input-sm meter-input" style="width:80px;"></td>';
        new_row += '<td><input type="number" class="form-control input-sm shaft-input" style="width:70px;"></td>';
        new_row += '<td class="rolls-cell" style="text-align:center;">0</td>';
        new_row += '<td class="net-weight-cell" style="font-size:11px;">0.00</td>';
        new_row += '<td class="total-weight-cell" style="font-weight:bold;text-align:right;">0.00</td>';
        new_row += '<td>';
        new_row += '<button class="btn btn-xs btn-danger shaft-delete-btn">✕</button>';
        new_row += '</td>';
        new_row += '</tr>';

        table_body.append(new_row);
    });

    // Helper: re-sort table rows by total width (ascending), remainders (❌) stay at bottom
    function sort_table_by_width() {
        var tbody = d.$wrapper.find('.shaft-result-table tbody');
        var rows = tbody.find('tr').get();
        rows.sort(function (a, b) {
            var a_first = $(a).find('td:first').text().trim();
            var b_first = $(b).find('td:first').text().trim();
            // Remainder/cannot-plan rows go to the bottom
            var a_rem = (a_first === '❌') ? 1 : 0;
            var b_rem = (b_first === '❌') ? 1 : 0;
            if (a_rem !== b_rem) return a_rem - b_rem;
            var a_w = parseFloat($(a).find('.total-width-cell').text()) || 0;
            var b_w = parseFloat($(b).find('.total-width-cell').text()) || 0;
            return a_w - b_w;
        });
        $.each(rows, function (i, row) { tbody.append(row); });
    }

    // Delegate Input events for validation
    d.$wrapper.on('input', '.gsm-input, .combination-input, .shaft-input, .meter-input', function () {
        var row = $(this).closest('tr');
        validate_row(row);
    });

    // Re-sort only when the user finishes editing the combination (on blur)
    // This prevents focus loss while typing due to row re-appending.
    d.$wrapper.on('blur', '.combination-input', function () {
        sort_table_by_width();
    });

    // Edit button click
    d.$wrapper.on('click', '.shaft-edit-btn', function () {
        var btn = $(this);
        var row = btn.closest('tr');
        var inputs = row.find('input');
        var job_cell = row.find('td:first');

        if (btn.text() === 'Edit') {
            row.addClass('user-confirmed');
            // Assign job number if it was a remainder (❌) or clear red if it was filler
            if (job_cell.text().indexOf('\u274c') > -1 || row.attr('data-status') === 'extra') {
                if (job_cell.text().indexOf('\u274c') > -1) {
                    var max_job = 0;
                    row.closest('tbody').find('tr').each(function () {
                        var jid = parseInt($(this).find('td:first').text());
                        if (!isNaN(jid) && jid > max_job) max_job = jid;
                    });
                    job_cell.text(max_job + 1);
                }
                row.css('background-color', ''); // Remove red background
            }

            row.find('.combo-display').hide();
            row.find('.combination-input').show().prop('disabled', false).focus();
            inputs.not('.combination-input').prop('disabled', false); // shafts, gsm etc
            btn.text('Lock').addClass('btn-primary').removeClass('btn-default');
        } else {
            var input = row.find('.combination-input');
            var parsed = parse_combo_string(input.val());
            var styled_label = build_combo_label(parsed.items, false);

            row.find('.combo-display').html(styled_label).show();
            input.hide().prop('disabled', true);
            inputs.not('.combination-input').prop('disabled', true);
            btn.text('Edit').addClass('btn-default').removeClass('btn-primary');
            validate_row(row);
        }
    });

    // Delete button click
    d.$wrapper.on('click', '.shaft-delete-btn', function () {
        var row = $(this).closest('tr');
        if (row.hasClass('manual-row')) {
            row.remove();
        } else {
            row.addClass('shaft-deleted').css({ 'opacity': '0.3', 'text-decoration': 'line-through' });
            row.find('input').prop('disabled', true);
            $(this).text('↩').removeClass('btn-danger').addClass('btn-default shaft-restore-btn');
        }
        update_consolidated_totals();
    });

    // Restore button click
    d.$wrapper.on('click', '.shaft-restore-btn', function () {
        var row = $(this).closest('tr');
        row.removeClass('shaft-deleted').css({ 'opacity': '1', 'text-decoration': 'none' });
        $(this).text('✕').removeClass('btn-default shaft-restore-btn').addClass('btn-danger shaft-delete-btn');
        update_consolidated_totals();
    });

    function update_ui_units() {
        var uom_text = window.shaft_display_unit === 'cm' ? ' (CM)' : (window.shaft_display_unit === 'mm' ? ' (MM)' : ' (")');
        d.$wrapper.find('.width-header').text('Width' + uom_text);
        d.$wrapper.find('.total-width-header').text('Total Width' + uom_text);
        d.$wrapper.find('.combination-header').text('Combination' + uom_text);

        // Update top table width cells and inputs
        d.$wrapper.find('.assembly-summary-table tbody tr').each(function () {
            var row = $(this);
            if (row.hasClass('new-planned-row')) {
                var inp = row.find('.new-width');
                var val = parseFloat(inp.val());
                if (!isNaN(val)) {
                    var unit = window.shaft_display_unit;
                    var inch_val = row.data('inch-val') || val; // track originally typed if needed, but easier to just clear it
                    // Actually, since they are typing, let's just leave it alone or redraw is sufficient if we don't convert active inputs.
                }
            } else {
                var td = row.find('td:eq(1)');
                var orig = td.attr('data-original-width');
                if (orig) {
                    td.html(window.format_shaft_width(orig));
                }
            }
        });
        trigger_plan_recalc();
    }

    d.$wrapper.on('click', '.change-inch-btn', function (e) {
        e.preventDefault();
        window.shaft_display_unit = 'inch';
        update_ui_units();
    });

    d.$wrapper.on('click', '.change-cm-btn', function (e) {
        e.preventDefault();
        window.shaft_display_unit = 'cm';
        update_ui_units();
    });

    d.$wrapper.on('click', '.change-mm-btn', function (e) {
        e.preventDefault();
        window.shaft_display_unit = 'mm';
        update_ui_units();
    });

}

// APPLY RESULTS: Write shaft data to form tables (only on Submit)
// ============================================================
function apply_shaft_results(frm, final_assembly_items, all_jobs) {
    // 1. Update Assembly Items (po_items)
    var po_items = frm.doc.po_items || [];
    var handled_indices = [];

    final_assembly_items.forEach(function (item) {
        // Find existing match by GSM and Width (lenient matching)
        var source_idx = -1;
        if (item.source_name) {
            source_idx = po_items.findIndex(function (p, i) {
                return handled_indices.indexOf(i) === -1 && p.name === item.source_name;
            });
        }

        var match = source_idx > -1 ? po_items[source_idx] : po_items.find(function (p, i) {
            var p_gsm = Math.round(flt(p.custom_gsm) * 10) / 10;
            var i_gsm = Math.round(flt(item.gsm) * 10) / 10;
            var p_width = Math.round(flt(p.custom_width_ || p.custom_width) * 10) / 10;
            var i_width = Math.round(flt(item.width) * 10) / 10;

            return handled_indices.indexOf(i) === -1 && p_gsm === i_gsm && p_width === i_width;
        });

        var calculated_qty = get_per_roll_weight(item.gsm, item.width, item.meter) * flt(item.rolls);

        if (match) {
            frappe.model.set_value(match.doctype, match.name, 'custom_no_of_rolls', item.rolls);
            frappe.model.set_value(match.doctype, match.name, 'no_of_rolls', item.rolls);
            frappe.model.set_value(match.doctype, match.name, 'planned_qty', flt(calculated_qty, 3));
            frappe.model.set_value(match.doctype, match.name, 'qty', flt(calculated_qty, 3));
            frappe.model.set_value(match.doctype, match.name, 'custome_meterperroll', item.meter);
            frappe.model.set_value(match.doctype, match.name, 'custom_meterperroll', item.meter);
            frappe.model.set_value(match.doctype, match.name, 'custom_width', item.width);
            frappe.model.set_value(match.doctype, match.name, 'custom_width_', item.width);
            frappe.model.set_value(match.doctype, match.name, 'item_code', item.item_code);
            frappe.model.set_value(match.doctype, match.name, 'bom_no', item.bom_no);
            frappe.model.set_value(match.doctype, match.name, 'custom_quality', item.quality);
            frappe.model.set_value(match.doctype, match.name, 'custom_unit', item.unit);
            frappe.model.set_value(match.doctype, match.name, 'custom_color', item.color);
            frappe.model.set_value(match.doctype, match.name, 'stock_uom', "Kg");
            frappe.model.set_value(match.doctype, match.name, 'uom', "Kg");
            frappe.model.set_value(match.doctype, match.name, 'weight', flt(calculated_qty, 3));
            frappe.model.set_value(match.doctype, match.name, 'custom_weight', flt(calculated_qty, 3));
            frappe.model.set_value(match.doctype, match.name, 'total_weight', flt(calculated_qty, 3));
            frappe.model.set_value(match.doctype, match.name, 'custom_total_weight', flt(calculated_qty, 3));
            handled_indices.push(po_items.indexOf(match));
        } else {
            // Add as new row
            var new_row = frm.add_child('po_items');
            // Set directly on row object as a hard default before reactive updates.
            new_row.stock_uom = "Kg";
            new_row.uom = "Kg";
            var fallback_bom_no = (item.bom_no || generate_bom_no_logic(item.item_code) || '').trim();
            frappe.model.set_value(new_row.doctype, new_row.name, 'custom_gsm', item.gsm);
            frappe.model.set_value(new_row.doctype, new_row.name, 'custom_width', item.width);
            frappe.model.set_value(new_row.doctype, new_row.name, 'custom_width_', item.width);
            frappe.model.set_value(new_row.doctype, new_row.name, 'custom_no_of_rolls', item.rolls);
            frappe.model.set_value(new_row.doctype, new_row.name, 'no_of_rolls', item.rolls);
            frappe.model.set_value(new_row.doctype, new_row.name, 'planned_qty', flt(calculated_qty, 3));
            frappe.model.set_value(new_row.doctype, new_row.name, 'qty', flt(calculated_qty, 3));
            frappe.model.set_value(new_row.doctype, new_row.name, 'custome_meterperroll', item.meter);
            frappe.model.set_value(new_row.doctype, new_row.name, 'custom_meterperroll', item.meter);
            frappe.model.set_value(new_row.doctype, new_row.name, 'item_code', item.item_code);
            frappe.model.set_value(new_row.doctype, new_row.name, 'bom_no', fallback_bom_no);
            frappe.model.set_value(new_row.doctype, new_row.name, 'custom_quality', item.quality);
            frappe.model.set_value(new_row.doctype, new_row.name, 'custom_unit', item.unit);
            frappe.model.set_value(new_row.doctype, new_row.name, 'custom_color', item.color);
            frappe.model.set_value(new_row.doctype, new_row.name, 'stock_uom', "Kg");
            frappe.model.set_value(new_row.doctype, new_row.name, 'uom', "Kg");
            frappe.model.set_value(new_row.doctype, new_row.name, 'weight', flt(calculated_qty, 3));
            frappe.model.set_value(new_row.doctype, new_row.name, 'custom_weight', flt(calculated_qty, 3));
            frappe.model.set_value(new_row.doctype, new_row.name, 'total_weight', flt(calculated_qty, 3));
            frappe.model.set_value(new_row.doctype, new_row.name, 'custom_total_weight', flt(calculated_qty, 3));
            // Mark newly created row as handled so it is not reset in the cleanup pass below.
            handled_indices.push(po_items.indexOf(new_row));

            // Auto-create BOM for new Assembly Item by cloning an existing BOM from this plan.
            // This gives users an editable BOM immediately after submit.
            ensure_bom_for_new_assembly_item(frm, item.item_code, fallback_bom_no, function (resolved_bom_no) {
                if (resolved_bom_no) {
                    frappe.model.set_value(new_row.doctype, new_row.name, 'bom_no', resolved_bom_no);
                }
            });
        }
    });

    // Zero out any original po_items that were removed in the dialog. 
    // This uses set_value to ensure the UI updates.
    po_items.forEach(function (p, i) {
        if (handled_indices.indexOf(i) === -1) {
            if (flt(p.custom_no_of_rolls) > 0 || flt(p.no_of_rolls) > 0) {
                frappe.model.set_value(p.doctype, p.name, 'custom_no_of_rolls', 0);
                frappe.model.set_value(p.doctype, p.name, 'no_of_rolls', 0);
                frappe.model.set_value(p.doctype, p.name, 'planned_qty', 0);
                frappe.model.set_value(p.doctype, p.name, 'qty', 0);
                frappe.model.set_value(p.doctype, p.name, 'weight', 0);
                frappe.model.set_value(p.doctype, p.name, 'custom_weight', 0);
                frappe.model.set_value(p.doctype, p.name, 'total_weight', 0);
                frappe.model.set_value(p.doctype, p.name, 'custom_total_weight', 0);
            }
        }
    });

    // Final safeguard: ensure UOM is always defaulted to Kg.
    (frm.doc.po_items || []).forEach(function (p) {
        if (!p.uom) {
            frappe.model.set_value(p.doctype, p.name, 'uom', "Kg");
        }
        if (!p.stock_uom) {
            frappe.model.set_value(p.doctype, p.name, 'stock_uom', "Kg");
        }
    });

    // 2. Clear and Update Shaft Details
    frm.clear_table('custom_shaft_details');
    all_jobs.sort(function (a, b) { return a.job - b.job; });

    all_jobs.forEach(function (d, i) {
        d.job = i + 1; // Update ID to sequential
        var combo_label = build_combo_label(d.combo);
        var row = frm.add_child('custom_shaft_details');
        row.s_no = d.job;
        row.gsm = d.group_key.split('-')[0];
        row.combination = combo_label;
        row.combined_width = d.width;
        row.meter__roll = d.group_key.split('-')[1];
        row.no_of_shaft = d.shafts;
        row.notes = d.note;
        row.net_weight = d.net_weight || '';
        row.total_weight_kgs = d.total_weight || 0;
    });

    frm.refresh_field('po_items');
    frm.refresh_field('custom_shaft_details');

    // 3. Re-assign Job IDs to Assembly Items for tracking
    var temp_groups = {};
    (frm.doc.po_items || []).forEach(function (item) {
        var gsm = flt(item.custom_gsm);
        var meter = flt(item.custome_meterperroll || item.custom_meterperroll || item.custom_meter_roll || item.custom_meter_roll_ || item.custom_meter__roll || item.meter__roll) || 0;
        var key = gsm + '-' + meter + '-Default';
        if (!temp_groups[key]) temp_groups[key] = [];
        temp_groups[key].push(item);
    });
    assign_job_ids_to_rows(temp_groups, all_jobs);

    frm.refresh_field('po_items');
    frm.dirty();
}

function ensure_bom_for_new_assembly_item(frm, item_code, preferred_bom_no, done) {
    if (!item_code) {
        if (done) done('');
        return;
    }

    var preferred = (preferred_bom_no || '').trim();
    var finalize = function (bom_no) {
        if (done) done((bom_no || preferred || '').trim());
    };

    var template_bom = get_reference_bom_for_clone(frm, preferred);
    if (!template_bom) {
        finalize(preferred);
        return;
    }

    var clone_and_insert = function () {
        frappe.call({
            method: 'frappe.client.get',
            args: {
                doctype: 'BOM',
                name: template_bom
            },
            callback: function (r) {
                var source = r.message;
                if (!source) {
                    finalize(preferred);
                    return;
                }

                var new_bom = JSON.parse(JSON.stringify(source));
                scrub_bom_clone_payload(new_bom);

                // Keep copied BOM structure exactly; only remap parent item.
                new_bom.item = item_code;
                new_bom.item_code = item_code;
                new_bom.is_active = 1;
                new_bom.is_default = 0;

                // If the site uses custom bom_no field, carry preferred value.
                if (preferred) {
                    new_bom.bom_no = preferred;
                }

                frappe.call({
                    method: 'frappe.client.insert',
                    args: {
                        doc: new_bom
                    },
                    callback: function (ins) {
                        var created_name = ins && ins.message ? ins.message.name : '';
                        finalize(created_name || preferred);
                    },
                    error: function () {
                        finalize(preferred);
                    }
                });
            },
            error: function () {
                finalize(preferred);
            }
        });
    };

    if (preferred) {
        frappe.db.exists('BOM', preferred).then(function (exists) {
            if (exists) {
                finalize(preferred);
            } else {
                clone_and_insert();
            }
        }).catch(function () {
            clone_and_insert();
        });
    } else {
        clone_and_insert();
    }
}

function get_reference_bom_for_clone(frm, exclude_bom) {
    var ex = (exclude_bom || '').trim();
    var rows = frm.doc.po_items || [];

    for (var i = 0; i < rows.length; i++) {
        var b = (rows[i].bom_no || '').trim();
        if (b && b !== ex) return b;
    }
    return '';
}

function scrub_bom_clone_payload(doc) {
    var top_remove = [
        'name', 'owner', 'creation', 'modified', 'modified_by', 'docstatus',
        'amended_from', 'amendment_date', '_liked_by', '__islocal', '__unsaved'
    ];
    top_remove.forEach(function (f) {
        if (doc.hasOwnProperty(f)) delete doc[f];
    });

    [
        'items',
        'operations',
        'scrap_items',
        'exploded_items'
    ].forEach(function (table_field) {
        if (!Array.isArray(doc[table_field])) return;
        doc[table_field].forEach(function (row) {
            [
                'name', 'owner', 'creation', 'modified', 'modified_by', 'docstatus',
                'parent', 'parentfield', 'parenttype', '__islocal', '__unsaved'
            ].forEach(function (f) {
                if (row.hasOwnProperty(f)) delete row[f];
            });
        });
    });
}

// ============================================================
// FIND BEST COMBINATION
// mode='standard': prioritize shafts first (more production runs)
// mode='maximize': prioritize wider combos first (pack more per shaft)
// ============================================================
function find_best_combination(available, min_w, max_w, mode) {
    var best = null;
    var combos = find_fitting_combos(available, min_w, max_w);

    for (var c = 0; c < combos.length; c++) {
        var combo = combos[c];
        var shafts = calc_shafts_for_combo(combo.items, available);
        if (shafts <= 0) continue;

        var utilization = combo.total / max_w;
        var diversity = combo.items.length;
        var score;

        if (mode === 'maximize') {
            // For below-minimum pass: prioritize WIDER combos
            // 25"×2=50" should beat 25"=25" (even though single has more shafts)
            score = (combo.total * 10000) + (shafts * 100) + (diversity * 10);
        } else {
            // Standard (sub-range pass only): prioritize more shafts, then utilization.
            // Full-width (exact max_w) planning is handled by find_best_combination_lookahead.
            score = (shafts * 10000) + (utilization * 1000) + (diversity * 10);
        }

        if (!best || score > best.score) {
            best = {
                combo: combo.items,
                total_width: combo.total,
                score: score,
                shafts: shafts
            };
        }
    }

    return best;
}

// Helper: calculate shafts a combo can produce
function calc_shafts_for_combo(combo_items, available) {
    var shafts = Infinity;
    for (var i = 0; i < combo_items.length; i++) {
        var ci = combo_items[i];
        var item = available.find(function (a) { return a.width === ci.width; });
        shafts = Math.min(shafts, Math.floor(item.remaining_qty / ci.count));
    }
    return shafts;
}

// ============================================================
// FIND FITTING COMBOS: Backtracking search
// ============================================================
function find_fitting_combos(items, min_w, max_w) {
    var results = [];

    function backtrack(idx, current, total) {
        if (total >= min_w && total <= max_w && current.length > 0) {
            var combo_copy = current.map(function (c) {
                return { width: c.width, count: c.count };
            });
            results.push({ items: combo_copy, total: total });
        }

        if (idx >= items.length || total >= max_w) return;

        var item = items[idx];
        var max_count = Math.min(
            item.remaining_qty,
            Math.floor((max_w - total) / item.width)
        );

        for (var c = max_count; c >= 0; c--) {
            if (c > 0) {
                current.push({ width: item.width, count: c });
            }
            backtrack(idx + 1, current, total + c * item.width);
            if (c > 0) {
                current.pop();
            }
        }
    }

    backtrack(0, [], 0);
    return results;
}

// ============================================================
// HELPER: PARSE COMBINATION STRING (e.g. "25\"x2 + 30\"")
// ============================================================
function parse_combo_string(str) {
    if (!str) return { items: [], total_width: 0 };

    // Split by '+' to get parts
    var parts = str.split('+');
    var items = [];
    var total_width = 0;

    parts.forEach(function (part) {
        // Strip out HTML tags first
        part = part.replace(/<[^>]*>?/gm, '');

        // Handle (Need... patterns
        var is_extra = part.indexOf(')*') > -1 || part.indexOf('*)') > -1 || part.indexOf('Need') > -1;

        // Clean up text but try to preserve the width number
        // Extract width if it's like "Need 2 38\" rolls"
        var str_lower = part.toLowerCase();
        var width_match = part.match(/(\d+\.?\d*)\s*(cm|mm|\"|)/i);
        var width_val = width_match ? parseFloat(width_match[1]) : parseFloat(part.trim().replace(/[()\"*a-z]/gi, ''));

        if (str_lower.indexOf('cm') > -1) width_val = width_val / 2.54;
        else if (str_lower.indexOf('mm') > -1) width_val = width_val / 25.4;
        else if (window.shaft_display_unit === 'cm') width_val = width_val / 2.54;
        else if (window.shaft_display_unit === 'mm') width_val = width_val / 25.4;

        width_val = Math.round(width_val * 1000) / 1000;

        var count_match = part.match(/Need (\d+)/);
        var explicit_count = count_match ? parseInt(count_match[1]) : 1;

        if (width_val > 0) {
            // Keep array in exact order by pushing individual items
            for (var i = 0; i < explicit_count; i++) {
                items.push({ width: width_val, count: 1, extra: is_extra ? 1 : 0 });
                total_width += width_val;
            }
        }
    });

    return {
        items: items,
        total_width: total_width
    };
}

// ============================================================
// BUILD COMBO LABEL
// ============================================================
// ============================================================
// HELPERS
// ============================================================
function get_plan_signature(plan) {
    if (!plan) return "";
    var combo_p = (plan.jobs || []).slice().sort(function (a, b) {
        return (flt(a.width) - flt(b.width)) || (flt(a.shafts) - flt(b.shafts));
    }).map(function (j) {
        return j.width + 'x' + j.shafts + '[' + build_combo_label(j.combo, true) + ']';
    }).join('|');

    var rem_p = (plan.remainders || []).slice().sort(function (a, b) {
        return (flt(a.width) - flt(b.width)) || (flt(a.qty) - flt(b.qty));
    }).map(function (r) {
        return r.width + ':' + r.qty;
    }).join('|');

    return combo_p + '||' + rem_p;
}

function build_combo_label(items, use_clean_text) {
    var parts = [];
    var current_width = null;
    var prod_count = 0;
    var extra_count = 0;

    // Flush counts to parts array
    function flush() {
        if (current_width !== null) {
            for (var i = 0; i < prod_count; i++) {
                parts.push(window.format_shaft_width(current_width));
            }
            if (extra_count > 0) {
                var roll_text = extra_count > 1 ? 'rolls' : 'roll';
                var text = 'Need ' + extra_count + ' additional ' + window.format_shaft_width(current_width) + ' ' + roll_text;
                if (use_clean_text) {
                    parts.push('(' + text + ')*');
                } else {
                    // Use much shorter tag to save character space (<b> and color:red)
                    parts.push('<b style="color:red">(' + text + ')</b>');
                }
            }
        }
    }

    items.forEach(function (c) {
        if (c.width !== current_width) {
            flush();
            current_width = c.width;
            prod_count = 0;
            extra_count = 0;
        }
        var count = c.count || 1;
        var extra = c.extra || 0;
        prod_count += (count - extra);
        extra_count += extra;
    });
    flush();

    return parts.join(' + ');
}

// ============================================================
// ASSIGN JOB IDS: Maps jobs back to po_items rows
// ============================================================
function assign_job_ids_to_rows(groups, all_jobs) {
    var consumption = {};

    all_jobs.forEach(function (job) {
        if (!consumption[job.group_key]) {
            consumption[job.group_key] = {};
        }
        job.combo.forEach(function (c) {
            var prod_qty = (c.count - (c.extra || 0)) * job.shafts;
            if (prod_qty <= 0) return;

            if (!consumption[job.group_key][c.width]) {
                consumption[job.group_key][c.width] = [];
            }
            consumption[job.group_key][c.width].push({
                job_id: job.job,
                qty: prod_qty
            });
        });
    });

    for (var key in groups) {
        var group_rows = groups[key];
        var rows_by_width = {};
        group_rows.forEach(function (row) {
            var w = flt(row.custom_width_ || row.custom_width);
            if (!rows_by_width[w]) rows_by_width[w] = [];
            rows_by_width[w].push(row);
        });

        for (var width in rows_by_width) {
            var w = parseFloat(width);
            var rows = rows_by_width[w];
            var jobs_for_width = (consumption[key] && consumption[key][w]) || [];

            var job_idx = 0;
            var job_remaining = jobs_for_width.length > 0 ? jobs_for_width[0].qty : 0;

            rows.forEach(function (row) {
                var row_qty = flt(row.custom_no_of_rolls);
                var assigned_jobs = [];

                while (row_qty > 0 && job_idx < jobs_for_width.length) {
                    assigned_jobs.push(jobs_for_width[job_idx].job_id.toString());

                    if (row_qty <= job_remaining) {
                        job_remaining -= row_qty;
                        row_qty = 0;
                    } else {
                        row_qty -= job_remaining;
                        job_idx++;
                        job_remaining = job_idx < jobs_for_width.length ?
                            jobs_for_width[job_idx].qty : 0;
                    }
                }

                var unique_jobs = [];
                assigned_jobs.forEach(function (j) {
                    if (unique_jobs.indexOf(j) === -1) unique_jobs.push(j);
                });
                row.custom_s_no = unique_jobs.join(', ');
            });
        }
    }
}

// ============================================================
// LOOKAHEAD COMBO PICKER: picks the exact-max-width combo that
// leaves the most future max-width planning potential.
// Prevents greedy over-consumption of shared rolls (e.g. 34")
// that would block other 126" combinations later.
// ============================================================
function find_best_combination_lookahead(available, min_w, max_w, offset) {
    offset = offset || 0;
    var combos = find_fitting_combos(available, min_w, max_w);
    if (combos.length === 0) return null;

    // Score ALL combos, then pick the one at [offset] to generate plan variations
    var scored = [];

    for (var c = 0; c < combos.length; c++) {
        var combo = combos[c];
        var shafts = calc_shafts_for_combo(combo.items, available);
        if (shafts <= 0) continue;

        // Simulate applying this combo and estimate future in-range shafts
        var future_state = available.map(function (i) {
            return { width: i.width, remaining_qty: i.remaining_qty };
        });
        combo.items.forEach(function (ci) {
            var item = future_state.find(function (i) { return i.width === ci.width; });
            if (item) item.remaining_qty -= shafts * ci.count;
        });

        var future_shafts = estimate_greedy_shafts(future_state, min_w, max_w, 30);
        // Primary score: total shafts achievable (now + future)
        // Bonus for higher utilization (wider combos preferred among equal total scores)
        var utilization_bonus = (combo.total / max_w) * 5.0; // Stronger preference for full shafts
        var total_score = shafts + future_shafts + utilization_bonus;
        var diversity = combo.items.length;

        scored.push({
            combo: combo.items,
            total_width: combo.total,
            shafts: shafts,
            diversity: diversity,
            score: total_score + (diversity * 0.001) // small diversity tiebreaker baked in
        });
    }

    if (scored.length === 0) return null;

    // Sort descending by score so offset=0 → best, offset=1 → 2nd-best, etc.
    scored.sort(function (a, b) { return b.score - a.score; });

    // Clamp offset to available range
    var pick = scored[Math.min(offset, scored.length - 1)];
    return { combo: pick.combo, total_width: pick.total_width, shafts: pick.shafts, diversity: pick.diversity };
}

// ============================================================
// ESTIMATE GREEDY SHAFTS: fast greedy simulation used by
// find_best_combination_lookahead to score future potential.
// Uses simple max-shafts greedy (good enough for estimation).
// ============================================================
function estimate_greedy_shafts(state, min_w, max_w, max_iter) {
    var total = 0;
    var safety = 0;
    while (safety < max_iter) {
        safety++;
        var avail = state.filter(function (i) { return i.remaining_qty > 0; });
        if (avail.length === 0) break;

        var combos = find_fitting_combos(avail, min_w, max_w);
        if (combos.length === 0) break;

        // Pick combo with most shafts for estimation
        var best_shafts = 0;
        var best_combo = null;
        for (var c = 0; c < combos.length; c++) {
            var s = calc_shafts_for_combo(combos[c].items, avail);
            if (s > best_shafts) { best_shafts = s; best_combo = combos[c]; }
        }
        if (!best_combo || best_shafts <= 0) break;

        best_combo.items.forEach(function (ci) {
            var item = state.find(function (i) { return i.width === ci.width; });
            if (item) item.remaining_qty -= best_shafts * ci.count;
        });
        total += best_shafts;
    }
    return total;
}

// ============================================================
// HELPER: Generate Item Code & BOM instantly
// ============================================================
function generate_item_code_logic(gsm, width_inch) {
    var prefix = "100103001";
    var gsm_str = (parseInt(gsm) || 0).toString().padStart(3, '0');
    // Width in MM rounded to nearest 5
    var width_mm = Math.round((parseFloat(width_inch) || 0) * 25.4 / 5) * 5;
    var width_str = width_mm.toString().padStart(4, '0');
    return prefix + gsm_str + width_str;
}

function generate_bom_no_logic(item_code) {
    if (!item_code || item_code.indexOf('(') > -1) return "";
    return "BOM-" + item_code + "-001";
}

// ============================================================
// BUNDLE CALCULATION — JVE - SHEET CUTTING MACHINE only
// ============================================================

// ---- Check if current unit is JVE ----
function is_jve_unit(frm) {
    return (frm.doc.custom_unit || '').trim().toUpperCase() === 'JVE - SHEET CUTTING MACHINE';
}

// ============================================================
// HELPER: Fetch item names for bag size extraction
// ============================================================
function with_item_names(items, callback) {
    var codes = [];
    items.forEach(function(i) {
        if (i.item_code && codes.indexOf(i.item_code) === -1) {
            codes.push(i.item_code);
        }
    });

    if (codes.length === 0) {
        callback({});
        return;
    }

    frappe.call({
        method: 'frappe.client.get_list',
        args: {
            doctype: 'Item',
            filters: { name: ['in', codes] },
            fields: ['name', 'item_name', 'description']
        },
        callback: function(r) {
            var map = {};
            if (r.message) {
                r.message.forEach(function(d) {
                    map[d.name] = (d.item_name || '') + ' ' + (d.description || '');
                });
            }
            callback(map);
        }
    });
}

// ---- Main entry point — groups items by item_code + sheet_cutting_size ----
function calculate_bundles(frm) {
    if (!is_jve_unit(frm)) {
        frappe.msgprint({
            title: __('Wrong Unit'),
            indicator: 'red',
            message: 'Bundle Calculation is only available for <b>JVE - SHEET CUTTING MACHINE</b> unit.'
        });
        return;
    }

    with_item_names(frm.doc.po_items || [], function(item_names_map) {
        // Group po_items by item_code + sheet_cutting_size — each unique pair = one section
        var item_groups = [];
        var key_map = {};

        (frm.doc.po_items || []).forEach(function (item) {
            var pcs = flt(item.custom_no_of_sheets_pcs);
            if (pcs > 0) {
            var key = (item.item_code || '') + '||' + (item.custom_sheet_cutting_size || '');
            var job_id = (item.custom_s_no || item.job_id || item.idx || '').toString().trim();

            if (key_map[key] !== undefined) {
                var grp = item_groups[key_map[key]];
                grp.pcs += pcs;
                if (job_id) {
                    var ids = job_id.split(',').map(function (s) { return s.trim(); });
                    ids.forEach(function (id) {
                        if (id && grp.job_ids.indexOf(id) === -1) grp.job_ids.push(id);
                    });
                }
            } else {
                var initial_job_ids = [];
                if (job_id) {
                    initial_job_ids = job_id.split(',').map(function (s) { return s.trim(); }).filter(function (id) { return id; });
                }
                
                var ext_bag_size = item.bag_size || item.custom_bag_size || '';
                if (!ext_bag_size) {
                    var item_str = item.item_name || item.description || item_names_map[item.item_code] || item.item_code || '';
                    var match = item_str.match(/\(\s*([^)]*?\d[^)]*?["xX*][^)]*?)\s*\)/);
                    if (!match) match = item_str.match(/\(\s*([^\)]+)\s*\)/); // fallback
                    if (match) {
                        ext_bag_size = match[1].trim();
                    } else {
                        // Debug: Show exactly what we tried to match against
                        ext_bag_size = "NO MATCH IN: " + item_str.substring(0, 50);
                    }
                }

                key_map[key] = item_groups.length;
                item_groups.push({
                    item_code: item.item_code || '',
                    sheet_cutting_size: item.custom_sheet_cutting_size || '',
                    custom_bag_size: ext_bag_size,
                    pcs: pcs,
                    job_ids: initial_job_ids
                });
            }
        }
    });

    // Sort and stringify Job IDs for display/saving
    item_groups.forEach(function (grp) {
        grp.job_ids.sort(function (a, b) {
            var na = parseInt(a), nb = parseInt(b);
            if (!isNaN(na) && !isNaN(nb)) return na - nb;
            return a.localeCompare(b);
        });
        grp.job_id_str = grp.job_ids.join(', ');
    });

    if (item_groups.length === 0) {
        frappe.msgprint({ title: __('No Data'), indicator: 'orange', message: 'No PO items with <b>custom_no_of_sheets_pcs</b> data found.' });
        return;
    }

    show_bundle_dialog(frm, item_groups);
    });
}

// ---- Compute combinations: full bundles + one remainder bundle ----
function compute_bundle_combinations(total_pcs, pcs_per_packet, std_pkts_per_bundle) {
    var combinations = [];
    if (!total_pcs || !pcs_per_packet || !std_pkts_per_bundle) return combinations;

    var std_pcs_per_bundle = std_pkts_per_bundle * pcs_per_packet;
    var full_bundles = Math.floor(total_pcs / std_pcs_per_bundle);
    var remainder_pcs = total_pcs - (full_bundles * std_pcs_per_bundle);

    if (full_bundles > 0) {
        combinations.push({
            no_of_bundles: full_bundles,
            pkts_per_bundle: std_pkts_per_bundle,
            pcs_per_packet: pcs_per_packet,
            total_pcs_per_bundle: std_pcs_per_bundle
        });
    }
    if (remainder_pcs > 0) {
        var rem_pkts = Math.ceil(remainder_pcs / pcs_per_packet);
        combinations.push({
            no_of_bundles: 1,
            pkts_per_bundle: rem_pkts,
            pcs_per_packet: pcs_per_packet,
            total_pcs_per_bundle: rem_pkts * pcs_per_packet
        });
    }
    return combinations;
}

// ---- Build result HTML for one item section ----
function build_bundle_result_html(combinations, total_pcs) {
    if (!combinations || combinations.length === 0) {
        return '<p style="color:#aaa; font-style:italic; margin:6px 0; font-size:12px;">Enter values above to see the breakdown.</p>';
    }

    var total_bundles = 0, total_pkts = 0, total_result_pcs = 0;
    combinations.forEach(function (c) {
        total_bundles += c.no_of_bundles;
        total_pkts += c.no_of_bundles * c.pkts_per_bundle;
        total_result_pcs += c.no_of_bundles * c.total_pcs_per_bundle;
    });

    var html = '<table class="table table-bordered table-condensed" style="font-size:13px; margin:6px 0 0 0;">';
    html += '<thead><tr style="background:#e8f0fe;">';
    html += '<th style="text-align:center;">No of Bundles</th>';
    html += '<th style="text-align:center;">Pkts per Bundle</th>';
    html += '<th style="text-align:center;">Pcs per Packet</th>';
    html += '<th style="text-align:center;">Total Pcs per Bundle</th>';
    html += '</tr></thead><tbody>';

    combinations.forEach(function (c) {
        html += '<tr>';
        html += '<td style="text-align:center; font-weight:bold;">' + c.no_of_bundles + '</td>';
        html += '<td style="text-align:center;">' + c.pkts_per_bundle + '</td>';
        html += '<td style="text-align:center;">' + c.pcs_per_packet + '</td>';
        html += '<td style="text-align:center; font-weight:bold; color:#3d6ae8;">' + c.total_pcs_per_bundle + '</td>';
        html += '</tr>';
    });

    var rc = (total_result_pcs === total_pcs) ? '#2a9d5c' : '#d9534f';
    html += '<tr style="background:#f1f1f1; font-weight:bold;">';
    html += '<td style="text-align:center;">' + total_bundles + '</td>';
    html += '<td style="text-align:center;">' + total_pkts + ' (total pkts)</td>';
    html += '<td></td>';
    html += '<td style="text-align:center; color:' + rc + ';">' + total_result_pcs + ' / ' + total_pcs + ' pcs</td>';
    html += '</tr></tbody></table>';

    var diff = total_pcs - total_result_pcs;
    if (diff !== 0) {
        var clr = diff > 0 ? '#d9534f' : '#f0ad4e';
        html += '<p style="font-size:11px; color:' + clr + '; margin:4px 0 0 0;">' + (diff > 0 ? 'Unaccounted: ' : 'Over by: ') + Math.abs(diff) + ' pcs</p>';
    } else {
        html += '<p style="font-size:11px; color:#2a9d5c; margin:4px 0 0 0;">&#x2714; All ' + total_pcs + ' pcs accounted for.</p>';
    }
    return html;
}

// ---- Dialog — one section per item group ----
function show_bundle_dialog(frm, item_groups) {

    var msg = '';

    item_groups.forEach(function (grp, idx) {
        msg += '<div style="margin-bottom:16px; border:1px solid #c5d4f7; border-radius:6px; overflow:hidden;">';

        // Header: Job ID + item code + size badge + pcs
        msg += '<div style="background:#e8f0fe; padding:8px 14px; display:flex; justify-content:space-between; align-items:center;">';
        msg += '<div>';
        if (grp.job_id_str) {
            msg += '<span style="font-size:11px; color:#666; background:#fff; padding:1px 6px; border-radius:4px; margin-right:8px; border:1px solid #d1d8e0; font-weight:bold;">Job: ' + grp.job_id_str + '</span>';
        }
        msg += '<b style="font-size:13px;">' + (grp.item_code || '—') + '</b>';
        if (grp.sheet_cutting_size) {
            msg += '&nbsp;&nbsp;<span style="font-size:12px; color:#444; background:#d0dcf8; padding:1px 8px; border-radius:10px;">' + grp.sheet_cutting_size + '</span>';
        }
        if (grp.custom_bag_size) {
            msg += '&nbsp;&nbsp;<span style="font-size:12px; color:#856404; background:#fff3cd; border:1px solid #ffeeba; padding:1px 8px; border-radius:10px;">Bag Size: ' + grp.custom_bag_size + '</span>';
        }
        msg += '</div>';
        msg += '<div style="font-weight:bold; color:#3d6ae8; font-size:14px;">' + grp.pcs + ' pcs</div>';
        msg += '</div>';

        // Inputs
        msg += '<div style="padding:10px 14px; background:#fff; border-bottom:1px solid #eee;">';
        msg += '<div style="display:flex; gap:20px; align-items:flex-end; flex-wrap:wrap;">';
        msg += '<div><label style="font-size:11px; font-weight:600; display:block; margin-bottom:3px; color:#555;">Pcs per Packet</label>';
        msg += '<input type="number" id="bnd-pcs-per-packet-' + idx + '" class="form-control bnd-input" data-idx="' + idx + '" min="1" max="300" style="width:120px;" placeholder="e.g. 100"></div>';
        msg += '<div><label style="font-size:11px; font-weight:600; display:block; margin-bottom:3px; color:#555;">Standard Pkts per Bundle</label>';
        msg += '<input type="number" id="bnd-pkts-per-bundle-' + idx + '" class="form-control bnd-input" data-idx="' + idx + '" min="1" style="width:140px;" placeholder="e.g. 28"></div>';
        msg += '</div></div>';

        // Result area
        msg += '<div id="bnd-result-' + idx + '" style="padding:8px 14px; background:#fafafa;">';
        msg += '<p style="color:#bbb; font-style:italic; margin:4px 0; font-size:12px;">Enter values above to see the breakdown.</p>';
        msg += '</div>';

        msg += '</div>';
    });

    msg += '<p style="font-size:11px; color:#999; margin-top:2px;"><i>A <b>Bundle</b> is a sack. A <b>Packet</b> is a cover. Full bundles = floor(Pcs / (Pkts x Pcs/Pkt)). Remainder pcs form one smaller bundle.</i></p>';

    var d = new frappe.ui.Dialog({
        title: __('Bundle Calculation \u2014 JVE Sheet Cutting'),
        size: 'extra-large',
        fields: [{ fieldtype: 'HTML', fieldname: 'bundle_html', options: msg }],
        primary_action_label: __('Submit'),
        primary_action: function () {
            var final_combinations = [];
            var all_valid = true;

            item_groups.forEach(function (grp, idx) {
                var pcs_per_packet = parseInt(d.$wrapper.find('#bnd-pcs-per-packet-' + idx).val()) || 0;
                var pkts_per_bundle = parseInt(d.$wrapper.find('#bnd-pkts-per-bundle-' + idx).val()) || 0;

                if (pcs_per_packet <= 0 || pkts_per_bundle <= 0) {
                    all_valid = false;
                    return;
                }

                var combos = compute_bundle_combinations(grp.pcs, pcs_per_packet, pkts_per_bundle);
                combos.forEach(function (c) {
                    c.item_code = grp.item_code;
                    c.job_id = grp.job_id_str;
                    c.sheet_cutting_size = grp.sheet_cutting_size;
                    c.bag_size = grp.custom_bag_size;
                    final_combinations.push(c);
                });
            });

            if (!all_valid) {
                frappe.msgprint({ title: __('Input Required'), indicator: 'orange', message: 'Please fill Pcs per Packet and Standard Pkts per Bundle for every item.' });
                return;
            }
            if (final_combinations.length === 0) {
                frappe.msgprint({ title: __('No Data'), indicator: 'orange', message: 'No valid combinations generated.' });
                return;
            }

            apply_bundle_results(frm, final_combinations);
            d.hide();
            frappe.show_alert({ message: __('Bundle Calculation saved!'), indicator: 'green' }, 5);
        },
        secondary_action_label: __('Cancel'),
        secondary_action: function () { d.hide(); }
    });

    d.$wrapper.find('.modal-dialog').css({ 'max-width': '820px', 'width': '820px' });
    d.show();

    // Live recalc per item
    d.$wrapper.on('input', '.bnd-input', function () {
        var idx = parseInt($(this).attr('data-idx'));
        var grp = item_groups[idx];
        var pcs_per_packet = parseInt(d.$wrapper.find('#bnd-pcs-per-packet-' + idx).val()) || 0;
        var pkts_per_bundle = parseInt(d.$wrapper.find('#bnd-pkts-per-bundle-' + idx).val()) || 0;
        var combos = compute_bundle_combinations(grp.pcs, pcs_per_packet, pkts_per_bundle);
        d.$wrapper.find('#bnd-result-' + idx).html(build_bundle_result_html(combos, grp.pcs));
    });

    // Pre-fill from existing saved data
    var existing = (frm.doc.custom_bundle_calculation || []);
    if (existing.length > 0) {
        item_groups.forEach(function (grp, idx) {
            var std_row = null;
            existing.forEach(function (r) {
                if (r.item_code === grp.item_code && (r.sheet_cutting_size || '') === grp.sheet_cutting_size) {
                    if (!std_row || r.pkts_per_bundle > std_row.pkts_per_bundle) std_row = r;
                }
            });
            if (std_row) {
                if (std_row.pcs_per_packet) d.$wrapper.find('#bnd-pcs-per-packet-' + idx).val(std_row.pcs_per_packet);
                if (std_row.pkts_per_bundle) d.$wrapper.find('#bnd-pkts-per-bundle-' + idx).val(std_row.pkts_per_bundle);
                var combos = compute_bundle_combinations(grp.pcs, std_row.pcs_per_packet || 0, std_row.pkts_per_bundle || 0);
                d.$wrapper.find('#bnd-result-' + idx).html(build_bundle_result_html(combos, grp.pcs));
            }
        });
    }
}

// ---- Save one child table row per combination per item ----
function apply_bundle_results(frm, combinations) {
    frm.clear_table('custom_bundle_calculation');

    combinations.forEach(function (c, idx) {
        var row = frm.add_child('custom_bundle_calculation');
        var dcn = row.name;
        var dct = row.doctype;

        frappe.model.set_value(dct, dcn, 's_no', idx + 1);
        frappe.model.set_value(dct, dcn, 'item_code', c.item_code).then(function() {
            frappe.model.set_value(dct, dcn, 'job_id', c.job_id);
            frappe.model.set_value(dct, dcn, 'custom_job_id', c.job_id); // Fallback in case of prefix
            frappe.model.set_value(dct, dcn, 'sheet_cutting_size', c.sheet_cutting_size);
            frappe.model.set_value(dct, dcn, 'bag_size', c.bag_size || '');
            frappe.model.set_value(dct, dcn, 'custom_bag_size', c.bag_size || '');
        });
        frappe.model.set_value(dct, dcn, 'no_of_bundles', c.no_of_bundles);
        frappe.model.set_value(dct, dcn, 'pkts_per_bundle', c.pkts_per_bundle);
        frappe.model.set_value(dct, dcn, 'pcs_per_packet', c.pcs_per_packet);
        frappe.model.set_value(dct, dcn, 'total_pcs_per_bundle', c.total_pcs_per_bundle);
    });

    frm.refresh_field('custom_bundle_calculation');
    frm.dirty();
}

// ============================================================
// PACKING CALCULATION — Bag Making Units
// ============================================================

function is_bag_making_unit(frm) {
    var u = (frm.doc.custom_unit || '').trim().toUpperCase();
    var bag_making_units = [
        'L1 LEADER OYANG MACHINE',
        'L2 LEADER ZX  MACHINE',
        'VTP-L1 LEADER OYANG MACHINE',
        'VTP-L2 LEADER ZX MACHINE',
        'JVE-L3 B700 BAG MAKING MACHINE',
        'JVE-L2 B700 BAG MAKING MACHINE',
        'JVE-L1 B700 BAG MAKING MACHINE',
        'TTT- L3 - OYANG C900 BAG MAKING LINE',
        'TTT- L2 - OYANG C700 BAG MAKING LINE',
        'TTT- L1 - OYANG C700 BAG MAKING LINE'
    ];
    return bag_making_units.indexOf(u) !== -1;
}

function calculate_packing(frm) {
    if (!is_bag_making_unit(frm)) {
        frappe.msgprint({
            title: __('Wrong Unit'),
            indicator: 'red',
            message: 'Packing Calculation is only available for Bag Making units.'
        });
        return;
    }

    var packing = (frm.doc.custom_packing || '').trim();
    if (packing !== 'Box Packing' && packing !== 'Bora Packing') {
        frappe.msgprint({
            title: __('Missing Packing Type'),
            indicator: 'orange',
            message: 'Please select the <b>Packing</b> type (Box / Bora) on the form before calculating.'
        });
        return;
    }

    with_item_names(frm.doc.po_items || [], function(item_names_map) {
        var item_groups = [];
        var key_map = {};

        (frm.doc.po_items || []).forEach(function (item) {
            var pcs = flt(item.planned_qty); // using planned_qty instead of custom_no_of_sheets_pcs
            if (pcs > 0) {
            var key = (item.item_code || '') + '||' + packing; // Grouping by item code and packing
            var job_id = (item.custom_s_no || item.job_id || item.idx || '').toString().trim();

            if (key_map[key] !== undefined) {
                var grp = item_groups[key_map[key]];
                grp.pcs += pcs;
                if (job_id) {
                    var ids = job_id.split(',').map(function (s) { return s.trim(); });
                    ids.forEach(function (id) {
                        if (id && grp.job_ids.indexOf(id) === -1) grp.job_ids.push(id);
                    });
                }
            } else {
                var initial_job_ids = [];
                if (job_id) {
                    initial_job_ids = job_id.split(',').map(function (s) { return s.trim(); }).filter(function (id) { return id; });
                }
                
                var ext_bag_size = item.bag_size || item.custom_bag_size || '';
                if (!ext_bag_size) {
                    var item_str = item.item_name || item.description || item_names_map[item.item_code] || item.item_code || '';
                    var match = item_str.match(/\(\s*([^)]*?\d[^)]*?["xX*][^)]*?)\s*\)/);
                    if (!match) match = item_str.match(/\(\s*([^\)]+)\s*\)/); // fallback
                    if (match) {
                        ext_bag_size = match[1].trim();
                    } else {
                        // Debug: Show exactly what we tried to match against
                        ext_bag_size = "NO MATCH IN: " + item_str.substring(0, 50);
                    }
                }

                key_map[key] = item_groups.length;
                item_groups.push({
                    item_code: item.item_code || '',
                    sheet_cutting_size: item.custom_sheet_cutting_size || '', // Keep it just in case
                    custom_bag_size: ext_bag_size,
                    custom_packing: packing,
                    pcs: pcs,
                    job_ids: initial_job_ids
                });
            }
        }
    });

    item_groups.forEach(function (grp) {
        grp.job_ids.sort(function (a, b) {
            var na = parseInt(a), nb = parseInt(b);
            if (!isNaN(na) && !isNaN(nb)) return na - nb;
            return a.localeCompare(b);
        });
        grp.job_id_str = grp.job_ids.join(', ');
    });

    if (item_groups.length === 0) {
        frappe.msgprint({ title: __('No Data'), indicator: 'orange', message: 'No PO items with <b>Planned Qty</b> data found.' });
        return;
    }

        // Pre-fill from existing saved data
        var existing = (frm.doc.custom_bundle_calculation || []);
        if (existing.length > 0) {
            item_groups.forEach(function (grp) {
                existing.forEach(function (r) {
                    if (r.item_code === grp.item_code && (r.sheet_cutting_size || '') === grp.sheet_cutting_size) {
                        grp.saved_pcs_per_box = Math.max(grp.saved_pcs_per_box || 0, r.custom_pcs_per_box || 0);
                        grp.saved_pcs_per_packet = Math.max(grp.saved_pcs_per_packet || 0, r.pcs_per_packet || 0);
                        grp.saved_pkts_per_bundle = Math.max(grp.saved_pkts_per_bundle || 0, r.pkts_per_bundle || 0);
                    }
                });
            });
        }

        show_packing_dialog(frm, item_groups);
    });
}

function compute_packing_combinations_box(total_pcs, pcs_per_box) {
    var combinations = [];
    if (!total_pcs || !pcs_per_box) return combinations;

    var full_boxes = Math.floor(total_pcs / pcs_per_box);
    var remainder_pcs = total_pcs - (full_boxes * pcs_per_box);

    if (full_boxes > 0) {
        combinations.push({
            no_of_bundles: full_boxes, // Repurposing bundles as boxes
            pkts_per_bundle: 0,          // Not applicable
            pcs_per_packet: 0,          // Not applicable
            total_pcs_per_bundle: pcs_per_box
        });
    }
    if (remainder_pcs > 0) {
        combinations.push({
            no_of_bundles: 1,
            pkts_per_bundle: 0,
            pcs_per_packet: 0,
            total_pcs_per_bundle: remainder_pcs
        });
    }
    return combinations;
}

function build_packing_result_html(combinations, total_pcs, packing_type) {
    if (!combinations || combinations.length === 0) {
        return '<p style="color:#aaa; font-style:italic; margin:6px 0; font-size:12px;">Enter values above to see the breakdown.</p>';
    }

    var total_units = 0, total_pkts = 0, total_result_pcs = 0;
    combinations.forEach(function (c) {
        total_units += c.no_of_bundles;
        total_pkts += c.no_of_bundles * c.pkts_per_bundle;
        total_result_pcs += c.no_of_bundles * c.total_pcs_per_bundle;
    });

    var is_box = (packing_type === 'Box');
    var unit_name = is_box ? 'Boxes' : 'Bundles';

    var html = '<table class="table table-bordered table-condensed" style="font-size:13px; margin:6px 0 0 0;">';
    html += '<thead><tr style="background:#e8f0fe;">';
    html += '<th style="text-align:center;">No of ' + unit_name + '</th>';
    if (!is_box) {
        html += '<th style="text-align:center;">Pkts per Bundle</th>';
        html += '<th style="text-align:center;">Pcs per Packet</th>';
    }
    html += '<th style="text-align:center;">Total Pcs per ' + (is_box ? 'Box' : 'Bundle') + '</th>';
    html += '</tr></thead><tbody>';

    combinations.forEach(function (c) {
        html += '<tr>';
        html += '<td style="text-align:center; font-weight:bold;">' + c.no_of_bundles + '</td>';
        if (!is_box) {
            html += '<td style="text-align:center;">' + c.pkts_per_bundle + '</td>';
            html += '<td style="text-align:center;">' + c.pcs_per_packet + '</td>';
        }
        html += '<td style="text-align:center; font-weight:bold; color:#3d6ae8;">' + c.total_pcs_per_bundle + '</td>';
        html += '</tr>';
    });

    var rc = (total_result_pcs === total_pcs) ? '#2a9d5c' : '#d9534f';
    html += '<tr style="background:#f1f1f1; font-weight:bold;">';
    html += '<td style="text-align:center;">' + total_units + '</td>';
    if (!is_box) {
        html += '<td style="text-align:center;">' + total_pkts + ' (total pkts)</td>';
        html += '<td></td>';
    }
    html += '<td style="text-align:center; color:' + rc + ';">' + total_result_pcs + ' / ' + total_pcs + ' pcs</td>';
    html += '</tr></tbody></table>';

    var diff = total_pcs - total_result_pcs;
    if (diff !== 0) {
        var clr = diff > 0 ? '#d9534f' : '#f0ad4e';
        html += '<p style="font-size:11px; color:' + clr + '; margin:4px 0 0 0;">' + (diff > 0 ? 'Unaccounted: ' : 'Over by: ') + Math.abs(diff) + ' pcs</p>';
    } else {
        html += '<p style="font-size:11px; color:#2a9d5c; margin:4px 0 0 0;">&#x2714; All ' + total_pcs + ' pcs accounted for.</p>';
    }
    return html;
}

function show_packing_dialog(frm, item_groups) {
    var msg = '';

    item_groups.forEach(function (grp, idx) {
        msg += '<div style="margin-bottom:16px; border:1px solid #c5d4f7; border-radius:6px; overflow:hidden;">';

        // Header: Job ID + item code + size badge + pcs
        msg += '<div style="background:#e8f0fe; padding:8px 14px; display:flex; justify-content:space-between; align-items:center;">';
        msg += '<div>';
        if (grp.job_id_str) {
            msg += '<span style="font-size:11px; color:#666; background:#fff; padding:1px 6px; border-radius:4px; margin-right:8px; border:1px solid #d1d8e0; font-weight:bold;">Job: ' + grp.job_id_str + '</span>';
        }
        msg += '<b style="font-size:13px;">' + (grp.item_code || '—') + '</b>';
        if (grp.sheet_cutting_size) {
            msg += '&nbsp;&nbsp;<span style="font-size:12px; color:#444; background:#d0dcf8; padding:1px 8px; border-radius:10px;">' + grp.sheet_cutting_size + '</span>';
        }
        if (grp.custom_bag_size) {
            msg += '&nbsp;&nbsp;<span style="font-size:12px; color:#856404; background:#fff3cd; border:1px solid #ffeeba; padding:1px 8px; border-radius:10px;">Bag Size: ' + grp.custom_bag_size + '</span>';
        }
        msg += '</div>';
        msg += '<div style="font-weight:bold; color:#3d6ae8; font-size:14px;">' + grp.pcs + ' pcs</div>';
        msg += '</div>';

        // Packing Type Selection based on custom_packing
        var ptype_val = '';
        var p = (grp.custom_packing || '').toLowerCase();
        if (p.includes('box')) ptype_val = 'Box';
        else if (p.includes('bora')) ptype_val = 'Bora';

        msg += '<div style="padding:10px 14px 0px 14px; background:#fff;">';
        msg += '<label style="font-size:11px; font-weight:600; display:block; margin-bottom:3px; color:#555;">Packing Type</label>';
        // Disabled so the user knows it's driven by the item data
        msg += '<select id="pck-type-' + idx + '" class="form-control pck-type-select" data-idx="' + idx + '" style="width:200px;" disabled>';
        msg += '<option value="" ' + (ptype_val === '' ? 'selected' : '') + ' disabled>Select Packing Type</option>';
        msg += '<option value="Box" ' + (ptype_val === 'Box' ? 'selected' : '') + '>Box Packing</option>';
        msg += '<option value="Bora" ' + (ptype_val === 'Bora' ? 'selected' : '') + '>Bora Packing</option>';
        msg += '</select>';
        msg += '</div>';

        // Inputs
        var show_box = (ptype_val === 'Box') ? 'flex' : 'none';
        var show_bora = (ptype_val === 'Bora') ? 'flex' : 'none';

        msg += '<div style="padding:10px 14px; background:#fff; border-bottom:1px solid #eee;">';
        msg += '<div id="pck-inputs-box-' + idx + '" style="display:' + show_box + '; gap:20px; align-items:flex-end; flex-wrap:wrap;">';
        msg += '<div><label style="font-size:11px; font-weight:600; display:block; margin-bottom:3px; color:#555;">Pcs per Box</label>';
        msg += '<input type="number" id="pck-pcs-per-box-' + idx + '" class="form-control pck-input" data-idx="' + idx + '" min="1" style="width:120px;" placeholder="e.g. 50" value="' + (grp.saved_pcs_per_box || '') + '"></div>';
        msg += '</div>';

        msg += '<div id="pck-inputs-bora-' + idx + '" style="display:' + show_bora + '; gap:20px; align-items:flex-end; flex-wrap:wrap;">';
        msg += '<div><label style="font-size:11px; font-weight:600; display:block; margin-bottom:3px; color:#555;">Pcs per Packet</label>';
        msg += '<input type="number" id="pck-pcs-per-packet-' + idx + '" class="form-control pck-input" data-idx="' + idx + '" min="1" max="300" style="width:120px;" placeholder="e.g. 100" value="' + (grp.saved_pcs_per_packet || '') + '"></div>';
        msg += '<div><label style="font-size:11px; font-weight:600; display:block; margin-bottom:3px; color:#555;">Standard Pkts per Bundle</label>';
        msg += '<input type="number" id="pck-pkts-per-bundle-' + idx + '" class="form-control pck-input" data-idx="' + idx + '" min="1" style="width:140px;" placeholder="e.g. 28" value="' + (grp.saved_pkts_per_bundle || '') + '"></div>';
        msg += '</div>';
        msg += '</div>';

        // Result area
        msg += '<div id="pck-result-' + idx + '" style="padding:8px 14px; background:#fafafa;">';
        msg += '<p style="color:#bbb; font-style:italic; margin:4px 0; font-size:12px;">Enter values above to see the breakdown.</p>';
        msg += '</div>';

        msg += '</div>';
    });

    var d = new frappe.ui.Dialog({
        title: __('Packing Calculation \u2014 Bag Making'),
        size: 'extra-large',
        fields: [{ fieldtype: 'HTML', fieldname: 'packing_html', options: msg }],
        primary_action_label: __('Submit'),
        primary_action: function () {
            var final_combinations = [];
            var all_valid = true;

            item_groups.forEach(function (grp, idx) {
                var packing_type = d.$wrapper.find('#pck-type-' + idx).val();

                if (!packing_type) { all_valid = false; return; }
                if (packing_type === 'Box') {
                    var pcs_per_box = parseInt(d.$wrapper.find('#pck-pcs-per-box-' + idx).val()) || 0;
                    if (pcs_per_box <= 0) { all_valid = false; return; }
                    var combos = compute_packing_combinations_box(grp.pcs, pcs_per_box);
                    combos.forEach(function (c) {
                        c.item_code = grp.item_code;
                        c.job_id = grp.job_id_str;
                        c.sheet_cutting_size = grp.sheet_cutting_size;
                        c.bag_size = grp.custom_bag_size;
                        c.is_box = true;
                        final_combinations.push(c);
                    });
                } else if (packing_type === 'Bora') {
                    var pcs_per_packet = parseInt(d.$wrapper.find('#pck-pcs-per-packet-' + idx).val()) || 0;
                    var pkts_per_bundle = parseInt(d.$wrapper.find('#pck-pkts-per-bundle-' + idx).val()) || 0;
                    if (pcs_per_packet <= 0 || pkts_per_bundle <= 0) { all_valid = false; return; }
                    var combos = compute_bundle_combinations(grp.pcs, pcs_per_packet, pkts_per_bundle);
                    combos.forEach(function (c) {
                        c.item_code = grp.item_code;
                        c.job_id = grp.job_id_str;
                        c.sheet_cutting_size = grp.sheet_cutting_size;
                        c.bag_size = grp.custom_bag_size;
                        final_combinations.push(c);
                    });
                }
            });

            if (!all_valid) {
                frappe.msgprint({ title: __('Input Required'), indicator: 'orange', message: 'Please fill all required fields for every item.' });
                return;
            }
            if (final_combinations.length === 0) {
                frappe.msgprint({ title: __('No Data'), indicator: 'orange', message: 'No valid combinations generated.' });
                return;
            }

            apply_packing_results(frm, final_combinations);
            d.hide();
            frappe.show_alert({ message: __('Packing Calculation saved!'), indicator: 'green' }, 5);
        },
        secondary_action_label: __('Cancel'),
        secondary_action: function () { d.hide(); }
    });

    d.$wrapper.find('.modal-dialog').css({ 'max-width': '820px', 'width': '820px' });
    d.show();

    // Live recalc per item
    function update_result(idx) {
        var grp = item_groups[idx];
        var ptype = d.$wrapper.find('#pck-type-' + idx).val();
        var combos = [];
        if (ptype === 'Box') {
            var ppb = parseInt(d.$wrapper.find('#pck-pcs-per-box-' + idx).val()) || 0;
            combos = compute_packing_combinations_box(grp.pcs, ppb);
        } else if (ptype === 'Bora') {
            var ppp = parseInt(d.$wrapper.find('#pck-pcs-per-packet-' + idx).val()) || 0;
            var ppbnd = parseInt(d.$wrapper.find('#pck-pkts-per-bundle-' + idx).val()) || 0;
            combos = compute_bundle_combinations(grp.pcs, ppp, ppbnd);
        }
        d.$wrapper.find('#pck-result-' + idx).html(build_packing_result_html(combos, grp.pcs, ptype));
    }

    // Initialize the results for any pre-filled values
    item_groups.forEach(function (grp, idx) {
        update_result(idx);
    });

    d.$wrapper.on('change', '.pck-type-select', function () {
        var idx = $(this).attr('data-idx');
        var ptype = $(this).val();
        if (ptype === 'Box') {
            d.$wrapper.find('#pck-inputs-box-' + idx).css('display', 'flex');
            d.$wrapper.find('#pck-inputs-bora-' + idx).hide();
        } else if (ptype === 'Bora') {
            d.$wrapper.find('#pck-inputs-box-' + idx).hide();
            d.$wrapper.find('#pck-inputs-bora-' + idx).css('display', 'flex');
        } else {
            d.$wrapper.find('#pck-inputs-box-' + idx).hide();
            d.$wrapper.find('#pck-inputs-bora-' + idx).hide();
        }
        update_result(idx);
    });

    d.$wrapper.on('input', '.pck-input', function () {
        update_result($(this).attr('data-idx'));
    });
}

function apply_packing_results(frm, combinations) {
    frm.clear_table('custom_bundle_calculation');

    combinations.forEach(function (c, idx) {
        var row = frm.add_child('custom_bundle_calculation');
        var dcn = row.name;
        var dct = row.doctype;

        frappe.model.set_value(dct, dcn, 's_no', idx + 1);
        frappe.model.set_value(dct, dcn, 'item_code', c.item_code).then(function() {
            frappe.model.set_value(dct, dcn, 'job_id', c.job_id);
            frappe.model.set_value(dct, dcn, 'custom_job_id', c.job_id); // Fallback in case of prefix
            frappe.model.set_value(dct, dcn, 'sheet_cutting_size', c.sheet_cutting_size);
            frappe.model.set_value(dct, dcn, 'bag_size', c.bag_size || '');
            frappe.model.set_value(dct, dcn, 'custom_bag_size', c.bag_size || '');
        });
        // Note: total_pcs_per_bundle is intentionally NOT set for Packing Calculation (only Bundle Calculation uses it)

        if (c.is_box) {
            frappe.model.set_value(dct, dcn, 'custom_no_of_boxes', c.no_of_bundles);
            frappe.model.set_value(dct, dcn, 'custom_pcs_per_box', c.total_pcs_per_bundle);
            // Clear bundle fields so they don't show confusing data for boxes
            frappe.model.set_value(dct, dcn, 'no_of_bundles', 0);
            frappe.model.set_value(dct, dcn, 'pkts_per_bundle', 0);
            frappe.model.set_value(dct, dcn, 'pcs_per_packet', 0);
        } else {
            frappe.model.set_value(dct, dcn, 'custom_no_of_boxes', 0);
            frappe.model.set_value(dct, dcn, 'custom_pcs_per_box', 0);
            frappe.model.set_value(dct, dcn, 'no_of_bundles', c.no_of_bundles);
            frappe.model.set_value(dct, dcn, 'pkts_per_bundle', c.pkts_per_bundle);
            frappe.model.set_value(dct, dcn, 'pcs_per_packet', c.pcs_per_packet);
        }
    });

    frm.refresh_field('custom_bundle_calculation');
    frm.dirty();
}