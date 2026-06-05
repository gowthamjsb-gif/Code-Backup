/*
    Client Script for: Purchase Receipt
    Name: Asset Purchase Labels
    Type: Form

    *** IMPORTANT SETUP INSTRUCTIONS ***
    In the "Purchase Receipt Item" doctype customization, you MUST add 3 fields for this to work:
    1. Fieldname: is_warrantied   | Type: Select (Options: No\nYes) or Check
    2. Fieldname: warranty_end_date | Type: Date
    3. Fieldname: print_asset_label | Type: Button
*/

// Function that triggers when the button is clicked
function trigger_print_label(frm, cdt, cdn) {
    let row = locals[cdt][cdn];

    // Immediate feedback so you know the button works
    frappe.show_alert({ message: __('Preparing Asset Label...'), indicator: 'blue' });

    // Ensure it's an asset item
    if (!row.item_code || !row.item_code.startsWith('AS - ')) {
        frappe.msgprint(__('This button is only for Asset Items (Item Code starts with "AS - ").'));
        return;
    }

    print_single_asset_label(frm, row);
}

// Listen to the button click inside the "Purchase Receipt Item" child table
// Covering multiple possible fieldnames you might have used for the button!
frappe.ui.form.on('Purchase Receipt Item', {
    print_asset_label: function (frm, cdt, cdn) { trigger_print_label(frm, cdt, cdn); },
    print_label: function (frm, cdt, cdn) { trigger_print_label(frm, cdt, cdn); },
    print: function (frm, cdt, cdn) { trigger_print_label(frm, cdt, cdn); },
    asset_label: function (frm, cdt, cdn) { trigger_print_label(frm, cdt, cdn); },
    print_asset: function (frm, cdt, cdn) { trigger_print_label(frm, cdt, cdn); },
    // Prefix "custom_" is standard in ERPNext for custom fields
    custom_print_asset_label: function (frm, cdt, cdn) { trigger_print_label(frm, cdt, cdn); },
    custom_print_label: function (frm, cdt, cdn) { trigger_print_label(frm, cdt, cdn); },
    custom_print: function (frm, cdt, cdn) { trigger_print_label(frm, cdt, cdn); },
    custom_asset_label: function (frm, cdt, cdn) { trigger_print_label(frm, cdt, cdn); },
    custom_print_asset: function (frm, cdt, cdn) { trigger_print_label(frm, cdt, cdn); }
});

