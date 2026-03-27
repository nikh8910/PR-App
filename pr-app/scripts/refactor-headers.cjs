const fs = require('fs');
const path = require('path');

function traverse(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            results = results.concat(traverse(fullPath));
        } else if (fullPath.endsWith('.jsx')) {
            results.push(fullPath);
        }
    });
    return results;
}

const files = traverse('c:/Users/nikh8/PR/pr-app/src');

let count = 0;
for (const file of files) {
    if (file.includes('Dashboard.jsx')) continue; // Exclude Dashboard
    
    let content = fs.readFileSync(file, 'utf8');
    let hasChanges = false;

    // We only process headers that still have pb-8 (target for reduction)
    // Some might have paddingBottom: '32px'
    const headerRegex = /<header className="app-header-straight[^>]*?pb-8[^>]*?>([\s\S]*?)<\/header>|<header className="app-header-straight"[^>]*?paddingBottom:\s*'32px'[^>]*?>([\s\S]*?)<\/header>/g;

    const newContent = content.replace(headerRegex, (match, inner1, inner2) => {
        const innerContent = inner1 || inner2;
        
        // Match the nav div (first child div with justify-between)
        const navDivMatch = innerContent.match(/<div className="[^"]*justify-between[^"]*">([\s\S]*?)<\/div>/);
        const titleDivMatch = innerContent.match(/<div className="flex flex-col items-center justify-center[^>]*">([\s\S]*?)<\/div>/) || 
                              innerContent.match(/<div className="flex flex-col flex-1 min-w-0 items-center[^>]*">([\s\S]*?)<\/div>/);
        
        if (!navDivMatch || !titleDivMatch) {
            console.log('Skipping due to unrecognized structure in:', file);
            return match; // fallback
        }

        const navContent = navDivMatch[1];
        const titleContent = titleDivMatch[1];

        // Extract Title and Subtitle text mapping anything inside h1 or p, including braces and JS expressions
        const h1Match = titleContent.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
        const pMatch = titleContent.match(/<p[^>]*>([\s\S]*?)<\/p>/);

        if (!h1Match) {
            console.log('No h1 found in:', file);
            return match;
        }

        let h1Text = h1Match[1].trim();
        let pText = pMatch ? pMatch[1].trim() : '';

        // Clean up buttons
        // Find buttons natively
        const backBtnMatch = navContent.match(/(<button[^>]*onClick=\{[^}]*navigate\(-1\)[^}]*\}[^>]*>[\s\S]*?<\/button>)/i) || navContent.match(/(<button[^>]*>[\s\S]*?<\/button>)/i);
        
        let remainingNav = navContent.replace(backBtnMatch ? backBtnMatch[1] : '', '');
        const homeBtnMatch = remainingNav.match(/(<button[^>]*onClick=\{[^}]*navigate\('\/menu'\)[^}]*\}[^>]*>[\s\S]*?<\/button>)/i) || remainingNav.match(/(<button[^>]*>[\s\S]*?<\/button>)/i);

        let backBtn = backBtnMatch ? backBtnMatch[1] : '<div></div>';
        let homeBtn = homeBtnMatch ? homeBtnMatch[1] : '<div></div>';

        // Make buttons slightly more compact
        backBtn = backBtn.replace(/p-2/g, 'p-1.5').replace(/size=\{22\}/g, 'size={20}');
        homeBtn = homeBtn.replace(/p-2/g, 'p-1.5').replace(/size=\{22\}/g, 'size={20}');
        
        // Add z-index to buttons
        backBtn = backBtn.replace(/className="/, 'className="z-10 ');
        homeBtn = homeBtn.replace(/className="/, 'className="z-10 ');

        const pTag = pText 
            ? `\n                        <p className="text-blue-200 text-[10px] font-medium uppercase tracking-wider mt-0.5">\n                            ${pText}\n                        </p>`
            : '';

        const newHeader = `<header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                <div className="flex justify-between items-center relative">
                    ${backBtn.replace(/\n/g, '\n                    ')}
                    
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <h1 className="text-xl font-bold text-white tracking-wide">
                            ${h1Text}
                        </h1>${pTag.replace(/\n/g, '\n                        ')}
                    </div>

                    ${homeBtn.replace(/\n/g, '\n                    ')}
                </div>
            </header>`;
        
        hasChanges = true;
        return newHeader;
    });

    if (hasChanges && newContent !== content) {
        fs.writeFileSync(file, newContent, 'utf8');
        console.log('Updated', file);
        count++;
    }
}
console.log('Total files updated:', count);
