# ==============================================================================
# STOP! DO NOT COPY THIS ENTIRE FILE INTO A SINGLE SCRIPT!
# ==============================================================================
# You must create 4 SEPARATE Server Script records in Frappe. 
# Copy ONLY the code between the START and END lines for each script.
# ==============================================================================

# ==============================================================================
# SCRIPT 1: get_pp_mixing_data
# (API Method name: get_pp_mixing_data)
# ==============================================================================
# --- START COPYING SCRIPT 1 HERE ---
production_plan = frappe.form_dict.get("production_plan")
spr_name = frappe.form_dict.get("spr_name")

pp = frappe.get_doc("Production Plan", production_plan)

pp_item = filler_item = masterbatch_item = antistatic_item = ppa_item = ""
child_table_candidates = ["mr_items", "raw_materials", "required_items", "custom_raw_materials"]
raw_material_rows = []

for candidate in child_table_candidates:
    rows = pp.get(candidate) or []
    if rows:
        raw_material_rows = rows
        break

sa_count = 0
for row in raw_material_rows:
    code = row.get("item_code") or ""
    if code.startswith("PP") and not pp_item:
        pp_item = code
    elif code.startswith("FL") and not filler_item:
        filler_item = code
    elif code.startswith("MB") and not masterbatch_item:
        masterbatch_item = code
    elif code.startswith("SA"):
        sa_count += 1
        if sa_count == 1:
            ppa_item = code
        elif sa_count == 2:
            antistatic_item = code

checked_boms = []
if not pp_item or not filler_item or not masterbatch_item:
    po_items = pp.get("po_items") or []
    for po in po_items:
        bom_no = po.get("bom_no")
        if bom_no:
            checked_boms.append(bom_no)
            bom_items = frappe.get_all("BOM Item", filters={"parent": bom_no}, fields=["item_code"], ignore_permissions=True)
            for bi in bom_items:
                code = bi.item_code or ""
                if code.startswith("PP") and not pp_item: pp_item = code
                elif code.startswith("FL") and not filler_item: filler_item = code
                elif code.startswith("MB") and not masterbatch_item: masterbatch_item = code
                elif code.startswith("SA"):
                    if not ppa_item: ppa_item = code
                    elif ppa_item != code and not antistatic_item: antistatic_item = code

data = {
    "pp_ratio":           pp.get("pp_ratio")           or 78,
    "filler_ratio":       pp.get("filler_ratio")       or 52,
    "masterbatch_ratio":  pp.get("masterbatch_ratio")  or 1.6,
    "antistatic_ratio":   pp.get("antistatic_ratio")   or 0.3,
    "ppa_ratio":          pp.get("ppa_ratio")          or 0.5,
    "half_pp_ratio":          pp.get("half_mixing_pp_ratio")          or 39,
    "half_filler_ratio":      pp.get("half_mixing_filler_ratio")      or 26,
    "half_masterbatch_ratio": pp.get("half_mixing_masterbatch_ratio") or 0.8,
    "half_antistatic_ratio":  pp.get("half_mixing_antistatic_ratio")  or 0.1,
    "half_ppa_ratio":         pp.get("half_mixing_ppa_ratio")         or 0.3,
    "no_of_full_mixing": pp.get("total_no_of_one_mixing_1") or pp.get("no_of_mixing")       or 1,
    "no_of_half_mixing": pp.get("total_no_of_half_mixing_2") or pp.get("no_of_half_mixing") or 1,
    "pp_item":          pp_item,
    "filler_item":      filler_item,
    "masterbatch_item": masterbatch_item,
    "antistatic_item":  antistatic_item,
    "ppa_item":         ppa_item,
}

if spr_name:
    try:
        raw = frappe.db.get_value("Shaft Production Run", spr_name, "custom_mixing_sheet_data")
        data["existing_mixing_data"] = raw or ""
    except Exception:
        data["existing_mixing_data"] = ""

frappe.response["message"] = data
# --- END SCRIPT 1 ---


# ==============================================================================
# SCRIPT 2: save_mixing_sheet
# (API Method name: save_mixing_sheet)
# ==============================================================================
# --- START COPYING SCRIPT 2 HERE ---
spr_name = frappe.form_dict.get("spr_name")
mixing_sheet_json = frappe.form_dict.get("mixing_sheet_json")

frappe.db.set_value("Shaft Production Run", spr_name, "custom_mixing_sheet_data", mixing_sheet_json)
frappe.db.commit()

