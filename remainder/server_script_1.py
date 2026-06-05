# No imports needed in Frappe Server Scripts. frappe.utils is already available.
current_time = frappe.utils.now_datetime()
 
# Currently running immediately for testing.
# Once working, change back to: if current_time.hour == 9 and current_time.minute == 00:
if True:
    frappe.log_error("FOLLOW UP REMINDER STARTED")
 
    # Note: If you get a "Table doesn't exist" error, change `tabCustom Call Remarks`
    # to exactly match your database table name (e.g., `tabcustom_call_remarks`)
    rows = frappe.db.sql("""
        SELECT
            lead.lead_name AS customer,
            opp.opportunity_owner AS user,
            cr.remarks,
            cr.followup_date,
            opp.name AS opportunity,
            cr.parent AS parent
        FROM
            `tabLead Call Remarks` cr
        INNER JOIN
            (
                SELECT parent, MAX(idx) AS max_idx
                FROM `tabLead Call Remarks`
                GROUP BY parent
            ) cr_latest ON cr.parent = cr_latest.parent AND cr.idx = cr_latest.max_idx
        LEFT JOIN
            `tabOpportunity` opp ON opp.name = cr.parent
        LEFT JOIN
            `tabLead` lead ON lead.name = opp.party_name
        WHERE
            cr.followup_date = CURDATE()
            AND opp.opportunity_owner IS NOT NULL
            AND opp.opportunity_owner != ''
    """, as_dict=True)
 
    # Use standard dictionary grouping instead of defaultdict to avoid import restrictions
    grouped = {}
    for row in rows:
        if row.user not in grouped:
            grouped[row.user] = []
        grouped[row.user].append(row)
 
    for user, user_rows in grouped.items():
        table_rows = ""
        for row in user_rows:
            table_rows += f"""
<tr>
<td>{row.customer or ''}</td>
<td>{row.opportunity or ''}</td>
<td>{row.remarks or ''}</td>
<td>{str(row.followup_date or '')}</td>
</tr>
            """
 
        frappe.sendmail(
            recipients=[
                user,
                "dharsofficialacc@gmail.com",
                "dharshan.ss@jayashreespunbond.in",
                "gowthamjsb@gmail.com",
                "devadharshana.erp@gmail.com",
            ],
            subject="Today's Follow Up Reminder",
            message=f"""
<h3>Today's Follow Up Reminder</h3>
<p>Here are the leads you need to follow up with today (based on the latest call remarks):</p>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
<tr>
<th>Customer</th>
<th>Opportunity</th>
<th>Remarks</th>
<th>Followup Date</th>
</tr>
                    {table_rows}
</table>
            """
        )
 
        frappe.publish_realtime(
            event="eval_js",
            message='frappe.show_alert({message: "Today Follow Up Reminder", indicator: "blue"})',
            user=user
        )
