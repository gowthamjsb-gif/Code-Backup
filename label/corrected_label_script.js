// =================================================================
// 1. PARENT FORM TRIGGERS
// =================================================================
frappe.ui.form.on('Roll Production Entry', {
    refresh: function (frm) {
        calculate_total(frm);
        setup_print_button(frm);
    }
});

frappe.ui.form.on('Shaft Production Run', {
    refresh: function (frm) {
        setup_print_button(frm);
    }
});

function setup_print_button(frm) {
    if (!frm.is_new() && frm.doc.docstatus === 0 && frm.fields_dict['roll_wise_entry']) {
        frm.page.set_primary_action(__('Submit Production'), function () {
            if (frm.is_dirty()) {
                frappe.show_alert({ message: 'Saving...', indicator: 'orange' });
                frm.save(null, () => trigger_submission(frm));
            } else {
                trigger_submission(frm);
            }
        });
    }

    if (!frm.is_new() && frm.doctype === 'Roll Production Entry') {
        frm.add_custom_button('♻️ Reset Width', function () {
            frm.set_value('custom_batch_width', 0);
            frappe.msgprint("Width reset.");
        });
    }

    setTimeout(function () {
        let tables = ['roll_wise_entry', 'items', 'production_results'];
        tables.forEach(table => {
            if (frm.fields_dict[table] && frm.fields_dict[table].grid) {
                let grid = frm.fields_dict[table].grid;
                let btn_field = grid.get_field('print_sticker') || grid.get_field('production_label') || grid.get_field('custom_production_label');
                if (btn_field) {
                    btn_field.formatter = function (value, row_doc) {
                        return `<button type="button" class="btn btn-xs btn-default" 
                            style="width: 100%; font-weight: bold; cursor: pointer !important; pointer-events: auto;" 
                            onclick="frappe.generate_sticker_flow('${row_doc.name}')">
                            🖨️ Print Label
                        </button>`;
                    };
                    grid.refresh();
                }
            }
        });
    }, 500);
}

// =================================================================
// 2. CHILD TABLE TRIGGERS
// =================================================================
frappe.ui.form.on('Roll Production Entry Item', {
    print_sticker: function (frm, cdt, cdn) { frappe.generate_sticker_flow(cdn); },
    // ... other triggers
});

frappe.ui.form.on('Shaft Production Run Item', {
    production_label: function (frm, cdt, cdn) { frappe.generate_sticker_flow(cdn); },
    custom_production_label: function (frm, cdt, cdn) { frappe.generate_sticker_flow(cdn); }
});

frappe.ui.form.on('Roll Production Entry Item', {
    net_weight: function (frm) { if (frm.doc.docstatus === 0) calculate_total(frm); },
    net_wt: function (frm) { if (frm.doc.docstatus === 0) calculate_total(frm); },
    roll_wise_entry_remove: function (frm) { if (frm.doc.docstatus === 0) calculate_total(frm); },
    roll_wise_entry_add: function (frm, cdt, cdn) {
        if (frm.doc.docstatus === 0) {
            let max_roll = 0;
            (frm.doc.roll_wise_entry || []).forEach(row => {
                let r = parseInt(row.roll_no) || 0;
                if (r > max_roll) max_roll = r;
            });
            frappe.model.set_value(cdt, cdn, 'roll_no', max_roll + 1);
        }
    }
});

// =================================================================
// 3. EXTRACTION & FLOW LOGIC
// =================================================================
frappe.generate_sticker_flow = function (row_name) {
    var raw_label = cur_frm.doc.custom_label || "Default";
    var label_type = raw_label.trim().toLowerCase();

    var lookup_row = function (name) {
        if (!name) return null;
        var r = (locals['Roll Production Entry Item'] || {})[name] || (locals['Shaft Production Run Item'] || {})[name];
        if (!r && cur_frm && cur_frm.doc) {
            var tables = ['roll_wise_entry', 'items', 'production_results'];
            for (var i = 0; i < tables.length; i++) {
                if (cur_frm.doc[tables[i]]) {
                    r = cur_frm.doc[tables[i]].find(x => x.name === name);
                    if (r) break;
                }
            }
        }
        return r;
    };

    var row = lookup_row(row_name);
    if (!row) return console.error("Label Error: Row not found in locals or form.", row_name);

    var item_code = row.item_code || row.production_item || (cur_frm && cur_frm.doc ? (cur_frm.doc.production_item || cur_frm.doc.item_code) : "");
    var item_name = row.item_name || row.production_item_name || (cur_frm && cur_frm.doc ? (cur_frm.doc.production_item_name || cur_frm.doc.item_name) : "");

    // Pass both name and code for accurate extraction
    var details = extract_details_enhanced(item_name, item_code);

    var final_gsm = details.gsm || "";
    var final_color = details.color || "";
    var final_quality = details.quality || "";

    if (label_type.includes("reliance") || label_type.includes("relience")) {
        flow_reliance_cm(row_name, final_gsm, final_color, final_quality);
    } else {
        // Use extracted width in inch, fallback to 0
        var w = details.width_inch || "0";
        frappe.run_print_logic(row_name, w + " Inches", final_gsm, final_color, final_quality);
    }
};

