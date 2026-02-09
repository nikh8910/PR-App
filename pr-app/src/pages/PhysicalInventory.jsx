import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
    Search, ClipboardList, ArrowLeft, Home,
    AlertCircle, Loader, CheckCircle, Save
} from 'lucide-react';

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
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleViewItems = async (pid) => {
        setSelectedPID(pid);
        setLoading(true);
        setView('items');
        setPiItems([]); // Clear previous
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
            setError(err.message);
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
                        {view === 'list' ? 'Physical Inventory' : `PID ${selectedPID?.PhysicalInventoryDocument}`}
                    </h1>
                    <p className="text-purple-200 text-sm font-medium uppercase tracking-wider">
                        {view === 'list' ? 'Inventory Documents' : 'Count Entry'}
                    </p>
                </div>

                {/* Sub-Header / Search */}
                {view === 'list' && (
                    <div className="relative mt-4">
                        <input
                            type="text"
                            placeholder="Search PID / Plant..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-white h-12 rounded-lg px-4 text-slate-700 placeholder-slate-400 shadow-lg border-0 focus:ring-2 focus:ring-purple-400 text-center font-medium"
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
                            <div className="flex justify-between items-center mb-0">
                                <button onClick={() => setView('list')} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors flex items-center gap-2">
                                    <ArrowLeft size={20} /> <span className="text-sm font-bold">Back</span>
                                </button>
                            </div>

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
                                <div key={item.PhysicalInventoryDocumentItem} className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden ${expandedItem === item.PhysicalInventoryDocumentItem ? 'ring-2 ring-purple-100' : ''}`}>
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

                                    {/* Expandable Count Form */}
                                    {expandedItem === item.PhysicalInventoryDocumentItem && (
                                        <div className="bg-slate-50 border-t border-slate-200 p-4 animate-in">
                                            <div className="flex items-end gap-3">
                                                <div className="flex-1">
                                                    <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Counted Quantity</label>
                                                    <div className="flex items-center h-10 w-full max-w-[200px] rounded-lg overflow-hidden border border-blue-200 shadow-sm mb-3">
                                                        <button
                                                            type="button"
                                                            style={{ backgroundColor: '#bae6fd', borderRadius: 0 }}
                                                            className="w-12 h-full flex items-center justify-center hover:bg-[#7dd3fc] text-blue-950 transition-colors border-r border-blue-100"
                                                            onClick={() => {
                                                                if (isZeroCount) return;
                                                                const curr = parseFloat(countQty || 0);
                                                                setCountQty((curr - 1 >= 0 ? curr - 1 : 0).toString());
                                                            }}
                                                            disabled={isZeroCount}
                                                        >
                                                            <span className="text-xl font-bold mb-0.5">−</span>
                                                        </button>
                                                        <input
                                                            style={{ borderRadius: 0 }}
                                                            className={`flex-1 w-full h-full text-center font-bold text-lg border-none p-0 focus:ring-0 outline-none ${isZeroCount ? 'bg-slate-100 text-slate-400' : 'bg-white text-blue-950'}`}
                                                            value={countQty}
                                                            onChange={(e) => setCountQty(e.target.value)}
                                                            type="number"
                                                            disabled={isZeroCount}
                                                        />
                                                        <button
                                                            type="button"
                                                            style={{ backgroundColor: '#bae6fd', borderRadius: 0 }}
                                                            className="w-12 h-full flex items-center justify-center hover:bg-[#7dd3fc] text-blue-950 transition-colors border-l border-blue-100"
                                                            onClick={() => {
                                                                if (isZeroCount) return;
                                                                const curr = parseFloat(countQty || 0);
                                                                setCountQty((curr + 1).toString());
                                                            }}
                                                            disabled={isZeroCount}
                                                        >
                                                            <span className="text-xl font-bold mb-0.5">+</span>
                                                        </button>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            id={`zc-${item.PhysicalInventoryDocumentItem}`}
                                                            checked={isZeroCount}
                                                            onChange={(e) => {
                                                                setIsZeroCount(e.target.checked);
                                                                if (e.target.checked) setCountQty('0');
                                                            }}
                                                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                        />
                                                        <label htmlFor={`zc-${item.PhysicalInventoryDocumentItem}`} className="text-xs text-slate-600 font-bold cursor-pointer select-none">
                                                            Zero Count
                                                        </label>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handlePostCount(item)}
                                                    className="btn-primary bg-purple-600 hover:bg-purple-700 h-[46px] px-6 shadow-sm mb-[2px]"
                                                    disabled={postingLoading}
                                                >
                                                    {postingLoading ? <Loader className="animate-spin" size={18} /> : <div className="flex items-center gap-2"><Save size={18} /> Post</div>}
                                                </button>
                                            </div>
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
