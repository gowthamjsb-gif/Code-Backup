# Server Script - Document Type: Customer
# Hook: Before Save (or Before Insert)

if doc.gstin and len(doc.gstin) >= 2:
    # 1. Clean GST (remove extra spaces and make uppercase)
    gst = doc.gstin.strip().upper()
    doc.gstin = gst

    # -------------------------------
    # 2. DUPLICATE GSTIN BLOCK
    # -------------------------------
    # Checks if another Customer uses this GST
    filters = {"gstin": gst}
    
    # If the document is not new, exclude its own name from the search
    if doc.is_new():
        pass # It's a new document, search all existing
    else:
        filters["name"] = ["!=", doc.name]

    existing_customer = frappe.db.get_value("Customer", filters, "customer_name")

    if existing_customer:
        msg = f"GSTIN <b>{gst}</b> already exists in Customer: <b>{existing_customer}</b>"
        frappe.throw(msg)
