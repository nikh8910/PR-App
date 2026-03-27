/**
 * @file OutboundDeliveryDetail.jsx
 * @description Screen: Outbound Delivery Detail & Goods Issue Posting (OBD 80)
 *
 * Displays all line items of a SAP outbound delivery and allows the operator to
 * post a Goods Issue (GI) against it. Key features:
 *  - Editable actual quantities per delivery item
 *  - Batch + serial number entry per item
 *  - CSRF token-based SAP POST
 *  - Full or partial goods issue support
 *
 * ## SAP Process Flow
 *   OutboundDeliverySearch → OutboundDeliveryDetail → Post GI (SAP VL02N equivalent)
 *
 * @route /warehouse-outbound/deliveries/:warehouse/:id
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Home, Loader, AlertCircle, CheckCircle, Boxes, ListTodo, ChevronDown, Plus, X, Pencil, RotateCcw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api, extractSapMessage } from '../../services/api';
import { useSwipeBack } from '../../hooks/useSwipeBack';
import { useProductDescription } from '../../hooks/useProductDescription';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

const OutboundDeliveryDetail = () => {
    const { warehouse, id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { apiConfig } = useAuth();

    useSwipeBack(() => {
        if (!showWtModal) {
            navigate(-1);
        }
    });

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');

    const [delivery, setDelivery] = useState(null);
    const [items, setItems] = useState([]);
    const [warehouseTasks, setWarehouseTasks] = useState([]);
    const [expandedItem, setExpandedItem] = useState(null);

    // Posting state
    const [isPostingGI, setIsPostingGI] = useState(false);

    // Inline quantity edit
    const [editingQtyItem, setEditingQtyItem] = useState(null);
    const [editQtyValue, setEditQtyValue] = useState('');
    const [savingQty, setSavingQty] = useState(false);

    // Inline source bin edit
    const [editingBinItem, setEditingBinItem] = useState(null);
    const [editBinValue, setEditBinValue] = useState('');
    const [savingBin, setSavingBin] = useState(false);

    // GI Reversal
    const [showReverseDialog, setShowReverseDialog] = useState(false);
    const [isReversingGI, setIsReversingGI] = useState(false);

    // Product descriptions
    const { getDescription } = useProductDescription();

    // Create WT Modal State
    const [showWtModal, setShowWtModal] = useState(false);
    const [wtItemContext, setWtItemContext] = useState(null);
    const [wtLoading, setWtLoading] = useState(false);

    // Value Help State
    const [showTypeHelp, setShowTypeHelp] = useState(false);
    const [showBinHelp, setShowBinHelp] = useState(false);
    const [availableTypes, setAvailableTypes] = useState([]);
    const [availableBins, setAvailableBins] = useState([]);
    const [helpLoading, setHelpLoading] = useState(false);

    const [wtForm, setWtForm] = useState({
        TargetQuantityInBaseUnit: '',
        BaseUnit: '',
        DestinationStorageBin: '',
        DestinationStorageType: '',
        Product: ''
    });

    // Helper: strip leading zeros
    const stripZeros = (str) => str ? String(str).replace(/^0+/, '') || '0' : '';

    // Status helpers — handle both numeric EWM codes and letter codes
    const getGIStatusBadge = (status) => {
        const s = String(status).trim();
        switch (s) {
            case '1': return { text: 'GI Not Posted', bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' };
            case '2': return { text: 'GI In Process', bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' };
            case '3': return { text: 'GI Partial', bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' };
            case '9': return { text: 'GI Completed', bg: '#D1FAE5', color: '#065F46', border: '#A7F3D0' };
            case 'A': return { text: 'GI Not Posted', bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' };
            case 'B': return { text: 'GI Partial', bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' };
            case 'C': return { text: 'GI Completed', bg: '#D1FAE5', color: '#065F46', border: '#A7F3D0' };
            default: return { text: 'Unknown', bg: '#F3F4F6', color: '#374151', border: '#E5E7EB' };
        }
    };

    const getPickStatusBadge = (status) => {
        const s = String(status).trim();
        switch (s) {
            case '9': return { text: 'Picked', bg: '#D1FAE5', color: '#065F46', isPicked: true };
            case '3': return { text: 'Partially Picked', bg: '#FEF3C7', color: '#92400E', isPicked: false };
            case '2': case '1': return { text: 'In Process', bg: '#DBEAFE', color: '#1E40AF', isPicked: false };
            case '0': case '': default: return { text: 'Not Picked', bg: '#F3F4F6', color: '#374151', isPicked: false };
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        let d;
        if (typeof dateStr === 'string' && dateStr.startsWith('/Date(')) {
            const ts = parseInt(dateStr.replace(/\/Date\((.*?)\)\//, '$1'), 10);
            d = new Date(ts);
        } else {
            d = new Date(dateStr);
        }
        if (isNaN(d.getTime())) return dateStr;
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        return `${day}.${month}.${d.getFullYear()}`;
    };

    // ----- Data Loading -----
    useEffect(() => { loadData(); }, [warehouse, id, apiConfig]);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            // Step 1: Fetch OBD header (required first)
            const headRes = await api.fetchOutboundDeliveriesA2X(apiConfig, { warehouse, deliveryDocument: id });
            const heads = headRes.value || [];
            if (heads.length === 0) {
                setError('Outbound Delivery not found.');
                setLoading(false);
                return;
            }
            setDelivery(heads[0]);

            // Step 2: Fetch items, tasks, and HUs in PARALLEL
            const [itemsResult, wtResult, huResult] = await Promise.allSettled([
                api.fetchOutboundDeliveryItemsA2X(apiConfig, warehouse, id),
                api.fetchWarehouseTasks(apiConfig, { warehouse, deliveryDocument: id }),
                api.fetchHandlingUnits(apiConfig, { warehouse, referenceDocument: id }),
            ]);

            // Process items
            setItems((itemsResult.status === 'fulfilled' && itemsResult.value?.value) ? itemsResult.value.value : []);

            // Process warehouse tasks
            let tasks = (wtResult.status === 'fulfilled' && wtResult.value?.value) ? wtResult.value.value : [];

            // Merge HU-based tasks
            if (huResult.status === 'fulfilled' && huResult.value?.value?.length > 0) {
                try {
                    const handlingUnits = huResult.value.value.map(hu => hu.HandlingUnitExternalID);
                    const huWtRes = await api.fetchWarehouseTasks(apiConfig, { warehouse, handlingUnits });
                    if (huWtRes?.value?.length > 0) {
                        const existingWTs = new Set(tasks.map(t => t.WarehouseTask));
                        const newWTs = huWtRes.value.filter(t => !existingWTs.has(t.WarehouseTask));
                        tasks = [...tasks, ...newWTs];
                    }
                } catch (huWtErr) {
                    console.warn("Failed to fetch HU-based WTs:", huWtErr);
                }
            }

            setWarehouseTasks(tasks);
        } catch (err) {
            console.error("Failed to load OBD details:", err);
            setError("Failed to load delivery: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    // ----- Tasks per item -----
    const getTasksForItem = (item) => {
        return warehouseTasks.filter(t =>
            stripZeros(t.EWMDeliveryItem || t.EWMOutboundDeliveryOrderItem) === stripZeros(item.EWMOutboundDeliveryOrderItem) ||
            (t.Product && stripZeros(t.Product) === stripZeros(item.Product))
        );
    };

    // ----- Post GI -----
    const handlePostGI = async () => {
        // Check if all items are fully picked first
        const allPicked = items.every(item => {
            const pickBadge = getPickStatusBadge(item.PickingStatus || item.WarehouseProcessingStatus || '0');
            return pickBadge.isPicked;
        });

        if (!allPicked) {
            setError('Picking not completed. All items must be fully picked before posting Goods Issue.');
            return;
        }

        setIsPostingGI(true);
        setError(null);
        setSuccessMsg('');
        try {
            await api.postWarehouseGoodsIssue(apiConfig, id);
            setSuccessMsg("Goods Issue posted successfully!");
            loadData();
        } catch (err) {
            setError("Failed to post GI: " + err.message);
        } finally {
            setIsPostingGI(false);
        }
    };

    const handleSaveQty = async (item) => {
        if (!editQtyValue || isNaN(parseFloat(editQtyValue))) return;
        setSavingQty(true);
        try {
            await api.updateOBDItemQuantity(apiConfig, id, item.EWMOutboundDeliveryOrderItem, editQtyValue);
            setEditingQtyItem(null);
            await loadData();
        } catch (err) {
            setError('Failed to update quantity: ' + err.message);
        } finally {
            setSavingQty(false);
        }
    };

    const handleSaveBin = async (item) => {
        if (!editBinValue.trim()) return;
        setSavingBin(true);
        try {
            await api.updateOBDItemBin(apiConfig, id, item.EWMOutboundDeliveryOrderItem, editBinValue);
            setEditingBinItem(null);
            await loadData();
        } catch (err) {
            setError('Failed to update source bin: ' + err.message);
        } finally {
            setSavingBin(false);
        }
    };

    const handleReverseGI = async () => {
        setIsReversingGI(true);
        setShowReverseDialog(false);
        setError(null);
        try {
            await api.reverseWarehouseGoodsIssue(apiConfig, id);
            await loadData();
            setSuccessMsg('Goods Issue reversed successfully.');
        } catch (err) {
            setError('Failed to reverse GI: ' + err.message);
        } finally {
            setIsReversingGI(false);
        }
    };

    // ----- Create WT -----
    const handleCreateWtClick = (item) => {
        setWtItemContext(item);
        setWtForm({
            TargetQuantityInBaseUnit: parseFloat(item.OrderQuantityInBaseUnit || item.DeliveryQuantityInBaseUnit || item.ProductQuantity || 0),
            BaseUnit: item.BaseUnit || item.QuantityUnit || 'EA',
            DestinationStorageBin: '',
            DestinationStorageType: '',
            Product: item.Product || ''
        });
        setShowWtModal(true);
    };

    const handleCreateTask = async (e) => {
        e.preventDefault();
        setWtLoading(true);
        setError(null);
        setSuccessMsg('');

        try {
            const payload = {
                EWMWarehouse: warehouse,
                EWMDelivery: id,
                EWMDeliveryItem: wtItemContext.EWMOutboundDeliveryOrderItem,
                Product: wtForm.Product,
                TargetQuantityInBaseUnit: parseFloat(wtForm.TargetQuantityInBaseUnit) || 0,
                BaseUnit: wtForm.BaseUnit,
                DestinationStorageBin: wtForm.DestinationStorageBin || undefined,
                DestinationStorageType: wtForm.DestinationStorageType || undefined,
            };

            await api.createWarehouseTask(apiConfig, payload);
            setSuccessMsg(`Warehouse Task created successfully for Item ${stripZeros(wtItemContext.EWMOutboundDeliveryOrderItem)}`);
            setShowWtModal(false);
            loadData();
        } catch (err) {
            setError(extractSapMessage(err));
        } finally {
            setWtLoading(false);
        }
    };

    // ----- Value Help -----
    const handleOpenTypeHelp = async () => {
        if (showTypeHelp) { setShowTypeHelp(false); return; }
        setShowBinHelp(false);
        setShowTypeHelp(true);
        setHelpLoading(true);
        try {
            const res = await api.fetchStorageTypes(apiConfig, warehouse);
            setAvailableTypes(res.value || []);
        } catch (e) {
            setAvailableTypes([]);
        } finally {
            setHelpLoading(false);
        }
    };

    const handleOpenBinHelp = async () => {
        if (showBinHelp) { setShowBinHelp(false); return; }
        setShowTypeHelp(false);
        setShowBinHelp(true);
        setHelpLoading(true);
        try {
            const res = await api.fetchStorageBins(apiConfig, warehouse, wtForm.DestinationStorageType);
            setAvailableBins(res.value || []);
        } catch (e) {
            setAvailableBins([]);
        } finally {
            setHelpLoading(false);
        }
    };

    // Close dropdowns on outside click
    useEffect(() => {
        const handleClickOutside = (event) => {
            if ((showTypeHelp || showBinHelp) && !event.target.closest('.search-help-dropdown-container')) {
                setShowTypeHelp(false);
                setShowBinHelp(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showTypeHelp, showBinHelp]);

    // ----- Render: Tasks for item -----
    const renderTasksForItem = (item) => {
        const itemTasks = getTasksForItem(item);
        if (itemTasks.length === 0) {
            return <div className="text-xs text-gray-500 py-2">No warehouse tasks yet.</div>;
        }

        return (
            <div className="mt-3 space-y-2">
                <h4 className="text-sm font-extrabold text-[#0a2351] uppercase tracking-wide">Existing Tasks ({itemTasks.length})</h4>
                {itemTasks.map(t => (
                    <div key={t.WarehouseTask}
                        className="flex justify-between items-center bg-gray-50 border border-slate-200 p-2.5 rounded-md text-sm cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => navigate(`/warehouse-outbound/picking/${warehouse}/${t.WarehouseTask}/${t.WarehouseTaskItem}`)}
                    >
                        <div className="flex flex-col">
                            <span className="font-extrabold text-[#0a2351]">WT: {t.WarehouseTask}</span>
                            <span className="text-xs font-medium text-gray-500 mt-0.5">
                                {t.SourceStorageBin || 'Source'} ➔ {t.DestinationStorageBin || 'Pending'}
                            </span>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                            <span className="font-extrabold text-[#0a2351] tracking-wide">{parseFloat(t.TargetQuantityInBaseUnit)} {t.BaseUnit}</span>
                            <span style={{ backgroundColor: t.WarehouseTaskStatus === 'C' ? '#D1FAE5' : '#FEF3C7', color: t.WarehouseTaskStatus === 'C' ? '#065F46' : '#92400E' }}
                                className="font-bold px-2.5 py-1 rounded-full text-xs">
                                {t.WarehouseTaskStatus === 'C' ? 'Confirmed' : 'Open'}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    // ----- Render: Loading -----
    if (loading) {
        return (
            <div className="flex flex-col h-screen bg-gray-50 font-sans items-center justify-center">
                <Loader className="animate-spin text-brand-blue mb-4" size={48} />
                <p className="text-gray-500">Loading Delivery Details...</p>
            </div>
        );
    }

    // ----- Render: Not found -----
    if (!delivery) {
        return (
            <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
                <header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                <div className="flex justify-between items-center relative">
                    <button onClick={() => navigate('/warehouse-outbound/deliveries')} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
                                                <ArrowLeft size={20} className="text-white" />
                                            </button>
                    
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <h1 className="text-xl font-bold text-white tracking-wide">
                            Error
                        </h1>
                    </div>

                    <div></div>
                </div>
            </header>
                <div className="p-6 text-center text-red-500 mt-10">
                    <AlertCircle size={48} className="mx-auto mb-4 opacity-50" />
                    <p>{error || "Delivery not found"}</p>
                </div>
            </div>
        );
    }

    const giStatusBadge = getGIStatusBadge(delivery.GoodsIssueStatus || delivery.WarehouseProcessingStatus || '1');
    const shipTo = delivery.ShipToParty || delivery.ShipToPartyName || 'N/A';
    const plannedDate = formatDate(delivery.PlannedDeliveryUTCDateTime || delivery.DeliveryDate);

    return (
        <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
            {/* Header */}
            <header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                <div className="flex justify-between items-center relative">
                    <button
                                            onClick={() => navigate(-1)}
                                            className="z-10 w-10 h-10 p-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors shrink-0"
                                        >
                                            <ArrowLeft size={20} className="text-white" />
                                        </button>
                    
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <h1 className="text-xl font-bold text-white tracking-wide">
                            Delivery {id}
                        </h1>
                                                <p className="text-blue-200 text-[10px] font-medium uppercase tracking-wider mt-0.5">
                                                    Whse: {warehouse} • {items.length} {items.length === 1 ? 'Item' : 'Items'}
                                                </p>
                    </div>

                    <div></div>
                </div>
            </header>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto px-4 pb-20 pt-4 content-area" style={{ zIndex: 10, position: 'relative' }}>
                <div className="max-w-md mx-auto flex flex-col gap-4">

                    {/* Error/Success Banner */}
                    {(error || successMsg) && (
                        <div className="flex flex-col gap-2 mb-2" >
                            {error && (
                                <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-3 shadow-sm flex gap-3 items-start w-full">
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
                                <div className="bg-emerald-50 border-l-4 border-emerald-500 rounded-lg p-3 shadow-sm flex gap-3 items-start w-full">
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
                </div>
                    
                <div className="space-y-4 max-w-2xl mx-auto animate-in fade-in">

                    {/* Action Bar — Post GI / Reverse GI */}
                    <div className="gap-3 w-full mt-6 mb-2 flex">
                        {giStatusBadge.text !== 'GI Completed' ? (
                            <Button
                                disabled={isPostingGI || isReversingGI}
                                className="w-full"
                            >
                                {isPostingGI ? <Loader size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                                Post Goods Issue
                            </Button>
                        ) : (
                            <Button
                                onClick={() => setShowReverseDialog(true)}
                                disabled={isReversingGI}
                                variant="danger"
                                className="w-full"
                            >
                                {isReversingGI ? <Loader size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                                Reverse Goods Issue
                            </Button>
                        )}
                    </div>

                    {/* Delivery Summary Card */}
                    <div className="glass-card" style={{ padding: '1rem', borderRadius: '1rem', border: '1px solid #e2e8f0' }}>
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">Delivery</p>
                                <p className="text-lg font-bold text-slate-800">{id}</p>
                                <p className="text-sm text-slate-500 mt-0.5">Ship-To: <span className="font-semibold text-slate-700">{shipTo}</span></p>
                            </div>
                            <span style={{ color: giStatusBadge.color }}
                                className="font-bold text-xs">
                                {giStatusBadge.text}
                            </span>
                        </div>
                        <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-slate-100">
                            <div className="flex justify-between items-center">
                                <p className="text-xs text-slate-400">Planned Delivery</p>
                                <p className="font-bold text-slate-700">{plannedDate}</p>
                            </div>
                            <div className="flex justify-between items-center">
                                <p className="text-xs text-slate-400">Warehouse</p>
                                <p className="font-bold text-slate-700">{warehouse}</p>
                            </div>
                            <div className="flex justify-between items-center">
                                <p className="text-xs text-slate-400">Items</p>
                                <p className="font-bold text-slate-700">{items.length}</p>
                            </div>
                            <div className="flex justify-between items-center">
                                <p className="text-xs text-slate-400">Warehouse Tasks</p>
                                <p className="font-bold text-slate-700">{warehouseTasks.length}</p>
                            </div>
                        </div>
                    </div>

                    {/* Item Cards */}
                    {items.length === 0 ? (
                        <div className="text-center text-gray-400 py-10 glass-card mt-4" style={{ padding: '2.5rem 1rem', borderRadius: '1rem', border: '1px solid #e2e8f0' }}>
                            <Boxes size={48} className="mx-auto mb-3 opacity-20" />
                            <p>No items found in this delivery.</p>
                        </div>
                    ) : (
                        items.map((item) => {
                            const isExpanded = expandedItem === item.EWMOutboundDeliveryOrderItem;
                            const itemNum = parseInt(item.EWMOutboundDeliveryOrderItem, 10);
                            const pickBadge = getPickStatusBadge(item.PickingStatus || item.WarehouseProcessingStatus || '0');
                            const itemTasks = getTasksForItem(item);
                            const qty = parseFloat(item.OrderQuantityInBaseUnit || item.DeliveryQuantityInBaseUnit || item.ProductQuantity || 0);
                            const uom = item.BaseUnit || item.QuantityUnit || 'EA';

                            return (
                                <div key={item.EWMOutboundDeliveryOrderItem} className="glass-card overflow-hidden mt-4" style={{ borderRadius: '1rem', border: '1px solid #e2e8f0' }}>

                                    {/* Item Header Row */}
                                    <div
                                        className="p-4 flex items-start gap-4 cursor-pointer hover:bg-gray-50 transition-colors"
                                        onClick={() => setExpandedItem(isExpanded ? null : item.EWMOutboundDeliveryOrderItem)}
                                    >
                                        <div className="flex items-center justify-center text-brand-blue shrink-0 font-extrabold text-base w-8">
                                            {itemNum}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-extrabold text-[#0a2351] text-lg truncate tracking-tight">{stripZeros(item.Product)}</h3>
                                            <p className="text-sm text-gray-500 mt-0.5 font-medium">
                                                {getDescription(item.Product) || item.ProductName || item.ProductDescription || item.MaterialDescription || 'No description'} | Batch: {item.Batch || 'N/A'}
                                            </p>
                                            <div className="flex items-center gap-2 mt-3 text-sm">
                                                <span style={{ backgroundColor: pickBadge.bg, color: pickBadge.color }} className="font-bold px-2.5 py-1 rounded-full text-xs">
                                                    {pickBadge.text}
                                                </span>
                                                <span className="font-semibold text-gray-600">
                                                    {itemTasks.length} WT{itemTasks.length !== 1 ? 's' : ''}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end shrink-0 pl-2">
                                            {editingQtyItem === item.EWMOutboundDeliveryOrderItem ? (
                                                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                                    <input type="number" value={editQtyValue}
                                                        onChange={e => setEditQtyValue(e.target.value)}
                                                        className="w-20 p-1 border border-blue-300 rounded text-center text-sm font-bold"
                                                        autoFocus />
                                                    <button disabled={savingQty} onClick={() => handleSaveQty(item)}
                                                        className="p-1 bg-brand-blue text-white rounded text-xs">
                                                        {savingQty ? <Loader size={12} className="animate-spin" /> : 'OK'}
                                                    </button>
                                                    <button onClick={() => setEditingQtyItem(null)} className="p-1 text-gray-400"><X size={12} /></button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1">
                                                    <div className="font-extrabold text-[#0a2351] text-xl leading-tight">
                                                        {qty}
                                                        <span className="text-sm text-[#0a2351] font-bold ml-0.5">{uom}</span>
                                                    </div>
                                                    {giStatusBadge.text !== 'GI Completed' && (
                                                        <button onClick={e => { e.stopPropagation(); setEditingQtyItem(item.EWMOutboundDeliveryOrderItem); setEditQtyValue(String(qty)); }}
                                                            className="p-1 text-slate-400 hover:text-blue-600 ml-1" title="Edit quantity">
                                                            <Pencil size={13} />
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Expanded Details */}
                                    {isExpanded && (
                                                                                <div className="bg-slate-50/50 border-t border-slate-200 p-4 animate-in slide-in-from-top-2">

                                            {/* Source Bin row */}
                                            <div className="mb-3 flex items-center gap-2">
                                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider w-24 shrink-0">Source Bin</span>
                                                {editingBinItem === item.EWMOutboundDeliveryOrderItem ? (
                                                    <div className="flex items-center gap-1 flex-1">
                                                        <input type="text" value={editBinValue}
                                                            onChange={e => setEditBinValue(e.target.value.toUpperCase())}
                                                            className="flex-1 p-1.5 border border-blue-300 rounded text-sm font-mono uppercase"
                                                            autoFocus />
                                                        <button disabled={savingBin} onClick={() => handleSaveBin(item)}
                                                            className="px-2 py-1 bg-brand-blue text-white rounded text-xs">
                                                            {savingBin ? <Loader size={12} className="animate-spin" /> : 'Save'}
                                                        </button>
                                                        <button onClick={() => setEditingBinItem(null)} className="p-1 text-gray-400"><X size={12} /></button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1 flex-1">
                                                        <span className="text-sm font-medium text-slate-700 font-mono">{item.SourceStorageBin || item.EWMStorageBin || '—'}</span>
                                                        {giStatusBadge.text !== 'GI Completed' && (
                                                            <button onClick={(e) => { e.stopPropagation(); setEditingBinItem(item.EWMOutboundDeliveryOrderItem); setEditBinValue(item.SourceStorageBin || item.EWMStorageBin || ''); }}
                                                                className="p-1 text-slate-400 hover:text-blue-600" title="Edit source bin">
                                                                <Pencil size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Extra item fields */}
                                            <div className="flex flex-col gap-y-2 mb-4">
                                                {item.EWMStorageBin && (
                                                    <div>
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Storage Bin</p>
                                                        <p className="text-sm font-semibold text-gray-700">{item.EWMStorageBin}</p>
                                                    </div>
                                                )}
                                                {item.EWMStorageType && (
                                                    <div>
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Storage Type</p>
                                                        <p className="text-sm font-semibold text-gray-700">{item.EWMStorageType}</p>
                                                    </div>
                                                )}
                                                {item.HandlingUnitNumber && item.HandlingUnitNumber.replace(/^0+/, '') && (
                                                    <div>
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Handling Unit</p>
                                                        <p className="text-sm font-semibold text-gray-700">{stripZeros(item.HandlingUnitNumber)}</p>
                                                    </div>
                                                )}
                                                {item.EWMConsolidationGroup && (
                                                    <div>
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Consolidation Group</p>
                                                        <p className="text-sm font-semibold text-gray-700">{item.EWMConsolidationGroup}</p>
                                                    </div>
                                                )}
                                                {item.ShipToParty && (
                                                    <div>
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ship-To Party</p>
                                                        <p className="text-sm font-semibold text-gray-700">{item.ShipToParty}</p>
                                                    </div>
                                                )}
                                                {item.Route && (
                                                    <div>
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Route</p>
                                                        <p className="text-sm font-semibold text-gray-700">{item.Route}</p>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Task Context */}
                                            {renderTasksForItem(item)}

                                            {/* Actions - Create Task (disabled if fully picked) */}
                                            <div className="mt-4 pt-3 border-t border-gray-200">
                                                <button
                                                    disabled={pickBadge.isPicked}
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleCreateWtClick(item);
                                                    }}
                                                    className={`w-full py-2.5 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm ${pickBadge.isPicked
                                                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                                        : 'bg-brand-blue hover:opacity-90 text-white'
                                                        }`}
                                                >
                                                    <ListTodo size={16} /> {pickBadge.isPicked ? 'Fully Picked' : 'Create Task'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Create WT Modal */}
            {showWtModal && (
                <div className="fixed inset-0 z-[100] flex flex-col bg-white"
                    style={{ zIndex: 9999, paddingTop: 'max(env(safe-area-inset-top, 0px), 2.25rem)' }}>
                    {/* Modal Header */}
                    <div className="px-5 py-4 border-b flex justify-between items-center bg-gray-50 shrink-0">
                        <h2 className="text-lg font-bold text-gray-800">Create Task</h2>
                        <button onClick={() => setShowWtModal(false)} className="p-2 cursor-pointer hover:bg-gray-200 rounded-full transition-colors">
                            <X size={20} className="text-gray-500" />
                        </button>
                    </div>

                    {/* Modal Body */}
                    <div className="px-5 py-5 overflow-y-auto flex-1 pb-24">
                        <div className="bg-blue-50 text-blue-800 p-3 rounded-lg text-sm mb-5 font-medium border border-blue-100">
                            Item {parseInt(stripZeros(wtItemContext?.EWMOutboundDeliveryOrderItem), 10)}: {stripZeros(wtItemContext?.Product)}
                        </div>

                        <form id="createWtForm" onSubmit={handleCreateTask} className="flex flex-col gap-4">
                            <div className="flex flex-col gap-3">
                                <div>
                                    <Input
                                        label="Target Qty *"
                                        type="number"
                                        step="0.001"
                                        required
                                        value={wtForm.TargetQuantityInBaseUnit}
                                        onChange={(e) => setWtForm({ ...wtForm, TargetQuantityInBaseUnit: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <Input
                                        label="UoM *"
                                        type="text"
                                        required
                                        maxLength={3}
                                        value={wtForm.BaseUnit}
                                        onChange={(e) => setWtForm({ ...wtForm, BaseUnit: e.target.value.toUpperCase() })}
                                        className="uppercase"
                                    />
                                </div>
                            </div>

                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 mt-2 space-y-3">
                                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Destination Settings (Optional)</h4>
                                <div className="relative search-help-dropdown-container">
                                    <Input
                                        label="Storage Type"
                                        maxLength={4}
                                        placeholder="e.g. Y011"
                                        value={wtForm.DestinationStorageType}
                                        onChange={(e) => setWtForm({ ...wtForm, DestinationStorageType: e.target.value.toUpperCase() })}
                                        onClick={handleOpenTypeHelp}
                                        className="uppercase"
                                        rightIcon={
                                            <button type="button" onClick={handleOpenTypeHelp}
                                                className="px-3 flex items-center justify-center bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors h-full border-l border-slate-200 rounded-r-lg">
                                                <ChevronDown size={18} />
                                            </button>
                                        }
                                    />
                                    {showTypeHelp && (
                                        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                                            {helpLoading ? (
                                                <div className="flex justify-center p-4"><Loader className="animate-spin text-blue-500" size={20} /></div>
                                            ) : availableTypes.length === 0 ? (
                                                <div className="p-3 text-center text-sm text-slate-500">No types found.</div>
                                            ) : (
                                                availableTypes.map((type, idx) => (
                                                    <div key={type.EWMStorageType}
                                                        onClick={() => { setWtForm({ ...wtForm, DestinationStorageType: type.EWMStorageType }); setShowTypeHelp(false); }}
                                                        className={`p-3 cursor-pointer hover:bg-blue-50 ${idx < availableTypes.length - 1 ? 'border-b border-slate-100' : ''}`}>
                                                        <div className="font-bold text-slate-800 text-sm">{type.EWMStorageType}</div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="relative search-help-dropdown-container">
                                    <Input
                                        label="Storage Bin"
                                        placeholder="e.g. GI-AREA"
                                        value={wtForm.DestinationStorageBin}
                                        onChange={(e) => setWtForm({ ...wtForm, DestinationStorageBin: e.target.value.toUpperCase() })}
                                        onClick={handleOpenBinHelp}
                                        className="uppercase"
                                        rightIcon={
                                            <button type="button" onClick={handleOpenBinHelp}
                                                className="px-3 flex items-center justify-center bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors h-full border-l border-slate-200 rounded-r-lg">
                                                <ChevronDown size={18} />
                                            </button>
                                        }
                                    />
                                    {showBinHelp && (
                                        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                                            {helpLoading ? (
                                                <div className="flex justify-center p-4"><Loader className="animate-spin text-blue-500" size={20} /></div>
                                            ) : availableBins.length === 0 ? (
                                                <div className="p-3 text-center text-sm text-slate-500">No bins found.</div>
                                            ) : (
                                                availableBins.map((bin, idx) => (
                                                    <div key={bin.EWMStorageBin}
                                                        onClick={() => { setWtForm({ ...wtForm, DestinationStorageBin: bin.EWMStorageBin }); setShowBinHelp(false); }}
                                                        className={`p-3 cursor-pointer hover:bg-blue-50 ${idx < availableBins.length - 1 ? 'border-b border-slate-100' : ''}`}>
                                                        <div className="font-bold text-slate-800 text-sm">{bin.EWMStorageBin}</div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </form>
                    </div>

                    {/* Modal Footer */}
                    <div className="border-t p-4 bg-gray-50 shrink-0">
                        <Button form="createWtForm" type="submit" disabled={wtLoading}
                            className="w-full">
                            {wtLoading ? <Loader size={18} className="animate-spin" /> : <Plus size={18} />}
                            {wtLoading ? 'Creating...' : 'Create Warehouse Task'}
                        </Button>
                    </div>
                </div>
            )}

            {/* Reverse GI Confirmation Dialog */}
            {showReverseDialog && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 px-6">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <RotateCcw size={24} className="text-red-500" />
                            <h3 className="text-lg font-bold text-slate-800">Reverse Goods Issue?</h3>
                        </div>
                        <p className="text-sm text-slate-600 mb-6">
                            This will reverse the posted Goods Issue for delivery <strong>{id}</strong>. This action cannot be undone without re-posting.
                        </p>
                        <div className="flex gap-3">
                            <Button onClick={() => setShowReverseDialog(false)}
                                variant="secondary"
                                className="flex-1">
                                Cancel
                            </Button>
                            <Button onClick={handleReverseGI}
                                variant="danger"
                                className="flex-1">
                                Reverse GI
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OutboundDeliveryDetail;
