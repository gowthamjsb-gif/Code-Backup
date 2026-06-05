# Server Script: shift_production_submit (on_submit)
# Purpose: Reporting-only submission for Shift Wise Production Entry
# Logic: Data is already captured for reporting; stock movements are handled by source documents (SPR).
# Extended Logic: Automatically generate Material Receipt for Machine Wastages (Float Fields).

try:
    # ── 1. Create Stock Entry (Material Receipt) for Machine Wastage ──
    waste_items = []
    if doc.spinning_waste:
        waste_items.append({"item_code": "WASTE - 001", "qty": doc.spinning_waste})
    if doc.calender_waste:
        waste_items.append({"item_code": "WASTE - 002", "qty": doc.calender_waste})
    if doc.roll_waste:
        waste_items.append({"item_code": "WASTE - 003", "qty": doc.roll_waste})
    if doc.lumps_waste:
        waste_items.append({"item_code": "WASTE - 004", "qty": doc.lumps_waste})
    if doc.mixing_waste:
        waste_items.append({"item_code": "WASTE - 005", "qty": doc.mixing_waste})

    if waste_items:
        se = frappe.new_doc("Stock Entry")
        se.purpose = "Material Receipt"
        se.stock_entry_type = "Material Receipt"
        se.posting_date = doc.posting_date
        
        # Use specific Scrap Warehouse for wastage receipts
        to_wh = "SCRAP WAREHOUSE - JSB-1ZT"
        
        for w_item in waste_items:
            se.append("items", {
                "item_code": w_item["item_code"],
                "qty": w_item["qty"],
                "t_warehouse": to_wh
            })
            
        se.flags.ignore_permissions = True
        se.insert()
        se.submit()
        frappe.msgprint(f"Material Receipt <a href='/app/stock-entry/{se.name}'><b>{se.name}</b></a> created for Machine Wastages.")

    # ── 2. Reporting Submission Message ──
    msg = f"Shift Wise Production Entry {doc.name} has been submitted for reporting."
    frappe.msgprint(msg)
    
except Exception as e:
    frappe.log_error("SPE Reporting Submit Error", str(e))
    frappe.throw("Error during reporting submission: " + str(e))
