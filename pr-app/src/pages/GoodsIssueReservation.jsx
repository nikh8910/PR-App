import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
    Search, Package, ArrowLeft, Home, FileText,
    AlertCircle, Loader, CheckCircle, List, Factory
} from 'lucide-react';

const GoodsIssueReservation = () => {
    const navigate = useNavigate();
    const { apiConfig } = useAuth();

    // UI State
    const [view, setView] = useState('list'); // 'list' | 'items'
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

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
    const [availableSLs, setAvailableSLs] = useState([]);
    const [showSLHelp, setShowSLHelp] = useState(false);
    const [slLoading, setSlLoading] = useState(false);
    const [updateLoading, setUpdateLoading] = useState(false);

    // Posting State
    const [postLoading, setPostLoading] = useState(false);

    // Filter State
    const [showCompleted, setShowCompleted] = useState(false);

    useEffect(() => {
        loadReservations();
    }, []);

    const loadReservations = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await api.fetchReservations(apiConfig);
            const results = data.d ? data.d.results : (data.value || []);
            setReservations(results);
        } catch (err) {
            setError(err.message);
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

        // If not showing completed, hide reservations with no open items
        if (!showCompleted && openItemCount === 0) return false;

        const matchesSearch = res.Reservation.includes(searchTerm) ||
            (res.CostCenter && res.CostCenter.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (res.OrderID && res.OrderID.includes(searchTerm));
        return matchesSearch;
    });

    const handleViewItems = async (res) => {
        setSelectedReservation(res);
        setLoading(true);
        setView('items');
        setError(null);
        try {
            if (res.to_ReservationDocumentItem && res.to_ReservationDocumentItem.results) {
                // Filter to only show items with open quantity
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
            setError("Failed to load items: " + err.message);
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
        if (!issueQty || parseFloat(issueQty) <= 0) {
            setError("Please enter a valid Issue Quantity.");
            return;
        }
        if (!storageLoc) {
            setError("Please enter a Storage Location.");
            return;
        }
        if (!issuingPlant) {
            setError("Please enter an Issuing Plant.");
            return;
        }

        setUpdateLoading(true);
        setError(null);

        // Update local state
        setReservationItems(prevItems => prevItems.map(i => {
            if (i.ReservationItem === item.ReservationItem) {
                return {
                    ...i,
                    _issueQty: parseFloat(issueQty),
                    _storageLoc: storageLoc,
                    _issuingPlant: issuingPlant
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
        // Gather all items that have been configured
        const itemsToPost = reservationItems.filter(item => {
            // Check if item has been configured or use defaults
            const qty = item._issueQty || (parseFloat(item.ReqdQuantity || 0) - parseFloat(item.WithdrawnQuantity || 0));
            const sloc = item._storageLoc || item.StorageLocation;
            const plant = item._issuingPlant || item.Plant;
            return qty > 0 && sloc && plant;
        });

        if (itemsToPost.length === 0) {
            setError("No items ready for GI. Please ensure Plant, Storage Location, and Quantity are set for at least one item.");
            return;
        }

        // Check for missing storage locations
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
                IsFinalIssue: false
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
            console.error("Post GI Error:", err);
            let innerMsg = err.message;
            if (err.message.includes('{')) {
                try {
                    const jsonStart = err.message.indexOf('{');
                    const jsonErr = JSON.parse(err.message.substring(jsonStart));
                    if (jsonErr.error && jsonErr.error.message && jsonErr.error.message.value) {
                        innerMsg = jsonErr.error.message.value;
                    }
                } catch (e) { }
            }
            setError(innerMsg);
        } finally {
            setPostLoading(false);
        }
    };

    const getOpenQty = (item) => {
        return Math.max(0, parseFloat(item.ReqdQuantity || 0) - parseFloat(item.WithdrawnQuantity || 0));
    };

    return (
        <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">

            {/* Fixed Header */}
            <header className="app-header-straight pb-8 px-6 shadow-lg flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)' }}>
                <div className="flex items-center justify-between mb-6">
                    <button onClick={() => navigate('/menu')} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition">
                        <Home size={20} />
                    </button>
                </div>

                <div className="flex flex-col items-center justify-center -mt-2 mb-2 relative">
                    <h1 className="text-3xl font-bold text-white mb-1">
                        {view === 'list' ? 'GI Reservation' : `Res ${selectedReservation?.Reservation}`}
                    </h1>
                    <p className="text-blue-200 text-sm font-medium uppercase tracking-wider">
                        {view === 'list' ? (showCompleted ? 'All Reservations' : 'Open Reservations') : 'Items'}
                    </p>
                </div>

                {view === 'list' && (
                    <>
                        <div className="relative mt-4">
                            <input
                                type="text"
                                placeholder="Search Reservation..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-white h-12 rounded-lg px-4 text-slate-700 placeholder-slate-400 shadow-lg border-0 focus:ring-2 focus:ring-indigo-400 text-center font-medium"
                            />
                        </div>
                        <div className="flex justify-center mt-3">
                            <button
                                onClick={() => setShowCompleted(!showCompleted)}
                                className="px-4 py-1.5 rounded-full text-xs font-bold transition-all shadow-sm"
                                style={{
                                    backgroundColor: showCompleted ? '#4f46e5' : 'rgba(255,255,255,0.15)',
                                    color: 'white',
                                    border: '1px solid rgba(255,255,255,0.3)'
                                }}
                            >
                                {showCompleted ? '✓ Showing All' : 'Show Completed'}
                            </button>
                        </div>
                    </>
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

                    {/* Reservation List View */}
                    {view === 'list' && (
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
                                            {/* Left Colored Strip - Indigo matching OD GI */}
                                            <div className="w-2 bg-indigo-500 flex-shrink-0"></div>

                                            <div className="flex-1 px-4 py-3 flex flex-col justify-center gap-1.5 min-w-0" onClick={() => setExpandedReservation(expandedReservation === res.Reservation ? null : res.Reservation)}>
                                                {/* Header Row */}
                                                <div className="flex items-center justify-between">
                                                    <h3 className="text-lg font-bold text-blue-950 leading-tight">#{res.Reservation}</h3>
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${openItemCount > 0 ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                                        {openItemCount > 0 ? `${openItemCount} / ${totalItems} Open` : 'Complete'}
                                                    </span>
                                                </div>

                                                <div className="flex flex-col gap-1">
                                                    {/* Cost Center */}
                                                    <div className="flex items-center gap-2 text-sm text-slate-600 truncate">
                                                        <span className="font-bold uppercase text-[11px] text-slate-400 tracking-wider">Cost Ctr</span>
                                                        <span className="font-bold truncate text-indigo-900" title={res.CostCenter}>
                                                            {res.CostCenter || 'N/A'}
                                                        </span>
                                                    </div>
                                                    {/* Reference Document (Order) */}
                                                    <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                                                        <Factory size={13} className="text-slate-400" />
                                                        <span>Plant: {res.Plant || 'N/A'}</span>
                                                        {res.OrderID && <span className="ml-2 text-indigo-600 font-bold">Order: {res.OrderID}</span>}
                                                    </div>
                                                </div>

                                                {/* Expandable Actions */}
                                                {expandedReservation === res.Reservation && (
                                                    <div className="mt-4 pt-4 border-t border-slate-100 animate-in">
                                                        <div className="grid grid-cols-2 gap-4 text-xs text-slate-600 mb-4">
                                                            <div><span className="block text-[10px] uppercase text-slate-400">Movement Type</span> {res.GoodsMovementType || 'N/A'}</div>
                                                            <div><span className="block text-[10px] uppercase text-slate-400">Requirement Date</span> {res.ReservationDate ? new Date(parseInt(res.ReservationDate.replace(/\/Date\((-?\d+)\)\//, '$1'))).toLocaleDateString() : 'N/A'}</div>
                                                        </div>

                                                        <div className="flex gap-3">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleViewItems(res); }}
                                                                className="flex-1 py-2 rounded-lg bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition-colors shadow-sm"
                                                            >
                                                                View Items
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
                    )}

                    {/* Items View */}
                    {view === 'items' && selectedReservation && (
                        <div className="space-y-4 animate-in">
                            <div className="flex justify-between items-center mb-0">
                                <button onClick={() => { setView('list'); setError(null); setSuccessMsg(''); }} style={{ backgroundColor: '#0ea5e9' }} className="px-4 py-2 hover:opacity-90 text-white font-bold text-xs uppercase rounded-lg shadow-md transition-all active:scale-95 flex items-center gap-2">
                                    <ArrowLeft size={16} /> Back
                                </button>
                                <button
                                    onClick={handlePostGI}
                                    style={{ backgroundColor: '#0ea5e9' }}
                                    className="px-6 py-2 hover:opacity-90 text-white font-bold text-xs uppercase rounded-lg shadow-md disabled:opacity-50 transition-all active:scale-95"
                                    disabled={postLoading || reservationItems.every(item => getOpenQty(item) === 0)}
                                >
                                    {postLoading ? <Loader className="animate-spin" size={14} /> : (reservationItems.every(item => getOpenQty(item) === 0) ? 'All Complete' : 'Post GI')}
                                </button>
                            </div>

                            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-800">{selectedReservation.Reservation}</h2>
                                        <p className="text-xs text-slate-500 font-medium mt-1">Cost Ctr: <span className="text-indigo-600 font-bold">{selectedReservation.CostCenter || 'N/A'}</span></p>
                                        {selectedReservation.OrderID && (
                                            <p className="text-xs text-slate-500 font-medium mt-1">Order: <span className="text-indigo-600 font-bold">{selectedReservation.OrderID}</span></p>
                                        )}
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-slate-400 font-bold uppercase">Movement Type</p>
                                        <p className="text-sm font-bold text-slate-700">{selectedReservation.GoodsMovementType || 'N/A'}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Items List */}
                            {loading ? (
                                <div className="text-center py-12">
                                    <Loader className="animate-spin mx-auto text-blue-600 mb-4" size={32} />
                                    <p className="text-slate-400">Loading Items...</p>
                                </div>
                            ) : reservationItems.map(item => (
                                <div key={item.ReservationItem} className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden ${expandedItem === item.ReservationItem ? 'ring-2 ring-indigo-100' : ''}`}>
                                    <div className="p-4 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => handleExpandItem(item)}>
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-start gap-3">
                                                <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center font-mono text-xs font-bold text-slate-500 mt-1">
                                                    {item.ReservationItem}
                                                </div>
                                                <div>
                                                    <h4 className="m-0 text-base font-bold text-slate-800 leading-tight">{item.Material}</h4>
                                                    <p className="m-0 text-xs text-slate-500 mt-1">{item.MaterialName || item.ProductDescription || 'Material'}</p>
                                                    <p className="m-0 text-xs text-slate-400 mt-0.5">Plant: {item._issuingPlant || item.Plant} | SLoc: {item._storageLoc || item.StorageLocation || 'Not Set'}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="flex items-baseline justify-end gap-1">
                                                    <span className="text-slate-400 text-[10px] font-bold uppercase mr-1">Open</span>
                                                    <span className="font-bold text-slate-800 text-lg">{item._issueQty || getOpenQty(item).toFixed(2)}</span>
                                                    <span className="text-slate-500 text-xs font-bold">{item.BaseUnit || 'EA'}</span>
                                                </div>
                                                <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${(item._storageLoc || item.StorageLocation) ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                                    {(item._storageLoc || item.StorageLocation) ? 'Ready' : 'Set SLoc'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* GI Form */}
                                    {expandedItem === item.ReservationItem && (
                                        <div className="bg-slate-50 border-t border-slate-200 p-4 animate-in">
                                            <div className="grid grid-cols-1 gap-4 mb-4">
                                                {/* Issuing Plant */}
                                                <div>
                                                    <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Issuing Plant</label>
                                                    <input
                                                        className="w-full h-10 bg-white border border-blue-200 rounded-lg px-3 text-sm font-bold text-blue-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                                                        value={issuingPlant}
                                                        onChange={(e) => setIssuingPlant(e.target.value.toUpperCase())}
                                                        placeholder="Enter Plant"
                                                    />
                                                </div>

                                                {/* Storage Location */}
                                                <div>
                                                    <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Storage Location</label>
                                                    <div className="relative">
                                                        <div className="flex items-center relative">
                                                            <input
                                                                className="w-full h-10 bg-white border border-blue-200 rounded-lg px-3 text-sm font-bold text-blue-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none cursor-pointer transition-all"
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
                                                                        {storageLoc === sl.StorageLocation && <CheckCircle size={16} className="text-emerald-500" />}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Quantity Stepper */}
                                                <div>
                                                    <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Issue Quantity</label>
                                                    <div className="flex items-center h-10 w-full max-w-[200px] rounded-lg overflow-hidden border border-blue-200 shadow-sm">
                                                        <button
                                                            type="button"
                                                            style={{ backgroundColor: '#bae6fd', borderRadius: 0 }}
                                                            className="w-12 h-full flex items-center justify-center hover:bg-[#7dd3fc] text-blue-950 transition-colors border-r border-blue-100"
                                                            onClick={() => {
                                                                const curr = parseFloat(issueQty || 0);
                                                                setIssueQty((curr - 1 >= 0 ? curr - 1 : 0).toString());
                                                            }}
                                                        >
                                                            <span className="text-xl font-bold mb-0.5">−</span>
                                                        </button>
                                                        <input
                                                            style={{ borderRadius: 0 }}
                                                            className="flex-1 w-full h-full bg-white text-center font-bold text-blue-950 text-lg border-none p-0 focus:ring-0 outline-none"
                                                            value={issueQty}
                                                            onChange={(e) => setIssueQty(e.target.value)}
                                                            type="number"
                                                        />
                                                        <button
                                                            type="button"
                                                            style={{ backgroundColor: '#bae6fd', borderRadius: 0 }}
                                                            className="w-12 h-full flex items-center justify-center hover:bg-[#7dd3fc] text-blue-950 transition-colors border-l border-blue-100"
                                                            onClick={() => {
                                                                const curr = parseFloat(issueQty || 0);
                                                                setIssueQty((curr + 1).toString());
                                                            }}
                                                        >
                                                            <span className="text-xl font-bold mb-0.5">+</span>
                                                        </button>
                                                    </div>
                                                    <p className="text-[10px] text-slate-400 mt-1">Req: {item.ReqdQuantity || 0} | Issued: {item.WithdrawnQuantity || 0}</p>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => handleUpdateItem(item)}
                                                className="w-full h-10 shadow-sm text-white font-bold text-xs uppercase rounded-lg transition-all bg-indigo-600 hover:bg-indigo-700"
                                                disabled={updateLoading}
                                            >
                                                {updateLoading ? <Loader className="animate-spin mx-auto" size={16} /> : 'Confirm Item'}
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

export default GoodsIssueReservation;
