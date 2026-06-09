// ─────────────────────────────────────────────
// GLOBAL CACHES
// ─────────────────────────────────────────────
const SMART_BOM_CLIENT_VERSION = "2026-04-27-lam-items-multi-shape-v2";
console.log("Smart BOM client loaded:", SMART_BOM_CLIENT_VERSION);

// ---------------------------------------------------------------------
// Safety patch: prevent crashes like "Cannot read properties of undefined (reading 'fields')"
// when some code calls `frappe.get_meta(...).fields` before meta is loaded.
// ---------------------------------------------------------------------
if (typeof frappe !== "undefined" && frappe && typeof frappe.get_meta === "function" && !frappe.__smart_bom_meta_safe) {
    frappe.__smart_bom_meta_safe = true;
    const __orig_get_meta = frappe.get_meta.bind(frappe);
    frappe.get_meta = function (doctype) {
        let meta;
        try {
            meta = __orig_get_meta(doctype);
        } catch (e) {
            meta = null;
        }
        if (!meta) meta = {};
        if (!meta.fields || !Array.isArray(meta.fields)) meta.fields = [];
        return meta;
    };
}
let item_name_to_code = {}, item_code_to_name = {};
let categorized = { pp: [], fl: [], sa: [], mb: [] };
let all_q_cache = [];

function getRowUnit(row, frm = null) {
    frm = frm || cur_frm;
    let row_unit = row && row.custom_unit;
    let doc_unit = frm && frm.doc ? frm.doc.custom_unit : '';
    return ((row_unit || doc_unit || '') + '').toUpperCase().trim();
}

function isStandardFabricUnit(row, frm = null) {
    let unit = getRowUnit(row, frm);
    return unit.includes('UNIT 1') || unit.includes('UNIT 2') || unit.includes('UNIT 3') || unit.includes('UNIT 4');
}

// ─────────────────────────────────────────────
// LAMINATION DETECTION HELPER
// ─────────────────────────────────────────────
/**
 * Returns true if this Production Plan row belongs to a Lamination Unit.
 * Detection is based on custom_unit (same logic as planning_to_pp.py):
 *   Unit 1 / Unit 2 / Unit 3 / Unit 4  → standard fabric BOM flow
 *   "Lamination Unit" (or any unit with "LAMINATION" in the name) → lamination BOM flow
 *
 * custom_lamination_side is read INSIDE the lamination dialog to know
 * which type (Inner / Outer / Single Side / Double Side) — not used for routing.
 */
function isLaminationItem(row, frm = null) {
    if (isStandardFabricUnit(row, frm)) return false;
    let unit = getRowUnit(row, frm);
    return unit.includes('LAMINATION');
}

/**
 * Returns true if this is a BOPP Lamination based on side.
 * Plain: Inner / Outer
 * BOPP: Single Side / Double Side
 */
function isBOPPLamination(row) {
    let side = (row.custom_lamination_side || "").trim().toUpperCase();
    if (side.includes("SINGLE SIDE") || side.includes("DOUBLE SIDE")) return true;
    // Fallbacks if side is empty or doesn't match specific strings
    if ((row.item_code || "").includes("-107")) return true;
    let pb = (row.custom_printed_bopp || "").toUpperCase();
    if (pb && (pb.startsWith("PB-") || pb.startsWith("2-"))) return true;
    return false;
}

/**
 * Returns true if this Production Plan row belongs to a Slitting Unit.
 * For slitting, BOM = base fabric only — no recipe dialog needed.
 */
function isSlittingItem(row, frm = null) {
    if (isStandardFabricUnit(row, frm)) return false;
    let unit = getRowUnit(row, frm);
    return unit.includes('SLIT');
}

/**
 * Returns true if this Production Plan row belongs to a BOPP Printing Unit.
 * Detected by 'BOPP' OR 'PRINTING' in custom_unit (row or doc header).
 */
function isBOPPPrintingItem(row, frm = null) {
    if (isStandardFabricUnit(row, frm)) return false;
    let unit = getRowUnit(row, frm);
    return unit.includes('VR - 1200MM BOPP PRINTING MACHINE');
}

// Quality tier keywords (order matters — check longer phrases first)
const QUALITY_TIERS = ["SUPER ECO", "ECO SPECIAL", "ECO SPL", "ECOGREEN", "DELUXE", "ULTRA", "PLATINUM", "PREMIUM", "LIFESTYLE", "CLASSIC", "SILVER", "GOLD", "BRONZE"];

// PP keyword priority (index 0 = highest)
const PP_KEYWORDS = ["POLYMAXX", "RELIANCE", "EXXON", "BASELL"];

function isPremiumQuality(q) {
    return ((q || "") + "").toUpperCase().includes("PREMIUM");
}

function getNormalizedOneMixQty(input) {
    const pp1 = parseFloat(input.pp1) || 0;
    const pp2 = parseFloat(input.pp2) || 0;
    const fl1 = parseFloat(input.fl1) || 0;
    const fl2 = parseFloat(input.fl2) || 0;
    const ppa = parseFloat(input.ppa) || 0;
    const anti = parseFloat(input.anti) || 0;
    const ldr = parseFloat(input.ldr) || 0;

    const baseTotal = pp1 + pp2 + fl1 + fl2;
    if (baseTotal <= 0) {
        return { error: "PP + Filler total must be greater than 0." };
    }

    const mbKgs = (baseTotal * ldr) / 100.0;
    const grandTotal = baseTotal + ppa + anti + mbKgs;
    if (grandTotal <= 0) {
        return { error: "Total recipe weight must be greater than 0." };
    }

    const factor = 1 / grandTotal;
    return {
        qty_pp_1: +(pp1 * factor).toFixed(6),
        qty_pp_2: +(pp2 * factor).toFixed(6),
        qty_fl_1: +(fl1 * factor).toFixed(6),
        qty_fl_2: +(fl2 * factor).toFixed(6),
        qty_ppa_1: +(ppa * factor).toFixed(6),
        qty_anti_1: +(anti * factor).toFixed(6)
    };
}

function getNextPriorityOption(options, selectedValues) {
    let opts = Array.isArray(options) ? options : (options || "").split("\n");
    let selected = new Set((selectedValues || []).filter(Boolean));
    for (let opt of opts) {
        if (opt && !selected.has(opt)) return opt;
    }
    return opts[0] || "";
}

function collectRows(d, itemFields, qtyFields, qtyKey = "qty") {
    let rows = [];
    for (let i = 0; i < itemFields.length; i++) {
        let itemName = d.get_value(itemFields[i]);
        let qty = parseFloat(d.get_value(qtyFields[i])) || 0;
        if (itemName && qty > 0) {
            rows.push({ item_code: resolveItemCodeAny(itemName), [qtyKey]: qty });
        }
    }
    return rows;
}

