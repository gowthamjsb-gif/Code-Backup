# DocType Specifications

## 1. Child Table: Shift Production Item
**DocType Name**: `Shift Production Item`
**Module**: Manufacturing
**Istable**: 1

| Label | Fieldname | Fieldtype | Options | Mandatory | Read Only |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Work Order | `work_order` | Link | Work Order | No | Yes |
| Stock Entry | `stock_entry` | Link | Stock Entry | Yes | Yes |
| Item Code | `item_code` | Link | Item | Yes | Yes |
| Item Name | `item_name` | Data | | No | Yes |
| Produced Qty | `produced_qty` | Float | | Yes | Yes |
| Warehouse | `fg_warehouse` | Link | Warehouse | No | Yes |

## 2. Child Table: Shift Consumption Item
**DocType Name**: `Shift Consumption Item`
**Module**: Manufacturing
**Istable**: 1

| Label | Fieldname | Fieldtype | Options | Mandatory | Read Only |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Item Code | `item_code` | Link | Item | Yes | Yes |
| Item Name | `item_name` | Data | | No | Yes |
| UOM | `uom` | Link | UOM | No | Yes |
| Standard Consumption | `standard_consumption` | Float | | Yes | Yes |
| Actual Consumption | `actual_consumption` | Float | | Yes | No |
| Variance | `variance` | Float | | No | Yes |
| Bags | `bags` | Float | | No | Yes |
| Sack Weight | `sack_weight` | Float | | No | No |

## 3. Child Table: Shift Patty Wastage Detail
**DocType Name**: `Shift Patty Wastage Detail`
**Module**: Manufacturing
**Istable**: 1

| Label | Fieldname | Fieldtype | Options | Mandatory | Read Only |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Quality | `quality` | Select | | Yes | No |
| Colour | `colour` | Select | | Yes | No |
| GSM | `gsm` | Select | | Yes | No |
| Width (inch) | `width_inch` | Float | | Yes | No |
| Wastage Qty (kg) | `wastage_qty_kg` | Float | | Yes | No |

## 4. Child Table: Shift Core Consumption Item  ← NEW
**DocType Name**: `Shift Core Consumption Item`
**Module**: Manufacturing
**Istable**: 1

| Label | Fieldname | Fieldtype | Options | Mandatory | Read Only |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Item Code | `item_code` | Link | Item | Yes | No |
| Item Name | `item_name` | Data | | No | Yes |
| UOM | `uom` | Link | UOM | No | Yes |
| Quantity (kg) | `quantity` | Float | | Yes | No |

## 5. Master DocType: Patty Stock
**DocType Name**: `Patty Stock`
**Module**: Manufacturing

| Label | Fieldname | Fieldtype | Options | Mandatory | Read Only |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Quality | `quality` | Data | | Yes | No |
| Colour | `colour` | Data | | Yes | No |
| GSM | `gsm` | Data | | Yes | No |
| Width (inch) | `width_inch` | Data | | Yes | No |
| Balance Quantity | `balance_quantity` | Float | | No | No |

## 6. Parent DocType: Shift Wise Production Entry
**DocType Name**: `Shift Wise Production Entry`
**Module**: Manufacturing
**Autoname**: `field:naming_series`
**Istable**: 0

| Label | Fieldname | Fieldtype | Options | Mandatory | Read Only |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Naming Series | `naming_series` | Select | SPE-.YYYY.- | Yes | No |
| Posting Date | `posting_date` | Date | | Yes | No |
| Shift | `shift` | Select | Morning (6am-6pm)<br>Night (6pm-6am) | Yes | No |
| Unit | `unit` | Select | Unit 1<br>Unit 2<br>Unit 3<br>Unit 4 | Yes | No |
| Operator | `operator` | Data | | No | No |
| Supervisor | `supervisor` | Data | | No | No |
| Batch No | `batch_no` | Data | | No | Yes |
| Section Break | `sb_wastage_selection` | Section Break | Wastage Selection | | |
| Spinning Waste? | `is_spinning_waste` | Check | | No | No |
| Calender Waste? | `is_calender_waste` | Check | | No | No |
| Roll Waste? | `is_roll_waste` | Check | | No | No |
| Lumps Waste? | `is_lumps_waste` | Check | | No | No |
| Mixing Waste? | `is_mixing_waste` | Check | | No | No |
| Running Patty? | `is_running_patty_waste` | Check | | No | No |
| Section Break | `sb_wastage_details` | Section Break | Wastage Details | | |
| Spinning Waste | `spinning_waste` | Float | | No | No |
| Calender Waste | `calender_waste` | Float | | No | No |
| Roll Waste | `roll_waste` | Float | | No | No |
| Lumps Waste | `lumps_waste` | Float | | No | No |
| Mixing Waste | `mixing_waste` | Float | | No | No |
| Section Break | `sb_patty_wastage` | Section Break | Running Patty Wastage | | |
| Running Patty Wastage | `running_patty_wastage` | Table | Shift Patty Wastage Detail | No | No |
| Total Wastage | `total_wastage` | Float | | No | Yes |
| Get Data | `get_data` | Button | | No | No |
| Section Break | `sb_items` | Section Break | Production Details | | |
| Production Items | `production_items` | Table | Shift Production Item | No | No |
| Total Production Qty | `total_production_qty` | Float | | No | Yes |
| Section Break | `sb_cons` | Section Break | Consumption Details | | |
| Consumption Items | `consumption_items` | Table | Shift Consumption Item | No | No |
| Total Standard Consumption | `total_standard_consumption` | Float | | No | Yes |
| Total Actual Consumption | `total_actual_consumption` | Float | | No | Yes |
| Total Variance | `total_variance` | Float | | No | Yes |
| Section Break | `sb_recycle` | Section Break | Recycle / Patty Consumption | | |
| Recycle | `recycle` | Table | Shift Consumption Item | No | No |
| Total Recycled | `total_recycled` | Float | | No | Yes |
| Section Break | `sb_polybag` | Section Break | Polybag | | |
| Polybag | `polybag` | Table | Shift Polybag Detail | No | No |
| Total Polybag | `total_polybag` | Float | | No | Yes |
| Section Break | `sb_core` | Section Break | Core Consumption | | |
| Core Consumption | `core_consumption` | Table | Shift Core Consumption Item | No | No |
| Total Core Consumption | `total_core_consumption` | Float | | No | Yes |
| Section Break | `sb_metrics` | Section Break | Metrics | | |
| Target | `target` | Float | | No | No |
| Production % | `production_` | Float | | No | Yes |
| Wastage % | `wastage_` | Float | | No | Yes |
| Recycle % | `recycle_` | Float | | No | Yes |
| Target Achieved % | `target_acheived_` | Float | | No | Yes |

> [!NOTE]
> The **Shaft Production Run** DocType fields for reference (used as data source):
> - Run Date: `run_date` | Unit: `custom_unit` | Shift: `shift`
> - Rolls child table: `items` (DocType: `Shaft Production Run Item`)
> - Item row fields: `work_order`, `batch_no`, `gross_weight`, `net_weight`, `width_inch`, `gsm`, `meter_roll`, `quality`, `color`, `custom_core_width_mm`, `party_code`
> - Polybag child table: `polybag_consumption` (DocType: `Shaft Polybag Consumption`) — fields: `polybag_item`, `quantity_kgs`, `uom`