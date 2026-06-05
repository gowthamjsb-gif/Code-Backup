# Quotation Item Creation — Process, Item Code & Item Name Reference

This document describes how **Quotation Before Validate** (`quotation_before_save.py`) auto-creates items and BOMs. Process codes come from **Process Master** unless overridden in script. Quality, colour, and GSM letters follow **Quality Master** and **Colour Master** mappings.

**Last aligned with:** `quotation_before_save.py`, `quotation_client_script.js`, `quotation_grid_visibility.js`

---

## Legend

| Symbol | Meaning |
|--------|---------|
| `{design}` | Design code prefix from DESIGN MASTER (e.g. `7465`, `6000`, `2500`) |
| `{p}` | 3-digit process code |
| `{q}` | 3-digit quality code (Quality Master) |
| `{c}` | 3-digit colour code (Colour Master) |
| `{Q}` | Quality letter A–R (used in bag / BOPP codes) |
| `{G}` | Fabric GSM letter A–U (20=A, 25=B, … 75=L, … 120=U) |
| `{B}` | BOPP GSM letter (10=A, 12=B, 15=C, 30=D, 0=none) |
| `{L}` | Lamination GSM letter (10=A, 12=B, 15=C, 30=D, 20=E) |
| `{gsm}` | GSM value (3 digits in numeric codes) |
| `{mm}` | Roll/slit width in mm (4 digits, snapped to 5 mm) |
| `{size}` | Bag size code from Bag Series |
| `{nC}` | Number of design colours (e.g. `1C`, `4C`) |
| `{coat}{fin}` | Coating + finish suffix (e.g. `PM`, `MM`, `PP`) |
| `{inch}` | Width in inches (display) |
| `{name}` | Design name from DESIGN MASTER |

### Coating & finish codes (BOPP / bags)

| Code | Coating | Code | Finish |
|------|---------|------|--------|
| P | Plain | P | Plain |
| M | Metallic / Mettalic | M | Matte |
| C | Cooler | G | Glossy |
| 0 | None / default | | |

### Quality letter map (bags & BOPP)

| Letter | Quality | Letter | Quality |
|--------|---------|--------|---------|
| A | Premium | N | Deluxe |
| B | Platinum | O | Virgin Mix - Gold Mix |
| C | Super Platinum | P | Mid Mix - Classic Mix |
| D | Gold | Q | Eco Mix |
| E | Silver | R | Deluxe Mix |
| F | Bronze | | |
| G | Classic | | |
| H | Super Classic | | |
| I | Lifestyle | | |
| J | Eco Special | | |
| K | Eco Green | | |
| L | Super Eco | | |
| M | Ultra | | |

### Fabric GSM letter map

| Letter | GSM | Letter | GSM |
|--------|-----|--------|-----|
| A | 20 | N | 85 |
| B | 25 | O | 90 |
| C | 30 | P | 95 |
| D | 35 | Q | 100 |
| E | 40 | R | 105 |
| F | 45 | S | 110 |
| G | 50 | T | 115 |
| H | 55 | U | 120 |
| I | 60 | | |
| J | 65 | | |
| K | 70 | | |
| L | 75 | | |
| M | 80 | | |

---

## 1. Fabric & roll processes (quotation line items)

