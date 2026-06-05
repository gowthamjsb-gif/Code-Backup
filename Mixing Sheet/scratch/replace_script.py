import re

with open(r"c:\Users\Admin\Documents\Code\Mixing Sheet\shaft_production_run_mixing_sheet.js", "r", encoding="utf-8") as f:
    code = f.read()

# 1. Add SOLVENT_MACHINES
code = code.replace(
"""const PRINTING_MACHINES = [
    'VR - 1200MM BOPP PRINTING MACHINE',
    'JVE - PRINTING MACHINE 2 COLOUR 1600MM',
    'JVE - PRINTING MACHINE 4 COLOUR 1600MM',
    'TT - PRINTING MACHINE 4 COLOUR 1200MM'
];""",
"""const PRINTING_MACHINES = [
    'VR - 1200MM BOPP PRINTING MACHINE',
    'JVE - PRINTING MACHINE 2 COLOUR 1600MM',
    'JVE - PRINTING MACHINE 4 COLOUR 1600MM',
    'TT - PRINTING MACHINE 4 COLOUR 1200MM'
];

const SOLVENT_MACHINES = [
    'VR - 1200MM BOPP PRINTING MACHINE'
];"""
)

# 2. show_dialog
code = code.replace(
"""    let is_printing = PRINTING_MACHINES.includes(frm.doc.custom_unit);""",
"""    let is_printing = PRINTING_MACHINES.includes(frm.doc.custom_unit);
    let uses_solvent = SOLVENT_MACHINES.includes(frm.doc.custom_unit);"""
)

code = code.replace(
"""    if (is_printing) {
        fields.push(
            { fieldtype: 'Column Break' },
            { fieldname: 'ink_item', label: 'BOPP Ink (BOM)', fieldtype: 'Link', options: 'Item', get_query: () => ({ filters: { item_code: ['like', 'INK -%'] } }) },
            { fieldtype: 'Column Break' },
            { fieldname: 'ethyl_acetate_item', label: 'Ethyl Acetate', fieldtype: 'Link', options: 'Item' },
            { fieldtype: 'Column Break' },
            { fieldname: 'toluene_item', label: 'Toluene', fieldtype: 'Link', options: 'Item' },
            { fieldtype: 'Column Break' },
            { fieldname: 'iso_butanol_item', label: 'Iso Butanol (Optional)', fieldtype: 'Link', options: 'Item' }
        );
    } else {""",
"""    if (is_printing) {
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
    } else {"""
)

code = code.replace(
"""    if (is_printing) {
        d.set_value('ink_item', m0.Ink || '');
        d.set_value('ethyl_acetate_item', m0.EthylAcetate || 'CM - 5003001');
        d.set_value('toluene_item', m0.Toluene || 'CM - 5003002');
        d.set_value('iso_butanol_item', m0.IsoButanol || 'CM - 5003002');
    } else {""",
"""    if (is_printing) {
        d.set_value('ink_item', m0.Ink || '');
        if (uses_solvent) {
            d.set_value('ethyl_acetate_item', m0.EthylAcetate || 'CM - 5003001');
            d.set_value('toluene_item', m0.Toluene || 'CM - 5003002');
            d.set_value('iso_butanol_item', m0.IsoButanol || 'CM - 5003002');
        }
    } else {"""
)

# 3. save_raw_materials
code = code.replace(
"""function save_raw_materials(d, frm, pp, state) {
    let is_printing = PRINTING_MACHINES.includes(frm.doc.custom_unit);""",
"""function save_raw_materials(d, frm, pp, state) {
    let is_printing = PRINTING_MACHINES.includes(frm.doc.custom_unit);
    let uses_solvent = SOLVENT_MACHINES.includes(frm.doc.custom_unit);"""
)

code = code.replace(
"""    let selected = {};
    if (is_printing) {
        if (!v.ink_item || !v.ethyl_acetate_item || !v.toluene_item) {
            frappe.msgprint('Please select Ink, Ethyl Acetate, and Toluene before saving. Iso Butanol is optional.');
            return;
        }
        selected = { 
            Ink: v.ink_item,
            EthylAcetate: v.ethyl_acetate_item,
            Toluene: v.toluene_item,
            IsoButanol: v.iso_butanol_item || ''
        };
    } else {""",
"""    let selected = {};
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
    } else {"""
)

