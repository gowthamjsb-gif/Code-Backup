import frappe


PARENT_DTYPE = "Quality Checking"
CHILD_DTYPE = "Quality Checking Section"


def execute():
    _rename_old_child_if_needed()
    _create_parent_doctype_if_missing()
    _create_child_doctype_if_missing()
    _create_parent_fields()
    _create_child_fields()
    _ensure_print_format_for_parent()
    frappe.clear_cache(doctype=PARENT_DTYPE)
    frappe.clear_cache(doctype=CHILD_DTYPE)


def _rename_old_child_if_needed():
    if not frappe.db.exists("DocType", "Quality Checking"):
        return
    dt = frappe.get_doc("DocType", "Quality Checking")
    if not dt.istable:
        return
    if frappe.db.exists("DocType", CHILD_DTYPE):
        return
    frappe.rename_doc("DocType", "Quality Checking", CHILD_DTYPE, force=True)


def _create_parent_doctype_if_missing():
    if frappe.db.exists("DocType", PARENT_DTYPE):
        dt = frappe.get_doc("DocType", PARENT_DTYPE)
        if dt.istable:
            frappe.throw("DocType 'Quality Checking' exists as Child Table. Migration could not convert it.")
        return
    frappe.get_doc(
        {
            "doctype": "DocType",
            "name": PARENT_DTYPE,
            "module": "Quality",
            "custom": 1,
            "is_submittable": 0,
            "engine": "InnoDB",
            "permissions": [],
            "fields": [],
        }
    ).insert(ignore_permissions=True)


def _create_child_doctype_if_missing():
    if frappe.db.exists("DocType", CHILD_DTYPE):
        return
    frappe.get_doc(
        {
            "doctype": "DocType",
            "name": CHILD_DTYPE,
            "module": "Quality",
            "custom": 1,
            "istable": 1,
            "editable_grid": 1,
            "engine": "InnoDB",
            "permissions": [],
            "fields": [],
        }
    ).insert(ignore_permissions=True)


def _ensure_field(parent, fieldname, label, fieldtype, **extra):
    if frappe.db.exists("DocField", {"parent": parent, "fieldname": fieldname}):
        return
    payload = {
        "doctype": "DocField",
        "parent": parent,
        "parenttype": "DocType",
        "parentfield": "fields",
        "fieldname": fieldname,
        "label": label,
        "fieldtype": fieldtype,
    }
    payload.update(extra)
    frappe.get_doc(payload).insert(ignore_permissions=True)


def _create_parent_fields():
    _ensure_field(PARENT_DTYPE, "section_main", "Quality Checking", "Section Break")
    _ensure_field(PARENT_DTYPE, "shaft_production_run", "Shaft Production Run", "Link", options="Shaft Production Run")
    _ensure_field(PARENT_DTYPE, "batch_no", "Batch No", "Data")
    _ensure_field(PARENT_DTYPE, "quality", "Quality", "Select", options="Higher\nLower")
    _ensure_field(PARENT_DTYPE, "sections", "Sections", "Table", options=CHILD_DTYPE)
    _ensure_field(PARENT_DTYPE, "gsm_overall_result", "GSM Overall Result", "Select", options="PASS\nFAIL", read_only=1)
    _ensure_field(PARENT_DTYPE, "gsm_total_sections", "Total Sections", "Int", read_only=1)
    _ensure_field(PARENT_DTYPE, "gsm_pass_sections", "Pass Sections", "Int", read_only=1)
    _ensure_field(PARENT_DTYPE, "gsm_fail_sections", "Fail Sections", "Int", read_only=1)
    dt = frappe.get_doc("DocType", PARENT_DTYPE)
    dt.field_order = [f.fieldname for f in dt.fields]
    dt.save(ignore_permissions=True)


def _create_child_fields():
    _ensure_field(CHILD_DTYPE, "quality_checking_section", "Quality Checking", "Section Break")
    _ensure_field(CHILD_DTYPE, "representative_gsm", "Representative GSM", "Float", reqd=1)
    _ensure_field(CHILD_DTYPE, "quality", "Quality", "Select", options="Higher\nLower")
    _ensure_field(CHILD_DTYPE, "tolerance_limit", "Tolerance Limit", "Float", read_only=1)
    _ensure_field(CHILD_DTYPE, "section_result", "Section Result", "Select", options="PASS\nFAIL", read_only=1)
    _ensure_field(CHILD_DTYPE, "pass_count", "Pass Count", "Int", read_only=1)
    _ensure_field(CHILD_DTYPE, "fail_count", "Fail Count", "Int", read_only=1)
    _ensure_field(CHILD_DTYPE, "summary_cb", "Summary Column", "Column Break")
    _ensure_field(CHILD_DTYPE, "r1_average", "Row 1 Average", "Float", read_only=1)
    _ensure_field(CHILD_DTYPE, "r2_average", "Row 2 Average", "Float", read_only=1)
    _ensure_field(CHILD_DTYPE, "grand_average_gsm", "Grand Average GSM", "Float", read_only=1)

    _ensure_field(CHILD_DTYPE, "row1_section", "Row 1 Samples", "Section Break")
    for i in range(1, 21):
        _ensure_field(CHILD_DTYPE, f"r1_s{i}", f"R1 Sample {i}", "Float")
    _ensure_field(CHILD_DTYPE, "row2_section", "Row 2 Samples", "Section Break")
    for i in range(1, 21):
        _ensure_field(CHILD_DTYPE, f"r2_s{i}", f"R2 Sample {i}", "Float")
    _ensure_field(CHILD_DTYPE, "combined_section", "Combined Averages", "Section Break")
    for i in range(1, 21):
        _ensure_field(CHILD_DTYPE, f"s{i}_combined_avg", f"Sample {i} Combined Avg", "Float", read_only=1)
    _ensure_field(CHILD_DTYPE, "difference_section", "Differences", "Section Break")
    for i in range(1, 21):
        _ensure_field(CHILD_DTYPE, f"s{i}_diff", f"Sample {i} Diff", "Float", read_only=1)
    dt = frappe.get_doc("DocType", CHILD_DTYPE)
    dt.field_order = [f.fieldname for f in dt.fields]
    dt.save(ignore_permissions=True)


def _ensure_print_format_for_parent():
    name = "GSM Testing Report"
    if not frappe.db.exists("Print Format", name):
        return
    pf = frappe.get_doc("Print Format", name)
    pf.doc_type = PARENT_DTYPE
    html = pf.html or ""
    html = html.replace("doc.quality_checking_sections or doc.gsm_sections", "doc.sections or doc.quality_checking_sections or doc.gsm_sections")
    html = html.replace("doc.gsm_sections", "doc.sections or doc.quality_checking_sections or doc.gsm_sections")
    pf.html = html
    pf.save(ignore_permissions=True)

