// Client Script for "Bundle Stickers"
// Depending on whether this is a Standalone DocType or a Child Table, use the appropriate hook:

// --- Use this if "Bundle Stickers" is a STANDALONE DocType ---
// frappe.ui.form.on('Bundle Stickers', {
//     custom_print_label: function(frm) {
//         frappe.generate_bundle_sticker(frm, frm.doc);
//     }
// });

// --- Use this if "Bundle Stickers" is a CHILD TABLE inside another DocType (e.g., Shaft Production Run) ---
frappe.ui.form.on('Bundle Stickers', {
    custom_print_label: function(frm, cdt, cdn) {
        var cur_row = locals[cdt][cdn];
        frappe.generate_bundle_sticker(frm, cur_row);
    }
});

frappe.generate_bundle_sticker = function(frm, doc) {
    if (!doc) return;

    var f = frm || cur_frm;
    var job_id = doc.job_id || "";
    var item_row = ((f.doc || {}).items || []).find(function(i) { 
        return (i.job_id == job_id || i.job == job_id || i.custom_job_id == job_id || i.idx == job_id || i.name == job_id); 
    });

    var no_of_rolls = doc.rolls_per_bundle || 1;
    var bundled_nw = flt(doc.sticker_bundle_weight);
    var bundled_gw = flt(doc.sticker_bundle_gross_weight_kg);
    var normal_nw = bundled_nw / no_of_rolls;
    var normal_gw = bundled_gw / no_of_rolls;

    var party_code = item_row ? (item_row.party_code || "") : "";

    var raw_batch = doc.batch_no || (item_row ? (item_row.batch_no || "") : "");
    var roll_numbers = doc.roll_numbers || "";

    var d = {
        company: "Jayashree Spun Bond",
        quality: (item_row ? item_row.quality : "") || "NON WOVEN FABRIC",
        gsm: item_row ? item_row.gsm : "",
        color: item_row ? (item_row.color || item_row.colour) : "",
        width_val: doc.combination || (item_row ? item_row.width_inch : "0"), // user's field overrides
        length: doc.custom_produced_length_mtrs || (item_row ? item_row.produced_length_mtrs : "0"),
        bundled_gw: bundled_gw.toFixed(2),
        bundled_nw: bundled_nw.toFixed(2),
        gw: normal_gw.toFixed(2),
        nw: normal_nw.toFixed(2),
        no_of_rolls: no_of_rolls,
        batch_no: raw_batch,
        roll_numbers: roll_numbers,
        party_code: party_code, // Will be replaced by customer name if found
        order_code: item_row ? (item_row.party_code || item_row.order_code || item_row.customer_order_no) : (f.doc.party_code || f.doc.order_code || ""),
        barcode_data: raw_batch
    };

    var label_type = ((f.doc || {}).custom_label || "Default").toLowerCase();
    
    var proceed_print = function() {
        if (label_type.includes("custom")) {
            flow_customized_bundle_label(d, label_type);
        } else {
            trigger_bundle_print(d, label_type);
        }
    };

    if (party_code) {
        frappe.db.get_value("Customer", party_code, "customer_name", function(r) {
            if (r && r.customer_name) {
                d.party_code = r.customer_name;
            }
            proceed_print();
        });
    } else {
        proceed_print();
    }
};

function trigger_bundle_print(d, label_type, custom_fields) {
    var htmlContent = get_bundle_label_format(d, label_type, custom_fields);
    var printWindow = window.open('', '_blank', 'height=650,width=500');
    if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
    }
}

