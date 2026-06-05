# DocType Event Server Script: Shaft Production Run - Before Save
# Dynamically detects deleted Patty rows and restores Patty Stock balance.
# (Stock restoration to warehouse is implicit because Issue only happens on Submit)

try:
    if doc.docstatus == 0: # Only for Draft documents
        # 1. Discover the Recycled Wastage table fieldname and child DocType
        rec_table_field = None
        child_dt_name = None
        for df in doc.meta.get_table_fields():
            if "recycle" in df.fieldname.lower():
                rec_table_field = df.fieldname
                child_dt_name = df.options
                break
                
        if rec_table_field and child_dt_name:
            # 2. Map current Patty rows in memory
            current_patty_names = set()
            for row in (doc.get(rec_table_field) or []):
                jid = str(row.get("job_id") or "").strip().lower()
                row_nm = row.get("name") or ""
                if jid == "patty" and row_nm:
                    current_patty_names.add(row_nm)
            
            # 3. Fetch SAVED Patty rows from database
            sql = """SELECT name, recycled_qty_kgs, calculation_details 
                   FROM `tab%s` 
                   WHERE parent=%%s AND job_id='Patty'""" % child_dt_name
            saved_patty_rows = frappe.db.sql(sql, (doc.name,), as_dict=True)
            
            restored_logs = []
            for saved_row in saved_patty_rows:
                s_name = saved_row.get("name")
                if s_name not in current_patty_names:
                    # Row deleted in UI
                    calc = str(saved_row.get("calculation_details") or "")
                    qty = float(saved_row.get("recycled_qty_kgs") or 0)
                    
                    ps_id = ""
                    if calc.startswith("PATTY_REF:"):
                        ps_id = calc.replace("PATTY_REF:", "").strip()
                    
                    if ps_id and qty > 0:
                        try:
                            # 4. Restore Patty Stock Record balance
                            ps = frappe.get_doc("Patty Stock", ps_id)
                            ps.balance_quantity = float(ps.balance_quantity or 0) + qty
                            ps.save(ignore_permissions=True)
                            restored_logs.append("Restored " + str(qty) + " Kg back to Patty Stock balance: " + ps_id)
                        except Exception as err:
                            frappe.log_error("Patty Restore Fail", str(err))
            
            if restored_logs:
                frappe.msgprint("<br>".join(restored_logs))

except Exception as e:
    frappe.log_error("Patty Before Save Error", str(e))
