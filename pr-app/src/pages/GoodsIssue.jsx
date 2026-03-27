/**
 * @file GoodsIssue.jsx
 * @description Screen: Goods Issue for Outbound Delivery (OBD)
 *
 * Post a goods issue against an outbound delivery document.
 * The workflow requires that ALL items are picked first (PickingStatus = 'C' or
 * manually confirmed) before the POST GI button becomes active.
 *
 * Pick logic:
 *  - Each item starts with "Open" badge (amber)
 *  - "Confirm Pick & Location" saves pick qty + storage location, marks item as confirmed (_confirmed: true)
 *  - Badge changes to "Fully Picked" (green) once confirmed or PickingStatus === 'C'
 *  - POST GI button is greyed/disabled until ALL items are confirmed/picked
 *  - From the list screen "Post GI" auto-picks all items then posts GI
 *
 * SAP APIs: API_OUTBOUND_DELIVERY_SRV + API_GOODSMOVEMENT_SRV
 *
 * @route /gi
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, extractSapMessage } from '../services/api';
import {
    Package, ArrowLeft, Home, Filter, Calendar, Truck, Search,
    AlertCircle, Loader, CheckCircle, ChevronDown, X, Scan
} from 'lucide-react';
import BarcodeScanner from '../components/BarcodeScanner';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';


const GoodsIssue = () => {
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
        shippingPoint: '',
        dateFrom: toISO(ninetyDaysAgo),
        dateTo: toISO(today),
    });

    // Data State
    const [ods, setOds] = useState([]);
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

    // Scanner State
    const [showScanner, setShowScanner] = useState(false);
    const [scanField, setScanField] = useState(null);
    const handleScan = (code) => {
        if (scanField === 'deliveryNumber') setFilters(f => ({ ...f, deliveryNumber: code.trim() }));
        else if (scanField === 'shippingPoint') setFilters(f => ({ ...f, shippingPoint: code.trim() }));
        setShowScanner(false);
        setScanField(null);
    };

    const loadODs = async (activeFilters) => {
        const f = activeFilters || filters;
        if (!f.deliveryNumber && !f.shippingPoint && !f.dateFrom) {
            setError('Please enter at least one filter (Delivery Number, Shipping Point, or Date From) before searching.');
            return;
        }
        setLoading(true);
        setError(null);
        setOds([]);
        try {
            const apiFilters = {
                ...(f.deliveryNumber && { deliveryNumber: f.deliveryNumber.trim() }),
                ...(f.shippingPoint && { shippingPoint: f.shippingPoint.trim().toUpperCase() }),
                ...(f.dateFrom && { dateFrom: f.dateFrom }),
                ...(f.dateTo && { dateTo: f.dateTo }),
            };
            const data = await api.fetchOutboundDeliveries(apiConfig, 100, apiFilters);
            const results = data.d ? data.d.results : (data.value || []);
            setOds(results);
            setView('list');
        } catch (err) {
            setError(extractSapMessage(err));
        } finally {
            setLoading(false);
        }
    };

    const handleViewItems = async (od) => {
        setSelectedOD(od);
        setLoading(true);
        setView('items');
        setError(null);
        setSuccessMsg('');
        try {
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
            setPickQty(item.PickedQuantity || item.ActualDeliveryQuantity);
            setStorageLoc(item.StorageLocation || '');

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

    // Check if all items are fully picked (PickingStatus=C or _confirmed)
    const isItemPicked = (item) => item.PickingStatus === 'C' || item._confirmed === true;
    const allItemsPicked = odItems.length > 0 && odItems.every(isItemPicked);

    const handleUpdateItem = async (item) => {
        if (!pickQty || !storageLoc) {
            alert("Please enter Pick Quantity and Storage Location.");
            return;
        }

        setUpdateLoading(true);
        setError(null);
        try {
            const etag = item.__metadata ? item.__metadata.etag : null;

            const payload = {
                ActualDeliveryQuantity: pickQty,
                StorageLocation: storageLoc,
                DeliveryQuantityUnit: item.DeliveryQuantityUnit
            };

            await api.updateOutboundDeliveryItem(
                apiConfig,
                selectedOD.DeliveryDocument,
                item.DeliveryDocumentItem,
                payload,
                etag
            );

            // Optimistic Update + mark as confirmed
            setOdItems(prevItems => prevItems.map(i => {
                if (i.DeliveryDocumentItem === item.DeliveryDocumentItem) {
                    return { ...i, PickedQuantity: pickQty, ActualDeliveryQuantity: pickQty, StorageLocation: storageLoc, _confirmed: true };
                }
                return i;
            }));

            // Verification fetch
            setTimeout(async () => {
                try {
                    const data = await api.fetchOutboundDeliveryItems(apiConfig, selectedOD.DeliveryDocument);
                    const items = data.d ? data.d.results : (data.value || []);
                    const updatedItem = items.find(i => i.DeliveryDocumentItem === item.DeliveryDocumentItem);

                    // Preserve _confirmed flags from previous state
                    setOdItems(prev => {
                        const confirmedMap = {};
                        prev.forEach(pi => { if (pi._confirmed) confirmedMap[pi.DeliveryDocumentItem] = true; });
                        return items.map(i => ({ ...i, _confirmed: i.PickingStatus === 'C' || !!confirmedMap[i.DeliveryDocumentItem] }));
                    });

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
                    setSuccessMsg(`Picked ${pickQty} (Verification skipped)`);
                    setExpandedItem(null);
                }
            }, 800);

        } catch (err) {
            let innerMsg = "Failed to Pick/Update: " + err.message;
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
        } finally {
            setUpdateLoading(false);
        }
    };

    const handlePostGI = async (od) => {
        let itemsToProcess = [];
        try {
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

        let itemsToUpdate = [];
        if (itemsToProcess.length > 0) {
            const missingSLoc = itemsToProcess.find(i => !i.StorageLocation);
            if (missingSLoc) {
                setError(`Cannot Post: Item ${missingSLoc.DeliveryDocumentItem} is missing Storage Location. Please select one.`);
                setConfirmLoading(false);
                return;
            }

            itemsToUpdate = itemsToProcess.filter(i => {
                const actual = parseFloat(i.ActualDeliveryQuantity || 0);
                const target = parseFloat(i.DeliveryQuantity || i.OriginalDeliveryQuantity || 0);
                if (target > 0 && actual < target) return true;
                if (i.PickingStatus && i.PickingStatus !== 'C') return true;
                return false;
            });
        }

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
            if (itemsToUpdate.length > 0) {
                for (const item of itemsToUpdate) {
                    const etag = item.__metadata ? item.__metadata.etag : null;
                    await api.pickOutboundDeliveryItem(
                        apiConfig,
                        od.DeliveryDocument,
                        item.DeliveryDocumentItem,
                        etag
                    );
                }

                const verifyData = await api.fetchOutboundDeliveryItems(apiConfig, od.DeliveryDocument);
                const verifiedItems = verifyData.d ? verifyData.d.results : (verifyData.value || []);
                const stillNotPicked = verifiedItems.some(i => i.PickingStatus !== 'C');

                if (stillNotPicked) {
                    setError("Auto-Pick attempted, but some items are still not 'Fully Picked'. Please try 'Post GI' again.");
                    setConfirmLoading(false);
                    return;
                }
            }
        } catch (pickErr) {
            setError("Auto-Pick Failed: " + pickErr.message);
            setConfirmLoading(false);
            return;
        }

        try {
            let etag = od.__metadata ? od.__metadata.etag : null;
            try {
                const freshODData = await api.fetchOutboundDelivery(apiConfig, od.DeliveryDocument);
                const freshOD = freshODData.d || freshODData;
                if (freshOD && freshOD.__metadata && freshOD.__metadata.etag) {
                    etag = freshOD.__metadata.etag;
                }
            } catch (ignore) {
                console.warn("Failed to refresh header ETag, attempting with existing...", ignore);
            }

            await api.postGoodsIssueWithOD(apiConfig, od.DeliveryDocument, etag);
            setSuccessMsg(`Goods Issue Posted for Delivery ${od.DeliveryDocument}!`);
            loadODs(filters);
            setTimeout(() => {
                setSuccessMsg('');
                setView('list');
                setExpandedOD(null);
            }, 3000);
        } catch (err) {
            let innerMsg = err.message;
            if (err.response) {
                try {
                    const txt = await err.response.text();
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
        } finally {
            setConfirmLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">

            {/* Fixed Header */}
            <header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                <div className="flex justify-between items-center relative">
                    <button onClick={() => view === 'filter' ? navigate(-1) : view === 'items' ? setView('list') : setView('filter')} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition" title="Back">
                        <ArrowLeft size={20} />
                    </button>

                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <h1 className="text-xl font-bold text-white tracking-wide">
                            {view === 'filter' ? 'Goods Issue' : view === 'items' ? `OBD #${selectedOD?.DeliveryDocument}` : `${ods.length}`}
                        </h1>
                        <p className="text-blue-200 text-[10px] font-medium uppercase tracking-wider mt-0.5">
                            {view === 'filter' ? 'Search Filters' : view === 'items' ? 'Delivery Items' : 'Outbound Deliveries'}
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
                        <div className="bg-emerald-50 border-l-4 border-emerald-500 rounded-lg p-3 shadow-md flex gap-3 items-start w-full max-w-5xl mx-auto animate-in slide-in-from-top-2">
                            <CheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={18} />
                            <div className="flex-1 min-w-0">
                                <h4 className="text-xs font-bold text-emerald-700">Success</h4>
                                <p className="text-[11px] text-emerald-600 mt-0.5 whitespace-pre-wrap">{successMsg}</p>
                            </div>
                            <button onClick={() => setSuccessMsg('')} className="p-1 hover:bg-emerald-100 rounded-md transition-colors shrink-0">
                                <X size={14} className="text-emerald-500" />
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
                                        placeholder="e.g. 800000123"
                                        className="flex-1 h-11 bg-slate-50 border border-blue-200 rounded-lg px-3 text-sm font-bold text-blue-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                                    />
                                    <button type="button" onClick={() => { setScanField('deliveryNumber'); setShowScanner(true); }} className="h-11 w-11 flex-none bg-brand-blue text-white rounded-lg flex items-center justify-center hover:opacity-90 transition-colors" title="Scan">
                                        <Scan size={18} />
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Shipping Point</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={filters.shippingPoint}
                                        onChange={e => setFilters(f => ({ ...f, shippingPoint: e.target.value }))}
                                        placeholder="e.g. SH01"
                                        className="flex-1 h-11 bg-slate-50 border border-blue-200 rounded-lg px-3 text-sm font-bold text-blue-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                                    />
                                    <button type="button" onClick={() => { setScanField('shippingPoint'); setShowScanner(true); }} className="h-11 w-11 flex-none bg-brand-blue text-white rounded-lg flex items-center justify-center hover:opacity-90 transition-colors" title="Scan">
                                        <Scan size={18} />
                                    </button>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3">
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Date From</label>
                                    <input
                                        type="date"
                                        value={filters.dateFrom}
                                        onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
                                        className="w-full h-11 bg-slate-50 border border-blue-200 rounded-lg px-3 text-sm font-bold text-blue-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Date To</label>
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
                                    onClick={() => loadODs(filters)}
                                    disabled={loading}
                                    className="w-full bg-brand-blue hover:bg-opacity-90 text-white font-bold py-3.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60"
                                >
                                    {loading ? <><Loader className="animate-spin" size={16} /> Searching...</> : <><Search size={16} /> Search Outbound Delivery</>}
                                </button>
                            </div>
                        </div>
                    )}


                    {/* LIST VIEW */}
                    {view === 'list' && (
                        <div className="grid grid-cols-1 gap-4">
                            {loading ? (
                                <div className="text-center py-12">
                                    <Loader className="animate-spin mx-auto text-blue-600 mb-4" size={32} />
                                    <p className="text-slate-400">Loading Outbound Deliveries...</p>
                                </div>
                            ) : ods.length === 0 ? (
                                <div className="text-center py-16 text-slate-500 border-2 border-dashed border-slate-200 rounded-xl">
                                    <Package className="mx-auto mb-4 opacity-30 text-slate-400" size={48} />
                                    <p>No Deliveries found.</p>
                                </div>
                            ) : (
                                ods.map(od => (
                                    <div
                                        key={od.DeliveryDocument}
                                        className="relative bg-white rounded-xl mb-4 shadow-sm border border-slate-200 overflow-hidden cursor-pointer hover:shadow-md transition-all flex items-stretch min-h-[100px]"
                                    >
                                        <div className="w-2 bg-indigo-500 flex-shrink-0"></div>

                                        <div className="flex-1 px-4 py-3 flex flex-col justify-center gap-1.5 min-w-0" onClick={() => setExpandedOD(expandedOD === od.DeliveryDocument ? null : od.DeliveryDocument)}>
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-lg font-bold text-blue-950 leading-tight">OBD #{od.DeliveryDocument}</h3>
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

                                            {expandedOD === od.DeliveryDocument && (
                                                <div className="mt-4 pt-4 border-t border-slate-100 animate-in">
                                                    <div className="grid grid-cols-2 gap-4 text-xs text-slate-600 mb-4">
                                                        <div><span className="block text-[10px] uppercase text-slate-400">Created By</span> {od.CreatedByUser || 'System'}</div>
                                                        <div><span className="block text-[10px] uppercase text-slate-400">Total Weight</span> {parseFloat(od.HeaderGrossWeight || 0).toFixed(2)} {od.HeaderWeightUnit}</div>
                                                    </div>

                                                    <div className="flex gap-3">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleViewItems(od); }}
                                                            className="flex-1 py-2 rounded-lg border-2 border-brand-blue text-brand-blue font-bold text-xs hover:bg-blue-50 transition-colors"
                                                        >
                                                            View Items
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handlePostGI(od); }}
                                                            className="flex-1 py-2 rounded-lg bg-brand-blue text-white font-bold text-xs hover:opacity-90 transition-colors shadow-sm"
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

                    {/* ITEMS VIEW */}
                    {view === 'items' && selectedOD && (
                        <div className="space-y-4 animate-in pb-20">
                            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-800">OBD #{selectedOD.DeliveryDocument}</h2>
                                        <p className="text-xs text-slate-500 font-medium mt-1">Ship To: <span className="text-indigo-600 font-bold">{selectedOD.ShipToParty}</span></p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-slate-400 font-bold uppercase">Incoterms</p>
                                        <p className="text-sm font-bold text-slate-700">{selectedOD.IncotermsClassification}</p>
                                    </div>
                                </div>
                            </div>

                            {loading ? (
                                <div className="text-center py-12">
                                    <Loader className="animate-spin mx-auto text-blue-600 mb-4" size={32} />
                                    <p className="text-slate-400">Loading Items...</p>
                                </div>
                            ) : odItems.map(item => {
                                const picked = isItemPicked(item);
                                return (
                                    <div key={item.DeliveryDocumentItem} className={`bg-white rounded-xl shadow border border-slate-200 ${expandedItem === item.DeliveryDocumentItem ? 'ring-2 ring-indigo-100' : ''}`} style={{ overflow: 'visible' }}>
                                        <div className="p-4 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => !picked && handleExpandItem(item)}>
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
                                                    {/* Pick status badge */}
                                                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${picked ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                                        {picked ? 'Fully Picked' : 'Open'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Expand item for picking — only if not already picked */}
                                        {expandedItem === item.DeliveryDocumentItem && !picked && (
                                            <div className="bg-slate-50 border-t border-slate-200 p-4 animate-in">
                                                <div className="grid grid-cols-1 gap-4 mb-4">
                                                    <div>
                                                        <label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">Pick Quantity</label>
                                                        <div className="flex items-center gap-3">
                                                            <button type="button"
                                                                className="w-10 h-10 bg-brand-blue text-white rounded-lg flex items-center justify-center hover:opacity-90 transition-colors"
                                                                onClick={() => { const curr = parseFloat(pickQty || 0); setPickQty((curr - 1 >= 0 ? curr - 1 : 0).toString()); }}>
                                                                <span className="text-xl font-bold mb-0.5">−</span>
                                                            </button>
                                                            <input
                                                                className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-lg text-center text-lg font-bold focus:ring-2 focus:ring-brand-blue outline-none"
                                                                value={pickQty}
                                                                onChange={(e) => setPickQty(e.target.value)}
                                                                type="number"
                                                            />
                                                            <button type="button"
                                                                className="w-10 h-10 bg-brand-blue text-white rounded-lg flex items-center justify-center hover:opacity-90 transition-colors"
                                                                onClick={() => { const curr = parseFloat(pickQty || 0); setPickQty((curr + 1).toString()); }}>
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

                                                <button
                                                    onClick={() => handleUpdateItem(item)}
                                                    className="w-full bg-brand-blue hover:opacity-90 text-white font-bold h-10 rounded-lg shadow-sm"
                                                    disabled={updateLoading}
                                                >
                                                    {updateLoading ? <Loader className="animate-spin" size={16} /> : 'Confirm Pick & Location'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {/* POST GI — greyed out until all items are picked */}
                            <div className="w-full mt-6 mb-2">
                                {!allItemsPicked && (
                                    <p className="text-center text-xs text-amber-600 font-semibold mb-2">
                                        Confirm all items before posting GI
                                    </p>
                                )}
                                <button
                                    onClick={() => handlePostGI(selectedOD)}
                                    disabled={!allItemsPicked || confirmLoading || loading}
                                    className={`w-full font-bold h-14 rounded-xl shadow-md flex items-center justify-center gap-2 tracking-wide text-[16px] transition-all active:scale-[0.98] ${
                                        allItemsPicked
                                            ? 'bg-brand-blue hover:bg-opacity-90 text-white'
                                            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                    }`}
                                >
                                    {confirmLoading ? <Loader size={20} className="animate-spin text-white" /> : <>POST GI <CheckCircle size={20} /></>}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </main>
            {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => { setShowScanner(false); setScanField(null); }} />}
        </div>
    );
};

export default GoodsIssue;
