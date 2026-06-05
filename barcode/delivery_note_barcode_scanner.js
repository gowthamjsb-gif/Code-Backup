// =========================================================================
//  MASTER SCRIPT: Delivery Note Roll Scanning & Delivered Weight Tracking
//  VERSION: 3.4 (Zero Global Variables - Fixed SyntaxError)
// =========================================================================

frappe.ui.form.on('Delivery Note', {

    validate(frm) {
        let has_mismatch = false;
        let mismatch_lines = [];

        if (!frm.scanned_rolls) frm.scanned_rolls = {};

        (frm.doc.items || []).forEach(row => {
            let ordered = flt(row.qty);
            let delivered = flt(row.custom_delivered);

            if (ordered > 0 && delivered !== ordered) {
                has_mismatch = true;
                let status_word = delivered > ordered ? `<b style="color:red;">EXCEEDS ordered quantity</b>` : `<b style="color:orange;">is LESS than ordered quantity</b>`;
                mismatch_lines.push(`• Item <b>${row.item_code}</b>: Scanned ${delivered} kg ${status_word} (${ordered} kg).`);
            }
        });

        if (has_mismatch && !frm.__ignore_mismatch) {
            frappe.validated = false;
            frappe.confirm(
                `<b>Quantity Warning Before Saving:</b><br><br>${mismatch_lines.join('<br><br>')}<br><br>Do you want to FORCE SAVE anyway?`,
                () => {
                    frm.__ignore_mismatch = true;
                    frm.save();
                },
                () => {
                    frappe.msgprint("Save cancelled. You can continue scanning.");
                }
            );
        }
    },

    refresh(frm) {
        frm.__ignore_mismatch = false;
        if (!frm.scanned_rolls) frm.scanned_rolls = {};

        // 1. Hide the native fields
        frm.set_df_property('scan_barcode', 'hidden', 1);
        if (frm.fields_dict.custom_scan_roll_here) {
            frm.set_df_property('custom_scan_roll_here', 'hidden', 1);
        }

        // 2. Inject custom scanner
        inject_custom_scanner(frm);

        // 3. Render buttons
        setTimeout(() => add_rolls_buttons(frm), 800);
    },

    after_save(frm) {
        setTimeout(() => add_rolls_buttons(frm), 800);
    }
});

// ─────────────────────────────────────────────
//  PURE HTML SCANNER INJECTION 
// ─────────────────────────────────────────────

