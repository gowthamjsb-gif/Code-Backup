/**
 * Frappe Client Script — Quotation
 * Customize → Client Script (DocType: Quotation, Script Type: Client)
 *
 * Root cause of "default template" while dropdown looks correct:
 * Frappe's PrintView.set_default_print_format() returns early when the sidebar
 * Link already has ANY valid print format name (often "Standard"). In that case
 * it never applies meta.default_print_format — so the iframe preview uses Standard.
 *
 * Fix: patch PrintView once so Quotation always sets the format from COMPANY_PRINT_FORMAT
 * before preview runs. PrintView loads lazily; we retry until the class exists.
 */

const EXPORT_COMPANIES = new Set([
    "Jayashree Spun Bond - 2ZS",
    "Thusma SMS Nonwoven Private Limited - 2ZZ",
]);

const DOMESTIC_PRINT_FORMAT = "Final Quotation Template";
const EXPORT_PRINT_FORMAT = "Quotation - Export";

frappe.ui.form.on("Quotation", {
    setup(frm) {
        frm.set_query("print_format", function () {
            const format_name = get_quotation_print_format(frm.doc.company);
            if (format_name) {
                return { filters: { name: format_name } };
            }
            return { filters: { name: ["is", "not set"] } };
        });

        schedule_quotation_print_view_patch();
    },

    company(frm) {
        set_print_format_by_company(frm);
    },

    refresh(frm) {
        set_print_format_by_company(frm);
    },
});

function set_print_format_by_company(frm) {
    if (!frm.fields_dict.print_format) {
        return;
    }
    const format_name = get_quotation_print_format(frm.doc.company);
    if (format_name) {
        frm.set_value("print_format", format_name);
    }
}

function get_quotation_print_format(company) {
    if (!company) return null;
    return EXPORT_COMPANIES.has(company) ? EXPORT_PRINT_FORMAT : DOMESTIC_PRINT_FORMAT;
}

/** Patch PrintView after its JS bundle has loaded (lazy). */
function schedule_quotation_print_view_patch() {
    if (frappe.ui.form.PrintView && frappe.ui.form.PrintView._quotation_company_pf) {
        return;
    }
    if (window.__quotation_pf_patch_scheduled) {
        return;
    }
    window.__quotation_pf_patch_scheduled = true;

    let attempts = 0;
    const maxAttempts = 80;

    const tick = () => {
        attempts++;
        if (apply_quotation_print_view_patch() || attempts >= maxAttempts) {
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
                    setTimeout(() => apply_quotation_print_view_patch(), ms)
                );
            }
        });
    }
}

function apply_quotation_print_view_patch() {
    const PV = frappe.ui.form.PrintView;
    if (!PV || PV._quotation_company_pf) {
        return !!PV?._quotation_company_pf;
    }

    const original = PV.prototype.set_default_print_format;

    PV.prototype.set_default_print_format = function () {
        const route = frappe.get_route();
        if (
            route[0] === "print" &&
            route[1] === "Quotation" &&
            this.frm &&
            this.frm.doc
        ) {
            const mapped = get_quotation_print_format(this.frm.doc.company);
            const formats = frappe.meta.get_print_formats(this.frm.doctype);
            if (mapped && formats.includes(mapped)) {
                this.print_format_selector.empty();
                this.print_format_selector.val(mapped);
                return;
            }
        }
        return original.apply(this, arguments);
    };

    PV._quotation_company_pf = true;
    return true;
}

