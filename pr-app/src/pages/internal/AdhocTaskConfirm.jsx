/**
 * @file AdhocTaskConfirm.jsx
 * @description Screen: Confirm Warehouse Task (Internal Stock Movement)
 *
 * This screen handles the SAP EWM "Confirm Warehouse Task" process (Transaction LT0A).
 * It supports two entry modes:
 *  1. Search mode — user scans/enters a WT number or browses by warehouse
 *  2. Detail mode — user sees full task details and confirms the task
 *
 * The screen can also be reached directly from StockByProduct when the user
 * selects a specific open task (navigation state: { task }).
 *
 * ## SAP Process Flow
 *   Search → Select Task → View Details → Confirm (POST to SAP EWM)
 *
 * ## Key Data
 *  - Warehouse Task (WT) data: fetched via api_warehouse_order_task_2 OData V4
 *  - Product description: fetched from API_PRODUCT_SRV (with module-level cache)
 *  - Process/Activity/Stock type codes resolved to labels via wmLabels.js
 *
 * @route /warehouse-internal/confirm-task
 */
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Home, Search, Scan, AlertCircle, X, CheckCircle, ChevronRight,
    PackageOpen, Loader, ArrowLeft, ArrowRight, MapPin, Package, Box, ScanLine, Keyboard
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import BarcodeScanner from '../../components/BarcodeScanner';
import { useSwipeBack } from '../../hooks/useSwipeBack';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { useProductDescription } from '../../hooks/useProductDescription';
import { PROCESS_TYPE_LABELS, ACTIVITY_TYPE_LABELS, STOCK_TYPE_LABELS } from '../../utils/wmLabels';

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

