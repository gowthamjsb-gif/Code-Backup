frappe.ui.form.on('Shaft Production Run', {
    refresh: function (frm) {
        // Start the shift reminder check when the form loads
        start_shift_reminder(frm);
    }
});

// Variable to keep track of whether we've already shown the popup so it doesn't spam the user
var reminder_shown = false;
var reminder_interval = null;

function redirect_to_production_entry(frm) {
    // Calculate shift based on time (6 AM to 6 PM is Day Shift, otherwise Night Shift)
    var current_hour = new Date().getHours();
    var shift_name = (current_hour >= 6 && current_hour < 18) ? "Day Shift" : "Night Shift";
    var posting_date = frappe.datetime.get_today();

    // Use URL query parameters for posting_date and shift
    var params = new URLSearchParams({
        posting_date: posting_date,
        shift: shift_name
    });

    var unit_val = frm.doc.custom_unit || frm.doc.unit || '';
    if (unit_val) params.append('unit', unit_val);
    if (frm.doc.company) params.append('company', frm.doc.company);

    // Open the new form in a new tab with the parameters in the URL
    window.open('/app/shift-wise-production-entry/new?' + params.toString(), '_blank');
}

function start_shift_reminder(frm) {
    // If we already started an interval, clear it so we don't have multiple running
    if (reminder_interval) {
        clearInterval(reminder_interval);
    }

    function check_reminder_time() {
        var now = new Date();
        var hours = now.getHours();
        var minutes = now.getMinutes();

        // --------------------------------------------------------------------------------
        var target_hour = 13;
        var target_minute = 30; // Update this to match your current time + 2 minutes

        console.log("Checking time... Current:", hours + ":" + minutes, " Target:", target_hour + ":" + target_minute);

        // Check if current time matches the target time and we haven't shown the popup yet
        if (hours === target_hour && minutes === target_minute && !reminder_shown) {

            // Mark as shown so it doesn't pop up again for the rest of this minute
            reminder_shown = true;

            // Add the button to the form only when the reminder triggers
            // This way, if they close the popup, the button will be visible on the form
            if (!frm.custom_buttons || !frm.custom_buttons['Close Batch']) {
                frm.add_custom_button(__('Close Batch'), function () {
                    redirect_to_production_entry(frm);
                }).addClass('btn-primary'); // Make it stand out
            }

            frappe.msgprint({
                title: __('Shift Ending Reminder'),
                indicator: 'orange',
                message: __('It is time to close the shift! <br>You will now be redirected to the Shift Wise Production Entry to get your Report.'),
                primary_action: {
                    label: __('Go to Production Entry'),
                    action: function () {
                        // Close the message popup
                        frappe.hide_msgprint();
                        redirect_to_production_entry(frm);
                    }
                }
            });
        }

        // Reset the reminder flag if the minute has passed, so it works again tomorrow
        if (hours !== target_hour || minutes !== target_minute) {
            reminder_shown = false;
        }
    }

    // Call it immediately once so you see the console log instantly!
    check_reminder_time();

    // Check the time every 30 seconds
    reminder_interval = setInterval(check_reminder_time, 30000);
}
