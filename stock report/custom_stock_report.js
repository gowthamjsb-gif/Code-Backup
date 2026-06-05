frappe.query_reports["Custom Stock Report"] = {
    "filters": [
        {
            "fieldname": "item_code",
            "label": __("Item Code"),
            "fieldtype": "Link",
            "options": "Item",
            "width": "80"
        },
        {
            "fieldname": "batch",
            "label": __("Batch"),
            "fieldtype": "Link",
            "options": "Batch",
            "width": "80"
        }
    ]
};
