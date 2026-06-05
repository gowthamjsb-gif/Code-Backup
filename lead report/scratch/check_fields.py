
import frappe

def check_fields():
    frappe.connect()
    meta_opp = frappe.get_meta("Opportunity")
    meta_lead = frappe.get_meta("Lead")
    
    print("Opportunity fields:", [f.fieldname for f in meta_opp.fields if "city" in f.fieldname or "custom_city" in f.fieldname])
    print("Lead fields:", [f.fieldname for f in meta_lead.fields if "city" in f.fieldname or "custom_city" in f.fieldname])

if __name__ == "__main__":
    check_fields()
