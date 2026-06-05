// ═══════════════════════════════════════════════════════════
//  Shaft Production Run — Mixing Sheet Client Script
// ═══════════════════════════════════════════════════════════

const PRINTING_MACHINES = [
    'VR - 1200MM BOPP PRINTING MACHINE',
    'JVE - PRINTING MACHINE 2 COLOUR 1600MM',
    'JVE - PRINTING MACHINE 4 COLOUR 1600MM',
    'TT - PRINTING MACHINE 4 COLOUR 1200MM'
];

const SOLVENT_MACHINES = [
    'VR - 1200MM BOPP PRINTING MACHINE'
];

let _mix_dialog = null;
let _reminder_interval = null;

frappe.ui.form.on('Shaft Production Run', {

    refresh(frm) {
        if (!frm.doc.production_plan) return;

        if (frm.doc.docstatus === 0) {
            frm.add_custom_button(__('Mixing Sheet'), () => open_mixing_sheet(frm));
        }

        // Hourly reminder if a mixing sheet is already active (only for Drafts)
        if (frm.doc.custom_mixing_sheet_data && frm.doc.docstatus === 0) {
            start_hourly_reminder(frm);
        }
    },

    before_submit(frm) {
        return finalize_wo_materials(frm);
    }
});

// ─────────────────────────────────────────────────
// OPEN — fetch PP data then show dialog
// ─────────────────────────────────────────────────
function open_mixing_sheet(frm) {
    if (frm.doc.docstatus !== 0) {
        frappe.msgprint({
            title: __('Action Restricted'),
            indicator: 'orange',
            message: __('The Mixing Sheet cannot be opened because this Shaft Production Run is already submitted or cancelled.')
        });
        return;
    }
    frappe.call({
        method: 'get_pp_mixing_data',
        args: { production_plan: frm.doc.production_plan, spr_name: frm.doc.name },
        callback(r) {
            if (r.exc) return;
            let existing = r.message.existing_mixing_data
                ? JSON.parse(r.message.existing_mixing_data) : null;
            show_dialog(frm, r.message, existing);
        }
    });
}

