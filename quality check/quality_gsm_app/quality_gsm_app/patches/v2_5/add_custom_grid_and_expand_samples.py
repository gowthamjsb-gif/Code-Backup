import frappe
from quality_gsm_app.patches.v2_0.create_quality_checking_only import _ensure_docfield, _ensure_print_format

PARENT_DTYPE = "Quality Checking"
CHILD_DTYPE = "Quality Checking Section"

def execute():
    # 1. Expand samples from 20 to 25
    _ensure_docfield(CHILD_DTYPE, "row1_section", "Row 1 Samples", "Section Break")
    for i in range(21, 26):
        _ensure_docfield(CHILD_DTYPE, f"r1_s{i}", f"R1 Sample {i}", "Float")

    _ensure_docfield(CHILD_DTYPE, "row2_section", "Row 2 Samples", "Section Break")
    for i in range(21, 26):
        _ensure_docfield(CHILD_DTYPE, f"r2_s{i}", f"R2 Sample {i}", "Float")

    _ensure_docfield(CHILD_DTYPE, "combined_section", "Combined Averages", "Section Break")
    for i in range(21, 26):
        _ensure_docfield(CHILD_DTYPE, f"s{i}_combined_avg", f"Sample {i} Combined Avg", "Float", read_only=1)

    _ensure_docfield(CHILD_DTYPE, "difference_section", "Differences", "Section Break")
    for i in range(21, 26):
        _ensure_docfield(CHILD_DTYPE, f"s{i}_diff", f"Sample {i} Diff", "Float", read_only=1)
        


    # 2. Add custom_html_grid and hide standard sections table
    _ensure_docfield(PARENT_DTYPE, "custom_html_grid", "", "HTML")
    
    # Hide standard sections table
    if frappe.db.exists("DocField", {"parent": PARENT_DTYPE, "fieldname": "sections"}):
        frappe.db.set_value("DocField", {"parent": PARENT_DTYPE, "fieldname": "sections"}, "depends_on", "eval:false")

    # 3. Update Print Format
    _ensure_print_format()

    frappe.clear_cache(doctype=PARENT_DTYPE)
    frappe.clear_cache(doctype=CHILD_DTYPE)
