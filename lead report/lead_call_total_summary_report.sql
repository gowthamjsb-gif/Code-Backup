SELECT
    child.date AS "Date:Date:100",
    child.time AS "Time:Time:100",
    opp.opportunity_owner AS "Opportunity Owner:Link/User:140",
    COALESCE(opp.title, opp.customer_name, opp.party_name, '') AS "Company Name:Data:150",
    COALESCE(opp.party_name, opp.customer_name, '') AS "Party Name:Data:150",
    COALESCE(lead.city, '') AS "City:Data:100",
    COALESCE(opp.custom_sales_group, lead.custom_sales_group, '') AS "Sales Stage:Data:120",
    child.call_status AS "Call Status:Data:120",
    child.follow_up AS "Follow Up Stages:Data:120",
    COALESCE(opp.custom_requirement, lead.custom_requirement, '') AS "Requirement:Data:180",
    CASE
        WHEN COALESCE(
            NULLIF(CAST(NULLIF(TRIM(CAST(opp.custom_monthly_fabric_need_kgs AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(opp.custom_monthly_fabric_requirement_kgs AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(opp.custom_monthly_fabric_requirement_kg AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(lead.custom_monthly_fabric_need_kgs AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(lead.custom_monthly_fabric_requirement_kgs AS CHAR)), '') AS DECIMAL(18, 6)), 0)
        ) IS NULL THEN ''
        ELSE CAST(COALESCE(
            NULLIF(CAST(NULLIF(TRIM(CAST(opp.custom_monthly_fabric_need_kgs AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(opp.custom_monthly_fabric_requirement_kgs AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(opp.custom_monthly_fabric_requirement_kg AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(lead.custom_monthly_fabric_need_kgs AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(lead.custom_monthly_fabric_requirement_kgs AS CHAR)), '') AS DECIMAL(18, 6)), 0)
        ) AS CHAR)
    END AS "Fabric Requirement:Data:120",
    CASE
        WHEN COALESCE(
            NULLIF(CAST(NULLIF(TRIM(CAST(opp.custom_monthly_fabric_need_kgs AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(opp.custom_monthly_fabric_requirement_kgs AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(opp.custom_monthly_fabric_requirement_kg AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(lead.custom_monthly_fabric_need_kgs AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(lead.custom_monthly_fabric_requirement_kgs AS CHAR)), '') AS DECIMAL(18, 6)), 0)
        ) IS NULL THEN ''
        ELSE CAST(COALESCE(
            NULLIF(CAST(NULLIF(TRIM(CAST(opp.custom_monthly_fabric_need_kgs AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(opp.custom_monthly_fabric_requirement_kgs AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(opp.custom_monthly_fabric_requirement_kg AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(lead.custom_monthly_fabric_need_kgs AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(lead.custom_monthly_fabric_requirement_kgs AS CHAR)), '') AS DECIMAL(18, 6)), 0)
        ) AS CHAR)
    END AS "Fabric Need:Data:120",
    CASE
        WHEN COALESCE(
            NULLIF(CAST(NULLIF(TRIM(CAST(opp.custom_monthly_bag_need_pieces AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(opp.custom_monthly_bag_quantity_pieces AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(opp.custom_monthly_bag_quantity_pcs AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(lead.custom_monthly_bag_need_pieces AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(lead.custom_monthly_bag_quantity_pieces AS CHAR)), '') AS DECIMAL(18, 6)), 0)
        ) IS NULL THEN ''
        ELSE CAST(COALESCE(
            NULLIF(CAST(NULLIF(TRIM(CAST(opp.custom_monthly_bag_need_pieces AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(opp.custom_monthly_bag_quantity_pieces AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(opp.custom_monthly_bag_quantity_pcs AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(lead.custom_monthly_bag_need_pieces AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(lead.custom_monthly_bag_quantity_pieces AS CHAR)), '') AS DECIMAL(18, 6)), 0)
        ) AS CHAR)
    END AS "Bag Quantity:Data:120",
    CASE
        WHEN COALESCE(
            NULLIF(CAST(NULLIF(TRIM(CAST(opp.custom_monthly_bag_need_pieces AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(opp.custom_monthly_bag_quantity_pieces AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(opp.custom_monthly_bag_quantity_pcs AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(lead.custom_monthly_bag_need_pieces AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(lead.custom_monthly_bag_quantity_pieces AS CHAR)), '') AS DECIMAL(18, 6)), 0)
        ) IS NULL THEN ''
        ELSE CAST(COALESCE(
            NULLIF(CAST(NULLIF(TRIM(CAST(opp.custom_monthly_bag_need_pieces AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(opp.custom_monthly_bag_quantity_pieces AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(opp.custom_monthly_bag_quantity_pcs AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(lead.custom_monthly_bag_need_pieces AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(lead.custom_monthly_bag_quantity_pieces AS CHAR)), '') AS DECIMAL(18, 6)), 0)
        ) AS CHAR)
    END AS "Bag Need:Data:120",
    COALESCE(opp.custom_gsm, '') AS "Fabric GSM:Data:100",
    COALESCE(opp.custom_quality, '') AS "Quality:Data:100",
    COALESCE(opp.custom__width, '') AS "Width:Data:100",
    COALESCE(opp.custom_fabric_machinery_details, '') AS "Fabric Machinery Details:Data:150",
    COALESCE(opp.custom_bag_gsm, '') AS "Bag GSM:Data:100",
    COALESCE(opp.custom_bag_type, '') AS "Bag Type:Data:100",
    COALESCE(opp.custom_other_quality, '') AS "Other Quality:Data:100",
    COALESCE(opp.custom_machinery_details, '') AS "Bag Machinery Details:Data:150",
    COALESCE(opp.custom_colour, '') AS "Colour:Data:100",
    COALESCE(opp.custom_bag_quality, '') AS "Bag Quality:Data:100",
    COALESCE(opp.custom_bag_size, '') AS "Bag Size:Data:100",
    child.remarks AS "Remarks:Data:250"
FROM
    `tabLead Call Remarks` AS child
LEFT JOIN
    `tabOpportunity` AS opp ON child.parent = opp.name
LEFT JOIN
    `tabLead` AS lead ON opp.party_name = lead.name
WHERE
    child.parenttype = 'Opportunity'
    AND child.date >= %(from_date)s
    AND child.date <= %(to_date)s
    AND opp.opportunity_owner = %(user)s
    AND (
        COALESCE(
            NULLIF(CAST(NULLIF(TRIM(CAST(opp.custom_monthly_fabric_need_kgs AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(opp.custom_monthly_fabric_requirement_kgs AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(opp.custom_monthly_fabric_requirement_kg AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(lead.custom_monthly_fabric_need_kgs AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(lead.custom_monthly_fabric_requirement_kgs AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(opp.custom_monthly_bag_need_pieces AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(opp.custom_monthly_bag_quantity_pieces AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(opp.custom_monthly_bag_quantity_pcs AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(lead.custom_monthly_bag_need_pieces AS CHAR)), '') AS DECIMAL(18, 6)), 0),
            NULLIF(CAST(NULLIF(TRIM(CAST(lead.custom_monthly_bag_quantity_pieces AS CHAR)), '') AS DECIMAL(18, 6)), 0)
        ) IS NOT NULL
    )
    AND NOT EXISTS (
        SELECT
            1
        FROM
            `tabLead Call Remarks` AS newer_child
        WHERE
            newer_child.parenttype = 'Opportunity'
            AND newer_child.parent = child.parent
            AND newer_child.date >= %(from_date)s
            AND newer_child.date <= %(to_date)s
            AND (
                newer_child.date > child.date
                OR (
                    newer_child.date = child.date
                    AND COALESCE(newer_child.time, '00:00:00') > COALESCE(child.time, '00:00:00')
                )
            )
    )
ORDER BY
    child.date DESC,
    child.time DESC