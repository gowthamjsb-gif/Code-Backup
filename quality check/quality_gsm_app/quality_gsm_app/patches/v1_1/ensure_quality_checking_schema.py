import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


PARENT_DTYPE = "Quality Inspection"
NEW_CHILD_DTYPE = "Quality Checking"


def execute():
    _create_child_doctype_if_missing()
    _create_child_fields()
    _create_parent_custom_fields()
    _update_print_format()
    frappe.clear_cache(doctype=NEW_CHILD_DTYPE)
    frappe.clear_cache(doctype=PARENT_DTYPE)


def _create_child_doctype_if_missing():
    if frappe.db.exists("DocType", NEW_CHILD_DTYPE):
        return
    frappe.get_doc(
        {
            "doctype": "DocType",
            "name": NEW_CHILD_DTYPE,
            "module": "Quality",
            "custom": 1,
            "istable": 1,
            "editable_grid": 1,
            "engine": "InnoDB",
            "permissions": [],
            "fields": [],
        }
    ).insert(ignore_permissions=True)


def _create_child_fields():
    existing = {
        d.fieldname
        for d in frappe.get_all("DocField", filters={"parent": NEW_CHILD_DTYPE}, fields=["fieldname"])
    }

    def add(fieldname, label, fieldtype, **extra):
        if fieldname in existing:
            return
        payload = {
            "doctype": "DocField",
            "parent": NEW_CHILD_DTYPE,
            "parenttype": "DocType",
            "parentfield": "fields",
            "fieldname": fieldname,
            "label": label,
            "fieldtype": fieldtype,
        }
        payload.update(extra)
        frappe.get_doc(payload).insert(ignore_permissions=True)
        existing.add(fieldname)

    add("quality_checking_section", "Quality Checking", "Section Break")
    add("representative_gsm", "Representative GSM", "Float", reqd=1)
    add("quality", "Quality", "Select", options="Higher\nLower")
    add("tolerance_limit", "Tolerance Limit", "Float", read_only=1)
    add("section_result", "Section Result", "Select", options="PASS\nFAIL", read_only=1)
    add("pass_count", "Pass Count", "Int", read_only=1)
    add("fail_count", "Fail Count", "Int", read_only=1)
    add("summary_cb", "Summary Column", "Column Break")
    add("r1_average", "Row 1 Average", "Float", read_only=1)
    add("r2_average", "Row 2 Average", "Float", read_only=1)
    add("grand_average_gsm", "Grand Average GSM", "Float", read_only=1)

    add("row1_section", "Row 1 Samples", "Section Break")
    for i in range(1, 21):
        add(f"r1_s{i}", f"R1 Sample {i}", "Float")

    add("row2_section", "Row 2 Samples", "Section Break")
    for i in range(1, 21):
        add(f"r2_s{i}", f"R2 Sample {i}", "Float")

    add("combined_section", "Combined Averages", "Section Break")
    for i in range(1, 21):
        add(f"s{i}_combined_avg", f"Sample {i} Combined Avg", "Float", read_only=1)

    add("difference_section", "Differences", "Section Break")
    for i in range(1, 21):
        add(f"s{i}_diff", f"Sample {i} Diff", "Float", read_only=1)

    dt = frappe.get_doc("DocType", NEW_CHILD_DTYPE)
    dt.field_order = [f.fieldname for f in dt.fields]
    dt.save(ignore_permissions=True)


def _create_parent_custom_fields():
    custom_fields = {
        PARENT_DTYPE: [
            {
                "fieldname": "quality_checking_sections",
                "label": "Quality Checking Sections",
                "fieldtype": "Table",
                "options": NEW_CHILD_DTYPE,
                "insert_after": "quality",
            },
            {
                "fieldname": "gsm_overall_result",
                "label": "GSM Overall Result",
                "fieldtype": "Select",
                "options": "PASS\nFAIL",
                "read_only": 1,
                "insert_after": "quality_checking_sections",
            },
            {
                "fieldname": "gsm_total_sections",
                "label": "Total Sections",
                "fieldtype": "Int",
                "read_only": 1,
                "insert_after": "gsm_overall_result",
            },
            {
                "fieldname": "gsm_pass_sections",
                "label": "Pass Sections",
                "fieldtype": "Int",
                "read_only": 1,
                "insert_after": "gsm_total_sections",
            },
            {
                "fieldname": "gsm_fail_sections",
                "label": "Fail Sections",
                "fieldtype": "Int",
                "read_only": 1,
                "insert_after": "gsm_pass_sections",
            },
        ]
    }
    create_custom_fields(custom_fields, update=True)


def _update_print_format():
    name = "GSM Testing Report"
    if not frappe.db.exists("Print Format", name):
        return
    pf = frappe.get_doc("Print Format", name)
    html = (pf.html or "").replace("doc.gsm_sections", "(doc.quality_checking_sections or doc.gsm_sections)")
    pf.html = html
    pf.save(ignore_permissions=True)

