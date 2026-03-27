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
let fixedCounts = { Button: 0, Input: 0, Select: 0, Heading: 0 };

for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    let modified = false;

    const absolutePagesDir = path.resolve(process.cwd(), 'src/pages');
    const absoluteFile = path.resolve(file);
    const relativeToPages = path.relative(absolutePagesDir, absoluteFile);
    
    const depth = relativeToPages.split(path.sep).length - 1; 
    const prefix = depth === 0 ? '../' : '../../';

    const components = ['Button', 'Input', 'Select', 'Heading'];

    for (const comp of components) {
        // Regex to check if component is used but not imported
        if (content.match(new RegExp(`<${comp}[\\s>]`)) && !content.includes(`import { ${comp} }`)) {
            const importStatement = `import { ${comp} } from '${prefix}components/ui/${comp}';`;
            const lines = content.split('\n');
            let insertIdx = 0;
            
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith('import ')) {
                    insertIdx = i + 1;
                } else if (lines[i].includes('const ') || lines[i].includes('function ')) {
                    break;
                }
            }
            
            lines.splice(insertIdx, 0, importStatement);
            content = lines.join('\n');
            modified = true;
            fixedCounts[comp]++;
            console.log(`Added missing ${comp} import to: ${file}`);
        }
    }

    if (modified) {
        fs.writeFileSync(file, content, 'utf8');
    }
}
console.log('Fixed imports:', fixedCounts);
