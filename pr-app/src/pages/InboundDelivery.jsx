import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, extractSapMessage } from '../services/api';
import {
    Package, ArrowLeft, Home, Filter, Calendar,
    AlertCircle, Loader, CheckCircle, PackageCheck, ChevronDown, X, Scan, Search
} from 'lucide-react';
import BarcodeScanner from '../components/BarcodeScanner';


const InboundDelivery = () => {
    const navigate = useNavigate();
    const { apiConfig } = useAuth();

    // UI State
    const [view, setView] = useState('filter'); // 'filter' | 'list' | 'items'
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');

    // Filter State
    const toISO = (d) => d ? d.toISOString().slice(0, 10) : '';
    const today = new Date();
    const ninetyDaysAgo = new Date(); ninetyDaysAgo.setDate(today.getDate() - 90);
    const [filters, setFilters] = useState({
        deliveryNumber: '',
        supplier: '',
        dateFrom: toISO(ninetyDaysAgo),
        dateTo: toISO(today),
    });

    // Data State
    const [ibds, setIbds] = useState([]);
    const [selectedIBD, setSelectedIBD] = useState(null);
    const [ibdItems, setIbdItems] = useState([]);
    const [expandedIBD, setExpandedIBD] = useState(null);

    // Putaway State
    const [expandedItem, setExpandedItem] = useState(null);
    const [putawayQty, setPutawayQty] = useState('');
    const [storageLoc, setStorageLoc] = useState('');
    const [availableSLs, setAvailableSLs] = useState([]);
    const [showSLHelp, setShowSLHelp] = useState(false);
    const [slLoading, setSlLoading] = useState(false);
    const [updateLoading, setUpdateLoading] = useState(false);
    const [matDocs, setMatDocs] = useState([]);

    // Posting State
    const [confirmLoading, setConfirmLoading] = useState(false);

    // Scanner State
    const [showScanner, setShowScanner] = useState(false);
    const [scanField, setScanField] = useState(null);
    const handleScan = (code) => {
        if (scanField === 'deliveryNumber') setFilters(f => ({ ...f, deliveryNumber: code.trim() }));
        else if (scanField === 'supplier') setFilters(f => ({ ...f, supplier: code.trim() }));
        setShowScanner(false);
        setScanField(null);
    };

    const loadIBDs = async (activeFilters) => {
        const f = activeFilters || filters;
        if (!f.deliveryNumber && !f.supplier && !f.dateFrom) {
            setError('Please enter at least one filter (Delivery Number, Supplier, or Date From) before searching.');
            return;
        }
        setLoading(true);
        setError(null);
        setIbds([]);
        try {
            const apiFilters = {
                ...(f.deliveryNumber && { deliveryNumber: f.deliveryNumber.trim() }),
                ...(f.supplier && { supplier: f.supplier.trim().toUpperCase() }),
                ...(f.dateFrom && { dateFrom: f.dateFrom }),
                ...(f.dateTo && { dateTo: f.dateTo }),
            };
            const data = await api.fetchInboundDeliveries(apiConfig, 100, apiFilters);
            const results = data.d ? data.d.results : (data.value || []);
            setIbds(results);
            setView('list');
        } catch (err) {
            setError(extractSapMessage(err));
        } finally {
            setLoading(false);
        }
    };

    const handleViewItems = async (ibd) => {
        setSelectedIBD(ibd);
        setLoading(true);
        setView('items');
        setMatDocs([]);
        setError(null);
        setSuccessMsg('');
        try {
            const [itemsData, matDocData] = await Promise.all([
                api.fetchInboundDeliveryItems(apiConfig, ibd.DeliveryDocument),
                api.fetchMaterialDocumentsForIBD(apiConfig, ibd.DeliveryDocument)
            ]);
            const items = itemsData.d ? itemsData.d.results : (itemsData.value || []);
            const docs = matDocData.d ? matDocData.d.results : (matDocData.value || []);
            setIbdItems(items);
            setMatDocs(docs);
        } catch (err) {
            setError('Failed to load items/data: ' + err.message);
            setIbdItems([]);
        } finally {
            setLoading(false);
        }
    };

    const getProcessedQty = (item) => {
        // 1. Calculate total processed quantity from Material Documents (GRs)
        const relevantDocs = matDocs.filter(d => d.DeliveryDocumentItem === item.DeliveryDocumentItem);
        const matDocQty = relevantDocs.reduce((sum, d) => sum + parseFloat(d.QuantityInEntryUnit || 0), 0);

        if (matDocQty > 0) return matDocQty;

        // 2. Fallback: Check Expanded Document Flow (e.g. Putaway Tasks)
        if (item.to_DocumentFlow && item.to_DocumentFlow.results) {
            const flowQty = item.to_DocumentFlow.results.reduce((sum, f) => {
                return sum + parseFloat(f.QuantityInBaseUnit || 0);
            }, 0);
            if (flowQty > 0) return flowQty;
        }
        // 3. Last Resort: Item fields
        return parseFloat(item.PutawayQuantity || item.PickedQuantity || 0);
    };

    const handleExpandItem = (item) => {
        if (expandedItem === item.DeliveryDocumentItem) {
            setExpandedItem(null);
        } else {
            setExpandedItem(item.DeliveryDocumentItem);
            const targetQty = parseFloat(item.DeliveryQuantity || item.OriginalDeliveryQuantity || 0);
            const doneQty = getProcessedQty(item);
            const remaining = Math.max(0, targetQty - doneQty);
            setPutawayQty(remaining.toString());
            setStorageLoc(item.StorageLocation || '');
            if (item.Plant && item.Material) {
                setSlLoading(true);
                api.fetchStorageLocations(apiConfig, item.Plant, item.Material)
                    .then(slData => {
                        const results = slData.d ? slData.d.results : (slData.value || []);
                        setAvailableSLs(results);
                    })
                    .catch(e => console.warn('Error fetching SLs', e))
                    .finally(() => setSlLoading(false));
            } else {
                setAvailableSLs([]);
            }
        }
    };

    const handleUpdateItem = async (item) => {
        if (!putawayQty || (!storageLoc && !item.StorageLocation)) {
            alert("Please enter Putaway Quantity and Storage Location.");
            return;
        }

        setUpdateLoading(true);
        setError(null);
        try {
            const etag = item.__metadata ? item.__metadata.etag : null;

            const existingPutaway = getProcessedQty(item);
            const inputQty = parseFloat(putawayQty || 0);
            const totalQty = existingPutaway + inputQty;

            const payload = {
                ActualDeliveryQuantity: totalQty.toString(),
                StorageLocation: storageLoc || item.StorageLocation,
                DeliveryQuantityUnit: item.DeliveryQuantityUnit
            };

            const result = await api.updateInboundDeliveryItem(
                apiConfig,
                selectedIBD.DeliveryDocument,
                item.DeliveryDocumentItem,
                payload,
                etag
            );

            const newEtag = result.etag || (result.__metadata ? result.__metadata.etag : etag);

            setIbdItems(prevItems => prevItems.map(i => {
                if (i.DeliveryDocumentItem === item.DeliveryDocumentItem) {
                    return {
                        PutawayQuantity: totalQty.toString(),
                        StorageLocation: storageLoc || i.StorageLocation,
                        PutawayStatus: 'C',
                        to_DocumentFlow: null,
                        __metadata: { ...i.__metadata, etag: newEtag }
                    };
                }
                return i;
            }));

            setMatDocs(prev => prev.filter(d => d.DeliveryDocumentItem !== item.DeliveryDocumentItem));

            let freshEtag = newEtag;
            try {
                const freshItemData = await api.fetchInboundDeliveryItem(
                    apiConfig, selectedIBD.DeliveryDocument, item.DeliveryDocumentItem
                );
                const freshItem = freshItemData.d || freshItemData;
                if (freshItem?.__metadata?.etag) freshEtag = freshItem.__metadata.etag;
            } catch (refetchErr) {
                console.warn('Could not refetch item for fresh ETag:', refetchErr);
            }

            await api.putawayInboundDeliveryItem(
                apiConfig,
                selectedIBD.DeliveryDocument,
                item.DeliveryDocumentItem,
                freshEtag
            );

            setSuccessMsg(`Putaway Confirmed for Item ${item.DeliveryDocumentItem}`);
            setExpandedItem(null);

        } catch (err) {
            setError('Failed to Putaway: ' + err.message);
        } finally {
            setUpdateLoading(false);
        }
    };

    const getPutawayState = (item) => {
        const target = parseFloat(item.DeliveryQuantity || item.OriginalDeliveryQuantity || 0);
        const done = getProcessedQty(item);

        const isQtyComplete = done >= target && target > 0;

        if (isQtyComplete) return { status: 'Fully Putaway', color: 'bg-blue-100 text-blue-700', isComplete: true };

        const apiStatus = item.PickingStatus || item.PutawayStatus;
        if (apiStatus === 'C' && isQtyComplete) return { status: 'Fully Putaway', color: 'bg-blue-100 text-blue-700', isComplete: true };

        if (done > 0 || apiStatus === 'B') return { status: 'Partial', color: 'bg-orange-100 text-orange-700', isComplete: false };

        return { status: 'Not Putaway', color: 'bg-slate-100 text-slate-500', isComplete: false };
    };

    const handlePostGR = async (ibd) => {
        const confirmMsg = `Post Goods Receipt for Inbound Delivery ${ibd.DeliveryDocument}? This will complete Putaway for ALL items.`;
        if (!window.confirm(confirmMsg)) return;

        setConfirmLoading(true);
        setError(null);

        try {
            // STEP 1: Fetch items if not already loaded
            let itemsToProcess = ibdItems;
            if (ibdItems.length === 0 || selectedIBD?.DeliveryDocument !== ibd.DeliveryDocument) {
                const itemsData = await api.fetchInboundDeliveryItems(apiConfig, ibd.DeliveryDocument);
                itemsToProcess = itemsData.d ? itemsData.d.results : (itemsData.value || []);
            }

            // STEP 2: Check for items missing Storage Location
            const missingSL = itemsToProcess.filter(i =>
                !i.StorageLocation && parseFloat(i.DeliveryQuantity) > 0
            );

            let defaultSLoc = '';
            if (missingSL.length > 0) {
                const itemWithSLoc = itemsToProcess.find(i => i.StorageLocation);
                const suggestedSLoc = itemWithSLoc?.StorageLocation || '';

                const matNames = missingSL.map(i => i.Material).join(', ');
                const userInput = window.prompt(
                    `Storage Location is missing for: ${matNames}\n\nEnter a Storage Location to use for these items (or leave suggested value):`,
                    suggestedSLoc
                );

                if (userInput === null) {
                    setConfirmLoading(false);
                    return;
                }

                if (!userInput.trim()) {
                    setError('Storage Location is required for all items. Please provide a valid Storage Location.');
                    setConfirmLoading(false);
                    return;
                }

                defaultSLoc = userInput.trim().toUpperCase();
            }

            // STEP 3: BULK PUTAWAY UPDATE
            for (const item of itemsToProcess) {
                const targetQty = parseFloat(item.DeliveryQuantity || item.OriginalDeliveryQuantity || 0);
                const currentQty = getProcessedQty(item);
                const itemSLoc = item.StorageLocation || defaultSLoc;

                if (targetQty <= 0) continue;

                if (currentQty < targetQty || !item.StorageLocation) {
                    const payload = {
                        ActualDeliveryQuantity: targetQty.toString(),
                        StorageLocation: itemSLoc,
                        DeliveryQuantityUnit: item.DeliveryQuantityUnit
                    };
                    const etag = item.__metadata ? item.__metadata.etag : null;

                    const updateRes = await api.updateInboundDeliveryItem(
                        apiConfig, ibd.DeliveryDocument, item.DeliveryDocumentItem, payload, etag
                    );
                    let freshEtag = updateRes.etag || (updateRes.__metadata ? updateRes.__metadata.etag : etag);
                    try {
                        const freshItemData = await api.fetchInboundDeliveryItem(
                            apiConfig, ibd.DeliveryDocument, item.DeliveryDocumentItem
                        );
                        const freshItem = freshItemData.d || freshItemData;
                        if (freshItem?.__metadata?.etag) freshEtag = freshItem.__metadata.etag;
                    } catch (e) { console.warn('Refetch failed', e); }

                    await api.putawayInboundDeliveryItem(
                        apiConfig, ibd.DeliveryDocument, item.DeliveryDocumentItem, freshEtag
                    );
                }
            }

            // STEP 4: POST GOODS RECEIPT
            let headerEtag = ibd.__metadata ? ibd.__metadata.etag : null;

            let postSuccess = false;
            let attempt = 0;
            const maxAttempts = 2;

            while (!postSuccess && attempt < maxAttempts) {
                attempt++;
                try {
                    try {
                        const freshHeader = await api.fetchInboundDelivery(apiConfig, ibd.DeliveryDocument);
                        if (freshHeader && freshHeader.__metadata) headerEtag = freshHeader.__metadata.etag;
                    } catch (e) { console.warn('Header fetch failed', e); }

                    await api.postGoodsReceiptForIBD(apiConfig, ibd.DeliveryDocument, headerEtag);
                    postSuccess = true;

                } catch (err) {
                    const errText = err.message || JSON.stringify(err);
                    const periodMatch = errText.match(/periods\s+(\d{4}\/\d{2})\s+and/);
                    if (periodMatch && periodMatch[1] && attempt < maxAttempts) {
                        const validPeriod = periodMatch[1];
                        const [year, month] = validPeriod.split('/');
                        const fixDateStr = `${year}-${month}-15T12:00:00`;
                        setSuccessMsg(`Fixing Posting Date to ${validPeriod}...`);
                        await api.postGoodsReceiptForIBD(apiConfig, ibd.DeliveryDocument, headerEtag, fixDateStr);
                        postSuccess = true;
                        continue;
                    }
                    throw err;
                }
            }

            setSuccessMsg(`Goods Receipt Posted for Delivery ${ibd.DeliveryDocument}!`);
            loadIBDs(filters);
            setTimeout(() => {
                setSuccessMsg('');
                setView('list');
                setExpandedIBD(null);
            }, 3000);
        } catch (err) {
            setSuccessMsg('');
            let innerMsg = err.message;

            const errStr = JSON.stringify(err) + (err.message || "");
            const periodMatch = errStr.match(/periods\s+(\d{4}\/\d{2})\s+and/);
            if (periodMatch && periodMatch[1]) {
                innerMsg = `Posting Failed: Fiscal period is closed. Please ask IT to open period ${periodMatch[1]}.`;
            } else if (errStr.includes("M7") && errStr.includes("053")) {
                innerMsg = "Posting Failed: Fiscal period is closed (M7/053). Please check posting dates.";
            } else if (err.response) {
                try {
                    const txt = await err.response.text();
                    const match = txt.match(/"message"\s*:\s*{\s*"lang"\s*:\s*"[^"]*"\s*,\s*"value"\s*:\s*"([^"]*)"/);
                    if (match && match[1]) innerMsg = match[1];
                } catch (e) { }
            }
            setError(innerMsg);
        } finally {
            setConfirmLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
            <header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                <div className="flex justify-between items-center relative">
                    <button onClick={() => view === 'filter' ? navigate(-1) : view === 'items' ? setView('list') : setView('filter')} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition" title="Back">
                                            <ArrowLeft size={20} />
                                        </button>
                    
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <h1 className="text-xl font-bold text-white tracking-wide">
                            {view === 'filter' ? 'Inbound Delivery' : view === 'items' ? `IBD #${selectedIBD?.DeliveryDocument}` : `${ibds.length}`}
                        </h1>
                                                <p className="text-blue-200 text-[10px] font-medium uppercase tracking-wider mt-0.5">
                                                    {view === 'filter' ? 'Search Filters' : view === 'items' ? 'Delivery Items' : 'Inbound Deliveries'}
                                                </p>
                    </div>

                    <button onClick={() => { setError(null); navigate('/menu', { replace: true }); }} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition" title="Home">
                                            <Home size={20} />
                                        </button>
                </div>
            </header>

            {/* Inline Error/Success Messages */}
            {(error || successMsg) && (
                <div className="px-4 py-3 z-50 w-full shrink-0 flex flex-col gap-2 relative">
                    {error && (
                        <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-3 shadow-md flex gap-3 items-start w-full max-w-5xl mx-auto animate-in slide-in-from-top-2">
                            <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                            <div className="flex-1 min-w-0">
                                <h4 className="text-xs font-bold text-red-700">Error</h4>
                                <p className="text-[11px] text-red-600 mt-0.5 whitespace-pre-wrap">{error}</p>
                            </div>
                            <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-md transition-colors shrink-0">
                                <X size={14} className="text-red-500" />
                            </button>
                        </div>
                    )}
                    {successMsg && (
                        <div className="bg-blue-50 border-l-4 border-blue-500 rounded-lg p-3 shadow-md flex gap-3 items-start w-full max-w-5xl mx-auto animate-in slide-in-from-top-2">
                            <CheckCircle className="text-blue-500 shrink-0 mt-0.5" size={18} />
                            <div className="flex-1 min-w-0">
                                <h4 className="text-xs font-bold text-blue-700">Success</h4>
                                <p className="text-[11px] text-blue-600 mt-0.5 whitespace-pre-wrap">{successMsg}</p>
                            </div>
                            <button onClick={() => setSuccessMsg('')} className="p-1 hover:bg-blue-100 rounded-md transition-colors shrink-0">
                                <X size={14} className="text-blue-500" />
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto px-4 pt-4 pb-32 z-10 content-area" style={{ WebkitOverflowScrolling: 'touch' }}>
                <div className="max-w-5xl mx-auto">

                    {/* FILTER SCREEN */}
                    {view === 'filter' && (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mt-4 space-y-4">
                            <div className="flex items-center gap-2 mb-1">
                                <Filter size={16} className="text-blue-600" />
                                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Search Filters</h2>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Delivery Number</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={filters.deliveryNumber}
                                        onChange={e => setFilters(f => ({ ...f, deliveryNumber: e.target.value }))}
                                        placeholder="e.g. 180000123"
                                        className="flex-1 h-11 bg-slate-50 border border-blue-200 rounded-lg px-3 text-sm font-bold text-blue-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                                    />
                                    <button type="button" onClick={() => { setScanField('deliveryNumber'); setShowScanner(true); }} className="h-11 w-11 flex-none bg-brand-blue text-white rounded-lg flex items-center justify-center hover:opacity-90 transition-colors" title="Scan Delivery Number">
                                        <Scan size={18} />
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Supplier</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={filters.supplier}
                                        onChange={e => setFilters(f => ({ ...f, supplier: e.target.value }))}
                                        placeholder="e.g. 10001234"
                                        className="flex-1 h-11 bg-slate-50 border border-blue-200 rounded-lg px-3 text-sm font-bold text-blue-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                                    />
                                    <button type="button" onClick={() => { setScanField('supplier'); setShowScanner(true); }} className="h-11 w-11 flex-none bg-brand-blue text-white rounded-lg flex items-center justify-center hover:opacity-90 transition-colors" title="Scan Supplier">
                                        <Scan size={18} />
                                    </button>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3">
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">
                                        Date From
                                    </label>
                                    <input
                                        type="date"
                                        value={filters.dateFrom}
                                        onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
                                        className="w-full h-11 bg-slate-50 border border-blue-200 rounded-lg px-3 text-sm font-bold text-blue-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">
                                        Date To
                                    </label>
                                    <input
                                        type="date"
                                        value={filters.dateTo}
                                        onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))}
                                        className="w-full h-11 bg-slate-50 border border-blue-200 rounded-lg px-3 text-sm font-bold text-blue-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                                    />
                                </div>
                            </div>

                            <div className="w-full mt-4">
                                <button
                                    onClick={() => loadIBDs(filters)}
                                    disabled={loading}
                                    className="w-full bg-brand-blue hover:bg-opacity-90 text-white font-bold py-3.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60"
                                >
                                    {loading ? <><Loader className="animate-spin" size={16} /> Searching...</> : <><Search size={16} /> Search Deliveries</>}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* LIST VIEW */}
                    {view === 'list' && (
                        <div className="grid grid-cols-1 gap-4">
                            {loading ? (
                                <div className="text-center py-12">
                                    <Loader className="animate-spin text-blue-600 mb-4" size={32} />
                                    <p className="text-slate-400">Loading Inbound Deliveries...</p>
                                </div>
                            ) : ibds.length === 0 ? (
                                <div className="text-center py-16 text-slate-500 border-2 border-dashed border-slate-200 rounded-xl">
                                    <Package className="mx-auto mb-4 opacity-30 text-slate-400" size={48} />
                                    <p>No Inbound Deliveries found.</p>
                                </div>
                            ) : (
                                ibds.map(ibd => (
                                    <div
                                        key={ibd.DeliveryDocument}
                                        className="relative bg-white rounded-xl mb-4 shadow-sm border border-slate-200 overflow-hidden cursor-pointer hover:shadow-md transition-all flex items-stretch min-h-[100px]"
                                        onClick={() => setExpandedIBD(expandedIBD === ibd.DeliveryDocument ? null : ibd.DeliveryDocument)}
                                    >
                                        <div className="w-2 bg-blue-500 flex-shrink-0"></div>
                                        <div className="flex-1 px-4 py-3 flex flex-col justify-center gap-1.5 min-w-0">
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-lg font-bold text-slate-900 leading-tight">IBD #{ibd.DeliveryDocument}</h3>
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-mono border border-slate-200">
                                                    {ibd.OverallGoodsMovementStatus === 'C' ? 'Posted' : 'Open'}
                                                </span>
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2 text-sm text-slate-600 truncate">
                                                    <span className="font-bold uppercase text-[11px] text-slate-400 tracking-wider">Supplier</span>
                                                    <span className="font-bold truncate text-slate-800" title={ibd.Supplier}>
                                                        {ibd.Supplier || 'N/A'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                                                    <Calendar size={13} className="text-slate-400" />
                                                    <span>{ibd.PlannedDeliveryDate ? new Date(parseInt(ibd.PlannedDeliveryDate.replace(/\/Date\((-?\d+)\)\//, '$1'))).toLocaleDateString() : 'Pending'}</span>
                                                </div>
                                            </div>

                                            {expandedIBD === ibd.DeliveryDocument && (
                                                <div className="mt-4 pt-4 border-t border-slate-100 animate-in">
                                                    <div className="flex gap-3">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleViewItems(ibd); }}
                                                            className="flex-1 py-2 rounded-lg border-2 border-brand-blue text-brand-blue font-bold text-xs hover:bg-blue-50 transition-colors"
                                                        >
                                                            View Items
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handlePostGR(ibd); }}
                                                            className="flex-1 py-2 rounded-lg bg-brand-blue text-white font-bold text-xs hover:opacity-90 transition-colors shadow-sm"
                                                            disabled={confirmLoading}
                                                        >
                                                            {confirmLoading ? <Loader className="animate-spin mx-auto" size={14} /> : 'Post GR'}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* ITEMS VIEW */}
                    {view === 'items' && selectedIBD && (
                        <div className="space-y-4 animate-in">
                            <div className="flex justify-end items-center mb-0">
                                <button
                                    onClick={() => handlePostGR(selectedIBD)}
                                    className="px-6 py-2 hover:opacity-90 bg-brand-blue text-white font-bold text-xs uppercase rounded-lg shadow-md disabled:opacity-50 transition-all active:scale-95"
                                    disabled={confirmLoading}
                                >
                                    {confirmLoading ? <Loader className="animate-spin" size={14} /> : 'Post GR'}
                                </button>
                            </div>

                            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-800">IBD #{selectedIBD.DeliveryDocument}</h2>
                                        <p className="text-xs text-slate-500 font-medium mt-1">Supplier: <span className="text-slate-600 font-bold">{selectedIBD.Supplier}</span></p>
                                    </div>
                                </div>
                            </div>

                            {loading ? (
                                <div className="text-center py-12">
                                    <Loader className="animate-spin text-blue-600 mb-4" size={32} />
                                    <p className="text-slate-400">Loading Items...</p>
                                </div>
                            ) : (
                                ibdItems.map(item => {
                                    const { status, color, isComplete } = getPutawayState(item);
                                    return (
                                        <div key={item.DeliveryDocumentItem} className={`bg-white rounded-xl shadow border border-slate-200 ${expandedItem === item.DeliveryDocumentItem ? 'ring-2 ring-blue-100' : ''}`} style={{ overflow: 'visible' }}>
                                            <div className="p-4 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => handleExpandItem(item)}>
                                                <div className="flex justify-between items-start">
                                                    <div className="flex items-start gap-3">
                                                        <div className={`w-8 h-8 rounded flex items-center justify-center font-mono text-xs font-bold mt-1 ${isComplete ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                                                            {isComplete ? <CheckCircle size={16} /> : item.DeliveryDocumentItem}
                                                        </div>
                                                        <div>
                                                            <h4 className="m-0 text-base font-bold text-slate-800 leading-tight">{item.Material}</h4>
                                                            <p className="m-0 text-xs text-slate-500 mt-1">{item.DeliveryDocumentItemText || 'Item Text'}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="flex items-baseline justify-end gap-1">
                                                            <span className="text-slate-400 text-[10px] font-bold uppercase mr-1">Putaway</span>
                                                            <span className={`font-bold text-lg ${isComplete ? 'text-blue-600' : 'text-slate-800'}`}>
                                                                {getProcessedQty(item).toFixed(2)}
                                                            </span>
                                                            <span className="text-slate-400 text-[10px] font-bold mx-1">/</span>
                                                            <span className="text-slate-500 text-xs font-bold">{parseFloat(item.DeliveryQuantity || item.OriginalDeliveryQuantity || 0).toFixed(2)} {item.DeliveryQuantityUnit}</span>
                                                        </div>
                                                        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${color}`}>
                                                            {status}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {expandedItem === item.DeliveryDocumentItem && (
                                                <div className="bg-slate-50 border-t border-slate-200 p-4 animate-in" style={{ overflow: 'visible' }}>

                                                    {isComplete ? (
                                                        <div className="text-center py-4">
                                                            <PackageCheck className="mx-auto text-blue-500 mb-2" size={32} />
                                                            <p className="text-slate-800 font-bold">Item Fully Putaway</p>
                                                            <p className="text-xs text-slate-600">{item.PutawayQuantity} {item.DeliveryQuantityUnit}</p>
                                                        </div>
                                                    ) : (
                                                        <div className="grid grid-cols-1 gap-4 mb-4" style={{ overflow: 'visible' }}>
                                                            <div>
                                                                <label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">Putaway Quantity (Remaining)</label>
                                                                <div className="flex items-center gap-3">
                                                                    <button type="button"
                                                                        className="w-10 h-10 bg-brand-blue text-white rounded-lg flex items-center justify-center hover:opacity-90 transition-colors"
                                                                        onClick={() => { const curr = parseFloat(putawayQty || 0); setPutawayQty((curr - 1 >= 0 ? curr - 1 : 0).toString()); }}>
                                                                        <span className="text-xl font-bold mb-0.5">−</span>
                                                                    </button>
                                                                    <input
                                                                        className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-lg text-center text-lg font-bold focus:ring-2 focus:ring-brand-blue outline-none"
                                                                        value={putawayQty}
                                                                        onChange={(e) => setPutawayQty(e.target.value)}
                                                                        type="number"
                                                                    />
                                                                    <button type="button"
                                                                        className="w-10 h-10 bg-brand-blue text-white rounded-lg flex items-center justify-center hover:opacity-90 transition-colors"
                                                                        onClick={() => { const curr = parseFloat(putawayQty || 0); setPutawayQty((curr + 1).toString()); }}>
                                                                        <span className="text-xl font-bold mb-0.5">+</span>
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            <div style={{ position: 'relative', zIndex: 100, overflow: 'visible' }}>
                                                                <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Storage Location</label>
                                                                <div style={{ position: 'relative', overflow: 'visible' }}>
                                                                    <div style={{ position: 'relative' }}>
                                                                        <input
                                                                            type="text"
                                                                            value={storageLoc}
                                                                            onChange={(e) => setStorageLoc(e.target.value.toUpperCase())}
                                                                            onFocus={() => setShowSLHelp(true)}
                                                                            placeholder="Enter or select"
                                                                            style={{
                                                                                width: '100%', height: '48px', border: '1px solid #cbd5e1',
                                                                                borderRadius: '8px', padding: '0 40px 0 16px',
                                                                                fontSize: '14px', boxSizing: 'border-box', outline: 'none'
                                                                            }}
                                                                        />
                                                                        <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', pointerEvents: 'none' }}>
                                                                            <ChevronDown size={18} />
                                                                        </div>
                                                                    </div>

                                                                    {showSLHelp && (
                                                                        <div style={{
                                                                            position: 'absolute', left: 0, right: 0, marginTop: '4px',
                                                                            backgroundColor: 'white', border: '1px solid #e2e8f0',
                                                                            borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                                                                            zIndex: 1000, maxHeight: '200px', overflowY: 'auto'
                                                                        }}>
                                                                            {availableSLs.length === 0 ? (
                                                                                <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                                                                                    {slLoading ? 'Loading...' : 'No options – type manually'}
                                                                                </div>
                                                                            ) : (
                                                                                availableSLs.map((sl, idx) => (
                                                                                    <div
                                                                                        key={sl.StorageLocation}
                                                                                        onClick={() => { setStorageLoc(sl.StorageLocation); setShowSLHelp(false); }}
                                                                                        style={{
                                                                                            padding: '12px 16px', cursor: 'pointer',
                                                                                            borderBottom: idx < availableSLs.length - 1 ? '1px solid #f1f5f9' : 'none'
                                                                                        }}
                                                                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#eff6ff'}
                                                                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                                                                                    >
                                                                                        <div style={{ fontWeight: '600', color: '#1e293b' }}>{sl.StorageLocation}</div>
                                                                                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{sl.StorageLocationName || 'Standard Location'}</div>
                                                                                    </div>
                                                                                ))
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {!isComplete && (
                                                        <button
                                                            onClick={() => handleUpdateItem(item)}
                                                            className="w-full bg-brand-blue hover:opacity-90 text-white font-bold h-10 rounded-lg shadow-sm"
                                                            disabled={updateLoading}
                                                        >
                                                            {updateLoading ? <Loader className="animate-spin" size={16} /> : 'Confirm Putaway'}
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>
            </main>
            {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => { setShowScanner(false); setScanField(null); }} />}
        </div>
    );
};

export default InboundDelivery;
