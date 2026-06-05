# Server Script for Production Plan
# Script Type: DocType Event
# Reference Document Type: Production Plan
# DocType Event: Before Submit
#
# Paste into ERPNext: Server Script name e.g. wo_generation_in_pp (name in your site may differ).
#
# CRITICAL — safe_exec / RestrictedPython:
# In Server Scripts, `frappe` and `frappe.utils` are NOT the full modules. There is NO
# get_traceback on that stub. Calling frappe.get_traceback() or frappe.utils.get_traceback()
# raises: module has no attribute 'get_traceback'. Use str(e) only for logging and UI.
# The same applies to any Work Order / other Server Scripts that run during wo.insert().

# IMPORTANT:
# Configure this Server Script on "Before Submit" so any error here blocks submission
# and keeps the Production Plan in Draft.
#
# If parent/child items use two PPs linked via custom_custom_linked_plan or
# custom_linked_plan, the on_submit server script (auto_submit_planning_sheet) re-points
# Work Orders so each submitted PP matches its lines. Child FG is often BOM-only (no SO line).

errors = []
planning_sheet_name = (doc.get("custom_planning_sheet") or doc.get("planning_sheet") or "").strip()
planning_sheet_doc = None
planning_sheet_item_codes = set()
planning_sheet_so_item_by_item_code = {}

if planning_sheet_name:
    try:
        planning_sheet_doc = frappe.get_doc("Planning sheet", planning_sheet_name)
    except Exception:
        planning_sheet_doc = None

if planning_sheet_doc:
    ps_map = planning_sheet_doc.as_dict()
    item_fields = ("item_code", "production_item", "fg_item", "finished_good", "parent_item")
    so_item_fields = ("sales_order_item", "so_detail", "so_item", "sales_order_detail")
    for _, rows in ps_map.items():
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            row_item_code = ""
            for fieldname in item_fields:
                row_item_code = (row.get(fieldname) or "").strip()
                if row_item_code:
                    planning_sheet_item_codes.add(row_item_code)
                    break

            if row_item_code and row_item_code not in planning_sheet_so_item_by_item_code:
                for so_field in so_item_fields:
                    so_item = (row.get(so_field) or "").strip()
                    if so_item:
                        planning_sheet_so_item_by_item_code[row_item_code] = so_item
                        break

# Parent SO line for BOM-only child rows: first Planning Sheet row that has both SO + SO detail.
parent_fallback_so = ""
parent_fallback_soi = ""
if planning_sheet_doc:
    try:
        ps_map_pf = planning_sheet_doc.as_dict()
        for _, rows in ps_map_pf.items():
            if not isinstance(rows, list):
                continue
            for row in rows:
                if not isinstance(row, dict):
                    continue
                hdr = (row.get("sales_order") or "").strip()
                line = ""
                for so_field in so_item_fields:
                    v = (row.get(so_field) or "").strip()
                    if v:
                        line = v
                        break
                if hdr and line:
                    parent_fallback_so = hdr
                    parent_fallback_soi = line
                    break
    except Exception:
        pass

if (not parent_fallback_soi or not parent_fallback_so) and planning_sheet_name:
    link_pp = (
        str(doc.get("custom_custom_linked_plan") or doc.get("custom_linked_plan") or "")
    ).strip()
    if link_pp and frappe.db.exists("Production Plan", link_pp):
        try:
            odoc = frappe.get_doc("Production Plan", link_pp)
            for pr in odoc.get("po_items") or []:
                h = (pr.get("sales_order") or "").strip()
                line = (pr.get("sales_order_item") or "").strip()
                if h and line:
                    parent_fallback_so = h
                    parent_fallback_soi = line
                    break
        except Exception:
            pass

items_to_process = []
for row in doc.get("po_items") or []:
    items_to_process.append({"row": row, "is_sub_assembly": False})

for row in doc.get("sub_assembly_items") or []:
    if row.get("type_of_manufacturing") == "Make":
        items_to_process.append({"row": row, "is_sub_assembly": True})

