import re
import glob
import os

files = glob.glob('C:/Users/nikh8/PR/pr-app/src/pages/**/*.jsx', recursive=True)

scan_class = 'w-9 h-9 flex items-center justify-center text-white bg-brand-blue hover:bg-blue-800 rounded-lg shadow-sm transition-all active:scale-95'
list_class = 'w-9 h-9 flex items-center justify-center text-slate-400 hover:text-brand-blue hover:bg-blue-50 bg-slate-100 rounded-lg transition-colors'

def replacer(match):
    button_tag_content = match.group(1)
    icon_tag = match.group(2)
    
    if '<Scan' in icon_tag:
        target_class = scan_class
    elif '<List ' in icon_tag or '<List/' in icon_tag:
        target_class = list_class
    else:
        return match.group(0)
        
    if 'className=' in button_tag_content:
        new_button_tag = re.sub(r'className=(["\'])(?:(?=(\\?))\2.)*?\1', f'className="{target_class}"', button_tag_content)
    else:
        new_button_tag = button_tag_content + f' className="{target_class}"'
        
    return f"<button{new_button_tag}>\n                                            {icon_tag}\n                                        </button>"

count = 0
for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    
    new_content = re.sub(r'<button([^>]*?)>\s*(<(?:Scan|List)\s*[^>]*?/>)\s*</button>', replacer, content)
    
    if new_content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f'Updated {os.path.basename(filepath)}')
        count += 1

print(f'Total files updated: {count}')
