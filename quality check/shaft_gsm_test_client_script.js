frappe.ui.form.on('Shaft GSM Test', {
    refresh: function(frm) {
        // Manual recalc button for quick operator validation.
        frm.add_custom_button(__('Calculate Result'), function() {
            calculate_all(frm);
        });
    },
    representative_gsm: function(frm) {
        calculate_all(frm);
    },
    validate: function(frm) {
        calculate_all(frm);
    }
});

// Create triggers for all sample input fields (r1_s1 to r1_s20 and r2_s1 to r2_s20).
for (let i = 1; i <= 20; i++) {
    frappe.ui.form.on('Shaft GSM Test', {
        [`r1_s${i}`]: function(frm) {
            calculate_all(frm);
        },
        [`r2_s${i}`]: function(frm) {
            calculate_all(frm);
        }
    });
}

function get_quality_threshold(frm) {
    // Supports flexible text values such as "Higher", "High", "Lower", "Low".
    // Fallback is strict threshold (3 GSM) if no explicit lower value is provided.
    const quality_hint = (
        frm.doc.quality ||
        frm.doc.quality_level ||
        frm.doc.quality_type ||
        frm.doc.fabric_quality ||
        ''
    ).toString().toLowerCase();

    if (quality_hint.includes('lower') || quality_hint.includes('low')) {
        return 5;
    }
    return 3;
}

function calculate_all(frm) {
    const sample_count = 20;
    let r1_sum = 0;
    let r2_sum = 0;
    let combined_avg_sum = 0;
    let pass_count = 0;
    let fail_count = 0;
    let set_gsm = flt(frm.doc.representative_gsm);
    let threshold = get_quality_threshold(frm);
    let all_passed = true;

    for (let i = 1; i <= sample_count; i++) {
        let val1 = flt(frm.doc[`r1_s${i}`]);
        let val2 = flt(frm.doc[`r2_s${i}`]);

        r1_sum += val1;
        r2_sum += val2;

        // Calculate Average of the two rolls for this sample index (Portrait Average)
        let sample_avg = (val1 + val2) / 2;
        frm.doc[`s${i}_combined_avg`] = flt(sample_avg, 3);

        // Calculate Difference (Sample Average - Set GSM)
        if (set_gsm > 0) {
            const diff = flt(sample_avg - set_gsm, 3);
            const abs_diff = Math.abs(diff);
            const is_pass = abs_diff < threshold;

            frm.doc[`s${i}_diff`] = diff;
            if (frm.doc.hasOwnProperty(`s${i}_result`)) {
                frm.doc[`s${i}_result`] = is_pass ? 'PASS' : 'FAIL';
            }

            if (is_pass) {
                pass_count += 1;
            } else {
                fail_count += 1;
                all_passed = false;
            }
        } else {
            frm.doc[`s${i}_diff`] = 0;
            if (frm.doc.hasOwnProperty(`s${i}_result`)) {
                frm.doc[`s${i}_result`] = '';
            }
        }

        combined_avg_sum += sample_avg;
    }

    // Roll 1 Average (Landscape Average)
    frm.doc.r1_average = flt(r1_sum / sample_count, 3);
    
    // Roll 2 Average (Landscape Average)
    frm.doc.r2_average = flt(r2_sum / sample_count, 3);

    // Grand Average
    frm.doc.grand_average_gsm = flt(combined_avg_sum / sample_count, 3);

    if (frm.doc.hasOwnProperty('gsm_tolerance_limit')) {
        frm.doc.gsm_tolerance_limit = threshold;
    }
    if (frm.doc.hasOwnProperty('gsm_pass_count')) {
        frm.doc.gsm_pass_count = pass_count;
    }
    if (frm.doc.hasOwnProperty('gsm_fail_count')) {
        frm.doc.gsm_fail_count = fail_count;
    }
    if (frm.doc.hasOwnProperty('gsm_final_result')) {
        frm.doc.gsm_final_result = set_gsm > 0 ? (all_passed ? 'PASS' : 'FAIL') : '';
    }

    frm.refresh_fields([
        'r1_average', 'r2_average', 'grand_average_gsm',
        ...Array.from({length: sample_count}, (_, i) => `s${i+1}_combined_avg`),
        ...Array.from({length: sample_count}, (_, i) => `s${i+1}_diff`),
        ...Array.from({length: sample_count}, (_, i) => `s${i+1}_result`),
        'gsm_tolerance_limit', 'gsm_pass_count', 'gsm_fail_count', 'gsm_final_result'
    ]);
}