| Process | Code | Item code pattern | Item name pattern | Example |
|---------|------|-------------------|-------------------|---------|
| NON WOVEN FABRIC | **100** | `100{q}{c}{gsm}{mm}` | `NON WOVEN FABRIC {Quality} {Colour} {gsm} GSM W - {inch}'' ( {mm} MM )` | `1001132610750990` |
| NON WOVEN REWINDED FABRIC | **102** | `102{q}{c}{gsm}1600-{mtr}` | `NON WOVEN FABRIC {Q} {C} {gsm} GSM W - 63'' ( 1600 MM ) R - {mtr} MTR` | `1021132611600-500` |
| NON WOVEN SLITTED FABRIC | **103** | `103{q}{c}{gsm}{mm}` | `NON WOVEN SLITTED FABRIC {Q} {C} {gsm} GSM W - {inch}'' ( {mm} MM )` | `1031132610050` |
| NON WOVEN LAMINATED FABRIC | **104** | `104{q}{c}{gsm}{mm}-{lam}` | `NON WOVEN LAMINATED FABRIC {Q} {C} {total} ( F {fab} + L {lam} ) GSM W - {inch}'' ( {mm} MM )` | `1041132610750-15` |
| NON WOVEN FLEXO PRINTED FABRIC | **105** | `{design}-105{q}{c}{gsm}{mm}` | `{design} - {name} - NON WOVEN FLEXO PRINTED FABRIC {Q} {C} {gsm} GSM W - {inch}'' ( {mm} MM )` | `7465-105F001L0750` |
| NON WOVEN LAMINATED PRINTED FABRIC | **106** | `{design}-106{q}{c}{gsm}{mm}-{lam}` | `{design} - {name} - NON WOVEN LAMINATED PRINTED FABRIC {Q} {C} {total} ( F - {fab} L - {lam} ) GSM W - {inch}'' ( {mm} MM )` | `7465-106F001L0750-C` |
| NON WOVEN BOPP LAMINATED FABRIC | **107** | `{design}-107{Q}{c}{G}{B}{L}{mm}{coat}{fin}` | `{design} - {name} - NON WOVEN BOPP LAMINATED {total} GSM W - {inch}'' ( {mm} MM )` | `7465-107F181MCC1020PM` |
| NON WOVEN BOPP LAMINATED SLITTED FABRIC | **108** | `{design}-108{Q}{c}{G}{B}{L}{mm}{coat}{fin}` | `{design} - {name} - NON WOVEN BOPP LAMINATED SLITTED FABRIC {total} GSM W - {inch}'' ( {mm} MM )` | `7465-108F181MCC0050PM` |
| NON WOVEN METTALIC BOPP LAMINATED SLITTED FABRIC | **108** | Same as 108; `{coat}{fin}` typically **MM** | `{design} - {name} - NON WOVEN METTALIC BOPP LAMINATED SLITTED FABRIC {total} GSM W - {inch}'' ( {mm} MM )` | Metallic LH variant |
| NON WOVEN LAMINATED SLITTED FABRIC | **109** | `109{q}{c}{gsm}{mm}-{lam}` | `NON WOVEN LAMINATED SLITTED FABRIC {Q} {C} {total} ( F - {fab} L - {lam} ) GSM W - {inch}'' ( {mm} MM )` | `1091132610050-15` |
| PRINTED BOPP (standalone) | **PB** | `PB-{design}-{bopp}M-{mm}MM-{coat}{fin}` | `PRINTED BOPP - {design} - {name} - {nC} - {bopp}M - {mm} MM` | `PB-7465-15M-1020MM-PM` |
| PLAIN BOPP FILM | **BOPP** | `BOPP-{bopp}M-{mm}MM-{coat}{fin}` | `PLAIN BOPP FILM - MATT FINISH - NON HEAT SEALABLE - 2 SIDE CORONA TREATED - {bopp}M - {mm} MM` | `BOPP-15M-1020MM-PM` |
| BOPP printing cylinder | **CY** | `CY - {design}` | `{design} - {name} - {nC} - ( {w}" X {h}" X {g}" ) - {sheet_w + 70} MM X {cut_len} MM` | HSN **84422010**; multi-line description on Item |

**Notes**

- Total GSM for BOPP items = fabric GSM + BOPP GSM + lamination GSM.
- `{G}{B}{L}` in BOPP codes are single letters mapped from GSM values, not raw numbers.
- Fabric BOM (100) includes masterbatch, PP, filler, PPA, antistatic per Quality Master mix.

---

## 2. Sheet processes

