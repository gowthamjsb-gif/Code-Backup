# ==========================================================
# Planning Sheet — Server Script (Script Type: API)
# ==========================================================
# Create THREE Server Scripts in ERPNext (Script Type: API), each Allow Guest = No:
#
# 1) API Method: planning_sheet_get_fg_items
#    Paste this entire file OR only the get_fg_items function block.
#
# 2) API Method: planning_sheet_get_item_boms
#
# 3) API Method: planning_sheet_rebuild_from_bom
#
# Alternatively use ONE API script and set method name to match how you
# branch below on frappe.form_dict.get("cmd") or action — Frappe passes
# api_method as the script name, so use three separate scripts with the

# matching function body from each section at the bottom.
#
# CONFIG — adjust field names to match your Planning Sheet custom fields:
PLANNING_DOCTYPE = "Planning Sheet"
PLANNING_ITEM_DOCTYPE = "Planning Sheet Item"
PLANNING_ITEMS_FIELD = "items"

TRACE_FIELD = "custom_parent_child_trace_id"
BOM_FIELD = "custom_bom_no"
ITEM_CODE_FIELD = "item_code"
QTY_FIELD = "qty"
UOM_FIELD = "uom"
PLAN_CODE_FIELD = "custom_plan_code"
UNIT_FIELD = "custom_unit"
METER_FIELD = "custom_meter"

# Sales Order link on Planning Sheet (first existing field wins)
SO_LINK_FIELDS = ["sales_order", "custom_sales_order", "against_sales_order", "custom_against_sales_order"]


def _get_planning_sales_order(planning_name):
    if not planning_name:
        return None
    for fn in SO_LINK_FIELDS:
        try:
            val = frappe.db.get_value(PLANNING_DOCTYPE, planning_name, fn)
        except Exception:
            val = None
        if val:
            return val
    return None


def _get_default_bom(item_code):
    bom = frappe.db.get_value(
        "BOM",
        {"item": item_code, "is_active": 1, "is_default": 1, "docstatus": 1},
        "name",
    )
    if not bom:
        bom = frappe.db.get_value(
            "BOM",
            {"item": item_code, "is_active": 1, "docstatus": 1},
            "name",
        )
    return bom


def _get_active_boms_list(item_code):
    rows = frappe.get_all(
        "BOM",
        filters={"item": item_code, "is_active": 1, "docstatus": 1},
        fields=["name", "is_default", "custom_width_inches"],
        order_by="is_default desc, modified desc",
    )
    out = []
    for r in rows:
        label = r.name
        if r.get("is_default"):
            label = label + " (Default)"
        w_in = r.get("custom_width_inches")
        if w_in is not None and w_in != "":
            label = label + " — " + str(w_in) + '"'
        out.append(
            {
                "name": r.name,
                "is_default": 1 if r.get("is_default") else 0,
                "label": label,
            }
        )
    return out


def _trace_root(trace_id):
    t = (trace_id or "").strip()
    if not t:
        return ""
    return t.split("-")[0]


def _collect_fg_roots_from_planning(doc):
    roots = {}
    for row in doc.get(PLANNING_ITEMS_FIELD) or []:
        trace = (row.get(TRACE_FIELD) or "").strip()
        if not trace:
            continue
        root = _trace_root(trace)
        if not root:
            continue
        if root not in roots:
            roots[root] = {
                "item_code": root,
                "trace_root": root,
                "bom_no": row.get(BOM_FIELD) or _get_default_bom(root),
                "qty": row.get(QTY_FIELD) or 0,
                "uom": row.get(UOM_FIELD) or "",
            }
    return roots


def _collect_fg_roots_from_sales_order(so_name):
    roots = {}
    if not so_name:
        return roots
    so_items = frappe.get_all(
        "Sales Order Item",
        filters={"parent": so_name},
        fields=["item_code", "item_name", "qty", "uom", "stock_uom"],
        order_by="idx asc",
    )
    for si in so_items:
        ic = (si.get("item_code") or "").strip()
        if not ic or ic in roots:
            continue
        uom = si.get("uom") or si.get("stock_uom") or ""
        roots[ic] = {
            "item_code": ic,
            "item_name": si.get("item_name") or ic,
            "trace_root": ic,
            "bom_no": _get_default_bom(ic),
            "qty": float(si.get("qty") or 0),
            "uom": uom,
        }
    return roots


def _item_is_fg_with_bom(item_code):
    if not item_code:
        return False
    if frappe.db.get_value("Item", item_code, "is_stock_item"):
        pass
    return bool(_get_default_bom(item_code))


