# ============================================================
# SERVER SCRIPT: Create Serial and Batch Bundle on Submit
# Type: DocType Event
# DocType: Delivery Note
# Event: Before Submit
# ============================================================

import json as json_mod

for item in doc.items:
    raw = item.get("custom_scanned_rolls_data")
    if not raw:
        continue

    try:
        rolls = json_mod.loads(raw)
        if not (rolls and isinstance(rolls, list) and len(rolls) > 0):
            continue

        total_net = sum(float(r.get("net", 0)) for r in rolls)
        if total_net <= 0:
            continue

        # Ensure qty = total of all rolls before stock ledger runs
        item.qty = total_net

        # Create Serial and Batch Bundle with all rolls (ERPNext v14+ multi-batch)
        bundle = frappe.new_doc("Serial and Batch Bundle")
        bundle.item_code = item.item_code
        bundle.warehouse = item.warehouse or doc.set_warehouse
        bundle.voucher_type = "Delivery Note"
        bundle.voucher_no = doc.name
        bundle.type_of_transaction = "Outward"
        bundle.company = doc.company
        bundle.posting_date = doc.posting_date
        bundle.posting_time = doc.posting_time

        for roll in rolls:
            b_no = roll.get("batch_no")
            b_qty = float(roll.get("net", 0))
            if b_no and b_qty > 0:
                bundle.append("entries", {
                    "batch_no": b_no,
                    "qty": -b_qty  # negative for outward
                })

        if bundle.entries:
            bundle.flags.ignore_permissions = True
            bundle.save()
            item.serial_and_batch_bundle = bundle.name
            item.batch_no = None
        else:
            # Fallback: use first batch_no directly
            item.batch_no = rolls[0].get("batch_no")

    except Exception as e:
        frappe.log_error(
            f"Before Submit bundle error for {item.item_code}: {str(e)}",
            "DN Before Submit"
        )