// ─────────────────────────────────────────────────
// MAIN DIALOG
// ─────────────────────────────────────────────────
function show_dialog(frm, pp, existing) {
    let is_printing = PRINTING_MACHINES.includes(frm.doc.custom_unit);
    let uses_solvent = SOLVENT_MACHINES.includes(frm.doc.custom_unit);
    if (_mix_dialog) _mix_dialog.hide();

    let state = existing || { mixing_type: '', sets: [make_empty_set()] };

    if (state.completed) {
        frappe.msgprint({
            title: __('Mixing Completed'),
            indicator: 'green',
            message: __('This Mixing Sheet has already been submitted and completed. It is now read-only.')
        });
    }

    let fields = [];
    if (!is_printing) {
        fields.push({
            fieldname: 'mixing_type', label: 'Mixing Type',
            fieldtype: 'Select', options: '\nFull Mixing\nHalf Mixing',
            reqd: 1, default: state.mixing_type
        });
    }
    fields.push({ fieldtype: 'Section Break', label: '📦 Raw Materials' });

    if (is_printing) {
        fields.push(
            { fieldtype: 'Column Break' },
            { fieldname: 'ink_item', label: 'BOPP Ink (BOM)', fieldtype: 'Link', options: 'Item', get_query: () => ({ filters: { item_code: ['like', 'INK -%'] } }) }
        );
        if (uses_solvent) {
            fields.push(
                { fieldtype: 'Column Break' },
                { fieldname: 'ethyl_acetate_item', label: 'Ethyl Acetate', fieldtype: 'Link', options: 'Item' },
                { fieldtype: 'Column Break' },
                { fieldname: 'toluene_item', label: 'Toluene', fieldtype: 'Link', options: 'Item' },
                { fieldtype: 'Column Break' },
                { fieldname: 'iso_butanol_item', label: 'Iso Butanol (Optional)', fieldtype: 'Link', options: 'Item' }
            );
        }
    } else {
        fields.push(
            { fieldtype: 'Column Break' },
            { fieldname: 'pp_item', label: 'Polypropylene', fieldtype: 'Link', options: 'Item', get_query: () => ({ filters: { item_code: ['like', 'PP -%'] } }) },
            { fieldtype: 'Column Break' },
            { fieldname: 'filler_item', label: 'Filler', fieldtype: 'Link', options: 'Item', get_query: () => ({ filters: { item_code: ['like', 'FL -%'] } }) },
            { fieldtype: 'Column Break' },
            { fieldname: 'masterbatch_item', label: 'Masterbatch', fieldtype: 'Link', options: 'Item', get_query: () => ({ filters: { item_code: ['like', 'MB -%'] } }) },
            { fieldtype: 'Column Break' },
            { fieldname: 'antistatic_item', label: 'Antistatic', fieldtype: 'Link', options: 'Item', get_query: () => ({ filters: { item_code: ['like', 'SA -%'] } }) },
            { fieldtype: 'Column Break' },
            { fieldname: 'ppa_item', label: 'Modifier (PPA)', fieldtype: 'Link', options: 'Item', get_query: () => ({ filters: { item_code: ['like', 'SA -%'] } }) }
        );
    }

    fields.push(
        { fieldtype: 'Section Break' },
        {
            fieldname: 'save_rm_html',
            fieldtype: 'HTML',
            options: `<div style="text-align:right;padding:4px 0 8px; display:flex; gap:8px; justify-content:flex-end;">
                ${is_printing ? `<button class="btn btn-sm btn-info btn-add-ink-inline">➕ Add Ink</button>` : `<button class="btn btn-sm btn-info btn-add-additive-inline">➕ Add Special Item</button>`}
                <button class="btn btn-sm btn-success btn-save-rm-inline" style="min-width:140px">💾 Save Raw Materials</button>
            </div>`
        },
        { fieldtype: 'Section Break' },
        { fieldname: 'main_html', fieldtype: 'HTML' }
    );

    let d = new frappe.ui.Dialog({
        title: `Mixing Sheet — ${frm.doc.name}`,
        size: 'extra-large',
        fields: fields
    });

    // ── Replace default footer ──────────────────
    d.footer.empty().append(`
        <div style="display:flex;justify-content:space-between;width:100%;flex-wrap:wrap;gap:6px">
            <button class="btn btn-sm btn-default" id="btn_add_set">➕ Add Second Raw Material Set</button>
            <div style="display:flex;gap:8px">
                <button class="btn btn-sm btn-warning" id="btn_print">🖨 Print Sheet</button>
                ${is_printing ? `<button class="btn btn-sm btn-info" id="btn_add_ink">➕ Add Ink</button>` : `<button class="btn btn-sm btn-info" id="btn_add_additive">➕ Add Special Item</button>`}
                <button class="btn btn-sm btn-success" id="btn_save_rm">💾 Save Raw Materials</button>
                <button class="btn btn-sm btn-primary" id="btn_save_all">✅ Save Mixing Sheet</button>
                <button class="btn btn-sm btn-primary" id="btn_submit_mixing" style="background:#2e7d32; border:none;">🚩 Finish & Submit</button>
            </div>
        </div>`);

    d.show();
    _mix_dialog = d;

    // Pre-fill Set 1 materials if existing
    let m0 = state.sets[0]?.materials || {};
    if (is_printing) {
        d.set_value('ink_item', m0.Ink || '');
        if (uses_solvent) {
            d.set_value('ethyl_acetate_item', m0.EthylAcetate || 'CM - 5003001');
            d.set_value('toluene_item', m0.Toluene || 'CM - 5003002');
            d.set_value('iso_butanol_item', m0.IsoButanol || 'CM - 5003002');
        }
    } else {
        d.set_value('pp_item', m0.PP || '');
        d.set_value('filler_item', m0.Filler || '');
        d.set_value('masterbatch_item', m0.Masterbatch || '');
        d.set_value('antistatic_item', m0.Antistatic || '');
        d.set_value('ppa_item', m0.PPA || '');
    }
    if (!is_printing && state.mixing_type) d.set_value('mixing_type', state.mixing_type);

    // Render grids
    render_all(d, frm, pp, state);

    // ── Button: Save Raw Materials (inline below fields + footer) ──
    let on_save_rm = () => save_raw_materials(d, frm, pp, state);
    d.footer.find('#btn_save_rm').off('click').on('click', on_save_rm);
    // Re-bind after any re-render (delegate on dialog wrapper)
    d.wrapper.off('click', '.btn-save-rm-inline').on('click', '.btn-save-rm-inline', on_save_rm);


    // ── Button: Add Second Set ──────────────────
    d.footer.find('#btn_add_set').on('click', () => {
        if (state.sets.length >= 2) {
            frappe.msgprint('Maximum two raw material sets allowed.'); return;
        }
        state.sets.push(make_empty_set());
        render_all(d, frm, pp, state);
        d.footer.find('#btn_add_set').prop('disabled', true);
    });

    // ── Button: Print ───────────────────────────
    d.footer.find('#btn_print').on('click', () => print_mixing_sheet(state, frm.doc.name));

    // ── Button: Add Special Additive / Ink ────────────
    let add_extra_item = (item_code) => {
        let active_idx = state.sets.length - 1;
        if (!state.sets[active_idx].extras) state.sets[active_idx].extras = [];
        
        frappe.db.get_value('Item', item_code, 'item_name').then(r => {
            state.sets[active_idx].extras.push({
                item_code: item_code,
                item_name: r.message?.item_name || item_code
            });
            state.sets[active_idx].rows.forEach(row => {
                if (row.extras === undefined) row.extras = {};
                row.extras[item_code] = 0;
            });
            render_all(d, frm, pp, state);
        });
    };

    let on_add_additive = () => {
        if (state.completed) return;
        let active_idx = state.sets.length - 1;
        if (!state.sets[active_idx].materials || !state.sets[active_idx].materials.PP) {
            frappe.msgprint('Please select all raw materials and click <b>Save Raw Materials</b> first to generate the grid.');
            return;
        }
        frappe.prompt([
            { label: 'Select Item', fieldname: 'item_code', fieldtype: 'Link', options: 'Item', reqd: 1 }
        ], (v) => add_extra_item(v.item_code), 'Add Dana / Special Additive');
    };

    let on_add_ink = () => {
        if (state.completed) return;
        let active_idx = state.sets.length - 1;
        if (!state.sets[active_idx].materials || !state.sets[active_idx].materials.Ink) {
            frappe.msgprint('Please select the primary BOPP Ink (BOM) and click <b>Save Raw Materials</b> first to generate the grid.');
            return;
        }
        frappe.prompt([
            { label: 'Select Ink', fieldname: 'item_code', fieldtype: 'Link', options: 'Item', reqd: 1, get_query: () => ({ filters: { item_code: ['like', 'INK -%'] } }) }
        ], (v) => add_extra_item(v.item_code), 'Add Ink Item');
    };

    d.footer.find('#btn_add_additive').on('click', on_add_additive);
    d.wrapper.on('click', '.btn-add-additive-inline', on_add_additive);
    d.footer.find('#btn_add_ink').on('click', on_add_ink);
    d.wrapper.on('click', '.btn-add-ink-inline', on_add_ink);

    // ── Button: Submit Mixing ───────────────────
    let on_submit_mixing = () => {
        if (state.completed) return;
        frappe.confirm('<b>Are you sure you want to FINISH and SUBMIT this Mixing Sheet?</b><br><br>This will lock the sheet and mark it as completed.', () => {
            state.completed = true;
            frappe.call({
                method: 'save_mixing_sheet',
                args: { spr_name: frm.doc.name, mixing_sheet_json: JSON.stringify(state) },
                callback(r) {
                    if (!r.exc) {
                        frappe.msgprint('Mixing Sheet Submitted Successfully!');
                        d.hide();
                        frm.reload_doc();
                    }
                }
            });
        });
    };
    d.footer.find('#btn_submit_mixing').on('click', on_submit_mixing);
    d.wrapper.on('click', '.btn-submit-mixing-inline', on_submit_mixing);

    // ── Button: Save All ────────────────────────
    d.footer.find('#btn_save_all').on('click', () => {
        collect_row_qtys(d, state);
        if (!is_printing) state.mixing_type = d.get_value('mixing_type');
        frappe.call({
            method: 'save_mixing_sheet',
            args: { spr_name: frm.doc.name, mixing_sheet_json: JSON.stringify(state) },
            callback(r) {
                if (!r.exc) {
                    frappe.show_alert({ message: 'Mixing Sheet saved!', indicator: 'green' });
                    frm.reload_doc();
                    start_hourly_reminder(frm);
                }
            }
        });
    });

    // ── Mixing type change    // When mixing type changes, just save to state. The grid will build on Save Raw Materials.
    if (!is_printing) {
        d.fields_dict.mixing_type.$input.on('change', () => {
            state.mixing_type = d.get_value('mixing_type');
        });
    }

    // ── Button: Add/Clear Set ──────────────────
    d.footer.find('#btn_add_set').off('click').on('click', () => {
        if (state.sets.length >= 2) {
            frappe.confirm('Remove Set 2?', () => {
                state.sets.pop();
                render_all(d, frm, pp, state);
            });
            return;
        }
        state.sets.push(make_empty_set());
        render_all(d, frm, pp, state);
    });
}