code = code.replace(
"""        let fetches = is_printing
            ? [
                frappe.db.get_value('Item', selected.Ink, 'item_name'),
                frappe.db.get_value('Item', selected.EthylAcetate, 'item_name'),
                frappe.db.get_value('Item', selected.Toluene, 'item_name'),
                selected.IsoButanol ? frappe.db.get_value('Item', selected.IsoButanol, 'item_name') : Promise.resolve(null)
            ]
            : [""",
"""        let fetches = is_printing
            ? (uses_solvent ? [
                frappe.db.get_value('Item', selected.Ink, 'item_name'),
                frappe.db.get_value('Item', selected.EthylAcetate, 'item_name'),
                frappe.db.get_value('Item', selected.Toluene, 'item_name'),
                selected.IsoButanol ? frappe.db.get_value('Item', selected.IsoButanol, 'item_name') : Promise.resolve(null)
            ] : [
                frappe.db.get_value('Item', selected.Ink, 'item_name')
            ])
            : ["""
)

code = code.replace(
"""        Promise.all(fetches).then(results => {
            if (is_printing) {
                state.sets[index].item_names = {
                    Ink:          results[0]?.message?.item_name || selected.Ink,
                    EthylAcetate: results[1]?.message?.item_name || selected.EthylAcetate,
                    Toluene:      results[2]?.message?.item_name || selected.Toluene,
                    IsoButanol:   results[3]?.message?.item_name || selected.IsoButanol
                };
            } else {""",
"""        Promise.all(fetches).then(results => {
            if (is_printing) {
                state.sets[index].item_names = {
                    Ink: results[0]?.message?.item_name || selected.Ink
                };
                if (uses_solvent) {
                    state.sets[index].item_names.EthylAcetate = results[1]?.message?.item_name || selected.EthylAcetate;
                    state.sets[index].item_names.Toluene = results[2]?.message?.item_name || selected.Toluene;
                    state.sets[index].item_names.IsoButanol = results[3]?.message?.item_name || selected.IsoButanol;
                }
            } else {"""
)

code = code.replace(
"""        if (is_printing) {
            items_changed = last_set.materials?.Ink && (
                last_set.materials.Ink !== selected.Ink ||
                last_set.materials.EthylAcetate !== selected.EthylAcetate ||
                last_set.materials.Toluene !== selected.Toluene ||
                last_set.materials.IsoButanol !== selected.IsoButanol
            );
        } else {""",
"""        if (is_printing) {
            items_changed = last_set.materials?.Ink && (last_set.materials.Ink !== selected.Ink);
            if (uses_solvent && items_changed === false) {
                items_changed = last_set.materials?.EthylAcetate !== selected.EthylAcetate ||
                                last_set.materials?.Toluene !== selected.Toluene ||
                                last_set.materials?.IsoButanol !== selected.IsoButanol;
            }
        } else {"""
)

code = code.replace(
"""    let check_mismatches_and_apply = (expected) => {
        let mismatches = [];
        if (is_printing) {
            if (expected.Ink && selected.Ink !== expected.Ink) mismatches.push(`• Ink: <span style="color:red">${selected.Ink}</span> (PP expects <b>${expected.Ink}</b>)`);
            if (expected.EthylAcetate && selected.EthylAcetate !== expected.EthylAcetate) mismatches.push(`• Ethyl Acetate: <span style="color:red">${selected.EthylAcetate}</span> (PP expects <b>${expected.EthylAcetate}</b>)`);
            if (expected.Toluene && selected.Toluene !== expected.Toluene) mismatches.push(`• Toluene: <span style="color:red">${selected.Toluene}</span> (PP expects <b>${expected.Toluene}</b>)`);
            if (expected.IsoButanol && selected.IsoButanol !== expected.IsoButanol) mismatches.push(`• Iso Butanol: <span style="color:red">${selected.IsoButanol}</span> (PP expects <b>${expected.IsoButanol}</b>)`);
        } else {""",
"""    let check_mismatches_and_apply = (expected) => {
        let mismatches = [];
        if (is_printing) {
            if (expected.Ink && selected.Ink !== expected.Ink) mismatches.push(`• Ink: <span style="color:red">${selected.Ink}</span> (PP expects <b>${expected.Ink}</b>)`);
            if (uses_solvent) {
                if (expected.EthylAcetate && selected.EthylAcetate !== expected.EthylAcetate) mismatches.push(`• Ethyl Acetate: <span style="color:red">${selected.EthylAcetate}</span> (PP expects <b>${expected.EthylAcetate}</b>)`);
                if (expected.Toluene && selected.Toluene !== expected.Toluene) mismatches.push(`• Toluene: <span style="color:red">${selected.Toluene}</span> (PP expects <b>${expected.Toluene}</b>)`);
                if (expected.IsoButanol && selected.IsoButanol !== expected.IsoButanol) mismatches.push(`• Iso Butanol: <span style="color:red">${selected.IsoButanol}</span> (PP expects <b>${expected.IsoButanol}</b>)`);
            }
        } else {"""
)

