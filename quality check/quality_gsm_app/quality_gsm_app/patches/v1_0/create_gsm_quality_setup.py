import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


CHILD_DTYPE = "GSM Test Section"
PARENT_DTYPE = "Quality Inspection"
MODULE = "Quality"


def execute():
    _create_child_doctype_if_missing()
    _create_child_fields()
    _create_parent_custom_fields()
    _create_or_update_print_format()
    frappe.clear_cache(doctype=CHILD_DTYPE)
    frappe.clear_cache(doctype=PARENT_DTYPE)


def _create_child_doctype_if_missing():
    if frappe.db.exists("DocType", CHILD_DTYPE):
        return

    doc = frappe.get_doc(
        {
            "doctype": "DocType",
            "name": CHILD_DTYPE,
            "module": MODULE,
            "custom": 1,
            "istable": 1,
            "editable_grid": 1,
            "engine": "InnoDB",
            "permissions": [],
            "fields": [],
        }
    )
    doc.insert(ignore_permissions=True)


def _create_child_fields():
    existing = {
        d.fieldname
        for d in frappe.get_all("DocField", filters={"parent": CHILD_DTYPE}, fields=["fieldname"])
    }

    def add(fieldname, label, fieldtype, **extra):
        if fieldname in existing:
            return
        payload = {
            "doctype": "DocField",
            "parent": CHILD_DTYPE,
            "parenttype": "DocType",
            "parentfield": "fields",
            "fieldname": fieldname,
            "label": label,
            "fieldtype": fieldtype,
        }
        payload.update(extra)
        frappe.get_doc(payload).insert(ignore_permissions=True)
        existing.add(fieldname)

    add("gsm_testing_section", "GSM Testing", "Section Break")
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

    dt = frappe.get_doc("DocType", CHILD_DTYPE)
    dt.field_order = [f.fieldname for f in dt.fields]
    dt.save(ignore_permissions=True)


def _create_parent_custom_fields():
    custom_fields = {
        PARENT_DTYPE: [
            {
                "fieldname": "shaft_production_run",
                "label": "Shaft Production Run",
                "fieldtype": "Link",
                "options": "Shaft Production Run",
                "insert_after": "reference_name",
            },
            {
                "fieldname": "quality",
                "label": "Quality",
                "fieldtype": "Select",
                "options": "Higher\nLower",
                "insert_after": "shaft_production_run",
            },
            {
                "fieldname": "gsm_section_break",
                "label": "GSM Testing",
                "fieldtype": "Section Break",
                "insert_after": "quality",
            },
            {
                "fieldname": "gsm_sections",
                "label": "GSM Sections",
                "fieldtype": "Table",
                "options": CHILD_DTYPE,
                "insert_after": "gsm_section_break",
            },
            {
                "fieldname": "gsm_summary_break",
                "label": "GSM Summary",
                "fieldtype": "Section Break",
                "insert_after": "gsm_sections",
            },
            {
                "fieldname": "gsm_overall_result",
                "label": "GSM Overall Result",
                "fieldtype": "Select",
                "options": "PASS\nFAIL",
                "read_only": 1,
                "insert_after": "gsm_summary_break",
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


def _create_or_update_print_format():
    html = """
<style>
  .gsm-report-container { font-family: Inter, sans-serif; color:#333; }
  .gsm-header { text-align:center; margin-bottom:16px; border-bottom:2px solid #3498db; padding-bottom:8px; }
  .gsm-table { width:100%; border-collapse: collapse; margin: 14px 0 24px; font-size:10px; }
  .gsm-table th, .gsm-table td { border:1px solid #bdc3c7; padding:6px; text-align:center; }
  .gsm-table th { background:#f7f9f9; }
  .row-header { text-align:left !important; font-weight:700; background:#f8f9fa; }
  .highlight-avg { background:#ecf0f1; font-weight:700; }
  .pass-diff { background:#eafaf1; color:#1e8449; font-weight:700; }
  .fail-diff { background:#fdedec; color:#c0392b; font-weight:700; }
  .section-title { margin: 14px 0 6px; font-size: 14px; font-weight: 700; }
</style>
<div class="gsm-report-container">
  <div class="gsm-header">
    <h2>GSM TESTING REPORT</h2>
    <div>Quality Inspection: {{ doc.name }}</div>
  </div>
  <div><b>Shaft Production Run:</b> {{ doc.shaft_production_run or "-" }}</div>
  <div><b>Quality:</b> {{ doc.quality or "-" }}</div>
  {% for row in doc.gsm_sections %}
    {% set q = (row.quality or doc.quality or '')|lower %}
    {% set limit = 5 if ('low' in q or 'lower' in q) else 3 %}
    <div class="section-title">Section {{ loop.index }} - Set GSM: {{ row.representative_gsm }}</div>
    <table class="gsm-table">
      <thead>
        <tr>
          <th>PROPERTIES</th><th>SET GSM</th>
          {% for i in range(1, 21) %}<th>S{{ i }}</th>{% endfor %}
          <th>AVERAGE</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="row-header">GSM (ROW 1)</td><td>{{ row.representative_gsm }}</td>
          {% for i in range(1, 21) %}<td>{{ row["r1_s" ~ i] }}</td>{% endfor %}
          <td class="highlight-avg">{{ row.r1_average }}</td>
        </tr>
        <tr>
          <td class="row-header">GSM (ROW 2)</td><td>{{ row.representative_gsm }}</td>
          {% for i in range(1, 21) %}<td>{{ row["r2_s" ~ i] }}</td>{% endfor %}
          <td class="highlight-avg">{{ row.r2_average }}</td>
        </tr>
        <tr class="highlight-avg">
          <td class="row-header">COMBINED AVG</td><td>-</td>
          {% for i in range(1, 21) %}<td>{{ row["s" ~ i ~ "_combined_avg"] }}</td>{% endfor %}
          <td>{{ row.grand_average_gsm }}</td>
        </tr>
        <tr>
          <td class="row-header">DIFF</td><td>-</td>
          {% for i in range(1, 21) %}
            {% set d = row["s" ~ i ~ "_diff"] %}
            {% set cls = "pass-diff" if (d is not none and (d|abs) < limit) else "fail-diff" %}
            <td class="{{ cls }}">{{ d }}</td>
          {% endfor %}
          <td>{{ row.section_result }}</td>
        </tr>
      </tbody>
    </table>
  {% endfor %}
</div>
"""
    name = "GSM Testing Report"
    if frappe.db.exists("Print Format", name):
        pf = frappe.get_doc("Print Format", name)
        pf.doc_type = PARENT_DTYPE
        pf.print_format_type = "Jinja"
        pf.raw_printing = 0
        pf.html = html
        pf.disabled = 0
        pf.save(ignore_permissions=True)
        return

    frappe.get_doc(
        {
            "doctype": "Print Format",
            "name": name,
            "doc_type": PARENT_DTYPE,
            "print_format_type": "Jinja",
            "html": html,
            "disabled": 0,
        }
    ).insert(ignore_permissions=True)