| Process | Code | Item code pattern | Item name pattern |
|---------|------|-------------------|-------------------|
| NON WOVEN PLAIN SHEET | **251** | `251{q}{c}{gsm}{size}` | `NON WOVEN PLAIN SHEET {Q} {C} {gsm} GSM W {w}" X H {h}" ( {w_mm} MM X {h_mm} MM )` |
| NON WOVEN PRINTED SHEET | **252** | `{design}-252{q}{c}{gsm}{size}` | `{design} - {name} - NON WOVEN PRINTED SHEET {Q} {C} {gsm} GSM W {w}" X H {h}" ( {w_mm} MM X {h_mm} MM )` |
| NON WOVEN LAMINATED SHEET | **253** | `253{q}{c}{gsm}{size}-{lam}` | `NON WOVEN LAMINATED SHEET {Q} {C} {total} ( F - {fab} L - {lam} ) GSM W {w}" X H {h}" ( {w_mm} MM X {h_mm} MM )` |
| NON WOVEN LAMINATED PRINTED SHEET | **254** | `{design}-254{q}{c}{gsm}{size}-{lam}` | `{design} - {name} - NON WOVEN LAMINATED PRINTED SHEET {Q} {C} {total} ( F - {fab} L - {lam} ) GSM W {w}" X H {h}" ( {w_mm} MM X {h_mm} MM )` |
| NON WOVEN BOPP LAMINATED SHEET | **255** | `{design}-255{Q}{c}{G}{B}{L}{size}{coat}{fin}` | `{design} - {name} - NON WOVEN BOPP LAMINATED SHEET {total} GSM W {w}" X H {h}" ( {w_mm} MM X {h_mm} MM )` |

Sheet BOMs consume underlying fabric / printed / laminated rolls in **Meter** or **Kg** with dual-BOM support for alternate inch widths.

---

## 3. Box & shopper bag processes (finished goods)

Bag item codes follow:

```
{design}-{size}-{process}{Q}{c}{G}{B}{L}{coat}{fin}
```

Printed bags insert `{nC}` after design: `{design}-{nC}-{size}-{process}…`