// Quality Master: 3-digit quality code (item_code digits 4-6) → quality name
var QUALITY_MASTER = {
    "100": "PREMIUM", "101": "PLATINUM", "102": "SUPER PLATINUM",
    "103": "GOLD", "104": "SILVER", "105": "BRONZE",
    "106": "CLASSIC", "107": "SUPER CLASSIC", "108": "LIFE STYLE",
    "109": "ECO SPECIAL", "110": "ECO GREEN", "111": "SUPER ECO",
    "112": "ULTRA", "113": "DELUXE", "114": "UV"
};

function extract_details_enhanced(name, code) {
    if (!name) return {};
    var res = { gsm: null, color: null, width_inch: null, quality: null };
    var name_upper = name.toUpperCase();

    if (code && code.length === 16 && /^\d+$/.test(code)) {
        // === ITEM CODE PATH (16 digits: PPP QQQ CCC GSM WWWW) ===

        // 1. Quality: digits 4-6 (index 3,4,5)
        var qual_code = code.substring(3, 6);
        if (QUALITY_MASTER[qual_code]) res.quality = QUALITY_MASTER[qual_code];

        // 2. GSM: digits 10-12 (index 9,10,11)
        var code_gsm = parseInt(code.substring(9, 12));
        if (code_gsm > 0) res.gsm = String(code_gsm);

        // 3. Width: digits 13-16 (index 12-15) in mm → inch
        var code_width_mm = parseFloat(code.substring(12, 16));
        if (code_width_mm > 0) res.width_inch = Math.round(code_width_mm / 25.4);

        // 4. Color: text AFTER quality name in item name, before GSM number
        if (res.quality) {
            var qual_pos = name_upper.indexOf(res.quality.toUpperCase());
            if (qual_pos !== -1) {
                var after_qual = name.substring(qual_pos + res.quality.length).trim();
                after_qual = after_qual.replace(/\s*\d+\s*GSM.*/i, "").trim();
                if (after_qual) res.color = after_qual;
            }
        }
        // Fallback: FABRIC...GSM pattern
        if (!res.color) {
            var mc = name.match(/FABRIC\s+(.*?)\s+\d+\s*GSM/i);
            if (mc) res.color = mc[1].replace(new RegExp(res.quality || '', 'gi'), '').trim();
        }

    } else {
        // === FALLBACK PATH (non-standard or missing code) ===
        var known_qualities = ["SUPER PLATINUM", "SUPER CLASSIC", "LIFE STYLE", "ECO SPECIAL",
            "ECO GREEN", "SUPER ECO", "DELUXE", "PREMIUM", "PLATINUM", "GOLD",
            "SILVER", "BRONZE", "CLASSIC", "ULTRA", "UV"];
        known_qualities.sort((a, b) => b.length - a.length);
        for (let q of known_qualities) {
            var qb = new RegExp('\\b' + q + '\\b', 'i');
            if (qb.test(name_upper)) { res.quality = q; break; }
        }

        // Color: after quality in name (before GSM)
        if (res.quality) {
            var qp = name_upper.indexOf(res.quality.toUpperCase());
            if (qp !== -1) {
                var aq = name.substring(qp + res.quality.length).trim();
                aq = aq.replace(/\s*\d+\s*GSM.*/i, "").trim();
                if (aq) res.color = aq;
            }
        }
        if (!res.color) {
            var mc2 = name.match(/FABRIC\s+(.*?)\s+\d+\s*GSM/i);
            if (mc2) res.color = mc2[1].replace(new RegExp(res.quality || '', 'gi'), '').trim();
        }

        // GSM fallback
        if (!res.gsm) {
            var mg = name.match(/(\d+)\s*GSM/i);
            if (mg) res.gsm = mg[1];
        }
        // Width fallback
        if (!res.width_inch) {
            var mw = name.match(/(\d+(\.\d+)?)\s*("|inch|in|'')/i);
            if (mw) res.width_inch = mw[1];
        }
    }

    return res;
}


function flow_reliance_cm(row_name, gsm, color, quality) {
    var saved_val = cur_frm.doc.custom_batch_width || 0;
    if (saved_val > 0) {
        frappe.run_print_logic(row_name, saved_val + " CM", gsm, color, quality);
    } else {
        var item_code = cur_frm.doc.production_item || "";
        // Reliance logic: use last 4 digits as mm, then /10 for cm
        var width_mm = (item_code.length >= 4) ? parseFloat(item_code.slice(-4)) : 0;
        var width_cm = (width_mm > 0) ? (width_mm / 10) : 0;

        frappe.prompt([{ label: 'Verify Width (CM)', fieldname: 'width_cm', fieldtype: 'Float', default: width_cm, reqd: 1 }],
            (values) => {
                cur_frm.set_value('custom_batch_width', values.width_cm);
                frappe.run_print_logic(row_name, values.width_cm + " CM", gsm, color, quality);
            }, 'Confirm Reliance Size', 'Preview Label');
    }
}

// =================================================================
// 4. PRINT LOGIC (BARCODE = ONLY BATCH NO)
// =================================================================
frappe.run_print_logic = function (row_name, final_width_display, final_gsm, final_color, final_quality) {
    var lookup_row = function (name) {
        if (!name) return null;
        var r = (locals['Roll Production Entry Item'] || {})[name] || (locals['Shaft Production Run Item'] || {})[name];
        if (!r && cur_frm && cur_frm.doc) {
            var tables = ['roll_wise_entry', 'items', 'production_results'];
            for (var i = 0; i < tables.length; i++) {
                if (cur_frm.doc[tables[i]]) {
                    r = cur_frm.doc[tables[i]].find(x => x.name === name);
                    if (r) break;
                }
            }
        }
        return r;
    };

    var row = lookup_row(row_name);
    if (!row) return;

    var item_code = row.item_code || row.production_item || (cur_frm && cur_frm.doc ? (cur_frm.doc.production_item || cur_frm.doc.item_code) : "");

    var d = {
        company: "JAYASHREE SPUN BOND",
        quality: final_quality || "NON WOVEN FABRIC",
        gsm: final_gsm,
        color: final_color,
        width_val: final_width_display,
        party_code: cur_frm.doc.party_code || "",
        item_code: item_code,
        barcode_data: row.batch_no || "",
        length: row.meter_per_roll || row.qty || "0",
        gw: (row.gross_wt || row.gross_weight || 0).toFixed(2),
        nw: (row.net_wt || row.net_weight || 0).toFixed(2),
        batch_no: row.batch_no || "",
        roll_no: row.roll_no || ""
    };

    var htmlContent = get_grid_format(d, (cur_frm.doc.custom_label || "").toLowerCase());
    var printWindow = window.open('', 'PRINT', 'height=650,width=500');
    if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
    }
};

// =================================================================
// 5. LAYOUT TEMPLATE (DYNAMIC BY TYPE)
// =================================================================
function get_grid_format(d, type) {
    type = (type || "default").trim().toLowerCase();

    // Determine template type
    var isReliance = type.includes("reliance") || type.includes("relience");
    var isPerfect = type.includes("perfect");
    var isPlainCC = type.includes("plain cc");
    var isPlain = type.includes("plain") && !isPlainCC;
    var isDefault = !isReliance && !isPerfect && !isPlainCC && !isPlain;

    // Header & Subheader Config
    var header = "Non Woven Fabrics";
    var sub1 = d.quality;
    var sub2 = "";

    if (isDefault) {
        header = "JayaShree Spun Bond";
        sub1 = "\u2709 enquiry@jayashreespunbond.com";
        sub2 = d.quality + (d.party_code ? (" | " + d.party_code) : "");
    } else if (isPlainCC) {
        sub1 = d.quality + (d.party_code ? (" | " + d.party_code) : "");
    }

    // Row Definitions
    var rows = [];

    // ROW 2: GSM & COLOR
    rows.push(`
        <tr>
            <td><span class="lbl">GSM:</span><span class="val">${d.gsm}</span></td>
            <td><span class="lbl">COLOR:</span><span class="val">${d.color}</span></td>
        </tr>
    `);

    // ROW 3: LENGTH & WIDTH/SIZE
    var lenLabel = "Mtrs / Roll";

    var lenVal = d.length + " Mtrs";

    var widthLabel = "WIDTH";
    var widthVal = d.width_val;

    if (isPerfect) {
        // Perfect has NO width field
        rows.push(`
            <tr>
                <td colspan="2"><span class="lbl">${lenLabel}:</span><span class="val">${lenVal}</span></td>
            </tr>
        `);
    } else {
        rows.push(`
            <tr>
                <td><span class="lbl">${lenLabel}:</span><span class="val">${lenVal}</span></td>
                <td><span class="lbl">${widthLabel}:</span><span class="val">${widthVal}</span></td>
            </tr>
        `);
    }

    // ROW 4: WEIGHTS
    var wtUnit = " Kgs";
    rows.push(`
        <tr>
            <td><span class="lbl">NET WT:</span><span class="val">${d.nw}${wtUnit}</span></td>
            <td><span class="lbl">GROSS WT:</span><span class="val">${d.gw}${wtUnit}</span></td>
        </tr>
    `);

    return `
    <html>
    <head>
        <title>Label Preview</title>
        <style>
            @media print { .btn-panel { display: none !important; } @page { size: 4in 4in; margin: 0; } body { margin: 0; } }
            body { font-family: 'Arial', sans-serif; margin: 0; padding: 0; text-align: center; background: #eee; }
            .btn-panel { padding: 10px; background: #eee; }
            .sticker { 
                width: 4in; 
                height: 4in; 
                margin: 20px auto; 
                border: 2px solid black; 
                background: white; 
                box-sizing: border-box; 
                display: flex;
                flex-direction: column;
            }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            td { border: 1px solid black; padding: 4px; vertical-align: top; overflow: hidden; }
            
            .header { text-align: center; height: 18mm; vertical-align: middle; padding: 2px 0; }
            .company { font-size: 20px; font-weight: 900; letter-spacing: 0.3px; line-height: 1.1; }
            .email { font-size: 11px; font-weight: bold; color: #333; margin: 1px 0; }
            .subheader { font-size: 12px; font-weight: bold; color: black; }
            .lbl { font-size: 10px; font-weight: bold; color: #444; display: block; }
            .val { font-size: 15px; font-weight: 900; color: #000; display: block; }
            
            .barcode-container { 
                flex-grow: 1;
                display: flex;
                flex-direction: column; 
                justify-content: center;
                align-items: center;
                padding: 5px;
                border-top: 1px solid black;
            }
            #barcode { 
                max-width: 95%; 
                height: 70px; 
            }
            .footer-info { 
                font-size: 13px; 
                font-weight: bold; 
                margin-top: 10px;
                padding-bottom: 5px;
            }
        </style>
    </head>
    <body>
        <div class="btn-panel">
            <button onclick="window.print()" style="padding:10px 20px; font-weight:bold; cursor:pointer;">PRINT</button>
            <button onclick="window.close()" style="padding:10px 20px; margin-left:10px;">CLOSE</button>
        </div>
        <div class="sticker">
            <table>
                <tr>
                    <td colspan="2" class="header">
                        <div class="company">${header}</div>
                        <div class="${isDefault ? 'email' : 'subheader'}">${sub1}</div>
                        ${sub2 ? `<div class="subheader">${sub2}</div>` : ''}
                    </td>
                </tr>
                <tr><td colspan="2" style="text-align:center;"><span class="lbl">ITEM:</span><span class="val">${d.item_code}</span></td></tr>
                ${rows.join('')}
            </table>
            <div class="barcode-container">
                <svg id="barcode"></svg>
                <div class="footer-info">
                    BATCH: ${d.batch_no} | ROLL: ${d.roll_no}
                </div>
            </div>
        </div>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.0/dist/JsBarcode.all.min.js"></script>
        <script>
            JsBarcode("#barcode", "${d.barcode_data}", {
                format: "CODE128",
                displayValue: false,
                height: 70,
                width: 2.0,
                margin: 0
            });
        </script>
    </body>
    </html>`;
}

// =================================================================
// 6. HELPERS
// =================================================================
function trigger_submission(frm) {
    frappe.dom.freeze('Syncing...');
    frappe.call({
        method: 'submit_roll_production',
        args: { roll_entry: frm.doc.name },
        callback: function (r) {
            frappe.dom.unfreeze();
            if (r.message && r.message.success) {
                frappe.msgprint({ title: __('Success'), message: r.message.stock_entry, indicator: 'green' });
                frm.reload_doc();
            }
        },
        error: () => frappe.dom.unfreeze()
    });
}

function calculate_total(frm) {
    let total_qty = 0;
    (frm.doc.roll_wise_entry || []).forEach(row => {
        total_qty += flt(row.net_weight || row.net_wt || 0);
    });
    frm.set_value('actual_qty', total_qty);
}
