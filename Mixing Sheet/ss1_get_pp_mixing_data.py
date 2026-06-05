# API Method Name: get_pp_mixing_data
# Script Type: API

production_plan = frappe.form_dict.get("production_plan")
spr_name = frappe.form_dict.get("spr_name")

pp = frappe.get_doc("Production Plan", production_plan)

# ── Read expected raw materials from the PP child table ──────
# Tries common ERPNext child table field names for raw materials.
# Items are identified by item_code prefix:
#   PP -  → Polypropylene
#   FL -  → Filler
#   MB -  → Masterbatch
#   SA -  → First occurrence = PPA/Modifier, Second = Antistatic
#           (matches the Production Plan print format order)

pp_item = filler_item = masterbatch_item = antistatic_item = ppa_item = ""

# Try the most likely child table fieldnames
child_table_candidates = ["mr_items", "raw_materials", "required_items", "custom_raw_materials"]
raw_material_rows = []

for candidate in child_table_candidates:
    rows = pp.get(candidate) or []
    if rows:
        raw_material_rows = rows
        break

sa_count = 0
for row in raw_material_rows:
    code = row.get("item_code") or ""
    if code.startswith("PP") and not pp_item:
        pp_item = code
    elif code.startswith("FL") and not filler_item:
        filler_item = code
    elif code.startswith("MB") and not masterbatch_item:
        masterbatch_item = code
    elif code.startswith("SA"):
        sa_count += 1
        if sa_count == 1:
            ppa_item = code          # First SA = PPA / Modifier
        elif sa_count == 2:
            antistatic_item = code   # Second SA = Antistatic

# Fallback: Fetch from BOMs in po_items if not fully found in child tables
checked_boms = []
if not pp_item or not filler_item or not masterbatch_item:
    po_items = pp.get("po_items") or []
    for po in po_items:
        bom_no = po.get("bom_no")
        if bom_no:
            checked_boms.append(bom_no)
            bom_items = frappe.get_all("BOM Item", filters={"parent": bom_no}, fields=["item_code"], ignore_permissions=True)
            for bi in bom_items:
                code = bi.item_code or ""
                if code.startswith("PP") and not pp_item: pp_item = code
                elif code.startswith("FL") and not filler_item: filler_item = code
                elif code.startswith("MB") and not masterbatch_item: masterbatch_item = code
                elif code.startswith("SA"):
                    if not ppa_item: ppa_item = code
                    elif ppa_item != code and not antistatic_item: antistatic_item = code

# Debug fallback if still empty
if not pp_item: pp_item = f"Not Found (Checked {len(raw_material_rows)} mr_items, BOMs: {checked_boms})"
if not filler_item: filler_item = f"Not Found (Checked {len(raw_material_rows)} mr_items, BOMs: {checked_boms})"
if not masterbatch_item: masterbatch_item = f"Not Found (Checked {len(raw_material_rows)} mr_items, BOMs: {checked_boms})"
if not antistatic_item: antistatic_item = f"Not Found"
if not ppa_item: ppa_item = f"Not Found"

data = {
    "pp_ratio":           pp.get("pp_ratio")           or 78,
    "filler_ratio":       pp.get("filler_ratio")       or 52,
    "masterbatch_ratio":  pp.get("masterbatch_ratio")  or 1.6,
    "antistatic_ratio":   pp.get("antistatic_ratio")   or 0.3,
    "ppa_ratio":          pp.get("ppa_ratio")          or 0.5,
    "half_pp_ratio":          pp.get("half_mixing_pp_ratio")          or 39,
    "half_filler_ratio":      pp.get("half_mixing_filler_ratio")      or 26,
    "half_masterbatch_ratio": pp.get("half_mixing_masterbatch_ratio") or 0.8,
    "half_antistatic_ratio":  pp.get("half_mixing_antistatic_ratio")  or 0.1,
    "half_ppa_ratio":         pp.get("half_mixing_ppa_ratio")         or 0.3,
    "no_of_full_mixing": pp.get("total_no_of_one_mixing_1") or pp.get("no_of_mixing")       or 1,
    "no_of_half_mixing": pp.get("total_no_of_half_mixing_2") or pp.get("no_of_half_mixing") or 1,

    # Expected raw materials (from child table, by prefix)
    "pp_item":          pp_item,
    "filler_item":      filler_item,
    "masterbatch_item": masterbatch_item,
    "antistatic_item":  antistatic_item,
    "ppa_item":         ppa_item,
}

if spr_name:
    try:
        raw = frappe.db.get_value("Shaft Production Run", spr_name, "custom_mixing_sheet_data")
        data["existing_mixing_data"] = raw or ""
    except Exception:
        data["existing_mixing_data"] = ""

frappe.response["message"] = data
