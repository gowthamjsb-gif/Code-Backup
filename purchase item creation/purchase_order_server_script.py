# Server Script for DocType: Server Script (Type: API, Method: create_auto_item)
# Note: In Server Scripts, 'frappe' and '_' are already available. 'import' is restricted.

# 1. Get arguments
data = frappe.form_dict
category = data.get("category")
item_name = data.get("item_name")
hsn_code = data.get("hsn_code")
uom = data.get("uom") or "Nos"
company = data.get("company")

if not category or not item_name:
    frappe.throw(_("Category and Item Name are required"))

# 2. Normalize Item Name
clean_name = " ".join(item_name.strip().upper().split())
search_name = "".join(clean_name.split())

# 3. Duplicate Check
existing_items = frappe.get_all("Item", filters={"item_group": category}, fields=["item_code", "item_name"])

duplicate_found = False
for item in existing_items:
    existing_search_name = "".join((item.item_name or "").strip().upper().split())
    if search_name == existing_search_name:
        frappe.response["message"] = {
            "status": "exists",
            "item_code": item.item_code,
            "item_name": item.item_name,
            "message": _("Item already exists:") + f" {item.item_name} ({item.item_code})"
        }
        duplicate_found = True
        break

if not duplicate_found:
    # 4. Category-Series Mapping
    mapping = {
        "Daily Consumables": {"prefix": "DC", "start": 3001001, "end": 4001000},
        "Spares": {"prefix": "SP", "start": 4001001, "end": 4002000},
        "Tools": {"prefix": "TL", "start": 4002001, "end": 4003000},
        "Cable": {"prefix": "CB", "start": 4003001, "end": 4004000},
        "Genset Spares": {"prefix": "GS", "start": 4004001, "end": 4005000},
        "Plumbing": {"prefix": "PB", "start": 4005001, "end": 4006000},
        "Paints": {"prefix": "PT", "start": 4006001, "end": 4007000},
        "Rod": {"prefix": "WD", "start": 4007001, "end": 5001000},
        "Asset": {"prefix": "AS", "start": 5001001, "end": 5002000},
        "Service & Installations": {"prefix": "SI", "start": 5002001, "end": 5003000},
        "Chemicals": {"prefix": "CM", "start": 5003001, "end": 5004000},
        "Safety Measure": {"prefix": "SM", "start": 5004001, "end": 5005000},
        "Bolt & Nut": {"prefix": "BN", "start": 5005001, "end": 5006000},
        "Electricals": {"prefix": "EL", "start": 5006001, "end": 5007000},
        "Oil": {"prefix": "OL", "start": 5007001, "end": 5007500},
        "Glass": {"prefix": "GL", "start": 5007501, "end": 5008000},
        "Gas": {"prefix": "GS", "start": 5008001, "end": 5008500},
        "Bearing": {"prefix": "BR", "start": 5008501, "end": 5009000},
        "Civil & Carpentary": {"prefix": "CC", "start": 5009001, "end": 5009500},
        "Uniform": {"prefix": "UF", "start": 5009501, "end": 5010000},
        "Vehicle Maintenance": {"prefix": "VM", "start": 5010001, "end": 5010500},
        "Hardware & Software": {"prefix": "HS", "start": 5010501, "end": 9999999}
    }

    lookup_mapping = {k.upper(): v for k, v in mapping.items()}
    cat_config = lookup_mapping.get(category.strip().upper())

    if not cat_config:
        frappe.throw(_("Category mapping not found for:") + f" {category}")

    prefix = cat_config["prefix"]
    start_no = cat_config["start"]
    end_no = cat_config["end"]

    # 5. Find Last Number
    last_item_code = None
    if prefix:
        last_items = frappe.db.sql(f"""
            SELECT item_code FROM `tabItem` 
            WHERE item_code REGEXP '^{prefix} - [0-9]+$'
            ORDER BY CAST(SUBSTRING_INDEX(item_code, ' - ', -1) AS UNSIGNED) DESC LIMIT 1
        """, as_dict=1)
        if last_items:
            last_item_code = last_items[0].item_code
    else:
        last_items = frappe.db.sql("""
            SELECT item_code FROM `tabItem` 
            WHERE item_code REGEXP '^[0-9]+$'
            ORDER BY CAST(item_code AS UNSIGNED) DESC LIMIT 1
        """, as_dict=1)
        if last_items:
            last_item_code = last_items[0].item_code

    new_no = start_no
    if last_item_code:
        if prefix:
            parts = last_item_code.split(" - ")
            if len(parts) > 1 and parts[-1].isdigit():
                last_no = int(parts[-1])
                if last_no < end_no:
                    new_no = last_no + 1
        else:
            if last_item_code.isdigit():
                last_no = int(last_item_code)
                if last_no < end_no:
                    new_no = last_no + 1

    # Loop to ensure the new_no doesn't clash with an existing item due to race conditions or skipped numbers
    while True:
        final_item_code = f"{prefix} - {new_no}" if prefix else str(new_no)
        if not frappe.db.exists("Item", final_item_code):
            break
        new_no += 1

    # 6. Check for HSN (Mandatory for India Compliance)
    if not hsn_code:
        frappe.throw(_("HSN Code is mandatory in the Purchase Order row to create a new item."))

    # 7. Create Item
    try:
        new_item = frappe.get_doc({
            "doctype": "Item",
            "item_code": final_item_code,
            "item_name": clean_name,
            "item_group": category,
            "stock_uom": uom,
            "gst_hsn_code": hsn_code,
            "is_stock_item": 1,
            "opening_stock": 0,
            "valuation_rate": 0,
            "valuation_method": "FIFO"
        })
        
        if company:
            new_item.append("item_defaults", {
                "company": company,
                "default_warehouse": "Stores - JSB-1ZT"
            })
            
        new_item.insert(ignore_permissions=True)
        frappe.db.commit()
        
        frappe.response["message"] = {
            "status": "created",
            "item_code": final_item_code,
            "item_name": clean_name,
            "message": _("Item created successfully:") + f" {clean_name} ({final_item_code})"
        }
    except Exception as e:
        frappe.log_error(f"Auto Item Creation Failed: {str(e)}", "create_auto_item")
        frappe.throw(_("Failed to create item:") + f" {str(e)}")
