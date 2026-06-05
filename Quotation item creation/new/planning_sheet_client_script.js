/**
 * Planning sheet — Client Script only (no server scripts).
 *
 * Actions → Change BOM
 * - Lists finished-good lines from the linked Sales Order
 * - Each row: Select BOM → pick active BOM (default / alternate)
 * - Does NOT update the Items child table
 *
 * Client Script record: DocType must match your site exactly (usually "Planning sheet").
 *
 * Change BOM is shown only when at least one row in Items has
 * unit = "JVE - SHEET CUTTING MACHINE".
 */
const SHEET_CUTTING_UNIT = "JVE - SHEET CUTTING MACHINE";

function planning_sheet_has_change_bom_target(doc) {
    const target = SHEET_CUTTING_UNIT.trim().toLowerCase();
    return (doc.items || []).some(function (row) {
        const unit = (row.unit || "").trim().toLowerCase();
        return unit === target || item_is_supported_sheet_process(row);
    });
}

function planning_sheet_sync_change_bom_button(frm) {
    frm.remove_custom_button(__("Change BOM"), __("Actions"));
    if (frm.doc.docstatus === 1) return;
    if (!planning_sheet_has_change_bom_target(frm.doc)) return;
    frm.add_custom_button(__("Change BOM"), () => open_fg_bom_dialog(frm), __("Actions"));
}

// Register both spellings — Frappe matches doctype name exactly
["Planning sheet", "Planning Sheet"].forEach(function (doctype) {
    frappe.ui.form.on(doctype, {
        refresh(frm) {
            planning_sheet_sync_change_bom_button(frm);
        },
        items_add(frm) {
            planning_sheet_sync_change_bom_button(frm);
        },
        items_remove(frm) {
            planning_sheet_sync_change_bom_button(frm);
        },
    });
});

// Re-check when unit is edited in the Items grid
["Planning sheet Item", "Planning Sheet Item"].forEach(function (child_doctype) {
    frappe.ui.form.on(child_doctype, {
        unit(frm) {
            planning_sheet_sync_change_bom_button(frm);
        },
    });
});

/** First matching Sales Order link field on Planning Sheet */
function get_sales_order_name(doc) {
    const fields = [
        "sales_order",
        "custom_sales_order",
        "against_sales_order",
        "custom_against_sales_order",
    ];
    for (let i = 0; i < fields.length; i++) {
        const v = doc[fields[i]];
        if (v) return v;
    }
    return null;
}

function esc_html(text) {
    return frappe.utils.escape_html
        ? frappe.utils.escape_html(String(text == null ? "" : text))
        : String(text == null ? "" : text);
}

/** Sheet FG processes: 251 plain, 252 printed, 253 laminated, 254 laminated printed, 255 BOPP laminated sheet. */
function item_is_supported_sheet_process(row) {
    const code = String((row && row.item_code) || "").trim().toUpperCase();
    const name = String((row && row.item_name) || "").trim().toUpperCase();
    const process = String((row && (row.custom_process || row.process)) || "").trim().toUpperCase();
    if (/^(25[1-5])/.test(code) || /-(25[1-5])/.test(code)) return true;
    if (/\bSHEET\b/.test(name)) return true;
    return [
        "NON WOVEN PLAIN SHEET",
        "NON WOVEN PRINTED SHEET",
        "NON WOVEN LAMINATED SHEET",
        "NON WOVEN LAMINATED PRINTED SHEET",
        "NON WOVEN BOPP LAMINATED SHEET",
    ].some((p) => process.indexOf(p) >= 0 || name.indexOf(p) >= 0);
}

/** Turn SO / planning child rows into distinct FG lines */
function normalize_fg_rows(rows) {
    const seen = {};
    const items = [];
    (rows || []).forEach((row) => {
        const code = (row.item_code || "").trim();
        if (!code || seen[code]) return;
        seen[code] = 1;
        items.push({
            item_code: code,
            item_name: row.item_name || row.description || code,
            qty: row.qty || 0,
            uom: row.uom || row.stock_uom || "",
            custom_process: row.custom_process || row.process || "",
        });
    });
    return items;
}

