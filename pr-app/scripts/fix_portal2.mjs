import fs from 'fs';

const file = 'src/pages/inbound/InboundDeliveryDetail.jsx';
let content = fs.readFileSync(file, 'utf8');

let changes = 0;

// Fix the BinPrompt modal - wrap with createPortal
// Find: showBinPrompt && (    <div className="fixed inset-0 z-[100] ...
// Replace with: showBinPrompt && createPortal(    <div ... style={{ zIndex: 9999, ...
const binPromptOpen = `showBinPrompt && (\n                    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in"\n                        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 1.5rem)' }}>`;
const binPromptOpenFixed = `showBinPrompt && createPortal(\n                    <div className="fixed inset-0 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in"\n                        style={{ zIndex: 9999, paddingTop: 'max(env(safe-area-inset-top, 0px), 1.5rem)' }}>`;

if (content.includes(binPromptOpen)) {
    content = content.replace(binPromptOpen, binPromptOpenFixed);
    changes++;
    console.log('Patched binPrompt open');
}

// Fix the binPrompt closing: find the close of the binPrompt modal
// It ends with: </div>\n                )\n            }\n\n\n            {/* Reverse GR
const binPromptClose = `                )\n            }\n\n\n            {/* Reverse GR`;
const binPromptCloseFixed = `                    document.body\n                )\n            }\n\n\n            {/* Reverse GR`;

// We need to change the close from ) to , document.body)
// Since the open now uses createPortal(
// Find the first )\n            } after our patch
// Look specifically for </div>\n                )\n            } after showBinPrompt
const binPromptClosePattern = `                </div>\n                )\n            }\n\n\n            {/* Reverse GR`;
const binPromptClosePatternFixed = `                </div>,\n                    document.body\n                )\n            }\n\n\n            {/* Reverse GR`;

if (content.includes(binPromptClosePattern)) {
    content = content.replace(binPromptClosePattern, binPromptClosePatternFixed);
    changes++;
    console.log('Patched binPrompt close');
}

// Also fix the Reverse GR dialog if it exists with z-[100]
const reverseDialogOld = `showReverseDialog && (\n                    <div className="fixed inset-0 z-[100]`;
const reverseDialogNew = `showReverseDialog && createPortal(\n                    <div className="fixed inset-0" style={{ zIndex: 9999 }}`;
if (content.includes(reverseDialogOld)) {
    content = content.replace(reverseDialogOld, reverseDialogNew);
    changes++;
    console.log('Patched reverseDialog open');
}

fs.writeFileSync(file, content, 'utf8');
console.log(`Total changes: ${changes}`);
