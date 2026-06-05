{%
var report_data = data || frappe.query_report.data || [];
var report_filters = filters || frappe.query_report.get_values() || {};

var detail_rows = [];
var summary_lines = [];
var found_summary = false;

/* 1. Separate Detail rows from Summary text */
for (var i = 0; i < report_data.length; i++) {
  var row = report_data[i];
  var txt = row.summary_text || "";
  if (txt.indexOf("=====") === 0) found_summary = true;
  if (found_summary) {
    summary_lines.push(txt);
  } else {
    if (row.date) detail_rows.push(row);
  }
}

/* 2. Build detail table rows */
var detail_rows_html = "";
for (var i = 0; i < detail_rows.length; i++) {
  var r = detail_rows[i];
  detail_rows_html += "<tr>" +
    "<td>" + (r.date || "") + "</td>" +
    "<td>" + (r.time || "") + "</td>" +
    "<td>" + (r.duration_hms || "") + "</td>" +
    "<td>" + (r.customer || "") + "</td>" +
    "<td>" + (r.customer_name || "") + "</td>" +
    "<td>" + (r.call_status || "") + "</td>" +
    "<td>" + (r.deals_stages || "") + "</td>" +
    "<td>" + (r.exs_owner || "") + "</td>" +
    "<td>" + (r.remarks || "") + "</td>" +
    "</tr>";
}

/* 3. Parse summary lines into blocks */
var blocks = [];
var current_block = null;
for (var i = 0; i < summary_lines.length; i++) {
  var line = summary_lines[i];
  if (line.indexOf("=====") === 0) {
    if (current_block) blocks.push(current_block);
    current_block = [];
  } else if (current_block !== null) {
    current_block.push(line);
  }
}
if (current_block) blocks.push(current_block);

/* 4. Build summary blocks HTML */
var summary_html = "";
for (var b = 0; b < blocks.length; b++) {
  var lines = blocks[b];
  var date_line = "", total_calls = "0", total_dur = "0", total_won = "0";
  var emp_lines = [], cust_lines = [], stage_lines = [], status_lines = [];
  var section = "header";

  for (var li = 0; li < lines.length; li++) {
    var l = lines[li].trim();
    if (l === "-- Calls by Sales Employee --") { section = "emp"; continue; }
    if (l === "-- Calls by Customer & Stage --") { section = "cust"; continue; }
    if (l === "-- Calls by Stage --") { section = "stage"; continue; }
    if (l === "-- Call Status Summary --") { section = "status"; continue; }
    if (l === "" || l.indexOf("=====") === 0 || l === "CALL SUMMARY REPORT") continue;
    if (l.indexOf("---") === 0) continue;

    if (l.indexOf("Date") === 0) { date_line = l; continue; }
    if (l.indexOf("Total Calls") === 0) { total_calls = l.split(":")[1] ? l.split(":")[1].trim() : "0"; continue; }
    if (l.indexOf("Total Duration") === 0) { total_dur = l.split(":").slice(1).join(":").trim(); continue; }
    if (l.indexOf("Total Won") === 0) { total_won = l.split(":")[1] ? l.split(":")[1].trim() : "0"; continue; }

    if (section === "emp") emp_lines.push(l);
    else if (section === "cust") cust_lines.push(l);
    else if (section === "stage") stage_lines.push(l);
    else if (section === "status") status_lines.push(l);
  }

  if (!date_line) continue;

  var emp_html = "";
  for (var j = 0; j < emp_lines.length; j++) { emp_html += "<div class='sec-row'>" + emp_lines[j] + "</div>"; }

  var cust_html = "";
  for (var j = 0; j < cust_lines.length; j++) { cust_html += "<div class='sec-row'>" + cust_lines[j] + "</div>"; }

  var stage_rows_html = "";
  for (var j = 0; j < stage_lines.length; j++) {
    var sparts = stage_lines[j].split(/\s{2,}/);
    stage_rows_html += "<tr><td>" + (sparts[0] || "") + "</td><td>" + (sparts[1] || "") + "</td></tr>";
  }

  summary_html += "<div class='summary-block'>" +
    "<div class='sum-header'>" + date_line + "</div>" +
    "<div class='sum-body'>" +
    "<div class='kpi-row'>" +
    "<div class='kpi'><b>Total Calls</b><br>" + total_calls + "</div>" +
    "<div class='kpi'><b>Total Duration</b><br>" + total_dur + "</div>" +
    "<div class='kpi'><b>Total Won</b><br>" + total_won + "</div>" +
    "</div>" +
    (emp_lines.length > 0 ? "<div class='sec-title'>By Employee</div>" + emp_html : "") +
    (stage_lines.length > 0 ? "<div class='sec-title'>By Stage</div><table class='mini-table'>" + stage_rows_html + "</table>" : "") +
    "</div></div>";
}

/* 5. Final Assembly */
var from_date = report_filters.from_date || "";
var to_date = report_filters.to_date || "";
var emp_filter = report_filters.sales_employee || "All";

var html_out = "<html><head><style>" +
  "body { font-family: sans-serif; font-size: 10px; }" +
  ".detail-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }" +
  ".detail-table th { background: #333; color: #fff; padding: 5px; text-align: left; }" +
  ".detail-table td { border-bottom: 1px solid #ddd; padding: 5px; }" +
  ".summary-block { border: 1px solid #ccc; margin-top: 15px; page-break-inside: avoid; }" +
  ".sum-header { background: #444; color: #fff; padding: 8px; font-weight: bold; }" +
  ".sum-body { padding: 10px; }" +
  ".kpi-row { display: block; overflow: hidden; margin-bottom: 10px; }" +
  ".kpi { float: left; width: 30%; background: #f4f4f4; padding: 5px; text-align: center; margin-right: 5px; }" +
  ".sec-title { font-weight: bold; border-bottom: 1px solid #eee; margin-top: 10px; }" +
  ".sec-row { padding: 2px 0; border-bottom: 1px solid #f9f9f9; }" +
  ".mini-table { width: 100%; }" +
  ".mini-table td { padding: 2px; border-bottom: 1px solid #eee; }" +
  "</style></head><body>" +
  "<h1>Individual CRM Report</h1>" +
  "<p>Period: " + from_date + " to " + to_date + " | Employee: " + emp_filter + "</p>" +
  (detail_rows.length > 0 ? "<table class='detail-table'><thead><tr><th>Date</th><th>Time</th><th>Dur</th><th>Cust</th><th>Name</th><th>Status</th><th>Stage</th><th>Owner</th><th>Remarks</th></tr></thead><tbody>" + detail_rows_html + "</tbody></table>" : "") +
  summary_html +
  "</body></html>";
%}
{%= html_out %}