// ─────────────────────────────────────────────────
// SAVE RAW MATERIALS (validate and fetch item names)
// ─────────────────────────────────────────────────
function save_raw_materials(d, frm, pp, state) {
    let is_printing = PRINTING_MACHINES.includes(frm.doc.custom_unit);
    let uses_solvent = SOLVENT_MACHINES.includes(frm.doc.custom_unit);
    let v = d.get_values();
    if (!is_printing && !v.mixing_type) { frappe.msgprint('Please select Mixing Type first.'); return; }
    
    let selected = {};
    if (is_printing) {
        if (!v.ink_item) {
            frappe.msgprint('Please select Ink before saving.');
            return;
        }
        selected = { Ink: v.ink_item };
        if (uses_solvent) {
            if (!v.ethyl_acetate_item || !v.toluene_item) {
                frappe.msgprint('Please select Ethyl Acetate and Toluene before saving. Iso Butanol is optional.');
                return;
            }
            selected.EthylAcetate = v.ethyl_acetate_item;
            selected.Toluene = v.toluene_item;
            selected.IsoButanol = v.iso_butanol_item || '';
        }
    } else {
        if (!v.pp_item || !v.filler_item || !v.masterbatch_item || !v.antistatic_item || !v.ppa_item) {
            frappe.msgprint('Please select all 5 raw materials before saving.');
            return;
        }
        selected = {
            PP: v.pp_item, Filler: v.filler_item,
            Masterbatch: v.masterbatch_item, Antistatic: v.antistatic_item, PPA: v.ppa_item
        };
    }

    // Apply and update logic
    let apply_to_set = (index) => {
        if (!is_printing) state.mixing_type = v.mixing_type;
        state.sets[index].materials = selected;
        state.sets[index].rows      = []; // Clear rows for this specific set
        build_rows(state.sets[index], pp, v.mixing_type, is_printing, uses_solvent);

        let fetches = is_printing
            ? [
                frappe.db.get_value('Item', selected.Ink, 'item_name'),
                frappe.db.get_value('Item', selected.EthylAcetate, 'item_name'),
                frappe.db.get_value('Item', selected.Toluene, 'item_name'),
                selected.IsoButanol ? frappe.db.get_value('Item', selected.IsoButanol, 'item_name') : Promise.resolve(null)
            ]
            : [
                frappe.db.get_value('Item', selected.PP,          'item_name'),
                frappe.db.get_value('Item', selected.Filler,      'item_name'),
                frappe.db.get_value('Item', selected.Masterbatch, 'item_name'),
                frappe.db.get_value('Item', selected.Antistatic,  'item_name'),
                frappe.db.get_value('Item', selected.PPA,         'item_name')
            ];

        Promise.all(fetches).then(results => {
            if (is_printing) {
                state.sets[index].item_names = {
                    Ink: results[0]?.message?.item_name || selected.Ink
                };
                if (uses_solvent) {
                    state.sets[index].item_names.EthylAcetate = results[1]?.message?.item_name || selected.EthylAcetate;
                    state.sets[index].item_names.Toluene = results[2]?.message?.item_name || selected.Toluene;
                    state.sets[index].item_names.IsoButanol = results[3]?.message?.item_name || selected.IsoButanol;
                }
            } else {
                state.sets[index].item_names = {
                    PP:          results[0]?.message?.item_name || selected.PP,
                    Filler:      results[1]?.message?.item_name || selected.Filler,
                    Masterbatch: results[2]?.message?.item_name || selected.Masterbatch,
                    Antistatic:  results[3]?.message?.item_name || selected.Antistatic,
                    PPA:         results[4]?.message?.item_name || selected.PPA,
                };
            }
            render_all(d, frm, pp, state);
            
            frappe.call({
                method: 'save_mixing_sheet',
                args: { spr_name: frm.doc.name, mixing_sheet_json: JSON.stringify(state) },
                callback(r) {
                    if (!r.exc) {
                        frappe.show_alert({ message: `✅ Mixing Grid — Set ${index + 1} Created!`, indicator: 'green' });
                    }
                }
            });
        });
    };

    let apply_and_update = () => {
        let last_idx = state.sets.length - 1;
        let last_set = state.sets[last_idx];
        
        let has_consumption = (last_set.rows || []).some(r => r.consumed);
        let items_changed = false;
        
        if (is_printing) {
            items_changed = last_set.materials?.Ink && (last_set.materials.Ink !== selected.Ink);
            if (uses_solvent && items_changed === false) {
                items_changed = last_set.materials?.EthylAcetate !== selected.EthylAcetate ||
                                last_set.materials?.Toluene !== selected.Toluene ||
                                last_set.materials?.IsoButanol !== selected.IsoButanol;
            }
        } else {
            items_changed = last_set.materials?.PP && (last_set.materials.PP !== selected.PP || last_set.materials.Filler !== selected.Filler);
        }

        if (has_consumption && items_changed && state.sets.length < 2) {
            state.sets.push(make_empty_set());
            apply_to_set(1);
        } else {
            apply_to_set(last_idx);
        }
    };

    let check_mismatches_and_apply = (expected) => {
        let mismatches = [];
        if (is_printing) {
            if (expected.Ink && selected.Ink !== expected.Ink) mismatches.push(`• Ink: <span style="color:red">${selected.Ink}</span> (PP expects <b>${expected.Ink}</b>)`);
            if (uses_solvent) {
                if (expected.EthylAcetate && selected.EthylAcetate !== expected.EthylAcetate) mismatches.push(`• Ethyl Acetate: <span style="color:red">${selected.EthylAcetate}</span> (PP expects <b>${expected.EthylAcetate}</b>)`);
                if (expected.Toluene && selected.Toluene !== expected.Toluene) mismatches.push(`• Toluene: <span style="color:red">${selected.Toluene}</span> (PP expects <b>${expected.Toluene}</b>)`);
                if (expected.IsoButanol && selected.IsoButanol !== expected.IsoButanol) mismatches.push(`• Iso Butanol: <span style="color:red">${selected.IsoButanol}</span> (PP expects <b>${expected.IsoButanol}</b>)`);
            }
        } else {
            if (expected.PP && selected.PP !== expected.PP) mismatches.push(`• PP: <span style="color:red">${selected.PP}</span> (PP expects <b>${expected.PP}</b>)`);
            if (expected.Filler && selected.Filler !== expected.Filler) mismatches.push(`• Filler: <span style="color:red">${selected.Filler}</span> (PP expects <b>${expected.Filler}</b>)`);
            if (expected.Masterbatch && selected.Masterbatch !== expected.Masterbatch) mismatches.push(`• Masterbatch: <span style="color:red">${selected.Masterbatch}</span> (PP expects <b>${expected.Masterbatch}</b>)`);
            if (expected.Antistatic && selected.Antistatic !== expected.Antistatic) mismatches.push(`• Antistatic: <span style="color:red">${selected.Antistatic}</span> (PP expects <b>${expected.Antistatic}</b>)`);
            if (expected.PPA && selected.PPA !== expected.PPA) mismatches.push(`• Modifier: <span style="color:red">${selected.PPA}</span> (PP expects <b>${expected.PPA}</b>)`);
        }

        if (mismatches.length) {
            frappe.confirm(
                `<b>⚠️ Selected raw materials differ from the Production Plan:</b><br><br>${mismatches.join('<br>')}<br><br>Click <b>Proceed</b> to use the selected materials.`,
                apply_and_update
            );
        } else {
            apply_and_update();
        }
    };

    frappe.model.with_doc('Production Plan', frm.doc.production_plan, () => {
        let pp_doc = frappe.get_doc('Production Plan', frm.doc.production_plan);
        let uses_solvent = SOLVENT_MACHINES.includes(frm.doc.custom_unit);
        let expected = is_printing ? (uses_solvent ? { Ink: '', EthylAcetate: '', Toluene: '', IsoButanol: '' } : { Ink: '' }) : { PP: '', Filler: '', Masterbatch: '', Antistatic: '', PPA: '' };
        let all_seen = [];

        let extract = (code, name) => {
            if (!code) return;
            all_seen.push(code);
            let upper = (code + ' ' + (name || '')).toUpperCase();
            
            if (is_printing) {
                if (upper.startsWith('INK -') && !expected.Ink) expected.Ink = code;
                else if (uses_solvent) {
                    if (upper.includes('ETHYL') && !expected.EthylAcetate) expected.EthylAcetate = code;
                    else if (upper.includes('TOLUENE') && !expected.Toluene) expected.Toluene = code;
                    else if ((upper.includes('ISO BUTANOL') || upper.includes('ISOBUTANOL') || upper.includes('ISO BUTANYL')) && !expected.IsoButanol) expected.IsoButanol = code;
                }
            } else {
                if (upper.startsWith('PP') && !expected.PP) expected.PP = code;
                else if (upper.startsWith('FL') && !expected.Filler) expected.Filler = code;
                else if (upper.startsWith('MB') && !expected.Masterbatch) expected.Masterbatch = code;
                else if (upper.startsWith('SA')) {
                    if (!expected.PPA) expected.PPA = code;
                    else if (expected.PPA !== code && !expected.Antistatic) expected.Antistatic = code;
                }
            }
        };

        (pp_doc.mr_items || []).forEach(row => extract(row.item_code, row.item_name));

        let bom_nos = (pp_doc.po_items || []).map(r => r.bom_no).filter(Boolean);
        let load_boms = (index) => {
            let done = is_printing ? (uses_solvent ? (expected.Ink && expected.EthylAcetate && expected.Toluene) : expected.Ink) : (expected.PP && expected.Filler);
            if (index >= bom_nos.length || done) {
                if (is_printing) {
                    if (!expected.Ink) expected.Ink = `(Not Found. Saw: ${all_seen.join(', ') || 'Nothing'})`;
                    if (uses_solvent) {
                        if (!expected.EthylAcetate) expected.EthylAcetate = 'CM - 5003001';
                        if (!expected.Toluene) expected.Toluene = 'CM - 5003002';
                        if (!expected.IsoButanol) expected.IsoButanol = 'CM - 5003002';
                    }
                } else {
                    if (!expected.PP) expected.PP = `(Not Found. Saw: ${all_seen.join(', ') || 'Nothing'})`;
                    if (!expected.Filler) expected.Filler = `(Not Found. Saw: ${all_seen.join(', ') || 'Nothing'})`;
                }
                return check_mismatches_and_apply(expected);
            }
            frappe.model.with_doc('BOM', bom_nos[index], () => {
                let bom_doc = frappe.get_doc('BOM', bom_nos[index]);
                (bom_doc.items || []).forEach(row => extract(row.item_code, row.item_name));
                load_boms(index + 1);
            });
        };

        load_boms(0);
    });
}


