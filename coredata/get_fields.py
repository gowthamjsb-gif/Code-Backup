import requests
import json

URL = "https://jayashreespunbond-1zt.frappe.cloud"
USERNAME = "Administrator"
PASSWORD = "Erp@1234$"

def get_doctype_fields(dt):
    session = requests.Session()
    session.post(f"{URL}/api/method/login", data={"usr": USERNAME, "pwd": PASSWORD})
    
    resp = session.get(f"{URL}/api/method/frappe.desk.form.load.getdoctype", params={"doctype": dt})
    data = resp.json()
    
    fields = data['docs'][0]['fields']
    for f in fields:
        print(f"{f.get('fieldname')}: {f.get('label')} ({f.get('fieldtype')})")

if __name__ == "__main__":
    get_doctype_fields("Core Size")
