/**
 * @file SystemGuidedPicking.jsx
 * @description Screen: System Guided Picking (Warehouse Order based)
 *
 * Reached after operator claims a resource via the ClaimResourceModal in PickingSearch.
 * Displays all open PICK tasks assigned to the claimed resource/warehouse order,
 * along with Pick-HU management and a "Go to Task" entry into ConfirmPicking.
 *
 * ## Flow
 *  1. Receive { resourceId, warehouse, tasks, warehouseOrder } from location.state
 *  2. Show Pick-HUs (add/delete) + task queue
 *  3. [Go to Task] → ConfirmPicking for first open task
 *  4. Task queue actions: Skip (reorder locally), Confirm Zero Qty
 *  5. After all tasks done: Drop-off scan destination bin
 *
 * @route /warehouse-outbound/system-guided
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    ArrowLeft, Home, AlertCircle, CheckCircle, Loader, X,
    Package, ChevronRight, SkipForward, Edit2, Trash2, Plus,
    ScanLine, ZapOff, Box, MoreVertical, MapPin
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

const SystemGuidedPicking = () => {
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
    const [pickHUs, setPickHUs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');

    // Task context menu
    const [openMenuTaskId, setOpenMenuTaskId] = useState(null);

    // Add Pick-HU modal
    const [showAddHUModal, setShowAddHUModal] = useState(false);
    const [packagingMaterials, setPackagingMaterials] = useState([]);
    const [selectedPkgMaterial, setSelectedPkgMaterial] = useState('');
    const [huInputMode, setHuInputMode] = useState('generate'); // 'generate' | 'scan'
    const [huScanValue, setHuScanValue] = useState('');
    const [showHUScanner, setShowHUScanner] = useState(false);
    const [huModalLoading, setHuModalLoading] = useState(false);

    // Drop-off scanning (shown when all tasks confirmed)
    const [showDropOff, setShowDropOff] = useState(false);
    const [dropOffBin, setDropOffBin] = useState('');
    const [showDropOffScanner, setShowDropOffScanner] = useState(false);
    const [dropOffConfirmed, setDropOffConfirmed] = useState(false);

    // Open tasks — drive the queue
    const openTasks = tasks.filter(t => t.WarehouseTaskStatus !== 'C');
    const confirmedTasks = tasks.filter(t => t.WarehouseTaskStatus === 'C');
    const allConfirmed = tasks.length > 0 && openTasks.length === 0;

    // Load Pick-HUs on mount
    const loadPickHUs = useCallback(async () => {
        if (!warehouse || !warehouseOrder) return;
        try {
            const res = await api.fetchPickHUs(apiConfig, warehouse, warehouseOrder);
            setPickHUs(res.value || []);
        } catch (err) {
            console.warn('Failed to load Pick-HUs:', err.message);
        }
    }, [apiConfig, warehouse, warehouseOrder]);

    useEffect(() => {
        loadPickHUs();
    }, [loadPickHUs]);

    // Refresh task list from backend
    const refreshTasks = useCallback(async () => {
        if (!warehouse || !warehouseOrder) return;
        setLoading(true);
        try {
            const res = await api.fetchWarehouseTasks(apiConfig, {
                warehouse,
                warehouseOrder,
                activityType: 'PICK'
            });
            const fresh = (res.value || []).map(ft => {
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

    // Confirm Zero Quantity — navigate to ConfirmPicking with zeroQty flag
    const handleConfirmZero = (task) => {
        setOpenMenuTaskId(null);
        navigate(`/warehouse-outbound/picking/${warehouse}/${task.WarehouseTask}/${task.WarehouseTaskItem}`, {
            state: { zeroQty: true, fromSystemGuided: true, resourceId, warehouseOrder }
        });
    };

    // Go to Task — first open task
    const handleGoToTask = () => {
        if (openTasks.length === 0) return;
        const firstTask = openTasks[0];
        navigate(`/warehouse-outbound/picking/${warehouse}/${firstTask.WarehouseTask}/${firstTask.WarehouseTaskItem}`, {
            state: { fromSystemGuided: true, resourceId, warehouseOrder }
        });
    };

    // Delete Pick-HU
    const handleDeleteHU = async (hu) => {
        setError(null);
        try {
            await api.unassignPickHU(apiConfig, warehouse, warehouseOrder, hu.HandlingUnitExternalID);
            setSuccessMsg(`Pick-HU ${hu.HandlingUnitExternalID} removed.`);
            setTimeout(() => setSuccessMsg(''), 3000);
            loadPickHUs();
        } catch (err) {
            setError(parseSapError(err.status, err.message) || `Cannot remove HU: ${err.message}`);
        }
    };

    // Open Add-HU modal — load packaging materials
    const handleOpenAddHU = async () => {
        setShowAddHUModal(true);
        setHuModalLoading(true);
        setSelectedPkgMaterial('');
        setHuInputMode('generate');
        setHuScanValue('');
        try {
            const mats = await api.fetchPackagingMaterials(apiConfig);
            setPackagingMaterials(mats);
        } catch (err) {
            console.warn('Could not load packaging materials:', err.message);
            setPackagingMaterials([]);
        } finally {
            setHuModalLoading(false);
        }
    };

    // Submit Add-HU
    const handleAddHU = async () => {
        const huId = huInputMode === 'scan' ? huScanValue.trim().toUpperCase() : '';
        setHuModalLoading(true);
        setError(null);
        try {
            await api.assignPickHU(apiConfig, warehouse, warehouseOrder, huId || undefined);
            setShowAddHUModal(false);
            setSuccessMsg('Pick-HU added successfully.');
            setTimeout(() => setSuccessMsg(''), 3000);
            loadPickHUs();
        } catch (err) {
            setError(`Failed to add Pick-HU: ${err.message}`);
        } finally {
            setHuModalLoading(false);
        }
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
                            <h1 className="text-xl font-bold text-white">System Guided Picking</h1>
                        </div>
                        <button onClick={() => navigate('/menu', { replace: true })} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition"><Home size={20} /></button>
                    </div>
                </header>
                <div className="flex-1 flex items-center justify-center p-6 text-center text-slate-500">
                    <div>
                        <ZapOff size={48} className="mx-auto mb-4 opacity-30" />
                        <p className="font-medium">No session data found.</p>
                        <p className="text-sm mt-1">Please use the System Guided button on the Picking screen.</p>
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
                        <h1 className="text-xl font-bold text-white tracking-wide">System Guided Pick</h1>
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

                    {/* Pick-HU Panel */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <Box size={16} className="text-orange-500" />
                                <h3 className="font-bold text-slate-700 text-sm">Pick-HUs ({pickHUs.length})</h3>
                            </div>
                            <button
                                onClick={handleOpenAddHU}
                                className="w-8 h-8 bg-brand-blue text-white rounded-lg flex items-center justify-center hover:opacity-90 transition"
                                title="Add Pick-HU"
                            >
                                <Plus size={16} />
                            </button>
                        </div>
                        {pickHUs.length === 0 ? (
                            <p className="text-center text-xs text-slate-400 italic py-4">No Pick-HUs assigned. Tap + to add one.</p>
                        ) : (
                            <ul className="divide-y divide-slate-100">
                                {pickHUs.map((hu, i) => (
                                    <li key={i} className="flex items-center justify-between px-4 py-3">
                                        <span className="font-mono text-sm font-medium text-slate-700">{hu.HandlingUnitExternalID}</span>
                                        <button
                                            onClick={() => handleDeleteHU(hu)}
                                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                            title="Remove HU"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
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
                                <p className="text-sm">No PICK tasks found for this order/resource.</p>
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
                                className="w-full mt-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12 rounded-xl flex items-center justify-center gap-2 text-sm transition disabled:opacity-50"
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

            {/* Add Pick-HU Modal */}
            {showAddHUModal && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm flex flex-col max-h-[80vh] overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
                            <h3 className="font-bold text-slate-800">Add Pick-HU</h3>
                            <button onClick={() => setShowAddHUModal(false)} className="p-1 rounded-full hover:bg-slate-100"><X size={20} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                            {huModalLoading && packagingMaterials.length === 0 ? (
                                <div className="text-center py-4"><Loader className="animate-spin mx-auto text-brand-blue" size={24} /></div>
                            ) : (
                                <>
                                    {packagingMaterials.length > 0 && (
                                        <div>
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Packaging Material</label>
                                            <select
                                                value={selectedPkgMaterial}
                                                onChange={e => setSelectedPkgMaterial(e.target.value)}
                                                className="w-full border border-slate-200 rounded-lg p-2.5 text-sm text-slate-700 focus:ring-2 focus:ring-brand-blue outline-none bg-white"
                                            >
                                                <option value="">— Select material —</option>
                                                {packagingMaterials.map(m => (
                                                    <option key={m.Product} value={m.Product}>{m.Product}{m.ProductDescription ? ` — ${m.ProductDescription}` : ''}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">HU Number</label>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setHuInputMode('generate')}
                                                className={`flex-1 py-2 rounded-lg text-sm font-bold border transition ${huInputMode === 'generate' ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                                            >
                                                Generate
                                            </button>
                                            <button
                                                onClick={() => setHuInputMode('scan')}
                                                className={`flex-1 py-2 rounded-lg text-sm font-bold border transition ${huInputMode === 'scan' ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                                            >
                                                Scan / Enter
                                            </button>
                                        </div>
                                    </div>

                                    {huInputMode === 'scan' && (
                                        <Input
                                            label="HU Number"
                                            value={huScanValue}
                                            onChange={e => setHuScanValue(e.target.value.toUpperCase())}
                                            placeholder="Scan or type HU..."
                                            className="font-mono uppercase"
                                            rightIcon={
                                                <button
                                                    onClick={() => setShowHUScanner(true)}
                                                    className="w-9 h-9 flex items-center justify-center bg-brand-blue text-white rounded-lg"
                                                >
                                                    <ScanLine size={18} />
                                                </button>
                                            }
                                        />
                                    )}

                                    {huInputMode === 'generate' && (
                                        <p className="text-xs text-slate-400 text-center">SAP will generate a Pick-HU number within the configured number range.</p>
                                    )}
                                </>
                            )}
                        </div>
                        <div className="px-5 pb-5 pt-3 border-t border-slate-100 flex gap-3 flex-shrink-0">
                            <button
                                onClick={() => setShowAddHUModal(false)}
                                className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddHU}
                                disabled={huModalLoading || (huInputMode === 'scan' && !huScanValue.trim())}
                                className="flex-1 py-3 bg-brand-blue text-white rounded-xl font-bold text-sm hover:bg-opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                            >
                                {huModalLoading ? <Loader size={16} className="animate-spin" /> : <><Plus size={16} /> Add Pick-HU</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* HU Scanner Modal */}
            {showHUScanner && (
                <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-4 w-full max-w-sm">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="font-bold text-slate-800">Scan Pick-HU</h3>
                            <button onClick={() => setShowHUScanner(false)} className="p-1 rounded-full hover:bg-slate-100"><X size={20} /></button>
                        </div>
                        <BarcodeScanner onScan={(val) => { setHuScanValue(val.trim().toUpperCase()); setShowHUScanner(false); }} />
                    </div>
                </div>
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

export default SystemGuidedPicking;
