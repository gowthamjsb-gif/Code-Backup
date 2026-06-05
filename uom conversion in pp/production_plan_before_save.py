# Server Script
# DocType: Production Plan
# Event: Before Save

# Get the previous state of the document before this save to prevent "double-dividing"
old_doc = doc.get_doc_before_save()
old_items = {}
if old_doc:
    for old_item in old_doc.get("mr_items"):
        old_items[old_item.name] = old_item

for item in doc.get("mr_items"): 
    
    # Check if this row already existed in the previous save
    if item.name and item.name in old_items:
        old_qty = float(old_items[item.name].required_bom_qty or 0)
        current_qty = float(item.required_bom_qty or 0)
        
        # If the quantity is exactly the same as the last save, we ALREADY divided it previously.
        # We skip it so we don't divide it again on a second save!
        if old_qty == current_qty:
            continue

    # Fetch the conversion factor directly from the row data (it is populated by the system)
    conversion_factor = float(item.conversion_factor or 1.0)
    
    # Only run the math if there is a conversion factor greater than 1
    if conversion_factor > 1.0:
        
        # THE CORE PROBLEM: The system did (Base Qty * CF) to get required_bom_qty.
        # YOU WANT: (Base Qty / CF).
        # To turn (X * CF) into (X / CF) using only the multiplied number, we must divide by (CF * CF).
        
        system_multiplied_qty = float(item.required_bom_qty or 0)
        cf_float = float(conversion_factor or 1.0)
        
        corrected_qty = system_multiplied_qty / (cf_float * cf_float)
        
        # Overwrite the standard fields with the corrected divided quantity
        item.required_bom_qty = corrected_qty
        item.required_qty = corrected_qty
