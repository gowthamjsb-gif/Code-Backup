import frappe


PARENT_DTYPE = "Quality Checking"
CHILD_DTYPE = "Quality Checking Section"


def execute():
    _ensure_permissions(PARENT_DTYPE, is_child=False)
    _ensure_permissions(CHILD_DTYPE, is_child=True)
    frappe.clear_cache(doctype=PARENT_DTYPE)
    frappe.clear_cache(doctype=CHILD_DTYPE)


def _ensure_permissions(doctype_name: str, is_child: bool):
    if not frappe.db.exists("DocType", doctype_name):
        return

    dt = frappe.get_doc("DocType", doctype_name)
    roles = {p.role for p in dt.permissions}

    # Ensure System Manager can always access custom docs in cloud.
    if "System Manager" not in roles:
        dt.append(
            "permissions",
            {
                "role": "System Manager",
                "read": 1,
                "write": 1,
                "create": 1,
                "delete": 1,
                "report": 1,
                "export": 1,
                "print": 1,
                "email": 1,
                "share": 1,
                "if_owner": 0,
            },
        )

    # Optional Quality Manager access when role exists.
    if frappe.db.exists("Role", "Quality Manager") and "Quality Manager" not in roles:
        dt.append(
            "permissions",
            {
                "role": "Quality Manager",
                "read": 1,
                "write": 1,
                "create": 1,
                "delete": 0 if is_child else 1,
                "report": 1,
                "export": 1,
                "print": 1,
                "email": 1,
                "share": 1,
                "if_owner": 0,
            },
        )

    dt.save(ignore_permissions=True)

