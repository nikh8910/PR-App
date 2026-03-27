import fs from 'fs';

const file = 'src/pages/inbound/InboundDeliveryDetail.jsx';
let content = fs.readFileSync(file, 'utf8');
let changes = 0;

// Fix BinPrompt close - find the `) \n }` that closes showBinPrompt block (after Apply & Post button)
const binCloseOld = `                    </div>\n                )\n            }\n\n            {/* Reverse GR Confirmation Dialog */}`;
const binCloseNew = `                    </div>,\n                    document.body\n                )\n            }\n\n            {/* Reverse GR Confirmation Dialog */}`;
if (content.includes(binCloseOld)) {
    content = content.replace(binCloseOld, binCloseNew);
    changes++;
    console.log('Patched binPrompt close');
} else {
    // Find context for debugging
    const idx = content.indexOf('Reverse GR Confirmation Dialog');
    console.log('Context around Reverse GR:', JSON.stringify(content.substring(idx - 100, idx + 20)));
}

// Fix Reverse GR dialog - wrap with portal too (z-200 but same stacking context issue)
const reverseOldOpen = `{showReverseDialog && (\n                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 px-6">`;
const reverseNewOpen = `{showReverseDialog && createPortal(\n                <div className="fixed inset-0 flex items-center justify-center bg-black/50 px-6" style={{ zIndex: 9999 }}>`;
if (content.includes(reverseOldOpen)) {
    content = content.replace(reverseOldOpen, reverseNewOpen);
    changes++;
    console.log('Patched reverseDialog open');
}

fs.writeFileSync(file, content, 'utf8');
console.log('Total changes:', changes);
