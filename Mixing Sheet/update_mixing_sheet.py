import frappe
import json
from datetime import datetime

# ─────────────────────────────────────────────────────────────
# 1. Fetch Production Plan mixing data
# ─────────────────────────────────────────────────────────────
@frappe.whitelist()
def get_pp_mixing_data(production_plan, spr_name=None):
    """Return mixing ratios, expected raw materials and no-of-mixing counts from the Production Plan."""
    pp = frappe.get_doc("Production Plan", production_plan)

    data = {
        # Ratios for one full mixing
        "pp_ratio":           pp.get("pp_ratio")           or 78,
        "filler_ratio":       pp.get("filler_ratio")       or 52,
        "masterbatch_ratio":  pp.get("masterbatch_ratio")  or 1.6,
        "antistatic_ratio":   pp.get("antistatic_ratio")   or 0.3,
        "ppa_ratio":          pp.get("ppa_ratio")          or 0.5,

        # Ratios for one half mixing
        "half_pp_ratio":          pp.get("half_mixing_pp_ratio")          or 39,
        "half_filler_ratio":      pp.get("half_mixing_filler_ratio")      or 26,
        "half_masterbatch_ratio": pp.get("half_mixing_masterbatch_ratio") or 0.8,
        "half_antistatic_ratio":  pp.get("half_mixing_antistatic_ratio")  or 0.1,
        "half_ppa_ratio":         pp.get("half_mixing_ppa_ratio")         or 0.3,

        # Number of mixings
        "no_of_full_mixing": pp.get("total_no_of_one_mixing_1") or pp.get("no_of_mixing")      or 1,
        "no_of_half_mixing": pp.get("total_no_of_half_mixing_2") or pp.get("no_of_half_mixing") or 1,

        # Expected raw materials recorded in PP (custom fields)
        "pp_item":          pp.get("custom_pp_item")          or "",
        "filler_item":      pp.get("custom_filler_item")      or "",
        "masterbatch_item": pp.get("custom_masterbatch_item") or "",
        "antistatic_item":  pp.get("custom_antistatic_item")  or "",
        "ppa_item":         pp.get("custom_ppa_item")         or "",
    }

    # Also return any saved mixing sheet data from the SPR
    if spr_name:
        raw = frappe.db.get_value("Shaft Production Run", spr_name, "custom_mixing_sheet_data")
        data["existing_mixing_data"] = raw or ""

    return data


# ─────────────────────────────────────────────────────────────
# 2. Save the full mixing sheet JSON to the SPR
# ─────────────────────────────────────────────────────────────
@frappe.whitelist()
def save_mixing_sheet(spr_name, mixing_sheet_json):
    """Persist the mixing sheet (materials + rows) on the Shaft Production Run."""
    frappe.db.set_value(
        "Shaft Production Run", spr_name,
        "custom_mixing_sheet_data", mixing_sheet_json
    )
    frappe.db.commit()
    return "Saved"


# ─────────────────────────────────────────────────────────────
# 3. Record a single-row consumption
# ─────────────────────────────────────────────────────────────
@frappe.whitelist()
def record_mixing_consumption(spr_name, set_index, row_index, state_json=None):
    """Mark one mixing row as consumed by the current user."""
    if state_json:
        data = json.loads(state_json)
    else:
        raw = frappe.db.get_value("Shaft Production Run", spr_name, "custom_mixing_sheet_data")
        if not raw:
            frappe.throw("No mixing sheet data found for this Shaft Production Run. Please save the sheet first.")
        data = json.loads(raw)

    si = int(set_index)
    ri = int(row_index)

    sets = data.get("sets", [])
    if si < len(sets) and ri < len(sets[si].get("rows", [])):
        row = sets[si]["rows"][ri]
        row["consumed"]    = True
        row["consumed_by"] = frappe.session.user
        row["consumed_at"] = frappe.utils.now()

    frappe.db.set_value(
        "Shaft Production Run", spr_name,
        "custom_mixing_sheet_data", json.dumps(data)
    )
    frappe.db.commit()
    return data


