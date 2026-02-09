import os

search_str = "proguard-android.txt"
root_dir = r"..\node_modules"

found = False
for dirpath, dirnames, filenames in os.walk(root_dir):
    for filename in filenames:
        if filename.endswith(".gradle"):
            filepath = os.path.join(dirpath, filename)
            try:
                with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                    if search_str in content:
                        print(f"FOUND in: {filepath}")
                        found = True
            except Exception as e:
                print(f"Error reading {filepath}: {e}")

if not found:
    print("Not found anywhere.")
