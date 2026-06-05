"""
Server Script: Auto-submit linked Planning Sheet when Production Plan is submitted.

DocType Event
- Reference DocType: Production Plan
- Event: on_submit (or After Save with guard docstatus==1)

Notes
- Uses only doc.get() (safe_exec limitation).
- Planning Sheet is submitted only after ALL linked Production Plans are submitted.
- Parent/child split: Sales Order lines usually carry only the parent FG. The child FG
  exists on the parent's BOM and gets its own Production Plan. The two PPs are paired
  via custom_custom_linked_plan (or custom_linked_plan). Validators may still expect
  SO linkage on the child plan line — that mismatch is a common cause of "no Work Order
  matched this line" for the child item code.
- On each PP submit, this script re-links Work Orders across linked PPs / same Planning Sheet.
"""

# If you added a specific option to Planning sheet → planning_status, set it here.
STATUS_AFTER_PP = "Finalized"

# IMPORTANT for Server Script safe-exec:
# Keep logic inline (avoid helper function scoping NameError).
pp_name = (str(doc.get("name")) if doc.get("name") is not None else "").strip()
pl_name = (str(doc.get("custom_planning_sheet") or doc.get("planning_sheet") or "")).strip()

if not pl_name:
    frappe.throw(
        "No Planning Sheet linked. Set <b>custom_planning_sheet</b> or <b>planning_sheet</b> on this Production Plan."
    )
