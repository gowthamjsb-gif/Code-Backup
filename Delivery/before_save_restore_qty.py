# ============================================================
# SERVER SCRIPT: Restore qty from scanned rolls data
# Type: DocType Event
# DocType: Delivery Note
# Event: Before Save
# ============================================================

import json as json_mod

for item in doc.items:

    # ALWAYS clear batch_no unconditionally.
    # batch_no causes ERPNext to overwrite qty with single batch stock qty.
    # It is set properly only in the Before Submit script via Serial and Batch Bundle.
    item.batch_no = None

    raw = item.get("custom_scanned_rolls_data")
    if not raw:
        continue

    try:
        rolls = json_mod.loads(raw)
        if not (rolls and isinstance(rolls, list) and len(rolls) > 0):
            continue

        total_net = sum(float(r.get("net", 0)) for r in rolls)

        if total_net > 0:
            # Restore correct qty (ERPNext may have overwritten with single batch qty)
            item.qty = total_net
            item.custom_delivered = total_net

    except Exception as e:
        frappe.log_error(
            f"Before Save qty restore error for {item.item_code}: {str(e)}",
            "DN Before Save"
        )
