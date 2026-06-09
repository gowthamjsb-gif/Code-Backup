["Planning sheet", "Planning Sheet"].forEach(function (doctype) {
    frappe.ui.form.on(doctype, {
        refresh: function (frm) {
            frm.add_custom_button(__('Calculate Meters'), function () {
                if (!frm.doc.items || !frm.doc.items.length) {
                    frappe.msgprint(__('No items found in the Planning Sheet.'));
                    return;
                }

                // Group data by custom_parent_child_trace_id
                let groups = {};
                frm.doc.items.forEach(row => {
                    let trace_id = row.parent_child_trace_id || row.custom_parent_child_trace_id || 'Unknown';
                    if (!groups[trace_id]) groups[trace_id] = [];
                    
                    let gsm = parseFloat(row.gsm) || parseFloat(row.custom_gsm) || 0;
                    let width = parseFloat(row.width_inch) || parseFloat(row.custom_width_inch) || parseFloat(row.width) || 0;
                    
                    if ((gsm === 0 || width === 0) && row.item_code) {
                        let parts = row.item_code.split('-');
                        for (let part of parts) {
                            if (gsm === 0 && part.toUpperCase().match(/^\d+M$/)) {
                                gsm = parseFloat(part);
                            } else if (width === 0 && part.toUpperCase().match(/^\d+MM$/)) {
                                let width_mm = parseFloat(part);
                                width = width_mm / 25.4;
                            }
                        }
                    }

                    groups[trace_id].push({
                        name: row.name, // To sync back later if needed
                        custom_parent_child_trace_id: trace_id,
                        custom_parent_fabric: row.custom_parent_fabric,
                        item_code: row.item_code,
                        meter: row.meter,
                        meter_per_roll: row.meter_per_roll,
                        no_of_rolls: row.no_of_rolls,
                        weight_per_roll: row.weight_per_roll,
                        gsm: gsm,
                        width: width
                    });
                });

                let group_keys = Object.keys(groups);
                if (group_keys.length === 0) {
                    frappe.msgprint(__('No valid items to calculate.'));
                    return;
                }

                let current_index = 0;

                let d = new frappe.ui.Dialog({
                    title: __('Calculate Meters'),
                    size: 'extra-large', // To fit all the columns properly
                    fields: [
                        {
                            fieldtype: 'HTML',
                            fieldname: 'group_indicator'
                        },
                        {
                            fieldname: 'meter_calculation_items',
                            fieldtype: 'Table',
                            label: __('Items'),
                            cannot_add_rows: true,
                            cannot_delete_rows: true,
                            in_place_edit: true,
                            data: [],
                            fields: [
                                {
                                    fieldtype: 'Data',
                                    fieldname: 'custom_parent_child_trace_id',
                                    label: __('Parent Child Trace ID'),
                                    in_list_view: 1,
                                    read_only: 1,
                                    columns: 2
                                },
                                {
                                    fieldtype: 'Data',
                                    fieldname: 'custom_parent_fabric',
                                    label: __('Parent Fabric'),
                                    in_list_view: 1,
                                    read_only: 1,
                                    columns: 1
                                },
                                {
                                    fieldtype: 'Data',
                                    fieldname: 'item_code',
                                    label: __('Item Code'),
                                    in_list_view: 1,
                                    read_only: 1,
                                    columns: 3
                                },
                                {
                                    fieldtype: 'Float',
                                    fieldname: 'meter',
                                    label: __('Total Length'),
                                    in_list_view: 1,
                                    columns: 1
                                },
                                {
                                    fieldtype: 'Float',
                                    fieldname: 'meter_per_roll',
                                    label: __('Lenght/Roll'),
                                    in_list_view: 1,
                                    columns: 1,
                                    onchange: function () {
                                        let items = d.fields_dict.meter_calculation_items.df.data || [];
                                        items.forEach(row => {
                                            row.meter = (row.meter_per_roll || 0) * (row.no_of_rolls || 0);
                                            row.weight_per_roll = ((row.gsm || 0) * (row.width || 0) * (row.meter_per_roll || 0) * 0.0254) / 1000;
                                        });
                                        d.fields_dict.meter_calculation_items.grid.refresh();
                                    }
                                },
                                {
                                    fieldtype: 'Int',
                                    fieldname: 'no_of_rolls',
                                    label: __('Rolls'),
                                    in_list_view: 1,
                                    columns: 1,
                                    onchange: function () {
                                        let items = d.fields_dict.meter_calculation_items.df.data || [];
                                        items.forEach(row => {
                                            row.meter = (row.meter_per_roll || 0) * (row.no_of_rolls || 0);
                                            row.weight_per_roll = ((row.gsm || 0) * (row.width || 0) * (row.meter_per_roll || 0) * 0.0254) / 1000;
                                        });
                                        d.fields_dict.meter_calculation_items.grid.refresh();
                                    }
                                },
                                {
                                    fieldtype: 'Float',
                                    fieldname: 'weight_per_roll',
                                    label: __('Weight/Roll'),
                                    in_list_view: 1,
                                    columns: 1
                                },
                                {
                                    fieldtype: 'Float',
                                    fieldname: 'gsm',
                                    hidden: 1
                                },
                                {
                                    fieldtype: 'Float',
                                    fieldname: 'width',
                                    hidden: 1
                                }
                            ]
                        }
                    ]
                });

                d.add_custom_button(__('Previous'), function() {
                    if (current_index > 0) {
                        current_index--;
                        load_view(current_index);
                    }
                });

                function load_view(index) {
                    let trace_id = group_keys[index];
                    let data = groups[trace_id];
                    
                    d.fields_dict.group_indicator.$wrapper.html(
                        '<h4 style="margin-bottom: 15px;">' + __('Parent Child Trace ID: ') + 
                        '<span class="text-primary">' + trace_id + '</span> ' +
                        '<small class="text-muted" style="float:right;">(' + (index + 1) + ' / ' + group_keys.length + ')</small></h4>'
                    );

                    d.fields_dict.meter_calculation_items.df.data = data;
                    d.fields_dict.meter_calculation_items.grid.refresh();
                    
                    let $btn_prev = d.$wrapper.find('button:contains("Previous")');
                    if (index === 0) {
                        $btn_prev.hide();
                    } else {
                        $btn_prev.show();
                    }

                    if (index === group_keys.length - 1) {
                        d.set_primary_action(__('Update & Finish'), function() {
                            apply_all_to_form();
                            d.hide();
                        });
                    } else {
                        d.set_primary_action(__('Next'), function() {
                            current_index++;
                            load_view(current_index);
                        });
                    }
                }

                function apply_all_to_form() {
                    group_keys.forEach(key => {
                        groups[key].forEach(d_row => {
                            let frm_row = frappe.get_doc(frm.doc.items[0].doctype, d_row.name);
                            if (frm_row) {
                                frappe.model.set_value(frm_row.doctype, frm_row.name, 'meter', d_row.meter);
                                frappe.model.set_value(frm_row.doctype, frm_row.name, 'meter_per_roll', d_row.meter_per_roll);
                                frappe.model.set_value(frm_row.doctype, frm_row.name, 'no_of_rolls', d_row.no_of_rolls);
                                frappe.model.set_value(frm_row.doctype, frm_row.name, 'weight_per_roll', d_row.weight_per_roll);
                            }

                            // Sync to planned_items table based on item_code and trace_id match
                            if (frm.doc.planned_items) {
                                let planned_rows = frm.doc.planned_items.filter(p_row => {
                                    let p_trace_id = p_row.parent_child_trace_id || p_row.custom_parent_child_trace_id || 'Unknown';
                                    return p_row.item_code === d_row.item_code && p_trace_id === d_row.custom_parent_child_trace_id;
                                });
                                planned_rows.forEach(planned_row => {
                                    frappe.model.set_value(planned_row.doctype, planned_row.name, 'meter', d_row.meter);
                                    frappe.model.set_value(planned_row.doctype, planned_row.name, 'meter_per_roll', d_row.meter_per_roll);
                                    frappe.model.set_value(planned_row.doctype, planned_row.name, 'no_of_rolls', d_row.no_of_rolls);
                                    frappe.model.set_value(planned_row.doctype, planned_row.name, 'weight_per_roll', d_row.weight_per_roll);
                                });
                            }
                        });
                    });
                    frm.refresh_field('items');
                    if (frm.doc.planned_items) {
                        frm.refresh_field('planned_items');
                    }
                    frappe.msgprint(__('Meters calculated successfully.'));
                }

                load_view(0);
                d.show();

            }).addClass('btn-primary');
        }
    });
});
