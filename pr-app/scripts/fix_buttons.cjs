const fs = require('fs');
const path = require('path');

function processDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDir(fullPath);
        } else if (file.endsWith('.jsx')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let original = content;

            // Replace alignment wrapper
            content = content.replace(/className="flex justify-end w-full mt-2"/g, 'className="w-full mt-2"');
            content = content.replace(/className="flex justify-end w-full mt-4"/g, 'className="w-full mt-4"');
            content = content.replace(/className="bg-white border-t border-slate-200 px-4 py-3 shrink-0 flex justify-end w-full mt-6 mb-2"/g, 'className="bg-white border-t border-slate-200 px-4 py-3 shrink-0 w-full mt-6 mb-2"');

            // PhysicalInventory/PICount specific footers
            content = content.replace(/className="p-4 bg-white border-t flex justify-end gap-3 rounded-b-xl shadow-sm border border-slate-200 mt-2"/g, 'className="p-4 bg-white border-t w-full rounded-b-xl shadow-sm border border-slate-200 mt-2"');
            content = content.replace(/className="w-full max-w-md mx-auto p-4 border-t bg-white flex justify-end shrink-0"/g, 'className="w-full max-w-md mx-auto p-4 border-t bg-white shrink-0"');

            // Replace button classes
            content = content.replace(/bg-brand-blue hover:bg-opacity-90 text-white font-bold py-3 px-8 rounded-xl shadow-md transition-all flex items-center justify-center gap-2/g, 'w-full bg-brand-blue hover:bg-opacity-90 text-white font-bold py-3.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-[0.98]');

            if (content !== original) {
                fs.writeFileSync(fullPath, content);
                console.log('Updated', fullPath);
            }
        }
    }
}
processDir('c:/Users/nikh8/PR/pr-app/src/pages');
