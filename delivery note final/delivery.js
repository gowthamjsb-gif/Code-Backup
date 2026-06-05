// =========================================================================
//  MASTER SCRIPT: Delivery Note Roll Scanning & Delivered Weight Tracking
//  WARNING: Disable ALL OTHER barcode/scanner scripts to prevent conflicts!
//
//  TWO MODES:
//  ─ TYPE 1: Items already loaded into DN (via Get Items from SO manually).
//            Scan adds roll weight to existing rows. Original behaviour.
//  ─ TYPE 2: Customer selected on DN header. Items table is empty.
//            Scan → reads party code from batch → finds Sales Order via
//            custom_party_code field → creates item rows one-by-one linked
//            to SO → SO status updates automatically on submit.
//
//  SO QTY AUTO-ADJUSTMENT (Submit Flow):
//  Scan ALL rolls silently — no popup during scanning.
//  SAVE → saves normally.
//  SUBMIT → before_submit fires → compares custom_delivered vs SO qty.
//  Mismatch found → popup table shows all mismatches:
//    Item | SO Qty | Scanned Qty | SO Amount | Updated Amount
//  [✅ Update SO & Continue] → server script updates SO rows via direct
//    db_update (NO calculate_taxes_and_totals — avoids cloud column errors)
//    → DN row qty updated → green alert → user manually clicks Submit.
//  [⏭️ Skip & Submit As-Is] → DN submits immediately with original SO qty.
//
//  MULTI-ORDER-CODE SUPPORT (Same Customer):
//  Multiple Sales Orders allowed in one DN if ALL belong to same customer.
//
//  UNIVERSAL CUSTOMER GUARD:
//  Every scan — regardless of item code — checks the batch order code
//  against the DN customer BEFORE routing. Blocks different-customer rolls.
// =========================================================================

let scanned_rolls = {};

// MODE: Aggregate all rolls of the same item into ONE DN item row.
// The qty and custom_delivered fields will accumulate the total scanned weight.
const DN_ROLL_ROW_MODE = false;
const DN_SBB_LOOKUP_METHOD = 'get_sbb_for_roll_batches';
const DN_DEFAULT_WAREHOUSE = 'Finished Goods - JSB-1ZT';

frappe.ui.form.on('Delivery Note', {

    validate: function (frm) {
        let has_mismatch = false;
        let mismatch_lines = [];

        (frm.doc.items || []).forEach(row => {
            let ordered = flt(row.custom_delivered);
            let delivered = flt(row.qty);

            if (ordered > 0 && delivered !== ordered) {
                has_mismatch = true;
                let status_word = delivered > ordered
                    ? `<b style="color:red;">EXCEEDS ordered quantity</b>`
                    : `<b style="color:orange;">is LESS than ordered quantity</b>`;
                mismatch_lines.push(`• Item <b>${row.item_code}</b>: Scanned ${delivered} kg ${status_word} (${ordered} kg).`);
            }
        });

        if (has_mismatch && !frm.__ignore_mismatch) {
            frappe.validated = false;
            frappe.confirm(
                `<b>Quantity Warning Before Saving:</b><br><br>${mismatch_lines.join('<br><br>')}<br><br>Do you want to FORCE SAVE anyway?`,
                () => { frm.__ignore_mismatch = true; frm.save(); },
                () => { frappe.msgprint("Save cancelled. You can continue scanning."); }
            );
        }
    },

    refresh: function (frm) {
        frm.__ignore_mismatch = false;
        frm.__type2_so_name = null;
        frm.__bundle_sync_done = false;
        scanned_rolls = {};

        // Restore scanned_rolls from saved data
        (frm.doc.items || []).forEach(row => {
            if (row.custom_scanned_rolls_data) {
                try {
                    let rolls = JSON.parse(row.custom_scanned_rolls_data);
                    if (Array.isArray(rolls) && rolls.length > 0) {
                        scanned_rolls[row.name] = rolls;
                        let total = flt(rolls.reduce((s, r) => s + r.net, 0), 3);
                        if (flt(row.qty) !== total) {
                            frappe.model.set_value(row.doctype, row.name, 'qty', total);
                        }
                    }
                } catch (e) {
                    console.warn("Could not parse rolls data for row:", row.name, e);
                }
            }
        });

        // Restore Type 2 SO link
        for (let row of (frm.doc.items || [])) {
            if (row.against_sales_order) {
                frm.__type2_so_name = row.against_sales_order;
                break;
            }
        }

        frm.set_df_property('scan_barcode', 'hidden', 1);
        if (frm.fields_dict.custom_scan_roll_here) {
            frm.set_df_property('custom_scan_roll_here', 'hidden', 1);
        }

        inject_custom_scanner(frm);
        setTimeout(() => add_rolls_buttons(frm), 1000);
    },

    after_save: function (frm) {
        setTimeout(() => add_rolls_buttons(frm), 1000);
    },

    after_submit: function (frm) {
        frm.__bundle_sync_done = false;
    },

    // ─────────────────────────────────────────────────────────────────────────
    //  BEFORE SUBMIT
    //  No popup during scanning. Only fires here on Submit click.
    //  Compares custom_delivered vs SO qty for every linked row.
    // ─────────────────────────────────────────────────────────────────────────
    before_submit: function (frm) {

        if (frm.__skip_so_check) {
            frm.__skip_so_check = false;
            return;
        }

        // Keep DN stock posting aligned with scanned rolls only:
        // 1) rows with scanned qty -> force qty to scanned qty
        // 2) rows with zero scanned qty -> remove before submit
        // This prevents ERPNext from posting original full SO quantities.
        let kept_rows = [];
        let removed_rows = [];

        (frm.doc.items || []).forEach(row => {
            let delivered_qty = flt(row.qty || 0, 3);
            if (delivered_qty <= 0) {
                removed_rows.push(row);
                return;
            }

            // Scanned net weight is treated as final posting quantity.
            // Force 1:1 conversion to avoid inflated stock_qty at submit.
            row.conversion_factor = 1;
            row.amount = flt(delivered_qty * flt(row.rate || 0), 2);
            row.stock_qty = flt(delivered_qty, 6);
            kept_rows.push(row);
        });

        if (!kept_rows.length) {
            frappe.validated = false;
            frappe.msgprint({
                title: '⚠️ No Scanned Quantity',
                message: 'No item has scanned quantity. Please scan at least one roll before submitting.',
                indicator: 'orange'
            });
            return;
        }

        if (removed_rows.length) {
            frm.doc.items = kept_rows;
            frm.refresh_field('items');
            frappe.show_alert({
                message: `ℹ️ Removed ${removed_rows.length} unscanned row(s) before submit.`,
                indicator: 'blue'
            }, 4);
        }

        // In roll-row mode, each scan already creates its own row.

        let mismatches = [];

        (frm.doc.items || []).forEach(row => {
            if (!row.against_sales_order || !row.so_detail) return;

            let so_qty = flt(row.custom_delivered || 0);
            let delivered_qty = flt(row.qty || 0);

            if (!delivered_qty) return;

            if (flt(delivered_qty, 3) !== flt(so_qty, 3)) {
                mismatches.push({
                    row: row,
                    so_name: row.against_sales_order,
                    so_detail: row.so_detail,
                    item_code: row.item_code,
                    dn_qty: flt(row.qty || 0),
                    actual_qty: delivered_qty,
                    rate: flt(row.rate || 0)
                });
            }
        });

        if (!mismatches.length) return;

        frappe.validated = false;
        show_before_submit_so_popup(frm, mismatches);
    },
});

