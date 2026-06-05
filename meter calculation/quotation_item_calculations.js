const MPR_DATA = [
    { min: 10,  max: 15,  val_63: 1000, val_other: 4000 },
    { min: 16,  max: 22,  val_63: 1000, val_other: 3000 },
    { min: 25,  max: 34,  val_63: 750,  val_other: 2500 },
    { min: 35,  max: 35,  val_63: 1000, val_other: 2000 },
    { min: 36,  max: 45,  val_63: 500,  val_other: 1800 },
    { min: 46,  max: 55,  val_63: 500,  val_other: 1600 },
    { min: 56,  max: 60,  val_63: 400,  val_other: 1400 },
    { min: 61,  max: 65,  val_63: 400,  val_other: 1200 },
    { min: 66,  max: 70,  val_63: 350,  val_other: 1100 },
    { min: 71,  max: 80,  val_63: 300,  val_other: 1000 },
    { min: 81,  max: 90,  val_63: 300,  val_other: 950 },
    { min: 91,  max: 100, val_63: 250,  val_other: 850 },
    { min: 101, max: 110, val_63: 250,  val_other: 750 },
    { min: 111, max: 120, val_63: 200,  val_other: 750 }
];

let is_calculating = false;

frappe.ui.form.on('Quotation', {
    custom_process: function(frm) {
        if (frm.doc.items) {
            frm.doc.items.forEach(item => {
                run_fabric_logic(frm, item.doctype, item.name, 'lookup');
            });
        }
    }
});

frappe.ui.form.on('Quotation Item', {
    custom_gsm: function(frm, cdt, cdn) { run_fabric_logic(frm, cdt, cdn, 'lookup'); },
    custom_width_inch: function(frm, cdt, cdn) { run_fabric_logic(frm, cdt, cdn, 'lookup'); },
    custom_sheet_cut_length_mm: function(frm, cdt, cdn) {
        if (!is_calculating) run_fabric_logic(frm, cdt, cdn, 'lookup');
    },
    qty: function(frm, cdt, cdn) { 
        if (!is_calculating) run_fabric_logic(frm, cdt, cdn, 'lookup'); 
    },
    custom_meter: function(frm, cdt, cdn) {
        if (!is_calculating) run_fabric_logic(frm, cdt, cdn, 'meter');
    },
    custom_no_of_rolls: function(frm, cdt, cdn) {
        if (!is_calculating) run_fabric_logic(frm, cdt, cdn, 'rolls');
    },
    custom_meter_per_roll: function(frm, cdt, cdn) {
        if (!is_calculating) run_fabric_logic(frm, cdt, cdn, 'mpr');
    }
});

