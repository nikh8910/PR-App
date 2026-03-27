import fs from 'fs';
import path from 'path';

const srcDir = path.join(process.cwd(), 'src', 'pages');

function walk(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            walk(filePath, fileList);
        } else if (filePath.endsWith('.jsx')) {
            fileList.push(filePath);
        }
    }
    return fileList;
}

const files = walk(srcDir);
let changedCount = 0;

for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    let changed = false;

    // 1. Remove flex justify-end from the wrapper of Sticky Footers
    const regexWrapper = /<div className="([^"]*?)flex\s+(?:items-baseline\s+)?justify-end([^"]*)"/g;
    content = content.replace(regexWrapper, (match, before, after) => {
        if (content.substring(Math.max(0, content.indexOf(match) - 50), content.indexOf(match)).includes('Footer') ||
            after.includes('w-full') || before.includes('w-full') || after.includes('mt-6') ||
            match.includes('items-baseline justify-end gap-1') || match.includes('justify-end items-center')) {

            if (match.includes('items-baseline') || match.includes('items-center mb-0')) return match;

            changed = true;
            return `<div className="${before.trim()} ${after.trim()} w-full"`.replace(/\s+/g, ' ');
        }
        return match;
    });

    const specificReplaces = [
        ['<div className="flex justify-end gap-3 w-full mt-6 mb-2">', '<div className="bg-white border-t border-slate-200 px-4 py-3 shrink-0 w-full mt-6 mb-2">'],
        ['<div className="flex justify-end w-full mt-6 mb-2">', '<div className="bg-white border-t border-slate-200 px-4 py-3 shrink-0 w-full mt-6 mb-2">'],
        ['<div className="flex justify-end w-full">', '<div className="bg-white border-t border-slate-200 px-4 py-3 shrink-0 w-full mt-6 mb-2">'],
        ['<div className="mt-8 flex justify-end gap-3 pt-6 border-t border-slate-200">', '<div className="bg-white border-t border-slate-200 px-4 py-3 shrink-0 w-full mt-6 mb-2">'],
        ['className="py-3 px-8 rounded-xl w-full sm:w-auto bg-brand-blue hover:bg-opacity-90 text-white font-bold shadow-md flex items-center justify-center gap-2"', 'className="w-full bg-brand-blue hover:bg-opacity-90 text-white font-bold py-3.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-[0.98]"'],
        ['className="py-3 px-8 rounded-xl w-full sm:w-auto bg-white border-2 border-slate-200 text-slate-700 font-bold shadow-sm hover:bg-slate-50 flex items-center justify-center gap-2"', 'className="w-full bg-white border-2 border-slate-200 text-slate-700 font-bold py-3.5 rounded-xl shadow-sm hover:bg-slate-50 flex items-center justify-center gap-2"'],
        ['className="w-full sm:w-auto px-6 py-3 bg-brand-blue text-white rounded-lg font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2 shadow-md"', 'className="w-full bg-brand-blue hover:bg-opacity-90 text-white font-bold py-3.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-[0.98]"'],
        ['className="w-full sm:w-auto px-6 py-3 bg-slate-200 text-slate-700 rounded-lg font-bold hover:bg-slate-300 transition flex items-center justify-center gap-2 shadow-sm"', 'className="w-full bg-slate-200 text-slate-700 font-bold py-3.5 rounded-xl shadow-sm hover:bg-slate-300 transition flex items-center justify-center gap-2"'],
        ['className="w-full sm:w-auto py-2.5 px-4 bg-red-50 text-red-600 rounded-lg font-bold hover:bg-red-100 transition-colors flex items-center justify-center gap-2"', 'className="w-full bg-red-50 text-red-600 font-bold py-3.5 rounded-xl hover:bg-red-100 transition-colors flex items-center justify-center gap-2"']
    ];

    for (const [search, replaceCmd] of specificReplaces) {
        if (content.includes(search)) {
            content = content.replace(search, replaceCmd);
            changed = true;
        }
    }

    const regexBtn = /className="([^"]*?)sm:w-auto([^"]*?)"/g;
    if (regexBtn.test(content)) {
        content = content.replace(regexBtn, (m, b, a) => `className="${b.trim()} ${a.trim()}"`);
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(file, content);
        changedCount++;
        console.log('Fixed', file);
    }
}
console.log('Total fixed:', changedCount);
