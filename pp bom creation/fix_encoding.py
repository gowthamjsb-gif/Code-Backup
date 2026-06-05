import io

with io.open('client_script.js', 'r', encoding='utf-8') as f:
    content = f.read()

# We know the function "bulk_lamination_dialog" ends at around line 1667 with:
#         bad_visible--;
#         if (bad_visible <= 2) $(this).hide();
#     });
# }

# Let's find this exact string.
target_str = """        bad_visible--;
        if (bad_visible <= 2) $(this).hide();
    });
}"""

idx = content.rfind(target_str)
if idx != -1:
    # Truncate everything after the end of this function
    end_idx = idx + len(target_str)
    new_content = content[:end_idx] + "\n\n"
    
    # Append the pristine slitting function
    slitting_func = """// ═══════════════════════════════════════════════════════════════════════
// SLITTING: Silent auto-assign BOM (no dialog — base fabric only)
// ═══════════════════════════════════════════════════════════════════════
async function assign_slitting_bom(frm, row) {
    await refreshItemCache(true);

    let fab_code = row.custom_base_fabric || null;

    // Source 1: existing BOM
    if (!fab_code && row.bom_no) {
        try {
            let r = await frappe.call({ method: 'frappe.client.get', args: { doctype: 'BOM', name: row.bom_no } });
            if (r.message && r.message.items) {
                let fab = r.message.items.find(it =>
                    (it.item_code || '').length >= 15 || (it.item_name || '').toUpperCase().includes('NON WOVEN')
                );
                if (fab) fab_code = fab.item_code;
            }
        } catch(e) { console.error('Slitting BOM fetch error:', e); }
    }

    // Source 2: mr_items for this row
    if (!fab_code && frm.doc.mr_items && frm.doc.mr_items.length) {
        let mr = frm.doc.mr_items.filter(m => m.production_plan_item === row.name);
        if (!mr.length) mr = frm.doc.mr_items;
        let fab = mr.find(m => (m.item_code || '').length >= 15 || (m.item_name || '').toUpperCase().includes('NON WOVEN'));
        if (fab) fab_code = fab.item_code;
    }

    if (!fab_code) {
        frappe.msgprint({
            title: 'Slitting BOM',
            message: `No base fabric found for <b>${row.item_code}</b>. Please set <b>Base Fabric</b> on this row and try again.`,
            indicator: 'orange'
        });
        return;
    }

    frappe.show_alert({ message: `Creating Slitting BOM for ${row.item_code}…`, indicator: 'blue' });

    try {
        let resp = await frappe.call({
            method: 'create_lamination_bom',
            args: { item_code: row.item_code, lam_side: 'Slitting', lam_items: [{ item_code: fab_code, qty: 1.0 }], force_new: 1 }
        });
        if (resp.message && !resp.message.startsWith('Error')) {
            frappe.model.set_value(row.doctype, row.name, 'bom_no', resp.message);
            frappe.model.set_value(row.doctype, row.name, 'custom_base_fabric', fab_code);
            if (frm.fields_dict && frm.fields_dict.consider_projected_qty) frm.set_value('consider_projected_qty', 0);
            frm.clear_table('mr_items');
            await frm.save();
            setTimeout(() => frm.trigger('get_raw_materials'), 500);
            frappe.show_alert({ message: `✅ Slitting BOM: ${resp.message}`, indicator: 'green' });
        } else {
            frappe.msgprint({ title: 'Slitting BOM Failed', message: resp.message || 'No server response.', indicator: 'red' });
        }
    } catch(e) {
        frappe.msgprint({ title: 'Slitting BOM Error', message: String(e), indicator: 'red' });
    }
}
"""
    new_content += slitting_func
    
    with io.open('client_script.js', 'w', encoding='utf-8', newline='\n') as f:
        f.write(new_content)
    print("SUCCESS")
else:
    print("TARGET STRING NOT FOUND")
