import json

with open("scan_report.json", "r", encoding="utf-8") as f:
    report = json.load(f)

manual_tasks = []
auto_fixable = []

for item in report["findings"]:
    file_path = item["file"]
    manual_issues = []
    auto_issues = []
    
    for issue in item["issues"]:
        if issue["type"] == "illegal_top_button" or issue["type"] == "missing_padding":
            # moving elements or fixing layout wrapper padding is complex/high-risk
            manual_issues.append(issue)
        elif issue["type"] == "non_compliant_action_button":
            # if it's just adding classes, it can be auto-fixed or manually patched easily
            # But wait, we saw some buttons are menu navigation cards (Warehouse*.jsx)
            if "Warehouse" in file_path and ("Manage" in issue["detail"] or "Stock by" in issue["detail"] or "HU to HU" in issue["detail"]):
                # false positive navigation tile
                pass
            else:
                auto_issues.append(issue)

    if manual_issues:
        manual_tasks.append({"file": file_path, "issues": manual_issues})
    if auto_issues:
        auto_fixable.append({"file": file_path, "issues": auto_issues})

# Write the manual tasks to an artifact markdown format
md_content = "# Manual Fix Tasks\n\nThese tasks require moving elements out of the header or restructuring padding.\n\n"

for task in manual_tasks:
    md_content += f"## `{task['file']}`\n"
    for issue in task['issues']:
        md_content += f"- **{issue['type']}**: {issue['detail']} (Snippet: `{issue['snippet'].strip()}`)\n"
    md_content += "\n"

md_content += "# Auto-Fixable / Style Only Tasks\n\nThese just need `w-full bg-brand-blue text-white` added.\n\n"
for task in auto_fixable:
    md_content += f"## `{task['file']}`\n"
    for issue in task['issues']:
        md_content += f"- **{issue['type']}**: {issue['detail']}\n"
    md_content += "\n"

with open("manual_fix_tasks_list.md", "w", encoding="utf-8") as f:
    f.write(md_content)

print(f"Generated manual_fix_tasks_list.md with {len(manual_tasks)} manual files and {len(auto_fixable)} auto-fixable files.")