# ─────────────────────────────────────────────────────────────
# 4. Update Work Orders with mixing-sheet materials (on submit)
# ─────────────────────────────────────────────────────────────
@frappe.whitelist()
def update_work_order_materials(work_orders=None, materials=None, spr_name=None, item_totals=None):
    """
    Replace raw-material item codes in Work Orders and their draft Stock Entries.
    Can be called in two modes:
    1. spr_name + item_totals: For proportional allocation of actual consumed materials from mixing sheet.
    2. work_orders + materials: For basic prefix-based material code swapping.
    """
    # ── Mode 1: spr_name + item_totals ──────────────────────────────────────
    if spr_name:
        if isinstance(item_totals, str):
            item_totals = json.loads(item_totals)
        else:
            item_totals = item_totals or {}

        spr = frappe.get_doc("Shaft Production Run", spr_name)
        wos = []
        if spr.work_order and spr.work_order not in wos:
            wos.append(spr.work_order)

        # Scan child tables for Work Orders
        for table_field in spr.meta.get_table_fields():
            child_rows = spr.get(table_field.fieldname) or []
            for row in child_rows:
                if row.get("work_order") and row.work_order not in wos:
                    wos.append(row.work_order)
                if row.get("job_id") and row.job_id.startswith("MFG-") and row.job_id not in wos:
                    wos.append(row.job_id)

        # Filter active work orders
        active_wos = []
        for wo_id in wos:
            wo = frappe.get_doc("Work Order", wo_id)
            if wo.status not in ["Completed", "Stopped"]:
                active_wos.append(wo)

        if not active_wos:
            return "No active Work Orders found to update."

        # Extract selected materials mapping from custom_mixing_sheet_data
        extracted_materials = {}
        if spr.custom_mixing_sheet_data:
            try:
                sheet_data = json.loads(spr.custom_mixing_sheet_data)
                for s in sheet_data.get("sets", []):
                    m = s.get("materials") or {}
                    for k, v in m.items():
                        if v:
                            extracted_materials[k] = v
            except Exception:
                pass

        # Fallback/complement from item_totals keys:
        sa_codes = []
        for code in item_totals.keys():
            if code.startswith("PP") and "PP" not in extracted_materials:
                extracted_materials["PP"] = code
            elif code.startswith("FL") and "Filler" not in extracted_materials:
                extracted_materials["Filler"] = code
            elif code.startswith("MB") and "Masterbatch" not in extracted_materials:
                extracted_materials["Masterbatch"] = code
            elif code.startswith("SA"):
                if code not in sa_codes:
                    sa_codes.append(code)
            elif code.startswith("INK") and "Ink" not in extracted_materials:
                extracted_materials["Ink"] = code
            elif "ETHYL" in code.upper() and "EthylAcetate" not in extracted_materials:
                extracted_materials["EthylAcetate"] = code
            elif "TOLUENE" in code.upper() and "Toluene" not in extracted_materials:
                extracted_materials["Toluene"] = code
            elif ("ISO" in code.upper() and "BUT" in code.upper()) and "IsoButanol" not in extracted_materials:
                extracted_materials["IsoButanol"] = code

        if len(sa_codes) >= 1:
            if "Antistatic" not in extracted_materials:
                extracted_materials["Antistatic"] = sa_codes[0]
            if len(sa_codes) >= 2 and "PPA" not in extracted_materials:
                extracted_materials["PPA"] = sa_codes[1]

        # Group Work Order required item rows by category to calculate total original required quantities
        category_rows = {}
        category_total_original = {}

        for wo in active_wos:
            sa_seen = False
            for item in wo.required_items:
                code = item.item_code or ""
                category = None
                if code.startswith("PP -") or (extracted_materials.get("PP") and code == extracted_materials["PP"]):
                    category = "PP"
                elif code.startswith("FL -") or (extracted_materials.get("Filler") and code == extracted_materials["Filler"]):
                    category = "Filler"
                elif code.startswith("MB -") or (extracted_materials.get("Masterbatch") and code == extracted_materials["Masterbatch"]):
                    category = "Masterbatch"
                elif code.startswith("SA -") or (extracted_materials.get("Antistatic") and code == extracted_materials["Antistatic"]) or (extracted_materials.get("PPA") and code == extracted_materials["PPA"]):
                    if not sa_seen:
                        category = "Antistatic"
                        sa_seen = True
                    else:
                        category = "PPA"
                elif code.startswith("INK -") or (extracted_materials.get("Ink") and code == extracted_materials["Ink"]):
                    category = "Ink"
                elif ("ETHYL" in code.upper()) or (extracted_materials.get("EthylAcetate") and code == extracted_materials["EthylAcetate"]):
                    category = "EthylAcetate"
                elif ("TOLUENE" in code.upper()) or (extracted_materials.get("Toluene") and code == extracted_materials["Toluene"]):
                    category = "Toluene"
                elif ("ISO" in code.upper() and "BUT" in code.upper()) or (extracted_materials.get("IsoButanol") and code == extracted_materials["IsoButanol"]):
                    category = "IsoButanol"

                if category:
                    if category not in category_rows:
                        category_rows[category] = []
                        category_total_original[category] = 0.0
                    category_rows[category].append((wo, item))
                    category_total_original[category] = category_total_original[category] + frappe.utils.flt(item.required_qty)

        total_wo_planned_qty = sum(frappe.utils.flt(w.qty) for w in active_wos)

        # Proportional distribution for standard categories and swapping item codes
        for category, rows_list in category_rows.items():
            specific_item_code = extracted_materials.get(category)
            if not specific_item_code:
                continue
            total_consumed = frappe.utils.flt(item_totals.get(specific_item_code, 0))
            total_original = category_total_original.get(category, 0.0)

            for wo, item in rows_list:
                item.item_code = specific_item_code
                item.item_name = frappe.db.get_value("Item", specific_item_code, "item_name") or specific_item_code
                if total_original > 0:
                    proportion = frappe.utils.flt(item.required_qty) / total_original
                    item.required_qty = proportion * total_consumed
                else:
                    if total_wo_planned_qty > 0:
                        item.required_qty = (frappe.utils.flt(wo.qty) / total_wo_planned_qty) * total_consumed
                    else:
                        item.required_qty = total_consumed / len(rows_list)

        # Handle extra/special items (not in standard categories)
        standard_item_codes = set(extracted_materials.values())
        extra_items = {k: v for k, v in item_totals.items() if k not in standard_item_codes and frappe.utils.flt(v) > 0}

        for extra_code, total_consumed in extra_items.items():
            extra_name = frappe.db.get_value("Item", extra_code, "item_name") or extra_code
            for wo in active_wos:
                existing_item = next((item for item in wo.required_items if item.item_code == extra_code), None)
                if total_wo_planned_qty > 0:
                    allocated_qty = (frappe.utils.flt(wo.qty) / total_wo_planned_qty) * total_consumed
                else:
                    allocated_qty = total_consumed / len(active_wos)

                if existing_item:
                    existing_item.required_qty = allocated_qty
                else:
                    source_wh = wo.required_items[0].source_warehouse if wo.required_items else None
                    wo.append("required_items", {
                        "item_code": extra_code,
                        "item_name": extra_name,
                        "required_qty": allocated_qty,
                        "source_warehouse": source_wh
                    })

        # Save Work Orders
        for wo in active_wos:
            wo.flags.ignore_validate_update_after_submit = True
            wo.save()

        # Update draft Stock Entries for manufacture
        for wo in active_wos:
            ses = frappe.get_all("Stock Entry", filters={
                "work_order": wo.name,
                "docstatus": 0,
                "purpose": "Material Transfer for Manufacture"
            })
            for se_rec in ses:
                se_doc = frappe.get_doc("Stock Entry", se_rec.name)
                se_changed = False
                sa_seen_se = False
                
                # Standard categories
                for se_item in se_doc.items:
                    code = se_item.item_code or ""
                    category = None
                    if code.startswith("PP -") or (extracted_materials.get("PP") and code == extracted_materials["PP"]):
                        category = "PP"
                    elif code.startswith("FL -") or (extracted_materials.get("Filler") and code == extracted_materials["Filler"]):
                        category = "Filler"
                    elif code.startswith("MB -") or (extracted_materials.get("Masterbatch") and code == extracted_materials["Masterbatch"]):
                        category = "Masterbatch"
                    elif code.startswith("SA -") or (extracted_materials.get("Antistatic") and code == extracted_materials["Antistatic"]) or (extracted_materials.get("PPA") and code == extracted_materials["PPA"]):
                        if not sa_seen_se:
                            category = "Antistatic"
                            sa_seen_se = True
                        else:
                            category = "PPA"
                    elif code.startswith("INK -") or (extracted_materials.get("Ink") and code == extracted_materials["Ink"]):
                        category = "Ink"
                    elif ("ETHYL" in code.upper()) or (extracted_materials.get("EthylAcetate") and code == extracted_materials["EthylAcetate"]):
                        category = "EthylAcetate"
                    elif ("TOLUENE" in code.upper()) or (extracted_materials.get("Toluene") and code == extracted_materials["Toluene"]):
                        category = "Toluene"
                    elif ("ISO" in code.upper() and "BUT" in code.upper()) or (extracted_materials.get("IsoButanol") and code == extracted_materials["IsoButanol"]):
                        category = "IsoButanol"

                    if category and extracted_materials.get(category):
                        specific_item_code = extracted_materials[category]
                        se_item.item_code = specific_item_code
                        se_item.item_name = frappe.db.get_value("Item", specific_item_code, "item_name") or specific_item_code
                        
                        wo_item = next((wi for wi in wo.required_items if wi.item_code == specific_item_code), None)
                        if wo_item:
                            se_item.qty = wo_item.required_qty
                            se_item.transfer_qty = wo_item.required_qty
                        se_changed = True

                # Extra items
                for extra_code, total_consumed in extra_items.items():
                    extra_name = frappe.db.get_value("Item", extra_code, "item_name") or extra_code
                    wo_item = next((wi for wi in wo.required_items if wi.item_code == extra_code), None)
                    allocated_qty = wo_item.required_qty if wo_item else 0.0

                    existing_se_item = next((item for item in se_doc.items if item.item_code == extra_code), None)
                    if existing_se_item:
                        existing_se_item.qty = allocated_qty
                        existing_se_item.transfer_qty = allocated_qty
                        se_changed = True
                    elif allocated_qty > 0:
                        s_wh = se_doc.items[0].s_warehouse if se_doc.items else None
                        t_wh = se_doc.items[0].t_warehouse if se_doc.items else None
                        stock_uom = frappe.db.get_value("Item", extra_code, "stock_uom") or "Kg"
                        se_doc.append("items", {
                            "item_code": extra_code,
                            "item_name": extra_name,
                            "qty": allocated_qty,
                            "transfer_qty": allocated_qty,
                            "s_warehouse": s_wh,
                            "t_warehouse": t_wh,
                            "uom": stock_uom,
                            "stock_uom": stock_uom,
                            "conversion_factor": 1
                        })
                        se_changed = True

                if se_changed:
                    se_doc.flags.ignore_validate_update_after_submit = True
                    se_doc.save()

        return "Success"

    # ── Mode 2: Legacy fallback (work_orders + materials) ─────────────────
    else:
        if isinstance(work_orders, str):
            work_orders = json.loads(work_orders)
        if isinstance(materials, str):
            materials = json.loads(materials)

        for wo_id in work_orders:
            wo = frappe.get_doc("Work Order", wo_id)
            if wo.status in ["Completed", "Stopped"]:
                continue

            updated = apply_materials_to_rows(wo.required_items, materials)

            if updated:
                # Refresh item names after code swap
                for item in wo.required_items:
                    details = frappe.db.get_value("Item", item.item_code, ["item_name"], as_dict=True)
                    if details:
                        item.item_name = details.item_name

                wo.flags.ignore_validate_update_after_submit = True
                wo.save()

                # Also update draft Material Transfer Stock Entries
                ses = frappe.get_all("Stock Entry", filters={
                    "work_order": wo_id,
                    "docstatus": 0,
                    "purpose": "Material Transfer for Manufacture"
                })
                for se_rec in ses:
                    se_doc = frappe.get_doc("Stock Entry", se_rec.name)
                    se_changed = apply_materials_to_rows(se_doc.items, materials)
                    if se_changed:
                        for row in se_doc.items:
                            row.item_name = frappe.db.get_value("Item", row.item_code, "item_name") or row.item_name
                        se_doc.flags.ignore_validate_update_after_submit = True
                        se_doc.save()

        return "Success"


# ─────────────────────────────────────────────────────────────
# Internal helper
# ─────────────────────────────────────────────────────────────
def apply_materials_to_rows(rows, materials):
    """Apply prefix-based material swapping to a list of item rows. Returns True if any row changed."""
    # Track SA- items so first → Antistatic, second → PPA
    sa_seen = False
    changed = False

    for item in rows:
        if item.item_code in materials.values():
            continue  # already the correct item

        code = item.item_code or ""

        if code.startswith("PP -") and materials.get("PP"):
            item.item_code = materials["PP"]
            changed = True

        elif code.startswith("FL -") and materials.get("Filler"):
            item.item_code = materials["Filler"]
            changed = True

        elif code.startswith("MB -") and materials.get("Masterbatch"):
            item.item_code = materials["Masterbatch"]
            changed = True

        elif code.startswith("SA -"):
            if not sa_seen:
                # First SA- item → Antistatic
                if materials.get("Antistatic"):
                    item.item_code = materials["Antistatic"]
                    changed = True
                sa_seen = True
            else:
                # Second SA- item → Modifier / PPA
                if materials.get("PPA"):
                    item.item_code = materials["PPA"]
                    changed = True

    return changed
