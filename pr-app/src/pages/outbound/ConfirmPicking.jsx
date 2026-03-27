/**
 * @file ConfirmPicking.jsx
 * @description Screen: Confirm Picking Task (Outbound Warehouse Process)
 *
 * Guides the operator through a scan-confirmation gate, then submits the pick.
 *
 * ## Scan Gate (SAP canonical flow)
 *  Step 1 — Scan source bin or source HU barcode.
 *           Green feedback on match with planned values; red on mismatch.
 *           "Skip" moves to step 2 without validation.
 *  Step 2 — Scan item (product) barcode.
 *           Matched against task Product; GTIN lookup used for EAN codes.
 *           "Skip" unlocks the confirm form directly.
 *
 * ## Confirmation Modes
 *  - Exact: source bin + qty match the plan → POST { DirectWhseTaskConfIsAllowed: true }
 *  - Partial/Exception: anything changed → POST with actuals + exception code
 *
 * @route /warehouse-outbound/picking/:warehouse/:taskId/:taskItem
 */
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
    Minus, Plus, ScanLine, X, List, ChevronRight, Box, Keyboard
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import BarcodeScanner from '../../components/BarcodeScanner';
import { useSwipeBack } from '../../hooks/useSwipeBack';
import { useProductDescription } from '../../hooks/useProductDescription';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

