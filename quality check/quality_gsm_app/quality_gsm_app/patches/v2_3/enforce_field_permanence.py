import frappe


PARENT_DTYPE = "Quality Checking"
CHILD_DTYPE = "Quality Checking Section"


def execute():
    _set_child_field_flags()
    _set_parent_field_flags()
    frappe.clear_cache(doctype=PARENT_DTYPE)
    frappe.clear_cache(doctype=CHILD_DTYPE)


def _update_docfield(doctype: str, fieldname: str, read_only=None, reqd=None):
    if not frappe.db.exists("DocType", doctype):
        return
    if not frappe.db.exists("DocField", {"parent": doctype, "fieldname": fieldname}):
        return

    docfield = frappe.get_doc("DocField", {"parent": doctype, "fieldname": fieldname})
    dirty = False
    if read_only is not None and int(getattr(docfield, "read_only", 0)) != int(read_only):
        docfield.read_only = 1 if read_only else 0
        dirty = True
    if reqd is not None and int(getattr(docfield, "reqd", 0)) != int(reqd):
        docfield.reqd = 1 if reqd else 0
        dirty = True
    if dirty:
        docfield.save(ignore_permissions=True)


def _set_child_field_flags():
    # Inputs (r1_s*, r2_s*) remain editable.
    # Mark all computed fields read-only so user never has to tick anything.
    for i in range(1, 21):
        _update_docfield(CHILD_DTYPE, f"s{i}_combined_avg", read_only=True)
        _update_docfield(CHILD_DTYPE, f"s{i}_diff", read_only=True)

    computed = [
        "tolerance_limit",
        "section_result",
        "pass_count",
        "fail_count",
        "r1_average",
        "r2_average",
        "grand_average_gsm",
    ]
    for f in computed:
        _update_docfield(CHILD_DTYPE, f, read_only=True)

    # Ensure Representative GSM is required.
    _update_docfield(CHILD_DTYPE, "representative_gsm", reqd=True)


def _set_parent_field_flags():
    summary_fields = [
        "gsm_overall_result",
        "gsm_total_sections",
        "gsm_pass_sections",
        "gsm_fail_sections",
    ]
    for f in summary_fields:
        _update_docfield(PARENT_DTYPE, f, read_only=True)

