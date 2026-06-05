frappe.ui.form.on('Production Plan', {
    refresh: function (frm) {
        let has_fabric = frm.doc.custom_fabric_type;
        let has_label = frm.doc.custom_label;
        let has_packing = frm.doc.custom_packing;

        // If ALL three are empty, fetch the spec from the backend as usual
        if (frm.doc.customer && !has_fabric && !has_label && !has_packing) {
            fetch_customer_spec(frm);
        } else {
            // If Fabric/Label are already filled but PACKING is still empty, fill it from Quality immediately!
            let quality = frm.doc.custom_quality;
            if (!has_packing && quality) {
                let fallback_packing = get_fallback_packing(quality);
                if (fallback_packing) {
                    safe_set_value(frm, 'custom_packing', fallback_packing);
                }
            }
        }
    },

    customer: function (frm) {
        if (frm.doc.customer) {
            fetch_customer_spec(frm);
        } else {
            let fields_to_clear = ['custom_fabric_type', 'custom_label', 'custom_packing'];
            fields_to_clear.forEach(field => {
                if (frm.fields_dict[field]) {
                    frm.set_value(field, '');
                }
            });
        }
    },

    // Actively watch the Quality field in case the user changes it manually
    custom_quality: function (frm) { fallback_on_quality_change(frm); }
});

function fallback_on_quality_change(frm) {
    let has_packing = frm.doc.custom_packing;
    let quality = frm.doc.custom_quality;
    if (!has_packing && quality) {
        let fallback_packing = get_fallback_packing(quality);
        if (fallback_packing) {
            safe_set_value(frm, 'custom_packing', fallback_packing);
        }
    }
}

function fetch_customer_spec(frm) {
    frappe.call({
        method: 'frappe.client.get_list',
        args: {
            doctype: 'Customer Product Spec',
            filters: {
                customer: frm.doc.customer
            },
            fields: ['name', 'fabric_type', 'label', 'packing'],
            limit_page_length: 0
        },
        callback: function (r) {
            if (!r.message || r.message.length === 0) {
                frappe.show_alert({
                    message: __('No Product Spec found for {0}', [frm.doc.customer]),
                    indicator: 'orange'
                }, 5);

                // Fallback: If no spec exists, but we have quality, at least fill packing
                let has_packing = frm.doc.custom_packing;
                let quality = frm.doc.custom_quality;
                if (!has_packing && quality) {
                    let fallback = get_fallback_packing(quality);
                    if (fallback) {
                        frm.set_value('custom_packing', fallback);
                    }
                }
                return;
            }

            if (r.message.length === 1) {
                // Only one spec — auto-fill directly
                apply_spec(frm, r.message[0]);
            } else {
                // Multiple specs — show popup to choose
                show_spec_selector(frm, r.message);
            }
        }
    });
}

function show_spec_selector(frm, specs) {
    let options = specs.map(function (s) {
        return s.fabric_type;
    });

    let d = new frappe.ui.Dialog({
        title: __('Select Fabric Type for {0}', [frm.doc.customer]),
        fields: [
            {
                label: 'Fabric Type',
                fieldname: 'fabric_type',
                fieldtype: 'Select',
                options: options.join('\n'),
                reqd: 1
            },
            {
                fieldtype: 'HTML',
                fieldname: 'spec_preview',
                options: '<div id="spec-preview" style="margin-top:10px; padding:10px; background:#f5f5f5; border-radius:5px; display:none;"><b>Label:</b> <span id="preview-label"></span><br><b>Packing:</b> <span id="preview-packing"></span></div>'
            }
        ],
        primary_action_label: __('Apply'),
        primary_action: function (values) {
            let selected = specs.find(function (s) {
                return s.fabric_type === values.fabric_type;
            });
            if (selected) {
                apply_spec(frm, selected);
            }
            d.hide();
        }
    });

    // Show preview when user changes selection
    d.fields_dict.fabric_type.$input.on('change', function () {
        let val = d.get_value('fabric_type');
        let match = specs.find(function (s) {
            return s.fabric_type === val;
        });
        if (match) {
            let true_label = match.label;
            let true_packing = match.packing;

            // Preview Fallback Logic
            let quality = frm.doc.custom_quality;
            if (!true_packing && quality) {
                true_packing = get_fallback_packing(quality) + ' (Auto-fetched by Quality)';
            }

            d.$wrapper.find('#spec-preview').show();
            d.$wrapper.find('#preview-label').text(true_label || '-');
            d.$wrapper.find('#preview-packing').text(true_packing || '-');
        }
    });

    d.show();

    // Trigger preview for first option
    d.fields_dict.fabric_type.$input.trigger('change');
}