function run_fabric_logic(frm, cdt, cdn, mode) {
    let row = locals[cdt][cdn];
    if (!row) return;

    let custom_process = (frm.doc.custom_process || "").toLowerCase().trim();
    let is_bag_making = (custom_process === "bag making");

    if (is_bag_making) {
        is_calculating = true;

        let qty = flt(row.qty);
        let cut_length = flt(row.custom_sheet_cut_length_mm);
        let current_mpr = flt(row.custom_meter_per_roll);
        let current_rolls = flt(row.custom_no_of_rolls);

        let final_mpr = current_mpr;
        let final_rolls = current_rolls;
        
        // Target total meters calculated directly from exact quantity and cut length
        let target_total_meter = qty * (cut_length / 1000);

        if (mode === 'rolls') {
            final_rolls = Math.round(current_rolls);
            if (final_rolls <= 0) final_rolls = 1;
            final_mpr = Math.max(1000, Math.round(target_total_meter / final_rolls));
        } else if (mode === 'mpr') {
            final_mpr = Math.max(1000, Math.round(current_mpr));
            final_rolls = Math.round(target_total_meter / final_mpr);
            if (final_rolls <= 0) final_rolls = 1;
            final_mpr = Math.max(1000, Math.round(target_total_meter / final_rolls));
        } else {
            // mode is 'lookup', 'meter', or other triggers
            let standard_mpr = 0;
            let gsm = flt(row.custom_gsm);
            let width = flt(row.custom_width_inch);
            for (let range of MPR_DATA) {
                if (gsm >= range.min && gsm <= range.max) {
                    standard_mpr = (Math.floor(width) === 63) ? range.val_63 : range.val_other;
                    break;
                }
            }
            if (standard_mpr === 0) standard_mpr = 1000;
            
            final_rolls = Math.round(target_total_meter / standard_mpr);
            if (final_rolls <= 0) final_rolls = 1;
            final_mpr = Math.max(1000, Math.round(target_total_meter / final_rolls));
        }

        let total_meter = final_rolls * final_mpr;

        // Calculate Weight Per Roll
        let gsm = flt(row.custom_gsm);
        let width = flt(row.custom_width_inch);
        let weight_per_single_roll = 0;
        if (gsm && width && final_mpr) {
            weight_per_single_roll = (gsm * width * final_mpr * 0.0254) / 1000;
        }

        // Update Row Fields safely - only if they actually changed
        let rounded_mpr = Math.round(final_mpr);
        let rounded_total_meter = Math.round(total_meter);
        
        if (Math.round(flt(row.custom_meter_per_roll)) !== rounded_mpr) {
            frappe.model.set_value(cdt, cdn, "custom_meter_per_roll", rounded_mpr);
        }
        let target_weight = flt(weight_per_single_roll, 3);
        if (flt(row.custom_weight_per_roll) !== target_weight) {
            frappe.model.set_value(cdt, cdn, "custom_weight_per_roll", target_weight);
        }
        if (flt(row.custom_no_of_rolls) !== final_rolls) {
            frappe.model.set_value(cdt, cdn, "custom_no_of_rolls", final_rolls);
        }
        if (Math.round(flt(row.custom_meter)) !== rounded_total_meter) {
            frappe.model.set_value(cdt, cdn, "custom_meter", rounded_total_meter);
        }
        // Do not update or adjust qty - keep it exactly as given by the user

        // Reset flag with delay to prevent trigger loops
        setTimeout(() => { is_calculating = false; }, 500);
        return;
    } else {
        if (!row.custom_gsm || !row.custom_width_inch) return;

        is_calculating = true;

        let gsm = flt(row.custom_gsm);
        let width = flt(row.custom_width_inch);
        let current_mpr = flt(row.custom_meter_per_roll);
        let current_meter = flt(row.custom_meter);
        let target_qty = flt(row.qty);
        let current_rolls = flt(row.custom_no_of_rolls);
        
        // Step 1: Handle MPR (Either lookup from chart or use manual input)
        let final_mpr = current_mpr;
        if (mode === 'lookup' || final_mpr === 0) {
            for (let range of MPR_DATA) {
                if (gsm >= range.min && gsm <= range.max) {
                    final_mpr = (Math.floor(width) === 63) ? range.val_63 : range.val_other;
                    break;
                }
            }
        }

        if (final_mpr > 0) {
            // Step 2: Calculate Weight Per Roll (Single Roll Weight)
            let weight_per_single_roll = (gsm * width * final_mpr * 0.0254) / 1000;

            // Step 3: Determine Number of Rolls
            let final_rolls = current_rolls;
            if (mode === 'lookup' || mode === 'qty') {
                // Calculate rolls needed to meet the target Quantity
                final_rolls = Math.round(target_qty / weight_per_single_roll);
            } else if (mode === 'meter') {
                // Calculate rolls based on the target Meters
                final_rolls = Math.round(current_meter / final_mpr);
            } else {
                // Manual adjustment: keep rolls as whole number
                final_rolls = Math.round(current_rolls);
            }

            // Step 4: Final Calculations for Meter and Total Qty
            let total_meter = final_rolls * final_mpr;
            
            // Recalculate total quantity based on rounded rolls and round to whole number
            let final_total_qty = Math.round(final_rolls * weight_per_single_roll);

            // Step 5: Update Row Fields safely
            frappe.model.set_value(cdt, cdn, "custom_meter_per_roll", final_mpr);
            frappe.model.set_value(cdt, cdn, "custom_weight_per_roll", flt(weight_per_single_roll, 3));
            frappe.model.set_value(cdt, cdn, "custom_no_of_rolls", final_rolls);
            frappe.model.set_value(cdt, cdn, "custom_meter", flt(total_meter, 2));
            frappe.model.set_value(cdt, cdn, "qty", final_total_qty);
        }

        // Reset flag with delay to prevent trigger loops
        setTimeout(() => { is_calculating = false; }, 500);
    }
}
