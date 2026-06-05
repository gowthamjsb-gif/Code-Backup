# API Method Name: update_work_order_materials
# Script Type: API

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
