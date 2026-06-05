frappe.query_reports["Requirement Report - Statewise"] = {
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
            fieldtype: "Select",
            options: "\nAndhra Pradesh\nArunachal Pradesh\nAssam\nBihar\nChhattisgarh\nGoa\nGujarat\nHaryana\nHimachal Pradesh\nJammu and Kashmir\nJharkhand\nKarnataka\nKerala\nLadakh\nMadhya Pradesh\nMaharashtra\nManipur\nMeghalaya\nMizoram\nNagaland\nOdisha\nPunjab\nRajasthan\nSikkim\nTamil Nadu\nTelangana\nTripura\nUttar Pradesh\nUttarakhand\nWest Bengal\nAndaman and Nicobar Islands\nChandigarh\nDadra and Nagar Haveli and Daman and Diu\nDelhi\nLakshadweep\nPuducherry",
            default: "Tamil Nadu"
        },
        {
            fieldname: "city",
            label: __("City"),
            fieldtype: "Data",
            default: ""
        }
    ]
};