else:
    if not frappe.db.exists("Planning sheet", pl_name):
        frappe.throw(
            f"Planning Sheet <b>{pl_name}</b> does not exist."
        )
    else:
        ps = frappe.get_doc("Planning sheet", pl_name)

        # If this Planning Sheet is split into multiple Production Plans,
        # submit the Planning Sheet only when ALL related Production Plans are submitted.
        linked_pps = frappe.get_all(
            "Production Plan",
            filters={
                "custom_planning_sheet": pl_name,
                "docstatus": ("!=", 2),
            },
            fields=["name", "docstatus"],
            limit=0,
        )
        # Fallback if the field used is "planning_sheet" instead of "custom_planning_sheet"
        if not linked_pps:
            linked_pps = frappe.get_all(
                "Production Plan",
                filters={
                    "planning_sheet": pl_name,
                    "docstatus": ("!=", 2),
                },
                fields=["name", "docstatus"],
                limit=0,
            )

        # If this PP is not picked up by planning-sheet filters (field mismatch), still repair this doc.
        if not linked_pps and pp_name:
            linked_pps = frappe.get_all(
                "Production Plan",
                filters={"name": pp_name},
                fields=["name", "docstatus"],
                limit=1,
            )

        # Guard: WO may exist only on custom_linked_plan or another PP for the same Planning Sheet.
        wo_plan_candidates = []
        if pp_name:
            wo_plan_candidates.append(pp_name)
        link_pp = (
            str(doc.get("custom_custom_linked_plan") or doc.get("custom_linked_plan") or "")
        ).strip()
        if link_pp:
            wo_plan_candidates.append(link_pp)
        if linked_pps:
            for lp_cand in linked_pps:
                if lp_cand.name and lp_cand.name not in wo_plan_candidates:
                    wo_plan_candidates.append(lp_cand.name)
        has_wo = False
        for pname in wo_plan_candidates:
            if pname and frappe.db.exists(
                "Work Order", {"production_plan": pname, "docstatus": ("!=", 2)}
            ):
                has_wo = True
                break
        if pp_name and not has_wo:
            frappe.throw(
                "Skipped Planning Sheet auto-submit because no Work Orders exist for this Planning Sheet yet "
                "(checked this Production Plan, linked-plan fields, and other plans on the same sheet). "
                "Create Work Orders (or fix item/Sales Order line mapping) and try again."
            )

        # ------------------------------------------------------------------
        # REPAIR (runs on every PP submit): Parent/child often use two PPs
        # tied by custom_custom_linked_plan or custom_linked_plan. The WO may be created on the linked PP
        # while a po_items / sub_assembly row still lives on the other PP.
        # ERPNext / Planning Sheet validation expects WO.production_plan and
        # production_plan_item (or production_plan_sub_assembly_item) to match
        # that row. When there is only one such row for an item across all PPs
        # on this Planning Sheet, re-point the WO to the correct PP + row.
        # ------------------------------------------------------------------
        po_item_row_counts = {}
        sa_row_counts = {}
        try:
            for lp_cnt in linked_pps or []:
                pp_cnt = frappe.get_doc("Production Plan", lp_cnt.name)
                for pr in pp_cnt.get("po_items") or []:
                    ic = pr.item_code
                    po_item_row_counts[ic] = po_item_row_counts.get(ic, 0) + 1
                for sr in pp_cnt.get("sub_assembly_items") or []:
                    if sr.get("type_of_manufacturing") != "Make":
                        continue
                    pic = sr.get("production_item") or sr.get("item_code")
                    if not pic:
                        continue
                    sa_row_counts[pic] = sa_row_counts.get(pic, 0) + 1
        except Exception:
            pass

        # Parent SO line for BOM-only child rows (same idea as production_plan_auto_generate).
        repair_parent_so = ""
        repair_parent_soi = ""
        try:
            psfb = frappe.get_doc("Planning sheet", pl_name)
            so_item_fields_fb = (
                "sales_order_item",
                "so_detail",
                "so_item",
                "sales_order_detail",
            )
            for _, rows in psfb.as_dict().items():
                if not isinstance(rows, list):
                    continue
                for row in rows:
                    if not isinstance(row, dict):
                        continue
                    hbu = (row.get("sales_order") or "").strip()
                    lbu = ""
                    for sf in so_item_fields_fb:
                        vv = (row.get(sf) or "").strip()
                        if vv:
                            lbu = vv
                            break
                    if hbu and lbu:
                        repair_parent_so = hbu
                        repair_parent_soi = lbu
                        break
        except Exception:
            pass

        try:
            cluster_pp_names = []
            for lp_c in linked_pps or []:
                if lp_c.name and lp_c.name not in cluster_pp_names:
                    cluster_pp_names.append(lp_c.name)

            for linked_pp_rep in linked_pps or []:
                if int(linked_pp_rep.docstatus) != 1:
                    continue
                pp_doc = frappe.get_doc("Production Plan", linked_pp_rep.name)
                plan_search = [pp_doc.name]
                fwd_rep = (
                    str(
                        pp_doc.get("custom_custom_linked_plan")
                        or pp_doc.get("custom_linked_plan")
                        or ""
                    )
                ).strip()
                if fwd_rep and fwd_rep not in plan_search:
                    plan_search.append(fwd_rep)
                for rev_rep in frappe.get_all(
                    "Production Plan",
                    filters={
                        "custom_linked_plan": pp_doc.name,
                        "docstatus": ("!=", 2),
                    },
                    pluck="name",
                ):
                    if rev_rep and rev_rep not in plan_search:
                        plan_search.append(rev_rep)
                for rev_rep in frappe.get_all(
                    "Production Plan",
                    filters={
                        "custom_custom_linked_plan": pp_doc.name,
                        "docstatus": ("!=", 2),
                    },
                    pluck="name",
                ):
                    if rev_rep and rev_rep not in plan_search:
                        plan_search.append(rev_rep)
                for pn_sheet in cluster_pp_names:
                    if pn_sheet and pn_sheet not in plan_search:
                        plan_search.append(pn_sheet)

                for po_row in pp_doc.get("po_items") or []:
                    ic = po_row.item_code
                    soi_row = (str(po_row.get("sales_order_item") or "")).strip()
                    so_hdr = (str(po_row.get("sales_order") or "")).strip()
                    if not soi_row and repair_parent_soi:
                        soi_row = repair_parent_soi
                    if not so_hdr and repair_parent_so:
                        so_hdr = repair_parent_so
                    if soi_row and not so_hdr:
                        so_hdr = (
                            frappe.db.get_value("Sales Order Item", soi_row, "parent") or ""
                        ).strip()
                    if soi_row or so_hdr:
                        try:
                            frappe.db.set_value(
                                "Production Plan Item",
                                po_row.name,
                                {"sales_order": so_hdr, "sales_order_item": soi_row},
                                update_modified=False,
                            )
                        except Exception:
                            pass

                    # Strongest link: WO already points at this po_items row id (unique in DB).
                    wo_name = frappe.db.get_value(
                        "Work Order",
                        {"production_plan_item": po_row.name, "docstatus": ("!=", 2)},
                        "name",
                    )
                    if wo_name:
                        upd = {
                            "production_plan": pp_doc.name,
                            "production_item": ic,
                            "production_plan_sub_assembly_item": None,
                        }
                        if soi_row:
                            upd["sales_order_item"] = soi_row
                        if so_hdr:
                            upd["sales_order"] = so_hdr
                        frappe.db.set_value(
                            "Work Order",
                            wo_name,
                            upd,
                            update_modified=False,
                        )
                        continue

                    wo_name = frappe.db.get_value(
                        "Work Order",
                        {
                            "production_plan": pp_doc.name,
                            "production_item": ic,
                            "docstatus": ("!=", 2),
                        },
                        "name",
                    )
                    if not wo_name:
                        for alt in plan_search:
                            if alt == pp_doc.name:
                                continue
                            if not alt or not frappe.db.exists("Production Plan", alt):
                                continue
                            cands = frappe.get_all(
                                "Work Order",
                                filters={
                                    "production_plan": alt,
                                    "production_item": ic,
                                    "docstatus": ("!=", 2),
                                },
                                fields=["name", "sales_order_item"],
                                limit=20,
                            )
                            if not cands:
                                continue
                            pick = None
                            if soi_row:
                                for c in cands:
                                    if (str(c.get("sales_order_item") or "")).strip() == soi_row:
                                        pick = c.get("name")
                                        break
                            if not pick and len(cands) == 1:
                                pick = cands[0].get("name")
                            if not pick:
                                pick = cands[0].get("name")
                            wo_name = pick
                            break

                    if not wo_name:
                        continue
                    cur_plan = frappe.db.get_value("Work Order", wo_name, "production_plan")
                    single_po = int(po_item_row_counts.get(ic, 0) or 0) == 1
                    if cur_plan == pp_doc.name:
                        upd = {"production_plan_item": po_row.name}
                        if soi_row:
                            upd["sales_order_item"] = soi_row
                        if so_hdr:
                            upd["sales_order"] = so_hdr
                        frappe.db.set_value(
                            "Work Order",
                            wo_name,
                            upd,
                            update_modified=False,
                        )
                    elif single_po:
                        upd = {
                            "production_plan": pp_doc.name,
                            "production_plan_item": po_row.name,
                            "production_plan_sub_assembly_item": None,
                        }
                        if soi_row:
                            upd["sales_order_item"] = soi_row
                        if so_hdr:
                            upd["sales_order"] = so_hdr
                        frappe.db.set_value(
                            "Work Order",
                            wo_name,
                            upd,
                            update_modified=False,
                        )

                for sa_row in pp_doc.get("sub_assembly_items") or []:
                    if sa_row.get("type_of_manufacturing") != "Make":
                        continue
                    ic = sa_row.get("production_item") or sa_row.get("item_code")
                    if not ic:
                        continue
                    soi_sa = (str(sa_row.get("sales_order_item") or "")).strip()
                    so_hdr_sa = (str(sa_row.get("sales_order") or "")).strip()

                    wo_name = frappe.db.get_value(
                        "Work Order",
                        {
                            "production_plan_sub_assembly_item": sa_row.name,
                            "docstatus": ("!=", 2),
                        },
                        "name",
                    )
                    if wo_name:
                        upd = {
                            "production_plan": pp_doc.name,
                            "production_item": ic,
                            "production_plan_item": None,
                        }
                        if soi_sa:
                            upd["sales_order_item"] = soi_sa
                        if so_hdr_sa:
                            upd["sales_order"] = so_hdr_sa
                        frappe.db.set_value(
                            "Work Order",
                            wo_name,
                            upd,
                            update_modified=False,
                        )
                        continue

                    wo_name = frappe.db.get_value(
                        "Work Order",
                        {
                            "production_plan": pp_doc.name,
                            "production_item": ic,
                            "docstatus": ("!=", 2),
                        },
                        "name",
                    )
                    if not wo_name:
                        for alt in plan_search:
                            if alt == pp_doc.name:
                                continue
                            if not alt or not frappe.db.exists("Production Plan", alt):
                                continue
                            cands = frappe.get_all(
                                "Work Order",
                                filters={
                                    "production_plan": alt,
                                    "production_item": ic,
                                    "docstatus": ("!=", 2),
                                },
                                fields=["name", "sales_order_item"],
                                limit=20,
                            )
                            if not cands:
                                continue
                            pick = None
                            if soi_sa:
                                for c in cands:
                                    if (str(c.get("sales_order_item") or "")).strip() == soi_sa:
                                        pick = c.get("name")
                                        break
                            if not pick and len(cands) == 1:
                                pick = cands[0].get("name")
                            if not pick:
                                pick = cands[0].get("name")
                            wo_name = pick
                            break

                    if not wo_name:
                        continue
                    cur_plan = frappe.db.get_value("Work Order", wo_name, "production_plan")
                    single_sa = int(sa_row_counts.get(ic, 0) or 0) == 1
                    if cur_plan == pp_doc.name:
                        upd = {"production_plan_sub_assembly_item": sa_row.name}
                        if soi_sa:
                            upd["sales_order_item"] = soi_sa
                        if so_hdr_sa:
                            upd["sales_order"] = so_hdr_sa
                        frappe.db.set_value(
                            "Work Order",
                            wo_name,
                            upd,
                            update_modified=False,
                        )
                    elif single_sa:
                        upd = {
                            "production_plan": pp_doc.name,
                            "production_plan_sub_assembly_item": sa_row.name,
                            "production_plan_item": None,
                        }
                        if soi_sa:
                            upd["sales_order_item"] = soi_sa
                        if so_hdr_sa:
                            upd["sales_order"] = so_hdr_sa
                        frappe.db.set_value(
                            "Work Order",
                            wo_name,
                            upd,
                            update_modified=False,
                        )
        except Exception:
            pass

        if linked_pps:
            not_submitted = [p.name for p in linked_pps if int(p.docstatus) != 1]
            if not_submitted:
                frappe.msgprint(
                    "Planning Sheet <b>"
                    + pl_name
                    + "</b> not submitted yet because these Production Plans are still not submitted: <b>"
                    + ", ".join(not_submitted)
                    + "</b>.",
                    indicator="orange",
                )
                # Do not attempt Planning Sheet submission yet.
                submit_ok = False
            else:
                submit_ok = True
        else:
            # If we cannot find linked Production Plans, fall back to previous behavior.
            submit_ok = True

        # Validate linked Sales Order on Planning Sheet (if any)
        sales_order = (
            (str(ps.get("sales_order")) if ps.get("sales_order") is not None else "").strip()
            or (str(ps.get("custom_sales_order")) if ps.get("custom_sales_order") is not None else "").strip()
            or (str(ps.get("order_no")) if ps.get("order_no") is not None else "").strip()
            or (str(ps.get("order_number")) if ps.get("order_number") is not None else "").strip()
        )
        if sales_order and submit_ok:
            so_docstatus = frappe.db.get_value("Sales Order", sales_order, "docstatus")
            if so_docstatus is None:
                frappe.throw(
                    f"Linked Sales Order <b>{sales_order}</b> does not exist. "
                    "Please correct the Planning Sheet and try again."
                )
            if int(so_docstatus) != 1:
                frappe.throw(
                    f"Linked Sales Order <b>{sales_order}</b> is not submitted. "
                    "Submit the Sales Order first, then submit the Production Plan."
                )

        # Only try to submit the Planning Sheet when allowed by the linked-PP check.
        if submit_ok and ps.docstatus == 0:
            try:
                ps.submit()
                frappe.msgprint(
                    f"Planning Sheet <b>{pl_name}</b> submitted.",
                    indicator="green",
                )
            except Exception as e:
                # Log but NEVER re-throw — the Production Plan has already submitted.
                # The Planning Sheet can be submitted manually if needed.
                frappe.log_error(
                    title=f"Planning Sheet submit failed: {pl_name}",
                    message=str(e),
                )
        elif submit_ok and ps.docstatus != 0:
            frappe.msgprint(
                f"Planning Sheet <b>{pl_name}</b> was already submitted.",
                indicator="blue",
            )

        # Only update status if submit succeeded (or it was already submitted).
        if STATUS_AFTER_PP and submit_ok:
            try:
                frappe.db.set_value(
                    "Planning sheet",
                    pl_name,
                    "planning_status",
                    STATUS_AFTER_PP,
                    update_modified=True,
                )
            except Exception as e:
                frappe.log_error(
                    title=f"Planning Sheet status update failed: {pl_name}",
                    message=str(e),
                )

        # ---------------------------------------------------------------
        # Auto-start Work Orders AFTER Production Plan submit.
        # Only when custom_unit is Unit 1, Unit 2, Unit 3, or Unit 4 (case-insensitive; "unit1" ok).
        # Other units: no submit/Material Transfer here (start manually if needed).
        # Raw material shortfall is warned only; it does not block PP submit.
        # ---------------------------------------------------------------
        pp_raw = (str(doc.get("custom_unit") or "")).strip().lower()
        pp_compact = pp_raw.replace(" ", "")
        allow_auto_start_pp = pp_raw in ("unit 1", "unit 2", "unit 3", "unit 4") or pp_compact in (
            "unit1",
            "unit2",
            "unit3",
            "unit4",
        )

        # Raw material table vs projected qty — informational only (do NOT block PP submit).
        # This script runs on on_submit; blocking here cannot prevent stock issues anyway.
        # Parent/child split PPs and BOM-only items often show false "shortages" on mr_items.
        shortages = []
        for mr_item in doc.get("mr_items") or []:
            if float(mr_item.get("quantity") or 0) > 0:
                is_raw_material = mr_item.item_code.startswith(("PP", "MB", "SA", "RM"))
                reqd_bom_qty = float(mr_item.get("required_bom_qty") or 0)
                proj_qty = float(mr_item.get("projected_qty") or 0)
                if is_raw_material and proj_qty < reqd_bom_qty:
                    if mr_item.item_code not in shortages:
                        shortages.append(mr_item.item_code)

        if shortages:
            frappe.msgprint(
                "<b>Possible raw material shortfall (not blocking submit):</b><br>"
                + "<br>".join(shortages)
                + "<br><br>Verify stock and material transfer; replenish if needed.",
                title="Raw material check",
                indicator="orange",
            )

        if allow_auto_start_pp:
            # Include both Draft and Submitted WOs; some flows submit WO but skip "start" step.
            wo_names = frappe.get_all(
                "Work Order",
                filters={"production_plan": pp_name, "docstatus": ("in", [0, 1])},
                fields=["name", "docstatus"],
            )

            for r in wo_names:
                    wo = frappe.get_doc("Work Order", r.name)

                    item_wh_map = {}
                    item_qty_map = {}
                    for mr in doc.get("mr_items") or []:
                        if mr.get("warehouse"):
                            item_wh_map[mr.item_code] = mr.get("warehouse")
                        if mr.get("required_qty") is not None:
                            item_qty_map[mr.item_code] = mr.get("required_qty")

                    # Hardcoded warehouse map per company.
                    # Each company may have different warehouse naming conventions in ERPNext.
                    # NOTE: Jayashree Spun Bond companies use short names (no "Warehouse" word).
                    COMPANY_WAREHOUSE_MAP = {
                        # Jayashree Spun Bond - 1ZT  (original / first entity)
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

                    pp_company = (str(doc.get("company") or wo.get("company") or "")).strip()
                    wh_entry = COMPANY_WAREHOUSE_MAP.get(pp_company) or {}
                    correct_wip_wh    = wh_entry.get("wip")    or ""
                    correct_fg_wh     = wh_entry.get("fg")     or ""

                    if correct_wip_wh and not wo.wip_warehouse:
                        wo.wip_warehouse = correct_wip_wh
                    if correct_fg_wh and not wo.fg_warehouse:
                        wo.fg_warehouse = correct_fg_wh

                    wh_update = {}
                    if wo.source_warehouse:
                        wh_update["source_warehouse"] = wo.source_warehouse
                    if wo.wip_warehouse:
                        wh_update["wip_warehouse"] = wo.wip_warehouse
                    if wo.fg_warehouse:
                        wh_update["fg_warehouse"] = wo.fg_warehouse
                    if wh_update:
                        frappe.db.set_value(
                            "Work Order",
                            wo.name,
                            wh_update,
                            update_modified=False,
                        )

                    # Also update source_warehouse and exact required_qty on every required item row
                    # so the Stock Entry picks up the right values.
                    for req_item in wo.get("required_items") or []:
                        mapped_wh = item_wh_map.get(req_item.item_code)
                        mapped_qty = item_qty_map.get(req_item.item_code)
                        
                        updates = {}
                        if mapped_wh and (not req_item.source_warehouse or req_item.source_warehouse != mapped_wh):
                            req_item.source_warehouse = mapped_wh
                            updates["source_warehouse"] = mapped_wh
                            
                        if mapped_qty is not None and req_item.required_qty != mapped_qty:
                            req_item.required_qty = mapped_qty
                            updates["required_qty"] = mapped_qty
                            
                        if updates:
                            frappe.db.set_value(
                                "Work Order Item",
                                req_item.name,
                                updates,
                                update_modified=False,
                            )

                    # Skip if already started / transferred
                    if frappe.db.exists(
                        "Stock Entry",
                        {"work_order": wo.name, "purpose": "Material Transfer for Manufacture"},
                    ):
                        continue

                    # Submit WO if still draft
                    if int(wo.docstatus) == 0:

                        try:
                            wo.flags.ignore_permissions = True
                            wo.submit()
                            wo.reload()
                            
                            # Restore exact quantities from Production Plan that standard submit() overwrote
                            for req_item in wo.get("required_items") or []:
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
                            frappe.log_error(
                                title=f"WO submit failed: {wo.name}",
                                message=str(e),
                            )
                            frappe.throw(
                                f"Work Order <b>{wo.name}</b> could not be submitted: "
                                f"{frappe.utils.escape_html(str(e))}"
                            )

                    # Create & submit material transfer to start production
                    try:
                        se = frappe.new_doc("Stock Entry")
                        se.purpose = "Material Transfer for Manufacture"
                        se.stock_entry_type = "Material Transfer for Manufacture"
                        se.work_order = wo.name
                        se.company = wo.company
                        # Fallback to first required item's source warehouse if wo.source_warehouse is empty
                        from_wh = wo.source_warehouse
                        if not from_wh:
                            for req_item in wo.get("required_items") or []:
                                if req_item.source_warehouse:
                                    from_wh = req_item.source_warehouse
                                    break
                        se.from_warehouse = from_wh or "Raw Materials - JSB-1ZT"
                        se.to_warehouse = wo.wip_warehouse
                        se.fg_completed_qty = wo.qty
                        # ERPNext v15: tell the SE to use old-style batch_no/serial_no fields
                        # instead of the newer Serial and Batch Bundle approach.
                        se.use_serial_batch_fields = 1

                        try:
                            se.get_items()
                        except Exception:
                            pass

                        # Fallback: populate from Work Order required items if get_items didn't pull anything
                        if not se.items:
                            for row in wo.get("required_items") or []:
                                se.append(
                                    "items",
                                    {
                                        "item_code": row.item_code,
                                        "qty": row.required_qty,
                                        "transfer_qty": row.required_qty,
                                        "uom": row.stock_uom,
                                        "stock_uom": row.stock_uom,
                                        "s_warehouse": row.source_warehouse or wo.source_warehouse,
                                        "t_warehouse": wo.wip_warehouse,
                                        "conversion_factor": 1,
                                        "work_order": wo.name,
                                    },
                                )

                        for it in se.items or []:
                            if not it.work_order:
                                it.work_order = wo.name
                            if not it.s_warehouse:
                                it.s_warehouse = item_wh_map.get(it.item_code) or wo.source_warehouse
                            if not it.t_warehouse:
                                it.t_warehouse = wo.wip_warehouse
                            # ERPNext v15: required on every item row as well
                            it.use_serial_batch_fields = 1

                            # Auto-fill batch_no for batch-tracked items.
                            # ERPNext throws "Serial No / Batch No are mandatory" if missing.
                            if not it.batch_no:
                                has_batch = frappe.db.get_value("Item", it.item_code, "has_batch_no")
                                if has_batch:
                                    found_batch = None

                                    # Attempt 1 (ERPNext v16): query tabSerial and Batch Ledger
                                    # In v16 the SLE no longer stores batch_no directly.
                                    try:
                                        sbl_rows = frappe.db.sql(
                                            """
                                            SELECT batch_no, SUM(qty) AS qty
                                            FROM `tabSerial and Batch Ledger`
                                            WHERE item_code = %s
                                              AND warehouse = %s
                                              AND is_cancelled = 0
                                              AND batch_no IS NOT NULL
                                              AND batch_no != ''
                                            GROUP BY batch_no
                                            HAVING SUM(qty) > 0
                                            ORDER BY MIN(creation) ASC
                                            LIMIT 1
                                            """,
                                            (it.item_code, it.s_warehouse),
                                            as_dict=True,
                                        )
                                        if sbl_rows:
                                            found_batch = sbl_rows[0].batch_no
                                    except Exception:
                                        pass  # table may not exist in older versions

                                    # Attempt 2 (ERPNext v13/v14): query tabStock Ledger Entry
                                    if not found_batch:
                                        try:
                                            sle_rows = frappe.db.sql(
                                                """
                                                SELECT batch_no, SUM(actual_qty) AS qty
                                                FROM `tabStock Ledger Entry`
                                                WHERE item_code = %s
                                                  AND warehouse = %s
                                                  AND is_cancelled = 0
                                                  AND batch_no IS NOT NULL
                                                  AND batch_no != ''
                                                GROUP BY batch_no
                                                HAVING SUM(actual_qty) > 0
                                                ORDER BY MIN(creation) ASC
                                                LIMIT 1
                                                """,
                                                (it.item_code, it.s_warehouse),
                                                as_dict=True,
                                            )
                                            if sle_rows:
                                                found_batch = sle_rows[0].batch_no
                                        except Exception:
                                            pass

                                    # Attempt 3: any active batch for this item (last resort)
                                    # Covers cases where SLE/SBL queries miss the batch
                                    # (e.g. stock received via Serial and Batch Bundle).
                                    if not found_batch:
                                        try:
                                            found_batch = frappe.db.get_value(
                                                "Batch",
                                                {"item": it.item_code, "disabled": 0},
                                                "name",
                                                order_by="creation asc",
                                            )
                                        except Exception:
                                            pass

                                    if found_batch:
                                        it.batch_no = found_batch
                                    # If still no batch found, leave batch_no empty and let the
                                    # SE insert fail gracefully in the except block below.

                        if se.items:
                            se.flags.ignore_permissions = True
                            try:
                                se.insert()
                                se.submit()

                                # Finalize Work Order Update (UI Sync)
                                try:
                                    frappe.db.set_value("Work Order", wo.name, {
                                        "material_transferred_for_manufacturing": wo.qty,
                                        "status": "In Process",
                                        "actual_start_date": frappe.utils.now_datetime()
                                    }, update_modified=True)
                                except Exception:
                                    pass

                                frappe.msgprint(
                                    f"✅ <b>Auto-Started!</b><br>Work Order: <b>{wo.name}</b><br>"
                                    f"Stock Entry: <b>{se.name}</b>"
                                )
                            except Exception as se_err:
                                # ⚠️ Material transfer failed — log but DO NOT block PP submission.
                                # The WO is already submitted; user can transfer manually.
                                frappe.log_error(
                                    title=f"Material transfer failed for WO {wo.name}",
                                    message=str(se_err),  # str(e) instead of get_traceback in safe_exec
                                )
                                frappe.msgprint(
                                    f"⚠️ <b>Work Order {wo.name} submitted</b>, but the automatic "
                                    f"material transfer could not be completed:<br>"
                                    f"<i>{frappe.utils.escape_html(str(se_err))}</i><br><br>"
                                    f"Please perform the <b>Material Transfer for Manufacture</b> manually.",
                                    title="Manual Transfer Required",
                                    indicator="orange",
                                )
                        else:
                            # No items to transfer — warn but don't block.
                            frappe.msgprint(
                                f"⚠️ No items found to transfer for Work Order <b>{wo.name}</b>. "
                                f"Please do the material transfer manually.",
                                indicator="orange",
                            )
                    except Exception as e:
                        # Outer catch — WO submit or warehouse setup failed.
                        # Log and warn; still do NOT block the Production Plan submission.
                        frappe.log_error(
                            title=f"WO auto-start failed: {wo.name}",
                            message=str(e),  # str(e) instead of get_traceback in safe_exec
                        )
                        frappe.msgprint(
                            f"⚠️ Auto-start encountered an issue for Work Order <b>{wo.name}</b>: "
                            f"{frappe.utils.escape_html(str(e))}<br>"
                            f"The Production Plan was submitted. Please check the Work Order manually.",
                            title="Auto-Start Warning",
                            indicator="orange",
                        )
        else:
            frappe.msgprint(
                "Work Order auto-start skipped: set Production Plan <b>custom_unit</b> to "
                "<b>Unit 1</b>, <b>Unit 2</b>, <b>Unit 3</b>, or <b>Unit 4</b> to auto-start "
                "(current: <b>"
                + (pp_raw or "(empty)")
                + "</b>).",
                indicator="blue",
            )
