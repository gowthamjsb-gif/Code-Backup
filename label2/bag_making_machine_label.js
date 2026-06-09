// New Label Format for Bag Making Machines
// Paste this as a separate Client Script in ERPNext for the 'Shaft Production Run' DocType.

var old_run_print_logic = frappe.run_print_logic;

frappe.run_print_logic = function (row_name, final_width_display, final_gsm, final_color, final_quality, frm, custom_fields) {
    var f = frm || cur_frm;
    
    // The specific machines from the provided images
    var valid_units = [
        "TTT- L3 - OYANG C900 BAG MAKING LINE",
        "TTT- L2 - OYANG C700 BAG MAKING LINE",
        "TTT- L1 - OYANG C700 BAG MAKING LINE",
        "VTP-L1 LEADER OYANG MACHINE",
        "VTP-L2 LEADER ZX MACHINE",
        "JVE-L3 B700 BAG MAKING MACHINE",
        "JVE-L2 B700 BAG MAKING MACHINE",
        "JVE-L1 B700 BAG MAKING MACHINE"
    ];

    if (f && f.doc && f.doc.custom_unit && valid_units.includes(f.doc.custom_unit.trim())) {
        run_bag_making_label(row_name, final_width_display, final_gsm, final_color, final_quality, f, custom_fields);
    } else {
        if (old_run_print_logic) {
            old_run_print_logic(row_name, final_width_display, final_gsm, final_color, final_quality, frm, custom_fields);
        } else {
            frappe.msgprint("Original print logic not found.");
        }
    }
};

function run_bag_making_label(row_name, final_width_display, final_gsm, final_color, final_quality, frm, custom_fields) {
    var f = frm;
    var row = (locals['Shaft Production Run Item'] || {})[row_name] ||
        (locals['Shaft Production Run Roll'] || {})[row_name] ||
        (f.doc.items || []).find(function (r) { return r.name === row_name; }) ||
        (f.doc.roll_wise_entry || []).find(function (r) { return r.name === row_name; });

    if (!row) return;

    var proceed_run = function (customer_name) {
        var raw_batch = row.batch_no || "";
        
        var d_code = row.custom_design_code || row.design_code || "";
        var d_name = row.custom_design_name || row.design_name || "";
        var d_code_name = d_code;
        if (d_name) {
            d_code_name += (d_code ? " - " : "") + d_name;
        }
        
        // Fallback for item_name if design fields are not populated
        if (!d_code_name && row.item_name) {
            var name_parts = row.item_name.split('-');
            if (name_parts.length >= 2) {
                d_code_name = name_parts[0].trim() + " - " + name_parts[1].trim();
            } else {
                d_code_name = row.item_name;
            }
        }

        var no_of_pieces = row.custom_achieved_bag_pcs || row.custom_total_produced_bags || row.qty || row.custom_total_pieces || row.custom_no_of_pieces || row.produced_qty || "0";

        var d = {
            company: "Jayashree Spun Bond",
            email: "info@jayashreespunbond.com",
            gw: (flt(row.gross_weight) || flt(row.net_weight)).toFixed(2),
            nw: flt(row.net_weight).toFixed(2),
            batch_no: raw_batch,
            order_code: row.party_code || row.order_code || row.customer_order_no || f.doc.party_code || f.doc.order_code || "",
            barcode_data: raw_batch,
            bag_size: row.custom_sheet_size || row.custom_bag_size || row.bag_size || "",
            gsm: final_gsm || row.custom_gsm || row.gsm || "",
            design_code_name: d_code_name,
            no_of_pieces: no_of_pieces
        };

        var htmlContent = get_bag_making_grid_format(d);
        var printWindow = window.open('', '_blank', 'height=650,width=500');
        if (printWindow) { 
            printWindow.document.write(htmlContent); 
            printWindow.document.close(); 
        }
    };

    proceed_run();
}

function get_bag_making_grid_format(d) {
    var rows = [];
    
    // Requested fields: Design Code & Name, Bag Size, GSM, No of Pieces, Gross Weight, Net Weight
    if (d.design_code_name) {
        rows.push('<tr><td class="label">DESIGN</td><td class="colon">:</td><td class="value">' + escape_html_bag(d.design_code_name).toUpperCase() + '</td></tr>');
    }
    if (d.bag_size) {
        rows.push('<tr><td class="label">BAG SIZE</td><td class="colon">:</td><td class="value">' + escape_html_bag(d.bag_size) + '</td></tr>');
    }
    if (d.gsm) {
        rows.push('<tr><td class="label">GSM</td><td class="colon">:</td><td class="value">' + escape_html_bag(d.gsm).replace(/gsm/i, '').trim() + ' GSM</td></tr>');
    }
    
    rows.push('<tr><td class="label">NO OF PIECES</td><td class="colon">:</td><td class="value">' + escape_html_bag(d.no_of_pieces) + ' Pieces</td></tr>');
    rows.push('<tr><td class="label">NET WEIGHT</td><td class="colon">:</td><td class="value">' + escape_html_bag(d.nw) + ' Kgs</td></tr>');
    rows.push('<tr><td class="label">GROSS WEIGHT</td><td class="colon">:</td><td class="value">' + escape_html_bag(d.gw) + ' Kgs</td></tr>');

    var header = '<div class="header">';
    header += '<div class="company" style="font-family: Arial, sans-serif; font-size: 22px; margin-bottom: 5px;">BAG DETAILS</div>';
    if (d.order_code) {
        header += '<div class="quality">' + escape_html_bag(d.order_code).toUpperCase() + '</div>';
    }
    header += '</div>';

    var footer = '<div class="footer-row">BATCH No : ' + escape_html_bag(d.batch_no) + '</div>';
    var barcode_html = '<div class="barcode-section"><svg id="bag_barcode"></svg></div>';

    var html = '<html><head><title>Bag Making Label Preview</title><style>';
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
    html += '#bag_barcode { max-width: 95%; height: auto; }';
    html += '</style></head><body>';
    html += '<div class="btn-panel"><button onclick="window.print()">PRINT</button><button onclick="window.close()">CLOSE</button></div>';
    html += '<div class="label-container">';
    html += header;
    html += '<div class="body-table"><table>' + rows.join('') + '</table></div>';
    html += footer;
    html += barcode_html;
    html += '</div>';
    html += '<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.0/dist/JsBarcode.all.min.js"><\/script>';
    html += '<script>if("' + d.barcode_data + '"){ JsBarcode("#bag_barcode", "' + escape_html_bag(d.barcode_data) + '", { format: "CODE128", displayValue: true, text: "' + escape_html_bag(d.barcode_text || d.barcode_data) + '", fontSize: 13, textMargin: 2, height: 46, width: 2, margin: 0 }); }<\/script>';
    html += '</body></html>';
    
    return html;
}

function escape_html_bag(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
