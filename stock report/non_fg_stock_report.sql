SELECT 
    b.item_code as "Item Code:Link/Item:150", 
    i.item_name as "Item Name:Data:150", 
    i.item_group as "Item Group:Data:150",
    i.stock_uom as "Unit:Data:100", 
    b.actual_qty as "Available Qty:Float:120",
    b.warehouse as "Warehouse:Link/Warehouse:150"
FROM 
    `tabBin` b
LEFT JOIN
    `tabItem` i ON i.name = b.item_code
WHERE 
    (i.item_group != 'Products' OR i.item_group IS NULL)
    AND b.actual_qty > 0
ORDER BY 
    i.item_group ASC,
    b.item_code DESC
