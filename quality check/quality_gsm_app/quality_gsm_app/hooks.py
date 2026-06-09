app_name = "quality_gsm_app"
app_title = "Quality GSM App"
app_publisher = "Custom"
app_description = "GSM quality testing extension for Quality Inspection"
app_email = "admin@example.com"
app_license = "MIT"

doctype_js = {
    "Quality Checking": "public/js/quality_inspection_gsm.js",
    "Shaft Production Run": "public/js/shaft_production_run_quality_button.js",
}

after_install = "quality_gsm_app.install.after_install"
after_migrate = "quality_gsm_app.install.after_migrate"

