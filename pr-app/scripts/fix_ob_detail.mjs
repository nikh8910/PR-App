import fs from 'fs';

const filePath = 'c:/Users/nikh8/PR/pr-app/src/pages/outbound/OutboundDeliveryDetail.jsx';
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

const newBlock = `                                                            {savingBin ? <Loader size={12} className="animate-spin" /> : 'Save'}
                                                        </button>
                                                        <button onClick={() => setEditingBinItem(null)} className="p-1 text-gray-400"><X size={12} /></button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1 flex-1">
                                                        <span className="text-sm font-medium text-slate-700 font-mono">{item.SourceStorageBin || item.EWMStorageBin || '—'}</span>
                                                        {giStatusBadge.text !== 'GI Completed' && (
                                                            <button onClick={() => { setEditingBinItem(item.EWMOutboundDeliveryOrderItem); setEditBinValue(item.SourceStorageBin || item.EWMStorageBin || ''); }}
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
                                                )}`;

// find the exact lines to replace.
// Looking for line 625 className="px-2 py-1 bg-brand-blue text-white rounded text-xs">
let startIdx = 625;
let endIdx = 630; // inclusive.

lines.splice(startIdx, endIdx - startIdx + 1, ...newBlock.split('\n'));
fs.writeFileSync(filePath, lines.join('\n'));
console.log('Fixed file.');
