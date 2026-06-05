// Inside your dialog's primary_action function:
// let planned_jobs = dialog.get_values().jobs; // Assuming your table data is here

// frappe.call({
//     method: "your_app.your_module.api.create_roll_production_entries", // Update with your actual API path
//     args: {
//         jobs: planned_jobs,
//         sales_order: cur_frm.doc.name // Or wherever you get the SO from
//     },
//     callback: function(r) {
//         if (!r.exc) {
//             frappe.msgprint(__("Successfully created Roll Production Entries for production."));
//             dialog.hide();
//         }
//     }
// });

frappe.ui.form.on('Roll Production Entry', {
    refresh: function (frm) {

        // Add Submit Button if in Draft status
        if (frm.doc.status !== "Completed" && !frm.is_dirty()) {
            frm.add_custom_button(__('Submit Roll'), function () {
                frappe.confirm('Are you sure you want to submit this roll? This will create Stock Entries for all rows.',
                    () => {
                        frappe.call({
                            method: "create_stock_entries_for_roll",
                            args: { doc_name: frm.doc.name },
                            freeze: true,
                            freeze_message: "Creating Stock Entries...",
                            callback: function (r) {
                                if (!r.exc) {
                                    frappe.msgprint("Stock Entries created successfully!");
                                    frm.reload_doc();
                                    trigger_bulk_label_print(frm);
                                }
                            }
                        });
                    }
                );
            }).addClass('btn-primary');
        }
        validate_total_width(frm);
    }
});

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
            frappe.msgprint({
                title: __('Warning'),
                indicator: 'red',
                message: __('The total required width for Shaft ' + s_num + ' (' + shaft_totals[s_num] + ') exceeds the batch width (' + frm.doc.custom_batch_width + ').')
            });
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
