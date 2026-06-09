# Script: shift_production_entry (Proxy for get_shift_details)
# Logic: Synchronized with get_shift_details.py
# Compatibility: Strictly NO multiple assignments and NO augmented assignments.
# Fixed: Non-exclusive table discovery for broader data capture.

posting_date = frappe.form_dict.get('posting_date')
shift = frappe.form_dict.get('shift')
unit_raw = frappe.form_dict.get('unit')
if isinstance(unit_raw, str) and unit_raw.strip().lower() in ("none", "null", "undefined", ""):
    unit = None
else:
    unit = unit_raw

if not posting_date or not shift:
    frappe.throw("Posting Date and Shift are required")

is_all_units = (not unit or unit == "All Units")

CORE_MAPPING = {
    "1600": "PC - 1005151", "2160": "PC - 1005158", "2286": "PC - 1005159",
    "2995": "PC - 1005161", "3200": "PC - 1005163"
}

spr_filters_v_r_f = { "docstatus": 1, "run_date": posting_date, "shift": shift }
spr_list_v_r_f = frappe.get_all("Shaft Production Run", filters=spr_filters_v_r_f, fields=["name", "shift"])

if not spr_list_v_r_f:
    frappe.response['message'] = { "production_items": [], "consumption_items": [], "base_batch_no": "", "all_batch_nos": [], "core_consumption_items": [], "polybag_items": [], "wastage_items": [], "recycle_items": [], "bag_consumables": [] }
