/**
 * Frappe Client Script — Sales Invoice
 * Customize → Client Script (DocType: Sales Invoice, Script Type: Client)
 *
 * Fixes print preview using "Standard" even when dropdown shows a custom format.
 * We patch PrintView.set_default_print_format so it always forces the mapped format
 * for Sales Invoice before the preview iframe renders.
 */

const EXPORT_COMPANIES = new Set([
    "Jayashree Spun Bond - 2ZS",
    "Thusma SMS Nonwoven Private Limited - 2ZZ",
]);

// Set your two Sales Invoice print formats here (only these 2 will be used).
const DOMESTIC_PRINT_FORMAT = "Sales Invoice - Fixed";
const EXPORT_PRINT_FORMAT = "Sales Invoice - Export";

frappe.ui.form.on("Sales Invoice", {
    setup(frm) {
        frm.set_query("print_format", function () {
            const format_name = get_sales_invoice_print_format(frm.doc.company);
            if (format_name) {
                return { filters: { name: format_name } };
            }
            return { filters: { name: ["is", "not set"] } };
        });

        schedule_sales_invoice_print_view_patch();
    },

    company(frm) {
        set_sales_invoice_print_format_by_company(frm);
    },

    refresh(frm) {
        set_sales_invoice_print_format_by_company(frm);
    },
});

function set_sales_invoice_print_format_by_company(frm) {
    if (!frm.fields_dict.print_format) {
        return;
    }
    const format_name = get_sales_invoice_print_format(frm.doc.company);
    if (format_name) {
        frm.set_value("print_format", format_name);
    }
}

function get_sales_invoice_print_format(company) {
    if (!company) return null;
    return EXPORT_COMPANIES.has(company) ? EXPORT_PRINT_FORMAT : DOMESTIC_PRINT_FORMAT;
}

function schedule_sales_invoice_print_view_patch() {
    if (frappe.ui.form.PrintView && frappe.ui.form.PrintView._sales_invoice_company_pf) {
        return;
    }
    if (window.__sales_invoice_pf_patch_scheduled) {
        return;
    }
    window.__sales_invoice_pf_patch_scheduled = true;

    let attempts = 0;
    const maxAttempts = 80;

    const tick = () => {
        attempts++;
        if (apply_sales_invoice_print_view_patch() || attempts >= maxAttempts) {
            return;
        }
        setTimeout(tick, 100);
    };

    if (frappe.ready) {
        frappe.ready(() => tick());
    } else {
        tick();
    }

    if (frappe.router && frappe.router.on) {
        frappe.router.on("change", () => {
            if (frappe.get_route()[0] === "print") {
                [0, 50, 200, 500].forEach((ms) =>
                    setTimeout(() => apply_sales_invoice_print_view_patch(), ms)
                );
            }
        });
    }
}

function apply_sales_invoice_print_view_patch() {
    const PV = frappe.ui.form.PrintView;
    if (!PV || PV._sales_invoice_company_pf) {
        return !!PV?._sales_invoice_company_pf;
    }

    const original = PV.prototype.set_default_print_format;

    PV.prototype.set_default_print_format = function () {
        const route = frappe.get_route();
        if (
            route[0] === "print" &&
            route[1] === "Sales Invoice" &&
            this.frm &&
            this.frm.doc
        ) {
            const mapped = get_sales_invoice_print_format(this.frm.doc.company);
            const formats = frappe.meta.get_print_formats(this.frm.doctype);
            if (mapped && formats.includes(mapped)) {
                this.print_format_selector.empty();
                this.print_format_selector.val(mapped);
                return;
            }
        }
        return original.apply(this, arguments);
    };

    PV._sales_invoice_company_pf = true;
    return true;
}

