/**
 * @file HUTransfer.jsx
 * @description Screen: Handling Unit Transfer / Repacking (EWM)
 *
 * Allows operators to move stock items between Handling Units within the same
 * warehouse. The operator scans or selects a source HU, views its contents,
 * selects items + quantities to transfer, then scans or selects a destination HU.
 *
 * ## Full vs Partial Transfer
 *  - Full: if transferred qty equals the HU item qty, SAP moves the entire stock
 *  - Partial: remaining qty stays in the source HU; a new item is created in dest
 *
 * ## SAP API
 *  API_HANDLING_UNIT_SRV — repackHUItem action on the HandlingUnitItem entity
 *
 * @route /warehouse-packing/hu-transfer
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Home, Scan, AlertCircle, X, CheckCircle, ArrowRight, Package, Search, Edit3 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import BarcodeScanner from '../../components/BarcodeScanner';
import { useSwipeBack } from '../../hooks/useSwipeBack';

import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';

const HUTransfer = () => {
    const navigate = useNavigate();
    const { apiConfig } = useAuth();
    useSwipeBack(() => navigate(-1));

    const [warehouses, setWarehouses] = useState([]);
    const [selectedWarehouse, setSelectedWarehouse] = useState('');
    const [sourceHU, setSourceHU] = useState('');
    const [destHU, setDestHU] = useState('');
    const [sourceItems, setSourceItems] = useState([]);
    const [loadingItems, setLoadingItems] = useState(false);

    // Transfer quantities — keyed by index
    const [transferQuantities, setTransferQuantities] = useState({});
    const [selectedItems, setSelectedItems] = useState({});

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');
    const [showScanner, setShowScanner] = useState(false);
    const [scanTarget, setScanTarget] = useState('');

    // HU dropdown value help
    const [huDropdownOptions, setHuDropdownOptions] = useState([]);
    const [isSourceDropdownOpen, setIsSourceDropdownOpen] = useState(false);
    const [isDestDropdownOpen, setIsDestDropdownOpen] = useState(false);
    const [fetchingHuDropdown, setFetchingHuDropdown] = useState(false);

    const stripZeros = (str) => str ? String(str).replace(/^0+/, '') || '0' : '';

    useEffect(() => {
        (async () => {
            try {
                const res = await api.fetchWarehouses(apiConfig);
                if (res?.value) {
                    setWarehouses(res.value);
                    const dw = res.value.find(w => w.EWMWarehouse === 'UKW2');
                    if (dw) setSelectedWarehouse('UKW2');
                    else if (res.value.length === 1) setSelectedWarehouse(res.value[0].EWMWarehouse);
                }
            } catch (err) { setError("Failed to load warehouses: " + err.message); }
        })();
    }, [apiConfig]);

    // HU value help
    useEffect(() => {
        if (!selectedWarehouse) return;
        (async () => {
            setFetchingHuDropdown(true);
            try {
                const res = await api.fetchHandlingUnits(apiConfig, { warehouse: selectedWarehouse });
                if (res?.value) setHuDropdownOptions(res.value);
            } catch (err) { console.error("Failed to fetch HU dropdown:", err); }
            finally { setFetchingHuDropdown(false); }
        })();
    }, [apiConfig, selectedWarehouse]);

    const filteredSourceOptions = huDropdownOptions.filter(opt => {
        if (!sourceHU) return true;
        return opt.HandlingUnitExternalID && opt.HandlingUnitExternalID.toUpperCase().includes(sourceHU.toUpperCase());
    });

    const filteredDestOptions = huDropdownOptions.filter(opt => {
        if (!destHU) return true;
        return opt.HandlingUnitExternalID && opt.HandlingUnitExternalID.toUpperCase().includes(destHU.toUpperCase());
    });

    // Fetch source HU contents when sourceHU is set
    const fetchSourceContents = async (huId) => {
        if (!huId || !selectedWarehouse) return;
        setLoadingItems(true); setSourceItems([]); setTransferQuantities({}); setSelectedItems({});
        try {
            const res = await api.fetchHUDetails(apiConfig, huId, selectedWarehouse);
            let items = [];
            if (res?._HandlingUnitItem) {
                items = res._HandlingUnitItem;
            } else if (res?.value?.[0]?._HandlingUnitItem) {
                items = res.value[0]._HandlingUnitItem;
            }
            setSourceItems(items);
            // Default: all items selected, transfer full quantity
            const defaults = {};
            const selectDefaults = {};
            items.forEach((item, i) => {
                defaults[i] = parseFloat(item.HandlingUnitQuantity || 0);
                selectDefaults[i] = true;
            });
            setTransferQuantities(defaults);
            setSelectedItems(selectDefaults);
        } catch (err) {
            console.warn("Could not fetch HU contents:", err);
            setError("Failed to fetch HU contents: " + err.message);
        } finally { setLoadingItems(false); }
    };

    const handleScan = (code) => {
        setShowScanner(false);
        if (scanTarget === 'source') {
            setSourceHU(code);
            fetchSourceContents(code);
        } else if (scanTarget === 'dest') {
            setDestHU(code);
        }
    };

    const updateTransferQty = (index, value) => {
        const maxQty = parseFloat(sourceItems[index]?.HandlingUnitQuantity || 0);
        let newQty = parseFloat(value);
        if (isNaN(newQty) || newQty < 0) newQty = 0;
        if (newQty > maxQty) newQty = maxQty;
        setTransferQuantities(prev => ({ ...prev, [index]: newQty }));
    };

    const toggleItemSelection = (index) => {
        setSelectedItems(prev => ({ ...prev, [index]: !prev[index] }));
    };

    const handleTransfer = async (e) => {
        if (e) e.preventDefault();
        setError(null); setSuccessMsg('');

        if (!selectedWarehouse) { setError("Select a warehouse."); return; }
        if (!sourceHU.trim()) { setError("Scan or enter source HU."); return; }
        if (!destHU.trim()) { setError("Scan or enter destination HU."); return; }

        // Check at least one item is selected
        const itemsToTransfer = sourceItems
            .map((item, i) => ({ ...item, index: i }))
            .filter((_, i) => selectedItems[i] && transferQuantities[i] > 0);

        if (itemsToTransfer.length === 0) {
            setError("Select at least one item with a quantity > 0 to transfer.");
            return;
        }

        setLoading(true);
        const results = [];
        const errors = [];

        for (const item of itemsToTransfer) {
            const idx = item.index;
            const maxQty = parseFloat(item.HandlingUnitQuantity || 0);
            const transferQty = transferQuantities[idx];
            const isFullTransfer = transferQty >= maxQty;

            // We need StockItemUUID — check if it's in the item data
            const stockItemUUID = item.StockItemUUID;
            if (!stockItemUUID) {
                errors.push(`Item "${stripZeros(item.Material || item.Product || '')}" has no StockItemUUID — cannot transfer.`);
                continue;
            }

            try {
                if (isFullTransfer) {
                    // Full transfer — omit quantity params (SAP moves everything)
                    await api.repackHUItem(apiConfig, sourceHU.trim(), selectedWarehouse, stockItemUUID, destHU.trim());
                } else {
                    // Partial transfer — include quantity + unit
                    await api.repackHUItem(
                        apiConfig,
                        sourceHU.trim(),
                        selectedWarehouse,
                        stockItemUUID,
                        destHU.trim(),
                        transferQty,
                        item.HandlingUnitQuantityUnit || 'EA'
                    );
                }
                results.push(`${stripZeros(item.Material || item.Product || '')} — ${transferQty} ${item.HandlingUnitQuantityUnit || 'EA'}`);
            } catch (err) {
                errors.push(`${stripZeros(item.Material || item.Product || '')}: ${err.message}`);
            }
        }

        setLoading(false);

        if (results.length > 0) {
            setSuccessMsg(`Transferred ${results.length} item(s) to HU ${destHU.trim()}:\n${results.join('\n')}`);
            // Refresh source HU contents
            fetchSourceContents(sourceHU.trim());
        }
        if (errors.length > 0) {
            setError(`Transfer errors:\n${errors.join('\n')}`);
        }
    };

    const scanFieldStyle = "relative flex items-center w-full border border-gray-300 rounded-lg bg-slate-50 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-blue";

    const selectedCount = Object.values(selectedItems).filter(Boolean).length;
    const totalToTransfer = sourceItems.reduce((sum, _, i) => selectedItems[i] ? (sum + (transferQuantities[i] || 0)) : sum, 0);

    return (
        <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
            <header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                <div className="flex justify-between items-center relative">
                    <button onClick={() => navigate(-1)} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" title="Back">
                                            <ArrowLeft size={20} className="text-white" />
                                        </button>
                    
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <h1 className="text-xl font-bold text-white tracking-wide">
                            HU Transfer
                        </h1>
                                                <p className="text-blue-200 text-[10px] font-medium uppercase tracking-wider mt-0.5">
                                                    Move Products Between HUs
                                                </p>
                    </div>

                    <button onClick={() => navigate('/menu', { replace: true })} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" title="Home">
                                            <Home size={20} className="text-white" />
                                        </button>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 content-area pb-8" style={{ zIndex: 10, position: 'relative' }}>
                <div className="max-w-md mx-auto">
                    {/* Error/Success messages - inline */}
                    {error && (
                        <div className="bg-red-50 border border-red-300 rounded-xl p-4 shadow-sm flex gap-3 items-start mt-4 mb-3">
                            <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={20} />
                            <p className="text-sm text-red-700 mt-0.5 flex-1 font-medium whitespace-pre-wrap">{error}</p>
                            <button onClick={() => setError(null)} className="p-1.5 hover:bg-red-100 rounded-md shrink-0"><X size={16} className="text-red-500" /></button>
                        </div>
                    )}
                    {successMsg && (
                        <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 shadow-sm flex gap-3 items-start mt-4 mb-3">
                            <CheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={20} />
                            <p className="text-sm text-emerald-700 mt-0.5 flex-1 font-medium whitespace-pre-wrap">{successMsg}</p>
                            <button onClick={() => setSuccessMsg('')} className="p-1.5 hover:bg-emerald-100 rounded-md shrink-0"><X size={16} className="text-emerald-500" /></button>
                        </div>
                    )}

                    <div className="bg-white shadow-sm border border-slate-200 w-full p-4 md:rounded-xl mt-6" style={{ overflow: 'visible' }}>
                        <form onSubmit={handleTransfer} className="flex flex-col gap-4" style={{ overflow: 'visible' }}>
                            <div className="w-full">
                                <Select
                                    label={<>Warehouse <span className="text-red-500">*</span></>}
                                    value={selectedWarehouse}
                                    onChange={e => setSelectedWarehouse(e.target.value)}
                                    required
                                    options={[
                                        { value: '', label: 'Select Warehouse', disabled: true },
                                        ...warehouses.map(w => ({
                                            value: w.EWMWarehouse,
                                            label: `${w.EWMWarehouse} - ${w.EWMWarehouse_Text || w.EWMWarehouse}`
                                        }))
                                    ]}
                                />
                            </div>

                            <div style={{ position: 'relative', zIndex: isSourceDropdownOpen ? 30 : 'auto' }} className="w-full">
                                <Input
                                    label={<>Source HU <span className="text-red-500">*</span></>}
                                    placeholder="Scan or type source HU"
                                    value={sourceHU}
                                    onChange={e => setSourceHU(e.target.value.toUpperCase())}
                                    onFocus={() => setIsSourceDropdownOpen(true)}
                                    onBlur={() => { setTimeout(() => setIsSourceDropdownOpen(false), 200); if (sourceHU) fetchSourceContents(sourceHU); }}
                                    leftIcon={<Search size={18} />}
                                    rightIcon={<button type="button" onClick={() => { setScanTarget('source'); setShowScanner(true); }} className="w-9 h-9 mr-2 p-0 flex items-center justify-center text-gray-400 hover:text-brand-blue rounded-md"><Scan size={20} /></button>}
                                    autoComplete="off"
                                    wrapperClassName="mb-1"
                                />
                                <div className="relative">
                                    {isSourceDropdownOpen && (
                                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto top-full left-0">
                                            {fetchingHuDropdown ? (
                                                <div className="p-4 text-sm text-gray-500 text-center flex items-center justify-center gap-2">
                                                    <div className="w-5 h-5 border-2 border-brand-blue border-t-transparent rounded-full animate-spin"></div> Loading...
                                                </div>
                                            ) : filteredSourceOptions.length === 0 ? (
                                                <div className="p-4 text-sm text-gray-500 text-center">No HUs found. You can still type an HU ID.</div>
                                            ) : (
                                                <div className="py-1">
                                                    {filteredSourceOptions.map((opt, i) => (
                                                        <div key={opt.HandlingUnitExternalID + '-src-' + i}
                                                            className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b last:border-0 border-gray-100 text-left transition-colors"
                                                            onMouseDown={(e) => { e.preventDefault(); setSourceHU(opt.HandlingUnitExternalID); setIsSourceDropdownOpen(false); fetchSourceContents(opt.HandlingUnitExternalID); }}>
                                                            <div className="font-semibold text-gray-800 text-sm">{opt.HandlingUnitExternalID}</div>
                                                            {opt.PackagingMaterial && <div className="text-[11px] text-gray-500 mt-0.5">Pkg: {opt.PackagingMaterial}</div>}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Source HU Contents — Editable */}
                            {loadingItems && (
                                <div className="text-center py-3 text-sm text-gray-500">
                                    <div className="w-5 h-5 border-2 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto mb-1"></div>
                                    Loading HU contents...
                                </div>
                            )}
                            {sourceItems.length > 0 && (
                                <div className="bg-blue-50 rounded-lg p-3">
                                    <p className="text-[10px] font-bold text-blue-800 uppercase tracking-wider mb-2">
                                        Source HU Contents ({sourceItems.length})
                                    </p>
                                    {sourceItems.map((item, i) => {
                                        const maxQty = parseFloat(item.HandlingUnitQuantity || 0);
                                        const transferQty = transferQuantities[i] || 0;
                                        const isSelected = selectedItems[i];
                                        const unit = item.HandlingUnitQuantityUnit || 'EA';

                                        return (
                                            <div key={i} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg mb-1.5 border transition-all ${isSelected ? 'bg-white border-blue-200' : 'bg-gray-50 border-gray-200 opacity-50'}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => toggleItemSelection(i)}
                                                    className="w-4 h-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue cursor-pointer shrink-0"
                                                />
                                                <span className="text-[10px] text-gray-400 font-bold shrink-0 w-5">#{i + 1}</span>
                                                <span className="text-xs font-semibold text-gray-700 truncate min-w-0 flex-1">{stripZeros(item.Material || item.Product || '')}</span>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    min="0"
                                                    max={maxQty}
                                                    value={transferQty}
                                                    onChange={(e) => updateTransferQty(i, e.target.value)}
                                                    disabled={!isSelected}
                                                    className="w-16 border border-gray-300 rounded px-1.5 py-1 text-xs font-mono text-center focus:ring-1 focus:ring-brand-blue disabled:opacity-40 disabled:bg-gray-100"
                                                />
                                                <span className="text-[10px] text-gray-500 shrink-0">/ {maxQty} {unit}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => updateTransferQty(i, maxQty)}
                                                    disabled={!isSelected}
                                                    className="text-[9px] text-blue-600 font-bold px-1.5 py-0.5 bg-blue-50 rounded hover:bg-blue-100 shrink-0 disabled:opacity-40"
                                                >
                                                    MAX
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Arrow */}
                            {sourceItems.length > 0 && (
                                <div className="flex justify-center"><ArrowRight size={24} className="text-gray-300 rotate-90" /></div>
                            )}

                            <div className="w-full">
                                <Input
                                    label={<>Destination HU <span className="text-red-500">*</span></>}
                                    placeholder="Scan or type destination HU"
                                    value={destHU}
                                    onChange={e => setDestHU(e.target.value.toUpperCase())}
                                    onFocus={() => setIsDestDropdownOpen(true)}
                                    onBlur={() => setTimeout(() => setIsDestDropdownOpen(false), 200)}
                                    leftIcon={<Search size={18} />}
                                    rightIcon={<button type="button" onClick={() => { setScanTarget('dest'); setShowScanner(true); }} className="w-9 h-9 mr-2 p-0 flex items-center justify-center text-gray-400 hover:text-brand-blue rounded-md"><Scan size={20} /></button>}
                                    autoComplete="off"
                                    wrapperClassName="mb-1"
                                />
                                <div className="relative">
                                    {isDestDropdownOpen && (
                                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto top-full left-0">
                                            {fetchingHuDropdown ? (
                                                <div className="p-4 text-sm text-gray-500 text-center flex items-center justify-center gap-2">
                                                    <div className="w-5 h-5 border-2 border-brand-blue border-t-transparent rounded-full animate-spin"></div> Loading...
                                                </div>
                                            ) : filteredDestOptions.length === 0 ? (
                                                <div className="p-4 text-sm text-gray-500 text-center">No HUs found. You can still type an HU ID.</div>
                                            ) : (
                                                <div className="py-1">
                                                    {filteredDestOptions.map((opt, i) => (
                                                        <div key={opt.HandlingUnitExternalID + '-dst-' + i}
                                                            className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b last:border-0 border-gray-100 text-left transition-colors"
                                                            onMouseDown={(e) => { e.preventDefault(); setDestHU(opt.HandlingUnitExternalID); setIsDestDropdownOpen(false); }}>
                                                            <div className="font-semibold text-gray-800 text-sm">{opt.HandlingUnitExternalID}</div>
                                                            {opt.PackagingMaterial && <div className="text-[11px] text-gray-500 mt-0.5">Pkg: {opt.PackagingMaterial}</div>}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Transfer summary + button */}
                            {sourceItems.length > 0 && (
                                <div className="bg-gray-50 rounded-lg p-3 text-center">
                                    <p className="text-xs text-gray-500">
                                        <span className="font-bold text-gray-700">{selectedCount}</span> item(s) selected
                                    </p>
                                </div>
                            )}

                            <div className="w-full mt-2">
                                <Button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full py-3.5"
                                >
                                    {loading ? (
                                        <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Transferring...</>
                                    ) : (
                                        <><CheckCircle size={16} /> Transfer Contents</>
                                    )}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
        </div>
    );
};

export default HUTransfer;
