// ==========================================================
// SHAFT PRODUCTION RUN: SMART STICKER & SQFT CALCULATOR
// ==========================================================

frappe.ui.form.on('Shaft Production Run', {
    refresh: function (frm) {
        // Refresh logic
    },
    width_inch: function (frm) { calculate_cbm(frm); },
    custom_diameter: function (frm) { calculate_cbm(frm); }
});

// Trigger for Items Table - DIRECT TO LABEL (NO MESSAGE)
frappe.ui.form.on('Shaft Production Run Item', {
    print_sticker: function (frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        frappe.generate_sticker_flow(row.name, frm);
    },
    width_inch: function (frm, cdt, cdn) { calculate_cbm(frm, cdt, cdn); },
    custom_diameter: function (frm, cdt, cdn) { calculate_cbm(frm, cdt, cdn); }
});

// Trigger for Roll Wise Entry Table
frappe.ui.form.on('Shaft Production Run Roll', {
    print_sticker: function (frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        frappe.generate_sticker_flow(row.name, frm);
    }
});

// ==========================================================
// CORE LOGIC: STICKER FLOW
// ==========================================================

frappe.generate_sticker_flow = function (row_name, frm) {
    var f = frm || cur_frm;
    var row = (locals['Shaft Production Run Item'] || {})[row_name] ||
        (locals['Shaft Production Run Roll'] || {})[row_name] ||
        (f.doc.items || []).find(function (r) { return r.name === row_name; }) ||
        (f.doc.roll_wise_entry || []).find(function (r) { return r.name === row_name; });

    if (!row) return;

    frappe.db.get_value('Item', row.item_code, 'item_name', function (r) {
        var item_name = (r && r.item_name) || "";
        trigger_print_with_details(row_name, item_name, f);
    });
};

function trigger_print_with_details(row_name, item_name, frm) {
    var doc = frm.doc;
    var raw_label = doc.custom_label || "Default";
    var label_type = raw_label.trim().toLowerCase();
    var row = (locals['Shaft Production Run Item'] || {})[row_name] ||
        (locals['Shaft Production Run Roll'] || {})[row_name] ||
        (doc.items || []).find(function (r) { return r.name === row_name; }) ||
        (doc.roll_wise_entry || []).find(function (r) { return r.name === row_name; });

    if (!row) return;

    var details = extract_details_enhanced(item_name, row.item_code);
    var final_gsm = row.gsm || details.gsm || "";
    var final_color = row.color || details.color || "";
    var final_quality = row.quality || details.quality || "";

    if (label_type.includes("reliance") || label_type.includes("relience")) {
        flow_reliance_cm(row_name, final_gsm, final_color, final_quality, frm);
    } else if (label_type.includes("custom")) {
        var w_custom = row.width_inch || details.width_inch || "0";
        if (is_scandinavian_skip_custom_dialog(row, frm)) {
            frappe.run_print_logic(row_name, w_custom + " Inches", final_gsm, final_color, final_quality, frm);
        } else {
            flow_customized_label(row_name, final_gsm, final_color, final_quality, frm, w_custom);
        }
    } else {
        var w = row.width_inch || details.width_inch || "0";
        frappe.run_print_logic(row_name, w + " Inches", final_gsm, final_color, final_quality, frm);
    }
}

// ==========================================================
// HELPERS: DATA EXTRACTION & FORMATTING
// ==========================================================

var QUALITY_MASTER = {
    "100": "PREMIUM", "101": "PLATINUM", "102": "SUPER PLATINUM",
    "103": "GOLD", "104": "SILVER", "105": "BRONZE",
    "106": "CLASSIC", "107": "SUPER CLASSIC", "108": "LIFE STYLE",
    "109": "ECO SPECIAL", "110": "ECO GREEN", "111": "SUPER ECO",
    "112": "ULTRA", "113": "DELUXE", "114": "UV"
};

