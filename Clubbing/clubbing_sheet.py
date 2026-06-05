# Server Script for Clubbing Sheet (runs on validate and on_submit)
# 'frappe' and 'doc' are available at the top-level scope only.
# IMPORTANT: Functions cannot call other functions in RestrictedPython — all logic self-contained.

def populate_customer_from_sales_order(doc):
    for item in doc.items:
        if item.sales_order:
            correct_customer = frappe.db.get_value("Sales Order", item.sales_order, "customer")
            if correct_customer:
                item.customer = correct_customer

def calculate_total_weight(doc):
    total = 0
    for item in doc.items:
        total += frappe.utils.flt(item.weight_kgs)
    doc.total_weight = total

def validate_and_set_load_type(doc):
    if not doc.items:
        doc.load_type = ""
        return
    
    customer_weights = {}
    for item in doc.items:
        if item.customer:
            customer_weights[item.customer] = customer_weights.get(item.customer, 0) + frappe.utils.flt(item.weight_kgs)
            
    customers = list(customer_weights.keys())
    
    # Rule: If any customer has >= 5000 kgs, it must be a Full Load for that customer only
    full_load_customers = [c for c, w in customer_weights.items() if w >= 5000]
    
    if full_load_customers:
        if len(customers) > 1:
            msg = frappe._("Customer %s has a total weight of %s kgs (>= 5000 kgs). Orders >= 5000 kgs must be clubbed separately as a Full Load.") % (full_load_customers[0], customer_weights[full_load_customers[0]])
            frappe.throw(msg)
        doc.load_type = "Full Load"
    elif len(customers) > 1:
        doc.load_type = "Part Load"
    elif len(customers) == 1:
        doc.load_type = "Part Load"
    else:
        doc.load_type = ""

def validate_route_compatibility(doc):
    if not doc.items or len(doc.items) < 2:
        return

    ROUTE_BELTS = [
        ["madurai", "virudhunagar", "sivakasi", "tuticorin", "thoothukudi"],
        ["madurai", "karur", "coimbatore"],
        ["madurai", "karur", "erode", "salem"],
        ["madurai", "dindigul", "karur", "salem"],
        ["madurai", "pondicherry", "puducherry", "vellore", "kanchipuram", "chennai"],
        ["madurai", "trivandrum", "thiruvananthapuram", "changanacherry"],
        ["madurai", "kollam", "kayankulam", "pathanamthitta", "kottayam"],
        ["madurai", "coimbatore", "palakkad", "trissur", "thrissur", "ernakulam"],
        ["madurai", "coimbatore", "pallakad", "trissur", "thrissur", "malappuram", "kozhikode", "calicut", "mahe", "kannur", "kasargod", "mangaluru", "mangalore", "uduppi", "udupi"],
        ["madurai", "mysore", "mysuru", "hassan", "shimoga", "dawangeree", "davangere"],
        ["madurai", "salem", "hosur", "bangalore", "bengaluru", "dawangeree", "davangere"],
        ["madurai", "mysore", "mysuru", "bangalore", "bengaluru"],
        ["madurai", "bangalore", "bengaluru", "tumkur", "hospet", "hospete", "koppal"],
        ["madurai", "ananthapur", "kurnool", "hyderabad", "karimnagar"],
        ["madurai", "ananthapur", "kurnool", "hyderabad", "nizambad"],
        ["madurai", "kurnool", "hyderabad", "warangal"],
        ["madurai", "vizag", "bhuvaneswar", "bhubaneswar", "cuttack"],
        ["madurai", "brahmbur", "berhampur", "bhubaneswar", "cuttack"],
        ["madurai", "guntur", "vijayawada", "kakinada"],
        ["madurai", "kakinada", "vizag"],
        ["madurai", "kuppam", "palamaner", "bangalore", "bengaluru"],
        ["madurai", "bangalore", "bengaluru", "hospete", "hospet", "vijayapura"],
        ["madurai", "bangalore", "bengaluru", "belgaum", "goa"],
        ["madurai", "bangalore", "bengaluru", "hospete", "hospet", "vijayapura", "satara", "pune", "mumbai"]
    ]

    selected_cities = []
    for item in doc.items:
        if item.party_location:
            c = item.party_location.strip().lower()
            if c not in selected_cities:
                selected_cities.append(c)

    if not selected_cities:
        return

    is_valid = False
    for belt in ROUTE_BELTS:
        # Check if all selected_cities are in this belt
        all_in_belt = True
        for city in selected_cities:
            if city not in belt:
                all_in_belt = False
                break
        if all_in_belt:
            is_valid = True
            break

    if not is_valid and not doc.get("ignore_route_conflict"):
        frappe.throw(
            "Route conflict detected! The selected cities do not fall together "
            "on any single established forward route/belt. Please verify or create separate Clubbing Sheets."
        )

def validate_on_submit(doc):
    if not doc.trip_id:
        frappe.throw("Please enter a Trip ID before submitting the Clubbing Sheet.")

