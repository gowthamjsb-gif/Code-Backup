import frappe

def execute():
    # Update Quality Checking
    if frappe.db.exists("DocField", {"parent": "Quality Checking", "fieldname": "quality"}):
        frappe.db.set_value("DocField", {"parent": "Quality Checking", "fieldname": "quality"}, "fieldtype", "Data")
        frappe.db.set_value("DocField", {"parent": "Quality Checking", "fieldname": "quality"}, "options", "")
        frappe.clear_cache(doctype="Quality Checking")
        
    # Update Quality Checking Section
    if frappe.db.exists("DocField", {"parent": "Quality Checking Section", "fieldname": "quality"}):
        frappe.db.set_value("DocField", {"parent": "Quality Checking Section", "fieldname": "quality"}, "fieldtype", "Data")
        frappe.db.set_value("DocField", {"parent": "Quality Checking Section", "fieldname": "quality"}, "options", "")
        frappe.clear_cache(doctype="Quality Checking Section")