// ─────────────────────────────────────────────────
// BUILD DEFAULT ROWS from PP ratios
// ─────────────────────────────────────────────────
function build_rows(set_obj, pp, mixing_type, is_printing, uses_solvent) {
    let is_half = mixing_type === 'Half Mixing';
    let count = is_printing ? 1 : (is_half ? (pp.no_of_half_mixing || 1) : (pp.no_of_full_mixing || 1));

    let ratios = is_half
        ? { pp: pp.half_pp_ratio, fl: pp.half_filler_ratio, mb: pp.half_masterbatch_ratio, anti: pp.half_antistatic_ratio, ppa: pp.half_ppa_ratio }
        : { pp: pp.pp_ratio, fl: pp.filler_ratio, mb: pp.masterbatch_ratio, anti: pp.antistatic_ratio, ppa: pp.ppa_ratio };

    set_obj.rows = [];
    for (let i = 0; i < count; i++) {
        if (is_printing) {
            let row = { ink_qty: 0, consumed: false, consumed_by: null, consumed_at: null };
            if (uses_solvent) {
                row.ea_qty = 0;
                row.tol_qty = 0;
                row.iso_qty = 0;
            }
            set_obj.rows.push(row);
        } else {
            set_obj.rows.push({
                pp_qty: ratios.pp, filler_qty: ratios.fl, mb_qty: ratios.mb,
                anti_qty: ratios.anti, ppa_qty: ratios.ppa,
                consumed: false, consumed_by: null, consumed_at: null
            });
        }
    }
}

