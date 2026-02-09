import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
    Search, Package, ArrowLeft, Home, Truck,
    AlertCircle, Loader, CheckCircle, PackageCheck, List
} from 'lucide-react';

const InboundDelivery = () => {
    const navigate = useNavigate();
    const { apiConfig } = useAuth();

    // UI State
    const [view, setView] = useState('list'); // 'list' | 'items'
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    // Data State
    const [ibds, setIbds] = useState([]); // Inbound Deliveries
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
    const [matDocs, setMatDocs] = useState([]); // Store related Material Documents

    // Posting State
    const [confirmLoading, setConfirmLoading] = useState(false);

    useEffect(() => {
        loadIBDs();
    }, []);

    const loadIBDs = async () => {
        setLoading(true);
        try {
            const data = await api.fetchInboundDeliveries(apiConfig);
            const results = data.d ? data.d.results : (data.value || []);
            setIbds(results);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleViewItems = async (ibd) => {
        setSelectedIBD(ibd);
        setLoading(true);
        setView('items');
        setMatDocs([]); // Clear previous
        try {
            const [itemsData, matDocData] = await Promise.all([
                api.fetchInboundDeliveryItems(apiConfig, ibd.DeliveryDocument),
                api.fetchMaterialDocumentsForIBD(apiConfig, ibd.DeliveryDocument)
            ]);

            const items = itemsData.d ? itemsData.d.results : (itemsData.value || []);
            const docs = matDocData.d ? matDocData.d.results : (matDocData.value || []);

            setIbdItems(items);
            setMatDocs(docs);

            // DEBUG: Log first item to check structure and DocFlow
            if (items.length > 0) {
                console.log("DEBUG: Fetched Item 0:", items[0]);
                console.log("DEBUG: Item 0 DocFlow:", items[0].to_DocumentFlow);
                if (items[0].to_DocumentFlow && items[0].to_DocumentFlow.results) {
                    console.log("DEBUG: DocFlow Results:", items[0].to_DocumentFlow.results);
                }
            }
        } catch (err) {
            console.error(err);
            setError("Failed to load items/data: " + err.message);
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
            console.log("DEBUG: getProcessedQty flowQty was 0 or less", flowQty);
        }

        // 3. Last Result: Item fields
        const val = parseFloat(item.PutawayQuantity || item.PickedQuantity || 0);
        console.log(`DEBUG: getProcessedQty for ${item.DeliveryDocumentItem} returning fallback:`, val, "Item:", item);
        return val;
    };

    const handleExpandItem = (item) => {
        if (expandedItem === item.DeliveryDocumentItem) {
            setExpandedItem(null);
        } else {
            console.log("DEBUG: Expanding Item:", item);
            setExpandedItem(item.DeliveryDocumentItem);

            // LOGIC FIX: Default Input to Remaining Qty
            const targetQty = parseFloat(item.DeliveryQuantity || item.OriginalDeliveryQuantity || 0);
            const doneQty = getProcessedQty(item);
            const remaining = Math.max(0, targetQty - doneQty);

            console.log(`DEBUG: Calc Remaining: Target=${targetQty}, Done=${doneQty}, Remaining=${remaining}`);

            setPutawayQty(remaining.toString());
            setStorageLoc(item.StorageLocation || '');

            // Fetch valid Storage Locations if Plant & Material are available
            if (item.Plant && item.Material) {
                setSlLoading(true);
                api.fetchStorageLocations(apiConfig, item.Plant, item.Material)
                    .then(slData => {
                        const results = slData.d ? slData.d.results : (slData.value || []);
                        setAvailableSLs(results);
                    })
                    .catch(e => console.warn("Error fetching SLs", e))
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

            // LOGIC FIX: Calculate Total for Payload (Existing + Input)
            const existingPutaway = getProcessedQty(item);
            const inputQty = parseFloat(putawayQty || 0);
            const totalQty = existingPutaway + inputQty;

            // Update Item (PATCH) with Quantity and Location
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

            // Get new ETag from PATCH response to use in next call
            const newEtag = result.etag || (result.__metadata ? result.__metadata.etag : etag);

            // Optimistic Update
            setIbdItems(prevItems => prevItems.map(i => {
                if (i.DeliveryDocumentItem === item.DeliveryDocumentItem) {
                    return {
                        PutawayQuantity: totalQty.toString(),
                        StorageLocation: storageLoc || i.StorageLocation,
                        PutawayStatus: 'C',
                        to_DocumentFlow: null, // CLEAR STALE DOC FLOW to force usage of PutawayQuantity
                        __metadata: { ...i.__metadata, etag: newEtag }
                    };
                }
                return i;
            }));

            // Also clear MatDocs for this item to be safe
            setMatDocs(prev => prev.filter(d => d.DeliveryDocumentItem !== item.DeliveryDocumentItem));


            // CRITICAL FIX: Re-fetch the SINGLE item to get the absolute latest ETag from server.
            // PATCH might update version but not return the new ETag in headers in some OData configs.
            // This ensures we have the correct If-Match for the subsequent Putaway Action.
            let freshEtag = newEtag;
            try {
                const freshItemData = await api.fetchInboundDeliveryItem(
                    apiConfig,
                    selectedIBD.DeliveryDocument,
                    item.DeliveryDocumentItem
                );
                const freshItem = freshItemData.d || freshItemData;
                if (freshItem && freshItem.__metadata && freshItem.__metadata.etag) {
                    freshEtag = freshItem.__metadata.etag;
                    console.log("Fetched fresh ETag:", freshEtag);
                }
            } catch (refetchErr) {
                console.warn("Could not refetch item for fresh ETag, trying with PATCH result:", refetchErr);
            }

            // Verification & PutawayOneItem Call
            // Use the result.etag to ensure we have the latest version for the next call
            // NOTE: We don't catch here anymore, let it fall to the main catch block so error is shown
            await api.putawayInboundDeliveryItem(
                apiConfig,
                selectedIBD.DeliveryDocument,
                item.DeliveryDocumentItem,
                freshEtag
            );

            setSuccessMsg(`Putaway Confirmed for Item ${item.DeliveryDocumentItem}`);
            setExpandedItem(null);

        } catch (err) {
            console.error("Update/Putaway Item Error:", err);
            setError("Failed to Putaway: " + err.message);
        } finally {
            setUpdateLoading(false);
        }
    };

    const getPutawayState = (item) => {
        // Fallback: Quantity Logic
        const target = parseFloat(item.DeliveryQuantity || item.OriginalDeliveryQuantity || 0);
        const done = getProcessedQty(item);

        // LOGIC FIX: Only show Fully Putaway if Quantity matches Target (ignoring SAP Status 'C' if partial)
        const isQtyComplete = done >= target && target > 0;

        if (isQtyComplete) return { status: 'Fully Putaway', color: 'bg-blue-100 text-blue-700', isComplete: true };

        // Priority: Use explicit Status from API, but only if not visually misleading
        const apiStatus = item.PickingStatus || item.PutawayStatus;
        if (apiStatus === 'C' && isQtyComplete) return { status: 'Fully Putaway', color: 'bg-blue-100 text-blue-700', isComplete: true };

        if (done > 0 || apiStatus === 'B') return { status: 'Partial', color: 'bg-orange-100 text-orange-700', isComplete: false }; // Included status 'B' for partial check

        return { status: 'Not Putaway', color: 'bg-slate-100 text-slate-500', isComplete: false };
    };

    const handlePostGR = async (ibd) => {
        const confirmMsg = `Post Goods Receipt for Inbound Delivery ${ibd.DeliveryDocument}? This will complete Putaway for ALL items.`;
        if (!window.confirm(confirmMsg)) return;

        setConfirmLoading(true);
        setError(null);

        try {
            // STEP 1: VALIDATION
            // Check if all items (that have > 0 qty) have a Storage Location
            // We need to check 'ibdItems' state. If user hasn't viewed items yet, we might need to fetch them?
            // Assuming 'ibdItems' is populated if we are in 'items' view. If list view, we need to fetch.
            let itemsToProcess = ibdItems;
            if (ibdItems.length === 0 || selectedIBD?.DeliveryDocument !== ibd.DeliveryDocument) {
                const itemsData = await api.fetchInboundDeliveryItems(apiConfig, ibd.DeliveryDocument);
                itemsToProcess = itemsData.d ? itemsData.d.results : (itemsData.value || []);
            }

            const missingSL = itemsToProcess.filter(i =>
                !i.StorageLocation && parseFloat(i.DeliveryQuantity) > 0
            );

            if (missingSL.length > 0) {
                const names = missingSL.map(i => i.Material).join(', ');
                throw new Error(`Missing Storage Location for items: ${names}. Please update them first.`);
            }

            // STEP 2: BULK PUTAWAY UPDATE
            // User requirement: "Update putaway with full quantity before posting the GR"
            for (const item of itemsToProcess) {
                const targetQty = parseFloat(item.DeliveryQuantity || item.OriginalDeliveryQuantity || 0);
                const currentQty = getProcessedQty(item); // this uses DocFlow now

                // Optimization: If already fully putaway (visually), skip?
                // But SAP status might be 'C' at partial qty. We want to force FULL qty.
                // So checking currentQty < targetQty is better.
                if (currentQty < targetQty) {

                    // A. PATCH to FULL Quantity
                    const payload = {
                        ActualDeliveryQuantity: targetQty.toString(), // Set to FULL
                        StorageLocation: item.StorageLocation,
                        DeliveryQuantityUnit: item.DeliveryQuantityUnit
                    };
                    const etag = item.__metadata ? item.__metadata.etag : null;

                    // Update Item
                    const updateRes = await api.updateInboundDeliveryItem(
                        apiConfig, ibd.DeliveryDocument, item.DeliveryDocumentItem, payload, etag
                    );

                    // Get fresh ETag for putaway action
                    let freshEtag = updateRes.etag || (updateRes.__metadata ? updateRes.__metadata.etag : etag);

                    try {
                        const freshItemData = await api.fetchInboundDeliveryItem(
                            apiConfig, ibd.DeliveryDocument, item.DeliveryDocumentItem
                        );
                        const freshItem = freshItemData.d || freshItemData;
                        if (freshItem?.__metadata?.etag) freshEtag = freshItem.__metadata.etag;
                    } catch (e) { console.warn("Refetch failed", e); }


                    // B. Confirm Putaway
                    await api.putawayInboundDeliveryItem(
                        apiConfig, ibd.DeliveryDocument, item.DeliveryDocumentItem, freshEtag
                    );
                }
            }



            // STEP 3: POST GOODS RECEIPT
            let headerEtag = ibd.__metadata ? ibd.__metadata.etag : null;

            let postSuccess = false;
            let attempt = 0;
            const maxAttempts = 2; // Only try once to fix date

            while (!postSuccess && attempt < maxAttempts) {
                attempt++;
                try {
                    // Get fresh ETag (essential for retry too)
                    try {
                        const freshHeader = await api.fetchInboundDelivery(apiConfig, ibd.DeliveryDocument);
                        if (freshHeader && freshHeader.__metadata) {
                            headerEtag = freshHeader.__metadata.etag;
                        }
                    } catch (e) { console.warn("Header fetch failed", e); }

                    await api.postGoodsReceiptForIBD(apiConfig, ibd.DeliveryDocument, headerEtag);
                    postSuccess = true;

                } catch (err) {
                    console.error(`Post GR Attempt ${attempt} failed:`, err);

                    // Check for Period Error (M7/053)
                    const errText = err.message || JSON.stringify(err);
                    const periodMatch = errText.match(/periods\s+(\d{4}\/\d{2})\s+and/);

                    if (periodMatch && periodMatch[1] && attempt < maxAttempts) {
                        const validPeriod = periodMatch[1]; // e.g., "2025/10"
                        const [year, month] = validPeriod.split('/');
                        // Fix Date: 15th of the month, formatted for OData URL param: datetime'YYYY-MM-DDTHH:mm:ss'
                        const fixDateStr = `${year}-${month}-15T12:00:00`;

                        setSuccessMsg(`Fixing Posting Date to ${validPeriod}...`);

                        // Retry with explicit date param passed to Function Import
                        await api.postGoodsReceiptForIBD(apiConfig, ibd.DeliveryDocument, headerEtag, fixDateStr);
                        postSuccess = true;
                        continue;
                    }
                    throw err; // Re-throw other errors
                }
            }

            setSuccessMsg(`Goods Receipt Posted for Delivery ${ibd.DeliveryDocument}!`);
            loadIBDs();
            setTimeout(() => {
                setSuccessMsg('');
                setView('list');
                setExpandedIBD(null);
            }, 3000);
        } catch (err) {
            setSuccessMsg(''); // Clear any stale success/progress messages
            console.error("Post GR Error:", err);
            let innerMsg = err.message;

            // Friendly M7/053 handling
            const errStr = JSON.stringify(err) + (err.message || "");
            const periodMatch = errStr.match(/periods\s+(\d{4}\/\d{2})\s+and/);
            if (periodMatch && periodMatch[1]) {
                innerMsg = `Posting Failed: Fiscal period is closed. Please ask IT to open period ${periodMatch[1]}.`;
            } else if (errStr.includes("M7") && errStr.includes("053")) {
                innerMsg = "Posting Failed: Fiscal period is closed (M7/053). Please check posting dates.";
            } else if (err.response) {
                try {
                    const txt = await err.response.text();
                    // Attempt to extract value from OData Error JSON
                    const match = txt.match(/"message"\s*:\s*{\s*"lang"\s*:\s*"[^"]*"\s*,\s*"value"\s*:\s*"([^"]*)"/);
                    if (match && match[1]) innerMsg = match[1];
                } catch (e) { }
            }
            setError(innerMsg);
        } finally {
            setConfirmLoading(false);
        }
    };

    // Filter IBDs
    const filteredIBDs = ibds.filter(ibd => {
        const matchesSearch = ibd.DeliveryDocument.includes(searchTerm) ||
            (ibd.Supplier && ibd.Supplier.toLowerCase().includes(searchTerm.toLowerCase()));
        return matchesSearch && ibd.OverallGoodsMovementStatus !== 'C';
    });

    return (
        <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
            {/* Header */}
            <header className="app-header-straight pb-8 px-6 shadow-lg flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)' }}>
                <div className="flex items-center justify-between mb-6">
                    <button onClick={() => navigate('/menu')} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition">
                        <Home size={20} />
                    </button>
                    <div className="flex items-center gap-2">
                    </div>
                </div>

                <div className="flex flex-col items-center justify-center -mt-2 mb-2 relative">
                    <h1 className="text-3xl font-bold text-white mb-1">
                        {view === 'list' ? 'Inbound Delivery' : `IBD ${selectedIBD?.DeliveryDocument}`}
                    </h1>
                    <p className="200 text-sm font-medium uppercase tracking-wider">
                        {view === 'list' ? 'Goods Receipt' : 'Items'}
                    </p>
                </div>

                {view === 'list' && (
                    <div className="relative mt-4">
                        <input
                            type="text"
                            placeholder="Search Delivery / Supplier..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-white h-12 rounded-lg px-4 text-slate-700 placeholder-slate-400 shadow-lg border-0 focus:ring-2 focus:ring-blue-400 text-center font-medium"
                        />
                    </div>
                )}
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto px-4 pt-6 pb-32 -mt-2 z-10" style={{ WebkitOverflowScrolling: 'touch' }}>
                <div className="max-w-5xl mx-auto">
                    {error && (
                        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg flex gap-3 items-start shadow-sm">
                            <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={20} />
                            <div>
                                <h4 className="text-sm font-bold text-red-700">Error</h4>
                                <p className="text-xs text-red-600 mt-1">{error}</p>
                            </div>
                        </div>
                    )}

                    {successMsg && (
                        <div className="mb-6 p-4 bg-blue-50 border-l-4 border-blue-500 rounded-r-lg flex gap-3 items-start shadow-sm">
                            <CheckCircle className="text-blue-500 shrink-0 mt-0.5" size={20} />
                            <div>
                                <h4 className="text-sm font-bold text-blue-700">Success</h4>
                                <p className="text-xs text-blue-600 mt-1">{successMsg}</p>
                            </div>
                        </div>
                    )}

                    {view === 'list' && (
                        <div className="grid grid-cols-1 gap-4">
                            {loading ? (
                                <div className="text-center py-12">
                                    <Loader className="animate-spin text-blue-600 mb-4" size={32} />
                                    <p className="text-slate-400">Loading Inbound Deliveries...</p>
                                </div>
                            ) : filteredIBDs.length === 0 ? (
                                <div className="text-center py-16 text-slate-500 border-2 border-dashed border-slate-200 rounded-xl">
                                    <Package className="mx-auto mb-4 opacity-30 text-slate-400" size={48} />
                                    <p>No Inbound Deliveries found.</p>
                                </div>
                            ) : (
                                filteredIBDs.map(ibd => (
                                    <div
                                        key={ibd.DeliveryDocument}
                                        className="relative bg-white rounded-xl mb-4 shadow-sm border border-slate-200 overflow-hidden cursor-pointer hover:shadow-md transition-all flex items-stretch min-h-[100px]"
                                        onClick={() => setExpandedIBD(expandedIBD === ibd.DeliveryDocument ? null : ibd.DeliveryDocument)}
                                    >
                                        <div className="w-2 bg-blue-500 flex-shrink-0"></div>
                                        <div className="flex-1 px-4 py-3 flex flex-col justify-center gap-1.5 min-w-0">
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-lg font-bold 900 leading-tight">#{ibd.DeliveryDocument}</h3>
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-mono border border-slate-200">
                                                    {ibd.CreatedByUser || 'System'}
                                                </span>
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2 text-sm text-slate-600 truncate">
                                                    <span className="font-bold uppercase text-[11px] text-slate-400 tracking-wider">Supplier</span>
                                                    <span className="font-bold truncate 800" title={ibd.Supplier}>
                                                        {ibd.Supplier || 'N/A'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                                                    <Truck size={13} className="text-slate-400" />
                                                    <span>{ibd.ActualGoodsMovementDate ? new Date(parseInt(ibd.ActualGoodsMovementDate.replace(/\/Date\((-?\d+)\)\//, '$1'))).toLocaleDateString() : 'Pending'}</span>
                                                </div>
                                            </div>

                                            {expandedIBD === ibd.DeliveryDocument && (
                                                <div className="mt-4 pt-4 border-t border-slate-100 animate-in">
                                                    <div className="flex gap-3">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleViewItems(ibd); }}
                                                            className="flex-1 py-2 rounded-lg bg-slate-100 text-slate-600 font-bold text-xs hover:bg-slate-200 transition-colors"
                                                        >
                                                            View Items
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handlePostGR(ibd); }}
                                                            className="flex-1 py-2 rounded-lg bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 transition-colors shadow-sm"
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

                    {view === 'items' && selectedIBD && (
                        <div className="space-y-4 animate-in">
                            <div className="flex justify-between items-center mb-0">
                                <button onClick={() => { setView('list'); setError(null); setSuccessMsg(''); }} style={{ backgroundColor: '#2563eb' }} className="px-4 py-2 hover:opacity-90 text-white font-bold text-xs uppercase rounded-lg shadow-md transition-all active:scale-95 flex items-center gap-2">
                                    <ArrowLeft size={16} /> Back
                                </button>
                                <button
                                    onClick={() => handlePostGR(selectedIBD)}
                                    style={{ backgroundColor: '#2563eb' }}
                                    className="px-6 py-2 hover:opacity-90 text-white font-bold text-xs uppercase rounded-lg shadow-md disabled:opacity-50 transition-all active:scale-95"
                                    disabled={confirmLoading}
                                >
                                    {confirmLoading ? <Loader className="animate-spin" size={14} /> : 'Post GR'}
                                </button>
                            </div>

                            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-800">{selectedIBD.DeliveryDocument}</h2>
                                        <p className="text-xs text-slate-500 font-medium mt-1">Supplier: <span className="600 font-bold">{selectedIBD.Supplier}</span></p>
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
                                        <div key={item.DeliveryDocumentItem} className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden ${expandedItem === item.DeliveryDocumentItem ? 'ring-2 ring-blue-100' : ''}`}>
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
                                                <div className="bg-slate-50 border-t border-slate-200 p-4 animate-in">

                                                    {isComplete ? (
                                                        <div className="text-center py-4">
                                                            <PackageCheck className="mx-auto 500 mb-2" size={32} />
                                                            <p className="800 font-bold">Item Fully Putaway</p>
                                                            <p className="text-xs 600">Quantity: {item.PutawayQuantity} {item.DeliveryQuantityUnit}</p>
                                                        </div>
                                                    ) : (
                                                        <div className="grid grid-cols-1 gap-4 mb-4">
                                                            <div>
                                                                <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Putaway Quantity (Remaining)</label>
                                                                <div className="flex items-center h-10 w-full max-w-[200px] rounded-lg overflow-hidden border border-blue-200 shadow-sm">
                                                                    <button
                                                                        type="button"
                                                                        style={{ backgroundColor: '#bfdbfe', borderRadius: 0 }}
                                                                        className="w-12 h-full flex items-center justify-center hover:bg-[#93c5fd] text-blue-950 transition-colors border-r border-blue-100"
                                                                        onClick={() => {
                                                                            const curr = parseFloat(putawayQty || 0);
                                                                            setPutawayQty((curr - 1 >= 0 ? curr - 1 : 0).toString());
                                                                        }}
                                                                    >
                                                                        <span className="text-xl font-bold mb-0.5">−</span>
                                                                    </button>
                                                                    <input
                                                                        style={{ borderRadius: 0 }}
                                                                        className="flex-1 w-full h-full bg-white text-center font-bold text-blue-950 text-lg border-none p-0 focus:ring-0 outline-none"
                                                                        value={putawayQty}
                                                                        onChange={(e) => setPutawayQty(e.target.value)}
                                                                        type="number"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        style={{ backgroundColor: '#bfdbfe', borderRadius: 0 }}
                                                                        className="w-12 h-full flex items-center justify-center hover:bg-[#93c5fd] text-blue-950 transition-colors border-l border-blue-100"
                                                                        onClick={() => {
                                                                            const curr = parseFloat(putawayQty || 0);
                                                                            setPutawayQty((curr + 1).toString());
                                                                        }}
                                                                    >
                                                                        <span className="text-xl font-bold mb-0.5">+</span>
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            <div>
                                                                <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Storage Location</label>
                                                                <div className="relative">
                                                                    <div className="flex items-center relative">
                                                                        <input
                                                                            className="w-full h-10 bg-slate-100 border-transparent rounded-lg px-3 text-sm font-bold text-blue-950 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none cursor-pointer transition-all"
                                                                            value={storageLoc}
                                                                            onChange={(e) => setStorageLoc(e.target.value.toUpperCase())}
                                                                            onFocus={() => setShowSLHelp(true)}
                                                                            placeholder="Select SLoc"
                                                                        />
                                                                        <div className="absolute right-3 text-slate-400 pointer-events-none">
                                                                            <List size={16} />
                                                                        </div>
                                                                    </div>

                                                                    {availableSLs.length > 0 && showSLHelp && (
                                                                        <div className="absolute bottom-full left-0 w-full mb-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-40 overflow-y-auto">
                                                                            {availableSLs.map(sl => (
                                                                                <div
                                                                                    key={sl.StorageLocation}
                                                                                    onClick={() => { setStorageLoc(sl.StorageLocation); setShowSLHelp(false); }}
                                                                                    className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0 flex justify-between items-center"
                                                                                >
                                                                                    <div>
                                                                                        <span className="font-bold text-slate-800 block">{sl.StorageLocation}</span>
                                                                                        <span className="text-xs text-slate-500">{sl.StorageLocationName}</span>
                                                                                    </div>
                                                                                    {storageLoc === sl.StorageLocation && <CheckCircle size={16} className="text-blue-500" />}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {!isComplete && (
                                                        <button
                                                            onClick={() => handleUpdateItem(item)}
                                                            className="w-full btn-primary bg-blue-600 hover:bg-blue-700 h-10 shadow-sm"
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
        </div>
    );
};

export default InboundDelivery;
