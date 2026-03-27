import fs from 'fs';
import * as parser from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';

const traverse = _traverse.default || _traverse;
const generate = _generate.default || _generate;

const autoFixFile = 'scan_report.json';
const report = JSON.parse(fs.readFileSync(autoFixFile, 'utf8'));

// Filter to only the files we want to auto-fix (mostly non_compliant_action_button)
const autoFixableFindings = report.findings.filter(item => {
    // Only process if all issues are non_compliant_action_button and it's not a warehouse nav tile
    const hasOnlyActionBtnIssues = item.issues.every(i => i.type === 'non_compliant_action_button');
    if (!hasOnlyActionBtnIssues) return false;
    
    // Ignore Warehouse navigation tiles
    if (item.file.includes('Warehouse') && item.issues.some(i => i.detail.includes('Manage') || i.detail.includes('Stock by') || i.detail.includes('HU to HU'))) {
        return false;
    }
    return true;
});

console.log(`Found ${autoFixableFindings.length} files eligible for auto-fix.`);

autoFixableFindings.forEach(finding => {
    const filePath = finding.file;
    const code = fs.readFileSync(filePath, 'utf8');

    const ast = parser.parse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript']
    });

    let modified = false;

    traverse(ast, {
        JSXElement(path) {
            const el = path.node.openingElement;
            if (el.name.type === 'JSXIdentifier' && (el.name.name === 'button' || el.name.name === 'Button')) {
                // Determine if this is one of our target buttons.
                // It's hard to match exactly by text using AST easily, so we heuristically look for buttons with onClick
                // that trigger standard business logic, or we just rely on updating all primary action buttons in the form area.
                
                // For safety vs complexity of matching exact text, let's just add the missing classes to the specific button
                // if it resembles a primary action button (e.g., has 'onClick', not a small icon button)
                
                const hasOnClick = el.attributes.some(attr => attr.type === 'JSXAttribute' && attr.name.name === 'onClick');
                const isSubmit = el.attributes.some(attr => attr.type === 'JSXAttribute' && attr.name.name === 'type' && attr.value?.value === 'submit');
                
                // Quick hack: we'll look at the text content of the button to see if it matches the report detail
                const btnTextContent = generate(path.node.children.find(c => c.type === 'JSXText') || path.node).code;
                
                const isTarget = finding.issues.some(issue => {
                    const issueContent = issue.detail.split("'")[1] || "";
                    if (!issueContent) return false;
                    const normalizedIssue = issueContent.trim().replace(/\s+/g, ' ');
                    const normalizedBtn = btnTextContent.trim().replace(/\s+/g, ' ');
                    return normalizedBtn.includes(normalizedIssue) || normalizedIssue.includes('Confirm') || normalizedIssue.includes('Post') || normalizedIssue.includes('Add Item') || normalizedIssue.includes('Search');
                });

                if ((hasOnClick || isSubmit) && isTarget) {
                    let classNameAttr = el.attributes.find(attr => attr.type === 'JSXAttribute' && attr.name.name === 'className');
                    
                    if (classNameAttr && classNameAttr.value.type === 'StringLiteral') {
                        let classValue = classNameAttr.value.value;
                        if (!classValue.includes('w-full')) classValue += ' w-full';
                        if (!classValue.includes('bg-brand-blue')) classValue = classValue.replace(/bg-\w+-\d+/, '') + ' bg-brand-blue';
                        if (!classValue.includes('text-white')) classValue += ' text-white';
                        
                        classNameAttr.value.value = classValue.trim();
                        modified = true;
                    } else if (classNameAttr && classNameAttr.value.type === 'JSXExpressionContainer') {
                        // Complex expressions like template literals. 
                        // Instead of parsing, we can just append to the end.
                        // Actually, babel generator modifies the AST safely.
                    }
                }
            }
        }
    });

    if (modified) {
        // Warning: Babel generator might lose original formatting. 
        // For auto-classes, using a regex search/replace in Python might actually be safer for formatting.
    }
});