frappe.response["message"] = "Saved"
# --- END SCRIPT 2 ---


# ==============================================================================
# SCRIPT 3: record_mixing_consumption
# (API Method name: record_mixing_consumption)
# ==============================================================================
# --- START COPYING SCRIPT 3 HERE ---
spr_name  = frappe.form_dict.get("spr_name")
set_index = int(frappe.form_dict.get("set_index", 0))
row_index = int(frappe.form_dict.get("row_index", 0))
state_json = frappe.form_dict.get("state_json")

if state_json:
    data = json.loads(state_json)
else:
    raw = frappe.db.get_value("Shaft Production Run", spr_name, "custom_mixing_sheet_data")
    if not raw:
        frappe.throw("No mixing sheet data found for this Shaft Production Run. Please save the sheet first.")
    data = json.loads(raw)

sets = data.get("sets", [])

if set_index < len(sets) and row_index < len(sets[set_index].get("rows", [])):
    row = sets[set_index]["rows"][row_index]
    row["consumed"]    = True
    row["consumed_by"] = frappe.session.user
    row["consumed_at"] = frappe.utils.now()

frappe.db.set_value("Shaft Production Run", spr_name, "custom_mixing_sheet_data", json.dumps(data))
frappe.db.commit()

frappe.response["message"] = data
# --- END SCRIPT 3 ---


# ==============================================================================
# SCRIPT 4: update_work_order_materials
# (API Method name: update_work_order_materials)
# ==============================================================================
# --- START COPYING SCRIPT 4 HERE ---
import json

spr_name = frappe.form_dict.get("spr_name")
item_totals_raw = frappe.form_dict.get("item_totals")

work_orders = frappe.form_dict.get("work_orders")
materials   = frappe.form_dict.get("materials")

def apply_materials(rows, materials):
    sa_seen = False
    changed = False
    for item in rows:
        if item.item_code in materials.values():
            continue
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
                if materials.get("Antistatic"):
                    item.item_code = materials["Antistatic"]
                    changed = True
                sa_seen = True
            else:
                if materials.get("PPA"):
                    item.item_code = materials["PPA"]
                    changed = True
    return changed