| Process | Code | Item code pattern | Item name pattern |
|---------|------|-------------------|---------------------|
| PLAIN W CUT BAG | **200** | `{design}-{size}-200{Q}{c}{G}00{coat}{fin}` | `{design} - {name} - NON WOVEN PLAIN W-CUT BAG {gsm} GSM, W {w}MM X H {h}MM X G {g}MM ( … ) - {finish}` |
| PRINTED W CUT BAG | **201** | `{design}-{nC}-{size}-201{Q}{c}{G}00{coat}{fin}` | `{design} - {name} - {nC} - NON WOVEN FLEXO PRINTED W-CUT BAG {gsm} GSM, W … - {finish}` |
| LAMINATED W CUT BAG | **202** | `{design}-{size}-202{Q}{c}{G}0{L}{coat}{fin}` | `{design} - {name} - NON WOVEN PLAIN LAMINATED W-CUT BAG {total} GSM, W … - {finish}` |
| LAMINATED PRINTED W CUT BAG | **203** | `{design}-{nC}-{size}-203{Q}{c}{G}0{L}{coat}{fin}` | `{design} - {name} - {nC} - NON WOVEN LAMINATED PRINTED W-CUT BAG {total} GSM, W … - {finish}` |
| PLAIN BOX BAG / PLAIN SHOPPER BAG | **221** | `{design}-{size}-221{Q}{c}{G}00PP` | `{design} - {name} - NON WOVEN PLAIN SHOPPER BAG {gsm} GSM, W {w}MM X H {h}MM X G {g}MM ( … ) - PLAIN` |
| PRE-FLEXO PRINTED BOX BAG | **222** | `{design}-{nC}-{size}-222{Q}{c}{G}00{coat}{fin}` | `{design} - {name} - {nC} - NON WOVEN FLEXO PRINTED SHOPPER BAG {gsm} GSM, W … - {finish}` |
| CUSTOM FLEXO PRINTED BOX BAG | **223** | `{design}-{nC}-{size}-223{Q}{c}{G}00{coat}{fin}` | Same structure as 222 |
| PLAIN LAMINATED BOX BAG | **224** | `{design}-{size}-224{Q}{c}{G}0{L}{coat}{fin}` | `{design} - {name} - NON WOVEN PLAIN LAMINATED SHOPPER BAG {total} GSM, W … - {finish}` |
| PRE-FLEXO LAMINATED BOX BAG | **225** | `{design}-{nC}-{size}-225{Q}{c}{G}0{L}{coat}{fin}` | `{design} - {name} - {nC} - NON WOVEN FLEXO PRINTED LAMINATED SHOPPER BAG {total} GSM, W …` |
| CUSTOM FLEXO LAMINATED BOX BAG | **226** | `{design}-{nC}-{size}-226{Q}{c}{G}0{L}{coat}{fin}` | Same structure as 225 |
| COLORED BOPP BOX BAG | **231** | `{design}-{nC}-{size}-231{Q}{c}{G}{B}{L}{coat}{fin}` | `{design} - {name} - {nC} - NON WOVEN DIGITAL PRINTED … BOX BAG {total} GSM, W …` |
| SCREEN PRINTED BOPP BOX BAG | **232** | `{design}-{nC}-{size}-232{Q}{c}{G}{B}{L}{coat}{fin}` | `NON WOVEN DIGITAL + SCREEN PRINTED … BOX BAG {total} GSM, W …` |
| CUSTOM PRINTED BOPP BOX BAG | **233** | `{design}-{nC}-{size}-233{Q}{c}{G}{B}{L}{coat}{fin}` | `{design} - {name} - {nC} - NON WOVEN DIGITAL PRINTED … BOX BAG {total} GSM, W …` |
| METALLIC BOPP BOX BAG | **241** | `{design}-{size}-241{Q}{c}{G}{B}{L}M{fin}` | `{design} - {name} - {nC} - NON WOVEN DIGITAL PRINTED METALLIC … BAG {total} GSM, W …` |
| COOLER BOPP BOX BAG | **242** | `{design}-{size}-242{Q}{c}{G}{B}{L}C{fin}` | `{design} - {name} - {nC} - NON WOVEN DIGITAL PRINTED COOLER … BAG {total} GSM, W …` |
| D CUT PLAIN BAG | **211** | `{design}-{size}-211{Q}{c}{G}00{coat}{fin}` | `{design} - {name} - NON WOVEN PLAIN D-CUT BAG {gsm} GSM, W … - {finish}` |
| D CUT PRINTED FLEXO BAG | **212** | `{design}-{nC}-{size}-212{Q}{c}{G}00{coat}{fin}` | `{design} - {name} - {nC} - NON WOVEN FLEXO PRINTED D-CUT BAG {gsm} GSM, W …` |
| D CUT LAMINATED BAG | **213** | `{design}-{size}-213{Q}{c}{G}0{L}{coat}{fin}` | `{design} - {name} - NON WOVEN PLAIN LAMINATED D-CUT BAG {total} GSM, W … - {finish}` |
| D CUT LAMINATED PRINTED BAG | **214** | `{design}-{nC}-{size}-214{Q}{c}{G}0{L}{coat}{fin}` | `{design} - {name} - NON WOVEN LAMINATED PRINTED D-CUT BAG {total} GSM, W …` |
| D CUT METTALIC ROTO BAG | **216** | `{design}-{nC}-{size}-216{Q}{c}{G}{B}{L}M{fin}` | `{design} - {name} - {nC} - NON WOVEN DIGITAL PRINTED METTALIC D-CUT BAG {total} GSM, W …` |
| D CUT BOPP ROTO BAG | **217** | `{design}-{nC}-{size}-217{Q}{c}{G}{B}{L}{coat}{fin}` | `{design} - {name} - {nC} - NON WOVEN DIGITAL PRINTED D-CUT BAG {total} GSM, W …` |

**Example — Plain box bag**

| Field | Value |
|-------|-------|
| Item code | `6000-511-221N261L00PP` |
| Meaning | Design 6000, size 511, process 221, Bronze (F), colour 001, 75 GSM (L), no BOPP/lam (0,0), Plain/Plain |