function flow_customized_bundle_label(d, label_type) {
    if (window.last_customized_bundle_fields) {
        trigger_bundle_print(d, label_type, window.last_customized_bundle_fields);
        return;
    }

    var dialog = new frappe.ui.Dialog({
        title: 'Select Fields to Print',
        fields: [
            { fieldtype: 'Check', fieldname: 'show_customer', label: 'Customer Name', default: 0 },
            { fieldtype: 'Check', fieldname: 'show_gsm', label: 'GSM', default: 1 },
            { fieldtype: 'Check', fieldname: 'show_width', label: 'Width', default: 1 },
            { fieldtype: 'Check', fieldname: 'show_length', label: 'Length', default: 1 },
            { fieldtype: 'Check', fieldname: 'show_rolls', label: 'No of Rolls', default: 1 },
            { fieldtype: 'Check', fieldname: 'show_bun_gw', label: 'Bundled Gross Weight', default: 1 },
            { fieldtype: 'Check', fieldname: 'show_bun_nw', label: 'Bundled Net Weight', default: 1 },
            { fieldtype: 'Check', fieldname: 'show_norm_gw', label: 'Gross Weight / Roll', default: 1 },
            { fieldtype: 'Check', fieldname: 'show_norm_nw', label: 'Net Weight / Roll', default: 1 },
            { fieldtype: 'Check', fieldname: 'show_batch', label: 'Batch No', default: 1 }
        ],
        primary_action_label: 'Print Label',
        primary_action: function(values) {
            dialog.hide();
            window.last_customized_bundle_fields = values;
            trigger_bundle_print(d, label_type, values);
        }
    });
    dialog.show();
}

