/**
 * @file GoodsIssueReservation.jsx
 * @description Screen: Goods Issue against Reservation (MM)
 *
 * Post a Goods Issue against a SAP MM Reservation document. Reservations are
 * created in SAP for production orders, cost centers, and project stock needs.
 * This screen allows the operator to search by reservation number, cost center,
 * or order ID, view items, set issue quantities and storage locations, then post GI.
 *
 * ## Movement Types
 *  Typically 261 (GI for production order) as set in the reservation header.
 *
 * ## Workflow Steps
 *  1. Enter filters → search reservations (filter-first)
 *  2. Select a reservation → view its open line items
 *  3. Optionally adjust Plant, Storage Location, Quantity per item
 *  4. "Post GI" posts all configured items via API_GOODSMOVEMENT_SRV
 *
 * SAP API: API_RESERVATION_DOCUMENT_SRV + API_GOODSMOVEMENT_SRV
 *
 * @route /gi-reservation
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, extractSapMessage } from '../services/api';
import {
    Search, Package, ArrowLeft, Home, FileText, Filter,
    AlertCircle, Loader, CheckCircle, Factory, ChevronDown, X, Scan
} from 'lucide-react';
import BarcodeScanner from '../components/BarcodeScanner';

const GoodsIssueReservation = () => {
    const navigate = useNavigate();
    const { apiConfig } = useAuth();

    // UI State
    const [view, setView] = useState('filter'); // 'filter' | 'list' | 'items'
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');

    // Filter State
    const [filters, setFilters] = useState({
        reservation: '',
        costCenter: '',
        orderID: '',
        plant: '',
    });

    // Data State
    const [reservations, setReservations] = useState([]);
    const [selectedReservation, setSelectedReservation] = useState(null);
    const [reservationItems, setReservationItems] = useState([]);
    const [expandedReservation, setExpandedReservation] = useState(null);
    const [expandedItem, setExpandedItem] = useState(null);

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

    // Posting State
    const [postLoading, setPostLoading] = useState(false);

    // Show/hide completed reservations toggle
    const [showCompleted, setShowCompleted] = useState(false);

    // Scanner state
    const [showScanner, setShowScanner] = useState(false);
    const [scanField, setScanField] = useState(null);
    const handleScan = (code) => {
        if (scanField === 'reservation') setFilters(f => ({ ...f, reservation: code.trim() }));
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

    // Plant suggestions (populated from API on mount)
    const [plantOptions, setPlantOptions] = useState([]);
    const [plantLoading, setPlantLoading] = useState(false);

    useEffect(() => {
        const loadPlants = async () => {
            setPlantLoading(true);
            try {
                const data = await api.fetchPlantList(apiConfig);
                const results = data.d ? data.d.results : (data.value || []);
                setPlantOptions(results);
            } catch (e) {
                console.warn('Could not load plants', e);
            } finally {
                setPlantLoading(false);
            }
        };
        loadPlants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadReservations = async (activeFilters) => {
        const f = activeFilters || filters;
        if (!f.reservation && !f.costCenter && !f.orderID && !f.plant) {
            setError('Please enter at least one filter (Reservation No., Cost Center, Order ID, or Plant) before searching.');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const data = await api.fetchReservations(apiConfig, 50, f);
            const results = data.d ? data.d.results : (data.value || []);
            setReservations(results);
            setView('list');
        } catch (err) {
            setError(extractSapMessage(err));
        } finally {
            setLoading(false);
        }
    };

    // Calculate total open quantity for a reservation
    const getReservationOpenInfo = (res) => {
        const items = res.to_ReservationDocumentItem?.results || [];
        let totalOpen = 0;
        let openItemCount = 0;
        items.forEach(item => {
            const open = Math.max(0, parseFloat(item.ReqdQuantity || 0) - parseFloat(item.WithdrawnQuantity || 0));
            if (open > 0) {
                totalOpen += open;
                openItemCount++;
            }
        });
        return { totalOpen, openItemCount, totalItems: items.length };
    };

    // Filter reservations - show completed based on toggle
    const filteredReservations = reservations.filter(res => {
        const { openItemCount } = getReservationOpenInfo(res);
        if (!showCompleted && openItemCount === 0) return false;
        return true;
    });

    const handleViewItems = async (res) => {
        setSelectedReservation(res);
        setLoading(true);
        setView('items');
        setError(null);
        setSuccessMsg('');
        try {
            if (res.to_ReservationDocumentItem && res.to_ReservationDocumentItem.results) {
                const openItems = res.to_ReservationDocumentItem.results.filter(item => {
                    const open = parseFloat(item.ReqdQuantity || 0) - parseFloat(item.WithdrawnQuantity || 0);
                    return open > 0;
                });
                setReservationItems(openItems);
            } else {
                const data = await api.fetchReservationItems(apiConfig, res.Reservation);
                const items = data.d ? data.d.results : (data.value || []);
                const openItems = items.filter(item => {
                    const open = parseFloat(item.ReqdQuantity || 0) - parseFloat(item.WithdrawnQuantity || 0);
                    return open > 0;
                });
                setReservationItems(openItems);
            }
        } catch (err) {
            setError('Failed to load items: ' + extractSapMessage(err));
        } finally {
            setLoading(false);
        }
    };

    const handleExpandItem = (item) => {
        if (expandedItem === item.ReservationItem) {
            setExpandedItem(null);
        } else {
            setExpandedItem(item.ReservationItem);
            const openQty = parseFloat(item.ReqdQuantity || 0) - parseFloat(item.WithdrawnQuantity || 0);
            setIssueQty(openQty > 0 ? openQty.toString() : '0');
            setStorageLoc(item.StorageLocation || '');
            setIssuingPlant(item.Plant || '');
            setBatchInput(item.Batch || item._batch || '');
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
        }
    };

    const handleUpdateItem = async (item) => {
        if (!issueQty || parseFloat(issueQty) <= 0) {
            setError('Please enter a valid Issue Quantity.');
            return;
        }
        if (!storageLoc) {
            setError('Please enter a Storage Location.');
            return;
        }
        if (!issuingPlant) {
            setError('Please enter an Issuing Plant.');
            return;
        }

        setUpdateLoading(true);
        setError(null);

        setReservationItems(prevItems => prevItems.map(i => {
            if (i.ReservationItem === item.ReservationItem) {
                return {
                    ...i,
                    _issueQty: parseFloat(issueQty),
                    _storageLoc: storageLoc,
                    _issuingPlant: issuingPlant,
                    _batch: batchInput.trim(),
                    _serialNumbers: serialInputs.filter(s => s && s.trim())
                };
            }
            return i;
        }));

        setSuccessMsg(`Item ${item.ReservationItem} updated for GI.`);
        setExpandedItem(null);
        setUpdateLoading(false);
        setTimeout(() => setSuccessMsg(''), 2000);
    };

    const handlePostGI = async () => {
        const itemsToPost = reservationItems.filter(item => {
            const qty = item._issueQty || (parseFloat(item.ReqdQuantity || 0) - parseFloat(item.WithdrawnQuantity || 0));
            const sloc = item._storageLoc || item.StorageLocation;
            const plant = item._issuingPlant || item.Plant;
            return qty > 0 && sloc && plant;
        });

        if (itemsToPost.length === 0) {
            setError('No items ready for GI. Please ensure Plant, Storage Location, and Quantity are set for at least one item.');
            return;
        }

        const missingSLoc = itemsToPost.find(i => !(i._storageLoc || i.StorageLocation));
        if (missingSLoc) {
            setError(`Cannot Post: Item ${missingSLoc.ReservationItem} is missing Storage Location.`);
            return;
        }

        if (!window.confirm(`Post Goods Issue for ${itemsToPost.length} item(s) from Reservation ${selectedReservation.Reservation}?`)) {
            return;
        }

        setPostLoading(true);
        setError(null);

        try {
            const apiItems = itemsToPost.map(item => ({
                Material: item.Material,
                Plant: item._issuingPlant || item.Plant,
                StorageLocation: item._storageLoc || item.StorageLocation,
                QuantityInEntryUnit: item._issueQty || (parseFloat(item.ReqdQuantity || 0) - parseFloat(item.WithdrawnQuantity || 0)),
                EntryUnit: item.BaseUnit || item.EntryUnit || 'EA',
                Reservation: selectedReservation.Reservation,
                ReservationItem: item.ReservationItem,
                GoodsMovementType: item.GoodsMovementType || '261',
                IsFinalIssue: false,
                Batch: item._batch || '',
                SerialNumbers: item._serialNumbers || []
            }));

            const result = await api.postGoodsIssueForReservation(apiConfig, apiItems);
            const matDoc = result.d ? result.d.MaterialDocument : (result.MaterialDocument || 'Created');
            setSuccessMsg(`Goods Issue Posted! Material Doc: ${matDoc}`);

            setTimeout(() => {
                setSuccessMsg('');
                setView('list');
                loadReservations();
            }, 3000);

        } catch (err) {
            console.error('Post GI Error:', err);
            setError(extractSapMessage(err));
        } finally {
            setPostLoading(false);
        }
    };

    const getOpenQty = (item) =>
        Math.max(0, parseFloat(item.ReqdQuantity || 0) - parseFloat(item.WithdrawnQuantity || 0));

    return (
        <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">

            {/* Header */}
            <header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                <div className="flex justify-between items-center relative">
                    <button
                        onClick={() => view === 'filter' ? navigate(-1) : view === 'items' ? setView('list') : setView('filter')}
                        className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                        title="Back"
                    >
                        <ArrowLeft size={20} className="text-white" />
                    </button>

                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <h1 className="text-xl font-bold text-white tracking-wide">
                            {view === 'filter' ? 'GI Reservation' : view === 'list' ? 'GI Reservation' : `Res ${selectedReservation?.Reservation}`}
                        </h1>
                        <p className="text-blue-200 text-[10px] font-medium uppercase tracking-wider mt-0.5">
                            {view === 'filter' ? 'Search Filters' : view === 'list' ? (showCompleted ? 'All Reservations' : 'Open Reservations') : 'Items'}
                        </p>
                    </div>

                    <button
                        onClick={() => { setError(null); navigate('/menu', { replace: true }); }}
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

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto px-4 pt-4 pb-32 z-10 content-area" style={{ WebkitOverflowScrolling: 'touch' }}>
                <div className="max-w-5xl mx-auto">

                    {/* Filter Form */}
                    {view === 'filter' && (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mt-4 space-y-4">
                            <div className="flex items-center gap-2 mb-1">
                                <Filter size={16} className="text-blue-600" />
                                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Search Filters</h2>
                            </div>

                            {/* 1st: Reservation No. with scanner */}
                            <div>
                                <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Reservation No.</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={filters.reservation}
                                        onChange={e => setFilters(f => ({ ...f, reservation: e.target.value }))}
                                        placeholder="e.g. 10000001"
                                        className="flex-1 h-11 bg-slate-50 border border-blue-200 rounded-lg px-3 text-sm font-bold text-blue-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => { setScanField('reservation'); setShowScanner(true); }}
                                        className="h-11 w-11 flex-none bg-brand-blue text-white rounded-lg flex items-center justify-center hover:opacity-90 transition-colors"
                                        title="Scan Reservation"
                                    >
                                        <Scan size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* 2nd: Plant with datalist value-help */}
                            <div>
                                <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Plant</label>
                                <select
                                    value={filters.plant}
                                    onChange={e => setFilters(f => ({ ...f, plant: e.target.value }))}
                                    className="w-full h-11 bg-slate-50 border border-blue-200 rounded-lg px-3 text-sm font-bold text-blue-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none appearance-none"
                                >
                                    <option value="">All Plants</option>
                                    {plantOptions.map(p => (
                                        <option key={p.Plant} value={p.Plant}>
                                            {p.Plant}{p.PlantName ? ` — ${p.PlantName}` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* 3rd: Cost Center */}
                            <div>
                                <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Cost Center</label>
                                <input
                                    type="text"
                                    value={filters.costCenter}
                                    onChange={e => setFilters(f => ({ ...f, costCenter: e.target.value }))}
                                    placeholder="e.g. CC1000"
                                    className="w-full h-11 bg-slate-50 border border-blue-200 rounded-lg px-3 text-sm font-bold text-blue-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                                />
                            </div>

                            {/* 4th: Order ID */}
                            <div>
                                <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Order ID</label>
                                <input
                                    type="text"
                                    value={filters.orderID}
                                    onChange={e => setFilters(f => ({ ...f, orderID: e.target.value }))}
                                    placeholder="e.g. 1000001"
                                    className="w-full h-11 bg-slate-50 border border-blue-200 rounded-lg px-3 text-sm font-bold text-blue-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                                />
                            </div>

                            <div className="w-full mt-4">
                                <button
                                    onClick={() => loadReservations()}
                                    disabled={loading}
                                    className="w-full bg-brand-blue hover:bg-opacity-90 text-white font-bold py-3.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60"
                                >
                                    {loading ? <><Loader className="animate-spin" size={16} /> Searching...</> : <><Search size={16} /> Search Reservations</>}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Reservation List View */}
                    {view === 'list' && (
                        <>
                            <div className="flex justify-between items-center mb-3">
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-slate-500 font-medium">
                                        {filteredReservations.length} Reservation{filteredReservations.length !== 1 ? 's' : ''} found
                                    </span>
                                    <button
                                        onClick={() => setShowCompleted(!showCompleted)}
                                        className={`text-xs px-3 py-1 rounded-full font-bold border transition-all ${showCompleted ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                                    >
                                        {showCompleted ? '✓ All' : 'Show Completed'}
                                    </button>
                                </div>
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
                                        <p className="text-slate-400">Loading Reservations...</p>
                                    </div>
                                ) : filteredReservations.length === 0 ? (
                                    <div className="text-center py-16 text-slate-500 border-2 border-dashed border-slate-200 rounded-xl">
                                        <FileText className="mx-auto mb-4 opacity-30 text-slate-400" size={48} />
                                        <p>{showCompleted ? 'No Reservations found.' : 'No Open Reservations found.'}</p>
                                        {!showCompleted && (
                                            <button
                                                onClick={() => setShowCompleted(true)}
                                                className="mt-4 text-indigo-600 font-bold text-sm hover:underline"
                                            >
                                                Show Completed Reservations
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    filteredReservations.map(res => {
                                        const { openItemCount, totalItems } = getReservationOpenInfo(res);
                                        return (
                                            <div
                                                key={res.Reservation}
                                                className="relative bg-white rounded-xl mb-4 shadow-sm border border-slate-200 overflow-hidden cursor-pointer hover:shadow-md transition-all flex items-stretch min-h-[100px]"
                                            >
                                                <div className="w-2 bg-indigo-500 flex-shrink-0" />

                                                <div
                                                    className="flex-1 px-4 py-3 flex flex-col justify-center gap-1.5 min-w-0"
                                                    onClick={() => setExpandedReservation(expandedReservation === res.Reservation ? null : res.Reservation)}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <h3 className="text-lg font-bold text-blue-950 leading-tight">#{res.Reservation}</h3>
                                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${openItemCount > 0 ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                                            {openItemCount > 0 ? `${openItemCount} / ${totalItems} Open` : 'Complete'}
                                                        </span>
                                                    </div>

                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex items-center gap-2 text-sm text-slate-600 truncate">
                                                            <span className="font-bold uppercase text-[11px] text-slate-400 tracking-wider">Cost Ctr</span>
                                                            <span className="font-bold truncate text-indigo-900">{res.CostCenter || 'N/A'}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                                                            <Factory size={13} className="text-slate-400" />
                                                            <span>Plant: {res.Plant || 'N/A'}</span>
                                                            {res.OrderID && <span className="ml-2 text-indigo-600 font-bold">Order: {res.OrderID}</span>}
                                                        </div>
                                                    </div>

                                                    {expandedReservation === res.Reservation && (
                                                        <div className="mt-4 pt-4 border-t border-slate-100">
                                                            <div className="grid grid-cols-2 gap-4 text-xs text-slate-600 mb-4">
                                                                <div>
                                                                    <span className="block text-[10px] uppercase text-slate-400">Movement Type</span>
                                                                    {res.GoodsMovementType || '261'}
                                                                </div>
                                                                <div>
                                                                    <span className="block text-[10px] uppercase text-slate-400">Items</span>
                                                                    {totalItems} total
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleViewItems(res); }}
                                                                className="w-full py-3 rounded-lg bg-brand-blue text-white font-bold text-sm hover:opacity-90 transition-opacity shadow-sm"
                                                            >
                                                                View Items &amp; Post GI
                                                            </button>
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
                    {view === 'items' && selectedReservation && (
                        <div className="space-y-4 pb-20">
                            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-800">Res #{selectedReservation.Reservation}</h2>
                                        <p className="text-xs text-slate-500 font-medium mt-1">
                                            Cost Center: <span className="text-indigo-600 font-bold">{selectedReservation.CostCenter || 'N/A'}</span>
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-slate-400 font-bold uppercase">Mvt Type</p>
                                        <p className="text-sm font-bold text-slate-700">{selectedReservation.GoodsMovementType || '261'}</p>
                                    </div>
                                </div>
                            </div>

                            {loading ? (
                                <div className="text-center py-12">
                                    <Loader className="animate-spin mx-auto text-blue-600 mb-4" size={32} />
                                    <p className="text-slate-400">Loading Items...</p>
                                </div>
                            ) : reservationItems.length === 0 ? (
                                <div className="text-center py-12 text-slate-500">
                                    <Package className="mx-auto mb-4 opacity-30" size={40} />
                                    <p>No open items found for this Reservation.</p>
                                </div>
                            ) : (
                                reservationItems.map(item => (
                                    <div
                                        key={item.ReservationItem}
                                        className={`bg-white rounded-xl shadow border border-slate-200 ${expandedItem === item.ReservationItem ? 'ring-2 ring-indigo-100' : ''}`}
                                        style={{ overflow: 'visible' }}
                                    >
                                        <div
                                            className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                                            onClick={() => handleExpandItem(item)}
                                        >
                                            <div className="flex justify-between items-start">
                                                <div className="flex items-start gap-3">
                                                    <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center font-mono text-xs font-bold text-slate-500 mt-1">
                                                        {item.ReservationItem}
                                                    </div>
                                                    <div>
                                                        <h4 className="m-0 text-base font-bold text-slate-800 leading-tight">
                                                            {item.Material}
                                                        </h4>
                                                        <p className="m-0 text-xs text-slate-500 mt-1">
                                                            {item.MaterialDocument || 'Reservation Item'}
                                                        </p>
                                                        <p className="m-0 text-xs text-slate-400 mt-0.5">
                                                            Plant: {item._issuingPlant || item.Plant} |  SLoc: {item._storageLoc || item.StorageLocation || 'Not Set'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="flex items-baseline justify-end gap-1">
                                                        <span className="text-slate-400 text-[10px] font-bold uppercase mr-1">Open</span>
                                                        <span className="font-bold text-lg text-slate-800">
                                                            {item._issueQty !== undefined
                                                                ? item._issueQty
                                                                : getOpenQty(item).toFixed(3)}
                                                        </span>
                                                        <span className="text-slate-500 text-xs font-bold">
                                                            {item.BaseUnit || 'EA'}
                                                        </span>
                                                    </div>
                                                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${(item._storageLoc || item.StorageLocation) ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                                        {(item._storageLoc || item.StorageLocation) ? 'Ready' : 'Set SLoc'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {expandedItem === item.ReservationItem && (
                                            <div className="bg-slate-50 border-t border-slate-200 p-4">
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
                                                        <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Storage Location</label>
                                                        <div style={{ position: 'relative', overflow: 'visible' }}>
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
                                                                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f0ff'}
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
                                                            Required: {item.ReqdQuantity || 0} | Withdrawn: {item.WithdrawnQuantity || 0}
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

                                                    {/* Serial Numbers (dynamic, count = issueQty for integer quantities) */}
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
                                ))
                            )}

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

export default GoodsIssueReservation;