def _explode_bom_to_rows(item_code, bom_no, parent_trace, qty_mult, plan_code, unit, rows_out, depth):
    if depth > 12:
        return
    if not bom_no or not frappe.db.exists("BOM", bom_no):
        return
    bom = frappe.get_doc("BOM", bom_no)
    for bi in bom.get("items") or []:
        child_code = (bi.item_code or "").strip()
        if not child_code:
            continue
        child_bom = bi.bom_no
        line_qty = float(bi.qty or 0) * float(qty_mult or 1)
        child_trace = parent_trace + "-" + child_code if parent_trace else child_code

        do_not_explode = int(bi.do_not_explode or 0)
        if child_bom and do_not_explode:
            rows_out.append(
                {
                    "item_code": child_code,
                    "qty": line_qty,
                    "uom": bi.uom or "Kg",
                    "bom_no": child_bom,
                    TRACE_FIELD: child_trace,
                    PLAN_CODE_FIELD: plan_code,
                    UNIT_FIELD: unit,
                    METER_FIELD: "",
                }
            )
            _explode_bom_to_rows(
                child_code,
                child_bom,
                child_trace,
                line_qty,
                plan_code,
                unit,
                rows_out,
                depth + 1,
            )
        elif child_bom and not do_not_explode:
            _explode_bom_to_rows(
                child_code,
                child_bom,
                parent_trace,
                line_qty,
                plan_code,
                unit,
                rows_out,
                depth + 1,
            )


def get_fg_items():
    """API: planning_sheet_get_fg_items — list SO / planning FG roots with current BOM."""
    planning_name = frappe.form_dict.get("planning_sheet")
    if not planning_name:
        frappe.response["message"] = {"ok": False, "error": "Missing planning_sheet"}
        return

    doc = frappe.get_doc(PLANNING_DOCTYPE, planning_name)
    so_name = _get_planning_sales_order(planning_name)

    roots = _collect_fg_roots_from_sales_order(so_name)
    from_planning = _collect_fg_roots_from_planning(doc)
    for k in from_planning:
        if k not in roots:
            roots[k] = from_planning[k]
        else:
            if from_planning[k].get("bom_no"):
                roots[k]["bom_no"] = from_planning[k]["bom_no"]

    items = []
    for ic in sorted(roots.keys()):
        r = roots[ic]
        ic_name = frappe.db.get_value("Item", ic, "item_name") or ic
        items.append(
            {
                "item_code": ic,
                "item_name": ic_name,
                "trace_root": r.get("trace_root") or ic,
                "bom_no": r.get("bom_no") or "",
                "qty": r.get("qty") or 0,
                "uom": r.get("uom") or "",
            }
        )

    frappe.response["message"] = {
        "ok": True,
        "sales_order": so_name,
        "items": items,
    }


def get_item_boms():
    """API: planning_sheet_get_item_boms — active BOMs for one item."""
    item_code = (frappe.form_dict.get("item_code") or "").strip()
    if not item_code:
        frappe.response["message"] = {"ok": False, "error": "Missing item_code"}
        return
    frappe.response["message"] = {
        "ok": True,
        "item_code": item_code,
        "boms": _get_active_boms_list(item_code),
    }


def rebuild_from_bom():
    """API: planning_sheet_rebuild_from_bom — replace planning rows for one FG root."""
    planning_name = frappe.form_dict.get("planning_sheet")
    item_code = (frappe.form_dict.get("item_code") or "").strip()
    bom_no = (frappe.form_dict.get("bom_no") or "").strip()
    fg_qty = float(frappe.form_dict.get("fg_qty") or 1)

    if not planning_name or not item_code or not bom_no:
        frappe.response["message"] = {"ok": False, "error": "Missing planning_sheet, item_code, or bom_no"}
        return
    if not frappe.db.exists("BOM", bom_no):
        frappe.response["message"] = {"ok": False, "error": "BOM not found: " + bom_no}
        return

    doc = frappe.get_doc(PLANNING_DOCTYPE, planning_name)
    plan_code = ""
    unit = ""
    try:
        plan_code = doc.get("plan_code") or doc.get("custom_plan_code") or ""
    except Exception:
        plan_code = ""
    try:
        unit = doc.get("unit") or doc.get("custom_unit") or ""
    except Exception:
        unit = ""

    trace_root = item_code
    kept = []
    for row in doc.get(PLANNING_ITEMS_FIELD) or []:
        trace = (row.get(TRACE_FIELD) or "").strip()
        row_root = _trace_root(trace)
        if row_root == trace_root:
            continue
        kept.append(row)

    new_rows = []
    root_row = {
        "item_code": item_code,
        "qty": fg_qty,
        "uom": frappe.db.get_value("Item", item_code, "stock_uom") or "Kg",
        "bom_no": bom_no,
        TRACE_FIELD: trace_root,
        PLAN_CODE_FIELD: plan_code,
        UNIT_FIELD: unit,
        METER_FIELD: "",
    }
    new_rows.append(root_row)
    _explode_bom_to_rows(item_code, bom_no, trace_root, fg_qty, plan_code, unit, new_rows, 0)

    doc.set(PLANNING_ITEMS_FIELD, kept + new_rows)
    doc.save(ignore_permissions=True)

    frappe.response["message"] = {
        "ok": True,
        "planning_sheet": planning_name,
        "item_code": item_code,
        "bom_no": bom_no,
        "rows_added": len(new_rows),
        "total_items": len(doc.get(PLANNING_ITEMS_FIELD) or []),
    }


# --- Entry points for three API Server Scripts (paste one function per script) ---
api_method = frappe.form_dict.get("cmd") or ""
if "get_item_boms" in str(api_method):
    get_item_boms()
elif "rebuild_from_bom" in str(api_method):
    rebuild_from_bom()
else:
    get_fg_items()
