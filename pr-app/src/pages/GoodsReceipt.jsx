import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { constructGRPayload } from '../services/payloadHelper';
import {
    Search, LayoutGrid, PackagePlus, Truck, ArrowLeft, Home,
    AlertCircle, CheckCircle, Loader, Calendar, Layers, ShoppingCart, User,
    FileText, X, ChevronDown, ChevronUp, Mic, Filter, List
} from 'lucide-react';

const GoodsReceipt = () => {
    const navigate = useNavigate();
    const { apiConfig } = useAuth();

    // UI State
    const [view, setView] = useState('list'); // 'list' | 'items' | 'create-gr'
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    // Data State
    const [pos, setPos] = useState([]);
    const [selectedPO, setSelectedPO] = useState(null);
    const [poItems, setPoItems] = useState([]);
    const [vendorNames, setVendorNames] = useState({}); // Map of SupplierID -> Name

    // Global Items State for Bulk Post { [itemId]: { quantity: '', storageLocation: '', unit: '' } }
    const [itemsData, setItemsData] = useState({});
    const [selectedMovementType, setSelectedMovementType] = useState('101'); // Default 101

    // Items Expansion State
    const [expandedItem, setExpandedItem] = useState(null);
    const [expandedPO, setExpandedPO] = useState(null); // For PO list expand
    const [availableSLs, setAvailableSLs] = useState([]);
    const [showSLHelp, setShowSLHelp] = useState(false);
    const [slLoading, setSlLoading] = useState(false);
    const [currentSLItem, setCurrentSLItem] = useState(null); // Track which item requested SL help

    const [deliveryNote, setDeliveryNote] = useState('');
    const [postingDate, setPostingDate] = useState(new Date().toISOString().split('T')[0]);
    const [confirmLoading, setConfirmLoading] = useState(false);

    const [headerText, setHeaderText] = useState('');

    useEffect(() => {
        loadPOs();
    }, []);

    // Load Items immediately when selectedPO changes
    useEffect(() => {
        if (selectedPO) {
            handleLoadItems(selectedPO);
        }
    }, [selectedPO]);

    const loadPOs = async () => {
        setLoading(true);
        console.log("Loading POs with config:", apiConfig);
        try {
            const data = await api.fetchPOs(apiConfig, 50);
            console.log("POs fetched:", data);
            const results = data.d ? data.d.results : (data.value || []);
            setPos(results);

            // Fetch Vendor Names Extracurricularly
            const uniqueSuppliers = [...new Set(results.map(po => po.Supplier).filter(Boolean))];
            if (uniqueSuppliers.length > 0) {
                api.fetchSuppliers(apiConfig, uniqueSuppliers).then(namesMap => {
                    setVendorNames(prev => ({ ...prev, ...namesMap }));
                });
            }
        } catch (err) {
            console.error("PO Load Error:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleLoadItems = async (po) => {
        setLoading(true);
        setItemsData({}); // Reset item data on new PO load
        try {
            const data = await api.fetchPOItems(apiConfig, po.PurchaseOrder);
            let items = data.d ? data.d.results : (data.value || []);
            items = items.filter(i => i.IsCompletelyDelivered !== true);
            setPoItems(items);

            // Pre-calculate defaults for all items to allow immediate bulk post
            initializeItemsData(items, po.PurchaseOrder);

        } catch (err) {
            setError("Failed to load items: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const initializeItemsData = async (items, poId) => {
        // We'll optimistically set defaults using OrderQty logic first
        // Then async fetch material docs to refine "Open Qty"

        const initialData = {};
        // First pass: synchronous defaults
        items.forEach(item => {
            // Fallback default
            initialData[item.PurchaseOrderItem] = {
                quantity: parseFloat(item.OrderQuantity || 0).toString(),
                storageLocation: item.StorageLocation || '', // Pre-populate from PO
                itemText: item.PurchaseOrderItemText || '', // Default to PO text
                unit: item.PurchaseOrderQuantityUnit || ''
            };
        });
        setItemsData(initialData);

        // Second pass: Calculate true Open Quantity
        try {
            const matDocs = await api.fetchMaterialDocumentsForPO(apiConfig, poId);

            setItemsData(prevData => {
                const newData = { ...prevData };
                items.forEach(item => {
                    const relevantDocs = matDocs.filter(doc => Number(doc.PurchaseOrderItem) === Number(item.PurchaseOrderItem));
                    const delivered = relevantDocs.reduce((sum, doc) => {
                        const qty = parseFloat(doc.QuantityInEntryUnit || 0);
                        return doc.DebitCreditCode === 'S' ? sum + qty : sum - qty;
                    }, 0);

                    const openQty = Math.max(0, parseFloat(item.OrderQuantity || 0) - delivered);

                    if (newData[item.PurchaseOrderItem]) {
                        newData[item.PurchaseOrderItem].quantity = openQty.toString();
                    }
                });
                return newData;
            });
        } catch (e) {
            console.warn("Background Open Qty Calc Failed", e);
        }
    };

    const handleViewItems = (po) => {
        setSelectedPO(po);
        setView('items');
        setSearchTerm('');
        setHeaderText(''); // Reset header text
    };

    const updateItemData = (itemId, field, value) => {
        setItemsData(prev => ({
            ...prev,
            [itemId]: {
                ...prev[itemId],
                [field]: value
            }
        }));
    };

    const handleExpandItemPost = async (item) => {
        if (expandedItem === item.PurchaseOrderItem) {
            setExpandedItem(null);
        } else {
            setExpandedItem(item.PurchaseOrderItem);
            // Data should already be initialized by handleLoadItems
        }
    };

    const handleOpenSLHelp = async (item) => {
        console.log("Opening SL Help for item:", item.PurchaseOrderItem);
        setCurrentSLItem(item.PurchaseOrderItem);
        setShowSLHelp(true);
        setSlLoading(true);
        try {
            const res = await api.fetchStorageLocations(apiConfig, item.Plant, item.Material);
            const sls = res.d ? res.d.results : (res.value || []);
            setAvailableSLs(sls);
        } catch (e) {
            console.error("SL Fetch Error", e);
            setAvailableSLs([]);
        } finally {
            setSlLoading(false);
        }
    };

    const handleSelectSL = (sl) => {
        if (currentSLItem) {
            updateItemData(currentSLItem, 'storageLocation', sl.StorageLocation);
        }
        setShowSLHelp(false);
        setCurrentSLItem(null);
    };

    // Error Parser Helper - ROBUST
    const parseError = (errorInput) => {
        try {
            let errorMsg = "Unknown Error";

            // Normalize input to string
            if (typeof errorInput === 'string') {
                errorMsg = errorInput;
            } else if (errorInput && typeof errorInput === 'object') {
                errorMsg = errorInput.message || JSON.stringify(errorInput);
            } else {
                errorMsg = String(errorInput);
            }

            // Check if it looks like a JSON error object inside string
            const jsonMatch = errorMsg.match(/\{"error":.*\}/);
            if (jsonMatch) {
                const errorObj = JSON.parse(jsonMatch[0]);
                return errorObj.error?.message?.value || errorObj.error?.message || "Unknown SAP Error";
            }
            // Check for plain "Item X: ..." format
            return errorMsg;
        } catch (e) {
            console.error("Error Parsing Failed:", e);
            return "An error occurred (Parsing Failed)";
        }
    };

    // Click Outside Handler for SL Dropdown
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (showSLHelp && !event.target.closest('.sl-dropdown-container')) {
                setShowSLHelp(false);
                setCurrentSLItem(null);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showSLHelp]);

    const handleSaveItem = (e, item) => {
        e.preventDefault();
        setSuccessMsg(`Item ${item.PurchaseOrderItem} Updated! Press 'POST GR' in header to submit.`);
        setExpandedItem(null);
        setTimeout(() => setSuccessMsg(''), 3000);
    };

    // Bulk Post Logic
    const handlePostAllGR = async () => {
        // Validation with Logging
        console.log("Starting Bulk Post...");
        const readyItems = [];
        const incompleteItems = [];
        const skippedItems = [];

        poItems.forEach(item => {
            const data = itemsData[item.PurchaseOrderItem] || {};
            const qty = parseFloat(data.quantity || 0);
            const sl = data.storageLocation || item.StorageLocation;

            if (qty > 0) {
                if (sl) {
                    readyItems.push({ item, data: { ...data, storageLocation: sl, quantity: qty } });
                } else {
                    incompleteItems.push(item);
                }
            } else {
                skippedItems.push(item);
            }
        });

        if (incompleteItems.length > 0) {
            const itemIds = incompleteItems.map(i => i.PurchaseOrderItem).join(', ');
            setError(`Cannot Post: Items ${itemIds} have Quantity but are missing a Storage Location.`);
            return;
        }

        if (readyItems.length === 0) {
            setError("No items to post. All items have 0 Quantity or are missing data.");
            return;
        }

        const confirmMsg = skippedItems.length > 0
            ? `Ready to post ${readyItems.length} items?\n(${skippedItems.length} items with 0 quantity will be skipped)`
            : `Are you sure you want to post all ${readyItems.length} items?`;

        if (!window.confirm(confirmMsg)) {
            return;
        }

        setConfirmLoading(true);
        let successCount = 0;
        let errors = [];

        try {
            for (const { item, data } of readyItems) {
                const payload = constructGRPayload({
                    item,
                    quantity: data.quantity.toString(),
                    date: postingDate,
                    headerText,
                    itemText: data.itemText,
                    deliveryNote,
                    storageLocation: data.storageLocation,
                    movementType: selectedMovementType
                });

                try {
                    console.log(`Posting Item ${item.PurchaseOrderItem}...`);
                    await api.postGoodsReceipt(apiConfig, payload);
                    successCount++;
                } catch (e) {
                    console.error("Single Item Error:", e);
                    // Pass the whole error object to robust parser
                    const simpleMsg = parseError(e);
                    errors.push(`Item ${item.PurchaseOrderItem}: ${simpleMsg}`);
                }
            }

            if (errors.length > 0) {
                const uniqueErrors = [...new Set(errors)];
                setError(`Failed: ${uniqueErrors.join('; ')}`);

                if (successCount > 0) {
                    setSuccessMsg(`Partial Success: Posted ${successCount} items.`);
                    setTimeout(() => handleLoadItems(selectedPO), 2000);
                }
            } else {
                setSuccessMsg(`Success! Posted ${successCount} items.`);
                setTimeout(() => {
                    setSuccessMsg('');
                    handleLoadItems(selectedPO);
                }, 2000);
            }

        } catch (err) {
            console.error("Batch Loop Error:", err);
            setError("Batch Post System Error: " + parseError(err));
        } finally {
            setConfirmLoading(false);
        }
    };

    // Post GR for a PO directly from list view (all items, full open qty)
    const handlePostAllGRForPO = async (po) => {
        const items = po.to_PurchaseOrderItem?.results || [];

        // Filter to only open items
        const openItems = items.filter(item => {
            const orderedQty = parseFloat(item.OrderQuantity || 0);
            const deliveredQty = parseFloat(item.QuantityInPurchaseOrderPriceUnit || 0);
            return !item.IsCompletelyDelivered && orderedQty > deliveredQty;
        });

        if (openItems.length === 0) {
            setError("No open items to post for this PO.");
            return;
        }

        // Check for missing storage locations
        const missingSL = openItems.filter(i => !i.StorageLocation);
        if (missingSL.length > 0) {
            setError(`Cannot post: Items ${missingSL.map(i => i.PurchaseOrderItem).join(', ')} are missing Storage Location. Please use View Items to set them.`);
            return;
        }

        if (!window.confirm(`Post Goods Receipt for PO ${po.PurchaseOrder}?\n${openItems.length} items will be posted with their full open quantity.`)) {
            return;
        }

        setConfirmLoading(true);
        setError(null);
        let successCount = 0;
        let errors = [];

        try {
            for (const item of openItems) {
                const orderedQty = parseFloat(item.OrderQuantity || 0);
                const deliveredQty = parseFloat(item.QuantityInPurchaseOrderPriceUnit || 0);
                const openQty = orderedQty - deliveredQty;

                const payload = constructGRPayload({
                    item,
                    quantity: openQty.toString(),
                    date: postingDate,
                    headerText: '',
                    itemText: '',
                    deliveryNote: '',
                    storageLocation: item.StorageLocation,
                    movementType: '101'
                });

                try {
                    console.log(`Posting PO ${po.PurchaseOrder} Item ${item.PurchaseOrderItem}...`);
                    await api.postGoodsReceipt(apiConfig, payload);
                    successCount++;
                } catch (e) {
                    console.error("Single Item Error:", e);
                    const simpleMsg = parseError(e);
                    errors.push(`Item ${item.PurchaseOrderItem}: ${simpleMsg}`);
                }
            }

            if (errors.length > 0) {
                const uniqueErrors = [...new Set(errors)];
                setError(`Failed: ${uniqueErrors.join('; ')}`);
                if (successCount > 0) {
                    setSuccessMsg(`Partial Success: Posted ${successCount} items.`);
                }
            } else {
                setSuccessMsg(`Success! Posted ${successCount} items for PO ${po.PurchaseOrder}.`);
                setTimeout(() => {
                    setSuccessMsg('');
                    loadPOs(); // Refresh list
                }, 2000);
            }

        } catch (err) {
            console.error("Batch Post Error:", err);
            setError("Batch Post System Error: " + parseError(err));
        } finally {
            setConfirmLoading(false);
            setExpandedPO(null);
        }
    };

    // Filter Logic
    let displayList = [];
    if (view === 'list') {
        // Filter POs by Document Number or Supplier
        displayList = pos.filter(po => {
            const matches = po.PurchaseOrder.includes(searchTerm) ||
                (po.Supplier && po.Supplier.toLowerCase().includes(searchTerm.toLowerCase()));
            // Basic Check for open items
            const items = po.to_PurchaseOrderItem?.results || [];
            const hasOpenItems = items.length > 0 ? items.some(item => !item.IsCompletelyDelivered) : true;
            return matches && hasOpenItems;
        });
    } else if (view === 'items') {
        // Filter Items by Material or Text
        displayList = poItems.filter(item => {
            const term = searchTerm.toLowerCase();
            return (item.Material && item.Material.toLowerCase().includes(term)) ||
                (item.PurchaseOrderItemText && item.PurchaseOrderItemText.toLowerCase().includes(term));
        });
    }

    return (
        <>
            <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
                {/* Header */}
                <header className="app-header-straight pb-8 px-6 shadow-lg flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)' }}>
                    <div className="flex justify-between items-start mb-6">
                        <button onClick={() => navigate('/menu')} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition">
                            <Home size={20} />
                        </button>
                    </div>

                    <div className="flex flex-col items-center justify-center -mt-2 mb-2 relative">
                        <div className="flex items-center gap-2">
                            <h1 className="text-3xl font-bold text-white mb-1">
                                {view === 'items' ? selectedPO?.PurchaseOrder : `${displayList.length}`}
                                {view === 'list' && <span className="text-lg text-blue-200">/{pos.length}</span>}
                            </h1>
                        </div>
                        <p className="text-blue-200 text-sm font-medium uppercase tracking-wider">
                            {view === 'items' ? 'Purchase Order Items' : 'Purchase Orders'}
                        </p>
                    </div>

                    {/* Search Bar - No Icon */}
                    <div className="relative mt-4">
                        <input
                            type="text"
                            placeholder={view === 'items' ? "Enter Material" : "Enter Document Number"}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-white h-12 rounded-lg px-4 text-slate-700 placeholder-slate-400 shadow-lg border-0 focus:ring-2 focus:ring-lime-400 text-center"
                        />
                    </div>
                </header>

                {/* Main Content */}
                <main className="flex-1 overflow-y-auto px-4 pt-6 pb-32 -mt-2 z-10" style={{ WebkitOverflowScrolling: 'touch' }}>
                    <div className="max-w-5xl mx-auto">

                        {/* Fixed Toasts for better visibility */}
                        {(error || successMsg) && (
                            <div className="fixed top-24 left-0 w-full z-[100] px-4 pointer-events-none flex flex-col items-center gap-2">
                                {error && (
                                    <div className="pointer-events-auto bg-red-50 border-l-4 border-red-500 rounded-r-lg p-4 shadow-xl flex gap-3 max-w-md w-full animate-in slide-in-from-top-2">
                                        <AlertCircle className="text-red-500 shrink-0" size={20} />
                                        <p className="text-sm text-red-700 m-0 font-medium break-words">{error}</p>
                                        <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600"><X size={16} /></button>
                                    </div>
                                )}
                                {successMsg && (
                                    <div className="pointer-events-auto bg-emerald-50 border-l-4 border-emerald-500 rounded-r-lg p-4 shadow-xl flex gap-3 max-w-md w-full animate-in slide-in-from-top-2">
                                        <CheckCircle className="text-emerald-500 shrink-0" size={20} />
                                        <p className="text-sm text-emerald-700 m-0 font-medium">{successMsg}</p>
                                        <button onClick={() => setSuccessMsg('')} className="ml-auto text-emerald-400 hover:text-emerald-600"><X size={16} /></button>
                                    </div>
                                )}
                            </div>
                        )}

                        {view === 'list' && (
                            <div className="space-y-3">
                                {/* Tabs */}
                                <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar mb-2">
                                    <button className="flex-none flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm border border-slate-200 text-slate-700 text-sm font-bold min-w-[140px] justify-center">
                                        <FileText size={16} className="text-blue-600" /> Purchase Orders
                                    </button>
                                    <button className="flex-none flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full border border-transparent text-slate-500 text-sm font-medium min-w-[100px] justify-center">
                                        STO
                                    </button>
                                    <button className="flex-none flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full border border-transparent text-slate-500 text-sm font-medium min-w-[100px] justify-center">
                                        Production
                                    </button>
                                </div>

                                {loading ? (
                                    <div className="text-center py-10"><Loader className="animate-spin mx-auto text-blue-600" /></div>
                                ) : (
                                    displayList.map((po) => {
                                        const itemCount = po.to_PurchaseOrderItem?.results?.length || 0;
                                        const openItems = (po.to_PurchaseOrderItem?.results || []).filter(i => !i.IsCompletelyDelivered).length;
                                        return (
                                            <div
                                                key={po.PurchaseOrder}
                                                className="relative bg-white rounded-xl mb-4 shadow-sm border border-slate-200 overflow-hidden cursor-pointer hover:shadow-md transition-all flex items-stretch min-h-[100px]"
                                            >
                                                {/* Left Colored Strip */}
                                                <div className="w-2 bg-red-500 flex-shrink-0"></div>

                                                {/* Main Content */}
                                                <div className="flex-1 px-4 py-3 flex flex-col justify-center gap-1.5 min-w-0" onClick={() => setExpandedPO(expandedPO === po.PurchaseOrder ? null : po.PurchaseOrder)}>
                                                    <div className="flex justify-between items-start">
                                                        <h3 className="text-lg font-bold text-blue-950 leading-tight">#{po.PurchaseOrder}</h3>
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold border border-red-200">
                                                            {openItems} / {itemCount} Items
                                                        </span>
                                                    </div>

                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex items-center gap-2 text-sm text-slate-600 truncate">
                                                            <span className="font-bold uppercase text-[11px] text-slate-400 tracking-wider">Vendor</span>
                                                            <span className="font-bold truncate" title={po.Supplier}>
                                                                {po.Supplier} <span className="text-slate-400 font-normal">|</span> {vendorNames[po.Supplier] || po.to_Supplier?.SupplierName || ''}
                                                            </span>
                                                        </div>

                                                        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                                                            <Calendar size={13} className="text-slate-400" />
                                                            <span>{po.CreationDate ? new Date(parseInt(po.CreationDate.replace(/\/Date\((-?\d+)\)\//, '$1'))).toLocaleDateString() : 'N/A'}</span>
                                                        </div>
                                                    </div>

                                                    {/* Expanded Actions */}
                                                    {expandedPO === po.PurchaseOrder && (
                                                        <div className="mt-4 pt-4 border-t border-slate-100 animate-in">
                                                            <div className="flex gap-3">
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleViewItems(po); }}
                                                                    style={{ backgroundColor: '#e2e8f0', color: '#475569' }}
                                                                    className="flex-1 py-2 rounded-lg font-bold text-xs hover:opacity-80 transition-colors"
                                                                >
                                                                    View Items
                                                                </button>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handlePostAllGRForPO(po); }}
                                                                    style={{ backgroundColor: '#2563eb' }}
                                                                    className="flex-1 py-2 rounded-lg text-white font-bold text-xs hover:opacity-90 transition-colors shadow-sm"
                                                                    disabled={confirmLoading}
                                                                >
                                                                    {confirmLoading ? <Loader className="animate-spin mx-auto" size={14} /> : 'Post GR'}
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

                        {view === 'items' && selectedPO && (
                            <div className="animate-in pb-20 space-y-4">
                                <div className="flex justify-between items-center mb-0">
                                    <button onClick={() => { setView('list'); setError(null); setSuccessMsg(''); }} style={{ backgroundColor: '#0ea5e9' }} className="px-4 py-2 hover:opacity-90 text-white font-bold text-xs uppercase rounded-lg shadow-md transition-all active:scale-95 flex items-center gap-2">
                                        <ArrowLeft size={16} /> Back
                                    </button>
                                    <button
                                        onClick={handlePostAllGR}
                                        disabled={confirmLoading || loading}
                                        style={{ backgroundColor: '#0ea5e9' }}
                                        className="px-6 py-2 hover:opacity-90 text-white font-bold text-xs uppercase rounded-lg shadow-md disabled:opacity-50 transition-all active:scale-95 flex items-center gap-2"
                                    >
                                        {confirmLoading ? <Loader size={18} className="animate-spin text-white" /> : <>POST GR <CheckCircle size={18} /></>}
                                    </button>
                                </div>

                                {/* Header Card */}
                                <div className="bg-white rounded-xl p-4 mb-4 border border-slate-200 shadow-sm">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <h2 className="text-xl font-bold text-slate-800 mb-1">{selectedPO.PurchaseOrder}</h2>
                                            <p className="text-xs text-slate-500 font-medium">Vendor: {selectedPO.Supplier}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-blue-900/70 font-bold uppercase">Plant</p>
                                            <p className="text-sm font-bold text-blue-950">ODSL</p>
                                        </div>
                                    </div>

                                    <div className="mt-4">
                                        <div className="mt-4">
                                            <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Header Text</label>
                                            <input
                                                type="text"
                                                className="w-full h-10 bg-slate-100 border-transparent rounded-lg px-3 text-sm focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all font-medium text-blue-950"
                                                placeholder="Enter Header Text"
                                                value={headerText}
                                                onChange={(e) => setHeaderText(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Item Filter Badges - Selectable */}
                                <div className="mb-4">
                                    <h4 className="text-xs font-bold uppercase text-slate-500 mb-2 flex justify-between">
                                        Movement Type <ChevronDown size={14} />
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => setSelectedMovementType('101')}
                                            style={selectedMovementType === '101' ? { backgroundColor: '#172554', color: 'white', borderColor: '#172554' } : {}}
                                            className={`px-4 py-2 text-xs font-bold rounded-lg border transition-all ${selectedMovementType === '101' ? 'shadow-md' : 'bg-white text-slate-500 border-slate-200'}`}
                                        >
                                            101 - GR goods receipt
                                        </button>
                                        <button
                                            onClick={() => setSelectedMovementType('103')}
                                            style={selectedMovementType === '103' ? { backgroundColor: '#172554', color: 'white', borderColor: '#172554' } : {}}
                                            className={`px-4 py-2 text-xs font-bold rounded-lg border transition-all ${selectedMovementType === '103' ? 'shadow-md' : 'bg-white text-slate-500 border-slate-200'}`}
                                        >
                                            103 - GR into blocked stck
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-100">
                                            1 - Individual Slips
                                        </span>
                                    </div>
                                </div>

                                {/* Items */}
                                <div className="space-y-4">
                                    {loading ? <Loader className="mx-auto" /> : displayList.map(item => {
                                        // Extract Data for this Item from Global State
                                        const itemState = itemsData[item.PurchaseOrderItem] || { quantity: '', storageLocation: '', unit: item.PurchaseOrderQuantityUnit };

                                        return (
                                            <div key={item.PurchaseOrderItem} className="bg-white rounded-xl shadow-sm border border-slate-200">
                                                {/* Item Header ROW */}
                                                <div className="p-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center cursor-pointer" onClick={() => handleExpandItemPost(item)}>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-bold text-slate-500">Item:</span>
                                                        <span className="text-sm font-bold text-slate-800">{item.PurchaseOrderItem}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        {/* Quantity in Header: Open / Total Unit */}
                                                        <div className="text-right">
                                                            <span className="text-sm font-bold text-blue-950">
                                                                {parseFloat(itemState.quantity || 0)} <span className="text-slate-400">/</span> {parseFloat(item.OrderQuantity || 0)}
                                                            </span>
                                                            <span className="text-xs text-blue-900/70 font-bold ml-1">{item.PurchaseOrderQuantityUnit}</span>
                                                        </div>
                                                        <ChevronDown size={16} className={`text-slate-400 transition-transform ${expandedItem === item.PurchaseOrderItem ? 'rotate-180' : ''}`} />
                                                    </div>
                                                </div>

                                                <div className="p-4">
                                                    {/* Material & Description */}
                                                    <div className="mb-4">
                                                        <div className="flex justify-between items-start">
                                                            <div>
                                                                <span className="text-lg font-bold text-indigo-900 block">{item.Material || 'No Material'}</span>
                                                                <span className="text-sm text-slate-600 block mt-0.5">{item.PurchaseOrderItemText}</span>
                                                            </div>
                                                            <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded">
                                                                {item.Plant}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {expandedItem === item.PurchaseOrderItem && (
                                                        <div className="animate-in fade-in pt-3 border-t border-slate-100 mt-2">
                                                            <form onSubmit={(e) => handleSaveItem(e, item)}>

                                                                {/* Item Text Input */}
                                                                <div className="mb-6">
                                                                    <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Item Text</label>
                                                                    <input
                                                                        className="w-full h-10 bg-slate-100 border-transparent rounded-lg px-3 text-sm focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all font-medium text-blue-950"
                                                                        value={itemState.itemText || ''}
                                                                        onChange={e => updateItemData(item.PurchaseOrderItem, 'itemText', e.target.value)}
                                                                        placeholder="Enter Item Text"
                                                                    />
                                                                </div>

                                                                {/* Storage Location Input with Dropdown */}
                                                                <div className="mb-4 sl-dropdown-container">
                                                                    <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Storage Location</label>
                                                                    <div className="relative">
                                                                        <div className="flex items-center relative">
                                                                            <input
                                                                                className="w-full h-10 bg-slate-100 border-transparent rounded-lg px-3 text-sm font-bold text-blue-950 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none cursor-pointer transition-all"
                                                                                value={itemState.storageLocation}
                                                                                onChange={e => updateItemData(item.PurchaseOrderItem, 'storageLocation', e.target.value.toUpperCase())}
                                                                                onClick={() => handleOpenSLHelp(item)}
                                                                                placeholder="Select SLoc"
                                                                            />
                                                                            {/* Scan/List Icon inside input */}
                                                                            <div className="absolute right-3 text-slate-400 pointer-events-none">
                                                                                <List size={16} />
                                                                            </div>
                                                                        </div>

                                                                        {/* Inline Dropdown */}
                                                                        {showSLHelp && currentSLItem === item.PurchaseOrderItem && availableSLs.length > 0 && (
                                                                            <div className="absolute bottom-full left-0 w-full mb-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-40 overflow-y-auto">
                                                                                {availableSLs.map(sl => (
                                                                                    <div
                                                                                        key={sl.StorageLocation}
                                                                                        onClick={() => handleSelectSL(sl)}
                                                                                        className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0 flex justify-between items-center group"
                                                                                    >
                                                                                        <div>
                                                                                            <span className="font-bold text-slate-800 block">{sl.StorageLocation}</span>
                                                                                            <span className="text-xs text-slate-500">{sl.StorageLocationName || 'Standard'}</span>
                                                                                        </div>
                                                                                        {itemState.storageLocation === sl.StorageLocation && <CheckCircle size={16} className="text-green-500" />}
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                        {showSLHelp && currentSLItem === item.PurchaseOrderItem && availableSLs.length === 0 && !slLoading && (
                                                                            <div className="absolute bottom-full left-0 w-full mb-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-2 text-center text-slate-400 text-xs">
                                                                                No Locations Found
                                                                            </div>
                                                                        )}
                                                                        {showSLHelp && currentSLItem === item.PurchaseOrderItem && slLoading && (
                                                                            <div className="absolute bottom-full left-0 w-full mb-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-2 text-center">
                                                                                <Loader size={16} className="animate-spin mx-auto text-blue-500" />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>


                                                                {/* Quantity Stepper */}
                                                                <div className="mb-4">
                                                                    <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Quantity Check:</label>
                                                                    <div className="flex items-center h-10 w-40 rounded-lg overflow-hidden border border-blue-200 shadow-sm">
                                                                        <button
                                                                            type="button"
                                                                            style={{ backgroundColor: '#bae6fd', borderRadius: 0 }}
                                                                            className="w-12 h-full flex items-center justify-center hover:bg-[#7dd3fc] text-blue-950 transition-colors border-r border-blue-100"
                                                                            onClick={() => {
                                                                                const curr = parseFloat(itemState.quantity || 0);
                                                                                updateItemData(item.PurchaseOrderItem, 'quantity', (curr - 1 >= 0 ? curr - 1 : 0).toString());
                                                                            }}
                                                                        >
                                                                            <span className="text-xl font-bold mb-0.5">−</span>
                                                                        </button>
                                                                        <input
                                                                            style={{ borderRadius: 0 }}
                                                                            className="flex-1 w-full h-full bg-white text-center font-bold text-blue-950 text-lg border-none p-0 focus:ring-0"
                                                                            value={itemState.quantity}
                                                                            onChange={e => updateItemData(item.PurchaseOrderItem, 'quantity', e.target.value)}
                                                                        />
                                                                        <button
                                                                            type="button"
                                                                            style={{ backgroundColor: '#bae6fd', borderRadius: 0 }}
                                                                            className="w-12 h-full flex items-center justify-center hover:bg-[#7dd3fc] text-blue-950 transition-colors border-l border-blue-100"
                                                                            onClick={() => {
                                                                                const curr = parseFloat(itemState.quantity || 0);
                                                                                updateItemData(item.PurchaseOrderItem, 'quantity', (curr + 1).toString());
                                                                            }}
                                                                        >
                                                                            <span className="text-xl font-bold mb-0.5">+</span>
                                                                        </button>
                                                                    </div>
                                                                </div>

                                                                <div className="mb-4">
                                                                    <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Unit</label>
                                                                    <input
                                                                        className="w-full h-10 bg-slate-100 border-transparent rounded-lg px-3 text-sm font-bold text-blue-950 outline-none pointer-events-none"
                                                                        value={item.PurchaseOrderQuantityUnit}
                                                                        readOnly
                                                                    />
                                                                </div>

                                                                <button disabled={confirmLoading} className="w-full btn-primary bg-blue-900 hover:bg-blue-800 text-white font-bold h-12 rounded-xl shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 tracking-wide text-sm">
                                                                    SAVE
                                                                </button>
                                                            </form>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Static POST GR Button at Bottom of List */}

                            </div>
                        )}
                    </div>
                </main >



                {/* Storage Location Modal */}

            </div>

            {/* Storage Location Modal - Replaced by Inline Dropdown */}
            {console.log("Rendering GoodsReceipt Component - SL Logic Inline")}




        </>
    );
};

export default GoodsReceipt;
