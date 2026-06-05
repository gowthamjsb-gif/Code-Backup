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
//  SO QTY AUTO-ADJUSTMENT (Production Tolerance Handling):
//  When a scanned batch's net weight (actual produced qty) differs from
//  the Sales Order qty, the script shows a confirmation popup. On confirm:
//    1. Updates the SO item row qty + amount (qty × rate)
//    2. Updates the DN row qty to match the actual produced weight
//  This keeps SO, DN, and batch all in sync with zero manual edits.
// =========================================================================

let scanned_rolls = {};

frappe.ui.form.on('Delivery Note', {

    validate: function (frm) {
        let has_mismatch = false;
        let mismatch_lines = [];

        (frm.doc.items || []).forEach(row => {
            let ordered = flt(row.qty);
            let delivered = flt(row.custom_delivered);

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
        scanned_rolls = {};

        // Restore scanned_rolls from saved data
        (frm.doc.items || []).forEach(row => {
            if (row.custom_scanned_rolls_data) {
                try {
                    let rolls = JSON.parse(row.custom_scanned_rolls_data);
                    if (Array.isArray(rolls) && rolls.length > 0) {
                        scanned_rolls[row.name] = rolls;
                        let total = flt(rolls.reduce((s, r) => s + r.net, 0), 3);
                        if (flt(row.custom_delivered) !== total) {
                            frappe.model.set_value(row.doctype, row.name, 'custom_delivered', total);
                        }
                    }
                } catch (e) {
                    console.warn("Could not parse rolls data for row:", row.name, e);
                }
            }
        });

        // Restore Type 2 SO link if rows were previously created via scanning
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

    before_submit: function (frm) {

        if (frm.__skip_so_check) {
            frm.__skip_so_check = false;
            return;
        }

        let mismatches = [];

        (frm.doc.items || []).forEach(row => {

            if (!row.against_sales_order || !row.so_detail) return;

            let so_qty = flt(row.qty || 0);
            let delivered_qty = flt(row.custom_delivered || 0);

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
//  SO QTY ADJUSTMENT
// ─────────────────────────────────────────────────────────────────────────────
function maybe_adjust_so_qty(frm, dn_row, so_name, so_detail, batch_no, net_wt, batch_qty, callback) {
    let so_ordered_qty = flt(dn_row.qty);
    let actual_qty = flt(net_wt);
    let produced_qty = flt(batch_qty) || actual_qty;
    let diff = flt(actual_qty - so_ordered_qty, 3);

    // Case 1: exact match
    if (diff === 0) { callback(); return; }

    // Case 2: delivery qty ≠ batch produced qty — block
    if (produced_qty > 0 && flt(actual_qty, 3) !== flt(produced_qty, 3)) {
        let over_under = actual_qty > produced_qty ? 'MORE' : 'LESS';
        let diff_prod = flt(Math.abs(actual_qty - produced_qty), 3);
        frappe.msgprint({
            title: '❌ Delivery Qty Does Not Match Production',
            message: `
<div style="text-align:center;padding:10px 0;">
    <div style="font-size:48px;margin-bottom:10px;">🚫</div>
    <p style="font-size:15px;font-weight:bold;color:#b00020;">Batch <b>${batch_no}</b> — Qty Mismatch</p>
    <p style="font-size:13px;color:#555;margin-top:10px;">
        This batch was <b>produced</b> as: <b>${produced_qty} kg</b><br>
        You are trying to deliver: <b style="color:#b00020;">${actual_qty} kg</b><br><br>
        That is <b>${diff_prod} kg ${over_under}</b> than what was produced.<br>
        You can only deliver the exact produced quantity of <b>${produced_qty} kg</b>.
    </p>
    <p style="font-size:12px;color:#888;margin-top:10px;">Please check the batch weight entry and try again.</p>
</div>`,
            indicator: 'red'
        });
        return;
    }

    // Case 3: net_wt ≠ SO qty but matches batch → show popup
    let direction = diff > 0 ? 'more' : 'less';
    let diff_abs = flt(Math.abs(diff), 3);
    let diff_pct = flt((Math.abs(diff) / so_ordered_qty) * 100, 2);
    let color_diff = diff > 0 ? '#b00020' : '#c07a00';
    let icon = diff > 0 ? '🔼' : '🔽';
    let rate = flt(dn_row.rate || 0);
    let new_amount = flt(actual_qty * rate, 2);
    let old_amount = flt(so_ordered_qty * rate, 2);

    let popup_html = `
<div style="text-align:center;padding:6px 0 14px;">
    <div style="font-size:44px;margin-bottom:8px;">${icon}</div>
    <p style="font-size:15px;font-weight:700;margin-bottom:4px;">Production Qty Mismatch</p>
    <p style="font-size:13px;color:#555;margin-bottom:14px;">
        Batch <b>${batch_no}</b> was produced at <b style="color:${color_diff};">${actual_qty} kg</b>
        — ${diff_abs} kg <b>${direction}</b> than the Sales Order (${so_ordered_qty} kg, ${diff_pct}% difference).
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:14px;">
        <thead><tr style="background:#f0f4f8;">
            <th style="padding:8px 12px;border:1px solid #d1d8dd;text-align:left;">Field</th>
            <th style="padding:8px 12px;border:1px solid #d1d8dd;text-align:right;">SO (Before)</th>
            <th style="padding:8px 12px;border:1px solid #d1d8dd;text-align:right;">Updated (After)</th>
        </tr></thead>
        <tbody>
            <tr>
                <td style="padding:8px 12px;border:1px solid #d1d8dd;">Qty (kg)</td>
                <td style="padding:8px 12px;border:1px solid #d1d8dd;text-align:right;">${so_ordered_qty}</td>
                <td style="padding:8px 12px;border:1px solid #d1d8dd;text-align:right;font-weight:700;color:${color_diff};">${actual_qty}</td>
            </tr>
            <tr style="background:#fafafa;">
                <td style="padding:8px 12px;border:1px solid #d1d8dd;">Amount</td>
                <td style="padding:8px 12px;border:1px solid #d1d8dd;text-align:right;">₹ ${old_amount.toLocaleString('en-IN')}</td>
                <td style="padding:8px 12px;border:1px solid #d1d8dd;text-align:right;font-weight:700;color:${color_diff};">₹ ${new_amount.toLocaleString('en-IN')}</td>
            </tr>
        </tbody>
    </table>
    <p style="font-size:12.5px;color:#555;background:#fff8e1;border:1px solid #ffe082;border-radius:4px;padding:8px 12px;text-align:left;">
        ⚙️ Only qty + amount on this SO item row are updated directly in the database.
        SO stays <b>Submitted</b>. Planning Sheet, Work Orders, all linked docs — <b>completely untouched</b>.
        DN row qty will also update to <b>${actual_qty} kg</b>.
    </p>
</div>`;

    let d = new frappe.ui.Dialog({
        title: `⚙️ Update Sales Order — ${so_name}`,
        fields: [{ fieldtype: 'HTML', options: popup_html }],
        primary_action_label: `✅ Update SO & Deliver`,
        primary_action() {
            d.hide();
            frappe.show_alert({ message: `⚙️ Updating SO <b>${so_name}</b> to <b>${actual_qty} kg</b>...`, indicator: 'blue' }, 4);
            frappe.call({
                method: 'update_so_item_qty',
                args: {
                    so_name: so_name,
                    so_detail: so_detail,
                    item_code: dn_row.item_code,
                    actual_qty: actual_qty
                },
                callback(r) {
                    if (r.exc || !r.message || !r.message.success) {
                        frappe.msgprint({
                            title: '❌ SO Update Failed',
                            message: `Could not update Sales Order <b>${so_name}</b>.<br><br>
                                ${r.exc || 'Server script returned an error.'}<br><br>
                                ✅ Make sure the Server Script <b>"API Method"</b> field is set to
                                <b>update_so_item_qty</b> and the script is <b>enabled</b>.`,
                            indicator: 'red'
                        });
                        return;
                    }
                    frappe.show_alert({
                        message: `✅ SO <b>${so_name}</b> updated → <b>${actual_qty} kg</b> | ₹ ${new_amount.toLocaleString('en-IN')}`,
                        indicator: 'green'
                    }, 6);
                    frappe.model.set_value(dn_row.doctype, dn_row.name, 'qty', actual_qty)
                        .then(() => { frm.refresh_field('items'); callback(); })
                        .catch(() => { frm.refresh_field('items'); callback(); });
                }
            });
        },
        secondary_action_label: '⏭️ Skip & Deliver As-Is',
        secondary_action() {
            d.hide();
            frappe.show_alert({
                message: `⏭️ Skipped SO update. Delivering <b>${actual_qty} kg</b> against SO qty <b>${so_ordered_qty} kg</b>.`,
                indicator: 'orange'
            }, 5);
            callback();
        }
    });
    d.show();
}

// ─────────────────────────────────────────────────────────────────────────────
//  BEFORE-SUBMIT SO QTY POPUP
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
        ⚙️ Only qty + amount on each SO item row are updated via direct DB write.
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
                            actual_qty: m.actual_qty
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
//  CORE SCAN LOGIC  (TYPE 1 + TYPE 2 ROUTER)
//  FIX: Duplicate DN check now runs FIRST before any session/routing logic.
//       Already-delivered rolls are hard-blocked immediately on scan.
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
                return; // ← HARD BLOCK. Nothing else runs.
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
                        frappe.model.set_value(row_doc.doctype, row_doc.name, 'batch_no', remaining_rolls[0].batch_no);
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

                // ── STEP 3: ROUTE ─────────────────────────────────────────────
                if (dn_item_codes.includes(item_code)) {
                    var matching_dn_row = dn_items.find(function (r) { return r.item_code === item_code; });
                    if (matching_dn_row && matching_dn_row.against_sales_order) {
                        type2_create_row_for_so(frm, matching_dn_row.against_sales_order, batch_no, item_code, net_wt, gross_wt, meter, party, batch_qty);
                    } else {
                        type1_add_roll(frm, batch_no, item_code, net_wt, gross_wt, meter, party);
                    }

                } else if (dn_items.length === 0) {
                    if (party || frm.doc.customer) {
                        type2_find_so_and_create_row(frm, batch_no, item_code, net_wt, gross_wt, meter, party, batch_qty);
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
                    var linked_sos = [];
                    dn_items.forEach(function (r) {
                        if (r.against_sales_order && linked_sos.indexOf(r.against_sales_order) === -1) {
                            linked_sos.push(r.against_sales_order);
                        }
                    });

                    if (linked_sos.length > 0) {
                        var so_to_use = frm.__type2_so_name || linked_sos[0];
                        type2_create_row_for_so(frm, so_to_use, batch_no, item_code, net_wt, gross_wt, meter, party, batch_qty);
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

            }).catch(function () {
                frappe.show_alert({ message: `❌ Roll <b>${batch_no}</b> not found in database!`, indicator: 'red' }, 5);
            });
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
//  TYPE 1 — Add roll directly (no SO link, no duplicate DN check needed here)
// ─────────────────────────────────────────────────────────────────────────────
function type1_add_roll(frm, batch_no, item_code, net_wt, gross_wt, meter, party) {
    // Duplicate DN check already done in process_scan — go straight to adding
    add_roll_to_form(frm, batch_no, item_code, net_wt, gross_wt, meter, party);
}

// ─────────────────────────────────────────────────────────────────────────────
//  TYPE 2 — Find SO by party code (first scan, DN truly empty)
// ─────────────────────────────────────────────────────────────────────────────
function type2_find_so_and_create_row(frm, batch_no, item_code, net_wt, gross_wt, meter, party, batch_qty) {

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
            type2_create_row_for_so(frm, orders[0].name, batch_no, item_code, net_wt, gross_wt, meter, party, batch_qty);
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
                        type2_create_row_for_so(frm, selected, batch_no, item_code, net_wt, gross_wt, meter, party, batch_qty);
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
//  NOTE: Duplicate DN check already done in process_scan — not repeated here.
// ─────────────────────────────────────────────────────────────────────────────
function type2_create_row_for_so(frm, so_name, batch_no, item_code, net_wt, gross_wt, meter, party, batch_qty) {

    // ── Party code validation ─────────────────────────────────────────────────
    frappe.db.get_value('Sales Order', so_name, ['custom_party_code', 'customer'], function (so_vals) {
        var so_party = (so_vals && so_vals.custom_party_code) ? so_vals.custom_party_code.trim() : '';
        var so_customer = (so_vals && so_vals.customer) ? so_vals.customer : '';

        if (party && so_party && party.trim() !== so_party) {
            frappe.msgprint({
                title: '❌ Wrong Party Roll!',
                message: `
<div style="text-align:center;padding:10px 0;">
    <div style="font-size:48px;margin-bottom:10px;">🚫</div>
    <p style="font-size:15px;font-weight:bold;color:#b00020;">
        Roll / Batch No: <span style="font-family:monospace;">${batch_no}</span>
    </p>
    <p style="font-size:13px;color:#555;margin-top:8px;">
        This roll belongs to Party: <b>${party}</b><br>
        This Sales Order (<b>${so_name}</b>) belongs to Party: <b>${so_party}</b><br><br>
        <b>Rolls from different parties cannot be mixed in one Delivery Note.</b>
    </p>
    <p style="font-size:13px;color:#888;margin-top:10px;">Please scan a roll that belongs to party <b>${so_party}</b>.</p>
</div>`,
                indicator: 'red'
            });
            return;
        }

        if (!frm.doc.customer && so_customer) {
            frappe.model.set_value(frm.doctype, frm.docname, 'customer', so_customer);
        }

        // ── Row already exists → add roll directly ────────────────────────────
        var existing_row = (frm.doc.items || []).find(function (r) {
            return r.item_code === item_code && r.against_sales_order === so_name;
        });

        if (existing_row) {
            add_roll_to_form(frm, batch_no, item_code, net_wt, gross_wt, meter, party);
            return;
        }

        // ── Row not created yet → fetch SO details ────────────────────────────
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

            // Remove ERPNext's auto-added blank rows
            (frm.doc.items || []).filter(function (r) { return !r.item_code || !r.item_code.trim(); }).forEach(function (blank) {
                var gr = frm.fields_dict.items.grid.grid_rows_by_docname[blank.name];
                if (gr) gr.remove();
            });

            // Create new DN item row linked to SO
            var new_row = frm.add_child('items');
            new_row.item_code = so_item.item_code;
            new_row.item_name = so_item.item_name;
            new_row.qty = so_item.qty;
            new_row.uom = so_item.uom;
            new_row.stock_uom = so_item.stock_uom;
            new_row.rate = so_item.rate;
            new_row.amount = flt((batch_qty || so_item.qty) * so_item.rate, 2);
            new_row.against_sales_order = so_name;
            new_row.so_detail = so_item.name;
            new_row.description = so_item.description || '';
            new_row.conversion_factor = so_item.conversion_factor || 1;

            var _wh_so_item = so_item.warehouse || so.set_warehouse || '';

            frappe.db.get_doc('Item', item_code).then(function (item_doc) {
                var item_def = (item_doc.item_defaults || []).find(function (d) { return d.company === frm.doc.company; });
                new_row.warehouse = (item_def && item_def.default_warehouse) || _wh_so_item;

                frm.refresh_field('items');
                frappe.show_alert({
                    message: `✅ Row created for <b>${item_code}</b> from SO <b>${so_name}</b> | Warehouse: <b>${new_row.warehouse || '—'}</b>`,
                    indicator: 'green'
                }, 5);

                setTimeout(function () {
                    add_rolls_buttons(frm);
                    add_roll_to_form(frm, batch_no, item_code, net_wt, gross_wt, meter, party);
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
                    add_roll_to_form(frm, batch_no, item_code, net_wt, gross_wt, meter, party);
                }, 500);
            });
        });
    });
}

// ─────────────────────────────────────────────
//  ADD ROLL TO FORM  (shared by both types)
// ─────────────────────────────────────────────
function add_roll_to_form(frm, batch_no, item_code, net_wt, gross_wt, meter, party) {
    var matching_row = null;
    for (var i = 0; i < (frm.doc.items || []).length; i++) {
        var row = frm.doc.items[i];
        if (row.item_code !== item_code) continue;
        var already_delivered = (scanned_rolls[row.name] || []).reduce(function (s, r) { return s + r.net; }, 0);
        if (flt(already_delivered, 3) < flt(row.qty)) { matching_row = row; break; }
        else if (!matching_row) { matching_row = row; }
    }

    if (!matching_row) {
        frappe.show_alert({ message: `❌ No matching item row for Roll <b>${batch_no}</b> (Item: ${item_code}).`, indicator: 'orange' }, 6);
        return;
    }

    var row_name = matching_row.name;
    var ordered_qty = flt(matching_row.qty);

    if (!scanned_rolls[row_name]) scanned_rolls[row_name] = [];
    scanned_rolls[row_name].push({ batch_no: batch_no, net: net_wt, gross: gross_wt, meter: meter, party: party });

    var total_delivered = flt(scanned_rolls[row_name].reduce(function (s, r) { return s + r.net; }, 0), 3);
    set_delivered_safe(frm, row_name, matching_row.doctype, total_delivered);
    save_rolls_data(frm, row_name, matching_row.doctype);

    if (!matching_row.batch_no || matching_row.batch_no === '') {
        frappe.model.set_value(matching_row.doctype, row_name, 'batch_no', batch_no);
    }

    var remaining = flt(ordered_qty - total_delivered, 3);
    if (total_delivered === ordered_qty) {
        frappe.show_alert({ message: `✅ <b>${item_code}</b> fully covered! (${total_delivered} kg)`, indicator: 'green' }, 5);
    } else if (total_delivered > ordered_qty) {
        frappe.show_alert({ message: `🔼 Over-scanned: <b>${total_delivered} kg</b> | Ordered: <b>${ordered_qty} kg</b>`, indicator: 'orange' }, 5);
    } else {
        frappe.show_alert({ message: `✅ Delivered: <b>${total_delivered} kg</b> | Remaining: <b>${remaining} kg</b>`, indicator: 'blue' }, 4);
    }

    setTimeout(function () { add_rolls_buttons(frm); }, 400);
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
        var ordered_qty = flt(doc.qty || 0);
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
    var ordered_qty = flt(row_doc.qty);

    if (!rolls.length) {
        frappe.msgprint({ title: `🧵 Rolls — ${row_doc.item_code}`, message: `<p style="color:#888;text-align:center;padding:24px 0;">No rolls scanned yet.</p>`, wide: true });
        return;
    }

    var total_net = flt(rolls.reduce(function (s, r) { return s + r.net; }, 0), 3);
    var total_gross = flt(rolls.reduce(function (s, r) { return s + r.gross; }, 0), 3);
    var total_meter = flt(rolls.reduce(function (s, r) { return s + r.meter; }, 0), 3);
    var total_count = rolls.length;

    var sc = '#c07a00', sl = `⚠️ Partial — ${total_net} / ${ordered_qty} kg`;
    if (total_net === ordered_qty) { sc = '#1a7a3c'; sl = `✅ Complete — ${total_net} / ${ordered_qty} kg`; }
    if (total_net > ordered_qty) { sc = '#b00020'; sl = `🔼 Over-scanned — ${total_net} / ${ordered_qty} kg`; }

    var rows_html = rolls.map(function (r, i) {
        return `
<tr>
    <td style="padding:7px 8px;border:1px solid #d1d8dd;text-align:center;font-size:12px;">${i + 1}</td>
    <td style="padding:7px 8px;border:1px solid #d1d8dd;text-align:center;font-size:12px;">${r.batch_no}</td>
    <td style="padding:7px 8px;border:1px solid #d1d8dd;text-align:center;font-size:12px;">${r.net}</td>
    <td style="padding:7px 8px;border:1px solid #d1d8dd;text-align:center;font-size:12px;">${r.gross}</td>
    <td style="padding:7px 8px;border:1px solid #d1d8dd;text-align:center;font-size:12px;">${r.meter}</td>
    <td style="padding:7px 8px;border:1px solid #d1d8dd;text-align:center;font-size:12px;">${r.party || '—'}</td>
</tr>`;
    }).join('');

    var html = `
<div style="background:${sc};padding:10px 14px;border-radius:5px;color:#fff;font-weight:600;margin-bottom:12px;font-size:13px;">${sl}</div>
<table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #d1d8dd;text-align:center;">
<thead><tr style="background-color:#f8f9fa;">
    <th style="padding:8px;border:1px solid #d1d8dd;font-weight:bold;white-space:nowrap;text-align:center;width:36px;">#</th>
    <th style="padding:8px;border:1px solid #d1d8dd;font-weight:bold;white-space:nowrap;text-align:center;">Batch No</th>
    <th style="padding:8px;border:1px solid #d1d8dd;font-weight:bold;text-align:center;white-space:nowrap;">Net Weight (kg)</th>
    <th style="padding:8px;border:1px solid #d1d8dd;font-weight:bold;text-align:center;white-space:nowrap;">Gross Weight (kg)</th>
    <th style="padding:8px;border:1px solid #d1d8dd;font-weight:bold;text-align:center;white-space:nowrap;">Meter / Roll</th>
    <th style="padding:8px;border:1px solid #d1d8dd;font-weight:bold;white-space:nowrap;text-align:center;">Party Code</th>
</tr></thead>
<tbody>${rows_html}</tbody>
<tfoot><tr style="background-color:#e8f4fd;font-weight:bold;font-size:12px;">
    <td style="padding:8px;border:1px solid #b8daff;"></td>
    <td style="padding:8px;border:1px solid #b8daff;color:#0056b3;white-space:nowrap;text-align:center;">🧮 Total (${total_count} Rolls)</td>
    <td style="padding:8px;border:1px solid #b8daff;color:#1a7a3c;text-align:center;">${total_net} kg</td>
    <td style="padding:8px;border:1px solid #b8daff;color:#555;text-align:center;">${total_gross} kg</td>
    <td style="padding:8px;border:1px solid #b8daff;color:#555;text-align:center;">${total_meter} m</td>
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

    // Force the actual modal shell wide enough for all columns
    d.$wrapper.find('.modal-dialog').css({
        'min-width': 'min(95vw, 960px)',
        'max-width': 'min(95vw, 960px)',
        'width': 'min(95vw, 960px)'
    });
}
