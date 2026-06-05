// Client Script: Production GSM Auto-Calculate
// DocType: Shaft Production Run | Apply To: Form
// Child Table: Shaft Production Run Item
//
// Formula: production_gsm = (net_weight * 1000) / (width_inch * meter_roll * 0.0254)

frappe.ui.form.on('Shaft Production Run Item', {

    net_weight: function (frm, cdt, cdn) {
        calculate_production_gsm(frm, cdt, cdn);
    },

    width_inch: function (frm, cdt, cdn) {
        calculate_production_gsm(frm, cdt, cdn);
    },

    meter_roll: function (frm, cdt, cdn) {
        calculate_production_gsm(frm, cdt, cdn);
    }

});

function calculate_production_gsm(frm, cdt, cdn) {
    if (frm.doc.custom_unit === "Lamination Unit") {
        return; 
    }
    
    let row = frappe.get_doc(cdt, cdn);
    let nw = flt(row.net_weight);
    let wi = flt(row.width_inch);
    let mr = flt(row.meter_roll);

    if (nw > 0 && wi > 0 && mr > 0) {
        let pgsm = flt((nw * 1000) / (wi * mr * 0.0254), 2);
        frappe.model.set_value(cdt, cdn, 'custom_production_gsm', pgsm);
    }
}
