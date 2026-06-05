# Script: get_shift_details
# Logic: Fetches ALL production data from Shaft Production Run
# Compatibility: Strictly NO multiple assignments and NO augmented assignments.
# Fixed: Non-exclusive table discovery and optimized field mapping for Recycle/Wastage.

posting_date = frappe.form_dict.get('posting_date')
shift = frappe.form_dict.get('shift')
unit = frappe.form_dict.get('unit')

if not posting_date or not shift:
    frappe.throw("Posting Date and Shift are required")

FULL_DAY_SHIFTS = ["Day Shift", "Night Shift"]
is_full_day = (shift == "Full Day")
is_all_units = (unit == "All Units")

CORE_MAPPING = {
    "1600": "PC - 1005151", "2160": "PC - 1005158", "2286": "PC - 1005159",
    "2995": "PC - 1005161", "3200": "PC - 1005163"
}

spr_filters = { "docstatus": 1, "run_date": posting_date }
if is_full_day:
    spr_filters["shift"] = ["in", FULL_DAY_SHIFTS]
else:
    spr_filters["shift"] = shift

if unit and not is_all_units:
    spr_filters["custom_unit"] = unit

spr_list = frappe.get_all("Shaft Production Run", filters=spr_filters, fields=["name", "shift", "custom_unit"])

if not spr_list:
    frappe.response['message'] = { 
        "production_items": [], "consumption_items": [], "production_attributes": [],
        "base_batch_no": "", "all_batch_nos": [], "core_consumption_items": [], 
        "polybag_items": [], "wastage_items": [], "recycle_items": [] 
    }
else:
    valid_work_orders = []
    production_attributes = []
    seen_attrs = set()
    core_totals = {}
    polybag_totals = {}
    wastage_totals = {}
    recycle_totals = {}

    operator_val = ""
    supervisor_val = ""
    for spr_meta in spr_list:
        spr_doc = frappe.get_doc("Shaft Production Run", spr_meta.name)
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
        
        # ── Rolls & Core ──────────────────────────────────────────────
        roll_items = spr_doc.get("items") or []
        for row in roll_items:
            wo_v = row.get("work_order")
            if wo_v and wo_v not in valid_work_orders:
                valid_work_orders.append(wo_v)
            
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

        # ── Polybag, Wastage, Recycle (Non-Exclusive Processing) ────────
        for df_i in spr_doc.meta.get_table_fields():
            fn_i = df_i.fieldname.lower()
            rows_i = spr_doc.get(df_i.fieldname) or []
            
            if "polybag" in fn_i:
                for pb_r in rows_i:
                    pi_v = pb_r.get("polybag_item") or pb_r.get("item_code")
                    pq_v = float(pb_r.get("quantity_kgs") or pb_r.get("qty") or pb_r.get("amount") or 0)
                    pu_v = pb_r.get("uom") or "Kg"
                    if pi_v and pq_v > 0:
                        if pi_v not in polybag_totals:
                            polybag_totals[pi_v] = {"quantity": 0.0, "uom": pu_v}
                        pq_old = polybag_totals[pi_v]["quantity"]
                        polybag_totals[pi_v]["quantity"] = pq_old + pq_v
            
            is_waste_tab = ("waste" in fn_i or "wastage" in fn_i)
            is_recyc_tab = ("recycle" in fn_i or "consumption" in fn_i or "patty" in fn_i)
            
            if is_waste_tab or is_recyc_tab:
                for r_r in rows_i:
                    # 1. Capture Recycle data (Check all possible field names)
                    rq_v = float(r_r.get("recycled_qty_kgs") or r_r.get("recycled_qty") or r_r.get("available_balance") or 0)
                    # Fallback for 'qty' ONLY if it's explicitly a recycle table
                    if rq_v == 0 and is_recyc_tab:
                        rq_v = float(r_r.get("qty") or r_r.get("consumption_qty_kg") or r_r.get("amount") or 0)
                    
                    # 2. Capture Wastage data (Prioritize NET wastage to avoid double counting)
                    # We only extract wastage if it's a "waste" table
                    wq_v = 0
                    if is_waste_tab:
                        # net_wastage is the real "bin" wastage
                        wq_v = float(r_r.get("net_wastage") or r_r.get("net") or r_r.get("wastage_qty_kgs") or r_r.get("wastage_qty_kg") or r_r.get("qty") or 0)
                    
                    wi_v = float(r_r.get("width") or r_r.get("width_inch") or r_r.get("width_inches") or 0)
                    qu_v = r_r.get("quality") or r_r.get("custom_quality") or r_r.get("patty_quality") or "Unknown"
                    co_v = r_r.get("color") or r_r.get("colour") or r_r.get("custom_color") or r_r.get("patty_colour") or "Unknown"
                    gs_v = str(r_r.get("gsm") or r_r.get("custom_gsm") or r_r.get("patty_gsm") or "")
                    key_t = (str(qu_v).strip().upper(), str(co_v).strip().upper(), gs_v.strip().upper(), wi_v)
                    
                    if rq_v > 0:
                        orq_v = recycle_totals.get(key_t, 0)
                        recycle_totals[key_t] = orq_v + rq_v
                    
                    if wq_v > 0:
                        owq_v = wastage_totals.get(key_t, 0)
                        wastage_totals[key_t] = owq_v + wq_v

    # --- Processing Stock Entries (Manufacture) ---
    production_map = {}
    consumption_map = {}
    all_batch_nos = []
    base_batch_no = ""
    
    se_filters_m = {"docstatus": 1, "purpose": "Manufacture"}
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
                    if rm_r_ref.item_code not in consumption_map:
                        consumption_map[rm_r_ref.item_code] = {"item_code": rm_r_ref.item_code, "item_name": rm_r_ref.item_name, "uom": rm_r_ref.stock_uom, "standard_consumption": 0.0, "actual_consumption": 0.0}
                    cr_f_v = consumption_map[rm_r_ref.item_code]
                    old_sc = cr_f_v["standard_consumption"]
                    old_ac = cr_f_v["actual_consumption"]
                    cr_f_v["standard_consumption"] = old_sc + rq_calc_v
                    cr_f_v["actual_consumption"] = old_ac + rq_calc_v

    core_resp_list = []
    for ic_key_r in core_totals:
        qv_c_r = core_totals[ic_key_r]
        core_resp_list.append({"item_code": ic_key_r, "item_name": frappe.db.get_value("Item", ic_key_r, "item_name") or ic_key_r, "uom": "Kg", "quantity": round(qv_c_r, 3)})
    
    poly_resp_list = []
    for pi_key_r in polybag_totals:
        pd_obj_r = polybag_totals[pi_key_r]
        poly_resp_list.append({"product": pi_key_r, "item_name": frappe.db.get_value("Item", pi_key_r, "item_name") or pi_key_r, "quantity": round(pd_obj_r["quantity"], 3), "uom": pd_obj_r["uom"]})
    
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
        "consumption_items": list(consumption_map.values()), 
        "production_attributes": production_attributes, 
        "base_batch_no": base_batch_no, 
        "all_batch_nos": all_batch_nos, 
        "core_consumption_items": core_resp_list, 
        "polybag_items": poly_resp_list, 
        "wastage_items": waste_resp_list, 
        "recycle_items": recyc_resp_list 
    }
