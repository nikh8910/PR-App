import os
import glob
import re
import json

src_dir = "src/pages"
components_dir = "src/components"

screens = glob.glob(os.path.join(src_dir, "**/*.jsx"), recursive=True)

report = {
    "summary": {
        "total_screens": len(screens),
        "compliant": 0,
        "needing_attention": 0
    },
    "findings": []
}

def analyze_screen(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    findings = []
    issues = 0

    # 1. Look for Header / Top Blue Area
    # Heuristic: <header ...> ... </header> or <div className="...app-header... bg-[#1e3a8a]...">
    
    # We will just parse the whole file for components that look like headers
    header_matches = re.finditer(r'<header[^>]*?className=[^>]*?(?:bg-\[\#1e3a8a\]|bg-brand-blue|app-header)[^>]*?>([\s\S]*?)</header>', content)
    
    for match in header_matches:
        header_content = match.group(1)
        # Find all buttons in header
        buttons = re.findall(r'<(?:button|Button)[^>]*>([\s\S]*?)</(?:button|Button)>', header_content)
        for btn in buttons:
            # check what icons or text are inside
            is_back = 'ArrowLeft' in btn or 'navigate(-1)' in btn or 'navigate(' in btn
            is_home = 'Home' in btn or 'navigate(\'/menu\')' in btn
            is_scan = 'Scan' in btn or 'Scanner' in btn
            is_filter = 'Filter' in btn or 'Search' in btn
            is_action = 'Post' in btn or 'Submit' in btn or 'Confirm' in btn or 'Save' in btn
            
            if not (is_back or is_home):
                findings.append({
                    "type": "illegal_top_button",
                    "severity": "high",
                    "detail": "Action or non-navigation button found in top blue header area",
                    "snippet": btn.strip()[:100]
                })
                issues += 1

    # 2. Look for action buttons everywhere
    # Action buttons usually contain specific text
    button_matches = re.finditer(r'<(?:button|Button)([^>]*)>([\s\S]*?)</(?:button|Button)>', content)
    for match in button_matches:
        attrs = match.group(1)
        inner = match.group(2)
        text_content = re.sub(r'<[^>]+>', '', inner).strip()
        
        is_action = re.search(r'\b(Post|Submit|Confirm|Save|Search|Delete|Transfer|Count|Add)\b', text_content, re.IGNORECASE)
        
        # If it's an action button, it must be full width and blue
        if is_action:
            missing_full_width = 'w-full' not in attrs and 'width' not in attrs
            missing_blue_bg = 'bg-brand-blue' not in attrs and 'bg-[#1e3a8a]' not in attrs and 'bg-blue' not in attrs
            missing_white_text = 'text-white' not in attrs and 'color' not in attrs
            
            if missing_full_width or missing_blue_bg or missing_white_text:
                findings.append({
                    "type": "non_compliant_action_button",
                    "severity": "medium",
                    "detail": f"Action button '{text_content}' missing required styling (w-full, primary-blue, text-white)",
                    "snippet": attrs.strip() + " > " + text_content[:50]
                })
                issues += 1

    # 3. Look for Container Padding
    # Usually right after header there's a main or div
    # If we don't see 'p-' or 'px-' or 'pt-' frequently it's bad, but it's hard to statically analyze perfectly.
    # We will flag screens missing standard padding classes in their main wrapper.
    main_matches = re.search(r'<(?:main|div) className="[^"]*(flex-1|h-full)[^"]*">', content)
    if main_matches:
        main_class = main_matches.group(0)
        if 'p-' not in main_class and 'px-' not in main_class and 'pt-' not in main_class:
            findings.append({
                "type": "missing_padding",
                "severity": "low",
                "detail": "Main content wrapper might be missing layout padding tokens (p-4, px-4, pt-4)",
                "snippet": main_class
            })
            issues += 1

    return findings, issues

for screen in screens:
    filename = os.path.basename(screen)
    findings, issue_count = analyze_screen(screen)
    
    if issue_count > 0:
        report["summary"]["needing_attention"] += 1
        report["findings"].append({
            "file": screen,
            "issues": findings
        })
    else:
        report["summary"]["compliant"] += 1

with open("scan_report.json", "w", encoding="utf-8") as f:
    json.dump(report, f, indent=2)

print(f"Scan complete. {report['summary']['total_screens']} screens analyzed.")
print(f"Compliant: {report['summary']['compliant']}, Needing Attention: {report['summary']['needing_attention']}")
