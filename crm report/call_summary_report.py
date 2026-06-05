# 1. Columns
columns = [
    {"label": "Summary", "fieldname": "summary_text", "fieldtype": "Data", "width": 400},
    {"label": "Date", "fieldname": "date", "fieldtype": "Date", "width": 120},
    {"label": "Time", "fieldname": "time", "fieldtype": "Time", "width": 100},
    {"label": "Remarks", "fieldname": "remarks", "fieldtype": "Data", "width": 200},
    {"label": "Customer", "fieldname": "customer", "fieldtype": "Link", "options": "Customer", "width": 120},
    {"label": "Customer Name", "fieldname": "customer_name", "fieldtype": "Data", "width": 150},
    {"label": "Call Status", "fieldname": "call_status", "fieldtype": "Data", "width": 150},
    {"label": "Deals Stages", "fieldname": "deals_stages", "fieldtype": "Data", "width": 200},
    {"label": "Sales Employee", "fieldname": "exs_owner", "fieldtype": "Data", "width": 150}
]

# 2. Build parent filters
parent_filters = {}
selected_employee = filters.get("sales_employee")
if selected_employee:
    parent_filters["exs_owner"] = selected_employee

# 3. Get parent docs
parent_docs = frappe.db.get_all("Existing Deals",
    fields=["name", "exs_owner"],
    filters=parent_filters
)

parent_map = {}
for p in parent_docs:
    parent_map[p.name] = p.exs_owner

parent_names = list(parent_map.keys())

if not parent_names:
    data = [columns, [{"summary_text": "No records found."}], None, None, None, True]
else:
    child_filters = {
        "date": ["between", [filters.get("from_date"), filters.get("to_date")]],
        "parent": ["in", parent_names]
    }

    data_rows = frappe.db.get_all("Existing Table",
        fields=["date", "time", "remarks", "customer", "customer_name", "call_status", "deals_stages", "parent"],
        filters=child_filters,
        order_by="date asc, time asc"
    )

    report_data = []

    if data_rows:
        for d in data_rows:
            d["exs_owner"] = parent_map.get(d.parent, "")

        # PART 1: Table rows
        for d in data_rows:
            report_data.append({
                "summary_text": "",
                "date": d.date,
                "time": d.time,
                "remarks": d.remarks,
                "customer": d.customer,
                "customer_name": d.customer_name or "",
                "call_status": d.call_status,
                "deals_stages": d.deals_stages,
                "exs_owner": d.exs_owner
            })

        report_data.append({"summary_text": ""})
        report_data.append({"summary_text": ""})

        # Group by date
        date_groups = {}
        for d in data_rows:
            date_key = str(d.date)
            if date_key not in date_groups:
                date_groups[date_key] = []
            date_groups[date_key].append(d)

        for date_val in sorted(date_groups.keys()):
            rows = date_groups[date_val]
            total_calls = len(rows)
            total_won = 0

            # Calls per employee
            employee_calls = {}
            for d in rows:
                emp = str(d.exs_owner) if d.exs_owner else "Unknown"
                current = employee_calls.get(emp, 0)
                employee_calls[emp] = current + 1

            # Calls per customer + stage
            stats = {}
            for d in rows:
                cust_id = str(d.customer)
                cust_name = str(d.customer_name) if d.customer_name else cust_id
                stage = str(d.deals_stages)
                stat_key = cust_id + "||" + cust_name + "||" + stage
                current = stats.get(stat_key, 0)
                stats[stat_key] = current + 1
                if stage == "Won":
                    total_won = total_won + 1

            # Summary block
            report_data.append({"summary_text": "================================================="})
            report_data.append({"summary_text": "  CALL SUMMARY REPORT"})
            report_data.append({"summary_text": "================================================="})
            report_data.append({"summary_text": ""})
            report_data.append({"summary_text": "Date         : " + date_val})
            
            if rows:
                first_row = rows[0]
                last_row = rows[-1]
                report_data.append({"summary_text": "Opening Date&Time : " + str(first_row.date) + " " + str(first_row.time)})
                report_data.append({"summary_text": "Closing Date&Time : " + str(last_row.date) + " " + str(last_row.time)})

            report_data.append({"summary_text": "Total Calls  : " + str(total_calls)})
            report_data.append({"summary_text": ""})

            # Sales Employee breakdown
            report_data.append({"summary_text": "-- Calls by Sales Employee --"})
            emp_idx = 1
            for emp in employee_calls:
                emp_count = employee_calls[emp]
                call_word = "Call" if emp_count == 1 else "Calls"
                report_data.append({"summary_text": "  " + str(emp_idx) + ".  " + emp + "  -  " + str(emp_count) + " " + call_word})
                emp_idx = emp_idx + 1

            report_data.append({"summary_text": ""})

            # Customer breakdown with name
            report_data.append({"summary_text": "-- Calls by Customer & Stage --"})
            idx = 1
            for stat_key in stats:
                count = stats[stat_key]
                parts = stat_key.split("||")
                cust_id = parts[0]
                cust_name = parts[1]
                stage = parts[2]
                call_word = "Call" if count == 1 else "Calls"
                report_data.append({
                    "summary_text": "  " + str(idx) + ".  " + cust_id + " (" + cust_name + ")  -  " + str(count) + " " + call_word + "  -  " + stage
                })
                idx = idx + 1

            report_data.append({"summary_text": ""})
            report_data.append({"summary_text": "Total Won    : " + str(total_won)})
            report_data.append({"summary_text": "================================================="})
            report_data.append({"summary_text": ""})

    else:
        report_data.append({"summary_text": "No calls found for selected date range."})

    data = [columns, report_data, None, None, None, True]