Bag BOMs typically consume body fabric in **Meter** with UOM conversion on the fabric item (`meters_per_kg = 1000 / (GSM × width_m)`).

---

## 4. Loop handle (LH) processes

Loop-handle items are **BOM components** on box bags (not the main quotation finished item). They appear when **LH Process** is set on the quotation row.

### 4.1 Plain loop handle — NON WOVEN FABRIC

| Item | Code | Name |
|------|------|------|
| Slitted loop fabric | `103{q}{c}{gsm}{loop_mm}` | `NON WOVEN SLITTED FABRIC {Q} {C} {gsm} GSM W - {inch}'' ( {loop_mm} MM )` |

- Parent roll: `100…` at 1020 mm (or base width from loop-handle quality/colour/GSM).
- Slit BOM: 103 item ← 100 fabric BOM, qty 1 Kg.
- Bag BOM loop line: ~0.82 **Meter** of 103 fabric.

### 4.2 BOPP loop handle — NON WOVEN BOPP LAMINATED SLITTED FABRIC

**Defaults (plain BOPP LH)**

| Field | Default |
|-------|---------|
| `custom_coating` | Plain |
| `custom_finishing` | Matte |
| `custom_lh_bopp_gsm` | 15 - C |
| `custom_lh_lamination_gsm` | 15 - C |
| Parent lam roll width | 1020 mm |
| `{coat}{fin}` on items | **PM** |

**Defaults (metallic BOPP LH — NON WOVEN METTALIC BOPP LAMINATED SLITTED FABRIC)**

| Field | Default |
|-------|---------|
| `custom_coating` | Mettalic |
| `custom_finishing` | Matte |
| `custom_lh_bopp_gsm` | 30 - D |
| `custom_lh_lamination_gsm` | 15 - C |
| `{coat}{fin}` on items | **MM** |
| Item name prefix | **NON WOVEN METTALIC BOPP LAMINATED …** |

**Item chain created by `ensure_lh_bopp_item_and_bom`**

| Step | Process | Item code | Item name |
|------|---------|-----------|-----------|
| 1 | 100 | `100{q}{c}{fab_gsm}{parent_mm+extra}` | `NON WOVEN FABRIC {Q} {C} {fab_gsm} GSM W - {inch}'' ( {mm} MM )` |
| 2 | PB | `PB-{design}-{bopp}M-1020MM-{coat}{fin}` | `PRINTED BOPP - {design} - {name} - {nC} - {bopp}M - 1020 MM` |
| 3 | BOPP | `BOPP-{bopp}M-1020MM-{coat}{fin}` | `PLAIN BOPP FILM - MATT FINISH - NON HEAT SEALABLE - 2 SIDE CORONA TREATED - {bopp}M - 1020 MM` |
| 4 | 107 | `{design}-107{Q}{c}{G}{B}{L}1020{coat}{fin}` | `{design} - {name} - NON WOVEN [METTALIC ]BOPP LAMINATED {total} GSM W - 40.2'' ( 1020 MM )` |
| 5 | 108 | `{design}-108{Q}{c}{G}{B}{L}{loop_mm}{coat}{fin}` | `{design} - {name} - NON WOVEN [METTALIC ]BOPP LAMINATED SLITTED FABRIC {total} GSM W - {inch}'' ( {loop_mm} MM )` |

**107 BOM components**

1. Non-woven fabric (100) — Kg, width-adjusted qty  
2. Printed BOPP (PB) — Kg, BOM exploded  
3. Lamination raw materials (outer side default):
   - PP - 1002001, PP - 1002016, PP - 1002010  
   - LAMINATION DANA DUMMY  
   - MB - 1001001, SA - 1004002, SA - 1004001  

**108 BOM components**

- 107 laminated roll — 1 Kg (exploded)

**LH design fields (persisted on quotation row)**

| Field | Source |
|-------|--------|
| `custom_lh_design_code` | DESIGN MASTER link / design_code |
| `custom_lh_design_name` | DESIGN MASTER design_name |
| `custom_lh_design_colour` | DESIGN MASTER colours |
| `custom_lh_no_of_design_colour` | DESIGN MASTER no_of_design_colours |