function inject_custom_scanner(frm) {
    if (!frm.fields_dict.items || !frm.fields_dict.items.$wrapper) return;
    let wrapper = frm.fields_dict.items.$wrapper;
    if ($('#dn_pure_roll_scanner').length > 0) return;

    let html = `
<div id="dn_scanner_container" style="margin-bottom: 20px; padding: 15px; background: #ebf5fa; border: 1px solid #b8daff; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); transition: all 0.3s ease;">
    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <label style="font-weight: 600; font-size: 13px; color: #0056b3; margin: 0;">
            🧵 Roll / Batch Scanner <span id="scanner_status" style="font-size: 11px; margin-left: 10px; padding: 2px 6px; background: #d4edda; color: #155724; border-radius: 10px;">READY</span>
        </label>
        <span style="font-size: 11px; color: #666; cursor: pointer;" onclick="$('#dn_pure_roll_scanner').focus();">Click here to re-focus cursor</span>
    </div>
    <div style="position: relative; display: flex; align-items: center; width: 100%;">
        <input type="text" id="dn_pure_roll_scanner" autocomplete="off"
            placeholder="Scan Roll Barcode Here..." 
            style="width: 100%; border-radius: 4px; box-sizing: border-box; background: #fff; font-weight: bold; border: 2px solid #0056b3; font-size: 15px; padding: 10px 50px 10px 12px; transition: all 0.2s ease;">
        <button id="btn_open_camera" type="button" title="Open Camera Scanner"
            style="position: absolute; right: 4px; top: 4px; bottom: 4px; background: #e3f2fd; border: 1px solid #bbdefb; border-radius: 3px; cursor: pointer; padding: 0 12px; display: flex; align-items: center; justify-content: center; color: #0056b3; z-index: 10;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="4" y1="7" x2="4" y2="4"></line><line x1="4" y1="4" x2="7" y2="4"></line>
                <line x1="20" y1="7" x2="20" y2="4"></line><line x1="20" y1="4" x2="17" y2="4"></line>
                <line x1="4" y1="17" x2="4" y2="20"></line><line x1="4" y2="20" x2="7" y2="20"></line>
                <line x1="20" y1="17" x2="20" y2="20"></line><line x1="20" y2="20" x2="17" y2="20"></line>
                <rect x="7" y="9" width="10" height="6" rx="1"></rect>
            </svg>
        </button>
    </div>
</div>`;

    wrapper.before(html);

    let $input = $('#dn_pure_roll_scanner');
    let scan_timer = null;

    $input.on('focus', function () {
        $(this).css({ 'box-shadow': '0 0 0 0.2rem rgba(0, 123, 255, 0.25)', 'border-color': '#007bff' });
        $('#scanner_status').text('READY').css({ 'background': '#d4edda', 'color': '#155724' });
    }).on('blur', function () {
        $(this).css({ 'box-shadow': 'none', 'border-color': '#adb5bd' });
        if ($('#scanner_status').length) {
            $('#scanner_status').text('INACTIVE (Click to scan)').css({ 'background': '#f8d7da', 'color': '#721c24' });
        }
    });

    // 1. Enter Key check
    $input.on('keydown', function (e) {
        if (e.key === 'Enter' || e.which === 13) {
            e.preventDefault(); e.stopPropagation();
            clearTimeout(scan_timer);
            let barcode = $(this).val().trim();
            $(this).val('');
            if (barcode) process_scan(frm, barcode);
        }
    });

    // 2. TIMEOUT TRIGGER: For scanners that don't send "Enter"
    $input.on('input', function () {
        clearTimeout(scan_timer);
        let barcode = $(this).val().trim();
        if (barcode.length > 3) {
            scan_timer = setTimeout(() => {
                $input.val('');
                process_scan(frm, barcode);
            }, 300); // Wait 300ms after last character
        }
    });

    // 3. AUTO-FOCUS logic
    let focus_interval = setInterval(() => {
        if (!$('#dn_pure_roll_scanner').length) {
            clearInterval(focus_interval);
            return;
        }
        // Only auto-focus if window is active and no other input/select is focused
        if (document.activeElement.tagName !== 'INPUT' &&
            document.activeElement.tagName !== 'SELECT' &&
            document.activeElement.tagName !== 'TEXTAREA' &&
            !$('.modal').is(':visible') &&
            cur_frm && !cur_frm.doc.submitted) {
            $('#dn_pure_roll_scanner').focus();
        }
    }, 2000);

    $('#btn_open_camera').on('click', function (e) {
        e.preventDefault();
        new frappe.ui.Scanner({
            dialog: true, dialog_title: "📷 Scan Roll Barcode", multiple: false,
            on_scan(data) {
                if (data && data.decodedText) {
                    process_scan(frm, data.decodedText.trim());
                }
            }
        });
    });

    setTimeout(() => $input.focus(), 800);
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

// ─────────────────────────────────────────────
//  CORE SCAN LOGIC (VERSION 3.4)
// ─────────────────────────────────────────────

function process_scan(frm, batch_no) {
    if (!frm.scanned_rolls) frm.scanned_rolls = {};

    let already_scanned_row = null;
    Object.keys(frm.scanned_rolls).forEach(r_name => {
        if (frm.scanned_rolls[r_name].find(r => r.batch_no === batch_no)) already_scanned_row = r_name;
    });

    if (already_scanned_row) {
        frappe.confirm(`Roll <b>${batch_no}</b> is already scanned.<br><br>Do you want to <b>REMOVE</b> this roll?`, () => {
            remove_roll_logic(frm, already_scanned_row, batch_no);
        });
        return;
    }

    // STEP 1: Fetch from Batch DocType (Reliable Item Code check)
    frappe.db.get_doc('Batch', batch_no).then(batch_doc => {
        let item_code = batch_doc.item;

        // STEP 2: Fetch from Production Entry Item (Weights + Party Code)
        frappe.db.get_list('Roll Production Entry Item', {
            filters: { 'batch_no': batch_no },
            fields: ['net_wt', 'gross_wt', 'meter_per_roll', 'party_code'],
            limit: 1
        }).then(prod_results => {
            let prod_data = (prod_results && prod_results.length > 0) ? prod_results[0] : {};

            // WEIGHTS & METER FALLBACKS
            let net_wt = flt(prod_data.net_wt) || flt(batch_doc.custom_net_weight) || 0;
            let gross_wt = flt(prod_data.gross_wt) || flt(batch_doc.custom_gross_weight) || 0;
            let meter = flt(prod_data.meter_per_roll) || flt(batch_doc.custom_meter) || 0;

            // --- ULTRA-AGGRESSIVE PARTY SEARCH ---
            let party = '';

            // 1. Try Production Entry Item
            if (prod_data.party_code) party = prod_data.party_code;

            // 2. Try Batch Doc candidates
            if (!party) {
                let candidates = [
                    'custom_party_code', 'party_code', 'custom_party_code_text', 'party_code_text',
                    'custom_customer_code', 'customer_code', 'customer', 'customer_name', 'party', 'party_name'
                ];
                for (let c of candidates) {
                    if (batch_doc[c] && typeof batch_doc[c] === 'string' && batch_doc[c].trim().length > 1) {
                        party = batch_doc[c];
                        break;
                    }
                }
            }

            // 3. Last Ditch: Loop through all Batch fields for keywords
            if (!party) {
                for (let k in batch_doc) {
                    let key = k.toLowerCase();
                    let val = batch_doc[k];
                    if ((key.includes('party') || key.includes('cust') || key.includes('code') || key.includes('alias')) &&
                        val && typeof val === 'string' && val.trim().length > 1) {
                        party = val;
                        break;
                    }
                }
            }

            // 4. Final Fallback: Use Delivery Note customer
            if (!party) party = frm.doc.customer || frm.doc.customer_name || 'Generic';

            console.log(`Scan Results for ${batch_no}:`, { net_wt, party });

            let matching_row = null;
            for (let row of (frm.doc.items || [])) {
                if (row.item_code !== item_code) continue;
                let already_delivered = (frm.scanned_rolls[row.name] || []).reduce((s, r) => s + r.net, 0);
                if (flt(already_delivered, 3) < flt(row.qty)) {
                    matching_row = row; break;
                } else if (!matching_row) {
                    matching_row = row;
                }
            }

            if (!matching_row) {
                frappe.show_alert({ message: `❌ No matching row for <b>${batch_no}</b> (${item_code}).`, indicator: 'orange' }, 6);
                return;
            }

            let row_name = matching_row.name;
            if (!frm.scanned_rolls[row_name]) frm.scanned_rolls[row_name] = [];
            frm.scanned_rolls[row_name].push({ batch_no, net: net_wt, gross: gross_wt, meter, party });

            let total_delivered = flt(frm.scanned_rolls[row_name].reduce((s, r) => s + r.net, 0), 3);
            set_delivered_safe(frm, row_name, matching_row.doctype, total_delivered);

            if (!matching_row.batch_no) {
                frappe.model.set_value(matching_row.doctype, row_name, 'batch_no', batch_no);
            }

            frappe.show_alert({ message: `✅ Scanned [${party}]: <b>${total_delivered} kg</b>`, indicator: 'blue' }, 4);
            setTimeout(() => add_rolls_buttons(frm), 400);
        });

    }).catch(() => {
        $('#dn_scanner_container').css('background', '#fff0f0').delay(500).queue(function (next) { $(this).css('background', '#ebf5fa'); next(); });
        frappe.show_alert({ message: `❌ Batch <b>${batch_no}</b> not found!`, indicator: 'red' }, 5);
    });
}

function remove_roll_logic(frm, row_name, batch_no) {
    if (!frm.scanned_rolls || !frm.scanned_rolls[row_name]) return;
    frm.scanned_rolls[row_name] = frm.scanned_rolls[row_name].filter(r => r.batch_no !== batch_no);
    let new_total = flt((frm.scanned_rolls[row_name] || []).reduce((s, r) => s + r.net, 0), 3);
    let row_doc = (frm.doc.items || []).find(i => i.name === row_name);
    if (row_doc) {
        set_delivered_safe(frm, row_name, row_doc.doctype, new_total);
        if (frm.scanned_rolls[row_name].length === 0) {
            frappe.model.set_value(row_doc.doctype, row_name, 'batch_no', '');
        } else if (row_doc.batch_no === batch_no) {
            frappe.model.set_value(row_doc.doctype, row_name, 'batch_no', frm.scanned_rolls[row_name][0].batch_no);
        }
    }
    frappe.show_alert({ message: `🗑 Roll <b>${batch_no}</b> removed!`, indicator: 'orange' }, 4);
    setTimeout(() => add_rolls_buttons(frm), 300);
}

function add_rolls_buttons(frm) {
    if (!frm.fields_dict.items || !frm.fields_dict.items.grid) return;
    if (!frm.scanned_rolls) frm.scanned_rolls = {};

    frm.fields_dict.items.grid.grid_rows.forEach(row => {
        let doc = row.doc; if (!doc || !doc.item_code) return;
        let cell = row.row.find('[data-fieldname="custom_rolls"]');
        if (!cell.length) return;
        let rolls = frm.scanned_rolls[doc.name] || [];
        let ordered_qty = flt(doc.qty), scanned_wt = flt(rolls.reduce((s, r) => s + r.net, 0), 3);
        let count = rolls.length;
        let btn_color = '#555', status_icon = '';
        if (count > 0) {
            if (scanned_wt < ordered_qty) { btn_color = '#c07a00'; status_icon = ' ⚠️'; }
            if (scanned_wt === ordered_qty) { btn_color = '#1a7a3c'; status_icon = ' ✅'; }
            if (scanned_wt > ordered_qty) { btn_color = '#b00020'; status_icon = ' ❌'; }
        }
        let badge = count > 0 ? `<span style="background:rgba(255,255,255,0.25);border-radius:10px;padding:0 6px;margin-left:5px;font-size:10px;">${count}</span>` : '';
        let $btn = $(`<button class="btn btn-xs dn-rolls-btn" style="background:${btn_color};color:#fff;border:none;border-radius:4px;padding:3px 10px;font-size:11px;cursor:pointer;white-space:nowrap;margin-top:2px;">🧵 Rolls${badge}${status_icon}</button>`);
        $btn.off('click').on('click', function (e) {
            e.preventDefault(); e.stopPropagation();
            show_rolls_popup(frm, doc); return false;
        });
        cell.html($btn);
    });
}

function show_rolls_popup(frm, row_doc) {
    if (!frm.scanned_rolls) frm.scanned_rolls = {};
    let row_name = row_doc.name, rolls = frm.scanned_rolls[row_name] || [], ordered_qty = flt(row_doc.qty);
    if (!rolls.length) {
        frappe.msgprint({ title: `🧵 Rolls — ${row_doc.item_code}`, message: `<p style="color:#888;text-align:center;padding:24px 0;">No rolls scanned yet.</p>`, wide: true });
        return;
    }
    let total_net = flt(rolls.reduce((s, r) => s + r.net, 0), 3);
    let sc = '#c07a00', sl = `⚠️ Partial — ${total_net} / ${ordered_qty} kg`;
    if (total_net === ordered_qty) { sc = '#1a7a3c'; sl = `✅ Complete — ${total_net} / ${ordered_qty} kg`; }
    if (total_net > ordered_qty) { sc = '#b00020'; sl = `🔼 Over-scanned — ${total_net} / ${ordered_qty} kg`; }
    let rows_html = rolls.map((r, i) => `
<tr>
    <td style="padding: 10px; border: 1px solid #d1d8dd; text-align: center;">${i + 1}</td>
    <td style="padding: 10px; border: 1px solid #d1d8dd;">${r.batch_no}</td>
    <td style="padding: 10px; border: 1px solid #d1d8dd; text-align: center;">${r.net}</td>
    <td style="padding: 10px; border: 1px solid #d1d8dd; text-align: center;">${r.gross}</td>
    <td style="padding: 10px; border: 1px solid #d1d8dd; text-align: center;">${r.meter}</td>
    <td style="padding: 10px; border: 1px solid #d1d8dd;">${r.party || '—'}</td>
    <td style="padding: 10px; border: 1px solid #d1d8dd; text-align: center;">
        <button class="btn btn-xs btn-danger" onclick="frappe.confirm('Remove roll <b>${r.batch_no}</b>?', () => { remove_roll_logic(cur_frm, '${row_name}', '${r.batch_no}'); show_rolls_popup(cur_frm, cur_frm.doc.items.find(i=>i.name==='${row_name}')); })">Remove</button>
    </td>
</tr>`).join('');
    let html = `
<div style="background:${sc}; padding: 12px 14px; border-radius: 5px; color: #fff; font-weight: 600; margin-bottom: 15px; font-size: 14px;">${sl}</div>
<div style="margin-top: 15px; overflow-x: auto;">
    <table class="dn-rolls-popup-table" style="width: 100%; border-collapse: collapse; font-size: 13px; border: 1px solid #d1d8dd; text-align: left;">
        <thead><tr style="background-color: #f8f9fa;">
            <th style="padding: 10px; border: 1px solid #d1d8dd; font-weight: bold; width: 40px; text-align: center;">#</th>
            <th style="padding: 10px; border: 1px solid #d1d8dd; font-weight: bold;">Batch No</th>
            <th style="padding: 10px; border: 1px solid #d1d8dd; font-weight: bold; text-align: center;">Net Weight</th>
            <th style="padding: 10px; border: 1px solid #d1d8dd; font-weight: bold; text-align: center;">Gross Weight</th>
            <th style="padding: 10px; border: 1px solid #d1d8dd; font-weight: bold; text-align: center;">Meter</th>
            <th style="padding: 10px; border: 1px solid #d1d8dd; font-weight: bold;">Party Code</th>
            <th style="padding: 10px; border: 1px solid #d1d8dd; font-weight: bold; text-align: center;">Action</th>
        </tr></thead>
        <tbody>${rows_html}</tbody>
    </table>
</div>`;
    frappe.msgprint({ title: `🧵 Scanned Rolls — Item: ${row_doc.item_code}`, message: html, wide: true });
}