for entry in items_to_process:
    item = entry["row"]
    is_sub_assembly = entry["is_sub_assembly"]
    
    # In sub_assembly_items, the item code field is usually 'production_item' instead of 'item_code'
    item_code = item.get("item_code") or item.get("production_item")
    planned_qty = item.get("planned_qty") or item.get("qty")
    if not item.bom_no:
        errors.append(f"Row for item <b>{item_code}</b> has no BOM linked.")
        continue
    
    try:
        wo = frappe.new_doc("Work Order")
        wo.production_plan = doc.name
        
        if is_sub_assembly:
            wo.production_plan_sub_assembly_item = item.name
        else:
            wo.production_plan_item = item.name
            
        wo.company = doc.company
        wo.production_item = item_code
        wo.bom_no = item.bom_no
        wo.qty = planned_qty
        sales_order = (item.get("sales_order") or "").strip()
        sales_order_item = (item.get("sales_order_item") or "").strip()

        # Multi-level rule:
        # If this item is referenced in the linked Planning Sheet, the Planning Sheet is the driver.
        # Child FG is often BOM-only (not a separate SO line): stamp parent's SO + SO Item on the
        # Production Plan row so "Work Order matched this line" checks pass; WO may still omit
        # sales_order if ERPNext rejects child item against SO line on insert.
        link_pp_nm = (
            str(doc.get("custom_custom_linked_plan") or doc.get("custom_linked_plan") or "")
        ).strip()
        row_soi_empty = not (item.get("sales_order_item") or "").strip()
        is_planning_sheet_driven = (item_code in planning_sheet_item_codes) or (
            bool(link_pp_nm) and row_soi_empty and bool(parent_fallback_soi)
        )
        if is_planning_sheet_driven:
            soi_ps = planning_sheet_so_item_by_item_code.get(item_code, "") or ""
            if not soi_ps:
                soi_ps = parent_fallback_soi
            so_hdr_pp = sales_order
            if not so_hdr_pp and soi_ps:
                so_hdr_pp = (
                    frappe.db.get_value("Sales Order Item", soi_ps, "parent") or parent_fallback_so or ""
                ).strip()
            elif not so_hdr_pp:
                so_hdr_pp = parent_fallback_so

            item.sales_order = so_hdr_pp or ""
            item.sales_order_item = soi_ps or ""

            sales_order = (so_hdr_pp or "").strip()
            sales_order_item = (soi_ps or "").strip()

        # Validate SO early so we fail with a clear message (only when we intend to link SO).
        if sales_order:
            so_docstatus = frappe.db.get_value("Sales Order", sales_order, "docstatus")
            if so_docstatus is None:
                errors.append(
                    f"Item <b>{item_code}</b>: Sales Order <b>{sales_order}</b> does not exist."
                )
                continue
            if int(so_docstatus) != 1:
                errors.append(
                    f"Item <b>{item_code}</b>: Sales Order <b>{sales_order}</b> is not submitted."
                )
                continue

            # If SO Item is not mapped on Production Plan row, auto-resolve only when unique.
            if not sales_order_item:
                so_items = frappe.get_all(
                    "Sales Order Item",
                    filters={"parent": sales_order, "item_code": item_code},
                    fields=["name"],
                    limit=2,
                )
                if len(so_items) == 1:
                    sales_order_item = so_items[0].name
                    item.sales_order_item = sales_order_item
                else:
                    errors.append(
                        f"Item <b>{item_code}</b>: Sales Order Item is missing/ambiguous for "
                        f"Sales Order <b>{sales_order}</b>. Please set <b>sales_order_item</b> on this row."
                    )
                    continue

            # ERPNext: Work Order must not reference a Sales Order Item row for a *different* item.
            # Parent SO line on child FG / BOM-only rows is kept on the Production Plan row above,
            # but the WO must only get sales_order / sales_order_item when the SO line item_code
            # matches this production_item — otherwise insert raises "Sales Order ... is not valid".
            so_line_ic = ""
            if sales_order_item:
                so_line_ic = (
                    frappe.db.get_value("Sales Order Item", sales_order_item, "item_code") or ""
                ).strip()
            targ_ic = (str(item_code).strip() if item_code else "")
            if sales_order_item and so_line_ic == targ_ic:
                wo.sales_order_item = sales_order_item
                so_for_wo = (sales_order or "").strip()
                if not so_for_wo:
                    so_for_wo = (
                        frappe.db.get_value("Sales Order Item", sales_order_item, "parent") or ""
                    ).strip()
                if so_for_wo:
                    wo.sales_order = so_for_wo

        if item.get("project"): wo.project = item.get("project")
        if item.get("description"): wo.description = item.get("description")
        wo.use_multi_level_bom = doc.get("use_multi_level_bom", 0)
        
        # Hardcoded warehouse map per company.
        # Key = exact ERPNext company name. Each company may use different warehouse naming.
        # NOTE: Jayashree Spun Bond entities use short names (no "Warehouse" word).
        COMPANY_WAREHOUSE_MAP = {
            # Jayashree Spun Bond - 1ZT
            "Jayashree Spun Bond - 1ZT": {
                "wip":    "Work In Progress - JSB-1ZT",
                "fg":     "Finished Goods - JSB-1ZT",
            },
            # Jayashree Spun Bond - 2ZS
            "Jayashree Spun Bond - 2ZS": {
                "wip":    "Work In Progress - JSB-2ZS",
                "fg":     "Finished Goods - JSB-2ZS",
            },
            # Thusma SMS Nonwovens Private Limited - 1Z0
            "Thusma SMS Nonwovens Private Limited - 1Z0": {
                "wip":    "Work In Progress Warehouse  - TSNPL",
                "fg":     "Finished Goods Warehouse  - TSNPL",
            },
            # Thusma SMS Nonwoven Private Limited - 2ZZ
            "Thusma SMS Nonwoven Private Limited - 2ZZ": {
                "wip":    "Work In Progress Warehouse  - TSNPL-2ZZ",
                "fg":     "Finished Goods Warehouse  - TSNPL-2ZZ",
            },
            # Thusma T Tex
            "Thusma T Tex": {
                "wip":    "Work In Progress Warehouse  - TTT",
                "fg":     "Finished Goods Warehouse  - TTT",
            },
            # J Vasanth Exports
            "J Vasanth Exports": {
                "wip":    "Work In Progress Warehouse  - JVE",
                "fg":     "Finished Goods Warehouse  - JVE",
            },
            # Avitas Home Textile
            "Avitas Home Textile": {
                "wip":    "Work In Progress Warehouse  - AHT",
                "fg":     "Finished Goods Warehouse  - AHT",
            },
            # Varshine Retails Private Limited
            "Varshine Retails Private Limited": {
                "wip":    "Work In Progress Warehouse  - VRPL",
                "fg":     "Finished Goods Warehouse  - VRPL",
            },
            # Varshine Tex (Puducherry)
            "Varshine Tex (Puducherry)": {
                "wip":    "Work In Progress Warehouse  - VTP",
                "fg":     "Finished Goods Warehouse  - VTP",
            },
            # Varshine Tex (Odisha)
            "Varshine Tex (Odisha)": {
                "wip":    "Work In Progress Warehouse  - VTO",
                "fg":     "Finished Goods Warehouse  - VTO",
            },
        }

        pp_company = (str(doc.get("company") or "")).strip()
        wh_entry = COMPANY_WAREHOUSE_MAP.get(pp_company) or {}
        correct_wip_wh    = wh_entry.get("wip")    or ""
        correct_fg_wh     = wh_entry.get("fg")     or ""

        # Verify each warehouse actually exists in ERPNext before assigning it.
        # If not found, raise a clear error with the exact name so the user can
        # compare with the Warehouse master and correct the hardcoded map.
        missing_wh = []
        if correct_wip_wh and not frappe.db.exists("Warehouse", correct_wip_wh):
            missing_wh.append(f"WIP Warehouse: <b>{correct_wip_wh}</b>")
        if correct_fg_wh and not frappe.db.exists("Warehouse", correct_fg_wh):
            missing_wh.append(f"FG Warehouse: <b>{correct_fg_wh}</b>")

        if missing_wh:
            frappe.throw(
                f"Warehouse(s) not found in ERPNext for company <b>{pp_company}</b>:<br>"
                + "<br>".join(missing_wh)
                + "<br><br>Please verify the exact warehouse names in the <b>Warehouse</b> master "
                "and update the <b>COMPANY_WAREHOUSE_MAP</b> in server script <b>wo_generation_in_pp</b>."
            )

        if correct_wip_wh:
            wo.wip_warehouse = correct_wip_wh
        if correct_fg_wh:
            wo.fg_warehouse = correct_fg_wh

        wo.insert(ignore_permissions=True)

    except Exception as e:
        err_text = str(e)
        # Never use frappe.get_traceback() / frappe.utils.get_traceback() here — not exposed in Server Script safe_exec.
        if "get_traceback" in err_text and "no attribute" in err_text:
            err_text += (
                " Hint: a Server Script (often on Work Order) calls frappe.get_traceback() "
                "or frappe.utils.get_traceback(); those are not available in Server Script safe_exec. "
                "Use str(e) for frappe.log_error and user-facing text."
            )
        try:
            frappe.log_error(
                title=f"Failed to Create Work Order for {item_code}",
                message=err_text,
            )
        except Exception:
            pass
        errors.append(
            f"Failed to create Work Order for <b>{item_code}</b>: {frappe.utils.escape_html(err_text)}"
        )

if errors:
    frappe.throw(
        "<b>Production Plan submission blocked.</b><br>"
        "Fix the following issues and submit again:<br><ul>"
        + "".join([f"<li>{err}</li>" for err in errors])
        + "</ul>"
    )