function apply_spec(frm, spec) {
    let true_label = spec.label;
    let true_packing = spec.packing;
    
    let quality = frm.doc.custom_quality;

    // If spec doesn't have a packing type defined, use the fallback based on Quality
    if (!true_packing && quality) {
        true_packing = get_fallback_packing(quality);
    }

    // Only set if they have a non-empty string so we don't accidentally erase something
    if (spec.fabric_type) safe_set_value(frm, 'custom_fabric_type', spec.fabric_type);
    if (true_label) safe_set_value(frm, 'custom_label', true_label);
    if (true_packing) safe_set_value(frm, 'custom_packing', true_packing);

    frappe.show_alert({
        message: __('Product spec loaded: {0}', [spec.fabric_type || 'Custom']),
        indicator: 'green'
    }, 3);
}

// Fallback logic to get packing material based on quality (Case Insensitive)
function get_fallback_packing(quality) {
    if (!quality) return '';

    // Convert to lowercase to perfectly match regardless of capitalization
    quality = quality.trim().toLowerCase();

    // Mapping arrays are completely lowercase to enable easy matching
    const blue_poly = ['premium', 'platinum', 'super platinum', 'lifestyle', 'lifestype'];
    const orange_poly = ['gold', 'silver', 'bronze'];
    const red_poly = ['classic', 'super classic'];
    const green_poly = ['eco green', 'eco special', 'super eco'];
    const kapada = ['ultra', 'deluxe'];

    if (blue_poly.includes(quality)) return 'Blue Poly';
    if (orange_poly.includes(quality)) return 'Orange Poly';
    if (red_poly.includes(quality)) return 'Red Poly';
    if (green_poly.includes(quality)) return 'Green Poly';
    if (kapada.includes(quality)) return 'Kapada';

    return ''; // Return empty string if no match is found
}

// Wrapper to safely inject options if missing, or adapt to exact UI fieldname
function safe_set_value(frm, fieldname, value) {
    if (!value) return;

    // Resolve exact fieldname
    if (!frm.fields_dict[fieldname]) {
        let alt = fieldname.startsWith('custom_') ? fieldname.replace('custom_', '') : 'custom_' + fieldname;
        if (frm.fields_dict[alt]) {
            fieldname = alt;
        } else {
            console.log("Field missing from UI completely:", fieldname);
            return;
        }
    }

    // Attempt to safely inject into Select if required so it's not silently dropped
    let df = frappe.meta.get_docfield(frm.doctype, fieldname, frm.docname);
    if (df && df.fieldtype === 'Select') {
        let options = df.options || "";
        let options_list = options.split('\n').filter(o => o.trim() !== '');
        let target_val = value.trim();
        // Case-insensitive match check
        let match = options_list.find(o => o.trim().toLowerCase() === target_val.toLowerCase());
        
        if (match) {
            // Already exists but might have case difference, update our value to match the valid option
            value = match; 
        } else {
            // Missing entirely, inject
            options_list.push(target_val);
            frm.set_df_property(fieldname, 'options', options_list.join('\n'));
            value = target_val;
        }
    }
    
    frm.set_value(fieldname, value);
}