// ─────────────────────────────────────────────
//  SCANNER INJECTION
// ─────────────────────────────────────────────
function inject_custom_scanner(frm) {
    if (!frm.fields_dict.items || !frm.fields_dict.items.$wrapper) return;
    let wrapper = frm.fields_dict.items.$wrapper;
    if ($('#dn_pure_roll_scanner').length > 0) return;

    let html = `
<div style="margin-bottom:20px;padding:15px;background:#ebf5fa;border:1px solid #b8daff;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
  <label style="font-weight:600;font-size:13px;margin-bottom:8px;display:block;color:#0056b3;">
    🧵 Roll / Batch Scanner (Auto Weight Tracking)
  </label>
  <div style="position:relative;display:flex;align-items:center;width:100%;">
    <input type="text" id="dn_pure_roll_scanner" autocomplete="off"
      placeholder="Scan Roll Barcode Here..."
      style="width:100%;border-radius:4px;box-sizing:border-box;background:#fff;font-weight:bold;border:2px solid #0056b3;font-size:15px;padding:10px 50px 10px 12px;transition:border-color 0.15s,box-shadow 0.15s;">
    <button id="btn_open_camera" type="button" title="Open Camera Scanner"
      style="position:absolute;right:4px;top:4px;bottom:4px;background:#e3f2fd;border:1px solid #bbdefb;border-radius:3px;cursor:pointer;padding:0 12px;display:flex;align-items:center;justify-content:center;color:#0056b3;z-index:10;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="4" y1="7" x2="4" y2="4"></line><line x1="4" y1="4" x2="7" y2="4"></line>
        <line x1="20" y1="7" x2="20" y2="4"></line><line x1="20" y1="4" x2="17" y2="4"></line>
        <line x1="4" y1="17" x2="4" y2="20"></line><line x1="4" y1="20" x2="7" y2="20"></line>
        <line x1="20" y1="17" x2="20" y2="20"></line><line x1="20" y1="20" x2="17" y2="20"></line>
        <rect x="7" y="9" width="10" height="6" rx="1"></rect>
      </svg>
    </button>
  </div>
  <p style="font-size:11.5px;color:#666;margin-top:8px;margin-bottom:0;">
    <span style="color:#111;font-weight:bold;">Important:</span> Use this box or the camera icon for scanning. It deeply tracks net weights without creating messy rows!
  </p>
  <div style="margin-top:10px;display:flex;align-items:center;gap:8px;padding:8px 10px;background:#fff8e1;border:1px solid #ffe082;border-radius:4px;">
    <input type="checkbox" id="dn_cross_customer_override" style="width:16px;height:16px;cursor:pointer;accent-color:#e65100;">
    <label for="dn_cross_customer_override" style="font-size:12.5px;color:#5d4037;font-weight:600;cursor:pointer;margin:0;">
      ⚠️ Allow Cross-Customer Rolls <span style="font-weight:400;color:#888;">(enables spec-match check before override)</span>
    </label>
  </div>
</div>`;

    wrapper.before(html);

    $('#dn_pure_roll_scanner').on('focus', function () {
        $(this).css({ 'box-shadow': '0 0 0 0.2rem rgba(0,123,255,0.25)', 'outline': '0' });
    }).on('blur', function () {
        $(this).css({ 'box-shadow': 'none' });
    });

    $('#dn_pure_roll_scanner').on('keydown', function (e) {
        if (e.key === 'Enter' || e.which === 13) {
            e.preventDefault();
            e.stopPropagation();
            let barcode = $(this).val().trim();
            $(this).val('');
            if (barcode) process_scan(frm, barcode);
        }
    });

    $('#btn_open_camera').on('click', function (e) {
        e.preventDefault();
        new frappe.ui.Scanner({
            dialog: true,
            dialog_title: "📷 Scan Roll Barcode",
            multiple: false,
            on_scan(data) {
                if (data && data.decodedText) {
                    frappe.show_alert({ message: `Scanned: ${data.decodedText}`, indicator: 'green' });
                    process_scan(frm, data.decodedText.trim());
                }
            }
        });
    });

    setTimeout(() => $('#dn_pure_roll_scanner').focus(), 500);
}

// ─────────────────────────────────────────────
//  SAVE ROLLS DATA
// ─────────────────────────────────────────────
function save_rolls_data(frm, row_name, row_doctype) {
    let rolls = scanned_rolls[row_name] || [];
    let json_data = JSON.stringify(rolls);
    if (locals[row_doctype] && locals[row_doctype][row_name]) {
        locals[row_doctype][row_name]['custom_scanned_rolls_data'] = json_data;
    }
    try {
        let p = frappe.model.set_value(row_doctype, row_name, 'custom_scanned_rolls_data', json_data);
        if (p && p.finally) p.finally(() => { });
    } catch (e) { console.warn("save_rolls_data error:", e); }
}

