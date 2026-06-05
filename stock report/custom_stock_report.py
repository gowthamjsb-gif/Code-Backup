import frappe

def execute(filters=None):
    columns = get_columns()
    data = get_data(filters)
    return columns, data

def get_columns():
    return [
        {
            "fieldname": "item_code",
            "label": "Item Code",
            "fieldtype": "Link",
            "options": "Item",
            "width": 150
        },
        {
            "fieldname": "item_name",
            "label": "Item Name",
            "fieldtype": "Data",
            "width": 200
        },
        {
            "fieldname": "item_group",
            "label": "Item Group",
            "fieldtype": "Data",
            "width": 150
        },
        {
            "fieldname": "unit",
            "label": "UOM",
            "fieldtype": "Data",
            "width": 100
        },
        {
            "fieldname": "actual_qty",
            "label": "Qty",
            "fieldtype": "Float",
            "width": 120
        },
        {
            "fieldname": "warehouse",
            "label": "Warehouse",
            "fieldtype": "Link",
            "options": "Warehouse",
            "width": 150
        }
    ]

def get_data(filters):
    conditions = ""
    if filters and filters.get("item_code"):
        conditions += f" AND b.item_code = '{filters.get('item_code')}'"

    sql_query = f"""
        SELECT 
            b.item_code as item_code, 
            i.item_name as item_name, 
            i.item_group as item_group,
            i.stock_uom as unit,
            b.actual_qty as actual_qty,
            b.warehouse
        FROM 
            `tabBin` b
        LEFT JOIN
            `tabItem` i ON i.name = b.item_code
        WHERE 
            i.item_group = 'Products'
            AND b.actual_qty > 0
            {conditions}
        ORDER BY 
            i.item_group ASC, b.item_code ASC
    """
    
    data = frappe.db.sql(sql_query, as_dict=True)
    return data
