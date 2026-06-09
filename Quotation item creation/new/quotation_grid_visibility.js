/**
 * Quotation Item child table column visibility by parent Quotation.custom_process.
 *
 * Uses frm.set_df_property(..., "hidden", ..., "Quotation Item", "items") so the grid obeys hides
 * even if the user saved a wide column layout — those fields are hidden in the child row form too
 * when Fabric Making is active (switch parent process to restore).
 *
 * Note: Updated fields with units suffixes: custom_no_of_sheets_pcs & custom_grams_per_sheet_kgs.
 *
 * Frappe Client Script usage (DocType Quotation → Form OR apps/js via hooks.py):
 *  - Prefer loading this BEFORE quotation_client_script.js (script name alphabetical / hooks order).
 *  - Extend: push into MODES via registerGridMode(...) or edit MODES directly.
 */
(function () {
    const NS = "quotation_grid_visibility";
    frappe[NS] = frappe[NS] || {};

    const CHILD_DOCTYPE = "Quotation Item";
    const CHILD_PARENTFIELD = "items";

    const SKIP_TYPES = new Set([
        "Column Break",
        "Section Break",
        "Tab Break",
        "HTML",
        "Fold",
        "Heading",
        "Button",
        "Table"
    ]);

    const FORCE_EDITABLE_FIELDS = new Set([
        "custom_gsm",
        "custom_fabric_gsm",
        "custom_lamination_gsm",
        "custom_lamination_side",
        "custom_process",
        "custom_bopp_gsm",
        "custom_design_colour",
        "custom_no_of_design_colours",
        "custom_no_of_design_colour",
        "custom_no_of_sheets_pcs",
        "custom_grams_per_sheet_kgs",
        "custom_finishing",
        "custom_coating",
        "custom_purchase_no",
        "custom_purchase_quality_name",
        "custom_quality",
        "custom_colour",
        "qty",
        "custom_meter",
        "custom_meter_per_roll",
        "custom_no_of_rolls",
        "custom_weight_per_roll",
        "custom_core_size"
    ]);

    const LINK_GRID_FIELDS = new Set(["custom_quality", "custom_colour", "custom_process", "custom_design_code"]);

    function force_editable_df(df) {
        if (!df || !FORCE_EDITABLE_FIELDS.has(df.fieldname)) return;
        df.read_only = 0;
        df.read_only_depends_on = "";
    }

    /**
     * @typedef {object} GridModeRule
     * @property {string} id Unique id for debugging
     * @property {(doc: frappe.model.Document) => boolean} when Return true when this layout applies (first match wins)
     * @property {Set<string>|string[]} visible_fields Column fieldnames kept visible on Quotation Item grid
     * @property {number} [priority] Higher runs first when checking when() (optional; default 0)
     */

    /** Parent process Link/Select/Dynamic Link: stored value may be an ID; UI shows the title — include both when matching `when(...)`. */
    function parent_process_text_blob(doc, frm) {
        const parts = [];
        if (!doc) return "";
        push_str(parts, doc.custom_process);
        push_str(parts, doc.process);
        push_str(parts, doc.custom_type_of_bag);
        push_str(parts, doc.custom_type_of_printing);
        push_str(parts, doc.custom_lamination_side);
        if (frm && frm.fields_dict) {
            ["custom_process", "process", "custom_type_of_bag", "custom_type_of_printing", "custom_lamination_side"].forEach(fn => {
                const fld = frm.fields_dict[fn];
                if (!fld) return;
                try {
                    if (typeof fld.get_value === "function") push_str(parts, fld.get_value());
                    if (fld.label) push_str(parts, fld.label);
                    if (fld.$input && typeof fld.$input.val === "function") push_str(parts, fld.$input.val());
                } catch (e_) { /* ignore */ }
            });
        }
        return parts.join(" ");
        function push_str(arr, v) {
            if (v == null || v === "") return;
            arr.push(String(v));
        }
    }

    /** @type {GridModeRule[]} */
    const MODES = [
        {
            id: "printed_bopp",
            priority: 49,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                const hasItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    const ic = (item.item_code || "").toUpperCase();
                    return (
                        ip.includes("PRINTED BOPP") ||
                        ip.includes("BOPP PRINT") ||
                        ic.startsWith("PB-")
                    );
                });
                return raw.includes("PRINTED BOPP") || raw.includes("BOPP PRINT") || hasItem;
            },
            visible_fields: [
                "item_code",
                "item_name",
                "custom_process",
                "custom_design_code",
                "custom_design_name",
                "custom_design_colour",
                "custom_no_of_design_colours",
                "custom_no_of_design_colour",
                "custom_gsm",
                "custom_bopp_gsm",
                "custom_width_inch",
                "custom_width_mm",
                "custom_width_cm",
                "custom_finishing",
                "custom_coating",
                "qty",
                "rate",
                "amount"
            ]
        },
        {
            id: "custom_printed_bopp_box_bag",
            priority: 51,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                const hasItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("CUSTOM PRINTED BOPP BOX BAG") || ip.includes("COLORED BOPP BOX BAG") || ip.includes("COLORED BOPP SCREEN PRINTED BOX BAG");
                });
                return raw.includes("CUSTOM PRINTED BOPP BOX BAG") || raw.includes("COLORED BOPP BOX BAG") || raw.includes("COLORED BOPP SCREEN PRINTED BOX BAG") || hasItem;
            },
            visible_fields: [
                "item_code", "item_name", "custom_process", "custom_design_code", "custom_design_name", "custom_no_of_design_colours", "custom_no_of_design_colour", "custom_design_colour", "custom_quality", "custom_colour", "custom_fabric_gsm", "custom_bopp_gsm", "custom_lamination_gsm", "custom_lamination_side", "custom_gsm", "custom_finishing", "custom_coating", "custom_bag_size", "custom_width_inch", "custom_width_mm", "custom_width_cm", "custom_height_inches", "custom_height_mm", "custom_height_cm", "custom_gazette_inch", "custom_gazette_mm", "custom_gazette_cm", "custom_top_folding_mm", "custom_sheet_width_mm", "custom_sheet_cut_length_mm", "custom_weight_per_bag_grams", "custom_loop_handle_quality", "custom_loop_handle_colour", "custom_loop_handle_gsm", "custom_loop_handle_width_inches", "custom_meter", "custom_meter_per_roll", "custom_no_of_rolls", "qty", "uom", "rate", "amount"
            ]
        },
        {
            id: "metallic_bopp_box_bag",
            priority: 51,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                const hasItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("METALLIC BOPP BOX BAG") || ip.includes("METALLIC BOPP SHOPPER BAG");
                });
                return raw.includes("METALLIC BOPP BOX BAG") || raw.includes("METALLIC BOPP SHOPPER BAG") || hasItem;
            },
            visible_fields: [
                "item_code", "item_name", "custom_process", "custom_design_code", "custom_design_name", "custom_no_of_design_colours", "custom_no_of_design_colour", "custom_design_colour", "custom_quality", "custom_colour", "custom_fabric_gsm", "custom_bopp_gsm", "custom_lamination_gsm", "custom_lamination_side", "custom_gsm", "custom_finishing", "custom_coating", "custom_bag_size", "custom_width_inch", "custom_width_mm", "custom_width_cm", "custom_height_inches", "custom_height_mm", "custom_height_cm", "custom_gazette_inch", "custom_gazette_mm", "custom_gazette_cm", "custom_top_folding_mm", "custom_sheet_width_mm", "custom_sheet_cut_length_mm", "custom_weight_per_bag_grams", "custom_loop_handle_quality", "custom_loop_handle_colour", "custom_loop_handle_gsm", "custom_loop_handle_width_inches", "custom_meter", "custom_meter_per_roll", "custom_no_of_rolls", "qty", "uom", "rate", "amount"
            ]
        },
        {
            id: "cooler_bopp_box_bag",
            priority: 51,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                const hasItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("COOLER BOPP BOX BAG") || ip.includes("COOLER BOPP SHOPPER BAG");
                });
                return raw.includes("COOLER BOPP BOX BAG") || raw.includes("COOLER BOPP SHOPPER BAG") || hasItem;
            },
            visible_fields: [
                "item_code", "item_name", "custom_process", "custom_design_code", "custom_design_name", "custom_no_of_design_colours", "custom_no_of_design_colour", "custom_design_colour", "custom_quality", "custom_colour", "custom_fabric_gsm", "custom_bopp_gsm", "custom_lamination_gsm", "custom_lamination_side", "custom_gsm", "custom_finishing", "custom_coating", "custom_bag_size", "custom_width_inch", "custom_width_mm", "custom_width_cm", "custom_height_inches", "custom_height_mm", "custom_height_cm", "custom_gazette_inch", "custom_gazette_mm", "custom_gazette_cm", "custom_top_folding_mm", "custom_sheet_width_mm", "custom_sheet_cut_length_mm", "custom_weight_per_bag_grams", "custom_loop_handle_quality", "custom_loop_handle_colour", "custom_loop_handle_gsm", "custom_loop_handle_width_inches", "custom_meter", "custom_meter_per_roll", "custom_no_of_rolls", "qty", "uom", "rate", "amount"
            ]
        },
        {
            id: "flexo_printed_laminated_box_bag",
            priority: 54,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                const hasItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("PRE-FLEXO LAMINATED PRINTED BOX BAG") || ip.includes("CUSTOM FLEXO LAMINATED PRINTED BOX BAG") || ip.includes("FLEXO LAMINATED PRINTED SHOPPER BAG");
                });
                return raw.includes("PRE-FLEXO LAMINATED PRINTED BOX BAG") || raw.includes("CUSTOM FLEXO LAMINATED PRINTED BOX BAG") || raw.includes("FLEXO LAMINATED PRINTED SHOPPER BAG") || hasItem;
            },
            visible_fields: [
                "item_code", "item_name", "custom_process", "custom_design_code", "custom_design_name", "custom_no_of_design_colours", "custom_no_of_design_colour", "custom_design_colour", "custom_quality", "custom_colour", "custom_fabric_gsm", "custom_lamination_gsm", "custom_lamination_side", "custom_gsm", "custom_finishing", "custom_coating", "custom_bag_size", "custom_width_inch", "custom_width_mm", "custom_width_cm", "custom_height_inches", "custom_height_mm", "custom_height_cm", "custom_gazette_inch", "custom_gazette_mm", "custom_gazette_cm", "custom_top_folding_mm", "custom_sheet_width_mm", "custom_sheet_cut_length_mm", "custom_weight_per_bag_grams", "custom_loop_handle_quality", "custom_loop_handle_colour", "custom_loop_handle_gsm", "custom_loop_handle_width_inches", "custom_meter", "custom_meter_per_roll", "custom_no_of_rolls", "qty", "uom", "rate", "amount"
            ]
        },
        {
            id: "flexo_printed_box_bag",
            priority: 53,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                const hasItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("PRE-FLEXO PRINTED BOX BAG") || ip.includes("CUSTOM FLEXO PRINTED BOX BAG") || ip.includes("FLEXO PRINTED SHOPPER BAG");
                });
                return raw.includes("PRE-FLEXO PRINTED BOX BAG") || raw.includes("CUSTOM FLEXO PRINTED BOX BAG") || raw.includes("FLEXO PRINTED SHOPPER BAG") || hasItem;
            },
            visible_fields: [
                "item_code", "item_name", "custom_process", "custom_design_code", "custom_design_name", "custom_no_of_design_colours", "custom_no_of_design_colour", "custom_design_colour", "custom_quality", "custom_colour", "custom_gsm", "custom_fabric_gsm", "custom_finishing", "custom_coating", "custom_bag_size", "custom_width_inch", "custom_width_mm", "custom_width_cm", "custom_height_inches", "custom_height_mm", "custom_height_cm", "custom_gazette_inch", "custom_gazette_mm", "custom_gazette_cm", "custom_top_folding_mm", "custom_sheet_width_mm", "custom_sheet_cut_length_mm", "custom_weight_per_bag_grams", "custom_loop_handle_quality", "custom_loop_handle_colour", "custom_loop_handle_gsm", "custom_loop_handle_width_inches", "custom_meter", "custom_meter_per_roll", "custom_no_of_rolls", "qty", "uom", "rate", "amount"
            ]
        },
        {
            id: "plain_laminated_box_bag",
            priority: 52,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                const hasItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("PLAIN LAMINATED BOX BAG") || ip.includes("PLAIN LAMINATED SHOPPER BAG");
                });
                return raw.includes("PLAIN LAMINATED BOX BAG") || raw.includes("PLAIN LAMINATED SHOPPER BAG") || hasItem;
            },
            visible_fields: [
                "item_code",
                "item_name",
                "custom_process",
                "custom_design_code",
                "custom_design_name",
                "custom_quality",
                "custom_colour",
                "custom_fabric_gsm",
                "custom_lamination_gsm",
                "custom_lamination_side",
                "custom_gsm",
                "custom_bag_size",
                "custom_width_inch",
                "custom_width_mm",
                "custom_width_cm",
                "custom_height_inches",
                "custom_height_mm",
                "custom_height_cm",
                "custom_gazette_inch",
                "custom_gazette_mm",
                "custom_gazette_cm",
                "custom_top_folding_mm",
                "custom_sheet_width_mm",
                "custom_sheet_cut_length_mm",
                "custom_weight_per_bag_grams",
                "custom_loop_handle_quality",
                "custom_loop_handle_colour",
                "custom_loop_handle_gsm",
                "custom_loop_handle_width_inches",
                "custom_meter",
                "custom_meter_per_roll",
                "custom_no_of_rolls",
                "qty",
                "uom",
                "rate",
                "amount",
            ]
        },
        {
            id: "d_cut_mettalic_roto_bag",
            priority: 56,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                const hasItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("D CUT METTALIC ROTO") || ip.includes("D-CUT METTALIC ROTO");
                });
                return hasItem || raw.includes("D CUT METTALIC ROTO") || raw.includes("D-CUT METTALIC ROTO");
            },
            visible_fields: [
                "item_code",
                "item_name",
                "custom_process",
                "custom_design_code",
                "custom_design_name",
                "custom_no_of_design_colours",
                "custom_no_of_design_colour",
                "custom_design_colour",
                "custom_quality",
                "custom_colour",
                "custom_fabric_gsm",
                "custom_bopp_gsm",
                "custom_lamination_gsm",
                "custom_lamination_side",
                "custom_gsm",
                "custom_finishing",
                "custom_coating",
                "custom_bag_size",
                "custom_width_inch",
                "custom_width_mm",
                "custom_width_cm",
                "custom_height_inches",
                "custom_height_mm",
                "custom_height_cm",
                "custom_top_folding_mm",
                "custom_sheet_width_mm",
                "custom_sheet_cut_length_mm",
                "custom_weight_per_bag_grams",
                "custom_meter",
                "custom_meter_per_roll",
                "custom_no_of_rolls",
                "qty",
                "uom",
                "rate",
                "amount",
            ]
        },
        {
            id: "d_cut_bopp_roto_bag",
            priority: 55,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                const hasItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("D CUT BOPP ROTO") || ip.includes("D-CUT BOPP ROTO");
                });
                return hasItem || raw.includes("D CUT BOPP ROTO") || raw.includes("D-CUT BOPP ROTO");
            },
            visible_fields: [
                "item_code",
                "item_name",
                "custom_process",
                "custom_design_code",
                "custom_design_name",
                "custom_no_of_design_colours",
                "custom_no_of_design_colour",
                "custom_design_colour",
                "custom_quality",
                "custom_colour",
                "custom_fabric_gsm",
                "custom_bopp_gsm",
                "custom_lamination_gsm",
                "custom_lamination_side",
                "custom_gsm",
                "custom_finishing",
                "custom_coating",
                "custom_bag_size",
                "custom_width_inch",
                "custom_width_mm",
                "custom_width_cm",
                "custom_height_inches",
                "custom_height_mm",
                "custom_height_cm",
                "custom_top_folding_mm",
                "custom_sheet_width_mm",
                "custom_sheet_cut_length_mm",
                "custom_weight_per_bag_grams",
                "custom_meter",
                "custom_meter_per_roll",
                "custom_no_of_rolls",
                "qty",
                "uom",
                "rate",
                "amount",
            ]
        },
        {
            id: "d_cut_laminated_printed_bag",
            priority: 54,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                const hasItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("D CUT LAMINATED PRINTED") || ip.includes("D-CUT LAMINATED PRINTED");
                });
                return hasItem || raw.includes("D CUT LAMINATED PRINTED") || raw.includes("D-CUT LAMINATED PRINTED");
            },
            visible_fields: [
                "item_code",
                "item_name",
                "custom_process",
                "custom_design_code",
                "custom_design_name",
                "custom_no_of_design_colours",
                "custom_no_of_design_colour",
                "custom_design_colour",
                "custom_quality",
                "custom_colour",
                "custom_fabric_gsm",
                "custom_lamination_gsm",
                "custom_lamination_side",
                "custom_gsm",
                "custom_finishing",
                "custom_coating",
                "custom_bag_size",
                "custom_width_inch",
                "custom_width_mm",
                "custom_width_cm",
                "custom_height_inches",
                "custom_height_mm",
                "custom_height_cm",
                "custom_top_folding_mm",
                "custom_sheet_width_mm",
                "custom_sheet_cut_length_mm",
                "custom_weight_per_bag_grams",
                "custom_meter",
                "custom_meter_per_roll",
                "custom_no_of_rolls",
                "qty",
                "uom",
                "rate",
                "amount",
            ]
        },
        {
            id: "d_cut_laminated_bag",
            priority: 53,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                const bagType = String(doc.custom_type_of_bag || "").toUpperCase();
                const hasItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return (ip.includes("D CUT LAMINATED") || ip.includes("D-CUT LAMINATED")) && !ip.includes("PRINTED");
                });
                const lamParent = (raw.includes("LAMINAT") || String(doc.custom_type_of_lamination || "").toUpperCase().includes("PLAIN"))
                    && (raw.includes("D-CUT") || raw.includes("D CUT") || bagType.includes("D-CUT") || bagType.includes("D CUT"));
                return hasItem || (lamParent && !raw.includes("PRINTED"));
            },
            visible_fields: [
                "item_code",
                "item_name",
                "custom_process",
                "custom_design_code",
                "custom_design_name",
                "custom_quality",
                "custom_colour",
                "custom_fabric_gsm",
                "custom_lamination_gsm",
                "custom_lamination_side",
                "custom_gsm",
                "custom_finishing",
                "custom_coating",
                "custom_bag_size",
                "custom_width_inch",
                "custom_width_mm",
                "custom_width_cm",
                "custom_height_inches",
                "custom_height_mm",
                "custom_height_cm",
                "custom_top_folding_mm",
                "custom_sheet_width_mm",
                "custom_sheet_cut_length_mm",
                "custom_weight_per_bag_grams",
                "custom_meter",
                "custom_meter_per_roll",
                "custom_no_of_rolls",
                "qty",
                "uom",
                "rate",
                "amount",
            ]
        },
        {
            id: "d_cut_flexo_bag",
            priority: 52,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                const bagType = String(doc.custom_type_of_bag || "").toUpperCase();
                const hasLamItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("D CUT LAMINATED") || ip.includes("D-CUT LAMINATED");
                });
                if (hasLamItem) return false;
                const hasItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("D CUT PRINTED FLEXO") || ip.includes("D-CUT PRINTED FLEXO");
                });
                const flexoParent = raw.includes("FLEXO") && (raw.includes("D-CUT") || raw.includes("D CUT") || bagType.includes("D-CUT") || bagType.includes("D CUT"));
                return hasItem || flexoParent;
            },
            visible_fields: [
                "item_code",
                "item_name",
                "custom_process",
                "custom_design_code",
                "custom_design_name",
                "custom_no_of_design_colours",
                "custom_no_of_design_colour",
                "custom_design_colour",
                "custom_quality",
                "custom_colour",
                "custom_fabric_gsm",
                "custom_gsm",
                "custom_finishing",
                "custom_coating",
                "custom_bag_size",
                "custom_width_inch",
                "custom_width_mm",
                "custom_width_cm",
                "custom_height_inches",
                "custom_height_mm",
                "custom_height_cm",
                "custom_top_folding_mm",
                "custom_sheet_width_mm",
                "custom_sheet_cut_length_mm",
                "custom_weight_per_bag_grams",
                "custom_meter",
                "custom_meter_per_roll",
                "custom_no_of_rolls",
                "qty",
                "uom",
                "rate",
                "amount",
            ]
        },
        {
            id: "d_cut_bag",
            priority: 51,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                const bagType = String(doc.custom_type_of_bag || "").toUpperCase();
                const hasFlexoItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("D CUT PRINTED FLEXO") || ip.includes("D-CUT PRINTED FLEXO");
                });
                const hasLamItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("D CUT LAMINATED") || ip.includes("D-CUT LAMINATED");
                });
                if (hasFlexoItem || hasLamItem) return false;
                const hasItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("D CUT PLAIN") || ip.includes("D-CUT PLAIN");
                });
                const flexoPrinting = String(doc.custom_type_of_printing || "").toUpperCase().includes("FLEXO");
                if (flexoPrinting && (raw.includes("D-CUT") || raw.includes("D CUT") || bagType.includes("D-CUT") || bagType.includes("D CUT"))) {
                    return false;
                }
                return raw.includes("D-CUT") || raw.includes("D CUT") || bagType.includes("D-CUT") || bagType.includes("D CUT") || hasItem;
            },
            visible_fields: [
                "item_code",
                "item_name",
                "custom_process",
                "custom_design_code",
                "custom_design_name",
                "custom_quality",
                "custom_colour",
                "custom_fabric_gsm",
                "custom_gsm",
                "custom_finishing",
                "custom_coating",
                "custom_bag_size",
                "custom_width_inch",
                "custom_width_mm",
                "custom_width_cm",
                "custom_height_inches",
                "custom_height_mm",
                "custom_height_cm",
                "custom_top_folding_mm",
                "custom_sheet_width_mm",
                "custom_sheet_cut_length_mm",
                "custom_weight_per_bag_grams",
                "custom_meter",
                "custom_meter_per_roll",
                "custom_no_of_rolls",
                "qty",
                "uom",
                "rate",
                "amount",
            ]
        },
        {
            id: "laminated_printed_w_cut_bag",
            priority: 55,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                const bagType = String(doc.custom_type_of_bag || "").toUpperCase();
                const printing = String(doc.custom_type_of_printing || "").toUpperCase();
                const lamType = String(doc.custom_type_of_lamination || "").toUpperCase();
                const isLam = lamType.includes("PLAIN") || lamType.includes("BOPP");
                const hasItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("LAMINATED PRINTED W CUT BAG") || ip.includes("LAMINATED PRINTED W-CUT BAG");
                });
                const wCutBag = bagType.includes("W-CUT") || bagType.includes("W CUT");
                const flexoLamParent = (raw.includes("BAG MAKING") || raw.includes("BOX BAG") || raw.includes("SHOPPER BAG"))
                    && wCutBag && printing.includes("FLEXO") && isLam;
                return hasItem || flexoLamParent || raw.includes("LAMINATED PRINTED W-CUT BAG") || raw.includes("LAMINATED PRINTED W CUT BAG");
            },
            visible_fields: [
                "item_code",
                "item_name",
                "custom_process",
                "custom_design_code",
                "custom_design_name",
                "custom_no_of_design_colours",
                "custom_no_of_design_colour",
                "custom_design_colour",
                "custom_quality",
                "custom_colour",
                "custom_fabric_gsm",
                "custom_lamination_gsm",
                "custom_lamination_side",
                "custom_gsm",
                "custom_finishing",
                "custom_coating",
                "custom_bag_size",
                "custom_width_inch",
                "custom_width_mm",
                "custom_width_cm",
                "custom_height_inches",
                "custom_height_mm",
                "custom_height_cm",
                "custom_gazette_inch",
                "custom_gazette_mm",
                "custom_gazette_cm",
                "custom_sheet_width_mm",
                "custom_sheet_cut_length_mm",
                "custom_weight_per_bag_grams",
                "custom_meter",
                "custom_meter_per_roll",
                "custom_no_of_rolls",
                "qty",
                "uom",
                "rate",
                "amount",
            ]
        },
        {
            id: "printed_w_cut_bag",
            priority: 54,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                const bagType = String(doc.custom_type_of_bag || "").toUpperCase();
                const printing = String(doc.custom_type_of_printing || "").toUpperCase();
                const lamType = String(doc.custom_type_of_lamination || "").toUpperCase();
                const isLam = lamType.includes("PLAIN") || lamType.includes("BOPP");
                const hasLamPrinted = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("LAMINATED PRINTED W CUT BAG") || ip.includes("LAMINATED PRINTED W-CUT BAG");
                });
                if (hasLamPrinted) return false;
                const hasLamItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return (ip.includes("LAMINATED W CUT BAG") || ip.includes("LAMINATED W-CUT BAG")) && !ip.includes("PRINTED");
                });
                if (hasLamItem) return false;
                const hasItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return (ip.includes("PRINTED W CUT BAG") || ip.includes("PRINTED W-CUT BAG")) && !ip.includes("LAMINATED");
                });
                const wCutBag = bagType.includes("W-CUT") || bagType.includes("W CUT");
                const flexoParent = (raw.includes("BAG MAKING") || raw.includes("BOX BAG") || raw.includes("SHOPPER BAG"))
                    && wCutBag && printing.includes("FLEXO") && !isLam;
                return hasItem || flexoParent || raw.includes("PRINTED W-CUT BAG") || raw.includes("PRINTED W CUT BAG");
            },
            visible_fields: [
                "item_code",
                "item_name",
                "custom_process",
                "custom_design_code",
                "custom_design_name",
                "custom_no_of_design_colours",
                "custom_no_of_design_colour",
                "custom_design_colour",
                "custom_quality",
                "custom_colour",
                "custom_fabric_gsm",
                "custom_gsm",
                "custom_finishing",
                "custom_coating",
                "custom_bag_size",
                "custom_width_inch",
                "custom_width_mm",
                "custom_width_cm",
                "custom_height_inches",
                "custom_height_mm",
                "custom_height_cm",
                "custom_gazette_inch",
                "custom_gazette_mm",
                "custom_gazette_cm",
                "custom_sheet_width_mm",
                "custom_sheet_cut_length_mm",
                "custom_weight_per_bag_grams",
                "custom_meter",
                "custom_meter_per_roll",
                "custom_no_of_rolls",
                "qty",
                "uom",
                "rate",
                "amount",
            ]
        },
        {
            id: "laminated_w_cut_bag",
            priority: 53,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                const hasPrinted = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return (ip.includes("PRINTED W CUT BAG") || ip.includes("PRINTED W-CUT BAG")) && !ip.includes("LAMINATED");
                });
                const hasLamPrinted = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("LAMINATED PRINTED W CUT BAG") || ip.includes("LAMINATED PRINTED W-CUT BAG");
                });
                if (hasPrinted || hasLamPrinted || raw.includes("PRINTED W CUT BAG") || raw.includes("PRINTED W-CUT BAG") || raw.includes("LAMINATED PRINTED W CUT BAG") || raw.includes("LAMINATED PRINTED W-CUT BAG")) return false;
                const hasItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return (ip.includes("LAMINATED W CUT BAG") || ip.includes("LAMINATED W-CUT BAG")) && !ip.includes("PRINTED");
                });
                const lamWCut = (raw.includes("LAMINATED W CUT BAG") || raw.includes("LAMINATED W-CUT BAG")) && !raw.includes("PRINTED");
                return hasItem || lamWCut;
            },
            visible_fields: [
                "item_code",
                "item_name",
                "custom_process",
                "custom_design_code",
                "custom_design_name",
                "custom_quality",
                "custom_colour",
                "custom_fabric_gsm",
                "custom_lamination_gsm",
                "custom_lamination_side",
                "custom_gsm",
                "custom_finishing",
                "custom_coating",
                "custom_bag_size",
                "custom_width_inch",
                "custom_width_mm",
                "custom_width_cm",
                "custom_height_inches",
                "custom_height_mm",
                "custom_height_cm",
                "custom_gazette_inch",
                "custom_gazette_mm",
                "custom_gazette_cm",
                "custom_sheet_width_mm",
                "custom_sheet_cut_length_mm",
                "custom_weight_per_bag_grams",
                "custom_meter",
                "custom_meter_per_roll",
                "custom_no_of_rolls",
                "qty",
                "uom",
                "rate",
                "amount",
            ]
        },
        {
            id: "plain_w_cut_bag",
            priority: 51,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                const hasPrinted = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return (ip.includes("PRINTED W CUT BAG") || ip.includes("PRINTED W-CUT BAG")) && !ip.includes("LAMINATED");
                });
                const hasLamPrinted = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("LAMINATED PRINTED W CUT BAG") || ip.includes("LAMINATED PRINTED W-CUT BAG");
                });
                if (hasPrinted || hasLamPrinted || raw.includes("PRINTED W CUT BAG") || raw.includes("PRINTED W-CUT BAG") || raw.includes("LAMINATED PRINTED W CUT BAG") || raw.includes("LAMINATED PRINTED W-CUT BAG")) return false;
                const hasLam = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return (ip.includes("LAMINATED W CUT BAG") || ip.includes("LAMINATED W-CUT BAG")) && !ip.includes("PRINTED");
                });
                const lamWCutRaw = (raw.includes("LAMINATED W CUT BAG") || raw.includes("LAMINATED W-CUT BAG")) && !raw.includes("PRINTED");
                if (hasLam || lamWCutRaw) return false;
                const hasItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return (ip.includes("PLAIN W CUT BAG") || ip.includes("PLAIN W-CUT BAG")) && !ip.includes("LAMINATED") && !ip.includes("PRINTED");
                });
                return hasItem || raw.includes("PLAIN W CUT BAG") || ((raw.includes("W-CUT") || raw.includes("W CUT")) && !raw.includes("LAMINATED") && !raw.includes("PRINTED"));
            },
            visible_fields: [
                "item_code",
                "item_name",
                "custom_process",
                "custom_design_code",
                "custom_design_name",
                "custom_quality",
                "custom_colour",
                "custom_fabric_gsm",
                "custom_gsm",
                "custom_finishing",
                "custom_coating",
                "custom_bag_size",
                "custom_width_inch",
                "custom_width_mm",
                "custom_width_cm",
                "custom_height_inches",
                "custom_height_mm",
                "custom_height_cm",
                "custom_gazette_inch",
                "custom_gazette_mm",
                "custom_gazette_cm",
                "custom_sheet_width_mm",
                "custom_sheet_cut_length_mm",
                "custom_weight_per_bag_grams",
                "custom_meter",
                "custom_meter_per_roll",
                "custom_no_of_rolls",
                "qty",
                "uom",
                "rate",
                "amount",
            ]
        },
        {
            id: "plain_box_bag",
            priority: 50,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                if (raw.includes("PLAIN LAMINATED BOX BAG") || raw.includes("PLAIN LAMINATED SHOPPER BAG")) return false;
                if (raw.includes("D-CUT") || raw.includes("D CUT")) return false;
                if (raw.includes("W-CUT") || raw.includes("W CUT")) return false;
                const hasItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("PLAIN BOX BAG") && !ip.includes("PLAIN LAMINATED BOX BAG") && !ip.includes("D CUT PLAIN");
                });
                return raw.includes("BAG MAKING") || hasItem || raw.includes("PLAIN BOX BAG");
            },
            visible_fields: [
                "item_code",
                "item_name",
                "custom_process",
                "custom_design_code",
                "custom_design_name",
                "custom_quality",
                "custom_colour",
                "custom_fabric_gsm",
                "custom_gsm",
                "custom_bag_size",
                "custom_width_inch",
                "custom_width_mm",
                "custom_width_cm",
                "custom_height_inches",
                "custom_height_mm",
                "custom_height_cm",
                "custom_gazette_inch",
                "custom_gazette_mm",
                "custom_gazette_cm",
                "custom_top_folding_mm",
                "custom_sheet_width_mm",
                "custom_sheet_cut_length_mm",
                "custom_weight_per_bag_grams",
                "custom_loop_handle_quality",
                "custom_loop_handle_colour",
                "custom_loop_handle_gsm",
                "custom_loop_handle_width_inches",
                "custom_meter",
                "custom_meter_per_roll",
                "custom_no_of_rolls",
                "qty",
                "uom",
                "rate",
                "amount",
            ]
        },
        {
            id: "non_woven_fabric_initial",
            priority: 49,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                if (
                    raw.includes("SLITT") || raw.includes("REWIND") || raw.includes("LAMINAT") ||
                    raw.includes("BOPP") || raw.includes("SHEET") || raw.includes("BAG MAKING") ||
                    raw.includes("BOX BAG") || raw.includes("SHOPPER") || raw.includes("FLEXO") ||
                    raw.includes("PRINTED BOPP") || raw.includes("D-CUT") || raw.includes("D CUT") ||
                    (raw.includes("PRINT") && !raw.includes("INITIAL"))
                ) {
                    return false;
                }
                const hasItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase().trim();
                    if (ip === "NON WOVEN FABRIC") return true;
                    return ip.includes("NON WOVEN FABRIC") && ip.includes("INITIAL");
                });
                const parentInitial =
                    (raw.includes("NON WOVEN") && raw.includes("FABRIC") && raw.includes("INITIAL")) ||
                    raw.includes("NON WOVEN FABRIC INITIAL");
                const parentBaseFabric =
                    raw.includes("NON WOVEN FABRIC") &&
                    !raw.includes("SLITT") && !raw.includes("REWIND") && !raw.includes("LAMINAT") &&
                    !raw.includes("BOPP") && !raw.includes("SHEET") && !raw.includes("FLEXO");
                return hasItem || parentInitial || parentBaseFabric;
            },
            visible_fields: [
                "item_code",
                "item_name",
                "custom_process",
                "custom_quality",
                "custom_colour",
                "custom_gsm",
                "custom_width_inch",
                "custom_width_mm",
                "custom_width_cm",
                "custom_meter_per_roll",
                "custom_weight_per_roll",
                "custom_meter",
                "custom_no_of_rolls",
                "item_tax_template",
                "qty",
                "uom",
                "rate",
                "amount"
            ]
        },
        {
            id: "rewinded_fabric",
            priority: 48,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                const hasItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("REWIND");
                });
                return raw.includes("REWIND") || hasItem;
            },
            visible_fields: [
                "item_code",
                "item_name",
                "custom_process",
                "custom_quality",
                "custom_colour",
                "custom_gsm",
                "custom_width_inch",
                "custom_width_mm",
                "custom_width_cm",
                "custom_core_size",
                "custom_meter_per_roll",
                "custom_weight_per_roll",
                "custom_meter",
                "custom_no_of_rolls",
                "qty",
                "rate",
                "amount"
            ]
        },
        {
            id: "fabric_making",
            priority: 10,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                const hasItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("SLITTED") || ip.includes("SLITTING");
                });
                const isFabricOrSlitting = raw.includes("FABRIC MAKING") || raw.includes("SLITTING") || raw.includes("SLITTED");
                const isRewindOnly = raw.includes("REWIND") && !raw.includes("SLIT");
                if (isRewindOnly) return false;
                return isFabricOrSlitting || hasItem;
            },
            visible_fields: [
                "item_code",
                "item_name",
                "custom_process",
                "custom_quality",
                "custom_gsm",
                "custom_width_inch",
                "custom_width_mm",
                "custom_width_cm",
                "custom_colour",
                "custom_meter_per_roll",
                "custom_weight_per_roll",
                "custom_meter",
                "custom_no_of_rolls",
                "qty",
                "rate",
                "amount"
            ]
        },
        {
            id: "flexo_lam_print_sheet",
            priority: 25,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                const hasItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("NON WOVEN LAMINATED PRINTED SHEET");
                });
                const isSheetCutting = raw.includes("SHEET CUTTING") || raw.includes("SHEET");
                return (isSheetCutting && hasItem) || (raw.includes("LAMINAT") && raw.includes("PRINT") && raw.includes("SHEET"));
            },
            visible_fields: [
                "item_code", "item_name", "custom_design_code", "custom_design_name", "custom_design_colour", "custom_no_of_design_colours", "custom_no_of_design_colour", "custom_size_code",
                "custom_process", "custom_quality", "custom_colour", "custom_gsm", "custom_lamination_gsm",
                "custom_fabric_gsm", "custom_lamination_side", "custom_width_inch", "custom_width_mm", "custom_width_cm",
                "custom_height_inches", "custom_height_mm", "custom_height_cm", "qty", "custom_no_of_sheets_pcs",
                "rate", "amount", "custom_meter", "custom_meter_per_roll", "custom_no_of_rolls",
                "custom_weight_per_roll", "custom_grams_per_sheet_kgs", "custom_grams_per_piece"
            ]
        },
        {
            id: "flexo_print_sheet",
            priority: 20,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                const hasItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("NON WOVEN PRINTED SHEET");
                });
                const isPrintedSheet = raw.includes("NON WOVEN PRINTED SHEET") || (raw.includes("PRINT") && raw.includes("SHEET") && !raw.includes("LAMINAT"));
                return isPrintedSheet || hasItem;
            },
            visible_fields: [
                "item_code", "item_name", "custom_design_code", "custom_design_name", "custom_design_colour", "custom_no_of_design_colours", "custom_no_of_design_colour", "custom_size_code",
                "custom_process", "custom_quality", "custom_colour", "custom_gsm", "custom_width_inch",
                "custom_width_mm", "custom_width_cm", "custom_height_inches", "custom_height_mm",
                "custom_height_cm", "qty", "custom_no_of_sheets_pcs", "rate", "amount", "custom_meter",
                "custom_meter_per_roll", "custom_no_of_rolls", "custom_weight_per_roll",
                "custom_grams_per_sheet_kgs", "custom_grams_per_piece"
            ]
        },
        {
            id: "flexo_lam_print_fabric",
            priority: 25,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                const hasItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("NON WOVEN LAMINATED PRINTED FABRIC");
                });
                const isFlexoPrinting = raw.includes("PRINTING") || raw.includes("FLEXO");
                return (isFlexoPrinting && hasItem) || (raw.includes("LAMINAT") && raw.includes("PRINT") && (raw.includes("FABRIC") || !raw.includes("SHEET")));
            },
            visible_fields: [
                "item_code", "item_name", "custom_design_code", "custom_design_name", "custom_design_colour", "custom_no_of_design_colours", "custom_no_of_design_colour", "custom_process",
                "custom_quality", "custom_colour", "custom_gsm", "custom_lamination_gsm", "custom_lamination_side",
                "custom_fabric_gsm", "custom_width_inch", "custom_width_mm", "custom_width_cm", "qty", "rate", "amount",
                "custom_meter", "custom_meter_per_roll", "custom_no_of_rolls", "custom_weight_per_roll"
            ]
        },
        {
            id: "flexo_print_fabric",
            priority: 20,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                const isFlexoPrinting = raw.includes("PRINTING") || raw.includes("FLEXO");
                return isFlexoPrinting || (raw.includes("PRINT") && !raw.includes("LAMINAT") && (raw.includes("FABRIC") || !raw.includes("SHEET")));
            },
            visible_fields: [
                "item_code", "item_name", "custom_design_code", "custom_design_name", "custom_process",
                "custom_quality", "custom_colour", "custom_gsm", "custom_width_inch", "custom_width_mm",
                "custom_width_cm", "qty", "rate", "amount", "custom_meter", "custom_meter_per_roll",
                "custom_no_of_rolls", "custom_weight_per_roll", "custom_design_colour",
                "custom_no_of_design_colours", "custom_no_of_design_colour", "custom_design_imgae"
            ]
        },
        {
            id: "bopp_printing",
            priority: 30,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                const hasItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("PRINTED BOPP") || ip.includes("BOPP PRINT");
                });
                const isBoppPrinting = (raw.includes("PRINTING") || raw.includes("PRINT")) && raw.includes("BOPP");
                return isBoppPrinting || hasItem;
            },
            visible_fields: [
                "item_code", "item_name", "custom_process", "custom_gsm", "custom_bopp_gsm",
                "custom_width_inch", "custom_width_mm", "custom_width_cm",
                "custom_design_code", "custom_design_name", "custom_design_colour", "custom_no_of_design_colours", "custom_no_of_design_colour",
                "custom_finishing", "custom_coating",
                "qty", "rate", "custom_meter_per_roll", "custom_meter", "custom_no_of_rolls", "amount"
            ]
        },
        {
            id: "plain_lamination",
            priority: 35,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                const lamination_type = String(doc.custom_type_of_lamination || "").toUpperCase();
                const hasItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return (ip.includes("NON WOVEN LAMINATED FABRIC") || ip.includes("NON WOVEN LAMINATED SLITTED FABRIC")) && !ip.includes("PRINT") && !ip.includes("BOPP");
                });
                const isPlainLamination = raw.includes("LAMINATION") && lamination_type.includes("PLAIN");
                return isPlainLamination || hasItem || raw.includes("PLAIN LAMINATION");
            },
            visible_fields: [
                "item_code", "item_name", "custom_process", "custom_quality", "custom_colour",
                "custom_gsm", "custom_lamination_gsm", "custom_lamination_side", "custom_width_inch",
                "custom_width_mm", "custom_width_cm", "qty", "rate", "amount", "custom_fabric_gsm",
                "custom_meter", "custom_meter_per_roll", "custom_no_of_rolls", "custom_weight_per_roll"
            ]
        },
        {
            id: "bopp_lamination",
            priority: 35,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                const lamination_type = String(doc.custom_type_of_lamination || "").toUpperCase();
                const hasItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("NON WOVEN BOPP LAMINATED FABRIC") || ip.includes("NON WOVEN BOPP LAMINATED SLITTED FABRIC") || (ip.includes("NON WOVEN BOPP LAMINATED") && !ip.includes("PRINT") && !ip.includes("SHEET"));
                });
                const isBoppLamination = raw.includes("LAMINATION") && lamination_type.includes("BOPP");
                return isBoppLamination || hasItem;
            },
            visible_fields: [
                "item_code", "item_name", "custom_design_code", "custom_design_name", "custom_design_colour", "custom_no_of_design_colours", "custom_no_of_design_colour",
                "custom_process", "custom_quality", "custom_colour", "custom_gsm", "custom_fabric_gsm",
                "custom_lamination_gsm", "custom_bopp_gsm", "custom_width_inch", "custom_width_mm",
                "custom_width_cm", "custom_lamination_side", "custom_finishing", "custom_coating", "qty", "rate", "amount",
                "custom_meter", "custom_meter_per_roll", "custom_no_of_rolls", "custom_weight_per_roll"
            ]
        },
        {
            id: "bopp_laminated_sheet",
            priority: 30,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                const lamination_type = String(doc.custom_type_of_lamination || "").toUpperCase();
                const hasItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("NON WOVEN BOPP LAMINATED SHEET");
                });
                const isBoppSheet = raw.includes("SHEET") && (raw.includes("BOPP") || lamination_type.includes("BOPP"));
                return isBoppSheet || hasItem;
            },
            visible_fields: [
                "item_code", "item_name", "custom_design_code", "custom_design_name", "custom_design_colour", "custom_no_of_design_colours", "custom_no_of_design_colour",
                "custom_process", "custom_quality", "custom_colour", "custom_gsm", "custom_size_code",
                "custom_width_inch", "custom_width_mm", "custom_width_cm", "custom_height_inches",
                "custom_height_mm", "custom_height_cm", "custom_lamination_gsm", "custom_fabric_gsm",
                "custom_lamination_side", "custom_bopp_gsm", "custom_finishing", "custom_coating", "qty", "rate", "amount", "custom_no_of_sheets_pcs",
                "custom_grams_per_sheet_kgs", "custom_weight_per_roll", "custom_meter_per_roll", "custom_meter",
                "custom_no_of_rolls"
            ]
        },
        {
            id: "laminated_sheet",
            priority: 25,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                const lamination_type = String(doc.custom_type_of_lamination || "").toUpperCase();
                const hasItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("NON WOVEN LAMINATED SHEET") && !ip.includes("BOPP") && !ip.includes("PRINT");
                });
                const isLamSheet = raw.includes("SHEET") && (raw.includes("LAMINAT") || lamination_type.includes("PLAIN"));
                return isLamSheet || hasItem;
            },
            visible_fields: [
                "item_code", "item_name", "custom_process", "custom_quality", "custom_colour",
                "custom_gsm", "custom_size_code", "custom_width_inch", "custom_width_mm",
                "custom_width_cm", "custom_height_inches", "custom_height_mm", "custom_height_cm",
                "custom_lamination_gsm", "custom_fabric_gsm", "custom_lamination_side", "qty", "rate",
                "amount", "custom_no_of_sheets_pcs", "custom_grams_per_sheet_kgs", "custom_weight_per_roll",
                "custom_meter_per_roll", "custom_meter", "custom_no_of_rolls"
            ]
        },
        {
            id: "plain_sheet",
            priority: 20,
            when(doc, frm) {
                const raw = parent_process_text_blob(doc, frm).toUpperCase();
                const hasItem = (doc.items || []).some(item => {
                    const ip = (item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("NON WOVEN PLAIN SHEET");
                });
                const isPlainSheet = raw.includes("SHEET CUTTING") || raw.includes("SHEET");
                return isPlainSheet || hasItem;
            },
            visible_fields: [
                "item_code", "item_name", "custom_process", "custom_quality", "custom_colour",
                "custom_gsm", "custom_size_code", "custom_width_inch", "custom_width_mm",
                "custom_width_cm", "custom_height_inches", "custom_height_mm", "custom_height_cm",
                "qty", "rate", "amount", "custom_no_of_sheets_pcs", "custom_grams_per_sheet_kgs",
                "custom_weight_per_roll", "custom_meter_per_roll", "custom_meter", "custom_no_of_rolls"
            ]
        }
        // --- Add more rules here, or use registerGridMode() from another snippet ---
        // Example:
        // {
        //   id: 'sheet_sales',
        //   priority: 5,
        //   when(doc) { return (doc.custom_process || '').toLowerCase().includes('sheet'); },
        //   visible_fields: ['item_code', 'item_name', 'custom_size_code', 'qty', ...],
        // },
    ];

    function normalizeVisibleFields(ruleOrFields) {
        if (ruleOrFields instanceof Set) return Array.from(ruleOrFields);
        let raw = [];
        if (Array.isArray(ruleOrFields)) raw = ruleOrFields;
        else if (ruleOrFields && typeof ruleOrFields === "object") {
            raw = ruleOrFields.visible_fields != null ? ruleOrFields.visible_fields : ruleOrFields.visibleFields || [];
        }
        return raw;
    }

    function sortedModesCopy() {
        return MODES.slice().sort((a, b) => (b.priority || 0) - (a.priority || 0));
    }

    /** Server DocType defaults — restored before each apply so refresh/reload does not leave fields globally hidden. */
    function ensurePristineDocfields() {
        if (frappe._qn_quotation_item_pristine_map) return;
        const map = {};
        let raw = frappe.meta.docfield_copy && frappe.meta.docfield_copy[CHILD_DOCTYPE];
        if (raw != null && !Array.isArray(raw) && typeof raw === "object") {
            raw = Object.values(raw);
        }
        if (!Array.isArray(raw) || !raw.length) {
            raw = typeof frappe.meta.get_docfields === "function" ? frappe.meta.get_docfields(CHILD_DOCTYPE) : [];
        }
        (raw || []).forEach(df => {
            if (!df || !df.fieldname) return;
            map[df.fieldname] = {
                fieldtype: df.fieldtype,
                options: df.options,
                hidden: df.hidden ? 1 : 0,
                in_list_view: df.in_list_view ? 1 : 0,
                columns: df.columns != null && df.columns !== undefined ? df.columns : 1,
                read_only: FORCE_EDITABLE_FIELDS.has(df.fieldname) ? 0 : (df.read_only ? 1 : 0)
            };
        });
        frappe._qn_quotation_item_pristine_map = map;
    }

    function restorePristineDocfieldsToMeta() {
        ensurePristineDocfields();
        const pristine = frappe._qn_quotation_item_pristine_map;
        if (!pristine) return;

        function patchDf(df) {
            if (!df || !df.fieldname) return;
            const p = pristine[df.fieldname];
            if (!p) return;
            df.hidden = p.hidden;
            df.in_list_view = p.in_list_view;
            df.columns = p.columns;
            if (p.fieldtype) df.fieldtype = p.fieldtype;
            if (p.options != null && p.options !== undefined) df.options = p.options;
            if (FORCE_EDITABLE_FIELDS.has(df.fieldname)) {
                force_editable_df(df);
            } else {
                df.read_only = p.read_only;
            }
        }

        try {
            const meta = typeof frappe.get_meta === "function" && frappe.get_meta(CHILD_DOCTYPE);
            if (meta && Array.isArray(meta.fields)) meta.fields.forEach(patchDf);
        } catch (e) { /* ignore */ }
        try {
            const dfMap = frappe.meta.docfield_map && frappe.meta.docfield_map[CHILD_DOCTYPE];
            if (dfMap) Object.values(dfMap).forEach(patchDf);
        } catch (e) { /* ignore */ }
        try {
            let copy = frappe.meta.docfield_copy && frappe.meta.docfield_copy[CHILD_DOCTYPE];
            if (copy != null && !Array.isArray(copy) && typeof copy === "object") copy = Object.values(copy);
            if (Array.isArray(copy)) copy.forEach(patchDf);
        } catch (e) { /* ignore */ }
    }

    function resolveMode(frm) {
        const doc = frm && frm.doc;
        if (!doc) return null;
        for (const rule of sortedModesCopy()) {
            try {
                if (rule.when && rule.when(doc, frm)) return rule;
            } catch (e) {
                if (typeof console !== "undefined" && console.warn) console.warn("[quotation_grid_visibility]", rule.id, e);
            }
        }
        return null;
    }

    /** When parent when() misses (e.g. link title not loaded), pick one mode from item row processes (highest priority wins). */
    function resolveModeFromItemRows(frm) {
        const doc = frm && frm.doc;
        if (!doc || !Array.isArray(doc.items) || !doc.items.length) return null;
        const matchedRuleIds = new Set();
        (doc.items || []).forEach(item => {
            if (!item) return;
            const oneRowDoc = Object.assign({}, doc, { items: [item] });
            for (const rule of sortedModesCopy()) {
                try {
                    if (rule.when && rule.when(oneRowDoc, frm)) {
                        matchedRuleIds.add(rule.id);
                    }
                } catch (e) { /* ignore */ }
            }
        });
        for (const rule of sortedModesCopy()) {
            if (matchedRuleIds.has(rule.id)) return rule;
        }
        return null;
    }

    /** Strip fields that must never appear for a resolved grid mode (safety net after mode list). */
    const MODE_FIELD_DENY = {
        plain_w_cut_bag: [
            "custom_design_colour", "custom_no_of_design_colour", "custom_no_of_design_colours",
            "custom_lamination_gsm", "custom_lamination_side", "custom_bopp_gsm",
            "custom_loop_handle_quality", "custom_loop_handle_colour",
            "custom_loop_handle_gsm", "custom_loop_handle_width_inches"
        ],
        printed_w_cut_bag: [
            "custom_lamination_gsm", "custom_lamination_side", "custom_bopp_gsm",
            "custom_loop_handle_quality", "custom_loop_handle_colour",
            "custom_loop_handle_gsm", "custom_loop_handle_width_inches"
        ],
        laminated_w_cut_bag: [
            "custom_design_colour", "custom_no_of_design_colour", "custom_no_of_design_colours",
            "custom_bopp_gsm",
            "custom_loop_handle_quality", "custom_loop_handle_colour",
            "custom_loop_handle_gsm", "custom_loop_handle_width_inches"
        ],
        laminated_printed_w_cut_bag: [
            "custom_loop_handle_quality", "custom_loop_handle_colour",
            "custom_loop_handle_gsm", "custom_loop_handle_width_inches"
        ],
        plain_box_bag: ["custom_design_colour", "custom_no_of_design_colour", "custom_no_of_design_colours", "custom_lamination_gsm", "custom_lamination_side", "custom_bopp_gsm"],
        d_cut_bag: ["custom_design_colour", "custom_no_of_design_colour", "custom_no_of_design_colours", "custom_lamination_gsm", "custom_lamination_side", "custom_bopp_gsm"],
        d_cut_flexo_bag: ["custom_lamination_gsm", "custom_lamination_side", "custom_bopp_gsm"],
        d_cut_laminated_bag: ["custom_design_colour", "custom_no_of_design_colour", "custom_no_of_design_colours", "custom_bopp_gsm"],
        fabric_making: ["custom_design_colour", "custom_no_of_design_colour", "custom_no_of_design_colours", "custom_lamination_gsm", "custom_lamination_side", "custom_bopp_gsm", "custom_design_code", "custom_design_name", "custom_fabric_gsm"],
        non_woven_fabric_initial: ["custom_design_colour", "custom_no_of_design_colour", "custom_no_of_design_colours", "custom_lamination_gsm", "custom_lamination_side", "custom_bopp_gsm", "custom_design_code", "custom_design_name", "custom_fabric_gsm"],
        flexo_print_sheet: ["custom_lamination_gsm", "custom_lamination_side", "custom_bopp_gsm"],
        flexo_print_fabric: ["custom_lamination_gsm", "custom_bopp_gsm"],
        flexo_printed_box_bag: ["custom_lamination_gsm", "custom_lamination_side", "custom_bopp_gsm"],
    };

    function sanitizeVisibleFieldsForMode(frm, vis, modeId) {
        const deny = new Set();
        const denyList = MODE_FIELD_DENY[modeId];
        if (denyList && denyList.length) {
            denyList.forEach(fn => deny.add(fn));
        }

        // Robust check: if this quotation or any of its items is for W-Cut, deny loop handle fields.
        let isWCut = false;
        if (modeId && modeId.includes("w_cut")) {
            isWCut = true;
        } else {
            const doc = frm && frm.doc;
            const raw = parent_process_text_blob(doc, frm).toUpperCase();
            if (raw.includes("W-CUT") || raw.includes("W CUT")) {
                isWCut = true;
            } else if (doc && Array.isArray(doc.items)) {
                isWCut = doc.items.some(item => {
                    const ip = String(item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("W-CUT") || ip.includes("W CUT");
                });
            }
        }

        if (isWCut) {
            deny.add();
            deny.add("custom_loop_handle_quality");
            deny.add("custom_loop_handle_colour");
            deny.add("custom_loop_handle_gsm");
            deny.add("custom_loop_handle_width_inches");
        }

        return (vis || []).filter(fn => !deny.has(fn));
    }

    /** Keep GSM / Qty near the front so users do not have to scroll past width/size columns. */
    const QUOTATION_GRID_COLUMN_PRIORITY = [
        "item_code",
        "item_name",
        "custom_process",
        "custom_design_code",
        "custom_design_name",
        "custom_design_colour",
        "custom_no_of_design_colours",
        "custom_no_of_design_colour",
        "custom_quality",
        "custom_colour",
        "custom_gsm",
        "custom_fabric_gsm",
        "qty",
        "custom_bopp_gsm",
        "custom_lamination_gsm",
        "custom_lamination_side",
        "custom_bag_size",
        "custom_finishing",
        "custom_coating",
        "custom_no_of_rolls",
        "custom_meter",
        "custom_meter_per_roll",
        "uom",
        "rate",
        "amount"
    ];

    function prioritizeQuotationVisibleColumns(vis) {
        const list = Array.isArray(vis) ? vis.slice() : [];
        const remaining = new Set(list);
        const out = [];
        QUOTATION_GRID_COLUMN_PRIORITY.forEach(function (fn) {
            if (remaining.has(fn)) {
                out.push(fn);
                remaining.delete(fn);
            }
        });
        list.forEach(function (fn) {
            if (remaining.has(fn)) out.push(fn);
        });
        return out;
    }

    const DEFAULT_GRID_FIELDS = [
        "item_code",
        "custom_width_mm",
        "custom_width_cm",
        "qty",
        "rate",
        "amount"
    ];

    function getDefaultGridVisibleFields() {
        return prioritizeQuotationVisibleColumns(DEFAULT_GRID_FIELDS.slice());
    }

    const CUSTOM_FABRIC_GRID_VISIBLE = [
        "item_code",
        "item_name",
        "custom_process",
        "custom_quality",
        "custom_colour",
        "custom_gsm",
        "custom_fabric_gsm",
        "custom_width_inch",
        "custom_width_mm",
        "custom_width_cm",
        "custom_meter_per_roll",
        "custom_weight_per_roll",
        "custom_meter",
        "custom_no_of_rolls",
        "qty",
        "uom",
        "rate",
        "amount"
    ];

    function getCustomFabricGridVisibleFields() {
        return prioritizeQuotationVisibleColumns(CUSTOM_FABRIC_GRID_VISIBLE.slice());
    }

    function hasCustomFabricItemRow(frm) {
        const items = frm && frm.doc && frm.doc.items;
        if (!Array.isArray(items)) return false;
        return items.some(function (row) {
            const ic = row && String(row.item_code || "").trim();
            return ic === "CUSTOM-FABRIC" || ic.indexOf("CUSTOM-FABRIC") === 0;
        });
    }

    function buildVisibleFieldsForForm(frm) {
        // Always try to resolve a process-based mode first.
        // This ensures that setting custom_type_of_bag = "W-Cut" shows the correct 
        // bag-specific columns even if a CUSTOM-FABRIC row is currently present.
        let baseVisible = [];
        const mode = resolveMode(frm) || resolveModeFromItemRows(frm);
        if (mode) {
            baseVisible = prioritizeQuotationVisibleColumns(
                sanitizeVisibleFieldsForMode(frm, normalizeVisibleFields(mode), mode.id)
            );
        } else {
            // Fallback for when no process is selected
            baseVisible = getDefaultGridVisibleFields();
        }

        // --- Loop Handle Dynamic Visibility ---
        // ONLY ALLOW LOOP HANDLE FIELDS IF BOX BAG AND MAIN PROCESS IS BAG
        const raw = parent_process_text_blob(frm.doc, frm).toUpperCase();
        const bagType = (frm.doc && frm.doc.custom_type_of_bag || "").toUpperCase();
        const mainProcess = String(frm.doc.custom_process || frm.doc.process || "").toUpperCase();
        
        let isBoxBag = false;
        if (mainProcess.includes("BAG") || mainProcess.includes("SHOPPER")) {
            if (raw.includes("BOX BAG") || raw.includes("SHOPPER") || bagType.includes("BOX BAG") || bagType.includes("SHOPPER")) {
                isBoxBag = true;
            } else if (frm.doc && Array.isArray(frm.doc.items)) {
                isBoxBag = frm.doc.items.some(item => {
                    const ip = String(item.custom_process || item.process || "").toUpperCase();
                    return ip.includes("BOX BAG") || ip.includes("SHOPPER");
                });
            }
        }

        if (isBoxBag) {
            const items = frm.doc.items || [];
            let hasBoppLH = false;
            let hasNonWovenLH = false;
            items.forEach(row => {
                const lhp = String(row.custom_lh_process || "").toUpperCase();
                if (lhp === "NON WOVEN FABRIC") {
                    hasNonWovenLH = true;
                } else if (lhp.includes("BOPP")) {
                    hasBoppLH = true;
                }
            });

            if (hasBoppLH || hasNonWovenLH) {
                baseVisible.push(
                    "custom_lh_process",
                    "custom_loop_handle_quality",
                    "custom_loop_handle_colour",
                    "custom_loop_handle_gsm",
                    "custom_loop_handle_width_inches"
                );
            }
            if (hasBoppLH) {
                baseVisible.push(
                    "custom_lh_design_code",
                    "custom_lh_design_name",
                    "custom_lh_no_of_design_colour",
                    "custom_lh_design_colour",
                    "custom_lh_fabric_gsm",
                    "custom_lh_lamination_gsm",
                    "custom_lh_bopp_gsm"
                );
            }
        } else {
            // Remove any loop handle fields that might have leaked from modes or defaults
            const denyLH = new Set([
                "custom_lh_process", "custom_loop_handle_quality", "custom_loop_handle_colour",
                "custom_loop_handle_gsm", "custom_loop_handle_width_inches", "custom_lh_design_code",
                "custom_lh_design_name", "custom_lh_no_of_design_colour", "custom_lh_design_colour",
                "custom_lh_fabric_gsm", "custom_lh_lamination_gsm", "custom_lh_bopp_gsm"
            ]);
            baseVisible = baseVisible.filter(fn => !denyLH.has(fn));
        }

        return baseVisible;
    }

    function scheduleApplyItemsGrid(frm, opts) {
        if (!frm) return;
        frm._qn_last_grid_opts = opts || {};
        if (frm._qn_grid_apply_timer) {
            clearTimeout(frm._qn_grid_apply_timer);
        }
        frm._qn_grid_apply_timer = setTimeout(function () {
            if (!frm || !frm.doc) return;
            applyItemsGrid(frm, frm._qn_last_grid_opts || {}, 0);
        }, 120);
    }

    /** Saved GridView columns force Datatable read_only — do not use for Quotation Item. */
    function clearQuotationItemGridUserDefinedColumns(grid) {
        if (!grid) return;
        try {
            delete grid.user_defined_columns;
        } catch (e0) { /* ignore */ }
        grid.user_defined_columns = null;
        try {
            delete grid.grid_columns;
        } catch (e1) { /* ignore */ }
        try {
            if (frappe.model && frappe.model.user_settings && frappe.model.user_settings[CHILD_DOCTYPE]) {
                delete frappe.model.user_settings[CHILD_DOCTYPE].GridView;
            }
        } catch (e2) { /* ignore */ }
    }

    function bindQuotationItemsGridUserSettingsHook(frm) {
        const grid = frm && frm.fields_dict && frm.fields_dict.items && frm.fields_dict.items.grid;
        if (!grid || grid._qn_user_settings_hooked) return;
        grid._qn_user_settings_hooked = true;
        const origGet = grid.get_user_settings;
        if (typeof origGet !== "function") return;
        grid.get_user_settings = function qnQuotationItemsUserSettings() {
            const settings = origGet.apply(this, arguments) || {};
            if (settings.GridView) delete settings.GridView;
            clearQuotationItemGridUserDefinedColumns(this);
            return settings;
        };
    }

    function buildGridViewColumnObjects(frm, visibleArray) {
        const out = [];
        const seen = new Set();
        (visibleArray || []).forEach(fieldname => {
            if (!fieldname || seen.has(fieldname)) return;
            seen.add(fieldname);
            let df = null;
            try {
                df = frappe.meta.get_docfield(CHILD_DOCTYPE, fieldname, frm && frm.docname);
            } catch (e) { /* ignore */ }
            if (!df) {
                try {
                    const meta = frappe.get_meta(CHILD_DOCTYPE);
                    df = meta && meta.fields ? meta.fields.find(d => d.fieldname === fieldname) : null;
                } catch (e2) { /* ignore */ }
            }
            if (!df || SKIP_TYPES.has(df.fieldtype)) return;
            const forceEdit = FORCE_EDITABLE_FIELDS.has(df.fieldname) || LINK_GRID_FIELDS.has(df.fieldname);
            const col = {
                fieldname: df.fieldname,
                fieldtype: df.fieldtype,
                label: df.label || df.fieldname,
                columns: pick_visible_column_width(null, df),
                in_list_view: 1,
                hidden: 0,
                read_only: forceEdit ? 0 : (df.read_only ? 1 : 0),
                read_only_depends_on: forceEdit ? "" : (df.read_only_depends_on || "")
            };
            if (df.options != null && df.options !== "") col.options = df.options;
            if (df.fieldtype === "Link" && !col.options) {
                const fallback = (frappe._qn_quotation_item_pristine_map && frappe._qn_quotation_item_pristine_map[df.fieldname]) || {};
                if (fallback.options) col.options = fallback.options;
            }
            out.push(col);
        });
        return out;
    }

    function notifyGridVisibilityApplied(frm) {
        if (!frm) return;
        try {
            const q = frappe.quotation_item_queries;
            if (q && typeof q.register === "function" && typeof q.refreshAll === "function") {
                q.register(frm);
                setTimeout(function () { q.refreshAll(frm); }, 0);
                setTimeout(function () { q.refreshAll(frm); }, 300);
            }
        } catch (e) { /* ignore */ }
        try {
            const unlock = frappe.quotation_lamination_editable;
            if (unlock && typeof unlock.unlockFields === "function") {
                unlock.unlockFields(frm);
            }
            if (unlock && typeof unlock.unlockGridRow === "function") {
                const grid = frm.fields_dict && frm.fields_dict.items && frm.fields_dict.items.grid;
                const run = function () {
                    if (!grid || !Array.isArray(grid.grid_rows)) return;
                    grid.grid_rows.forEach(function (grid_row) {
                        unlock.unlockGridRow(frm, grid_row);
                    });
                };
                setTimeout(run, 0);
                setTimeout(run, 350);
            }
        } catch (e2) { /* ignore */ }
    }

    function resetQuotationItemGridUserSettings() {
        return new Promise(function (resolve) {
            const done = function () { resolve(); };
            try {
                if (frappe.model && typeof frappe.model.delete_user_settings === "function") {
                    frappe.model.delete_user_settings(CHILD_DOCTYPE, "GridView").then(done).catch(done);
                    return;
                }
            } catch (e) { /* ignore */ }
            try {
                if (frappe.model && frappe.model.user_settings && frappe.model.user_settings[CHILD_DOCTYPE]) {
                    delete frappe.model.user_settings[CHILD_DOCTYPE].GridView;
                }
            } catch (e2) { /* ignore */ }
            done();
        });
    }

    function persistQuotationItemGridSettings(frm, visibleArray) {
        const columns = buildGridViewColumnObjects(frm, visibleArray);
        if (!columns.length) return Promise.resolve();
        try {
            if (frappe.model && typeof frappe.model.save_user_settings === "function") {
                return frappe.model.save_user_settings(CHILD_DOCTYPE, "GridView", columns).catch(function () { });
            }
        } catch (e) { /* ignore */ }
        return Promise.resolve();
    }

    function bindGridSetupVisibleColumnsHook(frm) {
        const grid = frm && frm.fields_dict && frm.fields_dict.items && frm.fields_dict.items.grid;
        if (!grid || grid._qn_setup_columns_hooked) return;
        const orig = grid.setup_visible_columns;
        if (typeof orig !== "function") return;
        grid._qn_setup_columns_hooked = true;
        grid.setup_visible_columns = function qnSetupVisibleColumns() {
            clearQuotationItemGridUserDefinedColumns(grid);
            return orig.apply(this, arguments);
        };
    }

    function bindQuotationItemsGridRefreshHook(frm) {
        const grid = frm && frm.fields_dict && frm.fields_dict.items && frm.fields_dict.items.grid;
        if (!grid || grid._qn_visibility_refresh_hooked) return;
        const origRefresh = grid.refresh;
        if (typeof origRefresh !== "function") return;
        grid._qn_visibility_refresh_hooked = true;
        grid.refresh = function quotationGridRefreshUnlockOnly() {
            clearQuotationItemGridUserDefinedColumns(this);
            return origRefresh.apply(this, arguments);
        };
    }

    /**
     * Frappe exposes Quotation Item fields as an array OR as an object map (version/site dependent).
     */
    function getQuotationItemDocfieldsArray(frm) {
        let raw = frappe.meta.docfield_copy && frappe.meta.docfield_copy["Quotation Item"];
        if (raw != null && !Array.isArray(raw) && typeof raw === "object") {
            raw = Object.values(raw);
        }
        if (!Array.isArray(raw) || !raw.length) {
            raw = typeof frappe.meta.get_docfields === "function" ? frappe.meta.get_docfields("Quotation Item") : [];
        }
        if (raw != null && !Array.isArray(raw) && typeof raw === "object") {
            raw = Object.values(raw);
        }
        if (!Array.isArray(raw) || !raw.length) {
            const grid = frm && frm.fields_dict && frm.fields_dict.items && frm.fields_dict.items.grid;
            raw = grid && grid.docfields ? grid.docfields.slice() : [];
        }
        return Array.isArray(raw) ? raw : [];
    }

    function ensureBaseline(frm) {
        if (frm._qn_item_grid_df_baseline) return;
        frm._qn_item_grid_df_baseline = {};
        const copies = getQuotationItemDocfieldsArray(frm);
        copies.forEach(df => {
            if (!df || !df.fieldname) return;
            frm._qn_item_grid_df_baseline[df.fieldname] = {
                hidden: df.hidden ? 1 : 0,
                in_list_view: df.in_list_view ? 1 : 0,
                columns: df.columns != null && df.columns !== undefined ? df.columns : 1,
                read_only: df.read_only ? 1 : 0
            };
        });
    }

    /** Form-level child-docfield overrides (Desk API). Required for Grid: visibility uses BOTH `hidden` and `in_list_view`. */
    function safe_set_child_df_prop(frm, fieldname, prop, val) {
        if (!frm || typeof frm.set_df_property !== "function" || !fieldname) return;
        try {
            frm.set_df_property(fieldname, prop, val, CHILD_DOCTYPE, CHILD_PARENTFIELD);
        } catch (e) { /* ignore */ }
    }

    function safe_set_child_hidden(frm, fieldname, hiddenBit) {
        safe_set_child_df_prop(frm, fieldname, "hidden", hiddenBit ? 1 : 0);
    }

    /**
     * Must patch frm.fields_dict.items.df.fields in place — on Frappe Cloud set_df_property alone
     * often does not refresh the live Table field / grid; Configure → Update does this merge.
     */
    function apply_visibility_to_child_table_field(frm, visibleSet) {
        ensureBaseline(frm);
        const baseline = frm._qn_item_grid_df_baseline;
        const tf = frm.fields_dict.items;
        if (!tf || !tf.df) return;

        // ── Step 1: Reconstruct tf.df.fields from authoritative metadata preserving existing references ──
        let allFields = [];
        try {
            const raw = typeof frappe.meta.get_docfields === "function" ? frappe.meta.get_docfields(CHILD_DOCTYPE) : null;
            if (Array.isArray(raw)) allFields = raw;
        } catch (e) { }
        if (!allFields.length) {
            try {
                const meta = typeof frappe.get_meta === "function" && frappe.get_meta(CHILD_DOCTYPE);
                if (meta && Array.isArray(meta.fields)) allFields = meta.fields;
            } catch (e) { }
        }

        if (allFields.length) {
            const existingMap = {};
            if (Array.isArray(tf.df.fields)) {
                tf.df.fields.forEach(df => {
                    if (df && df.fieldname) existingMap[df.fieldname] = df;
                });
            }
            tf.df.fields = allFields.filter(df => df && df.fieldname && !SKIP_TYPES.has(df.fieldtype)).map(df => {
                return existingMap[df.fieldname] || df;
            });
        }

        const grid = tf.grid;
        if (grid) {
            grid.docfields = tf.df.fields;
        }

        // ── Step 2: Apply properties directly in-place ──
        tf.df.fields.forEach(df => {
            if (!df.fieldname || SKIP_TYPES.has(df.fieldtype)) return;
            const show = visibleSet.has(df.fieldname);
            df.hidden = show ? 0 : 1;
            if (show) {
                df.in_list_view = 1;
                df.columns = pick_visible_column_width(baseline && baseline[df.fieldname], df);
                force_editable_df(df);
            } else {
                df.in_list_view = 0;
                df.columns = 0;
            }
            safe_set_child_hidden(frm, df.fieldname, !show);
            safe_set_child_df_prop(frm, df.fieldname, "in_list_view", show ? 1 : 0);
            safe_set_child_df_prop(frm, df.fieldname, "columns", show ? df.columns : 0);
            if (show && FORCE_EDITABLE_FIELDS.has(df.fieldname)) {
                safe_set_child_df_prop(frm, df.fieldname, "read_only", 0);
                safe_set_child_df_prop(frm, df.fieldname, "read_only_depends_on", "");
            }
        });
    }

    function restore_child_table_field_from_baseline(frm) {
        const baseMap = frm._qn_item_grid_df_baseline;
        if (!frm || !baseMap) return;
        const tf = frm.fields_dict.items;
        if (tf && tf.df && Array.isArray(tf.df.fields)) {
            tf.df.fields.forEach(df => {
                if (!df.fieldname || SKIP_TYPES.has(df.fieldtype)) return;
                const b = baseMap[df.fieldname];
                if (!b) return;
                df.hidden = b.hidden;
                df.in_list_view = b.in_list_view;
                df.columns = b.columns;
                if (FORCE_EDITABLE_FIELDS.has(df.fieldname)) {
                    force_editable_df(df);
                } else {
                    df.read_only = b.read_only;
                }
                safe_set_child_hidden(frm, df.fieldname, b.hidden ? 1 : 0);
                safe_set_child_df_prop(frm, df.fieldname, "in_list_view", b.in_list_view);
                safe_set_child_df_prop(frm, df.fieldname, "columns", b.columns != null ? b.columns : df.columns);
                if (FORCE_EDITABLE_FIELDS.has(df.fieldname)) {
                    safe_set_child_df_prop(frm, df.fieldname, "read_only", 0);
                    safe_set_child_df_prop(frm, df.fieldname, "read_only_depends_on", "");
                }
            });
        } else {
            Object.keys(baseMap).forEach(fieldname => {
                const b = baseMap[fieldname];
                if (b) safe_set_child_hidden(frm, fieldname, b.hidden ? 1 : 0);
            });
        }
    }

    /** After set_df_property, meta lives on table field `.df.fields`; Grid still had old docfields → UI stuck until Configure → Update. */
    function sync_items_grid_docfields_from_table_field(frm) {
        const tf = frm.fields_dict.items;
        const grid = tf && tf.grid;
        if (!grid) return;
        let next = null;
        if (tf.df && Array.isArray(tf.df.fields) && tf.df.fields.length) {
            next = tf.df.fields;
        } else if (typeof frappe.meta.get_docfields === "function") {
            const g = frappe.meta.get_docfields(CHILD_DOCTYPE);
            if (Array.isArray(g) && g.length) next = g;
        }
        if (next && next.length) {
            grid.docfields = next;
        }
    }

    /** Tear down Datatable instance so headers/body redraw like after Configure Columns → Update */
    function destroy_grid_datatable(grid) {
        if (!grid) return;
        try {
            let dt = grid.datatable;
            if (!dt && grid.wrapper && typeof grid.wrapper.data === "function") {
                try {
                    dt = grid.wrapper.data("datatable");
                } catch (e_) { /* no jQuery api */ }
            }
            if (dt && typeof dt.destroy === "function") {
                dt.destroy();
            }
        } catch (e) { /* ignore */ }
        try {
            grid.datatable = null;
        } catch (e2) { /* ignore */ }
    }

    function repaint_items_grid_after_meta_change(frm, visibleSet) {
        const grid = frm.fields_dict.items && frm.fields_dict.items.grid;
        if (!grid) return;
        frm._qn_applying_grid_visibility = true;
        patch_meta_child_docfields_visibility(frm, visibleSet);
        destroy_grid_datatable(grid);
        try {
            if (typeof grid.setup_visible_columns === "function") {
                grid.setup_visible_columns();
            }
        } catch (e3) { /* ignore */ }
        if (typeof grid.setup_columns === "function") grid.setup_columns();
        if (typeof grid.refresh === "function") grid.refresh();
        patch_grid_docfields_visibility(grid, visibleSet);
        destroy_grid_datatable(grid);
        if (visibleSet && visibleSet.size) {
            rebuild_grid_header_and_rows(grid);
        }
        frm.refresh_field("items");
        try {
            if (frm.fields_dict.items && typeof frm.fields_dict.items.refresh === "function") {
                frm.fields_dict.items.refresh();
            }
        } catch (e4) { /* ignore */ }
        setTimeout(function () {
            frm._qn_applying_grid_visibility = false;
        }, 100);
    }

    function gridColumnFieldname(col) {
        if (!col) return "";
        if (col.df && col.df.fieldname) return col.df.fieldname;
        if (col.fieldname) return col.fieldname;
        if (col.field) return col.field;
        return "";
    }

    /**
     * `grid.refresh` → setup_fields resets `grid.docfields` from frappe.meta — patch meta before refresh so headers match.
     */
    function patch_meta_child_docfields_visibility(frm, visibleSet) {
        if (!frm || !frm.docname || typeof frappe.meta.get_docfields !== "function") return;
        const dfs = frappe.meta.get_docfields(CHILD_DOCTYPE, frm.docname);
        if (!Array.isArray(dfs)) return;
        const baseline = frm._qn_item_grid_df_baseline;

        if (visibleSet && visibleSet.size) {
            dfs.forEach(df => {
                if (!df || !df.fieldname || SKIP_TYPES.has(df.fieldtype)) return;
                const show = visibleSet.has(df.fieldname);
                df.hidden = show ? 0 : 1;
                df.in_list_view = show ? 1 : 0;
                if (show) {
                    df.columns = pick_visible_column_width(baseline && baseline[df.fieldname], df);
                    force_editable_df(df);
                } else {
                    df.columns = 0;
                }
            });
            return;
        }

        if (!baseline) return;
        dfs.forEach(df => {
            if (!df || !df.fieldname || SKIP_TYPES.has(df.fieldtype)) return;
            const b = baseline[df.fieldname];
            if (!b) return;
            df.hidden = b.hidden;
            df.in_list_view = b.in_list_view;
            df.columns = b.columns;
            if (FORCE_EDITABLE_FIELDS.has(df.fieldname)) {
                force_editable_df(df);
            } else {
                df.read_only = b.read_only;
            }
        });
    }

    /** Baseline may store columns 0 for fields not in List View — grid would keep width 0 and stay invisible. */
    function pick_visible_column_width(baselineEntry, df) {
        const fieldname = df && df.fieldname;
        if (!fieldname) return 2;

        const widths = {
            "item_code": 2,
            "item_name": 2,
            "custom_process": 4,
            "custom_design_code": 2,
            "custom_design_name": 4,
            "custom_design_colour": 3,
            "custom_no_of_design_colours": 2,
            "custom_no_of_design_colour": 2,
            "custom_size_code": 2,
            "custom_quality": 3,
            "custom_colour": 3,
            "custom_gsm": 2,
            "custom_lamination_gsm": 2,
            "custom_bopp_gsm": 2,
            "custom_fabric_gsm": 2,
            "custom_lamination_side": 3,
            "custom_finishing": 3,
            "custom_coating": 3,
            "custom_purchase_no": 3,
            "custom_purchase_quality_name": 3,
            "custom_width_inch": 3,
            "custom_width_mm": 3,
            "custom_width_cm": 3,
            "custom_height_inches": 3,
            "custom_height_mm": 3,
            "custom_height_cm": 3,
            "custom_grams_per_sheet_kgs": 3,
            "custom_no_of_sheets_pcs": 3,
            "custom_weight_per_roll": 3,
            "custom_meter_per_roll": 3,
            "custom_meter": 3,
            "custom_no_of_rolls": 3,
            "qty": 2,
            "rate": 2,
            "amount": 3
        };
        return widths[fieldname] != null ? widths[fieldname] : 2;
    }

    /** Grid row visibility formula: !df.hidden && df.in_list_view — align live grid refs after refresh */
    function patch_grid_docfields_visibility(grid, visibleSet) {
        if (!grid) return;
        const frm = grid.frm;
        const tf = frm && frm.fields_dict && frm.fields_dict.items;

        // ── Ensure grid.docfields is in sync with tf.df.fields reference ──
        if (tf && tf.df && Array.isArray(tf.df.fields)) {
            grid.docfields = tf.df.fields;
        } else {
            let allFields = [];
            try {
                const raw = typeof frappe.meta.get_docfields === "function" ? frappe.meta.get_docfields(CHILD_DOCTYPE) : null;
                if (Array.isArray(raw)) allFields = raw;
            } catch (e) { }
            if (!allFields.length) {
                try {
                    const meta = typeof frappe.get_meta === "function" && frappe.get_meta(CHILD_DOCTYPE);
                    if (meta && Array.isArray(meta.fields)) allFields = meta.fields;
                } catch (e) { }
            }
            if (allFields.length) {
                grid.docfields = allFields.filter(df => df && df.fieldname && !SKIP_TYPES.has(df.fieldtype));
            }
        }

        if (!Array.isArray(grid.docfields)) return;
        const baseline = grid.frm && grid.frm._qn_item_grid_df_baseline;

        if (visibleSet && visibleSet.size) {
            grid.docfields.forEach(df => {
                if (!df || !df.fieldname || SKIP_TYPES.has(df.fieldtype)) return;
                const show = visibleSet.has(df.fieldname);
                df.hidden = show ? 0 : 1;
                df.in_list_view = show ? 1 : 0;
                if (show) {
                    df.columns = pick_visible_column_width(baseline && baseline[df.fieldname], df);
                    force_editable_df(df);
                } else {
                    df.columns = 0;
                }
            });
            return;
        }

        if (!baseline) return;
        grid.docfields.forEach(df => {
            if (!df || !df.fieldname || SKIP_TYPES.has(df.fieldtype)) return;
            const b = baseline[df.fieldname];
            if (!b) return;
            df.hidden = b.hidden;
            df.in_list_view = b.in_list_view;
            df.columns = b.columns;
            if (FORCE_EDITABLE_FIELDS.has(df.fieldname)) {
                force_editable_df(df);
            } else {
                df.read_only = b.read_only;
            }
        });
    }

    /** Rebuild header/data cells after patching docfields (public methods on frappe Grid). */
    function rebuild_grid_header_and_rows(grid) {
        if (!grid) return;
        try {
            const $parent = grid.wrapper && typeof grid.wrapper.find === "function" ? grid.wrapper : null;
            const $rows = $parent ? $parent.find(".rows") : null;
            if (typeof grid.make_head === "function") grid.make_head();
            if ($rows && $rows.length && typeof grid.render_result_rows === "function") {
                grid.render_result_rows($rows);
            }
        } catch (e) { /* ignore */ }
    }

    function restoreFromBaseline(frm) {
        const grid = frm.fields_dict.items && frm.fields_dict.items.grid;
        const baseMap = frm._qn_item_grid_df_baseline;
        if (!grid || !baseMap) return;
        grid.docfields.forEach(df => {
            if (!df.fieldname || SKIP_TYPES.has(df.fieldtype)) return;
            const b = baseMap[df.fieldname];
            if (b) {
                df.hidden = b.hidden;
                df.in_list_view = b.in_list_view;
                df.columns = b.columns;
                if (FORCE_EDITABLE_FIELDS.has(df.fieldname)) {
                    force_editable_df(df);
                } else {
                    df.read_only = b.read_only;
                }
            }
        });
    }

    /**
     * Apply columns via Frappe GridView (same mechanism as Configure Columns / Reset to default).
     * Saves layout to user settings so refresh cannot restore an old minimal column set.
     */
    function applyVisibleSet(frm, visibleArray) {
        const grid = frm.fields_dict.items && frm.fields_dict.items.grid;
        if (!grid) return;

        restorePristineDocfieldsToMeta();
        ensurePristineDocfields();
        const pristine = frappe._qn_quotation_item_pristine_map || {};

        const visibleSet = new Set(visibleArray);
        const custVal = (frm.doc ? (String(frm.doc.customer || "") + " | " + String(frm.doc.customer_name || "") + " | " + String(frm.doc.party_name || "")) : "").toUpperCase();
        if (custVal.includes("EXP-0071")) {
            visibleSet.add("custom_purchase_no");
            visibleSet.add("custom_purchase_quality_name");
        }

        const orderedVisible = visibleArray.filter(fn => visibleSet.has(fn));
        visibleSet.forEach(fn => {
            if (!orderedVisible.includes(fn)) orderedVisible.push(fn);
        });
        frm._qn_grid_column_list = orderedVisible;

        bindGridSetupVisibleColumnsHook(frm);

        let allFields = getQuotationItemDocfieldsArray(frm);
        if (allFields.length) {
            grid.docfields = allFields.filter(df => df && df.fieldname && !SKIP_TYPES.has(df.fieldtype));
            const orderMap = {};
            orderedVisible.forEach((fn, idx) => { orderMap[fn] = idx; });
            grid.docfields.sort((a, b) => {
                const idxA = orderMap[a.fieldname] !== undefined ? orderMap[a.fieldname] : 9999;
                const idxB = orderMap[b.fieldname] !== undefined ? orderMap[b.fieldname] : 9999;
                return idxA - idxB;
            });
        }

        (grid.docfields || []).forEach(df => {
            if (!df || !df.fieldname) return;
            const show = visibleSet.has(df.fieldname);
            const p = pristine[df.fieldname];
            if (show) {
                df.in_list_view = 1;
                df.hidden = 0;
                df.columns = pick_visible_column_width(null, df);
                if (p && p.fieldtype) df.fieldtype = p.fieldtype;
                if (p && p.options != null && p.options !== "") df.options = p.options;
                if (LINK_GRID_FIELDS.has(df.fieldname) && df.fieldtype === "Link" && !df.options) {
                    try {
                        const src = frappe.meta.get_docfield(CHILD_DOCTYPE, df.fieldname, frm.docname);
                        if (src && src.options) df.options = src.options;
                    } catch (eL) { /* ignore */ }
                }
                force_editable_df(df);
            } else {
                df.hidden = 1;
                df.in_list_view = 0;
                df.columns = 0;
            }
        });

        clearQuotationItemGridUserDefinedColumns(grid);
        bindQuotationItemsGridUserSettingsHook(frm);

        patch_meta_child_docfields_visibility(frm, visibleSet);
        apply_visibility_to_child_table_field(frm, visibleSet);

        frm._qn_applying_grid_visibility = true;
        try {
            if (typeof grid.setup_visible_columns === "function") {
                grid.setup_visible_columns();
            }
            if (typeof grid.setup_columns === "function") {
                grid.setup_columns();
            }
            if (typeof grid.refresh === "function") {
                grid.refresh();
            }
        } catch (e1) { /* ignore */ }
        setTimeout(function () {
            frm._qn_applying_grid_visibility = false;
            clearQuotationItemGridUserDefinedColumns(grid);
        }, 120);

        notifyGridVisibilityApplied(frm);
    }

    function safeToggleColumns(frm, fieldnames, show) {
        const grid = frm.fields_dict.items && frm.fields_dict.items.grid;
        if (!grid) return;
        const gridFields = grid.docfields.map(df => df.fieldname);
        fieldnames.forEach(f => {
            if (gridFields.includes(f)) grid.toggle_display(f, show);
        });
    }

    function getQuotationProcessSignature(frm) {
        if (!frm || !frm.doc) return "DEFAULT";
        if (hasCustomFabricItemRow(frm)) return "CUSTOM-FABRIC";
        const mode = resolveMode(frm) || resolveModeFromItemRows(frm);
        return mode ? mode.id : "DEFAULT";
    }

    /** @param {any} frm Frappe Form
     *  @param {{ show_design_fields?: boolean }} [opts]
     */
    function applyItemsGrid(frm, opts, _attempt) {
        opts = opts || {};
        frm._qn_last_grid_opts = opts;
        _attempt = _attempt || 0;
        const grid = frm.fields_dict && frm.fields_dict.items && frm.fields_dict.items.grid;
        if (!grid || !Array.isArray(grid.docfields)) {
            if (_attempt < 40) {
                setTimeout(function () {
                    applyItemsGrid(frm, opts, _attempt + 1);
                }, 100);
            }
            return;
        }

        inject_grid_column_widths_css();
        ensureBaseline(frm);
        bindQuotationItemsGridRefreshHook(frm);
        bindGridSetupVisibleColumnsHook(frm);
        bindQuotationItemsGridUserSettingsHook(frm);
        clearQuotationItemGridUserDefinedColumns(grid);

        const signature = getQuotationProcessSignature(frm);
        const savedSignature = frm._qn_last_signature;
        const hasManualGrid = grid.user_defined_columns && grid.user_defined_columns.length > 0;

        // If the process hasn't changed and they have a manual configuration, let Frappe render it.
        // But do NOT bypass if the signature is DEFAULT or CUSTOM-FABRIC (always force default fields on empty/no-process forms).
        if (signature !== "DEFAULT" && signature !== "CUSTOM-FABRIC" && savedSignature === signature && hasManualGrid) {
            return;
        }
        frm._qn_last_signature = signature;

        const vis = buildVisibleFieldsForForm(frm);
        const explicitParentProcess = String((frm.doc && frm.doc.custom_process) || "").trim();
        const hasItems = Array.isArray(frm.doc.items) && frm.doc.items.length > 0;

        if (vis) {
            applyVisibleSet(frm, vis);
            const unlockLaminationFields = function () {
                if (typeof forceEditableQuotationItemLaminationFields === "function") {
                    forceEditableQuotationItemLaminationFields(frm);
                } else if (
                    frappe.quotation_lamination_editable
                    && typeof frappe.quotation_lamination_editable.unlockFields === "function"
                ) {
                    frappe.quotation_lamination_editable.unlockFields(frm);
                }
            };
            unlockLaminationFields();
            return;
        }

        if (!explicitParentProcess && !hasItems) {
            applyVisibleSet(frm, ["item_code", "item_name", "qty", "uom", "rate", "amount"]);
            return;
        }

        restore_child_table_field_from_baseline(frm);
        sync_items_grid_docfields_from_table_field(frm);
        restoreFromBaseline(frm);
        let force_show_design = !!opts.show_design_fields;
        if (opts.show_design_fields === undefined && frm && frm.doc) {
            const parent_proc = ((frm.doc.custom_process || "") + " " + (frm.doc.process || "")).toUpperCase();
            const parent_side = (frm.doc.custom_lamination_side || "").toUpperCase();
            const lam_type = (frm.doc.custom_type_of_lamination || "").toUpperCase();
            const is_bopp = lam_type.includes("BOPP") || parent_proc.includes("BOPP") || parent_side.includes("BOPP");
            const is_bopp_lam = is_bopp && parent_proc.includes("LAMINAT");
            const has_printed = (frm.doc.items || []).some(row => {
                const p = ((row.custom_process || "") + " " + (row.process || "")).toUpperCase();
                return p.includes("PRINTED") || p.includes("COLORED BOPP") || p.includes("METALLIC") || p.includes("COOLER");
            });
            force_show_design = is_bopp_lam || parent_proc.includes("PRINT") || has_printed;
        }
        safeToggleColumns(frm, ["custom_design_code", "custom_design_name", "custom_design_colour", "custom_no_of_design_colours", "custom_no_of_design_colour"], force_show_design);
        const custVal = (frm.doc ? (String(frm.doc.customer || "") + " | " + String(frm.doc.customer_name || "") + " | " + String(frm.doc.party_name || "")) : "").toUpperCase();
        const isTargetCustomer = custVal.includes("EXP-0071");
        safeToggleColumns(frm, ["custom_purchase_no", "custom_purchase_quality_name"], isTargetCustomer);
        repaint_items_grid_after_meta_change(frm, null);
    }

    /** Add or replace a mode at runtime (e.g. second Client Script). */
    function registerGridMode(rule) {
        if (!rule || !rule.id) return;
        const idx = MODES.findIndex(m => m.id === rule.id);
        const normalized = Object.assign({}, rule, { visible_fields: normalizeVisibleFields(rule) });
        if (idx >= 0) MODES[idx] = normalized;
        else MODES.push(normalized);
    }

    /** Browser console: frappe.quotation_grid_visibility.debug(frm) — see if Fabric mode matches + table field has .df.fields */
    function debug_quotation_grid(frm) {
        if (!frm || !frm.doc) return null;
        const tf = frm.fields_dict && frm.fields_dict.items;
        const grid = tf && tf.grid;
        const blob = parent_process_text_blob(frm.doc, frm);
        const rm = resolveMode(frm);
        return {
            resolved_mode: rm ? rm.id : null,
            parent_custom_process: frm.doc.custom_process || frm.doc.process || "",
            parent_process_blob: blob,
            has_tf_df_fields: !!(tf && tf.df && Array.isArray(tf.df.fields) && tf.df.fields.length),
            tf_fields_count: tf && tf.df && tf.df.fields ? tf.df.fields.length : 0,
            grid_ready: !!(grid && Array.isArray(grid.docfields))
        };
    }

    function inject_grid_column_widths_css() {
        const cssId = "qn-grid-custom-widths";
        if (document.getElementById(cssId)) return;

        const css = `
            /* Custom column widths to prevent squeezing */
            .grid-body .grid-row-col[data-fieldname], 
            .grid-heading-row .grid-row-col[data-fieldname] {
                min-width: 85px !important;
                text-overflow: ellipsis;
                overflow: hidden;
            }
            .grid-body .grid-row-col[data-fieldname="item_code"], 
            .grid-heading-row .grid-row-col[data-fieldname="item_code"] {
                min-width: 120px !important;
            }
            .grid-body .grid-row-col[data-fieldname="item_name"], 
            .grid-heading-row .grid-row-col[data-fieldname="item_name"] {
                min-width: 160px !important;
            }
            .grid-body .grid-row-col[data-fieldname="custom_process"], 
            .grid-heading-row .grid-row-col[data-fieldname="custom_process"] {
                min-width: 180px !important;
            }
            .grid-body .grid-row-col[data-fieldname="custom_design_code"], 
            .grid-heading-row .grid-row-col[data-fieldname="custom_design_code"] {
                min-width: 110px !important;
            }
            .grid-body .grid-row-col[data-fieldname="custom_design_name"], 
            .grid-heading-row .grid-row-col[data-fieldname="custom_design_name"] {
                min-width: 140px !important;
            }
            .grid-body .grid-row-col[data-fieldname="custom_design_colour"], 
            .grid-heading-row .grid-row-col[data-fieldname="custom_design_colour"] {
                min-width: 100px !important;
            }
            .grid-body .grid-row-col[data-fieldname="custom_no_of_design_colours"], 
            .grid-heading-row .grid-row-col[data-fieldname="custom_no_of_design_colours"],
            .grid-body .grid-row-col[data-fieldname="custom_no_of_design_colour"], 
            .grid-heading-row .grid-row-col[data-fieldname="custom_no_of_design_colour"] {
                min-width: 145px !important;
            }
            .grid-body .grid-row-col[data-fieldname="custom_size_code"], 
            .grid-heading-row .grid-row-col[data-fieldname="custom_size_code"] {
                min-width: 100px !important;
            }
            .grid-body .grid-row-col[data-fieldname="custom_quality"], 
            .grid-heading-row .grid-row-col[data-fieldname="custom_quality"] {
                min-width: 100px !important;
            }
            .grid-body .grid-row-col[data-fieldname="custom_colour"], 
            .grid-heading-row .grid-row-col[data-fieldname="custom_colour"] {
                min-width: 100px !important;
            }
            .grid-body .grid-row-col[data-fieldname="custom_gsm"], 
            .grid-heading-row .grid-row-col[data-fieldname="custom_gsm"] {
                min-width: 90px !important;
            }
            .grid-body .grid-row-col[data-fieldname="qty"], 
            .grid-heading-row .grid-row-col[data-fieldname="qty"] {
                min-width: 90px !important;
            }
            .grid-body .grid-row-col[data-fieldname="qty"] .field-area input,
            .grid-body .grid-row-col[data-fieldname="custom_gsm"] .field-area input,
            .grid-body .grid-row-col[data-fieldname="custom_fabric_gsm"] .field-area input {
                min-width: 70px !important;
            }
            .grid-body .grid-row-col[data-fieldname="custom_lamination_gsm"], 
            .grid-heading-row .grid-row-col[data-fieldname="custom_lamination_gsm"] {
                min-width: 110px !important;
            }
            .grid-body .grid-row-col[data-fieldname="custom_bopp_gsm"], 
            .grid-heading-row .grid-row-col[data-fieldname="custom_bopp_gsm"] {
                min-width: 100px !important;
            }
            .grid-body .grid-row-col[data-fieldname="custom_fabric_gsm"], 
            .grid-heading-row .grid-row-col[data-fieldname="custom_fabric_gsm"] {
                min-width: 90px !important;
            }
            .grid-body .grid-row-col[data-fieldname="custom_lamination_side"], 
            .grid-heading-row .grid-row-col[data-fieldname="custom_lamination_side"] {
                min-width: 130px !important;
            }
            .grid-body .grid-row-col[data-fieldname="custom_finishing"], 
            .grid-heading-row .grid-row-col[data-fieldname="custom_finishing"] {
                min-width: 100px !important;
            }
            .grid-body .grid-row-col[data-fieldname="custom_coating"], 
            .grid-heading-row .grid-row-col[data-fieldname="custom_coating"] {
                min-width: 100px !important;
            }
            .grid-body .grid-row-col[data-fieldname="custom_purchase_no"], 
            .grid-heading-row .grid-row-col[data-fieldname="custom_purchase_no"] {
                min-width: 120px !important;
            }
            .grid-body .grid-row-col[data-fieldname="custom_purchase_quality_name"], 
            .grid-heading-row .grid-row-col[data-fieldname="custom_purchase_quality_name"] {
                min-width: 160px !important;
            }
            .grid-body .grid-row-col[data-fieldname="custom_width_inch"], .grid-body .grid-row-col[data-fieldname="custom_width_mm"], .grid-body .grid-row-col[data-fieldname="custom_width_cm"],
            .grid-heading-row .grid-row-col[data-fieldname="custom_width_inch"], .grid-heading-row .grid-row-col[data-fieldname="custom_width_mm"], .grid-heading-row .grid-row-col[data-fieldname="custom_width_cm"] {
                min-width: 80px !important;
            }
            .grid-body .grid-row-col[data-fieldname="custom_height_inches"], .grid-body .grid-row-col[data-fieldname="custom_height_mm"], .grid-body .grid-row-col[data-fieldname="custom_height_cm"],
            .grid-heading-row .grid-row-col[data-fieldname="custom_height_inches"], .grid-heading-row .grid-row-col[data-fieldname="custom_height_mm"], .grid-heading-row .grid-row-col[data-fieldname="custom_height_cm"] {
                min-width: 80px !important;
            }
            .grid-body .grid-row-col[data-fieldname="custom_grams_per_sheet_kgs"], 
            .grid-heading-row .grid-row-col[data-fieldname="custom_grams_per_sheet_kgs"] {
                min-width: 110px !important;
            }
            .grid-body .grid-row-col[data-fieldname="custom_weight_per_roll"], 
            .grid-heading-row .grid-row-col[data-fieldname="custom_weight_per_roll"] {
                min-width: 115px !important;
            }
            .grid-body .grid-row-col[data-fieldname="custom_meter_per_roll"], 
            .grid-heading-row .grid-row-col[data-fieldname="custom_meter_per_roll"] {
                min-width: 105px !important;
            }
            .grid-body .grid-row-col[data-fieldname="custom_meter"], 
            .grid-heading-row .grid-row-col[data-fieldname="custom_meter"] {
                min-width: 85px !important;
            }
            .grid-body .grid-row-col[data-fieldname="custom_no_of_rolls"], 
            .grid-heading-row .grid-row-col[data-fieldname="custom_no_of_rolls"] {
                min-width: 90px !important;
            }
            .grid-body .grid-row-col[data-fieldname="qty"], 
            .grid-heading-row .grid-row-col[data-fieldname="qty"] {
                min-width: 80px !important;
            }
            .grid-body .grid-row-col[data-fieldname="rate"], 
            .grid-heading-row .grid-row-col[data-fieldname="rate"] {
                min-width: 80px !important;
            }
            .grid-body .grid-row-col[data-fieldname="amount"], 
            .grid-heading-row .grid-row-col[data-fieldname="amount"] {
                min-width: 100px !important;
            }
            .grid-body .grid-row-col[data-fieldname="item_tax_template"], 
            .grid-heading-row .grid-row-col[data-fieldname="item_tax_template"] {
                min-width: 140px !important;
            }
        `;

        const style = document.createElement("style");
        style.id = cssId;
        style.type = "text/css";
        style.appendChild(document.createTextNode(css));
        document.head.appendChild(style);
    }

    function restoreQuotationItemGridToDefault(frm) {
        if (!frm) return { ok: false, reason: "no form" };
        const grid = frm.fields_dict && frm.fields_dict.items && frm.fields_dict.items.grid;
        if (!grid) return { ok: false, reason: "no grid" };

        restorePristineDocfieldsToMeta();
        ensureBaseline(frm);
        restore_child_table_field_from_baseline(frm);
        sync_items_grid_docfields_from_table_field(frm);
        restoreFromBaseline(frm);

        clearQuotationItemGridUserDefinedColumns(grid);
        resetQuotationItemGridUserSettings().then(function () {
            scheduleApplyItemsGrid(frm, {});
        });
        return { ok: true };
    }

    // Add monkey patch for GridRow and Grid to prevent crashes and handle resets
    function patchFrappeGridRow() {
        if (!frappe) return;

        // 1. Patch reset_user_settings_for_grid to use custom defaults for Quotation Item grid
        const classesToPatchReset = [];
        if (frappe.ui && frappe.ui.form) {
            if (frappe.ui.form.Grid) classesToPatchReset.push(frappe.ui.form.Grid);
            if (frappe.ui.form.GridRow) classesToPatchReset.push(frappe.ui.form.GridRow);
        }
        classesToPatchReset.forEach(cls => {
            if (!cls || !cls.prototype) return;
            const origReset = cls.prototype.reset_user_settings_for_grid;
            if (typeof origReset === "function" && !cls.prototype._qn_reset_patched) {
                cls.prototype._qn_reset_patched = true;
                cls.prototype.reset_user_settings_for_grid = function () {
                    const frm = this.frm || (this.grid && this.grid.frm);
                    if (frm && (frm.doctype === "Quotation" || (frm.meta && frm.meta.name === "Quotation"))) {
                        const ns = "quotation_grid_visibility";
                        if (frappe[ns] && typeof frappe[ns].restoreQuotationItemGridToDefault === "function") {
                            frappe[ns].restoreQuotationItemGridToDefault(frm);
                            return Promise.resolve();
                        }
                    }
                    return origReset.apply(this, arguments);
                };
            }
        });

        // 2. Patch GridRow setup_columns to dynamically sync row docfields and prevent crashes
        if (!frappe.ui || !frappe.ui.form || !frappe.ui.form.GridRow) return;
        if (frappe.ui.form.GridRow.prototype._qn_patched) return;

        const orig = frappe.ui.form.GridRow.prototype.setup_columns;
        if (typeof orig !== "function") return;

        frappe.ui.form.GridRow.prototype._qn_patched = true;
        frappe.ui.form.GridRow.prototype.setup_columns = function () {
            if (this.grid) {
                if (Array.isArray(this.grid.visible_columns)) {
                    let safe_vis = [];
                    for (let i = 0; i < this.grid.visible_columns.length; i++) {
                        let item = this.grid.visible_columns[i];
                        if (item) {
                            let df = Array.isArray(item) ? item[0] : item;
                            if (df && (df.fieldname || df.type)) safe_vis.push(item);
                        }
                    }
                    this.grid.visible_columns.length = 0;
                    for (let i = 0; i < safe_vis.length; i++) this.grid.visible_columns.push(safe_vis[i]);
                }
                if (Array.isArray(this.grid.docfields)) {
                    let safe_doc = [];
                    for (let i = 0; i < this.grid.docfields.length; i++) {
                        let df = this.grid.docfields[i];
                        if (df && df.fieldname) safe_doc.push(df);
                    }
                    this.grid.docfields.length = 0;
                    for (let i = 0; i < safe_doc.length; i++) this.grid.docfields.push(safe_doc[i]);
                }
                // Sync row's docfields array with the parent grid's docfields array
                if (Array.isArray(this.grid.docfields)) {
                    this.docfields = this.grid.docfields;
                }
            }
            if (Array.isArray(this.docfields)) {
                let safe_row_doc = [];
                for (let i = 0; i < this.docfields.length; i++) {
                    let df = this.docfields[i];
                    if (df && df.fieldname) safe_row_doc.push(df);
                }
                this.docfields.length = 0;
                for (let i = 0; i < safe_row_doc.length; i++) this.docfields.push(safe_row_doc[i]);
            }

            const _orig_find = Array.prototype.find;
            const _orig_forEach = Array.prototype.forEach;
            const _orig_filter = Array.prototype.filter;
            const _orig_map = Array.prototype.map;

            Array.prototype.find = function (callback, thisArg) {
                return _orig_find.call(this, function (element, index, array) {
                    if (element === undefined || element === null) return false;
                    try {
                        return callback.call(thisArg, element, index, array);
                    } catch (e) {
                        return false;
                    }
                }, thisArg);
            };

            Array.prototype.forEach = function (callback, thisArg) {
                return _orig_forEach.call(this, function (element, index, array) {
                    if (element === undefined || element === null) return;
                    try {
                        callback.call(thisArg, element, index, array);
                    } catch (e) { }
                }, thisArg);
            };

            Array.prototype.filter = function (callback, thisArg) {
                return _orig_filter.call(this, function (element, index, array) {
                    if (element === undefined || element === null) return false;
                    try {
                        return callback.call(thisArg, element, index, array);
                    } catch (e) {
                        return false;
                    }
                }, thisArg);
            };

            Array.prototype.map = function (callback, thisArg) {
                return _orig_map.call(this, function (element, index, array) {
                    if (element === undefined || element === null) return null;
                    try {
                        return callback.call(thisArg, element, index, array);
                    } catch (e) {
                        return null;
                    }
                }, thisArg);
            };

            try {
                return orig.apply(this, arguments);
            } catch (e) {
                console.error("GridRow setup_columns crashed!", e);
            } finally {
                Array.prototype.find = _orig_find;
                Array.prototype.forEach = _orig_forEach;
                Array.prototype.filter = _orig_filter;
                Array.prototype.map = _orig_map;
            }
        };
    }

    patchFrappeGridRow();

    frappe[NS].applyItemsGrid = applyItemsGrid;
    frappe[NS].scheduleApplyItemsGrid = scheduleApplyItemsGrid;
    frappe[NS].resetQuotationItemGridUserSettings = resetQuotationItemGridUserSettings;
    frappe[NS].clearQuotationItemGridUserDefinedColumns = clearQuotationItemGridUserDefinedColumns;
    frappe[NS].restoreQuotationItemGridToDefault = restoreQuotationItemGridToDefault;
    frappe[NS].hasCustomFabricItemRow = hasCustomFabricItemRow;
    frappe[NS].registerGridMode = registerGridMode;
    frappe[NS].MODES = MODES;
    frappe[NS].debug = debug_quotation_grid;

    frappe.ui.form.on("Quotation Item", {
        items_remove(frm) {
            scheduleApplyItemsGrid(frm, frm._qn_last_grid_opts || {});
        },
        item_code: function (frm, cdt, cdn) {
            const items = frm.doc.items || [];
            const hasCf = items.some(function (row) {
                const ic = String(row && row.item_code || "").trim().toUpperCase();
                return ic === "CUSTOM-FABRIC" || ic.indexOf("CUSTOM-FABRIC") === 0;
            });
            if (hasCf) {
                scheduleApplyItemsGrid(frm, frm._qn_last_grid_opts || {});
            }
        },
        custom_process: function (frm) {
            scheduleApplyItemsGrid(frm, frm._qn_last_grid_opts || {});
        },
        custom_lh_process: function (frm) {
            scheduleApplyItemsGrid(frm, frm._qn_last_grid_opts || {});
        },
        process: function (frm) {
            scheduleApplyItemsGrid(frm, frm._qn_last_grid_opts || {});
        }
    });

    frappe.ui.form.on("Quotation", {
        onload(frm) {
            frm._qn_item_grid_df_baseline = null;
            scheduleApplyItemsGrid(frm, {});
        },
        refresh(frm) {
            scheduleApplyItemsGrid(frm, frm._qn_last_grid_opts || {});
        },
        custom_process(frm) {
            scheduleApplyItemsGrid(frm, frm._qn_last_grid_opts || {});
        },
        process(frm) {
            scheduleApplyItemsGrid(frm, frm._qn_last_grid_opts || {});
        },
        custom_type_of_bag(frm) {
            scheduleApplyItemsGrid(frm, frm._qn_last_grid_opts || {});
        },
        custom_type_of_printing(frm) {
            scheduleApplyItemsGrid(frm, frm._qn_last_grid_opts || {});
        },
        custom_type_of_lamination(frm) {
            setTimeout(() => {
                scheduleApplyItemsGrid(frm, frm._qn_last_grid_opts || {});
            }, 500);
        },
        custom_lamination_side(frm) {
            scheduleApplyItemsGrid(frm, frm._qn_last_grid_opts || {});
        }
    });
})();