else:
    valid_work_orders_v_r = []
    core_totals_v_r = {}
    polybag_totals_v_r = {}
    bag_consumables_totals_v_r = {}
    wastage_totals_v_r = {}
    recycle_totals_v_r = {}
    fg_consumption_list_v_r = []
    consumption_map_v_r = {}

    for spr_meta_p_r in spr_list_v_r_f:
        spr_doc_p_r = frappe.get_doc("Shaft Production Run", spr_meta_p_r.name)
        
        # Check both custom_unit and unit
        doc_unit = str(spr_doc_p_r.get("custom_unit") or spr_doc_p_r.get("unit") or "").strip()
        
        if unit and not is_all_units:
            # Specific unit selected - filter case insensitively
            if doc_unit.lower() != unit.lower():
                continue
        else:
            # All units: skip any workstation with 'unassigned' in the name
            if "unassigned" in doc_unit.lower():
                continue
                
        # Use exact table/column names confirmed from SPR doc debug
        fabric_picks = spr_doc_p_r.get("fabric_batch_picks") or []
        
        for pick in fabric_picks:
            ic = pick.get("rm_item") or pick.get("item_code") or pick.get("item")
            if not ic: continue
            qty = float(pick.get("qty") or pick.get("qty_kg") or 0)
            if qty <= 0: continue
            ig = frappe.db.get_value("Item", ic, "item_group")
            
            if ig and "product" in str(ig).strip().lower():
                fg_consumption_list_v_r.append({
                    "item_code": ic,
                    "item_name": pick.get("item_name") or frappe.db.get_value("Item", ic, "item_name") or ic,
                    "batch": pick.get("batch_no") or pick.get("batch") or "",
                    "uom": frappe.db.get_value("Item", ic, "stock_uom") or "Kg",
                    "standard_consumption": qty,
                    "actual_consumption": ""
                })
            else:
                if ic not in consumption_map_v_r:
                    consumption_map_v_r[ic] = {
                        "item_code": ic,
                        "item_name": pick.get("item_name") or ic,
                        "uom": frappe.db.get_value("Item", ic, "stock_uom") or "Kg",
                        "standard_consumption": 0.0,
                        "actual_consumption": 0.0
                    }
                old_c_std = consumption_map_v_r[ic]["standard_consumption"]
                old_c_act = consumption_map_v_r[ic]["actual_consumption"]
                consumption_map_v_r[ic]["standard_consumption"] = old_c_std + qty
                consumption_map_v_r[ic]["actual_consumption"] = old_c_act + qty
        
        # ── Rolls & Core ──────────────────────────────────────────────
        spr_items_p_r = spr_doc_p_r.get("items") or []
        for roll_r_p_r in spr_items_p_r:
            wo_res_p = roll_r_p_r.get("work_order")
            if wo_res_p and wo_res_p not in valid_work_orders_v_r:
                valid_work_orders_v_r.append(wo_res_p)
            
            cw_res_p = str(roll_r_p_r.get("custom_core_width_mm") or "")
            gw_res_p = float(roll_r_p_r.get("gross_weight") or 0)
            nw_res_p = float(roll_r_p_r.get("net_weight") or 0)
            c_raw_p = round(gw_res_p - nw_res_p, 3)
            
            if c_raw_p > 0 and cw_res_p:
                for c_dm_p in CORE_MAPPING:
                    if c_dm_p in cw_res_p:
                        ic_res_p = CORE_MAPPING[c_dm_p]
                        old_c_v = core_totals_v_r.get(ic_res_p, 0)
                        core_totals_v_r[ic_res_p] = old_c_v + c_raw_p
                        break

        # ── Polybag, Wastage, Recycle (Non-Exclusive) ──────────────
        for df_p_r in spr_doc_p_r.meta.get_table_fields():
            fn_p_r = df_p_r.fieldname.lower()
            rows_p_r = spr_doc_p_r.get(df_p_r.fieldname) or []
            options_p_r = ""
            try:
                options_p_r = df_p_r.options or ""
            except Exception:
                pass
            
            if "polybag" in fn_p_r or options_p_r == "Shift Polybag Detail":
                for pb_p_r in rows_p_r:
                    pbi_p_r = pb_p_r.get("polybag_item") or pb_p_r.get("item_code")
                    pbq_p_r = float(pb_p_r.get("quantity_kgs") or pb_p_r.get("qty") or 0)
                    pbu_p_r = pb_p_r.get("uom") or "Kg"
                    if pbi_p_r and pbq_p_r > 0:
                        if pbi_p_r not in polybag_totals_v_r:
                            polybag_totals_v_r[pbi_p_r] = {"quantity": 0.0, "uom": pbu_p_r}
                        old_pb_q = polybag_totals_v_r[pbi_p_r]["quantity"]
                        polybag_totals_v_r[pbi_p_r]["quantity"] = old_pb_q + pbq_p_r
            elif "bag_packing" in fn_p_r or "bag_consumable" in fn_p_r or options_p_r == "Bag Packing Detail":
                for bc_p_r in rows_p_r:
                    bci_p_r = bc_p_r.get("item") or bc_p_r.get("item_code")
                    bcq_p_r = float(bc_p_r.get("quantity_kgs") or bc_p_r.get("qty") or 0)
                    bcu_p_r = bc_p_r.get("uom") or "Kg"
                    if bci_p_r and bcq_p_r > 0:
                        if bci_p_r not in bag_consumables_totals_v_r:
                            bag_consumables_totals_v_r[bci_p_r] = {"quantity": 0.0, "uom": bcu_p_r}
                        old_bc_q = bag_consumables_totals_v_r[bci_p_r]["quantity"]
                        bag_consumables_totals_v_r[bci_p_r]["quantity"] = old_bc_q + bcq_p_r
            
            is_w_tab = ("waste" in fn_p_r or "wastage" in fn_p_r)
            is_r_tab = ("recycle" in fn_p_r or "consumption" in fn_p_r or "patty" in fn_p_r)
            
            if is_w_tab or is_r_tab:
                for row_obj in rows_p_r:
                    rq_val = float(row_obj.get("recycled_qty_kgs") or row_obj.get("recycled_qty") or row_obj.get("available_balance") or 0)
                    if rq_val == 0 and is_r_tab:
                        rq_val = float(row_obj.get("qty") or row_obj.get("consumption_qty_kg") or row_obj.get("amount") or 0)
                    
                    wq_val = 0
                    if is_w_tab:
                        wq_val = float(row_obj.get("net_wastage") or row_obj.get("net") or row_obj.get("wastage_qty_kgs") or row_obj.get("qty") or 0)
                    
                    wi_val = float(row_obj.get("width") or row_obj.get("width_inch") or row_obj.get("width_inches") or 0)
                    qu_val = row_obj.get("quality") or row_obj.get("custom_quality") or "Unknown"
                    co_val = row_obj.get("color") or row_obj.get("colour") or "Unknown"
                    gs_val = str(row_obj.get("gsm") or row_obj.get("custom_gsm") or "")
                    tk_v = (str(qu_val).strip().upper(), str(co_val).strip().upper(), gs_val.strip().upper(), wi_val)
                    
                    if rq_val > 0:
                        old_rv = recycle_totals_v_r.get(tk_v, 0)
                        recycle_totals_v_r[tk_v] = old_rv + rq_val
                    
                    if wq_val > 0:
                        old_wv = wastage_totals_v_r.get(tk_v, 0)
                        wastage_totals_v_r[tk_v] = old_wv + wq_val

    production_map_v_r = {}
    all_batch_nos_v_r = []
    base_batch_no_v_r = ""

    se_filters_p_r = {"docstatus": 1, "purpose": "Manufacture"}
    stock_entries_p_r = []
    
    if unit and not is_all_units:
        if valid_work_orders_v_r:
            se_filters_p_r["work_order"] = ["in", valid_work_orders_v_r]
            stock_entries_p_r = frappe.get_all("Stock Entry", filters=se_filters_p_r, fields=["name", "work_order", "from_warehouse", "to_warehouse", "bom_no"])
    else:
        if valid_work_orders_v_r:
            se_filters_p_r["work_order"] = ["in", valid_work_orders_v_r]
        else:
            se_filters_p_r["posting_date"] = posting_date
        stock_entries_p_r = frappe.get_all("Stock Entry", filters=se_filters_p_r, fields=["name", "work_order", "from_warehouse", "to_warehouse", "bom_no"])
    
    for se_p_r in stock_entries_p_r:
        fg_p_r_list = frappe.get_all("Stock Entry Detail", filters={"parent": se_p_r.name, "is_finished_item": 1}, fields=["item_code", "item_name", "qty", "uom", "batch_no"])
        for fg_r_p_r in fg_p_r_list:
            kp_v_r = (fg_r_p_r.item_code, se_p_r.work_order, se_p_r.to_warehouse)
            if kp_v_r not in production_map_v_r:
                production_map_v_r[kp_v_r] = {"work_order": se_p_r.work_order, "stock_entry": se_p_r.name, "item_code": fg_r_p_r.item_code, "item_name": fg_r_p_r.item_name, "produced_qty": 0.0, "fg_warehouse": se_p_r.to_warehouse}
            
            p_q_f = production_map_v_r[kp_v_r]["produced_qty"]
            production_map_v_r[kp_v_r]["produced_qty"] = p_q_f + float(fg_r_p_r.qty or 0)
            
            bn_p_r_fg = fg_r_p_r.get("batch_no")
            if bn_p_r_fg and bn_p_r_fg not in all_batch_nos_v_r:
                all_batch_nos_v_r.append(bn_p_r_fg)
                if not base_batch_no_v_r:
                    base_batch_no_v_r = bn_p_r_fg
            
            bom_p_r_v = se_p_r.bom_no or frappe.db.get_value("Work Order", se_p_r.work_order, "bom_no")
            if bom_p_r_v:
                bq_raw_v = float(frappe.db.get_value("BOM", bom_p_r_v, "quantity") or 1) or 1
                rm_p_r_list = frappe.get_all("BOM Item", filters={"parent": bom_p_r_v}, fields=["item_code", "item_name", "qty", "stock_uom"])
                for rm_r_p_r in rm_p_r_list:
                    rq_p_r_calc = (float(rm_r_p_r.qty) / bq_raw_v) * float(fg_r_p_r.qty)
                    ig_ref = frappe.db.get_value("Item", rm_r_p_r.item_code, "item_group")
                    if ig_ref and "product" in str(ig_ref).strip().lower():
                        # Ignore FG items in BOM stock entry loop since they are handled exactly by fabric_batch_picks
                        continue
                    if rm_r_p_r.item_code not in consumption_map_v_r:
                        consumption_map_v_r[rm_r_p_r.item_code] = {"item_code": rm_r_p_r.item_code, "item_name": rm_r_p_r.item_name, "uom": rm_r_p_r.stock_uom, "standard_consumption": 0.0, "actual_consumption": 0.0}
                    
                    old_sc_v = consumption_map_v_r[rm_r_p_r.item_code]["standard_consumption"]
                    old_ac_v = consumption_map_v_r[rm_r_p_r.item_code]["actual_consumption"]
                    consumption_map_v_r[rm_r_p_r.item_code]["standard_consumption"] = old_sc_v + rq_p_r_calc
                    consumption_map_v_r[rm_r_p_r.item_code]["actual_consumption"] = old_ac_v + rq_p_r_calc

    core_resp_p = []
    for ic_p in core_totals_v_r:
        qv_p = core_totals_v_r[ic_p]
        core_resp_p.append({"item_code": ic_p, "item_name": frappe.db.get_value("Item", ic_p, "item_name") or ic_p, "uom": "Kg", "quantity": round(qv_p, 3)})
    
    poly_resp_p = []
    for pi_p_v in polybag_totals_v_r:
        pd_p_v_p = polybag_totals_v_r[pi_p_v]
        poly_resp_p.append({"product": pi_p_v, "item_name": frappe.db.get_value("Item", pi_p_v, "item_name") or pi_p_v, "quantity": round(pd_p_v_p["quantity"], 3), "uom": pd_p_v_p["uom"]})
    
    bag_consumables_resp_p = []
    for bi_p_v in bag_consumables_totals_v_r:
        bd_p_v_p = bag_consumables_totals_v_r[bi_p_v]
        bag_consumables_resp_p.append({"item": bi_p_v, "quantity_kgs": round(bd_p_v_p["quantity"], 3), "uom": bd_p_v_p["uom"]})
    
    waste_resp_p = []
    for wk_p_v in wastage_totals_v_r:
        qv_p_w_f = wastage_totals_v_r[wk_p_v]
        waste_resp_p.append({"quality": wk_p_v[0], "colour": wk_p_v[1], "gsm": wk_p_v[2], "width_inch": wk_p_v[3], "wastage_qty_kg": round(qv_p_w_f, 3)})
    
    recyc_resp_p = []
    for rk_p_v in recycle_totals_v_r:
        qv_p_r_c_f = recycle_totals_v_r[rk_p_v]
        recyc_resp_p.append({"quality": rk_p_v[0], "colour": rk_p_v[1], "gsm": rk_p_v[2], "width_inch": rk_p_v[3], "quantity_kgs": round(qv_p_r_c_f, 3), "available_balance": round(qv_p_r_c_f, 3)})

    frappe.response['message'] = { 
        "production_items": list(production_map_v_r.values()), 
        "fg_consumption_items": fg_consumption_list_v_r,
        "consumption_items": list(consumption_map_v_r.values()), 
        "base_batch_no": base_batch_no_v_r, 
        "all_batch_nos": all_batch_nos_v_r, 
        "core_consumption_items": core_resp_p, 
        "polybag_items": poly_resp_p, 
        "wastage_items": waste_resp_p, 
        "recycle_items": recyc_resp_p,
        "bag_consumables": bag_consumables_resp_p
    }
    
    # Debug message to see what the server actually found
    frappe.msgprint(f"DEBUG: Found {len(spr_list_v_r_f)} SPRs. Bag Consumables Data: {bag_consumables_resp_p}")
