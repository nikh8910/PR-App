import fs from 'fs';
import path from 'path';

function findJsxFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            findJsxFiles(fullPath, fileList);
        } else if (fullPath.endsWith('.jsx')) {
            fileList.push(fullPath);
        }
    }
    return fileList;
}

const files = findJsxFiles('./src/pages');
let fixedCount = 0;

for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    // Remove marginTop: '-1.5rem' from inline styles (in various quote/spacing formats)
    // Pattern: marginTop: '-1.5rem'  or  marginTop: "-1.5rem"
    content = content.replace(/,?\s*marginTop:\s*['"]-1\.5rem['"]/g, '');
    content = content.replace(/,?\s*marginTop:\s*['"]-2rem['"]/g, '');
    content = content.replace(/,?\s*marginTop:\s*['"]-.+?['"]/g, '');

    // Also remove -mt-2 / -mt-4 tailwind classes from main content divs (not headers)
    // We'll be selective: only remove from divs that also have "overflow-y-auto" and "content-area"
    // Use a regex that removes the -mt-N class from those specific divs
    content = content.replace(/(flex-1 overflow-y-auto[^"]*)\s+-mt-\d+/g, '$1');

    // Clean up empty style objects left behind: style={{  }} or style={{ , zIndex: 10 }}
    content = content.replace(/style=\{\{\s*,\s*/g, 'style={{ ');
    content = content.replace(/style=\{\{\s*\}\}/g, '');

    if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        fixedCount++;
        console.log(`Fixed: ${file}`);
    }
}

console.log(`\nTotal files fixed: ${fixedCount}`);
