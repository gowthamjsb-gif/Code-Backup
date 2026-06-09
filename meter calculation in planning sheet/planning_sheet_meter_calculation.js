["Planning sheet", "Planning Sheet"].forEach(function(doctype) {
    frappe.ui.form.on(doctype, {
        refresh: function(frm) {
            frm.add_custom_button(__('Calculate Meters'), function() {
                if (!frm.doc.items || !frm.doc.items.length) {
                    frappe.msgprint(__('No items found in the Planning Sheet.'));
                    return;
                }

                let items_changed = false;
                let bag_item_calculated = false;

                // Track the calculated values for the parent bag item to sync with child items
                let parent_bag_values = {
                    total_meter: 0,
                    meter_per_roll: 0,
                    no_of_rolls: 0,
                    weight_per_roll: 0
                };

                let sync_values = {}; // Store values to sync with planned_items table

                // Helper to identify item types
                const isBagItem = (item_code) => {
                    if (!item_code) return false;
                    const parts = item_code.split('-');
                    if (parts.length >= 3) {
                        const code = parts.length >= 4 ? parts[3] : parts[2];
                        return code.startsWith('221') || code.startsWith('222') || code.startsWith('223') || 
                               code.startsWith('231') || code.startsWith('232') || code.startsWith('233') || 
                               code.startsWith('241') || code.startsWith('242');
                    }
                    return false;
                };

                const isBoppLamFabric = (item_code) => item_code && item_code.includes('-107'); // Process code 107 usually BOPP Laminated Fabric (after hyphen)
                const isNonWovenFabric = (item_code) => item_code && (item_code.startsWith('100') || item_code.startsWith('103')); // 100 or 103 for Non-Woven
                const isPrintedBopp = (item_code) => item_code && item_code.startsWith('PB-');

                // Identify loop middle parts to recognize raw loop fabrics early
                let loop_middle_parts = [];
                for (let row of frm.doc.items) {
                    let item_code = row.item_code || '';
                    if (item_code.startsWith('103') || item_code.includes('108')) {
                        if (item_code.includes('-')) {
                            let parts = item_code.split('-');
                            if (parts.length >= 2) {
                                loop_middle_parts.push(parts[1]);
                            }
                        } else if (item_code.length >= 12) {
                            let mid = item_code.substring(3, item_code.length - 4);
                            loop_middle_parts.push(mid);
                        }
                    }
                }

                const isLoopItemOrFabric = (item_code) => {
                    if (!item_code) return false;
                    if (item_code.startsWith('103') || item_code.includes('108')) return true;
                    if (item_code.startsWith('100')) {
                        let mid = '';
                        if (item_code.includes('-')) {
                            let parts = item_code.split('-');
                            mid = parts[1] || '';
                        } else if (item_code.length >= 12) {
                            mid = item_code.substring(3, item_code.length - 4);
                        }
                        return mid && loop_middle_parts.includes(mid);
                    }
                    return false;
                };

                // Find main body fabric's GSM and Width
                let fabric_gsm = 0;
                let fabric_width_inch = 0;
                let fabric_actual_meter = 0;

                // Lookup GSM, Width, and Actual Meter from planned_items first, then items
                let all_items = (frm.doc.planned_items || []).concat(frm.doc.items || []);
                for (let row of all_items) {
                    let item_code = row.item_code || '';
                    if (isNonWovenFabric(item_code) && !item_code.startsWith('103') && !isLoopItemOrFabric(item_code)) {
                        if (fabric_gsm === 0) fabric_gsm = parseFloat(row.gsm) || parseFloat(row.custom_gsm) || 0;
                        if (fabric_width_inch === 0) fabric_width_inch = parseFloat(row.width_inch) || parseFloat(row.custom_width_inch) || parseFloat(row.width) || 0;
                        
                        // Extract actual meter from planned_items qty if it's the required quantity for fabric
                        if (row.qty > 0 && row.parentfield === 'planned_items' && (row.uom === 'Meter' || row.uom === 'Mtr' || row.uom === 'meter')) {
                            fabric_actual_meter = parseFloat(row.qty);
                        }
                    }
                }

                // Pass 1: Find the Bag Item (233) and calculate its meters
                for (let row of frm.doc.items) {
                    if (isBagItem(row.item_code)) {
                        // Use fabric_actual_meter if found, otherwise fallback to row.meter
                        let actual_meter = fabric_actual_meter > 0 ? fabric_actual_meter : (parseFloat(row.meter) || 0);
                        let qty = parseFloat(row.qty) || 0;

                        if (actual_meter === 0) {
                            frappe.msgprint(__('Please ensure meter (Actual Meter) is set for the Bag item or Fabric item before calculating.'));
                            continue;
                        }

                        // Distribute into rolls targeting ~120kg weight per roll (using main body fabric's GSM and width)
                        let gsm = parseFloat(row.gsm) || parseFloat(row.custom_gsm) || 0;
                        let width_inch = parseFloat(row.width_inch) || parseFloat(row.custom_width_inch) || parseFloat(row.width) || 0;
                        let no_of_rolls = 1;

                        let calc_gsm = fabric_gsm || gsm;
                        let calc_width = fabric_width_inch || width_inch;

                        if (calc_gsm > 0 && calc_width > 0) {
                            // Total weight of the actual fabric meter length
                            let total_weight = (calc_gsm * calc_width * actual_meter * 0.0254) / 1000;
                            // Calculate ideal rolls to keep weight around 120 kgs
                            no_of_rolls = Math.max(1, Math.round(total_weight / 120));
                        } else {
                            no_of_rolls = Math.max(1, Math.round(actual_meter / 2000));
                        }
                        
                        // Fallback to ensure actual_meter_per_roll >= 1000 if possible
                        if (actual_meter / no_of_rolls < 1000 && no_of_rolls > 1) {
                            no_of_rolls = Math.max(1, Math.floor(actual_meter / 1000));
                        }
                        
                        let actual_meter_per_roll = actual_meter / no_of_rolls;

                        // Extra meter logic: 100m for every 10k pcs
                        let extra_meter = Math.max(1, Math.ceil(qty / 10000)) * 100;
                        let meter_per_roll = actual_meter_per_roll + extra_meter;
                        let total_meter = meter_per_roll * no_of_rolls;

                        let weight_per_roll = 0;
                        if (calc_gsm > 0 && calc_width > 0) {
                            weight_per_roll = (calc_gsm * calc_width * meter_per_roll * 0.0254) / 1000;
                        }

                        parent_bag_values = {
                            total_meter: total_meter,
                            meter_per_roll: meter_per_roll,
                            no_of_rolls: no_of_rolls,
                            weight_per_roll: weight_per_roll,
                            process_code: (row.item_code.split('-').length >= 4 ? row.item_code.split('-')[3] : row.item_code.split('-')[2]) || ''
                        };

                        frappe.model.set_value(row.doctype, row.name, 'meter', total_meter);
                        frappe.model.set_value(row.doctype, row.name, 'meter_per_roll', meter_per_roll);
                        frappe.model.set_value(row.doctype, row.name, 'no_of_rolls', no_of_rolls);
                        if (weight_per_roll > 0) {
                            frappe.model.set_value(row.doctype, row.name, 'weight_per_roll', weight_per_roll);
                        }

                        sync_values[row.item_code] = {
                            meter: total_meter,
                            meter_per_roll: meter_per_roll,
                            no_of_rolls: no_of_rolls,
                            weight_per_roll: weight_per_roll
                        };
                        
                        bag_item_calculated = true;
                        items_changed = true;
                    }
                }

                // Pass 2: Calculate child items based on the parent bag
                for (let row of frm.doc.items) {
                    if (isBagItem(row.item_code)) continue; // Already processed

                    let item_code = row.item_code || '';

                    // Loop Items / Loop Fabrics
                    if (isLoopItemOrFabric(item_code)) {
                        frappe.model.set_value(row.doctype, row.name, 'meter_per_roll', 1500);
                        frappe.model.set_value(row.doctype, row.name, 'no_of_rolls', 1);
                        frappe.model.set_value(row.doctype, row.name, 'meter', 1500);
                        
                        let gsm = parseFloat(row.gsm) || parseFloat(row.custom_gsm) || 0;
                        let width_inch = parseFloat(row.width_inch) || parseFloat(row.custom_width_inch) || parseFloat(row.width) || 0;
                        let weight_per_roll = 0;
                        if (gsm > 0 && width_inch > 0) {
                            weight_per_roll = (gsm * width_inch * 1500 * 0.0254) / 1000;
                            frappe.model.set_value(row.doctype, row.name, 'weight_per_roll', weight_per_roll);
                        }

                        sync_values[item_code] = {
                            meter: 1500,
                            meter_per_roll: 1500,
                            no_of_rolls: 1,
                            weight_per_roll: weight_per_roll
                        };

                        items_changed = true;
                        continue;
                    }

                    if (bag_item_calculated) {
                        if (isBoppLamFabric(item_code)) {
                            // Sync completely with Bag item
                            frappe.model.set_value(row.doctype, row.name, 'meter', parent_bag_values.total_meter);
                            frappe.model.set_value(row.doctype, row.name, 'meter_per_roll', parent_bag_values.meter_per_roll);
                            frappe.model.set_value(row.doctype, row.name, 'no_of_rolls', parent_bag_values.no_of_rolls);
                            if (parent_bag_values.weight_per_roll > 0) {
                                frappe.model.set_value(row.doctype, row.name, 'weight_per_roll', parent_bag_values.weight_per_roll);
                            }

                            sync_values[item_code] = {
                                meter: parent_bag_values.total_meter,
                                meter_per_roll: parent_bag_values.meter_per_roll,
                                no_of_rolls: parent_bag_values.no_of_rolls,
                                weight_per_roll: parent_bag_values.weight_per_roll || 0
                            };

                            items_changed = true;
                        } 
                        else if (isNonWovenFabric(item_code) && !item_code.startsWith('103')) {
                            // Non-Woven Fabric (Body) -> BOPP Lam + 20m, unless it's a non-laminated process (221, 222, 223)
                            let is_non_laminated = parent_bag_values.process_code && (
                                parent_bag_values.process_code.startsWith('221') ||
                                parent_bag_values.process_code.startsWith('222') ||
                                parent_bag_values.process_code.startsWith('223')
                            );
                            let nw_meter_per_roll = is_non_laminated ? parent_bag_values.meter_per_roll : (parent_bag_values.meter_per_roll + 20);
                            let nw_no_of_rolls = parent_bag_values.no_of_rolls;
                            let nw_total_meter = nw_meter_per_roll * nw_no_of_rolls;
                            
                            frappe.model.set_value(row.doctype, row.name, 'meter_per_roll', nw_meter_per_roll);
                            frappe.model.set_value(row.doctype, row.name, 'no_of_rolls', nw_no_of_rolls);
                            frappe.model.set_value(row.doctype, row.name, 'meter', nw_total_meter);

                            // Calculate weight
                            let gsm = parseFloat(row.gsm) || parseFloat(row.custom_gsm) || 0;
                            let width_inch = parseFloat(row.width_inch) || parseFloat(row.custom_width_inch) || parseFloat(row.width) || 0;
                            let weight_per_roll = 0;
                            if (gsm > 0 && width_inch > 0) {
                                weight_per_roll = (gsm * width_inch * nw_meter_per_roll * 0.0254) / 1000;
                                frappe.model.set_value(row.doctype, row.name, 'weight_per_roll', weight_per_roll);
                            }

                            sync_values[item_code] = {
                                meter: nw_total_meter,
                                meter_per_roll: nw_meter_per_roll,
                                no_of_rolls: nw_no_of_rolls,
                                weight_per_roll: weight_per_roll
                            };

                            items_changed = true;
                        }
                        else if (isPrintedBopp(item_code)) {
                            // Printed BOPP -> Consolidate rolls (half or thrice), +10m
                            let divisor = (parent_bag_values.no_of_rolls % 2 === 0) ? 2 : (parent_bag_values.no_of_rolls % 3 === 0 ? 3 : 2);
                            let pb_no_of_rolls = Math.max(1, Math.round(parent_bag_values.no_of_rolls / divisor));
                            
                            let pb_meter_per_roll = (parent_bag_values.meter_per_roll * (parent_bag_values.no_of_rolls / pb_no_of_rolls)) + 10;
                            let pb_total_meter = pb_meter_per_roll * pb_no_of_rolls;

                            frappe.model.set_value(row.doctype, row.name, 'meter_per_roll', pb_meter_per_roll);
                            frappe.model.set_value(row.doctype, row.name, 'no_of_rolls', pb_no_of_rolls);
                            frappe.model.set_value(row.doctype, row.name, 'meter', pb_total_meter);

                            // Calculate weight
                            let gsm = parseFloat(row.gsm) || parseFloat(row.custom_gsm) || 0;
                            let width_inch = parseFloat(row.width_inch) || parseFloat(row.custom_width_inch) || parseFloat(row.width) || 0;
                            let weight_per_roll = 0;
                            if (gsm > 0 && width_inch > 0) {
                                weight_per_roll = (gsm * width_inch * pb_meter_per_roll * 0.0254) / 1000;
                                frappe.model.set_value(row.doctype, row.name, 'weight_per_roll', weight_per_roll);
                            }

                            sync_values[item_code] = {
                                meter: pb_total_meter,
                                meter_per_roll: pb_meter_per_roll,
                                no_of_rolls: pb_no_of_rolls,
                                weight_per_roll: weight_per_roll
                            };

                            items_changed = true;
                        }
                    }
                }

                // Pass 3: Sync calculated values to planned_items table
                if (frm.doc.planned_items && frm.doc.planned_items.length > 0) {
                    for (let p_row of frm.doc.planned_items) {
                        let vals = sync_values[p_row.item_code];
                        if (vals) {
                            frappe.model.set_value(p_row.doctype, p_row.name, 'meter', vals.meter);
                            frappe.model.set_value(p_row.doctype, p_row.name, 'meter_per_roll', vals.meter_per_roll);
                            frappe.model.set_value(p_row.doctype, p_row.name, 'no_of_rolls', vals.no_of_rolls);
                            if (vals.weight_per_roll > 0) {
                                frappe.model.set_value(p_row.doctype, p_row.name, 'weight_per_roll', vals.weight_per_roll);
                            }
                            items_changed = true;
                        }
                    }
                    frm.refresh_field('planned_items');
                }

                if (items_changed) {
                    frm.refresh_field('items');
                    frappe.msgprint(__('Meters calculated successfully.'));
                } else {
                    frappe.msgprint(__('No items matched the calculation criteria.'));
                }

            }).addClass('btn-primary');
        }
    });
});
