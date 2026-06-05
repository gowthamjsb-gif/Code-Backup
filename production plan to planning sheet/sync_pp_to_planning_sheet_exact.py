if not doc.custom_planning_sheet:
    pass
else:
    if frappe.db.exists("Planning sheet", doc.custom_planning_sheet):
        ps = frappe.get_doc("Planning sheet", doc.custom_planning_sheet)
        board_updated = False

        field_mapping = {
            "planned_qty": "qty",
            "custom_meterperroll": "meter_per_roll",
            "custom_no_of_rolls": "no_of_rolls",
            "custom_gsm": "gsm",
            "custom_width_": "width_inch",
            "custom_color": "color",
            "custom_weight_per_roll": "weight_per_roll",
            "custom_quality": "custom_quality",
            "sales_order_item": "sales_order_item",
            "item_code": "item_code"
        }

        pp_items_map = {}
        for po_item in doc.get("po_items", []):
            if not po_item.item_code:
                continue
            if po_item.item_code not in pp_items_map:
                pp_items_map[po_item.item_code] = {}
            data = pp_items_map[po_item.item_code]
            if "qty" not in data:
                data["qty"] = 0.0
            if "no_of_rolls" not in data:
                data["no_of_rolls"] = 0

            for pp_field, ps_field in field_mapping.items():
                val = po_item.get(pp_field)
                if ps_field == "qty" and val:
                    data["qty"] = data["qty"] + frappe.utils.flt(val)
                elif ps_field == "no_of_rolls" and val:
                    data["no_of_rolls"] = data["no_of_rolls"] + frappe.utils.cint(val)
                elif val is not None and str(val).strip() != "":
                    if ps_field in ["meter_per_roll", "gsm", "width_inch", "weight_per_roll"]:
                        if frappe.utils.flt(val) > 0:
                            data[ps_field] = val
                    else:
                        data[ps_field] = val

        # Only update the production board (planned_items table)
        for pt in ps.get("planned_items", []):
            item_code = pt.item_code
            if item_code and item_code in pp_items_map:
                data = pp_items_map[item_code]
                for fieldname, value in data.items():
                    if pt.meta.has_field(fieldname):
                        current_val = pt.get(fieldname)
                        if isinstance(value, (int, float)):
                            if frappe.utils.flt(current_val) != frappe.utils.flt(value):
                                pt.set(fieldname, value)
                                board_updated = True
                        else:
                            if current_val != value:
                                pt.set(fieldname, value)
                                board_updated = True

        if board_updated:
            ps.flags.ignore_validate_update_after_submit = True
            ps.flags.ignore_links = True
            ps.save(ignore_permissions=True)