code = code.replace(
"""    frappe.model.with_doc('Production Plan', frm.doc.production_plan, () => {
        let pp_doc = frappe.get_doc('Production Plan', frm.doc.production_plan);
        let expected = is_printing ? { Ink: '', EthylAcetate: '', Toluene: '', IsoButanol: '' } : { PP: '', Filler: '', Masterbatch: '', Antistatic: '', PPA: '' };
        let all_seen = [];""",
"""    frappe.model.with_doc('Production Plan', frm.doc.production_plan, () => {
        let pp_doc = frappe.get_doc('Production Plan', frm.doc.production_plan);
        let expected = is_printing ? (uses_solvent ? { Ink: '', EthylAcetate: '', Toluene: '', IsoButanol: '' } : { Ink: '' }) : { PP: '', Filler: '', Masterbatch: '', Antistatic: '', PPA: '' };
        let all_seen = [];"""
)

code = code.replace(
"""            if (is_printing) {
                if (upper.startsWith('INK -') && !expected.Ink) expected.Ink = code;
                else if (upper.includes('ETHYL') && !expected.EthylAcetate) expected.EthylAcetate = code;
                else if (upper.includes('TOLUENE') && !expected.Toluene) expected.Toluene = code;
                else if ((upper.includes('ISO BUTANOL') || upper.includes('ISOBUTANOL') || upper.includes('ISO BUTANYL')) && !expected.IsoButanol) expected.IsoButanol = code;
            } else {""",
"""            if (is_printing) {
                if (upper.startsWith('INK -') && !expected.Ink) expected.Ink = code;
                else if (uses_solvent) {
                    if (upper.includes('ETHYL') && !expected.EthylAcetate) expected.EthylAcetate = code;
                    else if (upper.includes('TOLUENE') && !expected.Toluene) expected.Toluene = code;
                    else if ((upper.includes('ISO BUTANOL') || upper.includes('ISOBUTANOL') || upper.includes('ISO BUTANYL')) && !expected.IsoButanol) expected.IsoButanol = code;
                }
            } else {"""
)

code = code.replace(
"""        let load_boms = (index) => {
            let done = is_printing ? (expected.Ink && expected.EthylAcetate && expected.Toluene) : (expected.PP && expected.Filler);
            if (index >= bom_nos.length || done) {
                if (is_printing) {
                    if (!expected.Ink) expected.Ink = `(Not Found. Saw: ${all_seen.join(', ') || 'Nothing'})`;
                    if (!expected.EthylAcetate) expected.EthylAcetate = 'CM - 5003001';
                    if (!expected.Toluene) expected.Toluene = 'CM - 5003002';
                    if (!expected.IsoButanol) expected.IsoButanol = 'CM - 5003002';
                } else {""",
"""        let load_boms = (index) => {
            let done = is_printing ? (uses_solvent ? (expected.Ink && expected.EthylAcetate && expected.Toluene) : expected.Ink) : (expected.PP && expected.Filler);
            if (index >= bom_nos.length || done) {
                if (is_printing) {
                    if (!expected.Ink) expected.Ink = `(Not Found. Saw: ${all_seen.join(', ') || 'Nothing'})`;
                    if (uses_solvent) {
                        if (!expected.EthylAcetate) expected.EthylAcetate = 'CM - 5003001';
                        if (!expected.Toluene) expected.Toluene = 'CM - 5003002';
                        if (!expected.IsoButanol) expected.IsoButanol = 'CM - 5003002';
                    }
                } else {"""
)

# 5. build_rows
code = code.replace(
"""function build_rows(set_obj, pp, mixing_type, is_printing) {
    let is_half = mixing_type === 'Half Mixing';""",
"""function build_rows(set_obj, pp, mixing_type, is_printing, uses_solvent) {
    let is_half = mixing_type === 'Half Mixing';"""
)

