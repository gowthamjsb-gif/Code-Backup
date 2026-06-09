import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


PARENT_DTYPE = "Quality Checking"
CHILD_DTYPE = "Quality Checking Section"


def execute():
    _ensure_parent_doctype()
    _ensure_child_doctype()
    _ensure_parent_fields()
    _ensure_child_fields()
    _ensure_print_format()
    frappe.clear_cache(doctype=PARENT_DTYPE)
    frappe.clear_cache(doctype=CHILD_DTYPE)


def _ensure_parent_doctype():
    if frappe.db.exists("DocType", PARENT_DTYPE):
        dt = frappe.get_doc("DocType", PARENT_DTYPE)
        # If it accidentally exists as a child-table, recover it as parent.
        if dt.istable:
            dt.istable = 0
            dt.custom = 1
            dt.editable_grid = 0
            dt.save(ignore_permissions=True)
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


def _ensure_child_doctype():
    if frappe.db.exists("DocType", CHILD_DTYPE):
        dt = frappe.get_doc("DocType", CHILD_DTYPE)
        if not dt.istable:
            dt.istable = 1
            dt.custom = 1
            dt.editable_grid = 1
            dt.save(ignore_permissions=True)
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


def _ensure_docfield(parent, fieldname, label, fieldtype, **extra):
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


def _ensure_parent_fields():
    # Parent uses a table field called `sections`.
    _ensure_docfield(PARENT_DTYPE, "section_main", "Quality Checking", "Section Break")
    _ensure_docfield(
        PARENT_DTYPE,
        "shaft_production_run",
        "Shaft Production Run",
        "Link",
        options="Shaft Production Run",
    )
    _ensure_docfield(PARENT_DTYPE, "batch_no", "Batch No", "Data")
    _ensure_docfield(PARENT_DTYPE, "quality", "Quality", "Select", options="Higher\nLower")
    _ensure_docfield(PARENT_DTYPE, "sections", "Sections", "Table", options=CHILD_DTYPE)

    _ensure_docfield(
        PARENT_DTYPE,
        "gsm_overall_result",
        "GSM Overall Result",
        "Select",
        options="PASS\nFAIL",
        read_only=1,
    )
    _ensure_docfield(PARENT_DTYPE, "gsm_total_sections", "Total Sections", "Int", read_only=1)
    _ensure_docfield(PARENT_DTYPE, "gsm_pass_sections", "Pass Sections", "Int", read_only=1)
    _ensure_docfield(PARENT_DTYPE, "gsm_fail_sections", "Fail Sections", "Int", read_only=1)

    dt = frappe.get_doc("DocType", PARENT_DTYPE)
    dt.field_order = [f.fieldname for f in dt.fields]
    dt.save(ignore_permissions=True)


def _ensure_child_fields():
    _ensure_docfield(CHILD_DTYPE, "quality_checking_section", "Quality Checking", "Section Break")
    _ensure_docfield(CHILD_DTYPE, "representative_gsm", "Representative GSM", "Float", reqd=1)
    _ensure_docfield(CHILD_DTYPE, "quality", "Quality", "Select", options="Higher\nLower")
    _ensure_docfield(CHILD_DTYPE, "tolerance_limit", "Tolerance Limit", "Float", read_only=1)
    _ensure_docfield(CHILD_DTYPE, "section_result", "Section Result", "Select", options="PASS\nFAIL", read_only=1)
    _ensure_docfield(CHILD_DTYPE, "pass_count", "Pass Count", "Int", read_only=1)
    _ensure_docfield(CHILD_DTYPE, "fail_count", "Fail Count", "Int", read_only=1)
    _ensure_docfield(CHILD_DTYPE, "summary_cb", "Summary Column", "Column Break")
    _ensure_docfield(CHILD_DTYPE, "r1_average", "Row 1 Average", "Float", read_only=1)
    _ensure_docfield(CHILD_DTYPE, "r2_average", "Row 2 Average", "Float", read_only=1)
    _ensure_docfield(CHILD_DTYPE, "grand_average_gsm", "Grand Average GSM", "Float", read_only=1)

    _ensure_docfield(CHILD_DTYPE, "row1_section", "Row 1 Samples", "Section Break")
    for i in range(1, 21):
        _ensure_docfield(CHILD_DTYPE, f"r1_s{i}", f"R1 Sample {i}", "Float")

    _ensure_docfield(CHILD_DTYPE, "row2_section", "Row 2 Samples", "Section Break")
    for i in range(1, 21):
        _ensure_docfield(CHILD_DTYPE, f"r2_s{i}", f"R2 Sample {i}", "Float")

    _ensure_docfield(CHILD_DTYPE, "combined_section", "Combined Averages", "Section Break")
    for i in range(1, 21):
        _ensure_docfield(CHILD_DTYPE, f"s{i}_combined_avg", f"Sample {i} Combined Avg", "Float", read_only=1)

    _ensure_docfield(CHILD_DTYPE, "difference_section", "Differences", "Section Break")
    for i in range(1, 21):
        _ensure_docfield(CHILD_DTYPE, f"s{i}_diff", f"Sample {i} Diff", "Float", read_only=1)

    dt = frappe.get_doc("DocType", CHILD_DTYPE)
    dt.field_order = [f.fieldname for f in dt.fields]
    dt.save(ignore_permissions=True)


