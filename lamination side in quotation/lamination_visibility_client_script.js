frappe.ui.form.on('Quotation', {
    refresh: function(frm) {
        handle_lamination_visibility(frm);
        handle_lamination_side_logic(frm);
    },
    custom_process: function(frm) {
        handle_lamination_visibility(frm);
    },
    custom_lamination_side: function(frm) {
        handle_lamination_side_logic(frm);
    }
});

frappe.ui.form.on('Quotation Item', {
    // This handles the 'Edit' popup dialog for each row
    form_render: function(frm, cdt, cdn) {
        let is_lamination = frm.doc.custom_process === 'Lamination';
        let grid = frm.fields_dict['items'].grid;

        // Toggle fields within the child table row popup
        grid.get_field('custom_lamination_gsm').toggle(is_lamination);
        grid.get_field('custom_fabric_gsm').toggle(is_lamination);
        
        // Added: Toggle lamination side if it exists in the child table row
        if (grid.get_field('custom_lamination_side')) {
            grid.get_field('custom_lamination_side').toggle(is_lamination);
        }
    },
    items_add: function(frm, cdt, cdn) {
        if (frm.doc.custom_lamination_side === 'Plain Lamination') {
            frappe.model.set_value(cdt, cdn, 'custom_process', 'NON WOVEN LAMINATED FABRIC');
        } else if (frm.doc.custom_lamination_side === 'BOPP Lamination') {
            frappe.model.set_value(cdt, cdn, 'custom_process', 'NON WOVEN BOPP LAMINATED FABRIC');
        }
    },
    custom_fabric_gsm: function(frm, cdt, cdn) {
        calculate_total_gsm(frm, cdt, cdn);
    },
    custom_lamination_gsm: function(frm, cdt, cdn) {
        calculate_total_gsm(frm, cdt, cdn);
    }
});

function calculate_total_gsm(frm, cdt, cdn) {
    let row = locals[cdt][cdn];
    
    let fabric_gsm = parseInt(row.custom_fabric_gsm) || 0;
    
    let lam_val = row.custom_lamination_gsm || "";
    let lam_gsm = 0;
    
    if (lam_val.includes("-")) {
        lam_gsm = parseInt(lam_val.split("-")[0].trim()) || 0;
    } else {
        lam_gsm = parseInt(lam_val) || 0;
    }
    
    let total_gsm = fabric_gsm + lam_gsm;
    
    if (total_gsm > 0 && row.custom_gsm !== total_gsm) {
        frappe.model.set_value(cdt, cdn, 'custom_gsm', total_gsm);
    }
}

function handle_lamination_side_logic(frm) {
    let grid = frm.fields_dict['items'].grid;
    let lamination_side = frm.doc.custom_lamination_side;
    
    if (lamination_side === 'Plain Lamination') {
        // 1. Restrict options to Inner Lamination & Outer Lamination
        if (grid.get_field('custom_lamination_side')) {
            grid.update_docfield_property('custom_lamination_side', 'options', ['Inner Lamination', 'Outer Lamination']);
        }
        
        // 2. Fetch custom_process as "NON WOVEN LAMINATED FABRIC"
        (frm.doc.items || []).forEach(row => {
            if (row.custom_process !== 'NON WOVEN LAMINATED FABRIC') {
                frappe.model.set_value(row.doctype, row.name, 'custom_process', 'NON WOVEN LAMINATED FABRIC');
            }
        });
    } else if (lamination_side === 'BOPP Lamination') {
        // 1. Restrict options to Single Side Lamination & Double Side Lamination
        if (grid.get_field('custom_lamination_side')) {
            grid.update_docfield_property('custom_lamination_side', 'options', ['Single Side Lamination', 'Double Side Lamination']);
        }
        
        // 2. Fetch custom_process as "NON WOVEN BOPP LAMINATED FABRIC"
        (frm.doc.items || []).forEach(row => {
            if (row.custom_process !== 'NON WOVEN BOPP LAMINATED FABRIC') {
                frappe.model.set_value(row.doctype, row.name, 'custom_process', 'NON WOVEN BOPP LAMINATED FABRIC');
            }
        });
    } else {
        // Reset to default options
        if (grid.get_field('custom_lamination_side')) {
            let df = frappe.meta.get_docfield('Quotation Item', 'custom_lamination_side');
            if (df && df.options) {
                grid.update_docfield_property('custom_lamination_side', 'options', df.options);
            }
        }
    }
}

function handle_lamination_visibility(frm) {
    let is_lamination = frm.doc.custom_process === 'Lamination';

    // 1. Toggle the Parent field
    frm.toggle_display('custom_lamination_side', is_lamination);

    // 2. Toggle the Child Table Grid Columns (the list view)
    let grid = frm.fields_dict['items'].grid;
    
    grid.set_column_disp('custom_lamination_gsm', is_lamination);
    grid.set_column_disp('custom_fabric_gsm', is_lamination);
    
    // Added: Toggle the column for lamination side in the grid view
    grid.set_column_disp('custom_lamination_side', is_lamination);
    
    // Refresh the grid to apply changes
    grid.refresh();
}