function get_bundle_label_format(d, type, custom_fields) {
    type = (type || "default").trim().toLowerCase();
    var fields = custom_fields || {
        show_gsm: 1, show_color: 1, show_length: 1, show_width: 1, show_bun_gw: 1, show_bun_nw: 1, show_rolls: 0, show_norm_gw: 0, show_norm_nw: 0, show_batch: 1, show_customer: 0
    };

    var rows = [];
    var width_display = String(d.width_val).replace(/ inches/i, '').replace(/ inch/i, '').replace(/"/g, '').trim();

    var is_perfect = type.includes('perfect');
    var is_plain_cc = type.includes('plain cc');
    var is_plain = (type === 'plain') || (type.includes('plain') && !type.includes('cc'));
    var is_reliance = type.includes('reliance');
    var is_default = !(is_perfect || is_plain_cc || is_plain || is_reliance);

    // Dynamic row values formatting based on type
    var val_len = d.length + ' Mtrs';

    var val_width = width_display;
    if (is_reliance) {
        var wid_num = parseFloat(width_display);
        if (!isNaN(wid_num)) {
            val_width = (wid_num * 2.54).toFixed(2) + ' Cms';
        } else {
            val_width += ' Cms';
        }
    } else {
        val_width = width_display + ' Inches';
    }

    // Body Fields
    if (fields.show_gsm) rows.push('<tr><td class="label">GSM</td><td class="colon">:</td><td class="value">' + d.gsm + '</td></tr>');
    
    if (fields.show_color) rows.push('<tr><td class="label">COLOR</td><td class="colon">:</td><td class="value">' + String(d.color).toUpperCase() + '</td></tr>');

    if (fields.show_length) rows.push('<tr><td class="label">LENGTH</td><td class="colon">:</td><td class="value">' + val_len + '</td></tr>');
    
    if (fields.show_width && !is_perfect) {
        rows.push('<tr><td class="label">WIDTH</td><td class="colon">:</td><td class="value">' + val_width + '</td></tr>');
    }

    if (fields.show_bun_gw) rows.push('<tr><td class="label">GROSS WEIGHT</td><td class="colon">:</td><td class="value">' + d.bundled_gw + ' Kgs</td></tr>');
    
    if (fields.show_bun_nw) rows.push('<tr><td class="label">NET WEIGHT</td><td class="colon">:</td><td class="value">' + d.bundled_nw + ' Kgs</td></tr>');    var footer = "";
    if (fields.show_batch) {
        var batch_text = 'BATCH No : ' + d.batch_no;
        if (d.roll_numbers) {
            batch_text += ' &nbsp;&nbsp; Roll No : ' + d.roll_numbers;
        }
        var footer_font_size = (String(d.batch_no || "").length + String(d.roll_numbers || "").length > 32) ? 10 : 12;
        footer = '<div class="footer-row" style="font-size:' + footer_font_size + 'px;">' + batch_text + '</div>';
    }

    var barcode_html = '<div class="barcode-section"><svg id="barcode"></svg><div class="barcode-text">' + d.barcode_data + '</div></div>';

    // Header logic differences
    var header = "";
    var comp_name = is_default ? d.company : "Non Woven Fabrics";
    var show_em = is_default;

    header = '<div class="header">';
    header += '<div class="company">' + comp_name + '</div>';
    if (show_em) header += '<div class="email">enquiry@jayashreespunbond.com</div>';

    if (fields.show_customer && d.party_code) {
        header += '<div class="customer-name">' + String(d.party_code).toUpperCase() + '</div>';
    }

    var q_text = String(d.quality).toUpperCase();
    if (d.order_code) {
        q_text += ' &nbsp;&nbsp;|&nbsp;&nbsp; ' + String(d.order_code).toUpperCase();
    }
    header += '<div class="quality">' + q_text + '</div>';
    header += '</div>';

    var html = '<html><head><title>Bundle Label Preview</title><style>';
    html += '@media print { .btn-panel { display: none !important; } @page { size: 4in 4in; margin: 0; } body { margin: 0; } }';
    html += 'body { font-family: "Arial", sans-serif; margin: 0; padding: 0; background: #f5f5f5; color: #000; }';
    html += '.btn-panel { padding: 10px; background: #f5f5f5; text-align: center; }';
    html += '.btn-panel button { padding: 10px 20px; margin: 0 5px; font-weight: bold; cursor: pointer; }';
    html += '.label-container { width: 4in; height: 4in; margin: 15px auto; background: white; border: 2px solid #000; box-sizing: border-box; padding: 7px 12px 6px 12px; display: flex; flex-direction: column; justify-content: flex-start; overflow: hidden; }';
    html += '.header { text-align: center; margin-bottom: 6px; flex: 0 0 auto; }';
    html += '.company { font-family: "Times New Roman", Times, serif; font-size: 23px; font-weight: 900; letter-spacing: 0.5px; margin-bottom: 1px; }';
    html += '.email { font-size: 13px; font-weight: 900; margin-bottom: 2px; }';
    html += '.customer-name { font-size: 15px; font-weight: 900; margin-bottom: 1px; text-transform: uppercase; }';
    html += '.quality { font-size: 17px; font-weight: 900; text-transform: uppercase; margin-top: 2px; }';
    html += '.body-table { flex: 1 1 auto; display: flex; align-items: stretch; padding: 2px 0 4px 0; min-height: 0; }';
    html += 'table { width: 100%; height: 100%; border-collapse: collapse; table-layout: fixed; }';
    html += 'td { padding: 1px 1px; border: none; vertical-align: middle; }';
    
    html += '.label { width: 39%; font-size: 14px; font-weight: 900; text-align: left; padding-left: 4px; text-transform: uppercase; white-space: nowrap; }'; 
    html += '.colon { width: 4%; text-align: center; font-weight: 900; font-size: 14px; }';
    html += '.value { width: 57%; font-size: 14px; font-weight: 900; text-align: left; padding-left: 6px; text-transform: uppercase; }';
    
    html += '.footer-row { text-align: center; font-weight: 900; margin-top: 4px; margin-bottom: 4px; white-space: nowrap; text-transform: uppercase; letter-spacing: -0.35px; line-height: 1.1; flex: 0 0 auto; }';
    html += '.barcode-section { text-align: center; padding: 0; line-height: 1; margin-top: 0; flex: 0 0 auto; }';
    html += '#barcode { max-width: 100%; height: auto; }';
    html += '.barcode-text { font-size: 9px; font-weight: 500; line-height: 1; margin-top: 1px; }';
    html += '</style></head><body>';
    html += '<div class="btn-panel"><button onclick="window.print()">PRINT</button><button onclick="window.close()">CLOSE</button></div>';
    html += '<div class="label-container">';
    html += header;
    html += '<div class="body-table"><table>' + rows.join('') + '</table></div>';
    html += footer;
    html += barcode_html;
    html += '</div>';
    html += '<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.0/dist/JsBarcode.all.min.js"></script>';
    html += '<script>if("' + d.barcode_data + '"){ JsBarcode("#barcode", "' + d.barcode_data + '", { format: "CODE128", displayValue: false, height: 40, width: 1.5, margin: 10 }); }</script>';
    html += '</body></html>';
    return html;
}
