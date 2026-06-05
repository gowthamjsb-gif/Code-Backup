import frappe

@frappe.whitelist()
def create_stock_entries_for_roll(doc_name):
    """
    Called from Roll Production Entry 'Submit Roll' button.
    Method Name: create_stock_entries_for_roll
    """
    doc = frappe.get_doc("Roll Production Entry", doc_name)
    created_ses = []
    
    for row in doc.roll_wise_entry:
        if not row.net_wt:
            frappe.throw(f"Row {row.idx}: Net Weight is mandatory.")
            
        se = frappe.new_doc("Stock Entry")
        se.purpose = "Manufacture"
        se.work_order = row.work_order
        se.stock_entry_type = "Manufacture"
        
        se.append("items", {
            "item_code": row.production_item,
            "qty": row.net_wt,
            "is_finished_item": 1,
        })
        
        se.insert(ignore_permissions=True)
        se.submit()
        created_ses.append(se.name)
        
    doc.db_set("status", "Completed")
    
    return created_ses
