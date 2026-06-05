SELECT 
    sle.item_code as "Item Code:Link/Item:150", 
    i.item_name as "Item Name:Data:150", 
    pp.custom_unit as "Unit:Data:100", 
    cust.customer_name as "Customer Name:Data:150", 
    COALESCE(sbbe.batch_no, sle.batch_no) as "Batch:Link/Batch:150", 
    b.custom_party_code_text as "Order Code:Data:120", 
    b.custom_net_weight as "Net Weight (Kgs):Float:120", 
    b.custom_gross_weight as "Gross Weight (Kgs):Float:120", 
    b.custom_meter as "Meters:Float:120",
    SUM(COALESCE(sbbe.qty, sle.actual_qty)) as "Available Qty:Float:120",
    sle.warehouse as "Warehouse:Link/Warehouse:150"
FROM 
    `tabStock Ledger Entry` sle
LEFT JOIN
    `tabSerial and Batch Entry` sbbe ON sbbe.parent = sle.serial_and_batch_bundle AND sle.serial_and_batch_bundle IS NOT NULL AND sle.serial_and_batch_bundle != ''
LEFT JOIN
    `tabItem` i ON i.name = sle.item_code
LEFT JOIN
    `tabBatch` b ON b.name = COALESCE(sbbe.batch_no, sle.batch_no)
-- Joining via the production chain to get Production Plan details
LEFT JOIN
    `tabStock Entry Detail` sed ON sed.batch_no = b.name AND sed.is_finished_item = 1
LEFT JOIN
    `tabStock Entry` se ON se.name = sed.parent
LEFT JOIN
    `tabWork Order` wo ON wo.name = se.work_order
LEFT JOIN
    `tabProduction Plan` pp ON pp.name = wo.production_plan
LEFT JOIN
    `tabCustomer` cust ON cust.name = pp.customer
WHERE 
    sle.is_cancelled = 0
    AND i.item_group = 'Products'
GROUP BY 
    sle.item_code, 
    COALESCE(sbbe.batch_no, sle.batch_no),
    sle.warehouse,
    pp.custom_unit,
    cust.customer_name
HAVING 
    SUM(COALESCE(sbbe.qty, sle.actual_qty)) > 0 
ORDER BY 
    sle.item_code ASC, 
    COALESCE(sbbe.batch_no, sle.batch_no) ASC