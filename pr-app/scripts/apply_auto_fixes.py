import json
import re
import os

with open('scan_report.json', 'r', encoding='utf-8') as f:
    report = json.load(f)

for item in report['findings']:
    file_path = item['file']
    
    # Only process if ALL issues are non_compliant_action_button
    issues = item['issues']
    has_only_action_btns = all(i['type'] == 'non_compliant_action_button' for i in issues)
    if not has_only_action_btns:
        continue
        
    # Ignore false positive navigation tiles in Warehouse screens
    if 'Warehouse' in file_path and any('Manage' in i['detail'] or 'Stock by' in i['detail'] or 'HU to HU' in i['detail'] for i in issues):
        continue

    if not os.path.exists(file_path):
        continue

    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    modified = False

    for issue in issues:
        # Extract line content from the snippet to help find it
        snippet = issue['snippet'].strip()
        # Find the line number from the snippet if possible (Line X:)
        match = re.search(r'Line\s+(\d+):', issue['snippet'])
        if match:
            line_idx = int(match.group(1)) - 1
            if 0 <= line_idx < len(lines):
                line = lines[line_idx]
                
                # Check if it has a className attribute
                if 'className="' in line:
                    # Identify missing classes
                    missing_classes = []
                    if 'w-full' in issue['detail'] and 'w-full' not in line:
                        missing_classes.append('w-full')
                    if 'bg-brand-blue' in issue['detail'] and 'bg-brand-blue' not in line:
                        missing_classes.append('bg-brand-blue')
                    if 'text-white' in issue['detail'] and 'text-white' not in line:
                        missing_classes.append('text-white')

                    if missing_classes:
                        # Add them inside the className string
                        # e.g. className="btn px-4 bg-blue-500" -> className="btn px-4 bg-brand-blue text-white w-full"
                        
                        # First, remove incorrect background colors
                        line = re.sub(r'bg-\w+-\d+', '', line)
                        # Remove incorrect text colors (like text-white/50 if text-white is needed, though maybe risky, let's just append)
                        
                        insert_str = ' ' + ' '.join(missing_classes)
                        
                        # Insert right after className="
                        line = line.replace('className="', f'className="{insert_str.strip()} ', 1)
                        # Clean up double spaces
                        line = re.sub(r'\s+', ' ', line)
                        # Restore indentation
                        indent = len(lines[line_idx]) - len(lines[line_idx].lstrip())
                        lines[line_idx] = (' ' * indent) + line.strip() + '\n'
                        modified = True
                elif 'className={`' in line:
                    # Template literal classes
                    missing_classes = []
                    if 'w-full' in issue['detail'] and 'w-full' not in line:
                        missing_classes.append('w-full')
                    if 'bg-brand-blue' in issue['detail'] and 'bg-brand-blue' not in line:
                        missing_classes.append('bg-brand-blue')
                    if 'text-white' in issue['detail'] and 'text-white' not in line:
                        missing_classes.append('text-white')

                    if missing_classes:
                        # Append before the closing backtick
                        insert_str = ' ' + ' '.join(missing_classes)
                        
                        # First, remove incorrect background/text colors in the static part
                        line = re.sub(r'bg-(slate|gray|blue)-\d+', '', line)
                        
                        line = line.replace('`} ', f'{insert_str}`}} ')
                        line = line.replace('`}>', f'{insert_str}`}}>')
                        
                        indent = len(lines[line_idx]) - len(lines[line_idx].lstrip())
                        lines[line_idx] = (' ' * indent) + line.strip() + '\n'
                        modified = True

    if modified:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.writelines(lines)
        print(f"Auto-fixed {file_path}")

print("Auto-fix script completed.")
