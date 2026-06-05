frappe.query_reports["Requirement Report"] = {
    onload: function(report) {
        report.set_filter_value("user", frappe.session.user);
    },
    before_refresh: function(report) {
        if (!report.get_filter_value("user")) {
            report.set_filter_value("user", frappe.session.user);
        }
    },
    filters: [
        {
            fieldname: "from_date",
            label: __("From Date"),
            fieldtype: "Date",
            default: frappe.datetime.month_start(),
            reqd: 1
        },
        {
            fieldname: "to_date",
            label: __("To Date"),
            fieldtype: "Date",
            default: frappe.datetime.get_today(),
            reqd: 1
        },
        {
            fieldname: "user",
            label: __("Opportunity Owner"),
            fieldtype: "Link",
            options: "User",
            default: frappe.session.user,
            reqd: 1
        }
    ]
};