function print_single_asset_label(frm, item) {
    let vendor = frm.doc.supplier_name || frm.doc.supplier || '';
    let posting_date = frappe.datetime.str_to_user(frm.doc.posting_date);

    // --- Asset Extra Info ---
    // Clean description to avoid HTML injection breaking layout
    let description = item.description ? item.description.replace(/<[^>]*>?/gm, '').trim() : item.item_name;
    let asset_location = item.asset_location || item.custom_asset_location || 'Not Specified';
    
    // --- Warranty Logic (from item table row) ---
    // Make sure fieldnames exactly match what you added in "Purchase Receipt Item"
    let is_warrantied = "No";
    let is_war_flag = item.is_warrantied || item.has_warranty || item.custom_is_warrantied;
    if (is_war_flag === 'Yes' || is_war_flag === 1 || is_war_flag === true) {
        is_warrantied = "Yes";
    }

    let warranty_end_raw = item.warranty_end_date || item.warranty_expiry_date || item.custom_warranty_end_date;
    let warranty_end = (is_warrantied === 'Yes' && warranty_end_raw)
        ? frappe.datetime.str_to_user(warranty_end_raw)
        : "N/A";
    // --------------------------------------------

    let labels_html = `
        <div class="label-page">
            <div class="header">
                <div class="company-name">Jayashree Spun Bond</div>
                <div class="company-contact">enquiry@jayashreespunbond.com | Ph: 9789578884</div>
            </div>
            
            <div class="body-container">
                <div class="details-section">
                    <div class="row">
                        <div class="label">Vendor:</div>
                        <div class="value">${vendor}</div>
                    </div>
                    <div class="row">
                        <div class="label">Item Code:</div>
                        <div class="value">${item.item_code}</div>
                    </div>
                    <div class="row" style="margin-bottom: 5px;">
                        <div class="label">Name:</div>
                        <div class="value item-name-val">${item.item_name}</div>
                    </div>
                    <div class="row desc-row" style="margin-bottom: 5px;">
                        <div class="label">Desc:</div>
                        <div class="value desc-val">${description}</div>
                    </div>
                    <div class="row" style="margin-bottom: 5px;">
                        <div class="label">Location:</div>
                        <div class="value">${asset_location}</div>
                    </div>
                    <div class="two-cols">
                        <div class="col" style="flex: 0.8;">
                            <div class="label">Date:</div>
                            <div class="value">${posting_date}</div>
                        </div>
                        <div class="col" style="flex: 1.2; justify-content: flex-end;">
                            <div class="label">Wty:</div>
                            <div class="value" style="white-space: nowrap;">${is_warrantied}${is_warrantied === 'Yes' ? ' (' + warranty_end + ')' : ''}</div>
                        </div>
                    </div>
                </div>
                
                <div class="qr-section">
                    <div id="qrcode"></div>
                </div>
            </div>
        </div>
    `;

    let html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Asset Label - ${item.item_code}</title>
        <!-- Include QRCodeJS library -->
        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
        <style>
            body { margin: 0; padding: 0; background-color: #f0f0f0; }
            * { box-sizing: border-box; font-family: "Helvetica Neue", Arial, sans-serif; }
            
            /* The 4x2 inch label styling */
            .label-page {
                width: 4in;
                height: 2in;
                background-color: white;
                margin: 0 auto;
                padding: 0.12in;
                page-break-after: always;
                position: relative;
                overflow: hidden;
            }
            
            /* Header Styling */
            .header {
                text-align: center;
                border-bottom: 2px solid #000;
                padding-bottom: 5px;
                margin-bottom: 8px;
            }
            .company-name {
                font-weight: bold;
                font-size: 17px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .company-contact {
                font-size: 10px;
                margin-top: 2px;
            }
            
            /* Layout */
            .body-container {
                display: flex;
                height: 1.4in; /* remaining height approx */
            }
            
            .details-section {
                flex: 1;
                font-size: 12px;
                line-height: 1.4;
                padding-right: 8px;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
            }
            
            .qr-section {
                width: 100px;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                padding-left: 8px;
                border-left: 1px dashed #ccc;
            }
            
            .row {
                display: flex;
                margin-bottom: 5px;
                white-space: nowrap;
                overflow: hidden;
            }
            .label { font-weight: bold; width: 70px; flex-shrink: 0; }
            .value { flex-grow: 1; overflow: hidden; text-overflow: ellipsis; }
            
            .item-name-val {
                white-space: normal; 
                line-height: 1.2; 
                max-height: 28px; 
                font-size: 12px;
                font-weight: bold;
            }
            
            .desc-row {
                align-items: flex-start;
            }
            .desc-val {
                white-space: normal; 
                line-height: 1.2; 
                max-height: 28px; 
                font-size: 11px;
            }

            .two-cols {
                display: flex;
                justify-content: space-between;
                margin-top: auto;
                border-top: 1px dotted #ccc;
                padding-top: 6px;
            }
            .col { display: flex; flex: 1; overflow: hidden; }
            .col .label { width: auto; margin-right: 4px; }
            
            /* QR Code adjustments */
            #qrcode {
                width: 90px;
                height: 90px;
            }
            #qrcode img {
                width: 100%;
                height: auto;
            }

            @media print {
                body { background-color: white; margin: 0; }
                .label-page { margin: 0; border: none; padding: 0.12in; }
                @page { margin: 0; size: 4in 2in; }
            }
        </style>
    </head>
    <body onload="initQR()">
        ${labels_html}
        <script>
            function initQR() {
                try {
                    // Generate QR Code with the specified website
                    new QRCode(document.getElementById("qrcode"), {
                        text: "https://www.jayashreespunbond.com/",
                        width: 90,
                        height: 90,
                        colorDark : "#000000",
                        colorLight : "#ffffff",
                        correctLevel : QRCode.CorrectLevel.M
                    });
                } catch (e) {
                    console.error("QR Code generation failed", e);
                }
                
                // Allow rendering before calling print
                setTimeout(() => {
                    window.print();
                }, 500);
            }
        </script>
    </body>
    </html>
    `;

    let print_window = window.open('', '_blank');
    print_window.document.write(html);
    print_window.document.close();
}