function make_empty_set() {
    return { materials: {}, extras: [], rows: [] };
}

// ─────────────────────────────────────────────────
// RENDER ALL SETS
// ─────────────────────────────────────────────────
function render_all(d, frm, pp, state) {
    let $wrap = d.fields_dict.main_html.$wrapper;
    $wrap.empty();

    let is_printing = PRINTING_MACHINES.includes(frm.doc.custom_unit);
    state.sets.forEach((set, si) => {
        if (!set.materials || (!set.materials.PP && !set.materials.Ink)) {
            $wrap.append(`<div style="padding:30px; text-align:center; color:#888; font-style:italic; border:1px dashed #ccc; margin-top:20px; border-radius:4px;">
                Select Raw Materials, then click <b>Save Raw Materials</b> to generate the grid.
            </div>`);
            return;
        }
        if (!set.rows.length && (is_printing || state.mixing_type)) build_rows(set, pp, state.mixing_type, is_printing);
        $wrap.append(render_set_html(set, si, frm, state, d, pp));
    });

    // ── Bottom Action Section ───────────────────
    $wrap.append(`
        <div style="margin-top:40px; padding:30px 0; border-top:1px solid #eee; display:flex; justify-content:center; flex-direction:column; align-items:center;">
            <button class="btn btn-md btn-primary btn-submit-mixing-inline" style="background:#2e7d32; border:none; width:280px; font-weight:bold; height:45px; font-size:16px;">
                🚩 Finish & Submit Mixing
            </button>
            <p style="color:#888; font-size:12px; margin-top:10px;">This will lock the mixing sheet and update Work Orders.</p>
        </div>
        <div style="height:60px"></div>
    `);

    // Bind consume buttons
    $wrap.find('.btn-consume').on('click', function () {
        let si = $(this).data('set');
        let ri = $(this).data('row');
        consume_row(frm, state, si, ri, d, pp);
    });

    // Bind add/delete row buttons
    $wrap.find('.btn-add-row').on('click', function () {
        let si = $(this).data('set');
        let is_half = state.mixing_type === 'Half Mixing';
        let is_printing = PRINTING_MACHINES.includes(frm.doc.custom_unit);
        
        if (is_printing) {
            let uses_solvent = SOLVENT_MACHINES.includes(frm.doc.custom_unit);
            let row = { ink_qty: 0, consumed: false, consumed_by: null, consumed_at: null };
            if (uses_solvent) {
                row.ea_qty = 0;
                row.tol_qty = 0;
                row.iso_qty = 0;
            }
            state.sets[si].rows.push(row);
        } else {
            let ratios = is_half
                ? { pp: pp.half_pp_ratio, fl: pp.half_filler_ratio, mb: pp.half_masterbatch_ratio, anti: pp.half_antistatic_ratio, ppa: pp.half_ppa_ratio }
                : { pp: pp.pp_ratio, fl: pp.filler_ratio, mb: pp.masterbatch_ratio, anti: pp.antistatic_ratio, ppa: pp.ppa_ratio };
            state.sets[si].rows.push({
                pp_qty: ratios.pp, filler_qty: ratios.fl, mb_qty: ratios.mb,
                anti_qty: ratios.anti, ppa_qty: ratios.ppa,
                consumed: false, consumed_by: null, consumed_at: null
            });
        }
        render_all(d, frm, pp, state);
    });

    $wrap.find('.btn-del-row').on('click', function () {
        let si = $(this).data('set');
        let rows = state.sets[si].rows;
        if (rows.length > 1) {
            collect_row_qtys(d, state);
            rows.pop();
            render_all(d, frm, pp, state);
        } else {
            frappe.show_alert({ message: 'At least one row required.', indicator: 'orange' });
        }
    });
}

