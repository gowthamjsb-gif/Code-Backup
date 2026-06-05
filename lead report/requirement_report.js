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
        },
        {
            fieldname: "state",
            label: __("State"),
            fieldtype: "MultiSelectList",
            get_data: function(txt) {
                return frappe.db.get_list("Lead", {
                    fields: ["state"],
                    filters: [
                        ["state", "like", "%" + txt + "%"],
                        ["state", "!=", ""]
                    ],
                    group_by: "state",
                    limit_page_length: 50
                }).then(res => {
                    return res.map(d => { return {value: d.state, description: d.state}; });
                });
            }
        },
        {
            fieldname: "city",
            label: __("City"),
            fieldtype: "MultiSelectList",
            get_data: function(txt) {
                return frappe.db.get_list("Lead", {
                    fields: ["city"],
                    filters: [
                        ["city", "like", "%" + txt + "%"],
                        ["city", "!=", ""]
                    ],
                    group_by: "city",
                    limit_page_length: 50
                }).then(res => {
                    return res.map(d => { return {value: d.city, description: d.city}; });
                });
            }
        }
    ]
};
