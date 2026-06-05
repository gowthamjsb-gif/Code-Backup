# SCRIPT: SMART BOM CREATOR (FETCHING FROM MASTERS)
# TYPE: API
# METHOD NAME: create_smart_bom

def extract_code(val, default_code):
    if not val:
        return default_code
    val_str = str(val).strip()
    if "[" in val_str and val_str.endswith("]"):
        parts = val_str.split("[")
        code = parts[-1].rstrip("]").strip()
        if code:
            return code
    return val_str

def resolve_item_code(val, default_code=""):
    """
    Best-effort resolver for values coming from UI inputs.
    Accepts:
    - direct Item name (item_code)
    - "Label [ITEMCODE]" patterns
    - item_name (if it maps uniquely to an Item)
    """
    code = extract_code(val, default_code)
    if not code:
        return default_code

    # 1) Already a valid Item name.
    if frappe.db.exists("Item", code):
        return code

    # 2) Some UIs send the item_name instead of name; resolve if unique.
    matches = frappe.get_all("Item", filters={"item_name": code}, pluck="name", limit=2)
    if len(matches) == 1:
        return matches[0]

    # 3) Last-resort cleanup for accidental whitespace.
    code2 = str(code).strip()
    if code2 and frappe.db.exists("Item", code2):
        return code2

    return code

def parse_recipe_payload(raw_payload):
    """
    Parse recipe payload in a tolerant way because Frappe can deliver args
    as JSON string, Python-like string, or already-parsed dict.
    """
    if raw_payload is None:
        return None
    # Already dict-like object (dict / frappe._dict)
    try:
        raw_payload.get("pp_rows")
        return raw_payload
    except Exception:
        pass
    if isinstance(raw_payload, str):
        txt = raw_payload.strip()
        if not txt or txt.lower() in ("undefined", "null", "none"):
            return None
        # 1) Frappe JSON parser
        try:
            out = frappe.parse_json(txt)
            try:
                out.get("pp_rows")
                return out
            except Exception:
                pass
            # Some payloads arrive double-encoded JSON string
            if isinstance(out, str):
                out2 = frappe.parse_json(out)
                try:
                    out2.get("pp_rows")
                    return out2
                except Exception:
                    pass
        except Exception:
            pass
    return None

# 1. GET INPUTS
req_item_code = frappe.form_dict.get('item_code')
req_quality = frappe.form_dict.get('quality')
recipe_payload_raw = frappe.form_dict.get('recipe_payload')
force_new = str(frappe.form_dict.get('force_new') or "").strip().lower() in ("1", "true", "yes")
production_plan = frappe.form_dict.get("production_plan")
po_item_index = frappe.form_dict.get("po_item_index")

if not req_item_code:
    frappe.response['message'] = "Error: Missing Input (Item Code)"
