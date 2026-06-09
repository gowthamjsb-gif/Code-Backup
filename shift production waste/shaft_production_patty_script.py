# Server Script for Shaft Production Run (on_submit)
# Handles automated Material Receipt (Production) and Material Issue (Consumption) for Patty Stock.

try:
    frappe.flags.spr_msgs = ["--- PATTY STOCK & WASTAGE STATUS ----"]
    
    unit_val = str(doc.get("unit") or doc.get("custom_unit") or "").strip().upper()
    is_valid_unit = False
    for u in ["UNIT 1", "UNIT 2", "UNIT 3", "UNIT 4"]:
        if u in unit_val:
            is_valid_unit = True
            break
            
    if not is_valid_unit:
        raise ValueError("SKIP_AUTOMATION")

    preferred_warehouse = ""
    if "UNIT 4" in unit_val:
        company_name = "Thusma SMS Nonwovens Private Limited - 1Z0"
        preferred_warehouse = "Raw Materials Warehouse - TSNPL"
    elif "UNIT 1" in unit_val or "UNIT 2" in unit_val or "UNIT 3" in unit_val:
        company_name = "Jayashree Spun Bond - 1ZT"
        preferred_warehouse = "Raw Materials - JSB-1ZT"
    else:
        company_name = doc.get("company")
        preferred_warehouse = "Raw Materials - JSB-1ZT"
    if not company_name:
        frappe.throw("Company is required for Patty Stock automation. Please set Unit as Unit 1, Unit 2, Unit 3, or Unit 4.")

    stock_warehouse = preferred_warehouse
    if not frappe.db.exists("Warehouse", stock_warehouse):
        stock_warehouse = ""
        wh_rows = frappe.db.get_all(
            "Warehouse",
            filters={"company": company_name, "is_group": 0},
            fields=["name", "warehouse_name"]
        )
        for wh in wh_rows:
            wh_name = str(wh.get("name") or "")
            wh_title = str(wh.get("warehouse_name") or "")
            wh_text = (wh_name + " " + wh_title).lower()
            if "raw" in wh_text and "material" in wh_text:
                stock_warehouse = wh_name
                break

    if not stock_warehouse:
        frappe.throw("Could not find a Raw Materials warehouse for company " + str(company_name) + ". Please check Warehouse master.")
    
    def log(m):
        frappe.flags.spr_msgs.append(str(m))

    def get_or_create_patty_item(process, quality, colour, gsm, width_inch, company=None, warehouse=None):
        # 1. Fetch Codes
        p_code = frappe.db.get_value("Process Master", {"process_name": process}, "process_code") or "100"
        q_code = frappe.db.get_value("Quality Master", {"quality_name": quality}, "quality_code") or "000"
        c_code = frappe.db.get_value("Colour Master", {"colour_name": colour}, "colour_code") or "000"

        # 2. Parse values
        qual_name = str(quality or "Unknown").strip().upper()
        col_name = str(colour or "Unknown").strip().upper()
        gs_raw = str(gsm or "0")
        gs_digits = "".join([c for c in gs_raw if c.isdigit() or c == "."])
        gsm_val = float(gs_digits) if gs_digits else 0.0
        gs_int = int(gsm_val)
        w_inch = float(width_inch or 0)
        w_mm = int(round((w_inch * 25.4) / 5.0) * 5)
        
        # 3. Generate Code and Name
        ic = str(p_code).zfill(3) + str(q_code).zfill(3) + str(c_code).zfill(3) + str(gs_int).zfill(3) + str(w_mm).zfill(4)
        inm = "NON WOVEN FABRIC " + qual_name + " " + col_name + " " + str(gs_int) + " GSM W - " + str(w_inch) + "\" ( " + str(w_mm) + " MM )"
        hsn = "56031400" if gs_int > 150 else ("56031100" if gs_int <= 24 else ("56031200" if gs_int <= 70 else "56031300"))

        # 4. Create Item if missing
        if not frappe.db.exists("Item", ic):
            frappe.get_doc({
                "doctype": "Item",
                "item_code": ic,
                "item_name": inm,
                "item_group": "Products",
                "stock_uom": "Kg",
                "is_stock_item": 1,
                "has_batch_no": 1,
                "gst_hsn_code": hsn,
                "allow_zero_valuation_rate": 1,
                "item_defaults": [{
                    "doctype": "Item Default",
                    "company": company,
                    "default_warehouse": warehouse
                }]
            }).insert(ignore_permissions=True)
            frappe.flags.spr_msgs.append("Created new Item: " + str(ic))
        return [ic, inm]

    def ensure_batch(batch_no, item_code, net_weight, gross_weight, meter, order_code):
        if not batch_no or not item_code:
            return
        if not frappe.db.exists("Batch", batch_no):
            batch_doc = frappe.new_doc("Batch")
            batch_doc.batch_id = batch_no
            batch_doc.item = item_code
            batch_doc.custom_net_weight = net_weight
            batch_doc.custom_gross_weight = gross_weight
            batch_doc.custom_meter = meter
            batch_doc.custom_order_code = order_code
            batch_doc.insert(ignore_permissions=True)

    def get_val(row_obj, keywords, default=None):
        try:
            d = row_obj.as_dict()
        except:
            d = row_obj
        if isinstance(d, dict):
            for kw in keywords:
                if kw in d and d[kw] is not None: return d[kw]
            for k in d.keys():
                for kw in keywords:
                    if kw.lower() in k.lower() and d[k] is not None:
                        return d[k]
        return default

    def get_base_batch(batch_value):
        batch_text = str(batch_value or "").strip()
        if not batch_text:
            return ""
        if "/" in batch_text:
            batch_text = batch_text.split("/")[0].strip()
        if batch_text.endswith("W"):
            batch_text = batch_text[:-1]
        return batch_text

    # --- PART 1: PRODUCTION (MATERIAL RECEIPT) ---
    spr_process = doc.get("process") or "NON WOVEN FABRIC"
    order_code = doc.get("order_code") or doc.get("custom_order_code") or doc.get("order") or ""

    # --- WASTAGE BATCH SERIES SETUP ---
    # Format: {BaseBatch}W/{N}; base comes from roll batch before the roll suffix.
    shift_val = str(doc.get("shift") or "").strip().lower()
    series_start = 1
    if shift_val:
        log("Shift detected: " + str(doc.get("shift")) + "; wastage series starts at " + str(series_start))
    else:
        log("Wastage series starts at " + str(series_start))

    def get_next_wastage_series(base_batch_w, start_number):
        """Return next available series number for {base_batch_w}/N."""
        existing = frappe.db.get_all(
            "Batch",
            filters=[
                ["name", "like", base_batch_w + "/%"]
            ],
            fields=["name"]
        )
        used_nums = []
        for rec in existing:
            parts = (rec.name or "").split("/")
            if len(parts) == 2:
                try:
                    n = int(parts[1])
                    if n >= start_number:
                        used_nums.append(n)
                except:
                    pass
        return (max(used_nums) + 1) if used_nums else start_number

    # Track series within this submit (for multiple wastage rows in one SPR)
    series_counter = {}  # key: base_batch_w → next number

    # Waste production tables
    w_tables = ["wastage_details", "custom_wastage_details", "running_patty_wastage", "custom_running_patty_wastage"]
    rows = []
    for t_name in w_tables:
        if doc.get(t_name): rows.extend(doc.get(t_name))
    
    production_items = []
    for i, row in enumerate(rows):
        recycle_to_next = get_val(row, ["recycle_to_next", "custom_recycle_to_next"], 0)
        if recycle_to_next:
            log("Skipped label/batch for recycle-to-next wastage row.")
            continue

        qty = float(get_val(row, ["net_wastage", "net"], 0) or 0)
        if qty > 0.001:
            qual = get_val(row, ["quality"])
            col = get_val(row, ["color", "colour"])
            gs = get_val(row, ["gsm"], 0)
            
            wid = get_val(row, ["width"])
            if not wid or float(wid) == 0:
                if "UNIT 1" in unit_val or "UNIT 2" in unit_val: wid = 10
                elif "UNIT 3" in unit_val: wid = 12
                elif "UNIT 4" in unit_val: wid = 15 if float(gs or 0) < 80 else 14
                else: wid = 10
            
            mtr = get_val(row, ["meter", "roll"], 0)
            shf = get_val(row, ["shaft"], 0)
            
            it_dt = get_or_create_patty_item(spr_process, qual, col, gs, wid, company=company_name, warehouse=stock_warehouse)
            p_ic = it_dt[0]
            
            # --- GET ACTUAL BATCH NO ---
            actual_batch = get_val(row, ["batch_no", "custom_batch_no", "batch"])
            if not actual_batch:
                jid = get_val(row, ["job_id", "job", "custom_job_id", "target_job_id", "work_order", "idx", "name"])
                if jid:
                    for it in (doc.get("items") or []):
                        it_jid = it.get("job_id") or it.get("job") or it.get("custom_job_id") or it.get("target_job_id") or it.get("work_order") or it.get("idx") or it.get("name")
                        if str(it_jid) == str(jid):
                            actual_batch = it.get("batch_no") or it.get("custom_batch_no") or it.get("batch")
                            if actual_batch: break
            if not actual_batch:
                for it in (doc.get("items") or []):
                    actual_batch = it.get("batch_no") or it.get("custom_batch_no") or it.get("batch")
                    if actual_batch: break
            
            if actual_batch:
                actual_batch = get_base_batch(actual_batch)
            else:
                actual_batch = get_base_batch(doc.name) or doc.name

            # --- BUILD WASTAGE BATCH NUMBER: {BaseBatch}W/{N} ---
            # e.g. roll batch "JS-0103261/45" becomes "JS-0103261W/1".
            base_w = actual_batch + "W"

            # Check if we already queried DB for this base_w in this submit
            if base_w not in series_counter:
                series_counter[base_w] = get_next_wastage_series(base_w, series_start)

            wastage_batch_no = base_w + "/" + str(series_counter[base_w])
            # Plain assignment (no += on subscripts) — required by RestrictedPython in Server Script
            series_counter[base_w] = series_counter[base_w] + 1
            
            # Update the child table row with the real assigned batch number so the UI stays in sync
            b_f = "batch_no"
            if not row.get(b_f) and row.get("batch"):
                b_f = "batch"
            
            try:
                row.db_set(b_f, wastage_batch_no)
            except:
                pass

            ensure_batch(wastage_batch_no, p_ic, qty, qty, mtr, order_code)
            log("Wastage Batch No: " + wastage_batch_no)

            ps = frappe.new_doc("Patty Stock")
            ps.batch_no = wastage_batch_no
            ps.item_code = p_ic
            ps.item_name = it_dt[1]
            ps.quality = qual
            ps.colour = col
            ps.gsm = gs
            ps.width_inch = wid
            ps.meter__roll_mtrs = mtr
            ps.no_of_shafts = shf
            ps.balance_quantity = qty
            ps.uom = "Kg"
            ps.company = company_name
            ps.insert(ignore_permissions=True)
            
            production_items.append({"item_code": p_ic, "qty": qty, "batch_no": wastage_batch_no})
            log("Created Patty Stock row for waste production: " + str(qty) + " Kg")

    if production_items:
        mr = frappe.new_doc("Stock Entry")
        mr.purpose = "Material Receipt"
        mr.stock_entry_type = "Material Receipt"
        mr.company = company_name
        mr.remarks = "Automated Wastage Production from SPR: " + str(doc.name)
        for it in production_items:
            s_row = mr.append("items", {})
            s_row.item_code = it["item_code"]
            s_row.qty = it["qty"]
            s_row.batch_no = it["batch_no"]
            s_row.t_warehouse = stock_warehouse
            s_row.uom = "Kg"
            s_row.allow_zero_valuation_rate = 1
        mr.insert(ignore_permissions=True)
        mr.submit()
        log("Material Receipt Submitted: " + str(mr.name))

    # --- PART 2: CONSUMPTION (MATERIAL ISSUE) ---
    rec_table_field = None
    for df in frappe.get_meta(doc.doctype).fields:
        if df.fieldtype == "Table" and "recycle" in df.fieldname.lower():
            rec_table_field = df.fieldname
            break

    if rec_table_field and doc.get(rec_table_field):
        mi_items = []
        for r_row in doc.get(rec_table_field):
            calc = str(r_row.get("calculation_details") or "")
            if not calc.startswith("PATTY_REF:"): continue
            
            ps_ref = calc.replace("PATTY_REF:", "").strip()
            qty = float(r_row.get("recycled_qty_kgs") or r_row.get("recycled_qty") or 0)
            
            if ps_ref and qty > 0:
                ps_data = frappe.db.get_value("Patty Stock", ps_ref, ["item_code", "batch_no"], as_dict=True)
                if not ps_data or not ps_data.get("item_code"): continue
                
                mi_items.append({"item_code": ps_data.get("item_code"), "qty": qty, "warehouse": stock_warehouse, "uom": "Kg", "batch_no": ps_data.get("batch_no")})

        # PART 2b: Polybag Details
        poly_field = None
        for df in frappe.get_meta(doc.doctype).fields:
            if df.fieldtype == "Table" and "polybag" in df.fieldname.lower():
                poly_field = df.fieldname
                break
        
        if poly_field and doc.get(poly_field):
            for p_row in doc.get(poly_field):
                p_code = p_row.get("polybag_item") or p_row.get("item_code")
                p_qty = float(p_row.get("quantity_kgs") or p_row.get("qty") or 0)
                p_uom = p_row.get("uom") or "Kg"
                
                if p_code and p_qty > 0:
                    mi_items.append({"item_code": p_code, "qty": p_qty, "warehouse": stock_warehouse, "uom": p_uom})

        if mi_items:
            mi = frappe.new_doc("Stock Entry")
            mi.purpose = "Material Issue"
            mi.stock_entry_type = "Material Issue"
            mi.company = company_name
            mi.remarks = "Consolidated Consumption from SPR: " + str(doc.name)
            for it in mi_items:
                s_row = mi.append("items", {})
                s_row.item_code = it["item_code"]
                s_row.qty = it["qty"]
                if it.get("batch_no"):
                    s_row.batch_no = it.get("batch_no")
                s_row.s_warehouse = it["warehouse"]
                s_row.uom = it.get("uom") or "Kg"
                s_row.allow_zero_valuation_rate = 1
            mi.insert(ignore_permissions=True)
            mi.submit()
            log("Material Issue Submitted for Consumption: " + str(mi.name))

    if len(frappe.flags.spr_msgs) > 1:
        frappe.msgprint("<br>".join(frappe.flags.spr_msgs))

except ValueError as e:
    if str(e) == "SKIP_AUTOMATION":
        pass
    else:
        frappe.log_error("SPR Patty Submit Error", str(e))
        frappe.throw("Error in Patty Stock submission: " + str(e))
except Exception as e:
    frappe.log_error("SPR Patty Submit Error", str(e))
    frappe.throw("Error in Patty Stock submission: " + str(e))