def _ensure_print_format():
    # Create or update once, so you can print from Quality Checking.
    name = "GSM Testing Report"
    html = """
<style>
  .gsm-report-container { font-family: Inter, sans-serif; color:#333; padding: 10px; }
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
    <div>Quality Checking: {{ doc.name }}</div>
  </div>

  <div><b>Shaft Production Run:</b> {{ doc.shaft_production_run or "-" }}</div>
  <div><b>Batch No:</b> {{ doc.batch_no or "-" }}</div>
  <div><b>Quality:</b> {{ doc.quality or "-" }}</div>
  <div><b>Date:</b> {{ doc.creation[:10] }}</div>

  {% for row in doc.sections %}
    {% set q = (row.quality or doc.quality or '')|lower %}
    {% set limit = 5 if ('low' in q or 'lower' in q) else 3 %}
    <div class="section-title">
      Section {{ loop.index }} - Set GSM: {{ row.representative_gsm }} | Result: {{ row.section_result or "-" }} | Tolerance: &lt; {{ limit }}
    </div>

    <table class="gsm-table">
      <thead>
        <tr>
          <th>PROPERTIES</th>
          <th>SET GSM</th>
          {% for i in range(1, 21) %}<th>S{{ i }}</th>{% endfor %}
          <th>AVERAGE</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="row-header">GSM (ROW 1)</td>
          <td>{{ row.representative_gsm }}</td>
          {% for i in range(1, 21) %}<td>{{ row["r1_s" ~ i] }}</td>{% endfor %}
          <td class="highlight-avg">{{ row.r1_average }}</td>
        </tr>

        <tr>
          <td class="row-header">GSM (ROW 2)</td>
          <td>{{ row.representative_gsm }}</td>
          {% for i in range(1, 21) %}<td>{{ row["r2_s" ~ i] }}</td>{% endfor %}
          <td class="highlight-avg">{{ row.r2_average }}</td>
        </tr>

        <tr class="highlight-avg">
          <td class="row-header">COMBINED AVG</td>
          <td>-</td>
          {% for i in range(1, 21) %}<td>{{ row["s" ~ i ~ "_combined_avg"] }}</td>{% endfor %}
          <td>{{ row.grand_average_gsm }}</td>
        </tr>

        <tr>
          <td class="row-header">DIFF</td>
          <td>-</td>
          {% for i in range(1, 21) %}
            {% set d = row["s" ~ i ~ "_diff"] %}
            {% set cls = "pass-diff" if (d is not none and d|string != '' and (d|abs) < limit) else "fail-diff" %}
            <td class="{{ cls }}">{{ d }}</td>
          {% endfor %}
          <td>{{ row.section_result }}</td>
        </tr>
      </tbody>
    </table>
  {% endfor %}
</div>
"""

    if frappe.db.exists("Print Format", name):
        pf = frappe.get_doc("Print Format", name)
        pf.doc_type = PARENT_DTYPE
        pf.print_format_type = "Jinja"
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

