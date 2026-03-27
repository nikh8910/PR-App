/**
 * @file PhysicalInventory.jsx
 * @description Screen: Physical Inventory Count (MM)
 *
 * Lists SAP MM Physical Inventory Documents (PIDs) and allows operators to
 * post counted quantities (with optional Zero Count) against each document item.
 * Auto-loads all open PI documents on mount.
 *
 * ## Workflow
 *  1. View list of open PI documents (auto-loaded)
 *  2. Tap a PID → view its line items and book quantities
 *  3. Expand an item → enter counted quantity or check Zero Count
 *  4. "Post" sends the count to SAP via api.postPICount
 *
 * SAP API: API_PHYS_INVENTORY_DOC_SRV (PIDocument, PIDocumentItem)
 *
 * @route /physical-inventory
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, extractSapMessage } from '../services/api';
import {
    Search, ClipboardList, ArrowLeft, Home,
    AlertCircle, Loader, CheckCircle, Save, X
} from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

const PhysicalInventory = () => {
    const navigate = useNavigate();
    const { apiConfig } = useAuth();

    // UI State
    const [view, setView] = useState('list'); // 'list' | 'items'
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    // Data State
    const [pids, setPids] = useState([]);
    const [selectedPID, setSelectedPID] = useState(null);
    const [piItems, setPiItems] = useState([]);
    const [expandedItem, setExpandedItem] = useState(null);

    // Form State
    const [countQty, setCountQty] = useState('');
    const [isZeroCount, setIsZeroCount] = useState(false);
    const [postingLoading, setPostingLoading] = useState(false);

    useEffect(() => {
        loadPIDs();
    }, []);

    const loadPIDs = async () => {
        setLoading(true);
        try {
            const data = await api.fetchPIDocs(apiConfig);
            const results = data.d ? data.d.results : (data.value || []);
            setPids(results);
        } catch (err) {
            setError(extractSapMessage(err));
        } finally {
            setLoading(false);
        }
    };

    const handleViewItems = async (pid) => {
        setSelectedPID(pid);
        setLoading(true);
        setView('items');
        setPiItems([]); // Clear previous
        setError(null);
        setSuccessMsg('');
        try {
            // Check if items are already present
            if (pid.to_PhysicalInventoryDocItem && pid.to_PhysicalInventoryDocItem.results) {
                setPiItems(pid.to_PhysicalInventoryDocItem.results);
            } else {
                const data = await api.fetchPIItems(apiConfig, pid.FiscalYear, pid.PhysicalInventoryDocument);
                const items = data.d ? data.d.results : (data.value || []);
                setPiItems(items);
            }
        } catch (err) {
            setError("Failed to load items: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleExpandItem = (item) => {
        setExpandedItem(expandedItem === item.PhysicalInventoryDocumentItem ? null : item.PhysicalInventoryDocumentItem);
        setCountQty(''); // Reset input
        setIsZeroCount(false); // Reset zero count
    };

    const handlePostCount = async (item) => {
        // Validation: If Zero Count checked, Qty is ignored (logic 0). If not checked, Qty must be valid.
        const qtyToPost = isZeroCount ? 0 : countQty;

        if (!isZeroCount && (qtyToPost === '' || isNaN(qtyToPost))) {
            alert("Please enter a valid quantity or check Zero Count.");
            return;
        }

        if (!window.confirm(`Post Count of ${qtyToPost} ${item.UnitOfEntry} ${isZeroCount ? '(Zero Count)' : ''} for Item ${item.PhysicalInventoryDocumentItem}?`)) return;

        setPostingLoading(true);
        setError(null);
        try {
            await api.postPICount(
                apiConfig,
                selectedPID.FiscalYear,
                selectedPID.PhysicalInventoryDocument,
                item.PhysicalInventoryDocumentItem,
                qtyToPost,
                item.UnitOfEntry,
                isZeroCount
            );

            setSuccessMsg(`Count Posted for Item ${item.PhysicalInventoryDocumentItem}!`);
            setExpandedItem(null);

            // Refresh items (optional) or update local state to show 'Counted'
            // For now, simple reload of items if we want to confirm status
            // handleViewItems(selectedPID); 
        } catch (err) {
            console.error("Post Count Error:", err);
            setError(extractSapMessage(err));
        } finally {
            setPostingLoading(false);
            setTimeout(() => setSuccessMsg(''), 3000);
        }
    };

    // Filter PIDs
    const filteredPIDs = pids.filter(pid =>
        pid.PhysicalInventoryDocument.includes(searchTerm) ||
        (pid.Plant && pid.Plant.includes(searchTerm))
    );

    return (
        <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">

            {/* Fixed Header */}
            <header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                <div className="flex justify-between items-center relative">
                    <button onClick={() => navigate(-1)} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition">
                                                <ArrowLeft size={20} />
                                            </button>
                    
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <h1 className="text-xl font-bold text-white tracking-wide">
                            {view === 'list' ? 'Physical Inventory' : `PID ${selectedPID?.PhysicalInventoryDocument}`}
                        </h1>
                                                <p className="text-blue-200 text-[10px] font-medium uppercase tracking-wider mt-0.5">
                                                    {view === 'list' ? 'Inventory Documents' : 'Count Entry'}
                                                </p>
                    </div>

                    <button
                        onClick={() => { setError(null); navigate('/menu', { replace: true }); }}
                        className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
                        title="Home"
                    >
                        <Home size={20} />
                    </button>
                </div>
            </header>

            {/* Inline Error/Success Messages - Always visible below header */}
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


                    {view === 'list' && (
                        <div className="grid grid-cols-1 gap-4">
                            {/* Search bar moved here from header */}
                            <div className="relative mb-2">
                                <Input
                                    placeholder="Search PID / Plant..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="text-center font-medium shadow-sm border-slate-200 focus-within:ring-purple-200"
                                />
                            </div>
                            {loading ? (
                                <div className="text-center py-12">
                                    <Loader className="animate-spin mx-auto text-purple-600 mb-4" size={32} />
                                    <p className="text-slate-400">Loading Documents...</p>
                                </div>
                            ) : filteredPIDs.length === 0 ? (
                                <div className="text-center py-16 text-slate-500 border-2 border-dashed border-slate-200 rounded-xl">
                                    <ClipboardList className="mx-auto mb-4 opacity-30 text-slate-400" size={48} />
                                    <p>No Documents found.</p>
                                </div>
                            ) : (
                                filteredPIDs.map(pid => (
                                    <div
                                        key={pid.PhysicalInventoryDocument}
                                        className="relative bg-white rounded-xl mb-4 shadow-sm border border-slate-200 overflow-hidden cursor-pointer hover:shadow-md transition-all flex items-stretch min-h-[100px]"
                                        onClick={() => handleViewItems(pid)}
                                    >
                                        {/* Left Colored Strip - Purple for PI */}
                                        <div className="w-2 bg-purple-500 flex-shrink-0"></div>

                                        <div className="flex-1 px-4 py-3 flex flex-col justify-center gap-1.5 min-w-0">
                                            {/* Header Row */}
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-lg font-bold text-blue-950 leading-tight">#{pid.PhysicalInventoryDocument}</h3>
                                                <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full border ${pid.PhysInventoryDocStatus === 'B' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                                    {pid.PhysInventoryDocStatus === 'B' ? 'Counted' : 'Not Counted'}
                                                </span>
                                            </div>

                                            {/* Details Grid */}
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-4 text-xs text-slate-500 font-medium">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-[10px] uppercase font-bold text-slate-400">Plant</span>
                                                        <span className="font-mono text-slate-700">{pid.Plant}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-[10px] uppercase font-bold text-slate-400">SLoc</span>
                                                        <span className="font-mono text-slate-700">{pid.StorageLocation || '-'}</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                                    <span className="text-[10px] uppercase font-bold text-slate-400">Plan Date</span>
                                                    <span>
                                                        {pid.PlannedCountDate ? new Date(parseInt(pid.PlannedCountDate.replace(/\/Date\((-?\d+)\)\//, '$1'))).toLocaleDateString() : '-'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {view === 'items' && selectedPID && (
                        <div className="space-y-4 animate-in">


                            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-800">{selectedPID.PhysicalInventoryDocument}</h2>
                                        <p className="text-xs text-slate-500 font-medium mt-1">Fiscal Year: {selectedPID.FiscalYear}</p>
                                    </div>
                                    <div className="text-right">
                                        <div className="flex flex-col items-end gap-1">
                                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded border border-slate-200">
                                                Plant: {selectedPID.Plant}
                                            </span>
                                            <span className="px-2 py-0.5 bg-purple-50 text-purple-700 text-[10px] font-bold rounded border border-purple-100">
                                                SLoc: {selectedPID.StorageLocation}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Items List */}
                            {loading ? (
                                <div className="text-center py-12">
                                    <Loader className="animate-spin mx-auto text-purple-600 mb-4" size={32} />
                                    <p className="text-slate-400">Loading Items...</p>
                                </div>
                            ) : piItems.map(item => (
                                <div key={item.PhysicalInventoryDocumentItem} className={`bg-white rounded-xl shadow border border-slate-200 overflow-hidden ${expandedItem === item.PhysicalInventoryDocumentItem ? 'ring-2 ring-purple-100' : ''}`}>
                                    <div className="p-4 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => handleExpandItem(item)}>
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-start gap-3">
                                                <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center font-mono text-xs font-bold text-purple-600 mt-1">
                                                    {item.PhysicalInventoryDocumentItem}
                                                </div>
                                                <div>
                                                    <h4 className="m-0 text-base font-bold text-slate-800 leading-tight">{item.Material}</h4>
                                                    <p className="m-0 text-xs text-slate-500 mt-1">{item.MaterialDescription || 'No Description'}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="flex  items-baseline justify-end gap-1">
                                                    <span className="text-slate-400 text-[10px] font-bold uppercase mr-1">Book</span>
                                                    <span className="font-bold text-slate-800 text-lg">{parseFloat(item.BookQty || 0).toFixed(2)}</span>
                                                    <span className="text-slate-500 text-xs font-bold">{item.BaseUnit}</span>
                                                </div>
                                                <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${item.IsCounted ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                                                    {item.IsCounted ? 'Counted' : 'Open'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {expandedItem === item.PhysicalInventoryDocumentItem && (
                                        <div className="bg-slate-50 border-t border-slate-200 p-4 animate-in">

                                            {/* Full-width +/- quantity row */}
                                            <label className="text-[10px] font-bold uppercase text-slate-500 mb-2 block">Counted Quantity</label>
                                            <div className="flex items-center gap-3 mb-3">
                                                <button type="button"
                                                    className="w-12 h-12 bg-brand-blue text-white rounded-xl flex items-center justify-center hover:opacity-90 transition-colors disabled:opacity-40 flex-shrink-0"
                                                    onClick={() => { if (isZeroCount) return; const curr = parseFloat(countQty || 0); setCountQty((curr - 1 >= 0 ? curr - 1 : 0).toString()); }}
                                                    disabled={isZeroCount}>
                                                    <span className="text-2xl font-bold mb-0.5">−</span>
                                                </button>
                                                <input
                                                    className={`flex-1 h-12 border rounded-xl text-center text-2xl font-bold focus:ring-2 focus:ring-brand-blue outline-none ${
                                                        isZeroCount ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-white border-slate-200'
                                                    }`}
                                                    value={countQty}
                                                    onChange={(e) => setCountQty(e.target.value)}
                                                    type="number"
                                                    disabled={isZeroCount}
                                                />
                                                <button type="button"
                                                    className="w-12 h-12 bg-brand-blue text-white rounded-xl flex items-center justify-center hover:opacity-90 transition-colors disabled:opacity-40 flex-shrink-0"
                                                    onClick={() => { if (isZeroCount) return; const curr = parseFloat(countQty || 0); setCountQty((curr + 1).toString()); }}
                                                    disabled={isZeroCount}>
                                                    <span className="text-2xl font-bold mb-0.5">+</span>
                                                </button>
                                            </div>

                                            {/* Zero Count checkbox */}
                                            <div className="flex items-center gap-2 mb-4">
                                                <input
                                                    type="checkbox"
                                                    id={`zc-${item.PhysicalInventoryDocumentItem}`}
                                                    checked={isZeroCount}
                                                    onChange={(e) => {
                                                        setIsZeroCount(e.target.checked);
                                                        if (e.target.checked) setCountQty('0');
                                                    }}
                                                    className="w-4 h-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
                                                />
                                                <label htmlFor={`zc-${item.PhysicalInventoryDocumentItem}`} className="text-xs text-slate-600 font-bold uppercase tracking-wide cursor-pointer select-none">
                                                    Zero Count
                                                </label>
                                            </div>

                                            {/* Full-width Post button */}
                                            <button
                                                onClick={() => handlePostCount(item)}
                                                disabled={postingLoading}
                                                className="w-full bg-brand-blue hover:bg-opacity-90 text-white font-bold h-14 rounded-xl shadow-md flex items-center justify-center gap-2 tracking-wide text-[16px] transition-all active:scale-[0.98] disabled:opacity-60"
                                            >
                                                {postingLoading ? <Loader className="animate-spin" size={20} /> : <><Save size={20} /> Post</>}
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

export default PhysicalInventory;