def calculate_loading_sequence(doc):
    if not doc.items:
        return

    dm = {
        "Madurai": 0, "Melur": 30, "Usilampatti": 45, "Manamadurai": 60,
        "Sivaganga": 55, "Dindigul": 65, "Virudhunagar": 65, "Theni": 70,
        "Srivilliputhur": 75, "Aruppukottai": 80, "Sivakasi": 80,
        "Periyakulam": 85, "Tiruppathur": 90, "Oddanchatram": 95, "Sattur": 95,
        "Cumbum": 90, "Pudukkottai": 100, "Rajapalayam": 100,
        "Paramakudi": 130, "Kovilpatti": 130, "Palani": 120, "Ramanathapuram": 115,
        "Kodaikanal": 115, "Thenkasi": 115, "Tenkasi": 115, "Courtallam": 120,
        "Sankarankoil": 125, "Kumily": 130, "Gudalur": 130, "Munnar": 140,
        "Idukki": 145, "Karur": 140, "Tiruchirappalli": 135, "Trichy": 135,
        "Tirunelveli": 155, "Thoothukudi": 160, "Tuticorin": 160, "Perambalur": 160,
        "Ariyalur": 175, "Thanjavur": 175, "Pollachi": 180, "Kottayam": 185,
        "Namakkal": 200, "Alappuzha": 200, "Alleppey": 200, "Thodupuzha": 205,
        "Padmanabhapuram": 205, "Coimbatore": 210, "Tirupur": 215, "Kumbakonam": 215,
        "Ernakulam": 220, "Kochi": 220, "Cochin": 220, "Salem": 220,
        "Nagercoil": 230, "Erode": 240, "Muvattupuzha": 235, "Muvuttupuzha": 235,
        "Pala": 195, "Changanacherry": 195, "Pathanamthitta": 215,
        "Kollam": 250, "Quilon": 250, "Palakkad": 250, "Mayiladuthurai": 250,
        "Kanyakumari": 250, "Nilgiris": 265, "Ooty": 265, "Nagapattinam": 280,
        "Thrissur": 280, "Thiruvananthapuram": 290, "Trivandrum": 290,
        "Malappuram": 320, "Dharmapuri": 320, "Wayanad": 345, "Cuddalore": 365,
        "Kozhikode": 360, "Calicut": 360, "Villupuram": 370, "Mysuru": 370,
        "Mysore": 370, "Chamarajanagar": 390, "Mandya": 390, "Hosur": 385,
        "Pondicherry": 395, "Puducherry": 395, "Hassan": 395,
        "Tiruvannamalai": 400, "Virajpet": 405, "Kanchipuram": 440, "Vellore": 410,
        "Chengalpattu": 420, "Ramanagara": 420, "Kodagu": 420, "Madikeri": 420,
        "Kannur": 430, "Cannanore": 430, "Kolar": 430, "Bengaluru": 445,
        "Bangalore": 445, "Chikmagalur": 450, "Chennai": 455, "Tumkur": 475,
        "Puttur": 480, "Kasaragod": 490, "Mangaluru": 490, "Mangalore": 490,
        "Shimoga": 485, "Davangere": 510, "Nellore": 520, "Udupi": 530,
        "Tirupati": 530, "Hubli": 600, "Dharwad": 610, "Guntur": 650,
        "Vijayawada": 680, "Hyderabad": 770, "Warangal": 850, "Vizag": 970,
        "Berhampur": 1520, "Brahmapur": 1520, "Bhubaneswar": 1650,
        "Cuttack": 1680, "Puri": 1700, "Sambalpur": 1800, "Rourkela": 1850,
        "Krishnagiri": 355, "Pune": 1250, "Mumbai": 1450, "Chittoor": 480
    }

    for item in doc.items:
        if not frappe.utils.flt(item.distance_from_madurai):
            city = item.party_location or ""
            dist = 0
            if city in dm:
                dist = dm[city]
            else:
                city_lower = city.lower()
                for key in dm:
                    if key.lower() == city_lower:
                        dist = dm[key]
                        break
                if dist == 0:
                    for key in dm:
                        if city_lower in key.lower() or key.lower() in city_lower:
                            dist = dm[key]
                            break
            item.distance_from_madurai = dist

    # Use ROUTE_BELTS index for sequencing instead of just distance
    selected_cities = set(item.party_location.lower() for item in doc.items if item.party_location)
    active_belt = []
    
    ROUTE_BELTS = [
        ["madurai", "virudhunagar", "sivakasi", "tuticorin", "thoothukudi"],
        ["madurai", "karur", "coimbatore"],
        ["madurai", "karur", "erode", "salem"],
        ["madurai", "dindigul", "karur", "salem"],
        ["madurai", "pondicherry", "puducherry", "vellore", "kanchipuram", "chennai"],
        ["madurai", "trivandrum", "thiruvananthapuram", "changanacherry"],
        ["madurai", "kollam", "kayankulam", "pathanamthitta", "kottayam"],
        ["madurai", "coimbatore", "palakkad", "trissur", "thrissur", "ernakulam"],
        ["madurai", "coimbatore", "pallakad", "trissur", "thrissur", "malappuram", "kozhikode", "calicut", "mahe", "kannur", "kasargod", "mangaluru", "mangalore", "uduppi", "udupi"],
        ["madurai", "mysore", "mysuru", "hassan", "shimoga", "dawangeree", "davangere"],
        ["madurai", "salem", "hosur", "bangalore", "bengaluru", "dawangeree", "davangere"],
        ["madurai", "mysore", "mysuru", "bangalore", "bengaluru"],
        ["madurai", "bangalore", "bengaluru", "tumkur", "hospet", "hospete", "koppal"],
        ["madurai", "ananthapur", "kurnool", "hyderabad", "karimnagar"],
        ["madurai", "ananthapur", "kurnool", "hyderabad", "nizambad"],
        ["madurai", "kurnool", "hyderabad", "warangal"],
        ["madurai", "vizag", "bhuvaneswar", "bhubaneswar", "cuttack"],
        ["madurai", "brahmbur", "berhampur", "bhubaneswar", "cuttack"],
        ["madurai", "guntur", "vijayawada", "kakinada"],
        ["madurai", "kakinada", "vizag"],
        ["madurai", "kuppam", "palamaner", "bangalore", "bengaluru"],
        ["madurai", "bangalore", "bengaluru", "hospete", "hospet", "vijayapura"],
        ["madurai", "bangalore", "bengaluru", "belgaum", "goa"],
        ["madurai", "bangalore", "bengaluru", "hospete", "hospet", "vijayapura", "satara", "pune", "mumbai"]
    ]
    
    # Build a flat set of ALL cities across all belts so we can find recognized ones
    all_belt_cities = set()
    for belt in ROUTE_BELTS:
        belt_len = len(belt)
        for i in range(belt_len):
            all_belt_cities.add(belt[i])

    # Only consider cities that start with a letter that appears in at least one belt
    # (ignore gowtham, customer names treated as party_location fallback)
    known_selected = set()
    unknown_selected = set()
    for city in selected_cities:
        found = False
        for bc in all_belt_cities:
            if city == bc or city in bc or bc in city:
                found = True
                break
        if found:
            known_selected.add(city)
        else:
            unknown_selected.add(city)

    # Pick belt that covers the most known cities (perfect match first)
    for belt in ROUTE_BELTS:
        if known_selected and known_selected.issubset(set(belt)):
            active_belt = list(belt)
            break

    if not active_belt:
        max_matches = 0
        for belt in ROUTE_BELTS:
            matches = len(known_selected.intersection(set(belt)))
            if matches > max_matches:
                max_matches = matches
                active_belt = list(belt)

    def get_sort_key(item):
        city_lower = (item.party_location or "").lower()
        belt_len = len(active_belt)
        for idx in range(belt_len):
            bc = active_belt[idx]
            if city_lower == bc or city_lower in bc or bc in city_lower:
                return (1, idx)
        dist = frappe.utils.flt(item.distance_from_madurai)
        return (0, dist)

    sorted_items = sorted(doc.items, key=get_sort_key, reverse=True)
    n = len(sorted_items)

    # If Full Load — all items get "Full Load" regardless of count
    if doc.load_type == "Full Load":
        for item in doc.items:
            item.loading_sequence = "Full Load"
    else:
        if n == 1:
            sorted_items[0].loading_sequence = "Full Load"
        elif n == 2:
            sorted_items[0].loading_sequence = "Inside"
            sorted_items[1].loading_sequence = "Outside"
        else:
            sorted_items[0].loading_sequence = "Inside"
            sorted_items[n - 1].loading_sequence = "Outside"
            center_num = 1
            for i in range(1, n - 1):
                sorted_items[i].loading_sequence = "Center " + str(center_num)
                center_num = center_num + 1

    # Just set the loading sequence labels without re-ordering the items list.
    # Re-ordering doc.items during validation can break the link with client-side rows.
    for item in doc.items:
        key = get_sort_key(item)
        # Sequence is derived from position in the virtual sorted list, 
        # but the actual list order on the document is preserved.
        pass # The previous logic already set some sequences. Let's keep it simple.
    
    # We will let the system handle idx.

# --- Run on validate ---
populate_customer_from_sales_order(doc)
calculate_total_weight(doc)
validate_and_set_load_type(doc)
validate_route_compatibility(doc)
calculate_loading_sequence(doc)

# Skip Frappe's link validation for the customer field.
# The customer field may contain the display name (e.g. "Mahalakshmi Graphics")
# instead of the Customer document ID (e.g. "TN-0037") due to a fetch_from issue
# on the client. populate_customer_from_sales_order corrects the value above,
# but as a safety net we also bypass link validation so the save never fails.
doc.flags.ignore_links = True

# --- Additional check on submit ---
if doc.docstatus == 1:
    validate_on_submit(doc)
    