function extract_details_enhanced(name, code) {
    var res = { gsm: null, color: null, width_inch: null, quality: null };
    var name_upper = (name || "").toUpperCase();

    if (code && code.length === 16 && /^\d+$/.test(code)) {
        var qual_code = code.substring(3, 6);
        if (QUALITY_MASTER[qual_code]) res.quality = QUALITY_MASTER[qual_code];
        var code_gsm = parseInt(code.substring(9, 12));
        if (code_gsm > 0) res.gsm = String(code_gsm);
        var code_width_mm = parseFloat(code.substring(12, 16));
        if (code_width_mm > 0) res.width_inch = Math.round(code_width_mm / 25.4);
        if (res.quality && name) {
            var qual_pos = name_upper.indexOf(res.quality.toUpperCase());
            if (qual_pos !== -1) {
                var after_qual = name.substring(qual_pos + res.quality.length).trim();
                after_qual = after_qual.replace(/\s*\d+\s*GSM.*/i, "").trim();
                if (after_qual) res.color = after_qual;
            }
        }
    } else if (name) {
        var known_qualities = ["SUPER PLATINUM", "SUPER CLASSIC", "LIFE STYLE", "ECO SPECIAL", "ECO GREEN", "SUPER ECO", "DELUXE", "PREMIUM", "PLATINUM", "GOLD", "SILVER", "BRONZE", "CLASSIC", "ULTRA", "UV"];
        known_qualities.sort(function (a, b) { return b.length - a.length; });
        for (var i = 0; i < known_qualities.length; i++) {
            var q = known_qualities[i];
            if (new RegExp('\\b' + q + '\\b', 'i').test(name_upper)) { res.quality = q; break; }
        }
        if (res.quality) {
            var qp = name_upper.indexOf(res.quality.toUpperCase());
            if (qp !== -1) {
                var aq = name.substring(qp + res.quality.length).trim();
                aq = aq.split(/\s*\d+\s*GSM/i)[0].trim();
                if (aq) res.color = aq;
            }
        }
        var mg = name.match(/(\d+)\s*GSM/i);
        if (mg) res.gsm = mg[1];
        var mw = name.match(/(\d+(\.\d+)?)\s*("|inch|in|'')/i);
        if (mw) res.width_inch = mw[1];
    }
    return res;
}

function is_scandinavian_skip_custom_dialog(row, frm) {
    var f = frm || cur_frm;
    var lt = String(((f.doc || {}).custom_label || "Default")).toLowerCase();
    var customer_id = String(row.custom_customer || row.customer || f.doc.custom_customer || f.doc.customer || "").trim();
    return lt.includes("customer 4x6") || lt.includes("scandinavian") || customer_id === "EXP-0071";
}

function flow_reliance_cm(row_name, gsm, color, quality, frm) {
    var f = frm || cur_frm;
    var row = (locals['Shaft Production Run Item'] || {})[row_name] ||
        (locals['Shaft Production Run Roll'] || {})[row_name] ||
        (f.doc.items || []).find(function (r) { return r.name === row_name; });
    var item_code = row ? (row.item_code || "") : "";
    var width_mm = (item_code.length >= 4) ? parseFloat(item_code.slice(-4)) : 0;
    var width_cm = (width_mm > 0) ? (width_mm / 10) : 0;

    frappe.prompt([{
        label: 'Verify Width (CM) for ' + (item_code || 'this row'),
        fieldname: 'width_cm',
        fieldtype: 'Float',
        default: width_cm,
        reqd: 1
    }], function (values) {
        frappe.run_print_logic(row_name, values.width_cm + " CM", gsm, color, quality, frm);
    }, 'Confirm Reliance Size', 'Preview Label');
}

function flow_customized_label(row_name, gsm, color, quality, frm, width_inch) {
    if (window.last_customized_shaft_fields) {
        frappe.run_print_logic(row_name, width_inch + " Inches", gsm, color, quality, frm, window.last_customized_shaft_fields);
        return;
    }

    var dialog = new frappe.ui.Dialog({
        title: 'Select Fields to Print',
        fields: [
            { fieldtype: 'Section Break', label: 'Header Fields' },
            { fieldtype: 'Check', fieldname: 'show_company', label: 'Company Name', default: 1 },
            { fieldtype: 'Check', fieldname: 'show_email', label: 'Company Email', default: 1 },
            { fieldtype: 'Check', fieldname: 'show_quality', label: 'Quality', default: 1 },
            { fieldtype: 'Check', fieldname: 'show_customer', label: 'Print Customer', default: 1 },
            { fieldtype: 'Section Break', label: 'Body Fields' },
            { fieldtype: 'Check', fieldname: 'show_gsm', label: 'GSM', default: 1 },
            { fieldtype: 'Check', fieldname: 'show_color', label: 'Color', default: 1 },
            { fieldtype: 'Check', fieldname: 'show_length', label: 'Length (MTR)', default: 1 },
            { fieldtype: 'Check', fieldname: 'show_width', label: 'Width', default: 1 },
            { fieldtype: 'Check', fieldname: 'show_gw', label: 'Gross Weight', default: 1 },
            { fieldtype: 'Check', fieldname: 'show_nw', label: 'Net Weight', default: 1 },
            { fieldtype: 'Section Break', label: 'Footer Fields' },
            { fieldtype: 'Check', fieldname: 'show_batch', label: 'Batch No', default: 1 },
            { fieldtype: 'Check', fieldname: 'show_barcode', label: 'Barcode', default: 1 }
        ],
        primary_action_label: 'Print Label',
        primary_action: function (values) {
            dialog.hide();
            window.last_customized_shaft_fields = values;
            frappe.run_print_logic(row_name, width_inch + " Inches", gsm, color, quality, frm, values);
        }
    });
    dialog.show();
}

function calculate_cbm(frm, cdt, cdn) {
    let doc = cdn ? locals[cdt][cdn] : frm.doc;
    if (doc.width_inch && doc.custom_diameter) {
        let cbm = flt((Math.PI * flt(doc.width_inch) * flt(doc.custom_diameter)) / 144, 4);
        if (cdn) {
            frappe.model.set_value(cdt, cdn, 'custom_cbm', cbm);
        } else {
            frm.set_value('custom_cbm', cbm);
        }
    }
}

// ==========================================================
// PRINT LOGIC & LABEL GENERATION
// ==========================================================

frappe.run_print_logic = function (row_name, final_width_display, final_gsm, final_color, final_quality, frm, custom_fields) {
    var f = frm || cur_frm;
    var row = (locals['Shaft Production Run Item'] || {})[row_name] ||
        (locals['Shaft Production Run Roll'] || {})[row_name] ||
        (f.doc.items || []).find(function (r) { return r.name === row_name; }) ||
        (f.doc.roll_wise_entry || []).find(function (r) { return r.name === row_name; });

    if (!row) return;

    var normalized_custom_fields = normalize_custom_fields(custom_fields);
    var label_type = String(((f.doc || {}).custom_label || "Default")).toLowerCase();

    var proceed_run = function (customer_name) {
        var raw_batch = row.batch_no || "";
        
        var d = {
            company: "Jayashree Spun Bond",
            email: "info@jayashreespunbond.com",
            quality: final_quality || "NON WOVEN FABRIC",
            gsm: final_gsm,
            color: final_color,
            width_val: final_width_display,
            barcode_data: raw_batch,
            barcode_text: raw_batch,
            length: row.produced_length_mtrs || "0",
            gw: (flt(row.gross_weight) || flt(row.net_weight)).toFixed(2),
            nw: flt(row.net_weight).toFixed(2),
            batch_no: raw_batch,
            roll_no: row.roll_no || "",
            customer_name: customer_name || "",
            order_code: row.party_code || row.order_code || row.customer_order_no || f.doc.party_code || f.doc.order_code || "",
            custom_unit: f.doc.custom_unit || "",
            sheet_size: row.custom_sheet_size || "",
            total_sheets: row.custom_total_produced_sheets || "",
            design_code_name: "",
            film_finishing: "",
            film_width: ""
        };

        if (String(f.doc.custom_unit).trim() === "VR - 1200MM BOPP PRINTING MACHINE") {
            var icode = row.item_code || "";
            var iname = row.item_name || "";
            
            var code_parts = icode.split('-');
            if (code_parts.length >= 5) {
                var micron = code_parts[2];
                d.film_width = code_parts[3];
                var finish_code = code_parts[code_parts.length - 1];
                
                var finish_text = finish_code;
                if (finish_code === "M0") finish_text = "MATTE";
                else if (finish_code === "MM") finish_text = "METTALIC MATTE";
                else if (finish_code === "GM") finish_text = "METTALLIC GLOSSY";
                else if (finish_code === "CM") finish_text = "COOLER MATTE";
                else if (finish_code === "CG") finish_text = "COOLER GLOSSY";
                else if (finish_code === "G0") finish_text = "GLOSSY";
                
                d.film_finishing = micron + " " + finish_text;
            }
            
            var name_parts = iname.split('-');
            if (name_parts.length >= 3) {
                var d_code = name_parts[1].trim();
                var d_name = name_parts[2].trim();
                d.design_code_name = d_code + " - " + d_name;
            }
        }

        var current_cust_id = String(row.custom_customer || row.customer || f.doc.custom_customer || f.doc.customer || "").trim();
        if (label_type.includes("customer 4x6") || label_type.includes("scandinavian") || current_cust_id === "EXP-0071") {
            build_customer_4x6_data(row, d, function (label_data) {
                var html4x6 = get_customer_4x6_format(label_data);
                var pw = window.open('', '_blank', 'width=920,height=520');
                if (pw) { pw.document.write(html4x6); pw.document.close(); }
            });
            return;
        }

        var htmlContent = get_grid_format(d, label_type, normalized_custom_fields);
        var printWindow = window.open('', '_blank', 'height=650,width=500');
        if (printWindow) { printWindow.document.write(htmlContent); printWindow.document.close(); }
    };

    var cust_id = row.custom_customer || row.customer || f.doc.custom_customer || f.doc.customer || "";
    var fallback_name = row.customer_name || f.doc.customer_name || row.party_name || f.doc.party_name || "";
    if (cust_id) {
        frappe.call({
            method: 'frappe.client.get_value',
            args: {
                doctype: 'Customer',
                filters: { name: cust_id },
                fieldname: 'customer_name'
            },
            callback: function (r) {
                var fetched = "";
                if (r && r.message && typeof r.message === 'object') {
                    fetched = r.message.customer_name || "";
                } else if (r && r.message) {
                    fetched = r.message;
                }
                if (!fetched && r && r.customer_name) fetched = r.customer_name;
                proceed_run(fetched || fallback_name || cust_id);
            }
        });
    } else {
        proceed_run(fallback_name);
    }
};

function build_customer_4x6_data(row, base_data, callback) {
    var fallbacks = {
        article_no: row.item_code || "",
        article_name: row.item_name || "",
        tracking_no: row.po_no || "",
        basis_weight: String(base_data.gsm || "").trim(),
        rolls_in_package: "1",
        length_per_roll: String(row.produced_length_mtrs || "").trim(),
        width_mm: String(flt(row.width_inch) * 25.4).slice(0, 4),
        m2_in_package: String(Math.round((flt(row.width_inch) * 25.4 / 1000) * flt(row.produced_length_mtrs))),
        kg_per_package: String(base_data.nw || "").trim(),
        treatment: String(base_data.quality || "").trim(),
        customer_company: "Scandinavian Nonwoven AB",
        customer_address: "Alevagen 1 - S-291 62 Kristianstad - Sweden",
        customer_contact: "Tel: +46 44 203960"
    };
    callback(fallbacks);
}

function get_grid_format(d, type, custom_fields) {
    type = (type || "default").trim().toLowerCase();
    var fields = custom_fields || {
        show_company: 1, show_email: 1, show_customer: 0, show_quality: 1,
        show_gsm: 1, show_color: 1, show_length: 1, show_width: 1,
        show_gw: 1, show_nw: 1,
        show_batch: 1, show_barcode: 1,
    };

    if (String(d.custom_unit).trim() === "VR - 1200MM BOPP PRINTING MACHINE") {
        var bopp_rows = [];
        bopp_rows.push('<tr><td class="label">DESIGN CODE & NAME</td><td class="colon">:</td><td class="value">' + escape_html(d.design_code_name) + '</td></tr>');
        bopp_rows.push('<tr><td class="label">FILM FINISHING</td><td class="colon">:</td><td class="value">' + escape_html(d.film_finishing) + '</td></tr>');
        bopp_rows.push('<tr><td class="label">FILM WIDTH</td><td class="colon">:</td><td class="value">' + escape_html(d.film_width) + '</td></tr>');
        if (fields.show_length) bopp_rows.push('<tr><td class="label">LENGTH</td><td class="colon">:</td><td class="value">' + escape_html(d.length) + ' Mtrs</td></tr>');
        if (fields.show_gw) bopp_rows.push('<tr><td class="label">GROSS WEIGHT</td><td class="colon">:</td><td class="value">' + escape_html(d.gw) + ' Kgs</td></tr>');
        if (fields.show_nw) bopp_rows.push('<tr><td class="label">NET WEIGHT</td><td class="colon">:</td><td class="value">' + escape_html(d.nw) + ' Kgs</td></tr>');

        var bopp_header = '<div class="header">';
        if (fields.show_company) bopp_header += '<div class="company">' + escape_html(d.company) + '</div>';
        if (fields.show_email) bopp_header += '<div class="email">enquiry@jayashreespunbond.com</div>';
        bopp_header += '</div>';

        var bopp_footer = "";
        if (fields.show_batch) {
            bopp_footer = '<div class="footer-row">BATCH No : ' + escape_html(d.batch_no) + '</div>';
        }
        var bopp_barcode = "";
        if (fields.show_barcode) {
            bopp_barcode = '<div class="barcode-section"><svg id="barcode"></svg></div>';
        }

        var bopp_html = '<html><head><title>BOPP Label Preview</title><style>';
        bopp_html += '@media print { .btn-panel { display: none !important; } @page { size: 4in 4in; margin: 0; } body { margin: 0; } }';
        bopp_html += 'body { font-family: "Arial", sans-serif; margin: 0; padding: 0; background: #f5f5f5; color: #000; }';
        bopp_html += '.btn-panel { padding: 10px; background: #f5f5f5; text-align: center; }';
        bopp_html += '.btn-panel button { padding: 10px 20px; margin: 0 5px; font-weight: bold; cursor: pointer; }';
        bopp_html += '.label-container { width: 4in; height: 4in; margin: 15px auto; background: white; border: 2px solid #000; box-sizing: border-box; padding: 10px 15px; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; }';
        bopp_html += '.header { text-align: center; margin-bottom: 5px; }';
        bopp_html += '.company { font-family: "Times New Roman", Times, serif; font-size: 24px; font-weight: 900; letter-spacing: 0.5px; margin-bottom: 2px; }';
        bopp_html += '.email { font-size: 14px; font-weight: 900; margin-bottom: 3px; }';
        bopp_html += '.body-table { flex: 1; display: flex; align-items: stretch; padding: 3px 0; }';
        bopp_html += 'table { width: 100%; height: 100%; border-collapse: collapse; }';
        bopp_html += 'td { padding: 2px; border: none; vertical-align: middle; }';
        bopp_html += '.label { width: 42%; font-size: 14px; font-weight: 900; text-align: left; padding-left: 5px; text-transform: uppercase; white-space: nowrap; }';
        bopp_html += '.colon { width: 4%; text-align: center; font-weight: 900; font-size: 14px; }';
        bopp_html += '.value { width: 54%; font-size: 14px; font-weight: 900; text-align: left; padding-left: 8px; text-transform: uppercase; }';
        bopp_html += '.footer-row { text-align: center; font-size: 16px; font-weight: 900; margin-top: 6px; margin-bottom: 4px; white-space: nowrap; text-transform: uppercase; }';
        bopp_html += '.barcode-section { text-align: center; padding: 4px 0 0 0; }';
        bopp_html += '#barcode { max-width: 95%; height: auto; }';
        bopp_html += '</style></head><body>';
        bopp_html += '<div class="btn-panel"><button onclick="window.print()">PRINT</button><button onclick="window.close()">CLOSE</button></div>';
        bopp_html += '<div class="label-container">';
        bopp_html += bopp_header;
        bopp_html += '<div class="body-table"><table>' + bopp_rows.join('') + '</table></div>';
        bopp_html += bopp_footer;
        bopp_html += bopp_barcode;
        bopp_html += '</div>';
        bopp_html += '<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.0/dist/JsBarcode.all.min.js"><\/script>';
        bopp_html += '<script>if("' + d.barcode_data + '"){ JsBarcode("#barcode", "' + escape_html(d.barcode_data) + '", { format: "CODE128", displayValue: true, text: "' + escape_html(d.barcode_text || d.barcode_data) + '", fontSize: 13, textMargin: 2, height: 46, width: 2, margin: 0 }); }<\/script>';
        bopp_html += '</body></html>';
        return bopp_html;
    }

    var rows = [];
    var width_display = escape_html(d.width_val).replace(/ inches/i, '').replace(/ inch/i, '').replace(/"/g, '').trim();

    var is_perfect = type.includes('perfect');
    var is_plain_cc = type.includes('plain cc');
    var is_plain = (type === 'plain') || (type.includes('plain') && !type.includes('cc'));
    var is_reliance = type.includes('reliance');
    var is_default = !(is_perfect || is_plain_cc || is_plain || is_reliance);

    // Dynamic row values formatting based on type
    var label_len = "LENGTH";
    var label_width = "WIDTH";

    var val_len = escape_html(d.length) + ' Mtrs';

    var val_width = width_display;
    if (is_reliance) {
        var wid_num = parseFloat(width_display);
        if (!isNaN(wid_num)) {
            val_width = (wid_num * 2.54).toFixed(2) + ' Cms';
        } else {
            val_width += ' Cms';
        }
    } else {
        val_width = width_display + ' INCHES';
    }

    var val_gw = escape_html(d.gw) + ' Kgs';
    var val_nw = escape_html(d.nw) + ' Kgs';

    // Body Fields
    if (fields.show_gsm) rows.push('<tr><td class="label">GSM</td><td class="colon">:</td><td class="value">' + escape_html(d.gsm) + '</td></tr>');
    if (fields.show_color) rows.push('<tr><td class="label">COLOR</td><td class="colon">:</td><td class="value">' + escape_html(d.color).toUpperCase() + '</td></tr>');

    if (String(d.custom_unit).trim() === "JVE - SHEET CUTTING MACHINE") {
        var size_display = escape_html(d.sheet_size || "").replace(/\s*\*\s*/g, ' x ').replace(/(\d+(\.\d+)?)(?!"|inch)/gi, '$1"');
        rows.push('<tr><td class="label">SHEET SIZE</td><td class="colon">:</td><td class="value">' + size_display + '</td></tr>');
        rows.push('<tr><td class="label">TOTAL SHEETS</td><td class="colon">:</td><td class="value">' + escape_html(d.total_sheets) + ' Pcs</td></tr>');
    } else {
        if (fields.show_length) rows.push('<tr><td class="label">' + label_len + '</td><td class="colon">:</td><td class="value">' + val_len + '</td></tr>');
        if (fields.show_width && !is_perfect) {
            rows.push('<tr><td class="label">' + label_width + '</td><td class="colon">:</td><td class="value">' + val_width + '</td></tr>');
        }
    }

    if (fields.show_gw) rows.push('<tr><td class="label">GROSS WEIGHT</td><td class="colon">:</td><td class="value">' + val_gw + '</td></tr>');
    if (fields.show_nw) rows.push('<tr><td class="label">NET WEIGHT</td><td class="colon">:</td><td class="value">' + val_nw + '</td></tr>');

    var footer = "";
    if (fields.show_batch) {
        var batch_text = 'BATCH No : ' + escape_html(d.batch_no);
        footer = '<div class="footer-row">' + batch_text + '</div>';
    }

    var barcode_html = "";
    if (fields.show_barcode) {
        barcode_html = '<div class="barcode-section"><svg id="barcode"></svg></div>';
    }

    // Header logic differences
    var header = "";
    var comp_name = is_default ? escape_html(d.company) : "Non Woven Fabrics";
    var show_em = is_default && fields.show_email;

    if (fields.show_company || show_em || fields.show_quality) {
        header = '<div class="header">';
        if (fields.show_company) header += '<div class="company">' + comp_name + '</div>';
        if (show_em) header += '<div class="email">enquiry@jayashreespunbond.com</div>';

        if (fields.show_customer && d.customer_name) {
            header += '<div class="customer-name">' + escape_html(d.customer_name).toUpperCase() + '</div>';
        }

        var q_text = escape_html(d.quality).toUpperCase();
        if (d.order_code) {
            q_text += ' &nbsp;&nbsp;|&nbsp;&nbsp; ' + escape_html(d.order_code).toUpperCase();
        }
        if (fields.show_quality) header += '<div class="quality">' + q_text + '</div>';
        header += '</div>';
    }

    var html = '<html><head><title>Label Preview</title><style>';
    html += '@media print { .btn-panel { display: none !important; } @page { size: 4in 4in; margin: 0; } body { margin: 0; } }';
    html += 'body { font-family: "Arial", sans-serif; margin: 0; padding: 0; background: #f5f5f5; color: #000; }';
    html += '.btn-panel { padding: 10px; background: #f5f5f5; text-align: center; }';
    html += '.btn-panel button { padding: 10px 20px; margin: 0 5px; font-weight: bold; cursor: pointer; }';
    html += '.label-container { width: 4in; height: 4in; margin: 15px auto; background: white; border: 2px solid #000; box-sizing: border-box; padding: 10px 15px; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; }';
    html += '.header { text-align: center; margin-bottom: 0px; }';
    html += '.company { font-family: "Times New Roman", Times, serif; font-size: 24px; font-weight: 900; letter-spacing: 0.5px; margin-bottom: 2px; }';
    html += '.email { font-size: 14px; font-weight: 900; margin-bottom: 3px; }';
    html += '.customer-name { font-size: 16px; font-weight: 900; margin-bottom: 2px; text-transform: uppercase; }';
    html += '.quality { font-size: 18px; font-weight: 900; text-transform: uppercase; margin-top: 3px; }';
    html += '.body-table { flex: 1; display: flex; align-items: stretch; padding: 3px 0; }';
    html += 'table { width: 100%; height: 100%; border-collapse: collapse; }';
    html += 'td { padding: 3px 2px; border: none; vertical-align: middle; }';
    html += '.label { width: 39%; font-size: 15px; font-weight: 900; text-align: left; padding-left: 5px; text-transform: uppercase; white-space: nowrap; }';
    html += '.colon { width: 4%; text-align: center; font-weight: 900; font-size: 15px; }';
    html += '.value { width: 57%; font-size: 15px; font-weight: 900; text-align: left; padding-left: 8px; text-transform: uppercase; }';
    html += '.footer-row { text-align: center; font-size: 16px; font-weight: 900; margin-top: 6px; margin-bottom: 4px; white-space: nowrap; text-transform: uppercase; }';
    html += '.barcode-section { text-align: center; padding: 4px 0 0 0; }';
    html += '#barcode { max-width: 95%; height: auto; }';
    html += '</style></head><body>';
    html += '<div class="btn-panel"><button onclick="window.print()">PRINT</button><button onclick="window.close()">CLOSE</button></div>';
    html += '<div class="label-container">';
    html += header;
    html += '<div class="body-table"><table>' + rows.join('') + '</table></div>';
    html += footer;
    html += barcode_html;
    html += '</div>';
    html += '<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.0/dist/JsBarcode.all.min.js"><\/script>';
    html += '<script>if("' + d.barcode_data + '"){ JsBarcode("#barcode", "' + escape_html(d.barcode_data) + '", { format: "CODE128", displayValue: true, text: "' + escape_html(d.barcode_text || d.barcode_data) + '", fontSize: 13, textMargin: 2, height: 46, width: 2, margin: 0 }); }<\/script>';
    html += '</body></html>';
    return html;
}

function get_customer_4x6_format(d) {
    var html = '<html><head><title>Customer Label</title><style>';
    html += '@media print { .btn-panel { display: none !important; } @page { size: 6in 4in; margin: 0; } body { margin: 0; background: #fff !important; } .label-container { margin: 0 !important; border: none !important; padding: 15px 25px !important; } }';
    html += 'body { font-family: "Arial", sans-serif; margin: 0; padding: 0; background: #f5f5f5; color: #000; }';
    html += '.btn-panel { padding: 10px; background: #f5f5f5; text-align: center; border-bottom: 1px solid #ddd; }';
    html += '.btn-panel button { padding: 10px 20px; margin: 0 5px; font-weight: bold; cursor: pointer; }';
    html += '.label-container { width: 6in; height: 4in; margin: 15px auto; background: white; box-sizing: border-box; padding: 20px 25px; position: relative; overflow: hidden; border: 1px solid #ccc; display: flex; flex-direction: column; }';
    html += '.art-label-top { font-size: 14px; font-weight: bold; margin-bottom: 2px; }';
    html += '.art-no { font-size: 38px; font-weight: normal; margin: 0 0 8px 0; letter-spacing: 0.5px; }';
    html += '.art-title-label { font-size: 14px; margin: 0 0 2px 0; }';
    html += '.art-name { font-size: 18px; font-weight: normal; min-height: 22px; margin: 0 0 15px 0; }';
    html += '.grid-table { width: 100%; border-collapse: collapse; flex-grow: 1; }';
    html += '.grid-table td { padding: 0 5px 8px 0; vertical-align: top; width: 33.33%; border: none; }';
    html += '.grid-label { display: block; font-size: 14px; margin-bottom: 2px; color: #000; font-weight: normal; }';
    html += '.grid-val { display: block; font-size: 16px; font-weight: bold; color: #000; }';
    html += '.bottom-footer { width: 100%; text-align: center; padding-top: 5px; margin-top: auto; }';
    html += '.company-name { font-size: 24px; font-family: "Arial", sans-serif; margin-bottom: 4px; font-weight: normal; }';
    html += '.company-address { font-size: 13px; margin-bottom: 2px; }';
    html += '</style></head><body>';
    html += '<div class="btn-panel"><button onclick="window.print()">PRINT</button><button onclick="window.close()">CLOSE</button></div>';
    html += '<div class="label-container">';
    html += '<div>'; // Wrapper for top content to allow flex layout correctly
    html += '<div class="art-label-top">Article No</div>';
    html += '<h2 class="art-no">' + escape_html(d.article_no) + '</h2>';
    html += '<div class="art-title-label">Article</div>';
    html += '<h3 class="art-name">' + escape_html(d.article_name) + '</h3>';
    html += '</div>';
    html += '<table class="grid-table">';
    html += '<tr><td><span class="grid-label">Tracking No</span><span class="grid-val">' + escape_html(d.tracking_no) + '</span></td>';
    html += '<td><span class="grid-label">&nbsp;</span><span class="grid-val">&nbsp;</span></td>';
    html += '<td><span class="grid-label">Length per roll (m)</span><span class="grid-val">' + escape_html(d.length_per_roll) + '</span></td></tr>';
    html += '<tr><td><span class="grid-label">Basis Weight (g/m&sup2;)</span><span class="grid-val">' + escape_html(d.basis_weight) + '</span></td>';
    html += '<td><span class="grid-label">Rolls in package</span><span class="grid-val">' + escape_html(d.rolls_in_package) + '</span></td>';
    html += '<td><span class="grid-label">Width (mm)</span><span class="grid-val">' + escape_html(d.width_mm) + '</span></td></tr>';
    html += '<tr><td><span class="grid-label">m&sup2; in package</span><span class="grid-val">' + escape_html(d.m2_in_package) + '</span></td>';
    html += '<td><span class="grid-label">Kg per package</span><span class="grid-val">' + escape_html(d.kg_per_package) + '</span></td>';
    html += '<td><span class="grid-label">Treatment</span><span class="grid-val">' + escape_html(d.treatment) + '</span></td></tr>';
    html += '</table>';
    html += '<div class="bottom-footer">';
    html += '<div class="company-name">Scandinavian Nonwoven AB</div>';
    html += '<div class="company-address">Alev&auml;gen 1 &bull; S-291 62 Kristianstad &bull; Sweden</div>';
    html += '<div class="company-address">Tel: +46 44 203960 &bull; info@nonwoven.se &bull; www.nonwoven.se</div>';
    html += '</div>';
    html += '</div></body></html>';
    return html;
}

function escape_html(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function normalize_custom_fields(custom_fields) {
    var defaults = {
        show_company: 1, show_email: 1, show_quality: 1,
        show_gsm: 1, show_color: 1, show_length: 1, show_width: 1,
        show_gw: 1, show_nw: 1,
        show_batch: 1, show_barcode: 1, show_customer: 0
    };
    if (!custom_fields) return defaults;

    var as_bool = function (v, default_value) {
        if (v === undefined || v === null || v === "") return !!default_value;
        if (typeof v === "boolean") return v;
        var s = String(v).trim().toLowerCase();
        return s === "1" || s === "true";
    };

    return {
        show_company: as_bool(custom_fields.show_company, 1),
        show_email: as_bool(custom_fields.show_email, 1),
        show_quality: as_bool(custom_fields.show_quality, 1),
        show_gsm: as_bool(custom_fields.show_gsm, 1),
        show_color: as_bool(custom_fields.show_color, 1),
        show_length: as_bool(custom_fields.show_length, 1),
        show_width: as_bool(custom_fields.show_width, 1),
        show_gw: as_bool(custom_fields.show_gw, 1),
        show_nw: as_bool(custom_fields.show_nw, 1),
        show_batch: as_bool(custom_fields.show_batch, 1),
        show_barcode: as_bool(custom_fields.show_barcode, 1),
        show_customer: as_bool(custom_fields.show_customer, 1)
    };
}
