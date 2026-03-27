/**
 * @file InboundDeliveryDetail.jsx
 * @description Screen: Inbound Delivery Detail & Goods Receipt Posting (INB 10/20)
 *
 * Displays all line items of a SAP inbound delivery and allows the operator to
 * post a Goods Receipt (GR) against it. Key features:
 *  - Editable actual quantities per line item
 *  - Over/under-delivery detection with tolerance checks
 *  - CSRF token handling for the SAP PATCH/POST call
 *  - Support for partial GR posting (specific items can be excluded)
 *
 * ## SAP Process Flow
 *   InboundDeliverySearch → InboundDeliveryDetail → Post GR (SAP MIGO equivalent)
 *
 * @route /warehouse-inbound/deliveries/:warehouse/:id
 */
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Home, PackageCheck, AlertCircle, Loader, Boxes, FileText, Plus, X, ListTodo, CheckCircle, ArrowLeft, PackageOpen, ChevronDown, Pencil, RotateCcw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api, getHeaders, getProxyUrl } from '../../services/api';
import { useSwipeBack } from '../../hooks/useSwipeBack';
import { useProductDescription } from '../../hooks/useProductDescription';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

const InboundDeliveryDetail = () => {
    const { warehouse, id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { apiConfig } = useAuth();

    useSwipeBack(() => {
        if (!showWtModal && !showBinPrompt) {
            navigate(-1);
        }
    });

    const [activeTab, setActiveTab] = useState('items'); // 'header' | 'items'
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');

    const [delivery, setDelivery] = useState(null);
    const [imDelivery, setImDelivery] = useState(null);
    const [warehouseTasks, setWarehouseTasks] = useState([]);
    const [expandedItem, setExpandedItem] = useState(null);

    // Modal State
    const [showWtModal, setShowWtModal] = useState(false);
    const [wtItemContext, setWtItemContext] = useState(null);
    const [wtLoading, setWtLoading] = useState(false);
    const [wtError, setWtError] = useState(null);
    const [isPostingGR, setIsPostingGR] = useState(false);
    const [showBinPrompt, setShowBinPrompt] = useState(false);
    const [globalBin, setGlobalBin] = useState('');

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
        DestinationStorageSection: '',
        Product: ''
    });

    // Pack & Create Task mode flag
    const [isPackMode, setIsPackMode] = useState(false);

    // Inline quantity edit
    const [editingQtyItem, setEditingQtyItem] = useState(null); // item id being edited
    const [editQtyValue, setEditQtyValue] = useState('');
    const [savingQty, setSavingQty] = useState(false);

    // Inline receiving bin edit
    const [editingBinItem, setEditingBinItem] = useState(null);
    const [editBinValue, setEditBinValue] = useState('');
    const [savingBin, setSavingBin] = useState(false);

    // GR Reversal
    const [showReverseDialog, setShowReverseDialog] = useState(false);
    const [isReversingGR, setIsReversingGR] = useState(false);

    // Product descriptions
    const { getDescription } = useProductDescription();

    useEffect(() => {
        loadData();
    }, [warehouse, id, apiConfig]);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            // Step 1: Load delivery header (required first)
            const filters = { warehouse, deliveryDocument: id };
            const res = await api.fetchInboundDeliveriesA2X(apiConfig, filters);
            if (!res?.value?.length) {
                setError('Inbound Delivery not found.');
                setLoading(false);
                return;
            }
            const fetchedDelivery = res.value[0];

            // Step 2: Run ALL secondary fetches in PARALLEL for speed
            const [imResult, itemsResult, wtResult, huResult] = await Promise.allSettled([
                api.fetchIMInboundDeliveryHeader(apiConfig, id),
                api.fetchInboundDeliveryItemsA2X(apiConfig, warehouse, id),
                api.fetchWarehouseTasks(apiConfig, { warehouse, deliveryDocument: id }),
                api.fetchHandlingUnits(apiConfig, { warehouse, referenceDocument: id }),
            ]);

            // Process IM header
            if (imResult.status === 'fulfilled' && imResult.value?.d) {
                setImDelivery(imResult.value.d);
            }

            // Process items
            fetchedDelivery._WhseInbDeliveryItem =
                (itemsResult.status === 'fulfilled' && itemsResult.value?.value) ? itemsResult.value.value : [];

            setDelivery(fetchedDelivery);

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
            console.error("Failed to load IBD details:", err);
            setError("Failed to load delivery: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateWtClick = (item, packMode = false) => {
        setWtItemContext(item);
        setWtError(null);
        setIsPackMode(packMode);
        setWtForm({
            TargetQuantityInBaseUnit: item.ProductQuantity || '',
            BaseUnit: item.QuantityUnit || '',
            DestinationStorageBin: '',
            DestinationStorageType: '',
            DestinationStorageSection: '',
            Product: item.Product || '',
            PackagingMaterial: '37',
        });
        setShowWtModal(true);
    };

    const handleCreateTask = async (e) => {
        e.preventDefault();
        setWtLoading(true);
        setWtError(null);
        setError(null);
        setSuccessMsg('');

        try {
            let huExternalID = null;

            // ======= PACK MODE: Create HU first =======
            if (isPackMode) {
                if (!wtForm.DestinationStorageBin) {
                    throw new Error('Destination Bin is required for Pack & Create Task.');
                }

                // Step 1: Get CSRF Token for HU API
                const huBaseUrl = api.getHUUrl(apiConfig);
                const tokenUrl = getProxyUrl(`${huBaseUrl}/HandlingUnit`);
                const tokenHeaders = { ...getHeaders(apiConfig), 'x-csrf-token': 'Fetch' };
                const tokenRes = await fetch(tokenUrl, { method: 'GET', headers: tokenHeaders });
                const csrfToken = tokenRes.headers.get('x-csrf-token')
                    || tokenRes.headers.get('X-CSRF-Token')
                    || tokenRes.headers.get('X-Csrf-Token');
                await tokenRes.text(); // consume body
                const postHeaders = getHeaders(apiConfig);
                if (csrfToken) postHeaders['x-csrf-token'] = csrfToken;

                // Step 2: Create empty HU with the Destination Bin
                // Fields per YAML: StorageBin, StorageType (NOT EWM-prefixed)
                const createHUPayload = {
                    HandlingUnitExternalID: '$1',
                    Warehouse: warehouse,
                    PackagingMaterial: wtForm.PackagingMaterial || '37',
                    StorageBin: wtForm.DestinationStorageBin,
                };
                if (wtForm.DestinationStorageType) {
                    createHUPayload.StorageType = wtForm.DestinationStorageType;
                }
                const createUrl = getProxyUrl(`${huBaseUrl}/HandlingUnit`);
                console.log('[Pack&Create] Creating HU:', JSON.stringify(createHUPayload));

                const createRes = await fetch(createUrl, {
                    method: 'POST',
                    headers: postHeaders,
                    body: JSON.stringify(createHUPayload),
                });
                if (!createRes.ok) {
                    const errText = await createRes.text();
                    let msg = `Failed to create HU (${createRes.status})`;
                    try { const e = JSON.parse(errText); msg = e?.error?.message || e?.error?.details?.[0]?.message || msg; } catch (_) { }
                    throw new Error(msg);
                }
                const createData = await createRes.json();
                const huExtID = createData.HandlingUnitExternalID;
                if (!huExtID) throw new Error('HU created but no ID returned.');
                huExternalID = huExtID;
                console.log('[Pack&Create] Created HU:', huExternalID);
            }

            // ======= CREATE WAREHOUSE TASK =======
            const payload = {
                EWMWarehouse: warehouse,
                EWMDelivery: id,
                EWMDeliveryItem: wtItemContext.EWMInboundDeliveryItem,
                Product: wtForm.Product,
                TargetQuantityInBaseUnit: parseFloat(wtForm.TargetQuantityInBaseUnit) || 0,
                BaseUnit: wtForm.BaseUnit,
                WarehouseProcessType: 'S310',
            };

            // Only include destination fields if they have actual values
            if (wtForm.DestinationStorageBin) payload.DestinationStorageBin = wtForm.DestinationStorageBin;
            if (wtForm.DestinationStorageType) payload.DestinationStorageType = wtForm.DestinationStorageType;
            if (wtForm.DestinationStorageSection) payload.DestinationStorageSection = wtForm.DestinationStorageSection;

            // If Pack & Create mode, pass the created HU as DestinationHandlingUnit and SourceHandlingUnit
            if (isPackMode && huExternalID) {
                payload.DestinationHandlingUnit = huExternalID;
                payload.SourceHandlingUnit = huExternalID;
            }

            await api.createWarehouseTask(apiConfig, payload);

            const huMsg = isPackMode && huExternalID ? ` | HU: ${huExternalID}` : '';
            setSuccessMsg(`Warehouse Task created successfully for Item ${wtItemContext.EWMInboundDeliveryItem}${huMsg}`);
            setShowWtModal(false);

            // Reload WTs to reflect the new task
            const wtRes = await api.fetchWarehouseTasks(apiConfig, { warehouse, deliveryDocument: id });
            let tasks = (wtRes && wtRes.value) ? wtRes.value : [];

            try {
                const huRes = await api.fetchHandlingUnits(apiConfig, { warehouse, referenceDocument: id });
                if (huRes && huRes.value && huRes.value.length > 0) {
                    const handlingUnits = huRes.value.map(hu => hu.HandlingUnitExternalID);
                    const huWtRes = await api.fetchWarehouseTasks(apiConfig, { warehouse, handlingUnits });
                    if (huWtRes && huWtRes.value && huWtRes.value.length > 0) {
                        const existingWTs = new Set(tasks.map(t => t.WarehouseTask));
                        const newWTs = huWtRes.value.filter(t => !existingWTs.has(t.WarehouseTask));
                        tasks = [...tasks, ...newWTs];
                    }
                }
            } catch (huErr) {
                console.warn("Failed to reload Handling Units for WT fallback:", huErr);
            }

            setWarehouseTasks(tasks);
        } catch (err) {
            // Show error inside the modal so user can see it
            setWtError(err.message);
        } finally {
            setWtLoading(false);
        }
    };

    const handleOpenTypeHelp = async () => {
        if (showTypeHelp) {
            setShowTypeHelp(false);
            return;
        }
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

    const handleSelectType = (type) => {
        setWtForm({ ...wtForm, DestinationStorageType: type.EWMStorageType });
        setShowTypeHelp(false);
    };

    const handleOpenBinHelp = async () => {
        if (showBinHelp) {
            setShowBinHelp(false);
            return;
        }
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

    const handleSelectBin = (bin) => {
        setWtForm({ ...wtForm, DestinationStorageBin: bin.EWMStorageBin });
        setShowBinHelp(false);
    };

    // ===== PACK (CREATE HU) HANDLERS =====
    // Pack logic is now integrated into handleCreateTask when isPackMode is true






    // Click outside handler for dropdowns
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

    const handlePostGRClick = () => {
        const items = delivery?._WhseInbDeliveryItem || [];
        const missingBinItems = items.filter(i => !i.GoodsMovementBin);

        if (missingBinItems.length > 0) {
            setShowBinPrompt(true);
        } else {
            executePostGR();
        }
    };

    const executePostGR = async (e) => {
        if (e) e.preventDefault();

        setIsPostingGR(true);
        setError(null);
        setSuccessMsg('');
        setShowBinPrompt(false);

        try {
            const itemsToUpdate = delivery._WhseInbDeliveryItem.filter(i => !i.GoodsMovementBin);

            if (globalBin && itemsToUpdate.length > 0) {
                // Sequentially patch items missing a bin
                for (const item of itemsToUpdate) {
                    await api.updateWarehouseInboundDeliveryItem(
                        apiConfig,
                        warehouse,
                        id,
                        item.EWMInboundDeliveryItem,
                        { GoodsMovementBin: globalBin.toUpperCase() }
                    );
                }
            }

            // Fire the Action
            await api.postWarehouseGoodsReceipt(apiConfig, warehouse, id);

            // Reload data FIRST so GR status updates before user can interact
            await loadData();

            setSuccessMsg("Goods Receipt posted successfully!");
            setGlobalBin('');

        } catch (err) {
            setError("Failed to post GR: " + err.message);
        } finally {
            setIsPostingGR(false);
        }
    };

    // Render logic for WTs belonging to a specific item
    const stripZeros = (str) => str ? String(str).replace(/^0+/, '') : '';

    const handleSaveQty = async (item) => {
        if (!editQtyValue || isNaN(parseFloat(editQtyValue))) return;
        setSavingQty(true);
        try {
            await api.updateIBDItemQuantity(apiConfig, warehouse, id, item.EWMInboundDeliveryItem, editQtyValue);
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
            await api.updateIBDItemBin(apiConfig, warehouse, id, item.EWMInboundDeliveryItem, editBinValue);
            setEditingBinItem(null);
            await loadData();
        } catch (err) {
            setError('Failed to update bin: ' + err.message);
        } finally {
            setSavingBin(false);
        }
    };

    const handleReverseGR = async () => {
        setIsReversingGR(true);
        setShowReverseDialog(false);
        setError(null);
        try {
            await api.reverseWarehouseGoodsReceipt(apiConfig, id);
            await loadData();
            setSuccessMsg('Goods Receipt reversed successfully.');
        } catch (err) {
            setError('Failed to reverse GR: ' + err.message);
        } finally {
            setIsReversingGR(false);
        }
    };

    const getTasksForItem = (item) => {
        return warehouseTasks.filter(t =>
            stripZeros(t.EWMDeliveryItem) === stripZeros(item.EWMInboundDeliveryItem) ||
            (t.IsHandlingUnitWarehouseTask && t.Product && stripZeros(t.Product) === stripZeros(item.Product))
        );
    };

    const renderTasksForItem = (item) => {
        const itemTasks = getTasksForItem(item);
        if (itemTasks.length === 0) {
            return <div className="text-xs text-gray-500 py-2">No Task pending for confirmation .</div>;
        }

        return (
            <div className="mt-3 space-y-2">
                <h4 className="text-sm font-extrabold text-[#0a2351] uppercase tracking-wide">Existing Tasks ({itemTasks.length})</h4>
                {itemTasks.map(t => (
                    <div key={t.WarehouseTask} className="flex justify-between items-center bg-gray-50 border border-slate-200 p-2.5 rounded-md text-sm">
                        <div className="flex flex-col">
                            <span className="font-extrabold text-[#0a2351]">WT: {t.WarehouseTask}</span>
                            <span className="text-xs font-medium text-gray-500 mt-0.5">
                                {t.SourceStorageBin || 'ZONE'} ➔ {t.DestinationStorageBin || 'Pending'}
                            </span>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                            <span className="font-extrabold text-[#0a2351] tracking-wide">{parseFloat(t.TargetQuantityInBaseUnit)} {t.BaseUnit}</span>
                            <span className={`font-bold px-2 py-0.5 rounded text-xs ${t.WarehouseTaskStatus === 'C' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
                                }`}>
                                {t.WarehouseTaskStatus === 'C' ? 'Confirmed' : 'Open'}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="flex flex-col h-screen bg-gray-50 font-sans items-center justify-center">
                <Loader className="animate-spin text-brand-blue mb-4" size={48} />
                <p className="text-gray-500">Loading Delivery Details...</p>
            </div>
        );
    }

    if (!delivery) {
        return (
            <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
                <header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                <div className="flex justify-between items-center relative">
                    <button onClick={() => navigate(-1)} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" title="Back">
                                                <ArrowLeft size={20} className="text-white" />
                                            </button>
                    
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <h1 className="text-xl font-bold text-white tracking-wide">
                            Error
                        </h1>
                    </div>

                    <button onClick={() => navigate('/menu', { replace: true })} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" title="Home">
                                                <Home size={20} className="text-white" />
                                            </button>
                </div>
            </header>
                <div className="p-6 text-center text-red-500 mt-10">
                    <AlertCircle size={48} className="mx-auto mb-4 opacity-50" />
                    <p>{error || "Delivery not found"}</p>
                </div>
            </div>
        );
    }

    const items = delivery._WhseInbDeliveryItem || [];

    // Helper functions for IM data mapping
    const getSupplierName = () => {
        if (imDelivery && imDelivery.to_DeliveryDocumentPartner && imDelivery.to_DeliveryDocumentPartner.results) {
            // Check for LF Partner Function based on OData structure
            const lfPartner = imDelivery.to_DeliveryDocumentPartner.results.find(p => p.PartnerFunction === 'LF');
            if (lfPartner) {
                return lfPartner.Supplier || lfPartner.Customer || delivery.Supplier || 'N/A';
            }
        }
        return delivery.Supplier || 'N/A';
    };

    const formatDDMMYYYY = (dateStr) => {
        if (!dateStr) return 'N/A';
        let d;
        if (typeof dateStr === 'string' && dateStr.startsWith('/Date(')) {
            const ts = parseInt(dateStr.replace(/\/Date\((.*?)\)\//, '$1'), 10);
            d = new Date(ts);
        } else {
            d = new Date(dateStr);
        }
        if (isNaN(d.getTime())) return 'N/A';
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        return `${day}.${month}.${d.getFullYear()}`;
    };

    const getBadgeProps = (status) => {
        switch (status) {
            case 'C': case '9': return { text: 'Complete', class: 'bg-green-100 text-green-800 border-green-200' };
            case 'B': case '1': return { text: 'Partial', class: 'bg-orange-100 text-orange-800 border-orange-200' };
            case 'A': case '0': default: return { text: 'Not started', class: 'bg-gray-100 text-gray-800 border-gray-200' };
        }
    };

    const getPutawayBadgeProps = (status) => {
        switch (status) {
            case '9': return { text: 'Completed', class: 'bg-green-100 text-green-800 border-transparent' };
            case '1': return { text: 'In Process', class: 'bg-orange-100 text-orange-800 border-transparent' };
            case '0': default: return { text: 'Not Started', class: 'bg-gray-100 text-gray-800 border-transparent' };
        }
    };

    const statusObj = getBadgeProps(imDelivery?.OverallGoodsMovementStatus || delivery.OverallGoodsReceiptStatus || 'A');
    const totalItemsCount = imDelivery?.to_DeliveryDocumentItem?.results?.length || items.length;

    const navigateBack = () => {
        navigate('/warehouse-inbound/deliveries/list', { state: location.state });
    }

    return (
        <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
            {/* Standard Header */}
            <header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                <div className="flex justify-between items-center relative">
                    <button
                                            onClick={navigateBack}
                                            className="z-10 w-10 h-10 p-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                                            title="Back"
                                        >
                                            <ArrowLeft size={20} className="text-white" />
                                        </button>
                    
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <h1 className="text-xl font-bold text-white tracking-wide">
                            Delivery {id}
                        </h1>
                                                <p className="text-blue-200 text-[10px] font-medium uppercase tracking-wider mt-0.5">
                                                    Whse: {warehouse} • {totalItemsCount} {totalItemsCount === 1 ? 'Item' : 'Items'}
                                                </p>
                    </div>

                    <div></div>
                </div>
            </header>

            {/* Content Body */}
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

                    {/* Action Bar — Post GR / Reverse GR */}
                    <div className=" gap-3 w-full mt-6 mb-2 w-full">
                        <button
                            onClick={() => {
                                if (statusObj.text === 'Complete') {
                                    setShowReverseDialog(true);
                                } else {
                                    handlePostGRClick();
                                }
                            }}
                            disabled={isPostingGR || isReversingGR}
                            className={`w-full bg-brand-blue hover:bg-opacity-90 text-white font-bold py-3.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-[0.98] ${statusObj.text === 'Complete'
                                ? isReversingGR
                                    ? 'opacity-50 cursor-not-allowed'
                                    : 'bg-red-600 hover:bg-red-700'
                                : isPostingGR
                                    ? 'opacity-50 cursor-wait'
                                    : ''
                                }`}
                        >
                            {isPostingGR || isReversingGR
                                ? <Loader size={16} className="animate-spin" />
                                : statusObj.text === 'Complete'
                                    ? <RotateCcw size={16} />
                                    : <CheckCircle size={16} />}
                            {statusObj.text === 'Complete' ? 'Reverse Goods Receipt' : 'Post Goods Receipt'}
                        </button>
                    </div>

                    {/* Items */}
                    {items.length === 0 ? (
                        <div className="text-center text-gray-400 py-10 glass-card" style={{ padding: '2.5rem 1rem', borderRadius: '1rem', border: '1px solid #e2e8f0' }}>
                            <Boxes size={48} className="mx-auto mb-3 opacity-20" />
                            <p>No items found in this delivery.</p>
                        </div>
                    ) : (
                        items.map((item) => {
                            const isExpanded = expandedItem === item.EWMInboundDeliveryItem;
                            return (
                                <div key={item.EWMInboundDeliveryItem} className="glass-card overflow-hidden" style={{ borderRadius: '1rem', border: '1px solid #e2e8f0' }}>

                                    {/* Item Header Row */}
                                    <div
                                        className="p-4 flex items-start gap-4 cursor-pointer hover:bg-gray-50 transition-colors"
                                        onClick={() => setExpandedItem(isExpanded ? null : item.EWMInboundDeliveryItem)}
                                    >
                                        <div className="flex items-center justify-center text-brand-blue shrink-0 font-extrabold text-base w-8">
                                            {parseInt(item.EWMInboundDeliveryItem, 10)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-extrabold text-[#0a2351] text-lg truncate tracking-tight">{item.Product}</h3>
                                            <p className="text-sm text-gray-500 mt-0.5 font-medium">
                                                {getDescription(item.Product) || item.ProductDescription || item.MaterialDescription || 'No description'} | Batch: {item.Batch || 'N/A'}
                                            </p>
                                            <div className="flex items-center gap-2 mt-3 text-sm">
                                                <span className={`font-bold px-2 py-0.5 rounded ${getPutawayBadgeProps(item.PutawayStatus || '0').class}`}>
                                                    {getPutawayBadgeProps(item.PutawayStatus || '0').text}
                                                </span>
                                                <span className="font-semibold text-gray-600">
                                                    {getTasksForItem(item).length} WT{getTasksForItem(item).length !== 1 ? 's' : ''}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end shrink-0 pl-2">
                                            {editingQtyItem === item.EWMInboundDeliveryItem ? (
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
                                                        {parseFloat(item.ProductQuantity)}
                                                        <span className="text-sm text-[#0a2351] font-bold ml-0.5">{item.QuantityUnit}</span>
                                                    </div>
                                                    {statusObj.text !== 'Complete' && (
                                                        <button onClick={e => { e.stopPropagation(); setEditingQtyItem(item.EWMInboundDeliveryItem); setEditQtyValue(String(parseFloat(item.ProductQuantity))); }}
                                                            className="p-1 text-slate-400 hover:text-blue-600 ml-1" title="Edit quantity">
                                                            <Pencil size={13} />
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Expanded Details & Tasks */}
                                    {isExpanded && (
                                        <div className="bg-slate-50/50 border-t border-slate-200 p-4 animate-in slide-in-from-top-2">
                                            {/* Receiving Bin row */}
                                            <div className="mb-3 flex items-center gap-2">
                                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider w-24 shrink-0">Receiving Bin</span>
                                                {editingBinItem === item.EWMInboundDeliveryItem ? (
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
                                                        <span className="text-sm font-medium text-slate-700 font-mono">{item.DestinationStorageBin || item.GoodsMovementBin || '—'}</span>
                                                        {statusObj.text !== 'Complete' && (
                                                            <button onClick={() => { setEditingBinItem(item.EWMInboundDeliveryItem); setEditBinValue(item.DestinationStorageBin || item.GoodsMovementBin || ''); }}
                                                                className="p-1 text-slate-400 hover:text-blue-600" title="Edit receiving bin">
                                                                <Pencil size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            {/* Task Context */}
                                            {renderTasksForItem(item)}

                                            {/* Actions */}
                                            <div className="mt-4 pt-3 border-t border-gray-200 flex gap-3">
                                                {/* Create Task — require GR posted first, hide when putaway is fully completed */}
                                                {item.PutawayStatus !== '9' && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            if (statusObj.text !== 'Complete') {
                                                                setError('Please post Goods Receipt (GR) first before creating a Warehouse Task.');
                                                                return;
                                                            }
                                                            handleCreateWtClick(item, false);
                                                        }}
                                                        className="flex-1 py-2.5 bg-brand-blue hover:opacity-90 text-white text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm"
                                                    >
                                                        <ListTodo size={16} /> Create Task
                                                    </button>
                                                )}
                                                {/* Pack & Create Task — require GR posted first */}
                                                {item.PutawayStatus !== '9' && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            if (statusObj.text !== 'Complete') {
                                                                setError('Please post Goods Receipt (GR) first before creating a Warehouse Task.');
                                                                return;
                                                            }
                                                            handleCreateWtClick(item, true);
                                                        }}
                                                        className="flex-1 py-2.5 bg-brand-blue hover:opacity-90 text-white text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm"
                                                    >
                                                        <PackageOpen size={16} /> Pack & Create Task
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )
                                    }
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Create WT Modal (INB 31) — rendered via portal to escape stacking context */}
            {
                showWtModal && createPortal(
                    <div className="fixed inset-0 flex flex-col bg-white"
                        style={{ zIndex: 9999, paddingTop: 'max(env(safe-area-inset-top, 0px), 2.25rem)' }}>
                        {/* Modal Header */}
                        <div className="px-5 py-4 border-b flex justify-between items-center bg-gray-50 shrink-0">
                            <h2 className="text-lg font-bold text-gray-800">{isPackMode ? 'Pack & Create Task' : 'Create Task'}</h2>
                            <button onClick={() => setShowWtModal(false)} className="p-2 cursor-pointer hover:bg-gray-200 rounded-full transition-colors">
                                <X size={20} className="text-gray-500" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 overflow-y-auto p-0">
                            <div className="px-5 py-5 pb-28">
                                <div className="bg-blue-50 text-blue-800 px-4 py-3 rounded-lg text-sm mb-5 font-medium border border-blue-100 flex items-center gap-2">
                                    <span className="font-bold text-blue-900">Item {parseInt(wtItemContext?.EWMInboundDeliveryItem, 10)}:</span>
                                    <span className="truncate font-semibold">{wtItemContext?.Product}</span>
                                </div>

                                {/* Error inside modal */}
                                {wtError && (
                                    <div className="bg-red-50 border-l-4 border-red-600 rounded-lg p-4 mb-5 flex gap-3 items-start shadow-sm">
                                        <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={20} />
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-xs font-bold text-red-800 uppercase tracking-wider mb-1">Error</h4>
                                            <p className="text-sm text-red-700">{wtError}</p>
                                        </div>
                                        <button onClick={() => setWtError(null)} className="p-1 hover:bg-red-100 rounded-md shrink-0 transition-colors">
                                            <X size={16} className="text-red-400" />
                                        </button>
                                    </div>
                                )}

                                <form id="createWtForm" onSubmit={handleCreateTask} className="flex flex-col gap-4">
                                    {/* Target Qty — full width, UOM shown inline as label suffix */}
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
                                                className="uppercase"
                                                value={wtForm.BaseUnit}
                                                onChange={(e) => setWtForm({ ...wtForm, BaseUnit: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    {/* Packaging Material — only shown in Pack mode */}
                                    {isPackMode && (
                                        <div>
                                            <Input
                                                label="Packaging Material *"
                                                type="text"
                                                required
                                                placeholder="e.g. 37"
                                                value={wtForm.PackagingMaterial}
                                                onChange={(e) => setWtForm({ ...wtForm, PackagingMaterial: e.target.value })}
                                            />
                                        </div>
                                    )}

                                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mt-3 space-y-4">
                                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Destination Settings (Optional)</h4>
                                        <div className="search-help-dropdown-container relative">
                                            <Input
                                                label="Storage Type"
                                                maxLength={4}
                                                placeholder="e.g. Y011"
                                                className="uppercase"
                                                value={wtForm.DestinationStorageType}
                                                onChange={(e) => setWtForm({ ...wtForm, DestinationStorageType: e.target.value.toUpperCase() })}
                                                onClick={handleOpenTypeHelp}
                                                rightIcon={
                                                    <button
                                                        type="button"
                                                        onClick={handleOpenTypeHelp}
                                                        className="px-3 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-gray-50 border-l border-gray-200 transition-colors h-full"
                                                    >
                                                        <ChevronDown size={16} />
                                                    </button>
                                                }
                                            />
                                            {/* Type Help Dropdown */}
                                            {showTypeHelp && (
                                                <div className="mt-1 absolute w-full z-50 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                                    {helpLoading ? (
                                                        <div className="flex justify-center p-4"><Loader className="animate-spin text-blue-500" size={20} /></div>
                                                    ) : availableTypes.length === 0 ? (
                                                        <div className="p-3 text-center text-sm text-slate-500">No types found.</div>
                                                    ) : (
                                                        availableTypes.map((type, idx) => (
                                                            <div
                                                                key={type.EWMStorageType}
                                                                onClick={() => handleSelectType(type)}
                                                                className={`p-3 cursor-pointer hover:bg-blue-50 ${idx < availableTypes.length - 1 ? 'border-b border-slate-100' : ''}`}
                                                            >
                                                                <div className="font-bold text-slate-800 text-sm">{type.EWMStorageType}</div>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="search-help-dropdown-container relative">
                                            <Input
                                                label="Storage Bin"
                                                placeholder="e.g. Y011-01-01"
                                                className="uppercase"
                                                value={wtForm.DestinationStorageBin}
                                                onChange={(e) => setWtForm({ ...wtForm, DestinationStorageBin: e.target.value.toUpperCase() })}
                                                onClick={handleOpenBinHelp}
                                                rightIcon={
                                                    <button
                                                        type="button"
                                                        onClick={handleOpenBinHelp}
                                                        className="px-3 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-gray-50 border-l border-gray-200 transition-colors h-full"
                                                    >
                                                        <ChevronDown size={16} />
                                                    </button>
                                                }
                                            />
                                            {/* Bin Help Dropdown */}
                                            {showBinHelp && (
                                                <div className="mt-1 absolute w-full z-50 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                                    {helpLoading ? (
                                                        <div className="flex justify-center p-4"><Loader className="animate-spin text-blue-500" size={20} /></div>
                                                    ) : availableBins.length === 0 ? (
                                                        <div className="p-3 text-center text-sm text-slate-500">No bins found.</div>
                                                    ) : (
                                                        availableBins.map((bin, idx) => (
                                                            <div
                                                                key={bin.EWMStorageBin}
                                                                onClick={() => handleSelectBin(bin)}
                                                                className={`p-3 cursor-pointer hover:bg-blue-50 ${idx < availableBins.length - 1 ? 'border-b border-slate-100' : ''}`}
                                                            >
                                                                <div className="font-bold text-slate-800 text-sm">{bin.EWMStorageBin}</div>
                                                                <div className="text-xs text-slate-500 mt-0.5">{bin.EWMStorageType || wtForm.DestinationStorageType || 'N/A'}</div>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </form>
                            </div>
                        </div>
                        {/* Modal Footer */}
                        <div className="p-4 border-t bg-gray-50 shrink-0">
                            <Button
                                type="submit"
                                form="createWtForm"
                                disabled={wtLoading}
                                className="w-full"
                            >
                                {wtLoading ? <Loader size={18} className="animate-spin" /> : (isPackMode ? <PackageOpen size={18} /> : <Plus size={18} />)}
                                {wtLoading ? 'Processing...' : (isPackMode ? 'Pack & Create Task' : 'Create Warehouse Task')}
                            </Button>
                        </div>
                    </div>,
                    document.body
                )
            }


            {/* Post GR Bin Prompt Modal */}
            {
                showBinPrompt && createPortal(
                    <div className="fixed inset-0 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in"
                        style={{ zIndex: 9999, paddingTop: 'max(env(safe-area-inset-top, 0px), 1.5rem)' }}>
                        <div className="bg-white w-full max-w-md md:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col pt-1 pb-safe animate-in slide-in-from-bottom-4">
                            <div className="px-5 py-4 border-b flex justify-between items-center">
                                <h2 className="text-lg font-bold text-brand-blue flex items-center gap-2">
                                    <AlertCircle size={20} /> Storage Location Needed
                                </h2>
                                <button onClick={() => setShowBinPrompt(false)} className="p-1 hover:bg-gray-100 rounded-full text-gray-500">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-5 flex-1 overflow-y-auto">
                                <p className="text-sm text-gray-600 mb-5">
                                    Some items in this delivery are missing a Storage Location / Goods Movement Bin. Please provide a bin for bulk GR posting.
                                </p>

                                <form id="bulkBinForm" onSubmit={executePostGR}>
                                    <label className="block text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
                                        Goods Movement Bin <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        maxLength={18}
                                        placeholder="e.g. Y011-01"
                                        value={globalBin}
                                        onChange={(e) => setGlobalBin(e.target.value.toUpperCase())}
                                        className="w-full border-2 border-gray-200 rounded-xl p-3 text-lg font-mono uppercase focus:border-[#1C2C5E] focus:ring-4 focus:ring-blue-100 transition-all mb-6"
                                    />

                                    <div className="flex gap-3">
                                        <button
                                            type="button"
                                            className="flex-1 py-3.5 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors active:scale-95"
                                            onClick={() => setShowBinPrompt(false)}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className={`flex-1 py-3.5 text-white font-bold rounded-xl transition-colors active:scale-95 shadow-md flex items-center justify-center ${!globalBin ? 'bg-blue-300 cursor-not-allowed' : 'bg-brand-blue hover:opacity-90'
                                                }`}
                                            disabled={!globalBin}
                                        >
                                            Apply & Post
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>,
                    document.body
                )
            }

            {/* Reverse GR Confirmation Dialog */}
            {showReverseDialog && createPortal(
                <div className="fixed inset-0 flex items-center justify-center bg-black/50 px-6" style={{ zIndex: 9999 }}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <RotateCcw size={24} className="text-red-500" />
                            <h3 className="text-lg font-bold text-slate-800">Reverse Goods Receipt?</h3>
                        </div>
                        <p className="text-sm text-slate-600 mb-6">
                            This will reverse the posted Goods Receipt for delivery <strong>{id}</strong>. This action cannot be undone without re-posting.
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setShowReverseDialog(false)}
                                className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleReverseGR}
                                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors">
                                Reverse GR
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};


export default InboundDeliveryDetail;
