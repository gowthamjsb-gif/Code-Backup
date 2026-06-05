# SCRIPT: FACTORY (Smart Item Manager: Auto-Fill & Safe Creation)
# EVENT: Before Save

# --- 1. CONFIGURATION ---
PROCESS_CODE = "100"
PLACEHOLDER_ITEM = "CUSTOM-FABRIC" 

# Quality Codes (Standard + Special)
quality_config = {
    "PREMIUM": "100", "PLATINUM": "101", "SUPER PLATINUM": "102",
    "GOLD": "103", "SILVER": "104", "BRONZE": "105",
    "CLASSIC": "106", "SUPER CLASSIC": "107", "LIFESTYLE": "108",
    "ECO SPECIAL": "109", "ECO GREEN": "110", "SUPER ECO": "111",
    "ULTRA": "112", "DELUXE": "113", "UV": "114",
    "M/S ABHISHEK INDUSTRIES - ECO SPECIAL": "125",
    "MN ECO - BRONZE": "126",
    "HARINI BAGS - GOLD": "127",
    "MANJUNATHA - ECO GREEN": "128",
    "MANJUNATHA - DELUXE": "129",
    "MAGILAN - PLATINUM": "130",
    "PAYAL - UV": "131",
    "AZKARA - GOLD": "132",
    "AZKARA - SILVER": "133",
    "AZKARA - ECO GREEN": "134",
    "AZKARA - DELUXE": "135",
    "REMEX - SILVER": "136",
    "REMEX - SUPER BRONZE": "137",
    "ESWARI TEX - GOLD": "138",
    "ESWARI TEX - ULTRA": "139",
    "ESWARI TEX - DELUXE": "140",
    "AZKARA - SUPER ECO": "141",
    "AZKARA - PLATINUM": "143",
    "AZKARA - ULTRA": "144",
}

# Special Quality Alias Map (What to DISPLAY in the product name)
special_quality_alias = {
    "M/S ABHISHEK INDUSTRIES - ECO SPECIAL": "ABI 1",
    "MN ECO - BRONZE": "MCB 1",
    "HARINI BAGS - GOLD": "HRB 1",
    "MANJUNATHA - ECO GREEN": "MNE 1",
    "MANJUNATHA - DELUXE": "MNE 2",
    "MAGILAN - PLATINUM": "MAG 1",
    "PAYAL - UV": "PST 1",
    "AZKARA - GOLD": "AZK 1",
    "AZKARA - SILVER": "AZK 2",
    "AZKARA - ECO GREEN": "AZK 3",
    "AZKARA - SUPER ECO": "AZK 4",
    "AZKARA - DELUXE": "AZK 5",
    "AZKARA - PLATINUM": "AZK 6",
    "AZKARA - ULTRA": "AZK 7",
    "REMEX - SILVER": "REMEX 1",
    "REMEX - SUPER BRONZE": "REMEX 2",
    "ESWARI TEX - GOLD": "ESW 1",
    "ESWARI TEX - ULTRA": "ESW 2",
    "ESWARI TEX - DELUXE": "ESW 3",
}

# Color Codes
color_config = {
    "RED": "222", "BLUE": "322", "WHITE": "001", "IVORY": "101", "NAVY BLUE": "344",
    "BRIGHT WHITE": "001", "MILKY WHITE": "002", "SUPER WHITE": "003",
    "SUNSHINE WHITE": "004", "BLEACH WHITE 1.0": "005", "BLEACH WHITE 2.0": "006",
    "BRIGHT IVORY": "101", "IVORY 2.0": "102", "CREAM 1.0": "121",
    "LEMON YELLOW": "142", "LEMON YELLOW 2.0": "143", "LEMON YELLOW 4.0": "145",
    "GOLDEN YELLOW": "161", "GOLDEN YELLOW 5.0": "166", "PLX GOLDEN YELLOW 7013": "161",
    "BRIGHT ORANGE": "181", "DARK ORANGE": "182", "ORANGE 1.0": "183",
    "BABY PINK": "201", "DARK PINK": "204", "PINK 4.0": "206",
    "CRIMSON RED": "221", "RED 1.0": "222", 
    "LIGHT MAROON": "241", "RED 2.0": "242", "DARK MAROON": "251",
    "MEDICAL BLUE": "261", "BLUE 3.0": "283", "BLUE 5.0": "301",
    "PEACOCK BLUE": "302", "ROYAL BLUE": "322", 
    "NAVY BLUE 347": "347", "VIOLET": "361",
    "PARROT GREEN": "401", "RELIANCE GREEN": "421", "SEA GREEN": "446",
    "LIGHT GREY": "464", "DARK GREY": "465", "CHOCOLATE BROWN": "487",
    "LIGHT BEIGE": "501", "DARK BEIGE": "521", "BLACK": "542",
    "WHITE MIX": "600", "BLACK MIX": "601", "COLOR MIX": "602", "BEIGE MIX": "603"
}

