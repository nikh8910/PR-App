/**
 * @file GoodsIssueSTO.jsx
 * @description Screen: Goods Issue for Stock Transfer Order (STO / Inter-plant Transfer)
 *
 * Post a Goods Issue against a Stock Transport Order (purchase order type UB).
 * Movement type 351 – removes stock from the issuing plant and places it "in-transit".
 * The receiving plant must then post GR (movement type 101) to complete the transfer.
 *
 * ## Workflow Steps
 *  1. Filter/search STOs by Supplier, Supplying Plant, or date range
 *  2. Select an STO → view its open items with quantities and status
 *  3. Optionally adjust Storage Location / Issue Quantity per item
 *  4. "Post GI" assembles and POSTs all items to SAP API_GOODSMOVEMENT_SRV
 *
 * ## In-Transit Detection
 *  Existing GI material documents (Mvt 351) are fetched in parallel with the PO
 *  items and used to annotate each item with its already-issued qty, preventing
 *  accidental double-posting.
 *
 * SAP API: API_PURCHASEORDER_PROCESS_SRV + API_GOODSMOVEMENT_SRV
 *
 * @route /gi-sto
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, extractSapMessage } from '../services/api';
import {
    Search, Package, ArrowLeft, Home, Truck, Filter,
    AlertCircle, Loader, CheckCircle, ChevronDown, X, RefreshCw, Scan
} from 'lucide-react';
import BarcodeScanner from '../components/BarcodeScanner';

const stripZeros = (str) => str ? String(str).replace(/^0+/, '') || '0' : '';

const GoodsIssueSTO = () => {
    const navigate = useNavigate();
    const { apiConfig } = useAuth();

    // UI State
    const [view, setView] = useState('filter'); // 'filter' | 'list' | 'items'
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');

    // Filter State — default date range: last 90 days
    const toISO = (d) => d.toISOString().split('T')[0];
    const today = new Date();
    const ninetyDaysAgo = new Date(); ninetyDaysAgo.setDate(today.getDate() - 90);
    const [filters, setFilters] = useState({
        supplier: '',
        supplyingPlant: '',
        dateFrom: toISO(ninetyDaysAgo),
        dateTo: toISO(today),
        poNumber: '',
    });

    // Data State
    const [stos, setStos] = useState([]);
    const [selectedSTO, setSelectedSTO] = useState(null);
    const [stoItems, setStoItems] = useState([]);
    const [expandedSTO, setExpandedSTO] = useState(null);
    const [expandedItem, setExpandedItem] = useState(null);
    // Plant options for Supplying Plant dropdown
    const [plantOptions, setPlantOptions] = useState([]);

    // On mount: background-fetch STOs to gather known supplying plants
    useEffect(() => {
        const fetchPlants = async () => {
            try {
                const f = { purchaseOrderType: 'UB', dateFrom: toISO(ninetyDaysAgo), dateTo: toISO(today) };
                const data = await api.fetchPOs(apiConfig, 100, f);
                const results = data.d ? data.d.results : (data.value || []);
                const plants = [...new Set(results.map(r => r.PlantCode || r.SupplyingPlant || r.PurchasingOrganization || '').filter(Boolean))];
                if (plants.length > 0) setPlantOptions(plants);
            } catch (e) {
                console.warn('Could not pre-load plants', e);
            }
        };
        fetchPlants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);


    // Item Edit State
    const [issueQty, setIssueQty] = useState('');
    const [storageLoc, setStorageLoc] = useState('');
    const [issuingPlant, setIssuingPlant] = useState('');
    const [batchInput, setBatchInput] = useState('');
    const [serialInputs, setSerialInputs] = useState([]);
    const [availableSLs, setAvailableSLs] = useState([]);
    const [showSLHelp, setShowSLHelp] = useState(false);
    const [slLoading, setSlLoading] = useState(false);
    const [updateLoading, setUpdateLoading] = useState(false);
    const [postLoading, setPostLoading] = useState(false);

    // Scanner State
    const [showScanner, setShowScanner] = useState(false);
    const [scanField, setScanField] = useState(null);
    const handleScan = (code) => {
        if (scanField === 'poNumber') setFilters(f => ({ ...f, poNumber: code.trim() }));
        else if (scanField === 'supplyingPlant') setFilters(f => ({ ...f, supplyingPlant: code.trim() }));
        else if (scanField === 'supplier') setFilters(f => ({ ...f, supplier: code.trim() }));
        else if (scanField === 'batch') setBatchInput(code.trim());
        else if (scanField && scanField.startsWith('serial_')) {
            const idx = parseInt(scanField.split('_')[1], 10);
            setSerialInputs(prev => {
                const updated = [...prev];
                updated[idx] = code.trim();
                return updated;
            });
        }
        setShowScanner(false);
        setScanField(null);
    };

    const loadSTOs = async (activeFilters) => {
        const f = activeFilters || filters;
        if (!f.supplier && !f.supplyingPlant && !f.dateFrom && !f.poNumber) {
            setError('Please enter at least one filter (Supplier, Supplying Plant, Date, or PO Number) before searching.');
            return;
        }
        setLoading(true);
        setError(null);
        setStos([]);
        try {
            let apiFilters;
            if (f.poNumber && f.poNumber.trim()) {
                apiFilters = { purchaseOrder: f.poNumber.trim() };
            } else {
                apiFilters = {
                    purchaseOrderType: 'UB',
                    ...(f.supplier && { supplier: f.supplier.trim().toUpperCase() }),
                    ...(f.supplyingPlant && { supplyingPlant: f.supplyingPlant.trim().toUpperCase() }),
                    ...(f.dateFrom && { dateFrom: f.dateFrom }),
                    ...(f.dateTo && { dateTo: f.dateTo }),
                };
            }
            const data = await api.fetchPOs(apiConfig, f.poNumber ? 5 : 100, apiFilters);
            const results = data.d ? data.d.results : (data.value || []);
            setStos(results);
            setView('list');
        } catch (err) {
            setError(extractSapMessage(err));
        } finally {
            setLoading(false);
        }
    };

    const filteredSTOs = stos;

    const handleViewItems = async (sto) => {
        setSelectedSTO(sto);
        setLoading(true);
        setView('items');
        setError(null);
        setSuccessMsg('');
        setStoItems([]);
        try {
            const [itemsData, matDocItems] = await Promise.all([
                api.fetchPOItems(apiConfig, sto.PurchaseOrder),
                api.fetchMaterialDocumentItemsByPO(apiConfig, sto.PurchaseOrder, '351').catch(() => [])
            ]);

            const items = itemsData.d ? itemsData.d.results : (itemsData.value || []);

            const issuedQtyMap = {};
            const matDocMap = {};
            matDocItems.forEach(md => {
                const key = String(md.PurchaseOrderItem || '').replace(/^0+/, '') || md.PurchaseOrderItem;
                const qty = parseFloat(md.QuantityInEntryUnit || 0);
                issuedQtyMap[key] = (issuedQtyMap[key] || 0) + qty;
                matDocMap[key] = md.MaterialDocument;
            });

            matDocItems.forEach(md => {
                const key = md.PurchaseOrderItem;
                const qty = parseFloat(md.QuantityInEntryUnit || 0);
                issuedQtyMap[key] = (issuedQtyMap[key] || 0) + qty;
                matDocMap[key] = md.MaterialDocument;
            });

            const annotated = items.map(item => {
                const itemKey = item.PurchaseOrderItem;
                const itemKeyStripped = String(itemKey).replace(/^0+/, '') || itemKey;
                const alreadyIssued = issuedQtyMap[itemKey] || issuedQtyMap[itemKeyStripped] || 0;
                const orderQty = parseFloat(item.OrderQuantity || 0);
                const receivedQty = parseFloat(item.GoodsReceiptQuantity || 0);
                const openQty = Math.max(0, orderQty - receivedQty);
                const isFullyIssued = alreadyIssued > 0 && alreadyIssued >= openQty;
                const matDoc = matDocMap[itemKey] || matDocMap[itemKeyStripped] || '';

                return {
                    ...item,
                    _alreadyIssuedQty: alreadyIssued,
                    _giPosted: isFullyIssued,
                    _matDoc: matDoc || undefined,
                    _remainingQty: Math.max(0, openQty - alreadyIssued),
                };
            });

            setStoItems(annotated);
        } catch (err) {
            setError('Failed to load items: ' + extractSapMessage(err));
        } finally {
            setLoading(false);
        }
    };

    const handleExpandItem = (item) => {
        const itemKey = item.PurchaseOrderItem;
        if (expandedItem === itemKey) {
            setExpandedItem(null);
            return;
        }
        setExpandedItem(itemKey);
        const remainingQty = item._remainingQty != null
            ? item._remainingQty
            : Math.max(0, parseFloat(item.OrderQuantity || 0) - parseFloat(item.GoodsReceiptQuantity || 0));
        setIssueQty(remainingQty > 0 ? remainingQty.toFixed(3) : '0');
        setStorageLoc(item.StorageLocation || '');
        setIssuingPlant(item.Plant || selectedSTO?.DocumentCurrency || '');
        setBatchInput(item._batch || '');
        setSerialInputs(item._serialNumbers || []);
        setShowSLHelp(false);

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
    };

    const handleUpdateItem = (item) => {
        if (!issueQty || parseFloat(issueQty) <= 0) {
            setError('Please enter a valid Issue Quantity.');
            return;
        }
        if (!storageLoc) {
            setError('Please enter a Storage Location.');
            return;
        }
        const maxQty = item._remainingQty != null
            ? item._remainingQty
            : Math.max(0, parseFloat(item.OrderQuantity || 0) - parseFloat(item.GoodsReceiptQuantity || 0));
        if (parseFloat(issueQty) > maxQty + 0.001) {
            setError(`Cannot exceed remaining open quantity of ${maxQty.toFixed(3)} ${item.PurchaseOrderQuantityUnit || 'EA'}.`);
            return;
        }

        setStoItems(prev => prev.map(i => {
            if (i.PurchaseOrderItem === item.PurchaseOrderItem) {
                return {
                    ...i,
                    _issueQty: parseFloat(issueQty),
                    _storageLoc: storageLoc,
                    _issuingPlant: issuingPlant || item.Plant,
                    _batch: batchInput.trim(),
                    _serialNumbers: serialInputs.filter(s => s && s.trim())
                };
            }
            return i;
        }));

        setSuccessMsg(`Item ${item.PurchaseOrderItem} updated for GI.`);
        setExpandedItem(null);
        setTimeout(() => setSuccessMsg(''), 2000);
    };

    const handlePostGI = async () => {
        const itemsToPost = stoItems.filter(item => {
            if (item._giPosted) return false;
            const qty = item._issueQty != null ? item._issueQty : Math.max(0,
                parseFloat(item.OrderQuantity || 0) - parseFloat(item.GoodsReceiptQuantity || 0)
            );
            const sloc = item._storageLoc || item.StorageLocation;
            const plant = item._issuingPlant || item.Plant;
            return qty > 0 && sloc && plant;
        });

        if (itemsToPost.length === 0) {
            const allPosted = stoItems.every(i => i._giPosted);
            if (allPosted) {
                setError('All items have already been posted in this session. Go back to see the updated STO list.');
            } else {
                setError('No items ready for GI. Please ensure Plant, Storage Location, and Quantity are set for at least one item.');
            }
            return;
        }

        const missingSLoc = itemsToPost.find(i => !(i._storageLoc || i.StorageLocation));
        if (missingSLoc) {
            setError(`Cannot Post: Item ${missingSLoc.PurchaseOrderItem} is missing Storage Location.`);
            return;
        }

        if (!window.confirm(`Post Goods Issue for ${itemsToPost.length} item(s) from STO ${stripZeros(selectedSTO.PurchaseOrder)}?`)) {
            return;
        }

        setPostLoading(true);
        setError(null);

        try {
            const apiItems = itemsToPost.map((item) => ({
                Material: item.Material,
                Plant: item._issuingPlant || item.Plant,
                StorageLocation: item._storageLoc || item.StorageLocation,
                QuantityInEntryUnit: String(item._issueQty != null ? item._issueQty : Math.max(0,
                    parseFloat(item.OrderQuantity || 0) - parseFloat(item.GoodsReceiptQuantity || 0)
                )),
                EntryUnit: item.PurchaseOrderQuantityUnit || item.OrderQuantityUnit || 'EA',
                GoodsMovementType: '351',
                PurchaseOrder: selectedSTO.PurchaseOrder,
                PurchaseOrderItem: item.PurchaseOrderItem,
                Batch: item._batch || '',
                SerialNumbers: item._serialNumbers || []
            }));

            const result = await api.postGoodsIssueForReservation(apiConfig, apiItems, '04');
            const matDoc = result.d ? result.d.MaterialDocument : (result.MaterialDocument || '');

            const postedItemKeys = new Set(itemsToPost.map(i => i.PurchaseOrderItem));
            setStoItems(prev => prev.map(item => {
                if (postedItemKeys.has(item.PurchaseOrderItem)) {
                    return {
                        ...item,
                        _giPosted: true,
                        _matDoc: matDoc,
                        GoodsReceiptQuantity: item.OrderQuantity,
                    };
                }
                return item;
            }));

            setSuccessMsg(`✓ GI Posted${matDoc ? ` — Mat. Doc: ${matDoc}` : ''}. Receiving plant must post GR (Mvt 101) to complete transfer.`);
        } catch (err) {
            setError(extractSapMessage(err));
        } finally {
            setPostLoading(false);
        }
    };

    const getOpenQty = (item) =>
        Math.max(0, parseFloat(item.OrderQuantity || 0) - parseFloat(item.GoodsReceiptQuantity || 0));

    const getStoStatus = (sto) => {
        const delivStatus = sto.PurchaseOrderStatus || '';
        if (delivStatus === 'C') return { label: 'Complete', color: 'bg-emerald-100 text-emerald-700' };
        if (delivStatus === 'B') return { label: 'Partial', color: 'bg-amber-100 text-amber-700' };
        return { label: 'Open', color: 'bg-blue-100 text-blue-700' };
    };

    return (
        <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">

            {/* Header */}
            <header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                <div className="flex justify-between items-center relative">
                    <button
                        onClick={() => view === 'filter' ? navigate(-1) : setView(view === 'items' ? 'list' : 'filter')}
                        className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                        title="Back"
                    >
                        <ArrowLeft size={20} className="text-white" />
                    </button>

                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <h1 className="text-xl font-bold text-white tracking-wide">
                            {view === 'filter' ? 'GI Against STO' : view === 'list' ? 'GI Against STO' : `STO ${stripZeros(selectedSTO?.PurchaseOrder || '')}`}
                        </h1>
                        <p className="text-blue-200 text-[10px] font-medium uppercase tracking-wider mt-0.5">
                            {view === 'filter' ? 'Search Filters' : view === 'list' ? 'Stock Transfer Orders' : 'Items'}
                        </p>
                    </div>

                    <button
                        onClick={() => navigate('/menu', { replace: true })}
                        className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                        title="Home"
                    >
                        <Home size={20} className="text-white" />
                    </button>
                </div>
            </header>

            {/* Error/Success */}
            {(error || successMsg) && (
                <div className="px-4 py-3 z-50 w-full shrink-0 flex flex-col gap-2 relative">
                    {error && (
                        <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-3 shadow-md flex gap-3 items-start w-full">
                            <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                            <div className="flex-1 min-w-0">
                                <h4 className="text-xs font-bold text-red-700">Error</h4>
                                <p className="text-[11px] text-red-600 mt-0.5 whitespace-pre-wrap">{error}</p>
                            </div>
                            <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-md shrink-0">
                                <X size={14} className="text-red-500" />
                            </button>
                        </div>
                    )}
                    {successMsg && (
                        <div className="bg-emerald-50 border-l-4 border-emerald-500 rounded-lg p-3 shadow-md flex gap-3 items-start w-full">
                            <CheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={18} />
                            <div className="flex-1 min-w-0">
                                <h4 className="text-xs font-bold text-emerald-700">Success</h4>
                                <p className="text-[11px] text-emerald-600 mt-0.5 whitespace-pre-wrap">{successMsg}</p>
                            </div>
                            <button onClick={() => setSuccessMsg('')} className="p-1 hover:bg-emerald-100 rounded-md shrink-0">
                                <X size={14} className="text-emerald-500" />
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Main */}
            <main className="flex-1 overflow-y-auto px-4 pt-4 pb-32 z-10 content-area" style={{ WebkitOverflowScrolling: 'touch' }}>
                <div className="max-w-5xl mx-auto">

                    {/* Filter Form */}
                    {view === 'filter' && (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mt-4 space-y-4">
                            <div className="flex items-center gap-2 mb-1">
                                <Filter size={16} className="text-blue-600" />
                                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Search Filters</h2>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">STO Number</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={filters.poNumber}
                                        onChange={e => setFilters(f => ({ ...f, poNumber: e.target.value }))}
                                        placeholder="e.g. 4500000061"
                                        className="flex-1 h-11 bg-slate-50 border border-blue-200 rounded-lg px-3 text-sm font-bold text-blue-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                                    />
                                    <button type="button" onClick={() => { setScanField('poNumber'); setShowScanner(true); }} className="h-11 w-11 flex-none bg-brand-blue text-white rounded-lg flex items-center justify-center hover:opacity-90 transition-colors" title="Scan">
                                        <Scan size={18} />
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Supplying Plant</label>
                                <select
                                    value={filters.supplyingPlant}
                                    onChange={e => setFilters(f => ({ ...f, supplyingPlant: e.target.value }))}
                                    className="w-full h-11 bg-slate-50 border border-blue-200 rounded-lg px-3 text-sm font-bold text-blue-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none appearance-none"
                                >
                                    <option value="">All Plants</option>
                                    {plantOptions.map(p => (
                                        <option key={p} value={p}>{p}</option>
                                    ))}
                                </select>
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
                                    <button type="button" onClick={() => { setScanField('supplier'); setShowScanner(true); }} className="h-11 w-11 flex-none bg-brand-blue text-white rounded-lg flex items-center justify-center hover:opacity-90 transition-colors" title="Scan">
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
                                    onClick={() => loadSTOs()}
                                    disabled={loading}
                                    className="w-full bg-brand-blue hover:bg-opacity-90 text-white font-bold py-3.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60"
                                >
                                    {loading ? <><Loader className="animate-spin" size={16} /> Searching...</> : <><Search size={16} /> Search STOs</>}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STO List */}
                    {view === 'list' && (
                        <>
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-xs text-slate-500 font-medium">
                                    {filteredSTOs.length} STO{filteredSTOs.length !== 1 ? 's' : ''} found
                                </span>
                                <button
                                    onClick={() => setView('filter')}
                                    className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline"
                                >
                                    <Filter size={12} /> Change Filters
                                </button>
                            </div>
                            <div className="grid grid-cols-1 gap-4">
                                {loading ? (
                                    <div className="text-center py-12">
                                        <Loader className="animate-spin mx-auto text-blue-600 mb-4" size={32} />
                                        <p className="text-slate-400">Loading STOs...</p>
                                    </div>
                                ) : filteredSTOs.length === 0 ? (
                                    <div className="text-center py-16 text-slate-500 border-2 border-dashed border-slate-200 rounded-xl">
                                        <Package className="mx-auto mb-4 opacity-30 text-slate-400" size={48} />
                                        <p>No Stock Transfer Orders found.</p>
                                        <button
                                            onClick={loadSTOs}
                                            className="mt-4 flex items-center gap-2 mx-auto text-blue-600 font-bold text-sm hover:underline"
                                        >
                                            <RefreshCw size={14} /> Refresh
                                        </button>
                                    </div>
                                ) : (
                                    filteredSTOs.map(sto => {
                                        const status = getStoStatus(sto);
                                        return (
                                            <div
                                                key={sto.PurchaseOrder}
                                                className="relative bg-white rounded-xl mb-2 shadow-sm border border-slate-200 overflow-hidden cursor-pointer hover:shadow-md transition-all flex items-stretch min-h-[90px]"
                                            >
                                                <div className="w-2 bg-teal-500 flex-shrink-0" />
                                                <div
                                                    className="flex-1 px-4 py-3 flex flex-col justify-center gap-1.5 min-w-0"
                                                    onClick={() => setExpandedSTO(expandedSTO === sto.PurchaseOrder ? null : sto.PurchaseOrder)}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <h3 className="text-lg font-bold text-blue-950 leading-tight">
                                                            STO #{stripZeros(sto.PurchaseOrder)}
                                                        </h3>
                                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${status.color}`}>
                                                            {status.label}
                                                        </span>
                                                    </div>

                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex items-center gap-2 text-sm text-slate-600 truncate">
                                                            <span className="font-bold uppercase text-[11px] text-slate-400 tracking-wider">Supplying Plant</span>
                                                            <span className="font-bold truncate text-teal-900">
                                                                {sto.SupplyingPlant || sto.Plant || 'N/A'}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                                                            <Truck size={13} className="text-slate-400" />
                                                            <span>Type: {sto.PurchaseOrderType || 'N/A'}</span>
                                                            {sto.OrderDate && (
                                                                <span className="ml-2">
                                                                    {new Date(parseInt((sto.OrderDate || '').replace(/\/Date\((-?\d+)\)\//, '$1'))).toLocaleDateString()}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {expandedSTO === sto.PurchaseOrder && (
                                                        <div className="mt-4 pt-4 border-t border-slate-100 animate-in">
                                                            <div className="grid grid-cols-2 gap-4 text-xs text-slate-600 mb-4">
                                                                <div>
                                                                    <span className="block text-[10px] uppercase text-slate-400">Company Code</span>
                                                                    {sto.CompanyCode || 'N/A'}
                                                                </div>
                                                                <div>
                                                                    <span className="block text-[10px] uppercase text-slate-400">Currency</span>
                                                                    {sto.DocumentCurrency || 'N/A'}
                                                                </div>
                                                            </div>
                                                            <div className="flex gap-3">
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleViewItems(sto); }}
                                                                    className="flex-1 py-3 rounded-lg bg-brand-blue text-white font-bold text-sm hover:opacity-90 transition-opacity shadow-sm"
                                                                >
                                                                    View Items &amp; Post GI
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </>
                    )}

                    {/* Items View */}
                    {view === 'items' && selectedSTO && (
                        <div className="space-y-4 animate-in pb-20">
                            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-800">STO #{stripZeros(selectedSTO.PurchaseOrder)}</h2>
                                        <p className="text-xs text-slate-500 font-medium mt-1">
                                            Supplying Plant: <span className="text-teal-600 font-bold">{selectedSTO.SupplyingPlant || 'N/A'}</span>
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-slate-400 font-bold uppercase">Type</p>
                                        <p className="text-sm font-bold text-slate-700">{selectedSTO.PurchaseOrderType} — Movement 351</p>
                                    </div>
                                </div>
                            </div>

                            {loading ? (
                                <div className="text-center py-12">
                                    <Loader className="animate-spin mx-auto text-blue-600 mb-4" size={32} />
                                    <p className="text-slate-400">Loading Items...</p>
                                </div>
                            ) : stoItems.length === 0 ? (
                                <div className="text-center py-12 text-slate-500">
                                    <Package className="mx-auto mb-4 opacity-30" size={40} />
                                    <p>No open items found for this STO.</p>
                                </div>
                            ) : stoItems.map(item => (
                                <div
                                    key={item.PurchaseOrderItem}
                                    className={`bg-white rounded-xl shadow border border-slate-200 ${expandedItem === item.PurchaseOrderItem ? 'ring-2 ring-teal-100' : ''}`}
                                    style={{ overflow: 'visible' }}
                                >
                                    <div
                                        className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                                        onClick={() => handleExpandItem(item)}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-start gap-3">
                                                <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center font-mono text-xs font-bold text-slate-500 mt-1">
                                                    {item.PurchaseOrderItem}
                                                </div>
                                                <div>
                                                    <h4 className="m-0 text-base font-bold text-slate-800 leading-tight">
                                                        {stripZeros(item.Material)}
                                                    </h4>
                                                    <p className="m-0 text-xs text-slate-500 mt-1">
                                                        {item.PurchaseOrderItemText || item.MaterialDescriptionText || 'Item'}
                                                    </p>
                                                    <p className="m-0 text-xs text-slate-400 mt-0.5">
                                                        Plant: {item._issuingPlant || item.Plant} | SLoc: {item._storageLoc || item.StorageLocation || 'Not Set'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="flex items-baseline justify-end gap-1">
                                                    <span className="text-slate-400 text-[10px] font-bold uppercase mr-1">
                                                        {item._giPosted ? 'In Transit' : 'Open'}
                                                    </span>
                                                    <span className={`font-bold text-lg ${item._giPosted ? 'text-blue-500' : 'text-slate-800'}`}>
                                                        {item._giPosted
                                                            ? (item._alreadyIssuedQty || 0).toFixed(3)
                                                            : (item._issueQty !== undefined
                                                                ? item._issueQty
                                                                : (item._remainingQty != null ? item._remainingQty : getOpenQty(item)).toFixed(3))}
                                                    </span>
                                                    <span className="text-slate-500 text-xs font-bold">
                                                        {item.PurchaseOrderQuantityUnit || 'EA'}
                                                    </span>
                                                </div>
                                                {item._giPosted ? (
                                                    <div className="flex flex-col items-end gap-0.5">
                                                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                                                            ✈ In Transit
                                                        </span>
                                                        {item._matDoc && (
                                                            <span className="text-[9px] text-blue-400 font-mono">Doc: {item._matDoc}</span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${(item._storageLoc || item.StorageLocation) ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                                        {(item._storageLoc || item.StorageLocation) ? 'Ready' : 'Set SLoc'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {expandedItem === item.PurchaseOrderItem && !item._giPosted && (
                                        <div className="bg-slate-50 border-t border-slate-200 p-4 animate-in">
                                            <div className="grid grid-cols-1 gap-4 mb-4">
                                                <div>
                                                    <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Issuing Plant</label>
                                                    <input
                                                        className="w-full h-10 bg-white border border-blue-200 rounded-lg px-3 text-sm font-bold text-blue-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                                                        value={issuingPlant}
                                                        onChange={(e) => setIssuingPlant(e.target.value.toUpperCase())}
                                                        placeholder="Plant Code"
                                                    />
                                                </div>

                                                <div style={{ position: 'relative', zIndex: 100, overflow: 'visible' }}>
                                                    <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Storage Location (Issue From)</label>
                                                    <div style={{ position: 'relative', overflow: 'visible' }}>
                                                        <div style={{ position: 'relative' }}>
                                                            <input
                                                                type="text"
                                                                value={storageLoc}
                                                                onChange={(e) => setStorageLoc(e.target.value.toUpperCase())}
                                                                onFocus={() => setShowSLHelp(true)}
                                                                placeholder="Enter or select"
                                                                style={{
                                                                    width: '100%',
                                                                    height: '48px',
                                                                    border: '1px solid #cbd5e1',
                                                                    borderRadius: '8px',
                                                                    padding: '0 40px 0 16px',
                                                                    fontSize: '14px',
                                                                    boxSizing: 'border-box',
                                                                    outline: 'none'
                                                                }}
                                                            />
                                                            <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', pointerEvents: 'none' }}>
                                                                <ChevronDown size={18} />
                                                            </div>
                                                        </div>

                                                        {showSLHelp && (
                                                            <div style={{
                                                                position: 'absolute',
                                                                left: 0, right: 0,
                                                                marginTop: '4px',
                                                                backgroundColor: 'white',
                                                                border: '1px solid #e2e8f0',
                                                                borderRadius: '8px',
                                                                boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                                                                zIndex: 1000,
                                                                maxHeight: '200px',
                                                                overflowY: 'auto'
                                                            }}>
                                                                {slLoading ? (
                                                                    <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8' }}>
                                                                        <Loader className="animate-spin inline mr-2" size={14} />Loading...
                                                                    </div>
                                                                ) : availableSLs.length === 0 ? (
                                                                    <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                                                                        No options found — type manually
                                                                    </div>
                                                                ) : (
                                                                    availableSLs.map((sl, idx) => (
                                                                        <div
                                                                            key={sl.StorageLocation}
                                                                            onClick={() => { setStorageLoc(sl.StorageLocation); setShowSLHelp(false); }}
                                                                            style={{
                                                                                padding: '12px 16px',
                                                                                cursor: 'pointer',
                                                                                borderBottom: idx < availableSLs.length - 1 ? '1px solid #f1f5f9' : 'none'
                                                                            }}
                                                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0fdfa'}
                                                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}
                                                                        >
                                                                            <div style={{ fontWeight: '600', color: '#1e293b' }}>{sl.StorageLocation}</div>
                                                                            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{sl.StorageLocationName || 'Standard'}</div>
                                                                        </div>
                                                                    ))
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">Issue Quantity</label>
                                                    <div className="flex items-center gap-3">
                                                        <button
                                                            type="button"
                                                            className="w-10 h-10 bg-brand-blue text-white rounded-lg flex items-center justify-center hover:opacity-90 transition-colors"
                                                            onClick={() => {
                                                                const curr = parseFloat(issueQty || 0);
                                                                setIssueQty((curr - 1 >= 0 ? curr - 1 : 0).toString());
                                                            }}
                                                        >
                                                            <span className="text-xl font-bold mb-0.5">−</span>
                                                        </button>
                                                        <input
                                                            className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-lg text-center text-lg font-bold focus:ring-2 focus:ring-brand-blue outline-none"
                                                            value={issueQty}
                                                            onChange={(e) => setIssueQty(e.target.value)}
                                                            type="number"
                                                            step="0.001"
                                                        />
                                                        <button
                                                            type="button"
                                                            className="w-10 h-10 bg-brand-blue text-white rounded-lg flex items-center justify-center hover:opacity-90 transition-colors"
                                                            onClick={() => {
                                                                const curr = parseFloat(issueQty || 0);
                                                                setIssueQty((curr + 1).toString());
                                                            }}
                                                        >
                                                            <span className="text-xl font-bold mb-0.5">+</span>
                                                        </button>
                                                    </div>
                                                    <p className="text-[10px] text-slate-400 mt-1">
                                                        Ordered: {item.OrderQuantity || 0} | Received: {item.GoodsReceiptQuantity || 0}
                                                    </p>
                                                </div>

                                                {/* Batch Input */}
                                                <div>
                                                    <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Batch (Optional)</label>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            className="flex-1 h-10 bg-white border border-blue-200 rounded-lg px-3 text-sm font-bold text-blue-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                                                            value={batchInput}
                                                            onChange={e => setBatchInput(e.target.value)}
                                                            placeholder="Enter batch number"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => { setScanField('batch'); setShowScanner(true); }}
                                                            className="h-10 w-10 flex-none bg-brand-blue text-white rounded-lg flex items-center justify-center hover:opacity-90 transition-colors"
                                                            title="Scan Batch"
                                                        >
                                                            <Scan size={16} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Serial Numbers */}
                                                {(() => {
                                                    const qty = parseFloat(issueQty || 0);
                                                    const serialCount = Number.isInteger(qty) && qty > 0 && qty <= 50 ? qty : 0;
                                                    if (serialCount === 0) return null;
                                                    return (
                                                        <div>
                                                            <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">
                                                                Serial Numbers ({serialCount})
                                                            </label>
                                                            <div className="space-y-2">
                                                                {Array.from({ length: serialCount }).map((_, idx) => (
                                                                    <div key={idx} className="flex items-center gap-2">
                                                                        <span className="text-[10px] font-bold text-slate-400 w-5 text-right">{idx + 1}</span>
                                                                        <input
                                                                            className="flex-1 h-9 bg-white border border-slate-200 rounded-lg px-3 text-sm font-bold text-blue-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                                                                            value={serialInputs[idx] || ''}
                                                                            onChange={e => {
                                                                                setSerialInputs(prev => {
                                                                                    const updated = [...prev];
                                                                                    updated[idx] = e.target.value;
                                                                                    return updated;
                                                                                });
                                                                            }}
                                                                            placeholder={`Serial #${idx + 1}`}
                                                                        />
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => { setScanField(`serial_${idx}`); setShowScanner(true); }}
                                                                            className="h-9 w-9 flex-none bg-brand-blue text-white rounded-lg flex items-center justify-center hover:opacity-90 transition-colors"
                                                                            title={`Scan Serial #${idx + 1}`}
                                                                        >
                                                                            <Scan size={14} />
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                            </div>

                                            <button
                                                onClick={() => handleUpdateItem(item)}
                                                className="w-full h-10 shadow-sm text-white font-bold text-xs uppercase rounded-lg transition-all bg-brand-blue hover:opacity-90"
                                                disabled={updateLoading}
                                            >
                                                {updateLoading ? <Loader className="animate-spin mx-auto" size={16} /> : 'Confirm Item'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}

                            <div className="w-full mt-6 mb-2">
                                <button
                                    onClick={handlePostGI}
                                    disabled={postLoading || loading}
                                    className="w-full bg-brand-blue hover:bg-opacity-90 text-white font-bold h-14 rounded-xl shadow-md flex items-center justify-center gap-2 tracking-wide text-[16px] transition-all active:scale-[0.98]"
                                >
                                    {postLoading ? <Loader size={20} className="animate-spin text-white" /> : <>POST GI <CheckCircle size={20} /></>}
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

export default GoodsIssueSTO;
