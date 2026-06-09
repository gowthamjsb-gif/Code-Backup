import frappe


@frappe.whitelist()
def get_unique_gsm_values(shaft_production_run: str):
    if not shaft_production_run:
        return []

    doc = frappe.get_doc("Shaft Production Run", shaft_production_run)

    # Robust lookup: find any child table that has a `gsm` field.
    values = []
    for df in doc.meta.get_table_fields():
        child_rows = getattr(doc, df.fieldname, None) or []
        for row in child_rows:
            gsm = getattr(row, "gsm", None) if hasattr(row, "gsm") else row.get("gsm")
            if gsm in (None, "") and hasattr(row, "sticker_gsm"):
                gsm = getattr(row, "sticker_gsm", None)
            if gsm in (None, "") and hasattr(row, "target_gsm"):
                gsm = getattr(row, "target_gsm", None)
                
            if gsm is not None and str(gsm).strip() != "":
                try:
                    values.append(float(gsm))
                except Exception:
                    pass

    return sorted(set(v for v in values if v > 0))


@frappe.whitelist()
def create_quality_checking_from_shaft(shaft_production_run: str):
    """
    Creates one `Quality Checking` document for the given Shaft Production Run,
    and auto-fills `sections` (one row per unique GSM).
    """
    if not shaft_production_run:
        frappe.throw("Missing shaft_production_run")

    shaft = frappe.get_doc("Shaft Production Run", shaft_production_run)
    gsm_values = get_unique_gsm_values(shaft_production_run)
    if not gsm_values:
        frappe.throw("No GSM values found in the roll production results.")

    qc = frappe.new_doc("Quality Checking")
    qc.shaft_production_run = shaft.name

    qc.batch_no = getattr(shaft, "batch_no", None)
    qc.quality = getattr(shaft, "quality", None)

    # If batch_no/quality are stored in the child rows, pick from first matching row.
    for df in shaft.meta.get_table_fields():
        child_rows = getattr(shaft, df.fieldname, None) or []
        for row in child_rows:
            if qc.batch_no in (None, "") and hasattr(row, "batch_no"):
                if getattr(row, "batch_no", None):
                    qc.batch_no = row.batch_no
            if qc.quality in (None, "") and hasattr(row, "quality"):
                if getattr(row, "quality", None):
                    qc.quality = row.quality
            if qc.batch_no and qc.quality:
                break
        if qc.batch_no and qc.quality:
            break

    for gsm in gsm_values:
        child = qc.append("sections", {})
        child.representative_gsm = gsm
        child.quality = qc.quality

    qc.insert(ignore_permissions=True)
    frappe.db.commit()
    return qc.name

