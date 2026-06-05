import frappe
from frappe import __

def execute(filters=None):
    if not filters:
        filters = {}

    # ── Role-based access ───────────────────────────────────────────────────────
    current_user = frappe.session.user
    
    user_roles = frappe.get_roles(current_user)

    is_manager = any(role in user_roles for role in [
        "Export CRM Manager", 
        "Domestic CRM Manager", 
        "Administrator", 
        "System Manager"
    ])

    # ── Columns ─────────────────────────────────────────────────────────────────
    columns = [
        {"label": _("Opportunity"),        "fieldname": "opportunity",       "fieldtype": "Link",   "options": "Opportunity", "width": 150},
        {"label": _("Opportunity Owner"),  "fieldname": "opportunity_owner", "fieldtype": "Link",   "options": "User",        "width": 120},
        {"label": _("Company Name"),       "fieldname": "company_name",      "fieldtype": "Data",                             "width": 150},
        {"label": _("Party Name"),         "fieldname": "party_name",        "fieldtype": "Data",                             "width": 150},
        {"label": _("City"),               "fieldname": "city",              "fieldtype": "Data",                             "width": 100},
        {"label": _("Sales Stage"),        "fieldname": "custom_sales_group","fieldtype": "Data",                             "width": 120},
        {"label": _("Opportunity Status"), "fieldname": "status",            "fieldtype": "Data",                             "width": 120},
        {"label": _("Date"),               "fieldname": "date",              "fieldtype": "Date",                             "width": 100},
        {"label": _("Time"),               "fieldname": "time",              "fieldtype": "Time",                             "width": 100},
        {"label": _("Called By"),          "fieldname": "called_by",         "fieldtype": "Link",   "options": "User",        "width": 120},
        {"label": _("Call Status"),        "fieldname": "call_status",       "fieldtype": "Data",                             "width": 120},
        {"label": _("Follow Up Stages"),   "fieldname": "follow_up",         "fieldtype": "Data",                             "width": 120},
        {"label": _("Remarks"),            "fieldname": "remarks",           "fieldtype": "Data",                             "width": 250},
        {"label": _("Sample Stages"),      "fieldname": "sample_stages",     "fieldtype": "Data",                             "width": 120},
        {"label": _("Docket Number"),      "fieldname": "docket_number",     "fieldtype": "Data",                             "width": 120},
        {"label": _("Sample Feedback"),    "fieldname": "sample_feedback",   "fieldtype": "Data",                             "width": 200},
        {"label": _("Requirement"),        "fieldname": "requirement",       "fieldtype": "Data",                             "width": 180},
        {"label": _("Fabric Requirement"), "fieldname": "fabric_requirement", "fieldtype": "Data",                            "width": 120},
        {"label": _("Fabric Need"),        "fieldname": "fabric_need",        "fieldtype": "Data",                            "width": 120},
        {"label": _("Bag Quantity"),       "fieldname": "bag_quantity",       "fieldtype": "Data",                            "width": 120},
        {"label": _("Bag Need"),           "fieldname": "bag_need",           "fieldtype": "Data",                            "width": 120},
        
        # --- Custom Detail Fields ---
        {"label": _("Fabric GSM"),               "fieldname": "custom_gsm",                      "fieldtype": "Data", "width": 100},
        {"label": _("Quality"),                  "fieldname": "custom_quality",                  "fieldtype": "Data", "width": 100},
        {"label": _("Width"),                    "fieldname": "custom__width",                   "fieldtype": "Data", "width": 100},
        {"label": _("Fabric Machinery Details"), "fieldname": "custom_fabric_machinery_details", "fieldtype": "Data", "width": 150},
        {"label": _("Bag GSM"),                  "fieldname": "custom_bag_gsm",                  "fieldtype": "Data", "width": 100},
        {"label": _("Bag Type"),                 "fieldname": "custom_bag_type",                 "fieldtype": "Data", "width": 100},
        {"label": _("Other Quality"),            "fieldname": "custom_other_quality",            "fieldtype": "Data", "width": 100},
        {"label": _("Bag Machinery Details"),    "fieldname": "custom_machinery_details",        "fieldtype": "Data", "width": 150},
        {"label": _("Colour"),                   "fieldname": "custom_colour",                   "fieldtype": "Data", "width": 100},
        {"label": _("Bag Quality"),              "fieldname": "custom_bag_quality",              "fieldtype": "Data", "width": 100},
        {"label": _("Bag Size"),                 "fieldname": "custom_bag_size",                 "fieldtype": "Data", "width": 100},
        
        {"label": _("Recording Length"),   "fieldname": "recording_length",  "fieldtype": "Data", "width": 120},
        {"label": _("Call Recording"),     "fieldname": "call_recording",    "fieldtype": "Data", "width": 120},
    ]

    # ── User filter ──────────────────────────────────────────────────────────────
    user_filter = ""
    if not is_manager:
        # Check for both possible fieldnames
        selected_owner = filters.get("user") or filters.get("opportunity_owner") or current_user
        user_filter = "AND opp.opportunity_owner = %(selected_owner)s"
        filters["selected_owner"] = selected_owner

    # ── Dynamic field expressions ───────────────────────────────────────────────
    def has_field_safe(doctype, fieldname):
        try:
            return frappe.get_meta(doctype).has_field(fieldname)
        except Exception:
            return False

    def coalesce_expr(sources, default="''"):
        return ("COALESCE(" + ", ".join(sources) + ")") if sources else default

    def display_expr(expr):
        if expr == "NULL":
            return "''"
        return f"(CASE WHEN {expr} IS NULL OR TRIM(CAST({expr} AS CHAR)) = '' THEN '' ELSE CAST({expr} AS CHAR) END)"

    def quantity_has_value_condition(expr):
        if expr == "NULL":
            return "0 = 1"
        return f"(NULLIF(TRIM(CAST({expr} AS CHAR)), '') IS NOT NULL AND CAST({expr} AS DECIMAL(18, 6)) <> 0)"

    # 1. Mapping logic (Fabric, Bags, Requirements, Sales Group)
    fabric_sources = []
    bag_sources = []
    requirement_sources = []
    sales_group_sources = []

    for dt, prefix in [("Opportunity", "opp"), ("Lead", "lead")]:
        for f in ["custom_monthly_fabric_need_kgs", "custom_monthly_fabric_requirement_kgs", "custom_monthly_fabric_requirement_kg"]:
            if has_field_safe(dt, f): fabric_sources.append(f"{prefix}.{f}")
        for f in ["custom_monthly_bag_need_pieces", "custom_monthly_bag_quantity_pieces", "custom_monthly_bag_quantity_pcs"]:
            if has_field_safe(dt, f): bag_sources.append(f"{prefix}.{f}")
        for f in ["requirement", "custom_requirement"]:
            if has_field_safe(dt, f): requirement_sources.append(f"{prefix}.{f}")
        for f in ["custom_sales_group", "sales_group"]:
            if has_field_safe(dt, f): sales_group_sources.append(f"{prefix}.{f}")

    fabric_expr = coalesce_expr(fabric_sources, "NULL")
    bag_expr = coalesce_expr(bag_sources, "NULL")
    requirement_expr = coalesce_expr(requirement_sources)
    sales_group_expr = coalesce_expr(sales_group_sources)

    # 2. Custom Detail Fields Mapping
    custom_fields_to_map = [
        "custom_gsm", "custom_quality", "custom__width", 
        "custom_fabric_machinery_details", "custom_bag_gsm", "custom_bag_type", 
        "custom_other_quality", "custom_machinery_details", "custom_colour",
        "custom_bag_quality", "custom_bag_size"
    ]

    custom_exprs = {}
    for field in custom_fields_to_map:
        sources = []
        for dt, prefix in [("Opportunity", "opp"), ("Lead", "lead")]:
            if has_field_safe(dt, field): sources.append(f"{prefix}.{field}")
        custom_exprs[field] = coalesce_expr(sources)

    # 3. Company and Party mapping
    company_name_sources = []
    for f in ["title", "customer_name", "company_name", "party_name"]:
        if has_field_safe("Opportunity", f): company_name_sources.append(f"opp.{f}")

    party_name_sources = []
    for f in ["party_name", "customer_name"]:
        if has_field_safe("Opportunity", f): party_name_sources.append(f"opp.{f}")

    city_sources = []
    for dt, prefix in [("Opportunity", "opp"), ("Lead", "lead")]:
        for f in ["city", "custom_city"]:
            if has_field_safe(dt, f): city_sources.append(f"{prefix}.{f}")
    city_expr = coalesce_expr(city_sources)

    # ── Date Filter Handling ────────────────────────────────────────────────────────
    date_filter = ""
    if filters.get("from_date"):
        date_filter += " AND child.date >= %(from_date)s"
    if filters.get("to_date"):
        date_filter += " AND child.date <= %(to_date)s"

    # ── Quantity Filter (Always show entries with non-zero requirements) ───────────
    quantity_filter = f"AND ({quantity_has_value_condition(fabric_expr)} OR {quantity_has_value_condition(bag_expr)})"

    # ── SQL Query ───────────────────────────────────────────────────────────────
    data = frappe.db.sql(f"""
        SELECT
            child.parent              AS opportunity,
            opp.opportunity_owner,
            {coalesce_expr(company_name_sources)} AS company_name,
            {coalesce_expr(party_name_sources)} AS party_name,
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
            {display_expr(fabric_expr)} AS fabric_requirement,
            {display_expr(fabric_expr)} AS fabric_need,
            {display_expr(bag_expr)} AS bag_quantity,
            {display_expr(bag_expr)} AS bag_need,
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
        WHERE
            child.parenttype = 'Opportunity'
            {date_filter}
            {user_filter}
            {quantity_filter}
        ORDER BY
            child.date DESC,
            child.time DESC
    """, filters, as_dict=1)

    return columns, data
