planning_sheet = frappe.form_dict.get("planning_sheet")
if not planning_sheet:
    frappe.throw("Planning Sheet not provided")

ps = frappe.get_doc("Planning sheet", planning_sheet)

party_code = str(ps.party_code).strip() if ps.party_code else ""
sales_order = str(ps.sales_order).strip() if ps.sales_order else ""
default_company = frappe.db.get_default("company") or frappe.db.get_value("Global Defaults", None, "default_company")
today = frappe.utils.nowdate()

def get_company_by_unit(unit, default_company):
    if not unit:
        return default_company
    
    u = str(unit).strip().lower()
    
    jsb_units = {
        "unit 1",
        "unit 2",
        "unit 3",
        "jsb - l4 rewinding machine",
        "jsb - l5 rewinding machine"
    }
    thusma_sms_units = {
        "unit 4",
        "tnspl - lamination unit",
        "tsnpl - lamination unit",
        "tsnpl - l3 rewinding machine",
        "tnspl - l3 rewinding machine"
    }
    vasanth_units = {
        "jve - sheet cutting machine",
        "jve - slitting machine",
        "jve - printing machine 2 colour 1600mm",
        "jve - printing machine 4 colour 1600mm",
        "jve-l3 b700 bag making machine",
        "jve-l2 b700 bag making machine",
        "jve-l1 b700 bag making machine"
    }
    varshine_units = {
        "vr - 1200mm bopp printing machine"
    }
    varshine_puducherry_units = {
        "vtp-l1 leader oyang machine",
        "vtp-l2 leader zx machine",
        "vtp - slitting machine",
        "vtp-l4 screen printing machine"
    }
    thusma_t_tex_units = {
        "tt - printing machine 4 colour 1200mm",
        "ttt- l3 - oyang c900 bag making line",
        "ttt- l2 - oyang c700 bag making line",
        "ttt- l1 - oyang c700 bag making line"
    }
    
    if u in jsb_units:
        return "Jayashree Spun Bond - 1ZT"
    elif u in thusma_sms_units:
        return "Thusma SMS Nonwovens Private Limited - 1Z0"
    elif u in vasanth_units:
        return "J Vasanth Exports"
    elif u in varshine_units:
        return "Varshine Retails Private Limited"
    elif u in varshine_puducherry_units:
        return "Varshine Tex (Puducherry)"
    elif u in thusma_t_tex_units:
        return "Thusma T Tex"
        
    return default_company


# 1. FORCE INDIVIDUAL PRODUCTION PLANS (No Grouping)
group_map = {}
row_to_pp_map = {}
idx_to_pp_map = {}

for r in ps.items:
    if not r.unit:
        continue
    units_list = [u.strip() for u in str(r.unit).split(",") if u.strip()]
    quality = (r.custom_quality or "").strip().upper() or "NO_QUALITY"
    color = (r.color or "").strip().upper() or "NO_COLOR"
    
    for unit in units_list:
        key = f"{r.idx}||{unit}||{quality}||{color}"
        group_map.setdefault(key, []).append(r)

# 2. Fetch all EXISTING Production Plans (BOTH Draft and Submitted/Material Requested)
existing_pps = frappe.get_all(
    "Production Plan",
    filters={"custom_planning_sheet": ps.name, "docstatus": ["in", [0, 1]]},
    fields=["name", "custom_unit", "custom_quality", "custom_color", "docstatus"]
)

used_pp_names = []
item_code_to_pp_map = {}
created = []
updated = []
all_pp_list = []
unit_to_pp_map = {}