// ─────────────────────────────────────────────────
// RENDER ONE SET AS HTML TABLE
// ─────────────────────────────────────────────────
function render_set_html(set, si, frm, state, d, pp) {
    let is_printing = PRINTING_MACHINES.includes(frm.doc.custom_unit);
    let uses_solvent = SOLVENT_MACHINES.includes(frm.doc.custom_unit);
    let m = set.materials || {};
    let names = set.item_names || {};
    let label = si === 0 ? 'Set 1' : 'Set 2 (Alternate)';

    let header = `
    <div style="margin-top:${si > 0 ? '24px' : '0'};padding:8px 0 4px;font-weight:600;color:#5e35b1;border-bottom:2px solid #ede7f6">
        🧪 Mixing Grid — ${label}
        ${(is_printing ? m.Ink : m.PP) ? '' : '<span style="font-weight:400;font-size:12px;color:#aaa"> — Select raw materials and click Save Raw Materials</span>'}
    </div>`;

    let rows_html = '';
    set.rows.forEach((row, ri) => {
        let status_badge = row.consumed
            ? `<span style="color:green;font-size:11px">✅ ${row.consumed_by?.split('@')[0]} @ ${row.consumed_at?.slice(11, 16)}</span>`
            : `<button class="btn btn-xs btn-primary btn-consume" data-set="${si}" data-row="${ri}">Consume</button>`;

        let extras_cols = (set.extras || []).map(ex => {
            let val = (row.extras && row.extras[ex.item_code]) || 0;
            return `<td><input class="form-control form-control-sm row-qty-extra" data-set="${si}" data-row="${ri}" data-item="${ex.item_code}" value="${val}" style="width:70px;text-align:center"></td>`;
        }).join('');

        if (is_printing) {
            let solvent_cols = uses_solvent ? `
                <td><input class="form-control form-control-sm row-qty" data-set="${si}" data-row="${ri}" data-field="ea_qty" value="${row.ea_qty || 0}" style="width:70px;text-align:center"></td>
                <td><input class="form-control form-control-sm row-qty" data-set="${si}" data-row="${ri}" data-field="tol_qty" value="${row.tol_qty || 0}" style="width:70px;text-align:center"></td>
                <td><input class="form-control form-control-sm row-qty" data-set="${si}" data-row="${ri}" data-field="iso_qty" value="${row.iso_qty || 0}" style="width:70px;text-align:center"></td>
            ` : '';
            rows_html += `<tr style="${row.consumed ? 'background:#f0fff0' : ''}">
                <td style="text-align:center;width:40px">${ri + 1}</td>
                <td><input class="form-control form-control-sm row-qty" data-set="${si}" data-row="${ri}" data-field="ink_qty" value="${row.ink_qty || 0}" style="width:70px;text-align:center"></td>
                ${extras_cols}
                ${solvent_cols}
                <td style="text-align:center">${status_badge}</td>
            </tr>`;
        } else {
            rows_html += `<tr style="${row.consumed ? 'background:#f0fff0' : ''}">
                <td style="text-align:center;width:40px">${ri + 1}</td>
                <td><input class="form-control form-control-sm row-qty" data-set="${si}" data-row="${ri}" data-field="pp_qty"   value="${row.pp_qty}"   style="width:70px;text-align:center"></td>
                <td><input class="form-control form-control-sm row-qty" data-set="${si}" data-row="${ri}" data-field="filler_qty" value="${row.filler_qty}" style="width:70px;text-align:center"></td>
                <td><input class="form-control form-control-sm row-qty" data-set="${si}" data-row="${ri}" data-field="mb_qty"    value="${row.mb_qty}"   style="width:70px;text-align:center"></td>
                <td><input class="form-control form-control-sm row-qty" data-set="${si}" data-row="${ri}" data-field="anti_qty"  value="${row.anti_qty}"  style="width:70px;text-align:center"></td>
                <td><input class="form-control form-control-sm row-qty" data-set="${si}" data-row="${ri}" data-field="ppa_qty"   value="${row.ppa_qty}"   style="width:70px;text-align:center"></td>
                ${extras_cols}
                <td style="text-align:center">${status_badge}</td>
            </tr>`;
        }
    });

    let table = '';
    if (is_printing) {
        let solvent_headers = uses_solvent ? `
            <th style="background:#ffcc80">${names.EthylAcetate || m.EthylAcetate || 'Ethyl Acetate'} (kg)</th>
            <th style="background:#b39ddb">${names.Toluene || m.Toluene || 'Toluene'} (kg)</th>
            <th style="background:#80cbc4">${names.IsoButanol || m.IsoButanol || 'Iso Butanol'} (kg)</th>
        ` : '';
        table = `
        <table class="table table-bordered table-sm" style="margin-top:8px;font-size:13px">
            <thead>
                <tr>
                    <th style="background:#d1f2ff;width:40px">#</th>
                    <th style="background:#c7ffbc">${names.Ink || m.Ink || 'BOPP Ink'} (kg)</th>
                    ${(set.extras || []).map(ex => `<th style="background:#e1f5fe">${ex.item_name} (kg)</th>`).join('')}
                    ${solvent_headers}
                    <th style="background:#f0e6ff">Status</th>
                </tr>
            </thead>
            <tbody>${rows_html}</tbody>
        </table>`;
    } else {
        table = `
        <table class="table table-bordered table-sm" style="margin-top:8px;font-size:13px">
            <thead>
                <tr>
                    <th style="background:#d1f2ff;width:40px">#</th>
                    <th style="background:#d1f2ff">${names.PP || m.PP || 'PP'} (kg)</th>
                    <th style="background:#c7ffbc">${names.Filler || m.Filler || 'Filler'} (kg)</th>
                    <th style="background:#fff2cc">${names.Masterbatch || m.Masterbatch || 'Masterbatch'} (kg)</th>
                    <th style="background:#ffffcc">${names.Antistatic || m.Antistatic || 'Antistatic'} (kg)</th>
                    <th style="background:#ffe4e1">${names.PPA || m.PPA || 'Modifier'} (kg)</th>
                    ${(set.extras || []).map(ex => `<th style="background:#e1f5fe">${ex.item_name} (kg)</th>`).join('')}
                    <th style="background:#f0e6ff">Status</th>
                </tr>
            </thead>
            <tbody>${rows_html}</tbody>
        </table>`;
    }

    table += `
    <div style="display:flex;gap:8px;margin-bottom:4px">
        <button class="btn btn-xs btn-default btn-add-row" data-set="${si}">➕ Add Row</button>
        <button class="btn btn-xs btn-danger  btn-del-row" data-set="${si}">🗑 Remove Last Row</button>
        <span style="margin-left:auto;font-size:12px;color:#888">
            Total rows: ${set.rows.length} | Consumed: ${set.rows.filter(r => r.consumed).length}
        </span>
    </div>`;

    return header + table;
}