# Check if we are running in the new mode (spr_name + item_totals)
if spr_name:
    if isinstance(item_totals_raw, str):
        item_totals = json.loads(item_totals_raw)
    else:
        item_totals = item_totals_raw or {}

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
        frappe.response["message"] = "No active Work Orders found to update."
    else:
        # Extract selected materials mapping from custom_mixing_sheet_data
        materials_mapping = {}
        if spr.custom_mixing_sheet_data:
            try:
                sheet_data = json.loads(spr.custom_mixing_sheet_data)
                for s in sheet_data.get("sets", []):
                    m = s.get("materials") or {}
                    for k, v in m.items():
                        if v:
                            materials_mapping[k] = v
            except Exception:
                pass

        # Fallback/complement from item_totals keys:
        sa_codes = []
        for code in item_totals.keys():
            if code.startswith("PP") and "PP" not in materials_mapping:
                materials_mapping["PP"] = code
            elif code.startswith("FL") and "Filler" not in materials_mapping:
                materials_mapping["Filler"] = code
            elif code.startswith("MB") and "Masterbatch" not in materials_mapping:
                materials_mapping["Masterbatch"] = code
            elif code.startswith("SA"):
                if code not in sa_codes:
                    sa_codes.append(code)
            elif code.startswith("INK") and "Ink" not in materials_mapping:
                materials_mapping["Ink"] = code
            elif "ETHYL" in code.upper() and "EthylAcetate" not in materials_mapping:
                materials_mapping["EthylAcetate"] = code
            elif "TOLUENE" in code.upper() and "Toluene" not in materials_mapping:
                materials_mapping["Toluene"] = code
            elif ("ISO" in code.upper() and "BUT" in code.upper()) and "IsoButanol" not in materials_mapping:
                materials_mapping["IsoButanol"] = code

        if len(sa_codes) >= 1:
            if "Antistatic" not in materials_mapping:
                materials_mapping["Antistatic"] = sa_codes[0]
            if len(sa_codes) >= 2 and "PPA" not in materials_mapping:
                materials_mapping["PPA"] = sa_codes[1]

        # Group Work Order required item rows by category to calculate total original required quantities
        category_rows = {}
        category_total_original = {}

        for wo in active_wos:
            sa_seen = False
            for item in wo.required_items:
                code = item.item_code or ""
                category = None
                if code.startswith("PP -") or (materials_mapping.get("PP") and code == materials_mapping["PP"]):
                    category = "PP"
                elif code.startswith("FL -") or (materials_mapping.get("Filler") and code == materials_mapping["Filler"]):
                    category = "Filler"
                elif code.startswith("MB -") or (materials_mapping.get("Masterbatch") and code == materials_mapping["Masterbatch"]):
                    category = "Masterbatch"
                elif code.startswith("SA -") or (materials_mapping.get("Antistatic") and code == materials_mapping["Antistatic"]) or (materials_mapping.get("PPA") and code == materials_mapping["PPA"]):
                    if not sa_seen:
                        category = "Antistatic"
                        sa_seen = True
                    else:
                        category = "PPA"
                elif code.startswith("INK -") or (materials_mapping.get("Ink") and code == materials_mapping["Ink"]):
                    category = "Ink"
                elif ("ETHYL" in code.upper()) or (materials_mapping.get("EthylAcetate") and code == materials_mapping["EthylAcetate"]):
                    category = "EthylAcetate"
                elif ("TOLUENE" in code.upper()) or (materials_mapping.get("Toluene") and code == materials_mapping["Toluene"]):
                    category = "Toluene"
                elif ("ISO" in code.upper() and "BUT" in code.upper()) or (materials_mapping.get("IsoButanol") and code == materials_mapping["IsoButanol"]):
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
            specific_item_code = materials_mapping.get(category)
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
        standard_item_codes = set(materials_mapping.values())
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
                    if code.startswith("PP -") or (materials_mapping.get("PP") and code == materials_mapping["PP"]):
                        category = "PP"
                    elif code.startswith("FL -") or (materials_mapping.get("Filler") and code == materials_mapping["Filler"]):
                        category = "Filler"
                    elif code.startswith("MB -") or (materials_mapping.get("Masterbatch") and code == materials_mapping["Masterbatch"]):
                        category = "Masterbatch"
                    elif code.startswith("SA -") or (materials_mapping.get("Antistatic") and code == materials_mapping["Antistatic"]) or (materials_mapping.get("PPA") and code == materials_mapping["PPA"]):
                        if not sa_seen_se:
                            category = "Antistatic"
                            sa_seen_se = True
                        else:
                            category = "PPA"
                    elif code.startswith("INK -") or (materials_mapping.get("Ink") and code == materials_mapping["Ink"]):
                        category = "Ink"
                    elif ("ETHYL" in code.upper()) or (materials_mapping.get("EthylAcetate") and code == materials_mapping["EthylAcetate"]):
                        category = "EthylAcetate"
                    elif ("TOLUENE" in code.upper()) or (materials_mapping.get("Toluene") and code == materials_mapping["Toluene"]):
                        category = "Toluene"
                    elif ("ISO" in code.upper() and "BUT" in code.upper()) or (materials_mapping.get("IsoButanol") and code == materials_mapping["IsoButanol"]):
                        category = "IsoButanol"

                    if category and materials_mapping.get(category):
                        specific_item_code = materials_mapping[category]
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

        frappe.response["message"] = "Success"

else:
    # Legacy fallback (work_orders + materials)
    if isinstance(work_orders, str):
        work_orders = json.loads(work_orders)
    if isinstance(materials, str):
        materials = json.loads(materials)

    for wo_id in work_orders:
        wo = frappe.get_doc("Work Order", wo_id)
        if wo.status in ["Completed", "Stopped"]:
            continue
        updated = apply_materials(wo.required_items, materials)
        if updated:
            for item in wo.required_items:
                details = frappe.db.get_value("Item", item.item_code, ["item_name"], as_dict=True)
                if details:
                    item.item_name = details.item_name
            wo.flags.ignore_validate_update_after_submit = True
            wo.save()
            ses = frappe.get_all("Stock Entry", filters={
                "work_order": wo_id, "docstatus": 0,
                "purpose": "Material Transfer for Manufacture"
            })
            for se_rec in ses:
                se_doc = frappe.get_doc("Stock Entry", se_rec.name)
                se_changed = apply_materials(se_doc.items, materials)
                if se_changed:
                    for row in se_doc.items:
                        row.item_name = frappe.db.get_value("Item", row.item_code, "item_name") or row.item_name
                    se_doc.flags.ignore_validate_update_after_submit = True
                    se_doc.save()

    frappe.response["message"] = "Success"
# --- END SCRIPT 4 ---
