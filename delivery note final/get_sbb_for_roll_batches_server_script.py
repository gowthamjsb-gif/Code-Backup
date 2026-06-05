# -----------------------------------------------------------------------------
# COPY/PASTE THIS INTO "Server Script" (Script Type: API)
# API Method: get_sbb_for_roll_batches
#
# Purpose:
# Returns Serial & Batch Bundle name for each Batch No (roll) so the client-side
# Rolls popup can show a "Serial & Batch Bundle" column per roll.
#
# Inputs (args):
# - item_code (string)
# - warehouse (string)
# - batch_nos (list or stringified list)
#
# Output:
# frappe.response["message"] = { "map": { "<batch_no>": "<bundle_name>", ... } }
# -----------------------------------------------------------------------------

item_code = frappe.form_dict.get("item_code")
warehouse = frappe.form_dict.get("warehouse")
batch_nos = frappe.form_dict.get("batch_nos")

def to_list_local(v):
	if isinstance(v, list):
		return v
	if not v:
		return []
	if isinstance(v, str):
		txt = v.strip()
		if not txt:
			return []
		try:
			out = frappe.safe_eval(txt)
			return out if isinstance(out, list) else []
		except Exception:
			# fallback: comma separated
			return [x.strip() for x in txt.split(",") if x.strip()]
	return []

batch_list = [b for b in to_list_local(batch_nos) if isinstance(b, str) and b.strip()]
batch_list = list(dict.fromkeys([b.strip() for b in batch_list]))

out = {}
if item_code and batch_list:
	# Heuristic:
	# pick latest submitted bundle in this warehouse+item that contains the batch.
	# Works when your process creates one bundle per roll/batch.
	placeholders = ", ".join(["%s"] * len(batch_list))
	where_warehouse = "and b.warehouse = %s" if warehouse else ""
	rows = frappe.db.sql(
		f"""
		select
			e.batch_no as batch_no,
			b.name as bundle
		from `tabSerial and Batch Bundle` b
		inner join `tabSerial and Batch Entry` e on e.parent = b.name
		where
			b.docstatus = 1
			and b.item_code = %s
			{where_warehouse}
			and e.batch_no in ({placeholders})
		order by b.modified desc
		""",
		tuple(([item_code] + ([warehouse] if warehouse else []) + batch_list)),
		as_dict=True,
	)
	for r in rows:
		bn = (r.get("batch_no") or "").strip()
		if bn and bn not in out and r.get("bundle"):
			out[bn] = r.get("bundle")

frappe.response["message"] = {"map": out}