// ─────────────────────────────────────────────────
// CONSUME ROW
// ─────────────────────────────────────────────────
function consume_row(frm, state, si, ri, d, pp) {
    collect_row_qtys(d, state);
    frappe.confirm(`Confirm consumption for Mixing #${ri + 1}?`, () => {
        frappe.call({
            method: 'record_mixing_consumption',
            args: { spr_name: frm.doc.name, set_index: si, row_index: ri, state_json: JSON.stringify(state) },
            callback(r) {
                if (!r.exc && r.message) {
                    state.sets = r.message.sets;
                    render_all(d, frm, pp, state);
                    frappe.show_alert({ message: `Mixing #${ri + 1} consumption recorded!`, indicator: 'green' });
                }
            }
        });
    });
}

// ─────────────────────────────────────────────────
// COLLECT EDITED QUANTITIES from inputs → state
// ─────────────────────────────────────────────────
function collect_row_qtys(d, state) {
    d.fields_dict.main_html.$wrapper.find('.row-qty').each(function () {
        let el = $(this);
        let si = parseInt(el.data('set'));
        let ri = parseInt(el.data('row'));
        let field = el.data('field');
        if (state.sets[si]?.rows[ri]) {
            state.sets[si].rows[ri][field] = parseFloat(el.val()) || 0;
        }
    });

    d.fields_dict.main_html.$wrapper.find('.row-qty-extra').each(function () {
        let el = $(this);
        let si = parseInt(el.data('set'));
        let ri = parseInt(el.data('row'));
        let item_code = el.data('item');
        if (state.sets[si]?.rows[ri]) {
            if (!state.sets[si].rows[ri].extras) state.sets[si].rows[ri].extras = {};
            state.sets[si].rows[ri].extras[item_code] = parseFloat(el.val()) || 0;
        }
    });
}

