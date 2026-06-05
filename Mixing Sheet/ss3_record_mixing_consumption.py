# API Method Name: record_mixing_consumption
# Script Type: API


spr_name  = frappe.form_dict.get("spr_name")
set_index = int(frappe.form_dict.get("set_index", 0))
row_index = int(frappe.form_dict.get("row_index", 0))

state_json = frappe.form_dict.get("state_json")

if state_json:
    data = json.loads(state_json)
else:
    raw = frappe.db.get_value("Shaft Production Run", spr_name, "custom_mixing_sheet_data")
    if not raw:
        frappe.throw("No mixing sheet data found for this Shaft Production Run. Please save the sheet first.")
    data = json.loads(raw)

sets = data.get("sets", [])

if set_index < len(sets) and row_index < len(sets[set_index].get("rows", [])):
    row = sets[set_index]["rows"][row_index]
    row["consumed"]    = True
    row["consumed_by"] = frappe.session.user
    row["consumed_at"] = frappe.utils.now()

frappe.db.set_value("Shaft Production Run", spr_name, "custom_mixing_sheet_data", json.dumps(data))
frappe.db.commit()

frappe.response["message"] = data
