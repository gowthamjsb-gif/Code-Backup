# Script: get_shift_details
# Logic: Fetches ALL production data from Shaft Production Run
# Fixed: Non-exclusive table discovery and optimized field mapping for Recycle/Wastage.

posting_date = frappe.form_dict.get('posting_date')
shift = frappe.form_dict.get('shift')
unit_raw = frappe.form_dict.get('unit')
if isinstance(unit_raw, str) and unit_raw.strip().lower() in ("none", "null", "undefined", ""):
    unit = None
else:
    unit = unit_raw

if not posting_date or not shift:
    frappe.throw("Posting Date and Shift are required")

FULL_DAY_SHIFTS = ["Day Shift", "Night Shift"]
is_full_day = (shift == "Full Day")

is_all_units = (not unit or unit == "All Units")

CORE_MAPPING = {
    "1600": "PC - 1005151", "2160": "PC - 1005158", "2286": "PC - 1005159",
    "2995": "PC - 1005161", "3200": "PC - 1005163"
}

spr_filters = { "docstatus": 1, "run_date": posting_date }
if is_full_day:
    spr_filters["shift"] = ["in", FULL_DAY_SHIFTS]
else:
    spr_filters["shift"] = shift

spr_list = frappe.get_all("Shaft Production Run", filters=spr_filters, fields=["name", "shift"])

if not spr_list:
    frappe.response['message'] = { 
        "production_items": [], "consumption_items": [], "production_attributes": [],
        "base_batch_no": "", "all_batch_nos": [], "core_consumption_items": [], 
        "polybag_items": [], "wastage_items": [], "recycle_items": [],
        "fg_consumption_items": [], "fg_batches_map": {}, "bag_consumables": []
    }
