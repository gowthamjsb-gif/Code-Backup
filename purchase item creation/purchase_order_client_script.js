// Purchase Order Client Script for Automatic Item Creation
// This script should be added to the Client Script for DocType: Purchase Order

frappe.ui.form.on('Purchase Order', {
    // ── TRIGGER CREATION ON SAVE ─────────────────────────────────────────
    before_save: function(frm) {
        // If we are already in the middle of creating items, don't trigger again
        if (frm._creating_auto_items) return;

        // Find all rows that are ready to be created (have all required info but still using placeholder)
        let pending = (frm.doc.items || []).filter(row => 
            row.item_code === "AUTO-ITEM" && 
            row.custom_category && 
            row.custom_product && 
            row.gst_hsn_code && 
            row.uom
        );

        if (pending.length > 0) {
            // Stop the standard save process
            frappe.validated = false;
            
            // Start the sequential creation process
            process_pending_rows(frm, pending);
        }
    }
});

frappe.ui.form.on('Purchase Order Item', {
    // ── SET PLACEHOLDER WHEN PRODUCT IS ENTERED ──────────────────────────
    custom_product: function(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        if (row.custom_product) {
            // Convert to UPPERCASE immediately
            const upper_product = row.custom_product.toUpperCase();
            if (row.custom_product !== upper_product) {
                frappe.model.set_value(cdt, cdn, 'custom_product', upper_product);
            }
            // Set temporary Item Code so the user can save the row
            if (!row.item_code) {
                frappe.model.set_value(cdt, cdn, 'item_code', "AUTO-ITEM");
            }
        }
    },

    // Ensure Placeholder is set if any other info is added first
    custom_category: function(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        if (row.custom_product && !row.item_code) {
            frappe.model.set_value(cdt, cdn, 'item_code', "AUTO-ITEM");
        }
    },
    
    gst_hsn_code: function(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        if (row.custom_product && !row.item_code) {
            frappe.model.set_value(cdt, cdn, 'item_code', "AUTO-ITEM");
        }
    },

    uom: function(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        if (row.custom_product && !row.item_code) {
            frappe.model.set_value(cdt, cdn, 'item_code', "AUTO-ITEM");
        }
    }
});

// ── HELPER: PROCESS PENDING ROWS SEQUENTIALLY ─────────────────────────────
async function process_pending_rows(frm, pending_rows) {
    frm._creating_auto_items = true;
    frappe.dom.freeze("Creating items from Product details...");

    try {
        for (let row of pending_rows) {
            // Call the server API for each row
            const r = await frappe.call({
                method: "create_auto_item",
                args: {
                    category: row.custom_category,
                    item_name: row.custom_product,
                    hsn_code: row.gst_hsn_code,
                    uom: row.uom,
                    company: frm.doc.company
                }
            });

            if (r.message) {
                const data = r.message;
                if (data.status === "created" || data.status === "exists") {
                    // Update the actual row with the real item code
                    frappe.model.set_value(row.doctype, row.name, 'item_code', data.item_code);
                    if (data.item_name) {
                        frappe.model.set_value(row.doctype, row.name, 'item_name', data.item_name);
                    }
                    
                    frappe.show_alert({
                        message: data.message,
                        indicator: data.status === "created" ? "green" : "orange"
                    }, 5);
                }
            }
        }
        
        // Once all finished, trigger the save again
        frm._creating_auto_items = false;
        frappe.dom.unfreeze();
        
        // Re-trigger save
        frm.save();

    } catch (err) {
        console.error(err);
        frm._creating_auto_items = false;
        frappe.dom.unfreeze();
        frappe.msgprint("Error during automatic item creation. Please check the logs.");
    }
}
