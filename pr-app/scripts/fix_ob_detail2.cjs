const fs = require('fs');

const file = 'C:/Users/nikh8/PR/pr-app/src/pages/outbound/OutboundDeliveryDetail.jsx';
let content = fs.readFileSync(file, 'utf8');

const replacement = `                                        <div className="bg-slate-50/50 border-t border-slate-200 p-4 animate-in slide-in-from-top-2">

                                            {/* Source Bin row */}
                                            <div className="mb-3 flex items-center gap-2">
                                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider w-24 shrink-0">Source Bin</span>
                                                {editingBinItem === item.EWMOutboundDeliveryOrderItem ? (
                                                    <div className="flex items-center gap-1 flex-1">
                                                        <input type="text" value={editBinValue}
                                                            onChange={e => setEditBinValue(e.target.value.toUpperCase())}
                                                            className="flex-1 p-1.5 border border-blue-300 rounded text-sm font-mono uppercase"
                                                            autoFocus />
                                                        <button disabled={savingBin} onClick={() => handleSaveBin(item)}
                                                            className="px-2 py-1 bg-brand-blue text-white rounded text-xs">
                                                            {savingBin ? <Loader size={12} className="animate-spin" /> : 'Save'}
                                                        </button>
                                                        <button onClick={() => setEditingBinItem(null)} className="p-1 text-gray-400"><X size={12} /></button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1 flex-1">
                                                        <span className="text-sm font-medium text-slate-700 font-mono">{item.SourceStorageBin || item.EWMStorageBin || '—'}</span>
                                                        {giStatusBadge.text !== 'GI Completed' && (
                                                            <button onClick={(e) => { e.stopPropagation(); setEditingBinItem(item.EWMOutboundDeliveryOrderItem); setEditBinValue(item.SourceStorageBin || item.EWMStorageBin || ''); }}
                                                                className="p-1 text-slate-400 hover:text-blue-600" title="Edit source bin">
                                                                <Pencil size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Extra item fields */}
                                            <div className="flex flex-col gap-y-2 mb-4">
                                                {item.EWMStorageBin && (
                                                    <div>
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Storage Bin</p>
                                                        <p className="text-sm font-semibold text-gray-700">{item.EWMStorageBin}</p>
                                                    </div>
                                                )}
                                                {item.EWMStorageType && (
                                                    <div>
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Storage Type</p>
                                                        <p className="text-sm font-semibold text-gray-700">{item.EWMStorageType}</p>
                                                    </div>
                                                )}
                                                {item.HandlingUnitNumber && item.HandlingUnitNumber.replace(/^0+/, '') && (
                                                    <div>
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Handling Unit</p>
                                                        <p className="text-sm font-semibold text-gray-700">{stripZeros(item.HandlingUnitNumber)}</p>
                                                    </div>
                                                )}
                                                {item.EWMConsolidationGroup && (
                                                    <div>
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Consolidation Group</p>
                                                        <p className="text-sm font-semibold text-gray-700">{item.EWMConsolidationGroup}</p>
                                                    </div>
                                                )}
                                                {item.ShipToParty && (
                                                    <div>
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ship-To Party</p>
                                                        <p className="text-sm font-semibold text-gray-700">{item.ShipToParty}</p>
                                                    </div>
                                                )}
                                                {item.Route && (
                                                    <div>
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Route</p>
                                                        <p className="text-sm font-semibold text-gray-700">{item.Route}</p>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Task Context */}
                                            {renderTasksForItem(item)}

                                            {/* Actions - Create Task (disabled if fully picked) */}
                                            <div className="mt-4 pt-3 border-t border-gray-200">
                                                <button
                                                    disabled={pickBadge.isPicked}
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleCreateWtClick(item);
                                                    }}
                                                    className={\`w-full py-2.5 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm \${pickBadge.isPicked
                                                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                                        : 'bg-brand-blue hover:opacity-90 text-white'
                                                        }\`}
                                                >
                                                    <ListTodo size={16} /> {pickBadge.isPicked ? 'Fully Picked' : 'Create Task'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Create WT Modal */}`;

// The start is exactly `<div className="bg-slate-50/50 border-t border-slate-200 p-4 animate-in slide-in-from-top-2">` which is line 614.
const startStr = '<div className="bg-slate-50/50 border-t border-slate-200 p-4 animate-in slide-in-from-top-2">';
const endStr = '{/* Create WT Modal */}';

const startIndex = content.indexOf(startStr);
const endIndex = content.indexOf(endStr);

if (startIndex === -1 || endIndex === -1) {
    console.error("Could not find boundaries! start: " + startIndex + " end: " + endIndex);
    process.exit(1);
}

const newContent = content.substring(0, startIndex) + replacement + content.substring(endIndex + endStr.length);
fs.writeFileSync(file, newContent, 'utf8');
console.log("Successfully rebuilt the item block by index.");
