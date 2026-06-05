# API Server Script: shaft_production_run_patty_restore
# Called when a Patty row is deleted from the Recycled Wastage table
# Restores the consumed qty back to the Patty Stock balance

try:
    ps_id = frappe.form_dict.get('ps_id')
    qty = float(frappe.form_dict.get('qty') or 0)
    
    if not ps_id or qty <= 0:
        frappe.throw("Invalid parameters: ps_id and qty required")
    
    ps = frappe.get_doc("Patty Stock", ps_id)
    ps.balance_quantity = ps.balance_quantity + qty
    ps.save(ignore_permissions=True)
    
    frappe.msgprint("Restored " + str(qty) + " Kg to Patty Stock: " + ps_id)

except Exception as e:
    frappe.log_error("Patty Restore API Error", str(e))
    frappe.throw("Failed to restore Patty Stock balance: " + str(e))