const AdhocTaskConfirm = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { apiConfig } = useAuth();
    useSwipeBack(() => navigate(-1));


    // UI state
    const [step, setStep] = useState('search'); // 'search' | 'list' | 'detail'
    const [loading, setLoading] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');
    const [showScanner, setShowScanner] = useState(false);

    // Scan Gate state (Detail view)
    const [scanPhase, setScanPhase] = useState('product'); // 'product' -> 'destBin' -> 'confirm'
    const [productScanResult, setProductScanResult] = useState(null);
    const [destBinScanResult, setDestBinScanResult] = useState(null);
    const [activeScanTarget, setActiveScanTarget] = useState(null); // 'product' | 'destBin'
    const [scannerOpen, setScannerOpen] = useState(false);
    const [manualEntryOpen, setManualEntryOpen] = useState(false);
    const [manualEntryValue, setManualEntryValue] = useState('');

    // Data
    const [warehouses, setWarehouses] = useState([]);
    const [selectedWarehouse, setSelectedWarehouse] = useState('');
    const [searchValue, setSearchValue] = useState('');
    const [tasks, setTasks] = useState([]);
    const [hasSearched, setHasSearched] = useState(false);
    const [selectedTask, setSelectedTask] = useState(null);
    const { getDescription } = useProductDescription();

    // Deep-link: if a task was passed via navigation state, jump directly to detail view
    useEffect(() => {
        const preloaded = location.state?.task;
        if (preloaded) {
            setSelectedTask(preloaded);
            setStep('detail');
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps



    const stripZeros = (str) => str ? String(str).replace(/^0+/, '') || '0' : '';

    // Load warehouses
    useEffect(() => {
        (async () => {
            try {
                const res = await api.fetchWarehouses(apiConfig);
                if (res?.value) {
                    setWarehouses(res.value);
                    const dw = res.value.find(w => w.EWMWarehouse === 'UKW2');
                    if (dw) setSelectedWarehouse('UKW2');
                    else if (res.value.length === 1) setSelectedWarehouse(res.value[0].EWMWarehouse);
                }
            } catch (err) { setError("Failed to load warehouses: " + err.message); }
        })();
    }, [apiConfig]);

    // Search / List all tasks
    const handleSearch = async (e) => {
        if (e) e.preventDefault();
        setError(null);
        setTasks([]);
        setHasSearched(true);

        if (!selectedWarehouse) {
            setError('Please select a warehouse first.');
            return;
        }

        setLoading(true);
        try {
            const filters = { warehouse: selectedWarehouse };

            // If a specific task number was entered, filter by it
            if (searchValue.trim()) {
                // We'll fetch all tasks and filter client-side by WarehouseTask number
                // since the API doesn't have a direct WarehouseTask number filter in our wrapper
            }

            const res = await api.fetchWarehouseTasks(apiConfig, filters);
            let allTasks = (res && res.value) ? res.value : [];

            // Filter to only open tasks (not confirmed/completed)
            allTasks = allTasks.filter(t => t.WarehouseTaskStatus !== 'C');

            // Filter OUT tasks belonging to IBD or OBD (ad-hoc only = no delivery reference)
            allTasks = allTasks.filter(t => {
                const delivery = (t.EWMDelivery || '').trim();
                // Empty or all-zeros means no delivery reference = ad-hoc task
                return !delivery || delivery.replace(/^0+$/, '') === '';
            });

            // If search value provided, filter by task number
            if (searchValue.trim()) {
                const q = searchValue.trim().toUpperCase();
                allTasks = allTasks.filter(t =>
                    (t.WarehouseTask || '').toUpperCase().includes(q)
                );
            }

            if (allTasks.length === 1) {
                // Navigate directly to detail
                setSelectedTask(allTasks[0]);
                setStep('detail');
            } else {
                setTasks(allTasks);
                setStep('list');
            }
        } catch (err) {
            console.error(err);
            setError(err.message || 'Error occurred during search.');
        } finally {
            setLoading(false);
        }
    };

    // Open detail view
    const openDetail = (task) => {
        setSelectedTask(task);
        setError(null);
        setSuccessMsg('');
        setScanPhase('product'); // Reset to first gate
        setProductScanResult(null);
        setDestBinScanResult(null);
        setStep('detail');
    };

    // Confirm task (exact confirmation — no changes)
    const handleConfirm = async () => {
        if (!selectedTask) return;
        setConfirming(true);
        setError(null);
        setSuccessMsg('');

        try {
            const payload = {
                DirectWhseTaskConfIsAllowed: true
            };

            await api.confirmWarehouseTask(
                apiConfig,
                selectedTask.EWMWarehouse,
                selectedTask.WarehouseTask,
                selectedTask.WarehouseTaskItem,
                payload,
                true // isExact — no changes permitted
            );

            setSuccessMsg(`Task \${selectedTask.WarehouseTask} confirmed successfully!`);

            // If opened via deep-link from another screen, navigate back to it after success
            const wasDeepLinked = !!(location.state?.task);
            setTimeout(() => {
                if (wasDeepLinked) {
                    navigate(-1);
                } else {
                    setSelectedTask(null);
                    setStep('search');
                    setTasks([]);
                    setHasSearched(false);
                }
            }, 2000);

        } catch (err) {
            setError("Confirmation failed: " + err.message);
        } finally {
            setConfirming(false);
        }
    };

    const normalize = (str) => (str || '').trim().toUpperCase();

    // Secondary scanner handler for confirmation step
    const handleConfirmScan = async (scanned) => {
        setScannerOpen(false);
        const val = normalize(scanned);

        if (activeScanTarget === 'product') {
            const plannedProduct = normalize(selectedTask?.Product);
            if (val === plannedProduct) {
                setProductScanResult({ ok: true, msg: `Product matched: ${val}` });
                setTimeout(() => setScanPhase('destBin'), 500);
                return;
            }
            try {
                const gtinResult = await api.fetchProductByGTIN(apiConfig, val);
                if (gtinResult && normalize(gtinResult.Product) === plannedProduct) {
                    setProductScanResult({ ok: true, msg: `Product matched via GTIN` });
                    setTimeout(() => setScanPhase('destBin'), 500);
                } else {
                    setProductScanResult({ ok: false, msg: `"${val}" does not match targeted product` });
                }
            } catch (_) {
                setProductScanResult({ ok: false, msg: `"${val}" does not match targeted product` });
            }
        } else if (activeScanTarget === 'destBin') {
            const plannedBin = normalize(selectedTask?.DestinationStorageBin);
            const plannedHU = normalize(selectedTask?.DestinationHandlingUnit);
            if (val === plannedBin || (plannedHU && val === plannedHU)) {
                setDestBinScanResult({ ok: true, msg: `Destination matched: ${val}` });
                setTimeout(() => setScanPhase('confirm'), 500);
            } else {
                setDestBinScanResult({ ok: false, msg: `"${val}" does not match expected destination.` });
            }
        }
    };

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

    // Scanner handler for 'Search' mode
    const handleScan = (code) => {
        setSearchValue(code.toUpperCase());
        setShowScanner(false);
    };

    // ═══════════════════════════════════════════════
    // DETAIL VIEW
    // ═══════════════════════════════════════════════
    if (step === 'detail' && selectedTask) {
        const t = selectedTask;
        const isConfirmPhase = scanPhase === 'confirm';
        return (
            <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
                {/* Header */}
                <header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => {
                                const wasDeepLinked = !!(location.state?.task);
                                if (wasDeepLinked) {
                                    navigate(-1);
                                } else {
                                    setStep(tasks.length > 0 ? 'list' : 'search');
                                    setSelectedTask(null);
                                }
                            }}
                            className="w-10 h-10 p-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" title="Back"
                        >
                            <ArrowLeft size={22} className="text-white" />
                        </button>
                        <div className="flex flex-col flex-1 min-w-0">
                            <h1 className="text-xl font-bold text-white tracking-wide truncate">WT: {t.WarehouseTask}</h1>
                            <p className="text-blue-200 text-xs font-medium tracking-wider mt-0.5 truncate">Item {t.WarehouseTaskItem} • {t.EWMWarehouse}</p>
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
                            <div className="flex items-center gap-2 bg-red-50 text-red-700 p-3 rounded-lg border border-red-200 animate-in fade-in">
                                <AlertCircle size={16} /> <span className="text-sm flex-1">{error}</span>
                                <button onClick={() => setError(null)}><X size={14} /></button>
                            </div>
                        )}
                        {successMsg && (
                            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 p-3 rounded-lg border border-emerald-200 animate-in fade-in">
                                <CheckCircle size={16} /> <span className="text-sm font-bold">{successMsg}</span>
                            </div>
                        )}

                        {/* Task Summary Card */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                            <div className="flex flex-col gap-3">
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Product</p>
                                    <p className="text-sm font-bold text-slate-800">
                                        {stripZeros(t.Product) || '—'}
                                        {getDescription(t.Product) && <span className="text-xs font-normal text-slate-400"> · {getDescription(t.Product)}</span>}
                                    </p>
                                </div>
                                <div className="border-t border-slate-100 pt-3 flex justify-between">
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Quantity</p>
                                        <p className="text-sm font-bold text-slate-800">{parseFloat(t.TargetQuantityInBaseUnit || 0).toFixed(2)} <span className="text-slate-500 font-normal text-xs">{t.BaseUnit || 'EA'}</span></p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Activity</p>
                                        <p className="text-sm font-bold text-slate-800">{t.WarehouseActivityType || '—'}</p>
                                    </div>
                                </div>
                                {/* Source -> Dest Mini */}
                                <div className="flex items-center gap-2 bg-slate-50 rounded-xl p-3 border border-slate-100 mt-2">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Source</p>
                                        <p className="font-extrabold text-slate-800 font-mono text-xs truncate">{t.SourceStorageBin || '—'}</p>
                                    </div>
                                    <ChevronRight size={16} className="text-slate-300 shrink-0" />
                                    <div className="flex-1 min-w-0 text-right">
                                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Destination</p>
                                        <p className="font-extrabold text-brand-blue font-mono text-xs truncate">{t.DestinationStorageBin || '—'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ── SCAN GATE ─────────────────────────── */}
                        {(scanPhase === 'product' || productScanResult) && (
                            <ScanStep
                                stepNum={1}
                                total={2}
                                title="Scan Product Barcode"
                                subtitle={`Product: ${t.Product || '—'}`}
                                hint="Scan the product barcode to verify identity."
                                scanResult={productScanResult}
                                onOpenScanner={() => handleOpenScanner('product')}
                                onManualEntry={() => handleOpenManualEntry('product')}
                                scannerLabel="Scan Product"
                            />
                        )}

                        {(scanPhase === 'destBin' || scanPhase === 'confirm' || destBinScanResult) && (
                            <ScanStep
                                stepNum={2}
                                total={2}
                                title="Scan Destination Bin or HU"
                                subtitle={`Bin: ${t.DestinationStorageBin || '—'} · HU: ${t.DestinationHandlingUnit || '—'}`}
                                hint="Scan the destination bin or target HU."
                                scanResult={destBinScanResult}
                                onOpenScanner={() => handleOpenScanner('destBin')}
                                onManualEntry={() => handleOpenManualEntry('destBin')}
                                scannerLabel="Scan Destination"
                            />
                        )}

                        {/* Confirm Button (bottom) */}
                        {isConfirmPhase && (
                            <Button onClick={handleConfirm} disabled={confirming || !!successMsg} className="bg-brand-blue text-white w-full mt-4 py-4 text-base shadow-md">
                                {confirming ? (
                                    <><Loader size={18} className="animate-spin mr-2" /> Confirming...</>
                                ) : successMsg ? (
                                    <><CheckCircle size={18} className="mr-2" /> Confirmed!</>
                                ) : (
                                    <><CheckCircle size={18} className="mr-2" /> Confirm Task</>
                                )}
                            </Button>
                        )}
                    </div>
                </div>

                {/* Detail screen Scanners */}
                {scannerOpen && (
                    <BarcodeScanner 
                        onScan={handleConfirmScan} 
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
                                        activeScanTarget === 'destBin' ? 'Type Destination Bin / HU' :
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
    }

    // ═══════════════════════════════════════════════
    // SEARCH + LIST VIEW
    // ═══════════════════════════════════════════════
    return (
        <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
            {/* Header */}
            <header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                <div className="flex justify-between items-center relative">
                    <button onClick={() => navigate(-1)}
                                            className="z-10 w-10 h-10 p-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
                                            <ArrowLeft size={20} className="text-white" />
                                        </button>
                    
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <h1 className="text-xl font-bold text-white tracking-wide">
                            Confirm Task
                        </h1>
                                                <p className="text-blue-200 text-[10px] font-medium uppercase tracking-wider mt-0.5">
                                                    {step === 'search' ? 'Search Pending Tasks' : `\${tasks.length} Pending Tasks`}
                                                </p>
                    </div>

                    <button onClick={() => navigate('/menu', { replace: true })}
                                            className="z-10 w-10 h-10 p-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
                                            <Home size={20} className="text-white" />
                                        </button>
                </div>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 content-area pb-8" style={{ zIndex: 10, position: 'relative' }}>
                {/* Messages */}
                {successMsg && (
                    <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-4 shadow-md flex gap-3 items-center mb-3 max-w-md mx-auto mt-4 animate-in fade-in duration-300">
                        <CheckCircle className="text-emerald-500 shrink-0" size={22} />
                        <p className="text-sm text-emerald-700 flex-1 font-bold">{successMsg}</p>
                        <button onClick={() => setSuccessMsg('')} className="p-1 hover:bg-emerald-100 rounded-md shrink-0"><X size={14} className="text-emerald-500" /></button>
                    </div>
                )}
                {error && (
                    <div className="bg-red-50 border border-red-300 rounded-lg p-3 shadow-md flex gap-3 items-start mb-3 max-w-md mx-auto animate-in fade-in">
                        <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                        <p className="text-xs text-red-600 mt-0.5 flex-1 whitespace-pre-wrap">{error}</p>
                        <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-md shrink-0"><X size={14} className="text-red-500" /></button>
                    </div>
                )}

                <div className="max-w-md mx-auto">
                    {/* ═══ SEARCH FORM ═══ */}
                    {step === 'search' && (
                        <div className="bg-white shadow-sm border border-slate-200 w-full p-4 md:rounded-xl">
                            <form onSubmit={handleSearch} className="flex flex-col gap-4">
                                {/* Warehouse */}
                                <div className="mb-2">
                                    <Select
                                        label="Warehouse *"
                                        value={selectedWarehouse}
                                        onChange={(e) => setSelectedWarehouse(e.target.value)}
                                        options={[
                                            { value: '', label: 'Select Warehouse', disabled: true },
                                            ...warehouses.map(w => ({ value: w.EWMWarehouse, label: `\${w.EWMWarehouse} - \${w.EWMWarehouse_Text || w.EWMWarehouse}` }))
                                        ]}
                                        required
                                    />
                                </div>

                                {/* WT Number (optional) */}
                                <div className="mb-2">
                                    <Input
                                        label={<>Warehouse Task <span className="text-gray-400 font-normal lowercase">(optional — leave empty to list all)</span></>}
                                        placeholder="Scan or type WT number..."
                                        value={searchValue}
                                        onChange={(e) => setSearchValue(e.target.value.toUpperCase())}
                                        autoComplete="off"
                                        leftIcon={<Search size={18} className="text-gray-400" />}
                                        rightIcon={
                                            <div className="flex items-center gap-1">
                                                {searchValue && (
                                                    <button type="button" onClick={() => setSearchValue('')} className="p-1 text-gray-300 hover:text-gray-500">
                                                        <X size={16} />
                                                    </button>
                                                )}
                                                <button type="button" onClick={() => setShowScanner(true)} className="p-1.5 px-2 text-brand-blue">
                                                    <Scan size={20} />
                                                </button>
                                            </div>
                                        }
                                    />
                                    <p className="text-xs text-slate-400 mt-1.5 ml-1">Only ad-hoc tasks (not linked to IBD/OBD) are shown.</p>
                                </div>

                                <div className="w-full mt-2">
                                    <Button type="submit" disabled={loading} className="w-full">
                                        {loading ? (
                                            <><Loader size={18} className="animate-spin mr-2" /> Searching...</>
                                        ) : (
                                            <><Search size={18} className="mr-2" /> Find Tasks</>
                                        )}
                                    </Button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* ═══ TASK LIST ═══ */}
                    {step === 'list' && (
                        <>
                            {loading && (
                                <div className="text-center py-10">
                                    <Loader className="animate-spin text-brand-blue mx-auto mb-3" size={36} />
                                    <p className="text-gray-400 text-sm">Loading tasks...</p>
                                </div>
                            )}

                            {tasks.length > 0 && (
                                <div className="mt-4 px-2 md:px-0">
                                    <div className="flex justify-between items-end mb-3 px-2">
                                        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Select Task to Confirm</h2>
                                        <span className="text-xs font-semibold text-blue-600 bg-blue-100 px-2.5 py-1 rounded-full">{tasks.length} Pending</span>
                                    </div>
                                    <div className="space-y-3 pb-8">
                                        {tasks.map((doc, idx) => (
                                            <div
                                                key={doc.WarehouseTask + idx}
                                                onClick={() => openDetail(doc)}
                                                className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 active:bg-slate-100 hover:border-blue-300 cursor-pointer transition-colors flex items-center justify-between group"
                                            >
                                                <div className="flex items-start gap-4 flex-1 min-w-0">
                                                    <div className="h-10 w-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 shrink-0">
                                                        <PackageOpen size={20} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex justify-between items-start">
                                                            <h3 className="font-bold text-gray-800 text-base">WT: {doc.WarehouseTask}</h3>
                                                            <span className="font-mono font-bold text-brand-blue">{parseFloat(doc.TargetQuantityInBaseUnit || 0).toFixed(2)} {doc.BaseUnit}</span>
                                                        </div>
                                                        <p className="text-xs text-slate-500 mt-1 truncate">
                                                            Product: <span className="font-semibold text-gray-700">{stripZeros(doc.Product) || '-'}</span>
                                                        </p>
                                                        {doc.WarehouseProcessType && (
                                                            <p className="text-[11px] text-blue-600 font-semibold mt-0.5">
                                                                {doc.WarehouseProcessType}{PROCESS_TYPE_LABELS[doc.WarehouseProcessType] ? ` · \${PROCESS_TYPE_LABELS[doc.WarehouseProcessType]}` : ''}
                                                            </p>
                                                        )}
                                                        <p className="text-[11px] text-gray-400 mt-0.5">
                                                            {doc.SourceStorageBin || 'N/A'} ➔ {doc.DestinationStorageBin || 'N/A'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <ChevronRight className="text-gray-400 group-hover:text-blue-500 transition-colors shrink-0 ml-2" size={20} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {hasSearched && !loading && tasks.length === 0 && (
                                <div className="mt-10 animate-in fade-in slide-in-from-bottom-2 duration-300 px-2 md:px-0">
                                    <div className="text-center py-10 px-4 bg-white rounded-xl border-2 border-dashed border-red-200 shadow-sm">
                                        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <AlertCircle size={32} className="text-red-400" />
                                        </div>
                                        <h3 className="text-gray-900 font-bold text-lg mb-1">No Tasks Found</h3>
                                        <p className="text-gray-500 text-sm max-w-xs mx-auto mb-4">
                                            No open ad-hoc warehouse tasks found{searchValue ? ` matching "\${searchValue}"` : ''} in warehouse {selectedWarehouse}.
                                        </p>
                                        <div className="bg-orange-50 text-orange-800 text-xs px-3 py-2 rounded-lg inline-block border border-orange-100 text-left">
                                            <ul className="list-disc list-inside space-y-1">
                                                <li>Only tasks not linked to a delivery are shown.</li>
                                                <li>Ensure the task hasn't already been confirmed.</li>
                                                <li>Check the warehouse selection.</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {showScanner && (
                <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
            )}
        </div>
    );
};

export default AdhocTaskConfirm;
