/**
 * @file PICount.jsx
 * @description Screen: Physical Inventory Count (EWM — MI20/LI01 equivalent)
 *
 * Guides operators through a 3-step physical inventory counting workflow:
 *  Step 1: Select warehouse + optionally filter to a specific storage bin
 *  Step 2: Browse open PI items (document list, filterable / scannable)
 *  Step 3: Enter counts per line item — or flag exceptions (Bin Empty, HU Empty, etc.)
 *
 * ## Count Item Filtering Logic
 * Each PI document has sub-items with a PhysicalInventoryItemType field:
 *  - 'S' (Stock): preferred — shows actual products/HUs in the bin
 *  - 'L' (Location): shown only when no stock items exist (empty bin)
 * This mirrors the SAP paper PI count printout logic.
 *
 * ## Exception Codes (EWMPhysInvtryDifferenceReason)
 *  ZERO – Zero count, BINE – Bin empty, HU – HU exception, etc.
 *  Exception codes set the quantity to 0 and flag boolean fields on the item.
 *
 * ## SAP API
 *  api_whse_physinvtryitem_2 OData V4 — $batch for post (COUNT item + header)
 *
 * @route /warehouse-internal/pi-count
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Scan, AlertCircle, X, CheckCircle, Search, Package, ChevronRight, Save, TriangleAlert, Info, Plus, ArrowLeft, ScanLine, Loader } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api, getHeaders, getProxyUrl } from '../../services/api';
import BarcodeScanner from '../../components/BarcodeScanner';
import { useSwipeBack } from '../../hooks/useSwipeBack';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';

const PICount = () => {
    const navigate = useNavigate();
    const { apiConfig } = useAuth();
    useSwipeBack(() => navigate(-1));

    const [warehouses, setWarehouses] = useState([]);
    const [selectedWarehouse, setSelectedWarehouse] = useState('');
    const [step, setStep] = useState('bin'); // 'bin' | 'list' | 'detail'
    const [bin, setBin] = useState('');
    const [piItems, setPiItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');
    const [showScanner, setShowScanner] = useState(false);
    const [scanTarget, setScanTarget] = useState('');

    // Selected item for detail view
    const [selectedItem, setSelectedItem] = useState(null);
    const [selectedCountItem, setSelectedCountItem] = useState(null);

    // Count form
    const [countQty, setCountQty] = useState('');
    const [countUnit, setCountUnit] = useState('');
    const [postingLoading, setPostingLoading] = useState(false);
    const [exceptionCode, setExceptionCode] = useState('');
    const [counterName, setCounterName] = useState('');

    // Add Item modal
    const [showAddItemModal, setShowAddItemModal] = useState(false);
    const [addItemForm, setAddItemForm] = useState({ type: 'product', product: '', hu: '', qty: '', uom: 'EA' });
    const [addingItem, setAddingItem] = useState(false);

    // Exception code options — maps to EWMPhysInvtryDifferenceReason codes on WhsePhysicalInventoryItem
    const exceptionOptions = [
        { code: '', label: 'None', reason: '' },
        { code: 'ZERO', label: 'Zero Count', reason: 'ZERO' },
        { code: 'BINE', label: 'Bin Empty', reason: 'BINE' },
        { code: 'HU', label: 'Handling Unit', reason: 'HUCT' },
        { code: 'HU_COMPLETE', label: 'HU Complete', reason: 'HUCO' },
        { code: 'HU_EMPTY', label: 'HU Empty', reason: 'HUEM' },
        { code: 'HU_NOT_EXIST', label: 'HU Missing', reason: 'HUMS' },
    ];

    // Filters & alerts
    const [filterText, setFilterText] = useState('');
    const [mismatchAlert, setMismatchAlert] = useState(null);

    const stripZeros = (str) => str ? String(str).replace(/^0+/, '') || '0' : '';

    /**
     * Filter count items for display, matching SAP paper printout logic:
     * - Only show Type S (Stock) items
     * - If no S items, show Type L (Location) — empty bin
     * - For S items with PInvItemParentType 'H', merge ParentHandlingUnitNumber as HU
     */
    const getDisplayCountItems = (rawCntItems) => {
        if (!rawCntItems || rawCntItems.length === 0) return [];
        const stockItems = rawCntItems.filter(ci => ci.PhysicalInventoryItemType === 'S');
        if (stockItems.length > 0) return stockItems;
        // No stock items — show the L (Location) line (empty bin)
        const locationItems = rawCntItems.filter(ci => ci.PhysicalInventoryItemType === 'L');
        return locationItems.length > 0 ? locationItems : rawCntItems.slice(0, 1);
    };

    const getStatusInfo = (statusText) => {
        const s = (statusText || '').toUpperCase();
        if (s === 'CTDN' || s === 'COUNTED') return { label: 'Counted', color: '#059669', iconBg: '#ecfdf5' };
        if (s === 'ACTI' || s === 'ACTIVE' || s === 'ACTV') return { label: 'Active', color: '#b45309', iconBg: '#fffbeb' };
        if (s === 'NCTD' || s === 'NOT COUNTED') return { label: 'Not Counted', color: '#64748b', iconBg: '#f1f5f9' };
        if (s) return { label: statusText, color: '#1e40af', iconBg: '#eff6ff' };
        return { label: 'Open', color: '#64748b', iconBg: '#f1f5f9' };
    };

    // Load warehouses
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

    // Filter PI items
    const filteredPiItems = useMemo(() => {
        if (!filterText) return piItems;
        const q = filterText.toUpperCase();
        return piItems.filter(item => {
            const prod = (item.Product || '').toUpperCase();
            const docNum = (item.PhysicalInventoryDocNumber || '');
            const itemBin = (item.EWMStorageBin || '').toUpperCase();
            const countItems = item._WhsePhysicalInventoryCntItem || [];
            const huMatch = countItems.some(ci => (ci.HandlingUnitNumber || '').toUpperCase().includes(q));
            const prodMatch = countItems.some(ci => (ci.Product || '').toUpperCase().includes(q));
            return prod.includes(q) || docNum.includes(q) || itemBin.includes(q) || huMatch || prodMatch;
        });
    }, [piItems, filterText]);

    // Fetch PI items
    const fetchPIForBin = useCallback(async (binId) => {
        if (!selectedWarehouse) return;
        setLoading(true); setError(null); setPiItems([]); setSelectedItem(null);
        setMismatchAlert(null); setFilterText('');
        try {
            const filters = { statusOpen: true };
            if (binId && binId.trim()) filters.bin = binId.trim();
            const res = await api.fetchWhsePIItems(apiConfig, selectedWarehouse, filters);
            const items = res?.value || [];
            if (items.length === 0) {
                setError(binId ? `No open PI items found for bin "${binId}" in ${selectedWarehouse}` : `No open PI items found in ${selectedWarehouse}`);
            }
            setPiItems(items);
            if (items.length > 0) setStep('list');
        } catch (err) { setError("Failed to fetch PI items: " + err.message); }
        finally { setLoading(false); }
    }, [apiConfig, selectedWarehouse]);

    const handleBinSubmit = () => {
        if (!selectedWarehouse) { setError("Select a warehouse first."); return; }
        fetchPIForBin(bin.trim());
    };

    // Open detail for a PI item
    const openDetail = (item) => {
        setSelectedItem(item);
        setSelectedCountItem(null);
        setCountQty('');
        setCountUnit('');
        setExceptionCode('');
        setError(null); setMismatchAlert(null);
        const displayItems = getDisplayCountItems(item._WhsePhysicalInventoryCntItem || []);
        if (displayItems.length > 0) {
            setSelectedCountItem(displayItems[0]);
            setCountUnit(displayItems[0].RequestedQuantityUnit || 'EA');
        }
        setStep('detail');
    };

    // Scan handler
    const handleScan = (code) => {
        setShowScanner(false);
        if (scanTarget === 'bin') { setBin(code); fetchPIForBin(code); }
        else if (scanTarget === 'filter') { setFilterText(code); resolveFilter(code); }
        else if (scanTarget === 'hu_detail') { /* match HU in detail */ }
    };

    // Resolve filter as GTIN
    const resolveFilter = async (code) => {
        const normalized = code.trim().toUpperCase();
        try {
            const product = await api.fetchProductByGTIN(apiConfig, normalized);
            if (product?.Product) setFilterText(product.Product.trim());
        } catch (e) { /* keep as-is */ }
    };

    // Post count — $batch: PUT WhsePhysicalInventoryCountItem + PUT WhsePhysicalInventoryItem
    const handlePostCount = async () => {
        if (!selectedItem || !selectedCountItem) return;
        const ci = selectedCountItem;
        const hasException = !!exceptionCode;
        const qtyToPost = hasException ? 0 : parseFloat(countQty || 0);
        if (!counterName.trim()) {
            setError("Enter a counter's name."); return;
        }
        if (!hasException && (countQty === '' || isNaN(qtyToPost))) {
            setError("Enter a valid quantity, or select an exception."); return;
        }
        setPostingLoading(true); setError(null); setSuccessMsg('');
        try {
            // Build the WhsePhysicalInventoryCountItem entity (full body)
            const countItemEntity = { ...ci };
            // Set count data
            countItemEntity.RequestedQuantity = qtyToPost;
            countItemEntity.RequestedQuantityUnit = countUnit || ci.RequestedQuantityUnit || 'EA';
            // Set boolean exception flags
            countItemEntity.EWMStorageBinIsEmpty = (exceptionCode === 'BINE');
            countItemEntity.PInvIsZeroCount = (exceptionCode === 'ZERO');
            countItemEntity.HndlgUnitItemCountedIsComplete = (exceptionCode === 'HU_COMPLETE');
            countItemEntity.HndlgUnitItemCountedIsEmpty = (exceptionCode === 'HU_EMPTY');
            countItemEntity.HndlgUnitItemCountedIsNotExist = (exceptionCode === 'HU_NOT_EXIST');

            // Build the WhsePhysicalInventoryItem entity (header)
            const headerItemEntity = { ...selectedItem };
            // Set counter name
            headerItemEntity.PhysicalInventoryCountUserName = counterName.trim();
            // Set difference reason
            if (hasException) {
                const exOpt = exceptionOptions.find(e => e.code === exceptionCode);
                if (exOpt?.reason) headerItemEntity.EWMPhysInvtryDifferenceReason = exOpt.reason;
            }

            await api.postWhsePICount(apiConfig, countItemEntity, headerItemEntity);
            setSuccessMsg(`Count posted for PI Doc ${ci.PhysicalInventoryDocNumber}, Item ${ci.PhysicalInventoryItemNumber}!`);
            setTimeout(() => { setSuccessMsg(''); setStep('list'); fetchPIForBin(bin); }, 2000);
        } catch (err) { setError("Post count failed: " + err.message); }
        finally { setPostingLoading(false); }
    };

    // Add new count item to PI doc   
    const handleAddItem = async () => {
        if (!selectedItem) return;
        if (!addItemForm.qty || isNaN(parseFloat(addItemForm.qty))) {
            setError('Enter a valid quantity.'); return;
        }
        if (addItemForm.type === 'product' && !addItemForm.product.trim()) {
            setError('Enter a product number.'); return;
        }
        setAddingItem(true); setError(null);
        try {
            const ci = selectedItem._WhsePhysicalInventoryCntItem?.[0] || {};
            const payload = {
                EWMWarehouse: selectedItem.EWMWarehouse || selectedWarehouse,
                PhysicalInventoryDocYear: selectedItem.PhysicalInventoryDocYear,
                PhysicalInventoryDocNumber: selectedItem.PhysicalInventoryDocNumber,
                PhysicalInventoryItemNumber: selectedItem.PhysicalInventoryItemNumber,
                ...(addItemForm.type === 'product' ? { Product: addItemForm.product.trim().toUpperCase() } : {}),
                ...(addItemForm.type === 'hu' ? { HandlingUnitExternalID: addItemForm.hu.trim() } : {}),
                RequestedQuantity: parseFloat(addItemForm.qty),
                RequestedQuantityUnit: addItemForm.uom || 'EA',
            };
            await api.addWhsePICountItem(apiConfig, payload);
            setShowAddItemModal(false);
            setAddItemForm({ type: 'product', product: '', hu: '', qty: '', uom: 'EA' });
            setSuccessMsg('Item added to PI count successfully.');
            // Reload
            setTimeout(() => fetchPIForBin(bin), 1500);
        } catch (err) {
            setError('Failed to add item: ' + err.message);
        } finally {
            setAddingItem(false);
        }
    };

    // ── RENDER ──

    // Loading splash
    if (loading && step === 'bin') {
        return (
            <div className="flex flex-col h-screen bg-gray-50 font-sans items-center justify-center">
                <Loader className="animate-spin text-brand-blue mb-4" size={48} />
                <p className="text-gray-500">Loading PI Items...</p>
            </div>
        );
    }

    // ═══ STEP 3: Detail view — Paper template style ═══
    if (step === 'detail' && selectedItem) {
        const item = selectedItem;
        const rawCountItems = item._WhsePhysicalInventoryCntItem || [];
        const countItems = getDisplayCountItems(rawCountItems);
        const status = getStatusInfo(item.PhysicalInventoryStatusText);
        const exDisabled = !!exceptionCode;

        const checkboxDefs = [
            { key: 'BINE', label: 'Bin Empty' },
            { key: 'HU_COMPLETE', label: 'HU Compl.' },
            { key: 'HU_EMPTY', label: 'HU Empty' },
            { key: 'HU_NOT_EXIST', label: 'HU Missing' },
            { key: 'ZERO', label: 'Zero Count' },
        ];

        return (<>
            <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
                {/* Header — matching ConfirmPicking */}
                <header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                    <div className="flex items-center gap-3">
                        <button onClick={() => setStep('list')} className="w-10 h-10 p-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" title="Back">
                            <ArrowLeft size={22} className="text-white" />
                        </button>
                        <div className="flex flex-col flex-1 min-w-0">
                            <h1 className="text-xl font-bold text-white tracking-wide truncate">PI Count</h1>
                            <p className="text-blue-200 text-xs font-medium tracking-wider mt-0.5 truncate">Doc: {item.PhysicalInventoryDocNumber} • Item {item.PhysicalInventoryItemNumber}</p>
                        </div>
                        <button onClick={() => navigate('/menu', { replace: true })} className="w-10 h-10 p-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" title="Home">
                            <Home size={22} className="text-white" />
                        </button>
                    </div>
                </header>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 content-area pb-32">
                    <div className="max-w-md mx-auto flex flex-col gap-3">
                        {/* Messages */}
                        {error && (
                            <div className="flex items-center gap-2 bg-red-50 text-red-700 p-3 rounded-lg border border-red-200">
                                <AlertCircle size={16} /> <span className="text-sm flex-1">{error}</span>
                                <button onClick={() => setError(null)}><X size={14} /></button>
                            </div>
                        )}
                        {successMsg && (
                            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 p-3 rounded-lg border border-emerald-200">
                                <CheckCircle size={16} /> <span className="text-sm font-bold">{successMsg}</span>
                            </div>
                        )}

                        {/* PI Summary Card — matching ConfirmPicking Task Summary */}
                        <div className="glass-card" style={{ padding: '1rem', borderRadius: '1rem', border: '1px solid #e2e8f0' }}>
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">Warehouse</p>
                                    <p className="text-lg font-bold text-slate-800">{item.EWMWarehouse || selectedWarehouse}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">Count Items</p>
                                    <p className="text-lg font-bold text-slate-800">{countItems.length}</p>
                                </div>
                            </div>
                            <div className="flex justify-between text-sm">
                                <div>
                                    <p className="text-xs text-slate-400">Storage Bin</p>
                                    <p className="font-bold text-slate-700">{item.EWMStorageBin || 'N/A'}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-slate-400">Status</p>
                                    <p className="font-bold" style={{ color: status.color }}>{status.label}</p>
                                </div>
                            </div>
                        </div>

                        {/* Counter Name — mandatory */}
                        <div className="mb-2">
                            <Input
                                label="Counter *"
                                placeholder="Enter counter name"
                                value={counterName}
                                onChange={e => setCounterName(e.target.value)}
                            />
                        </div>

                        {/* ── Count Item Rows ── */}
                        <div className="flex flex-col gap-2">
                            {countItems.map((ci, ciIdx) => {
                                const isSelected = selectedCountItem === ci;
                                const prodName = ci.Product ? stripZeros(ci.Product) : '';
                                // For Type S items inside HU, show ParentHandlingUnitNumber
                                const huNum = ci.ParentHandlingUnitNumber || ci.HandlingUnitNumber || '';
                                const isEmptyBin = ci.PhysicalInventoryItemType === 'L' && !prodName && !huNum;
                                const uom = ci.RequestedQuantityUnit || '';

                                return (
                                    <div key={ciIdx} className={`rounded-xl border overflow-hidden ${isSelected ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200'}`}>
                                        {/* Main row — tap to select/expand */}
                                        <button
                                            onClick={() => {
                                                if (isSelected) { setSelectedCountItem(null); return; }
                                                setSelectedCountItem(ci);
                                                setCountUnit(ci.RequestedQuantityUnit || 'EA');
                                                setCountQty('');
                                                setExceptionCode('');
                                            }}
                                            className="w-full text-left px-4 py-3 flex items-center gap-3">
                                            {/* Number badge */}
                                            <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold flex items-center justify-center shrink-0">{ciIdx + 1}</span>
                                            {/* Product / HU info */}
                                            <div className="flex-1 min-w-0">
                                                {isEmptyBin ? (
                                                    <p className="text-sm text-slate-400 italic">Empty Bin — {ci.EWMStorageBin || item.EWMStorageBin}</p>
                                                ) : (
                                                    <p className="text-sm font-bold text-slate-800 truncate">
                                                        {prodName || 'No product'}
                                                        {uom && <span className="text-[10px] font-normal text-slate-400 ml-1">({uom})</span>}
                                                        {huNum && <span className="text-[11px] font-normal text-blue-600 ml-2">· <Package size={10} className="inline-block align-middle" /> {huNum}</span>}
                                                    </p>
                                                )}
                                            </div>
                                            {/* Expand chevron */}
                                            <ChevronRight size={16} className={`text-slate-400 shrink-0 transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                                        </button>

                                        {/* ── Per-row checkboxes ── */}
                                        {isSelected && (() => {
                                            const huKeys = ['HU_COMPLETE', 'HU_EMPTY', 'HU_NOT_EXIST'];
                                            const hasHU = !!(ci.ParentHandlingUnitNumber || ci.HandlingUnitNumber);
                                            return (
                                                <div className="px-4 pb-2">
                                                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                                                        {checkboxDefs.map(cb => {
                                                            const isHUCheckbox = huKeys.includes(cb.key);
                                                            const cbDisabled = isHUCheckbox && !hasHU;
                                                            return (
                                                                <label key={cb.key} className={`flex items-center gap-1.5 ${cbDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
                                                                    <input type="checkbox" checked={exceptionCode === cb.key}
                                                                        disabled={cbDisabled}
                                                                        onChange={e => { if (e.target.checked) { setExceptionCode(cb.key); setCountQty('0'); } else { setExceptionCode(''); } }}
                                                                        className="w-4 h-4 rounded border-slate-300 text-brand-blue focus:ring-blue-500 disabled:opacity-40" />
                                                                    <span className="text-xs text-slate-600 font-medium">{cb.label}</span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* ── Expanded: Quantity entry ── */}
                                        {isSelected && (
                                            <div className="px-4 pb-4">
                                                <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wider">Actual Count Qty</label>
                                                {/* Stepper row */}
                                                <div className="flex items-center gap-3 mb-3">
                                                    <button type="button"
                                                        onClick={() => setCountQty(Math.max(0, parseFloat(countQty || 0) - 1).toString())}
                                                        disabled={exDisabled}
                                                        className="w-14 h-14 bg-white border-2 border-slate-200 rounded-2xl flex items-center justify-center hover:bg-slate-100 hover:border-slate-300 disabled:opacity-40 text-slate-700 shrink-0 text-2xl font-bold transition-colors">
                                                        −
                                                    </button>
                                                    <input
                                                        type="number"
                                                        value={countQty}
                                                        onChange={e => setCountQty(e.target.value)}
                                                        disabled={exDisabled}
                                                        placeholder="0"
                                                        inputMode="decimal"
                                                        className={`flex-1 h-20 border-2 rounded-2xl text-center text-5xl font-bold tracking-tight focus:ring-2 focus:ring-brand-blue focus:border-brand-blue outline-none transition-all ${exDisabled ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-white text-slate-800 border-slate-300'}`}
                                                    />
                                                    <button type="button"
                                                        onClick={() => setCountQty((parseFloat(countQty || 0) + 1).toString())}
                                                        disabled={exDisabled}
                                                        className="w-14 h-14 bg-white border-2 border-slate-200 rounded-2xl flex items-center justify-center hover:bg-slate-100 hover:border-slate-300 disabled:opacity-40 text-slate-700 shrink-0 text-2xl font-bold transition-colors">
                                                        +
                                                    </button>
                                                </div>
                                                {/* UOM label */}
                                                <p className="text-center text-xs font-bold text-slate-400 uppercase mb-3">{countUnit || 'EA'}</p>
                                                {/* Post button inline */}
                                                <Button
                                                    onClick={handlePostCount}
                                                    disabled={postingLoading || !!successMsg}
                                                    className="w-full bg-brand-blue text-white">
                                                    {postingLoading ? <Loader size={18} className="animate-spin mr-2" /> : <Save size={18} className="mr-2" />}
                                                    Post Count
                                                </Button>
                                            </div>
                                        )}

                                    </div>
                                );
                            })}
                        </div>

                        {countItems.length === 0 && (
                            <div className="text-center py-12 text-slate-400">
                                <Info size={24} className="mx-auto mb-2 opacity-50" />
                                <p className="text-sm">No count items found</p>
                            </div>
                        )}

                        {/* Add Item button */}
                        <div className="mt-4 mb-2">
                            <Button type="button" onClick={() => setShowAddItemModal(true)} className="w-full">
                                <Plus size={16} className="mr-2" /> Add Item
                            </Button>
                        </div>

                    </div>
                </div>
            </div>
            {showAddItemModal && (
                <div className="fixed inset-0 z-[200] flex items-end bg-black/50" onClick={e => { if (e.target === e.currentTarget) setShowAddItemModal(false); }}>
                    <div className="bg-white w-full rounded-t-2xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-4" style={{ maxHeight: '85vh' }}>
                        <div className="flex justify-between items-center p-5 pb-0">
                            <h3 className="text-base font-bold text-slate-800">Add Count Item</h3>
                            <button onClick={() => setShowAddItemModal(false)} className="p-1 text-slate-400 hover:text-slate-600"><X size={20} /></button>
                        </div>

                        <div className="overflow-y-auto flex-1 p-5 pt-4 pb-8">

                            {/* Type Toggle */}
                            <div className="flex bg-slate-100 rounded-lg p-1 gap-1 mb-4">
                                {['product', 'hu'].map(t => (
                                    <button key={t} type="button"
                                        onClick={() => setAddItemForm(f => ({ ...f, type: t }))}
                                        className={`flex-1 py-2 rounded-md text-sm font-bold capitalize transition-all ${addItemForm.type === t ? 'bg-white text-brand-blue shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                            }`}>
                                        {t === 'hu' ? 'Handling Unit' : 'Product'}
                                    </button>
                                ))}
                            </div>

                            <div className="space-y-3">
                                {addItemForm.type === 'product' ? (
                                    <Input
                                        label="PRODUCT *"
                                        value={addItemForm.product}
                                        onChange={e => setAddItemForm(f => ({ ...f, product: e.target.value.toUpperCase() }))}
                                        placeholder="e.g. MAT001"
                                    />
                                ) : (
                                    <Input
                                        label="HANDLING UNIT *"
                                        value={addItemForm.hu}
                                        onChange={e => setAddItemForm(f => ({ ...f, hu: e.target.value.trim() }))}
                                        placeholder="e.g. HU001"
                                    />
                                )}

                                <div className="flex gap-3">
                                    <div className="flex-1">
                                        <Input
                                            label="QUANTITY *"
                                            type="number"
                                            step="0.001"
                                            value={addItemForm.qty}
                                            onChange={e => setAddItemForm(f => ({ ...f, qty: e.target.value }))}
                                            placeholder="0"
                                        />
                                    </div>
                                    <div className="w-24">
                                        <Input
                                            label="UOM"
                                            maxLength={3}
                                            value={addItemForm.uom}
                                            onChange={e => setAddItemForm(f => ({ ...f, uom: e.target.value.toUpperCase() }))}
                                        />
                                    </div>
                                </div>
                            </div>

                            {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

                            <div className="flex gap-3 mt-5">
                                <button onClick={() => setShowAddItemModal(false)}
                                    className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl">
                                    Cancel
                                </button>
                                <Button onClick={handleAddItem} disabled={addingItem} className="bg-brand-blue text-white w-full">
                                    {addingItem ? <><Loader size={18} className="animate-spin mr-2" /> Adding...</> : <><Plus size={18} className="mr-2" /> Add</>}
                                </Button>
                            </div>

                        </div>{/* end scrollable body */}
                    </div>
                </div>
            )}
        </>
        );
    }

    // ═══ STEP 1 & 2: Bin selection + List ═══
    return (
        <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
            <header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                <div className="flex justify-between items-center relative">
                    <button onClick={() => step === 'list' ? setStep('bin') : navigate(-1)}
                                            className="z-10 w-10 h-10 p-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
                                            <ArrowLeft size={20} className="text-white" />
                                        </button>
                    
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <h1 className="text-xl font-bold text-white tracking-wide">
                            Physical Inventory
                        </h1>
                                                <p className="text-blue-200 text-[10px] font-medium uppercase tracking-wider mt-0.5">
                                                    {step === 'bin' ? 'Select Warehouse & Bin' : `${filteredPiItems.length} Items${bin ? ` · Bin: ${bin}` : ''}`}
                                                </p>
                    </div>

                    <button onClick={() => navigate('/menu', { replace: true })}
                                            className="z-10 w-10 h-10 p-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
                                            <Home size={20} className="text-white" />
                                        </button>
                </div>
            </header>

            {/* Error/Success */}
            {error && (
                <div className="bg-red-50 border-b border-red-500 p-3 shadow-md flex gap-3 items-start absolute top-0 left-0 right-0 z-50">
                    <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                    <p className="text-[11px] text-red-600 mt-0.5 flex-1 whitespace-pre-wrap">{error}</p>
                    <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-md shrink-0"><X size={14} className="text-red-500" /></button>
                </div>
            )}
            {successMsg && (
                <div className="bg-emerald-50 border-b border-emerald-500 p-3 shadow-md flex gap-3 items-start absolute top-0 left-0 right-0 z-50">
                    <CheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={18} />
                    <p className="text-[11px] text-emerald-600 mt-0.5 flex-1">{successMsg}</p>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 content-area pb-8" style={{ zIndex: 10, position: 'relative' }}>
                <div className="max-w-md mx-auto">

                    {/* ═══ STEP 1: Bin Search ═══ */}
                    {step === 'bin' && (
                        <div className="glass-card mt-6" style={{ padding: '1.25rem', borderRadius: '1rem', border: '1px solid #e2e8f0' }}>
                            {/* Warehouse */}
                            <div className="mb-4">
                                <Select
                                    label="Warehouse *"
                                    value={selectedWarehouse}
                                    onChange={e => setSelectedWarehouse(e.target.value)}
                                    options={[
                                        { value: '', label: 'Select Warehouse', disabled: true },
                                        ...warehouses.map(w => ({ value: w.EWMWarehouse, label: `${w.EWMWarehouse} - ${w.EWMWarehouse_Text || w.EWMWarehouse}` }))
                                    ]}
                                    required
                                />
                            </div>

                            {/* Storage Bin */}
                            <div className="mb-4">
                                <Input
                                    label={<>Storage Bin <span className="text-slate-400 font-normal lowercase">(optional)</span></>}
                                    placeholder="Leave empty for all bins"
                                    value={bin}
                                    onChange={e => setBin(e.target.value.toUpperCase())}
                                    onKeyDown={e => { if (e.key === 'Enter') handleBinSubmit(); }}
                                    autoComplete="off"
                                    autoFocus
                                    rightIcon={
                                        <button type="button" onClick={() => { setScanTarget('bin'); setShowScanner(true); }} className="p-1 px-2 text-brand-blue hover:bg-blue-50 rounded-md">
                                            <ScanLine size={20} />
                                        </button>
                                    }
                                />
                            </div>

                            {/* Submit */}
                            <div className="w-full mt-2">
                                <Button onClick={handleBinSubmit} disabled={loading} className="w-full">
                                    {loading ? (
                                        <><Loader size={18} className="animate-spin mr-2" /> Loading...</>
                                    ) : (
                                        <><Search size={18} className="mr-2" /> {bin.trim() ? 'Find PI Items for Bin' : 'Find All PI Items'}</>
                                    )}
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* ═══ STEP 2: PI Items List (like PickingSearch results) ═══ */}
                    {step === 'list' && (
                        <div className="mt-4">
                            {/* Filter / Scan bar */}
                            <div className="glass-card mb-4" style={{ padding: '0.75rem', borderRadius: '1rem', border: '1px solid #e2e8f0' }}>
                                <div className="mb-2">
                                    <Input
                                        placeholder="Filter by Product, HU, Bin, GTIN…"
                                        value={filterText}
                                        onChange={e => setFilterText(e.target.value.toUpperCase())}
                                        onKeyDown={e => { if (e.key === 'Enter' && filterText) resolveFilter(filterText); }}
                                        autoComplete="off"
                                        leftIcon={<Search size={18} className="text-gray-400" />}
                                        rightIcon={
                                            <button type="button" onClick={() => { setScanTarget('filter'); setShowScanner(true); }} className="p-1 px-2 text-brand-blue hover:bg-blue-50 rounded-md">
                                                <Scan size={20} />
                                            </button>
                                        }
                                    />
                                </div>
                                {filterText && (
                                    <div className="flex justify-between items-center mt-2 px-1">
                                        <p className="text-xs text-slate-400">Showing {filteredPiItems.length} of {piItems.length}</p>
                                        <button onClick={() => setFilterText('')} className="text-xs text-blue-600 font-bold">Clear</button>
                                    </div>
                                )}
                            </div>

                            {/* Loading */}
                            {loading && (
                                <div className="text-center py-10">
                                    <Loader className="animate-spin text-brand-blue mx-auto mb-3" size={36} />
                                    <p className="text-gray-400 text-sm">Refreshing...</p>
                                </div>
                            )}

                            {/* Item cards — matching PickingSearch result cards */}
                            <div className="flex flex-col gap-2">
                                {filteredPiItems.map((item, idx) => {
                                    const rawCountItems = item._WhsePhysicalInventoryCntItem || [];
                                    const displayItems = getDisplayCountItems(rawCountItems);
                                    const status = getStatusInfo(item.PhysicalInventoryStatusText);
                                    // Summary for list card: gather unique products and HUs from display items
                                    const products = [...new Set(displayItems.filter(ci => ci.Product).map(ci => stripZeros(ci.Product)))];
                                    const hus = [...new Set(displayItems.filter(ci => ci.ParentHandlingUnitNumber || ci.HandlingUnitNumber).map(ci => ci.ParentHandlingUnitNumber || ci.HandlingUnitNumber))];
                                    const summaryText = products.length > 0 ? products.join(', ') : 'Empty Bin';

                                    return (
                                        <button key={`${item.PhysicalInventoryDocNumber}-${item.PhysicalInventoryItemNumber}-${idx}`}
                                            onClick={() => openDetail(item)}
                                            className="bg-white shadow-sm border border-slate-200 w-full p-4 rounded-xl flex items-center gap-3 text-left hover:shadow-md transition-all active:scale-[0.98]">
                                            {/* Icon badge */}
                                            <div className="w-10 h-10 p-0 rounded-full flex items-center justify-center shrink-0"
                                                style={{ backgroundColor: status.iconBg, color: status.color }}>
                                                <Package size={18} />
                                            </div>
                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="font-extrabold text-[#0a2351] text-base truncate">
                                                    Doc: {item.PhysicalInventoryDocNumber}
                                                </div>
                                                <div className="text-xs text-gray-500 truncate">
                                                    {summaryText} · Bin: {item.EWMStorageBin || '-'}
                                                </div>
                                                {hus.length > 0 && <div className="text-xs text-gray-500 truncate">HU: {hus.join(', ')}</div>}
                                            </div>
                                            {/* Status text */}
                                            <div className="text-right shrink-0">
                                                <span style={{ color: status.color }}
                                                    className="text-xs font-bold whitespace-nowrap">
                                                    {status.label}
                                                </span>
                                                {displayItems.length > 0 && (
                                                    <div className="text-[10px] text-gray-400 mt-1">{displayItems.length} item{displayItems.length > 1 ? 's' : ''}</div>
                                                )}
                                            </div>
                                            <ChevronRight size={18} className="text-gray-400 shrink-0" />
                                        </button>
                                    );
                                })}
                            </div>

                            {filteredPiItems.length === 0 && !loading && (
                                <div className="text-center py-12 text-gray-400">
                                    <Package size={36} className="mx-auto mb-3 opacity-30" />
                                    <p className="text-sm">{piItems.length > 0 ? 'No items match your filter.' : 'No PI items found.'}</p>
                                    <p className="text-xs mt-1">{piItems.length > 0 ? 'Clear filter to see all items.' : 'Go back and try a different bin.'}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
        </div>
    );
};

export default PICount;
