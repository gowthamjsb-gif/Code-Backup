# DOCTYPE: Item
# EVENT: After Insert
# Creates a Core Size record for EVERY "PC - " item (multiple items per core width is OK)

if doc.item_code and doc.item_code.startswith("PC - "):
    try:
        # Check if THIS specific item already has a Core Size
        existing = frappe.db.get_value("Core Size", {"item_code": doc.name}, "name")
        
        if not existing:
            # Determine core inch from known codes or description
            KNOWN_CORES = {
                "PC - 1005307": '63"', "PC - 1005158": '85"',
                "PC - 1005308": '90"', "PC - 1005161": '118"', "PC - 1005309": '126"',
            }
            core_inch_value = KNOWN_CORES.get(doc.item_code)
            
            if not core_inch_value:
                description = str(doc.description or doc.item_name or "")
                tokens = description.replace("-", " ").replace("(", " ").replace(")", " ").replace(",", " ").split()
                width_m = None
                for i, token in enumerate(tokens):
                    if token.upper() in ("M", "MW") and i > 0:
                        try:
                            width_m = float(tokens[i - 1]); break
                        except Exception: pass
                    elif token.upper().endswith("M") and len(token) > 1:
                        try:
                            width_m = float(token[:-1]); break
                        except Exception: pass
                
                if width_m:
                    width_in = width_m * 39.3701
                    if width_in <= 63: core_inch_value = '63"'
                    elif width_in <= 85: core_inch_value = '85"'
                    elif width_in <= 90: core_inch_value = '90"'
                    elif width_in <= 118: core_inch_value = '118"'
                    else: core_inch_value = '126"'
            
            if not core_inch_value:
                core_inch_value = '63"'
            
            # Create Core Size with a UNIQUE name (item code) so duplicates are allowed per core inch
            core_size = frappe.new_doc("Core Size")
            core_size.item_code = doc.name
            core_size.item_name = doc.item_name
            core_size.core_inch = core_inch_value
            
            # Override the auto-name to use item code number, making it unique
            # e.g. "PC - 1005195" instead of "63" (which would duplicate)
            core_size.name = doc.item_code
            
            core_size.insert(ignore_permissions=True)
            
            frappe.msgprint(
                "✅ Created Core Size <b>" + core_size.name + "</b> — Inch: <b>" + core_inch_value + "</b>",
                alert=True
            )
        else:
            frappe.msgprint("ℹ️ Core Size <b>" + existing + "</b> already exists for this item.", alert=True)
    
    except Exception as e:
        frappe.log_error(title="Auto Core Size Creation Error", message=str(e))
        frappe.msgprint("❌ Failed: <code>" + str(e) + "</code>", indicator="red")
