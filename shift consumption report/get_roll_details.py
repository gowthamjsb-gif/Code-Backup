# get_roll_details.py
# Logic: Aggregates roll details from Shaft Production Run, optionally filtered by Stock Entry batch numbers

posting_date = frappe.form_dict.get('posting_date')
shift = frappe.form_dict.get('shift')
unit = frappe.form_dict.get('unit')
item_code = frappe.form_dict.get('item_code')
work_order = frappe.form_dict.get('work_order')
stock_entry = frappe.form_dict.get('stock_entry')

if not posting_date or not shift:
    frappe.response['message'] = []
    # Return early if required filters are missing

# ── If Stock Entry (or multiple) is provided, use batch_nos as the primary filter ──
allowed_batch_nos = None
if stock_entry:
    se_names = [s.strip() for s in stock_entry.split(",") if s.strip()]
    batch_rows = []
    for se_name in se_names:
        rows_se = frappe.get_all(
            "Stock Entry Detail",
            filters={"parent": se_name, "is_finished_item": 1},
            fields=["batch_no"]
        )
        batch_rows.extend(rows_se)
    allowed_batch_nos = [r.batch_no for r in batch_rows if r.batch_no]

# --- Full Day / All Units support ---
FULL_DAY_SHIFTS = ["Day Shift", "Night Shift"]
is_full_day = (shift == "Full Day")
is_all_units = (unit == "All Units")

# 1. Fetch matching submitted Shaft Production Runs
filters = {
    "docstatus": 1,
    "run_date": posting_date,
}
if is_full_day:
    filters["shift"] = ["in", FULL_DAY_SHIFTS]
else:
    filters["shift"] = shift

if unit and not is_all_units:
    filters["custom_unit"] = unit

spr_list = frappe.get_all("Shaft Production Run", filters=filters, fields=["name"])

all_rolls = []
seen_rolls = set()

for spr in spr_list:
    doc = frappe.get_doc("Shaft Production Run", spr.name)
    
    rows = doc.get("items") or []
    for row in rows:
        row_wo = row.get("work_order")
        
        # If stock_entry was given, filter strictly by batch_no
        if allowed_batch_nos is not None:
            r_batch = row.get("batch_no")
            if r_batch not in allowed_batch_nos:
                continue
        else:
            # Fallback: filter by work_order if provided
            if work_order and row_wo != work_order:
                continue
        
        # Get Item Code: Row > Work Order
        row_item = row.get("item_code") or row.get("custom_item_code")
        if not row_item and row_wo:
            row_item = frappe.db.get_value("Work Order", row_wo, "production_item")
        
        # Filter by item_code if also provided
        if item_code and row_item != item_code:
            continue
        
        r_no = row.get("roll_no") or row.get("batch_no")
        if not r_no: continue
        
        roll_data = {
            "parent": spr.name,
            "roll_no": r_no,
            "batch_no": row.get("batch_no") or r_no,
            "item_code": row_item,
            "quality": row.get("quality") or row.get("custom_quality") or "Unknown",
            "colour": row.get("color") or row.get("colour") or row.get("custom_color") or "Unknown",
            "net_weight": float(row.get("net_weight") or row.get("net_wt") or 0),
            "gross_weight": float(row.get("gross_weight") or row.get("gross_wt") or 0),
            "meter_roll": float(row.get("meter_roll") or row.get("meter_per_roll") or 0),
            "party_code": row.get("party_code") or row.get("custom_party_code") or doc.get("party_code"),
            "produced_qty": float(row.get("net_weight") or row.get("net_wt") or 0)
        }
        
        k = (spr.name, r_no)
        if k not in seen_rolls:
            all_rolls.append(roll_data)
            seen_rolls.add(k)

all_rolls.sort(key=lambda x: x.get('roll_no', ''))
frappe.response['message'] = all_rolls
