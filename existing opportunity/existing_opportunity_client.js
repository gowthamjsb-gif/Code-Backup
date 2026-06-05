frappe.ui.form.on('Existing Opportunity', {
    refresh: function(frm) {
        frm.trigger('toggle_fields');
        frm.trigger('auto_detect_stage_change');
        frm.trigger('fetch_sales_order_info');
    },
    deals_stage: function(frm) {
        frm.trigger('toggle_fields');
    },

    // ---- Field Visibility Logic ----
    toggle_fields: function(frm) {
        let stage = frm.doc.deals_stage;
        let isQuotation = (stage === 'Quotation');
        let isProforma = (stage === 'Proforma Invoice');

        frm.toggle_display('create_quotation', isQuotation);
        frm.toggle_display('quotation_id', isQuotation || isProforma);
        frm.toggle_display('sales_order_id', isProforma);
        frm.toggle_display('order_code', isProforma);
    },

    // ---- Auto-detect: if SO exists for linked Quotation, advance stage ----
    auto_detect_stage_change: function(frm) {
        if (frm.doc.deals_stage !== 'Quotation') return;
        if (!frm.doc.quotation_id) return;
        if (frm._stage_detect_done) return;
        frm._stage_detect_done = true;

        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Sales Order',
                filters: [
                    ['Sales Order Item', 'prevdoc_docname', '=', frm.doc.quotation_id]
                ],
                fields: ['name', 'custom_party_code', 'docstatus'],
                limit_page_length: 1,
                order_by: 'creation desc'
            },
            callback: function(r) {
                if (!r.message || r.message.length === 0) {
                    frm._stage_detect_done = false;
                    return;
                }

                let so = r.message[0];
                let updates = {
                    deals_stage: 'Proforma Invoice',
                    sales_order_id: so.name
                };

                if (so.docstatus === 1 && so.custom_party_code) {
                    updates.order_code = so.custom_party_code;
                }

                frappe.call({
                    method: 'frappe.client.set_value',
                    args: {
                        doctype: 'Existing Opportunity',
                        name: frm.doc.name,
                        fieldname: updates  
                    },
                    callback: function() {
                        frm._so_fetch_done = true;
                        frm.reload_doc();
                        frappe.show_alert({
                            message: 'Sales Order ' + so.name + ' detected — stage updated to Proforma Invoice!',
                            indicator: 'green'
                        });
                    }
                });
            }
        });
    },

    // ---- Fetch missing SO details at Proforma Invoice stage ----
    fetch_sales_order_info: function(frm) {
        if (frm.doc.deals_stage !== 'Proforma Invoice') return;
        if (!frm.doc.quotation_id) return;
        if (frm.doc.sales_order_id && frm.doc.order_code) return;
        if (frm._so_fetch_done) return;
        frm._so_fetch_done = true;

        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Sales Order',
                filters: [
                    ['Sales Order Item', 'prevdoc_docname', '=', frm.doc.quotation_id]
                ],
                fields: ['name', 'custom_party_code', 'docstatus'],
                limit_page_length: 1,
                order_by: 'creation desc'
            },
            callback: function(r) {
                if (!r.message || r.message.length === 0) {
                    frm._so_fetch_done = false;
                    return;
                }

                let so = r.message[0];
                let updates = {};

                if (!frm.doc.sales_order_id) {
                    updates.sales_order_id = so.name;
                }

                if (!frm.doc.order_code && so.docstatus === 1 && so.custom_party_code) {
                    updates.order_code = so.custom_party_code;
                }

                if (Object.keys(updates).length > 0) {
                    frappe.call({
                        method: 'frappe.client.set_value',
                        args: {
                            doctype: 'Existing Opportunity',
                            name: frm.doc.name,
                            fieldname: updates
                        },
                        callback: function() {
                            frm.reload_doc();
                            frappe.show_alert({
                                message: 'Sales Order info linked successfully!',
                                indicator: 'green'
                            });
                        }
                    });
                }
            }
        });
    },

    // ---- Create Quotation Button Handler ----
    create_quotation: function(frm) {
        if (!frm.doc.customer) {
            frappe.msgprint(__('Please select a Customer first.'));
            return;
        }

        let customer = frm.doc.customer;
        let oppName = frm.doc.name;

        let newTab = window.open('/app/quotation/new-quotation-1', '_blank');

        frappe.show_alert({
            message: 'Opening new Quotation tab...',
            indicator: 'blue'
        });

        let customerSet = false;
        let attempts = 0;

        let checkInterval = setInterval(() => {
            attempts++;

            try {
                if (newTab.closed) {
                    clearInterval(checkInterval);
                    frm.reload_doc();
                    return;
                }

                if (!customerSet && newTab.cur_frm && newTab.cur_frm.doc && newTab.cur_frm.is_new()) {
                    newTab.cur_frm.set_value('quotation_to', 'Customer').then(() => {
                        return newTab.cur_frm.set_value('party_name', customer);
                    }).then(() => {
                        newTab.frappe.show_alert({
                            message: 'Customer auto-filled from Opportunity: ' + oppName,
                            indicator: 'blue'
                        });
                    });
                    customerSet = true;
                }

                if (customerSet && newTab.cur_frm && newTab.cur_frm.doc && !newTab.cur_frm.is_new()) {
                    let quotationName = newTab.cur_frm.doc.name;

                    frappe.db.set_value('Existing Opportunity', oppName, 'quotation_id', quotationName)
                        .then(() => {
                            frm.reload_doc();
                            frappe.show_alert({
                                message: 'Quotation ' + quotationName + ' linked successfully!',
                                indicator: 'green'
                            });
                        });

                    clearInterval(checkInterval);
                }
            } catch(e) {
                // Ignore errors while the new tab is still loading
            }

            if (attempts > 120) {
                clearInterval(checkInterval);
            }
        }, 1000);
    }
});
