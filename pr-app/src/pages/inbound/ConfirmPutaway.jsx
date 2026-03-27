/**
 * @file ConfirmPutaway.jsx
 * @description Screen: Confirm Putaway Task (Inbound Warehouse Process — INB 50)
 *
 * Guides the operator through a scan-confirmation gate, then submits the putaway.
 *
 * ## Scan Gate (SAP canonical putaway flow)
 *  Step 1 — Scan product barcode.
 *           Matched against task Product; GTIN lookup used for EAN codes.
 *  Step 2 — Scan batch code (only if task is batch-managed).
 *           Compared against task Batch field.
 *  Step 3 — Scan destination bin barcode.
 *           Compared against planned DestinationStorageBin.
 *
 * After all gate steps pass (or are skipped), the confirm form is unlocked
 * for the operator to adjust qty, change dest bin, assign HUs, etc.
 *
 * ## Confirmation Modes
 *  - Exact: dest bin + qty unchanged → DirectWhseTaskConfIsAllowed = true
 *  - Custom: sends actuals; optional WhseTaskExCodeDestStorageBin on deviation
 *
 * @route /warehouse-inbound/putaway/:warehouse/:taskId/:taskItem
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
    Home, CheckCircle, AlertCircle, Loader, X, Scan,
    ArrowLeft, ChevronDown, ChevronRight, List, ScanLine,
    Plus, Trash2, Keyboard
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { useSwipeBack } from '../../hooks/useSwipeBack';
import BarcodeScanner from '../../components/BarcodeScanner';
import { useProductDescription } from '../../hooks/useProductDescription';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';


// ──────────────────────────────────────────────────────────────
//  ScanStep — reusable step card for the scan gate
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

            {scanResult && (
                <div className={`flex items-center gap-2 px-4 py-2 text-sm font-bold ${scanResult.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                    {scanResult.ok ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                    {scanResult.msg}
                </div>
            )}

            {!scanResult && hint && (
                <p className="px-4 py-2 text-xs text-slate-500">{hint}</p>
            )}

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
const ConfirmPutaway = () => {
    const { warehouse, taskId, taskItem } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { apiConfig } = useAuth();
    const { getDescription } = useProductDescription();

    // Optional flags from SystemGuidedPutaway
    const { fromSystemGuided, resourceId, warehouseOrder, zeroQty } = location.state || {};

    useSwipeBack(() => navigate(-1));

    const [loading, setLoading] = useState(true);
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');
    const [task, setTask] = useState(null);

    // ── Scan Gate state ──────────────────────────
    // phases: 'product' → 'batch' (if batch-managed) → 'destBin' → 'confirm'
    const [scanPhase, setScanPhase] = useState('product');
    const [productScanResult, setProductScanResult] = useState(null);
    const [batchScanResult, setBatchScanResult] = useState(null);
    const [destBinScanResult, setDestBinScanResult] = useState(null);
    const [activeScanTarget, setActiveScanTarget] = useState(null); // 'product' | 'batch' | 'destBin' | 'hu'
    const [scannerOpen, setScannerOpen] = useState(false);

    // Manual entry modal state
    const [manualEntryOpen, setManualEntryOpen] = useState(false);
    const [manualEntryValue, setManualEntryValue] = useState('');

    // ── Confirm form state ───────────────────────
    const [actualQty, setActualQty] = useState('');
    const [destBin, setDestBin] = useState('');
    const [destType, setDestType] = useState('');
    const [exceptionCode, setExceptionCode] = useState('');
    const [destHU, setDestHU] = useState('');

    // Value Help
    const [showTypeHelp, setShowTypeHelp] = useState(false);
    const [showBinHelp, setShowBinHelp] = useState(false);
    const [showHUHelp, setShowHUHelp] = useState(false);
    const [availableTypes, setAvailableTypes] = useState([]);
    const [availableBins, setAvailableBins] = useState([]);
    const [availableHUs, setAvailableHUs] = useState([]);
    const [helpLoading, setHelpLoading] = useState(false);
    const [huHelpLoading, setHuHelpLoading] = useState(false);

    // Multi-HU Lines
    const [huLines, setHuLines] = useState([]);
    const [activeHuLineHelp, setActiveHuLineHelp] = useState(null);

    // Serial Numbers
    const [serialNumbers, setSerialNumbers] = useState([]);

    // ── Helpers ──────────────────────────────────
    const normalize = (str) => (str || '').trim().toUpperCase();

    const hasBatch = (t) => {
        const b = normalize(t?.Batch);
        return b && b !== 'NO BATCH' && b !== '' && b !== 'INITIAL';
    };

    // Determine how many scan-gate steps there are for this task
    const totalSteps = (t) => hasBatch(t) ? 3 : 2;

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

    const parseSapError = (rawMsg) => {
        if (!rawMsg) return 'Unknown error';
        try {
            const jsonStart = rawMsg.indexOf('{');
            if (jsonStart !== -1) {
                const parsed = JSON.parse(rawMsg.slice(jsonStart));
                const msg = parsed?.error?.message?.value || parsed?.error?.message || parsed?.message?.value || parsed?.message;
                if (msg && typeof msg === 'string') {
                    return rawMsg.slice(0, jsonStart).trim() + (rawMsg.slice(0, jsonStart).trim() ? ' — ' : '') + msg;
                }
            }
        } catch (_) { }
        return rawMsg.length > 200 ? rawMsg.slice(0, 200) + '…' : rawMsg;
    };

    // ── Load task ────────────────────────────────
    useEffect(() => {
        const doFetch = async (headers, url) => {
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
                    if (url.includes('api.s4hana.cloud.sap'))
                        url = url.replace(/https:\/\/my\d+-api\.s4hana\.cloud\.sap(:443)?/g, '');
                    else if (url.includes('sandbox.api.sap.com'))
                        url = url.replace('https://sandbox.api.sap.com', '/s4hanacloud');
                }

                let data;
                try { data = await doFetch(headers, url); }
                catch (firstErr) {
                    console.warn('Task load failed, retrying in 1s...', firstErr.message);
                    await new Promise(r => setTimeout(r, 1000));
                    data = await doFetch(headers, url);
                }

                setTask(data);
                setActualQty(zeroQty ? '0' : (data.TargetQuantityInBaseUnit || ''));
                setDestBin(data.DestinationStorageBin || '');
                setDestType(data.DestinationStorageType || '');
                setDestHU(data.DestinationHandlingUnit || data.HandlingUnit || '');
            } catch (err) {
                setError(parseSapError(err.message));
            } finally {
                setLoading(false);
            }
        };
        loadTask();
    }, [warehouse, taskId, taskItem, apiConfig]);

    // ── Click-outside handler for value help dropdowns ───
    useEffect(() => {
        const handler = (e) => {
            if ((showTypeHelp || showBinHelp) && !e.target.closest('.search-help-dropdown-container')) {
                setShowTypeHelp(false);
                setShowBinHelp(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showTypeHelp, showBinHelp]);

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
            handleScan(manualEntryValue.trim());
        }
    };

    const advancePhase = (from) => {
        if (from === 'product') {
            if (hasBatch(task)) {
                setTimeout(() => setScanPhase('batch'), 400);
            } else {
                setTimeout(() => setScanPhase('destBin'), 400);
            }
        } else if (from === 'batch') {
            setTimeout(() => setScanPhase('destBin'), 400);
        } else if (from === 'destBin') {
            setTimeout(() => setScanPhase('confirm'), 400);
        }
    };

    const handleScan = async (scanned) => {
        setScannerOpen(false);
        const val = normalize(scanned);

        if (activeScanTarget === 'product') {
            const plannedProduct = normalize(task?.Product);
            if (val === plannedProduct) {
                setProductScanResult({ ok: true, msg: `Product matched: ${val}` });
                advancePhase('product');
                return;
            }
            // GTIN fallback
            try {
                const gtinResult = await api.fetchProductByGTIN(apiConfig, val);
                if (gtinResult && normalize(gtinResult.Product) === plannedProduct) {
                    setProductScanResult({ ok: true, msg: `Product matched via GTIN: ${plannedProduct}` });
                    advancePhase('product');
                } else {
                    setProductScanResult({
                        ok: false,
                        msg: `"${val}" does not match product "${plannedProduct}"${gtinResult ? ` (resolved to ${normalize(gtinResult.Product)})` : ''}`
                    });
                }
            } catch (_) {
                setProductScanResult({ ok: false, msg: `"${val}" does not match product "${plannedProduct}"` });
            }
        } else if (activeScanTarget === 'batch') {
            const plannedBatch = normalize(task?.Batch);
            if (val === plannedBatch) {
                setBatchScanResult({ ok: true, msg: `Batch matched: ${val}` });
                advancePhase('batch');
            } else {
                setBatchScanResult({ ok: false, msg: `"${val}" does not match batch "${plannedBatch}"` });
            }
        } else if (activeScanTarget === 'destBin') {
            const plannedBin = normalize(task?.DestinationStorageBin);
            if (val === plannedBin) {
                setDestBinScanResult({ ok: true, msg: `Destination bin matched: ${val}` });
                setDestBin(val);
                advancePhase('destBin');
            } else {
                setDestBinScanResult({ ok: false, msg: `"${val}" does not match planned bin "${plannedBin}". You can change the destination in the form below.` });
                setDestBin(val); // populate with scanned value so operator can proceed with changed bin
            }
        } else if (activeScanTarget === 'hu') {
            setDestHU(val);
        } else if (typeof activeScanTarget === 'string' && activeScanTarget.startsWith('serial_')) {
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

    const handleSkip = (phase) => {
        if (phase === 'product') {
            setProductScanResult({ ok: true, msg: 'Skipped — not verified' });
            advancePhase('product');
        } else if (phase === 'batch') {
            setBatchScanResult({ ok: true, msg: 'Skipped — not verified' });
            advancePhase('batch');
        } else if (phase === 'destBin') {
            setDestBinScanResult({ ok: true, msg: 'Skipped — not verified' });
            advancePhase('destBin');
        }
    };

    // ── Confirm submit ───────────────────────────
    const handleConfirmSubmit = (e) => {
        e?.preventDefault();
        setError(null);

        const userBin = normalize(destBin);
        const standardBin = normalize(task.DestinationStorageBin);
        const standardQty = parseFloat(task.TargetQuantityInBaseUnit || 0);
        const userQty = parseFloat(actualQty);

        if ((standardBin && userBin !== standardBin && !exceptionCode) ||
            (standardQty && userQty !== standardQty && !exceptionCode)) {
            setError('Exception Code is required since Destination Bin or Quantity has changed from planned.');
            return;
        }

        executeConfirmation();
    };

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
                const unique = new Set(filled.map(s => s.trim().toUpperCase()));
                if (unique.size !== filled.length) {
                    setError('Duplicate serial numbers detected. Each serial number must be unique.');
                    setConfirming(false);
                    return;
                }
            }

            const isExact = !exceptionCode &&
                normalize(destBin) === normalize(task.DestinationStorageBin) &&
                parseFloat(actualQty) === parseFloat(task.TargetQuantityInBaseUnit || 0);

            let payload;
            if (isExact) {
                payload = { DirectWhseTaskConfIsAllowed: true };
            } else {
                payload = {
                    ActualQuantityInAltvUnit: parseFloat(actualQty),
                    AlternativeUnit: task.BaseUnit,
                    DestinationStorageBin: normalize(destBin),
                    DirectWhseTaskConfIsAllowed: true
                };
                if (exceptionCode) payload.WhseTaskExCodeDestStorageBin = exceptionCode;
            }

            const primaryHU = huLines.length > 0 ? huLines[0].hu.trim() : destHU.trim();
            if (primaryHU) payload.DestinationHandlingUnit = primaryHU;

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
                ? '/warehouse-inbound/system-guided'
                : '/warehouse-inbound/putaway';
            const backNavState = fromSystemGuided
                ? { resourceId, warehouseOrder, warehouse }
                : backState;

            setTimeout(() => {
                navigate(backRoute, {
                    state: fromSystemGuided ? { ...backNavState, ...backState } : backState
                });
            }, 2000);
        } catch (err) {
            setError(parseSapError('Confirmation failed: ' + err.message));
            setExceptionCode('');
        } finally {
            setConfirming(false);
        }
    };

    // ── Derived state ────────────────────────────
    const isExceptionRequired = task && (
        (task.DestinationStorageBin && normalize(destBin) !== normalize(task.DestinationStorageBin)) ||
        (task.TargetQuantityInBaseUnit && parseFloat(actualQty || 0) !== parseFloat(task.TargetQuantityInBaseUnit || 0))
    );

    const isConfirmPhase = scanPhase === 'confirm';
    const steps = task ? totalSteps(task) : 2;

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
                        <button onClick={() => navigate(-1)} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white"><ArrowLeft size={20} /></button>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <h1 className="text-xl font-bold text-white">Error</h1>
                        </div>
                        <button onClick={() => navigate('/menu', { replace: true })} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white"><Home size={20} /></button>
                    </div>
                </header>
                <div className="p-6 text-center text-red-500 mt-10">
                    <AlertCircle size={48} className="mx-auto mb-4 opacity-50" />
                    <p className="text-sm text-red-700 max-w-xs mx-auto">{error || 'No task found matching this ID.'}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
            {/* Header */}
            <header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="w-10 h-10 p-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" title="Back">
                        <ArrowLeft size={22} className="text-white" />
                    </button>
                    <div className="flex flex-col flex-1 min-w-0">
                        <h1 className="text-xl font-bold text-white tracking-wide truncate">Confirm Putaway</h1>
                        <p className="text-blue-200 text-xs font-medium tracking-wider mt-0.5 truncate">WT: {taskId} · Item {parseInt(taskItem, 10) || taskItem}</p>
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
                            <AlertCircle size={16} /> <span className="text-sm flex-1">{error}</span>
                            <button onClick={() => setError(null)}><X size={14} /></button>
                        </div>
                    )}
                    {successMsg && (
                        <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 p-3 rounded-lg border border-emerald-200">
                            <CheckCircle size={16} /> <span className="text-sm font-bold">{successMsg}</span>
                        </div>
                    )}

                    {/* Task Summary Card */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Material</p>
                                <p className="text-lg font-bold text-slate-800">{task.Product || 'N/A'}</p>
                                {getDescription(task.Product) && (
                                    <p className="text-xs text-slate-400 mt-0.5">{getDescription(task.Product)}</p>
                                )}
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Planned Qty</p>
                                <p className="text-lg font-bold text-slate-800">{parseFloat(task.TargetQuantityInBaseUnit || 0)} {task.BaseUnit}</p>
                            </div>
                        </div>
                        {/* Source → Destination overview */}
                        <div className="flex items-center gap-2 bg-slate-50 rounded-xl p-3">
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Source Bin</p>
                                <p className="font-extrabold text-slate-800 font-mono text-base truncate">{task.SourceStorageBin || '—'}</p>
                            </div>
                            <ChevronRight size={20} className="text-slate-300 shrink-0" />
                            <div className="flex-1 min-w-0 text-right">
                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Dest Bin</p>
                                <p className="font-extrabold text-blue-700 font-mono text-base truncate">{task.DestinationStorageBin || '—'}</p>
                            </div>
                        </div>
                        {(task.Batch || task.SourceHandlingUnit) && (
                            <div className="flex gap-4 mt-2 text-xs text-slate-500">
                                {task.Batch && <span>Batch: <span className="font-bold text-amber-600">{task.Batch}</span></span>}
                                {task.SourceHandlingUnit && <span>Source HU: <span className="font-bold text-slate-700">{task.SourceHandlingUnit}</span></span>}
                            </div>
                        )}
                    </div>

                    {/* ── SCAN GATE ─────────────────────────── */}

                    {/* Step 1: Scan Product */}
                    {(scanPhase === 'product' || productScanResult) && (
                        <ScanStep
                            stepNum={1}
                            total={steps}
                            title="Scan Product Barcode"
                            subtitle={`Product: ${task.Product || '—'}`}
                            hint="Scan the EAN / product barcode on the item or packaging to verify identity."
                            scanResult={productScanResult}
                            onOpenScanner={() => handleOpenScanner('product')}
                            onManualEntry={() => handleOpenManualEntry('product')}
                            scannerLabel="Scan Product"
                        />
                    )}

                    {/* Step 2 (conditional): Scan Batch */}
                    {hasBatch(task) && (scanPhase === 'batch' || batchScanResult) && (
                        <ScanStep
                            stepNum={2}
                            total={steps}
                            title="Scan Batch Code"
                            subtitle={`Batch: ${task.Batch}`}
                            hint="Scan the batch label on the product to verify the correct batch."
                            scanResult={batchScanResult}
                            onOpenScanner={() => handleOpenScanner('batch')}
                            onManualEntry={() => handleOpenManualEntry('batch')}
                            scannerLabel="Scan Batch"
                        />
                    )}

                    {/* Step N: Scan Destination Bin */}
                    {(scanPhase === 'destBin' || destBinScanResult) && (
                        <ScanStep
                            stepNum={steps}
                            total={steps}
                            title="Scan Destination Bin"
                            subtitle={`Planned: ${task.DestinationStorageBin || '—'}`}
                            hint="Go to the drop-off location and scan the destination bin barcode."
                            scanResult={destBinScanResult}
                            onOpenScanner={() => handleOpenScanner('destBin')}
                            onManualEntry={() => handleOpenManualEntry('destBin')}
                            scannerLabel="Scan Dest Bin"
                        />
                    )}

                    {/* ── CONFIRM FORM (unlocked after scan gate) ─── */}
                    {isConfirmPhase && (
                        <>
                            {/* Destination Configuration */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Destination Configuration</h3>
                                <form id="confirmTaskForm" onSubmit={handleConfirmSubmit} className="space-y-4">
                                    {/* Destination Bin */}
                                    <div className="relative search-help-dropdown-container">
                                        <Input
                                            label="Destination Bin *"
                                            required
                                            value={destBin}
                                            onChange={e => setDestBin(e.target.value.toUpperCase())}
                                            onClick={() => {
                                                if (!showBinHelp) {
                                                    setShowTypeHelp(false);
                                                    setShowBinHelp(true);
                                                    if (!availableBins.length) {
                                                        setHelpLoading(true);
                                                        api.fetchStorageBins(apiConfig, warehouse, destType).then(r => setAvailableBins(r.value || [])).catch(() => setAvailableBins([])).finally(() => setHelpLoading(false));
                                                    }
                                                }
                                            }}
                                            placeholder="Enter or scan bin"
                                            rightIcon={
                                                <button type="button" onClick={() => { setActiveScanTarget('destBin'); setScannerOpen(true); }}
                                                    className="px-3 flex items-center justify-center bg-brand-blue text-white hover:bg-opacity-90 transition-colors h-full active:scale-95 border-l border-brand-blue rounded-r-lg">
                                                    <Scan size={18} />
                                                </button>
                                            }
                                        />
                                        {showBinHelp && (
                                            <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                                                {helpLoading ? (
                                                    <div className="flex justify-center items-center p-6"><Loader className="animate-spin text-blue-500" size={24} /></div>
                                                ) : availableBins.length === 0 ? (
                                                    <div className="p-4 text-center text-sm text-slate-500">No storage bins found.</div>
                                                ) : (
                                                    availableBins.map((bin, idx) => (
                                                        <div key={bin.EWMStorageBin} onClick={() => { setDestBin(bin.EWMStorageBin); setShowBinHelp(false); }}
                                                            style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: idx < availableBins.length - 1 ? '1px solid #f1f5f9' : 'none' }}
                                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#eff6ff'}
                                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}>
                                                            <div className="font-bold text-slate-800 text-sm">{bin.EWMStorageBin}</div>
                                                            <div className="text-xs text-slate-500 mt-0.5">{bin.EWMStorageType || destType || 'N/A'}</div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Destination Storage Type */}
                                    <div className="relative search-help-dropdown-container">
                                        <Input
                                            label="Destination Storage Type"
                                            value={destType}
                                            onChange={e => setDestType(e.target.value.toUpperCase())}
                                            placeholder="e.g. Y011"
                                            rightIcon={
                                                <button type="button" onClick={() => {
                                                    setShowBinHelp(false);
                                                    setShowTypeHelp(p => !p);
                                                    if (!availableTypes.length) {
                                                        setHelpLoading(true);
                                                        api.fetchStorageTypes(apiConfig, warehouse).then(r => setAvailableTypes(r.value || [])).catch(() => setAvailableTypes([])).finally(() => setHelpLoading(false));
                                                    }
                                                }} className="px-3 flex items-center justify-center bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors h-full border-l border-slate-200 rounded-r-lg">
                                                    <ChevronDown size={18} />
                                                </button>
                                            }
                                        />
                                        {showTypeHelp && (
                                            <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                                                {helpLoading ? (
                                                    <div className="flex justify-center items-center p-6"><Loader className="animate-spin text-blue-500" size={24} /></div>
                                                ) : availableTypes.length === 0 ? (
                                                    <div className="p-4 text-center text-sm text-slate-500">No storage types found.</div>
                                                ) : (
                                                    availableTypes.map((type, idx) => (
                                                        <div key={type.EWMStorageType} onClick={() => { setDestType(type.EWMStorageType); setShowTypeHelp(false); }}
                                                            style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: idx < availableTypes.length - 1 ? '1px solid #f1f5f9' : 'none' }}
                                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#eff6ff'}
                                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}>
                                                            <div className="font-bold text-slate-800 text-sm">{type.EWMStorageType}</div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Actual Qty */}
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Actual Confirm Qty ({task.BaseUnit}) <span className="text-red-500">*</span></label>
                                        <div className="flex items-center gap-3">
                                            <button type="button" onClick={() => setActualQty(Math.max(0, parseFloat(actualQty || 0) - 1).toString())}
                                                className="w-12 h-12 bg-brand-blue text-white rounded-xl flex items-center justify-center hover:opacity-90 shrink-0 text-xl font-bold">−</button>
                                            <input type="number" required step="0.001" min="0" value={actualQty} onChange={e => setActualQty(e.target.value)}
                                                className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-center text-2xl font-extrabold" />
                                            <button type="button" onClick={() => setActualQty((parseFloat(actualQty || 0) + 1).toString())}
                                                className="w-12 h-12 bg-brand-blue text-white rounded-xl flex items-center justify-center hover:opacity-90 shrink-0 text-xl font-bold">+</button>
                                        </div>
                                    </div>

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
                                </form>
                            </div>

                            {/* Handling Unit Section */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Handling Unit Reference</h3>
                                <p className="text-xs text-slate-400 mb-3">HUs at destination bin: {destBin || '—'}</p>
                                <div className="relative search-help-dropdown-container mb-2">
                                    <Input
                                        value={destHU}
                                        onChange={e => setDestHU(e.target.value.trim())}
                                        placeholder="Scan or enter HU"
                                        rightIcon={
                                            <div className="flex h-full">
                                                <button type="button" onClick={async () => {
                                                    if (showHUHelp) { setShowHUHelp(false); return; }
                                                    if (!destBin) return;
                                                    setShowHUHelp(true); setHuHelpLoading(true);
                                                    try {
                                                        const res = await api.fetchHandlingUnits(apiConfig, { warehouse, storageBin: destBin.trim() || undefined });
                                                        setAvailableHUs((res && res.value) ? res.value : []);
                                                    } catch (_) { setAvailableHUs([]); }
                                                    finally { setHuHelpLoading(false); }
                                                }} disabled={!destBin}
                                                    className="px-3 flex items-center justify-center bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors border-l border-slate-200 disabled:opacity-40">
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
                                        {huHelpLoading ? (
                                            <p className="p-3 text-sm text-slate-400 text-center">Loading...</p>
                                        ) : availableHUs.length === 0 ? (
                                            <p className="p-3 text-sm text-slate-400 text-center">No HUs found at {destBin}.</p>
                                        ) : (
                                            availableHUs
                                                .filter(hu => !destHU || (hu.HandlingUnitExternalID || '').toUpperCase().includes(destHU.toUpperCase()))
                                                .map(hu => (
                                                    <button key={hu.HandlingUnitExternalID}
                                                        onClick={() => { setDestHU(hu.HandlingUnitExternalID); setShowHUHelp(false); }}
                                                        className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 border-b border-slate-100 last:border-0">
                                                        {hu.HandlingUnitExternalID}
                                                    </button>
                                                ))
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Multi-HU Lines */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <div>
                                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Multi-HU Assignment</h3>
                                        <p className="text-xs text-slate-400 mt-0.5">Split quantity across multiple HUs at {destBin || '—'}</p>
                                    </div>
                                    <button type="button"
                                        onClick={() => {
                                            const existingHU = (huLines.length === 0) ? (task?.HandlingUnit || task?.SourceHandlingUnit || '') : '';
                                            setHuLines(prev => [...prev, { hu: existingHU, qty: huLines.length === 0 ? (actualQty || '') : '', helpHUs: [], helpLoading: false }]);
                                        }}
                                        className="flex items-center gap-1 px-2.5 py-1.5 bg-brand-blue text-white rounded-lg text-xs font-bold hover:opacity-90">
                                        <Plus size={13} /> Add HU
                                    </button>
                                </div>

                                {huLines.length > 0 && (
                                    <div className="text-xs font-bold mb-3 px-1">
                                        <span className="text-slate-500">Total assigned: </span>
                                        <span className={huLines.reduce((s, l) => s + (parseFloat(l.qty) || 0), 0) > parseFloat(actualQty || 0) ? 'text-red-600' : 'text-emerald-600'}>
                                            {huLines.reduce((s, l) => s + (parseFloat(l.qty) || 0), 0).toFixed(3)}
                                        </span>
                                        <span className="text-slate-400"> / {actualQty} {task.BaseUnit}</span>
                                    </div>
                                )}

                                {huLines.length === 0 && (
                                    <p className="text-xs text-slate-400 text-center py-2">No HU lines added — uses single HU above if set.</p>
                                )}

                                <div className="space-y-2">
                                    {huLines.map((line, idx) => (
                                        <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-slate-400 w-5 shrink-0">{idx + 1}</span>
                                                <input type="text" placeholder="HU number" value={line.hu}
                                                    onChange={e => setHuLines(prev => prev.map((l, i) => i === idx ? { ...l, hu: e.target.value.trim() } : l))}
                                                    className="flex-1 p-1.5 text-xs border border-slate-200 rounded uppercase bg-white" />
                                                <input type="number" placeholder="Qty" step="0.001" value={line.qty}
                                                    onChange={e => setHuLines(prev => prev.map((l, i) => i === idx ? { ...l, qty: e.target.value } : l))}
                                                    className="w-20 p-1.5 text-xs border border-slate-200 rounded text-center bg-white" />
                                                <button type="button" title="Browse HUs at dest bin" disabled={!destBin}
                                                    onClick={async () => {
                                                        if (activeHuLineHelp === idx) { setActiveHuLineHelp(null); return; }
                                                        setActiveHuLineHelp(idx);
                                                        setHuLines(prev => prev.map((l, i) => i === idx ? { ...l, helpLoading: true } : l));
                                                        try {
                                                            const res = await api.fetchHandlingUnits(apiConfig, { warehouse, storageBin: destBin.trim() });
                                                            const hus = (res && res.value) ? res.value : [];
                                                            setHuLines(prev => prev.map((l, i) => i === idx ? { ...l, helpHUs: hus, helpLoading: false } : l));
                                                        } catch { setHuLines(prev => prev.map((l, i) => i === idx ? { ...l, helpHUs: [], helpLoading: false } : l)); }
                                                    }}
                                                    className="p-1.5 bg-slate-100 rounded text-slate-500 hover:bg-slate-200 disabled:opacity-40">
                                                    <List size={14} />
                                                </button>
                                                <button type="button" onClick={() => setHuLines(prev => prev.filter((_, i) => i !== idx))}
                                                    className="p-1.5 bg-red-50 rounded text-red-400 hover:bg-red-100">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                            {activeHuLineHelp === idx && (
                                                <div className="mt-2 border border-slate-200 rounded-lg max-h-40 overflow-y-auto bg-white">
                                                    {line.helpLoading ? (
                                                        <p className="p-2 text-xs text-center text-slate-400">Loading...</p>
                                                    ) : line.helpHUs.length === 0 ? (
                                                        <p className="p-2 text-xs text-center text-slate-400">No HUs at {destBin}.</p>
                                                    ) : (
                                                        line.helpHUs.map(hu => (
                                                            <button key={hu.HandlingUnitExternalID} type="button"
                                                                onClick={() => { setHuLines(prev => prev.map((l, i) => i === idx ? { ...l, hu: hu.HandlingUnitExternalID } : l)); setActiveHuLineHelp(null); }}
                                                                className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 border-b border-slate-100 last:border-0">
                                                                {hu.HandlingUnitExternalID}
                                                            </button>
                                                        ))
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    {/* Serial Numbers (conditional - outside scan gate, inside confirm phase) */}
                    {isConfirmPhase && isSerialized && serialNumbers.length > 0 && (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mx-4 mb-4">
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
                </div>
            </div>

            {/* Sticky Confirm Footer */}
            {isConfirmPhase && (
                <div className="bg-white border-t border-slate-200 px-4 py-3 shrink-0 w-full">
                    <Button
                        onClick={handleConfirmSubmit}
                        disabled={confirming || !!successMsg}
                        className="w-full"
                    >
                        {confirming ? <><Loader size={16} className="animate-spin" /> Confirming...</> : <><CheckCircle size={16} /> Confirm Putaway</>}
                    </Button>
                </div>
            )}

            {/* Barcode Scanner (portal handles its own modal UI) */}
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
                                {activeScanTarget === 'product' ? 'Type Product ID' :
                                    activeScanTarget === 'batch' ? 'Type Batch Code' :
                                        activeScanTarget === 'destBin' ? 'Type Destination Bin' :
                                            typeof activeScanTarget === 'string' && activeScanTarget.startsWith('serial_') ? `Type Serial #${parseInt(activeScanTarget.split('_')[1], 10) + 1}` :
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

export default ConfirmPutaway;
