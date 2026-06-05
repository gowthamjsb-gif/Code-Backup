/**
 * FINAL CLIENT SCRIPT
 * Add this to the 'Roll Production Entry' Client Script in ERPNext
 */

frappe.ui.form.on('Roll Production Entry', {
    refresh: function (frm) {
        // Add "Submit Roll" button if status is not Completed
        if (frm.doc.status !== "Completed" && !frm.is_dirty()) {
            frm.add_custom_button(__('Submit Roll'), function () {
                frappe.confirm('Create Stock Entries for all rolls?', () => {
                    frappe.call({
                        method: "create_stock_entries_for_roll",
                        args: { doc_name: frm.doc.name },
                        freeze: true,
                        freeze_message: "Processing...",
                        callback: function (r) {
                            if (!r.exc) {
                                frappe.msgprint("Stock Entries created and submitted successfully!");
                                frm.reload_doc();
                                trigger_bulk_label_print(frm);
                            }
                        }
                    });
                });
            }).addClass('btn-primary');
        }
    }
});

// Row-level Width Validation
frappe.ui.form.on('Roll Production Entry Item', {
    width: function (frm, cdt, cdn) {
        validate_total_width(frm);
    },
    roll_wise_entry_remove: function (frm) {
        validate_total_width(frm);
    }
});

function validate_total_width(frm) {
    if (!frm.doc.custom_batch_width) return;
    let shaft_totals = {};
    (frm.doc.roll_wise_entry || []).forEach(row => {
        let s_num = row.shaft_number || 1;
        if (!shaft_totals[s_num]) shaft_totals[s_num] = 0;
        shaft_totals[s_num] += flt(row.width);
    });
    for (let s_num in shaft_totals) {
        if (shaft_totals[s_num] > frm.doc.custom_batch_width) {
            frappe.msgprint(__('Shaft ' + s_num + ' width (' + shaft_totals[s_num] + ') exceeds limit (' + frm.doc.custom_batch_width + ')'));
            break;
        }
    }
}

function trigger_bulk_label_print(frm) {
    let print_url = frappe.urllib.get_full_url(
        '/printview?doctype=Roll Production Entry&name=' + frm.doc.name + '&format=Roll Label'
    );
    window.open(print_url, '_blank');
}
