import frappe
import os
import json

def execute(filters=None):
    if not filters:
        filters = {}

    # Read the query from the SQL file
    sql_path = os.path.join(os.path.dirname(__file__), 'requirement_report.sql')
    with open(sql_path, 'r') as f:
        query = f.read()

    def get_list_condition(field, column):
        val = filters.get(field)
        if not val:
            return ""
        if isinstance(val, str):
            try:
                val = json.loads(val)
            except Exception:
                val = [v.strip() for v in val.split(",")]
        
        if not isinstance(val, list) or not val:
            return ""
            
        escaped_vals = ", ".join([frappe.db.escape(v) for v in val])
        return f" AND {column} IN ({escaped_vals}) "

    # Process MultiSelect lists for city and state safely
    city_cond = get_list_condition("city", "lead.city")
    state_cond = get_list_condition("state", "lead.state")
    
    combined_cond = f"{city_cond} {state_cond}"
    
    # Inject the multi-select conditions into the placeholder in the SQL string
    query = query.replace("/*city_condition*/", combined_cond)

    # Execute the query
    data = frappe.db.sql(query, filters, as_dict=False)
    
    # Extract columns exactly as defined in the .sql file
    columns = [desc[0] for desc in frappe.db.get_description()]

    return columns, data
