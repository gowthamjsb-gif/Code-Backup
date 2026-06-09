["Quality Checking"].forEach((parentDoctype) => {
frappe.ui.form.on(parentDoctype, {
    refresh(frm) {
        add_load_gsm_button(frm);
        recalc_all_sections(frm);
    },
    validate(frm) {
        recalc_all_sections(frm);
    },
    quality(frm) {
        const sectionsField = get_sections_field(frm);
        (frm.doc[sectionsField] || []).forEach((row) => {
            if (!row.quality) {
                frappe.model.set_value(row.doctype, row.name, "quality", frm.doc.quality || "");
            }
        });
        recalc_all_sections(frm);
    }
});
});

["Quality Checking Section"].forEach((childDoctype) => {
frappe.ui.form.on(childDoctype, {
    representative_gsm(frm, cdt, cdn) {
        recalc_section_and_parent(frm, cdt, cdn);
    },
    quality(frm, cdt, cdn) {
        recalc_section_and_parent(frm, cdt, cdn);
    }
});
});

for (let i = 1; i <= 20; i++) {
    ["Quality Checking Section"].forEach((childDoctype) => {
        frappe.ui.form.on(childDoctype, {
            [`r1_s${i}`]: function (frm, cdt, cdn) {
                recalc_section_and_parent(frm, cdt, cdn);
            },
            [`r2_s${i}`]: function (frm, cdt, cdn) {
                recalc_section_and_parent(frm, cdt, cdn);
            }
        });
    });
}

function get_sections_field(frm) {
    if (frm.fields_dict && frm.fields_dict.sections) return "sections";
    return null;
}

function safe_set_value(frm, fieldname, value) {
    if (frm.fields_dict && frm.fields_dict[fieldname]) {
        frm.set_value(fieldname, value);
    }
}

function add_load_gsm_button(frm) {
    const sectionsField = get_sections_field(frm);
    if (!frm.doc.shaft_production_run || !sectionsField) return;

    frm.add_custom_button(__("Load Quality Sections"), () => {
        frappe.call({
            method: "quality_gsm_app.api.quality.get_unique_gsm_values",
            args: {
                shaft_production_run: frm.doc.shaft_production_run
            },
            callback: (r) => {
                const values = (r.message || []).map((v) => flt(v)).filter((v) => v > 0);
                if (!values.length) {
                    frappe.msgprint(__("No GSM values found in roll_production_results."));
                    return;
                }

                frm.clear_table(sectionsField);
                values.forEach((gsm) => {
                    const row = frm.add_child(sectionsField);
                    row.representative_gsm = gsm;
                    row.quality = frm.doc.quality || "";
                });

                frm.refresh_field(sectionsField);
                recalc_all_sections(frm);
                frappe.show_alert({ message: __("Quality sections loaded"), indicator: "green" });
            }
        });
    });
}

function recalc_section_and_parent(frm, cdt, cdn) {
    const sectionsField = get_sections_field(frm);
    const row = locals[cdt][cdn];
    if (!row || !sectionsField) return;
    recalc_one_section(frm, row);
    recalc_parent_summary(frm);
    frm.refresh_field(sectionsField);
}

function recalc_all_sections(frm) {
    const sectionsField = get_sections_field(frm);
    if (!sectionsField) return;
    (frm.doc[sectionsField] || []).forEach((row) => recalc_one_section(frm, row));
    recalc_parent_summary(frm);
    frm.refresh_field(sectionsField);
}

function get_threshold(qualityText) {
    const q = (qualityText || "").toString().toLowerCase();
    return q.includes("low") || q.includes("lower") ? 5 : 3;
}

function recalc_one_section(frm, row) {
    const sampleCount = 20;
    const setGsm = flt(row.representative_gsm);
    const quality = row.quality || frm.doc.quality || "";
    const threshold = get_threshold(quality);

    let r1Sum = 0;
    let r2Sum = 0;
    let combinedSum = 0;
    let passCount = 0;
    let failCount = 0;
    let anyFailed = false;

    for (let i = 1; i <= sampleCount; i++) {
        const v1 = flt(row[`r1_s${i}`]);
        const v2 = flt(row[`r2_s${i}`]);

        r1Sum += v1;
        r2Sum += v2;

        const avg = flt((v1 + v2) / 2, 3);
        row[`s${i}_combined_avg`] = avg;

        let diff = 0;
        if (setGsm > 0) {
            diff = flt(avg - setGsm, 3);
            const isPass = Math.abs(diff) < threshold;
            if (isPass) passCount += 1;
            else {
                failCount += 1;
                anyFailed = true;
            }
        }
        row[`s${i}_diff`] = diff;
        combinedSum += avg;
    }

    row.r1_average = flt(r1Sum / sampleCount, 3);
    row.r2_average = flt(r2Sum / sampleCount, 3);
    row.grand_average_gsm = flt(combinedSum / sampleCount, 3);

    row.tolerance_limit = threshold;
    row.pass_count = passCount;
    row.fail_count = failCount;
    row.section_result = setGsm > 0 ? (anyFailed ? "FAIL" : "PASS") : "";
}

function recalc_parent_summary(frm) {
    const sectionsField = get_sections_field(frm);
    if (!sectionsField) return;
    const rows = frm.doc[sectionsField] || [];
    let passSections = 0;
    let failSections = 0;

    rows.forEach((r) => {
        if (r.section_result === "PASS") passSections += 1;
        else if (r.section_result === "FAIL") failSections += 1;
    });

    safe_set_value(frm, "gsm_total_sections", rows.length);
    safe_set_value(frm, "gsm_pass_sections", passSections);
    safe_set_value(frm, "gsm_fail_sections", failSections);
    safe_set_value(frm, "gsm_overall_result", rows.length ? (failSections > 0 ? "FAIL" : "PASS") : "");
}

