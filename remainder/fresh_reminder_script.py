# --- SCRIPT CONFIGURATION ---
CHILD_TABLE_NAME = "tabLead Call Remarks" 

# --- MAIN LOGIC ---
frappe.log_error("11:36 AM FOLLOW UP REMINDER TRIGGERED")

query = f"""
    SELECT
        lead.lead_name AS customer,
        cr.called_by AS user,
        opp.owner AS owner,
        cr.remarks,
        cr.followup_date,
        opp.name AS opportunity
    FROM
        `{CHILD_TABLE_NAME}` cr
    INNER JOIN
        (
            SELECT parent, MAX(idx) AS max_idx
            FROM `{CHILD_TABLE_NAME}`
            GROUP BY parent
        ) cr_latest ON cr.parent = cr_latest.parent AND cr.idx = cr_latest.max_idx
    LEFT JOIN
        `tabOpportunity` opp ON opp.name = cr.parent
    LEFT JOIN
        `tabLead` lead ON lead.name = opp.party_name
    WHERE
        cr.followup_date = CURDATE()
        AND cr.called_by IS NOT NULL
        AND cr.called_by != ''
"""

try:
    rows = frappe.db.sql(query, as_dict=True)
    
    # Group leads by the user who made the call
    grouped = {}
    for row in rows:
        # --- Safely fetch extra fields using Frappe ORM to avoid SQL crashes! ---
        opp_owner_email = ""
        opp_owner_name = ""
        company_name = ""
        
        try:
            opp_owner_email = frappe.db.get_value("Opportunity", row.opportunity, "opportunity_owner")
        except Exception:
            pass
            
        try:
            opp_owner_name = frappe.db.get_value("Opportunity", row.opportunity, "owner_name")
        except Exception:
            pass
            
        try:
            lead_id = frappe.db.get_value("Opportunity", row.opportunity, "party_name")
            if lead_id:
                company_name = frappe.db.get_value("Lead", lead_id, "company_name")
        except Exception:
            pass
        
        # Determine what to display for the owner
        display_owner = opp_owner_name or opp_owner_email or "Unknown"
        row["display_owner"] = display_owner
        
        row["company_name"] = company_name or "N/A"
        # ------------------------------------------------------------------------

        if row.user not in grouped:
            grouped[row.user] = []
        grouped[row.user].append(row)

    # DEBUG: Show exactly how many leads we found and are about to email
    frappe.msgprint(f"DEBUG: Successfully processed {len(rows)} leads and queued emails for {len(grouped)} users.", indicator="blue")

    # Send emails
    for user, user_rows in grouped.items():
        table_rows = ""
        for row in user_rows:
            table_rows += f"""
<tr>
<td>{row.company_name}</td>
<td>{row.customer or 'N/A'}</td>
<td>{row.opportunity or 'N/A'}</td>
<td>{row.display_owner}</td>
<td>{row.remarks or 'N/A'}</td>
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
<p>Here are the leads that need follow up today:</p>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; width: 100%;">
<tr style="background-color: #f8f9fa;">
<th>Company</th>
<th>Customer</th>
<th>Opportunity</th>
<th>Opp. Owner</th>
<th>Last Remarks</th>
<th>Followup Date</th>
</tr>
{table_rows}
</table>
            """
        )

        frappe.msgprint(f"Follow Up Reminder Sent for {user}!", indicator="green")

except Exception as e:
    frappe.log_error(f"Error in Reminder Script: {str(e)}")
    frappe.throw(f"Error in Script: Make sure CHILD_TABLE_NAME is correct. Detailed Error: {str(e)}")
