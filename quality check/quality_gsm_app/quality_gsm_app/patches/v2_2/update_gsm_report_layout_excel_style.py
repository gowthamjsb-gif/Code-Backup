import frappe


PARENT_DTYPE = "Quality Checking"


def execute():
    """
    Make GSM Testing Report layout match the uploaded Excel-like format:
    - thick black grid borders
    - bold row headers
    - highlighted combined average row
    - green/red diff cell coloring based on tolerance
    """
    name = "GSM Testing Report"
    if not frappe.db.exists("Print Format", name):
        return

    pf = frappe.get_doc("Print Format", name)
    pf.doc_type = PARENT_DTYPE
    pf.print_format_type = "Jinja"
    pf.html = _build_html()
    pf.disabled = 0
    pf.save(ignore_permissions=True)


def _build_html():
    # Note: Jinja inlines `{{ }}` values and loops over doc.sections.
    return r"""
<style>
  .gsm-report-container{
    font-family: Inter, sans-serif;
    padding: 18px;
    color:#111;
  }
  .gsm-header{
    text-align:center;
    margin-bottom: 14px;
  }
  .gsm-header h1{
    margin: 0;
    font-size: 16px;
    font-weight: 800;
  }
  .gsm-header p{
    margin: 4px 0 0;
    font-size: 12px;
    color:#444;
  }
  .gsm-info-grid{
    display:grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 18px;
    margin-bottom: 12px;
    font-size: 12px;
  }
  .info-item{ }
  .info-label{ font-weight: 800; color:#222; }

  table.gsm-table{
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 11px;
    margin-top: 10px;
  }
  table.gsm-table th,
  table.gsm-table td{
    border: 2px solid #000;
    padding: 6px 4px;
    text-align: center;
    word-wrap: break-word;
  }
  table.gsm-table th{
    background: #f2f2f2;
    font-weight: 800;
  }
  .row-header{
    text-align:left !important;
    font-weight: 800;
    background: #fff;
  }
  .highlight-avg{
    background: #f0f0f0;
    font-weight: 800;
  }
  .diff-row{
    background: #fff;
  }
  .pass-diff{
    background: #C6EFCE; /* Excel-ish green */
    color: #1e6d32;
    font-weight: 900;
  }
  .fail-diff{
    background: #FFC7CE; /* Excel-ish red */
    color: #9c1c13;
    font-weight: 900;
  }
  .section-title{
    margin-top: 18px;
    margin-bottom: 8px;
    font-weight: 900;
    font-size: 13px;
  }
  .grand-total{
    font-weight: 900;
    background: #e6e6e6;
  }
</style>

<div class="gsm-report-container">
  <div class="gsm-header">
    <h1>GSM TESTING REPORT</h1>
    <p>Quality Assurance Department</p>
  </div>

  <div class="gsm-info-grid">
    <div class="info-item">
      <span class="info-label">Shaft Production Run:</span> {{ doc.shaft_production_run or "-" }}
    </div>
    <div class="info-item">
      <span class="info-label">Date:</span> {{ doc.creation[:10] }}
    </div>
    <div class="info-item">
      <span class="info-label">Batch No:</span> {{ doc.batch_no or "-" }}
    </div>
    <div class="info-item">
      <span class="info-label">Quality:</span> {{ doc.quality or "-" }}
    </div>
  </div>

  {% for row in doc.sections %}
    {% set q = (row.quality or doc.quality or '')|lower %}
    {% set limit = 5 if ('low' in q or 'lower' in q) else 3 %}
    <div class="section-title">
      GSM Section {{ loop.index }} | Set GSM: {{ row.representative_gsm or "-" }} | Result: {{ row.section_result or "-" }}
    </div>

    <table class="gsm-table">
      <thead>
        <tr>
          <th style="width:120px;">PROPERTIES</th>
          <th style="width:90px;">SET GSM</th>
          {% for i in range(1, 21) %}
            <th>SAMPLE {{ i }}</th>
          {% endfor %}
          <th style="width:120px;" class="highlight-avg">AVERAGE</th>
        </tr>
      </thead>

      <tbody>
        <tr>
          <td class="row-header">GSM (ROW 1)</td>
          <td>{{ row.representative_gsm }}</td>
          {% for i in range(1, 21) %}
            <td>{{ row["r1_s" ~ i] }}</td>
          {% endfor %}
          <td class="highlight-avg">{{ row.r1_average }}</td>
        </tr>

        <tr>
          <td class="row-header">GSM (ROW 2)</td>
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
            <td class="{{ cls }}">{{ d }}</td>
          {% endfor %}
          <td>-</td>
        </tr>
      </tbody>
    </table>
  {% endfor %}
</div>
"""

