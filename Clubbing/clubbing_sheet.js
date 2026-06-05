function show_rolls_dialog_JSB(frm, args) {
    let rolls = args.rolls;
    let so_name = args.sales_order;

    let html = '<style>' +
        '.rolls-view { font-family: Arial, sans-serif !important; color: #000 !important; background: #fff !important; padding: 0; }' +
        '.printable-area { width: 100%; max-width: 800px; margin: 0 auto; }' +

        /* ── Company Header (No Flex for Print Stability) ── */
        '.company-header-table { width: 100%; border-collapse: collapse; border: 2px solid #2e7d32; margin-bottom: 10px; table-layout: fixed; }' +
        '.company-header-table td { padding: 10px; text-align: center; vertical-align: middle; }' +
        '.company-header-table img { height: 60px; width: auto; margin-bottom: 5px; }' +
        '.company-header-table h1 { font-size: 22px; font-weight: 900; margin: 0; text-transform: uppercase; color: #000; }' +
        '.company-header-table .doc-title { font-size: 11px; font-weight: bold; text-transform: uppercase; border-top: 1px solid #ccc; margin-top: 5px; padding-top: 5px; }' +

        /* ── Info Row (Strict Table) ── */
        '.info-row-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; table-layout: fixed; }' +
        '.info-row-table td { border: 1px solid #555 !important; padding: 0; text-align: center; }' +
        '.info-box { height: 100%; display: block; }' +
        '.info-label { background: #f57f17 !important; color: #fff !important; font-size: 8px; font-weight: 700; text-transform: uppercase; padding: 2px 5px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }' +
        '.info-value { font-size: 11px; font-weight: 700; padding: 4px 5px; }' +

        /* ── Main Table (Hardened for Print) ── */
        '.dt-table { width: 100%; border-collapse: collapse; border: 1px solid #000 !important; font-size: 10px; }' +
        '.dt-table th { background: #ffb74d !important; border: 1px solid #000 !important; padding: 6px; font-weight: 700; text-transform: uppercase; -webkit-print-color-adjust: exact; print-color-adjust: exact; }' +
        '.dt-table td { border: 1px solid #000 !important; padding: 5px 6px; text-align: center; vertical-align: middle; }' +
        '.dt-table tfoot td { background: #c8e6c9 !important; border: 1px solid #000 !important; font-weight: bold; color: #1b5e20 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }' +

        '.tr { text-align: right !important; }' +
        '.fb { font-weight: 700 !important; }' +
        '@media print { ' +
        '.modal-header, .modal-footer { display: none !important; }' +
        '.printable-area { width: 100% !important; margin: 0 !important; padding: 0 !important; }' +
        'body { background: #fff !important; }' +
        '}' +
        '</style>';

    html += '<div class="rolls-view printable-area" id="printable-rolls-area">';

    // Header Table
    html += '<table class="company-header-table"><tr><td>' +
        '<img src="/private/files/JSB LOGO63b225.png" alt="JSB Logo"><br>' +
        '<h1>Jayashree Spun Bond</h1>' +
        '<div class="doc-title">Despatch Roll List | SO: ' + so_name + '</div>' +
        '</td></tr></table>';

    // Info Card Table
    html += '<table class="info-row-table"><tr>' +
        '<td><div class="info-box"><div class="info-label">Date</div><div class="info-value">' + frappe.datetime.nowdate() + '</div></div></td>' +
        '<td><div class="info-box"><div class="info-label">Order Code</div><div class="info-value">' + so_name + '</div></div></td>' +
        '<td><div class="info-box"><div class="info-label">No. of Rolls</div><div class="info-value">' + rolls.length + '</div></div></td>' +
        '<td><div class="info-box"><div class="info-label">Report Type</div><div class="info-value">Order-Wise</div></div></td>' +
        '</tr></table>';

    // Results Table
    html += '<table class="dt-table"><thead><tr>' +
        '<th>#</th><th>Batch No</th><th>Quality</th><th>Color</th><th>GSM</th><th>Size (")</th>' +
        '<th>Mtrs</th><th>Net Wt</th><th>Gross Wt</th>' +
        '</tr></thead><tbody>';

    let total_mtr = 0, total_net = 0, total_gross = 0;

    for (let i = 0; i < rolls.length; i++) {
        let r = rolls[i];
        let mtr = flt(r.meter_roll || r.meter_per_roll);
        let net = flt(r.net_weight);
        let gross = flt(r.gross_weight || (r.net_weight + 2));

        total_mtr += mtr;
        total_net += net;
        total_gross += gross;

        html += '<tr>' +
            '<td>' + (i + 1) + '</td>' +
            '<td class="fb">' + (r.batch_no || '') + '</td>' +
            '<td>' + (r.quality || '') + '</td>' +
            '<td>' + (r.color || '') + '</td>' +
            '<td>' + (r.gsm || '') + '</td>' +
            '<td>' + (r.width_inch || (r.width_mm ? (flt(r.width_mm) / 25.4).toFixed(1) : '-')) + '</td>' +
            '<td class="tr">' + mtr.toFixed(1) + '</td>' +
            '<td class="tr">' + net.toFixed(2) + '</td>' +
            '<td class="tr">' + gross.toFixed(2) + '</td>' +
            '</tr>';
    }

    html += '</tbody><tfoot><tr>' +
        '<td colspan="6" class="tr fb">TOTAL CONSOLIDated despatch</td>' +
        '<td class="tr">' + total_mtr.toFixed(1) + '</td>' +
        '<td class="tr">' + total_net.toFixed(2) + '</td>' +
        '<td class="tr">' + total_gross.toFixed(2) + '</td>' +
        '</tr></tfoot></table></div>';

    let d = new frappe.ui.Dialog({
        title: __('Rolls for Sales Order: {0}', [so_name]),
        fields: [{ fieldtype: 'HTML', fieldname: 'rolls_html', options: html }],
        size: 'extra-large',
        primary_action_label: __('Print for Despatch'),
        primary_action: function () {
            let print_window = window.open('', '_blank');
            print_window.document.write('<html><head><title>Roll List</title>');
            print_window.document.write('<style>@page { size: A4 portrait; margin: 10mm; }</style>');
            // Crucial: Pass the styles and the content to the new window
            print_window.document.write(html);
            print_window.document.write('</body></html>');
            print_window.document.close();

            // Wait for styles/images to load before triggering print
            setTimeout(() => {
                print_window.print();
                print_window.close();
            }, 500);
        }
    });

    d.show();
}

