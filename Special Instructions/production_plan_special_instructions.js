frappe.ui.form.on('Production Plan', {
    refresh: function (frm) {
        // Ensure the field is editable
        frm.set_df_property('custom_special_instructions', 'read_only', 0);
        calculate_special_instructions(frm);
    },
    custom_unit: function (frm) {
        calculate_special_instructions(frm);
    },
    customer: function (frm) {
        calculate_special_instructions(frm);
    },
    custom_party_code: function (frm) {
        calculate_special_instructions(frm);
    },
    po_items: function (frm) {
        calculate_special_instructions(frm);
    },
    custom_lamination_side: function (frm) {
        calculate_special_instructions(frm);
    }
});

frappe.ui.form.on('Production Plan Item', {
    custom_gsm: function (frm, cdt, cdn) {
        calculate_special_instructions(frm);
    },
    custom_meterperroll: function (frm, cdt, cdn) {
        calculate_special_instructions(frm);
    },
    custom_lamination_side: function (frm, cdt, cdn) {
        calculate_special_instructions(frm);
    }
});

function calculate_special_instructions(frm) {
    // Only auto-calculate if the field is empty or if we are cleaning up
    if (frm.doc.custom_special_instructions && frm.doc.custom_special_instructions.trim() !== "") {
        console.log("Special instructions already present, skipping auto-calculation.");
        return;
    }

    var current_unit = String(frm.doc.custom_unit || '').trim().toUpperCase();

    if (!current_unit) {
        frm.set_value('custom_special_instructions', '');
        return;
    }

    var customer_name = frm.doc.customer || frm.doc.custom_party_code;
    console.log("Customer mapped for special instructions check:", customer_name);

    if (customer_name) {
        frappe.db.get_value('Customer', customer_name, 'custom_is_rice_bag_manufacturer', function (r) {
            var is_rice_bag = 0;
            if (r && r.custom_is_rice_bag_manufacturer) {
                is_rice_bag = 1;
            }
            apply_calculations(frm, is_rice_bag, current_unit);
        });
    } else {
        apply_calculations(frm, 0, current_unit);
    }
}

function get_exp_0071_label_colour(gsm) {
    var g = Math.round(parseFloat(gsm) || 0);
    if (g === 15) return 'Light Blue';
    if (g === 20) return 'Purple';
    if (g === 23 || g === 25 || g === 26) return 'White';
    if (g === 30) return 'Yellow';
    if (g === 40) return 'Orange';
    if (g === 50) return 'Pink';
    if (g === 70) return 'Green';
    if (g === 80) return 'White';
    if (g === 100) return 'Red';
    if (g === 150) return 'White';
    return null;
}

function is_exp_0071_customer(frm) {
    function matches_exp_0071(v) {
        return String(v || '').trim().toUpperCase() === 'EXP-0071';
    }
    return matches_exp_0071(frm.doc.custom_party_code) || matches_exp_0071(frm.doc.customer);
}

function apply_calculations(frm, is_rice_bag, current_unit) {
    var instructions = [];
    var valid_units_for_reduction = ['UNIT 1', 'UNIT 3'];
    var is_valid_unit_for_reduction = valid_units_for_reduction.indexOf(current_unit) !== -1;
    var exp0071 = is_exp_0071_customer(frm);

    console.log(`Applying calculations. Rice Bag Manufacturer: ${is_rice_bag}, Unit: ${current_unit}`);

    // --- LAMINATION UNIT SPECIAL INSTRUCTIONS ---
    var lamination_side_doc = String(frm.doc.custom_lamination_side || '').trim().toLowerCase();
    if (current_unit === 'LAMINATION UNIT' && (lamination_side_doc === 'single side lamination' || lamination_side_doc === 'double side lamination')) {
        var width_instr = "WIDTH SHOULD BE MENTIONED IN MM";
        var bopp_instr = "IF BOPP WHITE COATED DON'T PUT WHITE MASTERBATCH";

        if (instructions.indexOf(width_instr) === -1) {
            instructions.push(width_instr);
        }
        if (instructions.indexOf(bopp_instr) === -1) {
            instructions.push(bopp_instr);
        }
    }

    // Iterate through Assembly Items to calculate values
    if (frm.doc.po_items && frm.doc.po_items.length > 0) {
        frm.doc.po_items.forEach(function (item, index) {
            var gsm = parseFloat(item.custom_gsm) || 0;
            var meter = parseFloat(item.custom_meterperroll) || 0;
            var quality = String(item.custom_quality || '').trim().toUpperCase();
            var lamination_side = String(item.custom_lamination_side || lamination_side_doc).trim().toLowerCase();

            console.log(`Assembly Item [${index}]: custom_gsm=${item.custom_gsm} (parsed: ${gsm}), custom_meterperroll=${item.custom_meterperroll} (parsed: ${meter}), quality=${quality}, lamination_side=${lamination_side}`);

            // --- FIRST SPECIAL INSTRUCTION (Unit 1 & 3 only) ---
            if (is_valid_unit_for_reduction && gsm > 0 && meter > 0) {
                var calc_gsm = 0;
                var calc_mtrs = 0;

                if (is_rice_bag) {
                    // Rice Bag Manufacturer case
                    calc_gsm = gsm - 2;
                } else if (gsm > 90) {
                    // Default > 90
                    calc_gsm = gsm - 1.5;
                } else {
                    // Default <= 90
                    calc_gsm = gsm - 1;
                }

                if (calc_gsm > 0) {
                    // Formula: Original GSM * Original Meter / Calculated GSM
                    calc_mtrs = Math.round((gsm * meter) / calc_gsm);

                    // Format: 80 GSM / 350 MTRS - FOR PRODUCTION - 79 GSM / 354 MTRS
                    var instr_string = gsm + " GSM / " + meter + " MTRS - FOR PRODUCTION - " + calc_gsm + " GSM / " + calc_mtrs + " MTRS";

                    // Add to list if not already present (unique instructions)
                    if (instructions.indexOf(instr_string) === -1) {
                        instructions.push(instr_string);
                    }
                }
            }

            // --- SECOND SPECIAL INSTRUCTION (Ultra & Deluxe, all units) ---
            if (gsm > 0 && (quality === 'ULTRA' || quality === 'DELUXE')) {
                var actual_plus_5 = gsm + 5;
                // Format: FOR PRODUCTION "ACTUAL + 5" GSM - IN STICKER MENTION "ACTUAL" GSM
                var extra_gsm_instr = "FOR PRODUCTION \"" + actual_plus_5 + "\" GSM - IN STICKER MENTION \"" + gsm + "\" GSM";

                if (instructions.indexOf(extra_gsm_instr) === -1) {
                    instructions.push(extra_gsm_instr);
                }
            }

            // --- EXP-0071: Label colour by GSM (one line per distinct GSM on the plan) ---
            if (exp0071 && gsm > 0) {
                var label_colour = get_exp_0071_label_colour(gsm);
                if (label_colour !== null) {
                    var gsm_key = Math.round(parseFloat(gsm) || 0);
                    var label_instr = 'Label Colour : GSM "' + gsm_key + 'gsm" - "' + label_colour + '"';
                    if (instructions.indexOf(label_instr) === -1) {
                        instructions.push(label_instr);
                    }
                }
            }
        });
    }

    console.log("Generated special instructions list:", instructions);

    if (instructions.length > 0) {
        var final_instruction = instructions.join('\n');
        frm.set_value('custom_special_instructions', final_instruction);
    } else {
        frm.set_value('custom_special_instructions', '');
    }
}
