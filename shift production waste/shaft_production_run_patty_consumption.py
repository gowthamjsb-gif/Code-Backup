# API Server Script: shaft_production_run_patty_consumption
# Reduces Patty Stock balance and adds rows to SPR child table.
# (Stock Entry is deferred until SPR submission)

try:
    parent_doc_name = frappe.form_dict.get("parent_doc")
    ps_ids = frappe.form_dict.get("ps_ids")
    consume_qtys = frappe.form_dict.get("consume_qtys")

    if not parent_doc_name:
        frappe.throw("Parameter 'parent_doc' is required.")

    parent = frappe.get_doc("Shaft Production Run", parent_doc_name)
    
    # 1. Discover Recycled table fieldname and child fields
    recycle_table_field = None
    for df in frappe.get_meta(parent.doctype).fields:
        if df.fieldtype == "Table" and "recycle" in df.fieldname.lower():
            recycle_table_field = df.fieldname
            break
    
    if not recycle_table_field:
        frappe.throw("Could not find the Recycled Wastage table on the form.")
        
    meta = frappe.get_meta(parent.doctype)
    df_rec = meta.get_field(recycle_table_field)
    child_dt = df_rec.options
    child_fields = [df.fieldname for df in frappe.get_meta(child_dt).fields]

    def find_field(keywords):
        for f in child_fields:
            fn_low = f.lower()
            if any(kw.lower() in fn_low for kw in keywords):
                return f
        return None

    # 2. Parse comma-separated IDs and quantities
    id_list = [i.strip() for i in str(ps_ids or "").split(",") if i.strip()]
    qty_list = [float(q.strip() or 0) for q in str(consume_qtys or "").split(",") if q.strip()]
    
    if len(id_list) != len(qty_list):
        frappe.throw("Mismatch between number of IDs and quantities.")

    # 2b. Fallback only. Scanned Patty rows should keep their own wastage batch
    # (for example JS-0103261W/1), not the current roll batch JS-0103261/45.
    production_roll_batch = ""
    if parent.get("items"):
        for it in parent.get("items"):
            full_b = it.get("batch_no") or it.get("custom_batch_no") or ""
            if full_b:
                production_roll_batch = full_b
                break
    
    if not production_roll_batch and parent.name and "/" in parent.name:
        production_roll_batch = parent.name

    items_added = 0
    processed_logs = []

    for i in range(len(id_list)):
        ps_id = id_list[i]
        qty = float(qty_list[i] or 0)
        
        if not ps_id:
            continue
            
        # 3. Fetch Patty Stock Record
        ps = frappe.get_doc("Patty Stock", ps_id)
        if qty > 0 and float(ps.balance_quantity or 0) < qty:
            frappe.throw("Insufficient balance in Patty Stock: %s" % ps_id)

        # 4. Reduce Patty Stock balance (Only if qty > 0)
        if qty > 0:
            ps.balance_quantity = float(ps.balance_quantity or 0) - qty
            ps.save(ignore_permissions=True)
        
        # 5. Add to SPR table
        child = parent.append(recycle_table_field, {})
        child.job_id = "Patty"
        child.quality = ps.quality
        child.color = ps.colour
        child.gsm = ps.gsm
        
        # --- QUANTITIES ---
        # Available Qty: Full current balance of the Patty Stock
        f_avail = find_field(["available_qty"])
        if f_avail:
            # Show original balance before this consumption
            child.set(f_avail, float(ps.balance_quantity or 0) + (qty if qty > 0 else 0))
        
        f_recy = find_field(["recycled_qty", "qty", "wastage"])
        if f_recy:
            # User wants it empty if not provided, for manual entry in table
            child.set(f_recy, qty if qty > 0 else None)
        
        # --- BATCH NO FORMATTING ---
        # Prefer the scanned Patty Stock wastage batch; use production roll only as fallback.
        b_val = ps.get("batch_no") or production_roll_batch
        if b_val:
            child.set("batch_no", b_val)
            f_batch = find_field(["batch"])
            if f_batch and f_batch != "batch_no":
                child.set(f_batch, b_val)
            
        child.calculation_details = "PATTY_REF:" + str(ps_id)
        
        # --- WIDTH & OTHER FIELDS ---
        wid = float(ps.width_inch or 0)
        item_code = ps.item_code
        if wid == 0 and item_code and len(str(item_code)) == 16:
            mm_str = str(item_code)[12:16]
            if mm_str.isdigit():
                mm = float(mm_str)
                wid = round(mm / 25.4, 2)
        
        f_wid = find_field(["width"])
        if f_wid: child.set(f_wid, wid)
        
        f_mtr = find_field(["meter", "roll"])
        if f_mtr: child.set(f_mtr, float(ps.meter__roll_mtrs or 0))
        
        f_shf = find_field(["shaft"])
        if f_shf: child.set(f_shf, float(ps.no_of_shafts or 0))

        items_added += 1
        processed_logs.append("%s Kg from %s" % (qty, ps_id))

    if items_added > 0:
        # 6. Save the SPR to persist the child table additions
        parent.save(ignore_permissions=True)
        
        msg = "<b>%s Patty Stock row(s) added!</b><br>%s<br>Note: Stock Entry will be created upon Submission." % (items_added, "<br>".join(processed_logs))
        frappe.msgprint(msg)
    else:
        frappe.msgprint("No items were processed.")

except Exception as e:
    frappe.log_error("Patty Consumption API Error", str(e))
    frappe.throw("Consumption failed: " + str(e))