else:
    valid_work_orders = []
    production_attributes = []
    seen_attrs = set()
    core_totals = {}
    polybag_totals = {}
    bag_consumables_totals = {}
    wastage_totals = {}
    specific_wastage_totals = {}
    recycle_totals = {}
    fg_consumption_map = {}
    fg_batches_map = {}
    consumption_map = {}
    all_batch_nos = []
    base_batch_no = ""

    operator_val = ""
    supervisor_val = ""
    spr_table_debug = []
    for spr_meta in spr_list:
        spr_doc = frappe.get_doc("Shaft Production Run", spr_meta.name)
        
        # Check both custom_unit and unit
        doc_unit = str(spr_doc.get("custom_unit") or spr_doc.get("unit") or "").strip()
        
        if unit and not is_all_units:
            # Specific unit selected - filter case insensitively
            if doc_unit.lower() != unit.lower():
                continue
        else:
            # All units: skip any workstation with 'unassigned' in the name
            if "unassigned" in doc_unit.lower():
                continue
        if not operator_val:
            ov = spr_doc.get("operator") or spr_doc.get("custom_operator")
            if ov:
                if frappe.db.exists("Employee", ov):
                    operator_val = frappe.db.get_value("Employee", ov, "employee_name")
                else:
                    operator_val = ov
        
        if not supervisor_val:
            sv = spr_doc.get("supervisor") or spr_doc.get("custom_supervisor")
            if sv:
                if frappe.db.exists("Employee", sv):
                    supervisor_val = frappe.db.get_value("Employee", sv, "employee_name")
                else:
                    supervisor_val = sv
        
        # Use exact table name confirmed from SPR doc debug: fabric_batch_picks
        fabric_picks = spr_doc.get("fabric_batch_picks") or []
        
        for pick in fabric_picks:
            # Use exact column names: rm_item, batch_no, qty
            ic = pick.get("rm_item") or pick.get("item_code") or pick.get("item")
            if not ic: continue
            qty = float(pick.get("qty") or pick.get("qty_kg") or 0)
            if qty <= 0: continue
            ig = frappe.db.get_value("Item", ic, "item_group")
            
            if ig and "product" in str(ig).strip().lower():
                if ic not in fg_consumption_map:
                    raw_iname = pick.get("item_name") or frappe.db.get_value("Item", ic, "item_name") or ic
                    d_code = ic.split("-")[0] if "-" in ic else ""
                    if d_code and d_code.isdigit() and not str(raw_iname).startswith(d_code):
                        final_iname = f"{d_code} - {raw_iname}"
                    else:
                        final_iname = raw_iname

                    fg_consumption_map[ic] = {
                        "item_code": ic,
                        "item_name": final_iname,
                        "batch": "View Batches",
                        "uom": frappe.db.get_value("Item", ic, "stock_uom") or "Kg",
                        "standard_consumption": 0.0,
                        "actual_consumption": 0.0
                    }
                    fg_batches_map[ic] = []
                
                # Do not set standard_consumption here, it should only come from the BOM calculations
                # actual_consumption will be scanned.
                
                batch_val = pick.get("batch_no") or pick.get("batch") or ""
                nw = qty
                if batch_val:
                    try:
                        b_doc = frappe.db.get_value("Batch", batch_val, ["net_weight"], as_dict=True)
                        if b_doc and b_doc.get("net_weight"):
                            nw = b_doc.get("net_weight")
                    except Exception:
                        pass
                        
                fg_batches_map[ic].append({
                    "batch_no": batch_val,
                    "item_code": ic,
                    "qty": qty,
                    "net_weight": nw,
                    "spr": spr_doc.name
                })
            else:
                if ic not in consumption_map:
                    consumption_map[ic] = {
                        "item_code": ic,
                        "item_name": pick.get("item_name") or ic,
                        "uom": frappe.db.get_value("Item", ic, "stock_uom") or "Kg",
                        "standard_consumption": 0.0,
                        "actual_consumption": 0.0
                    }
                old_c_std = consumption_map[ic]["standard_consumption"]
                consumption_map[ic]["standard_consumption"] = old_c_std + qty

        # ── Rolls & Core ──────────────────────────────────────────────
        roll_items = spr_doc.get("items") or []
        for row in roll_items:
            wo_v = row.get("work_order")
            if wo_v and wo_v not in valid_work_orders:
                valid_work_orders.append(wo_v)
            
            roll_batch = row.get("batch_no") or row.get("batch")
            if roll_batch and roll_batch not in all_batch_nos:
                all_batch_nos.append(roll_batch)
                if not base_batch_no:
                    base_batch_no = roll_batch
            
            q_v = row.get("quality") or row.get("custom_quality")
            c_v = row.get("color") or row.get("colour") or row.get("custom_color")
            g_v = str(row.get("gsm") or row.get("custom_gsm") or "")
            
            if q_v and c_v and g_v:
                ak_v = (str(q_v).strip().upper(), str(c_v).strip().upper(), g_v.strip().upper())
                # Using a dictionary key instead of a set potentially avoid augmented assignment on set
                seen_attrs.add(ak_v)
                # Keep track for template generation if no actual wastage data
                if ak_v not in production_attributes:
                   production_attributes.append({"quality": q_v, "colour": c_v, "gsm": g_v})
            
            cw_s = str(row.get("custom_core_width_mm") or "")
            gr_w = float(row.get("gross_weight") or 0)
            ne_w = float(row.get("net_weight") or 0)
            c_calc = round(gr_w - ne_w, 3)
            
            if c_calc > 0 and cw_s:
                for k_dm in CORE_MAPPING:
                    if k_dm in cw_s:
                        im_c = CORE_MAPPING[k_dm]
                        ov_c = core_totals.get(im_c, 0)
                        core_totals[im_c] = ov_c + c_calc
                        break

        # ── Iterate ALL child tables from SPR by inspecting the doc dict ────
        # spr_doc.as_dict() gives all fields; list-of-dict fields = child tables
        spr_dict = spr_doc.as_dict()
        for field_name, field_value in spr_dict.items():
            if not isinstance(field_value, list) or not field_value:
                continue
            first = field_value[0]
            if not isinstance(first, dict) or "doctype" not in first:
                continue

            fn_i = field_name.lower()
            child_dt = (first.get("doctype") or "").lower()

            # Collect debug info (visible via r.message.spr_table_debug in console)
            spr_table_debug.append({
                "table": field_name, "child_doctype": first.get("doctype"),
                "rows": len(field_value),
                "first_row_keys": list(first.keys())[:25]
            })

            # ── Polybag ──────────────────────────────────────────────────
            if "polybag" in fn_i or "polybag" in child_dt:
                for pb_r in field_value:
                    pi_v = pb_r.get("polybag_item") or pb_r.get("item_code")
                    pq_v = float(pb_r.get("quantity_kgs") or pb_r.get("qty") or pb_r.get("amount") or 0)
                    pu_v = pb_r.get("uom") or "Kg"
                    if pi_v and pq_v > 0:
                        if pi_v not in polybag_totals:
                            polybag_totals[pi_v] = {"quantity": 0.0, "uom": pu_v}
                        polybag_totals[pi_v]["quantity"] = polybag_totals[pi_v]["quantity"] + pq_v
                continue

            # ── Bag Consumables ──────────────────────────────────────────
            if "bag_packing" in fn_i or "bag_consumable" in fn_i or "bag_packing" in child_dt or "bag_consumable" in child_dt:
                for bc_r in field_value:
                    bci_v = bc_r.get("item") or bc_r.get("item_code")
                    bcq_v = float(bc_r.get("quantity_kgs") or bc_r.get("qty") or 0)
                    bcu_v = bc_r.get("uom") or "Kg"
                    if bci_v and bcq_v > 0:
                        if bci_v not in bag_consumables_totals:
                            bag_consumables_totals[bci_v] = {"quantity": 0.0, "uom": bcu_v}
                        bag_consumables_totals[bci_v]["quantity"] = bag_consumables_totals[bci_v]["quantity"] + bcq_v
                continue

            # ── Core Details ─────────────────────────────────────────────
            if "core" in fn_i or "core" in child_dt:
                for c_r in field_value:
                    c_item = (c_r.get("core_item") or c_r.get("item_code") or c_r.get("item"))
                    c_qty = float(c_r.get("quantity_kgs") or c_r.get("quantity") or c_r.get("qty") or 0)
                    if c_item and c_qty > 0:
                        core_totals[c_item] = core_totals.get(c_item, 0) + c_qty
                continue

            # ── Recycled Wastage Details ─────────────────────────────────
            # Check "recycle" FIRST to separate from running_patty_wastage
            if "recycle" in fn_i or "recycle" in child_dt:
                for r_r in field_value:
                    rq_v = float(r_r.get("available") or r_r.get("available_balance") or
                                 r_r.get("recycled_qty_kgs") or r_r.get("recycled_qty") or
                                 r_r.get("qty") or r_r.get("quantity_kgs") or r_r.get("quantity") or 0)
                    wi_v = float(r_r.get("width") or r_r.get("width_inch") or r_r.get("width_inches") or 0)
                    qu_v = r_r.get("quality") or r_r.get("patty_quality") or "Unknown"
                    co_v = r_r.get("color") or r_r.get("colour") or "Unknown"
                    gs_v = str(r_r.get("gsm") or "")
                    key_t = (str(qu_v).strip().upper(), str(co_v).strip().upper(), gs_v.strip().upper(), wi_v)
                    if rq_v > 0:
                        recycle_totals[key_t] = recycle_totals.get(key_t, 0) + rq_v
                continue

            # ── Running Patty Wastage ────────────────────────────────────
            if "waste" in fn_i or "wastage" in fn_i or "patty" in fn_i or "waste" in child_dt or "wastage" in child_dt or "patty" in child_dt:
                for r_r in field_value:
                    wq_v = float(r_r.get("wastage_qty_kg") or r_r.get("wastage_qty_kgs") or
                                 r_r.get("net_wastage") or r_r.get("waste_qty") or
                                 r_r.get("qty") or r_r.get("quantity") or 0)
                    
                    item_code = r_r.get("item") or r_r.get("item_code")
                    if item_code and wq_v > 0:
                        specific_wastage_totals[item_code] = specific_wastage_totals.get(item_code, 0) + wq_v
                    else:
                        wi_v = float(r_r.get("width") or r_r.get("width_inch") or r_r.get("width_inches") or 0)
                        qu_v = r_r.get("quality") or r_r.get("patty_quality") or "Unknown"
                        co_v = r_r.get("color") or r_r.get("colour") or "Unknown"
                        gs_v = str(r_r.get("gsm") or "")
                        key_t = (str(qu_v).strip().upper(), str(co_v).strip().upper(), gs_v.strip().upper(), wi_v)
                        if wq_v > 0:
                            wastage_totals[key_t] = wastage_totals.get(key_t, 0) + wq_v


    # --- Processing Stock Entries (Manufacture) ---

    production_map = {}
    
    se_filters_m = {"docstatus": 1, "purpose": "Manufacture"}
    stock_entries_m = []

    if unit and not is_all_units:
        if valid_work_orders:
            se_filters_m["work_order"] = ["in", valid_work_orders]
            stock_entries_m = frappe.get_all("Stock Entry", filters=se_filters_m, fields=["name", "work_order", "from_warehouse", "to_warehouse", "bom_no"])
    else:
        if valid_work_orders:
            se_filters_m["work_order"] = ["in", valid_work_orders]
        else:
            se_filters_m["posting_date"] = posting_date
        stock_entries_m = frappe.get_all("Stock Entry", filters=se_filters_m, fields=["name", "work_order", "from_warehouse", "to_warehouse", "bom_no"])

    for se_doc_m in stock_entries_m:
        fg_m_list = frappe.get_all("Stock Entry Detail", filters={"parent": se_doc_m.name, "is_finished_item": 1}, fields=["item_code", "item_name", "qty", "uom", "batch_no"])
        for fg_r_m in fg_m_list:
            kp_m = (fg_r_m.item_code, se_doc_m.work_order, se_doc_m.to_warehouse)
            if kp_m not in production_map:
                production_map[kp_m] = {"work_order": se_doc_m.work_order, "stock_entry": se_doc_m.name, "item_code": fg_r_m.item_code, "item_name": fg_r_m.item_name, "produced_qty": 0.0, "fg_warehouse": fg_r_m.t_warehouse or se_doc_m.to_warehouse}
            pr_f_m = production_map[kp_m]
            old_pq = pr_f_m["produced_qty"]
            pr_f_m["produced_qty"] = old_pq + float(fg_r_m.qty or 0)
            
            bn_fg_m = fg_r_m.get("batch_no")
            if bn_fg_m and bn_fg_m not in all_batch_nos:
                all_batch_nos.append(bn_fg_m)
                if not base_batch_no:
                    base_batch_no = bn_fg_m
            
            bom_v_ref = se_doc_m.bom_no or frappe.db.get_value("Work Order", se_doc_m.work_order, "bom_no")
            if bom_v_ref:
                bq_v_ref = float(frappe.db.get_value("BOM", bom_v_ref, "quantity") or 1) or 1
                rm_i_ref = frappe.get_all("BOM Item", filters={"parent": bom_v_ref}, fields=["item_code", "item_name", "qty", "stock_uom"])
                for rm_r_ref in rm_i_ref:
                    rq_calc_v = (float(rm_r_ref.qty) / bq_v_ref) * float(fg_r_m.qty)
                    ig_ref = frappe.db.get_value("Item", rm_r_ref.item_code, "item_group")
                    if ig_ref and "product" in str(ig_ref).strip().lower():
                        # Add BOM calculated requirement to FG standard consumption
                        if rm_r_ref.item_code not in fg_consumption_map:
                            fg_consumption_map[rm_r_ref.item_code] = {"item_code": rm_r_ref.item_code, "item_name": rm_r_ref.item_name, "batch": "View Batches", "uom": rm_r_ref.stock_uom, "standard_consumption": 0.0, "actual_consumption": 0.0}
                        old_fg_std_val = fg_consumption_map[rm_r_ref.item_code]["standard_consumption"]
                        fg_consumption_map[rm_r_ref.item_code]["standard_consumption"] = old_fg_std_val + rq_calc_v
                        continue
                    if rm_r_ref.item_code not in consumption_map:
                        consumption_map[rm_r_ref.item_code] = {"item_code": rm_r_ref.item_code, "item_name": rm_r_ref.item_name, "uom": rm_r_ref.stock_uom, "standard_consumption": 0.0, "actual_consumption": 0.0}
                    cr_f_v = consumption_map[rm_r_ref.item_code]
                    old_sc_bom = cr_f_v["standard_consumption"]
                    old_ac_bom = cr_f_v["actual_consumption"]
                    cr_f_v["standard_consumption"] = old_sc_bom + rq_calc_v
                    cr_f_v["actual_consumption"] = old_ac_bom + rq_calc_v

    core_resp_list = []
    for ic_key_r in core_totals:
        qv_c_r = core_totals[ic_key_r]
        core_resp_list.append({"item_code": ic_key_r, "item_name": frappe.db.get_value("Item", ic_key_r, "item_name") or ic_key_r, "uom": "Kg", "quantity": round(qv_c_r, 3)})
    
    poly_resp_list = []
    for pi_key_r in polybag_totals:
        pd_obj_r = polybag_totals[pi_key_r]
        poly_resp_list.append({"product": pi_key_r, "item_name": frappe.db.get_value("Item", pi_key_r, "item_name") or pi_key_r, "quantity": round(pd_obj_r["quantity"], 3), "uom": pd_obj_r["uom"]})
    
    bag_consumables_resp_list = []
    for bi_key_r in bag_consumables_totals:
        bd_obj_r = bag_consumables_totals[bi_key_r]
        bag_consumables_resp_list.append({"item": bi_key_r, "quantity_kgs": round(bd_obj_r["quantity"], 3), "uom": bd_obj_r["uom"]})
    
    waste_resp_list = []
    for wk_key_r in wastage_totals:
        qv_w_r = wastage_totals[wk_key_r]
        waste_resp_list.append({"quality": wk_key_r[0], "colour": wk_key_r[1], "gsm": wk_key_r[2], "width_inch": wk_key_r[3], "wastage_qty_kg": round(qv_w_r, 3)})
    
    recyc_resp_list = []
    for rk_key_r in recycle_totals:
        qv_r_r = recycle_totals[rk_key_r]
        recyc_resp_list.append({"quality": rk_key_r[0], "colour": rk_key_r[1], "gsm": rk_key_r[2], "width_inch": rk_key_r[3], "quantity_kgs": round(qv_r_r, 3), "available_balance": round(qv_r_r, 3)})

    frappe.response['message'] = { 
        "operator": operator_val,
        "supervisor": supervisor_val,
        "production_items": list(production_map.values()), 
        "fg_consumption_items": list(fg_consumption_map.values()),
        "fg_batches_map": fg_batches_map,
        "consumption_items": list(consumption_map.values()), 
        "production_attributes": production_attributes, 
        "base_batch_no": base_batch_no, 
        "all_batch_nos": all_batch_nos, 
        "core_consumption_items": core_resp_list, 
        "polybag_items": poly_resp_list, 
        "wastage_items": waste_resp_list, 
        "specific_wastage_totals": specific_wastage_totals,
        "recycle_items": recyc_resp_list,
        "bag_consumables": bag_consumables_resp_list,
        "spr_table_debug": spr_table_debug
    }