// ─────────────────────────────────────────────────
// PRINT MIXING SHEET (new tab)
// ─────────────────────────────────────────────────
function print_mixing_sheet(state, spr_name, frm) {
    let is_printing = frm ? PRINTING_MACHINES.includes(frm.doc.custom_unit) : false;
    let uses_solvent = frm ? SOLVENT_MACHINES.includes(frm.doc.custom_unit) : false;
    let rows_html = (set, si) => set.rows.map((r, i) => {
        let extras_cols = (set.extras || []).map(ex => `<td style="text-align:center">${(r.extras && r.extras[ex.item_code]) || 0}</td>`).join('');
        if (is_printing) {
            let solvent_cols = uses_solvent ? `
                <td>${r.ea_qty || 0}</td>
                <td>${r.tol_qty || 0}</td>
                <td>${r.iso_qty || 0}</td>
            ` : '';
            return `
            <tr>
                <td>${i + 1}</td>
                <td>${r.ink_qty || 0}</td>
                ${extras_cols}
                ${solvent_cols}
                <td>${r.consumed ? '✅ ' + (r.consumed_at || '').slice(11, 16) : ''}</td>
                <td style="height:28px"></td>
            </tr>`;
        } else {
            return `
            <tr>
                <td>${i + 1}</td>
                <td>${r.pp_qty}</td><td>${r.filler_qty}</td>
                <td>${r.mb_qty}</td><td>${r.anti_qty}</td><td>${r.ppa_qty}</td>
                ${extras_cols}
                <td>${r.consumed ? '✅ ' + (r.consumed_at || '').slice(11, 16) : ''}</td>
                <td style="height:28px"></td>
            </tr>`;
        }
    }).join('');

    let sets_html = state.sets.map((set, si) => {
        let m = set.materials || {};
        let extras_headers = (set.extras || []).map(ex => `<th>${ex.item_name} (kg)</th>`).join('');
        if (is_printing) {
            let solvent_headers = uses_solvent ? `<th>Ethyl Acetate (kg)</th><th>Toluene (kg)</th><th>Iso Butanol (kg)</th>` : '';
            let solvent_p = uses_solvent ? ` |
                Ethyl Acetate: <b>${m.EthylAcetate || '-'}</b> |
                Toluene: <b>${m.Toluene || '-'}</b> |
                Iso Butanol: <b>${m.IsoButanol || '-'}</b>` : '';
            return `
            <h3 style="margin-top:20px">Raw Material Set ${si + 1}</h3>
            <p style="font-size:12px">
                BOPP Ink: <b>${m.Ink || '-'}</b>${solvent_p}
            </p>
            <table border="1" cellpadding="6" cellspacing="0" style="width:100%;font-size:12px;border-collapse:collapse;text-align:center">
                <thead style="background:#eee">
                    <tr><th>#</th><th>BOPP Ink (kg)</th>${extras_headers}${solvent_headers}<th>Time</th><th>Signature</th></tr>
                </thead>
                <tbody>${rows_html(set, si)}</tbody>
            </table>`;
        } else {
            return `
            <h3 style="margin-top:20px">Raw Material Set ${si + 1}</h3>
            <p style="font-size:12px">
                PP: <b>${m.PP || '-'}</b> | Filler: <b>${m.Filler || '-'}</b> |
                Masterbatch: <b>${m.Masterbatch || '-'}</b> | Antistatic: <b>${m.Antistatic || '-'}</b> |
                Modifier: <b>${m.PPA || '-'}</b>
            </p>
            <table border="1" cellpadding="6" cellspacing="0" style="width:100%;font-size:12px;border-collapse:collapse">
                <thead style="background:#eee">
                    <tr><th>#</th><th>PP (kg)</th><th>Filler (kg)</th><th>MB (kg)</th><th>Anti (kg)</th><th>Modifier (kg)</th><th>Time</th><th>Signature</th></tr>
                </thead>
                <tbody>${rows_html(set, si)}</tbody>
            </table>`;
        }
    }).join('');

    let win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head>
        <title>Mixing Sheet — ${spr_name}</title>
        <style>body{font-family:Arial,sans-serif;padding:20px} h2{text-align:center}</style>
    </head><body>
        <h2>MIXING SHEET</h2>
        <p style="text-align:center"><b>${spr_name}</b> | Type: <b>${state.mixing_type}</b> | Printed: ${frappe.datetime.now_datetime()}</p>
        ${sets_html}
        <p style="margin-top:16px;font-size:11px;color:#888">* Supervisor must sign after each mixing. One row = one mixing cycle.</p>
        <script>window.print();</script>
    </body></html>`);
    win.document.close();
}

// ─────────────────────────────────────────────────
// HOURLY REMINDER
// ─────────────────────────────────────────────────
function start_hourly_reminder(frm) {
    if (_reminder_interval) clearInterval(_reminder_interval);

    let check = () => {
        if (!frm.doc.custom_mixing_sheet_data || frm.doc.docstatus !== 0) return;
        let data = JSON.parse(frm.doc.custom_mixing_sheet_data);
        let has_pending = (data.sets || []).some(s => s.rows.some(r => !r.consumed));
        if (!has_pending) return;

        // Check last reminder via localStorage
        let key = `mix_reminder_${frm.doc.name}`;
        let last = parseInt(localStorage.getItem(key) || '0');
        let now = Date.now();
        if (now - last >= 3600000) {
            localStorage.setItem(key, now);
            frappe.confirm(
                `⏰ <b>Hourly Reminder</b><br>Please update the mixing consumption for <b>${frm.doc.name}</b>.`,
                () => open_mixing_sheet(frm)
            );
        }
    };

    check(); // run immediately on load
    _reminder_interval = setInterval(check, 3600000); // then every hour
}

// ─────────────────────────────────────────────────
// BEFORE SUBMIT — update WO materials from mixing sheet
// ─────────────────────────────────────────────────
function finalize_wo_materials(frm) {
    let doc = frm.doc;
    if (!doc.custom_mixing_sheet_data) return Promise.resolve();

    let data = JSON.parse(doc.custom_mixing_sheet_data);
    let item_totals = {}; // item_code -> total_qty
    let is_printing = PRINTING_MACHINES.includes(doc.custom_unit);
    let uses_solvent = SOLVENT_MACHINES.includes(doc.custom_unit);

    (data.sets || []).forEach(set => {
        let m = set.materials || {};
        (set.rows || []).forEach(row => {
            if (!row.consumed) return;
            
            if (is_printing) {
                if (m.Ink) item_totals[m.Ink] = (item_totals[m.Ink] || 0) + (row.ink_qty || 0);
                if (uses_solvent) {
                    if (m.EthylAcetate) item_totals[m.EthylAcetate] = (item_totals[m.EthylAcetate] || 0) + (row.ea_qty || 0);
                    if (m.Toluene)      item_totals[m.Toluene]      = (item_totals[m.Toluene] || 0) + (row.tol_qty || 0);
                    if (m.IsoButanol)   item_totals[m.IsoButanol]   = (item_totals[m.IsoButanol] || 0) + (row.iso_qty || 0);
                }
            } else {
                if (m.PP)          item_totals[m.PP]          = (item_totals[m.PP] || 0) + (row.pp_qty || 0);
                if (m.Filler)      item_totals[m.Filler]      = (item_totals[m.Filler] || 0) + (row.filler_qty || 0);
                if (m.Masterbatch) item_totals[m.Masterbatch] = (item_totals[m.Masterbatch] || 0) + (row.mb_qty || 0);
                if (m.Antistatic)  item_totals[m.Antistatic]  = (item_totals[m.Antistatic] || 0) + (row.anti_qty || 0);
                if (m.PPA)         item_totals[m.PPA]         = (item_totals[m.PPA] || 0) + (row.ppa_qty || 0);
            }
            
            // Add special additives
            if (row.extras) {
                Object.keys(row.extras).forEach(item_code => {
                    item_totals[item_code] = (item_totals[item_code] || 0) + (row.extras[item_code] || 0);
                });
            }
        });
    });

    if (Object.keys(item_totals).length === 0) return Promise.resolve();

    return new Promise(resolve => {
        frappe.call({
            method: 'update_work_order_materials',
            args: {
                spr_name: frm.doc.name,
                item_totals: item_totals
            },
            callback(r) {
                if (!r.exc) frappe.show_alert({ message: 'Work Orders updated with proportional mixing consumption.', indicator: 'green' });
                resolve();
            }
        });
    });
}
