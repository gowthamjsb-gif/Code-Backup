# SCRIPT: LAMINATION BOM CREATOR
# TYPE: API
# METHOD NAME: create_lamination_bom
#
# Args:
#   item_code  (str)  - the laminated fabric item
#   lam_side   (str)  - e.g. "Inner Lamination"
#   lam_items  (JSON) - list of {item_code, qty} in actual KGs for the mixing batch
#   force_new  (str)  - "1" to always create a new BOM even if a match exists


def resolve_item_code(val):
    """Resolve UI labels like 'PP - 1002001' or 'Item Name' to Item.name/item_code."""
    if not val:
        return ""
    code = str(val).strip()

    # 1) Direct check (is it already a code?)
    if frappe.db.exists("Item", code):
        return code

    # 2) Check if it's an Item Name (Common in ERPNext UI)
    name_match = frappe.db.get_value("Item", {"item_name": code}, "name")
    if name_match:
        return name_match

    # 3) Check for [CODE] pattern
    if "[" in code and code.endswith("]"):
        bracket_code = code.split("[")[-1].rstrip("]").strip()
        if frappe.db.exists("Item", bracket_code):
            return bracket_code

    # 4) Split by " - " and try parts
    if " - " in code:
        parts = [p.strip() for p in code.split(" - ") if p.strip()]
        # Check candidates (last part, first part, etc.)
        for candidate in (parts[-1], parts[0]):
            if frappe.db.exists("Item", candidate):
                return candidate
            # Also check if candidate is an item_name
            nm = frappe.db.get_value("Item", {"item_name": candidate}, "name")
            if nm:
                return nm

    return code


# ── Read all arguments directly from form_dict ──────────────────────────────
item_code = str(frappe.form_dict.get("item_code") or "").strip()
lam_side  = str(frappe.form_dict.get("lam_side")  or "").strip()
force_new = str(frappe.form_dict.get("force_new") or "").strip() in ("1", "true", "True", "yes")

# ── Parse lam_items ──────────────────────────────────────────────────────────
# Frappe serializes JS arrays as JSON strings in form_dict.
# We parse them directly here — no helper function needed.
raw_lam = frappe.form_dict.get("lam_items") or ""

lam_items = []
if raw_lam:
    if isinstance(raw_lam, str):
        raw_lam = json.loads(raw_lam)
    for entry in raw_lam:
        ic  = str(entry.get("item_code") or "").strip()
        qty = float(entry.get("qty") or 0)
        if ic and qty > 0:
            lam_items.append({"item_code": ic, "qty": qty})

# ── Guard: missing inputs ────────────────────────────────────────────────────
if not item_code:
    frappe.response["message"] = "Error: Missing item_code"

elif not lam_items:
    frappe.response["message"] = (
        "Error: No lam_items provided. "
        "Received keys: " + str(list(frappe.form_dict.keys())) +
        " | lam_items raw value: " + str(frappe.form_dict.get("lam_items", ""))[:200]
    )

else:
    # ── 1. Build & validate batch map ────────────────────────────────────────
    frappe.log_error(title="Lamination BOM Debug", message=f"Item: {item_code}\nSide: {lam_side}\nItems: {lam_items}")
    batch_items = {}
    error = None

    for entry in lam_items:
        ic  = resolve_item_code(entry["item_code"])
        qty = float(entry["qty"])
        if not ic or qty <= 0:
            continue
        if not frappe.db.exists("Item", ic):
            error = "Error: Item '" + ic + "' does not exist in Item master"
            break
        batch_items[ic] = batch_items.get(ic, 0.0) + qty

    if error:
        frappe.response["message"] = error

    else:
        total_batch = sum(batch_items.values())

        if total_batch <= 0:
            frappe.response["message"] = "Error: Total batch weight is 0 — enter at least one quantity"

        else:
            # ── 2. Normalise to 1-Kg BOM with 1.03 wastage ──────────────────
            final_items = {}
            for ic, batch_w in batch_items.items():
                bom_qty = round((batch_w / total_batch) * 1.03, 6)
                if bom_qty > 0:
                    final_items[ic] = bom_qty

            # ── 3. Check for existing matching BOM ───────────────────────────
            existing_boms = frappe.get_all(
                "BOM",
                filters={"item": item_code, "is_active": 1, "docstatus": 1},
                fields=["name"]
            )

            match_found = None
            for b in existing_boms:
                b_items = frappe.get_all(
                    "BOM Item",
                    filters={"parent": b.name},
                    fields=["item_code", "qty"]
                )
                b_dict = {}
                for r in b_items:
                    b_dict[r.item_code] = r.qty

                if len(b_dict) != len(final_items):
                    continue

                is_match = True
                for ic, qty in final_items.items():
                    if ic not in b_dict or abs(b_dict[ic] - qty) >= 0.001:
                        is_match = False
                        break

                if is_match:
                    match_found = b.name
                    break

            if match_found and not force_new:
                frappe.response["message"] = match_found

            else:
                # ── 4. Create & submit new BOM ───────────────────────────────
                bom = frappe.new_doc("BOM")
                bom.item           = item_code
                bom.quantity       = 1.0
                bom.is_default     = 1
                bom.is_active      = 1
                bom.currency       = "INR"
                bom.rm_cost_as_per = "Valuation Rate"

                try:
                    bom_meta = frappe.get_meta("BOM")
                    if bom_meta.has_field("custom_lamination_side"):
                        bom.custom_lamination_side = lam_side
                except Exception:
                    pass

                for ic, qty in final_items.items():
                    item_row = bom.append("items", {"item_code": ic, "qty": qty, "uom": "Kg"})
                    
                    # ── Set "Do Not Explode" for Fabric and Printed BOPP ──
                    # Fabric: length >= 15 or starts with 100100/100101/1041
                    # Printed BOPP: starts with PB- or 2-
                    iu = ic.upper()
                    is_pb = iu.startswith("PB-") or iu.startswith("2-")
                    is_fb = len(iu) >= 15 or iu.startswith("100100") or iu.startswith("100101") or iu.startswith("1041")
                    
                    if is_pb or is_fb:
                        item_row.do_not_explode = 1

                bom.insert(ignore_permissions=True)
                bom.submit()
                bom.db_set("is_active", 1, update_modified=False)

                frappe.response["message"] = bom.name
