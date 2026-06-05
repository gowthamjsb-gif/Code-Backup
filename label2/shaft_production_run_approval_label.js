// Separate script for Shaft Production Run Approval Label
// Paste this into a new Client Script in ERPNext
// DocType: Shaft Production Run

frappe.ui.form.on('Shaft Production Run Item', {
    custom_approval_label: function (frm, cdt, cdn) {
        frappe.generate_approval_label(cdn, frm);
    }
});

frappe.generate_approval_label = function (row_name, frm) {
    var f = frm || cur_frm;
    if (!f || !f.doc) return;

    var row = (locals['Shaft Production Run Item'] || {})[row_name] || (f.doc.items || []).find(function (r) { return r.name === row_name; });
    if (!row) return;

    var emp_ids = [];
    if (f.doc.custom_operator) emp_ids.push(f.doc.custom_operator);
    if (f.doc.custom_supervisor) emp_ids.push(f.doc.custom_supervisor);

    if (emp_ids.length > 0) {
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Employee',
                filters: { name: ['in', emp_ids] },
                fields: ['name', 'employee_name']
            },
            callback: function (r) {
                var names_map = {};
                if (r.message) {
                    r.message.forEach(function (emp) { names_map[emp.name] = emp.employee_name; });
                }
                finish_generation(names_map);
            }
        });
    } else {
        finish_generation({});
    }

    function finish_generation(names_map) {
        var raw_batch = row.batch_no || "";

        var d = {
            company: "JAYASHREE SPUN BOND",
            batch_no: raw_batch,
            entered_by: (names_map[f.doc.custom_operator] || f.doc.custom_operator || "").toUpperCase(),
            checked_by: "",
            verified_by: "",
            despatched_by: ""
        };

        var htmlContent = get_approval_grid_format(d);
        var printWindow = window.open('', '_blank', 'height=500,width=500');
        if (printWindow) {
            printWindow.document.write(htmlContent);
            printWindow.document.close();
        }
    }
};

function get_approval_grid_format(d) {
    return '<html><head><title>Approval Label</title><style>' +
        '@media print { .btn-panel { display: none !important; } @page { size: 4in 4in; margin: 0; } body { margin: 0; } }' +
        'body { font-family: "Arial", sans-serif; margin: 0; padding: 0; text-align: center; background: #eee; }' +
        '.btn-panel { padding: 10px; background: #eee; }' +
        '.sticker { width: 4in; height: 4in; margin: 20px auto; border: 1px solid black; background: white; box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden; }' +
        '.inner-border { border: 2px solid black; margin: 6px; padding: 6px; flex-grow: 1; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; }' +
        '.header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 4px; margin-bottom: 4px; }' +
        '.company { font-size: 24px; font-weight: 900; letter-spacing: 0.5px; margin-bottom: 2px; }' +
        '.email { font-size: 12px; font-weight: bold; color: #444; margin-bottom: 2px; }' +
        '.batch-row { display: flex; justify-content: center; align-items: center; border-bottom: 2px dashed #666; padding-bottom: 6px; margin: 4px 10px; }' +
        '.batch-no { font-size: 18px; font-weight: 900; color: #000; }' +
        '.table-container { flex-grow: 1; display: flex; flex-direction: column; justify-content: flex-start; margin: 4px 0; }' +
        'table { width: 95%; border-collapse: collapse; margin: 0 auto; }' +
        'td { padding: 18px 0; vertical-align: middle; border: 1px solid #ddd; text-align: left; }' +
        'td:nth-child(1) { width: 42%; padding-left: 10px; font-weight: 900; color: #333; font-size: 14px; background: #f9f9f9; }' +
        'td:nth-child(2) { width: 58%; padding-left: 10px; font-weight: 900; color: #000; font-size: 14px; }' +
        '.footer { font-size: 10px; color: #999; margin-top: auto; padding-bottom: 2px; }' +
        '</style></head><body>' +
        '<div class="btn-panel"><button onclick="window.print()" style="padding:10px 20px; font-weight:bold; cursor:pointer;">PRINT</button><button onclick="window.close()" style="padding:10px 20px; margin-left:10px;">CLOSE</button></div>' +
        '<div class="sticker"><div class="inner-border">' +
        '<div class="header"><div class="company">' + d.company + '</div><div class="email">enquiry@jayashreespunbond.com</div></div>' +
        '<div class="batch-row"><span class="batch-no">BATCH No : ' + d.batch_no + '</span></div>' +
        '<div class="table-container"><table>' +
        '<tr><td>Entered By</td><td>' + d.entered_by + '</td></tr>' +
        '<tr><td>Checked By</td><td>' + d.checked_by + '</td></tr>' +
        '<tr><td>Verified By</td><td>' + d.verified_by + '</td></tr>' +
        '<tr><td>Despatched By</td><td>' + d.despatched_by + '</td></tr>' +
        '</table></div>' +
        '<div class="footer">Approval Label - System Generated</div>' +
        '</div></div></body></html>';
}
