const fs = require('fs');

function extractFilterBar(filepath) {
    let code = fs.readFileSync(filepath, 'utf8');

    const filterStart = code.indexOf('{/* Filter Bar */}');
    const cardsStart = code.indexOf('{/* Delivery Cards */}');
    
    if (filterStart === -1 || cardsStart === -1) {
        if (code.includes('{/* EXPANDED FILTER BAR (FIXED) */}')) {
            console.log("Layout already fixed in", filepath);
            return;
        }
        console.log("Could not find markers in", filepath);
        return;
    }

    // This is the full exact string we're removing from the scroll container
    let originalFilterBlock = code.slice(filterStart, cardsStart);
    code = code.slice(0, filterStart) + code.slice(cardsStart); // Remove it from the scroll container

    // Strip out the wrapper div that made it sticky inside the list container and its closing tag from the very end
    let pureContent = originalFilterBlock.replace('{/* Filter Bar */}\n', '').trim();
    // It starts with <div className="sticky top-0 ..."> and ends with </div>
    // Let's strip the first line and the last line dynamically:
    const lines = pureContent.split('\n');
    lines.shift(); // remove opening <div className="sticky...">
    lines.pop();   // remove closing </div>

    let newFilterContent = lines.join('\n');

    // Create the new flex-none header bar out of it
    const newFilterWrapper = `
            {/* EXPANDED FILTER BAR (FIXED) */}
            {!loading && deliveries.length > 0 && (
                <div className="flex-none bg-slate-50 z-20 shadow-sm border-b border-slate-200 pb-3 pt-4 px-4">
                    <div className="max-w-md mx-auto">
                        <div className="flex flex-col gap-1.5">
                            ${newFilterContent}
                        </div>
                    </div>
                </div>
            )}
`;

    const flex1ContainerStr = `<div className="flex-1 overflow-y-auto px-4 pb-8 content-area"`;
    const flex1ContainerIdx = code.indexOf(flex1ContainerStr);

    code = code.slice(0, flex1ContainerIdx) + newFilterWrapper + '\n            ' + code.slice(flex1ContainerIdx);

    // Write back
    fs.writeFileSync(filepath, code);
    console.log("Fixed layout in", filepath);
}

extractFilterBar('src/pages/inbound/InboundDeliveryList.jsx');
extractFilterBar('src/pages/outbound/OutboundDeliveryList.jsx');