function merge_fg_rows(primary_rows, fallback_rows) {
    return normalize_fg_rows([].concat(primary_rows || [], fallback_rows || []));
}

function get_sales_order_fg_items(so_name, planning_doc) {
    // 1) Load full Sales Order (works when get_list on child rows is blocked by permissions)
    return frappe
        .call({
            method: "frappe.client.get",
            args: { doctype: "Sales Order", name: so_name },
        })
        .then((r) => {
            const so = r.message || {};
            let rows = so.items || [];
            if (!rows.length && so.packed_items && so.packed_items.length) {
                rows = so.packed_items;
            }
            let items = normalize_fg_rows(rows);
            if (items.length) return merge_fg_rows(items, planning_doc && planning_doc.items);

            // 2) Fallback: child table query with parenttype / parentfield
            return frappe
                .call({
                    method: "frappe.client.get_list",
                    args: {
                        doctype: "Sales Order Item",
                        filters: {
                            parent: so_name,
                            parenttype: "Sales Order",
                            parentfield: "items",
                        },
                        fields: ["item_code", "item_name", "description", "qty", "uom", "stock_uom", "custom_process", "process"],
                        order_by: "idx asc",
                        limit_page_length: 500,
                    },
                })
                .then((r2) => merge_fg_rows(r2.message || [], planning_doc && planning_doc.items));
        })
        .then((items) => {
            if (items.length) return items;
            // 3) Fallback: distinct FG already on this Planning sheet
            return normalize_fg_rows(planning_doc && planning_doc.items);
        })
        .catch(() => normalize_fg_rows(planning_doc && planning_doc.items));
}

function get_active_boms_for_item(item_code) {
    return frappe.call({
        method: "frappe.client.get_list",
        args: {
            doctype: "BOM",
            filters: { item: item_code, is_active: 1, docstatus: 1 },
            fields: ["name", "is_default"], // Removed custom_width_inches as it might cause a 500 error if it doesn't exist
            order_by: "is_default desc, modified desc",
            limit_page_length: 50,
        },
    }).then((r) => {
        const rows = r.message || [];
        return rows.map((b) => {
            let label = b.name;
            if (b.is_default) label += " (Default)";
            return {
                name: b.name,
                label: label,
                is_default: b.is_default ? 1 : 0,
            };
        });
    });
}

function get_items_with_active_boms(items) {
    return Promise.all(
        (items || []).map((row) => {
            return get_active_boms_for_item(row.item_code)
                .then((boms) => {
                    row._active_boms = boms || [];
                    return row;
                })
                .catch((err) => {
                    console.error("Error fetching BOMs for", row.item_code, err);
                    row._active_boms = [];
                    return row;
                });
        })
    ).then((rows) => rows.filter((row) => row._active_boms && row._active_boms.length));
}

function format_bom_width_inches(width) {
    if (width == null || width === "") return "";
    return String(width) + '"';
}

function bom_width_for_no(boms, bom_no) {
    for (let i = 0; i < boms.length; i++) {
        if (boms[i].name === bom_no) {
            return format_bom_width_inches(boms[i].custom_width_inches);
        }
    }
    return "";
}

function open_bom_picker(fg_row) {
    Promise.resolve(fg_row._active_boms || null).then((cached_boms) => {
        if (cached_boms) return cached_boms;
        return get_active_boms_for_item(fg_row.item_code);
    }).then((boms) => {
        if (!boms.length) {
            frappe.msgprint(__("No active BOM for {0}", [fg_row.item_code]));
            return;
        }

        let default_bom = boms[0].name;
        boms.forEach((b) => {
            if (b.is_default) default_bom = b.name;
        });

        const d = new frappe.ui.Dialog({
            title: __("Select BOM"),
            fields: [
                {
                    fieldtype: "HTML",
                    fieldname: "info",
                    options:
                        "<p><b>" +
                        esc_html(fg_row.item_code) +
                        "</b><br>" +
                        esc_html(fg_row.item_name) +
                        "</p>",
                },
                {
                    fieldtype: "Select",
                    fieldname: "bom_no",
                    label: __("BOM"),
                    options: boms.map((b) => b.name).join(String.fromCharCode(10)),
                    default: default_bom,
                    reqd: 1,
                }
            ],
            primary_action_label: __("Confirm"),
            primary_action(values) {
                frappe.show_alert({
                    message: fg_row.item_code + " → BOM " + values.bom_no,
                    indicator: "green",
                });
                d.hide();
            },
        });
        d.show();
    });
}