// ─────────────────────────────────────────────
//  SAFE DELIVERED UPDATER
// ─────────────────────────────────────────────
function set_delivered_safe(frm, row_name, doctype, value) {
    if (locals[doctype] && locals[doctype][row_name]) {
        locals[doctype][row_name]['custom_delivered'] = value;
    }
    frm.refresh_field('items');
    try {
        let p = frappe.model.set_value(doctype, row_name, 'custom_delivered', value);
        if (p && p.finally) p.finally(() => frm.refresh_field('items'));
    } catch (e) { }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ROLL HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function get_rolls_array_for_dn_row(frm, row) {
    let rolls = scanned_rolls[row.name];
    if (rolls && rolls.length) return rolls.slice();
    if (row.custom_scanned_rolls_data) {
        try {
            let parsed = JSON.parse(row.custom_scanned_rolls_data);
            return Array.isArray(parsed) ? parsed.slice() : [];
        } catch (e) {
            return [];
        }
    }
    return [];
}

function apply_dn_row_scan_batch_mode(row) {
    row.serial_and_batch_bundle = '';
    row.use_serial_batch_fields = 1;
}

function lookup_and_set_sbb_for_row(frm, dn_row, batch_no) {
    if (!DN_SBB_LOOKUP_METHOD || !String(DN_SBB_LOOKUP_METHOD).trim()) return;
    frappe.call({
        method: DN_SBB_LOOKUP_METHOD,
        args: {
            item_code: dn_row.item_code,
            warehouse: dn_row.warehouse || '',
            batch_nos: [batch_no]
        },
        callback: function (r) {
            let map = (r && r.message && r.message.map) ? r.message.map : {};
            let sbb = map && map[batch_no];
            if (!sbb) {
                // keep classic batch field mode if no bundle found
                frappe.model.set_value(dn_row.doctype, dn_row.name, 'use_serial_batch_fields', 1);
                return;
            }
            frappe.model.set_value(dn_row.doctype, dn_row.name, 'serial_and_batch_bundle', sbb);
            frappe.model.set_value(dn_row.doctype, dn_row.name, 'use_serial_batch_fields', 0);
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
//  BEFORE-SUBMIT SO QTY POPUP
//  Uses direct db_update server script.
//  Does NOT use calculate_taxes_and_totals() — avoids cloud ERPNext
//  MySQLdb "Unknown column" error caused by missing custom fields.
// ─────────────────────────────────────────────────────────────────────────────
function show_before_submit_so_popup(frm, mismatches) {

    let table_rows = mismatches.map(m => {
        let new_amt = flt(m.actual_qty * m.rate, 2);
        let old_amt = flt(m.dn_qty * m.rate, 2);
        let diff = flt(m.actual_qty - m.dn_qty, 3);
        let color = diff > 0 ? '#b00020' : '#c07a00';
        return `
<tr>
    <td style="padding:8px 10px;border:1px solid #d1d8dd;font-size:12px;">${m.item_code}</td>
    <td style="padding:8px 10px;border:1px solid #d1d8dd;text-align:right;">${m.dn_qty}</td>
    <td style="padding:8px 10px;border:1px solid #d1d8dd;text-align:right;font-weight:700;color:${color};">${m.actual_qty}</td>
    <td style="padding:8px 10px;border:1px solid #d1d8dd;text-align:right;">₹ ${old_amt.toLocaleString('en-IN')}</td>
    <td style="padding:8px 10px;border:1px solid #d1d8dd;text-align:right;font-weight:700;color:${color};">₹ ${new_amt.toLocaleString('en-IN')}</td>
</tr>`;
    }).join('');

    let popup_html = `
<div style="padding:6px 0 14px;">
    <p style="font-size:14px;font-weight:700;margin-bottom:4px;text-align:center;">
        ⚙️ Sales Order Qty Update Required
    </p>
    <p style="font-size:13px;color:#555;margin-bottom:14px;text-align:center;">
        The following item(s) were scanned at a different quantity than the Sales Order.<br>
        Click <b>Update SO & Continue</b> to update the SO before submitting.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px;">
        <thead>
            <tr style="background:#f0f4f8;">
                <th style="padding:8px 10px;border:1px solid #d1d8dd;text-align:left;">Item</th>
                <th style="padding:8px 10px;border:1px solid #d1d8dd;text-align:right;">SO Qty</th>
                <th style="padding:8px 10px;border:1px solid #d1d8dd;text-align:right;">Scanned Qty</th>
                <th style="padding:8px 10px;border:1px solid #d1d8dd;text-align:right;">SO Amount</th>
                <th style="padding:8px 10px;border:1px solid #d1d8dd;text-align:right;">Updated Amount</th>
            </tr>
        </thead>
        <tbody>${table_rows}</tbody>
    </table>
    <p style="font-size:12px;color:#555;background:#fff8e1;border:1px solid #ffe082;border-radius:4px;padding:8px 12px;">
        ⚙️ Only qty + amount on each SO item row are updated via direct DB write.<br>
        SO stays <b>Submitted</b>. Planning Sheet, Work Orders — <b>completely untouched</b>.<br>
        After updating, <b>manually click Submit</b> to complete the Delivery Note.
    </p>
</div>`;

    let d = new frappe.ui.Dialog({
        title: `⚙️ Update Sales Order Before Submit`,
        fields: [{ fieldtype: 'HTML', options: popup_html }],

        primary_action_label: `✅ Update SO & Continue`,
        primary_action() {
            d.hide();
            frappe.show_alert({ message: `⚙️ Updating Sales Order(s)...`, indicator: 'blue' }, 4);

            let promises = mismatches.map(m => {
                return new Promise((resolve, reject) => {
                    frappe.call({
                        method: 'update_so_item_qty',
                        args: {
                            so_name: m.so_name,
                            so_detail: m.so_detail,
                            item_code: m.item_code,
                            actual_qty: m.actual_qty,
                            rate: m.rate
                        },
                        callback(r) {
                            if (r.exc || !r.message || !r.message.success) {
                                reject(m.so_name + ': ' + (r.exc || 'unknown error'));
                            } else {
                                frappe.model.set_value(m.row.doctype, m.row.name, 'qty', m.actual_qty)
                                    .then(() => resolve())
                                    .catch(() => resolve());
                            }
                        }
                    });
                });
            });

            Promise.all(promises)
                .then(() => {
                    frm.refresh_field('items');
                    frappe.show_alert({
                        message: `✅ Sales Order(s) updated successfully. You can now Submit the Delivery Note.`,
                        indicator: 'green'
                    }, 8);
                })
                .catch(err => {
                    frappe.msgprint({
                        title: '❌ SO Update Failed',
                        message: `One or more SO updates failed:<br><b>${err}</b><br><br>
                            Make sure Server Script <b>"update_so_item_qty"</b> is created and enabled.`,
                        indicator: 'red'
                    });
                });
        },

        secondary_action_label: '⏭️ Skip & Submit As-Is',
        secondary_action() {
            d.hide();
            frappe.show_alert({ message: `⏭️ Skipped SO update. Submitting DN as-is.`, indicator: 'orange' }, 4);
            frm.__skip_so_check = true;
            frm.savesubmit();
        }
    });

    d.show();
}

// ─────────────────────────────────────────────────────────────────────────────
//  CORE SCAN LOGIC
//  STEP 0: Hard block — already in submitted DN?
//  STEP 1: Already scanned this session? → Remove mode
//  STEP 2: Fetch batch from DB
//  STEP 3: Universal customer guard (blocks same-item different-customer)
//  STEP 4: Route to type1 / type2
// ─────────────────────────────────────────────────────────────────────────────
function process_scan(frm, batch_no) {

    // ── STEP 0: Hard block — already delivered in a SUBMITTED DN? ────────────
    frappe.call({
        method: 'frappe.client.get_list',
        args: {
            doctype: 'Delivery Note',
            filters: [
                ['Delivery Note Item', 'batch_no', '=', batch_no],
                ['docstatus', '=', 1]
            ],
            fields: ['name'],
            limit: 5
        },
        callback: function (r) {
            var already_delivered = (r.message || []).filter(function (dn) {
                return dn.name !== frm.doc.name;
            });

            if (already_delivered.length > 0) {
                var dn_links = already_delivered.map(function (e) {
                    return '<b>' + e.name + '</b>';
                }).join(', ');
                frappe.msgprint({
                    title: '❌ Roll Already Delivered!',
                    message: `
<div style="text-align:center;padding:10px 0;">
    <div style="font-size:48px;margin-bottom:10px;">🚫</div>
    <p style="font-size:15px;font-weight:bold;color:#b00020;">
        Roll / Batch No: <span style="font-family:monospace;">${batch_no}</span>
    </p>
    <p style="font-size:13px;color:#555;margin-top:8px;">
        Already delivered in: ${dn_links}<br>
        Each roll is unique and cannot be delivered twice.
    </p>
    <p style="font-size:13px;color:#888;margin-top:10px;">Please scan a different roll.</p>
</div>`,
                    indicator: 'red'
                });
                return;
            }

            // ── STEP 1: Already scanned THIS SESSION? → REMOVE MODE ──────────
            var already_scanned_row = null;
            Object.keys(scanned_rolls).forEach(function (r_name) {
                if (scanned_rolls[r_name].find(function (r) { return r.batch_no === batch_no; })) {
                    already_scanned_row = r_name;
                }
            });

            if (already_scanned_row) {
                frappe.confirm(`Roll <b>${batch_no}</b> is already scanned.<br><br>Do you want to <b>REMOVE</b> this roll?`, function () {

                    scanned_rolls[already_scanned_row] =
                        (scanned_rolls[already_scanned_row] || []).filter(function (r) {
                            return r.batch_no !== batch_no;
                        });

                    var row_doc = (frm.doc.items || []).find(function (i) {
                        return i.name === already_scanned_row;
                    });

                    if (!row_doc) return;

                    var remaining_rolls = scanned_rolls[already_scanned_row] || [];

                    if (remaining_rolls.length === 0) {
                        var grid_row = frm.fields_dict.items.grid.grid_rows_by_docname[row_doc.name];
                        if (grid_row) grid_row.remove();
                        delete scanned_rolls[already_scanned_row];
                        frm.refresh_field('items');
                        frappe.show_alert({ message: `🗑️ Roll removed and item row deleted.`, indicator: 'orange' }, 4);
                    } else {
                        var new_total = flt(remaining_rolls.reduce(function (s, r) { return s + r.net; }, 0), 3);
                        set_delivered_safe(frm, already_scanned_row, row_doc.doctype, new_total);
                        save_rolls_data(frm, already_scanned_row, row_doc.doctype);
                        // frappe.model.set_value(row_doc.doctype, row_doc.name, 'batch_no', remaining_rolls[0].batch_no);
                        frm.refresh_field('items');
                        frappe.show_alert({ message: `🗑️ Roll <b>${batch_no}</b> removed!`, indicator: 'orange' }, 4);
                    }

                    setTimeout(function () { add_rolls_buttons(frm); }, 300);
                });
                return;
            }

            // ── STEP 2: Fetch batch from database ────────────────────────────
            frappe.db.get_doc('Batch', batch_no).then(function (batch) {

                var item_code = batch.item;
                var net_wt = flt(batch.custom_net_weight) || 0;
                var gross_wt = flt(batch.custom_gross_weight) || 0;
                var meter = flt(batch.custom_meter) || 0;
                var batch_qty = flt(batch.batch_qty) || net_wt;

                var party = batch.custom_party_code || batch.party_code || batch.custom_party_code_text
                    || batch.party_code_text || batch.party_name || batch.supplier || '';
                if (!party) {
                    for (var k in batch) {
                        if (k.toLowerCase().includes('party') && batch[k] && typeof batch[k] === 'string' && batch[k].trim()) {
                            party = batch[k]; break;
                        }
                    }
                }

                var dn_items = (frm.doc.items || []).filter(function (r) { return r.item_code && r.item_code.trim(); });
                var dn_item_codes = dn_items.map(function (r) { return r.item_code; });

                // ── STEP 3: UNIVERSAL CUSTOMER GUARD ─────────────────────────
                // Runs BEFORE all routing. Catches same-item different-customer
                // rolls that previously bypassed the check (bug now fixed).
                var dn_customer_guard = frm.doc.customer || '';
                var has_existing_so_rows = dn_items.some(function (r) { return !!r.against_sales_order; });

                var override_mode_guard = $('#dn_cross_customer_override').is(':checked');
                if (!override_mode_guard && party && dn_customer_guard && has_existing_so_rows) {
                    frappe.call({
                        method: 'frappe.client.get_list',
                        args: {
                            doctype: 'Sales Order',
                            filters: [
                                ['docstatus', '=', 1],
                                ['custom_party_code', '=', party]
                            ],
                            fields: ['name', 'customer', 'customer_name'],
                            limit: 5
                        },
                        callback: function (guard_r) {
                            var guard_orders = guard_r.message || [];
                            var wrong_customer_so = guard_orders.find(function (o) {
                                return o.customer !== dn_customer_guard;
                            });
                            if (wrong_customer_so) {
                                var roll_cust_display = (wrong_customer_so.customer_name || wrong_customer_so.customer) + ' (' + wrong_customer_so.customer + ')';
                                var dn_cust_display = (frm.doc.customer_name || dn_customer_guard) + ' (' + dn_customer_guard + ')';
                                frappe.msgprint({
                                    title: '❌ Different Customer Roll!',
                                    message: '<div style="text-align:center;padding:10px 0;">'
                                        + '<div style="font-size:48px;margin-bottom:10px;">🚫</div>'
                                        + '<p style="font-size:15px;font-weight:bold;color:#b00020;">'
                                        + 'Roll / Batch No: <span style="font-family:monospace;">' + batch_no + '</span>'
                                        + '</p>'
                                        + '<p style="font-size:13px;color:#555;margin-top:8px;">'
                                        + 'This roll belongs to Order Code: <b>' + party + '</b><br>'
                                        + 'That Order Code belongs to Customer: <b>' + roll_cust_display + '</b><br><br>'
                                        + 'This Delivery Note is locked to Customer: <b>' + dn_cust_display + '</b><br><br>'
                                        + '<b>Rolls from a different customer cannot be added to this Delivery Note.</b>'
                                        + '</p>'
                                        + '<p style="font-size:13px;color:#888;margin-top:10px;">Please scan a roll that belongs to customer <b>' + dn_cust_display + '</b>.</p>'
                                        + '</div>',
                                    indicator: 'red'
                                });
                                return;
                            }
                            // Guard passed → proceed to routing
                            route_after_guard(frm, batch_no, item_code, net_wt, gross_wt, meter, party, batch_qty, dn_items, dn_item_codes, batch);
                        }
                    });

                } else {
                    route_after_guard(frm, batch_no, item_code, net_wt, gross_wt, meter, party, batch_qty, dn_items, dn_item_codes, batch);
                }

            }).catch(function () {
                frappe.show_alert({ message: `❌ Roll <b>${batch_no}</b> not found in database!`, indicator: 'red' }, 5);
            });
        }
    });
}
// ─────────────────────────────────────────────────────────────────────────────
//  SPEC MATCH CHECK — compares batch specs vs target item specs
//  Fields checked: custom_color, custom_gsm, custom_quality, custom_width
//  Calls callback(mismatches_array, is_different_customer, batch_customer_name)
// ─────────────────────────────────────────────────────────────────────────────
function check_spec_and_override(frm, batch_no, batch, so_name, item_code, net_wt, gross_wt, meter, party, batch_qty, on_allow) {

    var dn_customer = frm.doc.customer || '';

    // Find target item row in DN to get its spec (from SO item or DN item)
    var dn_row = (frm.doc.items || []).find(function (r) { return r.item_code === item_code; });

    // Batch specs
    var batch_color = (batch.custom_color || batch.color || '').toString().trim();
    var batch_gsm = flt(batch.custom_gsm || batch.gsm || 0);
    var batch_quality = (batch.custom_quality || batch.quality || '').toString().trim();
    var batch_width = flt(batch.custom_width || batch.width || 0);

    // Find SO party/customer to show in popup
    var roll_party = party || '';

    // Get target specs from the item master or SO item
    var get_target_specs = function (callback_specs) {
        if (so_name) {
            frappe.db.get_doc('Sales Order', so_name).then(function (so) {
                var so_item = (so.items || []).find(function (i) { return i.item_code === item_code; });
                callback_specs({
                    color: (so_item && (so_item.custom_color || so_item.color)) ? (so_item.custom_color || so_item.color).toString().trim() : '',
                    gsm: (so_item && (so_item.custom_gsm || so_item.gsm)) ? flt(so_item.custom_gsm || so_item.gsm) : 0,
                    quality: (so_item && (so_item.custom_quality || so_item.quality)) ? (so_item.custom_quality || so_item.quality).toString().trim() : '',
                    width: (so_item && (so_item.custom_width || so_item.width)) ? flt(so_item.custom_width || so_item.width) : 0,
                    so_customer: so.customer || ''
                });
            }).catch(function () { callback_specs({ color: '', gsm: 0, quality: '', width: 0, so_customer: '' }); });
        } else {
            frappe.db.get_doc('Item', item_code).then(function (item_doc) {
                callback_specs({
                    color: (item_doc.custom_color || item_doc.color || '').toString().trim(),
                    gsm: flt(item_doc.custom_gsm || item_doc.gsm || 0),
                    quality: (item_doc.custom_quality || item_doc.quality || '').toString().trim(),
                    width: flt(item_doc.custom_width || item_doc.width || 0),
                    so_customer: ''
                });
            }).catch(function () { callback_specs({ color: '', gsm: 0, quality: '', width: 0, so_customer: '' }); });
        }
    };

    // Determine roll's customer via party code lookup
    var get_roll_customer = function (callback_cust) {
        if (!roll_party) { callback_cust('', ''); return; }
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Sales Order',
                filters: [['docstatus', '=', 1], ['custom_party_code', '=', roll_party]],
                fields: ['customer', 'customer_name'],
                limit: 1
            },
            callback: function (r) {
                var orders = r.message || [];
                var cust_id = orders.length ? (orders[0].customer || '') : '';
                var cust_name = orders.length ? (orders[0].customer_name || '') : '';
                callback_cust(cust_id, cust_name);
            }
        });
    };
    get_target_specs(function (target) {
        get_roll_customer(function (roll_customer, roll_customer_name) {

            var is_diff_customer = roll_customer && dn_customer && roll_customer !== dn_customer;
            var roll_display = roll_customer_name ? roll_customer_name + ' (' + roll_customer + ')' : roll_customer;
            var dn_display = frm.doc.customer_name ? frm.doc.customer_name + ' (' + dn_customer + ')' : dn_customer;
            // Build spec mismatch list
            var spec_mismatches = [];

            if (target.color && batch_color && batch_color.toLowerCase() !== target.color.toLowerCase()) {
                spec_mismatches.push({ field: 'Color', expected: target.color, got: batch_color, critical: true });
            }
            if (target.quality && batch_quality && batch_quality.toLowerCase() !== target.quality.toLowerCase()) {
                spec_mismatches.push({ field: 'Quality', expected: target.quality, got: batch_quality, critical: true });
            }
            if (target.width && batch_width && Math.abs(batch_width - target.width) > 0.5) {
                spec_mismatches.push({ field: 'Width', expected: target.width + ' mm', got: batch_width + ' mm', critical: true });
            }
            if (target.gsm && batch_gsm && Math.abs(batch_gsm - target.gsm) > 0.5) {
                spec_mismatches.push({ field: 'GSM', expected: target.gsm, got: batch_gsm, critical: false });
            }

            // Build popup message
            var spec_rows = spec_mismatches.map(function (m) {
                var icon = m.critical ? '🔴' : '🟡';
                return `<tr>
                    <td style="padding:7px 10px;border:1px solid #d1d8dd;font-weight:600;">${icon} ${m.field}</td>
                    <td style="padding:7px 10px;border:1px solid #d1d8dd;color:#1a7a3c;font-weight:600;">${m.expected}</td>
                    <td style="padding:7px 10px;border:1px solid #d1d8dd;color:#b00020;font-weight:600;">${m.got}</td>
                </tr>`;
            }).join('');

            var customer_warning = '';
            if (is_diff_customer) {
                customer_warning = `
<div style="margin-top:12px;padding:10px 14px;background:#fff3e0;border:1px solid #ffb74d;border-radius:4px;font-size:13px;">
    🏭 <b>Cross-Customer Roll:</b> This roll belongs to <b style="color:#b00020;">${roll_display}</b>
    (Order Code: <b>${roll_party}</b>).<br>
    This DN is for customer: <b style="color:#1a7a3c;">${dn_display}</b>.<br>
    <b>Do you want to override and use this roll anyway?</b>
</div>`;
            }

            if (!spec_mismatches.length && !is_diff_customer) {
                // All clear — allow directly
                on_allow();
                return;
            }

            // Show combined popup
            var spec_section = spec_mismatches.length ? `
<p style="font-size:13px;font-weight:600;margin-bottom:8px;">📋 Spec Mismatches for <b>${item_code}</b>:</p>
<table style="width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:10px;">
    <thead><tr style="background:#f0f4f8;">
        <th style="padding:7px 10px;border:1px solid #d1d8dd;text-align:left;">Spec</th>
        <th style="padding:7px 10px;border:1px solid #d1d8dd;text-align:left;">Expected (${dn_customer})</th>
        <th style="padding:7px 10px;border:1px solid #d1d8dd;text-align:left;">This Roll</th>
    </tr></thead>
    <tbody>${spec_rows}</tbody>
</table>` : `<p style="color:#1a7a3c;font-size:13px;">✅ All specs match for <b>${item_code}</b>.</p>`;

            var popup_content = `
<div style="padding:6px 0 10px;">
    <p style="font-size:14px;font-weight:700;text-align:center;margin-bottom:14px;">
        ⚠️ Override Check — Roll: <span style="font-family:monospace;">${batch_no}</span>
    </p>
    ${spec_section}
    ${customer_warning}
</div>`;

            var d = new frappe.ui.Dialog({
                title: `⚠️ Roll Override Confirmation`,
                fields: [{ fieldtype: 'HTML', options: popup_content }],
                primary_action_label: '✅ Yes, Allow This Roll',
                primary_action: function () { d.hide(); on_allow(); },
                secondary_action_label: '🚫 No, Block This Roll',
                secondary_action: function () {
                    d.hide();
                    frappe.show_alert({ message: `🚫 Roll <b>${batch_no}</b> blocked.`, indicator: 'red' }, 4);
                }
            });
            d.show();
        });
    });
}
// ─────────────────────────────────────────────────────────────────────────────
//  ROUTING — called after universal customer guard passes
// ─────────────────────────────────────────────────────────────────────────────
function route_after_guard(frm, batch_no, item_code, net_wt, gross_wt, meter, party, batch_qty, dn_items, dn_item_codes, batch) {

    // ── CROSS-CUSTOMER OVERRIDE CHECKBOX CHECK ───────────────────────────────
    var override_mode = $('#dn_cross_customer_override').is(':checked');

    // ── FETCH CBM AT SCAN TIME ────────────────────────────────────────────────
    // Strategy 1: batch.custom_cbm is set directly on the Batch → use it.
    // Strategy 2: Fetch the referenced document (SPR, Stock Entry, etc.).
    //             Extract CBM from it. If zero, scan it for an "SPR-" link!
    // Strategy 3: fallback to 0.
    function resolve_cbm(callback) {
        var direct_cbm = flt(batch.custom_cbm) || flt(batch.cbm) || 0;
        if (direct_cbm > 0) { callback(direct_cbm); return; }

        // Helper to extract CBM smartly from a given Document
        let get_cbm_from_doc = function (doc) {
            let extracted = 0;
            for (let key in doc) {
                if (Array.isArray(doc[key])) {
                    let roll_row = doc[key].find(function (row) {
                        return row.batch_no === batch_no
                            || row.custom_batch_no === batch_no
                            || row.batch === batch_no
                            || row.custom_batch === batch_no;
                    });
                    if (roll_row) {
                        extracted = flt(roll_row.cbm) || flt(roll_row.custom_cbm) || 0;
                        if (extracted > 0) return extracted;
                    }
                }
            }
            return flt(doc.custom_cbm) || flt(doc.cbm) || 0;
        };

        var ref_name = batch.custom_shaft_production_run
            || batch.custom_production_run
            || batch.custom_spr_name
            || batch.reference_name
            || batch.reference_document
            || '';

        if (!ref_name || typeof ref_name !== 'string') {
            callback(0);
            return;
        }

        var doc_type = batch.reference_doctype || 'Shaft Production Run';
        if (ref_name.includes('MAT-STE-') || ref_name.includes('STE-')) doc_type = 'Stock Entry';
        else if (ref_name.includes('SPR-')) doc_type = 'Shaft Production Run';
        else if (ref_name.includes('PUR-') || ref_name.includes('MAT-RECT-')) doc_type = 'Purchase Receipt';

        frappe.db.get_doc(doc_type, ref_name).then(function (doc) {
            let found_cbm = get_cbm_from_doc(doc);
            if (found_cbm > 0) { callback(found_cbm); return; }

            // If CBM remains 0 (often true for Stock Entries), drill down for an SPR link!
            let spr_link = null;
            // A) Scan top-level properties
            for (let k in doc) {
                if (typeof doc[k] === 'string' && doc[k].includes('SPR-')) {
                    spr_link = doc[k]; break;
                }
            }
            // B) Scan matching child row properties exclusively
            if (!spr_link) {
                for (let k in doc) {
                    if (Array.isArray(doc[k])) {
                        let matching_row = doc[k].find(r => r.batch_no === batch_no || r.custom_batch_no === batch_no || r.batch === batch_no);
                        if (matching_row) {
                            for (let rk in matching_row) {
                                if (typeof matching_row[rk] === 'string' && matching_row[rk].includes('SPR-')) {
                                    spr_link = matching_row[rk]; break;
                                }
                            }
                        }
                    }
                    if (spr_link) break;
                }
            }

            if (spr_link && spr_link !== ref_name) {
                frappe.db.get_doc('Shaft Production Run', spr_link)
                    .then(spr => callback(get_cbm_from_doc(spr)))
                    .catch(() => callback(0));
            } else {
                callback(0);
            }
        }).catch(function () {
            callback(0);
        });
    }

    resolve_cbm(function (cbm) {

        if (dn_item_codes.includes(item_code)) {
            // Item already in DN
            var matching_dn_row = dn_items.find(function (r) { return r.item_code === item_code; });
            if (override_mode) {
                var _so_ref = matching_dn_row && matching_dn_row.against_sales_order ? matching_dn_row.against_sales_order : null;
                check_spec_and_override(frm, batch_no, batch, _so_ref, item_code, net_wt, gross_wt, meter, party, batch_qty, function () {
                    if (matching_dn_row && matching_dn_row.against_sales_order) {
                        type2_create_row_for_so(frm, matching_dn_row.against_sales_order, batch_no, item_code, net_wt, gross_wt, meter, party, batch_qty, cbm);
                    } else {
                        type1_add_roll(frm, batch_no, item_code, net_wt, gross_wt, meter, party, cbm);
                    }
                });
                return;
            }
            if (matching_dn_row && matching_dn_row.against_sales_order) {
                type2_create_row_for_so(frm, matching_dn_row.against_sales_order, batch_no, item_code, net_wt, gross_wt, meter, party, batch_qty, cbm);
            } else {
                type1_add_roll(frm, batch_no, item_code, net_wt, gross_wt, meter, party, cbm);
            }

        } else if (dn_items.length === 0) {
            // DN is empty — find SO automatically
            if (party || frm.doc.customer) {
                type2_find_so_and_create_row(frm, batch_no, item_code, net_wt, gross_wt, meter, party, batch_qty, cbm);
            } else {
                frappe.msgprint({
                    title: '⚠️ Cannot Auto-Find Sales Order',
                    message: `
<div style="text-align:center;padding:10px 0;">
    <div style="font-size:48px;margin-bottom:10px;">⚠️</div>
    <p style="font-size:14px;">Roll <b>${batch_no}</b> has no party code in the database.</p>
    <p style="font-size:13px;color:#555;margin-top:8px;">
        Please select a <b>Customer</b> on this DN first, or ensure the batch has a party code.
    </p>
</div>`,
                    indicator: 'orange'
                });
            }

        } else {
            // DN has rows but this item not found — multi-order-code same-customer path
            var linked_sos = [];
            dn_items.forEach(function (r) {
                if (r.against_sales_order && linked_sos.indexOf(r.against_sales_order) === -1) {
                    linked_sos.push(r.against_sales_order);
                }
            });

            if (linked_sos.length > 0) {
                var dn_customer = frm.doc.customer || '';

                if (!party && !dn_customer) {
                    var so_to_use = frm.__type2_so_name || linked_sos[0];
                    type2_create_row_for_so(frm, so_to_use, batch_no, item_code, net_wt, gross_wt, meter, party, batch_qty, cbm);
                    return;
                }

                check_party_belongs_to_dn_customer(frm, party, dn_customer, linked_sos, function (is_same_customer) {
                    if (!is_same_customer) {
                        frappe.msgprint({
                            title: '❌ Different Customer Roll!',
                            message: `
<div style="text-align:center;padding:10px 0;">
    <div style="font-size:48px;margin-bottom:10px;">🚫</div>
    <p style="font-size:15px;font-weight:bold;color:#b00020;">
        Roll / Batch No: <span style="font-family:monospace;">${batch_no}</span>
    </p>
    <p style="font-size:13px;color:#555;margin-top:8px;">
        This roll belongs to Order Code / Party: <b>${party || '—'}</b><br>
        This Delivery Note is for Customer: <b>${dn_customer}</b><br><br>
        <b>Rolls from a different customer cannot be added to this Delivery Note.</b>
    </p>
    <p style="font-size:13px;color:#888;margin-top:10px;">Please scan a roll that belongs to customer <b>${dn_customer}</b>.</p>
</div>`,
                            indicator: 'red'
                        });
                        return;
                    }

                    frappe.show_alert({
                        message: `🔍 Finding Sales Order for item <b>${item_code}</b> (same customer)...`,
                        indicator: 'blue'
                    }, 3);

                    find_so_for_item_and_party(frm, item_code, party, dn_customer, linked_sos, function (so_name) {
                        if (so_name) {
                            type2_create_row_for_so(frm, so_name, batch_no, item_code, net_wt, gross_wt, meter, party, batch_qty, cbm);
                        } else {
                            var so_to_use = frm.__type2_so_name || linked_sos[0];
                            frappe.show_alert({
                                message: `⚠️ No exact SO found for item <b>${item_code}</b>. Using <b>${so_to_use}</b>.`,
                                indicator: 'orange'
                            }, 5);
                            type2_create_row_for_so(frm, so_to_use, batch_no, item_code, net_wt, gross_wt, meter, party, batch_qty, cbm);
                        }
                    });
                });

            } else {
                frappe.msgprint({
                    title: '⚠️ Wrong Item!',
                    message: `
<div style="text-align:center;padding:10px 0;">
    <div style="font-size:48px;margin-bottom:10px;">⚠️</div>
    <p style="font-size:15px;font-weight:bold;color:#b00020;">
        Roll / Batch No: <span style="font-family:monospace;">${batch_no}</span>
    </p>
    <p style="font-size:13px;color:#555;margin-top:8px;">
        This roll belongs to Item: <b>${item_code}</b><br>
        That item is <b>not in this Delivery Note</b>.
    </p>
    <p style="font-size:13px;color:#888;margin-top:10px;">
        Please scan a roll that matches the items in this DN.
    </p>
</div>`,
                    indicator: 'orange'
                });
            }
        }

    }); // end resolve_cbm
}

// ─────────────────────────────────────────────────────────────────────────────
//  HELPER: Check if batch party belongs to same customer as DN
// ─────────────────────────────────────────────────────────────────────────────
function check_party_belongs_to_dn_customer(frm, party, dn_customer, existing_linked_sos, callback) {

    if (!party) { callback(true); return; }
    if (!dn_customer) { callback(true); return; }

    frappe.call({
        method: 'frappe.client.get_list',
        args: {
            doctype: 'Sales Order',
            filters: [
                ['docstatus', '=', 1],
                ['customer', '=', dn_customer],
                ['status', 'not in', ['Closed', 'Cancelled', 'Completed']],
                ['custom_party_code', '=', party]
            ],
            fields: ['name', 'customer'],
            limit: 5
        },
        callback: function (r) {
            var orders = r.message || [];
            if (orders.length > 0) {
                callback(true);
            } else {
                frappe.call({
                    method: 'frappe.client.get_list',
                    args: {
                        doctype: 'Sales Order',
                        filters: [
                            ['docstatus', '=', 1],
                            ['status', 'not in', ['Closed', 'Cancelled', 'Completed']],
                            ['custom_party_code', '=', party]
                        ],
                        fields: ['name', 'customer'],
                        limit: 5
                    },
                    callback: function (r2) {
                        var all_orders = r2.message || [];
                        if (!all_orders.length) { callback(true); return; }
                        var other_customers = all_orders
                            .map(function (o) { return o.customer; })
                            .filter(function (c) { return c !== dn_customer; });
                        callback(other_customers.length === 0);
                    }
                });
            }
        }
    });
}
// ─────────────────────────────────────────────────────────────────────────────
//  HELPER: Find correct SO for item + party scoped to DN customer
// ─────────────────────────────────────────────────────────────────────────────
function find_so_for_item_and_party(frm, item_code, party, dn_customer, existing_linked_sos, callback) {

    var base_filters = [
        ['docstatus', '=', 1],
        ['status', 'not in', ['Closed', 'Cancelled', 'Completed']]
    ];

    if (dn_customer) base_filters.push(['customer', '=', dn_customer]);
    if (party) base_filters.push(['custom_party_code', '=', party]);

    frappe.call({
        method: 'frappe.client.get_list',
        args: {
            doctype: 'Sales Order',
            filters: base_filters,
            fields: ['name', 'customer'],
            order_by: 'transaction_date desc',
            limit: 20
        },
        callback: function (r) {
            var orders = r.message || [];

            if (!orders.length) {
                if (party && dn_customer) {
                    var fallback_filters = [
                        ['docstatus', '=', 1],
                        ['status', 'not in', ['Closed', 'Cancelled', 'Completed']],
                        ['customer', '=', dn_customer]
                    ];
                    frappe.call({
                        method: 'frappe.client.get_list',
                        args: {
                            doctype: 'Sales Order',
                            filters: fallback_filters,
                            fields: ['name', 'customer'],
                            order_by: 'transaction_date desc',
                            limit: 20
                        },
                        callback: function (r2) {
                            pick_so_with_item(frm, r2.message || [], item_code, existing_linked_sos, callback);
                        }
                    });
                } else {
                    callback(null);
                }
                return;
            }

            pick_so_with_item(frm, orders, item_code, existing_linked_sos, callback);
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
//  HELPER: From SO list, find which ones contain item_code.
//  Uses frappe.db.get_doc per SO to avoid Sales Order Item direct query
//  permission error on cloud ERPNext.
// ─────────────────────────────────────────────────────────────────────────────
function pick_so_with_item(frm, orders, item_code, existing_linked_sos, callback) {

    if (!orders.length) { callback(null); return; }

    var so_names = orders.map(function (o) { return o.name; });
    var matching_so_names = [];
    var fetched = 0;

    so_names.forEach(function (so_name) {
        frappe.db.get_doc('Sales Order', so_name).then(function (so_doc) {
            var has_item = (so_doc.items || []).some(function (i) { return i.item_code === item_code; });
            if (has_item) matching_so_names.push(so_name);
            fetched++;
            if (fetched === so_names.length) finish_pick();
        }).catch(function () {
            fetched++;
            if (fetched === so_names.length) finish_pick();
        });
    });

    function finish_pick() {
        if (!matching_so_names.length) { callback(null); return; }

        var unique_sos = matching_so_names.filter(function (v, i, a) { return a.indexOf(v) === i; });
        var new_sos = unique_sos.filter(function (s) { return existing_linked_sos.indexOf(s) === -1; });
        var candidate_sos = new_sos.length > 0 ? new_sos : unique_sos;

        if (candidate_sos.length === 1) {
            callback(candidate_sos[0]);
        } else {
            var so_options = candidate_sos.map(function (s) {
                var o = orders.find(function (x) { return x.name === s; }) || {};
                return `<option value="${s}">${s}&nbsp;|&nbsp;${o.customer || ''}</option>`;
            }).join('');

            var d = new frappe.ui.Dialog({
                title: `📋 Select Sales Order for Item: ${item_code}`,
                fields: [{
                    fieldtype: 'HTML',
                    options: `
<p style="font-size:13px;color:#555;margin-bottom:10px;">
    Multiple Sales Orders found for item <b>${item_code}</b>. Select the correct one:
</p>
<select id="multi_so_picker" style="width:100%;padding:10px;font-size:14px;border:1px solid #ccc;border-radius:4px;">
    ${so_options}
</select>`
                }],
                primary_action_label: '✅ Use This Sales Order',
                primary_action: function () {
                    var selected = $('#multi_so_picker').val();
                    d.hide();
                    callback(selected || null);
                },
                secondary_action_label: 'Cancel',
                secondary_action: function () { d.hide(); callback(null); }
            });
            d.show();
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  TYPE 1 — Add roll directly (no SO link)
// ─────────────────────────────────────────────────────────────────────────────
function type1_add_roll(frm, batch_no, item_code, net_wt, gross_wt, meter, party, cbm) {
    add_roll_to_form(frm, batch_no, item_code, net_wt, gross_wt, meter, party, cbm);
}

// ─────────────────────────────────────────────────────────────────────────────
//  TYPE 2 — Find SO by party code (first scan, DN truly empty)
// ─────────────────────────────────────────────────────────────────────────────
function type2_find_so_and_create_row(frm, batch_no, item_code, net_wt, gross_wt, meter, party, batch_qty, cbm) {

    if (!party && !frm.doc.customer) {
        frappe.msgprint({
            title: '⚠️ Party Code Missing',
            message: `Roll <b>${batch_no}</b> has no party code and no customer is selected on the DN.<br>Cannot auto-find a Sales Order.`,
            indicator: 'orange'
        });
        return;
    }

    var base_filters = [
        ['docstatus', '=', 1],
        ['status', 'not in', ['Closed', 'Cancelled', 'Completed']]
    ];

    var filters_by_party = party
        ? base_filters.concat([['custom_party_code', '=', party]])
        : null;

    var filters_by_customer = frm.doc.customer
        ? base_filters.concat([['customer', '=', frm.doc.customer]])
        : null;

    var label = party || frm.doc.customer;
    frappe.show_alert({ message: `🔍 Finding Sales Order for <b>${label}</b>...`, indicator: 'blue' }, 3);

    var show_so_result = function (orders) {
        if (orders.length === 1) {
            frm.__type2_so_name = orders[0].name;
            type2_create_row_for_so(frm, orders[0].name, batch_no, item_code, net_wt, gross_wt, meter, party, batch_qty, cbm);
        } else {
            var so_options = orders.map(function (o) {
                return `<option value="${o.name}">${o.name} &nbsp;|&nbsp; ${o.customer} &nbsp;|&nbsp; ${o.transaction_date} &nbsp;|&nbsp; Delivery: ${o.delivery_date || '—'}</option>`;
            }).join('');

            var d = new frappe.ui.Dialog({
                title: `📋 Select Sales Order — ${label}`,
                fields: [{
                    fieldtype: 'HTML',
                    options: `
<p style="font-size:13px;color:#555;margin-bottom:10px;">
    Multiple open Sales Orders found. Select the correct one:
</p>
<select id="type2_so_picker" style="width:100%;padding:10px;font-size:14px;border:1px solid #ccc;border-radius:4px;">
    ${so_options}
</select>`
                }],
                primary_action_label: '✅ Use This Sales Order',
                primary_action: function () {
                    var selected = $('#type2_so_picker').val();
                    d.hide();
                    if (selected) {
                        frm.__type2_so_name = selected;
                        type2_create_row_for_so(frm, selected, batch_no, item_code, net_wt, gross_wt, meter, party, batch_qty, cbm);
                    }
                },
                secondary_action_label: 'Cancel',
                secondary_action: function () { d.hide(); }
            });
            d.show();
        }
    };

    var do_so_search = function (filters, fallback_fn) {
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Sales Order',
                filters: filters,
                fields: ['name', 'customer', 'customer_name', 'custom_party_code', 'transaction_date', 'delivery_date'],
                order_by: 'transaction_date desc',
                limit: 20
            },
            callback: function (r) {
                var orders = r.message || [];
                if (!orders.length && fallback_fn) { fallback_fn(); return; }
                if (!orders.length) {
                    frappe.msgprint({
                        title: '⚠️ No Sales Order Found',
                        message: `
<div style="text-align:center;padding:10px 0;">
    <div style="font-size:48px;margin-bottom:10px;">📋</div>
    <p style="font-size:15px;font-weight:bold;">Party / Customer: <b>${label}</b></p>
    <p style="font-size:13px;color:#555;margin-top:8px;">
        No open Sales Orders found.<br>
        Please ensure a Sales Order exists with status <b>To Deliver</b>.
    </p>
</div>`,
                        indicator: 'orange'
                    });
                    return;
                }
                show_so_result(orders);
            }
        });
    };

    if (filters_by_party) {
        do_so_search(filters_by_party, filters_by_customer ? function () { do_so_search(filters_by_customer, null); } : null);
    } else {
        do_so_search(filters_by_customer, null);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  TYPE 2 — Check SO for this item, create row if needed, then add roll
//  Party validation: allows different order codes IF same customer.
// ─────────────────────────────────────────────────────────────────────────────
function type2_create_row_for_so(frm, so_name, batch_no, item_code, net_wt, gross_wt, meter, party, batch_qty, cbm) {

    frappe.db.get_value('Sales Order', so_name, ['custom_party_code', 'customer'], function (so_vals) {
        var so_party = (so_vals && so_vals.custom_party_code) ? so_vals.custom_party_code.trim() : '';
        var so_customer = (so_vals && so_vals.customer) ? so_vals.customer : '';
        var dn_customer = frm.doc.customer || '';

        // Block only if SO customer differs from DN customer
        if (party && so_party && party.trim() !== so_party) {
            if (dn_customer && so_customer && dn_customer !== so_customer) {
                frappe.msgprint({
                    title: '❌ Different Customer Roll!',
                    message: `
<div style="text-align:center;padding:10px 0;">
    <div style="font-size:48px;margin-bottom:10px;">🚫</div>
    <p style="font-size:15px;font-weight:bold;color:#b00020;">
        Roll / Batch No: <span style="font-family:monospace;">${batch_no}</span>
    </p>
    <p style="font-size:13px;color:#555;margin-top:8px;">
        This roll belongs to Party: <b>${party}</b> (Customer: <b>${dn_customer}</b>)<br>
        This Sales Order (<b>${so_name}</b>) belongs to Party: <b>${so_party}</b> (Customer: <b>${so_customer}</b>)<br><br>
        <b>Rolls from different customers cannot be mixed in one Delivery Note.</b>
    </p>
    <p style="font-size:13px;color:#888;margin-top:10px;">Please scan a roll that belongs to customer <b>${so_customer || dn_customer}</b>.</p>
</div>`,
                    indicator: 'red'
                });
                return;
            }
        }

        if (!frm.doc.customer && so_customer) {
            frappe.model.set_value(frm.doctype, frm.docname, 'customer', so_customer);
        }

        // Row already exists → add roll directly
        var existing_row = (frm.doc.items || []).find(function (r) {
            return r.item_code === item_code && r.against_sales_order === so_name;
        });

        if (existing_row) {
            add_roll_to_form(frm, batch_no, item_code, net_wt, gross_wt, meter, party, cbm);
            return;
        }

        // Row not created yet → fetch SO details
        frappe.show_alert({ message: `📦 Creating row for <b>${item_code}</b> from <b>${so_name}</b>...`, indicator: 'blue' }, 3);

        frappe.db.get_doc('Sales Order', so_name).then(function (so) {

            var so_item = (so.items || []).find(function (i) { return i.item_code === item_code; });

            if (!so_item) {
                frappe.msgprint({
                    title: '⚠️ Item Not in Sales Order',
                    message: `
<div style="text-align:center;padding:10px 0;">
    <div style="font-size:48px;margin-bottom:10px;">⚠️</div>
    <p style="font-size:15px;font-weight:bold;color:#b00020;">Item: ${item_code}</p>
    <p style="font-size:13px;color:#555;margin-top:8px;">
        This roll's item is <b>not found</b> in Sales Order <b>${so_name}</b>.<br>
        Please check the correct Sales Order for this roll.
    </p>
</div>`,
                    indicator: 'orange'
                });
                return;
            }

            if (!frm.doc.customer && so.customer) {
                frappe.model.set_value(frm.doctype, frm.docname, 'customer', so.customer);
                frappe.model.set_value(frm.doctype, frm.docname, 'customer_name', so.customer_name || '');
            }

            // Remove ERPNext auto-added blank rows
            (frm.doc.items || []).filter(function (r) { return !r.item_code || !r.item_code.trim(); }).forEach(function (blank) {
                var gr = frm.fields_dict.items.grid.grid_rows_by_docname[blank.name];
                if (gr) gr.remove();
            });

            // Create new DN item row linked to SO
            var new_row = frm.add_child('items');
            new_row.item_code = so_item.item_code;
            new_row.item_name = so_item.item_name;
            new_row.custom_delivered = so_item.qty;
            new_row.qty = 0;
            new_row.uom = so_item.uom;
            new_row.stock_uom = so_item.stock_uom;
            new_row.rate = so_item.rate;
            new_row.amount = flt((batch_qty || so_item.qty) * so_item.rate, 2);
            new_row.against_sales_order = so_name;
            new_row.so_detail = so_item.name;
            new_row.description = so_item.description || '';
            // Scanned flow posts by net-weight quantity, so keep 1:1 conversion.
            new_row.conversion_factor = 1;

            var _wh_so_item = so_item.warehouse || so.set_warehouse || '';

            frappe.db.get_doc('Item', item_code).then(function (item_doc) {
                var item_def = (item_doc.item_defaults || []).find(function (d) { return d.company === frm.doc.company; });
                // Always prefer SO warehouse to keep stock validation aligned with the source order.
                new_row.warehouse = _wh_so_item || (item_def && item_def.default_warehouse);

                frm.refresh_field('items');
                frappe.show_alert({
                    message: `✅ Row created for <b>${item_code}</b> from SO <b>${so_name}</b> | Warehouse: <b>${new_row.warehouse || '—'}</b>`,
                    indicator: 'green'
                }, 5);

                setTimeout(function () {
                    add_rolls_buttons(frm);
                    add_roll_to_form(frm, batch_no, item_code, net_wt, gross_wt, meter, party, cbm);
                }, 500);

            }).catch(function () {
                new_row.warehouse = _wh_so_item;
                frm.refresh_field('items');
                frappe.show_alert({
                    message: `✅ Row created for <b>${item_code}</b> from SO <b>${so_name}</b>`,
                    indicator: 'green'
                }, 4);
                setTimeout(function () {
                    add_rolls_buttons(frm);
                    add_roll_to_form(frm, batch_no, item_code, net_wt, gross_wt, meter, party, cbm);
                }, 500);
            });
        });
    });
}

// ─────────────────────────────────────────────
//  ADD ROLL TO FORM  (shared by both types)
// ─────────────────────────────────────────────
function add_roll_to_form(frm, batch_no, item_code, net_wt, gross_wt, meter, party, cbm) {
    // Aggregation mode: Find the existing row for this item and add to it.
    var dn_row = (frm.doc.items || []).find(function (r) { return r.item_code === item_code; });

    var roll_obj = { batch_no: (batch_no || '').trim(), net: flt(net_wt || 0, 6), gross: flt(gross_wt || 0, 6), meter: flt(meter || 0, 3), party: party, cbm: flt(cbm) || 0 };

    if (!dn_row) {
        dn_row = frm.add_child('items');
        dn_row.item_code = item_code;
    }

    if (dn_row.qty > 0 && flt(dn_row.custom_delivered) === 0 && (!scanned_rolls[dn_row.name] || scanned_rolls[dn_row.name].length === 0)) {
        dn_row.custom_delivered = dn_row.qty;
    }

    if (!scanned_rolls[dn_row.name]) {
        scanned_rolls[dn_row.name] = [];
    }

    scanned_rolls[dn_row.name].push(roll_obj);

    var rolls = scanned_rolls[dn_row.name];
    var total_net = flt(rolls.reduce(function(s, r) { return s + r.net; }, 0), 3);

    dn_row.conversion_factor = 1;
    dn_row.warehouse = DN_DEFAULT_WAREHOUSE || dn_row.warehouse || frm.doc.set_warehouse || '';
    
    // Accumulate the quantity directly in the row's quantity field as requested
    dn_row.qty = total_net;
    dn_row.stock_qty = total_net;
    dn_row.custom_scanned_rolls_data = JSON.stringify(rolls);
    dn_row.amount = flt(total_net * flt(dn_row.rate || 0), 2);

    // Check quantity and give alert
    var so_qty = flt(dn_row.custom_delivered || 0);
    if (so_qty > 0 && total_net > so_qty) {
        frappe.msgprint({
            title: '⚠️ Quantity Exceeded',
            message: `You have scanned <b>${total_net}</b> kg, which exceeds the Sales Order quantity of <b>${so_qty}</b> kg for item <b>${item_code}</b>.`,
            indicator: 'orange'
        });
    }
    
    // For single rows containing multiple batches, batch fields are disabled
    // because ERPNext requires a Serial and Batch Bundle for multiple batches on one row.
    dn_row.serial_and_batch_bundle = '';
    dn_row.use_serial_batch_fields = 0;
    dn_row.batch_no = '';

    frm.refresh_field('items');
    
    setTimeout(function () { add_rolls_buttons(frm); }, 200);

    frappe.model.set_value(dn_row.doctype, dn_row.name, 'warehouse', dn_row.warehouse)
        .then(function () {
            // Refresh to ensure grid updates
            frm.refresh_field('items');
        });

    frappe.show_alert({ message: `✅ Roll added to <b>${item_code}</b>: <b>${roll_obj.batch_no}</b> (${roll_obj.net} kg). Total: ${total_net} kg`, indicator: 'green' }, 4);
}

// ─────────────────────────────────────────────
//  ROLLS BUTTON INJECTION
// ─────────────────────────────────────────────
function add_rolls_buttons(frm) {

    if (!frm.fields_dict.items || !frm.fields_dict.items.grid) return;

    frm.fields_dict.items.grid.grid_rows.forEach(function (row) {

        var doc = row.doc;
        if (!doc || !doc.item_code) return;

        var cell = row.row.find('[data-fieldname="custom_rolls"]');
        if (!cell.length) return;

        var rolls = scanned_rolls[doc.name] || [];
        var ordered_qty = flt(doc.custom_delivered || 0);
        var scanned_wt = flt(rolls.reduce(function (s, r) { return s + r.net; }, 0), 3);
        var count = rolls.length;

        var btn_color = '#555';
        var status_icon = '';
        var tolerance = 0.0001;

        if (count > 0) {
            if (Math.abs(scanned_wt - ordered_qty) <= tolerance) {
                btn_color = '#1a7a3c';
                status_icon = ' ✅';
            } else if (scanned_wt > ordered_qty) {
                btn_color = '#b00020';
                status_icon = ' 🔼';
            } else {
                btn_color = '#c07a00';
                status_icon = ' ⚠️';
            }
        }

        var badge = count > 0
            ? `<span style="background:rgba(255,255,255,0.25);border-radius:10px;padding:0 6px;margin-left:5px;font-size:10px;">${count}</span>`
            : '';

        var $btn = $(`
            <button class="btn btn-xs dn-rolls-btn"
                style="background:${btn_color};color:#fff;border:none;border-radius:4px;padding:3px 10px;font-size:11px;cursor:pointer;white-space:nowrap;margin-top:2px;">
                🧵 Rolls${badge}${status_icon}
                <span style="opacity:0.8;margin-left:5px;">| ${doc.item_code}</span>
            </button>
        `);

        $btn.off('click').on('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            show_rolls_popup(frm, doc);
            return false;
        });

        cell.html($btn);
    });
}

// ─────────────────────────────────────────────
//  SUMMARY POPUP
// ─────────────────────────────────────────────
function show_rolls_popup(frm, row_doc) {
    var row_name = row_doc.name;
    var rolls = scanned_rolls[row_name] || [];
    var ordered_qty = flt(row_doc.custom_delivered);

    if (!rolls.length) {
        frappe.msgprint({ title: `🧵 Rolls — ${row_doc.item_code}`, message: `<p style="color:#888;text-align:center;padding:24px 0;">No rolls scanned yet.</p>`, wide: true });
        return;
    }

    var total_net = flt(rolls.reduce(function (s, r) { return s + r.net; }, 0), 3);
    var total_gross = flt(rolls.reduce(function (s, r) { return s + r.gross; }, 0), 3);
    var total_meter = flt(rolls.reduce(function (s, r) { return s + r.meter; }, 0), 3);
    var total_cbm = flt(rolls.reduce(function (s, r) { return s + flt(r.cbm || 0); }, 0), 4);
    var total_count = rolls.length;

    var sc = '#c07a00', sl = `⚠️ Partial — ${total_net} / ${ordered_qty} kg`;
    if (total_net === ordered_qty) { sc = '#1a7a3c'; sl = `✅ Complete — ${total_net} / ${ordered_qty} kg`; }
    if (total_net > ordered_qty) { sc = '#b00020'; sl = `🔼 Over-scanned — ${total_net} / ${ordered_qty} kg`; }

    var rows_html = rolls.map(function (r, i) {
        var cbm_val = flt(r.cbm || 0, 4);
        return `
<tr>
    <td style="padding:7px 8px;border:1px solid #d1d8dd;text-align:center;font-size:12px;">${i + 1}</td>
    <td style="padding:7px 8px;border:1px solid #d1d8dd;text-align:center;font-size:12px;">${r.batch_no}</td>
    <td style="padding:7px 8px;border:1px solid #d1d8dd;text-align:center;font-size:12px;">${r.net}</td>
    <td style="padding:7px 8px;border:1px solid #d1d8dd;text-align:center;font-size:12px;">${r.gross}</td>
    <td style="padding:7px 8px;border:1px solid #d1d8dd;text-align:center;font-size:12px;">${r.meter}</td>
    <td style="padding:7px 8px;border:1px solid #d1d8dd;text-align:center;font-size:12px;">${cbm_val || '—'}</td>
    <td style="padding:7px 8px;border:1px solid #d1d8dd;text-align:center;font-size:12px;">${r.party || '—'}</td>
</tr>`;
    }).join('');

    var html = `
<div style="background:${sc};padding:10px 14px;border-radius:5px;color:#fff;font-weight:600;margin-bottom:12px;font-size:13px;">${sl}</div>
<table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #d1d8dd;text-align:center;">
<thead><tr style="background-color:#f8f9fa;">
    <th style="padding:8px;border:1px solid #d1d8dd;font-weight:bold;white-space:nowrap;text-align:center;width:36px;">#</th>
    <th style="padding:8px;border:1px solid #d1d8dd;font-weight:bold;white-space:nowrap;text-align:center;">Batch No</th>
    <th style="padding:8px;border:1px solid #d1d8dd;font-weight:bold;text-align:center;white-space:nowrap;">Net Weight (Kgs)</th>
    <th style="padding:8px;border:1px solid #d1d8dd;font-weight:bold;text-align:center;white-space:nowrap;">Gross Weight (Kgs)</th>
    <th style="padding:8px;border:1px solid #d1d8dd;font-weight:bold;text-align:center;white-space:nowrap;">Meter / Roll (Mtrs)</th>
    <th style="padding:8px;border:1px solid #d1d8dd;font-weight:bold;text-align:center;white-space:nowrap;">CBM<br>(Cubic Meters)</th>
    <th style="padding:8px;border:1px solid #d1d8dd;font-weight:bold;white-space:nowrap;text-align:center;">Order Code</th>
</tr></thead>
<tbody>${rows_html}</tbody>
<tfoot><tr style="background-color:#e8f4fd;font-weight:bold;font-size:12px;">
    <td style="padding:8px;border:1px solid #b8daff;"></td>
    <td style="padding:8px;border:1px solid #b8daff;color:#0056b3;white-space:nowrap;text-align:center;">🧮 Total (${total_count} Rolls)</td>
    <td style="padding:8px;border:1px solid #b8daff;color:#1a7a3c;text-align:center;">${total_net} Kgs</td>
    <td style="padding:8px;border:1px solid #b8daff;color:#555;text-align:center;">${total_gross} Kgs</td>
    <td style="padding:8px;border:1px solid #b8daff;color:#555;text-align:center;">${total_meter} Mtrs</td>
    <td style="padding:8px;border:1px solid #b8daff;color:#555;text-align:center;">${total_cbm} sq.ft</td>
    <td style="padding:8px;border:1px solid #b8daff;"></td>
</tr></tfoot>
</table>
<p style="text-align:right;font-size:11px;color:#666;margin-top:12px;margin-bottom:0;">
<i>Tip: To remove a roll, scan its barcode again.</i>
</p>`;

    var d = new frappe.ui.Dialog({
        title: `🧵 Scanned Rolls — Item: ${row_doc.item_code}`,
        fields: [{ fieldtype: 'HTML', options: html }]
    });
    d.show();

    d.$wrapper.find('.modal-dialog').css({
        'min-width': 'min(95vw, 1060px)',
        'max-width': 'min(95vw, 1060px)',
        'width': 'min(95vw, 1060px)'
    });
}