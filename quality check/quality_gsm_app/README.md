# quality_gsm_app

Custom ERPNext/Frappe app to implement GSM quality testing on top of `Quality Inspection`.

## What this app does

- Adds custom fields to `Quality Inspection`
- Creates child table DocType `GSM Test Section`
- Attaches client-side calculation logic to `Quality Inspection`
- Creates/updates print format `GSM Testing Report`
- Exposes API to fetch unique GSM values from `Shaft Production Run` child table `roll_production_results`

## Install

1. Get app into your bench apps folder.
2. Install app:
   - `bench --site <your-site> install-app quality_gsm_app`
3. Run migration:
   - `bench --site <your-site> migrate`
4. Clear cache/restart:
   - `bench --site <your-site> clear-cache`
   - `bench restart`

## Assumptions

- Parent DocType: `Shaft Production Run`
- Child table in it: `roll_production_results`
- GSM field in child table: `gsm`