function open_fg_bom_dialog(frm) {
    const so_name = get_sales_order_name(frm.doc);
    if (!so_name) {
        frappe.msgprint(
            __("Link a Sales Order on this Planning Sheet first (e.g. sales_order or custom_sales_order).")
        );
        return;
    }

    get_sales_order_fg_items(so_name, frm.doc).then((all_items) => {
        const supported_items = (all_items || []).filter((row) => item_is_supported_sheet_process(row));

        if (!supported_items.length) {
            frappe.msgprint({
                title: __("No items"),
                message:
                    __("No supported sheet process items found for Sales Order {0}.", [so_name]) +
                    "<br><br>" +
                    __(
                        "Supported processes are 251, 252, 253, 254, and 255 sheet items."
                    ),
                indicator: "orange",
            });
            return;
        }

        get_items_with_active_boms(supported_items).then((items) => {
            if (!items.length) {
                frappe.msgprint({
                    title: __("No Sheet BOMs"),
                    message:
                        __("No supported sheet process rows with submitted active BOMs were found.") +
                        "<br><br>" +
                        __("Supported processes are 251, 252, 253, 254, and 255 sheet items."),
                    indicator: "orange",
                });
                return;
            }

        let html =
            "<style>" +
            ".ps-fg-table th.ps-qty,.ps-fg-table td.ps-qty{white-space:nowrap;width:1%;min-width:5.5rem;}" +
            ".ps-fg-table th.ps-item,.ps-fg-table td.ps-item{white-space:nowrap;width:1%;}" +
            ".ps-fg-table th.ps-action,.ps-fg-table td.ps-action{white-space:nowrap;width:1%;}" +
            "</style>" +
            "<p class='text-muted'>Sales Order: <b>" +
            esc_html(so_name) +
            "</b></p>" +
            '<table class="table table-bordered table-sm ps-fg-table">' +
            "<thead><tr>" +
            '<th class="ps-item">Item</th><th>Name</th><th class="ps-qty">Qty</th><th class="ps-action"></th>' +
            "</tr></thead><tbody>";

        items.forEach((row, idx) => {
            const qty_uom =
                esc_html(String(row.qty)) + (row.uom ? " " + esc_html(row.uom) : "");
            html +=
                "<tr>" +
                '<td class="ps-item">' +
                esc_html(row.item_code) +
                "</td>" +
                "<td>" +
                esc_html(row.item_name) +
                "</td>" +
                '<td class="ps-qty">' +
                qty_uom +
                "</td>" +
                '<td class="ps-action"><button type="button" class="btn btn-xs btn-primary ps-bom-btn" data-idx="' +
                idx +
                '">' +
                __("Select BOM") +
                "</button></td>" +
                "</tr>";
        });
        html += "</tbody></table>";

        const dlg = new frappe.ui.Dialog({
            title: __("Sales Order — Finished goods"),
            size: "large",
            fields: [{ fieldtype: "HTML", fieldname: "tbl", options: html }],
            primary_action_label: __("Close"),
            primary_action() {
                dlg.hide();
            },
        });

        dlg.show();

        dlg.$wrapper.find(".ps-bom-btn").on("click", function () {
            const idx = parseInt($(this).attr("data-idx"), 10);
            open_bom_picker(items[idx]);
        });
        });
    });
}