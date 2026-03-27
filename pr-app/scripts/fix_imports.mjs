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
let fixedCounts = 0;

for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    
    // Check if it uses <Button but lacks the exact import
    if (content.match(/<Button[\s>]/) && !content.includes('import { Button }')) {
        // Determine path depth relative to src/pages
        const absolutePagesDir = path.resolve(process.cwd(), 'src/pages');
        const absoluteFile = path.resolve(file);
        const relativeToPages = path.relative(absolutePagesDir, absoluteFile);
        
        const depth = relativeToPages.split(path.sep).length - 1; 
        const prefix = depth === 0 ? '../' : '../../';
        const importStatement = `import { Button } from '${prefix}components/ui/Button';`;
        
        const lines = content.split('\n');
        let insertIdx = 0;
        
        // Find last import
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('import ')) {
                insertIdx = i + 1;
            } else if (lines[i].includes('const ') || lines[i].includes('function ')) {
                break;
            }
        }
        
        lines.splice(insertIdx, 0, importStatement);
        fs.writeFileSync(file, lines.join('\n'), 'utf8');
        fixedCounts++;
        console.log(`Fixed missing Button import in: ${file}`);
    }
}
console.log(`Total fixed: ${fixedCounts}`);