Values are also stored in row **description** tags (`LH_DESIGN_MASTER`, `LH_DESIGN_NAME`, etc.) so they survive save when grid columns are hidden.

---

## 5. BOM raw materials (supporting items)

| Item group | Example codes | Used in |
|------------|---------------|---------|
| PP granules | PP - 1002001, PP - 1002016, PP - 1002010 | Fabric 100 BOM, lamination |
| Masterbatch | From Colour Master / MB - 1001{c} | Fabric 100 BOM |
| Lamination dummy | LAMINATION DANA DUMMY | BOPP 107, laminated 104 |
| Antistatic / SA | SA - 1004001, SA - 1004002 | Lamination |
| Flexo inks | INK - 100xxxx | Flexo 105 / 106 |
| BOPP ink | INK - 007 | Printed BOPP BOM |
| Sewing thread | TH - 5002005, TH - 5002006 | Box bag BOM (loop handle) |
| Scrap | SCRAP-NONWOVEN, WASTE - 006 | Fabric / lam BOM scrap |

---

## 6. Box bag BOM structure (by process family)

| Bag process | Body fabric in BOM | Loop handle (if LH set) | Other |
|-------------|-------------------|-------------------------|-------|
| Plain box bag (221) | 100 fabric — **Meter** (cut length) | 103 or 108 fabric — **Meter** (~0.82) | Thread |
| Plain laminated (224) | 104 laminated — **Meter** | 103 or 108 | Thread |
| Flexo printed (222/223) | 105 or 106 — **Meter** | 103 or 108 | Thread |
| Custom BOPP (233) | 107 BOPP lam — **Meter** | 103 or 108 fabric — **Meter** (~0.82) | Thread (+ **CY - {design}** on next quotation row) |
| Metallic BOPP (241) | 107 BOPP lam — **Meter** | 103 or 108 (metallic 108) | Thread (+ **CY - {design}** on next quotation row) |

**BOPP printing cylinder:** Added as the **next quotation line** after each BOPP row (not in the BOM). Item code `CY - {design code}`; name uses sheet width + 70 mm and sheet cut length. Qty **1 Nos**.

**UOM conversion:** Kg stock fabric items get **Meter** / **Mtr** conversion on the Item master:

```
conversion_factor = 1000 / (GSM × width_in_meters)
```

Also stored as `custom_meters_per_kg` on the Item.

---

## 7. Deployment checklist

| File | Frappe location |
|------|-----------------|
| `quotation_before_save.py` | Quotation → Server Script → **Before Validate** |
| `quotation_client_script.js` | Quotation → Client Script |
| `quotation_grid_visibility.js` | Quotation → Client Script (or merged) |

**Important:** Only one Before Validate server script should be active. Paste `quotation_before_save.py` at column 0 (no leading spaces on line 1).

---

## 8. Related source functions (quick index)

| Area | Function(s) in `quotation_before_save.py` |
|------|-------------------------------------------|
| Loop handle BOPP chain | `ensure_lh_bopp_item_and_bom` |
| Fabric 100 BOM | `ensure_nonwoven_fabric_bom_if_missing` |
| Plain box bag BOM | `create_plain_box_bag_boms` |
| BOPP box bag BOM | `create_custom_printed_bopp_box_bag_boms` |
| Flexo box bag BOM | `create_flexo_printed_box_bag_boms` |
| Laminated box bag BOM | `create_plain_laminated_box_bag_boms` |
| UOM sync | `ensure_item_meter_uom_conversions`, `sync_item_meter_uom_by_gsm_width` |
| BOPP cylinder | `insert_bopp_cylinder_quotation_row_after`, `ensure_bopp_cylinder_item` |
| LH design sync | `ensure_lh_design_fields_on_row`, `sync_lh_design_fields_from_master` |
| 107 lamination patch | `patch_bopp_lam_bom_lamination_items` |

---

*Generated for Jayashree Spun Bond quotation item auto-creation workflow.*