// ──────────────────────────────────────────────────────────────
//  Small scan-step card component
// ──────────────────────────────────────────────────────────────
const ScanStep = ({
    stepNum, total, title, subtitle, hint,
    scanResult, // null | { ok: bool, msg: string }
    onOpenScanner,
    onManualEntry,
    scannerLabel
}) => {
    const bg = scanResult
        ? (scanResult.ok ? 'bg-emerald-50 border-emerald-300' : 'bg-red-50 border-red-300')
        : 'bg-white border-slate-200';

    return (
        <div className={`rounded-2xl border shadow-sm overflow-hidden ${bg} transition-all`}>
            {/* Step header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100/70">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 ${scanResult?.ok ? 'bg-emerald-500 text-white' : 'bg-brand-blue text-white'}`}>
                    {scanResult?.ok ? <CheckCircle size={14} /> : stepNum}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 text-sm">{title}</p>
                    {subtitle && <p className="text-xs text-slate-500 truncate mt-0.5">{subtitle}</p>}
                </div>
                <span className="text-[10px] text-slate-400">{stepNum}/{total}</span>
            </div>

            {/* Scan feedback */}
            {scanResult && (
                <div className={`flex items-center gap-2 px-4 py-2 text-sm font-bold ${scanResult.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                    {scanResult.ok ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                    {scanResult.msg}
                </div>
            )}

            {/* Pending hint */}
            {!scanResult && hint && (
                <p className="px-4 py-2 text-xs text-slate-500">{hint}</p>
            )}

            {/* Actions */}
            {!scanResult?.ok && (
                <div className="flex gap-2 px-4 pb-4 pt-2">
                    <button
                        onClick={onOpenScanner}
                        className="flex-1 bg-brand-blue text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 text-sm hover:bg-opacity-90 transition active:scale-[0.98]"
                    >
                        <ScanLine size={18} /> {scannerLabel || 'Scan'}
                    </button>
                    <button
                        onClick={onManualEntry}
                        className="px-4 py-3 text-slate-500 font-bold text-sm bg-slate-100 rounded-xl hover:bg-slate-200 transition flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                        <Keyboard size={16} /> Type manually
                    </button>
                </div>
            )}
        </div>
    );
};

// ──────────────────────────────────────────────────────────────
//  Main component
// ──────────────────────────────────────────────────────────────
const ConfirmPicking = () => {
    const { warehouse, taskId, taskItem } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { apiConfig } = useAuth();
    const { getDescription } = useProductDescription();

    // Optional flags from SystemGuidedPicking
    const { fromSystemGuided, resourceId, warehouseOrder, zeroQty } = location.state || {};

    const [task, setTask] = useState(null);
    const [loading, setLoading] = useState(true);
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');

    // ── Scan Gate state ──────────────────────────
    // scanPhase: 'bin' | 'item' | 'confirm'
    const [scanPhase, setScanPhase] = useState('bin');
    const [binScanResult, setBinScanResult] = useState(null);  // { ok, msg }
    const [itemScanResult, setItemScanResult] = useState(null);
    const [activeScanTarget, setActiveScanTarget] = useState(null); // 'bin' | 'item' | 'hu'
    const [scannerOpen, setScannerOpen] = useState(false);

    // Manual entry modal state
    const [manualEntryOpen, setManualEntryOpen] = useState(false);
    const [manualEntryValue, setManualEntryValue] = useState('');

    // ── Confirm form state ───────────────────────
    const [actualQty, setActualQty] = useState('');
    const [sourceBin, setSourceBin] = useState('');
    const [sourceType, setSourceType] = useState('');
    const [pickHU, setPickHU] = useState('');
    const [exceptionCode, setExceptionCode] = useState('');

    // Batch & Serial
    const [batchValue, setBatchValue] = useState('');
    const [serialNumbers, setSerialNumbers] = useState([]); // array of strings

    // Value Help
    const [showTypeHelp, setShowTypeHelp] = useState(false);
    const [showHUHelp, setShowHUHelp] = useState(false);
    const [availableTypes, setAvailableTypes] = useState([]);
    const [availableHUs, setAvailableHUs] = useState([]);
    const [helpLoading, setHelpLoading] = useState(false);

    useSwipeBack(() => navigate(-1));

    // ── Extract SAP error message ────────────────
    const parseSapError = (rawMsg) => {
        if (!rawMsg) return 'Unknown error';
        try {
            const jsonStart = rawMsg.indexOf('{');
            if (jsonStart !== -1) {
                const parsed = JSON.parse(rawMsg.slice(jsonStart));
                const msg =
                    parsed?.error?.message?.value ||
                    parsed?.error?.message ||
                    parsed?.message?.value ||
                    parsed?.message;
                if (msg && typeof msg === 'string') {
                    return rawMsg.slice(0, jsonStart).trim() + (rawMsg.slice(0, jsonStart).trim() ? ' — ' : '') + msg;
                }
            }
        } catch (_) { }
        return rawMsg.length > 200 ? rawMsg.slice(0, 200) + '…' : rawMsg;
    };

    // ── Load task ────────────────────────────────
    useEffect(() => {
        const fetchTask = async (headers, url) => {
            const res = await fetch(url, { headers });
            if (!res.ok) {
                const errText = await res.text();
                throw new Error('Failed to load Task Details. ' + errText);
            }
            return res.json();
        };

        const loadTask = async () => {
            setLoading(true);
            setError(null);
            try {
                const headers = api?.getHeaders ? api.getHeaders(apiConfig) : {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    ...(apiConfig.apiKey
                        ? { 'APIKey': apiConfig.apiKey }
                        : { 'Authorization': 'Basic ' + window.btoa(apiConfig.username + ':' + apiConfig.password) })
                };

                const baseUrlObj = new URL(apiConfig.baseUrl.replace(/\/PurchaseReqn\/?$/, '').replace(/\/+$/, ''));
                const root = baseUrlObj.origin;
                let url = `${root}/sap/opu/odata4/sap/api_warehouse_order_task_2/srvd_a2x/sap/warehouseorder/0001/WarehouseTask(EWMWarehouse='${warehouse}',WarehouseTask='${taskId}',WarehouseTaskItem='${taskItem}')`;

                if (import.meta.env.DEV) {
                    if (url.includes('api.s4hana.cloud.sap')) {
                        url = url.replace(/https:\/\/my\d+-api\.s4hana\.cloud\.sap(:443)?/g, '');
                    } else if (url.includes('sandbox.api.sap.com')) {
                        url = url.replace('https://sandbox.api.sap.com', '/s4hanacloud');
                    }
                }

                let t;
                try {
                    t = await fetchTask(headers, url);
                } catch (firstErr) {
                    console.warn('Task load failed, retrying in 1s...', firstErr.message);
                    await new Promise(r => setTimeout(r, 1000));
                    t = await fetchTask(headers, url);
                }

                setTask(t);
                setActualQty(zeroQty ? '0' : (t.TargetQuantityInBaseUnit?.toString() || '0'));
                setSourceBin(t.SourceStorageBin || '');
                setSourceType(t.SourceStorageType || '');
                // Init batch from task
                if (t.Batch && t.Batch.trim() && t.Batch.trim().toUpperCase() !== 'NO BATCH' && t.Batch.trim().toUpperCase() !== 'INITIAL') {
                    setBatchValue(t.Batch.trim());
                }
            } catch (err) {
                setError(parseSapError(err.message));
            } finally {
                setLoading(false);
            }
        };
        loadTask();
    }, [warehouse, taskId, taskItem]);

    // ── Scan Gate handlers ───────────────────────

    const handleOpenScanner = (target) => {
        setActiveScanTarget(target);
        setScannerOpen(true);
    };

    const handleOpenManualEntry = (target) => {
        setActiveScanTarget(target);
        setManualEntryValue('');
        setManualEntryOpen(true);
    };

    const handleManualEntrySubmit = (e) => {
        e.preventDefault();
        if (manualEntryValue.trim()) {
            setManualEntryOpen(false);
            handleConfirmScan(manualEntryValue.trim());
        }
    };

    const normalize = (str) => (str || '').trim().toUpperCase();

    const handleScan = async (scanned) => {
        setScannerOpen(false);
        const val = normalize(scanned);

        if (activeScanTarget === 'bin') {
            const plannedBin = normalize(task?.SourceStorageBin);
            const plannedHU = normalize(task?.SourceHandlingUnit);
            const matched = (plannedBin && val === plannedBin) || (plannedHU && val === plannedHU);
            if (matched) {
                setBinScanResult({ ok: true, msg: `Matched: ${val}` });
                if (plannedBin && val === plannedBin) setSourceBin(val);
                // Auto-advance to item step after brief feedback
                setTimeout(() => setScanPhase('item'), 500);
            } else {
                setBinScanResult({ ok: false, msg: `"${val}" does not match source bin "${plannedBin || '—'}" or source HU "${plannedHU || '—'}"` });
            }
        } else if (activeScanTarget === 'item') {
            const plannedProduct = normalize(task?.Product);
            // Direct match
            if (val === plannedProduct) {
                setItemScanResult({ ok: true, msg: `Product matched: ${val}` });
                setTimeout(() => setScanPhase('confirm'), 500);
                return;
            }
            // Try GTIN lookup
            try {
                const gtinResult = await api.fetchProductByGTIN(apiConfig, val);
                if (gtinResult && normalize(gtinResult.Product) === plannedProduct) {
                    setItemScanResult({ ok: true, msg: `Product matched via GTIN: ${plannedProduct}` });
                    setTimeout(() => setScanPhase('confirm'), 500);
                } else {
                    setItemScanResult({
                        ok: false,
                        msg: `"${val}" does not match product "${plannedProduct}"${gtinResult ? ` (resolved to ${normalize(gtinResult.Product)})` : ''}`
                    });
                }
            } catch (e) {
                // GTIN lookup failed — treat as mismatch
                setItemScanResult({ ok: false, msg: `"${val}" does not match product "${plannedProduct}"` });
            }
        } else if (activeScanTarget === 'hu') {
            // HU scan in confirm form
            setPickHU(val);
        } else if (activeScanTarget === 'batch') {
            // Batch scan
            setBatchValue(val);
        } else if (typeof activeScanTarget === 'string' && activeScanTarget.startsWith('serial_')) {
            // Serial number scan — target is 'serial_0', 'serial_1', etc.
            const idx = parseInt(activeScanTarget.split('_')[1], 10);
            if (!isNaN(idx)) {
                setSerialNumbers(prev => {
                    const updated = [...prev];
                    updated[idx] = val;
                    return updated;
                });
            }
        }
    };

    const handleSkipBin = () => {
        setBinScanResult({ ok: true, msg: 'Skipped — not verified' });
        setTimeout(() => setScanPhase('item'), 200);
    };

    const handleSkipItem = () => {
        setItemScanResult({ ok: true, msg: 'Skipped — not verified' });
        setTimeout(() => setScanPhase('confirm'), 200);
    };

    // ── Confirm submit ───────────────────────────
    const handleConfirmSubmit = (e) => {
        e?.preventDefault();
        setError(null);

        const userBin = sourceBin.trim().toUpperCase();
        const plannedSrcBin = task.SourceStorageBin ? task.SourceStorageBin.trim().toUpperCase() : '';
        const standardQty = parseFloat(task.TargetQuantityInBaseUnit || 0);
        const userQty = parseFloat(actualQty);

        if ((plannedSrcBin && userBin !== plannedSrcBin && !exceptionCode) ||
            (standardQty && userQty !== standardQty && !exceptionCode)) {
            setError('Exception Code is required since Source Bin or Quantity differs from planned.');
            return;
        }
        executeConfirmation();
    };

    // helper: is task batch-managed?
    const hasBatch = task && task.Batch && task.Batch.trim() !== '' && task.Batch.trim().toUpperCase() !== 'NO BATCH' && task.Batch.trim().toUpperCase() !== 'INITIAL';
    // helper: is task serialized?
    const isSerialized = task && (task.SerialNumberProfile || task.EWMSerialNumberProfile || '').trim() !== '';

    // Sync serial number array length with actualQty
    useEffect(() => {
        if (!isSerialized) return;
        const count = Math.max(0, Math.floor(parseFloat(actualQty || 0)));
        setSerialNumbers(prev => {
            if (prev.length === count) return prev;
            if (prev.length < count) return [...prev, ...Array(count - prev.length).fill('')];
            return prev.slice(0, count);
        });
    }, [actualQty, isSerialized]);

    const executeConfirmation = async () => {
        setConfirming(true);
        setError(null);
        try {
            // Validate serial numbers if serialized
            if (isSerialized && serialNumbers.length > 0) {
                const filled = serialNumbers.filter(s => s.trim() !== '');
                if (filled.length !== serialNumbers.length) {
                    setError(`Please enter all ${serialNumbers.length} serial number(s).`);
                    setConfirming(false);
                    return;
                }
                // Check for duplicates
                const unique = new Set(filled.map(s => s.trim().toUpperCase()));
                if (unique.size !== filled.length) {
                    setError('Duplicate serial numbers detected. Each serial number must be unique.');
                    setConfirming(false);
                    return;
                }
            }

            const isExact = !exceptionCode &&
                sourceBin.trim().toUpperCase() === (task.SourceStorageBin || '').trim().toUpperCase() &&
                parseFloat(actualQty) === parseFloat(task.TargetQuantityInBaseUnit || 0);

            let payload;
            if (isExact) {
                payload = { DirectWhseTaskConfIsAllowed: true };
            } else {
                payload = {
                    ActualQuantityInAltvUnit: parseFloat(actualQty),
                    AlternativeUnit: task.BaseUnit,
                    DestinationStorageBin: (task.DestinationStorageBin || '').trim().toUpperCase(),
                    DirectWhseTaskConfIsAllowed: true
                };
                if (exceptionCode) payload.WhseTaskExCodeSrcStorageBin = exceptionCode;
            }

            // Include batch in payload if changed
            if (hasBatch && batchValue.trim()) {
                payload.Batch = batchValue.trim().toUpperCase();
            }

            // Use serial-aware confirm if serial numbers exist
            const cleanSerials = isSerialized ? serialNumbers.filter(s => s.trim() !== '').map(s => s.trim()) : [];
            if (cleanSerials.length > 0) {
                await api.confirmWarehouseTaskWithSerials(apiConfig, warehouse, taskId, taskItem, payload, isExact, cleanSerials);
            } else {
                await api.confirmWarehouseTask(apiConfig, warehouse, taskId, taskItem, payload, isExact);
            }

            setSuccessMsg(`Task ${taskId} confirmed successfully!`);

            const backState = fromSystemGuided
                ? { successMsg: `Task ${taskId} confirmed.` }
                : { successMsg: `Task ${taskId} confirmed successfully!`, confirmedTaskId: taskId };
            const backRoute = fromSystemGuided
                ? '/warehouse-outbound/system-guided'
                : '/warehouse-outbound/picking';
            const backNavState = fromSystemGuided
                ? { resourceId, warehouseOrder, warehouse }
                : backState;

            setTimeout(() => {
                navigate(backRoute, {
                    state: fromSystemGuided ? { ...backNavState, ...backState } : backState
                });
            }, 1800);
        } catch (err) {
            setError(parseSapError('Confirmation failed: ' + err.message));
            setExceptionCode('');
        } finally {
            setConfirming(false);
        }
    };

    const isExceptionRequired = task && (
        (task.SourceStorageBin && sourceBin.trim().toUpperCase() !== task.SourceStorageBin.trim().toUpperCase()) ||
        (task.TargetQuantityInBaseUnit && parseFloat(actualQty || 0) !== parseFloat(task.TargetQuantityInBaseUnit || 0))
    );

    // ── Loading / error states ───────────────────
    if (loading) {
        return (
            <div className="flex flex-col h-screen bg-gray-50 font-sans items-center justify-center">
                <Loader className="animate-spin text-brand-blue mb-4" size={48} />
                <p className="text-gray-500">Loading Task Details...</p>
            </div>
        );
    }

    if (!task) {
        return (
            <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
                <header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                    <div className="flex justify-between items-center relative">
                        <button onClick={() => navigate(-1)} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white">
                            <ArrowLeft size={20} />
                        </button>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <h1 className="text-xl font-bold text-white">Error</h1>
                        </div>
                        <button onClick={() => navigate('/menu', { replace: true })} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white">
                            <Home size={20} />
                        </button>
                    </div>
                </header>
                <div className="p-6 text-center text-red-500 mt-10">
                    <AlertCircle size={48} className="mx-auto mb-4 opacity-50" />
                    <p className="text-sm text-red-700 max-w-xs mx-auto">{error || 'No task found matching this ID.'}</p>
                </div>
            </div>
        );
    }

    const isConfirmPhase = scanPhase === 'confirm';

    return (
        <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
            {/* Header */}
            <header className="app-header-straight pb-8 px-6 shadow-lg flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)' }}>
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="w-10 h-10 p-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" title="Back">
                        <ArrowLeft size={22} className="text-white" />
                    </button>
                    <div className="flex flex-col flex-1 min-w-0">
                        <h1 className="text-xl font-bold text-white tracking-wide truncate">Confirm Picking</h1>
                        <p className="text-blue-200 text-xs font-medium tracking-wider mt-0.5 truncate">
                            WT: {taskId} · Item {parseInt(taskItem, 10) || taskItem}
                            {fromSystemGuided && resourceId && ` · ${resourceId}`}
                        </p>
                    </div>
                    <button onClick={() => navigate('/menu', { replace: true })} className="w-10 h-10 p-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" title="Home">
                        <Home size={22} className="text-white" />
                    </button>
                </div>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 content-area pb-8">
                <div className="max-w-md mx-auto flex flex-col gap-3">

                    {/* Messages */}
                    {error && (
                        <div className="flex items-center gap-2 bg-red-50 text-red-700 p-3 rounded-lg border border-red-200">
                            <AlertCircle size={16} />
                            <span className="text-sm flex-1">{error}</span>
                            <button onClick={() => setError(null)}><X size={14} /></button>
                        </div>
                    )}
                    {successMsg && (
                        <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 p-3 rounded-lg border border-emerald-200">
                            <CheckCircle size={16} />
                            <span className="text-sm font-bold">{successMsg}</span>
                        </div>
                    )}

                    {/* Task Info Card */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Material</p>
                                <p className="text-lg font-bold text-slate-800">
                                    {task.Product || 'N/A'}
                                </p>
                                {getDescription(task.Product) && (
                                    <p className="text-xs text-slate-400 mt-0.5">{getDescription(task.Product)}</p>
                                )}
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Planned Qty</p>
                                <p className="text-lg font-bold text-slate-800">{task.TargetQuantityInBaseUnit} {task.BaseUnit}</p>
                            </div>
                        </div>
                        {/* Source → Destination */}
                        <div className="flex items-center gap-2 bg-slate-50 rounded-xl p-3">
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Source Bin</p>
                                <p className="font-extrabold text-slate-800 font-mono text-base truncate">{task.SourceStorageBin || '—'}</p>
                                {task.SourceHandlingUnit && (
                                    <p className="text-xs text-slate-500 mt-0.5 font-mono">{task.SourceHandlingUnit}</p>
                                )}
                            </div>
                            <ChevronRight size={20} className="text-slate-300 shrink-0" />
                            <div className="flex-1 min-w-0 text-right">
                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Drop-off Bin</p>
                                <p className="font-extrabold text-blue-700 font-mono text-base truncate">{task.DestinationStorageBin || '—'}</p>
                            </div>
                        </div>
                        {(task.Batch || task.SourceHandlingUnit) && (
                            <div className="flex gap-3 mt-2 text-xs text-slate-500">
                                {task.Batch && <span>Batch: <span className="font-bold text-amber-600">{task.Batch}</span></span>}
                            </div>
                        )}
                    </div>

                    {/* ── SCAN GATE ─────────────────────────── */}
                    {/* Step 1: Scan Source Bin / HU */}
                    {(scanPhase === 'bin' || scanPhase === 'item' || binScanResult) && (
                        <ScanStep
                            stepNum={1}
                            total={2}
                            title="Scan Source Bin or Source HU"
                            subtitle={
                                task.SourceHandlingUnit
                                    ? `Bin: ${task.SourceStorageBin || '—'} · HU: ${task.SourceHandlingUnit}`
                                    : `Bin: ${task.SourceStorageBin || '—'}`
                            }
                            hint="Scan the barcode on the source bin label or source handling unit."
                            scanResult={binScanResult}
                            onOpenScanner={() => handleOpenScanner('bin')}
                            onManualEntry={() => handleOpenManualEntry('bin')}
                            scannerLabel="Scan Bin / HU"
                        />
                    )}

                    {/* Step 2: Scan Item */}
                    {(scanPhase === 'item' || scanPhase === 'confirm' || itemScanResult) && (
                        <ScanStep
                            stepNum={2}
                            total={2}
                            title="Scan Item Barcode"
                            subtitle={`Product: ${task.Product || '—'}`}
                            hint="Scan the EAN / product barcode on the item or packaging."
                            scanResult={itemScanResult}
                            onOpenScanner={() => handleOpenScanner('item')}
                            onManualEntry={() => handleOpenManualEntry('item')}
                            scannerLabel="Scan Item"
                        />
                    )}

                    {/* ── CONFIRM FORM (unlocked after scan gate) ─── */}
                    {isConfirmPhase && (
                        <>
                            {/* Confirm Source */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Confirm Source</h3>

                                {/* Source Bin */}
                                <div className="mb-4">
                                    <Input
                                        label="Source Bin *"
                                        value={sourceBin}
                                        onChange={e => setSourceBin(e.target.value)}
                                    />
                                </div>

                                {/* Source Type */}
                                <div className="mb-4 relative search-help-dropdown-container">
                                    <Input
                                        label="Source Storage Type"
                                        value={sourceType}
                                        onChange={e => setSourceType(e.target.value)}
                                        rightIcon={
                                            <button type="button" onClick={async () => {
                                                setShowTypeHelp(p => !p);
                                                if (!availableTypes.length) {
                                                    setHelpLoading(true);
                                                    try {
                                                        const res = await api.fetchStorageTypes(apiConfig, warehouse);
                                                        setAvailableTypes(res.value || []);
                                                    } catch (_) { setAvailableTypes([]); }
                                                    finally { setHelpLoading(false); }
                                                }
                                            }} className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-brand-blue hover:bg-blue-50 bg-slate-100 rounded-lg transition-colors">
                                                <List size={20} />
                                            </button>
                                        }
                                    />
                                    {showTypeHelp && (
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto z-10">
                                            {helpLoading ? <p className="p-3 text-sm text-slate-500">Loading...</p> :
                                                availableTypes.map(t => (
                                                    <button key={t.EWMStorageType} onClick={() => { setSourceType(t.EWMStorageType); setShowTypeHelp(false); }}
                                                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-100">
                                                        {t.EWMStorageType}
                                                    </button>
                                                ))}
                                        </div>
                                    )}
                                </div>

                                {/* Actual Qty */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Actual Confirm Qty ({task.BaseUnit}) <span className="text-red-500">*</span></label>
                                    <div className="flex items-center gap-3">
                                        <button type="button" onClick={() => setActualQty(Math.max(0, parseFloat(actualQty || 0) - 1).toString())}
                                            className="w-12 h-12 bg-brand-blue text-white rounded-xl flex items-center justify-center hover:opacity-90 shrink-0">
                                            <Minus size={20} />
                                        </button>
                                        <input type="number" value={actualQty} onChange={e => setActualQty(e.target.value)}
                                            className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-center text-2xl font-extrabold" />
                                        <button type="button" onClick={() => setActualQty((parseFloat(actualQty || 0) + 1).toString())}
                                            className="w-12 h-12 bg-brand-blue text-white rounded-xl flex items-center justify-center hover:opacity-90 shrink-0">
                                            <Plus size={20} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Pick HU */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Pick Handling Unit</h3>
                                <p className="text-xs text-slate-400 mb-3">HU at destination bin: {task.DestinationStorageBin || '—'}</p>
                                <div className="relative search-help-dropdown-container mb-2">
                                    <Input
                                        value={pickHU}
                                        onChange={e => setPickHU(e.target.value)}
                                        placeholder="Scan or enter HU"
                                        rightIcon={
                                            <div className="flex h-full">
                                                <button type="button" onClick={async () => {
                                                    setShowHUHelp(p => !p);
                                                    if (!availableHUs.length) {
                                                        setHelpLoading(true);
                                                        try {
                                                            const res = await api.fetchHandlingUnits(apiConfig, { warehouse, storageBin: task.DestinationStorageBin || undefined });
                                                            setAvailableHUs((res && res.value) ? res.value : []);
                                                        } catch (_) { setAvailableHUs([]); }
                                                        finally { setHelpLoading(false); }
                                                    }
                                                }} className="px-3 flex items-center justify-center bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors border-l border-slate-200">
                                                    <List size={20} />
                                                </button>
                                                <button type="button" onClick={() => handleOpenScanner('hu')}
                                                    className="px-3 flex items-center justify-center bg-brand-blue text-white hover:bg-opacity-90 transition-colors h-full active:scale-95 border-l border-brand-blue rounded-r-lg">
                                                    <ScanLine size={18} />
                                                </button>
                                            </div>
                                        }
                                    />
                                </div>
                                {showHUHelp && (
                                    <div className="border border-slate-200 rounded-lg max-h-48 overflow-y-auto bg-white">
                                        {helpLoading ? (
                                            <p className="p-3 text-sm text-slate-400 text-center">Loading...</p>
                                        ) : availableHUs.length === 0 ? (
                                            <p className="p-3 text-sm text-slate-400 text-center">No HUs found at this bin.</p>
                                        ) : (
                                            availableHUs
                                                .filter(hu => !pickHU || (hu.HandlingUnitExternalID || '').toUpperCase().includes(pickHU.toUpperCase()))
                                                .map(hu => (
                                                    <button key={hu.HandlingUnitExternalID}
                                                        onClick={() => { setPickHU(hu.HandlingUnitExternalID); setShowHUHelp(false); }}
                                                        className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 border-b border-slate-100 last:border-0">
                                                        {hu.HandlingUnitExternalID}
                                                    </button>
                                                ))
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Batch (conditional) */}
                            {hasBatch && (
                                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Batch</h3>
                                    <Input
                                        label={<>Batch <span className="text-amber-600 font-bold">({task.Batch})</span></>}
                                        value={batchValue}
                                        onChange={e => setBatchValue(e.target.value.toUpperCase())}
                                        placeholder="Scan or type batch"
                                        rightIcon={
                                            <button type="button" onClick={() => { setActiveScanTarget('batch'); setScannerOpen(true); }}
                                                className="w-9 h-9 flex items-center justify-center bg-brand-blue text-white rounded-lg hover:bg-opacity-90 transition">
                                                <ScanLine size={18} />
                                            </button>
                                        }
                                    />
                                </div>
                            )}

                            {/* Serial Numbers (conditional) */}
                            {isSerialized && serialNumbers.length > 0 && (
                                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Serial Numbers</h3>
                                    <p className="text-xs text-slate-400 mb-3">{serialNumbers.length} serial number(s) required for qty {Math.floor(parseFloat(actualQty || 0))}</p>
                                    <div className="space-y-2">
                                        {serialNumbers.map((sn, idx) => (
                                            <div key={idx} className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-slate-400 w-6 text-right shrink-0">#{idx + 1}</span>
                                                <Input
                                                    value={sn}
                                                    onChange={e => {
                                                        const updated = [...serialNumbers];
                                                        updated[idx] = e.target.value.toUpperCase();
                                                        setSerialNumbers(updated);
                                                    }}
                                                    placeholder={`Serial #${idx + 1}`}
                                                    className="flex-1 font-mono"
                                                    rightIcon={
                                                        <button type="button" onClick={() => { setActiveScanTarget(`serial_${idx}`); setScannerOpen(true); }}
                                                            className="w-8 h-8 flex items-center justify-center bg-brand-blue text-white rounded-lg hover:bg-opacity-90 transition">
                                                            <ScanLine size={16} />
                                                        </button>
                                                    }
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Exception Code */}
                            {isExceptionRequired && (
                                <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4">
                                    <Input
                                        label="Exception Code *"
                                        value={exceptionCode}
                                        onChange={e => setExceptionCode(e.target.value)}
                                        placeholder="Enter exception code"
                                    />
                                    <p className="text-xs text-amber-600 mt-2 font-medium">Required because Bin or Quantity differs from planned.</p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Sticky footer */}
            {isConfirmPhase && (
                <div className="bg-white border-t border-slate-200 px-4 py-3 shrink-0 w-full">
                    <Button
                        onClick={handleConfirmSubmit}
                        disabled={confirming || !!successMsg}
                        className="w-full"
                    >
                        {confirming
                            ? <><Loader size={16} className="animate-spin" /> Confirming...</>
                            : <><CheckCircle size={16} /> Confirm Task</>}
                    </Button>
                </div>
            )}

            {/* Barcode Scanner */}
            {scannerOpen && (
                <BarcodeScanner 
                    onScan={handleScan} 
                    onClose={() => setScannerOpen(false)} 
                />
            )}

            {/* Manual Entry Modal */}
            {manualEntryOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-4 w-full max-w-sm shadow-xl animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-slate-800">
                                {activeScanTarget === 'bin' ? 'Type Source Bin / HU' :
                                    activeScanTarget === 'item' ? 'Type Item Barcode' :
                                        'Manual Entry'}
                            </h3>
                            <button onClick={() => setManualEntryOpen(false)} className="p-1 rounded-full hover:bg-slate-100 text-slate-500"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleManualEntrySubmit}>
                            <Input
                                autoFocus
                                placeholder="Enter value..."
                                value={manualEntryValue}
                                onChange={e => setManualEntryValue(e.target.value.toUpperCase())}
                            />
                            <div className="flex gap-3 mt-4">
                                <Button type="button" onClick={() => setManualEntryOpen(false)} className="flex-1 bg-slate-100 text-slate-600 hover:bg-slate-200">Cancel</Button>
                                <Button type="submit" className="flex-1 bg-brand-blue text-white" disabled={!manualEntryValue.trim()}>Verify</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ConfirmPicking;
