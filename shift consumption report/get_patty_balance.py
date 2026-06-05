# Server Script: get_patty_balance (Type: API)
# Arguments: quality, colour, gsm, width_inch

quality = frappe.form_dict.get('quality')
colour = frappe.form_dict.get('colour')
gsm = frappe.form_dict.get('gsm')
width_inch = frappe.form_dict.get('width_inch')

filters = {
    "quality": quality,
    "colour": colour,
    "gsm": gsm,
    "width_inch": width_inch
}

balance = frappe.db.get_value("Patty Stock", filters, "balance_quantity")
frappe.response['message'] = float(balance or 0)
