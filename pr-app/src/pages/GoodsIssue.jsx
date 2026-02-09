import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
    Search, Package, ArrowLeft, Home, Truck,
    AlertCircle, Loader, PackageCheck, CheckCircle, List
} from 'lucide-react';

const GoodsIssue = () => {
    const navigate = useNavigate();
    const { apiConfig } = useAuth();

    // UI State
    const [view, setView] = useState('list'); // 'list' | 'items'
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    // Data State
    const [ods, setOds] = useState([]); // Outbound Deliveries
    const [selectedOD, setSelectedOD] = useState(null);
    const [odItems, setOdItems] = useState([]);
    const [expandedOD, setExpandedOD] = useState(null);
    const [expandedItem, setExpandedItem] = useState(null);
    const [pickQty, setPickQty] = useState('');
    const [storageLoc, setStorageLoc] = useState('');
    const [availableSLs, setAvailableSLs] = useState([]);
    const [showSLHelp, setShowSLHelp] = useState(false);
    const [slLoading, setSlLoading] = useState(false);
    const [updateLoading, setUpdateLoading] = useState(false);

    // Posting State
    const [confirmLoading, setConfirmLoading] = useState(false);

    useEffect(() => {
        loadODs();
    }, []);

    const loadODs = async () => {
        setLoading(true);
        try {
            const data = await api.fetchOutboundDeliveries(apiConfig);
            const results = data.d ? data.d.results : (data.value || []);
            setOds(results);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleViewItems = async (od) => {
        setSelectedOD(od);
        setLoading(true);
        setView('items');
        try {
            // Always fetch fresh items to ensure ETag is up to date and status is correct
            // (Removed check for existing to avoid stale data 412 errors)
            const data = await api.fetchOutboundDeliveryItems(apiConfig, od.DeliveryDocument);
            const items = data.d ? data.d.results : (data.value || []);
            setOdItems(items);
        } catch (err) {
            setError("Failed to load items: " + err.message);
        } finally {
            setLoading(false);
        }
    };


    const handleExpandItem = (item) => {
        if (expandedItem === item.DeliveryDocumentItem) {
            setExpandedItem(null);
        } else {
            setExpandedItem(item.DeliveryDocumentItem);
            // Default Pick Qty to Delivery Qty if not picked, or existing Picked Qty
            setPickQty(item.PickedQuantity || item.ActualDeliveryQuantity);
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
        if (!pickQty || !storageLoc) {
            alert("Please enter Pick Quantity and Storage Location.");
            return;
        }

        setUpdateLoading(true);
        setError(null);
        try {
            const etag = item.__metadata ? item.__metadata.etag : null;

            // Validation: Ensure picking qty is logical (optional, but good practice)
            // if (parseFloat(pickQty) > parseFloat(item.OriginalDeliveryQuantity)) ... (not available easily without more data)

            // Update ActualDeliveryQuantity (acts as Picked Qty for GI) & StorageLocation
            const payload = {
                ActualDeliveryQuantity: pickQty,
                StorageLocation: storageLoc,
                DeliveryQuantityUnit: item.DeliveryQuantityUnit // Ensure UoM is sent
            };

            await api.updateOutboundDeliveryItem(
                apiConfig,
                selectedOD.DeliveryDocument,
                item.DeliveryDocumentItem,
                payload,
                etag
            );

            // Optimistic Update
            setOdItems(prevItems => prevItems.map(i => {
                if (i.DeliveryDocumentItem === item.DeliveryDocumentItem) {
                    return { ...i, PickedQuantity: pickQty, ActualDeliveryQuantity: pickQty, StorageLocation: storageLoc };
                }
                return i;
            }));

            // Refresh items to verify backend state
            setTimeout(async () => {
                try {
                    // verification fetch
                    const data = await api.fetchOutboundDeliveryItems(apiConfig, selectedOD.DeliveryDocument);
                    const items = data.d ? data.d.results : (data.value || []);
                    const updatedItem = items.find(i => i.DeliveryDocumentItem === item.DeliveryDocumentItem);

                    setOdItems(items); // update full list

                    if (updatedItem) {
                        const savedQty = parseFloat(updatedItem.ActualDeliveryQuantity || 0);
                        const targetQty = parseFloat(pickQty);

                        if (savedQty < targetQty) {
                            setError(`Warning: Pick Quantity not saved! Backend reports ${savedQty}, Expected ${targetQty}. Try again.`);
                            setSuccessMsg('');
                        } else {
                            setSuccessMsg(`Successfully Picked ${savedQty} ${updatedItem.DeliveryQuantityUnit} for Item ${item.DeliveryDocumentItem}`);
                            setExpandedItem(null);
                        }
                    }
                } catch (ex) {
                    console.warn("Verification fetch failed", ex);
                    // Fallback to optimistic success msg
                    setSuccessMsg(`Picked ${pickQty} (Verification skipped)`);
                    setExpandedItem(null);
                }
            }, 800);

        } catch (err) {
            console.error("Update Item Error:", err);
            let innerMsg = "Failed to Pick/Update: " + err.message;
            // Parse SAP Error if available
            if (err.response || err.message.includes('{')) {
                try {
                    const txt = err.response ? await err.response.text() : err.message.substring(err.message.indexOf('{'));
                    const match = txt.match(/"message"\s*:\s*{\s*"lang"\s*:\s*"[^"]*"\s*,\s*"value"\s*:\s*"([^"]*)"/);
                    if (match && match[1]) {
                        innerMsg = match[1];
                    } else {
                        const jsonErr = JSON.parse(txt);
                        if (jsonErr.error && jsonErr.error.message && jsonErr.error.message.value) {
                            innerMsg = jsonErr.error.message.value;
                        }
                    }
                } catch (e) { }
            }
            setError(innerMsg);
            // Don't auto-clear validation errors
        } finally {
            setUpdateLoading(false);
            // Removed auto-clear of success message so user can see it
        }
    };

    const handlePostGI = async (od) => {
        // Pre-validation: Check if items have Storage Location
        // Note: We check 'odItems' which matches the currently viewed OD if available. 
        // If the user hasn't viewed items (rare flow if they just click Post from list), we might skip this validation 
        // or force load. But the button is in the Item view or List view. 
        // If List view, 'odItems' might be empty or from another OD. 
        // Safe check: Only validate if selectedOD matches od

        if (selectedOD && selectedOD.DeliveryDocument === od.DeliveryDocument) {
            // If we are in item view, we might have items in odItems
        }

        // 1. Fetch Items for Validation & Auto-Pick
        // We need to fetch items to be sure about their status even if we are in list view
        let itemsToProcess = [];
        try {
            // Use existing if valid, otherwise fetch
            if (odItems.length > 0 && selectedOD?.DeliveryDocument === od.DeliveryDocument) {
                itemsToProcess = odItems;
            } else {
                const data = await api.fetchOutboundDeliveryItems(apiConfig, od.DeliveryDocument);
                itemsToProcess = data.d ? data.d.results : (data.value || []);
            }
        } catch (e) {
            alert("Failed to fetch items for validation: " + e.message);
            return;
        }

        // 2. Auto-Pick / Ensure Picked Logic
        let itemsToUpdate = [];
        if (itemsToProcess.length > 0) {
            // Check for missing Storage Location first (Blocker)
            const missingSLoc = itemsToProcess.find(i => !i.StorageLocation);
            if (missingSLoc) {
                setError(`Cannot Post: Item ${missingSLoc.DeliveryDocumentItem} is missing Storage Location. Please select one.`);
                setConfirmLoading(false);
                return;
            }

            // Identify items that need picking (Status not C, or Quantity mismatch)
            // WE also re-pick items that appear correct but have Status 'A' just to force the backend update as requested
            itemsToUpdate = itemsToProcess.filter(i => {
                const actual = parseFloat(i.ActualDeliveryQuantity || 0);
                const target = parseFloat(i.DeliveryQuantity || i.OriginalDeliveryQuantity || 0);

                // If quantity is missing or less than target
                if (target > 0 && actual < target) return true;

                // If status is not Completed (even if quantity matches, we might need to "touch" it)
                if (i.PickingStatus && i.PickingStatus !== 'C') return true;

                return false;
            });
        }

        // 3. User Confirmation & Auto-Pick Execution
        const confirmMsg = itemsToUpdate.length > 0
            ? `Auto-Pick ${itemsToUpdate.length} items and Post Goods Issue for Delivery ${od.DeliveryDocument}?`
            : `Post Goods Issue for Delivery ${od.DeliveryDocument}? This cannot be undone.`;

        if (!window.confirm(confirmMsg)) {
            setConfirmLoading(false);
            return;
        }

        setConfirmLoading(true);
        setError(null);

        try {
            // Execute Auto-Pick Updates Sequentially (to avoid locking issues)
            if (itemsToUpdate.length > 0) {
                console.log("Starting Auto-Pick for items:", itemsToUpdate.length);

                for (const item of itemsToUpdate) {
                    // Use item etag if available
                    const etag = item.__metadata ? item.__metadata.etag : null;

                    // 2. Perform Picking (Function Import)
                    // We only call PickOneItem. We assume StorageLocation is already set 
                    // (checked by validation above) or matches backend.
                    // If it drifts, the pick might fail, but that's better than ETag mismatch loops.
                    await api.pickOutboundDeliveryItem(
                        apiConfig,
                        od.DeliveryDocument,
                        item.DeliveryDocumentItem,
                        etag
                    );
                }

                // Verification Step: Re-fetch items to ensure backend has processed the updates
                // We cannot trust the local state; we must ask the server "Are we good?"
                const verifyData = await api.fetchOutboundDeliveryItems(apiConfig, od.DeliveryDocument);
                const verifiedItems = verifyData.d ? verifyData.d.results : (verifyData.value || []);

                // Strict check: All items must be 'C' (Fully Picked)
                const stillNotPicked = verifiedItems.some(i => i.PickingStatus !== 'C'); // Simplified check

                if (stillNotPicked) {
                    setError("Auto-Pick attempted, but some items are still not 'Fully Picked'. Please try 'Post GI' again.");
                    setConfirmLoading(false);
                    return;
                }
            }
        } catch (pickErr) {
            console.error("Auto-Pick Failed:", pickErr);
            setError("Auto-Pick Failed: " + pickErr.message);
            setConfirmLoading(false);
            return;
        }

        try {
            // Fetch Fresh Header ETag to avoid 412 if items were just updated
            let etag = od.__metadata ? od.__metadata.etag : null;
            try {
                const freshODData = await api.fetchOutboundDelivery(apiConfig, od.DeliveryDocument);
                const freshOD = freshODData.d || freshODData;
                if (freshOD && freshOD.__metadata && freshOD.__metadata.etag) {
                    etag = freshOD.__metadata.etag;
                    console.log("Refreshed Header ETag:", etag);
                }
            } catch (ignore) {
                console.warn("Failed to refresh header ETag, attempting with existing...", ignore);
            }

            await api.postGoodsIssueWithOD(apiConfig, od.DeliveryDocument, etag);
            setSuccessMsg(`Goods Issue Posted for Delivery ${od.DeliveryDocument}!`);
            loadODs(); // Refresh list
            setTimeout(() => {
                setSuccessMsg('');
                setView('list');
                setExpandedOD(null);
            }, 3000);
        } catch (err) {
            console.error("Post GI Error:", err);
            let innerMsg = err.message;
            if (err.response) {
                try {
                    const txt = await err.response.text();
                    // Try to extract useful message from SAP format
                    const match = txt.match(/"message"\s*:\s*{\s*"lang"\s*:\s*"[^"]*"\s*,\s*"value"\s*:\s*"([^"]*)"/);
                    if (match && match[1]) {
                        innerMsg = match[1];
                    } else {
                        // fallback to finding message object
                        const jsonErr = JSON.parse(txt);
                        if (jsonErr.error && jsonErr.error.message && jsonErr.error.message.value) {
                            innerMsg = jsonErr.error.message.value;
                        }
                    }
                } catch (e) { }
            }
            setError(innerMsg);
        } finally {
            setConfirmLoading(false);
        }
    };

    // Filter ODs
    const filteredODs = ods.filter(od => {
        const matchesSearch = od.DeliveryDocument.includes(searchTerm) ||
            (od.ShipToParty && od.ShipToParty.toLowerCase().includes(searchTerm.toLowerCase()));

        // Filter out completed ('C') or scanned
        const isOpen = od.OverallGoodsMovementStatus !== 'C';

        return matchesSearch && isOpen;
    });

    return (
        <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">

            {/* Fixed Header */}
            <header className="app-header-straight pb-8 px-6 shadow-lg flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)' }}>
                <div className="flex items-center justify-between mb-6">
                    <button onClick={() => navigate('/menu')} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition">
                        <Home size={20} />
                    </button>
                    <div className="flex items-center gap-2">
                        {/* Logo Removed */}
                    </div>
                </div>

                <div className="flex flex-col items-center justify-center -mt-2 mb-2 relative">
                    <h1 className="text-3xl font-bold text-white mb-1">
                        {view === 'list' ? 'Goods Issue' : `OD ${selectedOD?.DeliveryDocument}`}
                    </h1>
                    <p className="text-blue-200 text-sm font-medium uppercase tracking-wider">
                        {view === 'list' ? 'Outbound Deliveries' : 'Items'}
                    </p>
                </div>

                {/* Sub-Header / Search */}
                {view === 'list' && (
                    <div className="relative mt-4">
                        <input
                            type="text"
                            placeholder="Search Delivery Doc..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-white h-12 rounded-lg px-4 text-slate-700 placeholder-slate-400 shadow-lg border-0 focus:ring-2 focus:ring-indigo-400 text-center font-medium"
                        />
                    </div>
                )}
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto px-4 pt-6 pb-32 -mt-2 z-10" style={{ WebkitOverflowScrolling: 'touch' }}>
                <div className="max-w-5xl mx-auto">

                    {error && (
                        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg flex gap-3 items-start animate-in fade-in slide-in-from-top-2 shadow-sm">
                            <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={20} />
                            <div>
                                <h4 className="text-sm font-bold text-red-700">Error</h4>
                                <p className="text-xs text-red-600 mt-1">{error}</p>
                            </div>
                        </div>
                    )}

                    {successMsg && (
                        <div className="mb-6 p-4 bg-emerald-50 border-l-4 border-emerald-500 rounded-r-lg flex gap-3 items-start animate-in fade-in slide-in-from-top-2 shadow-sm">
                            <CheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={20} />
                            <div>
                                <h4 className="text-sm font-bold text-emerald-700">Success</h4>
                                <p className="text-xs text-emerald-600 mt-1">{successMsg}</p>
                            </div>
                        </div>
                    )}

                    {view === 'list' && (
                        <div className="grid grid-cols-1 gap-4">
                            {loading ? (
                                <div className="text-center py-12">
                                    <Loader className="animate-spin mx-auto text-blue-600 mb-4" size={32} />
                                    <p className="text-slate-400">Loading Outbound Deliveries...</p>
                                </div>
                            ) : filteredODs.length === 0 ? (
                                <div className="text-center py-16 text-slate-500 border-2 border-dashed border-slate-200 rounded-xl">
                                    <Package className="mx-auto mb-4 opacity-30 text-slate-400" size={48} />
                                    <p>No Deliveries found.</p>
                                </div>
                            ) : (
                                filteredODs.map(od => (
                                    <div
                                        key={od.DeliveryDocument}
                                        className="relative bg-white rounded-xl mb-4 shadow-sm border border-slate-200 overflow-hidden cursor-pointer hover:shadow-md transition-all flex items-stretch min-h-[100px]"
                                    >
                                        {/* Left Colored Strip - Indigo for OD */}
                                        <div className="w-2 bg-indigo-500 flex-shrink-0"></div>

                                        <div className="flex-1 px-4 py-3 flex flex-col justify-center gap-1.5 min-w-0" onClick={() => setExpandedOD(expandedOD === od.DeliveryDocument ? null : od.DeliveryDocument)}>
                                            {/* Header Row */}
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-lg font-bold text-blue-950 leading-tight">#{od.DeliveryDocument}</h3>
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-mono border border-slate-200">{od.ShippingPoint}</span>
                                            </div>

                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2 text-sm text-slate-600 truncate">
                                                    <span className="font-bold uppercase text-[11px] text-slate-400 tracking-wider">Ship To</span>
                                                    <span className="font-bold truncate text-indigo-900" title={od.ShipToParty}>
                                                        {od.ShipToParty || 'No Party'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                                                    <Truck size={13} className="text-slate-400" />
                                                    <span>{od.PlannedGoodsIssueDate ? new Date(parseInt(od.PlannedGoodsIssueDate.replace(/\/Date\((-?\d+)\)\//, '$1'))).toLocaleDateString() : 'N/A'}</span>
                                                </div>
                                            </div>

                                            {/* Expandable Actions */}
                                            {expandedOD === od.DeliveryDocument && (
                                                <div className="mt-4 pt-4 border-t border-slate-100 animate-in">
                                                    <div className="grid grid-cols-2 gap-4 text-xs text-slate-600 mb-4">
                                                        <div><span className="block text-[10px] uppercase text-slate-400">Created By</span> {od.CreatedByUser || 'System'}</div>
                                                        <div><span className="block text-[10px] uppercase text-slate-400">Total Weight</span> {parseFloat(od.HeaderGrossWeight || 0).toFixed(2)} {od.HeaderWeightUnit}</div>
                                                    </div>

                                                    <div className="flex gap-3">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleViewItems(od); }}
                                                            className="flex-1 py-2 rounded-lg bg-slate-100 text-slate-600 font-bold text-xs hover:bg-slate-200 transition-colors"
                                                        >
                                                            View Items
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handlePostGI(od); }}
                                                            className="flex-1 py-2 rounded-lg bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition-colors shadow-sm"
                                                            disabled={confirmLoading}
                                                        >
                                                            {confirmLoading ? <Loader className="animate-spin mx-auto" size={14} /> : 'Post GI'}
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

                    {view === 'items' && selectedOD && (
                        <div className="space-y-4 animate-in">
                            <div className="flex justify-between items-center mb-0">
                                <button onClick={() => { setView('list'); setError(null); setSuccessMsg(''); }} style={{ backgroundColor: '#0ea5e9' }} className="px-4 py-2 hover:opacity-90 text-white font-bold text-xs uppercase rounded-lg shadow-md transition-all active:scale-95 flex items-center gap-2">
                                    <ArrowLeft size={16} /> Back
                                </button>
                                <button
                                    onClick={() => handlePostGI(selectedOD)}
                                    style={{ backgroundColor: '#0ea5e9' }}
                                    className="px-6 py-2 hover:opacity-90 text-white font-bold text-xs uppercase rounded-lg shadow-md disabled:opacity-50 transition-all active:scale-95"
                                    disabled={confirmLoading}
                                >
                                    {confirmLoading ? <Loader className="animate-spin" size={14} /> : 'Post GI'}
                                </button>
                            </div>

                            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-800">{selectedOD.DeliveryDocument}</h2>
                                        <p className="text-xs text-slate-500 font-medium mt-1">Ship To: <span className="text-indigo-600 font-bold">{selectedOD.ShipToParty}</span></p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-slate-400 font-bold uppercase">Incoterms</p>
                                        <p className="text-sm font-bold text-slate-700">{selectedOD.IncotermsClassification}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Items List */}
                            {loading ? (
                                <div className="text-center py-12">
                                    <Loader className="animate-spin mx-auto text-blue-600 mb-4" size={32} />
                                    <p className="text-slate-400">Loading Items...</p>
                                </div>
                            ) : odItems.map(item => (
                                <div key={item.DeliveryDocumentItem} className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden ${expandedItem === item.DeliveryDocumentItem ? 'ring-2 ring-indigo-100' : ''}`}>
                                    <div className="p-4 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => handleExpandItem(item)}>
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-start gap-3">
                                                <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center font-mono text-xs font-bold text-slate-500 mt-1">
                                                    {item.DeliveryDocumentItem}
                                                </div>
                                                <div>
                                                    <h4 className="m-0 text-base font-bold text-slate-800 leading-tight">{item.Material}</h4>
                                                    <p className="m-0 text-xs text-slate-500 mt-1">{item.DeliveryDocumentItemText || 'Item Text'}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="flex items-baseline justify-end gap-1">
                                                    <span className="text-slate-400 text-[10px] font-bold uppercase mr-1">Qty</span>
                                                    <span className="font-bold text-slate-800 text-lg">{parseFloat(item.ActualDeliveryQuantity || 0).toFixed(2)}</span>
                                                    <span className="text-slate-500 text-xs font-bold">{item.DeliveryQuantityUnit}</span>
                                                </div>
                                                <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${item.PickingStatus === 'C' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                                    {item.PickingStatus === 'C' ? 'Picked' : 'Open'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Picking Form */}
                                    {expandedItem === item.DeliveryDocumentItem && (
                                        <div className="bg-slate-50 border-t border-slate-200 p-4 animate-in">
                                            <div className="grid grid-cols-1 gap-4 mb-4">
                                                {/* Quantity Stepper (Refactored to match GR) */}
                                                <div>
                                                    <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Pick Quantity</label>
                                                    <div className="flex items-center h-10 w-full max-w-[200px] rounded-lg overflow-hidden border border-blue-200 shadow-sm">
                                                        <button
                                                            type="button"
                                                            style={{ backgroundColor: '#bae6fd', borderRadius: 0 }}
                                                            className="w-12 h-full flex items-center justify-center hover:bg-[#7dd3fc] text-blue-950 transition-colors border-r border-blue-100"
                                                            onClick={() => {
                                                                const curr = parseFloat(pickQty || 0);
                                                                setPickQty((curr - 1 >= 0 ? curr - 1 : 0).toString());
                                                            }}
                                                        >
                                                            <span className="text-xl font-bold mb-0.5">−</span>
                                                        </button>
                                                        <input
                                                            style={{ borderRadius: 0 }}
                                                            className="flex-1 w-full h-full bg-white text-center font-bold text-blue-950 text-lg border-none p-0 focus:ring-0 outline-none"
                                                            value={pickQty}
                                                            onChange={(e) => setPickQty(e.target.value)}
                                                            type="number"
                                                        />
                                                        <button
                                                            type="button"
                                                            style={{ backgroundColor: '#bae6fd', borderRadius: 0 }}
                                                            className="w-12 h-full flex items-center justify-center hover:bg-[#7dd3fc] text-blue-950 transition-colors border-l border-blue-100"
                                                            onClick={() => {
                                                                const curr = parseFloat(pickQty || 0);
                                                                setPickQty((curr + 1).toString());
                                                            }}
                                                        >
                                                            <span className="text-xl font-bold mb-0.5">+</span>
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Storage Location (Refactored to match GR) */}
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
                                                            {/* List Icon */}
                                                            <div className="absolute right-3 text-slate-400 pointer-events-none">
                                                                <List size={16} />
                                                            </div>
                                                        </div>

                                                        {/* Dropdown Logic */}
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
                                                                        {storageLoc === sl.StorageLocation && <CheckCircle size={16} className="text-emerald-500" />}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => handleUpdateItem(item)}
                                                className="w-full btn-primary bg-indigo-600 hover:bg-indigo-700 h-10 shadow-sm"
                                                disabled={updateLoading}
                                            >
                                                {updateLoading ? <Loader className="animate-spin" size={16} /> : 'Confirm Pick & Location'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default GoodsIssue;
