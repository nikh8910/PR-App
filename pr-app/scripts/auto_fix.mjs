import fs from 'fs';

const reportPath = 'scan_report.json';
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

let filesFixed = 0;

for (const item of report.findings) {
    const filePath = item.file;
    if (!fs.existsSync(filePath)) continue;

    const issues = item.issues.filter(i => i.type === 'non_compliant_action_button');
    if (issues.length === 0) continue;

    // Skip false positives in Menu etc if needed, but ui_auditor rules are now stable
    
    let content = fs.readFileSync(filePath, 'utf8');
    let lines = content.split('\n');
    let modified = false;

    for (const issue of issues) {
        const match = issue.snippet.match(/Line\s+(\d+):/);
        if (match) {
            const lineIdx = parseInt(match[1], 10) - 1;
            if (lineIdx >= 0 && lineIdx < lines.length) {
                let line = lines[lineIdx];
                
                const missing = [];
                if (issue.detail.includes('w-full') && !line.includes('w-full')) missing.push('w-full');
                if (issue.detail.includes('bg-brand-blue') && !line.includes('bg-brand-blue')) missing.push('bg-brand-blue');
                if (issue.detail.includes('text-white') && !line.includes('text-white')) missing.push('text-white');

                if (missing.length === 0) continue;

                const classesStr = missing.join(' ');

                if (line.includes('className="')) {
                    // remove wrong colors
                    line = line.replace(/bg-(blue|slate|gray)-\d+/g, '');
                    line = line.replace('className="', `className="${classesStr} `);
                    lines[lineIdx] = line;
                    modified = true;
                } else if (line.includes('className={`')) {
                    line = line.replace(/bg-(blue|slate|gray)-\d+/g, '');
                    line = line.replace('`}', ` ${classesStr}\`}`);
                    lines[lineIdx] = line;
                    modified = true;
                } else if (!line.includes('className=')) {
                    // if it has no className (like <Button>), add it
                    if (line.includes('<Button ') || line.includes('<button ')) {
                        line = line.replace('<Button ', `<Button className="${classesStr}" `);
                        line = line.replace('<button ', `<button className="${classesStr}" `);
                        lines[lineIdx] = line;
                        modified = true;
                    }
                }
            }
        }
    }

    if (modified) {
        fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
        filesFixed++;
        console.log("Fixed:", filePath);
    }
}

console.log(`Fixed ${filesFixed} files.`);