function resolveItemCodeAny(val) {
    let s = (val || "").toString().trim();
    if (!s) return "";

    // 1) Direct map (name/code/"CODE - NAME")
    if (item_name_to_code[s]) return item_name_to_code[s];

    // 2) "Something [ITEMCODE]" pattern (matches server side too)
    if (s.includes("[") && s.endsWith("]")) {
        let code = s.split("[").pop().replace("]", "").trim();
        if (item_name_to_code[code]) return item_name_to_code[code];
        return code;
    }

    // 3) "CODE - NAME" where CODE itself is a valid item_code
    let parts = s.split(" - ");
    if (parts.length >= 2) {
        let maybeCode = parts[0].trim();
        if (item_code_to_name[maybeCode] || item_name_to_code[maybeCode]) return item_name_to_code[maybeCode] || maybeCode;
    }

    // 4) Last resort: return as-is (server will try to resolve too)
    return s;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

/** Extract quality tier from full quality name like "REMEX - SILVER" → "SILVER" */
function extractTier(q) {
    let qu = (q || "").toUpperCase();
    for (let t of QUALITY_TIERS) {
        if (qu.includes(t)) return t;
    }
    return qu;
}

/**
 * Returns filtered & prioritised PP item names based on quality tier + GSM.
 * GSM < 20  → [EXXON, BASELL]
 * 20≤GSM≤30 → [RELIANCE, EXXON, BASELL]
 * GSM > 30  → [POLYMAXX, RELIANCE, EXXON, BASELL]
 * High-end tiers (DELUXE/ULTRA/…) → always all 4 regardless of GSM.
 */
function getFilteredPP(q, gsm) {
    let tier = extractTier(q);
    let g = parseFloat(gsm) || 0;
    const HIGH_END = ["DELUXE", "ULTRA", "SUPER ECO", "ECOGREEN", "ECO SPECIAL"];
    let kwList;
    if (HIGH_END.some(x => tier.includes(x))) {
        kwList = ["POLYMAXX", "RELIANCE", "EXXON", "BASELL"];
    } else {
        if (g > 30)       kwList = ["POLYMAXX", "RELIANCE", "EXXON", "BASELL"];
        else if (g >= 20) kwList = ["RELIANCE", "EXXON", "BASELL"];
        else              kwList = ["EXXON", "BASELL"];   // < 20 GSM: only 2
    }
    let result = [];
    for (let kw of kwList) {
        let found = categorized.pp.find(n => n.toUpperCase().includes(kw));
        if (found && !result.includes(found)) result.push(found);
    }
    
    let danaItems = categorized.pp.filter(n => n.toUpperCase().includes("DANA"));
    for (let d of danaItems) {
        if (!result.includes(d)) result.push(d);
    }
    
    let rest = categorized.pp.filter(n => !result.includes(n));
    return [...result, ...rest];
}

/** Returns optimal fillers ordered by priority matrix */
function getFilteredFiller(q, is_printing, is_rice_bag) {
    let tier = extractTier(q);
    let target_code = '1003013';

    // PREMIUM: filler not applicable
    if ((tier || "").toUpperCase().includes("PREMIUM")) {
        return [];
    }

    const HIGH_END = ["DELUXE", "ULTRA", "SUPER ECO", "ECOGREEN", "ECO SPECIAL", "ECO SPL", "LIFESTYLE", "CLASSIC"];
    const MID_TIER = ["BRONZE", "SILVER", "GOLD"];

    if (HIGH_END.some(x => tier.includes(x))) {
        target_code = '1003013';
    } else if (tier === "PLATINUM") {
        if (is_rice_bag) target_code = '1003009';
        else if (is_printing) target_code = '1003005';
        else target_code = '1003013';
    } else if (MID_TIER.some(x => tier.includes(x))) {
        if (is_printing) target_code = '1003005';
        else target_code = '1003013';
    } else if (is_printing) {
        target_code = '1003005';
    }

    // categorized.fl stores item NAMES — find the name whose item code contains target_code
    let target = null;
    for (let [code, name] of Object.entries(item_code_to_name)) {
        if (code.includes(target_code) && categorized.fl.includes(name)) {
            target = name;
            break;
        }
    }
    if (!target) {
        // fallback: search name string directly (in case naming convention differs)
        target = categorized.fl.find(n => n.includes(target_code));
    }
    if (!target) {
        target = categorized.fl.find(n => n.toUpperCase().includes("HL 440") || n.toUpperCase().includes("HL440")) || categorized.fl[0];
    }

    let rest = categorized.fl.filter(n => n !== target);
    return target ? [target, ...rest] : [...categorized.fl];
}

// ─────────────────────────────────────────────
// FORM EVENT
// ─────────────────────────────────────────────

frappe.ui.form.on('Production Plan', 'refresh', function (frm) {
    if (frm.doc.docstatus === 0) {
        if (!frm.custom_buttons || !frm.custom_buttons[__('🚀 Change LDR & Assign BOM')]) {
            frm.add_custom_button(__('🚀 Change LDR & Assign BOM'), () => bulk_set_recipes(frm));
        }
        const po_items_field = frm.get_field('po_items');
        if (po_items_field && po_items_field.grid) {
            let grid = po_items_field.grid;
            if (!grid.custom_buttons || !grid.custom_buttons[__('Set Recipe')]) {
                grid.add_custom_button(__('Set Recipe'), () => {
                    let row = grid.get_selected_children()[0];
                    if (!row) return frappe.msgprint("Please select a row first.");
                    process_item_smart_bom(frm, frm.doc.po_items.indexOf(row));
                });
            }
        }
        
        // --- Added: Enable deletion in Raw Materials Table ---
        if (frm.fields_dict['mr_items'] && frm.fields_dict['mr_items'].grid) {
            frm.fields_dict['mr_items'].grid.cannot_delete_rows = false;
        }
    }
});

// ─────────────────────────────────────────────
// SINGLE RECIPE DIALOG
// ─────────────────────────────────────────────

async function process_item_smart_bom(frm, index) {
    let row = frm.doc.po_items[index];
    if (!row) return;

    // ── Route lamination items to their own dialog ──────────────────────
    if (isLaminationItem(row, frm)) {
        await open_lamination_dialog(frm, row, index);
        return;
    }

    // ── Route slitting items — no dialog, auto-assign BOM ───────────────
    if (isSlittingItem(row, frm)) {
        await assign_slitting_bom(frm, row);
        return;
    }

    // ── Route BOPP Printing items to their own dialog ────────────────────
    if (isBOPPPrintingItem(row, frm)) {
        await open_bopp_printing_dialog(frm, row, index);
        return;
    }

    try {
        if (!all_q_cache.length) {
            let q_res = await frappe.call({ method: "frappe.client.get_list", args: { doctype: "Quality Master", fields: ["quality_name", "name"], limit_page_length: 1000 } });
            all_q_cache = (q_res.message || []).map(d => d.quality_name || d.name);
        }
        let all_q = all_q_cache;
        // Force refresh so master changes (e.g. filler updates) show immediately
        await refreshItemCache(true);

        let q_final = await detectQuality(row, all_q) || "BRONZE";
        let gsm_final = row.custom_gsm || row.gsm || 0;
        let premium_mode = isPremiumQuality(q_final);
        
        let is_printing = (row.item_code || "").startsWith("105");
        let is_rice_bag = 0;
        let customer = frm.doc.custom_party_code || frm.doc.customer;
        if (customer) {
            try {
                let cr = await frappe.db.get_value("Customer", customer, "custom_is_rice_bag_manufacturer");
                if (cr && cr.message) is_rice_bag = cr.message.custom_is_rice_bag_manufacturer ? 1 : 0;
            } catch(e) {}
        }

        let q_details = await frappe.db.get_value("Quality Master", { "quality_name": q_final }, ["pp_kgs", "filler_kgs", "ppa_kgs", "antistatic_kgs"]);
        let kgs = q_details?.message || { pp_kgs: 0, filler_kgs: 0, ppa_kgs: 0, antistatic_kgs: 0 };

        // MB fetching — Colour Master name = colour name
        let color = row.custom_color || "";
        let mb_def = "", ldr_def = 0;
        if (color) {
            let cm = await frappe.db.get_value("Colour Master", color, ["item_code", "masterbatch_ldr_"]);
            if (cm?.message) {
                mb_def = cm.message.item_code || mb_def;
                ldr_def = cm.message.masterbatch_ldr_ || ldr_def;
            }
        }

        // Check if a BOM already exists to pre-fill saved values
        let existing_data = null;
        if (row.bom_no) {
            try {
                let r = await frappe.call({ method: "frappe.client.get", args: { doctype: "BOM", name: row.bom_no }});
                existing_data = r.message;
            } catch (e) { console.log(e); }
        }

        let sel_pp = [], sel_fl = [], sel_sa = [], sel_mb_ic = mb_def, sel_ldr = ldr_def;
        let pp_rats = [], fl_rats = [];
        if (existing_data && existing_data.items) {
            let tot_pp = 0, tot_fl = 0, temp_pp = [], temp_fl = [], unassigned_dana = [];
            
            existing_data.items.forEach(it => {
                let name = item_code_to_name[it.item_code] || it.item_code;
                let ic_u = it.item_code.toUpperCase(), name_u = name.toUpperCase();
                let is_dana = name_u.includes("DANA");
                
                if ((ic_u.startsWith("PP") || ic_u.startsWith("1002")) && !is_dana) {
                    temp_pp.push({it: it, name: name}); tot_pp += it.qty;
                } else if ((ic_u.startsWith("FL") || ic_u.startsWith("1003")) && !is_dana) {
                    temp_fl.push({it: it, name: name}); tot_fl += it.qty;
                } else if (is_dana) {
                    unassigned_dana.push({it: it, name: name});
                } else if (categorized.sa.includes(name)) {
                    sel_sa.push(name);
                } else {
                    if (categorized.pp.includes(name) && !categorized.fl.includes(name)) {
                        temp_pp.push({it: it, name: name}); tot_pp += it.qty;
                    } else if (categorized.fl.includes(name) && !categorized.pp.includes(name)) {
                        temp_fl.push({it: it, name: name}); tot_fl += it.qty;
                    }
                }
            });

            for (let d of unassigned_dana) {
                if (temp_pp.length === 0) { temp_pp.push(d); tot_pp += d.it.qty; }
                else if (temp_fl.length === 0) { temp_fl.push(d); tot_fl += d.it.qty; }
                else if (temp_pp.length < 2) { temp_pp.push(d); tot_pp += d.it.qty; }
                else { temp_fl.push(d); tot_fl += d.it.qty; }
            }

            temp_pp.forEach(d => { sel_pp.push(d.name); pp_rats.push(tot_pp ? (d.it.qty / tot_pp) : 0); });
            temp_fl.forEach(d => { sel_fl.push(d.name); fl_rats.push(tot_fl ? (d.it.qty / tot_fl) : 0); });
        }

        let pp_opts = getFilteredPP(q_final, gsm_final);
        let fl_opts = premium_mode ? [] : getFilteredFiller(q_final, is_printing, is_rice_bag);
        let orig_pp_kgs = kgs.pp_kgs;
        let orig_fl_kgs = kgs.filler_kgs;
        
        let def_qty_pp = kgs.pp_kgs, def_qty_pp2 = 0;
        if (sel_pp.length > 0) { def_qty_pp = parseFloat((kgs.pp_kgs * pp_rats[0]).toFixed(3)); if (sel_pp.length > 1) def_qty_pp2 = parseFloat((kgs.pp_kgs * pp_rats[1]).toFixed(3)); }
        
        let def_qty_fl = premium_mode ? 0 : kgs.filler_kgs, def_qty_fl2 = 0;
        if (sel_fl.length > 0) { def_qty_fl = parseFloat((kgs.filler_kgs * fl_rats[0]).toFixed(3)); if (sel_fl.length > 1) def_qty_fl2 = parseFloat((kgs.filler_kgs * fl_rats[1]).toFixed(3)); }

        let d = new frappe.ui.Dialog({
            title: `Set Recipe: ${row.item_code}`,
            fields: [
                { fieldtype: 'HTML', fieldname: 'info', options: `<div style="padding:10px;background:#f0f4ff;border-radius:6px;margin-bottom:4px;"><b>📦 ${row.item_code}</b><br><span style="color:#555">Quality: <b>${q_final}</b> | GSM: <b>${gsm_final}</b> | Color: <b>${color || '—'}</b></span></div>` },
                { label: 'Confirm Quality', fieldname: 'quality', fieldtype: 'Select', options: all_q, default: q_final,
                    onchange: async () => {
                        let nq = d.get_value('quality');
                        let is_prem = isPremiumQuality(nq);
                        let res = await frappe.db.get_value("Quality Master", { "quality_name": nq }, ["pp_kgs", "filler_kgs", "ppa_kgs", "antistatic_kgs"]);
                        if (res?.message) {
                            orig_pp_kgs = res.message.pp_kgs;
                            orig_fl_kgs = res.message.filler_kgs;
                            d.set_values({ qty_pp: res.message.pp_kgs, qty_fl: is_prem ? 0 : res.message.filler_kgs, qty_ad1: res.message.ppa_kgs, qty_ad2: res.message.antistatic_kgs });
                            let new_pp = getFilteredPP(nq, gsm_final);
                            let new_fl = is_prem ? [] : getFilteredFiller(nq, is_printing, is_rice_bag);
                            d.set_df_property('item_pp', 'options', new_pp); d.set_value('item_pp', new_pp[0] || '');
                            d.set_df_property('item_pp2', 'options', new_pp.slice(1));
                            if (d.get_value('item_pp2')) d.set_value('item_pp2', new_pp.slice(1)[0] || '');
                            d.set_df_property('item_fl', 'options', new_fl);
                            d.set_df_property('item_fl', 'reqd', is_prem ? 0 : 1);
                            d.set_value('item_fl', is_prem ? '' : (new_fl[0] || ''));
                            d.set_df_property('item_fl2', 'options', new_fl.slice(1));
                            if (is_prem) {
                                d.set_value('item_fl2', '');
                                d.set_value('qty_fl2', 0);
                                d.set_value('qty_fl', 0);
                            } else {
                                if (d.get_value('item_fl2')) d.set_value('item_fl2', new_fl.slice(1)[0] || '');
                            }
                        }
                    }
                },
                { fieldtype: 'Section Break', label: '🧪 PP' },
                { label: 'PP Item', fieldname: 'item_pp', fieldtype: 'Autocomplete', options: pp_opts, reqd: 1, default: sel_pp[0] || pp_opts[0] || '' },
                { label: 'PP KGs', fieldname: 'qty_pp', fieldtype: 'Float', default: def_qty_pp, reqd: 1 },
                { fieldtype: 'HTML', fieldname: 'add_pp_html', options: `
                    <div style="margin:4px 0 8px; display: flex; gap: 8px;">
                        <button class="btn btn-xs btn-default" id="add_pp_btn">＋ Add PP Row</button>
                        <button class="btn btn-xs btn-outline-danger" id="rem_pp_btn" style="display:none;">🗑 Remove PP Row</button>
                    </div>` 
                },
                { label: 'PP Item 2', fieldname: 'item_pp2', fieldtype: 'Autocomplete', options: pp_opts.slice(1), hidden: 1 },
                { label: 'PP KGs 2', fieldname: 'qty_pp2', fieldtype: 'Float', hidden: 1 },
                { label: 'PP Item 3', fieldname: 'item_pp3', fieldtype: 'Autocomplete', options: pp_opts.slice(2), hidden: 1 },
                { label: 'PP KGs 3', fieldname: 'qty_pp3', fieldtype: 'Float', hidden: 1 },
                { label: 'PP Item 4', fieldname: 'item_pp4', fieldtype: 'Autocomplete', options: pp_opts.slice(3), hidden: 1 },
                { label: 'PP KGs 4', fieldname: 'qty_pp4', fieldtype: 'Float', hidden: 1 },
                { fieldtype: 'Section Break', label: '🪨 Filler' },
                { label: 'Filler Item', fieldname: 'item_fl', fieldtype: 'Autocomplete', options: fl_opts, reqd: premium_mode ? 0 : 1, default: premium_mode ? '' : (sel_fl[0] || fl_opts[0] || '') },
                { label: 'Filler KGs', fieldname: 'qty_fl', fieldtype: 'Float', default: def_qty_fl, reqd: premium_mode ? 0 : 1 },
                { fieldtype: 'HTML', fieldname: 'add_fl_html', options: `
                    <div style="margin:4px 0 8px; display: flex; gap: 8px;">
                        <button class="btn btn-xs btn-default" id="add_fl_btn">＋ Add Filler Row</button>
                        <button class="btn btn-xs btn-outline-danger" id="rem_fl_btn" style="display:none;">🗑 Remove Filler Row</button>
                    </div>` 
                },
                { label: 'Filler Item 2', fieldname: 'item_fl2', fieldtype: 'Autocomplete', options: fl_opts.slice(1), hidden: 1 },
                { label: 'Filler KGs 2', fieldname: 'qty_fl2', fieldtype: 'Float', hidden: 1 },
                { label: 'Filler Item 3', fieldname: 'item_fl3', fieldtype: 'Autocomplete', options: fl_opts.slice(2), hidden: 1 },
                { label: 'Filler KGs 3', fieldname: 'qty_fl3', fieldtype: 'Float', hidden: 1 },
                { label: 'Filler Item 4', fieldname: 'item_fl4', fieldtype: 'Autocomplete', options: fl_opts.slice(3), hidden: 1 },
                { label: 'Filler KGs 4', fieldname: 'qty_fl4', fieldtype: 'Float', hidden: 1 },
                { fieldtype: 'Section Break', label: '⚗️ Additives' },
                { label: 'Additive Item 1', fieldname: 'item_ad1', fieldtype: 'Autocomplete', options: categorized.sa, default: sel_sa[0] || categorized.sa[0] || '' },
                { label: 'Additive KGs 1', fieldname: 'qty_ad1', fieldtype: 'Float', default: kgs.ppa_kgs },
                { label: 'Additive Item 2', fieldname: 'item_ad2', fieldtype: 'Autocomplete', options: categorized.sa, default: sel_sa[1] || categorized.sa[1] || categorized.sa[0] || '' },
                { label: 'Additive KGs 2', fieldname: 'qty_ad2', fieldtype: 'Float', default: kgs.antistatic_kgs },
                { fieldtype: 'HTML', fieldname: 'add_ad_html', options: `
                    <div style="margin:4px 0 8px; display: flex; gap: 8px;">
                        <button class="btn btn-xs btn-default" id="add_ad_btn">＋ Add Additive Row</button>
                        <button class="btn btn-xs btn-outline-danger" id="rem_ad_btn" style="display:none;">🗑 Remove Additive Row</button>
                    </div>` 
                },
                { label: 'Additive Item 3', fieldname: 'item_ad3', fieldtype: 'Autocomplete', options: categorized.sa, hidden: 1 },
                { label: 'Additive KGs 3', fieldname: 'qty_ad3', fieldtype: 'Float', hidden: 1 },
                { label: 'Additive Item 4', fieldname: 'item_ad4', fieldtype: 'Autocomplete', options: categorized.sa, hidden: 1 },
                { label: 'Additive KGs 4', fieldname: 'qty_ad4', fieldtype: 'Float', hidden: 1 },
                { fieldtype: 'Section Break', label: '🎨 Masterbatch' },
                { label: 'MB Item', fieldname: 'item_mb', fieldtype: 'Autocomplete', options: categorized.mb, default: item_code_to_name[sel_mb_ic] || sel_mb_ic, reqd: 1,
                    onchange: async () => {
                        let mb_name = d.get_value('item_mb');
                        let mb_code = item_name_to_code[mb_name] || mb_name;
                        if (mb_code) {
                            let res = await frappe.db.get_value("Colour Master", { "item_code": mb_code }, "masterbatch_ldr_");
                            if (res && res.message && res.message.masterbatch_ldr_ !== undefined) {
                                d.set_value('qty_mb', res.message.masterbatch_ldr_);
                            }
                        }
                    }
                },
                { label: 'MB LDR %', fieldname: 'qty_mb', fieldtype: 'Float', default: sel_ldr, reqd: 1 }
            ],
            primary_action_label: 'Create BOM',
            primary_action: async (v) => {
                const pp_rows = collectRows(d, ['item_pp', 'item_pp2', 'item_pp3', 'item_pp4'], ['qty_pp', 'qty_pp2', 'qty_pp3', 'qty_pp4']);
                const fl_rows = collectRows(d, ['item_fl', 'item_fl2', 'item_fl3', 'item_fl4'], ['qty_fl', 'qty_fl2', 'qty_fl3', 'qty_fl4']);
                const ad_rows = collectRows(d, ['item_ad1', 'item_ad2', 'item_ad3', 'item_ad4'], ['qty_ad1', 'qty_ad2', 'qty_ad3', 'qty_ad4']);
                const mb_rows = [{ item_code: resolveItemCodeAny(v.item_mb), share: 1 }];
                const pp1 = pp_rows[0] || {}, pp2 = pp_rows[1] || {};
                const fl1 = fl_rows[0] || {}, fl2 = fl_rows[1] || {};
                const ad1 = ad_rows[0] || {}, ad2 = ad_rows[1] || {};
                if (!pp_rows.length || (!fl_rows.length && !isPremiumQuality(v.quality))) {
                    frappe.msgprint("At least one PP and one Filler row are required.");
                    return;
                }

                console.log("Create BOM click", {
                    v_quality: v.quality,
                    pp_rows,
                    fl_rows,
                    ad_rows,
                    mb_rows,
                    mb_ldr: parseFloat(v.qty_mb) || 0,
                    force_new: 0,
                    version: SMART_BOM_CLIENT_VERSION
                });

                let r = await frappe.call({
                    method: "create_smart_bom",
                    args: {
                        "production_plan": frm.doc.name, "item_code": row.item_code, "po_item_index": index,
                        "quality": v.quality,
                        "force_new": 0,
                        // Legacy fallback args for server-side fail-safe path
                        "item_pp_1": pp1.item_code || "",
                        "qty_pp_1": pp1.qty || 0,
                        "item_pp_2": pp2.item_code || "",
                        "qty_pp_2": pp2.qty || 0,
                        "item_fl_1": fl1.item_code || "",
                        "qty_fl_1": fl1.qty || 0,
                        "item_fl_2": fl2.item_code || "",
                        "qty_fl_2": fl2.qty || 0,
                        "item_ppa_1": ad1.item_code || "",
                        "qty_ppa_1": ad1.qty || 0,
                        "item_anti_1": ad2.item_code || "",
                        "qty_anti_1": ad2.qty || 0,
                        "mb_item_1": (mb_rows[0] && mb_rows[0].item_code) || "",
                        "qty_mb_1": parseFloat(v.qty_mb) || 0,
                        "recipe_payload": JSON.stringify({
                            pp_rows,
                            fl_rows,
                            ad_rows,
                            mb_rows,
                            mb_ldr: parseFloat(v.qty_mb) || 0
                        })
                    }
                });
                console.log("create_smart_bom response", r);
                if (r.message && !r.message.startsWith("Error")) {
                    // Update ALL rows with the same item code
                    frm.doc.po_items.forEach(r_item => {
                        if (r_item.item_code === row.item_code) {
                            frappe.model.set_value(r_item.doctype, r_item.name, 'bom_no', r.message);
                            frappe.model.set_value(r_item.doctype, r_item.name, 'custom_quality', v.quality);
                        }
                    });
                    if (frm.fields_dict && frm.fields_dict.consider_projected_qty) {
                        frm.set_value('consider_projected_qty', 0);
                    }
                    frm.clear_table('mr_items'); await frm.save();
                    setTimeout(() => frm.trigger('get_raw_materials'), 500); d.hide();
                } else {
                    frappe.msgprint({
                        title: "BOM creation failed",
                        message: r.message || "No response message from server.",
                        indicator: "red"
                    });
                }
            }
        });

        d.show();
        d.set_df_property('item_pp', 'options', pp_opts);
        d.set_df_property('item_fl', 'options', fl_opts);
        
        if (!d.get_value('item_pp')) d.set_value('item_pp', sel_pp[0] || pp_opts[0] || '');
        if (!d.get_value('item_fl')) d.set_value('item_fl', sel_fl[0] || fl_opts[0] || '');
        if (!d.get_value('item_ad1')) d.set_value('item_ad1', sel_sa[0] || categorized.sa[0] || '');
        if (!d.get_value('item_ad2')) d.set_value('item_ad2', sel_sa[1] || categorized.sa[1] || categorized.sa[0] || '');

        // Use event delegation for all buttons and inputs
        let pp_rows_visible = 1;
        let fl_rows_visible = 1;
        let ad_rows_visible = 2;

        d.$wrapper.on('click', '#add_pp_btn', function () {
            if (pp_rows_visible >= 4) return;
            pp_rows_visible += 1;
            let itemField = `item_pp${pp_rows_visible === 1 ? '' : pp_rows_visible}`;
            let qtyField = `qty_pp${pp_rows_visible === 1 ? '' : pp_rows_visible}`;
            let selected = ['item_pp', 'item_pp2', 'item_pp3', 'item_pp4'].map(f => d.get_value(f));
            d.set_df_property(itemField, 'hidden', 0);
            d.set_df_property(qtyField, 'hidden', 0);
            d.set_value(itemField, getNextPriorityOption(pp_opts, selected));
            d.set_value(qtyField, 0);
            d.$wrapper.find('#rem_pp_btn').show();
        });

        d.$wrapper.on('click', '#rem_pp_btn', function () {
            if (pp_rows_visible <= 1) return;
            let itemField = `item_pp${pp_rows_visible === 1 ? '' : pp_rows_visible}`;
            let qtyField = `qty_pp${pp_rows_visible === 1 ? '' : pp_rows_visible}`;
            d.set_df_property(itemField, 'hidden', 1);
            d.set_df_property(qtyField, 'hidden', 1);
            d.set_value(itemField, '');
            d.set_value(qtyField, 0);
            pp_rows_visible -= 1;
            if (pp_rows_visible <= 1) $(this).hide();
        });

        d.$wrapper.on('click', '#add_fl_btn', function () {
            if (fl_rows_visible >= 4) return;
            fl_rows_visible += 1;
            let itemField = `item_fl${fl_rows_visible === 1 ? '' : fl_rows_visible}`;
            let qtyField = `qty_fl${fl_rows_visible === 1 ? '' : fl_rows_visible}`;
            let selected = ['item_fl', 'item_fl2', 'item_fl3', 'item_fl4'].map(f => d.get_value(f));
            d.set_df_property(itemField, 'hidden', 0);
            d.set_df_property(qtyField, 'hidden', 0);
            d.set_value(itemField, getNextPriorityOption(fl_opts, selected));
            d.set_value(qtyField, 0);
            d.$wrapper.find('#rem_fl_btn').show();
        });

        d.$wrapper.on('click', '#rem_fl_btn', function () {
            if (fl_rows_visible <= 1) return;
            let itemField = `item_fl${fl_rows_visible === 1 ? '' : fl_rows_visible}`;
            let qtyField = `qty_fl${fl_rows_visible === 1 ? '' : fl_rows_visible}`;
            d.set_df_property(itemField, 'hidden', 1);
            d.set_df_property(qtyField, 'hidden', 1);
            d.set_value(itemField, '');
            d.set_value(qtyField, 0);
            fl_rows_visible -= 1;
            if (fl_rows_visible <= 1) $(this).hide();
        });

        d.$wrapper.on('click', '#add_ad_btn', function () {
            if (ad_rows_visible >= 4) return;
            ad_rows_visible += 1;
            let itemField = `item_ad${ad_rows_visible}`;
            let qtyField = `qty_ad${ad_rows_visible}`;
            d.set_df_property(itemField, 'hidden', 0);
            d.set_df_property(qtyField, 'hidden', 0);
            d.set_value(itemField, categorized.sa[0] || '');
            d.set_value(qtyField, 0);
            d.$wrapper.find('#rem_ad_btn').show();
        });
        d.$wrapper.on('click', '#rem_ad_btn', function () {
            if (ad_rows_visible <= 2) return;
            let itemField = `item_ad${ad_rows_visible}`;
            let qtyField = `qty_ad${ad_rows_visible}`;
            d.set_df_property(itemField, 'hidden', 1);
            d.set_df_property(qtyField, 'hidden', 1);
            d.set_value(itemField, '');
            d.set_value(qtyField, 0);
            ad_rows_visible -= 1;
            if (ad_rows_visible <= 2) $(this).hide();
        });


        // Auto-expand splits if they existed in BOM
        if (sel_pp.length > 1) { 
            setTimeout(() => { d.$wrapper.find('#add_pp_btn').click(); d.set_value('item_pp2', sel_pp[1]); d.set_value('qty_pp2', def_qty_pp2); }, 100); 
        }
        if (sel_fl.length > 1) { 
            setTimeout(() => { d.$wrapper.find('#add_fl_btn').click(); d.set_value('item_fl2', sel_fl[1]); d.set_value('qty_fl2', def_qty_fl2); }, 100); 
        }

    } catch (e) { console.error(e); frappe.msgprint("Error opening recipe dialog. Check console."); }
}

// ─────────────────────────────────────────────
// BULK RECIPE DIALOG
// ─────────────────────────────────────────────

async function bulk_set_recipes(frm) {
    let all_items = frm.doc.po_items || [];
    if (!all_items.length) return;

    // Unit 1/2/3/4 are standard fabric units: keep the old PP/Filler/Additive/MB flow.
    let items = all_items.filter(r => !isSlittingItem(r, frm) && !isBOPPPrintingItem(r, frm) && !isLaminationItem(r, frm));

    // Only use special flows when there are no standard fabric rows in this plan.
    if (!items.length) {
        let slit_rows = all_items.filter(r => isSlittingItem(r, frm));
        let remaining = all_items.filter(r => !isSlittingItem(r, frm));

        if (slit_rows.length > 0) {
            frappe.show_alert({ message: `Processing ${slit_rows.length} Slitting row(s)…`, indicator: 'blue' });
            for (let r of slit_rows) {
                await assign_slitting_bom(frm, r);
            }
        }

        if (!remaining.length) return;

        let bopp_rows = remaining.filter(r => isBOPPPrintingItem(r, frm));
        remaining = remaining.filter(r => !isBOPPPrintingItem(r, frm));

        if (bopp_rows.length > 0) {
            for (let r of bopp_rows) {
                await open_bopp_printing_dialog(frm, r, frm.doc.po_items.indexOf(r));
            }
            if (!remaining.length) return;
        }

        let lam_rows = remaining.filter(r => isLaminationItem(r, frm));
        if (lam_rows.length > 0) {
            bulk_lamination_dialog(frm, lam_rows);
            return;
        }

        items = remaining;
        if (!items.length) return;
    }

    // ── Standard path (unchanged) ────────────────────────────────────────
    try {
        if (!all_q_cache.length) {
            let q_res = await frappe.call({ method: "frappe.client.get_list", args: { doctype: "Quality Master", fields: ["quality_name", "name"], limit_page_length: 1000 } });
            all_q_cache = (q_res.message || []).map(d => d.quality_name || d.name);
        }
        let all_q = all_q_cache;
        // Force refresh so master changes (e.g. filler updates) show immediately
        await refreshItemCache(true);

        let r1 = items[0], def_q = await detectQuality(r1, all_q) || "BRONZE";
        let r1_gsm = r1.custom_gsm || r1.gsm || 0;
        let premium_mode = isPremiumQuality(def_q);
        
        let is_printing = (r1.item_code || "").startsWith("105");
        let is_rice_bag = 0;
        let customer = frm.doc.custom_party_code || frm.doc.customer;
        if (customer) {
            try {
                let cr = await frappe.db.get_value("Customer", customer, "custom_is_rice_bag_manufacturer");
                if (cr && cr.message) is_rice_bag = cr.message.custom_is_rice_bag_manufacturer ? 1 : 0;
            } catch(e) {}
        }

        // Fetch KGs for default quality upfront
        let def_kgs_res = await frappe.db.get_value("Quality Master", { quality_name: def_q }, ["pp_kgs", "filler_kgs", "ppa_kgs", "antistatic_kgs"]);
        let def_kgs = def_kgs_res?.message || { pp_kgs: 0, filler_kgs: 0, ppa_kgs: 0, antistatic_kgs: 0 };

        // MB fetching for template item
        let r1_color = r1.custom_color || "";
        let t_mb = "", t_ldr = 0;
        if (r1_color) {
            let tcm = await frappe.db.get_value("Colour Master", r1_color, ["item_code", "masterbatch_ldr_"]);
            if (tcm?.message) {
                t_mb = tcm.message.item_code || t_mb;
                t_ldr = tcm.message.masterbatch_ldr_ || t_ldr;
            }
        }

        // Check if first item has BOM to pre-fill
        let existing_data = null;
        if (r1.bom_no) {
            try {
                let r = await frappe.call({ method: "frappe.client.get", args: { doctype: "BOM", name: r1.bom_no }});
                existing_data = r.message;
            } catch (e) { console.log(e); }
        }

        let sel_pp = [], sel_fl = [], sel_sa = [], sel_mb_ic = t_mb, sel_ldr = t_ldr;
        let pp_rats = [], fl_rats = [];
        if (existing_data && existing_data.items) {
            let tot_pp = 0, tot_fl = 0, temp_pp = [], temp_fl = [], unassigned_dana = [];
            existing_data.items.forEach(it => {
                let name = item_code_to_name[it.item_code] || it.item_code;
                let ic_u = it.item_code.toUpperCase(), name_u = name.toUpperCase();
                let is_dana = name_u.includes("DANA");
                
                if ((ic_u.startsWith("PP") || ic_u.startsWith("1002")) && !is_dana) {
                    temp_pp.push({it: it, name: name}); tot_pp += it.qty;
                } else if ((ic_u.startsWith("FL") || ic_u.startsWith("1003")) && !is_dana) {
                    temp_fl.push({it: it, name: name}); tot_fl += it.qty;
                } else if (is_dana) {
                    unassigned_dana.push({it: it, name: name});
                } else if (categorized.sa.includes(name)) {
                    sel_sa.push(name);
                } else {
                    if (categorized.pp.includes(name) && !categorized.fl.includes(name)) {
                        temp_pp.push({it: it, name: name}); tot_pp += it.qty;
                    } else if (categorized.fl.includes(name) && !categorized.pp.includes(name)) {
                        temp_fl.push({it: it, name: name}); tot_fl += it.qty;
                    }
                }
            });

            for (let d of unassigned_dana) {
                if (temp_pp.length === 0) { temp_pp.push(d); tot_pp += d.it.qty; }
                else if (temp_fl.length === 0) { temp_fl.push(d); tot_fl += d.it.qty; }
                else if (temp_pp.length < 2) { temp_pp.push(d); tot_pp += d.it.qty; }
                else { temp_fl.push(d); tot_fl += d.it.qty; }
            }

            temp_pp.forEach(d => { sel_pp.push(d.name); pp_rats.push(tot_pp ? (d.it.qty / tot_pp) : 0); });
            temp_fl.forEach(d => { sel_fl.push(d.name); fl_rats.push(tot_fl ? (d.it.qty / tot_fl) : 0); });
        }

        let pp_opts = getFilteredPP(def_q, r1_gsm);
        let fl_opts = premium_mode ? [] : getFilteredFiller(def_q, is_printing, is_rice_bag);
        let orig_pp_kgs = def_kgs.pp_kgs;
        let orig_fl_kgs = def_kgs.filler_kgs;

        let def_qty_pp = def_kgs.pp_kgs, def_qty_pp2 = 0;
        if (sel_pp.length > 0) { def_qty_pp = parseFloat((def_kgs.pp_kgs * pp_rats[0]).toFixed(3)); if (sel_pp.length > 1) def_qty_pp2 = parseFloat((def_kgs.pp_kgs * pp_rats[1]).toFixed(3)); }
        
        let def_qty_fl = premium_mode ? 0 : def_kgs.filler_kgs, def_qty_fl2 = 0;
        if (sel_fl.length > 0) { def_qty_fl = parseFloat((def_kgs.filler_kgs * fl_rats[0]).toFixed(3)); if (sel_fl.length > 1) def_qty_fl2 = parseFloat((def_kgs.filler_kgs * fl_rats[1]).toFixed(3)); }

        let d = new frappe.ui.Dialog({
            title: "🚀 Bulk Recipe Template",
            fields: [
                { label: 'Template Quality', fieldname: 'quality', fieldtype: 'Select', options: all_q, default: def_q,
                    onchange: async () => {
                        let nq = d.get_value('quality');
                        let is_prem = isPremiumQuality(nq);
                        let qm = await frappe.db.get_value("Quality Master", { quality_name: nq }, ["pp_kgs", "filler_kgs", "ppa_kgs", "antistatic_kgs"]);
                        if (qm?.message) {
                            orig_pp_kgs = qm.message.pp_kgs;
                            orig_fl_kgs = qm.message.filler_kgs;
                            d.set_values({ qty_pp: qm.message.pp_kgs, qty_fl: is_prem ? 0 : qm.message.filler_kgs, qty_ad1: qm.message.ppa_kgs, qty_ad2: qm.message.antistatic_kgs });
                            let new_pp = getFilteredPP(nq, r1_gsm);
                            let new_fl = is_prem ? [] : getFilteredFiller(nq, is_printing, is_rice_bag);
                            d.set_df_property('pp_item', 'options', new_pp); d.set_value('pp_item', new_pp[0] || '');
                            d.set_df_property('pp_item2', 'options', new_pp.slice(1));
                            if (d.get_value('pp_item2')) d.set_value('pp_item2', new_pp.slice(1)[0] || '');
                            d.set_df_property('fl_item', 'options', new_fl);
                            d.set_df_property('fl_item', 'reqd', is_prem ? 0 : 1);
                            d.set_value('fl_item', is_prem ? '' : (new_fl[0] || ''));
                            d.set_df_property('fl_item2', 'options', new_fl.slice(1));
                            if (is_prem) {
                                d.set_value('fl_item2', '');
                                d.set_value('qty_fl2', 0);
                                d.set_value('qty_fl', 0);
                            } else {
                                if (d.get_value('fl_item2')) d.set_value('fl_item2', new_fl.slice(1)[0] || '');
                            }
                        }
                    }
                },
                { fieldtype: 'Section Break', label: '🧪 PP' },
                { label: 'PP Item', fieldname: 'pp_item', fieldtype: 'Autocomplete', options: pp_opts, reqd: 1, default: sel_pp[0] || pp_opts[0] || '' },
                { label: 'PP KGs', fieldname: 'qty_pp', fieldtype: 'Float', default: def_qty_pp, reqd: 1 },
                { fieldtype: 'HTML', fieldname: 'add_pp_html', options: `
                    <div style="margin:4px 0 8px; display: flex; gap: 8px;">
                        <button class="btn btn-xs btn-default" id="bulk_add_pp_btn">＋ Add PP Row</button>
                        <button class="btn btn-xs btn-outline-danger" id="bulk_rem_pp_btn" style="display:none;">🗑 Remove PP Row</button>
                    </div>` 
                },
                { label: 'PP Item 2', fieldname: 'pp_item2', fieldtype: 'Autocomplete', options: pp_opts.slice(1), hidden: 1 },
                { label: 'PP KGs 2', fieldname: 'qty_pp2', fieldtype: 'Float', hidden: 1 },
                { label: 'PP Item 3', fieldname: 'pp_item3', fieldtype: 'Autocomplete', options: pp_opts.slice(2), hidden: 1 },
                { label: 'PP KGs 3', fieldname: 'qty_pp3', fieldtype: 'Float', hidden: 1 },
                { label: 'PP Item 4', fieldname: 'pp_item4', fieldtype: 'Autocomplete', options: pp_opts.slice(3), hidden: 1 },
                { label: 'PP KGs 4', fieldname: 'qty_pp4', fieldtype: 'Float', hidden: 1 },
                { fieldtype: 'Section Break', label: '🪨 Filler' },
                { label: 'Filler Item', fieldname: 'fl_item', fieldtype: 'Autocomplete', options: fl_opts, reqd: premium_mode ? 0 : 1, default: premium_mode ? '' : (sel_fl[0] || fl_opts[0] || '') },
                { label: 'Filler KGs', fieldname: 'qty_fl', fieldtype: 'Float', default: def_qty_fl, reqd: premium_mode ? 0 : 1 },
                { fieldtype: 'HTML', fieldname: 'add_fl_html', options: `
                    <div style="margin:4px 0 8px; display: flex; gap: 8px;">
                        <button class="btn btn-xs btn-default" id="bulk_add_fl_btn">＋ Add Filler Row</button>
                        <button class="btn btn-xs btn-outline-danger" id="bulk_rem_fl_btn" style="display:none;">🗑 Remove Filler Row</button>
                    </div>` 
                },
                { label: 'Filler Item 2', fieldname: 'fl_item2', fieldtype: 'Autocomplete', options: fl_opts.slice(1), hidden: 1 },
                { label: 'Filler KGs 2', fieldname: 'qty_fl2', fieldtype: 'Float', hidden: 1 },
                { label: 'Filler Item 3', fieldname: 'fl_item3', fieldtype: 'Autocomplete', options: fl_opts.slice(2), hidden: 1 },
                { label: 'Filler KGs 3', fieldname: 'qty_fl3', fieldtype: 'Float', hidden: 1 },
                { label: 'Filler Item 4', fieldname: 'fl_item4', fieldtype: 'Autocomplete', options: fl_opts.slice(3), hidden: 1 },
                { label: 'Filler KGs 4', fieldname: 'qty_fl4', fieldtype: 'Float', hidden: 1 },
                { fieldtype: 'Section Break', label: '⚗️ Additives' },
                { label: 'Additive Item 1', fieldname: 'ad_item1', fieldtype: 'Autocomplete', options: categorized.sa, default: sel_sa[0] || categorized.sa[0] || '' },
                { label: 'Additive KGs 1', fieldname: 'qty_ad1', fieldtype: 'Float', default: def_kgs.ppa_kgs },
                { label: 'Additive Item 2', fieldname: 'ad_item2', fieldtype: 'Autocomplete', options: categorized.sa, default: sel_sa[1] || categorized.sa[1] || categorized.sa[0] || '' },
                { label: 'Additive KGs 2', fieldname: 'qty_ad2', fieldtype: 'Float', default: def_kgs.antistatic_kgs },
                { fieldtype: 'HTML', fieldname: 'add_ad_html', options: `
                    <div style="margin:4px 0 8px; display: flex; gap: 8px;">
                        <button class="btn btn-xs btn-default" id="bulk_add_ad_btn">＋ Add Additive Row</button>
                        <button class="btn btn-xs btn-outline-danger" id="bulk_rem_ad_btn" style="display:none;">🗑 Remove Additive Row</button>
                    </div>` 
                },
                { label: 'Additive Item 3', fieldname: 'ad_item3', fieldtype: 'Autocomplete', options: categorized.sa, hidden: 1 },
                { label: 'Additive KGs 3', fieldname: 'qty_ad3', fieldtype: 'Float', hidden: 1 },
                { label: 'Additive Item 4', fieldname: 'ad_item4', fieldtype: 'Autocomplete', options: categorized.sa, hidden: 1 },
                { label: 'Additive KGs 4', fieldname: 'qty_ad4', fieldtype: 'Float', hidden: 1 },
                { fieldtype: 'Section Break', label: '🎨 Masterbatch' },
                { label: 'MB Item', fieldname: 'mb_item', fieldtype: 'Autocomplete', options: categorized.mb, default: item_code_to_name[sel_mb_ic] || sel_mb_ic, reqd: 1,
                    onchange: async () => {
                        let mb_name = d.get_value('mb_item');
                        let mb_code = item_name_to_code[mb_name] || mb_name;
                        if (mb_code) {
                            let res = await frappe.db.get_value("Colour Master", { "item_code": mb_code }, "masterbatch_ldr_");
                            if (res && res.message && res.message.masterbatch_ldr_ !== undefined) {
                                d.set_value('qty_ldr', res.message.masterbatch_ldr_);
                            }
                        }
                    }
                },
                { label: 'MB LDR %', fieldname: 'qty_ldr', fieldtype: 'Float', default: sel_ldr, reqd: 1 }
            ],
            primary_action_label: 'Apply to All',
            primary_action: async (v) => {
                const pp_rows = collectRows(d, ['pp_item', 'pp_item2', 'pp_item3', 'pp_item4'], ['qty_pp', 'qty_pp2', 'qty_pp3', 'qty_pp4']);
                const fl_rows = collectRows(d, ['fl_item', 'fl_item2', 'fl_item3', 'fl_item4'], ['qty_fl', 'qty_fl2', 'qty_fl3', 'qty_fl4']);
                const ad_rows = collectRows(d, ['ad_item1', 'ad_item2', 'ad_item3', 'ad_item4'], ['qty_ad1', 'qty_ad2', 'qty_ad3', 'qty_ad4']);
                const mb_rows = [{ item_code: resolveItemCodeAny(v.mb_item), share: 1 }];
                const pp1 = pp_rows[0] || {}, pp2 = pp_rows[1] || {};
                const fl1 = fl_rows[0] || {}, fl2 = fl_rows[1] || {};
                const ad1 = ad_rows[0] || {}, ad2 = ad_rows[1] || {};
                if (!pp_rows.length || (!fl_rows.length && !isPremiumQuality(v.quality))) {
                    frappe.msgprint("At least one PP and one Filler row are required.");
                    return;
                }

                d.hide(); frappe.show_alert({ message: "Applying recipes to all items…", indicator: 'blue' });
                for (let row of items) {
                    console.log("Apply to All row", {
                        item_code: row.item_code,
                        pp_rows,
                        fl_rows,
                        ad_rows,
                        mb_rows,
                        mb_ldr: parseFloat(v.qty_ldr) || 0,
                        force_new: 0,
                        version: SMART_BOM_CLIENT_VERSION
                    });
                    let resp = await frappe.call({
                        method: "create_smart_bom",
                        args: {
                            "production_plan": frm.doc.name, "item_code": row.item_code, "po_item_index": items.indexOf(row),
                            "quality": v.quality,
                            "force_new": 0,
                            // Legacy fallback args for server-side fail-safe path
                            "item_pp_1": pp1.item_code || "",
                            "qty_pp_1": pp1.qty || 0,
                            "item_pp_2": pp2.item_code || "",
                            "qty_pp_2": pp2.qty || 0,
                            "item_fl_1": fl1.item_code || "",
                            "qty_fl_1": fl1.qty || 0,
                            "item_fl_2": fl2.item_code || "",
                            "qty_fl_2": fl2.qty || 0,
                            "item_ppa_1": ad1.item_code || "",
                            "qty_ppa_1": ad1.qty || 0,
                            "item_anti_1": ad2.item_code || "",
                            "qty_anti_1": ad2.qty || 0,
                            "mb_item_1": (mb_rows[0] && mb_rows[0].item_code) || "",
                            "qty_mb_1": parseFloat(v.qty_ldr) || 0,
                            "recipe_payload": JSON.stringify({
                                pp_rows,
                                fl_rows,
                                ad_rows,
                                mb_rows,
                                mb_ldr: parseFloat(v.qty_ldr) || 0
                            })
                        }
                    });
                    console.log("create_smart_bom response", resp);
                    if (!resp.message) {
                        throw new Error("No response message from server.");
                    }
                    if (resp.message.startsWith("Error")) {
                        throw new Error(resp.message);
                    }
                    frappe.model.set_value(row.doctype, row.name, 'bom_no', resp.message);
                    frappe.model.set_value(row.doctype, row.name, 'custom_quality', v.quality);
                }
                if (frm.fields_dict && frm.fields_dict.consider_projected_qty) {
                    frm.set_value('consider_projected_qty', 0);
                }
                frm.clear_table('mr_items'); await frm.save();
                setTimeout(() => frm.trigger('get_raw_materials'), 500);
                frappe.show_alert({ message: "All recipes applied ✔", indicator: 'green' });
            }
        });

        d.show();
        d.set_df_property('pp_item', 'options', pp_opts); 
        d.set_df_property('fl_item', 'options', fl_opts);
        
        if (!d.get_value('pp_item')) d.set_value('pp_item', sel_pp[0] || pp_opts[0] || '');
        if (!d.get_value('fl_item')) d.set_value('fl_item', sel_fl[0] || fl_opts[0] || '');
        if (!d.get_value('ad_item1')) d.set_value('ad_item1', sel_sa[0] || categorized.sa[0] || '');
        if (!d.get_value('ad_item2')) d.set_value('ad_item2', sel_sa[1] || categorized.sa[1] || categorized.sa[0] || '');

        // Event delegation for bulk
        let bulk_pp_rows_visible = 1;
        let bulk_fl_rows_visible = 1;
        let bulk_ad_rows_visible = 2;

        d.$wrapper.on('click', '#bulk_add_pp_btn', function () {
            if (bulk_pp_rows_visible >= 4) return;
            bulk_pp_rows_visible += 1;
            let itemField = `pp_item${bulk_pp_rows_visible === 1 ? '' : bulk_pp_rows_visible}`;
            let qtyField = `qty_pp${bulk_pp_rows_visible === 1 ? '' : bulk_pp_rows_visible}`;
            let selected = ['pp_item', 'pp_item2', 'pp_item3', 'pp_item4'].map(f => d.get_value(f));
            d.set_df_property(itemField, 'hidden', 0);
            d.set_df_property(qtyField, 'hidden', 0);
            d.set_value(itemField, getNextPriorityOption(pp_opts, selected));
            d.set_value(qtyField, 0);
            d.$wrapper.find('#bulk_rem_pp_btn').show();
        });

        d.$wrapper.on('click', '#bulk_rem_pp_btn', function () {
            if (bulk_pp_rows_visible <= 1) return;
            let itemField = `pp_item${bulk_pp_rows_visible === 1 ? '' : bulk_pp_rows_visible}`;
            let qtyField = `qty_pp${bulk_pp_rows_visible === 1 ? '' : bulk_pp_rows_visible}`;
            d.set_df_property(itemField, 'hidden', 1);
            d.set_df_property(qtyField, 'hidden', 1);
            d.set_value(itemField, '');
            d.set_value(qtyField, 0);
            bulk_pp_rows_visible -= 1;
            if (bulk_pp_rows_visible <= 1) $(this).hide();
        });

        d.$wrapper.on('click', '#bulk_add_fl_btn', function () {
            if (bulk_fl_rows_visible >= 4) return;
            bulk_fl_rows_visible += 1;
            let itemField = `fl_item${bulk_fl_rows_visible === 1 ? '' : bulk_fl_rows_visible}`;
            let qtyField = `qty_fl${bulk_fl_rows_visible === 1 ? '' : bulk_fl_rows_visible}`;
            let selected = ['fl_item', 'fl_item2', 'fl_item3', 'fl_item4'].map(f => d.get_value(f));
            d.set_df_property(itemField, 'hidden', 0);
            d.set_df_property(qtyField, 'hidden', 0);
            d.set_value(itemField, getNextPriorityOption(fl_opts, selected));
            d.set_value(qtyField, 0);
            d.$wrapper.find('#bulk_rem_fl_btn').show();
        });

        d.$wrapper.on('click', '#bulk_rem_fl_btn', function () {
            if (bulk_fl_rows_visible <= 1) return;
            let itemField = `fl_item${bulk_fl_rows_visible === 1 ? '' : bulk_fl_rows_visible}`;
            let qtyField = `qty_fl${bulk_fl_rows_visible === 1 ? '' : bulk_fl_rows_visible}`;
            d.set_df_property(itemField, 'hidden', 1);
            d.set_df_property(qtyField, 'hidden', 1);
            d.set_value(itemField, '');
            d.set_value(qtyField, 0);
            bulk_fl_rows_visible -= 1;
            if (bulk_fl_rows_visible <= 1) $(this).hide();
        });

        d.$wrapper.on('click', '#bulk_add_ad_btn', function () {
            if (bulk_ad_rows_visible >= 4) return;
            bulk_ad_rows_visible += 1;
            let itemField = `ad_item${bulk_ad_rows_visible}`;
            let qtyField = `qty_ad${bulk_ad_rows_visible}`;
            d.set_df_property(itemField, 'hidden', 0);
            d.set_df_property(qtyField, 'hidden', 0);
            d.set_value(itemField, categorized.sa[0] || '');
            d.set_value(qtyField, 0);
            d.$wrapper.find('#bulk_rem_ad_btn').show();
        });
        d.$wrapper.on('click', '#bulk_rem_ad_btn', function () {
            if (bulk_ad_rows_visible <= 2) return;
            let itemField = `ad_item${bulk_ad_rows_visible}`;
            let qtyField = `qty_ad${bulk_ad_rows_visible}`;
            d.set_df_property(itemField, 'hidden', 1);
            d.set_df_property(qtyField, 'hidden', 1);
            d.set_value(itemField, '');
            d.set_value(qtyField, 0);
            bulk_ad_rows_visible -= 1;
            if (bulk_ad_rows_visible <= 2) $(this).hide();
        });


        // Auto-expand splits if they existed in BOM
        if (sel_pp.length > 1) { 
            setTimeout(() => { d.$wrapper.find('#bulk_add_pp_btn').click(); d.set_value('pp_item2', sel_pp[1]); d.set_value('qty_pp2', def_qty_pp2); }, 100); 
        }
        if (sel_fl.length > 1) { 
            setTimeout(() => { d.$wrapper.find('#bulk_add_fl_btn').click(); d.set_value('fl_item2', sel_fl[1]); d.set_value('qty_fl2', def_qty_fl2); }, 100); 
        }

    } catch (e) { console.error(e); frappe.msgprint("Error opening bulk recipe dialog."); }
}

// ─────────────────────────────────────────────
// CACHE
// ─────────────────────────────────────────────

async function refreshItemCache(force = false) {
    if (!force && categorized && categorized.pp && categorized.pp.length > 0) return;
    
    let res = await frappe.call({
        method: "frappe.client.get_list",
        args: {
            doctype: "Item",
            filters: { item_group: ["in", ["Raw Material", "In Process Item", "Sub-assembly", "Consumable", "General", "Products", "Finished Goods"]] },
            fields: ["item_code", "item_name"],
            limit_page_length: 10000
        }
    });
    categorized = { pp: [], fl: [], sa: [], mb: [], fb: [], pb: [] };
    item_name_to_code = {};
    item_code_to_name = {};
    (res.message || []).forEach(d => {
        if (!d || !d.item_code) return;
        let name = d.item_name || d.item_code,
            ic_u = (d.item_code || "").toUpperCase(),
            name_u = (name || "").toUpperCase();
        item_name_to_code[name] = d.item_code;
        // Also map common UI formats to item_code (Autocomplete can return any of these)
        item_name_to_code[d.item_code] = d.item_code;
        if (d.item_name) {
            item_name_to_code[`${d.item_code} - ${d.item_name}`] = d.item_code;
            item_name_to_code[`${d.item_code}-${d.item_name}`] = d.item_code;
        }
        item_code_to_name[d.item_code] = name;
        
        let is_dana = name_u.includes("DANA");
        let is_fb_rule = (ic_u.length >= 15 && (name_u.includes("NON WOVEN") || ic_u.startsWith("100100") || ic_u.startsWith("100101") || ic_u.startsWith("1041")));
        // Printed BOPP items: item_code starts with "PB-" or item_name starts with "PRINTED BOPP"
        let is_pb_rule = ic_u.startsWith("PB-") || name_u.startsWith("PRINTED BOPP");
        let added = false;
        
        if (is_pb_rule) {
            categorized.pb.push(name);
            added = true;
        } else if (is_fb_rule) {
            categorized.fb.push(name);
            added = true;
        }
        
        if (!added && (ic_u.startsWith("PP") || ic_u.startsWith("1002") || is_dana)) {
            categorized.pp.push(name);
            added = true;
        }
        if (!added && (ic_u.startsWith("FL") || ic_u.startsWith("1003") || is_dana)) {
            categorized.fl.push(name);
            added = true;
        }
        
        if (!added) {
            if (ic_u.startsWith("SA") || ic_u.startsWith("1004") || ic_u.includes("PPA")) categorized.sa.push(name);
            else if (ic_u.startsWith("MB") || ic_u.startsWith("1001")) categorized.mb.push(name);
        }
    });
}
    
// ─────────────────────────────────────────────
// QUALITY DETECTION
// ─────────────────────────────────────────────

async function detectQuality(row, all_q) {
    if (row.custom_quality) return row.custom_quality;          
    let ic = (row.item_code || "").toUpperCase(), name = (row.item_name || "").toUpperCase(), combined = ic + " " + name;
    if (ic.startsWith("100") && ic.length >= 6) {
        let r = await frappe.db.get_value("Quality Master", { quality_code: parseInt(ic.substring(3, 6)) }, ["quality_name", "name"]);
        if (r?.message) return r.message.quality_name || r.message.name;
    }
    for (let q of all_q) if (combined.includes(q.toUpperCase())) return q;
    return null;
}

// ═══════════════════════════════════════════════════════════════════════
// LAMINATION BOM DIALOGS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Collect non-empty item+qty pairs from dialog fields.
 * fields = array of [itemFieldname, qtyFieldname]
 * v = optional values object from primary_action (more reliable than d.get_value)
 */
function collectLamItems(d, fields, v) {
    let result = [];
    for (let [itemF, qtyF] of fields) {
        let val = v && v[itemF] !== undefined ? v[itemF] : d.get_value(itemF);
        let qtyVal = v && v[qtyF] !== undefined ? v[qtyF] : d.get_value(qtyF);
        let ic  = resolveItemCodeAny(val);
        let qty = parseFloat(qtyVal) || 0;
        if (ic && qty > 0) result.push({ item_code: ic, qty });
    }
    return result;
}

// ───────────────────────────────────────────────────────────────────────
// Inner Lamination default mixing ratios (KGs per batch)
// ───────────────────────────────────────────────────────────────────────
const LAM_INNER_DEFAULTS = {
    pp_qty:   25.0,
    ld_qty:    4.0,
    anti_qty:  0.3,
    ppa_qty:   0.1,
    mb_qty:    0.35
};

// ───────────────────────────────────────────────────────────────────────
// Shared: build item option lists for lamination dialogs
// ───────────────────────────────────────────────────────────────────────
function getLamItemOpts() {
    // LD section = items with "LD" OR "DANA" in name (DANA is an LD-type material for lamination)
    // PP section = everything else in categorized.pp
    let ld_opts  = categorized.pp.filter(n => { let u = n.toUpperCase(); return u.includes('LD') || u.includes('DANA'); });
    let pp_opts  = categorized.pp.filter(n => { let u = n.toUpperCase(); return !u.includes('LD') && !u.includes('DANA'); });
    let sa_opts  = categorized.sa;
    let mb_opts  = categorized.mb;
    let fb_opts  = categorized.fb;
    let pb_opts  = categorized.pb; // Printed BOPP items (PB-XXXXX)
    let anti_def = sa_opts.find(n => n.toUpperCase().includes('ANTI') || n.includes('1004002')) || sa_opts[0] || '';
    let ppa_def  = sa_opts.find(n => n.toUpperCase().includes('PPA')  || n.includes('1004001')) || sa_opts[0] || '';
    return { pp_opts, ld_opts, sa_opts, mb_opts, fb_opts, pb_opts, anti_def, ppa_def };
}

// ───────────────────────────────────────────────────────────────────────
// Shared: wire up +/- row buttons for lamination dialogs
// ───────────────────────────────────────────────────────────────────────
function wireLamButtons(d, prefix, opts, { maxRows = 2, startVisible = 1, addId, remId }) {
    let visible = startVisible;
    d.$wrapper.on('click', `#${addId}`, function () {
        if (visible >= maxRows) return;
        visible++;
        d.set_df_property(`${prefix}_item${visible}`, 'hidden', 0);
        d.set_df_property(`${prefix}_qty${visible}`,  'hidden', 0);
        d.set_value(`${prefix}_item${visible}`, opts[visible - 1] || opts[0] || '');
        d.set_value(`${prefix}_qty${visible}`,  0);
        d.$wrapper.find(`#${remId}`).show();
    });
    d.$wrapper.on('click', `#${remId}`, function () {
        if (visible <= startVisible) return;
        d.set_df_property(`${prefix}_item${visible}`, 'hidden', 1);
        d.set_df_property(`${prefix}_qty${visible}`,  'hidden', 1);
        d.set_value(`${prefix}_item${visible}`, '');
        d.set_value(`${prefix}_qty${visible}`,  0);
        visible--;
        if (visible <= startVisible) $(this).hide();
    });
}

function addRemBtns(addId, remId) {
    return `<div style="margin:4px 0 8px;display:flex;gap:8px;">
        <button class="btn btn-xs btn-default" id="${addId}">＋ Add Row</button>
        <button class="btn btn-xs btn-outline-danger" id="${remId}" style="display:none;">🗑 Remove</button>
    </div>`;
}

// ───────────────────────────────────────────────────────────────────────
// Single-row lamination dialog  (triggered from "Set Recipe" per row)
// ───────────────────────────────────────────────────────────────────────
async function open_lamination_dialog(frm, row, index) {
    await refreshItemCache(true);

    let lam_side_val = (row.custom_lamination_side || '').trim();
    let is_bopp_lam = isBOPPLamination(row);
    let { pp_opts, ld_opts, sa_opts, mb_opts, fb_opts, pb_opts, anti_def, ppa_def } = getLamItemOpts();
    const D = LAM_INNER_DEFAULTS;

    // Helper: find name by item code (exact only)
    const getNameByCode = (ic) => item_code_to_name[ic] || null;
    
    // Shared helpers for pre-fill
    // Find the display-name option in opts whose item_code == ic
    const findOpt = (opts, ic) => opts.find(o => (item_name_to_code[o] || o) === ic);
    
    // Find the display-name option in opts whose item_code starts with or includes the partial code
    const findOptPartial = (opts, partial_ic) => {
        return opts.find(o => {
            let code = item_name_to_code[o] || o;
            return code.includes(partial_ic);
        }) || null;
    };

    // Pre-fill strategy:
    // 1. Existing BOM (row.bom_no)         → exact items + qty from the BOM
    // 2. Production Plan mr_items           → item names only, keep default KGs
    // 3. User-provided default codes        → fall back to category first item
    let pre = {
        fb_item:   (row.custom_base_fabric ? getNameByCode(row.custom_base_fabric) || row.custom_base_fabric : null) || findOptPartial(fb_opts, '1041010') || fb_opts[0] || '',
        fb_qty:    100.0,
        pb_item:   (row.custom_printed_bopp ? getNameByCode(row.custom_printed_bopp) || row.custom_printed_bopp : null) || pb_opts[0] || '',  // Printed BOPP item (per-row)
        pb_qty:    0.0,
        pp_item:   findOptPartial(pp_opts, '1002001') || pp_opts[0] || '', 
        pp_qty:    D.pp_qty,
        ld_item:   findOptPartial(ld_opts, '1002010') || ld_opts[0] || '', 
        ld_qty:    D.ld_qty,
        anti_item: findOptPartial(sa_opts, '1004002') || anti_def,          
        anti_qty:  D.anti_qty,
        ppa_item:  findOptPartial(sa_opts, '1004001') || ppa_def,           
        ppa_qty:   D.ppa_qty,
        mb_item:   findOptPartial(mb_opts, '1001001') || mb_opts[0] || '', 
        mb_qty:    D.mb_qty
    };

    // ── Shared helpers for pre-fill ─────────────────────────────────────
    // Classify an item_code into PP / LD / SA (anti or ppa) / MB / PB (Printed BOPP)
    const catItem = (ic) => {
        let iu = (ic || '').toUpperCase();
        let nu = ((item_code_to_name[ic] || ic) + '').toUpperCase();

        // Specific codes provided by user
        let is_ld_code   = iu.includes('1002010');
        let is_pp_code   = iu.includes('1002001');
        let is_ppa_code  = iu.includes('1004001');
        let is_anti_code = iu.includes('1004002');
        let is_mb_code   = iu.includes('1001001');

        // Printed BOPP: item_code starts with PB- or 2- or item name starts with PRINTED BOPP
        let is_pb = iu.startsWith('PB-') || iu.startsWith('2-') || nu.startsWith('PRINTED BOPP');
        // Fabric logic: 15+ digits and starts with known fabric prefixes or has the specific name
        let is_fb = !is_pb && (iu.length >= 15 && (nu.includes('NON WOVEN') || iu.startsWith('100100') || iu.startsWith('100101') || iu.startsWith('1041')));
        let is_ld   = !is_pb && !is_fb && (is_ld_code   || nu.includes('LD')   || nu.includes('DANA'));
        let is_pp   = !is_pb && !is_fb && (is_pp_code  || iu.startsWith('PP') || iu.startsWith('1002')) && !is_ld;
        let is_mb   = !is_pb && !is_fb && (is_mb_code   || iu.startsWith('MB') || iu.startsWith('1001'));
        let is_sa   = !is_pb && !is_fb && (is_ppa_code  || is_anti_code || iu.startsWith('SA') || iu.startsWith('1004') || iu.includes('PPA'));
        let is_anti = is_anti_code || nu.includes('ANTI');

        return { is_pb, is_fb, is_mb, is_sa, is_anti, is_ld, is_pp };
    };
    // Apply one item to pre (item_code ic, optional qty q — pass null to skip qty update)
    const applyItem = (ic, q) => {
        let { is_pb, is_fb, is_mb, is_sa, is_anti, is_ld, is_pp } = catItem(ic);
        if (is_pb) {
            // Printed BOPP item — update pre.pb_item
            let displayName = getNameByCode(ic) || ic;
            pre.pb_item = displayName;
            pre.pb_code = ic;
            if (q !== null) pre.pb_qty = q;
        } else if (is_fb) {
            // Fabric item — update pre.fb_item and record code for row field update
            let displayName = getNameByCode(ic) || ic;
            pre.fb_item = displayName;
            pre.fb_code = ic;
            if (q !== null) pre.fb_qty = q;
        } else if (is_mb) {
            let m = findOpt(mb_opts, ic);
            if (m) { pre.mb_item = m; if (q !== null) pre.mb_qty += q; }
        } else if (is_sa && is_anti) {
            let m = findOpt(sa_opts, ic);
            if (m) { pre.anti_item = m; if (q !== null) pre.anti_qty += q; }
        } else if (is_sa) {
            let m = findOpt(sa_opts, ic);
            if (m) { pre.ppa_item = m; if (q !== null) pre.ppa_qty += q; }
        } else if (is_ld) {
            let m = findOpt(ld_opts, ic);
            if (m) { pre.ld_item = m; if (q !== null) pre.ld_qty += q; }
        } else if (is_pp) {
            let m = findOpt(pp_opts, ic);
            if (m) { pre.pp_item = m; if (q !== null) pre.pp_qty += q; }
        }
    };

    if (row.bom_no) {
        // ── Source 1: existing BOM — use item + qty ─────────────────────
        try {
            let r = await frappe.call({ method: 'frappe.client.get', args: { doctype: 'BOM', name: row.bom_no } });
            console.log('BOM fetch result:', r);
            if (r.message && r.message.items) {
                // Reset qty so BOM values fully replace defaults
                pre.pp_qty = 0; pre.ld_qty = 0; pre.anti_qty = 0; pre.ppa_qty = 0; pre.mb_qty = 0; pre.fb_qty = 0; pre.pb_qty = 0;
                r.message.items.forEach(it => {
                    console.log('BOM item:', it.item_code, '| length:', (it.item_code||'').length, '| name:', it.item_name);
                    applyItem(it.item_code, it.qty);
                });

                // Directly scan for fabric: any item with 15+ digit code OR name containing 'NON WOVEN'
                let fabric_item = r.message.items.find(it => {
                    let ic = (it.item_code || '');
                    let nm = (it.item_name || it.item_code || '').toUpperCase();
                    return ic.length >= 15 || nm.includes('NON WOVEN');
                });
                console.log('Detected fabric item from BOM:', fabric_item);

                if (fabric_item) {
                    pre.fb_item = fabric_item.item_name || fabric_item.item_code;
                    pre.fb_code = fabric_item.item_code;
                    if (fabric_item.qty) pre.fb_qty = fabric_item.qty;
                    // Always update the row field with the fabric found in the BOM
                    frappe.model.set_value(row.doctype, row.name, 'custom_base_fabric', fabric_item.item_code);
                    console.log('Set custom_base_fabric =', fabric_item.item_code);
                }

                // Directly scan for Printed BOPP: item_code starts with 'PB-'
                let pb_item = r.message.items.find(it => (it.item_code || '').toUpperCase().startsWith('PB-'));
                console.log('Detected Printed BOPP from BOM:', pb_item);

                if (pb_item) {
                    pre.pb_item = pb_item.item_name || pb_item.item_code;
                    pre.pb_code = pb_item.item_code;
                    if (pb_item.qty) pre.pb_qty = pb_item.qty;
                    // Save to row field custom_printed_bopp (like custom_base_fabric)
                    frappe.model.set_value(row.doctype, row.name, 'custom_printed_bopp', pb_item.item_code);
                    console.log('Set custom_printed_bopp =', pb_item.item_code);
                }
            }
        } catch(e) { console.error('BOM fetch error:', e); }
    } else if (frm.doc.mr_items && frm.doc.mr_items.length) {
        // ── Source 2: Production Plan raw materials — item name only ─────
        // Filter to this specific row; fall back to all if link is missing
        let mr = frm.doc.mr_items.filter(m => m.production_plan_item === row.name);
        if (!mr.length) mr = frm.doc.mr_items;
        mr.forEach(m => applyItem(m.item_code, null)); // null = keep default KGs
    }

    let d = new frappe.ui.Dialog({
        title: `🏭 Lamination BOM — ${lam_side || 'Set Recipe'}`,
        fields: [
            {
                fieldtype: 'HTML', fieldname: 'lam_info',
                options: `<div style="padding:10px;background:#fff3e0;border-radius:6px;
                           margin-bottom:4px;border-left:4px solid #ff9800;">
                           <b>🏭 ${lam_side || 'Lamination'}</b><br>
                           <span style="color:#555">Item: <b>${row.item_code}</b></span></div>`
            },
            // ── Base Fabric ─────────────────────────────────────────────
            { fieldtype: 'Section Break', label: '🧵 Base Fabric' },
            { label: 'Base Fabric Item', fieldname: 'lam_fb_item', fieldtype: 'Autocomplete', options: fb_opts, default: pre.fb_item, reqd: 1 },
            { label: 'Fabric Weight (KGs)', fieldname: 'lam_fb_qty', fieldtype: 'Float', default: pre.fb_qty, reqd: 1 },

            // ── Printed BOPP (only for BOPP Lamination) ─────────────────
            { fieldtype: 'Section Break', label: '🖨️ Printed BOPP', hidden: is_bopp_lam ? 0 : 1 },
            { label: 'Printed BOPP Item', fieldname: 'lam_pb_item', fieldtype: 'Autocomplete', options: pb_opts, default: pre.pb_item, hidden: is_bopp_lam ? 0 : 1 },
            { label: 'Printed BOPP Weight (KGs)', fieldname: 'lam_pb_qty', fieldtype: 'Float', default: pre.pb_qty, hidden: is_bopp_lam ? 0 : 1 },

            // ── PP ──────────────────────────────────────────────────────
            { fieldtype: 'Section Break', label: '🧪 PP' },
            { label: 'PP Item',  fieldname: 'lam_pp_item',  fieldtype: 'Autocomplete', options: pp_opts, reqd: 1, default: pre.pp_item },
            { label: 'PP KGs',   fieldname: 'lam_pp_qty',   fieldtype: 'Float', reqd: 1, default: pre.pp_qty },
            { fieldtype: 'HTML', fieldname: 'lam_pp_btns',  options: addRemBtns('lam_add_pp', 'lam_rem_pp') },
            { label: 'PP Item 2', fieldname: 'lam_pp_item2', fieldtype: 'Autocomplete', options: pp_opts, hidden: 1 },
            { label: 'PP KGs 2',  fieldname: 'lam_pp_qty2',  fieldtype: 'Float', hidden: 1 },

            // ── LD ──────────────────────────────────────────────────────
            { fieldtype: 'Section Break', label: '🔷 LD / Dana' },
            { label: 'LD Item',  fieldname: 'lam_ld_item',  fieldtype: 'Autocomplete', options: ld_opts, default: pre.ld_item },
            { label: 'LD KGs',   fieldname: 'lam_ld_qty',   fieldtype: 'Float', default: pre.ld_qty },
            { fieldtype: 'HTML', fieldname: 'lam_ld_btns',  options: addRemBtns('lam_add_ld', 'lam_rem_ld') },
            { label: 'LD Item 2', fieldname: 'lam_ld_item2', fieldtype: 'Autocomplete', options: ld_opts, hidden: 0, default: '' },
            { label: 'LD KGs 2',  fieldname: 'lam_ld_qty2',  fieldtype: 'Float', hidden: 0, default: 0 },

            // ── Additives ───────────────────────────────────────────────
            { fieldtype: 'Section Break', label: '⚗️ Additives' },
            { label: 'Antistatic Item', fieldname: 'lam_anti_item', fieldtype: 'Autocomplete', options: sa_opts, default: pre.anti_item },
            { label: 'Antistatic KGs',  fieldname: 'lam_anti_qty',  fieldtype: 'Float', default: pre.anti_qty },
            { label: 'PPA Item',        fieldname: 'lam_ppa_item',  fieldtype: 'Autocomplete', options: sa_opts, default: pre.ppa_item },
            { label: 'PPA KGs',         fieldname: 'lam_ppa_qty',   fieldtype: 'Float', default: pre.ppa_qty },
            { fieldtype: 'HTML', fieldname: 'lam_ad_btns', options: addRemBtns('lam_add_ad', 'lam_rem_ad') },
            { label: 'Additive Item 3', fieldname: 'lam_ad_item3',  fieldtype: 'Autocomplete', options: sa_opts, hidden: 1 },
            { label: 'Additive KGs 3',  fieldname: 'lam_ad_qty3',   fieldtype: 'Float', hidden: 1 },
            { label: 'Additive Item 4', fieldname: 'lam_ad_item4',  fieldtype: 'Autocomplete', options: sa_opts, hidden: 1 },
            { label: 'Additive KGs 4',  fieldname: 'lam_ad_qty4',   fieldtype: 'Float', hidden: 1 },

            // ── Masterbatch ─────────────────────────────────────────────
            { fieldtype: 'Section Break', label: '🎨 Masterbatch' },
            { label: 'MB Item',  fieldname: 'lam_mb_item',  fieldtype: 'Autocomplete', options: mb_opts, default: pre.mb_item },
            { label: 'MB KGs',   fieldname: 'lam_mb_qty',   fieldtype: 'Float', default: pre.mb_qty },
            { fieldtype: 'HTML', fieldname: 'lam_mb_btns',  options: addRemBtns('lam_add_mb', 'lam_rem_mb') },
            { label: 'MB Item 2', fieldname: 'lam_mb_item2', fieldtype: 'Autocomplete', options: mb_opts, hidden: 1 },
            { label: 'MB KGs 2',  fieldname: 'lam_mb_qty2',  fieldtype: 'Float', hidden: 1 },
        ],
        primary_action_label: 'Create BOM',
        primary_action: async (v) => {
            let lam_items = collectLamItems(d, [
                ['lam_fb_item',   'lam_fb_qty'],
                ['lam_pb_item',   'lam_pb_qty'],  // Printed BOPP (only for BOPP Lam)
                ['lam_pp_item',   'lam_pp_qty'],
                ['lam_pp_item2',  'lam_pp_qty2'],
                ['lam_ld_item',   'lam_ld_qty'],
                ['lam_ld_item2',  'lam_ld_qty2'],
                ['lam_anti_item', 'lam_anti_qty'],
                ['lam_ppa_item',  'lam_ppa_qty'],
                ['lam_ad_item3',  'lam_ad_qty3'],
                ['lam_ad_item4',  'lam_ad_qty4'],
                ['lam_mb_item',   'lam_mb_qty'],
                ['lam_mb_item2',  'lam_mb_qty2'],
            ], v);
            
            console.log("Collected lam_items", lam_items);
            
            if (!lam_items || !lam_items.length) { 
                frappe.msgprint('Enter at least one item with a quantity > 0.'); 
                return; 
            }

            let r = await frappe.call({
                method: 'create_lamination_bom',
                args: {
                    item_code: row.item_code,
                    lam_side: lam_side_val,
                    lam_items: JSON.stringify(lam_items),
                    force_new: 0
                }
            });
            console.log("create_lamination_bom response", r);
            if (r.message && !r.message.startsWith('Error')) {
                frm.doc.po_items.forEach(r_item => {
                    if (r_item.item_code === row.item_code) {
                        frappe.model.set_value(r_item.doctype, r_item.name, 'bom_no', r.message);
                    }
                });
                if (frm.fields_dict && frm.fields_dict.consider_projected_qty) frm.set_value('consider_projected_qty', 0);
                frm.clear_table('mr_items');
                await frm.save();
                setTimeout(() => frm.trigger('get_raw_materials'), 500);
                d.hide();
                frappe.show_alert({ message: `✅ Lamination BOM created: ${r.message}`, indicator: 'green' });
            } else {
                frappe.msgprint({ title: 'BOM Creation Failed', message: r.message || 'No response from server.', indicator: 'red' });
            }
        }
    });
    d.show();
    wireLamButtons(d, 'lam_pp', pp_opts, { maxRows: 2, startVisible: 1, addId: 'lam_add_pp', remId: 'lam_rem_pp' });
    wireLamButtons(d, 'lam_ld', ld_opts, { maxRows: 2, startVisible: 2, addId: 'lam_add_ld', remId: 'lam_rem_ld' });
    wireLamButtons(d, 'lam_mb', mb_opts, { maxRows: 2, startVisible: 1, addId: 'lam_add_mb', remId: 'lam_rem_mb' });
    // Additives: starts at 2 visible (anti + ppa), fields 3 & 4 are extra
    let ad_visible = 2;
    d.$wrapper.on('click', '#lam_add_ad', function () {
        if (ad_visible >= 4) return;
        ad_visible++;
        d.set_df_property(`lam_ad_item${ad_visible}`, 'hidden', 0);
        d.set_df_property(`lam_ad_qty${ad_visible}`,  'hidden', 0);
        d.set_value(`lam_ad_item${ad_visible}`, sa_opts[0] || '');
        d.set_value(`lam_ad_qty${ad_visible}`,  0);
        d.$wrapper.find('#lam_rem_ad').show();
    });
    d.$wrapper.on('click', '#lam_rem_ad', function () {
        if (ad_visible <= 2) return;
        d.set_df_property(`lam_ad_item${ad_visible}`, 'hidden', 1);
        d.set_df_property(`lam_ad_qty${ad_visible}`,  'hidden', 1);
        d.set_value(`lam_ad_item${ad_visible}`, '');
        d.set_value(`lam_ad_qty${ad_visible}`,  0);
        ad_visible--;
        if (ad_visible <= 2) $(this).hide();
    });
}

// ───────────────────────────────────────────────────────────────────────
// Bulk lamination dialog  (triggered from "🚀 Change LDR" button)
// Applies one recipe to all lamination rows in the plan.
// ───────────────────────────────────────────────────────────────────────
async function bulk_lamination_dialog(frm, lam_rows) {
    await refreshItemCache(true);

    // ── Auto-populate custom_base_fabric AND custom_printed_bopp from BOM ──────
    frappe.show_alert({ message: 'Fetching item details from BOMs and Plan…', indicator: 'blue' });
    for (let row of lam_rows) {
        // 1. Try from existing BOM first
        if ((!row.custom_base_fabric || !row.custom_printed_bopp) && row.bom_no) {
            try {
                let r = await frappe.call({ method: 'frappe.client.get', args: { doctype: 'BOM', name: row.bom_no } });
                if (r.message && r.message.items) {
                    // Base Fabric
                    if (!row.custom_base_fabric) {
                        let fab = r.message.items.find(it => (it.item_code || '').length >= 15 || (it.item_name || '').toUpperCase().includes('NON WOVEN'));
                        if (fab) {
                            frappe.model.set_value(row.doctype, row.name, 'custom_base_fabric', fab.item_code);
                            row.custom_base_fabric = fab.item_code;
                        }
                    }
                    // Printed BOPP
                    if (!row.custom_printed_bopp) {
                        let pb = r.message.items.find(it => (it.item_code || '').toUpperCase().startsWith('PB-'));
                        if (pb) {
                            frappe.model.set_value(row.doctype, row.name, 'custom_printed_bopp', pb.item_code);
                            row.custom_printed_bopp = pb.item_code;
                        }
                    }
                }
            } catch(e) { console.error('BOM fetch failed for', row.item_code, e); }
        }

        // 2. Try from mr_items (Raw Materials already in Plan) if still missing
        if (!row.custom_base_fabric || !row.custom_printed_bopp) {
            let mr = (frm.doc.mr_items || []).filter(m => m.production_plan_item === row.name);
            if (mr.length) {
                mr.forEach(m => {
                    let ic = (m.item_code || '').toUpperCase();
                    let nm = (m.item_name || '').toUpperCase();
                    // Detect Fabric
                    if (!row.custom_base_fabric && (ic.length >= 15 || nm.includes('NON WOVEN') || ic.startsWith('100100') || ic.startsWith('100101') || ic.startsWith('1041'))) {
                        frappe.model.set_value(row.doctype, row.name, 'custom_base_fabric', m.item_code);
                        row.custom_base_fabric = m.item_code;
                    }
                    // Detect Printed BOPP: starts with PB- or 2- or has specific name
                    if (!row.custom_printed_bopp && (ic.startsWith('PB-') || ic.startsWith('2-') || nm.startsWith('PRINTED BOPP'))) {
                        frappe.model.set_value(row.doctype, row.name, 'custom_printed_bopp', m.item_code);
                        row.custom_printed_bopp = m.item_code;
                    }
                });
            }
        }
    }

    let lam_side_val = (lam_rows[0].custom_lamination_side || '').trim();
    let has_bopp = lam_rows.some(r => isBOPPLamination(r));
    let { pp_opts, ld_opts, sa_opts, mb_opts, fb_opts, pb_opts, anti_def, ppa_def } = getLamItemOpts();
    const D = LAM_INNER_DEFAULTS;

    // Helper: find name by item code (exact only)
    const getNameByCode = (ic) => item_code_to_name[ic] || null;
    
    // Shared helpers for pre-fill
    // Find the display-name option in opts whose item_code starts with or includes the partial code
    const findOptPartial = (opts, partial_ic) => {
        return opts.find(o => {
            let code = item_name_to_code[o] || o;
            return code.includes(partial_ic);
        }) || null;
    };

    let d = new frappe.ui.Dialog({
        title: `🚀 Bulk Lamination Recipe — ${lam_side_val || 'Lamination'}`,
        fields: [
            {
                fieldtype: 'HTML', fieldname: 'blam_info',
                options: `<div style="padding:10px;background:#fff3e0;border-radius:6px;
                           margin-bottom:4px;border-left:4px solid #ff9800;">
                           <b>🏭 ${lam_side_val || 'Lamination'}</b> — applies to
                           <b>${lam_rows.length}</b> row(s)</div>`
            },
            // ── Printed BOPP (only for BOPP Lamination) ─────────────────
            { fieldtype: 'Section Break', label: '🖨️ Printed BOPP', hidden: has_bopp ? 0 : 1 },
            { fieldtype: 'HTML', fieldname: 'blam_pb_help', options: '<div style="color:#666;font-size:12px;margin-bottom:10px;">The Printed BOPP item itself will be picked automatically from each row. Specify the weight ratio here.</div>', hidden: has_bopp ? 0 : 1 },
            { label: 'Printed BOPP Weight (KGs)', fieldname: 'blam_pb_qty', fieldtype: 'Float', default: has_bopp ? 10.0 : 0, hidden: has_bopp ? 0 : 1, reqd: has_bopp ? 1 : 0 },

            // ── PP ──────────────────────────────────────────────────────
            { fieldtype: 'Section Break', label: '🧪 PP' },
            { label: 'PP Item', fieldname: 'blam_pp_item',  fieldtype: 'Autocomplete', options: pp_opts, reqd: 1, default: findOptPartial(pp_opts, '1002001') || pp_opts[0] || '' },
            { label: 'PP KGs', fieldname: 'blam_pp_qty',   fieldtype: 'Float', reqd: 1, default: D.pp_qty },
            { fieldtype: 'HTML', fieldname: 'blam_pp_btns', options: addRemBtns('blam_add_pp', 'blam_rem_pp') },
            { label: 'PP Item 2', fieldname: 'blam_pp_item2', fieldtype: 'Autocomplete', options: pp_opts, hidden: 1 },
            { label: 'PP KGs 2',  fieldname: 'blam_pp_qty2',  fieldtype: 'Float', hidden: 1 },

            // ── LD ──────────────────────────────────────────────────────
            { fieldtype: 'Section Break', label: '🔷 LD / Dana' },
            { label: 'LD Item', fieldname: 'blam_ld_item',  fieldtype: 'Autocomplete', options: ld_opts, default: findOptPartial(ld_opts, '1002010') || ld_opts[0] || '' },
            { label: 'LD KGs', fieldname: 'blam_ld_qty',   fieldtype: 'Float', default: D.ld_qty },
            { fieldtype: 'HTML', fieldname: 'blam_ld_btns', options: addRemBtns('blam_add_ld', 'blam_rem_ld') },
            { label: 'LD Item 2', fieldname: 'blam_ld_item2', fieldtype: 'Autocomplete', options: ld_opts, hidden: 1 },
            { label: 'LD KGs 2',  fieldname: 'blam_ld_qty2',  fieldtype: 'Float', hidden: 1 },

            // ── Additives ───────────────────────────────────────────────
            { fieldtype: 'Section Break', label: '⚗️ Additives' },
            { label: 'Antistatic Item', fieldname: 'blam_anti_item', fieldtype: 'Autocomplete', options: sa_opts, default: findOptPartial(sa_opts, '1004002') || anti_def },
            { label: 'Antistatic KGs',  fieldname: 'blam_anti_qty',  fieldtype: 'Float', default: D.anti_qty },
            { label: 'PPA Item',        fieldname: 'blam_ppa_item',  fieldtype: 'Autocomplete', options: sa_opts, default: findOptPartial(sa_opts, '1004001') || ppa_def },
            { label: 'PPA KGs',         fieldname: 'blam_ppa_qty',   fieldtype: 'Float', default: D.ppa_qty },
            { fieldtype: 'HTML', fieldname: 'blam_ad_btns', options: addRemBtns('blam_add_ad', 'blam_rem_ad') },
            { label: 'Additive Item 3', fieldname: 'blam_ad_item3',  fieldtype: 'Autocomplete', options: sa_opts, hidden: 1 },
            { label: 'Additive KGs 3',  fieldname: 'blam_ad_qty3',   fieldtype: 'Float', hidden: 1 },
            { label: 'Additive Item 4', fieldname: 'blam_ad_item4',  fieldtype: 'Autocomplete', options: sa_opts, hidden: 1 },
            { label: 'Additive KGs 4',  fieldname: 'blam_ad_qty4',   fieldtype: 'Float', hidden: 1 },

            // ── Masterbatch ─────────────────────────────────────────────
            { fieldtype: 'Section Break', label: '🎨 Masterbatch' },
            { label: 'MB Item', fieldname: 'blam_mb_item',  fieldtype: 'Autocomplete', options: mb_opts, default: findOptPartial(mb_opts, '1001001') || mb_opts[0] || '' },
            { label: 'MB KGs', fieldname: 'blam_mb_qty',   fieldtype: 'Float', default: D.mb_qty },
            { fieldtype: 'HTML', fieldname: 'blam_mb_btns', options: addRemBtns('blam_add_mb', 'blam_rem_mb') },
            { label: 'MB Item 2', fieldname: 'blam_mb_item2', fieldtype: 'Autocomplete', options: mb_opts, hidden: 1 },
            { label: 'MB KGs 2',  fieldname: 'blam_mb_qty2',  fieldtype: 'Float', hidden: 1 },
        ],
        primary_action_label: `Apply to All ${lam_rows.length} Row(s)`,
        primary_action: async (v) => {
            let shared_resin_items = collectLamItems(d, [
                ['blam_pp_item',   'blam_pp_qty'],
                ['blam_pp_item2',  'blam_pp_qty2'],
                ['blam_ld_item',   'blam_ld_qty'],
                ['blam_ld_item2',  'blam_ld_qty2'],
                ['blam_anti_item', 'blam_anti_qty'],
                ['blam_ppa_item',  'blam_ppa_qty'],
                ['blam_ad_item3',  'blam_ad_qty3'],
                ['blam_ad_item4',  'blam_ad_qty4'],
                ['blam_mb_item',   'blam_mb_qty'],
                ['blam_mb_item2',  'blam_mb_qty2'],
            ], v);

            if (!shared_resin_items.length) {
                frappe.msgprint('Enter at least one lamination material with a quantity > 0.');
                return;
            }
            
            let fb_qty_shared = 100.0; // Default weight ratio used if not in dialog
            let pb_qty_shared = d.get_value('blam_pb_qty') || 0;

            d.hide();
            frappe.show_alert({ message: 'Applying lamination recipe…', indicator: 'blue' });
            let failed = [];
            for (let row of lam_rows) {
                let row_fb_item = row.custom_base_fabric;
                if (!row_fb_item) {
                    failed.push(`${row.item_code}: Error - No Base Fabric set. Open "Set Recipe" once for this row to fetch it from BOM.`);
                    continue;
                }

                // Convert name to code if needed
                let fb_code = item_name_to_code[row_fb_item] || row_fb_item;

                // Combine row-specific fabric with shared resin items
                let row_lam_items = [...shared_resin_items];
                row_lam_items.unshift({ item_code: fb_code, qty: fb_qty_shared });

                // Add per-row Printed BOPP if this is a BOPP lamination
                let row_is_bopp = isBOPPLamination(row);
                if (row_is_bopp && !row.custom_printed_bopp) {
                    failed.push(`${row.item_code}: Error - BOPP item missing. Could not auto-detect PB- or 2- prefix item.`);
                    continue;
                }

                if (row_is_bopp && pb_qty_shared <= 0) {
                    failed.push(`${row.item_code}: Error - Printed BOPP Weight is 0. Please enter a weight ratio in the dialog.`);
                    continue;
                }

                console.log(`Processing ${row.item_code}: isBOPP=${row_is_bopp}, PB_Item=${row.custom_printed_bopp}, PB_Qty=${pb_qty_shared}`);
                
                if (row_is_bopp && row.custom_printed_bopp && pb_qty_shared > 0) {
                    let pb_code = item_name_to_code[row.custom_printed_bopp] || row.custom_printed_bopp;
                    row_lam_items.splice(1, 0, { item_code: pb_code, qty: pb_qty_shared });
                }
                
                console.log(`Final row_lam_items for ${row.item_code}:`, row_lam_items);

                let resp = await frappe.call({
                    method: 'create_lamination_bom',
                    args: {
                        item_code: row.item_code,
                        lam_side: (row.custom_lamination_side || lam_side_val || '').trim(),
                        lam_items: JSON.stringify(row_lam_items),
                        force_new: 0
                    }
                });
                console.log(`create_lamination_bom bulk for ${row.item_code}`, resp);
                if (resp.message && !resp.message.startsWith('Error')) {
                    frappe.model.set_value(row.doctype, row.name, 'bom_no', resp.message);
                } else {
                    failed.push(`${row.item_code}: ${resp.message || 'no response'}`);
                }
            }
            if (failed.length) frappe.msgprint({ title: 'Some BOMs Failed', message: failed.join('<br>'), indicator: 'red' });
            if (frm.fields_dict && frm.fields_dict.consider_projected_qty) frm.set_value('consider_projected_qty', 0);
            frm.clear_table('mr_items');
            await frm.save();
            setTimeout(() => frm.trigger('get_raw_materials'), 500);
            frappe.show_alert({ message: 'Lamination recipes applied ✔', indicator: 'green' });
        }
    });
    d.show();
    wireLamButtons(d, 'blam_pp', pp_opts, { maxRows: 2, startVisible: 1, addId: 'blam_add_pp', remId: 'blam_rem_pp' });
    wireLamButtons(d, 'blam_ld', ld_opts, { maxRows: 2, startVisible: 1, addId: 'blam_add_ld', remId: 'blam_rem_ld' });
    wireLamButtons(d, 'blam_mb', mb_opts, { maxRows: 2, startVisible: 1, addId: 'blam_add_mb', remId: 'blam_rem_mb' });
    let bad_visible = 2;
    d.$wrapper.on('click', '#blam_add_ad', function () {
        if (bad_visible >= 4) return;
        bad_visible++;
        d.set_df_property(`blam_ad_item${bad_visible}`, 'hidden', 0);
        d.set_df_property(`blam_ad_qty${bad_visible}`,  'hidden', 0);
        d.set_value(`blam_ad_item${bad_visible}`, sa_opts[0] || '');
        d.set_value(`blam_ad_qty${bad_visible}`,  0);
        d.$wrapper.find('#blam_rem_ad').show();
    });
    d.$wrapper.on('click', '#blam_rem_ad', function () {
        if (bad_visible <= 2) return;
        d.set_df_property(`blam_ad_item${bad_visible}`, 'hidden', 1);
        d.set_df_property(`blam_ad_qty${bad_visible}`,  'hidden', 1);
        d.set_value(`blam_ad_item${bad_visible}`, '');
        d.set_value(`blam_ad_qty${bad_visible}`,  0);
        bad_visible--;
        if (bad_visible <= 2) $(this).hide();
    });
}
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SLITTING: Silent auto-assign BOM (no dialog â€” base fabric only)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function assign_slitting_bom(frm, row) {
    await refreshItemCache(true);

    let fab_code = row.custom_base_fabric || null;

    // Source 1: existing BOM
    if (!fab_code && row.bom_no) {
        try {
            let r = await frappe.call({ method: 'frappe.client.get', args: { doctype: 'BOM', name: row.bom_no } });
            if (r.message && r.message.items) {
                let fab = r.message.items.find(it =>
                    (it.item_code || '').length >= 15 || (it.item_name || '').toUpperCase().includes('NON WOVEN')
                );
                if (fab) fab_code = fab.item_code;
            }
        } catch(e) { console.error('Slitting BOM fetch error:', e); }
    }

    // Source 2: mr_items for this row
    if (!fab_code && frm.doc.mr_items && frm.doc.mr_items.length) {
        let mr = frm.doc.mr_items.filter(m => m.production_plan_item === row.name);
        if (!mr.length) mr = frm.doc.mr_items;
        let fab = mr.find(m => (m.item_code || '').length >= 15 || (m.item_name || '').toUpperCase().includes('NON WOVEN'));
        if (fab) fab_code = fab.item_code;
    }

    if (!fab_code) {
        frappe.msgprint({
            title: 'Slitting BOM',
            message: `No base fabric found for <b>${row.item_code}</b>. Please set <b>Base Fabric</b> on this row and try again.`,
            indicator: 'orange'
        });
        return;
    }

    frappe.show_alert({ message: `Creating Slitting BOM for ${row.item_code}…`, indicator: 'blue' });

    try {
        let resp = await frappe.call({
            method: 'create_lamination_bom',
            args: { item_code: row.item_code, lam_side: 'Slitting', lam_items: JSON.stringify([{ item_code: fab_code, qty: 1.0 }]), force_new: 0 }
        });
        if (resp.message && !resp.message.startsWith('Error')) {
            frm.doc.po_items.forEach(r_item => {
                if (r_item.item_code === row.item_code) {
                    frappe.model.set_value(r_item.doctype, r_item.name, 'bom_no', resp.message);
                    frappe.model.set_value(r_item.doctype, r_item.name, 'custom_base_fabric', fab_code);
                }
            });
            if (frm.fields_dict && frm.fields_dict.consider_projected_qty) frm.set_value('consider_projected_qty', 0);
            frm.clear_table('mr_items');
            await frm.save();
            setTimeout(() => frm.trigger('get_raw_materials'), 500);
            frappe.show_alert({ message: `✅ Slitting BOM: ${resp.message}`, indicator: 'green' });
        } else {
            frappe.msgprint({ title: 'Slitting BOM Failed', message: resp.message || 'No server response.', indicator: 'red' });
        }
    } catch(e) {
        frappe.msgprint({ title: 'Slitting BOM Error', message: String(e), indicator: 'red' });
    }
}

// ═══════════════════════════════════════════════════════════════════════
// BOPP PRINTING BOM DIALOG
// 5 mandatory raw materials:
//   1. Plain BOPP Film   (per-item, from assembly table field custom_printed_bopp)
//   2. Ethyl Acetate     CM-5003001 (solvent - default prefilled)
//   3. Toluene           CM-5003002 (solvent - default prefilled)
//   4. Iso Butanyl       CM-5003004 (solvent - default prefilled)
//   5. Ink               (multiple rows, user configurable)
// ═══════════════════════════════════════════════════════════════════════

const BOPP_SOLVENTS = {
    ethyl_acetate: { code: 'CM-5003001', label: 'Ethyl Acetate' },
    toluene:       { code: 'CM-5003002', label: 'Toluene'       },
    iso_butanyl:   { code: 'CM-5003004', label: 'Iso Butanyl'   }
};

async function open_bopp_printing_dialog(frm, row, index) {
    await refreshItemCache(true);

    // ── Resolve Plain BOPP item for this row ──────────────────────────────
    // Priority: custom_printed_bopp field → assembly_items table → pb category
    let bopp_item_code = row.custom_printed_bopp || '';
    let bopp_item_name = item_code_to_name[bopp_item_code] || bopp_item_code;

    // Fallback: try to read from assembly_items child table of the row
    if (!bopp_item_code && frm.doc.po_items) {
        let assem = (row.assembly_items || []);
        if (assem.length) {
            let pb = assem.find(a => {
                let ic = (a.item_code || '').toUpperCase();
                let nm = (a.item_name || '').toUpperCase();
                return ic.startsWith('PB-') || nm.startsWith('PRINTED BOPP') || nm.includes('PLAIN BOPP');
            });
            if (pb) {
                bopp_item_code = pb.item_code;
                bopp_item_name = item_code_to_name[bopp_item_code] || pb.item_name || bopp_item_code;
            }
        }
    }

    // Fallback: first item in pb category
    if (!bopp_item_code && categorized.pb && categorized.pb.length) {
        bopp_item_name = categorized.pb[0];
        bopp_item_code = item_name_to_code[bopp_item_name] || bopp_item_name;
    }

    // ── Build ink item options (everything not pp/fl/sa/mb/fb/pb) ─────────
    // Inks are items whose names contain 'INK' or item code starts with specific range
    let all_items_list = Object.entries(item_code_to_name);
    let ink_opts = all_items_list
        .filter(([code, name]) => name.toUpperCase().includes('INK') || code.toUpperCase().includes('INK'))
        .map(([code, name]) => name);
    // Also add all items as fallback options for the ink autocomplete
    let all_item_names = all_items_list.map(([, name]) => name);

    // Pre-fill ink from existing BOM
    let existing_ink_rows = [];
    if (row.bom_no) {
        try {
            let r = await frappe.call({ method: 'frappe.client.get', args: { doctype: 'BOM', name: row.bom_no } });
            if (r.message && r.message.items) {
                existing_ink_rows = r.message.items.filter(it => {
                    let n = (it.item_name || it.item_code || '').toUpperCase();
                    return n.includes('INK');
                }).map(it => ({ item_code: it.item_code, qty: it.qty }));
                // Also pre-fill bopp if not already set
                if (!bopp_item_code) {
                    let pb_it = r.message.items.find(it => {
                        let ic = (it.item_code || '').toUpperCase();
                        let nm = (it.item_name || '').toUpperCase();
                        return ic.startsWith('PB-') || nm.includes('BOPP');
                    });
                    if (pb_it) {
                        bopp_item_code = pb_it.item_code;
                        bopp_item_name = item_code_to_name[bopp_item_code] || pb_it.item_name || bopp_item_code;
                    }
                }
            }
        } catch(e) { console.error('BOPP BOM prefetch error', e); }
    }

    // ── Build dialog fields ───────────────────────────────────────────────
    let all_pb_opts = categorized.pb && categorized.pb.length ? categorized.pb : all_item_names;

    let fields = [
        { fieldtype: 'HTML', fieldname: 'bopp_info', options: `
            <div style="padding:10px;background:#fff8e6;border-left:4px solid #f0a500;border-radius:6px;margin-bottom:8px;">
                <b>🖨️ BOPP Printing BOM</b> &nbsp;|&nbsp; <b>${row.item_code}</b>
                <br><span style="color:#666;font-size:12px;">Set the Plain BOPP film, solvents, and ink combination for this item.</span>
            </div>`
        },

        // ── Section: BOPP Film ────────────────────────────────────────────
        { fieldtype: 'Section Break', label: '🎞️ Plain BOPP Film' },
        { label: 'Plain BOPP Item', fieldname: 'bopp_item', fieldtype: 'Autocomplete',
          options: all_pb_opts, default: bopp_item_name, reqd: 1,
          description: 'Select the Plain BOPP Film specific to this item (from assembly items)'
        },
        { label: 'BOPP Qty (per unit)', fieldname: 'bopp_qty', fieldtype: 'Float', default: 1.0, reqd: 1 },

        // ── Section: Solvents ─────────────────────────────────────────────
        { fieldtype: 'Section Break', label: '🧪 Solvents' },
        { label: 'Ethyl Acetate', fieldname: 'sol_ea_item', fieldtype: 'Data',
          default: BOPP_SOLVENTS.ethyl_acetate.code, read_only: 1 },
        { label: 'Ethyl Acetate Qty (Kg)', fieldname: 'sol_ea_qty', fieldtype: 'Float', default: 0, reqd: 1 },
        { fieldtype: 'Column Break' },
        { label: 'Toluene', fieldname: 'sol_tol_item', fieldtype: 'Data',
          default: BOPP_SOLVENTS.toluene.code, read_only: 1 },
        { label: 'Toluene Qty (Kg)', fieldname: 'sol_tol_qty', fieldtype: 'Float', default: 0, reqd: 1 },
        { fieldtype: 'Section Break' },
        { label: 'Iso Butanyl', fieldname: 'sol_ib_item', fieldtype: 'Data',
          default: BOPP_SOLVENTS.iso_butanyl.code, read_only: 1 },
        { label: 'Iso Butanyl Qty (Kg)', fieldname: 'sol_ib_qty', fieldtype: 'Float', default: 0, reqd: 1 },

        // ── Section: Inks ─────────────────────────────────────────────────
        { fieldtype: 'Section Break', label: '🎨 Ink(s)' },
        { label: 'Ink Item 1', fieldname: 'ink_item1', fieldtype: 'Autocomplete',
          options: ink_opts.length ? ink_opts : all_item_names,
          default: existing_ink_rows[0] ? (item_code_to_name[existing_ink_rows[0].item_code] || existing_ink_rows[0].item_code) : '',
          reqd: 1
        },
        { label: 'Ink Qty 1 (Kg)', fieldname: 'ink_qty1', fieldtype: 'Float',
          default: existing_ink_rows[0] ? existing_ink_rows[0].qty : 0, reqd: 1 },
        { fieldtype: 'HTML', fieldname: 'add_ink_html', options: `
            <div style="margin:4px 0 8px;display:flex;gap:8px;">
                <button class="btn btn-xs btn-default" id="bopp_add_ink_btn">＋ Add Ink Row</button>
                <button class="btn btn-xs btn-outline-danger" id="bopp_rem_ink_btn" style="display:none;">🗑 Remove Ink Row</button>
            </div>`
        },
        { label: 'Ink Item 2', fieldname: 'ink_item2', fieldtype: 'Autocomplete',
          options: ink_opts.length ? ink_opts : all_item_names,
          default: existing_ink_rows[1] ? (item_code_to_name[existing_ink_rows[1].item_code] || existing_ink_rows[1].item_code) : '',
          hidden: existing_ink_rows.length < 2 ? 1 : 0
        },
        { label: 'Ink Qty 2 (Kg)', fieldname: 'ink_qty2', fieldtype: 'Float',
          default: existing_ink_rows[1] ? existing_ink_rows[1].qty : 0,
          hidden: existing_ink_rows.length < 2 ? 1 : 0
        },
        { label: 'Ink Item 3', fieldname: 'ink_item3', fieldtype: 'Autocomplete',
          options: ink_opts.length ? ink_opts : all_item_names,
          default: existing_ink_rows[2] ? (item_code_to_name[existing_ink_rows[2].item_code] || existing_ink_rows[2].item_code) : '',
          hidden: 1
        },
        { label: 'Ink Qty 3 (Kg)', fieldname: 'ink_qty3', fieldtype: 'Float',
          default: existing_ink_rows[2] ? existing_ink_rows[2].qty : 0, hidden: 1
        },
        { label: 'Ink Item 4', fieldname: 'ink_item4', fieldtype: 'Autocomplete',
          options: ink_opts.length ? ink_opts : all_item_names, hidden: 1
        },
        { label: 'Ink Qty 4 (Kg)', fieldname: 'ink_qty4', fieldtype: 'Float', hidden: 1 }
    ];

    let d = new frappe.ui.Dialog({
        title: `BOPP Printing BOM: ${row.item_code}`,
        fields: fields,
        primary_action_label: 'Create BOM',
        primary_action: async (v) => {
            // ── Collect items ─────────────────────────────────────────────
            let bopp_code = resolveItemCodeAny(v.bopp_item);
            if (!bopp_code) { frappe.msgprint('Please select a Plain BOPP Item.'); return; }

            let bom_items = [
                { item_code: bopp_code, qty: parseFloat(v.bopp_qty) || 1.0 },
                { item_code: BOPP_SOLVENTS.ethyl_acetate.code, qty: parseFloat(v.sol_ea_qty) || 0 },
                { item_code: BOPP_SOLVENTS.toluene.code,       qty: parseFloat(v.sol_tol_qty) || 0 },
                { item_code: BOPP_SOLVENTS.iso_butanyl.code,   qty: parseFloat(v.sol_ib_qty) || 0 }
            ].filter(it => it.qty > 0);

            // Collect ink rows
            let ink_items = [];
            for (let i = 1; i <= 4; i++) {
                let ink_name = v[`ink_item${i}`];
                let ink_qty  = parseFloat(v[`ink_qty${i}`]) || 0;
                if (ink_name && ink_qty > 0) {
                    ink_items.push({ item_code: resolveItemCodeAny(ink_name), qty: ink_qty });
                }
            }
            if (!ink_items.length) { frappe.msgprint('Please add at least one Ink item with a quantity.'); return; }

            bom_items = [...bom_items, ...ink_items];

            // Validate all solvents have qty
            let missing_sol = [];
            if (!parseFloat(v.sol_ea_qty)) missing_sol.push('Ethyl Acetate');
            if (!parseFloat(v.sol_tol_qty)) missing_sol.push('Toluene');
            if (!parseFloat(v.sol_ib_qty)) missing_sol.push('Iso Butanyl');
            if (missing_sol.length) {
                frappe.msgprint(`Please enter quantities for: <b>${missing_sol.join(', ')}</b>`);
                return;
            }

            d.hide();
            frappe.show_alert({ message: `Creating BOPP BOM for ${row.item_code}…`, indicator: 'blue' });

            try {
                let resp = await frappe.call({
                    method: 'create_lamination_bom',
                    args: {
                        item_code: row.item_code,
                        lam_side: 'BOPP Printing',
                        lam_items: JSON.stringify(bom_items),
                        force_new: 0
                    }
                });

                if (resp.message && !resp.message.startsWith('Error')) {
                    frm.doc.po_items.forEach(r_item => {
                        if (r_item.item_code === row.item_code) {
                            frappe.model.set_value(r_item.doctype, r_item.name, 'bom_no', resp.message);
                            frappe.model.set_value(r_item.doctype, r_item.name, 'custom_printed_bopp', bopp_code);
                        }
                    });
                    if (frm.fields_dict && frm.fields_dict.consider_projected_qty) {
                        frm.set_value('consider_projected_qty', 0);
                    }
                    frm.clear_table('mr_items');
                    await frm.save();
                    setTimeout(() => frm.trigger('get_raw_materials'), 500);
                    frappe.show_alert({ message: `✅ BOPP BOM created: ${resp.message}`, indicator: 'green' });
                } else {
                    frappe.msgprint({ title: 'BOPP BOM Failed', message: resp.message || 'No server response.', indicator: 'red' });
                }
            } catch(e) {
                frappe.msgprint({ title: 'BOPP BOM Error', message: String(e), indicator: 'red' });
            }
        }
    });

    d.show();

    // ── Ink row add/remove buttons ────────────────────────────────────────
    let ink_rows_visible = existing_ink_rows.length || 1;
    if (ink_rows_visible > 1) {
        d.$wrapper.find('#bopp_rem_ink_btn').show();
    }

    d.$wrapper.on('click', '#bopp_add_ink_btn', function () {
        if (ink_rows_visible >= 4) return;
        ink_rows_visible++;
        d.set_df_property(`ink_item${ink_rows_visible}`, 'hidden', 0);
        d.set_df_property(`ink_qty${ink_rows_visible}`,  'hidden', 0);
        d.set_value(`ink_item${ink_rows_visible}`, '');
        d.set_value(`ink_qty${ink_rows_visible}`, 0);
        d.$wrapper.find('#bopp_rem_ink_btn').show();
    });

    d.$wrapper.on('click', '#bopp_rem_ink_btn', function () {
        if (ink_rows_visible <= 1) return;
        d.set_df_property(`ink_item${ink_rows_visible}`, 'hidden', 1);
        d.set_df_property(`ink_qty${ink_rows_visible}`,  'hidden', 1);
        d.set_value(`ink_item${ink_rows_visible}`, '');
        d.set_value(`ink_qty${ink_rows_visible}`, 0);
        ink_rows_visible--;
        if (ink_rows_visible <= 1) $(this).hide();
    });
}