frappe.ui.form.on('Clubbing Sheet', {
    refresh: function (frm) {
        // Top-right "Get Sales Orders" button — the only button for this action
        frm.add_custom_button(__('Get Sales Orders'), function () {
            frm.trigger('get_sales_orders_dialog');
        });

        // Show Submit button only on saved (non-new) drafts
        if (!frm.doc.__islocal && frm.doc.docstatus === 0) {
            frm.add_custom_button(__('Submit'), function () {
                frm.trigger('submit_with_trip_id');
            }, __('Actions'));
        }

        frm.trigger('show_load_type_indicator');
        frm.trigger('toggle_loading_sequence_visibility');
        frm.trigger('set_vehicle_no_options');
    },

    validate: function (frm) {
        console.log("VALIDATING BEFORE SAVE. Items:", frm.doc.items.map(i => ({
            name: i.name,
            so: i.sales_order,
            customer: i.customer,
            customer_name: i.customer_name
        })));
    },

    vehicle_feet: function (frm) {
        frm.trigger('set_vehicle_no_options');
        frm.set_value('vehicle_no', ''); // Reset the vehicle number when feet changes
    },

    set_vehicle_no_options: function (frm) {
        if (!frm.doc.vehicle_feet) {
            frm.set_df_property('vehicle_no', 'options', []);
            return;
        }

        const VEHICLE_MAP = {
            "20": ["TN 64 T 2207", "TN 64 U 0093", "TN 64 V 2054", "TN 64 AE 1904", "TN 64 AE 1976"],
            "21": ["TN 64 V 3522", "TN 64 V 4066", "TN 64 V 4258"],
            "22": ["TN 64 V 3016", "TN 64 V 3083", "TN 64 V 8409", "TN 64 V 8437"],
            "24": ["TN 64 W 9289", "TN 64 W 9767", "TN 64 X 4926", "TN 64 X 4944", "TN 64 X 6939", "TN 64 Y 1944", "TN 64 Y 1982", "TN 64 Y 1993", "TN 64 Y 8719", "TN 64 Y 8731", "TN 64 Y 8782", "TN 64 Z 1720", "TN 64 Z 1748"],
            "32": ["TN 64 V 8852", "TN 64 W 8825"]
        };

        // Extract the numbers from the selected feet (e.g. "20 feet" -> "20")
        let match = frm.doc.vehicle_feet.toString().match(/\d+/);
        if (match && VEHICLE_MAP[match[0]]) {
            frm.set_df_property('vehicle_no', 'options', [""].concat(VEHICLE_MAP[match[0]]));
        } else {
            frm.set_df_property('vehicle_no', 'options', []);
        }
    },

    submit_with_trip_id: function (frm) {
        if (!frm.doc.trip_id) {
            frappe.prompt(
                [{ fieldname: 'trip_id', fieldtype: 'Data', label: 'Trip ID', reqd: 1 }],
                (values) => {
                    frappe.model.set_value(frm.doctype, frm.docname, 'trip_id', values.trip_id);
                    frm.save().then(() => {
                        frappe.ui.form.save(frm, 'Submit');
                    });
                },
                __('Enter Trip ID to Submit'),
                __('Submit')
            );
        } else {
            frappe.confirm(
                __('Submit this Clubbing Sheet with Trip ID: <b>') + frm.doc.trip_id + '</b>?',
                () => frappe.ui.form.save(frm, 'Submit')
            );
        }
    },

    // Handler for the Button field in the form body (same as top-right button)
    get_sales_orders: function (frm) {
        frm.trigger('get_sales_orders_dialog');
    },

    show_load_type_indicator: function (frm) {
        // Clear existing intros to avoid duplicates
        frm.page.wrapper.find('.form-message.blue, .form-message.orange, .form-message.red').remove();

        let customer_weights = {};
        let selected_cities = new Set();
        (frm.doc.items || []).forEach(i => {
            if (i.customer) {
                customer_weights[i.customer] = (customer_weights[i.customer] || 0) + flt(i.weight_kgs);
            }
            if (i.party_location) {
                selected_cities.add(i.party_location.trim().toLowerCase());
            }
        });

        let customers = Object.keys(customer_weights);
        let full_load_customers = customers.filter(c => customer_weights[c] >= 5000);

        let is_valid = true;
        if (selected_cities.size > 0) {
            is_valid = false;
            for (let belt of ROUTE_BELTS) {
                let all_in_belt = true;
                for (let city of selected_cities) {
                    if (!belt.includes(city)) {
                        all_in_belt = false;
                        break;
                    }
                }
                if (all_in_belt) {
                    is_valid = true;
                    break;
                }
            }
        }

        if (!is_valid && !frm.doc.ignore_route_conflict) {
            frm.set_intro(
                __("🚨 <b>ROUTE CONFLICT</b> — The selected cities do not fall together on any single established forward route/belt. Check 'Ignore Route Conflict' to override."),
                "red"
            );
        } else if (full_load_customers.length > 0 && customers.length > 1) {
            frm.set_intro(
                __("🚨 <b>FULL LOAD VIOLATION</b> — Customer <b>{0}</b> has {1} kgs (>= 5000 kgs). It MUST be a dedicated vehicle and cannot be clubbed with others.",
                    [full_load_customers[0], customer_weights[full_load_customers[0]]]),
                "red"
            );
        } else if (frm.doc.load_type === "Full Load") {
            frm.set_intro(
                __("🚛 <b>Full Load</b> — This order requires a dedicated vehicle."),
                "blue"
            );
        } else if (frm.doc.load_type === "Part Load") {
            if (customers.length > 1) {
                frm.set_intro(
                    __("📦 <b>Part Load</b> — Multiple orders have been clubbed together."),
                    "orange"
                );
            } else {
                frm.set_intro(
                    __("📦 <b>Part Load</b> — This shipment requires clubbing with other orders."),
                    "orange"
                );
            }
        }
    },

    load_type: function (frm) {
        frm.trigger('show_load_type_indicator');
        frm.trigger('toggle_loading_sequence_visibility');
        frm.trigger('calculate_loading_sequence');
    },

    toggle_loading_sequence_visibility: function (frm) {
        let show = (frm.doc.load_type === 'Part Load' || frm.doc.load_type === 'Full Load');
        frm.get_field('items').grid.set_column_disp('loading_sequence', show);
    },

    recalculate_load_type: function (frm) {
        let customer_weights = {};
        let selected_cities = new Set();

        (frm.doc.items || []).forEach(i => {
            if (i.customer) {
                customer_weights[i.customer] = (customer_weights[i.customer] || 0) + flt(i.weight_kgs);
            }
            if (i.party_location) {
                selected_cities.add(i.party_location.trim().toLowerCase());
            }
        });

        let customers = Object.keys(customer_weights);
        let has_full_load_order = Object.values(customer_weights).some(w => w >= 5000);

        let is_valid = true;
        if (selected_cities.size > 0) {
            is_valid = false;
            for (let belt of ROUTE_BELTS) {
                let all_in_belt = true;
                for (let city of selected_cities) {
                    if (!belt.includes(city)) {
                        all_in_belt = false;
                        break;
                    }
                }
                if (all_in_belt) {
                    is_valid = true;
                    break;
                }
            }
        }

        if (!is_valid && !frm.doc.ignore_route_conflict) {
            frm.set_value('load_type', ''); // Prevent valid load type on conflict
        } else if (has_full_load_order) {
            frm.set_value('load_type', 'Full Load');
        } else if (customers.length > 1) {
            frm.set_value('load_type', 'Part Load');
        } else if (customers.length === 1) {
            frm.set_value('load_type', 'Part Load');
        } else {
            frm.set_value('load_type', '');
        }

        frm.trigger('show_load_type_indicator');
        frm.trigger('toggle_loading_sequence_visibility');
        frm.trigger('calculate_loading_sequence');
    },

    get_sales_orders_dialog: function (frm) {
        let d = new frappe.ui.Dialog({
            title: __('Select Sales Orders'),
            size: 'large',
            fields: [
                {
                    fieldtype: 'Section Break',
                    label: __('Filters')
                },
                {
                    fieldtype: 'Data',
                    fieldname: 'search_order',
                    label: __('Order ID'),
                    onchange: () => refresh_list()
                },
                {
                    fieldtype: 'Column Break'
                },
                {
                    fieldtype: 'Data',
                    fieldname: 'search_customer',
                    label: __('Customer'),
                    onchange: () => refresh_list()
                },
                {
                    fieldtype: 'Section Break'
                },
                {
                    fieldtype: 'Data',
                    fieldname: 'search_city',
                    label: __('City'),
                    onchange: () => refresh_list()
                },
                {
                    fieldtype: 'Column Break'
                },
                {
                    fieldtype: 'Data',
                    fieldname: 'search_party',
                    label: __('Party Code'),
                    onchange: () => refresh_list()
                },
                {
                    fieldtype: 'Section Break'
                },
                {
                    fieldtype: 'HTML',
                    fieldname: 'list_area'
                }
            ],
            primary_action_label: __('Get Items'),
            primary_action(values) {
                let selected = Array.from(selected_orders);
                if (selected.length === 0) {
                    frappe.msgprint(__('Please select at least one order'));
                    return;
                }
                d.hide();
                frm.events.process_selections(frm, selected);
            }
        });

        let orders = [];
        let selected_orders = new Set();

        // Event delegation to capture checkbox changes even after HTML re-renders
        d.$wrapper.on('change', '.so-checkbox', function () {
            let name = $(this).data('name');
            if (name) {
                if ($(this).prop('checked')) {
                    selected_orders.add(name);
                } else {
                    selected_orders.delete(name);
                }
            }
        });

        d.$wrapper.on('change', '.so-select-all', function () {
            let is_checked = $(this).prop('checked');
            d.$wrapper.find('.so-checkbox').each(function () {
                $(this).prop('checked', is_checked);
                let name = $(this).data('name');
                if (name) {
                    if (is_checked) {
                        selected_orders.add(name);
                    } else {
                        selected_orders.delete(name);
                    }
                }
            });
        });
        let refresh_list = () => {
            let s_order = (d.get_value('search_order') || '').toLowerCase();
            let s_cust = (d.get_value('search_customer') || '').toLowerCase();
            let s_city = (d.get_value('search_city') || '').toLowerCase();
            let s_party = (d.get_value('search_party') || '').toLowerCase();

            let filtered = orders.filter(o =>
                (!s_order || o.name.toLowerCase().includes(s_order)) &&
                (!s_cust || o.customer.toLowerCase().includes(s_cust) || (o.customer_name && o.customer_name.toLowerCase().includes(s_cust))) &&
                (!s_city || (o.city || '').toLowerCase().includes(s_city)) &&
                (!s_party || (o.custom_party_code || '').toLowerCase().includes(s_party))
            );

            let html = `
                        <div style="max-height: 400px; overflow-y: auto;">
                        <table class="table table-bordered table-condensed table-hover">
                            <thead>
                                <tr class="text-muted small uppercase">
                                    <th style="width: 40px; text-align: center;">
                                        <input type="checkbox" class="so-select-all">
                                    </th>
                                    <th>${__('Order')}</th>
                                    <th>${__('Customer')}</th>
                                    <th>${__('City')}</th>
                                    <th>${__('Party')}</th>
                                    <th class="text-right">${__('Qty')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${filtered.length === 0 ? `<tr><td colspan="6" class="text-center text-muted">${__('No matching orders found')}</td></tr>` :
                    filtered.map(o => `
                                    <tr>
                                        <td style="text-align: center;"><input type="checkbox" class="so-checkbox" data-name="${o.name}" ${selected_orders.has(o.name) ? 'checked' : ''}></td>
                                        <td><b>${o.name}</b></td>
                                        <td>${o.customer_name || o.customer}</td>
                                        <td><span class="label label-blue">${o.city || ''}</span></td>
                                        <td>${o.custom_party_code || ''}</td>
                                        <td class="text-right">${o.total_qty}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        </div>
                    `;
            d.get_field('list_area').$wrapper.html(html);
        };

        // Step 1: Fetch ALL orders already in any NON-CANCELLED Clubbing Sheet
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Clubbing Sheet Item',
                filters: { docstatus: ['<', 2] },
                fields: ['sales_order'],
                limit_page_length: 50000
            },
            callback: (r_items) => {
                // We'll filter non-cancelled orders manually if needed, but for now let's get all 
                // and assume completed ones shouldn't show up anyway if the status is right.
                // However, the user specifically wants to exclude those in existing sheets.
                // Let's get the list of sales orders and filter out the ones already assigned.
                let assigned = new Set((r_items.message || []).map(i => i.sales_order).filter(Boolean));

                // Step 2: Fetch uncompleted Sales Orders
                frappe.call({
                    method: 'frappe.client.get_list',
                    args: {
                        doctype: 'Sales Order',
                        filters: { docstatus: 1, status: ['!=', 'Completed'] },
                        fields: ['name', 'customer', 'customer_name', 'status', 'total_qty', 'shipping_address_name', 'custom_party_code'],
                        limit_page_length: 1000
                    },
                    callback: (r_orders) => {
                        let all_orders = r_orders.message || [];
                        // MANUAL FILTER to ensure no duplicates
                        orders = all_orders.filter(o => !assigned.has(o.name));

                        let addr_names = [...new Set(orders.map(o => o.shipping_address_name).filter(Boolean))];
                        if (addr_names.length) {
                            frappe.call({
                                method: 'frappe.client.get_list',
                                args: {
                                    doctype: 'Address',
                                    filters: { name: ['in', addr_names] },
                                    fields: ['name', 'city'],
                                    limit_page_length: addr_names.length
                                },
                                callback: (r_addr) => {
                                    let cities = {};
                                    (r_addr.message || []).forEach(a => cities[a.name] = a.city);
                                    orders.forEach(o => o.city = cities[o.shipping_address_name]);
                                    refresh_list();
                                }
                            });
                        } else {
                            refresh_list();
                        }
                    }
                });
            }
        });

        d.show();
    },

    process_selections: function (frm, selections) {
        frappe.call({
            method: "frappe.client.get_list",
            args: {
                doctype: "Sales Order",
                filters: { name: ["in", selections] },
                fields: ["name", "customer", "total_net_weight", "total_qty", "base_grand_total", "shipping_address_name", "customer_name", "custom_party_code"]
            },
            callback: function (r) {
                if (!r.message) return;

                // Step 1: Use frappe.client.get to safely fetch full doc + child table items for each Sales Order
                let so_promises = r.message.map(so => {
                    return new Promise((resolve) => {
                        frappe.call({
                            method: 'frappe.client.get',
                            args: { doctype: 'Sales Order', name: so.name },
                            callback: (full_so_res) => {
                                let full_so = full_so_res.message || {};
                                let rolls = 0;
                                (full_so.items || []).forEach(item => {
                                    rolls += flt(item.custom_no_of_rolls || item.custom_no_of_rollns || 0);
                                });
                                let row = frm.add_child('items');

                                // Write DIRECTLY to locals[] — this bypasses Frappe's
                                // fetch_from change-handler system, which was overwriting
                                // 'customer' with customer_name (display text) whenever
                                // 'sales_order' was set via set_value.
                                let rd = locals[row.doctype][row.name];
                                rd.customer      = so.customer;        // e.g. "TN-0037"
                                rd.customer_name = so.customer_name || so.customer;
                                rd.sales_order   = so.name;
                                rd.party_code    = so.custom_party_code || "";
                                rd.weight_kgs    = flt(so.total_net_weight || so.total_qty || so.base_grand_total);
                                rd.no_of_rolls   = rolls;

                                console.log("Row set via locals[]:", {
                                    so: so.name,
                                    customer: rd.customer,
                                    customer_name: rd.customer_name
                                });

                                // Fetch city for party_location, then resolve
                                if (so.shipping_address_name) {
                                    frappe.db.get_value("Address", so.shipping_address_name, "city", (d) => {
                                        if (d && d.city) rd.party_location = d.city;
                                        frm.refresh_field('items');
                                        resolve(row);
                                    });
                                } else {
                                    frappe.db.get_value("Customer", so.customer, "customer_primary_address", (cd) => {
                                        if (cd && cd.customer_primary_address) {
                                            frappe.db.get_value("Address", cd.customer_primary_address, "city", (ad) => {
                                                if (ad && ad.city) rd.party_location = ad.city;
                                                frm.refresh_field('items');
                                                resolve(row);
                                            });
                                        } else {
                                            frm.refresh_field('items');
                                            resolve(row);
                                        }
                                    });
                                }
                            }
                        });
                    });
                });

                // Step 2: Get real driving distances from Madurai using Google Routes API
                Promise.all(so_promises).then((rows) => {
                    let cities = [...new Set(rows.map(r => r.party_location).filter(c => c))];

                    function applyAndSave(distanceMap) {
                        rows.forEach(row => {
                            let dist = distanceMap[row.party_location];
                            row.distance_from_madurai = dist !== undefined ? dist : get_distance_from_madurai(row.party_location);
                        });
                        frm.trigger('recalculate_load_type');
                        frm.refresh_field('items');
                    }

                    if (!cities.length) {
                        frm.trigger('recalculate_load_type');
                        return;
                    }

                    get_distances_via_routes_api(cities)
                        .then((map) => {
                            applyAndSave(map);
                        })
                        .catch(() => {
                            // Fallback to hardcoded map if API fails
                            let fallback = {};
                            cities.forEach(c => fallback[c] = get_distance_from_madurai(c));
                            applyAndSave(fallback);
                        });
                });
            }
        });
    },

    total_weight: function (frm) {
        frm.trigger('show_load_type_indicator');
    },

    calculate_loading_sequence: function (frm) {
        let items = frm.doc.items || [];
        if (!items.length) {
            frm.refresh_field('items');
            return;
        }

        // Find all belt cities in a flat set
        let all_belt_cities = new Set();
        ROUTE_BELTS.forEach(belt => belt.forEach(c => all_belt_cities.add(c)));

        // Get city for each item (lowercase)
        function get_city(item) {
            return (item.party_location || '').trim().toLowerCase();
        }

        // Find the best matching belt for known cities (ignore customer names / unknowns)
        let known_cities = new Set();
        items.forEach(item => {
            let city = get_city(item);
            if (!city) return;
            // Check if it matches any belt city
            for (let bc of all_belt_cities) {
                if (city === bc || city.includes(bc) || bc.includes(city)) {
                    known_cities.add(city);
                    break;
                }
            }
        });

        let active_belt = null;
        // Perfect subset match first
        for (let belt of ROUTE_BELTS) {
            let belt_set = new Set(belt);
            let all_match = true;
            for (let city of known_cities) {
                let found = false;
                for (let bc of belt_set) {
                    if (city === bc || city.includes(bc) || bc.includes(city)) { found = true; break; }
                }
                if (!found) { all_match = false; break; }
            }
            if (all_match && known_cities.size > 0) {
                active_belt = belt;
                break;
            }
        }
        // Fallback: most matching belt
        if (!active_belt) {
            let max_matches = 0;
            for (let belt of ROUTE_BELTS) {
                let count = 0;
                for (let city of known_cities) {
                    for (let bc of belt) {
                        if (city === bc || city.includes(bc) || bc.includes(city)) { count++; break; }
                    }
                }
                if (count > max_matches) { max_matches = count; active_belt = belt; }
            }
        }

        function get_sort_key(item) {
            let city = get_city(item);
            if (active_belt) {
                for (let idx = 0; idx < active_belt.length; idx++) {
                    let bc = active_belt[idx];
                    if (city === bc || city.includes(bc) || bc.includes(city)) {
                        return [1, idx];
                    }
                }
            }
            // Unknown city: fallback to distance, sorted at the end
            let dist = flt(item.distance_from_madurai) || get_distance_from_madurai(item.party_location);
            return [0, dist];
        }

        items.sort((a, b) => {
            let ka = get_sort_key(a), kb = get_sort_key(b);
            if (ka[0] !== kb[0]) return kb[0] - ka[0];
            return kb[1] - ka[1]; // higher index = Inside = first
        });

        // Assign labels
        if (frm.doc.load_type === 'Full Load') {
            items.forEach(item => { item.loading_sequence = 'Full Load'; });
        } else {
            let n = items.length;
            if (n === 1) {
                items[0].loading_sequence = 'Full Load';
            } else if (n === 2) {
                items[0].loading_sequence = 'Inside';
                items[1].loading_sequence = 'Outside';
            } else {
                items[0].loading_sequence = 'Inside';
                items[n - 1].loading_sequence = 'Outside';
                let center_num = 1;
                for (let i = 1; i < n - 1; i++) {
                    items[i].loading_sequence = 'Center ' + center_num;
                    center_num++;
                }
            }
        }

        items.forEach((item, idx) => { item.idx = idx + 1; });
        frm.refresh_field('items');
    },



});

frappe.ui.form.on('Clubbing Sheet Item', {
    view_rolls: function (frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        console.log("FINAL BUTTON CLICK HANDLER! Row:", row.name);

        let order_code = row.party_code || row.order_code || row.sales_order;
        let alt_code = row.sales_order || row.party_code;

        console.log("Starting Fetch Logic for:", order_code);

        if (!order_code) {
            frappe.msgprint(__('Order reference missing. Cannot view rolls.'));
            return;
        }

        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Shaft Production Run',
                filters: [
                    ['custom_order_code', 'in', [order_code, alt_code].filter(Boolean)],
                    ['docstatus', '=', 1]
                ],
                fields: ['name', 'custom_unit', 'custom_order_code']
            },
            callback: function (rp) {
                let runs = rp.message || [];
                console.log("Step 1: Found runs:", runs.length);

                if (!runs.length) {
                    frappe.msgprint(__('No production records found for this order.'));
                    return;
                }

                let run_names = runs.map(r => r.name);
                console.log("Step 1b: Fetching full details for runs...");

                let fetch_promises = run_names.map(run_name => {
                    return new Promise((resolve_fetch) => {
                        frappe.call({
                            method: 'frappe.client.get',
                            args: { doctype: 'Shaft Production Run', name: run_name },
                            callback: (res) => {
                                let doc = res.message || {};
                                let matched_items = (doc.items || []).filter(item => {
                                    // Only show rolls for which stock has been entry (Submited)
                                    // And match correctly with the order code provided
                                    let item_order = item.party_code || item.custom_order_code;
                                    return (item_order === order_code || item_order === alt_code) && flt(item.net_weight) > 0;
                                });
                                // Inject parent name and info into items for the dialog
                                matched_items.forEach(item => {
                                    item.parent_run = doc.name;
                                    item.run_date = doc.run_date || doc.posting_date;
                                });
                                resolve_fetch(matched_items);
                            }
                        });
                    });
                });

                Promise.all(fetch_promises).then((all_item_batches) => {
                    let rolls = [].concat(...all_item_batches);
                    console.log("Step 2: Collected rolls across all runs:", rolls.length);

                    if (!rolls.length) {
                        frappe.msgprint(__('No weighed rolls found for this order in the production records.'));
                        return;
                    }

                    // Step 3: Filter rolls to only show those currently IN STOCK (Available Qty > 0)
                    // Referencing the logic in "Stock Available report"
                    let batch_nos = rolls.map(r => r.batch_no).filter(Boolean);

                    if (batch_nos.length > 0) {
                        // Directly show the rolls from the submitted production runs
                        // strictly filtering for docstatus: 1 (Completed/Not Draft)
                        show_rolls_dialog_JSB(frm, {
                            rolls: rolls,
                            sales_order: order_code
                        });
                    } else {
                        frappe.msgprint(__('No rolls found for this order in the submitted production records.'));
                    }
                });
            }
        });
    },

    items_remove: function (frm) {
        frm.trigger('recalculate_load_type');
    }
});

const ROUTE_BELTS = [
    ["madurai", "virudhunagar", "sivakasi", "tuticorin"],
    ["madurai", "karur", "coimbatore"],
    ["madurai", "karur", "erode", "salem"],
    ["madurai", "dindigul", "karur", "salem"],
    ["madurai", "pondicherry", "vellore", "kanchipuram", "chennai"],
    ["madurai", "trivandrum", "changanacherry"],
    ["madurai", "kollam", "kayankulam", "pathanamthitta", "kottayam"],
    ["madurai", "coimbatore", "palakkad", "trissur", "ernakulam"],
    ["madurai", "coimbatore", "pallakad", "trissur", "malappuram", "kozhikode", "mahe", "kannur", "kasargod", "mangaluru", "uduppi"],
    ["madurai", "mysore", "hassan", "shimoga", "dawangeree"],
    ["madurai", "salem", "hosur", "bangalore", "dawangeree"],
    ["madurai", "mysore", "bangalore"],
    ["madurai", "bangalore", "tumkur", "hospet", "koppal"],
    ["madurai", "ananthapur", "kurnool", "hyderabad", "karimnagar"],
    ["madurai", "ananthapur", "kurnool", "hyderabad", "nizambad"],
    ["madurai", "kurnool", "hyderabad", "warangal"],
    ["madurai", "vizag", "bhuvaneswar", "cuttack"],
    ["madurai", "brahmbur", "bhubaneswar", "cuttack"],
    ["madurai", "guntur", "vijayawada", "kakinada"],
    ["madurai", "kakinada", "vizag"],
    ["madurai", "kuppam", "palamaner", "bangalore"],
    ["madurai", "bangalore", "hospete", "vijayapura"],
    ["madurai", "bangalore", "belgaum", "goa"],
    ["madurai", "bangalore", "hospete", "vijayapura", "satara", "pune", "mumbai"]
];

// -----------------------------------------------------------------------
// Distance from Madurai (in KM) — Road distance to South Indian cities
// Used to determine loading sequence: Furthest = Inside, Nearest = Outside
// -----------------------------------------------------------------------
const MADURAI_DISTANCES = {
    // Tamil Nadu
    "Madurai": 0,
    "Dindigul": 65,
    "Theni": 70,
    "Kodaikanal": 115,
    "Sivaganga": 55,
    "Ramanathapuram": 115,
    "Tiruchirappalli": 135,
    "Trichy": 135,
    "Thanjavur": 175,
    "Karur": 140,
    "Pudukkottai": 100,
    "Virudhunagar": 65,
    "Aruppukottai": 80,
    "Tirunelveli": 155,
    "Thoothukudi": 160,
    "Tuticorin": 160,
    "Nagercoil": 230,
    "Kanyakumari": 250,
    "Salem": 220,
    "Namakkal": 200,
    "Erode": 240,
    "Tirupur": 215,
    "Coimbatore": 210,
    "Pollachi": 180,
    "Palani": 120,
    "Oddanchatram": 95,
    "Tiruppathur": 90,
    "Paramakudi": 130,
    "Sattur": 95,
    "Kovilpatti": 130,
    "Padmanabhapuram": 205,
    "Sankarankoil": 125,
    "Srivilliputhur": 75,
    "Periyakulam": 85,
    "Usilampatti": 45,
    "Gudalur": 130,
    "Nilgiris": 265,
    "Ooty": 265,
    "Vellore": 410,
    "Chennai": 455,
    "Chengalpattu": 420,
    "Kanchipuram": 440,
    "Pondicherry": 395,
    "Cuddalore": 365,
    "Villupuram": 370,
    "Tiruvannamalai": 400,
    "Dharmapuri": 320,
    "Krishnagiri": 355,
    "Hosur": 385,
    "Nagapattinam": 280,
    "Kumbakonam": 215,
    "Mayiladuthurai": 250,
    "Ariyalur": 175,
    "Perambalur": 160,
    "Sivakasi": 80,
    "Cumbum": 90,
    "Thenkasi": 115,
    "Courtallam": 120,
    "Tenkasi": 115,
    "Melur": 30,
    "Manamadurai": 60,
    "Rajapalayam": 100,

    // Kerala
    "Thiruvananthapuram": 290,
    "Trivandrum": 290,
    "Kollam": 250,
    "Quilon": 250,
    "Pathanamthitta": 215,
    "Alappuzha": 200,
    "Alleppey": 200,
    "Kottayam": 185,
    "Idukki": 145,
    "Kumily": 130,
    "Munnar": 140,
    "Ernakulam": 220,
    "Kochi": 220,
    "Cochin": 220,
    "Thrissur": 280,
    "Palakkad": 250,
    "Malappuram": 320,
    "Kozhikode": 360,
    "Calicut": 360,
    "Wayanad": 345,
    "Kannur": 430,
    "Cannanore": 430,
    "Kasaragod": 490,
    "Muvattupuzha": 235,
    "Muvuttupuzha": 235,
    "Thodupuzha": 205,
    "Pala": 195,
    "Changanacherry": 195,

    // Karnataka
    "Bengaluru": 445,
    "Bangalore": 445,
    "Mysuru": 370,
    "Mysore": 370,
    "Hassan": 395,
    "Mangaluru": 490,
    "Mangalore": 490,
    "Udupi": 530,
    "Puttur": 480,
    "Shimoga": 485,
    "Davangere": 510,
    "Hubli": 600,
    "Dharwad": 610,
    "Tumkur": 475,
    "Kolar": 430,
    "Mandya": 390,
    "Chamarajanagar": 390,
    "Ramanagara": 420,
    "Chikmagalur": 450,
    "Kodagu": 420,
    "Madikeri": 420,
    "Virajpet": 405,

    // Andhra Pradesh / Telangana
    "Chittoor": 480,
    "Tirupati": 530,
    "Nellore": 520,
    "Hyderabad": 770,
    "Guntur": 650,
    "Vijayawada": 680,
    "Vizag": 970,
    "Warangal": 850,

    // Odisha
    "Bhubaneswar": 1650,
    "Cuttack": 1680,
    "Puri": 1700,
    "Sambalpur": 1800,
    "Rourkela": 1850,
    "Berhampur": 1520,
    "Brahmapur": 1520,

    // Puducherry
    "Puducherry": 395,
    "Pondicherry": 395,

    // Maharashtra
    "Mumbai": 1450,
    "Pune": 1250
};

function get_distance_from_madurai(city) {
    if (!city) return 0;
    // Exact match
    if (MADURAI_DISTANCES[city] !== undefined) return MADURAI_DISTANCES[city];
    // Case-insensitive match
    let lower = city.toLowerCase();
    for (let key in MADURAI_DISTANCES) {
        if (key.toLowerCase() === lower) return MADURAI_DISTANCES[key];
    }
    // Partial match (e.g. "Coimbatore District" → "Coimbatore")
    for (let key in MADURAI_DISTANCES) {
        if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
            return MADURAI_DISTANCES[key];
        }
    }
    return 0;
}

// -----------------------------------------------------------------------
// Google Routes API — Real driving distances from Madurai
// Uses the new computeRouteMatrix endpoint (replaces deprecated Distance Matrix)
// Requires "Routes API" enabled in Google Cloud Console for this key.
// Falls back to hardcoded map automatically if API fails.
// -----------------------------------------------------------------------
const GOOGLE_MAPS_API_KEY = "AIzaSyAMXFditiCwXt-mTi7Uej44g7phap1NXpQ";

async function get_distances_via_routes_api(cities) {
    const body = {
        origins: [{ waypoint: { address: "Madurai, Tamil Nadu, India" } }],
        destinations: cities.map(city => ({ waypoint: { address: city + ", India" } })),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE"
    };

    const response = await fetch(
        "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
                "X-Goog-FieldMask": "originIndex,destinationIndex,distanceMeters,status"
            },
            body: JSON.stringify(body)
        }
    );

    if (!response.ok) {
        throw new Error("Routes API HTTP error: " + response.status);
    }

    const data = await response.json();

    // data is an array of route matrix elements
    let distanceMap = {};
    if (Array.isArray(data)) {
        data.forEach(element => {
            let cityName = cities[element.destinationIndex];
            if (cityName && element.distanceMeters) {
                distanceMap[cityName] = Math.round(element.distanceMeters / 1000);
            }
        });
    }

    return distanceMap;
}
