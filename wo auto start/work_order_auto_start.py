# Server Script for Work Order
# Type: DocType Event
# Reference DocType: Work Order
# Event: After Insert
#
# Do NOT call frappe.get_traceback() or frappe.utils.get_traceback() in any Server Script:
# safe_exec exposes a stub frappe.utils without get_traceback → "module has no attribute 'get_traceback'".

# Only run if created from a Production Plan
if doc.production_plan:
    try:
        # Auto-start only when Production Plan custom_unit is Unit 1–4 (spacing optional).
        pp_raw = (
            frappe.db.get_value("Production Plan", doc.production_plan, "custom_unit") or ""
        ).strip().lower()
        pp_compact = pp_raw.replace(" ", "")
        allow_auto_start = pp_raw in ("unit 1", "unit 2", "unit 3", "unit 4") or pp_compact in (
            "unit1",
            "unit2",
            "unit3",
            "unit4",
        )   

        # 1. Set Default Warehouses (Update object directly so child items can inherit)
        # Avoid calling doc.save() inside After Insert to prevent recursive validation errors
        
        # Build mapping of raw material item to its specific warehouse and required quantity
        item_wh_map = {}
        item_qty_map = {}
        if doc.production_plan:
            mr_items = frappe.get_all("Material Request Plan Item", filters={"parent": doc.production_plan}, fields=["item_code", "warehouse", "required_qty"])
            for mr in mr_items:
                if mr.warehouse:
                    item_wh_map[mr.item_code] = mr.warehouse
                if mr.required_qty is not None:
                    item_qty_map[mr.item_code] = mr.required_qty

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

        wo_company = (str(doc.get("company") or "")).strip()
        wh_entry = COMPANY_WAREHOUSE_MAP.get(wo_company) or {}
        correct_wip_wh    = wh_entry.get("wip")    or ""
        correct_fg_wh     = wh_entry.get("fg")     or ""

        if correct_wip_wh:
            doc.wip_warehouse = correct_wip_wh
        if correct_fg_wh:
            doc.fg_warehouse = correct_fg_wh

        wh_update = {}
        if doc.source_warehouse:
            wh_update["source_warehouse"] = doc.source_warehouse
        if doc.wip_warehouse:
            wh_update["wip_warehouse"] = doc.wip_warehouse
        if doc.fg_warehouse:
            wh_update["fg_warehouse"] = doc.fg_warehouse
        if wh_update:
            frappe.db.set_value("Work Order", doc.name, wh_update, update_modified=False)

        # Force update child items to their specific warehouse and exact qty from the plan
        for item in doc.get("required_items") or []:
            mapped_wh = item_wh_map.get(item.item_code)
            mapped_qty = item_qty_map.get(item.item_code)
            
            updates = {}
            if mapped_wh and item.source_warehouse != mapped_wh:
                item.source_warehouse = mapped_wh
                updates["source_warehouse"] = mapped_wh
                
            if mapped_qty is not None and item.required_qty != mapped_qty:
                item.required_qty = mapped_qty
                updates["required_qty"] = mapped_qty
                
            if updates:
                frappe.db.set_value("Work Order Item", item.name, updates, update_modified=False)

        # Guard: when WOs are created during Production Plan "Before Submit",
        # the Production Plan is still Draft. Do NOT auto-start in that phase.
        pp_docstatus = frappe.db.get_value("Production Plan", doc.production_plan, "docstatus")
        if pp_docstatus is None or int(pp_docstatus) != 1:
            frappe.msgprint(
                f"Auto-start skipped for Work Order <b>{doc.name}</b> because Production Plan "
                f"<b>{doc.production_plan}</b> is not submitted yet."
            )
            raise SystemExit
        
        if not allow_auto_start:
            frappe.msgprint(
                f"Auto-start skipped for Work Order <b>{doc.name}</b>: Production Plan "
                f"<b>custom_unit</b> is <b>{pp_raw or '(empty)'}</b>. Only "
                f"<b>Unit 1</b>, <b>Unit 2</b>, <b>Unit 3</b>, or <b>Unit 4</b> auto-start.",
                indicator="orange",
            )
        else:
            # 2. Pre-submit raw material availability check
            source_wh = doc.source_warehouse or "Raw Materials - JSB-1ZT"
            shortages = []
            for item in doc.get("required_items") or []:
                required_qty = item.required_qty or 0
                item_wh = item.source_warehouse or source_wh
                actual_qty = frappe.db.get_value(
                    "Bin",
                    {"item_code": item.item_code, "warehouse": item_wh},
                    "actual_qty"
                ) or 0
                if actual_qty < required_qty:
                    shortages.append(
                        f"<li><b>{item.item_code}</b> — Required: {required_qty} {item.stock_uom}, "
                        f"Available: {actual_qty} {item.stock_uom} "
                        f"(Short by: {round(required_qty - actual_qty, 3)} {item.stock_uom})</li>"
                    )

            if shortages:
                shortage_list = "".join(shortages)
                # ⚠️ WARN but do NOT block — the material transfer will fail
                # gracefully later if stock is genuinely missing. Blocking here
                # prevents the WO from being created, which is undesirable.
                frappe.msgprint(
                    f"⚠️ <b>Stock shortage for Work Order {doc.name}:</b><br>"
                    f"Insufficient raw materials in <b>{source_wh}</b>:<br><ul>{shortage_list}</ul>"
                    f"The Work Order will still be submitted. Please replenish stock "
                    f"and perform the material transfer manually if needed.",
                    title="Raw Material Warning",
                    indicator="orange",
                )

            # 3. Submit the Work Order
            if doc.docstatus == 0:
                try:
                    doc.flags.ignore_permissions = True
                    doc.submit()
                    doc.reload()
                    
                    # FIX: Restore exact quantities from Production Plan that standard submit() / validate() overwrote
                    for req_item in doc.get("required_items") or []:
                        mapped_qty = item_qty_map.get(req_item.item_code)
                        if mapped_qty is not None:
                            frappe.db.set_value(
                                "Work Order Item", 
                                req_item.name, 
                                {"required_qty": mapped_qty, "original_qty": mapped_qty}, 
                                update_modified=False
                            )
                            req_item.required_qty = mapped_qty

                except Exception as e:
                    frappe.log_error(title=f"Doc Submit Error for WO {doc.name}", message=str(e))
                    # If it fails to submit, we can't start production, docstatus will remain 0
            
            # 3. Create & Submit Material Transfer (The "Start Production" Step)
            if doc.docstatus == 1:
                # Check if a Stock Entry already exists to prevent duplicate transfers
                if not frappe.db.exists("Stock Entry", {"work_order": doc.name, "purpose": "Material Transfer for Manufacture"}):
                    se = frappe.new_doc("Stock Entry")
                    se.purpose = "Material Transfer for Manufacture"
                    se.stock_entry_type = "Material Transfer for Manufacture"
                    se.work_order = doc.name
                    se.company = doc.company
                    # Fallback to first required item's source warehouse if doc.source_warehouse is empty
                    from_wh = doc.source_warehouse
                    if not from_wh:
                        for req_item in doc.get("required_items") or []:
                            if req_item.source_warehouse:
                                from_wh = req_item.source_warehouse
                                break
                    se.from_warehouse = from_wh or "Raw Materials - JSB-1ZT"
                    se.to_warehouse = doc.wip_warehouse
                    se.fg_completed_qty = doc.qty
                    # ERPNext v15: use old-style batch_no/serial_no fields
                    se.use_serial_batch_fields = 1
                    # Pull items from the Work Order BOM
                    try:
                        se.get_items() 
                    except Exception as e:
                        frappe.log_error(title=f"Stock Entry Pull Error for {doc.name}", message=str(e))
                
                    # CRITICAL: Ensure work_order and warehouses are linked on EVERY item row
                    for item in se.items:
                        if not item.work_order:
                            item.work_order = doc.name
                        if not item.s_warehouse:
                            item.s_warehouse = item_wh_map.get(item.item_code) or doc.source_warehouse
                        if not item.t_warehouse:
                            item.t_warehouse = doc.wip_warehouse

                        # ERPNext v15: required on every item row as well
                        item.use_serial_batch_fields = 1

                        # Auto-fill batch_no for batch-tracked items.
                        # ERPNext throws "Serial No / Batch No are mandatory" if missing.
                        if not item.batch_no:
                            has_batch = frappe.db.get_value("Item", item.item_code, "has_batch_no")
                            if has_batch:
                                # Attempt 1: oldest batch with positive qty via SLE
                                batch_rows = frappe.db.sql(
                                    """
                                    SELECT sle.batch_no, SUM(sle.actual_qty) AS qty
                                    FROM `tabStock Ledger Entry` sle
                                    WHERE sle.item_code = %s
                                      AND sle.warehouse = %s
                                      AND sle.is_cancelled = 0
                                      AND sle.batch_no IS NOT NULL
                                      AND sle.batch_no != ''
                                    GROUP BY sle.batch_no
                                    HAVING SUM(sle.actual_qty) > 0
                                    ORDER BY MIN(sle.creation) ASC
                                    LIMIT 1
                                    """,
                                    (item.item_code, item.s_warehouse),
                                    as_dict=True,
                                )
                                if batch_rows:
                                    item.batch_no = batch_rows[0].batch_no
                                else:
                                    # Attempt 2: any active batch for this item
                                    fallback = frappe.db.get_value(
                                        "Batch",
                                        {"item": item.item_code, "disabled": 0},
                                        "name",
                                        order_by="creation asc",
                                    )
                                    if fallback:
                                        item.batch_no = fallback


                    # Fallback: if get_items didn't pull anything, manually populate
                    if not se.items:
                        for row in doc.get("required_items") or []:
                            se.append("items", {
                                "item_code": row.item_code,
                                "qty": row.required_qty,
                                "transfer_qty": row.required_qty,
                                "uom": row.stock_uom,
                                "stock_uom": row.stock_uom,
                                "s_warehouse": row.source_warehouse or doc.source_warehouse,
                                "t_warehouse": doc.wip_warehouse,
                                "conversion_factor": 1,
                                "work_order": doc.name
                            })

                    if se.items:
                        se.flags.ignore_permissions = True
                        try:
                            se.insert()
                            se.submit()
                        
                            # 4. Finalize Work Order (Hide Button & Fix UI Sync)
                            doc.reload()
                            # Force update the fields that hide the "Start Production" button
                            frappe.db.set_value("Work Order", doc.name, {
                                "material_transferred_for_manufacturing": doc.qty,
                                "status": "In Process"
                            }, update_modified=True)
                        
                            try:
                                frappe.db.set_value("Work Order", doc.name, "actual_start_date", frappe.utils.now_datetime(), update_modified=True)
                            except Exception:
                                pass
                        
                            # 5. Show Requested Message
                            frappe.msgprint(f"✅ <b>Auto-Started!</b><br>Stock Entry: <b>{se.name}</b>")
                        except Exception as e:
                            frappe.log_error(title=f"Stock Entry Create Error for {doc.name}", message=str(e))
                            frappe.msgprint(f"⚠️ Stock Entry failed to create for Work Order <b>{doc.name}</b>. Check Error Log.", indicator="orange")
                    else:
                        frappe.msgprint(f"Warning: No items found to transfer for {doc.name}.")
    except ValueError as ve:
        if str(ve) == "STOP_SCRIPT":
            pass
        else:
            frappe.log_error(title=f"Auto Start Error for WO {doc.name}", message=str(ve))
            frappe.msgprint(f"⚠️ Auto-start encountered an error for <b>{doc.name}</b>. It was created, but please verify manually.", indicator="orange")
    except Exception as e:
        frappe.log_error(title=f"Auto Start Error for WO {doc.name}", message=str(e))
        frappe.msgprint(f"⚠️ Auto-start encountered an error for <b>{doc.name}</b>. It was created, but please verify manually.", indicator="orange")
