# NOTE: Do NOT use `import` here — Frappe safe_exec blocks __import__.
# `frappe` is pre-injected as a global. Use inline logic instead of `re`.

# 1. Aggregation: Count total fractional Nos per Core Item Code
item_consumption_totals = {}

for row in doc.items:
    if not row.custom_core_width_mm:
        continue
        
    mapped_item_code = None
    
    # Try using the fetched field first, fallback to checking the Link Doctype
    if row.get("core_item_code"):
        mapped_item_code = row.get("core_item_code")
    elif row.custom_core_width_mm:
        mapped_item_code = frappe.db.get_value("Core Size", row.custom_core_width_mm, "item_code")
        
    width = frappe.utils.flt(row.width_inch or 0)
    
    # FALLBACK: If item code couldn't be fetched or was empty, use the requested defaults based on width
    if not mapped_item_code and width > 0:
        if   width <= 63:  mapped_item_code = "PC - 1005307"
        elif width <= 85:  mapped_item_code = "PC - 1005158"
        elif width <= 90:  mapped_item_code = "PC - 1005308"
        elif width <= 118: mapped_item_code = "PC - 1005161"
        else:              mapped_item_code = "PC - 1005309"
            
    if mapped_item_code:
        # Strip out inch symbols like " to get the raw math number
        core_inch_str = str(row.get("core_inch") or "")
        if not core_inch_str or core_inch_str == "None":
            core_inch_str = str(frappe.db.get_value("Core Size", row.custom_core_width_mm, "core_inch") or "63")
            
        # Filter to digits and dots only (replaces re.sub — safe_exec blocks `re`)
        numeric_str = "".join(c for c in core_inch_str if c.isdigit() or c == ".")
        core_inch_num = float(numeric_str) if numeric_str else 63.0
        
        # Calculate nos from width_inch
        width = frappe.utils.flt(row.width_inch or 0)
        nos_used = width / core_inch_num if width > 0 else 0
        
        if nos_used > 0:
            item_consumption_totals[mapped_item_code] = item_consumption_totals.get(mapped_item_code, 0) + nos_used


# 3. Stock Entry Generation
if item_consumption_totals:
    try:
        # Create a new Stock Entry for Material Issue
        stock_entry = frappe.new_doc("Stock Entry")
        stock_entry.purpose = "Material Issue"
        stock_entry.stock_entry_type = "Material Issue"
        stock_entry.company = doc.company
        
        # Link it to the Work Order if it exists
        wo = doc.get("work_order") if doc.get("work_order") else (doc.work_order if "work_order" in doc.as_dict() else None)
        if wo:
            stock_entry.work_order = wo
            
        stock_entry.remarks = f"Auto Material Issue for Cores - Shaft Production Run: {doc.name}"

        # The user explicitly requested to pull core consumption from the Raw Materials warehouse
        target_warehouse = "Raw Materials - JSB-1ZT"
        
        if not target_warehouse:
            frappe.throw("Could not find a valid Source Warehouse for the Stock Entry.")

        # Add items to the Stock Entry
        for item_code, qty in item_consumption_totals.items():
            stock_uom = frappe.db.get_value("Item", item_code, "stock_uom") or "Nos"
            stock_entry.append("items", {
                "item_code": item_code,
                "qty": qty,
                "uom": stock_uom,
                "stock_uom": stock_uom,
                "conversion_factor": 1,
                "s_warehouse": target_warehouse,
                "cost_center": frappe.db.get_value("Company", doc.company, "cost_center")
            })
            
        stock_entry.set_missing_values()
        stock_entry.flags.ignore_permissions = True
        stock_entry.insert()
        stock_entry.submit()
        
        # Calculate totals for the success message
        total_core_nos = sum(frappe.utils.flt(q) for q in item_consumption_totals.values())
            
        # Notify the user on screen that a Stock Entry was created
        frappe.msgprint(f"<b>Success:</b> Auto-generated & Submitted <a href='/app/stock-entry/{stock_entry.name}'>Stock Entry {stock_entry.name}</a> for {total_core_nos} Nos Core consumption.", alert=True)
        
    except Exception as e:
        frappe.log_error(title=f"Core Consumption Error for {doc.name}", message=str(e))
        frappe.msgprint(f"Error automating Core Consumption: <br><pre>{str(e)}</pre>")
