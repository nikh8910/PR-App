/**
 * @file SystemGuidedPutaway.jsx
 * @description Screen: System Guided Putaway (Warehouse Order based)
 *
 * Reached after operator claims a resource via the ClaimResourceModal in PutawaySearch.
 * Displays all open putaway tasks assigned to the claimed resource/warehouse order,
 * along with a "Go to Task" entry into ConfirmPutaway.
 *
 * ## Flow
 *  1. Receive { resourceId, warehouse, tasks, warehouseOrder } from location.state
 *  2. Show task queue
 *  3. [Go to Task] → ConfirmPutaway for first open task
 *  4. Task queue actions: Skip (reorder locally), Confirm Zero Qty
 *  5. After all tasks done: Drop-off scan destination bin
 *
 * @route /warehouse-inbound/system-guided
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    ArrowLeft, Home, AlertCircle, CheckCircle, Loader, X,
    Package, ChevronRight, SkipForward, Edit2,
    ScanLine, ZapOff, MoreVertical, MapPin
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api, parseSapError, extractSapMessage } from '../../services/api';
import BarcodeScanner from '../../components/BarcodeScanner';
import { useSwipeBack } from '../../hooks/useSwipeBack';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

const StatusBadge = ({ status }) => {
    const isConfirmed = status === 'C';
    return (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${isConfirmed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            {isConfirmed ? 'Confirmed' : 'Open'}
        </span>
    );
};

const SystemGuidedPutaway = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { apiConfig } = useAuth();
    useSwipeBack(() => navigate(-1));

    // Unpack state from ClaimResourceModal navigation
    const {
        resourceId = '',
        warehouse = '',
        warehouseOrder = '',
        tasks: initialTasks = []
    } = location.state || {};

    const [tasks, setTasks] = useState(initialTasks);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');

    // Task context menu
    const [openMenuTaskId, setOpenMenuTaskId] = useState(null);

    // Drop-off scanning (shown when all tasks confirmed)
    const [showDropOff, setShowDropOff] = useState(false);
    const [dropOffBin, setDropOffBin] = useState('');
    const [showDropOffScanner, setShowDropOffScanner] = useState(false);
    const [dropOffConfirmed, setDropOffConfirmed] = useState(false);

    // Open tasks — drive the queue
    const openTasks = tasks.filter(t => t.WarehouseTaskStatus !== 'C');
    const confirmedTasks = tasks.filter(t => t.WarehouseTaskStatus === 'C');
    const allConfirmed = tasks.length > 0 && openTasks.length === 0;

    // Refresh task list from backend
    const refreshTasks = useCallback(async () => {
        if (!warehouse || !warehouseOrder) return;
        setLoading(true);
        try {
            const res = await api.fetchWarehouseTasks(apiConfig, {
                warehouse,
                warehouseOrder,
                statusNe: undefined // fetch all statuses to see confirmed ones
            });
            const allFetched = (res.value || []).filter(t =>
                (t.WarehouseActivityType || '').trim().toUpperCase() !== 'PICK'
            );
            const fresh = allFetched.map(ft => {
                // Preserve local task order / skip flag
                const existing = tasks.find(t => t.WarehouseTask === ft.WarehouseTask && t.WarehouseTaskItem === ft.WarehouseTaskItem);
                return existing ? { ...ft, _skipped: existing._skipped } : ft;
            });
            setTasks(fresh);
        } catch (err) {
            setError(extractSapMessage(err));
        } finally {
            setLoading(false);
        }
    }, [apiConfig, warehouse, warehouseOrder, tasks]);

    // Skip Task — move first open task to end of queue
    const handleSkipTask = (task) => {
        setOpenMenuTaskId(null);
        setTasks(prev => {
            const others = prev.filter(t => !(t.WarehouseTask === task.WarehouseTask && t.WarehouseTaskItem === task.WarehouseTaskItem));
            return [...others, { ...task, _skipped: true }];
        });
    };

    // Confirm Zero Quantity — navigate to ConfirmPutaway with zeroQty flag
    const handleConfirmZero = (task) => {
        setOpenMenuTaskId(null);
        navigate(`/warehouse-inbound/putaway/${warehouse}/${task.WarehouseTask}/${task.WarehouseTaskItem}`, {
            state: { zeroQty: true, fromSystemGuided: true, resourceId, warehouseOrder }
        });
    };

    // Go to Task — first open task
    const handleGoToTask = () => {
        if (openTasks.length === 0) return;
        const firstTask = openTasks[0];
        navigate(`/warehouse-inbound/putaway/${warehouse}/${firstTask.WarehouseTask}/${firstTask.WarehouseTaskItem}`, {
            state: { fromSystemGuided: true, resourceId, warehouseOrder }
        });
    };

    // Drop-off scan
    const handleDropOffScan = (val) => {
        setDropOffBin(val.trim().toUpperCase());
        setShowDropOffScanner(false);
    };

    const handleConfirmDropOff = () => {
        if (!dropOffBin) return;
        setDropOffConfirmed(true);
        setSuccessMsg(`Drop-off at bin ${dropOffBin} confirmed. Order complete.`);
    };

    if (!resourceId && !warehouseOrder) {
        return (
            <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
                <header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                    <div className="flex justify-between items-center relative">
                        <button onClick={() => navigate(-1)} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition"><ArrowLeft size={20} /></button>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <h1 className="text-xl font-bold text-white">System Guided Putaway</h1>
                        </div>
                        <button onClick={() => navigate('/menu', { replace: true })} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition"><Home size={20} /></button>
                    </div>
                </header>
                <div className="flex-1 flex items-center justify-center p-6 text-center text-slate-500">
                    <div>
                        <ZapOff size={48} className="mx-auto mb-4 opacity-30" />
                        <p className="font-medium">No session data found.</p>
                        <p className="text-sm mt-1">Please use the System Guided button on the Putaway screen.</p>
                        <button onClick={() => navigate(-1)} className="mt-4 text-brand-blue text-sm font-bold underline">Go Back</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
            {/* Header */}
            <header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                <div className="flex justify-between items-center relative">
                    <button onClick={() => navigate(-1)} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition"><ArrowLeft size={20} /></button>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <h1 className="text-xl font-bold text-white tracking-wide">System Guided Putaway</h1>
                        <p className="text-blue-200 text-[10px] font-medium uppercase tracking-wider mt-0.5">
                            {warehouseOrder && `WO ${warehouseOrder}`}{resourceId && ` · ${resourceId}`}
                        </p>
                    </div>
                    <button onClick={() => navigate('/menu', { replace: true })} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition"><Home size={20} /></button>
                </div>
            </header>

            {/* Messages */}
            {(error || successMsg) && (
                <div className="px-4 pt-3 z-30 w-full shrink-0 flex flex-col gap-2">
                    {error && (
                        <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-3 shadow-md flex gap-3 items-start">
                            <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                            <p className="text-sm text-red-700 flex-1">{error}</p>
                            <button onClick={() => setError(null)}><X size={14} className="text-red-400" /></button>
                        </div>
                    )}
                    {successMsg && (
                        <div className="bg-emerald-50 border-l-4 border-emerald-500 rounded-lg p-3 shadow-md flex gap-3 items-start">
                            <CheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={18} />
                            <p className="text-sm text-emerald-700 flex-1">{successMsg}</p>
                            <button onClick={() => setSuccessMsg('')}><X size={14} className="text-emerald-400" /></button>
                        </div>
                    )}
                </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 pt-3 pb-32 content-area">
                <div className="max-w-xl mx-auto space-y-4">

                    {/* Session Info Card */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                        <div className="grid grid-cols-3 gap-2 text-center">
                            <div>
                                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Resource</p>
                                <p className="font-bold text-slate-800 font-mono text-sm mt-0.5">{resourceId || '—'}</p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Warehouse</p>
                                <p className="font-bold text-slate-800 font-mono text-sm mt-0.5">{warehouse || '—'}</p>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">WO</p>
                                <p className="font-bold text-slate-800 font-mono text-sm mt-0.5">{warehouseOrder || '—'}</p>
                            </div>
                        </div>
                    </div>

                    {/* Task Queue */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <Package size={16} className="text-brand-blue" />
                                <h3 className="font-bold text-slate-700 text-sm">
                                    Task Queue ({openTasks.length} open{confirmedTasks.length > 0 ? `, ${confirmedTasks.length} done` : ''})
                                </h3>
                            </div>
                            <button
                                onClick={refreshTasks}
                                disabled={loading}
                                className="text-xs text-brand-blue font-bold hover:underline disabled:opacity-50"
                            >
                                {loading ? <Loader size={14} className="animate-spin" /> : 'Refresh'}
                            </button>
                        </div>

                        {tasks.length === 0 ? (
                            <div className="text-center py-8 text-slate-400">
                                <Package size={32} className="mx-auto mb-3 opacity-30" />
                                <p className="text-sm">No putaway tasks found for this order/resource.</p>
                            </div>
                        ) : (
                            <ul className="divide-y divide-slate-100">
                                {[...openTasks, ...confirmedTasks].map((task, idx) => {
                                    const isOpen = task.WarehouseTaskStatus !== 'C';
                                    const isFirst = isOpen && idx === 0;
                                    const menuOpen = openMenuTaskId === `${task.WarehouseTask}-${task.WarehouseTaskItem}`;

                                    return (
                                        <li key={`${task.WarehouseTask}-${task.WarehouseTaskItem}`}
                                            className={`px-4 py-3 relative ${isFirst ? 'bg-blue-50/60' : ''}`}>
                                            <div className="flex items-start justify-between gap-2">
                                                {/* Task Index */}
                                                <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold mt-0.5 ${isOpen ? 'bg-brand-blue text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                                                    {isOpen ? idx + 1 : <CheckCircle size={14} />}
                                                </div>
                                                {/* Task Info */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-bold text-slate-800 text-sm">{task.Product || 'HU Task'}</span>
                                                        <StatusBadge status={task.WarehouseTaskStatus} />
                                                        {task._skipped && (
                                                            <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold uppercase">Skipped</span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                                                        {task.SourceStorageBin || '?'} → {task.DestinationStorageBin || '?'}
                                                        {task.TargetQuantityInBaseUnit && ` · ${parseFloat(task.TargetQuantityInBaseUnit)} ${task.BaseUnit || ''}`}
                                                    </p>
                                                    {task.Batch && <p className="text-[10px] text-amber-600 font-bold mt-0.5">Batch: {task.Batch}</p>}
                                                </div>
                                                {/* Context menu — only for open tasks */}
                                                {isOpen && (
                                                    <div className="relative flex-shrink-0">
                                                        <button
                                                            onClick={() => setOpenMenuTaskId(menuOpen ? null : `${task.WarehouseTask}-${task.WarehouseTaskItem}`)}
                                                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
                                                        >
                                                            <MoreVertical size={16} />
                                                        </button>
                                                        {menuOpen && (
                                                            <div className="absolute right-0 top-8 bg-white border border-slate-200 rounded-xl shadow-lg z-20 w-44 overflow-hidden">
                                                                <button
                                                                    onClick={() => handleSkipTask(task)}
                                                                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition"
                                                                >
                                                                    <SkipForward size={15} className="text-amber-500" />
                                                                    Skip Task
                                                                </button>
                                                                <button
                                                                    onClick={() => handleConfirmZero(task)}
                                                                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition border-t border-slate-100"
                                                                >
                                                                    <Edit2 size={15} className="text-red-500" />
                                                                    Confirm Zero Qty
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    {/* Drop-Off Section — show when all confirmed */}
                    {allConfirmed && !dropOffConfirmed && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <MapPin size={18} className="text-emerald-600" />
                                <h3 className="font-bold text-emerald-800 text-sm">All Tasks Complete — Drop Off</h3>
                            </div>
                            <p className="text-xs text-emerald-700 mb-3">
                                Go to the drop-off location and scan the destination bin to close the order.
                            </p>
                            <Input
                                label="Destination Bin"
                                value={dropOffBin}
                                onChange={e => setDropOffBin(e.target.value.toUpperCase())}
                                placeholder="Scan or enter bin..."
                                className="font-mono uppercase"
                                rightIcon={
                                    <button
                                        onClick={() => setShowDropOffScanner(true)}
                                        className="w-9 h-9 flex items-center justify-center bg-brand-blue text-white rounded-lg"
                                    >
                                        <ScanLine size={18} />
                                    </button>
                                }
                            />
                            <button
                                onClick={handleConfirmDropOff}
                                disabled={!dropOffBin}
                                className="w-full mt-3 bg-brand-blue hover:bg-opacity-90 text-white font-bold h-12 rounded-xl flex items-center justify-center gap-2 text-sm transition disabled:opacity-50"
                            >
                                <CheckCircle size={18} /> Confirm Drop-Off
                            </button>
                        </div>
                    )}

                    {dropOffConfirmed && (
                        <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 text-center">
                            <CheckCircle size={32} className="text-emerald-500 mx-auto mb-2" />
                            <p className="font-bold text-emerald-800">Order Complete</p>
                            <p className="text-xs text-emerald-600 mt-1">Drop-off at {dropOffBin} confirmed.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Go to Task sticky footer — only when there are open tasks */}
            {!allConfirmed && openTasks.length > 0 && (
                <div className="bg-white border-t border-slate-200 px-4 py-3 shrink-0">
                    <button
                        onClick={handleGoToTask}
                        className="w-full bg-brand-blue hover:bg-opacity-90 text-white font-bold h-14 rounded-xl shadow-md flex items-center justify-center gap-2 tracking-wide text-base transition-all active:scale-[0.98]"
                    >
                        Go to Task <ChevronRight size={20} />
                    </button>
                </div>
            )}

            {/* Tap anywhere to close task menus */}
            {openMenuTaskId && (
                <div className="fixed inset-0 z-10" onClick={() => setOpenMenuTaskId(null)} />
            )}

            {/* Drop-off Scanner Modal */}
            {showDropOffScanner && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-4 w-full max-w-sm">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="font-bold text-slate-800">Scan Destination Bin</h3>
                            <button onClick={() => setShowDropOffScanner(false)} className="p-1 rounded-full hover:bg-slate-100"><X size={20} /></button>
                        </div>
                        <BarcodeScanner onScan={handleDropOffScan} />
                    </div>
                </div>
            )}
        </div>
    );
};

export default SystemGuidedPutaway;
