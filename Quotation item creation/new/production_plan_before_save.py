# Server Script
# DocType: Production Plan (or the relevant doctype)
# Event: Before Save

# Loop through all the items in the child table
# Note: replace 'po_items' with the actual child table fieldname if it is different
for item in doc.get("po_items"): 
    
    # 1. Get the conversion factor from the item row (or fetch it from Item master)
    # If the field is named differently, adjust "conversion_factor"
    conversion_factor = item.conversion_factor 
    
    # Fallback to fetching from Item Master if it's not in the grid
    if not conversion_factor:
        conversion_factor = frappe.db.get_value("Item", item.item_code, "conversion_factor")
    
    # 2. Perform the division instead of multiplication
    # Make sure we don't divide by zero
    if conversion_factor and flt(conversion_factor) > 0:
        
        # 3. Overwrite the STANDARD field (e.g. required_qty)
        calculated_val = flt(item.planned_qty) / flt(conversion_factor)
        
        # Force the system to accept our divided math
        item.required_qty = calculated_val
