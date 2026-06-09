import frappe


PARENT_DTYPE = "Quality Checking"


def execute():
    name = "GSM Testing Report"
    if not frappe.db.exists("Print Format", name):
        return

    pf = frappe.get_doc("Print Format", name)
    pf.doc_type = PARENT_DTYPE
    pf.print_format_type = "Jinja"

    # Layout updated to match the screenshot style:
    # - table grid and padding
    # - combined-average row highlight
    # - difference row with pass/fail cell coloring
    pf.html = """
<style>
  .gsm-report-container {
    font-family: 'Inter', sans-serif;
    padding: 20px;
    color: #333;
  }
  .gsm-header {
    text-align: center;
    margin-bottom: 30px;
    border-bottom: 2px solid #3498db;
    padding-bottom: 10px;
  }
  .gsm-info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-bottom: 30px;
  }
  .info-item { margin-bottom: 5px; }
  .info-label { font-weight: bold; color: #7f8c8d; }

  .gsm-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 20px;
    font-size: 11px;
  }
  .gsm-table th, .gsm-table td {
    border: 1px solid #bdc3c7;
    padding: 8px;
    text-align: center;
  }
  .gsm-table th {
    background-color: #f7f9f9;
    font-weight: 600;
  }
  .row-header {
    font-weight: bold;
    background-color: #f8f9fa;
    text-align: left !important;
  }
  .highlight-avg {
    background-color: #ecf0f1;
    font-weight: bold;
  }
  .diff-row { background-color: #fdf2f2; }
  .pass-diff {
    background-color: #eafaf1;
    color: #1e8449;
    font-weight: bold;
  }
  .fail-diff {
    background-color: #fdedec;
    color: #c0392b;
    font-weight: bold;
  }
  .grand-total {
    font-size: 14px;
    font-weight: bold;
    background-color: #34495e;
    color: white;
  }
  .section-title {
    margin-top: 22px;
    margin-bottom: 10px;
    font-size: 14px;
    font-weight: bold;
  }
</style>

<div class="gsm-report-container">
  <div class="gsm-header">
    <h1>GSM TESTING REPORT</h1>
    <p>Quality Assurance Department</p>
  </div>

  <div class="gsm-info-grid">
    <div class="info-item">
      <span class="info-label">Shaft Production Run:</span> {{ doc.shaft_production_run }}
    </div>
    <div class="info-item">
      <span class="info-label">Date:</span> {{ doc.creation[:10] }}
    </div>
    <div class="info-item">
      <span class="info-label">Batch No:</span> {{ doc.batch_no }}
    </div>
    <div class="info-item">
      <span class="info-label">Quality:</span> {{ doc.quality }}
    </div>
  </div>

  {% for row in doc.sections %}
    {% set q = (row.quality or doc.quality or '')|lower %}
    {% set limit = 5 if ('low' in q or 'lower' in q) else 3 %}
    <div class="section-title">
      GSM Section {{ loop.index }} (Set GSM: {{ row.representative_gsm }} | Result: {{ row.section_result or "-" }} | Tolerance: &lt; {{ limit }} GSM)
    </div>

    <table class="gsm-table">
      <thead>
        <tr>
          <th>PROPERTIES</th>
          <th>SET GSM</th>
          {% for i in range(1, 21) %}
            <th>SAMPLE {{ i }}</th>
          {% endfor %}
          <th class="highlight-avg">AVERAGE</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="row-header">GSM (LANDSCAPE)</td>
          <td>{{ row.representative_gsm }}</td>
          {% for i in range(1, 21) %}
            <td>{{ row["r1_s" ~ i] }}</td>
          {% endfor %}
          <td class="highlight-avg">{{ row.r1_average }}</td>
        </tr>

        <tr>
          <td class="row-header">GSM (PORTRAIT)</td>
          <td>{{ row.representative_gsm }}</td>
          {% for i in range(1, 21) %}
            <td>{{ row["r2_s" ~ i] }}</td>
          {% endfor %}
          <td class="highlight-avg">{{ row.r2_average }}</td>
        </tr>

        <tr class="highlight-avg">
          <td class="row-header">COMBINED AVERAGE</td>
          <td>-</td>
          {% for i in range(1, 21) %}
            <td>{{ row["s" ~ i ~ "_combined_avg"] }}</td>
          {% endfor %}
          <td class="grand-total">{{ row.grand_average_gsm }}</td>
        </tr>

        <tr class="diff-row">
          <td class="row-header">DIFFERENCE</td>
          <td>-</td>
          {% for i in range(1, 21) %}
            {% set d = row["s" ~ i ~ "_diff"] %}
            {% set cls = "pass-diff" if (d is not none and d|string != '' and (d|abs) < limit) else "fail-diff" %}
            <td class="{{ cls }}">{{ row["s" ~ i ~ "_diff"] }}</td>
          {% endfor %}
          <td>-</td>
        </tr>
      </tbody>
    </table>
  {% endfor %}
</div>
"""

    pf.save(ignore_permissions=True)

