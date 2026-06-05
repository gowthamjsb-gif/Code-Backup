// Separate script for Shaft Production Run Wastage Label
// Paste this into the Client Script for "Shaft Production Run" or a new one for "Shaft Production Run Wastage"

frappe.ui.form.on('Shaft Production Run Wastage', {
    print_label: function (frm, cdt, cdn) {
        var row = locals[cdt][cdn];
        if (!row) return;

        // Try to find matching production item to fetch batch_no and order code
        var job_id = row.job_id || row.job || row.custom_job || row.custom_job_id || "";
        var item_row = ((frm.doc || {}).items || []).find(function(i) { 
            return (i.job_id == job_id || i.job == job_id || i.custom_job_id == job_id || i.idx == job_id); 
        });

        var batch_val = row.batch_no || (item_row ? (item_row.batch_no || "") : "");
        var order_val = item_row ? (item_row.party_code || "") : "";

        // Extract and refine data for wastage label
        var d = {
            company: "JAYASHREE SPUN BOND",
            header: "PATTY WASTE",
            quality: row.quality || (item_row ? item_row.quality : "NON WOVEN FABRIC"),
            gsm: row.gsm || (item_row ? item_row.gsm : ""),
            color: row.color || (item_row ? item_row.color : ""),
            width_val: row.width_inches || row.width || "0",
            net_weight: flt(row.net_wastage || row.wastage_qty_kgs || row.wastage_qty || 0).toFixed(2),
            batch_no: batch_val,
            barcode_data: batch_val,
            order_code: order_val,
            date: frm.doc.posting_date || frappe.datetime.get_today()
        };

        var htmlContent = get_wastage_grid_format(d);
        var printWindow = window.open('', '_blank', 'height=650,width=500');
        if (printWindow) {
            printWindow.document.write(htmlContent);
            printWindow.document.close();
        }
    }
});

function get_wastage_grid_format(d) {
    var rows = [];
    rows.push('<tr><td><span class="lbl">Date</span></td><td class="colon">:</td><td><span class="val">' + frappe.datetime.str_to_user(d.date) + '</span></td></tr>');
    rows.push('<tr><td><span class="lbl">Quality</span></td><td class="colon">:</td><td><span class="val">' + d.quality + '</span></td></tr>');
    rows.push('<tr><td><span class="lbl">Color</span></td><td class="colon">:</td><td><span class="val">' + d.color + '</span></td></tr>');
    rows.push('<tr><td><span class="lbl">GSM</span></td><td class="colon">:</td><td><span class="val">' + d.gsm + '</span></td></tr>');
    rows.push('<tr><td><span class="lbl">Width</span></td><td class="colon">:</td><td><span class="val">' + d.width_val + ' Inches</span></td></tr>');
    rows.push('<tr><td><span class="lbl">Net Weight</span></td><td class="colon">:</td><td><span class="val">' + d.net_weight + ' Kgs</span></td></tr>');

    var btm_html = '<div class="btm-info-row">' +
        '<span class="lbl">BATCH No: </span><span class="val-large">' + d.batch_no + '</span>';
    if (d.order_code) {
        btm_html += '<span class="lbl" style="margin-left:12px;">Order: </span><span class="val-large">' + d.order_code + '</span>';
    }
    btm_html += '</div>';

    return '<html><head><title>Wastage Label Preview</title><style>' +
        '@media print { .btn-panel { display: none !important; } @page { size: 4in 4in; margin: 0; } body { margin: 0; } }' +
        'body { font-family: "Arial", sans-serif; margin: 0; padding: 0; text-align: center; background: #eee; font-size: 1.05em; }' +
        '.btn-panel { padding: 10px; background: #eee; }' +
        '.sticker { width: 4in; height: 4in; margin: 20px auto; border: 1px solid black; background: white; box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden; }' +
        '.inner-border { border: 2px solid black; margin: 6px; padding: 6px; flex-grow: 1; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; }' +
        '.header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 4px; margin-bottom: 4px; }' +
        '.company { font-size: 24px; font-weight: 900; letter-spacing: 0.5px; margin-bottom: 2px; }' +
        '.email { font-size: 12px; font-weight: bold; color: #444; margin-bottom: 2px; }' +
        '.wastage-header { font-size: 18px; font-weight: 900; color: #d32f2f; letter-spacing: 1px; margin-top: 2px; }' +
        '.table-container { flex-grow: 1; display: flex; flex-direction: column; justify-content: center; margin: 4px 0; }' +
        'table { width: 95%; border-collapse: collapse; margin: 0 auto; }' +
        'td { padding: 4px 0; vertical-align: middle; border: none; text-align: left; }' +
        'td:nth-child(1) { width: 42%; padding-left: 15px; }' +
        'td.colon { width: 6%; text-align: center; font-weight: bold; font-size: 15px; }' +
        'td:nth-child(3) { width: 52%; }' +
        '.lbl { font-size: 13px; font-weight: 900; color: #333; }' +
        '.val { font-size: 14px; font-weight: 900; color: #000; margin-left: 2px; }' +
        '.val-large { font-size: 14px; font-weight: 900; color: #000; }' +
        '.btm-info-row { border-top: 2px dashed #666; padding-top: 4px; margin: 0 10px; text-align: center; white-space: nowrap; overflow: hidden; }' +
        '.barcode-container { display: flex; justify-content: center; align-items: center; padding: 2px 0 2px 0; }' +
        '#barcode { max-width: 95%; height: auto; }' +
        '</style></head><body>' +
        '<div class="btn-panel"><button onclick="window.print()" style="padding:10px 20px; font-weight:bold; cursor:pointer;">PRINT</button><button onclick="window.close()" style="padding:10px 20px; margin-left:10px;">CLOSE</button></div>' +
        '<div class="sticker"><div class="inner-border">' +
        '<div class="header"><div class="company">' + d.company + '</div><div class="email">enquiry@jayashreespunbond.com</div><div class="wastage-header">' + d.header + '</div></div>' +
        '<div class="table-container"><table>' + rows.join('') + '</table></div>' +
        btm_html +
        '<div class="barcode-container"><svg id="barcode"></svg></div>' +
        '</div></div>' +
        '<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.0/dist/JsBarcode.all.min.js"></script>' +
        '<script>JsBarcode("#barcode", "' + d.barcode_data + '", { format: "CODE128", displayValue: true, fontSize: 12, textMargin: 1, height: 28, width: 1.6, margin: 0 });</script>' +
        '</body></html>';
}
