const fs = require('fs');
const path = require('path');

function traverse(dir) {
    let results = [];
    for (const file of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            results = results.concat(traverse(fullPath));
        } else if (fullPath.endsWith('.jsx')) {
            results.push(fullPath);
        }
    }
    return results;
}

const files = traverse('src');

let count = 0;
let homeReplaced = 0;
let backReplaced = 0;

for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    // Fix Home button navigations
    // Matches navigate('/menu') or navigate('/menu', ...) and ensures it uses { replace: true }
    content = content.replace(/navigate\(['"]\/(menu)?['"](?:,\s*\{[^}]*\})?\)/g, "navigate('/menu', { replace: true })");

    // Fix Back button navigations inside useSwipeBack
    // Replace useSwipeBack(() => navigate('/some/path')) with useSwipeBack(() => navigate(-1))
    content = content.replace(/useSwipeBack\(\s*\(\)\s*=>\s*navigate\(['"][a-zA-Z0-9/.-]*['"](?:,\s*\{[^}]*\})?\)\s*\)/g, 'useSwipeBack(() => navigate(-1))');

    // Fix explicit Back buttons with hardcoded routes 
    // Match <button ... onClick={() => navigate('/path')} ... title=\"Back\" ...>
    content = content.replace(/(<button[^>]*onClick=\{[^}]*)navigate\(['"][a-zA-Z0-9/.-]*['"](?:,\s*\{[^}]*\})?\)([^}]*\}[^>]*title=["']Back["'][^>]*>)/g, (match, p1, p2) => {
        return p1 + 'navigate(-1)' + p2;
    });

    if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        console.log('Updated:', file);
        count++;
    }
}

console.log('Total files updated:', count);
