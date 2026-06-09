frappe.ui.form.on("Shaft Production Run", {
    refresh(frm) {
        // Avoid duplicating button on every refresh.
        const hasBtn = (frm.custom_buttons || []).some(b => (b.label || "").toLowerCase().includes("start gsm testing"));
        if (hasBtn) return;

        frm.add_custom_button(
            __("Start GSM Testing"),
            () => {
                frappe.call({
                    method: "quality_gsm_app.api.quality.create_quality_checking_from_shaft",
                    args: { shaft_production_run: frm.doc.name },
                    freeze: true,
                    callback: (r) => {
                        const name = r.message;
                        if (!name) {
                            frappe.msgprint(__("Could not create Quality Checking doc."));
                            return;
                        }
                        frappe.set_route("Form", "Quality Checking", name);
                    }
                });
            },
            __("Quality")
        );
    }
});

