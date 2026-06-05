import frappe
import json

@frappe.whitelist()
def create_roll_production_entries(jobs, sales_order):
    """
    Called from Shaft Calculation 'Submit' button.
    Method Name: create_roll_production_entries
    """
    if isinstance(jobs, str):
        jobs = json.loads(jobs)
        
    party_code = frappe.db.get_value("Sales Order", sales_order, "custom_party_code")
    
    created_docs = []
    
    for job in jobs:
        # Create one Roll Production Entry per Job row
        doc = frappe.new_doc("Roll Production Entry")
        doc.posting_date = frappe.utils.today()
        doc.custom_batch_width = job.get("total_width") 
        doc.party_code = party_code
        
        shafts = int(job.get("shafts") or 1)
        # Parse combination (e.g. "46\" + 46\" + 26\"")
        combination = job.get("combination", "").replace('"', '').split(" + ")
        
        for shaft_idx in range(shafts):
            for w in combination:
                if not w.strip(): continue
                
                # Link to Work Order by SO + Width
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
