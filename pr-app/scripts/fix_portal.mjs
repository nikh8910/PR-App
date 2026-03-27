import fs from 'fs';

const file = 'src/pages/inbound/InboundDeliveryDetail.jsx';
let content = fs.readFileSync(file, 'utf8');

// Fix: complete the createPortal call by replacing the old modal close with portal close
// The modal currently ends with:
//                     </div>
//                 )
//             }
// But the createPortal needs:
//                     </div>,
//                     document.body
//                 )
//             }

// Find the closing of the WT modal - it's the first ) } after </div> in the showWtModal block
// We search for the pattern right after the Button closing tag area

// Target the specific closing for the WT modal (not the Bin prompt modal)
const oldClose = `                    </div>\r\n                )\r\n            }\r\n\r\n\r\n            {/* Post GR Bin Prompt Modal */}`;
const newClose = `                    </div>,\r\n                    document.body\r\n                )\r\n            }\r\n\r\n\r\n            {/* Post GR Bin Prompt Modal */}`;

if (!content.includes(oldClose)) {
    // Try LF variant
    const oldCloseLF = oldClose.replace(/\r\n/g, '\n');
    const newCloseLF = newClose.replace(/\r\n/g, '\n');
    if (content.includes(oldCloseLF)) {
        content = content.replace(oldCloseLF, newCloseLF);
        fs.writeFileSync(file, content, 'utf8');
        console.log('Fixed with LF line endings');
    } else {
        console.log('Could not find target. Showing context...');
        const idx = content.indexOf('Post GR Bin Prompt Modal');
        console.log(JSON.stringify(content.substring(idx - 200, idx + 50)));
    }
} else {
    content = content.replace(oldClose, newClose);
    fs.writeFileSync(file, content, 'utf8');
    console.log('Fixed with CRLF line endings');
}
