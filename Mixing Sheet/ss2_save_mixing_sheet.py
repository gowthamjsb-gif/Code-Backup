# API Method Name: save_mixing_sheet
# Script Type: API

spr_name = frappe.form_dict.get("spr_name")
mixing_sheet_json = frappe.form_dict.get("mixing_sheet_json")

frappe.db.set_value("Shaft Production Run", spr_name, "custom_mixing_sheet_data", mixing_sheet_json)
frappe.db.commit()

frappe.response["message"] = "Saved"
