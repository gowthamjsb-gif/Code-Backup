# ── Role-based access ───────────────────────────────────────────────────────
current_user = frappe.session.user

user_roles = frappe.db.get_all(
    "Has Role",
    filters={"parent": current_user, "parenttype": "User"},
    fields=["role"],
    pluck="role"
)

is_manager = (
    "Export CRM Manager" in user_roles or
    "Domestic CRM Manager" in user_roles or
    "Administrator" in user_roles
)

# ── Columns ─────────────────────────────────────────────────────────────────
columns = [
    {"label": "Opportunity",        "fieldname": "opportunity",       "fieldtype": "Link",   "options": "Opportunity", "width": 150},
    {"label": "Opportunity Owner",  "fieldname": "opportunity_owner", "fieldtype": "Link",   "options": "User",        "width": 120},
    {"label": "Company Name",       "fieldname": "company_name",      "fieldtype": "Data",                             "width": 150},
    {"label": "Party Name",         "fieldname": "party_name",        "width": 150},
    {"label": "City",               "fieldname": "city",              "width": 100},
    {"label": "Sales Stage",        "fieldname": "custom_sales_group","width": 120},
    {"label": "Opportunity Status", "fieldname": "status",            "width": 120},
    {"label": "Date",               "fieldname": "date",              "fieldtype": "Date",                             "width": 100},
    {"label": "Time",               "fieldname": "time",              "fieldtype": "Time",                             "width": 100},
    {"label": "Called By",          "fieldname": "called_by",         "fieldtype": "Link",   "options": "User",        "width": 120},
    {"label": "Call Status",        "fieldname": "call_status",       "width": 120},
    {"label": "Follow Up Stages",   "fieldname": "follow_up",         "width": 120},
    {"label": "Remarks",            "fieldname": "remarks",           "width": 250},
    {"label": "Sample Stages",      "fieldname": "sample_stages",     "width": 120},
    {"label": "Docket Number",      "fieldname": "docket_number",     "width": 120},
    {"label": "Sample Feedback",    "fieldname": "sample_feedback",   "width": 200},
    {"label": "Requirement",        "fieldname": "requirement",       "width": 180},
    {"label": "Fabric Requirement", "fieldname": "fabric_requirement", "width": 120},
    {"label": "Fabric Need",        "fieldname": "fabric_need",        "width": 120},
    {"label": "Bag Quantity",       "fieldname": "bag_quantity",       "width": 120},
    {"label": "Bag Need",           "fieldname": "bag_need",           "width": 120},
    
    # --- Custom Detail Fields ---
    {"label": "Fabric GSM",               "fieldname": "custom_gsm",                      "width": 100},
    {"label": "Quality",                  "fieldname": "custom_quality",                  "width": 100},
    {"label": "Width",                    "fieldname": "custom__width",                   "width": 100},
    {"label": "Fabric Machinery Details", "fieldname": "custom_fabric_machinery_details", "width": 150},
    {"label": "Bag GSM",                  "fieldname": "custom_bag_gsm",                  "width": 100},
    {"label": "Bag Type",                 "fieldname": "custom_bag_type",                 "width": 100},
    {"label": "Other Quality",            "fieldname": "custom_other_quality",            "width": 100},
    {"label": "Bag Machinery Details",    "fieldname": "custom_machinery_details",        "width": 150},
    {"label": "Colour",                   "fieldname": "custom_colour",                   "width": 100},
    {"label": "Bag Quality",              "fieldname": "custom_bag_quality",              "width": 100},
    {"label": "Bag Size",                 "fieldname": "custom_bag_size",                 "width": 100},
    
    {"label": "Recording Length",   "fieldname": "recording_length",  "width": 120},
    {"label": "Call Recording",     "fieldname": "call_recording",    "width": 120},
]

# ── User filter ──────────────────────────────────────────────────────────────
user_filter = "" if is_manager else f"AND opp.opportunity_owner = '{current_user}'"

# ── Dynamic field expressions ───────────────────────────────────────────────
def has_field_safe(doctype, fieldname):
    try:
        return frappe.get_meta(doctype).has_field(fieldname)
    except Exception:
        return False

# 1. Existing mapping logic (Fabric, Bags, Requirements, Sales Group)
fabric_sources = []
bag_sources = []
requirement_sources = []
sales_group_sources = []

# Field checks for Opportunity/Lead
for dt, prefix in [("Opportunity", "opp"), ("Lead", "lead")]:
    # Fabric
    for f in ["custom_monthly_fabric_need_kgs", "custom_monthly_fabric_requirement_kgs", "custom_monthly_fabric_requirement_kg"]:
        if has_field_safe(dt, f): fabric_sources.append(f"{prefix}.{f}")
    # Bags
    for f in ["custom_monthly_bag_need_pieces", "custom_monthly_bag_quantity_pieces", "custom_monthly_bag_quantity_pcs"]:
        if has_field_safe(dt, f): bag_sources.append(f"{prefix}.{f}")
    # Requirement
    for f in ["requirement", "custom_requirement"]:
        if has_field_safe(dt, f): requirement_sources.append(f"{prefix}.{f}")
    # Sales Group
    for f in ["custom_sales_group", "sales_group"]:
        if has_field_safe(dt, f): sales_group_sources.append(f"{prefix}.{f}")

