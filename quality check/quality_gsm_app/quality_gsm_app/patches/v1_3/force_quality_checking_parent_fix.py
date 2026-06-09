import frappe


PARENT_DTYPE = "Quality Checking"
CHILD_DTYPE = "Quality Checking Section"


def execute():
    _ensure_parent_not_child_table()
    _ensure_child_doctype()
    _ensure_sections_field()
    frappe.clear_cache(doctype=PARENT_DTYPE)
    frappe.clear_cache(doctype=CHILD_DTYPE)


def _ensure_parent_not_child_table():
    if not frappe.db.exists("DocType", PARENT_DTYPE):
        return

    dt = frappe.get_doc("DocType", PARENT_DTYPE)

    if dt.istable:
        # If legacy child-table doctype exists as "Quality Checking", preserve it as section doctype.
        if not frappe.db.exists("DocType", CHILD_DTYPE):
            frappe.rename_doc("DocType", PARENT_DTYPE, CHILD_DTYPE, force=True)
            _create_parent_doctype()
            return

        # Fallback recovery: force-convert existing doctype into parent so /app/quality-checking route works.
        dt.istable = 0
        dt.custom = 1
        dt.editable_grid = 0
        dt.save(ignore_permissions=True)


def _create_parent_doctype():
    if frappe.db.exists("DocType", PARENT_DTYPE):
        return
    frappe.get_doc(
        {
            "doctype": "DocType",
            "name": PARENT_DTYPE,
            "module": "Quality",
            "custom": 1,
            "engine": "InnoDB",
            "permissions": [],
            "fields": [],
        }
    ).insert(ignore_permissions=True)


def _ensure_child_doctype():
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


def _ensure_sections_field():
    if not frappe.db.exists("DocType", PARENT_DTYPE):
        _create_parent_doctype()

    if not frappe.db.exists("DocField", {"parent": PARENT_DTYPE, "fieldname": "sections"}):
        frappe.get_doc(
            {
                "doctype": "DocField",
                "parent": PARENT_DTYPE,
                "parenttype": "DocType",
                "parentfield": "fields",
                "fieldname": "sections",
                "label": "Sections",
                "fieldtype": "Table",
                "options": CHILD_DTYPE,
            }
        ).insert(ignore_permissions=True)

    dt = frappe.get_doc("DocType", PARENT_DTYPE)
    dt.field_order = [f.fieldname for f in dt.fields]
    dt.save(ignore_permissions=True)

