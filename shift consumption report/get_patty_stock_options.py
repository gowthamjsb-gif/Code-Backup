# Script: get_patty_stock_options
# Logic: Returns unique attributes from Patty Stock based on cascaded filters.
# Fully processed in Python to prevent backend database permission/syntax filtering bugs.

filters = {}
quality = frappe.form_dict.get('quality')
colour = frappe.form_dict.get('colour')
gsm = frappe.form_dict.get('gsm')
get_type = frappe.form_dict.get('get_type') # 'quality', 'colour', 'gsm', 'width', or 'balance'
width_val = frappe.form_dict.get('width_inch')

if quality: filters['quality'] = quality
if colour: filters['colour'] = colour
if gsm: filters['gsm'] = gsm

frappe.response['message'] = []

try:
    total_count = frappe.db.count("Patty Stock")
    
    # Do one simple fetch with NO complex database grouping or balance filtering to bypass all SQL errors
    all_stock_data = frappe.get_list(
        "Patty Stock", 
        filters=filters, 
        fields=["quality", "colour", "gsm", "width_inch", "balance_quantity"]
    )
    
    if not all_stock_data:
        if get_type == 'quality':
            frappe.msgprint(f"I found {total_count} records in the system, but your user account does not have permission to view them. Please check 'Patty Stock' Role Permissions.")
        frappe.response['message'] = []

    else:
        # Filter for positive balance dynamically in Python, avoiding DB errors
        valid_stock = [d for d in all_stock_data if (d.balance_quantity or 0) > 0]
        
        if get_type == 'quality':
            unique = list(set([str(d.quality) for d in valid_stock if d.quality]))
            unique.sort()
            frappe.response['message'] = unique
            if not unique:
                frappe.msgprint(f"Records exist, but none of them have a Balance > 0 available.")
                
        elif get_type == 'colour':
            unique = list(set([str(d.colour) for d in valid_stock if d.colour]))
            unique.sort()
            frappe.response['message'] = unique
            
        elif get_type == 'gsm':
            unique = list(set([str(d.gsm) for d in valid_stock if d.gsm]))
            unique.sort()
            frappe.response['message'] = unique
            
        elif get_type == 'width':
            unique = list(set([str(d.width_inch) for d in valid_stock if d.width_inch]))
            unique.sort()
            frappe.response['message'] = unique
            
        elif get_type == 'balance':
            # Balance checks need width too
            filtered = [d.balance_quantity for d in valid_stock if str(d.width_inch) == str(width_val)]
            frappe.response['message'] = sum(filtered) if filtered else 0
            
except Exception as e:
    frappe.log_error(title="get_patty_stock_options failed", message=str(e))
    frappe.response['message'] = []