code = code.replace(
"""    for (let i = 0; i < count; i++) {
        if (is_printing) {
            set_obj.rows.push({
                ink_qty: 0,
                ea_qty: 0,
                tol_qty: 0,
                iso_qty: 0,
                consumed: false, consumed_by: null, consumed_at: null
            });
        } else {""",
"""    for (let i = 0; i < count; i++) {
        if (is_printing) {
            let row = { ink_qty: 0, consumed: false, consumed_by: null, consumed_at: null };
            if (uses_solvent) {
                row.ea_qty = 0;
                row.tol_qty = 0;
                row.iso_qty = 0;
            }
            set_obj.rows.push(row);
        } else {"""
)

code = code.replace(
"""        state.sets[index].rows      = []; // Clear rows for this specific set
        build_rows(state.sets[index], pp, v.mixing_type, is_printing);""",
"""        state.sets[index].rows      = []; // Clear rows for this specific set
        build_rows(state.sets[index], pp, v.mixing_type, is_printing, uses_solvent);"""
)

# 6. render_all
code = code.replace(
"""        if (is_printing) {
            state.sets[si].rows.push({
                ink_qty: 0,
                ea_qty: 0,
                tol_qty: 0,
                iso_qty: 0,
                consumed: false, consumed_by: null, consumed_at: null
            });
        } else {""",
"""        if (is_printing) {
            let uses_solvent = SOLVENT_MACHINES.includes(frm.doc.custom_unit);
            let row = { ink_qty: 0, consumed: false, consumed_by: null, consumed_at: null };
            if (uses_solvent) {
                row.ea_qty = 0;
                row.tol_qty = 0;
                row.iso_qty = 0;
            }
            state.sets[si].rows.push(row);
        } else {"""
)

# 7. render_set_html
code = code.replace(
"""function render_set_html(set, si, frm, state, d, pp) {
    let is_printing = PRINTING_MACHINES.includes(frm.doc.custom_unit);""",
"""function render_set_html(set, si, frm, state, d, pp) {
    let is_printing = PRINTING_MACHINES.includes(frm.doc.custom_unit);
    let uses_solvent = SOLVENT_MACHINES.includes(frm.doc.custom_unit);"""
)

code = code.replace(
"""        if (is_printing) {
            rows_html += `<tr style="${row.consumed ? 'background:#f0fff0' : ''}">
                <td style="text-align:center;width:40px">${ri + 1}</td>
                <td><input class="form-control form-control-sm row-qty" data-set="${si}" data-row="${ri}" data-field="ink_qty" value="${row.ink_qty || 0}" style="width:70px;text-align:center"></td>
                ${extras_cols}
                <td><input class="form-control form-control-sm row-qty" data-set="${si}" data-row="${ri}" data-field="ea_qty" value="${row.ea_qty || 0}" style="width:70px;text-align:center"></td>
                <td><input class="form-control form-control-sm row-qty" data-set="${si}" data-row="${ri}" data-field="tol_qty" value="${row.tol_qty || 0}" style="width:70px;text-align:center"></td>
                <td><input class="form-control form-control-sm row-qty" data-set="${si}" data-row="${ri}" data-field="iso_qty" value="${row.iso_qty || 0}" style="width:70px;text-align:center"></td>
                <td style="text-align:center">${status_badge}</td>
            </tr>`;
        } else {""",
"""        if (is_printing) {
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
        } else {"""
)

code = code.replace(
"""    let table = '';
    if (is_printing) {
        table = `
        <table class="table table-bordered table-sm" style="margin-top:8px;font-size:13px">
            <thead>
                <tr>
                    <th style="background:#d1f2ff;width:40px">#</th>
                    <th style="background:#c7ffbc">${names.Ink || m.Ink || 'BOPP Ink'} (kg)</th>
                    ${(set.extras || []).map(ex => `<th style="background:#e1f5fe">${ex.item_name} (kg)</th>`).join('')}
                    <th style="background:#ffcc80">${names.EthylAcetate || m.EthylAcetate || 'Ethyl Acetate'} (kg)</th>
                    <th style="background:#b39ddb">${names.Toluene || m.Toluene || 'Toluene'} (kg)</th>
                    <th style="background:#80cbc4">${names.IsoButanol || m.IsoButanol || 'Iso Butanol'} (kg)</th>
                    <th style="background:#f0e6ff">Status</th>
                </tr>
            </thead>
            <tbody>${rows_html}</tbody>
        </table>`;
    } else {""",
"""    let table = '';
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
    } else {"""
)

