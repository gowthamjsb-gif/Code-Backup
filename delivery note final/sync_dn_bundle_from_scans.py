# -----------------------------------------------------------------------------
# COPY/PASTE THIS INTO "Server Script" (Script Type: API)
# API Method: sync_dn_bundle_from_scans
#
# NOTE:
# - This version is intentionally import-free so it works in Frappe safe_exec.
# - Keep delivery.js as: const DN_BUNDLE_SYNC_METHOD = 'sync_dn_bundle_from_scans';
# -----------------------------------------------------------------------------

docname = frappe.form_dict.get("docname")
if not docname:
	# Fallback: try to read from incoming doc dict/string without using parse_json/import.
	doc_arg = frappe.form_dict.get("doc")
	if isinstance(doc_arg, dict):
		docname = doc_arg.get("name")
	elif isinstance(doc_arg, str) and '"name"' in doc_arg:
		try:
			start_key = doc_arg.index('"name"')
			start_quote = doc_arg.index('"', start_key + 6)
			end_quote = doc_arg.index('"', start_quote + 1)
			docname = doc_arg[start_quote + 1:end_quote]
		except Exception:
			docname = None

if not docname:
	frappe.throw("Could not read Delivery Note name from request.")

dn = frappe.get_doc("Delivery Note", docname)


def flt_local(val):
	try:
		return float(val or 0)
	except Exception:
		return 0.0


roll_batch_map = frappe.form_dict.get("roll_batch_map")

def to_dict_local(value):
	if isinstance(value, dict):
		return value
	if not value:
		return {}
	if isinstance(value, str):
		txt = value.strip()
		if not txt:
			return {}
		# Frappe server script sandbox may pass objects as strings.
		# Try safe_eval first; then normalize JSON booleans/null and retry.
		try:
			return frappe.safe_eval(txt)
		except Exception:
			pass
		try:
			txt2 = txt.replace("null", "None").replace("true", "True").replace("false", "False")
			return frappe.safe_eval(txt2)
		except Exception:
			return {}
	return {}

roll_batch_map = to_dict_local(roll_batch_map)
if not isinstance(roll_batch_map, dict):
	roll_batch_map = {}

bundles_out = []

for row in dn.items:
	row_batches = roll_batch_map.get(row.name) if roll_batch_map else None
	if not isinstance(row_batches, dict):
		continue

	batches = {}
	for bn, qty in row_batches.items():
		bn2 = (bn or "").strip()
		qty2 = flt_local(qty)
		if bn2 and qty2 > 0:
			batches[bn2] = round(flt_local(batches.get(bn2)) + qty2, 6)

	# Multi-roll only; single-roll stays on row.batch_no flow
	if len(batches) <= 1:
		continue

	total_qty = round(sum(batches.values()), 6)
	if total_qty <= 0:
		continue

	# 1) If a submitted bundle already exists for this DN Item row, reuse it.
	#    ERPNext links bundles using voucher_detail_no (DN Item name).
	if row.get("serial_and_batch_bundle"):
		try:
			existing = frappe.get_doc("Serial and Batch Bundle", row.serial_and_batch_bundle)
			if existing.docstatus == 1:
				bundles_out.append({"row_name": row.name, "bundle": existing.name})
				continue
		except Exception:
			pass

	existing_name = None
	try:
		existing_name = frappe.db.get_value(
			"Serial and Batch Bundle",
			{
				"docstatus": 1,
				"voucher_type": "Delivery Note",
				"voucher_detail_no": row.name,
				"item_code": row.item_code,
				"warehouse": row.warehouse,
			},
			"name",
		)
	except Exception:
		existing_name = None

	if existing_name:
		frappe.db.set_value(
			"Delivery Note Item",
			row.name,
			{
				"serial_and_batch_bundle": existing_name,
				"use_serial_batch_fields": 0,
				"batch_no": None,
			},
			update_modified=False,
		)
		bundles_out.append({"row_name": row.name, "bundle": existing_name})
		continue

	old_bundle = row.get("serial_and_batch_bundle")
	if old_bundle:
		frappe.db.set_value(
			"Delivery Note Item",
			row.name,
			"serial_and_batch_bundle",
			None,
			update_modified=False,
		)
		try:
			frappe.delete_doc("Serial and Batch Bundle", old_bundle, force=1, ignore_permissions=True)
		except Exception:
			pass

	posting_datetime = str(dn.posting_date) + " " + str(dn.posting_time)
	bundle = frappe.get_doc(
		{
			"doctype": "Serial and Batch Bundle",
			"item_code": row.item_code,
			"warehouse": row.warehouse,
			"voucher_type": "Delivery Note",
			"voucher_no": dn.name,
			"voucher_detail_no": row.name,
			"posting_date": dn.posting_date,
			"posting_time": dn.posting_time,
			"posting_datetime": posting_datetime,
			"type_of_transaction": "Outward",
			"company": dn.company,
		}
	)

	for batch_no, qty in batches.items():
		bundle.append(
			"entries",
			{
				"batch_no": batch_no,
				"qty": -abs(flt_local(qty)),  # outward qty must be negative in bundle entries
			},
		)

	bundle.insert(ignore_permissions=True)
	try:
		# DN is still Draft; allow bundle submit without voucher validation
		bundle.flags.ignore_voucher_validation = True
		bundle.submit()
	except Exception:
		# avoid dangling draft bundle on failure
		try:
			frappe.delete_doc("Serial and Batch Bundle", bundle.name, force=1, ignore_permissions=True)
		except Exception:
			pass
		raise

	frappe.db.set_value(
		"Delivery Note Item",
		row.name,
		{
			"serial_and_batch_bundle": bundle.name,
			"use_serial_batch_fields": 0,
			"batch_no": None,
		},
		update_modified=False,
	)

	bundles_out.append({"row_name": row.name, "bundle": bundle.name})

frappe.response["message"] = {"bundles": bundles_out}
