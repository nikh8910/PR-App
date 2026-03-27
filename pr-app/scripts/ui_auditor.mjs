import fs from 'fs';
import path from 'path';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import { fileURLToPath } from 'url';

const traverse = _traverse.default || _traverse;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pagesDir = path.join(__dirname, 'src', 'pages');

const getFiles = (dir, files = []) => {
    const list = fs.readdirSync(dir);
    for (const file of list) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            getFiles(fullPath, files);
        } else if (fullPath.endsWith('.jsx')) {
            files.push(fullPath);
        }
    }
    return files;
};

const files = getFiles(pagesDir);

const report = {
    summary: { total_screens: files.length, compliant: 0, needing_attention: 0 },
    findings: []
};

// Top blue area rules: back, home buttons allowed. 
// Action buttons: Post, Submit, Confirm, Save, Delete, Search.
// Full width: class includes w-full.
// Blue bg: bg-brand-blue or bg-[#1e3a8a].
// White text: text-white.

const isActionWord = (str) => /\b(Post|Submit|Confirm|Save|Search|Delete|Transfer|Count|Add)\b/i.test(str);

for (const file of files) {
    const code = fs.readFileSync(file, 'utf-8');
    let ast;
    try {
        ast = parse(code, {
            sourceType: 'module',
            plugins: ['jsx']
        });
    } catch (e) {
        console.error(`Error parsing ${file}:`, e.message);
        continue;
    }

    const issues = [];
    
    traverse(ast, {
        JSXElement(pathNode) {
            const opening = pathNode.node.openingElement;
            const name = opening.name.name;
            
            // 1. Identify Header / Top Blue Area
            let isHeader = false;
            if (name === 'header') isHeader = true;
            
            let classNameAttr = opening.attributes.find(a => a.name && a.name.name === 'className');
            let classStr = '';
            if (classNameAttr && classNameAttr.value && classNameAttr.value.type === 'StringLiteral') {
                classStr = classNameAttr.value.value;
                if (classStr.includes('app-header') || classStr.includes('bg-[#1e3a8a]') || classStr.includes('bg-brand-blue')) {
                    // Check if it's fixed or absolute at the top to confirm it's a header area
                    if (classStr.includes('top-0') || name === 'header' || classStr.includes('app-header')) {
                        isHeader = true;
                    }
                }
            }

            if (isHeader) {
                // Find all buttons inside this header
                pathNode.traverse({
                    JSXElement(innerPath) {
                        const innerName = innerPath.node.openingElement.name.name;
                        if (innerName === 'button' || innerName === 'Button') {
                            // Inspect this button
                            let isAllowed = false;
                            
                            // Check icons (children)
                            innerPath.traverse({
                                JSXOpeningElement(iconPath) {
                                    const iconName = iconPath.node.name.name;
                                    if (iconName === 'ArrowLeft' || iconName === 'Home') {
                                        isAllowed = true;
                                    }
                                }
                            });
                            
                            // Check onClick behavior (e.g. navigate(-1))
                            const onClickAttr = innerPath.node.openingElement.attributes.find(a => a.name && a.name.name === 'onClick');
                            if (onClickAttr && code.substring(onClickAttr.start, onClickAttr.end).includes('navigate(-1)')) {
                                isAllowed = true;
                            }
                            if (onClickAttr && code.substring(onClickAttr.start, onClickAttr.end).includes('navigate(\'/menu\')')) {
                                isAllowed = true;
                            }

                            if (!isAllowed) {
                                issues.push({
                                    type: "illegal_top_button",
                                    severity: "high",
                                    detail: "Non-allowed button (not Back or Home) found in Top Blue Area.",
                                    snippet: `Line ${innerPath.node.loc.start.line}: <${innerName} ...>`
                                });
                            }
                        }
                    }
                });
            }

            // 2. Identify Action Buttons
            if (name === 'button' || name === 'Button') {
                // Extract inner text
                let textContent = '';
                pathNode.traverse({
                    JSXText(textPath) {
                        textContent += textPath.node.value + ' ';
                    }
                });
                
                if (isActionWord(textContent)) {
                    // It's an action button. Check classes.
                    let isFullWidth = classStr.includes('w-full') || classStr.includes('flex-1');
                    let isBlueBg = classStr.includes('bg-brand-blue') || classStr.includes('bg-[#1e3a8a]') || classStr.includes('bg-blue-');
                    let isWhiteText = classStr.includes('text-white');
                    
                    let missing = [];
                    if (!isFullWidth) missing.push('w-full');
                    if (!isBlueBg) missing.push('bg-brand-blue');
                    if (!isWhiteText) missing.push('text-white');
                    
                    if (missing.length > 0) {
                        issues.push({
                            type: "non_compliant_action_button",
                            severity: "medium",
                            detail: `Action button '${textContent.trim()}' is missing required classes: ${missing.join(', ')}`,
                            snippet: `Line ${pathNode.node.loc.start.line}: className="${classStr}"`
                        });
                    }
                    
                    // Check if it's placed inside top blue area (already handled above, but good to cross-check if we want)
                }
            }
            
            // 3. Layout Padding (Heuristic on main visual wrappers)
            if (name === 'main' || (name === 'div' && classStr.includes('flex-1') && classStr.includes('overflow'))) {
                let hasPadding = false;
                if (classStr.match(/\bp-\d+/)) hasPadding = true;
                if (classStr.match(/\bpx-\d+/) && classStr.match(/\bpy-\d+/)) hasPadding = true;
                if (classStr.match(/\bpx-\d+/) && classStr.match(/\bpt-\d+/)) hasPadding = true;
                
                // Allow style objects with padding too (very naive check)
                let styleAttr = opening.attributes.find(a => a.name && a.name.name === 'style');
                if (styleAttr && code.substring(styleAttr.start, styleAttr.end).includes('padding')) {
                    hasPadding = true;
                }

                if (!hasPadding && !classStr.includes('p-')) {
                    issues.push({
                        type: "missing_padding",
                        severity: "low",
                        detail: `Main content wrapper missing padding tokens (e.g. p-4, px-4).`,
                        snippet: `Line ${pathNode.node.loc.start.line}: className="${classStr}"`
                    });
                }
            }
        }
    });
    
    if (issues.length > 0) {
        report.summary.needing_attention++;
        report.findings.push({
            file: path.relative(__dirname, file),
            issues
        });
    } else {
        report.summary.compliant++;
    }
}

fs.writeFileSync('scan_report.json', JSON.stringify(report, null, 2));
console.log(`Scan complete. ${report.summary.total_screens} files analyzed.`);
console.log(`Compliant: ${report.summary.compliant}, Needing Attention: ${report.summary.needing_attention}`);