# 8. print_mixing_sheet
code = code.replace(
"""function print_mixing_sheet(state, spr_name, frm) {
    let is_printing = frm ? PRINTING_MACHINES.includes(frm.doc.custom_unit) : false;""",
"""function print_mixing_sheet(state, spr_name, frm) {
    let is_printing = frm ? PRINTING_MACHINES.includes(frm.doc.custom_unit) : false;
    let uses_solvent = frm ? SOLVENT_MACHINES.includes(frm.doc.custom_unit) : false;"""
)

code = code.replace(
"""        if (is_printing) {
            return `
            <tr>
                <td>${i + 1}</td>
                <td>${r.ink_qty || 0}</td>
                ${extras_cols}
                <td>${r.ea_qty || 0}</td>
                <td>${r.tol_qty || 0}</td>
                <td>${r.iso_qty || 0}</td>
                <td>${r.consumed ? '✅ ' + (r.consumed_at || '').slice(11, 16) : ''}</td>
                <td style="height:28px"></td>
            </tr>`;
        } else {""",
"""        if (is_printing) {
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
        } else {"""
)

code = code.replace(
"""        if (is_printing) {
            return `
            <h3 style="margin-top:20px">Raw Material Set ${si + 1}</h3>
            <p style="font-size:12px">
                BOPP Ink: <b>${m.Ink || '-'}</b> |
                Ethyl Acetate: <b>${m.EthylAcetate || '-'}</b> |
                Toluene: <b>${m.Toluene || '-'}</b> |
                Iso Butanol: <b>${m.IsoButanol || '-'}</b>
            </p>
            <table border="1" cellpadding="6" cellspacing="0" style="width:100%;font-size:12px;border-collapse:collapse;text-align:center">
                <thead style="background:#eee">
                    <tr><th>#</th><th>BOPP Ink (kg)</th>${extras_headers}<th>Ethyl Acetate (kg)</th><th>Toluene (kg)</th><th>Iso Butanol (kg)</th><th>Time</th><th>Signature</th></tr>
                </thead>
                <tbody>${rows_html(set, si)}</tbody>
            </table>`;
        } else {""",
"""        if (is_printing) {
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
        } else {"""
)

# 9. finalize_wo_materials
code = code.replace(
"""function finalize_wo_materials(frm) {
    let doc = frm.doc;
    if (!doc.custom_mixing_sheet_data) return;
    
    let is_printing = PRINTING_MACHINES.includes(doc.custom_unit);""",
"""function finalize_wo_materials(frm) {
    let doc = frm.doc;
    if (!doc.custom_mixing_sheet_data) return;
    
    let is_printing = PRINTING_MACHINES.includes(doc.custom_unit);
    let uses_solvent = SOLVENT_MACHINES.includes(doc.custom_unit);"""
)

code = code.replace(
"""            if (is_printing) {
                if (m.Ink)          item_totals[m.Ink]          = (item_totals[m.Ink] || 0) + (row.ink_qty || 0);
                if (m.EthylAcetate) item_totals[m.EthylAcetate] = (item_totals[m.EthylAcetate] || 0) + (row.ea_qty || 0);
                if (m.Toluene)      item_totals[m.Toluene]      = (item_totals[m.Toluene] || 0) + (row.tol_qty || 0);
                if (m.IsoButanol)   item_totals[m.IsoButanol]   = (item_totals[m.IsoButanol] || 0) + (row.iso_qty || 0);
            } else {""",
"""            if (is_printing) {
                if (m.Ink) item_totals[m.Ink] = (item_totals[m.Ink] || 0) + (row.ink_qty || 0);
                if (uses_solvent) {
                    if (m.EthylAcetate) item_totals[m.EthylAcetate] = (item_totals[m.EthylAcetate] || 0) + (row.ea_qty || 0);
                    if (m.Toluene)      item_totals[m.Toluene]      = (item_totals[m.Toluene] || 0) + (row.tol_qty || 0);
                    if (m.IsoButanol)   item_totals[m.IsoButanol]   = (item_totals[m.IsoButanol] || 0) + (row.iso_qty || 0);
                }
            } else {"""
)

with open(r"c:\Users\Admin\Documents\Code\Mixing Sheet\shaft_production_run_mixing_sheet.js", "w", encoding="utf-8") as f:
    f.write(code)

print("Done")