fabric_expr = ("COALESCE(" + ", ".join(fabric_sources) + ")") if fabric_sources else "NULL"
bag_expr = ("COALESCE(" + ", ".join(bag_sources) + ")") if bag_sources else "NULL"
requirement_expr = ("COALESCE(" + ", ".join(requirement_sources) + ")") if requirement_sources else "''"
sales_group_expr = ("COALESCE(" + ", ".join(sales_group_sources) + ")") if sales_group_sources else "''"

# Numeric formatting expressions
fabric_display_expr = f"(CASE WHEN {fabric_expr} IS NULL THEN '0' ELSE CAST({fabric_expr} AS CHAR) END)"
bag_display_expr = f"(CASE WHEN {bag_expr} IS NULL THEN '0' ELSE CAST({bag_expr} AS CHAR) END)"

# 2. Mapping logic for the new Custom Detail Fields
custom_fields_to_map = [
    "custom_gsm", "custom_quality", "custom__width", 
    "custom_fabric_machinery_details", "custom_bag_gsm", "custom_bag_type", 
    "custom_other_quality", "custom_machinery_details", "custom_colour",
    "custom_bag_quality", "custom_bag_size"
]

custom_exprs = {}
for field in custom_fields_to_map:
    sources = []
    if has_field_safe("Opportunity", field): sources.append(f"opp.{field}")
    if has_field_safe("Lead", field): sources.append(f"lead.{field}")
    custom_exprs[field] = ("COALESCE(" + ", ".join(sources) + ")") if sources else "''"

# 3. Mapping logic for Company and Party (from Opportunity)
company_name_sources = []
for f in ["title", "customer_name", "company_name", "party_name"]:
    if has_field_safe("Opportunity", f): company_name_sources.append(f"opp.{f}")

party_name_sources = []
for f in ["party_name", "customer_name"]:
    if has_field_safe("Opportunity", f): party_name_sources.append(f"opp.{f}")

# City mapping
city_sources = []
for f in ["city", "custom_city"]:
    if has_field_safe("Opportunity", f): city_sources.append(f"opp.{f}")
    if has_field_safe("Lead", f): city_sources.append(f"lead.{f}")
city_expr = ("COALESCE(" + ", ".join(city_sources) + ")") if city_sources else "''"

# ── Filter Handling ────────────────────────────────────────────────────────
if not filters: filters = {}
if not filters.get("from_date"): filters["from_date"] = "1900-01-01"
if not filters.get("to_date"): filters["to_date"] = "2099-12-31"

company_name_expr = ("COALESCE(" + ", ".join(company_name_sources) + ")") if company_name_sources else "''"
party_name_expr = ("COALESCE(" + ", ".join(party_name_sources) + ")") if party_name_sources else "''"

# ── SQL Query ───────────────────────────────────────────────────────────────
data = frappe.db.sql(f"""
    SELECT
        child.parent              AS opportunity,
        opp.opportunity_owner,
        {company_name_expr} AS company_name,
        {party_name_expr} AS party_name,
        {city_expr} AS city,
        {sales_group_expr} AS custom_sales_group,
        opp.status,
        child.date,
        child.time,
        child.called_by,
        child.call_status,
        child.follow_up,
        child.remarks,
        child.sample_stages,
        child.docket_number,
        child.sample_feedback,
        {requirement_expr} AS requirement,
        {fabric_display_expr} AS fabric_requirement,
        {fabric_display_expr} AS fabric_need,
        {bag_display_expr} AS bag_quantity,
        {bag_display_expr} AS bag_need,
        {custom_exprs['custom_gsm']} AS custom_gsm,
        {custom_exprs['custom_quality']} AS custom_quality,
        {custom_exprs['custom__width']} AS custom__width,
        {custom_exprs['custom_fabric_machinery_details']} AS custom_fabric_machinery_details,
        {custom_exprs['custom_bag_gsm']} AS custom_bag_gsm,
        {custom_exprs['custom_bag_type']} AS custom_bag_type,
        {custom_exprs['custom_other_quality']} AS custom_other_quality,
        {custom_exprs['custom_machinery_details']} AS custom_machinery_details,
        {custom_exprs['custom_colour']} AS custom_colour,
        {custom_exprs['custom_bag_quality']} AS custom_bag_quality,
        {custom_exprs['custom_bag_size']} AS custom_bag_size,
        child.recording_length,
        child.call_recording
    FROM
        `tabLead Call Remarks` AS child
    LEFT JOIN
        `tabOpportunity` AS opp ON child.parent = opp.name
    LEFT JOIN
        `tabLead` AS lead ON opp.party_name = lead.name
    LEFT JOIN
        `tabCustomer` AS cust ON opp.party_name = cust.name
    WHERE
        child.parenttype = 'Opportunity'
        AND child.date >= %(from_date)s
        AND child.date <= %(to_date)s
        {user_filter}
    ORDER BY
        child.date DESC
""", filters, as_dict=1)

data = [columns, data, None, None, None, True]