    import frappe
    import json

    @frappe.whitelist()
    def create_roll_production_entries(jobs, sales_order):
        if isinstance(jobs, str):
            jobs = json.loads(jobs)
            
        party_code = frappe.db.get_value("Sales Order", sales_order, "custom_party_code")
        
        created_docs = []
        
        for job in jobs:
            doc = frappe.new_doc("Roll Production Entry")
            doc.posting_date = frappe.utils.today()
            doc.custom_batch_width = job.get("total_width") 
            doc.party_code = party_code
            
            shafts = int(job.get("shafts") or 1)
            combination = job.get("combination", "").replace('"', '').split(" + ")
            
            for shaft_idx in range(shafts):
                for w in combination:
                    if not w.strip(): continue
                    
                    wo = frappe.db.get_value("Work Order", 
                        {"sales_order": sales_order, "custom_width": float(w.strip())}, 
                        "name"
                    )
                    item_code = frappe.db.get_value("Work Order", wo, "production_item") if wo else None
                    
                    doc.append("roll_wise_entry", {
                        "work_order": wo,
                        "production_item": item_code,
                        "width": float(w.strip()),
                        "party_code": party_code,
                        "shaft_number": shaft_idx + 1
                    })
                    
            doc.save(ignore_permissions=True)
            created_docs.append(doc.name)
            
        return created_docs

    @frappe.whitelist()
    def create_stock_entries_for_roll(doc_name):
        doc = frappe.get_doc("Roll Production Entry", doc_name)
        created_ses = []
        
        for row in doc.roll_wise_entry:
            if not row.net_wt:
                frappe.throw(f"Row {row.idx}: Net Weight is mandatory.")
                
            se = frappe.new_doc("Stock Entry")
            se.purpose = "Manufacture"
            se.work_order = row.work_order
            se.stock_entry_type = "Manufacture"
            
            # Add FG item
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
