// Client Script: Weight Tolerance Check
// DocType: Shaft Production Run | Apply To: Form
//
// Compares:
//   SUM of total_weight in Available Jobs  (child: Shaft Production Run Job)
//   vs
//   SUM of net_weight in Roll Production Results  (child: Shaft Production Run Item)
//
// Tolerance: ±5%
// Alert fires on before_save and when any net_weight changes.

frappe.ui.form.on('Shaft Production Run', {
    before_save: function (frm) {
        check_weight_tolerance(frm);
    }
});

frappe.ui.form.on('Shaft Production Run Item', {
    net_weight: function (frm, cdt, cdn) {
        check_weight_tolerance(frm);
    }
});

function check_weight_tolerance(frm) {
    const excluded_units = [
        'VTP-L1 LEADER OYANG MACHINE',
        'VTP-L2 LEADER ZX MACHINE',
        'JVE-L3 B700 BAG MAKING MACHINE',
        'JVE-L2 B700 BAG MAKING MACHINE',
        'JVE-L1 B700 BAG MAKING MACHINE',
        'TTT- L3 - OYANG C900 BAG MAKING LINE',
        'TTT- L2 - OYANG C700 BAG MAKING LINE',
        'TTT- L1 - OYANG C700 BAG MAKING LINE'
    ];

    if (excluded_units.includes(frm.doc.custom_unit)) {
        return;
    }

    // 1. Sum total_weight from Available Jobs rows
    let job_total = 0;
    (frm.doc.jobs || []).forEach(function (row) {
        job_total += flt(row.total_weight);
    });

    // 2. Sum net_weight from Roll Production Results (only produced rolls, net_weight > 0)
    let roll_total = 0;
    (frm.doc.items || []).forEach(function (row) {
        if (flt(row.net_weight) > 0) {
            roll_total += flt(row.net_weight);
        }
    });

    // Nothing to compare if either side is zero
    if (job_total <= 0 || roll_total <= 0) return;

    // 3. Calculate deviation %
    let deviation_pct = Math.abs(roll_total - job_total) / job_total * 100;

    if (deviation_pct > 5) {
        let diff     = flt(roll_total - job_total, 2);
        let sign     = diff >= 0 ? '+' : '';
        let roll_fmt = flt(roll_total, 2);
        let job_fmt  = flt(job_total, 2);
        let dev_fmt  = flt(deviation_pct, 2);

        frappe.msgprint({
            title: '⚠️ Weight Mismatch',
            indicator: 'red',
            message:
                '<b>Roll Production Net Weight is outside the ±5% tolerance.</b><br><br>' +
                '<table style="width:100%; border-collapse:collapse; font-size:14px;">' +
                '<tr><td style="padding:4px 8px;"><b>Available Jobs Total Weight</b></td>' +
                    '<td style="padding:4px 8px; text-align:right;">' + job_fmt + ' Kgs</td></tr>' +
                '<tr><td style="padding:4px 8px;"><b>Roll Production Net Weight</b></td>' +
                    '<td style="padding:4px 8px; text-align:right;">' + roll_fmt + ' Kgs</td></tr>' +
                '<tr style="background:#f5c6cb;"><td style="padding:4px 8px;"><b>Difference</b></td>' +
                    '<td style="padding:4px 8px; text-align:right;">' + sign + diff + ' Kgs (' + sign + dev_fmt + '%)</td></tr>' +
                '</table><br>' +
                'Allowed range: <b>' + flt(job_total * 0.95, 2) + ' – ' + flt(job_total * 1.05, 2) + ' Kgs</b>'
        });
    }
}
