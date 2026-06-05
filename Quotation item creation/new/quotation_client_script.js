(function () {
    // Intercept and disable user settings for Quotation Item to prevent default column overriding on refresh
    if (typeof frappe !== "undefined") {
        try {
            if (!frappe._original_get_user_settings) {
                frappe._original_get_user_settings = frappe.get_user_settings;
                frappe.get_user_settings = function (doctype, key) {
                    if (doctype === "Quotation Item" || (doctype === "Quotation" && key === "GridView")) {
                        return {};
                    }
                    return frappe._original_get_user_settings.apply(this, arguments);
                };
            }
            if (frappe.model && frappe.model.user_settings) {
                Object.defineProperty(frappe.model.user_settings, "Quotation Item", {
                    get: function () { return {}; },
                    set: function () { },
                    configurable: true
                });
            }
        } catch (e) { /* ignore */ }
    }

    // ==========================================================
    // FACTORY SMART ITEM - LIVE WIDTH PREVIEW
    // DocType : Quotation  |  Client Script (JavaScript)
    // Trigger : custom_width_inch OR custom_width_mm changed in item row
    // ==========================================================

    // ==========================================================
    // CUSTOMER ?- QUALITY FILTER MAP
    // Add more customers here as needed.
    // Key   : substring to match in customer name (case-insensitive)
    // Value : array of allowed quality_name values (exact match)
    // ==========================================================
    const CUSTOMER_QUALITY_MAP = {
        "azkara": [
            "AZKARA - ULTRA",
            "AZKARA - PLATINUM",
            "AZKARA - DELUXE",
            "AZKARA - SUPER ECO",
            "AZKARA - ECO GREEN",
            "AZKARA - SILVER",
            "AZKARA - GOLD"
        ],
        "abhishek industries": [
            "ABHISHEK - ECO SPECIAL"
        ],
        "eswari tex": [
            "ESWARI TEX - GOLD",
            "ESWARI TEX - ULTRA",
            "ESWARI TEX - DELUXE"
        ],
        "harini bags": [
            "HARINI BAGS - GOLD"
        ],
        "mn eco": [
            "MN ECO - BRONZE"
        ],
        "manjunatha": [
            "MANJUNATHA - ECO GREEN",
            "MANJUNATHA - DELUXE"
        ],
        "magilan bags": [
            "MAGILAN - PLATINUM"
        ],
        "payal stores": [
            "PAYAL - UV"
        ],
        "remex": [
            "REMEX - SILVER",
            "REMEX - SUPER BRONZE"
        ]
        // To add more customers, copy the pattern above (don't forget commas!)
        // "xyz traders": ["XYZ QUALITY A", "XYZ QUALITY B"]
    };

    // ==========================================================
    // COMPANY ?- ITEM TAX TEMPLATE MAP (per company)
    // This must be set on the row BEFORE save, else ERPNext validates and blocks.
    // ==========================================================
    const COMPANY_ITEM_TAX_TEMPLATE = {
        "Jayashree Spun Bond - 1ZT": "GST 5% - JSB-1ZT",
        "Thusma SMS Nonwovens Private Limited - 1Z0": "GST 5% - TSNPL",
        "Thusma SMS Nonwoven Private Limited - 1Z0": "GST 5% - TSNPL",
        "Thusma SMS Nonwovens Private Limited - 1ZO": "GST 5% - TSNPL",
        "Thusma SMS Nonwoven Private Limited - 1ZO": "GST 5% - TSNPL",
        "Jayashree Spun Bond - 2ZS": "GST 5% - JSB-2ZS",
        "Thusma SMS Nonwoven Private Limited - 2ZZ": "GST 5% - TSNPL-2ZZ",
        "Thusma SMS Nonwovens Private Limited - 2ZZ": "GST 5% - TSNPL-2ZZ",
        "Varshine Tex (Puducherry)": "GST 5% - VTP",
        "Varshine Tex (Odisha)": "GST 5% - VTO",
        "Thusma T Tex": "GST 5% - TTT",
        "Varshine Retails Private Limited": "GST 5% - VRPL",
        "Avitas Home Textile": "GST 5% - AHT",
        "J Vasanth Exports": "GST 5% - JVE"
    };

    // COMPANY → ITEM TAX TEMPLATE MAP (18% — for bag-making items)
    const COMPANY_ITEM_TAX_TEMPLATE_18 = {
        "Jayashree Spun Bond - 1ZT": "GST 18% - JSB-1ZT",
        "Thusma SMS Nonwovens Private Limited - 1Z0": "GST 18% - TSNPL",
        "Thusma SMS Nonwoven Private Limited - 1Z0": "GST 18% - TSNPL",
        "Thusma SMS Nonwovens Private Limited - 1ZO": "GST 18% - TSNPL",
        "Thusma SMS Nonwoven Private Limited - 1ZO": "GST 18% - TSNPL",
        "Jayashree Spun Bond - 2ZS": "GST 18% - JSB-2ZS",
        "Thusma SMS Nonwoven Private Limited - 2ZZ": "GST 18% - TSNPL-2ZZ",
        "Thusma SMS Nonwovens Private Limited - 2ZZ": "GST 18% - TSNPL-2ZZ",
        "Varshine Tex (Puducherry)": "GST 18% - VTP",
        "Varshine Tex (Odisha)": "GST 18% - VTO",
        "Thusma T Tex": "GST 18% - TTT",
        "Varshine Retails Private Limited": "GST 18% - VRPL",
        "Avitas Home Textile": "GST 18% - AHT",
        "J Vasanth Exports": "GST 18% - JVE"
    };

    // COMPANY ?- DEFAULT FINISHED GOODS WAREHOUSE (per company)
    const COMPANY_DEFAULT_WAREHOUSE = {
        "Jayashree Spun Bond - 1ZT": "Finished Goods - JSB-1ZT",
        "Thusma SMS Nonwovens Private Limited - 1Z0": "Finished Goods Warehouse - TSNPL",
        "Thusma SMS Nonwoven Private Limited - 1Z0": "Finished Goods Warehouse - TSNPL",
        "Thusma SMS Nonwovens Private Limited - 1ZO": "Finished Goods Warehouse - TSNPL",
        "Thusma SMS Nonwoven Private Limited - 1ZO": "Finished Goods Warehouse - TSNPL",
        "Jayashree Spun Bond - 2ZS": "Finished Goods - JSB-2ZS",
        "Thusma SMS Nonwoven Private Limited - 2ZZ": "Finished Goods Warehouse - TSNPL-2ZZ",
        "Thusma SMS Nonwovens Private Limited - 2ZZ": "Finished Goods Warehouse - TSNPL-2ZZ",
        "Varshine Tex (Puducherry)": "Finished Goods Warehouse - VTP",
        "Varshine Tex (Odisha)": "Finished Goods Warehouse - VTO",
        "Thusma T Tex": "Finished Goods Warehouse - TTT",
        "Varshine Retails Private Limited": "Finished Goods Warehouse - VRPL",
        "Avitas Home Textile": "Finished Goods Warehouse - AHT",
        "J Vasanth Exports": "Finished Goods Warehouse - JVE"
    };

    // Cache resolved FG warehouse per company (avoids repeated DB calls)
    const FG_WAREHOUSE_CACHE = {};
    // Cache: company name -> resolved Item Tax Template name (DB fallback when map key mismatches ERPNext)
    const ITEM_TAX_TEMPLATE_BY_COMPANY = {};
    // Cache: company name -> resolved 18% Item Tax Template name
    const ITEM_TAX_TEMPLATE_BY_COMPANY_18 = {};

    function fetchLatestItemTaxTemplateForCompany(company) {
        const c = (company || "").trim();
        if (!c) return Promise.resolve("");
        if (ITEM_TAX_TEMPLATE_BY_COMPANY[c] !== undefined) {
            return Promise.resolve(ITEM_TAX_TEMPLATE_BY_COMPANY[c]);
        }
        return frappe.db
            .get_list("Item Tax Template", {
                filters: { company: c },
                fields: ["name", "modified"],
                order_by: "modified desc",
                limit: 15
            })
            .then(rows => {
                const list = rows || [];
                const preferred = (COMPANY_ITEM_TAX_TEMPLATE[c] || "").trim();
                const fivePct = list.find(r => /(^|\s)5\s*%/i.test(r.name || ""));
                let pick =
                    (preferred && list.some(r => r.name === preferred) && preferred) ||
                    (fivePct && fivePct.name) ||
                    (list[0] && list[0].name) ||
                    "";
                ITEM_TAX_TEMPLATE_BY_COMPANY[c] = pick;
                return pick;
            })
            .catch(() => {
                ITEM_TAX_TEMPLATE_BY_COMPANY[c] = "";
                return "";
            });
    }

    function fetchLatestItemTaxTemplateForCompany18(company) {
        const c = (company || "").trim();
        if (!c) return Promise.resolve("");
        if (ITEM_TAX_TEMPLATE_BY_COMPANY_18[c] !== undefined) {
            return Promise.resolve(ITEM_TAX_TEMPLATE_BY_COMPANY_18[c]);
        }
        return frappe.db
            .get_list("Item Tax Template", {
                filters: { company: c },
                fields: ["name", "modified"],
                order_by: "modified desc",
                limit: 15
            })
            .then(rows => {
                const list = rows || [];
                const preferred = (COMPANY_ITEM_TAX_TEMPLATE_18[c] || "").trim();
                const eighteenPct = list.find(r => /(^|\s)18\s*%/i.test(r.name || ""));
                let pick =
                    (preferred && list.some(r => r.name === preferred) && preferred) ||
                    (eighteenPct && eighteenPct.name) ||
                    "";
                ITEM_TAX_TEMPLATE_BY_COMPANY_18[c] = pick;
                return pick;
            })
            .catch(() => {
                ITEM_TAX_TEMPLATE_BY_COMPANY_18[c] = "";
                return "";
            });
    }

    /** Prefer map, but verify template.company matches; else load correct template from DB (fixes "done correctly" but wrong row). */
    function resolveCompanyItemTaxTemplate(company) {
        const c = (company || "").trim();
        if (!c) return Promise.resolve("");

        const mapped = (COMPANY_ITEM_TAX_TEMPLATE[c] || "").trim();
        if (!mapped) {
            return fetchLatestItemTaxTemplateForCompany(c);
        }

        return frappe.db.get_value("Item Tax Template", mapped, "company").then(r => {
            let tplCompany = r.message;
            if (tplCompany && typeof tplCompany === "object" && "company" in tplCompany) {
                tplCompany = tplCompany.company;
            }
            if (tplCompany === c) {
                return mapped;
            }
            delete ITEM_TAX_TEMPLATE_BY_COMPANY[c];
            return fetchLatestItemTaxTemplateForCompany(c);
        }).catch(() => fetchLatestItemTaxTemplateForCompany(c));
    }

    function resolveCompanyItemTaxTemplate18(company) {
        const c = (company || "").trim();
        if (!c) return Promise.resolve("");
        const mapped = (COMPANY_ITEM_TAX_TEMPLATE_18[c] || "").trim();
        if (!mapped) {
            return fetchLatestItemTaxTemplateForCompany18(c);
        }
        return frappe.db.get_value("Item Tax Template", mapped, "company").then(r => {
            let tplCompany = r.message;
            if (tplCompany && typeof tplCompany === "object" && "company" in tplCompany) {
                tplCompany = tplCompany.company;
            }
            if (tplCompany === c) {
                return mapped;
            }
            delete ITEM_TAX_TEMPLATE_BY_COMPANY_18[c];
            return fetchLatestItemTaxTemplateForCompany18(c);
        }).catch(() => fetchLatestItemTaxTemplateForCompany18(c));
    }

    /**
     * Resolves the correct Item Tax Template for a single row:
     * - Bag-making rows (isBoxBagProcess) → 18% template
     * - All other rows → 5% template
     */
    function resolveCompanyItemTaxTemplateForRow(frm, row) {
        const co = (frm && frm.doc && frm.doc.company || "").trim();
        if (!co) return Promise.resolve("");
        if (isBagSheetProcess(row)) {
            return resolveCompanyItemTaxTemplate18(co);
        }
        return resolveCompanyItemTaxTemplate(co);
    }

    function clearItemTaxTemplateCacheForCompany(company) {
        const c = (company || "").trim();
        if (c) {
            delete ITEM_TAX_TEMPLATE_BY_COMPANY[c];
            delete ITEM_TAX_TEMPLATE_BY_COMPANY_18[c];
        }
    }

    function applyCompanyItemTaxTemplate(frm) {
        if (!frm || !frm.doc) return;
        const co = (frm.doc.company || "").trim();
        if (!co) return;

        // Check if the form is currently clean (just loaded or just saved).
        // If clean, do NOT overwrite already-saved item_tax_template values.
        // This prevents the refresh timeouts from dirtying the form by switching
        // 5% → 18% for Bag Making rows on every page load.
        const formIsDirty = !!(
            frm.doc.__unsaved ||
            (typeof frm.is_dirty === "function" && frm.is_dirty())
        );

        (frm.doc.items || []).forEach(row => {
            resolveCompanyItemTaxTemplateForRow(frm, row).then(tpl => {
                if (!tpl) return;
                if (row.item_tax_template !== tpl) {
                    const current_tpl = (row.item_tax_template || "");
                    const is_row_18 = current_tpl.includes("18");
                    const is_tpl_18 = tpl.includes("18");
                    const is_row_5 = current_tpl.includes("5");
                    const is_tpl_5 = tpl.includes("5");

                    if (current_tpl && is_row_18 && is_tpl_18) return;
                    if (current_tpl && is_row_5 && is_tpl_5) return;

                    // If the form is clean and the row already has a valid template,
                    // skip the change to avoid dirtying the form on load/refresh.
                    if (!formIsDirty && current_tpl) return;

                    frappe.model.set_value(row.doctype, row.name, "item_tax_template", tpl);
                }
            });
        });
    }

    /** ERPNext often reapplies Item defaults after taxes / item fetch - run sync a few times. */
    function scheduleItemTaxTemplateSync(frm) {
        applyCompanyItemTaxTemplate(frm);
        [300, 900, 2200].forEach(ms => {
            setTimeout(() => {
                if (frm && frm.doc) {
                    applyCompanyItemTaxTemplate(frm);
                }
            }, ms);
        });
    }

    function resolveFinishedGoodsWarehouse(company) {
        const c = company || "";
        if (!c) return Promise.resolve("");
        if (FG_WAREHOUSE_CACHE[c] !== undefined) return Promise.resolve(FG_WAREHOUSE_CACHE[c]);

        const preferred = COMPANY_DEFAULT_WAREHOUSE[c] || "";

        // 1) If we have a preferred name, verify it exists.
        if (preferred) {
            return frappe.db.exists("Warehouse", preferred).then(exists => {
                if (exists) {
                    FG_WAREHOUSE_CACHE[c] = preferred;
                    return preferred;
                }
                // fall through to search
                return frappe.db.get_list("Warehouse", {
                    filters: { company: c, is_group: 0, disabled: 0 },
                    fields: ["name"],
                    limit: 200
                }).then(rows => {
                    const names = (rows || []).map(r => r.name).filter(Boolean);
                    const fg = names.find(n => n.toLowerCase().includes("finished goods")) || "";
                    FG_WAREHOUSE_CACHE[c] = fg;
                    return fg;
                });
            }).catch(() => {
                FG_WAREHOUSE_CACHE[c] = "";
                return "";
            });
        }

        // 2) No preferred name: search by company + "Finished Goods"
        return frappe.db.get_list("Warehouse", {
            filters: { company: c, is_group: 0, disabled: 0 },
            fields: ["name"],
            limit: 200
        }).then(rows => {
            const names = (rows || []).map(r => r.name).filter(Boolean);
            const fg = names.find(n => n.toLowerCase().includes("finished goods")) || "";
            FG_WAREHOUSE_CACHE[c] = fg;
            return fg;
        }).catch(() => {
            FG_WAREHOUSE_CACHE[c] = "";
            return "";
        });
    }

    // ==========================================================
    // COMPANY ?- SALES TAXES & CHARGES TEMPLATE (In-State / Out-State)
    // Used to prevent "Cannot charge CGST/SGST for inter-state supplies"
    // ==========================================================
    const COMPANY_SALES_TAXES_TEMPLATE = {
        "Jayashree Spun Bond - 1ZT": { intra: "Output GST In-state - JSB-1ZT", inter: "Output GST Out-state - JSB-1ZT" },
        "Thusma SMS Nonwovens Private Limited - 1Z0": { intra: "Output GST In-state - TSNPL", inter: "Output GST Out-state - TSNPL" },
        "Thusma SMS Nonwoven Private Limited - 1Z0": { intra: "Output GST In-state - TSNPL", inter: "Output GST Out-state - TSNPL" },
        "Thusma SMS Nonwovens Private Limited - 1ZO": { intra: "Output GST In-state - TSNPL", inter: "Output GST Out-state - TSNPL" },
        "Thusma SMS Nonwoven Private Limited - 1ZO": { intra: "Output GST In-state - TSNPL", inter: "Output GST Out-state - TSNPL" },
        "Jayashree Spun Bond - 2ZS": { intra: "Output GST In-state - JSB-2ZS", inter: "Output GST Out-state - JSB-2ZS" },
        "Thusma SMS Nonwoven Private Limited - 2ZZ": { intra: "Output GST In-state - TSNPL-2ZZ", inter: "Output GST Out-state - TSNPL-2ZZ" },
        "Thusma SMS Nonwovens Private Limited - 2ZZ": { intra: "Output GST In-state - TSNPL-2ZZ", inter: "Output GST Out-state - TSNPL-2ZZ" },
        "Varshine Tex (Puducherry)": { intra: "Output GST In-state - VTP", inter: "Output GST Out-state - VTP" },
        "Varshine Tex (Odisha)": { intra: "Output GST In-state - VTO", inter: "Output GST Out-state - VTO" },
        "Thusma T Tex": { intra: "Output GST In-state - TTT", inter: "Output GST Out-state - TTT" },
        "Varshine Retails Private Limited": { intra: "Output GST In-state - VRPL", inter: "Output GST Out-state - VRPL" },
        "Avitas Home Textile": { intra: "Output GST In-state - AHT", inter: "Output GST Out-state - AHT" },
        "J Vasanth Exports": { intra: "Output GST In-state - JVE", inter: "Output GST Out-state - JVE" }
    };

    function getHSNFromGSM(gsmVal, row) {
        if (row) {
            let p = (row.custom_process || row.process || "").trim().toUpperCase();
            let bagType = (row.custom_bag_type || "").trim().toUpperCase();
            if (p.includes("BAG") || p.includes("D CUT") || p.includes("W CUT") || bagType) return "63059000";
        }
        const gsm = parseInt(gsmVal, 10) || 0;
        if (gsm >= 15 && gsm <= 24) return "56031100";
        if (gsm >= 25 && gsm <= 70) return "56031200";
        if (gsm >= 71 && gsm <= 150) return "56031300";
        if (gsm > 150) return "56031400";
        if (gsm > 0) return "56031100";
        return "";
    }

    function suppressQuotationItemPriceMessages() {
        if (!window.frappe || frappe._quotation_item_price_msg_patch_applied) return;
        frappe._quotation_item_price_msg_patch_applied = true;
        const originalMsgprint = frappe.msgprint;
        frappe.msgprint = function (msg, title, wide) {
            const rawMessage = typeof msg === "string" ? msg : ((msg && (msg.message || msg.msg || msg.title)) || "");
            if (/Item Price added for .* in Price List Standard Selling/i.test(String(rawMessage))) {
                return;
            }
            return originalMsgprint.apply(this, arguments);
        };
    }

    function clearQuotationItemPriceDialogs() {
        try {
            $(".modal:visible").each(function () {
                const text = ($(this).text() || "").trim();
                if (/Item Price added for .* in Price List Standard Selling/i.test(text)) {
                    const dialog = $(this).data("bs.modal");
                    if (dialog) $(this).modal("hide");
                    $(this).find(".btn-modal-close, .modal-header .close").trigger("click");
                }
            });
        } catch (e) { /* ignore */ }
    }

    function hasQuotationGeneratedItemRows(frm) {
        return getQuotationGeneratedItemRows(frm).length > 0;
    }

    function getQuotationGeneratedItemRows(frm) {
        if (!frm || !frm.doc || !Array.isArray(frm.doc.items)) return [];
        return frm.doc.items.filter(row => {
            const itemCode = String(row.item_code || "");
            const process = String(row.custom_process || row.process || "").toUpperCase();
            return itemCode === "CUSTOM-FABRIC" || (
                process &&
                itemCode &&
                itemCode !== "CUSTOM-FABRIC" &&
                (
                    itemCode.includes("-252") ||
                    itemCode.includes("-254") ||
                    itemCode.includes("-255") ||
                    itemCode.startsWith("251") ||
                    itemCode.startsWith("253") ||
                    itemCode.startsWith("109") ||
                    itemCode.startsWith("108") ||
                    itemCode.startsWith("6000-") ||
                    itemCode.startsWith("2500-") ||
                    process.includes("PLAIN BOX BAG") ||
                    process.includes("PLAIN W CUT BAG") ||
                    process.includes("LAMINATED W CUT BAG") ||
                    process.includes("PRINTED W CUT BAG") ||
                    process.includes("D CUT PLAIN") ||
                    process.includes("NON WOVEN")
                )
            );
        });
    }

    function escapeQuotationSuccessHtml(value) {
        if (window.frappe && frappe.utils && typeof frappe.utils.escape_html === "function") {
            return frappe.utils.escape_html(String(value || ""));
        }
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function showQuotationCreationSuccessAfterSave(frm) {
        if (!frm || !frm._quotation_show_creation_success_after_save) return;
        frm._quotation_show_creation_success_after_save = false;
        clearQuotationItemPriceDialogs();
        setTimeout(clearQuotationItemPriceDialogs, 250);
        setTimeout(function () {
            const rows = getQuotationGeneratedItemRows(frm).filter(row => String(row.item_code || "") !== "CUSTOM-FABRIC");
            let message = "<b>Items and BOMs created successfully.</b>";
            if (rows.length === 1) {
                const row = rows[0];
                message += "<br><b>Item Code:</b> " + escapeQuotationSuccessHtml(row.item_code);
                message += "<br><b>Item Name:</b> " + escapeQuotationSuccessHtml(row.item_name || row.description);
            } else if (rows.length > 1) {
                message += "<br><br>";
                message += rows.map((row, idx) => (
                    "<b>" + (idx + 1) + ". Item Code:</b> " + escapeQuotationSuccessHtml(row.item_code) +
                    "<br><b>Item Name:</b> " + escapeQuotationSuccessHtml(row.item_name || row.description)
                )).join("<hr>");
            }
            frappe.msgprint({
                title: "Created Successfully",
                indicator: "green",
                message: message
            });
        }, 350);
    }

    function getStateCodeFromGSTIN(gstin) {
        const g = (gstin || "").trim();
        const code = g.substring(0, 2);
        return /^\d{2}$/.test(code) ? code : "";
    }

    function getStateCodeFromPlaceOfSupply(pos) {
        // ERPNext format: "32-Kerala"
        const p = (pos || "").trim();
        const code = p.substring(0, 2);
        return /^\d{2}$/.test(code) ? code : "";
    }

    function applyCompanySalesTaxesTemplate(frm) {
        const company = frm.doc.company;
        const cfg = COMPANY_SALES_TAXES_TEMPLATE[company];
        if (!cfg) return;

        const companyState = getStateCodeFromGSTIN(frm.doc.company_gstin);
        const supplyState = getStateCodeFromPlaceOfSupply(frm.doc.place_of_supply);
        if (!companyState || !supplyState) return;

        const isInter = companyState !== supplyState;
        const desired = isInter ? cfg.inter : cfg.intra;
        if (!desired) return;

        if (frm.doc.taxes_and_charges !== desired) {
            frm.set_value("taxes_and_charges", desired);
            // clearing forces ERPNext to re-add correct IGST vs CGST/SGST rows
            frm.clear_table("taxes");
            frm.refresh_field("taxes");
            frm.trigger("taxes_and_charges");
        }

        // Keep Tax Category aligned if you use it for rules
        const desiredCategory = isInter ? "Out-State" : "In-State";
        if (frm.doc.tax_category && frm.doc.tax_category !== desiredCategory) {
            frm.set_value("tax_category", desiredCategory);
        }

        scheduleItemTaxTemplateSync(frm);
    }

    const FLEXO_DESIGN_COLOUR_TAG_RE = /\|\|DESIGN_COLOUR:([^|]*)\|\|/g;

    function stripFlexoDesignColourTag(desc) {
        return String(desc || "").replace(FLEXO_DESIGN_COLOUR_TAG_RE, "").trim();
    }

    function buildDescriptionWithDesignColourTag(desc, colourText) {
        const clean = stripFlexoDesignColourTag(desc);
        const tag = "||DESIGN_COLOUR:" + colourText + "||";
        return clean ? clean + " " + tag : tag;
    }

    function readDesignColourFromDescription(desc) {
        const m = String(desc || "").match(/\|\|DESIGN_COLOUR:([^|]*)\|\|/);
        return m && m[1] ? m[1].trim() : "";
    }

    /** Persist design colour in description (sync only — do not frappe.model.set_value during save). */
    function stashFlexoDesignColourOnItems(frm) {
        frm._flexo_design_colour_backup = frm._flexo_design_colour_backup || {};
        (frm.doc.items || []).forEach(function (row) {
            const dc = (row.custom_design_colour || "").toString().trim();
            if (!dc) return;
            frm._flexo_design_colour_backup[row.name] = dc;
            row.description = buildDescriptionWithDesignColourTag(row.description, dc);
        });
    }

    function restoreFlexoDesignColourFromDescription(frm) {
        (frm.doc.items || []).forEach(function (row) {
            const current = (row.custom_design_colour || "").toString().trim();
            if (current) return;
            const dc = readDesignColourFromDescription(row.description);
            if (dc) row.custom_design_colour = dc;
        });
    }

    function applyCompanyWarehouse(frm) {
        resolveFinishedGoodsWarehouse(frm.doc.company).then(wh => {
            if (!wh) return;
            (frm.doc.items || []).forEach(row => {
                if (row.warehouse !== wh) {
                    frappe.model.set_value(row.doctype, row.name, "warehouse", wh);
                }
            });
        });
    }

    // Item grid column rules: see quotation_grid_visibility.js (second Client Script or hooks).
    // frappe.quotation_grid_visibility.applyItemsGrid(frm, { show_design_fields })

    const QUOTATION_ITEM_SKIP_GRID_TYPES = new Set([
        "Column Break",
        "Section Break",
        "Tab Break",
        "HTML",
        "Fold",
        "Heading",
        "Button",
        "Table"
    ]);

    const QUOTATION_ITEM_PRIORITY_VISIBLE_FIELDS = [
        "item_code",
        "item_name",
        "custom_process",
        "custom_quality",
        "custom_colour",
        "custom_gsm",
        "custom_fabric_gsm",
        "custom_bopp_gsm",
        "custom_lamination_gsm",
        "custom_lamination_side",
        "custom_finishing",
        "custom_coating",
        "custom_design_code",
        "custom_design_name",
        "custom_design_colour",
        "custom_no_of_design_colours",
        "custom_no_of_design_colour",
        "custom_size_code",
        "custom_size_in_inch",
        "custom_size_in_mm",
        "custom_width_inch",
        "custom_width_mm",
        "custom_height_inches",
        "custom_height_mm",
        "qty"
    ];

    const QUOTATION_ITEM_FORCE_EDITABLE_FIELDS = new Set([
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
        "custom_purchase_quality_name"
    ]);

    function getQuotationLaminationSideOptions(frm) {
        var process = "";
        if (frm && frm.doc && (frm.doc.custom_process || frm.doc.process)) {
            process = (frm.doc.custom_process || frm.doc.process).toString().toLowerCase();
        }

        var showSingleDouble = false;

        if ((process.indexOf("bopp") !== -1 && (process.indexOf("laminat") !== -1 || process.indexOf("lamination") !== -1)) || process.indexOf("bopp roto") !== -1 || process.indexOf("bopp-roto") !== -1 || process.indexOf("mettalic roto") !== -1 || process.indexOf("metallic roto") !== -1 || process.indexOf("mettalic-roto") !== -1 || process.indexOf("metallic-roto") !== -1) {
            showSingleDouble = true;
        }
        var isDCutOrWCutOrMaking = process.indexOf("d cut") !== -1 || process.indexOf("d-cut") !== -1 || process.indexOf("w cut") !== -1 || process.indexOf("w-cut") !== -1 || process.indexOf("bag making") !== -1;
        if (process.indexOf("bopp box bag") !== -1 || process.indexOf("metallic bopp") !== -1 || process.indexOf("cooler bopp") !== -1 || (process.indexOf("bag") !== -1 && !isDCutOrWCutOrMaking)) {
            showSingleDouble = true;
        }

        if (frm && frm.doc && frm.doc.items && frm.doc.items.length) {
            for (var i = 0; i < frm.doc.items.length; i++) {
                var row = frm.doc.items[i];
                var rProcess = "";
                if (row && (row.custom_process || row.process)) {
                    rProcess = (row.custom_process || row.process).toString().toLowerCase();
                }
                if ((rProcess.indexOf("bopp") !== -1 && (rProcess.indexOf("laminat") !== -1 || rProcess.indexOf("lamination") !== -1)) || rProcess.indexOf("bopp roto") !== -1 || rProcess.indexOf("bopp-roto") !== -1 || rProcess.indexOf("mettalic roto") !== -1 || rProcess.indexOf("metallic roto") !== -1 || rProcess.indexOf("mettalic-roto") !== -1 || rProcess.indexOf("metallic-roto") !== -1) {
                    showSingleDouble = true;
                }
                var isRowDCutOrWCutOrMaking = rProcess.indexOf("d cut") !== -1 || rProcess.indexOf("d-cut") !== -1 || rProcess.indexOf("w cut") !== -1 || rProcess.indexOf("w-cut") !== -1 || rProcess.indexOf("bag making") !== -1;
                if (rProcess.indexOf("bopp box bag") !== -1 || rProcess.indexOf("metallic bopp") !== -1 || rProcess.indexOf("cooler bopp") !== -1 || (rProcess.indexOf("bag") !== -1 && !isRowDCutOrWCutOrMaking)) {
                    showSingleDouble = true;
                }
            }
        }

        if (showSingleDouble) {
            return "Single Side Lamination\nDouble Side Lamination";
        } else {
            return "Inner Lamination\nOuter Lamination";
        }
    }

    function patchEditableQuotationItemDf(df) {
        if (!df || !QUOTATION_ITEM_FORCE_EDITABLE_FIELDS.has(df.fieldname)) return;
        df.read_only = 0;
        df.read_only_depends_on = "";
    }

    function prioritizeQuotationItemGridFields(fields) {
        if (!Array.isArray(fields)) return;
        const priority = {};
        QUOTATION_ITEM_PRIORITY_VISIBLE_FIELDS.forEach((fieldname, idx) => {
            priority[fieldname] = idx;
        });
        fields.sort((a, b) => {
            const ai = priority[a && a.fieldname] !== undefined ? priority[a.fieldname] : 999;
            const bi = priority[b && b.fieldname] !== undefined ? priority[b.fieldname] : 999;
            if (ai !== bi) return ai - bi;
            return 0;
        });
    }

    function showAllQuotationItemGridColumns(frm, attempt) {
        attempt = attempt || 0;
        const tf = frm.fields_dict && frm.fields_dict.items;
        const grid = tf && tf.grid;
        if (!tf || !grid) {
            if (attempt < 30) {
                setTimeout(() => showAllQuotationItemGridColumns(frm, attempt + 1), 100);
            }
            return;
        }

        const patchField = (df) => {
            if (!df || !df.fieldname || QUOTATION_ITEM_SKIP_GRID_TYPES.has(df.fieldtype)) return;
            df.hidden = 0;
            df.in_list_view = 1;
            patchEditableQuotationItemDf(df);
            if (QUOTATION_ITEM_PRIORITY_VISIBLE_FIELDS.includes(df.fieldname)) {
                df.columns = 1;
            } else if (!df.columns || df.columns <= 0) {
                df.columns = 1;
            }
            if (typeof frm.set_df_property === "function") {
                try {
                    frm.set_df_property(df.fieldname, "hidden", 0, "Quotation Item", "items");
                    frm.set_df_property(df.fieldname, "in_list_view", 1, "Quotation Item", "items");
                    frm.set_df_property(df.fieldname, "columns", df.columns, "Quotation Item", "items");
                    if (QUOTATION_ITEM_FORCE_EDITABLE_FIELDS.has(df.fieldname)) {
                        frm.set_df_property(df.fieldname, "read_only", 0, "Quotation Item", "items");
                        frm.set_df_property(df.fieldname, "read_only_depends_on", "", "Quotation Item", "items");
                    }
                } catch (e) { /* ignore */ }
            }
        };

        // Patch Frappe meta first. grid.refresh() reloads docfields from here.
        try {
            if (typeof frappe.meta.get_docfields === "function") {
                const metaFields = frappe.meta.get_docfields("Quotation Item", frm.docname);
                if (Array.isArray(metaFields)) {
                    prioritizeQuotationItemGridFields(metaFields);
                    metaFields.forEach(patchField);
                }
            }
        } catch (e0) { /* ignore */ }

        try {
            let copyFields = frappe.meta.docfield_copy && frappe.meta.docfield_copy["Quotation Item"];
            if (copyFields && !Array.isArray(copyFields) && typeof copyFields === "object") {
                copyFields = Object.values(copyFields);
            }
            if (Array.isArray(copyFields)) {
                prioritizeQuotationItemGridFields(copyFields);
                copyFields.forEach(patchField);
            }
        } catch (e00) { /* ignore */ }

        if (tf.df && Array.isArray(tf.df.fields)) {
            prioritizeQuotationItemGridFields(tf.df.fields);
            tf.df.fields.forEach(patchField);
        }
        if (Array.isArray(grid.docfields)) {
            prioritizeQuotationItemGridFields(grid.docfields);
            grid.docfields.forEach(patchField);
        }

        if (typeof grid.update_docfield_property === "function") {
            QUOTATION_ITEM_PRIORITY_VISIBLE_FIELDS.forEach(fieldname => {
                try {
                    grid.update_docfield_property(fieldname, "hidden", 0);
                    grid.update_docfield_property(fieldname, "in_list_view", 1);
                    grid.update_docfield_property(fieldname, "columns", 1);
                    if (QUOTATION_ITEM_FORCE_EDITABLE_FIELDS.has(fieldname)) {
                        grid.update_docfield_property(fieldname, "read_only", 0);
                        grid.update_docfield_property(fieldname, "read_only_depends_on", "");
                    }
                } catch (eg) { /* ignore */ }
            });
        }

        try { delete grid.grid_columns; } catch (e1) { /* ignore */ }
        try { delete grid.user_defined_columns; } catch (e2) { /* ignore */ }
        try {
            if (frappe.model.user_settings && frappe.model.user_settings["Quotation Item"]) {
                delete frappe.model.user_settings["Quotation Item"].GridView;
            }
            if (frappe.model.user_settings && frappe.model.user_settings["Quotation"]) {
                frappe.model.user_settings["Quotation"] = {};
            }
        } catch (e3) { /* ignore */ }
        grid.get_columns = function () {
            return (this.docfields || []).filter(df => df && df.in_list_view && !df.hidden);
        };
        if (typeof grid.setup_visible_columns === "function") grid.setup_visible_columns();
        if (typeof grid.setup_columns === "function") grid.setup_columns();
        if (typeof grid.refresh === "function") grid.refresh();
        if (Array.isArray(grid.docfields)) {
            prioritizeQuotationItemGridFields(grid.docfields);
            grid.docfields.forEach(patchField);
        }
        if (typeof grid.setup_visible_columns === "function") grid.setup_visible_columns();
        if (typeof grid.setup_columns === "function") grid.setup_columns();
        frm.refresh_field("items");
    }

    function isBagMakingParent(frm) {
        const p = ((frm && frm.doc && (frm.doc.custom_process || frm.doc.process)) || "").toString().toLowerCase();
        return p.includes("bag making");
    }

    function isDCutParent(frm) {
        if (!frm || !frm.doc) return false;
        const p = ((frm.doc.custom_process || frm.doc.process) || "").toString().toLowerCase();
        const bagType = (frm.doc.custom_type_of_bag || "").toString().toLowerCase();
        return p.includes("d-cut") || p.includes("d cut") || bagType.includes("d-cut") || bagType.includes("d cut");
    }

    /** Allow replacing a wrongly auto-set PLAIN BOX BAG row when parent/type is D-Cut. */
    function shouldForceDCutChildProcess(row, targetProcess) {
        const target = (targetProcess || "").toUpperCase();
        if (!target.includes("D CUT PLAIN")) return false;
        const current = (row.custom_process || row.process || "").toUpperCase();
        return current.includes("PLAIN BOX BAG") || current.includes("PLAIN SHOPPER BAG") || !current;
    }

    function showsTypeOfBagField(frm) {
        return isBagMakingParent(frm) || isDCutParent(frm);
    }

    function toggleBagMakingFields(frm) {
        if (!frm || typeof frm.set_df_property !== "function") return;
        const showBagType = showsTypeOfBagField(frm);
        try {
            frm.set_df_property("custom_type_of_bag", "hidden", showBagType ? 0 : 1);
            if (!showBagType && frm.doc.custom_type_of_bag) {
                frm.set_value("custom_type_of_bag", "");
            } else if (isDCutParent(frm)) {
                const bt = (frm.doc.custom_type_of_bag || "").toLowerCase();
                if (!bt.includes("d-cut") && !bt.includes("d cut")) {
                    frm.set_value("custom_type_of_bag", "D-Cut");
                }
            }
            frm.refresh_field("custom_type_of_bag");
        } catch (e) { /* ignore */ }
    }

    function isDCutBagProcess(row) {
        const p = (row.custom_process || row.process || "").trim().toUpperCase();
        return p.includes("D CUT PLAIN") || p.includes("D-CUT PLAIN") || (p.includes("D CUT") && p.includes("PLAIN") && !p.includes("BOX BAG") && !p.includes("SHOPPER BAG"));
    }

    function isWCutBagProcess(row) {
        const p = (row.custom_process || row.process || "").trim().toUpperCase();
        return p.includes("W-CUT") || p.includes("W CUT");
    }

    function isBagSheetProcess(row) {
        return isBoxBagProcess(row) || isDCutBagProcess(row) || isWCutBagProcess(row);
    }


    function isPlainBoxBagProcess(row) {
        const p = (row.custom_process || row.process || "").trim().toUpperCase();
        return p === "PLAIN BOX BAG" || p.includes("PLAIN BOX BAG") || p === "PLAIN SHOPPER BAG" || p.includes("PLAIN SHOPPER BAG");
    }

    function isPlainWCutBagProcess(row) {
        const p = (row.custom_process || row.process || "").trim().toUpperCase();
        return p === "PLAIN W CUT BAG" || p === "PLAIN W-CUT BAG" || p.includes("PLAIN W CUT") || p.includes("PLAIN W-CUT");
    }

    function isDefaultDesignCode(code) {
        const c = String(code || "").trim();
        return !c || c === "6000" || c === "2500" || c === "1000";
    }

    function isDefaultDesignName(name) {
        const n = String(name || "").trim().toUpperCase();
        return !n || n === "PLAIN BOX BAG" || n === "PLAIN D-CUT" || n === "PLAIN W-CUT" || n === "PLAIN W CUT" || n === "PLAIN D-CUT BAG" || n === "PLAIN W-CUT BAG";
    }

    function isBoxBagProcess(row) {
        const p = (row.custom_process || row.process || "").trim().toUpperCase();
        return p.includes("BOX BAG") || p.includes("SHOPPER BAG");
    }

    function isDCutLaminatedBagProcess(row) {
        const p = (row.custom_process || row.process || "").trim().toUpperCase();
        return p.includes("D CUT") && p.includes("LAMINAT");
    }

    /** Flexo / printed / BOPP-decorated bags: need design colour + colour count from DESIGN MASTER. */
    function rowNeedsDesignColourFields(row) {
        const p = (row.custom_process || row.process || "").trim().toUpperCase();
        if (!p || isDCutBagProcess(row) || isDCutLaminatedBagProcess(row)) return false;
        if (p.includes("PRE-FLEXO") || p.includes("CUSTOM FLEXO") || p.includes("FLEXO PRINTED")) return true;
        if ((p.includes("BOX BAG") || p.includes("SHOPPER BAG") || p.includes("W CUT BAG")) &&
            (p.includes("BOPP") || p.includes("METALLIC") || p.includes("COOLER") || p.includes("COLORED BOPP"))) {
            return true;
        }
        if (p.includes("PRINTED BOPP") || p === "NON WOVEN FLEXO PRINTED FABRIC" || p.includes("FLEXO")) return true;
        if (p.includes("LAMINATED PRINTED") || p.includes("PRINTED SHEET")) return true;
        return false;
    }

    function rowNeedsDesignCodeNameOnly(row) {
        const p = (row.custom_process || row.process || "").trim().toUpperCase();
        return isDCutBagProcess(row) || isPlainBoxBagProcess(row) ||
            p.includes("PLAIN W CUT BAG") || p.includes("PLAIN LAMINATED");
    }

    function fetchDesignFieldsFromMaster(frm, cdt, cdn, opts) {
        opts = opts || {};
        const row = locals[cdt] && locals[cdt][cdn];
        if (!row) return Promise.resolve();

        const linkKey = String(row.custom_design_code || "").trim();
        const nameKey = String(row.custom_design_name || "").trim();
        if (!linkKey && !nameKey) return Promise.resolve();

        const masterFields = [
            "name",
            "design_name",
            "design_colour",
            "no_of_design_colours"
        ];

        function applyMaster(msg) {
            if (!msg || !msg.name) return;
            const updates = [];
            const masterName = String(msg.design_name || msg.name || "").trim();
            if (masterName && (opts.forceName || !String(row.custom_design_name || "").trim())) {
                updates.push(frappe.model.set_value(cdt, cdn, "custom_design_name", masterName));
            }
            if (rowNeedsDesignColourFields(row) || opts.includeColour) {
                const colour = String(msg.design_colour || "").trim();
                if (colour && (opts.forceColour || !String(row.custom_design_colour || "").trim())) {
                    updates.push(frappe.model.set_value(cdt, cdn, "custom_design_colour", colour));
                }
                const noOf = msg.no_of_design_colours != null && msg.no_of_design_colours !== ""
                    ? msg.no_of_design_colours
                    : msg.no_of_design_colour;
                if (noOf != null && noOf !== "" &&
                    (opts.forceNoOf || !(row.custom_no_of_design_colour || row.custom_no_of_design_colours))) {
                    updates.push(frappe.model.set_value(cdt, cdn, "custom_no_of_design_colour", String(noOf)));
                    updates.push(frappe.model.set_value(cdt, cdn, "custom_no_of_design_colours", String(noOf)));
                }
            }
            if (String(row.custom_design_code || "").trim() !== msg.name && msg.name) {
                updates.push(frappe.model.set_value(cdt, cdn, "custom_design_code", msg.name));
            }
            return Promise.all(updates).catch(() => { });
        }

        function loadByKey(key) {
            if (!key) return Promise.resolve(null);
            return frappe.db.get_value("DESIGN MASTER", key, masterFields)
                .then(r => (r && r.message && r.message.name) ? r.message : null)
                .catch(() => null);
        }

        return loadByKey(linkKey)
            .then(msg => {
                if (msg) return applyMaster(msg);
                return loadByKey(nameKey).then(msg2 => {
                    if (msg2) return applyMaster(msg2);
                    if (/^\d+$/.test(linkKey)) {
                        return frappe.db.get_value(
                            "DESIGN MASTER",
                            { design_code: linkKey },
                            masterFields
                        ).then(r => {
                            if (r && r.message && r.message.name) return applyMaster(r.message);
                        }).catch(() => { });
                    }
                });
            });
    }

    function fetchLhDesignFieldsFromMaster(frm, cdt, cdn, opts) {
        opts = opts || {};
        const row = locals[cdt] && locals[cdt][cdn];
        if (!row) return Promise.resolve();

        const linkKey = String(row.custom_lh_design_code || "").trim();
        const nameKey = String(row.custom_lh_design_name || "").trim();
        if (!linkKey && !nameKey) return Promise.resolve();

        const masterFields = [
            "name",
            "design_name",
            "design_colour",
            "no_of_design_colours"
        ];

        function applyMaster(msg) {
            if (!msg || !msg.name) return;
            const updates = [];
            const masterName = String(msg.design_name || msg.name || "").trim();
            if (masterName && (opts.forceName || !String(row.custom_lh_design_name || "").trim())) {
                updates.push(frappe.model.set_value(cdt, cdn, "custom_lh_design_name", masterName));
            }
            if (opts.includeColour) {
                const colour = String(msg.design_colour || "").trim();
                if (colour && (opts.forceColour || !String(row.custom_lh_design_colour || "").trim())) {
                    updates.push(frappe.model.set_value(cdt, cdn, "custom_lh_design_colour", colour));
                }
                const noOf = msg.no_of_design_colours != null && msg.no_of_design_colours !== ""
                    ? msg.no_of_design_colours
                    : msg.no_of_design_colour;
                if (noOf != null && noOf !== "" &&
                    (opts.forceNoOf || !(row.custom_lh_no_of_design_colour || row.custom_lh_no_of_design_colours))) {
                    updates.push(frappe.model.set_value(cdt, cdn, "custom_lh_no_of_design_colour", String(noOf)));
                }
            }
            if (String(row.custom_lh_design_code || "").trim() !== msg.name && msg.name) {
                updates.push(frappe.model.set_value(cdt, cdn, "custom_lh_design_code", msg.name));
            }
            return Promise.all(updates).catch(() => { });
        }

        function loadByKey(key) {
            if (!key) return Promise.resolve(null);
            return frappe.db.get_value("DESIGN MASTER", key, masterFields)
                .then(r => (r && r.message && r.message.name) ? r.message : null)
                .catch(() => null);
        }

        return loadByKey(linkKey)
            .then(msg => {
                if (msg) return applyMaster(msg);
                return loadByKey(nameKey).then(msg2 => {
                    if (msg2) return applyMaster(msg2);
                    if (/^\d+$/.test(linkKey)) {
                        return frappe.db.get_value(
                            "DESIGN MASTER",
                            { design_code: linkKey },
                            masterFields
                        ).then(r => {
                            if (r && r.message && r.message.name) return applyMaster(r.message);
                        }).catch(() => { });
                    }
                });
            });
    }

    function applyBagRowDesignDefaults(frm, cdt, cdn) {
        const row = locals[cdt] && locals[cdt][cdn];
        if (!row) return;
        if (isDCutBagProcess(row)) {
            applyDCutBagDesignDefaults(frm, cdt, cdn);
            return;
        }
        if (isPlainBoxBagProcess(row)) {
            applyPlainBoxBagDesignDefaults(frm, cdt, cdn);
            return;
        }
        if (isPlainWCutBagProcess(row)) {
            applyPlainWCutBagDesignDefaults(frm, cdt, cdn);
            return;
        }
        if (rowNeedsDesignColourFields(row) || rowNeedsDesignCodeNameOnly(row)) {
            if (row.custom_design_code || row.custom_design_name) {
                fetchDesignFieldsFromMaster(frm, cdt, cdn);
            }
        }
    }

    /** DESIGN MASTER: code 2500, name PLAIN D-CUT (Process Master: 211 - D CUT PLAIN). */
    const D_CUT_BAG_DESIGN = {
        code: "2500",
        name: "PLAIN D-CUT",
        process: "D CUT PLAIN"
    };

    function applyDCutBagDesignDefaults(frm, cdt, cdn) {
        const row = locals[cdt] && locals[cdt][cdn];
        if (!row || !isDCutBagProcess(row)) return;
        const code = D_CUT_BAG_DESIGN.code;
        const name = D_CUT_BAG_DESIGN.name;
        function designMasterExists(docname) {
            return frappe.db.get_value("DESIGN MASTER", docname, "name")
                .then(r => !!(r && r.message && r.message.name));
        }
        designMasterExists(code)
            .then(exists => (exists ? true : designMasterExists(name)))
            .then(exists => {
                if (frm) frm._d_cut_design_exists = exists;
                const latestRow = locals[cdt] && locals[cdt][cdn];
                if (!latestRow || !isDCutBagProcess(latestRow)) return;
                const curCode = String(latestRow.custom_design_code || "").trim();
                if (exists && isDefaultDesignCode(curCode)) {
                    frappe.model.set_value(cdt, cdn, "custom_design_code", code).catch(() => { });
                }
            })
            .catch(() => { });
        const curName = String(row.custom_design_name || "").trim().toUpperCase();
        if (isDefaultDesignName(curName)) {
            frappe.model.set_value(cdt, cdn, "custom_design_name", name).catch(() => { });
        }
        if (!row.uom || String(row.uom).toUpperCase() === "KG") {
            frappe.model.set_value(cdt, cdn, "uom", "Pieces").catch(() => { });
        }
    }

    function applyPlainBoxBagDesignDefaults(frm, cdt, cdn) {
        const row = locals[cdt] && locals[cdt][cdn];
        if (!row || !isPlainBoxBagProcess(row)) return;
        const code = "6000";
        const name = "PLAIN BOX BAG";
        frappe.db.get_value("DESIGN MASTER", code, "name").then(r => {
            const exists = !!(r && r.message && r.message.name);
            if (frm) frm._plain_box_bag_design_6000_exists = exists;
            const latestRow = locals[cdt] && locals[cdt][cdn];
            if (!latestRow || !isPlainBoxBagProcess(latestRow)) return;
            const curCode = String(latestRow.custom_design_code || "").trim();
            if (exists && isDefaultDesignCode(curCode)) {
                frappe.model.set_value(cdt, cdn, "custom_design_code", code).catch(() => { });
            }
        }).catch(() => { });
        const curName = String(row.custom_design_name || "").trim().toUpperCase();
        if (isDefaultDesignName(curName)) {
            frappe.model.set_value(cdt, cdn, "custom_design_name", name).catch(() => { });
        }
        if (!row.uom || String(row.uom).toUpperCase() === "KG") {
            frappe.model.set_value(cdt, cdn, "uom", "Pieces").catch(() => { });
        }
    }

    function applyPlainWCutBagDesignDefaults(frm, cdt, cdn) {
        const row = locals[cdt] && locals[cdt][cdn];
        if (!row || !isPlainWCutBagProcess(row)) return;
        const code = "1000";
        const name = "PLAIN W-CUT";
        frappe.db.get_value("DESIGN MASTER", code, "name").then(r => {
            const exists = !!(r && r.message && r.message.name);
            if (frm) frm._plain_w_cut_design_1000_exists = exists;
            const latestRow = locals[cdt] && locals[cdt][cdn];
            if (!latestRow || !isPlainWCutBagProcess(latestRow)) return;
            const curCode = String(latestRow.custom_design_code || "").trim();
            if (exists && isDefaultDesignCode(curCode)) {
                frappe.model.set_value(cdt, cdn, "custom_design_code", code).catch(() => { });
            }
        }).catch(() => { });
        const curName = String(row.custom_design_name || "").trim().toUpperCase();
        if (isDefaultDesignName(curName)) {
            frappe.model.set_value(cdt, cdn, "custom_design_name", name).catch(() => { });
        }
        if (!row.uom || String(row.uom).toUpperCase() === "KG") {
            frappe.model.set_value(cdt, cdn, "uom", "Pieces").catch(() => { });
        }
    }

    function applyPlainBoxBagDesignDefaultsToRows(frm) {
        if (!frm || !frm.doc || !Array.isArray(frm.doc.items)) return;
        (frm.doc.items || []).forEach(row => {
            if (!row || !row.doctype || !row.name) return;
            applyBagRowDesignDefaults(frm, row.doctype, row.name);
        });
    }

    function sanitizePlainBoxBagDesignDefaultsBeforeSave(frm) {
        if (!frm || !frm.doc || !Array.isArray(frm.doc.items)) return;
        (frm.doc.items || []).forEach(row => {
            if (!row) return;
            if (isDCutBagProcess(row)) {
                if (isDefaultDesignCode(row.custom_design_code)) {
                    row.custom_design_code = "2500";
                }
                if (isDefaultDesignName(row.custom_design_name)) {
                    row.custom_design_name = "PLAIN D-CUT";
                }
                if (!row.uom || String(row.uom).toUpperCase() === "KG") {
                    row.uom = "Pieces";
                }
            } else if (isPlainWCutBagProcess(row)) {
                if (isDefaultDesignCode(row.custom_design_code)) {
                    row.custom_design_code = "1000";
                }
                if (isDefaultDesignName(row.custom_design_name)) {
                    row.custom_design_name = "PLAIN W-CUT";
                }
                if (!row.uom || String(row.uom).toUpperCase() === "KG") {
                    row.uom = "Pieces";
                }
            } else if (isPlainBoxBagProcess(row)) {
                if (isDefaultDesignCode(row.custom_design_code)) {
                    row.custom_design_code = "6000";
                }
                if (isDefaultDesignName(row.custom_design_name)) {
                    row.custom_design_name = "PLAIN BOX BAG";
                }
                if (!row.uom || String(row.uom).toUpperCase() === "KG") {
                    row.uom = "Pieces";
                }
            }

            let p = (row.custom_process || row.process || "").toUpperCase();
            let is_plain_laminated = p.includes("PLAIN LAMINATED");
            let is_plain_box_bag = p === "PLAIN BOX BAG" || p === "PLAIN SHOPPER BAG";

            if ((is_plain_box_bag || isDCutBagProcess(row) || isPlainWCutBagProcess(row)) && !is_plain_laminated) {
                row.custom_lamination_gsm = "";
                row.custom_lamination_side = "";
            }
        });
    }

    function resolvePlainBoxBagRowDims(row) {
        let wMm = parseFloat(row.custom_width_mm) || 0;
        let hMm = parseFloat(row.custom_height_mm) || 0;
        let gMm = parseFloat(row.custom_gazette_mm) || 0;
        const wIn = parseFloat(row.custom_width_inch) || 0;
        const hIn = parseFloat(row.custom_height_inches) || 0;
        const gIn = parseFloat(row.custom_gazette_inch) || 0;
        if (wMm > 0) wMm = snapMM(wMm);
        if (wMm <= 0 && wIn > 0) wMm = snapMM(wIn * 25.4);
        if (hMm <= 0 && hIn > 0) hMm = Math.round(hIn * 25.4);
        if (gMm <= 0 && gIn > 0) gMm = Math.round(gIn * 25.4);
        return { wMm, hMm, gMm };
    }

    /** Auto cut length (mm) is rounded to nearest 5; manual row values are left as-is on the server. */
    function roundPlainBoxBagCutLengthMmToNearest5(mm) {
        const n = parseFloat(mm) || 0;
        if (n <= 0) return 0;
        return Math.round(n / 5) * 5;
    }

    function recalculatePlainBoxBagWeightFromSheet(frm, cdt, cdn) {
        const row = locals[cdt] && locals[cdt][cdn];
        if (!row || !isBagSheetProcess(row)) return;
        const sw = parseFloat(row.custom_sheet_width_mm) || 0;
        const cl = parseFloat(row.custom_sheet_cut_length_mm) || 0;
        const gsm = parseFloat(row.custom_gsm) || 0;
        if (sw <= 0 || cl <= 0 || gsm <= 0) return;
        const sheetWidthM = sw / 1000;
        const cutLengthM = Math.round((cl / 1000) * 1000) / 1000;
        const weightGrams = Math.round(((gsm * sheetWidthM * cutLengthM) + 3.5) * 1000) / 1000;
        if (weightGrams > 0) {
            frappe.model.set_value(cdt, cdn, "custom_weight_per_bag_grams", weightGrams).catch(() => { });
        }
    }

    function resolveDCutBagRowDims(row) {
        let wMm = parseFloat(row.custom_width_mm) || 0;
        let hMm = parseFloat(row.custom_height_mm) || 0;
        const wIn = parseFloat(row.custom_width_inch) || 0;
        const hIn = parseFloat(row.custom_height_inches) || 0;
        if (wMm > 0) wMm = snapMM(wMm);
        if (wMm <= 0 && wIn > 0) wMm = snapMM(wIn * 25.4);
        if (hMm <= 0 && hIn > 0) hMm = Math.round(hIn * 25.4);
        return { wMm, hMm };
    }

    function calculateDCutBagMetrics(row) {
        const dims = resolveDCutBagRowDims(row);
        const hMm = dims.hMm;
        const wMm = dims.wMm;
        const topFold = parseFloat(row.custom_top_folding_mm) || 0;
        const gsm = parseFloat(row.custom_gsm) || 0;
        const sheetWidthMm = Math.round((hMm + topFold) * 2);
        const sheetCutLengthMm = Math.round(wMm);
        const sheetWidthM = sheetWidthMm / 1000;
        const cutLengthM = Math.round((sheetCutLengthMm / 1000) * 1000) / 1000;
        const metersPerKg = gsm > 0 && sheetWidthM > 0
            ? Math.round((1000 / (gsm * sheetWidthM)) * 100) / 100
            : 0;
        const weightGrams = Math.round(((gsm * sheetWidthM * cutLengthM) + 3.5) * 1000) / 1000;
        const weightKg = Math.floor((weightGrams / 1000) * 1000) / 1000;
        return { sheetWidthMm, sheetCutLengthMm, cutLengthM, metersPerKg, weightGrams, weightKg };
    }

    function calculatePlainBoxBagMetrics(row) {
        const dims = resolvePlainBoxBagRowDims(row);
        const hMm = dims.hMm;
        const wMm = dims.wMm;
        const gMm = dims.gMm;
        const topFold = parseFloat(row.custom_top_folding_mm) || 0;
        const gsm = parseFloat(row.custom_gsm) || 0;
        const sheetWidthMm = Math.round((hMm + topFold) * 2 + gMm);
        const sheetCutLengthMm = roundPlainBoxBagCutLengthMmToNearest5(Math.round(wMm + gMm + 20));
        const sheetWidthM = sheetWidthMm / 1000;
        const cutLengthM = Math.round((sheetCutLengthMm / 1000) * 1000) / 1000;
        const metersPerKg = gsm > 0 && sheetWidthM > 0
            ? Math.round((1000 / (gsm * sheetWidthM)) * 100) / 100
            : 0;
        const weightGrams = Math.round(((gsm * sheetWidthM * cutLengthM) + 3.5) * 1000) / 1000;
        // 3 decimal Kg per piece; truncate (57.560 g -> 0.057, not 0.06)
        const weightKg = Math.floor((weightGrams / 1000) * 1000) / 1000;
        return { sheetWidthMm, sheetCutLengthMm, cutLengthM, metersPerKg, weightGrams, weightKg };
    }

    function applyDCutBagCalculations(frm, cdt, cdn) {
        const row = locals[cdt] && locals[cdt][cdn];
        const p = (row && (row.custom_process || row.process || "").toUpperCase()) || "";
        const isAnyDCut = (p.includes("D CUT") || p.includes("D-CUT")) && !p.includes("BOX BAG") && !p.includes("SHOPPER BAG");
        if (!row || !isAnyDCut) return;
        if (row._plain_box_sheet_manual) {
            recalculatePlainBoxBagWeightFromSheet(frm, cdt, cdn);
            showWidthPreview(frm, cdt, cdn, parseFloat(row.custom_width_inch) || 0, parseInt(row.custom_width_mm) || 0);
            return;
        }
        const dims = resolveDCutBagRowDims(row);
        if (dims.wMm > 0 && !(parseFloat(row.custom_width_mm) > 0)) {
            frappe.model.set_value(cdt, cdn, "custom_width_mm", dims.wMm);
            frappe.model.set_value(cdt, cdn, "custom_width_cm", parseFloat((dims.wMm / 10).toFixed(2)));
        }
        const metrics = calculateDCutBagMetrics(row);
        const updates = [];
        if (metrics.sheetWidthMm > 0) {
            updates.push(frappe.model.set_value(cdt, cdn, "custom_sheet_width_mm", metrics.sheetWidthMm));
        }
        if (metrics.sheetCutLengthMm > 0) {
            updates.push(frappe.model.set_value(cdt, cdn, "custom_sheet_cut_length_mm", metrics.sheetCutLengthMm));
        }
        if (metrics.weightGrams > 0) {
            updates.push(frappe.model.set_value(cdt, cdn, "custom_weight_per_bag_grams", metrics.weightGrams));
        }
        if (updates.length) {
            Promise.all(updates).catch(() => { /* ignore */ });
        }
        showWidthPreview(frm, cdt, cdn, parseFloat(row.custom_width_inch) || 0, parseInt(row.custom_width_mm) || 0);
    }

    function calculateWCutBagMetrics(row) {
        const dims = resolvePlainBoxBagRowDims(row);
        const hMm = dims.hMm;
        const wMm = dims.wMm;
        const gMm = dims.gMm;
        const topFold = parseFloat(row.custom_top_folding_mm) || 0;
        const gsm = parseFloat(row.custom_gsm) || 0;
        const sheetWidthMm = Math.round((hMm + topFold) * 2 + gMm);
        const sheetCutLengthMm = roundPlainBoxBagCutLengthMmToNearest5(Math.round(wMm + gMm + 20));
        const sheetWidthM = sheetWidthMm / 1000;
        const cutLengthM = Math.round((sheetCutLengthMm / 1000) * 1000) / 1000;
        const metersPerKg = gsm > 0 && sheetWidthM > 0
            ? Math.round((1000 / (gsm * sheetWidthM)) * 100) / 100
            : 0;
        
        const wIn = parseFloat(row.custom_width_inch) || (wMm / 25.4);
        const hIn = parseFloat(row.custom_height_inches) || (hMm / 25.4);
        const weightGrams = Math.round(((((wIn * 2) + 2) * gsm * hIn * 0.85) / 1550.0) * 1000) / 1000;
        const weightKg = Math.floor((weightGrams / 1000) * 1000) / 1000;
        return { sheetWidthMm, sheetCutLengthMm, cutLengthM, metersPerKg, weightGrams, weightKg };
    }

    function applyWCutBagCalculations(frm, cdt, cdn) {
        const row = locals[cdt] && locals[cdt][cdn];
        if (!row || !isWCutBagProcess(row)) return;
        if (row._plain_box_sheet_manual) {
            recalculatePlainBoxBagWeightFromSheet(frm, cdt, cdn);
            showWidthPreview(frm, cdt, cdn, parseFloat(row.custom_width_inch) || 0, parseInt(row.custom_width_mm) || 0);
            return;
        }
        const dims = resolvePlainBoxBagRowDims(row);
        if (dims.wMm > 0 && !(parseFloat(row.custom_width_mm) > 0)) {
            frappe.model.set_value(cdt, cdn, "custom_width_mm", dims.wMm);
            frappe.model.set_value(cdt, cdn, "custom_width_cm", parseFloat((dims.wMm / 10).toFixed(2)));
        }
        const metrics = calculateWCutBagMetrics(row);
        const updates = [];
        if (metrics.sheetWidthMm > 0) {
            updates.push(frappe.model.set_value(cdt, cdn, "custom_sheet_width_mm", metrics.sheetWidthMm));
        }
        if (metrics.sheetCutLengthMm > 0) {
            updates.push(frappe.model.set_value(cdt, cdn, "custom_sheet_cut_length_mm", metrics.sheetCutLengthMm));
        }
        if (metrics.weightGrams > 0) {
            updates.push(frappe.model.set_value(cdt, cdn, "custom_weight_per_bag_grams", metrics.weightGrams));
        }
        if (updates.length) {
            Promise.all(updates).catch(() => { /* ignore */ });
        }
        showWidthPreview(frm, cdt, cdn, parseFloat(row.custom_width_inch) || 0, parseInt(row.custom_width_mm) || 0);
    }

    function applyBagSheetCalculations(frm, cdt, cdn) {
        const row = locals[cdt] && locals[cdt][cdn];
        if (!row) return;
        const p = (row.custom_process || row.process || "").toUpperCase();
        const isAnyDCut = (p.includes("D CUT") || p.includes("D-CUT")) && !p.includes("BOX BAG") && !p.includes("SHOPPER BAG");
        if (isAnyDCut) {
            applyDCutBagCalculations(frm, cdt, cdn);
        } else if (isBoxBagProcess(row)) {
            applyPlainBoxBagCalculations(frm, cdt, cdn);
        } else if (isWCutBagProcess(row)) {
            applyWCutBagCalculations(frm, cdt, cdn);
        }
    }


    function applyPlainBoxBagCalculations(frm, cdt, cdn) {
        const row = locals[cdt] && locals[cdt][cdn];
        if (!row || !isBoxBagProcess(row)) return;
        if (row._plain_box_sheet_manual) {
            recalculatePlainBoxBagWeightFromSheet(frm, cdt, cdn);
            showWidthPreview(frm, cdt, cdn, parseFloat(row.custom_width_inch) || 0, parseInt(row.custom_width_mm) || 0);
            return;
        }
        const dims = resolvePlainBoxBagRowDims(row);
        if (dims.wMm > 0 && !(parseFloat(row.custom_width_mm) > 0)) {
            frappe.model.set_value(cdt, cdn, "custom_width_mm", dims.wMm);
            frappe.model.set_value(cdt, cdn, "custom_width_cm", parseFloat((dims.wMm / 10).toFixed(2)));
        }
        const metrics = calculatePlainBoxBagMetrics(row);
        const updates = [];
        if (metrics.sheetWidthMm > 0) {
            updates.push(frappe.model.set_value(cdt, cdn, "custom_sheet_width_mm", metrics.sheetWidthMm));
        }
        if (metrics.sheetCutLengthMm > 0) {
            updates.push(frappe.model.set_value(cdt, cdn, "custom_sheet_cut_length_mm", metrics.sheetCutLengthMm));
        }
        if (metrics.weightGrams > 0) {
            updates.push(frappe.model.set_value(cdt, cdn, "custom_weight_per_bag_grams", metrics.weightGrams));
        }
        if (updates.length) {
            Promise.all(updates).catch(() => { /* ignore */ });
        }
        showWidthPreview(frm, cdt, cdn, parseFloat(row.custom_width_inch) || 0, parseInt(row.custom_width_mm) || 0);
    }

    /** Bag Series doctype fields → Quotation Item custom_* fields */
    const BAG_SERIES_FETCH_FIELDS = [
        "width_in_inches",
        "height_in_inches",
        "gazette_inches",
        "width_in_mm",
        "height_in_mm",
        "gazette_mm"
    ];

    function bagSeriesHasDimensions(d) {
        if (!d) return false;
        return BAG_SERIES_FETCH_FIELDS.some(fn => {
            const v = d[fn];
            return v !== null && v !== undefined && v !== "";
        });
    }

    function readBagSeriesNum(d, fieldName) {
        const tv = d[fieldName];
        if (tv === null || tv === undefined || tv === "") return 0;
        const n = parseFloat(tv);
        return isNaN(n) ? 0 : n;
    }

    function applyBagSeriesToQuotationRow(cdt, cdn, d) {
        let wIn = readBagSeriesNum(d, "width_in_inches");
        let wMm = readBagSeriesNum(d, "width_in_mm");
        let hIn = readBagSeriesNum(d, "height_in_inches");
        let hMm = readBagSeriesNum(d, "height_in_mm");
        let gIn = readBagSeriesNum(d, "gazette_inches");
        let gMm = readBagSeriesNum(d, "gazette_mm");
        // Bag Series is source of truth: keep master inch + mm together (do not round-trip inch from mm).
        if (wMm <= 0 && wIn > 0) wMm = snapMM(wIn * 25.4);
        if (hMm <= 0 && hIn > 0) hMm = Math.round(hIn * 25.4);
        if (gMm <= 0 && gIn > 0) gMm = Math.round(gIn * 25.4);
        const wCm = wMm > 0 ? parseFloat((wMm / 10).toFixed(2)) : 0;
        const hCm = hMm > 0 ? parseFloat((hMm / 10).toFixed(2)) : 0;
        const gCm = gMm > 0 ? parseFloat((gMm / 10).toFixed(2)) : 0;
        const row = locals[cdt] && locals[cdt][cdn];
        const state = getQuotationClientState();
        state.widthSyncing = true;
        if (row) row._bag_series_dims_applied = 1;
        // Set inch before mm so bag rows never derive 8.1" from 205 mm (parallel set_value races).
        let chain = Promise.resolve();
        chain = chain.then(() => frappe.model.set_value(cdt, cdn, "custom_width_inch", wIn));
        chain = chain.then(() => frappe.model.set_value(cdt, cdn, "custom_width_mm", wMm));
        chain = chain.then(() => frappe.model.set_value(cdt, cdn, "custom_width_cm", wCm));
        chain = chain.then(() => frappe.model.set_value(cdt, cdn, "custom_height_inches", hIn));
        chain = chain.then(() => frappe.model.set_value(cdt, cdn, "custom_height_mm", hMm));
        chain = chain.then(() => frappe.model.set_value(cdt, cdn, "custom_height_cm", hCm));
        chain = chain.then(() => frappe.model.set_value(cdt, cdn, "custom_gazette_inch", gIn));
        chain = chain.then(() => frappe.model.set_value(cdt, cdn, "custom_gazette_mm", gMm));
        chain = chain.then(() => frappe.model.set_value(cdt, cdn, "custom_gazette_cm", gCm));
        return chain.finally(() => {
            state.widthSyncing = false;
            const r2 = locals[cdt] && locals[cdt][cdn];
            if (r2) delete r2._bag_series_dims_applied;
        });
    }

    function quotationRowHasBagDimensions(cdt, cdn) {
        const row = locals[cdt] && locals[cdt][cdn];
        if (!row) return false;
        if (isDCutBagProcess(row)) {
            const dims = resolveDCutBagRowDims(row);
            return dims.wMm > 0 && dims.hMm > 0;
        }
        const dims = resolvePlainBoxBagRowDims(row);
        return dims.wMm > 0 && dims.hMm > 0 && dims.gMm > 0;
    }

    function fetchBagSeriesDimensions(cdt, cdn, bagSizeCode) {
        bagSizeCode = (bagSizeCode || "").trim();
        if (!bagSizeCode) return Promise.resolve(true);

        function tryApplyFromResponse(r) {
            if (r && r.message && bagSeriesHasDimensions(r.message)) {
                return applyBagSeriesToQuotationRow(cdt, cdn, r.message).then(() => true);
            }
            return Promise.resolve(false);
        }

        // custom_bag_size may be Bag Series `code` (511) or document name
        return frappe.db.get_value("Bag Series", { code: bagSizeCode }, BAG_SERIES_FETCH_FIELDS)
            .then(r => tryApplyFromResponse(r))
            .then(applied => {
                if (applied) return true;
                return frappe.db.get_value("Bag Series", bagSizeCode, BAG_SERIES_FETCH_FIELDS)
                    .then(r => tryApplyFromResponse(r));
            })
            .then(applied => {
                if (applied || quotationRowHasBagDimensions(cdt, cdn)) {
                    return true;
                }
                frappe.show_alert({
                    message: `Bag Size <b>${bagSizeCode}</b> not found in Bag Series.`,
                    indicator: "red"
                }, 5);
                return false;
            });
    }

    function deriveChildProcessFromParent(frm) {
        if (!frm || !frm.doc) return "";
        let selected_parent_process = (frm.doc.custom_process || "").toLowerCase();
        let parent_process = (selected_parent_process || frm.doc.process || "").toLowerCase();
        let parent_side = (frm.doc.custom_lamination_side || "").toLowerCase();
        let type_of_printing = (frm.doc.custom_type_of_printing || "").toLowerCase();
        let lamination_type = (frm.doc.custom_type_of_lamination || "").toLowerCase();
        let is_bopp = lamination_type.includes("bopp") || parent_process.includes("bopp") || parent_side.includes("bopp");

        let is_bopp_lam_slit = is_bopp && parent_process.includes("laminat") && (parent_process.includes("slitted") || parent_process.includes("slitting"));
        let is_bopp_lam_sheet = is_bopp && (parent_process.includes("sheet") || parent_process.includes("cutting")) && (parent_process.includes("laminat") || lamination_type.length > 0);
        let is_lam_print_sheet = parent_process.includes("laminat") && parent_process.includes("printed") && parent_process.includes("sheet");
        let is_lam_print = !is_lam_print_sheet && parent_process.includes("laminat") && parent_process.includes("printed");
        let is_lam_slit = !is_bopp && parent_process.includes("laminat") && (parent_process.includes("slitted") || parent_process.includes("slitting"));
        let is_lam_sheet = !is_bopp && !is_lam_print_sheet && (parent_process.includes("sheet") || parent_process.includes("cutting")) && (parent_process.includes("laminat") || lamination_type.includes("plain"));
        let is_printed_sheet = !is_lam_print_sheet && parent_process.includes("sheet") && (parent_process.includes("print") || type_of_printing.includes("flexo"));

        let lamination_side_options = getQuotationLaminationSideOptions(frm);
        // Do not infer slitted fabric from lamination side alone — Sheet Cutting + BOPP must stay on SHEET.
        let is_bopp_lam_sheet_cutting = is_bopp && (
            parent_process.includes("sheet cutting")
            || (parent_process.includes("sheet") && parent_process.includes("cutting"))
        );
        if (is_bopp_lam_sheet_cutting) {
            is_bopp_lam_sheet = true;
            is_bopp_lam_slit = false;
        }

        let is_printing = parent_process.includes("printing") || parent_process.includes("print");

        let target_process = "";

        // Specific Printed BOPP/BOPP printing handling
        let is_printed_bopp = parent_process.includes("printed bopp") ||
            parent_process.includes("bopp print") ||
            (is_printing && type_of_printing.includes("bopp"));

        if (is_printed_bopp) {
            target_process = "PRINTED BOPP";
        } else if (parent_process.includes("d-cut") || parent_process.includes("d cut")) {
            target_process = D_CUT_BAG_DESIGN.process;
        } else if (parent_process.includes("bag making") || parent_process.includes("box bag") || parent_process.includes("shopper bag") || parent_process.includes("w cut") || parent_process.includes("w-cut")) {
            const pUpper = parent_process.toUpperCase();
            const bagType = (frm.doc.custom_type_of_bag || "").toLowerCase();
            if (bagType.includes("d-cut") || bagType.includes("d cut")) {
                target_process = D_CUT_BAG_DESIGN.process;
            } else if (pUpper.includes("BOX BAG") || pUpper.includes("SHOPPER BAG") || pUpper.includes("W CUT BAG")) {
                target_process = pUpper;
            } else {
                const isFlexo = type_of_printing.includes("flexo");
                const isLam = lamination_type.includes("plain") || lamination_type.includes("bopp");
                if (bagType.includes("box")) {
                    if (isFlexo && isLam) target_process = "PRE-FLEXO PRINTED LAMINATED BOX BAG";
                    else if (isFlexo) target_process = "PRE-FLEXO PRINTED BOX BAG";
                    else if (isLam) target_process = "PLAIN LAMINATED BOX BAG";
                    else target_process = "PLAIN BOX BAG";
                } else if (bagType.includes("shopper")) {
                    if (isFlexo && isLam) target_process = "PRE-FLEXO PRINTED LAMINATED SHOPPER BAG";
                    else if (isFlexo) target_process = "PRE-FLEXO PRINTED SHOPPER BAG";
                    else if (isLam) target_process = "PLAIN LAMINATED SHOPPER BAG";
                    else target_process = "PLAIN SHOPPER BAG";
                } else if (bagType.includes("w-cut") || bagType.includes("w cut") || bagType.includes("wcut")) {
                    if (isFlexo && isLam) target_process = "PRE-FLEXO PRINTED LAMINATED W CUT BAG";
                    else if (isFlexo) target_process = "PRE-FLEXO PRINTED W CUT BAG";
                    else if (isLam) target_process = "PLAIN LAMINATED W CUT BAG";
                    else target_process = "PLAIN W CUT BAG";
                }
            }
        } else if (is_bopp_lam_slit) {
            target_process = "NON WOVEN BOPP LAMINATED SLITTED FABRIC";
        } else if (is_bopp_lam_sheet) {
            target_process = "NON WOVEN BOPP LAMINATED SHEET";
        } else if (is_lam_print_sheet) {
            target_process = "NON WOVEN LAMINATED PRINTED SHEET";
        } else if (is_lam_print) {
            target_process = "NON WOVEN LAMINATED PRINTED FABRIC";
        } else if (is_lam_slit) {
            target_process = "NON WOVEN LAMINATED SLITTED FABRIC";
        } else if (is_lam_sheet) {
            target_process = "NON WOVEN LAMINATED SHEET";
        } else if (parent_process.includes("slitting")) {
            target_process = "NON WOVEN SLITTED FABRIC";
        } else if (parent_process.includes("rewind")) {
            target_process = "NON WOVEN REWINDED FABRIC";
        } else if (is_printed_sheet) {
            target_process = "NON WOVEN PRINTED SHEET";
        } else if (parent_process.includes("sheet")) {
            target_process = "NON WOVEN PLAIN SHEET";
        } else if (is_bopp || (parent_process.includes("lamination") && parent_side.includes("bopp"))) {
            target_process = "NON WOVEN BOPP LAMINATED FABRIC";
        } else if (is_printing) {
            if (type_of_printing.includes("flexo")) {
                target_process = "NON WOVEN FLEXO PRINTED FABRIC";
            } else if (type_of_printing.includes("bopp")) {
                target_process = "PRINTED BOPP";
            }
        }

        return target_process;
    }

    function quotationRowProcessIsLocked(row) {
        const current = (row.custom_process || row.process || "").toString().trim().toUpperCase();
        if (!current) return false;
        const locked = [
            "NON WOVEN BOPP LAMINATED SHEET",
            "NON WOVEN BOPP LAMINATED SLITTED FABRIC",
            "NON WOVEN LAMINATED SHEET",
            "NON WOVEN LAMINATED PRINTED SHEET",
            "NON WOVEN PRINTED SHEET",
            "NON WOVEN PLAIN SHEET",
            "PRINTED BOPP",
            "PLAIN BOX BAG",
            "211 - D CUT PLAIN",
            "D CUT PLAIN",
            "PLAIN LAMINATED BOX BAG",
            "PLAIN LAMINATED SHOPPER BAG",
            "CUSTOM PRINTED BOPP BOX BAG",
            "CUSTOM PRINTED BOPP SHOPPER BAG",
            "COLORED BOPP BOX BAG",
            "COLORED BOPP SHOPPER BAG",
            "COLORED BOPP SCREEN PRINTED BOX BAG",
            "COLORED BOPP SCREEN PRINTED SHOPPER BAG",
            "FLEXO PRINTED BOX BAG",
            "FLEXO PRINTED SHOPPER BAG",
            "PRE-FLEXO PRINTED BOX BAG",
            "PRE-FLEXO PRINTED SHOPPER BAG",
            "CUSTOM FLEXO PRINTED BOX BAG",
            "CUSTOM FLEXO PRINTED SHOPPER BAG",
            "PRE-FLEXO PRINTED LAMINATED BOX BAG",
            "PRE-FLEXO PRINTED LAMINATED SHOPPER BAG",
            "CUSTOM FLEXO PRINTED LAMINATED BOX BAG",
            "CUSTOM FLEXO PRINTED LAMINATED SHOPPER BAG",
        ];
        return locked.indexOf(current) >= 0;
    }

    function restrictQuotationItemLaminationSideOptions(frm, options) {
        if (!frm || typeof frm.set_df_property !== "function") return;
        options = options || getQuotationLaminationSideOptions(frm);
        try {
            frm.set_df_property(
                "custom_lamination_side",
                "options",
                options,
                "Quotation Item",
                "items"
            );
            frm.set_df_property("custom_lamination_side", "read_only", 0, "Quotation Item", "items");
            frm.set_df_property("custom_lamination_side", "read_only_depends_on", "", "Quotation Item", "items");
        } catch (e) { /* ignore */ }

        const tf = frm.fields_dict && frm.fields_dict.items;
        const grid = tf && tf.grid;
        const patchOptions = (df) => {
            if (df && df.fieldname === "custom_lamination_side") {
                df.options = options;
                patchEditableQuotationItemDf(df);
            }
        };
        try {
            if (tf && tf.df && Array.isArray(tf.df.fields)) tf.df.fields.forEach(patchOptions);
            if (grid && Array.isArray(grid.docfields)) grid.docfields.forEach(patchOptions);
            if (typeof frappe.meta.get_docfields === "function") {
                const metaFields = frappe.meta.get_docfields("Quotation Item", frm.docname);
                if (Array.isArray(metaFields)) metaFields.forEach(patchOptions);
            }
        } catch (e2) { /* ignore */ }
    }

    function forceEditableQuotationItemLaminationFields(frm) {
        if (!frm) return;
        const tf = frm.fields_dict && frm.fields_dict.items;
        const grid = tf && tf.grid;
        const patchEditable = (df) => {
            patchEditableQuotationItemDf(df);
        };

        QUOTATION_ITEM_FORCE_EDITABLE_FIELDS.forEach(fieldname => {
            try {
                frm.set_df_property(fieldname, "read_only", 0, "Quotation Item", "items");
                frm.set_df_property(fieldname, "read_only_depends_on", "", "Quotation Item", "items");
            } catch (e) { /* ignore */ }
            try {
                if (grid && typeof grid.update_docfield_property === "function") {
                    grid.update_docfield_property(fieldname, "read_only", 0);
                    grid.update_docfield_property(fieldname, "read_only_depends_on", "");
                }
            } catch (eg) { /* ignore */ }
        });

        try {
            if (tf && tf.df && Array.isArray(tf.df.fields)) tf.df.fields.forEach(patchEditable);
            if (grid && Array.isArray(grid.docfields)) grid.docfields.forEach(patchEditable);
            if (typeof frappe.meta.get_docfields === "function") {
                const metaFields = frappe.meta.get_docfields("Quotation Item", frm.docname);
                if (Array.isArray(metaFields)) metaFields.forEach(patchEditable);
            }
            let copyFields = frappe.meta.docfield_copy && frappe.meta.docfield_copy["Quotation Item"];
            if (copyFields && !Array.isArray(copyFields) && typeof copyFields === "object") {
                copyFields = Object.values(copyFields);
            }
            if (Array.isArray(copyFields)) copyFields.forEach(patchEditable);
        } catch (e2) { /* ignore */ }

        try {
            if (grid && Array.isArray(grid.grid_rows)) {
                grid.grid_rows.forEach(grid_row => unlockQuotationItemLaminationGridRow(frm, grid_row));
            }
        } catch (e4) { /* ignore */ }
    }

    function isLaminationEditableRow(frm, row) {
        const rowProcess = ((row && (row.custom_process || row.process)) || "").toString().toLowerCase();
        const parentProcess = ((frm && frm.doc && (frm.doc.custom_process || frm.doc.process)) || "").toString().toLowerCase();
        const laminationType = ((frm && frm.doc && frm.doc.custom_type_of_lamination) || "").toString().toLowerCase();
        const p = rowProcess || parentProcess;
        if (p.includes("laminat") || p.includes("bopp laminated sheet") || p.includes("bopp laminated slitt")) {
            return true;
        }
        if (laminationType.includes("bopp") && (parentProcess.includes("sheet") || parentProcess.includes("cutting"))) {
            return true;
        }
        if (p.includes("box bag") || p.includes("shopper bag") || p.includes("print") || p.includes("flexo")) {
            return true;
        }
        return false;
    }

    function unlockQuotationItemLaminationGridRow(frm, grid_row) {
        if (!grid_row || !grid_row.grid || !grid_row.grid.df || grid_row.grid.df.fieldname !== "items") return;
        const row = grid_row.doc || {};
        if (!isLaminationEditableRow(frm, row)) return;
        const laminationOptions = getQuotationLaminationSideOptions(frm);

        QUOTATION_ITEM_FORCE_EDITABLE_FIELDS.forEach(fieldname => {
            try {
                if (typeof grid_row.toggle_editable === "function") {
                    grid_row.toggle_editable(fieldname, true);
                }
            } catch (e0) { /* ignore */ }

            try {
                if (grid_row.columns && grid_row.columns[fieldname]) {
                    const col = grid_row.columns[fieldname];
                    if (col.df) patchEditableQuotationItemDf(col.df);
                    if (fieldname === "custom_lamination_side" && col.df) col.df.options = laminationOptions;
                    if (col.field && col.field.df) {
                        patchEditableQuotationItemDf(col.field.df);
                        if (fieldname === "custom_lamination_side") col.field.df.options = laminationOptions;
                        if (col.field.$input && typeof col.field.$input.prop === "function") {
                            col.field.$input.prop("disabled", false);
                            col.field.$input.prop("readonly", false);
                            col.field.$input.removeAttr("disabled");
                            col.field.$input.removeAttr("readonly");
                        }
                        if (col.field.$wrapper && typeof col.field.$wrapper.removeClass === "function") {
                            col.field.$wrapper.removeClass("disabled read-only");
                        }
                        if (typeof col.field.refresh === "function") col.field.refresh();
                    }
                }
            } catch (e1) { /* ignore */ }

            try {
                if (grid_row.grid_form && grid_row.grid_form.fields_dict && grid_row.grid_form.fields_dict[fieldname]) {
                    const field = grid_row.grid_form.fields_dict[fieldname];
                    patchEditableQuotationItemDf(field.df);
                    if (fieldname === "custom_lamination_side") field.df.options = laminationOptions;
                    if (field.$input && typeof field.$input.prop === "function") {
                        field.$input.prop("disabled", false);
                        field.$input.prop("readonly", false);
                        field.$input.removeAttr("disabled");
                        field.$input.removeAttr("readonly");
                    }
                    if (field.$wrapper && typeof field.$wrapper.removeClass === "function") {
                        field.$wrapper.removeClass("disabled read-only");
                    }
                    if (typeof field.refresh === "function") field.refresh();
                }
            } catch (e2) { /* ignore */ }

            try {
                if (grid_row.row && typeof grid_row.row.find === "function") {
                    const $cell = grid_row.row.find('[data-fieldname="' + fieldname + '"]');
                    $cell.removeClass("disabled read-only");
                    $cell.find("input,select,textarea").prop("disabled", false).prop("readonly", false).removeAttr("disabled").removeAttr("readonly");
                }
            } catch (e2b) { /* ignore */ }

            try {
                if (typeof grid_row.refresh_field === "function") {
                    grid_row.refresh_field(fieldname);
                }
            } catch (e3) { /* ignore */ }
        });
    }

    function bindQuotationItemLaminationGridUnlock(frm) {
        if (!frm || !frm.wrapper || typeof $ === "undefined") return;
        try {
            $(frm.wrapper)
                .off("grid-row-render.qn_lamination_editable")
                .on("grid-row-render.qn_lamination_editable", function (_e, grid_row) {
                    unlockQuotationItemLaminationGridRow(frm, grid_row);
                });
        } catch (e) { /* ignore */ }
    }

    function toggle_customer_specific_fields(frm) {
        try {
            if (!frm || !frm.doc) return;
            const custVal = (String(frm.doc.customer || "") + " | " + String(frm.doc.customer_name || "") + " | " + String(frm.doc.party_name || "")).toUpperCase();
            const isTargetCustomer = custVal.includes("EXP-0071");

            // Check if fields actually exist in parent or child metadata safely
            const parentFields = (frm.meta && Array.isArray(frm.meta.fields) ? frm.meta.fields : []).map(f => f.fieldname).filter(Boolean);

            let childFields = [];
            if (frm.fields_dict && frm.fields_dict.items && frm.fields_dict.items.grid && Array.isArray(frm.fields_dict.items.grid.docfields)) {
                childFields = frm.fields_dict.items.grid.docfields.map(f => f.fieldname).filter(Boolean);
            }

            // Toggle on parent if they exist there
            if (parentFields.includes("custom_purchase_no")) {
                frm.toggle_display("custom_purchase_no", isTargetCustomer);
            }
            if (parentFields.includes("custom_purchase_quality_name")) {
                frm.toggle_display("custom_purchase_quality_name", isTargetCustomer);
            }

            // Toggle on child table grid fields if they exist there
            const grid = frm.fields_dict && frm.fields_dict.items && frm.fields_dict.items.grid;
            if (grid) {
                if (typeof grid.toggle_display === "function") {
                    if (childFields.includes("custom_purchase_no")) {
                        grid.toggle_display("custom_purchase_no", isTargetCustomer);
                    }
                    if (childFields.includes("custom_purchase_quality_name")) {
                        grid.toggle_display("custom_purchase_quality_name", isTargetCustomer);
                    }
                }
            }

            // Force grid to re-evaluate column visibility if the grid utility is loaded
            if (frappe.quotation_grid_visibility && typeof frappe.quotation_grid_visibility.applyItemsGrid === "function") {
                frappe.quotation_grid_visibility.applyItemsGrid(frm);
            }
        } catch (err) {
            /* ignore */
        }
    }

    // ==========================================================
    // QUOTATION FORM - customer change & refresh triggers
    // ==========================================================
    frappe.ui.form.on("Quotation", {
        setup: function (frm) {
            suppressQuotationItemPriceMessages();
            bindQuotationItemLaminationGridUnlock(frm);
            // Register the query exactly once on setup. It will run dynamically whenever the user clicks the Quality dropdown.
            frm.set_query("custom_quality", "items", function (doc, cdt, cdn) {
                const customerName = (doc.customer_name || doc.party_name || doc.customer || "").toLowerCase();
                let matchedQualities = null;

                for (const [keyword, qualities] of Object.entries(CUSTOMER_QUALITY_MAP)) {
                    if (customerName.includes(keyword)) {
                        matchedQualities = qualities;
                        break;
                    }
                }

                if (matchedQualities) {
                    return {
                        filters: {
                            name: ["in", matchedQualities]
                        }
                    };
                } else {
                    // No special customer matched - hide ALL special qualities in the map
                    const allSpecialQualities = [];
                    Object.values(CUSTOMER_QUALITY_MAP).forEach(list => {
                        allSpecialQualities.push(...list);
                    });
                    return {
                        filters: {
                            name: ["not in", allSpecialQualities]
                        }
                    };
                }
            });

            // Filter LH Process to only allow the 3 valid processes
            frm.set_query("custom_lh_process", "items", function () {
                return {
                    filters: {
                        name: ["in", [
                            "NON WOVEN METTALIC BOPP LAMINATED SLITTED FABRIC",
                            "NON WOVEN BOPP LAMINATED SLITTED FABRIC",
                            "NON WOVEN FABRIC"
                        ]]
                    }
                };
            });
        },

        refresh: function (frm) {

            suppressQuotationItemPriceMessages();
            clearQuotationItemPriceDialogs();
            bindQuotationItemLaminationGridUnlock(frm);
            scheduleItemTaxTemplateSync(frm);
            applyCompanyWarehouse(frm);
            applyCompanySalesTaxesTemplate(frm);
            restrictQuotationItemLaminationSideOptions(frm);
            forceEditableQuotationItemLaminationFields(frm);
            toggleBagMakingFields(frm);
            restoreFlexoDesignColourFromDescription(frm);
            applyPlainBoxBagDesignDefaultsToRows(frm);
            // Apply field visibility (e.g. Type of Printing) based on current process value
            frm.events._apply_child_process_from_parent(frm);

            // Show/hide customer-specific fields
            toggle_customer_specific_fields(frm);
        },

        before_save: function (frm) {
            suppressQuotationItemPriceMessages();
            frm._quotation_show_creation_success_after_save = hasQuotationGeneratedItemRows(frm);
            sanitizePlainBoxBagDesignDefaultsBeforeSave(frm);
            stashFlexoDesignColourOnItems(frm);
        },

        after_save: function (frm) {
            suppressQuotationItemPriceMessages();
            showQuotationCreationSuccessAfterSave(frm);
        },

        _apply_child_process_from_parent: function (frm) {
            let selected_parent_process = (frm.doc.custom_process || "").toLowerCase();
            let parent_process = (selected_parent_process || frm.doc.process || "").toLowerCase();
            let parent_side = (frm.doc.custom_lamination_side || "").toLowerCase();
            let type_of_printing = (frm.doc.custom_type_of_printing || "").toLowerCase();
            let lamination_type = (frm.doc.custom_type_of_lamination || "").toLowerCase();
            let is_bopp = lamination_type.includes("bopp") || parent_process.includes("bopp") || parent_side.includes("bopp") || parent_process.includes("mettalic roto") || parent_process.includes("metallic roto");

            let is_bopp_lam_slit = is_bopp && parent_process.includes("laminat") && (parent_process.includes("slitted") || parent_process.includes("slitting"));
            let is_bopp_lam_sheet = is_bopp && (parent_process.includes("sheet") || parent_process.includes("cutting")) && (parent_process.includes("laminat") || lamination_type.length > 0);
            let is_lam_print_sheet = parent_process.includes("laminat") && parent_process.includes("printed") && parent_process.includes("sheet");
            let is_lam_print = !is_lam_print_sheet && parent_process.includes("laminat") && parent_process.includes("printed");
            let is_lam_slit = !is_bopp && parent_process.includes("laminat") && (parent_process.includes("slitted") || parent_process.includes("slitting"));
            let is_lam_sheet = !is_bopp && !is_lam_print_sheet && (parent_process.includes("sheet") || parent_process.includes("cutting")) && (parent_process.includes("laminat") || lamination_type.includes("plain"));
            let is_printed_sheet = !is_lam_print_sheet && parent_process.includes("sheet") && (parent_process.includes("print") || type_of_printing.includes("flexo"));
            let has_parent_process = !!(selected_parent_process.trim() || parent_process.trim());
            let lamination_side_options = getQuotationLaminationSideOptions(frm);
            let is_bopp_lam_sheet_cutting = is_bopp && (
                parent_process.includes("sheet cutting")
                || (parent_process.includes("sheet") && parent_process.includes("cutting"))
            );
            if (is_bopp_lam_sheet_cutting) {
                is_bopp_lam_sheet = true;
                is_bopp_lam_slit = false;
            } else {
                is_bopp_lam_slit = is_bopp_lam_slit || (lamination_side_options.includes("Single Side Lamination") && !is_bopp_lam_sheet);
            }
            restrictQuotationItemLaminationSideOptions(frm, lamination_side_options);
            forceEditableQuotationItemLaminationFields(frm);

            // Show/hide custom_type_of_printing based on parent process
            let is_printing = parent_process.includes("printing");
            frm.set_df_property("custom_type_of_printing", "hidden", is_printing ? 0 : 1);
            frm.refresh_field("custom_type_of_printing");

            if (frm.fields_dict.custom_lamination_side && frm.fields_dict.custom_lamination_side.df) {
                if (frm._qn_original_lamination_side_options === undefined) {
                    frm._qn_original_lamination_side_options = frm.fields_dict.custom_lamination_side.df.options || "";
                }
                if (is_bopp || is_bopp_lam_slit || is_bopp_lam_sheet) {
                    frm.set_df_property("custom_lamination_side", "options", lamination_side_options);
                    if (parent_side && !parent_side.includes("single") && !parent_side.includes("double")) {
                        frm.set_value("custom_lamination_side", "");
                    }
                } else if (is_lam_print || is_lam_print_sheet || is_lam_slit || is_lam_sheet) {
                    frm.set_df_property("custom_lamination_side", "options", "Inner Lamination\nOuter Lamination");
                    if (parent_side && !parent_side.includes("inner") && !parent_side.includes("outer")) {
                        frm.set_value("custom_lamination_side", "");
                    }
                } else {
                    frm.set_df_property("custom_lamination_side", "options", frm._qn_original_lamination_side_options);
                }
                frm.refresh_field("custom_lamination_side");
            }

            // Show design fields only for BOPP Lamination or Printing processes
            let is_bopp_lam = is_bopp && parent_process.includes("laminat");
            let has_printed_child = (frm.doc.items || []).some(row => {
                const p = (row.custom_process || row.process || "").toUpperCase();
                return p.includes("PRINTED") || p.includes("COLORED BOPP") || p.includes("METALLIC") || p.includes("COOLER");
            });
            let show_design_fields = is_bopp_lam || is_printing || is_lam_print || is_lam_print_sheet || is_bopp_lam_slit || is_bopp_lam_sheet || is_printed_sheet || has_printed_child;

            // If quotation_grid_visibility.js is disabled, keep the Items grid fully visible.
            if (frappe.quotation_grid_visibility && typeof frappe.quotation_grid_visibility.applyItemsGrid === "function") {
                frappe.quotation_grid_visibility.applyItemsGrid(frm, { show_design_fields });
            } else {
                showAllQuotationItemGridColumns(frm);
                setTimeout(() => showAllQuotationItemGridColumns(frm), 350);
                setTimeout(() => showAllQuotationItemGridColumns(frm), 900);
            }

            let target_process = deriveChildProcessFromParent(frm);

            if (has_parent_process && target_process) {
                (frm.doc.items || []).forEach(row => {
                    if (quotationRowProcessIsLocked(row) && !shouldForceDCutChildProcess(row, target_process)) {
                        return;
                    }
                    if (row.item_code === "CUSTOM-FABRIC" || !row.item_code) {
                        if (row.custom_process !== target_process) {
                            frappe.model.set_value(row.doctype, row.name, "custom_process", target_process);
                        }
                        setTimeout(() => applyBagRowDesignDefaults(frm, row.doctype, row.name), 80);
                    }
                });
            }
            setTimeout(() => forceEditableQuotationItemLaminationFields(frm), 250);
        },

        custom_process: function (frm) {
            toggleBagMakingFields(frm);
            frm.events._apply_child_process_from_parent(frm);
        },

        process: function (frm) {
            toggleBagMakingFields(frm);
            frm.events._apply_child_process_from_parent(frm);
        },

        custom_type_of_bag: function (frm) {
            toggleBagMakingFields(frm);
            frm.events._apply_child_process_from_parent(frm);
            applyPlainBoxBagDesignDefaultsToRows(frm);
        },

        custom_type_of_printing: function (frm) {
            frm.events._apply_child_process_from_parent(frm);
        },

        custom_lamination_side: function (frm) {
            frm.events._apply_child_process_from_parent(frm);
        },

        custom_type_of_lamination: function (frm) {
            frm.events._apply_child_process_from_parent(frm);
        },

        company: function (frm) {
            clearItemTaxTemplateCacheForCompany(frm.doc.company);
            scheduleItemTaxTemplateSync(frm);
            applyCompanyWarehouse(frm);
            applyCompanySalesTaxesTemplate(frm);
        },

        taxes_and_charges: function (frm) {
            scheduleItemTaxTemplateSync(frm);
        },

        // New item row: set company default 5% template immediately (no manual pick).
        items_add: function (frm, cdt, cdn) {
            restrictQuotationItemLaminationSideOptions(frm);
            forceEditableQuotationItemLaminationFields(frm);
            resolveCompanyItemTaxTemplate(frm.doc.company).then(tpl => {
                if (tpl) {
                    frappe.model.set_value(cdt, cdn, "item_tax_template", tpl);
                }
            });

            let target_process = deriveChildProcessFromParent(frm);
            if (!target_process && frm.doc.items && frm.doc.items.length > 0) {
                for (let i = frm.doc.items.length - 1; i >= 0; i--) {
                    const r = frm.doc.items[i];
                    const rp = (r && r.name !== cdn) ? ((r.custom_process || r.process || "").toString().trim()) : "";
                    if (rp) {
                        target_process = rp;
                        break;
                    }
                }
            }
            if (!target_process && frm.doc.items && frm.doc.items.length > 0) {
                // If we already have PB-* items, we are in Printed BOPP context.
                const hasPB = (frm.doc.items || []).some(r => r && r.name !== cdn && String(r.item_code || "").toUpperCase().startsWith("PB-"));
                if (hasPB) target_process = "PRINTED BOPP";
            }
            const newRow = locals[cdt] && locals[cdt][cdn];
            if (target_process && !(newRow && quotationRowProcessIsLocked(newRow))) {
                frappe.model.set_value(cdt, cdn, "custom_process", target_process);
                // Some sites use `process` column; keep it aligned so new-row UI doesn't fall back to "NON WOVEN FABRIC".
                if (locals[cdt] && locals[cdt][cdn] && ("process" in locals[cdt][cdn])) {
                    frappe.model.set_value(cdt, cdn, "process", target_process);
                }
                [150, 450, 950, 1500].forEach(function (ms) {
                    setTimeout(function () {
                        const row = locals[cdt] && locals[cdt][cdn];
                        if (row) {
                            if (row.custom_process !== target_process) {
                                frappe.model.set_value(cdt, cdn, "custom_process", target_process);
                            }
                            if (("process" in row) && row.process !== target_process) {
                                frappe.model.set_value(cdt, cdn, "process", target_process);
                            }
                        }
                    }, ms);
                });
            }
            setTimeout(() => applyBagRowDesignDefaults(frm, cdt, cdn), 100);
            setTimeout(() => applyBagRowDesignDefaults(frm, cdt, cdn), 500);

            scheduleItemTaxTemplateSync(frm);
            if (frappe.quotation_grid_visibility) {
                setTimeout(() => frappe.quotation_grid_visibility.applyItemsGrid(frm), 100);
            }
        },

        customer: function (frm) {
            // Just show an alert if it matches
            const customerName = (frm.doc.customer_name || frm.doc.party_name || frm.doc.customer || "").toLowerCase();
            for (const [keyword, qualities] of Object.entries(CUSTOMER_QUALITY_MAP)) {
                if (customerName.includes(keyword)) {
                    frappe.show_alert({
                        message: `Quality automatically filtered for <b>${frm.doc.customer_name || frm.doc.customer}</b>`,
                        indicator: "green"
                    }, 4);
                    break;
                }
            }
            toggle_customer_specific_fields(frm);
        },

        place_of_supply: function (frm) {
            applyCompanySalesTaxesTemplate(frm);
            scheduleItemTaxTemplateSync(frm);
        },

        customer_address: function (frm) {
            // place_of_supply often updates after address is set
            setTimeout(() => {
                applyCompanySalesTaxesTemplate(frm);
                scheduleItemTaxTemplateSync(frm);
            }, 300);
        },
        // When a template is selected, automatically set unique due_dates to avoid save errors
        payment_terms_template: function (frm) {
            if (frm.doc.payment_terms_template) {
                setTimeout(() => {
                    (frm.doc.payment_schedule || []).forEach((row, idx) => {
                        // If due_date is same as quotation date, push it forward and ensure uniqueness with idx offset
                        if (!row.due_date || row.due_date === frm.doc.transaction_date) {
                            const baseDate = frm.doc.valid_till || frappe.datetime.add_days(frm.doc.transaction_date, 30);
                            const targetDate = frappe.datetime.add_days(baseDate, idx); // Add index to ensure unique dates
                            frappe.model.set_value(row.doctype, row.name, "due_date", targetDate);
                        }
                    });
                }, 1000);
            }
        }
    });
    // Closing IIFE moved to the end of the file to share lexical scopes of utility functions like forceEditableQuotationItemLaminationFields

    // Automatically handle new rows in Payment Schedule with uniqueness offset
    frappe.ui.form.on("Payment Schedule", {
        payment_schedule_add: function (frm, cdt, cdn) {
            const row = locals[cdt][cdn];
            if (!row.due_date) {
                const idx = (frm.doc.payment_schedule || []).length - 1;
                const baseDate = frm.doc.valid_till || frappe.datetime.add_days(frm.doc.transaction_date, 30);
                const targetDate = frappe.datetime.add_days(baseDate, idx);
                frappe.model.set_value(cdt, cdn, "due_date", targetDate);
            }
        }
    });

    // ---- Helper: snap mm to nearest 5 ----
    function snapMM(mm) {
        return Math.round(mm / 5) * 5;
    }

    // ---- Shared state (safe even if Frappe evaluates client scripts more than once) ----
    frappe.quotation_client_state = frappe.quotation_client_state || {};
    frappe.quotation_client_state.widthSyncing = frappe.quotation_client_state.widthSyncing || false;
    frappe.quotation_client_state.lastCalculatedPreview = frappe.quotation_client_state.lastCalculatedPreview || "";

    function getQuotationClientState() {
        frappe.quotation_client_state = frappe.quotation_client_state || {};
        return frappe.quotation_client_state;
    }

    function isPlainSheetProcess(row) {
        const p = (row.custom_process || row.process || "").trim().toUpperCase();
        return p.includes("SHEET");
    }

    function parseGSMValue(val) {
        if (!val) return 0;
        let match = String(val).match(/\d+/);
        return match ? parseInt(match[0], 10) : 0;
    }

    function parseSafeFloat(val) {
        if (val === null || val === undefined) return 0;
        let str = String(val).replace(/,/g, "").trim();
        let parsed = parseFloat(str);
        return isNaN(parsed) ? 0 : parsed;
    }

    // ---- Show alert with item name preview ----
    function showPreviewAlert(frm, cdt, cdn, widthInch, widthMM) {
        const row = locals[cdt][cdn];
        let p = (row.custom_process || row.process || "NON WOVEN FABRIC").trim().toUpperCase();
        const gsm = row.custom_gsm;

        let is_bopp = (p === "NON WOVEN BOPP LAMINATED FABRIC" || p === "NON WOVEN BOPP LAMINATED");
        let is_flexo = (p === "NON WOVEN FLEXO PRINTED FABRIC" || p.includes("FLEXO"));
        let is_printed_bopp = (p === "PRINTED BOPP");
        let is_lam_print = (p === "NON WOVEN LAMINATED PRINTED FABRIC");
        let is_lam_print_sheet = (p === "NON WOVEN LAMINATED PRINTED SHEET");
        let is_lam_slit = (p === "NON WOVEN LAMINATED SLITTED FABRIC");
        let is_bopp_lam_slit = (p === "NON WOVEN BOPP LAMINATED SLITTED FABRIC");
        let is_bopp_lam_sheet = (p === "NON WOVEN BOPP LAMINATED SHEET");
        let is_printed_sheet = (p === "NON WOVEN PRINTED SHEET");
        let is_lam_sheet = (p === "NON WOVEN LAMINATED SHEET");
        let is_custom_printed_bopp_box_bag = p === "CUSTOM PRINTED BOPP BOX BAG" || p.includes("CUSTOM PRINTED BOPP BOX BAG") || p === "COLORED BOPP BOX BAG" || p.includes("COLORED BOPP BOX BAG") || p === "COLORED BOPP SCREEN PRINTED BOX BAG" || p.includes("COLORED BOPP SCREEN PRINTED BOX BAG");
        let is_metallic_bopp_box_bag = p === "METALLIC BOPP BOX BAG" || p.includes("METALLIC BOPP BOX BAG") || p === "METALLIC BOPP SHOPPER BAG" || p.includes("METALLIC BOPP SHOPPER BAG");
        let is_cooler_bopp_box_bag = p === "COOLER BOPP BOX BAG" || p.includes("COOLER BOPP BOX BAG") || p === "COOLER BOPP SHOPPER BAG" || p.includes("COOLER BOPP SHOPPER BAG");

        let is_plain_laminated_box_bag = p === "PLAIN LAMINATED BOX BAG" || p.includes("PLAIN LAMINATED BOX BAG") || p === "PLAIN LAMINATED SHOPPER BAG" || p.includes("PLAIN LAMINATED SHOPPER BAG") ||
            ((p.includes("PLAIN BOX BAG") || p.includes("PLAIN SHOPPER BAG")) && !!String(row.custom_lamination_gsm || "").trim());
        let is_flexo_printed_box_bag = (p.includes("PRE-FLEXO PRINTED") || p.includes("CUSTOM FLEXO PRINTED")) && isBoxBagProcess(row);
        let is_d_cut_plain_bag = isDCutBagProcess(row);
        let is_plain_box_bag = (p.includes("PLAIN BOX BAG") || p.includes("PLAIN SHOPPER BAG")) && !is_plain_laminated_box_bag && !is_d_cut_plain_bag;
        let is_rewinded = (p === "NON WOVEN REWINDED FABRIC" || p.includes("REWIND"));

        let q = (row.custom_quality_abbr || row.custom_quality || "").trim().toUpperCase();
        let c = (row.custom_colour || "").trim().toUpperCase();
        if (c === "WHITE") c = "BRIGHT WHITE";

        // Guard: skip preview if required fields are missing for the process
        if (is_lam_print) {
            if (!row.custom_design_code || !row.custom_design_name) return;
        } else if (is_lam_print_sheet) {
            if (!(row.custom_design_code || row.custom_design_code) || !(row.custom_design_name || row.custom_design_name) || !row.custom_size_code || !row.custom_lamination_gsm || !q || !c || !gsm) return;
        } else if (is_bopp_lam_slit) {
            if (!(row.custom_design_code || row.custom_design_code) || !(row.custom_design_name || row.custom_design_name)) return;
        } else if (is_bopp_lam_sheet) {
            if (!(row.custom_design_code || row.custom_design_code) || !(row.custom_design_name || row.custom_design_name) || !row.custom_size_code || !row.custom_lamination_gsm || !row.custom_bopp_gsm || !q || !c || !gsm) return;
        } else if (is_printed_sheet) {
            if (!(row.custom_design_code || row.custom_design_code) || !(row.custom_design_name || row.custom_design_name) || !row.custom_size_code || !q || !c || !gsm) return;
        } else if (is_lam_sheet) {
            if (!row.custom_size_code || !row.custom_lamination_gsm || !q || !c || !gsm) return;
        } else if (is_d_cut_plain_bag) {
            if (!row.custom_bag_size || !q || !c || !gsm) return;
            if (!row.custom_width_mm || !row.custom_height_mm) return;
        } else if (is_plain_laminated_box_bag || is_flexo_printed_box_bag || is_plain_box_bag || is_custom_printed_bopp_box_bag || is_metallic_bopp_box_bag || is_cooler_bopp_box_bag) {
            if (!row.custom_bag_size || !q || !c || !gsm) return;
            if (!row.custom_width_mm || !row.custom_height_mm || !row.custom_gazette_mm) return;
        } else if (is_rewinded) {
            if (!q || !c || !gsm) return;
            const mpr = parseFloat(row.custom_meter_per_roll || row.meter_per_roll || row.custom_meter || row.meter_roll) || 0;
            const wpr = parseFloat(row.custom_weight_per_roll) || 0;
            if (!row.custom_core_size || mpr <= 0 || wpr <= 0) return;
        } else if (is_bopp || is_flexo || is_printed_bopp) {
            if (!(row.custom_design_code || row.custom_design_code) || !(row.custom_design_name || row.custom_design_name)) return;
        } else {
            if (!p || !q || !c || !gsm) return;
        }

        // --- Derive Display Colour (Remove trailing numbers like 1.0, 4.0, etc.) ---
        const cDisplay = c.replace(/\s*\d+(\.\d+)?\s*$/, '').trim();

        let previewName = "";
        if (is_lam_print) {
            let design_code = (row.custom_design_code || "").trim();
            let design_name = (row.custom_design_name || "").trim().toUpperCase();
            let lamNum = parseGSMValue(row.custom_lamination_gsm);
            let fabricGsm = parseFloat(row.custom_fabric_gsm) || ((parseFloat(gsm) || 0) - lamNum);
            previewName = `${design_code} - ${design_name} - NON WOVEN LAMINATED PRINTED FABRIC ${q} ${cDisplay} ${gsm} ( F - ${fabricGsm} L - ${lamNum} ) GSM W - ${widthInch}" ( ${widthMM} MM )`;
        } else if (is_lam_print_sheet) {
            let design_code = (row.custom_design_code || row.custom_design_code || "").trim();
            let design_name = (row.custom_design_name || row.custom_design_name || "").trim().toUpperCase();
            let lamNum = parseGSMValue(row.custom_lamination_gsm);
            let fabricGsm = parseFloat(row.custom_fabric_gsm) || ((parseFloat(gsm) || 0) - lamNum);
            let wIn = parseFloat(row.custom_width_inch) || 0;
            let hIn = parseFloat(row.custom_height_inches) || 0;
            let wMm = parseInt(row.custom_width_mm) || 0;
            let hMm = parseInt(row.custom_height_mm) || 0;
            let wStr = Number.isInteger(wIn) ? `${wIn}` : `${wIn}`;
            let hStr = Number.isInteger(hIn) ? `${hIn}` : `${hIn}`;
            previewName = `${design_code} - ${design_name} - NON WOVEN LAMINATED PRINTED SHEET ${q} ${cDisplay} ${gsm} ( F - ${fabricGsm} L - ${lamNum} ) GSM W ${wStr}" X H ${hStr}" ( ${wMm} MM X ${hMm} MM )`;
        } else if (is_bopp_lam_slit) {
            let design_code = (row.custom_design_code || row.custom_design_code || "").trim();
            let design_name = (row.custom_design_name || row.custom_design_name || "").trim().toUpperCase();
            let totalGsm = parseFloat(gsm) || 0;
            previewName = `${design_code} - ${design_name} - NON WOVEN BOPP LAMINATED SLITTED FABRIC ${totalGsm} GSM W - ${widthInch}" ( ${widthMM} MM )`;
        } else if (is_bopp_lam_sheet) {
            let design_code = (row.custom_design_code || row.custom_design_code || "").trim();
            let design_name = (row.custom_design_name || row.custom_design_name || "").trim().toUpperCase();
            let totalGsm = parseFloat(gsm) || 0;
            let wIn = parseFloat(row.custom_width_inch) || 0;
            let hIn = parseFloat(row.custom_height_inches) || 0;
            let wMm = parseInt(row.custom_width_mm) || 0;
            let hMm = parseInt(row.custom_height_mm) || 0;
            let wStr = Number.isInteger(wIn) ? `${wIn}` : `${wIn}`;
            let hStr = Number.isInteger(hIn) ? `${hIn}` : `${hIn}`;
            previewName = `${design_code} - ${design_name} - NON WOVEN BOPP LAMINATED SHEET ${totalGsm} GSM W ${wStr}" X H ${hStr}" ( ${wMm} MM X ${hMm} MM )`;
        } else if (is_lam_slit) {
            let lamNum = parseGSMValue(row.custom_lamination_gsm);
            let fabricGsm = parseFloat(row.custom_fabric_gsm) || ((parseFloat(gsm) || 0) - lamNum);
            previewName = `NON WOVEN LAMINATED SLITTED FABRIC ${q} ${cDisplay} ${gsm} ( F - ${fabricGsm} L - ${lamNum} ) GSM W - ${widthInch}" ( ${widthMM} MM )`;
        } else if (is_printed_sheet) {
            let design_code = (row.custom_design_code || row.custom_design_code || "").trim();
            let design_name = (row.custom_design_name || row.custom_design_name || "").trim().toUpperCase();
            let wIn = parseFloat(row.custom_width_inch) || 0;
            let hIn = parseFloat(row.custom_height_inches) || 0;
            let wMm = parseInt(row.custom_width_mm) || 0;
            let hMm = parseInt(row.custom_height_mm) || 0;
            let wStr = Number.isInteger(wIn) ? `${wIn}` : `${wIn}`;
            let hStr = Number.isInteger(hIn) ? `${hIn}` : `${hIn}`;
            previewName = `${design_code} - ${design_name} - NON WOVEN PRINTED SHEET ${q} ${cDisplay} ${gsm} GSM W ${wStr}" X H ${hStr}" ( ${wMm} MM X ${hMm} MM )`;
        } else if (is_lam_sheet) {
            let lamNum = parseGSMValue(row.custom_lamination_gsm);
            let fabricGsm = parseFloat(row.custom_fabric_gsm) || ((parseFloat(gsm) || 0) - lamNum);
            let wIn = parseFloat(row.custom_width_inch) || 0;
            let hIn = parseFloat(row.custom_height_inches) || 0;
            let wMm = parseInt(row.custom_width_mm) || 0;
            let hMm = parseInt(row.custom_height_mm) || 0;
            let wStr = Number.isInteger(wIn) ? `${wIn}` : `${wIn}`;
            let hStr = Number.isInteger(hIn) ? `${hIn}` : `${hIn}`;
            previewName = `NON WOVEN LAMINATED SHEET ${q} ${cDisplay} ${gsm} ( F - ${fabricGsm} L - ${lamNum} ) GSM W ${wStr}" X H ${hStr}" ( ${wMm} MM X ${hMm} MM )`;
        } else if (is_plain_laminated_box_bag) {
            const metrics = calculatePlainBoxBagMetrics(row);
            const wMm = parseInt(row.custom_width_mm) || 0;
            const hMm = parseInt(row.custom_height_mm) || 0;
            const gMm = parseInt(row.custom_gazette_mm) || 0;
            const wIn = parseFloat(row.custom_width_inch) || 0;
            const hIn = parseFloat(row.custom_height_inches) || 0;
            const gIn = parseFloat(row.custom_gazette_inch) || 0;
            const wStr = Number.isInteger(wIn) ? `${wIn}` : `${wIn}`;
            const hStr = Number.isInteger(hIn) ? `${hIn}` : `${hIn}`;
            const gStr = Number.isInteger(gIn) ? `${gIn}` : `${gIn}`;
            const designCode = (row.custom_design_code || "6000").trim();
            const designName = (row.custom_design_name || "PLAIN BOX BAG").trim().toUpperCase();
            let lamNum = parseGSMValue(row.custom_lamination_gsm);
            let fabricGsm = parseFloat(row.custom_fabric_gsm) || ((parseFloat(gsm) || 0) - lamNum);
            previewName = `${designCode} - ${designName} - NON WOVEN PLAIN LAMINATED SHOPPER BAG ${gsm} GSM, W ${wMm}MM H ${hMm}MM G ${gMm}MM ( ${wStr}" X ${hStr}" X ${gStr}" ) - PLAIN [Sheet ${metrics.sheetWidthMm}MM]`;
            const loopType = (row.custom_loop_handle_type || "").toUpperCase();
            if (loopType && loopType.includes("NON WOVEN") && !loopType.includes("BOPP")) {
                const lgsm = parseFloat(row.custom_loop_handle_gsm) || 0;
                const lwin = parseInt(row.custom_loop_handle_width_inches) || 0;
                if (lgsm > 0 && lwin > 0) {
                    const lmm = snapMM(lwin * 25.4);
                    const lmtr = Math.round((1000 / (lgsm * (lmm / 1000))) * 100) / 100;
                    previewName += ` | Loop fabric: ${lgsm} GSM W ${lwin}" (${lmm}MM), BOM 0.82 Mtr, ${lmtr} Mtr/Kg`;
                }
            }
        } else if (is_flexo_printed_box_bag) {
            const wMm = parseInt(row.custom_width_mm) || 0;
            const hMm = parseInt(row.custom_height_mm) || 0;
            const gMm = parseInt(row.custom_gazette_mm) || 0;
            const wIn = parseFloat(row.custom_width_inch) || 0;
            const hIn = parseFloat(row.custom_height_inches) || 0;
            const gIn = parseFloat(row.custom_gazette_inch) || 0;
            const wStr = Number.isInteger(wIn) ? `${wIn}` : `${wIn}`;
            const hStr = Number.isInteger(hIn) ? `${hIn}` : `${hIn}`;
            const gStr = Number.isInteger(gIn) ? `${gIn}` : `${gIn}`;
            const designCode = (row.custom_design_code || "6000").trim();
            const designName = (row.custom_design_name || "PLAIN BOX BAG").trim().toUpperCase();
            let bag_no_colors_raw = (row.custom_no_of_design_colour || row.custom_no_of_design_colours || "0").toString().trim();
            let bag_no_colors = /^\d+$/.test(bag_no_colors_raw) ? `${bag_no_colors_raw}C` : bag_no_colors_raw;
            const bagTypeName = p.includes("LAMINATED") ? "LAMINATED SHOPPER BAG" : "SHOPPER BAG";
            const finishingVal = (row.custom_finishing || "MATTE").trim().toUpperCase();

            previewName = `${designCode} - ${designName} - ${bag_no_colors} - NON WOVEN FLEXO PRINTED ${bagTypeName} ${gsm} GSM, W ${wMm}MM X H ${hMm}MM X G ${gMm}MM ( ${wStr}" X ${hStr}" X ${gStr}" ) - ${finishingVal}`;
            const loopType = (row.custom_loop_handle_type || "").toUpperCase();
            if (loopType && loopType.includes("NON WOVEN") && !loopType.includes("BOPP")) {
                const lq = (row.custom_loop_handle_quality || "").trim();
                const lc = (row.custom_loop_handle_colour || "").trim();
                const lgsm = parseFloat(row.custom_loop_handle_gsm) || 0;
                const lwin = parseInt(row.custom_loop_handle_width_inches) || 0;
                if (lq && lc && lgsm > 0 && lwin > 0) {
                    const lmm = snapMM(lwin * 25.4);
                    const lmtr = Math.round((1000 / (lgsm * (lmm / 1000))) * 100) / 100;
                    previewName += ` | Loop fabric: ${lgsm} GSM W ${lwin}" (${lmm}MM), BOM 0.82 Mtr, ${lmtr} Mtr/Kg`;
                }
            }
        } else if (is_d_cut_plain_bag) {
            const metrics = calculateDCutBagMetrics(row);
            const wMm = parseInt(row.custom_width_mm) || 0;
            const hMm = parseInt(row.custom_height_mm) || 0;
            const wIn = parseFloat(row.custom_width_inch) || 0;
            const hIn = parseFloat(row.custom_height_inches) || 0;
            const wStr = Number.isInteger(wIn) ? `${wIn}` : `${wIn}`;
            const hStr = Number.isInteger(hIn) ? `${hIn}` : `${hIn}`;
            const designCode = (row.custom_design_code || D_CUT_BAG_DESIGN.code).trim();
            const designName = (row.custom_design_name || D_CUT_BAG_DESIGN.name).trim().toUpperCase();
            previewName = `${designCode} - ${designName} - NON WOVEN PLAIN D-CUT BAG ${gsm} GSM, W ${wMm}MM X H ${hMm}MM ( ${wStr}" X ${hStr}" ) - PLAIN [Sheet ${metrics.sheetWidthMm}MM]`;
        } else if (is_plain_box_bag) {
            const metrics = calculatePlainBoxBagMetrics(row);
            const wMm = parseInt(row.custom_width_mm) || 0;
            const hMm = parseInt(row.custom_height_mm) || 0;
            const gMm = parseInt(row.custom_gazette_mm) || 0;
            const wIn = parseFloat(row.custom_width_inch) || 0;
            const hIn = parseFloat(row.custom_height_inches) || 0;
            const gIn = parseFloat(row.custom_gazette_inch) || 0;
            const wStr = Number.isInteger(wIn) ? `${wIn}` : `${wIn}`;
            const hStr = Number.isInteger(hIn) ? `${hIn}` : `${hIn}`;
            const gStr = Number.isInteger(gIn) ? `${gIn}` : `${gIn}`;
            const designCode = (row.custom_design_code || "6000").trim();
            const designName = (row.custom_design_name || "PLAIN BOX BAG").trim().toUpperCase();
            previewName = `${designCode} - ${designName} - NON WOVEN PLAIN SHOPPER BAG ${gsm} GSM, W ${wMm}MM H ${hMm}MM G ${gMm}MM ( ${wStr}" X ${hStr}" X ${gStr}" ) - PLAIN [Sheet ${metrics.sheetWidthMm}MM]`;
            const loopType = (row.custom_loop_handle_type || "").toUpperCase();
            if (loopType && loopType.includes("NON WOVEN") && !loopType.includes("BOPP")) {
                const lq = (row.custom_loop_handle_quality || "").trim();
                const lc = (row.custom_loop_handle_colour || "").trim();
                const lgsm = parseFloat(row.custom_loop_handle_gsm) || 0;
                const lwin = parseInt(row.custom_loop_handle_width_inches) || 0;
                if (lq && lc && lgsm > 0 && lwin > 0) {
                    const lmm = snapMM(lwin * 25.4);
                    const lmtr = Math.round((1000 / (lgsm * (lmm / 1000))) * 100) / 100;
                    previewName += ` | Loop fabric: ${lgsm} GSM W ${lwin}" (${lmm}MM), BOM 0.82 Mtr, ${lmtr} Mtr/Kg`;
                }
            }
        } else if (is_custom_printed_bopp_box_bag) {
            const wMm = parseInt(row.custom_width_mm) || 0;
            const hMm = parseInt(row.custom_height_mm) || 0;
            const gMm = parseInt(row.custom_gazette_mm) || 0;
            const wIn = parseFloat(row.custom_width_inch) || 0;
            const hIn = parseFloat(row.custom_height_inches) || 0;
            const gIn = parseFloat(row.custom_gazette_inch) || 0;
            const wStr = Number.isInteger(wIn) ? `${wIn}` : `${wIn}`;
            const hStr = Number.isInteger(hIn) ? `${hIn}` : `${hIn}`;
            const gStr = Number.isInteger(gIn) ? `${gIn}` : `${gIn}`;
            const designCode = (row.custom_design_code || "6000").trim();
            const designName = (row.custom_design_name || p).trim().toUpperCase();
            let bag_no_colors_raw = (row.custom_no_of_design_colour || row.custom_no_of_design_colours || "0").toString().trim();
            let bag_no_colors = /^\d+$/.test(bag_no_colors_raw) ? `${bag_no_colors_raw}C` : bag_no_colors_raw;
            let bopp_val = (row.custom_bopp_gsm || "").toString().trim();
            let lam_val = (row.custom_lamination_gsm || "").toString().trim();
            let bopp_num = parseFloat(bopp_val.split("-")[0].trim()) || 0;
            let lam_num = parseFloat(lam_val.split("-")[0].trim()) || 0;
            let f_gsm = parseFloat(row.custom_fabric_gsm) || 0;
            if (f_gsm <= 0) f_gsm = (parseFloat(gsm) || 0) - bopp_num - lam_num;
            let total_gsm = Math.round(f_gsm + bopp_num + lam_num);
            let finishingVal = (row.custom_finishing || "MATTE").trim().toUpperCase();
            let label = p.includes("SCREEN PRINTED") ? "DIGITAL + SCREEN PRINTED" : "DIGITAL PRINTED";
            previewName = `${designCode} - ${designName} - ${bag_no_colors} - NON WOVEN ${label} SHOPPER BAG ${total_gsm} GSM, W ${wMm}MM X H ${hMm}MM X G ${gMm}MM ( ${wStr}" X ${hStr}" X ${gStr}" ) - ${finishingVal}`;
            const loopType = (row.custom_loop_handle_type || "").toUpperCase();
            if (loopType && loopType.includes("NON WOVEN") && !loopType.includes("BOPP")) {
                const lq = (row.custom_loop_handle_quality || "").trim();
                const lc = (row.custom_loop_handle_colour || "").trim();
                const lgsm = parseFloat(row.custom_loop_handle_gsm) || 0;
                const lwin = parseInt(row.custom_loop_handle_width_inches) || 0;
                if (lq && lc && lgsm > 0 && lwin > 0) {
                    const lmm = snapMM(lwin * 25.4);
                    const lmtr = Math.round((1000 / (lgsm * (lmm / 1000))) * 100) / 100;
                    previewName += ` | Loop fabric: ${lgsm} GSM W ${lwin}" (${lmm}MM), BOM 0.82 Mtr, ${lmtr} Mtr/Kg`;
                }
            }
        } else if (is_metallic_bopp_box_bag || is_cooler_bopp_box_bag) {
            const wMm = parseInt(row.custom_width_mm) || 0;
            const hMm = parseInt(row.custom_height_mm) || 0;
            const gMm = parseInt(row.custom_gazette_mm) || 0;
            const wIn = parseFloat(row.custom_width_inch) || 0;
            const hIn = parseFloat(row.custom_height_inches) || 0;
            const gIn = parseFloat(row.custom_gazette_inch) || 0;
            const wStr = Number.isInteger(wIn) ? `${wIn}` : `${wIn}`;
            const hStr = Number.isInteger(hIn) ? `${hIn}` : `${hIn}`;
            const gStr = Number.isInteger(gIn) ? `${gIn}` : `${gIn}`;
            const designCode = (row.custom_design_code || "6000").trim();
            const designName = (row.custom_design_name || (p.includes("METALLIC") ? "METALLIC BOPP SHOPPER BAG" : "COOLER BOPP SHOPPER BAG")).trim().toUpperCase();
            let bag_no_colors_raw = (row.custom_no_of_design_colour || row.custom_no_of_design_colours || "0").toString().trim();
            let bag_no_colors = /^\d+$/.test(bag_no_colors_raw) ? `${bag_no_colors_raw}C` : bag_no_colors_raw;
            let bopp_val = (row.custom_bopp_gsm || "").toString().trim();
            let lam_val = (row.custom_lamination_gsm || "").toString().trim();
            let bopp_num = parseFloat(bopp_val.split("-")[0].trim()) || 0;
            let lam_num = parseFloat(lam_val.split("-")[0].trim()) || 0;
            let f_gsm = parseFloat(row.custom_fabric_gsm) || 0;
            if (f_gsm <= 0) f_gsm = (parseFloat(gsm) || 0) - bopp_num - lam_num;
            let total_gsm = Math.round(f_gsm + bopp_num + lam_num);
            let finishingVal = (row.custom_finishing || "MATTE").trim().toUpperCase();
            let label = p.includes("METALLIC") ? "METALLIC" : "COOLER";
            previewName = `${designCode} - ${designName} - ${bag_no_colors} - NON WOVEN DIGITAL PRINTED ${label} SHOPPER BAG ${total_gsm} GSM, W ${wMm}MM X H ${hMm}MM X G ${gMm}MM ( ${wStr}" X ${hStr}" X ${gStr}" ) - ${finishingVal}`;
            const loopType = (row.custom_loop_handle_type || "").toUpperCase();
            if (loopType && loopType.includes("NON WOVEN") && !loopType.includes("BOPP")) {
                const lq = (row.custom_loop_handle_quality || "").trim();
                const lc = (row.custom_loop_handle_colour || "").trim();
                const lgsm = parseFloat(row.custom_loop_handle_gsm) || 0;
                const lwin = parseInt(row.custom_loop_handle_width_inches) || 0;
                if (lq && lc && lgsm > 0 && lwin > 0) {
                    const lmm = snapMM(lwin * 25.4);
                    const lmtr = Math.round((1000 / (lgsm * (lmm / 1000))) * 100) / 100;
                    previewName += ` | Loop fabric: ${lgsm} GSM W ${lwin}" (${lmm}MM), BOM 0.82 Mtr, ${lmtr} Mtr/Kg`;
                }
            }
        } else if (p === "NON WOVEN LAMINATED FABRIC") {
            let lamVal = (row.custom_lamination_gsm || "").trim();
            let lamNum = 0;
            if (lamVal.includes("-")) {
                lamNum = parseInt(lamVal.split("-")[0].trim()) || 0;
            }
            let fGsm = parseInt(gsm) - lamNum;
            let totalGsm = parseInt(gsm) || 0;
            previewName = `${p} ${q} ${cDisplay} ${totalGsm} ( F ${fGsm} + L ${lamNum} ) GSM W - ${widthInch}'' ( ${widthMM} MM )`;
        } else if (is_bopp) {
            let design_code = (row.custom_design_code || "").trim();
            let design_name = (row.custom_design_name || "").trim().toUpperCase();
            previewName = `${design_code} - ${design_name} - NON WOVEN BOPP LAMINATED ${gsm} GSM W - ${widthInch}'' ( ${widthMM} MM )`;
        } else if (is_flexo) {
            let design_code = (row.custom_design_code || "").trim();
            let design_name = (row.custom_design_name || "").trim().toUpperCase();
            if (!q || !c || !gsm) return;
            previewName = `${design_code} - ${design_name} - NON WOVEN FLEXO PRINTED FABRIC ${q} ${cDisplay} ${gsm} GSM W - ${widthInch}'' ( ${widthMM} MM )`;
        } else if (is_printed_bopp) {
            let design_code = (row.custom_design_code || row.custom_design_code || "").trim();
            let design_name = (row.custom_design_name || row.custom_design_name || "").trim().toUpperCase();
            let bopp_gsm_raw = (row.custom_bopp_gsm || "0").toString().replace(/\D/g, "");
            let bopp_gsm = parseInt(bopp_gsm_raw) || 15;

            let color_count = 1;
            let c_design = (row.custom_design_colour || "").toString().trim();
            if (c_design) {
                if (/^\d+(\.\d+)?$/.test(c_design)) {
                    let parsed = parseInt(c_design);
                    if (!isNaN(parsed) && parsed > 0) {
                        color_count = parsed;
                    }
                } else {
                    let nl = String.fromCharCode(10);
                    let parts = c_design.replace(/&/g, nl).replace(/,/g, nl).split(nl);
                    let valid_parts = parts.filter(p => {
                        let cleaned = p.trim();
                        // strip leading numbers like "1. "
                        let i = 0;
                        while (i < cleaned.length && (cleaned[i] >= '0' && cleaned[i] <= '9' || cleaned[i] === '.' || cleaned[i] === ' ')) i++;
                        return cleaned.substring(i).trim().length > 0;
                    });
                    if (valid_parts.length > 0) color_count = valid_parts.length;
                }
            }

            previewName = `PRINTED BOPP - ${design_code} - ${design_name} - ${color_count}C - ${bopp_gsm}M - ${widthMM} MM`;
        } else {
            let is_rewinded = (p === "NON WOVEN REWINDED FABRIC" || p.includes("REWIND"));
            let is_sheet = (p === "NON WOVEN PLAIN SHEET" || p.includes("SHEET"));
            if (is_rewinded) {
                let mpr = parseFloat(row.custom_meter_per_roll || row.meter_per_roll || row.custom_meter || row.meter_roll) || 0;
                const wpr = parseFloat(row.custom_weight_per_roll) || 0;
                const coreLbl = (row.custom_core_size || "").trim();
                previewName = `NON WOVEN FABRIC ${q} ${cDisplay} ${gsm} GSM W - 63'' ( 1600 MM ) R - ${mpr} MTR`;
                if (coreLbl) previewName += ` CORE ${coreLbl}`;
                if (wpr > 0) previewName += ` [Wt/Roll ${wpr} Kg]`;
            } else if (is_sheet) {
                let wIn = parseFloat(row.custom_width_inch) || 0;
                let hIn = parseFloat(row.custom_height_inches) || 0;
                let wMm = parseInt(row.custom_width_mm) || 0;
                let hMm = parseInt(row.custom_height_mm) || 0;
                let wStr = Number.isInteger(wIn) ? `${wIn}` : `${wIn}`;
                let hStr = Number.isInteger(hIn) ? `${hIn}` : `${hIn}`;
                previewName = `NON WOVEN PLAIN SHEET ${q} ${cDisplay} ${gsm} GSM W ${wStr}" X H ${hStr}" ( ${wMm} MM X ${hMm} MM )`;
            } else {
                previewName = `${p} ${q} ${cDisplay} ${gsm} GSM W - ${widthInch}'' ( ${widthMM} MM )`;
            }
        }

        const fullMsg = `<b>Calculated:</b> ${previewName}`;
        const state = getQuotationClientState();
        if (fullMsg === state.lastCalculatedPreview) return;
        state.lastCalculatedPreview = fullMsg;
        setTimeout(function () {
            const currentState = getQuotationClientState();
            if (currentState.lastCalculatedPreview === fullMsg) currentState.lastCalculatedPreview = "";
        }, 1500);
        frappe.show_alert({ message: fullMsg, indicator: "blue" }, 6);
    }

    // ---- Fallback preview (for quality/color/gsm change - reads whichever width is set) ----
    function showWidthPreview(frm, cdt, cdn) {
        if (getQuotationClientState().widthSyncing) return;
        const row = locals[cdt][cdn];
        const is_custom = !row.item_code || row.item_code === "CUSTOM-FABRIC" || String(row.item_code).startsWith("PB-") || (row.custom_process || row.process);
        if (!is_custom) return;
        const widthMM = parseSafeFloat(row.custom_width_mm) || 0;
        const widthInch = parseSafeFloat(row.custom_width_inch) || 0;
        if (widthMM > 0 && widthInch > 0) {
            showPreviewAlert(frm, cdt, cdn, widthInch, widthMM);
        }
    }

    // ---- Calculate Exact Quantity ----
    let is_calculating = false;
    function calculateQty(frm, cdt, cdn, mode) {
        if (is_calculating) return;

        const row = locals[cdt][cdn];
        if (!row) return;

        const is_bag_making = isBagMakingParent(frm) || isDCutParent(frm);

        if (is_bag_making) {
            is_calculating = true;
            try {
                let qty = parseFloat(row.qty) || 0;
                let cut_length = parseFloat(row.custom_sheet_cut_length_mm) || 0;
                let current_mpr = parseFloat(row.custom_meter_per_roll) || 0;
                let current_rolls = parseFloat(row.custom_no_of_rolls) || 0;
                let total_meter = parseFloat(row.custom_meter) || 0;

                let final_mpr = current_mpr;
                let final_rolls = current_rolls;
                let final_qty = qty;

                if (mode === 'rolls' || mode === 'mpr') {
                    // Keep qty FIXED – only adjust meter/roll and number of rolls
                    final_qty = qty; // qty stays unchanged
                    total_meter = cut_length > 0 ? qty * (cut_length / 1000) : (final_rolls * final_mpr);
                    if (mode === 'rolls') {
                        final_rolls = Math.round(current_rolls);
                        if (final_rolls === 0) final_rolls = 1;
                        final_mpr = final_rolls > 0 ? total_meter / final_rolls : 0;
                    } else if (mode === 'mpr') {
                        if (final_mpr === 0) final_mpr = 1000;
                        final_rolls = final_mpr > 0 ? Math.round(total_meter / final_mpr) : 0;
                        if (final_rolls === 0) final_rolls = 1;
                        final_mpr = total_meter / final_rolls;
                    }
                } else if (mode === 'meter') {
                    total_meter = parseFloat(row.custom_meter) || 0;
                    if (cut_length > 0) {
                        final_qty = Math.round(total_meter / (cut_length / 1000));
                    } else {
                        final_qty = 0;
                    }
                    if (final_mpr === 0) {
                        const gsm = parseFloat(row.custom_gsm) || 0;
                        const width = parseFloat(row.custom_width_inch) || 0;
                        const MPR_DATA = [
                            { min: 10, max: 15, val_63: 1000, val_other: 4000 },
                            { min: 16, max: 22, val_63: 1000, val_other: 3000 },
                            { min: 25, max: 34, val_63: 750, val_other: 2500 },
                            { min: 35, max: 35, val_63: 1000, val_other: 2000 },
                            { min: 36, max: 45, val_63: 500, val_other: 1800 },
                            { min: 46, max: 55, val_63: 500, val_other: 1600 },
                            { min: 56, max: 60, val_63: 400, val_other: 1400 },
                            { min: 61, max: 65, val_63: 400, val_other: 1200 },
                            { min: 66, max: 70, val_63: 350, val_other: 1100 },
                            { min: 71, max: 80, val_63: 300, val_other: 1000 },
                            { min: 81, max: 90, val_63: 300, val_other: 950 },
                            { min: 91, max: 100, val_63: 250, val_other: 850 },
                            { min: 101, max: 110, val_63: 250, val_other: 750 },
                            { min: 111, max: 120, val_63: 200, val_other: 750 }
                        ];
                        for (let range of MPR_DATA) {
                            if (gsm >= range.min && gsm <= range.max) {
                                final_mpr = (Math.floor(width) === 63) ? range.val_63 : range.val_other;
                                break;
                            }
                        }
                        if (final_mpr === 0) final_mpr = 1000;
                    }
                    final_rolls = Math.round(total_meter / final_mpr);
                    if (final_rolls === 0) final_rolls = 1;
                    final_mpr = total_meter / final_rolls;
                } else {
                    // Mode is 'lookup', sheet length or qty change
                    total_meter = qty * (cut_length / 1000);
                    if (total_meter > 0) {
                        if (final_mpr === 0) {
                            const gsm = parseFloat(row.custom_gsm) || 0;
                            const width = parseFloat(row.custom_width_inch) || 0;
                            const MPR_DATA = [
                                { min: 10, max: 15, val_63: 1000, val_other: 4000 },
                                { min: 16, max: 22, val_63: 1000, val_other: 3000 },
                                { min: 25, max: 34, val_63: 750, val_other: 2500 },
                                { min: 35, max: 35, val_63: 1000, val_other: 2000 },
                                { min: 36, max: 45, val_63: 500, val_other: 1800 },
                                { min: 46, max: 55, val_63: 500, val_other: 1600 },
                                { min: 56, max: 60, val_63: 400, val_other: 1400 },
                                { min: 61, max: 65, val_63: 400, val_other: 1200 },
                                { min: 66, max: 70, val_63: 350, val_other: 1100 },
                                { min: 71, max: 80, val_63: 300, val_other: 1000 },
                                { min: 81, max: 90, val_63: 300, val_other: 950 },
                                { min: 91, max: 100, val_63: 250, val_other: 850 },
                                { min: 101, max: 110, val_63: 250, val_other: 750 },
                                { min: 111, max: 120, val_63: 200, val_other: 750 }
                            ];
                            for (let range of MPR_DATA) {
                                if (gsm >= range.min && gsm <= range.max) {
                                    final_mpr = (Math.floor(width) === 63) ? range.val_63 : range.val_other;
                                    break;
                                }
                            }
                            if (final_mpr === 0) final_mpr = 1000;
                        }
                        final_rolls = Math.round(total_meter / final_mpr);
                        if (final_rolls === 0) final_rolls = 1;
                        final_mpr = total_meter / final_rolls;
                    } else {
                        final_mpr = 0;
                        final_rolls = 0;
                    }
                }

                // Calculate Weight Per Roll
                const gsm = parseFloat(row.custom_gsm) || 0;
                const width = parseFloat(row.custom_width_inch) || 0;
                let weight_per_single_roll = 0;
                if (gsm && width && final_mpr) {
                    weight_per_single_roll = (gsm * width * final_mpr * 0.0254) / 1000;
                }

                // Update Row Fields safely
                if (parseFloat(row.custom_meter_per_roll) !== parseFloat(final_mpr.toFixed(2))) {
                    frappe.model.set_value(cdt, cdn, "custom_meter_per_roll", parseFloat(final_mpr.toFixed(2)));
                }
                let target_weight = parseFloat(weight_per_single_roll.toFixed(3));
                if (parseFloat(row.custom_weight_per_roll) !== target_weight) {
                    frappe.model.set_value(cdt, cdn, "custom_weight_per_roll", target_weight);
                }
                if (parseFloat(row.custom_no_of_rolls) !== final_rolls) {
                    frappe.model.set_value(cdt, cdn, "custom_no_of_rolls", final_rolls);
                }
                let target_meter = parseFloat(total_meter.toFixed(2));
                if (parseFloat(row.custom_meter) !== target_meter) {
                    frappe.model.set_value(cdt, cdn, "custom_meter", target_meter);
                }
                if (parseFloat(row.qty) !== final_qty) {
                    frappe.model.set_value(cdt, cdn, "qty", final_qty);
                }
                if (isBagSheetProcess(row)) {
                    if (row.custom_no_of_sheets_pcs !== undefined && row.custom_no_of_sheets_pcs !== "" && row.custom_no_of_sheets_pcs !== null) {
                        frappe.model.set_value(cdt, cdn, "custom_no_of_sheets_pcs", "");
                    }
                }
            } finally {
                setTimeout(() => { is_calculating = false; }, 500);
            }
        } else {
            // Normal Fabric Calculation
            is_calculating = true;
            try {
                const gsm = parseFloat(row.custom_gsm) || 0;
                const width = parseFloat(row.custom_width_inch) || 0;
                const current_mpr = parseFloat(row.custom_meter_per_roll) || 0;
                const current_meter = parseFloat(row.custom_meter) || 0;
                const target_qty = parseFloat(row.qty) || 0;
                const current_rolls = parseFloat(row.custom_no_of_rolls) || 0;

                const MPR_DATA = [
                    { min: 10, max: 15, val_63: 1000, val_other: 4000 },
                    { min: 16, max: 22, val_63: 1000, val_other: 3000 },
                    { min: 25, max: 34, val_63: 750, val_other: 2500 },
                    { min: 35, max: 35, val_63: 1000, val_other: 2000 },
                    { min: 36, max: 45, val_63: 500, val_other: 1800 },
                    { min: 46, max: 55, val_63: 500, val_other: 1600 },
                    { min: 56, max: 60, val_63: 400, val_other: 1400 },
                    { min: 61, max: 65, val_63: 400, val_other: 1200 },
                    { min: 66, max: 70, val_63: 350, val_other: 1100 },
                    { min: 71, max: 80, val_63: 300, val_other: 1000 },
                    { min: 81, max: 90, val_63: 300, val_other: 950 },
                    { min: 91, max: 100, val_63: 250, val_other: 850 },
                    { min: 101, max: 110, val_63: 250, val_other: 750 },
                    { min: 111, max: 120, val_63: 200, val_other: 750 }
                ];

                let final_mpr = current_mpr;
                if (mode === 'lookup' || final_mpr === 0) {
                    for (let range of MPR_DATA) {
                        if (gsm >= range.min && gsm <= range.max) {
                            final_mpr = (Math.floor(width) === 63) ? range.val_63 : range.val_other;
                            break;
                        }
                    }
                }

                if (final_mpr > 0) {
                    let weight_per_single_roll = (gsm * width * final_mpr * 0.0254) / 1000;
                    let final_rolls = current_rolls;

                    if (mode === 'lookup' || mode === 'qty') {
                        final_rolls = Math.round(target_qty / weight_per_single_roll);
                    } else if (mode === 'meter') {
                        final_rolls = Math.round(current_meter / final_mpr);
                    } else {
                        final_rolls = Math.round(current_rolls);
                    }

                    let total_meter = final_rolls * final_mpr;
                    let final_total_qty = Math.round(final_rolls * weight_per_single_roll);

                    if (parseFloat(row.custom_meter_per_roll) !== parseFloat(final_mpr.toFixed(2))) {
                        frappe.model.set_value(cdt, cdn, "custom_meter_per_roll", parseFloat(final_mpr.toFixed(2)));
                    }
                    let target_weight = parseFloat(weight_per_single_roll.toFixed(3));
                    if (parseFloat(row.custom_weight_per_roll) !== target_weight) {
                        frappe.model.set_value(cdt, cdn, "custom_weight_per_roll", target_weight);
                    }
                    if (parseFloat(row.custom_no_of_rolls) !== final_rolls) {
                        frappe.model.set_value(cdt, cdn, "custom_no_of_rolls", final_rolls);
                    }
                    let target_meter = parseFloat(total_meter.toFixed(2));
                    if (parseFloat(row.custom_meter) !== target_meter) {
                        frappe.model.set_value(cdt, cdn, "custom_meter", target_meter);
                    }
                    if (parseFloat(row.qty) !== final_total_qty) {
                        frappe.model.set_value(cdt, cdn, "qty", final_total_qty);
                    }
                }
            } finally {
                setTimeout(() => { is_calculating = false; }, 500);
            }
        }
    }

    // ---- Calculate Fabric GSM for BOPP Laminated Fabric ----
    // Writes directly to locals[] (synchronous) - does NOT fire triggers, no async race possible.
    function calculateFabricGSM(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        let p = (row.custom_process || row.process || "").trim().toUpperCase();

        if (p === "NON WOVEN BOPP LAMINATED FABRIC" || p === "NON WOVEN BOPP LAMINATED") {
            let total_gsm = parseFloat(row.custom_gsm) || 0;
            if (total_gsm <= 0) return;

            // Apply defaults synchronously if missing
            if (!row.custom_lamination_gsm) row.custom_lamination_gsm = "15 - C";
            if (!row.custom_bopp_gsm) row.custom_bopp_gsm = "15 - C";

            let lam_num = parseGSMValue(row.custom_lamination_gsm);
            let bopp_num = parseGSMValue(row.custom_bopp_gsm);

            let fabric_gsm = total_gsm - lam_num - bopp_num;
            if (fabric_gsm < 0) fabric_gsm = 0;

            // Write directly - no trigger fired, no async race
            row.custom_fabric_gsm = fabric_gsm;
            frm.refresh_field("items");
        } else if (p === "NON WOVEN BOPP LAMINATED SLITTED FABRIC" || p === "NON WOVEN BOPP LAMINATED SHEET" || p.includes("CUSTOM PRINTED BOPP") || p.includes("COLORED BOPP") || p.includes("METALLIC BOPP") || p.includes("COOLER BOPP") || p.includes("BOPP ROTO") || p.includes("BOPP-ROTO") || p.includes("METTALIC ROTO") || p.includes("METALLIC ROTO") || p.includes("METTALIC-ROTO") || p.includes("METALLIC-ROTO")) {
            let total_gsm = parseFloat(row.custom_gsm) || 0;
            if (total_gsm <= 0) return;

            if (!row.custom_lamination_gsm) row.custom_lamination_gsm = "15 - C";
            if (!row.custom_bopp_gsm) {
                row.custom_bopp_gsm = (p.includes("METALLIC BOPP") || p.includes("COOLER BOPP") || p.includes("METTALIC ROTO") || p.includes("METALLIC ROTO") || p.includes("METTALIC-ROTO") || p.includes("METALLIC-ROTO")) ? "30 - D" : "15 - C";
            }
            if (p.includes("METTALIC ROTO") || p.includes("METALLIC ROTO") || p.includes("METTALIC-ROTO") || p.includes("METALLIC-ROTO")) {
                if (!row.custom_coating) row.custom_coating = "Mettalic";
            }
            let lam_num = parseGSMValue(row.custom_lamination_gsm);
            let bopp_num = parseGSMValue(row.custom_bopp_gsm);
            let fabric_gsm = total_gsm - lam_num - bopp_num;
            if (fabric_gsm < 0) fabric_gsm = 0;

            row.custom_fabric_gsm = fabric_gsm;
            frm.refresh_field("items");
        } else if (isDCutBagProcess(row) || p.includes("D CUT PRINTED FLEXO") || p === "PLAIN BOX BAG" || p === "PLAIN SHOPPER BAG" || (isBoxBagProcess(row) && !p.includes("LAMINATED") && !p.includes("BOPP")) || isPlainWCutBagProcess(row) || ((p.includes("PRINTED W CUT") || p.includes("PRINTED W-CUT")) && !p.includes("LAMINATED"))) {
            let total_gsm = parseFloat(row.custom_gsm) || 0;
            if (total_gsm <= 0) return;
            row.custom_fabric_gsm = total_gsm;
            frm.refresh_field("items");
        } else if (p === "NON WOVEN LAMINATED PRINTED FABRIC" || p === "NON WOVEN LAMINATED PRINTED SHEET" || p === "NON WOVEN LAMINATED SLITTED FABRIC" || p === "NON WOVEN LAMINATED SHEET" || p === "PLAIN LAMINATED BOX BAG" || p === "PLAIN LAMINATED SHOPPER BAG" || p.includes("PRE-FLEXO PRINTED LAMINATED") || p.includes("CUSTOM FLEXO PRINTED LAMINATED") || p.includes("FLEXO PRINTED LAMINATED") || p.includes("LAMINATED W CUT") || p.includes("LAMINATED W-CUT") || p.includes("LAMINATED PRINTED W CUT") || p.includes("LAMINATED PRINTED W-CUT") || p.includes("D CUT LAMINATED")) {
            if (!row.custom_lamination_gsm) row.custom_lamination_gsm = "10 - A";
            if (!row.custom_lamination_side) row.custom_lamination_side = "Outer Lamination";

            let total_gsm = parseFloat(row.custom_gsm) || 0;
            if (total_gsm <= 0) {
                frm.refresh_field("items");
                return;
            }

            let lam_num = parseGSMValue(row.custom_lamination_gsm);
            let fabric_gsm = total_gsm - lam_num;
            if (fabric_gsm < 0) fabric_gsm = 0;

            row.custom_fabric_gsm = fabric_gsm;
            frm.refresh_field("items");
        }
    }

    // ---- Calculate Total GSM from Fabric/BOPP/Lamination GSM for BOPP Laminated Fabric ----
    // Writes directly to locals[] (synchronous) - does NOT fire triggers, no async race possible.
    function calculateTotalGSM(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        let p = (row.custom_process || row.process || "").trim().toUpperCase();

        if (p === "NON WOVEN BOPP LAMINATED FABRIC" || p === "NON WOVEN BOPP LAMINATED") {
            // Apply defaults synchronously if missing
            if (!row.custom_lamination_gsm) row.custom_lamination_gsm = "15 - C";
            if (!row.custom_bopp_gsm) row.custom_bopp_gsm = "15 - C";

            let fabric = parseFloat(row.custom_fabric_gsm) || 0;
            let lam_num = parseGSMValue(row.custom_lamination_gsm);
            let bopp_num = parseGSMValue(row.custom_bopp_gsm);

            let total_gsm = fabric + lam_num + bopp_num;
            if (total_gsm <= 0) return;

            // Write directly - no trigger fired, no async race
            row.custom_gsm = total_gsm;
            frm.refresh_field("items");
        } else if (p === "NON WOVEN BOPP LAMINATED SLITTED FABRIC" || p === "NON WOVEN BOPP LAMINATED SHEET" || p.includes("CUSTOM PRINTED BOPP") || p.includes("COLORED BOPP") || p.includes("METALLIC BOPP") || p.includes("COOLER BOPP") || p.includes("BOPP ROTO") || p.includes("BOPP-ROTO") || p.includes("METTALIC ROTO") || p.includes("METALLIC ROTO") || p.includes("METTALIC-ROTO") || p.includes("METALLIC-ROTO")) {
            if (!row.custom_lamination_gsm) row.custom_lamination_gsm = "15 - C";
            if (!row.custom_bopp_gsm) {
                row.custom_bopp_gsm = (p.includes("METALLIC BOPP") || p.includes("COOLER BOPP") || p.includes("METTALIC ROTO") || p.includes("METALLIC ROTO") || p.includes("METTALIC-ROTO") || p.includes("METALLIC-ROTO")) ? "30 - D" : "15 - C";
            }
            if (p.includes("METTALIC ROTO") || p.includes("METALLIC ROTO") || p.includes("METTALIC-ROTO") || p.includes("METALLIC-ROTO")) {
                if (!row.custom_coating) row.custom_coating = "Mettalic";
            }
            let fabric = parseFloat(row.custom_fabric_gsm) || 0;
            if (fabric <= 0) return;
            let lam_num = parseGSMValue(row.custom_lamination_gsm);
            let bopp_num = parseGSMValue(row.custom_bopp_gsm);
            let total_gsm = fabric + lam_num + bopp_num;
            if (total_gsm <= 0) return;

            row.custom_gsm = total_gsm;
            frm.refresh_field("items");
        } else if (isDCutBagProcess(row) || p.includes("D CUT PRINTED FLEXO") || p === "PLAIN BOX BAG" || p === "PLAIN SHOPPER BAG" || (isBoxBagProcess(row) && !p.includes("LAMINATED") && !p.includes("BOPP")) || isPlainWCutBagProcess(row) || ((p.includes("PRINTED W CUT") || p.includes("PRINTED W-CUT")) && !p.includes("LAMINATED"))) {
            let fabric = parseFloat(row.custom_fabric_gsm) || 0;
            if (fabric <= 0) return;
            row.custom_gsm = fabric;
            frm.refresh_field("items");
        } else if (p === "NON WOVEN LAMINATED PRINTED FABRIC" || p === "NON WOVEN LAMINATED PRINTED SHEET" || p === "NON WOVEN LAMINATED SLITTED FABRIC" || p === "NON WOVEN LAMINATED FABRIC" || p === "NON WOVEN LAMINATED SHEET" || p === "PLAIN LAMINATED BOX BAG" || p === "PLAIN LAMINATED SHOPPER BAG" || p.includes("PRE-FLEXO PRINTED LAMINATED") || p.includes("CUSTOM FLEXO PRINTED LAMINATED") || p.includes("FLEXO PRINTED LAMINATED") || p.includes("LAMINATED W CUT") || p.includes("LAMINATED W-CUT") || p.includes("LAMINATED PRINTED W CUT") || p.includes("LAMINATED PRINTED W-CUT") || p.includes("D CUT LAMINATED")) {
            if (!row.custom_lamination_gsm) row.custom_lamination_gsm = "10 - A";
            if (!row.custom_lamination_side) row.custom_lamination_side = "Outer Lamination";

            let fabric = parseFloat(row.custom_fabric_gsm) || 0;
            if (fabric <= 0) {
                frm.refresh_field("items");
                return;
            }
            let lam_num = parseGSMValue(row.custom_lamination_gsm);
            let total_gsm = fabric + lam_num;
            if (total_gsm <= 0) return;

            row.custom_gsm = total_gsm;
            frm.refresh_field("items");
        } else if (p === "PRINTED BOPP" || p.includes("PRINTED BOPP") || p.includes("BOPP PRINT")) {
            let bopp_num = parseGSMValue(row.custom_bopp_gsm);
            if (bopp_num > 0) {
                row.custom_gsm = bopp_num;
                frm.refresh_field("items");
            }
        }
    }

    // ==========================================================
    // ATTACH TRIGGERS TO QUOTATION ITEM CHILD TABLE
    // ==========================================================
    frappe.ui.form.on("Quotation Item", {

        form_render: function (frm, cdt, cdn) {
            const row = locals[cdt] && locals[cdt][cdn];
            if (!isLaminationEditableRow(frm, row)) return;
            forceEditableQuotationItemLaminationFields(frm);
        },

        // ? When item_code is set to CUSTOM-FABRIC ?- force qty = 0 (or real qty)
        // setTimeout is required because ERPNext fetches item defaults AFTER this trigger fires
        // and would overwrite our 0 - so we delay by 600ms to run after ERPNext's own updates
        item_code: function (frm, cdt, cdn) {
            const row = locals[cdt][cdn];
            resolveCompanyItemTaxTemplateForRow(frm, row).then(tpl => {
                if (tpl && row.item_tax_template !== tpl) {
                    frappe.model.set_value(cdt, cdn, "item_tax_template", tpl);
                }
            });
            scheduleItemTaxTemplateSync(frm);
            // Ensure company-correct warehouse is set immediately (resolved from DB).
            resolveFinishedGoodsWarehouse(frm.doc.company).then(wh => {
                if (wh && row.warehouse !== wh) {
                    frappe.model.set_value(cdt, cdn, "warehouse", wh);
                }
            });
            // Ensure HSN is set immediately based on GSM slab.
            const hsn = getHSNFromGSM(row.custom_gsm, row);
            if (hsn) {
                // Different ERPN sites use either gst_hsn_code or hsn_sac on the row.
                frappe.model.set_value(cdt, cdn, "gst_hsn_code", hsn).catch(() => { });
                frappe.model.set_value(cdt, cdn, "hsn_sac", hsn).catch(() => { });
            }

            const is_16_digit = row.item_code && !!row.item_code.match(/^(\d{16})/);
            if (!is_16_digit && row.item_code) {
                let target_process = "";
                const item_code_upper = String(row.item_code || "").toUpperCase();
                if (item_code_upper.startsWith("PB-")) {
                    target_process = "PRINTED BOPP";
                } else {
                    target_process = deriveChildProcessFromParent(frm);
                    if (!target_process && frm.doc.items && frm.doc.items.length > 0) {
                        for (let i = frm.doc.items.length - 1; i >= 0; i--) {
                            const r = frm.doc.items[i];
                            if (r && r.name !== cdn) {
                                const rp = (r.custom_process || r.process || "").toString().trim();
                                if (rp) {
                                    target_process = rp;
                                    break;
                                }
                            }
                        }
                    }
                }

                if (target_process && (!quotationRowProcessIsLocked(row) || shouldForceDCutChildProcess(row, target_process))) {
                    frappe.model.set_value(cdt, cdn, "custom_process", target_process);
                    if (target_process.includes("D CUT PLAIN")) {
                        setTimeout(() => applyDCutBagDesignDefaults(frm, cdt, cdn), 50);
                    }
                    if (locals[cdt] && locals[cdt][cdn] && ("process" in locals[cdt][cdn])) {
                        frappe.model.set_value(cdt, cdn, "process", target_process);
                    }
                    [350, 750, 1500].forEach(function (ms) {
                        setTimeout(function () {
                            const r = locals[cdt] && locals[cdt][cdn];
                            if (r) {
                                if (r.custom_process !== target_process) {
                                    frappe.model.set_value(cdt, cdn, "custom_process", target_process);
                                }
                                if (("process" in r) && r.process !== target_process) {
                                    frappe.model.set_value(cdt, cdn, "process", target_process);
                                }
                            }
                        }, ms);
                    });
                }

                if (row.item_code === "CUSTOM-FABRIC") {
                    setTimeout(function () {
                        const currentQty = parseFloat(row.qty) || 0;
                        if (currentQty === 0) {
                            frappe.model.set_value(cdt, cdn, "qty", 0);
                        }
                    }, 600);
                    [650, 1400, 2500].forEach(function (ms) {
                        setTimeout(function () {
                            resolveCompanyItemTaxTemplate(frm.doc.company).then(function (tpl) {
                                if (tpl) {
                                    frappe.model.set_value(cdt, cdn, "item_tax_template", tpl);
                                }
                            });
                        }, ms);
                    });
                }
            } else if (row.item_code) {
                const match = row.item_code.match(/^(\d{16})/);
                if (match) {
                    // It's a generated 16-digit item code (Process 3 + Quality 3 + Colour 3 + GSM 3 + Width 4)
                    const codeString = match[1];
                    const pCode = codeString.substring(0, 3);
                    const qCode = codeString.substring(3, 6);
                    const cCode = codeString.substring(6, 9);
                    const gsm = parseInt(codeString.substring(9, 12), 10);
                    const mm = parseInt(codeString.substring(12, 16), 10);

                    // Fetch names based on the embedded codes
                    if ((row.custom_process || "").trim() !== pCode) {
                        frappe.db.get_value("Process Master", { "process_code": pCode }, "process_name")
                            .then(r => {
                                if (r && r.message && r.message.process_name !== row.custom_process)
                                    frappe.model.set_value(cdt, cdn, "custom_process", r.message.process_name);
                            }).catch(() => { });
                    }

                    if ((row.custom_quality || "").trim() !== qCode) {
                        frappe.db.get_value("Quality Master", { "quality_code": qCode }, ["quality_name", "quality_abbr"])
                            .then(r => {
                                if (r && r.message) {
                                    if (r.message.quality_name !== row.custom_quality)
                                        frappe.model.set_value(cdt, cdn, "custom_quality", r.message.quality_name);
                                    if (r.message.quality_abbr)
                                        frappe.model.set_value(cdt, cdn, "custom_quality_abbr", r.message.quality_abbr);
                                }
                            }).catch(() => { });
                    }

                    if ((row.custom_colour || "").trim() !== cCode) {
                        frappe.db.get_value("Colour Master", { "colour_code": cCode }, "colour_name")
                            .then(r => {
                                // Only update if it doesn't already loosely match (to avoid wiping "White" -> "Bright White" loops on partial type)
                                if (r && r.message && r.message.colour_name !== row.custom_colour)
                                    frappe.model.set_value(cdt, cdn, "custom_colour", r.message.colour_name);
                            }).catch(() => { });
                    }

                    if (row.custom_gsm !== gsm) frappe.model.set_value(cdt, cdn, "custom_gsm", gsm);
                    if (row.custom_width_mm !== mm) frappe.model.set_value(cdt, cdn, "custom_width_mm", mm);

                    const existingInch = parseFloat(row.custom_width_inch) || 0;
                    let targetInch = parseFloat((mm / 25.4).toFixed(1));

                    if (existingInch > 0 && snapMM(existingInch * 25.4) === mm) {
                        targetInch = existingInch;
                    }

                    if (row.custom_width_inch !== targetInch) frappe.model.set_value(cdt, cdn, "custom_width_inch", targetInch);

                    const targetCm = parseFloat((mm / 10).toFixed(2));
                    if (row.custom_width_cm !== targetCm) frappe.model.set_value(cdt, cdn, "custom_width_cm", targetCm);

                    // Recalculate quantity once decoded
                    setTimeout(() => calculateQty(frm, cdt, cdn, 'lookup'), 600);
                }
            }
        },

        // --? Width (Inch) changed ?- derive MM & CM ------------------------------?
        custom_width_inch: function (frm, cdt, cdn) {
            calculateQty(frm, cdt, cdn, 'lookup');
            const state = getQuotationClientState();
            if (state.widthSyncing) return;
            const row = locals[cdt][cdn];
            const inchRaw = parseSafeFloat(row.custom_width_inch) || 0;
            if (isBagSheetProcess(row)) {
                if (inchRaw > 0) {
                    const widthMM = snapMM(inchRaw * 25.4);
                    const widthCM = parseFloat((widthMM / 10).toFixed(2));
                    state.widthSyncing = true;
                    Promise.all([
                        frappe.model.set_value(cdt, cdn, "custom_width_mm", widthMM),
                        frappe.model.set_value(cdt, cdn, "custom_width_cm", widthCM)
                    ]).finally(() => {
                        getQuotationClientState().widthSyncing = false;
                        const r2 = locals[cdt][cdn];
                        if (r2 && isBagSheetProcess(r2)) delete r2._plain_box_sheet_manual;
                        applyBagSheetCalculations(frm, cdt, cdn);
                    });
                }
                return;
            }
            const is_custom = !row.item_code || row.item_code === "CUSTOM-FABRIC" || String(row.item_code).startsWith("PB-") || (row.custom_process || row.process);
            if (inchRaw <= 0 || !is_custom) return;
            // Plain sheet: width/height come from Sheet Cutting Series (exact inch+mm) — do not derive mm from inch.
            if (isPlainSheetProcess(row)) return;

            const widthMM = snapMM(inchRaw * 25.4);
            const widthInch = parseFloat(inchRaw.toFixed(1));
            const widthCM = parseFloat((widthMM / 10).toFixed(2));

            state.widthSyncing = true;
            Promise.all([
                frappe.model.set_value(cdt, cdn, "custom_width_mm", widthMM),
                frappe.model.set_value(cdt, cdn, "custom_width_cm", widthCM)
            ]).finally(() => {
                getQuotationClientState().widthSyncing = false;
                showPreviewAlert(frm, cdt, cdn, widthInch, widthMM);
            });
        },

        // --? Width (MM) changed ?- derive Inch & CM -----------------------------?
        custom_width_mm: function (frm, cdt, cdn) {
            try {
                const state = getQuotationClientState();
                if (state.widthSyncing) return;
                const row = locals[cdt][cdn];
                if (row && isBagSheetProcess(row)) delete row._plain_box_sheet_manual;
                const mmRaw = parseSafeFloat(row.custom_width_mm) || 0;
                const is_custom = !row.item_code || row.item_code === "CUSTOM-FABRIC" || String(row.item_code).startsWith("PB-") || (row.custom_process || row.process);

                if (mmRaw <= 0 || !is_custom) return;
                if (isBagSheetProcess(row)) {
                    if (row._bag_series_dims_applied) {
                        delete row._bag_series_dims_applied;
                        applyBagSheetCalculations(frm, cdt, cdn);
                        return;
                    }
                    const widthMM = snapMM(mmRaw);
                    const widthInch = parseFloat((widthMM / 25.4).toFixed(1));
                    const widthCM = parseFloat((widthMM / 10).toFixed(2));
                    state.widthSyncing = true;
                    Promise.all([
                        frappe.model.set_value(cdt, cdn, "custom_width_inch", widthInch),
                        frappe.model.set_value(cdt, cdn, "custom_width_cm", widthCM)
                    ]).finally(() => {
                        getQuotationClientState().widthSyncing = false;
                        const r2 = locals[cdt][cdn];
                        if (r2 && isBagSheetProcess(r2)) delete r2._plain_box_sheet_manual;
                        applyBagSheetCalculations(frm, cdt, cdn);
                    });
                    return;
                }
                if (isPlainSheetProcess(row)) {
                    calculateQty(frm, cdt, cdn, 'lookup');
                    return;
                }

                const widthMM = snapMM(mmRaw);
                const widthInch = parseFloat((widthMM / 25.4).toFixed(1));
                const widthCM = parseFloat((widthMM / 10).toFixed(2));

                state.widthSyncing = true;
                Promise.all([
                    frappe.model.set_value(cdt, cdn, "custom_width_inch", widthInch),
                    frappe.model.set_value(cdt, cdn, "custom_width_cm", widthCM)
                ]).finally(() => {
                    getQuotationClientState().widthSyncing = false;
                    showPreviewAlert(frm, cdt, cdn, widthInch, widthMM);
                    calculateQty(frm, cdt, cdn, 'lookup');
                });
            } catch (err) {
                frappe.msgprint("Error in custom_width_mm: " + err.toString());
            }
        },

        // --? Width (CM) changed ?- derive Inch & MM -----------------------------?
        custom_width_cm: function (frm, cdt, cdn) {
            const state = getQuotationClientState();
            if (state.widthSyncing) return;
            const row = locals[cdt][cdn];
            const cmRaw = parseSafeFloat(row.custom_width_cm) || 0;
            const is_custom = !row.item_code || row.item_code === "CUSTOM-FABRIC" || String(row.item_code).startsWith("PB-") || (row.custom_process || row.process);
            if (cmRaw <= 0 || !is_custom) return;
            if (isBagSheetProcess(row)) {
                const widthMM = snapMM(cmRaw * 10);
                const widthInch = parseFloat((cmRaw * 0.3937).toFixed(1));
                state.widthSyncing = true;
                Promise.all([
                    frappe.model.set_value(cdt, cdn, "custom_width_mm", widthMM),
                    frappe.model.set_value(cdt, cdn, "custom_width_inch", widthInch)
                ]).finally(() => {
                    getQuotationClientState().widthSyncing = false;
                    const r2 = locals[cdt][cdn];
                    if (r2 && isBagSheetProcess(r2)) delete r2._plain_box_sheet_manual;
                    applyBagSheetCalculations(frm, cdt, cdn);
                });
                return;
            }
            if (isPlainSheetProcess(row)) {
                calculateQty(frm, cdt, cdn, 'lookup');
                return;
            }

            const widthMM = snapMM(cmRaw * 10);
            const widthInch = parseFloat((cmRaw * 0.3937).toFixed(1));
            const widthCM = parseFloat((widthMM / 10).toFixed(2));   // from snapped mm

            state.widthSyncing = true;
            Promise.all([
                frappe.model.set_value(cdt, cdn, "custom_width_mm", widthMM),
                frappe.model.set_value(cdt, cdn, "custom_width_inch", widthInch)
            ]).finally(() => {
                getQuotationClientState().widthSyncing = false;
                showPreviewAlert(frm, cdt, cdn, widthInch, widthMM);
                calculateQty(frm, cdt, cdn, 'lookup');
            });
        },

        // Also re-run preview when Process / Quality / Colour / GSM changes
        custom_process: function (frm, cdt, cdn) {
            const row = locals[cdt] && locals[cdt][cdn];
            applyBagRowDesignDefaults(frm, cdt, cdn);
            if (row && isDCutBagProcess(row)) {
                const dn = (row.custom_design_name || "").toUpperCase();
                if (!dn || dn.includes("PLAIN BOX BAG") || dn === "PLAIN D-CUT BAG") {
                    frappe.model.set_value(cdt, cdn, "custom_design_name", D_CUT_BAG_DESIGN.name).catch(() => { });
                }
                const dc = String(row.custom_design_code || "").trim();
                if (!dc || dc === "6000") {
                    frappe.model.set_value(cdt, cdn, "custom_design_code", D_CUT_BAG_DESIGN.code).catch(() => { });
                }
            }
            applyBagSheetCalculations(frm, cdt, cdn);
            // Auto-set coating and BOPP GSM based on process type (write directly to locals to avoid Select validation on client)
            const _row = locals[cdt] && locals[cdt][cdn];
            if (_row) {
                const _p = (_row.custom_process || "").trim().toUpperCase();
                if (_p.includes("METALLIC BOPP")) {
                    _row.custom_coating = "Mettalic";
                    _row.custom_bopp_gsm = "30 - D";
                    frm.refresh_field("items");
                } else if (_p.includes("COOLER BOPP")) {
                    _row.custom_coating = "Cooler";
                    _row.custom_bopp_gsm = "30 - D";
                    frm.refresh_field("items");
                }
            }
            showWidthPreview(frm, cdt, cdn);
            calculateFabricGSM(frm, cdt, cdn);
            forceEditableQuotationItemLaminationFields(frm);
            if (frappe.quotation_grid_visibility) {
                frappe.quotation_grid_visibility.applyItemsGrid(frm);
            }
            setTimeout(() => forceEditableQuotationItemLaminationFields(frm), 300);
            // Re-apply correct tax template when process changes (5% vs 18% for bags)
            if (row) {
                resolveCompanyItemTaxTemplateForRow(frm, row).then(tpl => {
                    if (tpl && row.item_tax_template !== tpl) {
                        frappe.model.set_value(cdt, cdn, "item_tax_template", tpl);
                    }
                });
            }
            scheduleItemTaxTemplateSync(frm);
        },
        custom_lh_design_code: function (frm, cdt, cdn) {
            const row = locals[cdt][cdn];
            if (row && row.custom_lh_design_code) {
                fetchLhDesignFieldsFromMaster(frm, cdt, cdn, { includeColour: true });
            }
        },
        custom_lh_design_name: function (frm, cdt, cdn) {
            const row = locals[cdt] && locals[cdt][cdn];
            if (row && row.custom_lh_design_name && !row.custom_lh_design_code) {
                fetchLhDesignFieldsFromMaster(frm, cdt, cdn, { includeColour: true, forceName: true });
            }
        },
        custom_loop_handle_gsm: function (frm, cdt, cdn) {
            const row = locals[cdt][cdn];
            if (row && row.custom_lh_process === "NON WOVEN BOPP LAMINATED SLITTED FABRIC") {
                let total = parseFloat(row.custom_loop_handle_gsm) || 0;
                if (total > 0) {
                    let lam_opt = "15";
                    let bopp_opt = "15";
                    let fab_opt = String(total - 30);
                    
                    let df_lam = frappe.meta.get_docfield("Quotation Item", "custom_lh_lamination_gsm", frm.doc.name);
                    if (df_lam && df_lam.options) {
                        for (let o of df_lam.options.split("\n")) { if (parseGSMValue(o) === 15) { lam_opt = o.trim(); break; } }
                    }
                    let df_bopp = frappe.meta.get_docfield("Quotation Item", "custom_lh_bopp_gsm", frm.doc.name);
                    if (df_bopp && df_bopp.options) {
                        for (let o of df_bopp.options.split("\n")) { if (parseGSMValue(o) === 15) { bopp_opt = o.trim(); break; } }
                    }
                    let df_fab = frappe.meta.get_docfield("Quotation Item", "custom_lh_fabric_gsm", frm.doc.name);
                    if (df_fab && df_fab.options) {
                        for (let o of df_fab.options.split("\n")) { if (parseGSMValue(o) === (total - 30)) { fab_opt = o.trim(); break; } }
                    }

                    if (row.custom_lh_lamination_gsm !== lam_opt) frappe.model.set_value(cdt, cdn, "custom_lh_lamination_gsm", lam_opt);
                    if (row.custom_lh_bopp_gsm !== bopp_opt) frappe.model.set_value(cdt, cdn, "custom_lh_bopp_gsm", bopp_opt);
                    if (row.custom_lh_fabric_gsm !== fab_opt) frappe.model.set_value(cdt, cdn, "custom_lh_fabric_gsm", fab_opt);
                }
            }
        },
        custom_lh_fabric_gsm: function (frm, cdt, cdn) {
            const row = locals[cdt][cdn];
            if (row && row.custom_lh_process === "NON WOVEN BOPP LAMINATED SLITTED FABRIC") {
                let fabric = parseGSMValue(row.custom_lh_fabric_gsm) || 0;
                let lam = parseGSMValue(row.custom_lh_lamination_gsm) || 15;
                let bopp = parseGSMValue(row.custom_lh_bopp_gsm) || 15;
                if (fabric > 0) {
                    frappe.model.set_value(cdt, cdn, "custom_loop_handle_gsm", String(fabric + lam + bopp));
                }
            }
        },
        custom_lh_lamination_gsm: function (frm, cdt, cdn) {
            const row = locals[cdt][cdn];
            if (row && row.custom_lh_process === "NON WOVEN BOPP LAMINATED SLITTED FABRIC") {
                let fabric = parseGSMValue(row.custom_lh_fabric_gsm) || 0;
                let lam = parseGSMValue(row.custom_lh_lamination_gsm) || 15;
                let bopp = parseGSMValue(row.custom_lh_bopp_gsm) || 15;
                if (fabric > 0) {
                    frappe.model.set_value(cdt, cdn, "custom_loop_handle_gsm", String(fabric + lam + bopp));
                }
            }
        },
        custom_lh_bopp_gsm: function (frm, cdt, cdn) {
            const row = locals[cdt][cdn];
            if (row && row.custom_lh_process === "NON WOVEN BOPP LAMINATED SLITTED FABRIC") {
                let fabric = parseGSMValue(row.custom_lh_fabric_gsm) || 0;
                let lam = parseGSMValue(row.custom_lh_lamination_gsm) || 15;
                let bopp = parseGSMValue(row.custom_lh_bopp_gsm) || 15;
                if (fabric > 0) {
                    frappe.model.set_value(cdt, cdn, "custom_loop_handle_gsm", String(fabric + lam + bopp));
                }
            }
        },
        custom_design_code: function (frm, cdt, cdn) {
            const row = locals[cdt][cdn];
            if (row && row.custom_design_code) {
                fetchDesignFieldsFromMaster(frm, cdt, cdn, { includeColour: true });
            }
            showWidthPreview(frm, cdt, cdn);
        },
        custom_design_name: function (frm, cdt, cdn) {
            const row = locals[cdt] && locals[cdt][cdn];
            if (row && row.custom_design_name && !row.custom_design_code) {
                fetchDesignFieldsFromMaster(frm, cdt, cdn, { includeColour: true, forceName: true });
            }
            showWidthPreview(frm, cdt, cdn);
        },
        custom_design_colour: function (frm, cdt, cdn) {
            const row = locals[cdt][cdn];
            const dc = (row && row.custom_design_colour || "").toString().trim();
            if (dc) {
                row.description = buildDescriptionWithDesignColourTag(row.description, dc);
            }
            showWidthPreview(frm, cdt, cdn);
        },
        custom_finishing: function (frm, cdt, cdn) { showWidthPreview(frm, cdt, cdn); },
        custom_coating: function (frm, cdt, cdn) { showWidthPreview(frm, cdt, cdn); },
        custom_quality: function (frm, cdt, cdn) {
            const row = locals[cdt][cdn];
            const qualityName = (row.custom_quality || "").trim();
            if (qualityName) {
                frappe.db.get_value("Quality Master", { "quality_name": qualityName }, "quality_abbr")
                    .then(r => {
                        if (r && r.message && r.message.quality_abbr) {
                            frappe.model.set_value(cdt, cdn, "custom_quality_abbr", r.message.quality_abbr)
                                .then(() => showWidthPreview(frm, cdt, cdn));
                        } else {
                            frappe.model.set_value(cdt, cdn, "custom_quality_abbr", "")
                                .then(() => showWidthPreview(frm, cdt, cdn));
                        }
                    });
            } else {
                frappe.model.set_value(cdt, cdn, "custom_quality_abbr", "")
                    .then(() => showWidthPreview(frm, cdt, cdn));
            }
        },
        custom_colour: function (frm, cdt, cdn) { showWidthPreview(frm, cdt, cdn); },
        custom_lamination_gsm: function (frm, cdt, cdn) {
            showWidthPreview(frm, cdt, cdn);
            calculateFabricGSM(frm, cdt, cdn);
            forceEditableQuotationItemLaminationFields(frm);
        },
        custom_bopp_gsm: function (frm, cdt, cdn) {
            showWidthPreview(frm, cdt, cdn);
            calculateFabricGSM(frm, cdt, cdn);
            forceEditableQuotationItemLaminationFields(frm);
            const row = locals[cdt][cdn];
            let p = (row.custom_process || row.process || "").trim().toUpperCase();
            if (p === "PRINTED BOPP" || p.includes("PRINTED BOPP") || p.includes("BOPP PRINT")) {
                let bopp_num = parseGSMValue(row.custom_bopp_gsm);
                if (bopp_num > 0 && row.custom_gsm !== bopp_num) {
                    frappe.model.set_value(cdt, cdn, "custom_gsm", bopp_num);
                }
            }
        },
        custom_fabric_gsm: function (frm, cdt, cdn) {
            calculateTotalGSM(frm, cdt, cdn);
        },

        custom_gsm: function (frm, cdt, cdn) {
            showWidthPreview(frm, cdt, cdn);
            calculateQty(frm, cdt, cdn, 'lookup');
            applyBagSheetCalculations(frm, cdt, cdn);
            // User edited GSM directly ?- derive fabric GSM from it (safe: calculateFabricGSM writes to locals, no trigger loop)
            calculateFabricGSM(frm, cdt, cdn);
            // Keep HSN in sync with GSM.
            const row = locals[cdt][cdn];
            const hsn = getHSNFromGSM(row.custom_gsm, row);
            if (hsn) {
                frappe.model.set_value(cdt, cdn, "gst_hsn_code", hsn).catch(() => { });
                frappe.model.set_value(cdt, cdn, "hsn_sac", hsn).catch(() => { });
            }
            let p = (row.custom_process || row.process || "").trim().toUpperCase();
            if (p === "PRINTED BOPP" || p.includes("PRINTED BOPP") || p.includes("BOPP PRINT")) {
                let current_gsm = parseFloat(row.custom_gsm) || 0;
                if (current_gsm > 0) {
                    let df = frappe.meta.get_docfield("Quotation Item", "custom_bopp_gsm", frm.doc.name);
                    let options = (df && df.options) ? df.options.split("\n") : [];
                    let matched_opt = "";
                    for (let opt of options) {
                        let opt_num = parseGSMValue(opt);
                        if (opt_num === current_gsm) {
                            matched_opt = opt.trim();
                            break;
                        }
                    }
                    if (matched_opt && row.custom_bopp_gsm !== matched_opt) {
                        frappe.model.set_value(cdt, cdn, "custom_bopp_gsm", matched_opt);
                    }
                }
            }
        },

        // Trigger calculation when meter/roll or no of rolls change
        meter_per_roll: function (frm, cdt, cdn) { calculateQty(frm, cdt, cdn, 'mpr'); },
        custom_meter_per_roll: function (frm, cdt, cdn) {
            calculateQty(frm, cdt, cdn, 'mpr');
            showWidthPreview(frm, cdt, cdn);
        },
        custom_weight_per_roll: function (frm, cdt, cdn) {
            showWidthPreview(frm, cdt, cdn);
        },
        custom_core_size: function (frm, cdt, cdn) {
            showWidthPreview(frm, cdt, cdn);
        },
        custom_meter: function (frm, cdt, cdn) { calculateQty(frm, cdt, cdn, 'meter'); },
        meter_roll: function (frm, cdt, cdn) { calculateQty(frm, cdt, cdn, 'meter'); },
        no_of_rolls: function (frm, cdt, cdn) { calculateQty(frm, cdt, cdn, 'rolls'); },
        custom_no_of_rolls: function (frm, cdt, cdn) { calculateQty(frm, cdt, cdn, 'rolls'); },
        custom_rolls: function (frm, cdt, cdn) { calculateQty(frm, cdt, cdn, 'rolls'); },
        no_of_shafts: function (frm, cdt, cdn) { calculateQty(frm, cdt, cdn, 'rolls'); },
        qty: function (frm, cdt, cdn) { calculateQty(frm, cdt, cdn, 'qty'); },
        custom_no_of_sheets_pcs: function (frm, cdt, cdn) {
            const row = locals[cdt][cdn];
            if (row && isBagSheetProcess(row)) {
                if (row.custom_no_of_sheets_pcs !== undefined && row.custom_no_of_sheets_pcs !== "" && row.custom_no_of_sheets_pcs !== null) {
                    frappe.model.set_value(cdt, cdn, "custom_no_of_sheets_pcs", "");
                }
            }
        },

        custom_bag_size: function (frm, cdt, cdn) {
            const row = locals[cdt][cdn];
            const bagSizeCode = (row.custom_bag_size || "").trim();
            if (!bagSizeCode) return;
            fetchBagSeriesDimensions(cdt, cdn, bagSizeCode).then(() => {
                const r2 = locals[cdt][cdn];
                if (r2 && isBagSheetProcess(r2)) delete r2._plain_box_sheet_manual;
                applyBagSheetCalculations(frm, cdt, cdn);
                calculateQty(frm, cdt, cdn, 'lookup');
            }).catch(() => {
                if (!quotationRowHasBagDimensions(cdt, cdn)) {
                    frappe.show_alert({
                        message: `Could not fetch Bag Series for code <b>${bagSizeCode}</b>.`,
                        indicator: "orange"
                    }, 5);
                }
            });
        },

        custom_top_folding_mm: function (frm, cdt, cdn) {
            const row = locals[cdt][cdn];
            if (row && isBagSheetProcess(row)) delete row._plain_box_sheet_manual;
            applyBagSheetCalculations(frm, cdt, cdn);
        },

        custom_gazette_mm: function (frm, cdt, cdn) {
            const row = locals[cdt][cdn];
            if (row && isBagSheetProcess(row)) delete row._plain_box_sheet_manual;
            applyBagSheetCalculations(frm, cdt, cdn);
        },

        custom_height_mm: function (frm, cdt, cdn) {
            const row = locals[cdt][cdn];
            if (row && isBagSheetProcess(row)) delete row._plain_box_sheet_manual;
            applyBagSheetCalculations(frm, cdt, cdn);
        },

        custom_sheet_width_mm: function (frm, cdt, cdn) {
            const row = locals[cdt][cdn];
            if (!row || !isBagSheetProcess(row)) return;
            row._plain_box_sheet_manual = 1;
            recalculatePlainBoxBagWeightFromSheet(frm, cdt, cdn);
        },

        custom_sheet_cut_length_mm: function (frm, cdt, cdn) {
            const row = locals[cdt][cdn];
            if (!row || !isBagSheetProcess(row)) return;
            row._plain_box_sheet_manual = 1;
            recalculatePlainBoxBagWeightFromSheet(frm, cdt, cdn);
            calculateQty(frm, cdt, cdn, 'lookup');
        },

        // --? Size Code (Sheet Cutting Series) changed ?- populate dimensions ----?
        custom_size_code: function (frm, cdt, cdn) {
            const row = locals[cdt][cdn];
            const sizeCode = (row.custom_size_code || "").trim();
            if (!sizeCode) return;

            frappe.db.get_value("Sheet Cutting Series", sizeCode, [
                "size_in_inches", "size_in_mm",
                "width_in_inches", "width_in_mm",
                "height_in_inches", "height_in_mm"
            ]).then(r => {
                if (!r || !r.message) {
                    frappe.show_alert({
                        message: `Size Code <b>${sizeCode}</b> not found in Sheet Cutting Series.`,
                        indicator: "red"
                    }, 5);
                    return;
                }
                const d = r.message;

                const wIn = parseFloat(d.width_in_inches) || 0;
                const wMm = parseFloat(d.width_in_mm) || 0;
                const wCm = parseFloat((wMm / 10).toFixed(2));
                const hIn = parseFloat(d.height_in_inches) || 0;
                const hMm = parseFloat(d.height_in_mm) || 0;
                const hCm = parseFloat((hMm / 10).toFixed(2));
                const sizeInInch = (d.size_in_inches || `${wIn} x ${hIn}`).toString().trim();
                const sizeInMm = (d.size_in_mm || `${wMm} x ${hMm}`).toString().trim();

                Promise.all([
                    frappe.model.set_value(cdt, cdn, "custom_size_in_inch", sizeInInch),
                    frappe.model.set_value(cdt, cdn, "custom_size_in_mm", sizeInMm),
                    frappe.model.set_value(cdt, cdn, "custom_width_inch", wIn),
                    frappe.model.set_value(cdt, cdn, "custom_width_mm", wMm),
                    frappe.model.set_value(cdt, cdn, "custom_width_cm", wCm),
                    frappe.model.set_value(cdt, cdn, "custom_height_inches", hIn),
                    frappe.model.set_value(cdt, cdn, "custom_height_mm", hMm),
                    frappe.model.set_value(cdt, cdn, "custom_height_cm", hCm)
                ]).then(() => {
                    calculateQty(frm, cdt, cdn, 'lookup');
                    const r2 = locals[cdt][cdn];
                    const q = (r2.custom_quality_abbr || r2.custom_quality || "").trim().toUpperCase();
                    let c = (r2.custom_colour || "").trim().toUpperCase();
                    if (c === "WHITE") c = "BRIGHT WHITE";
                    if (q && c && r2.custom_gsm) {
                        showPreviewAlert(frm, cdt, cdn, 0, 0);
                    }
                }).catch(() => { });
            }).catch(() => {
                frappe.show_alert({
                    message: `Could not fetch Sheet Cutting Series for code <b>${sizeCode}</b>.`,
                    indicator: "orange"
                }, 5);
            });
        }
    });

    frappe.quotation_lamination_editable = frappe.quotation_lamination_editable || {};
    frappe.quotation_lamination_editable.unlockFields = forceEditableQuotationItemLaminationFields;
})();