# 3. Process rows and Map to PPs (Update, Recycle, or Create)
for key, rows in group_map.items():
    parts = key.split("||")
    unit_val = parts[1]
    doc_quality_val = parts[2] if parts[2] != "NO_QUALITY" else ""
    doc_color_val = parts[3] if parts[3] != "NO_COLOR" else ""
    
    company = get_company_by_unit(unit_val, default_company)
    plan_codes = sorted(list(set(str(r.custom_plan_code).strip() for r in rows if r.custom_plan_code)))
    
    matched_pp_name = None
    
    for ex in existing_pps:
        if ex.name in used_pp_names: continue
        ex_unit = (ex.get("custom_unit") or "").strip()
        ex_qual = (ex.get("custom_quality") or "").strip().upper() or "NO_QUALITY"
        ex_col = (ex.get("custom_color") or "").strip().upper() or "NO_COLOR"
        
        if ex_unit == unit_val and ex_qual == doc_quality_val and ex_col == doc_color_val:
            matched_pp_name = ex.name
            break
    
    if not matched_pp_name:
        for ex in existing_pps:
            if ex.name not in used_pp_names:
                matched_pp_name = ex.name
                break

    if matched_pp_name:
        pp = frappe.get_doc("Production Plan", matched_pp_name)
        used_pp_names.append(pp.name)
    else:
        pp = frappe.new_doc("Production Plan")
        pp.company = company
        pp.posting_date = today
        pp.sales_order = sales_order
        pp.custom_planning_sheet = ps.name

    # ONLY modify and save the document if it is still a Draft (docstatus == 0)
    # If it is submitted (Material Requested), we leave it alone but keep it mapped!
    # FIXED: Replaced blocked getattr() with safe .get() method.
    if pp.get("docstatus", 0) == 0:
        if matched_pp_name:
            pp.set("po_items", [])
            updated.append(pp.name)
            
        pp.flags.ignore_mandatory = True
        pp.company = company
        pp.custom_party_code = party_code
        pp.custom_unit = unit_val
        pp.custom_quality = doc_quality_val
        pp.custom_color = doc_color_val
        pp.custom_plan_code = ", ".join(plan_codes)

        for r in rows:
            planned_qty = float(r.qty or 0)
            if planned_qty <= 0: continue

            item_code = r.item_code
            bom = frappe.db.get_value("BOM", {"item": item_code, "is_active": 1, "is_default": 1}, "name") or \
                  frappe.db.get_value("BOM", {"item": item_code, "is_active": 1}, "name")
            item_uom = frappe.db.get_value("Item", item_code, "stock_uom") or "Kg"

            pp.append("po_items", {
                "item_code": item_code,
                "bom_no": bom,
                "planned_qty": planned_qty,
                "uom": item_uom,
                "stock_uom": item_uom,
                "sales_order": sales_order,
                "sales_order_item": str(r.sales_order_item or "").strip(),
                "description": r.description or r.item_name,
                "custom_party_code": party_code,
                "custom_unit": unit_val,
                "custom_quality": doc_quality_val,
                "custom_color": r.color or "",
                "custom_planning_sheet": ps.name,
                "custom_gsm": float(r.gsm or 0),
                "custom_width_": float(r.width_inch or 0),
                "custom_meterperroll": float(r.meter_per_roll or 0),
                "custom_weight_per_roll": float(r.weight_per_roll or 0),
                "custom_no_of_rolls": int(r.no_of_rolls or 0),
            })

        pp.save(ignore_permissions=True)
        if not matched_pp_name:
            created.append(pp.name)

    # Map the references regardless of whether it's draft or submitted
    all_pp_list.append(pp.name)
    unit_to_pp_map.setdefault(unit_val, []).append(pp.name)
    
    for r in rows:
        if r.name:
            row_to_pp_map[r.name] = pp.name
        idx_to_pp_map[r.idx] = pp.name
        item_code_to_pp_map[r.item_code] = pp.name
        r.db_set("order_sheet", pp.name)

# 4. Cross-link Production Plans using custom_parent_child_trace_id
trace_id_to_pps = {}
pt_items_board = ps.get("planned_items") or []
source_to_trace_id = {}

for pt in pt_items_board:
    trace_id = str(pt.get("custom_parent_child_trace_id") or "").strip()
    src = str(pt.get("source_item") or "").strip()
    if trace_id and src:
        source_to_trace_id[src] = trace_id

for r in ps.items:
    pp_name = row_to_pp_map.get(r.name) if r.name else idx_to_pp_map.get(r.idx)
    if not pp_name: continue
    trace_id = (
        str(r.get("custom_parent_child_trace_id") or "").strip()
        or source_to_trace_id.get(r.name, "")
        or source_to_trace_id.get(r.item_code, "")
    )
    if trace_id:
        trace_id_to_pps.setdefault(trace_id, set()).add(pp_name)

for trace_id, pp_set in trace_id_to_pps.items():
    if len(pp_set) < 2: continue
    pp_list = sorted(pp_set)
    for pp_name in pp_list:
        others = ", ".join(p for p in pp_list if p != pp_name)
        frappe.db.set_value("Production Plan", pp_name, "custom_custom_linked_plan", others)

# 5. CLEANUP: Delete any unused Production Plans (ONLY if they are Drafts)
for ex in existing_pps:
    if ex.name not in used_pp_names:
        if ex.get("docstatus", 0) == 0:
            frappe.delete_doc("Production Plan", ex.name, ignore_permissions=True)

# 6. PERFECT MIRROR UPDATE (Bottom Table perfectly lines up with Top Table)
pt_items = ps.get("planned_items") or []

for i, pt in enumerate(pt_items):
    assigned_pp = ""
    
    if i < len(ps.items):
        corresponding_top_row = ps.items[i]
        assigned_pp = idx_to_pp_map.get(corresponding_top_row.idx)
        
    if not assigned_pp:
        src = str(pt.get("source_item") or "").strip()
        if src and src in row_to_pp_map:
            assigned_pp = row_to_pp_map[src]

    if assigned_pp:
        pt.db_set("order_sheet", assigned_pp)

full_pp_string = ", ".join(sorted(set(all_pp_list)))
final_order_sheet_val = (full_pp_string[:137] + "...") if len(full_pp_string) > 140 else full_pp_string

ps.db_set("planning_status", "Finalized")
ps.db_set("order_sheet", final_order_sheet_val)

frappe.db.commit()

frappe.response["message"] = {
    "success": True,
    "created": list(set(created)),
    "updated": list(set(updated)),
    "production_plans": list(set(all_pp_list))
}