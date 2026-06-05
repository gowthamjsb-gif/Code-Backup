// ---------------------------------------------------------------------------------
// 1. STANDARD FORM VIEW
// ---------------------------------------------------------------------------------
frappe.ui.form.on('Customer', {
    gstin: function (frm) {
        if (!frm.doc.gstin || frm.doc.gstin.length < 2) return;
        let gst = frm.doc.gstin.trim().toUpperCase();
        frm.set_value('gstin', gst);

        let state_code = gst.substring(0, 2);
        let series_map = {
            '33': 'TN-.####', '32': 'KL-.####', '29': 'KN-.####',
            '36': 'TG-.####', '37': 'AP-.####', '21': 'OD-.####',
            '23': 'MP-.####', '27': 'MH-.####', '34': 'PY-.####'
        };

        if (series_map[state_code]) {
            frm.set_value('naming_series', series_map[state_code]);
        }
    }
});

// =================================================================================
// THE "FALSE SUCCESS TOAST" ANNIHILATOR (FRAPPE 16 BUG WORKAROUND)
// =================================================================================
// Because Frappe 16 List Views and Quick Entry forms employ "Optimistic Updates", 
// the UI physically paints a "Saved" toast to the screen *before* the server's 
// `frappe.throw` rejection comes back. This raw DOM hook operates faster than human 
// vision to tear that fake toast out of the DOM.

$(document).ready(function () {
    if (window.ultimate_toast_hider_active) return;
    window.ultimate_toast_hider_active = true;

    const killFalseSuccessToast = () => {
        let pageText = document.body.innerText || "";
        // If the red Duplicate error is anywhere on screen
        if (pageText.includes('already exists in Customer') || pageText.includes('Duplicate GSTIN')) {
            // Find all possible Frappe alert containers
            const alertSelectors = ['.alert', '.toast', '.desk-alert', '.frappe-alert', '#alert-container > div', '.msgprint-dialog'];

            alertSelectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => {
                    let text = el.innerText ? el.innerText.toLowerCase() : "";

                    // IF it claims to be a success/"saved", destroy it instantly
                    if (text.includes('saved')) {
                        el.style.setProperty('display', 'none', 'important');
                        el.style.setProperty('opacity', '0', 'important');
                        el.style.setProperty('visibility', 'hidden', 'important');
                        el.remove(); // Unhook it from the DOM
                    }
                });
            });

            // Just to be safe, also aggressively clear the optimistic row from the List View Grid
            setTimeout(() => {
                $('.list-row:contains("new-customer")').hide().remove();
            }, 10);
        }
    };

    // 1. Mutation Observer: Fires literally the millisecond Frappe inserts the toast
    const observer = new MutationObserver(() => {
        killFalseSuccessToast();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    // 2. High-Frequency Poller: Sweeps the page 100 times per second to catch stragglers
    setInterval(killFalseSuccessToast, 10);
});

