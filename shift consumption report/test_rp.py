import os
from RestrictedPython import compile_restricted
from RestrictedPython import safe_builtins

def check_file(filename):
    print(f"\nChecking {filename}...")
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            code = f.read()
        compile_restricted(code, filename='<string>', policy=None) # We just want the syntax check
        print("Success! No restricted python syntax errors.")
    except SyntaxError as e:
        print(f"SyntaxError: {str(e)}")
    except Exception as e:
        print(f"Error: {str(e)}")

check_file("get_shift_details.py")
check_file("shift_production_submit.py")
check_file("get_patty_balance.py")
check_file("get_patty_stock_options.py")
check_file("shift_production_entry.py")