# GENERATE REVERSE MAPS
quality_rev = {v: k for k, v in quality_config.items()}
color_rev   = {v: k for k, v in color_config.items()}

# --- 2. MAIN LOOP ---
for row in doc.items:
    
    # --- LOGIC A: REVERSE FILL ---
    if row.item_code != PLACEHOLDER_ITEM and row.item_code.startswith(PROCESS_CODE) and len(row.item_code) == 16:
        has_user_data = row.custom_quality and row.custom_color and row.custom_gsm
        if not has_user_data:
            try:
                q_code_extracted = row.item_code[3:6]
                c_code_extracted = row.item_code[6:9]
                gsm_extracted    = row.item_code[9:12]
                mm_extracted     = row.item_code[12:16]
                
                q_name = quality_rev.get(q_code_extracted, "")
                c_name = color_rev.get(c_code_extracted, "")
                gsm_val = int(gsm_extracted)
                width_inch = float(int(mm_extracted) / 25.4)
                
                if q_name: row.custom_quality = q_name
                if c_name: row.custom_color = c_name
                row.custom_gsm = gsm_val
                row.custom_width_inch = round(width_inch, 1)
                
                frappe.msgprint(f"ℹ️ Auto-Filled specs for {row.item_code}", alert=True)
                continue
            except Exception:
                pass
    
    # --- LOGIC B: ITEM CREATION / SWAPPING ---
    q_input = str(row.custom_quality or "").strip().upper()
    c_input = str(row.custom_color or "").strip().upper()
    
    w_val = 0
    if row.custom_width_inch: w_val = float(row.custom_width_inch)
    elif hasattr(row, 'custom_width') and row.custom_width: w_val = float(row.custom_width)

    if q_input and c_input and row.custom_gsm and w_val > 0:
        
        # Get quality code from config
        q_code = quality_config.get(q_input, "105")
        
        # Check if this is a SPECIAL quality → use alias for display name
        # e.g., "HARINI BAGS - GOLD" → display as "HRB 1"
        display_quality = special_quality_alias.get(q_input, q_input)
        
        c_code = color_config.get(c_input, "000")
        
        exact_mm = w_val * 25.4
        rounded_mm = int(5 * round(exact_mm / 5))
        gsm_code = str(row.custom_gsm).zfill(3)
        mm_code = str(rounded_mm).zfill(4)
        
        final_item_code = f"{PROCESS_CODE}{q_code}{c_code}{gsm_code}{mm_code}"
        final_item_name = f"NON WOVEN FABRIC {display_quality} {c_input} {row.custom_gsm} GSM W - {w_val}'' ( {rounded_mm} MM )"
        
        if row.item_code != final_item_code:
            gsm_val = int(row.custom_gsm)
            hsn = "56031100"
            if 25 <= gsm_val <= 70: hsn = "56031200"
            elif 71 <= gsm_val <= 150: hsn = "56031300"
            elif gsm_val > 150: hsn = "56031400"

            if not frappe.db.exists("Item", final_item_code):
                item = frappe.new_doc("Item")
                item.item_code = final_item_code
                item.item_name = final_item_name
                item.item_group = "Products"
                item.stock_uom = "Kg"
                item.weight_uom = "Kg"
                item.is_stock_item = 1
                item.valuation_method = "FIFO"
                item.gst_hsn_code = hsn
                item.has_batch_no = 1
                item.create_new_batch = 0
                item.append("item_defaults", {"company": doc.company, "default_warehouse": "Finished Goods - JSB-1ZT"})
                item.append("taxes", {"item_tax_template": "GST 5% - JSB-1ZT"})
                item.insert(ignore_permissions=True)
                frappe.msgprint(f"✨ Created: {final_item_code}")
            
            row.item_code = final_item_code
            row.item_name = final_item_name
            row.description = final_item_name
            row.uom = "Kg"
            frappe.msgprint(f"✅ Selected: {final_item_name}", alert=True)