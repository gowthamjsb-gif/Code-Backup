// Client Script 2: Auto-Calculate Item Name (with Special Quality Aliases)
// DocType: Quotation
// Apply On: Quotation Item

// Special Quality Alias Map (must match server script)
const SPECIAL_QUALITY_ALIAS = {
    "ABHISHEK INDUSTRIES - ECO SPECIAL": "ABI 1",
    "MN ECO - BRONZE": "MCB 1",
    "HARINI BAGS - GOLD": "HRB 1",
    "MANJUNATHA - ECO GREEN": "MNE 1",
    "MANJUNATHA - DELUXE": "MNE 2",
    "MAGILAN - PLATINUM": "MAG 1",
    "PAYAL - UV": "PST 1",
    "AZKARA - GOLD": "AZK 1",
    "AZKARA - SILVER": "AZK 2",
    "AZKARA - ECO GREEN": "AZK 3",
    "AZKARA - SUPER ECO": "AZK 4",
    "AZKARA - DELUXE": "AZK 5",
    "AZKARA - PLATINUM": "AZK 6",
    "AZKARA - ULTRA": "AZK 7",
    "REMEX - SILVER": "REMEX 1",
    "REMEX - SUPER BRONZE": "REMEX 2",
    "ESWARI TEX - GOLD": "ESW 1",
    "ESWARI TEX - ULTRA": "ESW 2",
    "ESWARI TEX - DELUXE": "ESW 3",
};

frappe.ui.form.on('Quotation Item', {
    custom_width_inch: function (frm, cdt, cdn) { calculate_item(frm, cdt, cdn); },
    custom_quality: function (frm, cdt, cdn) { calculate_item(frm, cdt, cdn); },
    custom_color: function (frm, cdt, cdn) { calculate_item(frm, cdt, cdn); },
    custom_gsm: function (frm, cdt, cdn) { calculate_item(frm, cdt, cdn); }
});

function calculate_item(frm, cdt, cdn) {
    var row = locals[cdt][cdn];

    if (row.custom_quality && row.custom_color && row.custom_gsm && row.custom_width_inch) {

        var quality = row.custom_quality.toUpperCase();
        var color = row.custom_color.toUpperCase();
        var width_inch = flt(row.custom_width_inch);

        // Check if this is a special quality → use alias for display
        var display_quality = SPECIAL_QUALITY_ALIAS[quality] || quality;

        var exact_mm = width_inch * 25.4;
        var rounded_mm = Math.round(exact_mm / 5) * 5;

        var name = "NON WOVEN FABRIC " + display_quality + " " + color + " " + row.custom_gsm + " GSM W - " + width_inch + "'' ( " + rounded_mm + " MM )";

        frappe.model.set_value(cdt, cdn, 'description', "✅ GENERATED: " + name);
        frappe.model.set_value(cdt, cdn, 'item_name', name);

        frappe.msgprint("Calculated: " + name);
    }
}