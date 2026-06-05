// Client Script: Square Feet Auto-Calculate for Shaft Production Run
// DocType: Shaft Production Run (and/or Shaft Production Run Item child table)
// Formula: custom_sqft = (pi * width_inch * custom_diameter) / 144
// This script will automatically update the "custom_cbm" field (representing Sq Ft) whenever width or diameter changes.

frappe.ui.form.on('Shaft Production Run', {
    // Handling changes in the main form (if fields are located there)
    width_inch: function(frm) {
        calculate_cbm(frm);
    },
    custom_diameter: function(frm) {
        calculate_cbm(frm);
    }
});

frappe.ui.form.on('Shaft Production Run Item', {
    // Handling changes in the child table (if fields are located there)
    width_inch: function(frm, cdt, cdn) {
        calculate_cbm(frm, cdt, cdn);
    },
    custom_diameter: function(frm, cdt, cdn) {
        calculate_cbm(frm, cdt, cdn);
    }
});

/**
 * Perform the CBM calculation.
 * @param {object} frm The main form object.
 * @param {string} [cdt] The child table name.
 * @param {string} [cdn] The child record name.
 */
function calculate_cbm(frm, cdt, cdn) {
    let doc = cdn ? locals[cdt][cdn] : frm.doc;
    
    // Ensure both inputs exist to avoid NaN results
    if (doc.width_inch && doc.custom_diameter) {
        let pi = Math.PI;
        let width = flt(doc.width_inch);
        let diameter = flt(doc.custom_diameter);
        
        // Square Feet Formula:
        // (pi * width_inch * diameter_inch) / 144
        let cbm = flt((pi * width * diameter) / 144, 4);
        
        if (cdn) {
            frappe.model.set_value(cdt, cdn, 'custom_cbm', cbm);
        } else {
            frm.set_value('custom_cbm', cbm);
        }
    } else if (doc.custom_cbm) {
        // Clear value if inputs are missing
        if (cdn) {
            frappe.model.set_value(cdt, cdn, 'custom_cbm', 0);
        } else {
            frm.set_value('custom_cbm', 0);
        }
    }
}