else:
    handled_by_payload = False
    # New payload path for multi-row PP/Filler/Additives/MB.
    if recipe_payload_raw:
        handled_by_payload = True
        payload = parse_recipe_payload(recipe_payload_raw)
        if payload is None:
            payload_preview = str(recipe_payload_raw)[:240]
            frappe.response['message'] = "Error: Invalid recipe payload JSON"
            frappe.response["smart_bom_debug"] = {
                "force_new": force_new,
                "payload_is_string": 1 if isinstance(recipe_payload_raw, str) else 0,
                "payload_preview": payload_preview
            }
            # Fail-safe: allow fallback to legacy args path if client sent those.
            handled_by_payload = False

        if payload is not None:
            pp_rows = payload.get("pp_rows") or []
            fl_rows = payload.get("fl_rows") or []
            ad_rows = payload.get("ad_rows") or []
            mb_rows = payload.get("mb_rows") or []
            mb_ldr = float(payload.get("mb_ldr") or 0.0)
            frappe.response["smart_bom_debug"] = {
                "force_new": force_new,
                "received": {
                    "pp_rows": pp_rows,
                    "fl_rows": fl_rows,
                    "ad_rows": ad_rows,
                    "mb_rows": mb_rows,
                    "mb_ldr": mb_ldr,
                },
            }

            def sanitize_rows(rows, qty_key="qty"):
                out = []
                for row in rows:
                    icode = resolve_item_code(row.get("item_code"), "")
                    qty = float(row.get(qty_key) or 0.0)
                    if icode and qty > 0:
                        out.append({"item_code": icode, qty_key: qty})
                return out

            pp_rows = sanitize_rows(pp_rows, "qty")
            fl_rows = sanitize_rows(fl_rows, "qty")
            ad_rows = sanitize_rows(ad_rows, "qty")
            mb_rows = sanitize_rows(mb_rows, "share")

            # Persist raw popup recipe on Production Plan row (if field exists).
            # This enables print formats to fetch exact "One Mixing Ratio" KGs.
            try:
                if production_plan is not None and po_item_index is not None:
                    idx = int(po_item_index)
                    pp_doc = frappe.get_doc("Production Plan", production_plan)
                    if pp_doc and hasattr(pp_doc, "po_items") and pp_doc.po_items and idx >= 0 and idx < len(pp_doc.po_items):
                        target_row = pp_doc.po_items[idx]
                        child_meta = frappe.get_meta(target_row.doctype)
                        payload_to_store = {
                            "pp_rows": pp_rows,
                            "fl_rows": fl_rows,
                            "ad_rows": ad_rows,
                            "mb_rows": mb_rows,
                            "mb_ldr": mb_ldr,
                        }
                        for fieldname in ("custom_recipe_payload", "recipe_payload", "custom_popup_recipe_payload"):
                            if child_meta.has_field(fieldname):
                                target_row.set(fieldname, frappe.as_json(payload_to_store))
                                break
                        pp_doc.save(ignore_permissions=True)
            except Exception:
                # Never block BOM creation on persistence failures.
                pass

            base_tot = sum(d["qty"] for d in pp_rows) + sum(d["qty"] for d in fl_rows)
            if base_tot <= 0:
                frappe.response['message'] = "Error: Base total (PP + Filler) cannot be 0"
            else:
                mb_total = (base_tot * mb_ldr) / 100.0
                ad_total = sum(d["qty"] for d in ad_rows)
                total_batch_weight = base_tot + ad_total + mb_total
                if total_batch_weight <= 0:
                    frappe.response['message'] = "Error: Total batch weight cannot be 0"
                else:
                    batch_items = {}

                    def add_batch_item(icode, weight):
                        if icode and weight > 0:
                            batch_items[icode] = batch_items.get(icode, 0.0) + float(weight)

                    for d in pp_rows:
                        add_batch_item(d["item_code"], d["qty"])
                    for d in fl_rows:
                        add_batch_item(d["item_code"], d["qty"])
                    for d in ad_rows:
                        add_batch_item(d["item_code"], d["qty"])

                    if mb_total > 0 and mb_rows:
                        share_tot = sum(d["share"] for d in mb_rows)
                        if share_tot <= 0:
                            # Fallback: assign all MB to first MB item.
                            add_batch_item(mb_rows[0]["item_code"], mb_total)
                        else:
                            for d in mb_rows:
                                add_batch_item(d["item_code"], mb_total * (d["share"] / share_tot))

                    final_items = {}
                    for icode, batch_w in batch_items.items():
                        one_mix_qty = round(batch_w / total_batch_weight, 6)
                        if one_mix_qty > 0:
                            final_items[icode] = one_mix_qty

                    existing_boms = frappe.get_all(
                        "BOM",
                        filters={
                            "item": req_item_code,
                            "is_active": 1,
                            "docstatus": 1,
                            "custom_ldr_": mb_ldr
                        },
                        fields=["name"]
                    )

                    match_found = None
                    for b in existing_boms:
                        b_items = frappe.get_all("BOM Item", filters={"parent": b.name}, fields=["item_code", "qty"])
                        b_dict = {row.item_code: row.qty for row in b_items}
                        if len(b_dict) != len(final_items):
                            continue

                        is_match = True
                        for icode, expected_qty in final_items.items():
                            if icode not in b_dict or abs(b_dict[icode] - expected_qty) >= 0.001:
                                is_match = False
                                break
                        if is_match:
                            match_found = b.name
                            break

                    if match_found and not force_new:
                        frappe.response['message'] = match_found
                    else:
                        bom = frappe.new_doc("BOM")
                        bom.item = req_item_code
                        bom.quantity = 1.0
                        bom.is_active = 1
                        bom.currency = "INR"
                        bom.rm_cost_as_per = "Valuation Rate"
                        bom.custom_ldr_ = mb_ldr
                        for icode, w in final_items.items():
                            bom.append("items", {"item_code": icode, "qty": w, "uom": "Kg"})
                        bom.insert(ignore_permissions=True)
                        bom.submit()
                        # Some setups can flip flags on submit; force active.
                        bom.db_set("is_active", 1, update_modified=False)
                        frappe.response['message'] = bom.name
    if not handled_by_payload:
        # 2. RAW MATERIALS
        item_pp_1 = resolve_item_code(frappe.form_dict.get('item_pp_1'), "")
        qty_pp_1 = float(frappe.form_dict.get('qty_pp_1') or 0.0)
        item_pp_2 = resolve_item_code(frappe.form_dict.get('item_pp_2'), "")
        qty_pp_2 = float(frappe.form_dict.get('qty_pp_2') or 0.0)
        
        item_fl_1 = resolve_item_code(frappe.form_dict.get('item_fl_1'), "")
        qty_fl_1 = float(frappe.form_dict.get('qty_fl_1') or 0.0)
        item_fl_2 = resolve_item_code(frappe.form_dict.get('item_fl_2'), "")
        qty_fl_2 = float(frappe.form_dict.get('qty_fl_2') or 0.0)
        
        item_ppa_1 = resolve_item_code(frappe.form_dict.get('item_ppa_1'), "")
        qty_ppa_1 = float(frappe.form_dict.get('qty_ppa_1') or 0.0)
        
        item_anti_1 = resolve_item_code(frappe.form_dict.get('item_anti_1'), "")
        qty_anti_1 = float(frappe.form_dict.get('qty_anti_1') or 0.0)
        
        mb_item_1 = resolve_item_code(frappe.form_dict.get('mb_item_1'), "")
        qty_mb_1_ldr = float(frappe.form_dict.get('qty_mb_1') or 0.0)

        # 3. CALCULATE WEIGHTS
        base_tot = qty_pp_1 + qty_pp_2 + qty_fl_1 + qty_fl_2
        
        if base_tot == 0.0:
            frappe.response['message'] = "Error: Base total (PP + Filler) cannot be 0"
        else:
            # Calculate MB weight
            mb_weight = (base_tot * qty_mb_1_ldr) / 100.0
            
            # Total batch kg before one-mix normalization.
            total_batch_weight = base_tot + qty_ppa_1 + qty_anti_1 + mb_weight
            if total_batch_weight <= 0.0:
                frappe.response['message'] = "Error: Total batch weight cannot be 0"
            else:
                # Consolidation map in actual batch kg first.
                batch_items = {}
                def add_batch_item(icode, weight):
                    if icode and weight > 0:
                        batch_items[icode] = batch_items.get(icode, 0.0) + float(weight)
                
                add_batch_item(item_pp_1, qty_pp_1)
                add_batch_item(item_pp_2, qty_pp_2)
                add_batch_item(item_fl_1, qty_fl_1)
                add_batch_item(item_fl_2, qty_fl_2)
                add_batch_item(item_ppa_1, qty_ppa_1)
                add_batch_item(item_anti_1, qty_anti_1)
                add_batch_item(mb_item_1, mb_weight)
                
                # Normalize to one mixing (1 kg BOM): item_qty = item_batch_kg / total_batch_kg.
                final_items = {}
                for icode, batch_w in batch_items.items():
                    one_mix_qty = round(batch_w / total_batch_weight, 6)
                    if one_mix_qty > 0:
                        final_items[icode] = one_mix_qty
            
                # 4. SMART CHECK
                existing_boms = frappe.get_all("BOM", 
                    filters={
                        "item": req_item_code, 
                        "is_active": 1, 
                        "docstatus": 1,
                        "custom_ldr_": qty_mb_1_ldr
                    }, 
                    fields=["name"]
                )
                
                match_found = None
                for b in existing_boms:
                    b_items = frappe.get_all("BOM Item", filters={"parent": b.name}, fields=["item_code", "qty"])
                    b_dict = {row.item_code: row.qty for row in b_items}
                    
                    if len(b_dict) != len(final_items):
                        continue
                        
                    is_match = True
                    for icode, expected_qty in final_items.items():
                        if icode not in b_dict or abs(b_dict[icode] - expected_qty) >= 0.001:
                            is_match = False
                            break
                    
                    if is_match:
                        match_found = b.name
                        break
                
                if match_found and not force_new:
                    frappe.response['message'] = match_found
                else:
                    # 5. CREATE NEW BOM
                    bom = frappe.new_doc("BOM")
                    bom.item = req_item_code
                    bom.quantity = 1.0
                    bom.is_active = 1
                    bom.currency = "INR"
                    bom.rm_cost_as_per = "Valuation Rate"
                    bom.custom_ldr_ = qty_mb_1_ldr
                    
                    for icode, w in final_items.items():
                        bom.append("items", {"item_code": icode, "qty": w, "uom": "Kg"})
                    
                    bom.insert(ignore_permissions=True)
                    bom.submit()
                    # Some setups can flip flags on submit; force active.
                    bom.db_set("is_active", 1, update_modified=False)
                    frappe.response['message'] = bom.name
