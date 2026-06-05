frappe.query_reports["Non FG Stock Report"] = {
    "filters": [
        {
            "fieldname": "item_code",
            "label": __("Item Code"),
            "fieldtype": "Link",
            "options": "Item",
            "width": "80"
        }
    ],
    "get_datatable_options": function(options) {
        return Object.assign(options, {
            rowClass: function(row, rowIndex) {
                if (options.data && options.data[rowIndex]) {
                    let rowData = options.data[rowIndex];
                    let itemCode = rowData["Item Code"] || (rowData[0] && rowData[0].content) || "";
                    if (typeof itemCode === "string") {
                        if (itemCode.includes('<b>')) return 'report-group-header-row';
                        if (!itemCode.trim()) return 'report-spacer-row';
                    }
                }
                return '';
            }
        });
    },
    "onload": function(report) {
        $('<style>')
            .prop('type', 'text/css')
            .html(`
                .report-group-header-row .dt-cell {
                    background-color: #f1f5f9;
                    border-top: 1px solid #cbd5e1 !important;
                    border-bottom: 1px solid #cbd5e1 !important;
                    border-right: none !important;
                    border-left: none !important;
                }
                .report-group-header-row .dt-cell:first-child {
                    text-transform: uppercase;
                    font-size: 12px;
                    letter-spacing: 0.5px;
                    overflow: visible !important;
                    z-index: 10;
                }
                .report-spacer-row .dt-cell {
                    border: none !important;
                    background: transparent !important;
                }
                .report-spacer-row {
                    pointer-events: none;
                }
            `)
            .appendTo('head');
    }
};
