/**
 * @file PickingSearch.jsx
 * @description Screen: Picking Task Search (Outbound Warehouse Process)
 *
 * Allows warehouse operators to find and select PICK warehouse tasks for
 * outbound deliveries (OBDs). The operator can search by:
 *  - Outbound Delivery (OBD) number — most common; also fetches HU-linked tasks
 *  - Product ID or GTIN barcode — useful for product-based picking
 *  - Handling Unit (HU) identifier
 *
 * Only PICK-type tasks (WarehouseActivityType = 'PICK') are shown. Completed
 * tasks are lazily loaded when the user toggles the "Completed" checkbox to
 * keep initial load fast.
 *
 * Selecting a single open task navigates directly to ConfirmPicking.
 * Multiple results are shown as a list for the user to choose from.
 *
 * ## SAP Process Flow
 *   Search → (optional) Browse OBD list → Select WT → ConfirmPicking
 *
 * @route /warehouse-outbound/picking
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Search, Scan, AlertCircle, X, ChevronRight, Loader, ArrowLeft, List, PackageOpen, CheckCircle, Package, Calendar, SlidersHorizontal, ChevronDown, Zap, Navigation } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import BarcodeScanner from '../../components/BarcodeScanner';
import { useSwipeBack } from '../../hooks/useSwipeBack';
import OutboundDeliveryValueHelp from './OutboundDeliveryValueHelp';
import { useProductDescription } from '../../hooks/useProductDescription';
import { ACTIVITY_TYPE_LABELS } from '../../utils/wmLabels';

import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';


const PickingSearch = () => {
    const navigate = useNavigate();
    const { apiConfig } = useAuth();

    useSwipeBack(() => navigate(-1));
    const { getDescription } = useProductDescription();

    const [warehouses, setWarehouses] = useState([]);
    const [selectedWarehouse, setSelectedWarehouse] = useState('');
    const [searchBy, setSearchBy] = useState('OBD'); // OBD, HU, Product
    const [searchValue, setSearchValue] = useState('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [tasks, setTasks] = useState([]);
    const [showResults, setShowResults] = useState(false);
    const [showScanner, setShowScanner] = useState(false);

    // Dropdown state (for HU & Product)
    const [dropdownOptions, setDropdownOptions] = useState([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [fetchingDropdown, setFetchingDropdown] = useState(false);

    // OBD Value Help state (task-enriched modal, like PutawaySearch)
    const [showValueHelp, setShowValueHelp] = useState(false);
    const [valueHelpDeliveries, setValueHelpDeliveries] = useState(null);
    const [fetchingValueHelp, setFetchingValueHelp] = useState(false);

    // Optional OBD filters
    const [obdShipTo, setObdShipTo] = useState('');
    const [obdDateFrom, setObdDateFrom] = useState('');
    const [obdDateTo, setObdDateTo] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    // Filter state for results
    const [showOpen, setShowOpen] = useState(true);
    const [showCompleted, setShowCompleted] = useState(false);

    // Lazy-loaded completed tasks
    const [completedTasks, setCompletedTasks] = useState([]);
    const [fetchingCompleted, setFetchingCompleted] = useState(false);
    const [completedFetched, setCompletedFetched] = useState(false);

    // --- Claim Resource (System Guided) ---
    const [showClaimModal, setShowClaimModal] = useState(false);
    const [claimResourceId, setClaimResourceId] = useState('');
    const [claimLoading, setClaimLoading] = useState(false);
    const [claimError, setClaimError] = useState(null);
    const [claimScannerOpen, setClaimScannerOpen] = useState(false);
    const [claimFeedback, setClaimFeedback] = useState(null); // { ok: bool, msg: string }
    const [showResourceHelp, setShowResourceHelp] = useState(false);
    const [resourceHelpList, setResourceHelpList] = useState([]);
    const [resourceHelpLoading, setResourceHelpLoading] = useState(false);

    // --- State Restoration (sessionStorage) ---
    // Restore on mount so the list is not cleared on Back navigation
    useEffect(() => {
        const saved = sessionStorage.getItem('pickingSearchState');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (parsed.searchBy) setSearchBy(parsed.searchBy);
                if (parsed.searchValue !== undefined) setSearchValue(parsed.searchValue);
                if (parsed.selectedWarehouse) setSelectedWarehouse(parsed.selectedWarehouse);
                
                let restoredTasks = parsed.tasks || [];
                // If returning from confirmation, filter out the confirmed task automatically
                if (window.history.state?.usr?.confirmedTaskId) {
                    restoredTasks = restoredTasks.filter(t => t.WarehouseTask !== window.history.state.usr.confirmedTaskId);
                }
                
                setTasks(restoredTasks);
                if (parsed.showResults) setShowResults(true);
                
                // Update session storage immediately to reflect the removal of the confirmed task
                sessionStorage.setItem('pickingSearchState', JSON.stringify({
                    ...parsed,
                    tasks: restoredTasks
                }));
            } catch(e) { console.error('Error restoring session state', e); }
        }
    }, [window.location]);

    // Helper: strip leading zeros
    const stripZeros = (str) => str ? String(str).replace(/^0+/, '') || '0' : '';

    // Fetch task-enriched delivery list for OBD value help modal
    const fetchTaskEnrichedDeliveries = useCallback(async (warehouse) => {
        setFetchingValueHelp(true);
        try {
            const wtRes = await api.fetchWarehouseTasks(apiConfig, { warehouse });
            const allTasks = ((wtRes && wtRes.value) ? wtRes.value : []);
            // Group all PICK tasks by delivery
            const deliveryMap = new Map();
            allTasks.forEach(t => {
                // Only include PICK tasks for outbound
                if ((t.WarehouseActivityType || '').trim().toUpperCase() !== 'PICK') return;
                const del = (t.EWMDelivery || '').trim();
                if (!del) return;
                if (!deliveryMap.has(del)) {
                    deliveryMap.set(del, {
                        EWMOutboundDelivery: del,
                        openTaskCount: 0,
                        completedTaskCount: 0,
                        products: new Set(),
                        shipToParty: ''
                    });
                }
                const entry = deliveryMap.get(del);
                if (t.WarehouseTaskStatus === 'C') {
                    entry.completedTaskCount++;
                } else {
                    entry.openTaskCount++;
                }
                if (t.Product) entry.products.add(t.Product.trim());
            });

            const obdList = Array.from(deliveryMap.values()).map(d => ({
                EWMOutboundDelivery: d.EWMOutboundDelivery,
                openTaskCount: d.openTaskCount,
                completedTaskCount: d.completedTaskCount,
                totalTaskCount: d.openTaskCount + d.completedTaskCount,
                products: [...d.products],
                shipToParty: d.shipToParty,
                status: d.openTaskCount > 0 ? 'Open' : 'Completed'
            }));

            // Sort: open deliveries first
            obdList.sort((a, b) => b.openTaskCount - a.openTaskCount);
            setValueHelpDeliveries(obdList);
        } catch (err) {
            console.error("Failed to fetch task-enriched OBD deliveries:", err);
            setValueHelpDeliveries([]);
        } finally {
            setFetchingValueHelp(false);
        }
    }, [apiConfig]);

    // Fetch dropdown options (for HU & Product only)
    const fetchDropdownOptions = async (type) => {
        setFetchingDropdown(true);
        try {
            if (type === 'HU' && selectedWarehouse) {
                const res = await api.fetchHandlingUnits(apiConfig, { warehouse: selectedWarehouse });
                if (res && res.value) setDropdownOptions(res.value);
            } else if (type === 'WarehouseOrder' && selectedWarehouse) {
                const res = await api.fetchWarehouseOrders(apiConfig, { warehouse: selectedWarehouse, dateToday: true });
                if (res && res.value) setDropdownOptions(res.value.filter(o => o.WarehouseOrderStatus !== 'C'));
            } else if (type === 'Product') {
                // Fetch top 50 products from the EAN API for value help
                const headers = {};
                if (apiConfig.apiKey) headers['APIKey'] = apiConfig.apiKey;
                if (!headers['APIKey'] && apiConfig.username) {
                    headers['Authorization'] = 'Basic ' + btoa(apiConfig.username + ':' + apiConfig.password);
                }
                headers['Content-Type'] = 'application/json';
                headers['Accept'] = 'application/json';

                const baseUrl = api.getProductSrvUrl(apiConfig);
                let url = `${baseUrl}/A_ProductUnitsOfMeasureEAN?$top=50&$format=json`;

                if (import.meta.env.DEV) {
                    if (url.includes('api.s4hana.cloud.sap')) {
                        url = url.replace(/https:\/\/my\d+-api\.s4hana\.cloud\.sap(:443)?/g, '');
                    }
                    if (url.includes('sandbox.api.sap.com')) {
                        url = url.replace('https://sandbox.api.sap.com', '/s4hanacloud');
                    }
                }

                const response = await fetch(url, { headers });
                if (response.ok) {
                    const data = await response.json();
                    const results = data.d?.results || [];
                    const seen = new Map();
                    results.forEach(r => {
                        const prod = r.Product?.trim();
                        if (prod && !seen.has(prod)) {
                            seen.set(prod, {
                                Product: prod,
                                ProductStandardID: r.ProductStandardID || '',
                                UnitOfMeasure: r.AlternativeUnit || ''
                            });
                        }
                    });
                    setDropdownOptions(Array.from(seen.values()));
                } else {
                    setDropdownOptions([]);
                }
            } else {
                setDropdownOptions([]);
            }
        } catch (err) {
            console.error("Failed to fetch dropdown options:", err);
            setDropdownOptions([]);
        } finally {
            setFetchingDropdown(false);
        }
    };

    useEffect(() => {
        if (searchBy === 'Product') {
            fetchDropdownOptions('Product');
        } else if (selectedWarehouse && (searchBy === 'HU' || searchBy === 'WarehouseOrder')) {
            fetchDropdownOptions(searchBy);
        } else {
            setDropdownOptions([]);
        }
    }, [searchBy, selectedWarehouse, apiConfig]);

    const filteredOptions = dropdownOptions.filter(opt => {
        if (!searchValue) return true;
        const upper = searchValue.toUpperCase();
        if (searchBy === 'HU') {
            return opt.HandlingUnitExternalID && opt.HandlingUnitExternalID.toUpperCase().includes(upper);
        } else if (searchBy === 'WarehouseOrder') {
            return opt.WarehouseOrder && opt.WarehouseOrder.toUpperCase().includes(upper);
        } else if (searchBy === 'Product') {
            const prodMatch = opt.Product && opt.Product.toUpperCase().includes(upper);
            const eanMatch = opt.ProductStandardID && opt.ProductStandardID.includes(upper);
            return prodMatch || eanMatch;
        }
        return true;
    });

    // Render dropdown item based on search type
    const renderDropdownItem = (opt) => {
        if (searchBy === 'HU') {
            return { val: opt.HandlingUnitExternalID, sub: '' };
        } else if (searchBy === 'WarehouseOrder') {
            return { val: opt.WarehouseOrder, sub: `Created: ${opt.CreationDateTime ? opt.CreationDateTime.substring(0, 10) : ''}` };
        } else if (searchBy === 'Product') {
            return { val: opt.Product, sub: opt.ProductStandardID ? `GTIN: ${opt.ProductStandardID}` : '' };
        }
        return { val: '', sub: '' };
    };

    const getDropdownSelectValue = (opt) => {
        if (searchBy === 'HU') return opt.HandlingUnitExternalID;
        if (searchBy === 'WarehouseOrder') return opt.WarehouseOrder;
        if (searchBy === 'Product') return opt.Product;
        return '';
    };

    // Load warehouses
    useEffect(() => {
        const loadWarehouses = async () => {
            try {
                const res = await api.fetchWarehouses(apiConfig);
                if (res && res.value) {
                    setWarehouses(res.value);
                    const defaultWhse = res.value.find(w => w.EWMWarehouse === 'UKW2');
                    if (defaultWhse) {
                        setSelectedWarehouse('UKW2');
                    } else if (res.value.length === 1) {
                        setSelectedWarehouse(res.value[0].EWMWarehouse);
                    }
                }
            } catch (err) {
                console.error("Failed to load warehouses:", err);
                setError("Failed to load Warehouse list: " + err.message);
            }
        };
        loadWarehouses();
    }, [apiConfig]);

    // GTIN helpers
    const extractGTIN = (scanned) => {
        const gs1Match = scanned.match(/(?:\(01\)|^01)(\d{14})/);
        if (gs1Match) return gs1Match[1];
        if (/^\d{8,14}$/.test(scanned)) return scanned;
        return null;
    };

    const handleSearch = async (e) => {
        if (e) e.preventDefault();
        setError(null);
        setShowResults(false);

        if (!selectedWarehouse) { setError("Please select a Warehouse."); return; }

        let finalSearchValue = searchValue.trim();

        if (!finalSearchValue && searchBy === 'OBD' && !obdShipTo && !obdDateFrom && !obdDateTo) {
            setError('Please enter a Delivery number or use the optional filters.');
            return;
        }
        if (!finalSearchValue && searchBy === 'WarehouseOrder') {
            setError('Please enter a Warehouse Order.'); return;
        }
        if (!finalSearchValue && searchBy === 'HU') {
            setError('Please enter a Handling Unit.'); return;
        }
        if (!finalSearchValue && searchBy === 'Product') {
            setError('Please enter a Product ID or scan a GTIN.'); return;
        }

        setLoading(true);
        try {
            let productId = finalSearchValue;
            const filters = { warehouse: selectedWarehouse };

            if (searchBy === 'OBD') {
                if (finalSearchValue) {
                    filters.deliveryDocument = finalSearchValue;
                } else if (showFilters && (obdShipTo || obdDateFrom || obdDateTo)) {
                    const obdFilters = { warehouse: selectedWarehouse, shipTo: obdShipTo, dateFrom: obdDateFrom, dateTo: obdDateTo };
                    const obdRes = await api.fetchOutboundDeliveriesA2X(apiConfig, obdFilters);
                    const obds = (obdRes && obdRes.value) ? obdRes.value : [];
                    if (obds.length === 0) {
                        setError("No deliveries found matching those filters.");
                        setLoading(false);
                        return;
                    }
                    const delivIds = obds.map(d => d.OutboundDelivery || d.DeliveryDocument).filter(Boolean);
                    filters.deliveryDocuments = [...new Set(delivIds)].slice(0, 40); // Cap at 40 to prevent URI Too Long
                }
            } else if (searchBy === 'WarehouseOrder') {
                filters.warehouseOrder = finalSearchValue;
            } else if (searchBy === 'HU') {
                filters.handlingUnit = productId;
            } else if (searchBy === 'Product') {
                // Resolve GTIN if needed
                const gtinCandidate = extractGTIN(productId);
                if (gtinCandidate) {
                    try {
                        const eanResult = await api.fetchProductByGTIN(apiConfig, gtinCandidate);
                        if (eanResult && eanResult.Product) {
                            productId = eanResult.Product.trim();
                        } else {
                            setError(`No product found for GTIN "${gtinCandidate}". Try entering the Product ID directly.`);
                            setLoading(false);
                            return;
                        }
                    } catch (gtinErr) {
                        setError(`Failed to look up GTIN: ${gtinErr.message}`);
                        setLoading(false);
                        return;
                    }
                }
                filters.product = productId;
            }

            // Fetch tasks
            const res = await api.fetchWarehouseTasks(apiConfig, filters);
            let allTasks = res.value || [];

            // For OBD: also fetch HU-linked tasks (same logic as PutawaySearch)
            if (searchBy === 'OBD') {
                try {
                    const huRes = await api.fetchHandlingUnits(apiConfig, { warehouse: selectedWarehouse, referenceDocument: finalSearchValue });
                    if (huRes && huRes.value && huRes.value.length > 0) {
                        const handlingUnits = huRes.value.map(hu => hu.HandlingUnitExternalID);
                        const huWtRes = await api.fetchWarehouseTasks(apiConfig, { warehouse: selectedWarehouse, handlingUnits });
                        if (huWtRes && huWtRes.value && huWtRes.value.length > 0) {
                            const existingWTs = new Set(allTasks.map(t => t.WarehouseTask));
                            const newWTs = huWtRes.value.filter(t => !existingWTs.has(t.WarehouseTask));
                            allTasks = [...allTasks, ...newWTs];
                        }
                    }
                } catch (huErr) {
                    console.warn("Failed to fetch HU-linked tasks:", huErr);
                }
            }

            // Filter to PICK tasks only (for picking screen) — open only on initial load
            let pickTasks = allTasks.filter(t => {
                if ((t.WarehouseActivityType || '').trim().toUpperCase() !== 'PICK') return false;
                // Exclude completed from initial fetch (they'll be lazy-loaded)
                if (t.WarehouseTaskStatus === 'C') return false;
                return true;
            });

            // Debug: log task fields
            if (pickTasks.length > 0) {
                console.log('[PickingSearch] Task fields available:', Object.keys(pickTasks[0]));
            }

            setTasks(pickTasks);
            setCompletedTasks([]); // Reset completed on new search
            setCompletedFetched(false);
            setShowCompleted(false);
            setShowResults(true);
            setLoading(false);

            // Save search state for back navigation
            sessionStorage.setItem('pickingSearchState', JSON.stringify({
                searchBy, searchValue, selectedWarehouse, tasks: pickTasks, showResults: true
            }));

            if (pickTasks.length === 0) {
                setError("No picking tasks found for your search criteria.");
            } else if (searchBy !== 'Product' && pickTasks.filter(t => t.WarehouseTaskStatus !== 'C').length === 1) {
                const openTask = pickTasks.find(t => t.WarehouseTaskStatus !== 'C');
                if (openTask) {
                    navigate(`/warehouse-outbound/picking/${selectedWarehouse}/${openTask.WarehouseTask}/${openTask.WarehouseTaskItem}`);
                }
            }
        } catch (err) {
            setError("Search failed: " + err.message);
            setLoading(false);
        }
    };

    const handleScan = (code) => {
        setShowScanner(false);
        setSearchValue(code);
    };

    const handleValueHelpSelect = (val) => {
        setSearchValue(val);
        setShowValueHelp(false);
    };

    const handleOpenValueHelp = () => {
        if (!selectedWarehouse) {
            setError("Please select a warehouse first.");
            return;
        }
        setShowResults(false);
        setTasks([]);
        setError(null);
        if (!valueHelpDeliveries) {
            fetchTaskEnrichedDeliveries(selectedWarehouse);
        }
        setShowValueHelp(true);
    };

    // Reset value help when warehouse changes
    useEffect(() => {
        setValueHelpDeliveries(null);
    }, [selectedWarehouse]);

    // --- Claim Resource Handler ---
    const handleClaimResource = async () => {
        if (!claimResourceId.trim()) {
            setClaimError('Please enter or scan a Resource ID.');
            return;
        }
        if (!selectedWarehouse) {
            setClaimError('Please select a Warehouse first.');
            return;
        }
        setClaimLoading(true);
        setClaimError(null);
        setClaimFeedback(null);
        try {
            // Fetch all open PICK tasks for this resource in the selected warehouse
            const res = await api.fetchWarehouseTasks(apiConfig, {
                warehouse: selectedWarehouse,
                resource: claimResourceId.trim().toUpperCase(),
                activityType: 'PICK',
                statusNe: 'C'
            });
            const resourceTasks = (res && res.value) ? res.value : [];
            // Derive warehouse order from first task (if any)
            const warehouseOrder = resourceTasks.length > 0 ? (resourceTasks[0].WarehouseOrder || '') : '';
            setClaimFeedback({ ok: true, msg: `${resourceTasks.length} open task(s) found.` });
            // Short pause so user sees the green feedback, then navigate
            setTimeout(() => {
                setShowClaimModal(false);
                navigate('/warehouse-outbound/system-guided', {
                    state: {
                        resourceId: claimResourceId.trim().toUpperCase(),
                        warehouse: selectedWarehouse,
                        warehouseOrder,
                        tasks: resourceTasks
                    }
                });
            }, 600);
        } catch (err) {
            setClaimError(err.message || 'Failed to load tasks for resource.');
        } finally {
            setClaimLoading(false);
        }
    };

    // Lazy-fetch completed tasks when user checks the box
    const handleToggleCompleted = async (checked) => {
        setShowCompleted(checked);
        if (checked && !completedFetched && showResults) {
            setFetchingCompleted(true);
            try {
                // Build same filters as the initial search but for completed status
                const filters = {
                    warehouse: selectedWarehouse,
                    status: 'C',
                    activityType: 'PICK',
                };
                // Add the same search filter that was used
                const finalVal = searchValue.trim();
                if (searchBy === 'OBD' && finalVal) {
                    filters.deliveryDocument = finalVal;
                } else if (searchBy === 'Product' && finalVal) {
                    filters.product = finalVal;
                } else if (searchBy === 'HU' && finalVal) {
                    filters.handlingUnit = finalVal;
                }

                const res = await api.fetchWarehouseTasks(apiConfig, filters);
                const fetched = (res && res.value) ? res.value : [];
                setCompletedTasks(fetched);
                setCompletedFetched(true);
            } catch (err) {
                console.warn('Failed to fetch completed tasks:', err);
                setCompletedTasks([]);
                setCompletedFetched(true);
            } finally {
                setFetchingCompleted(false);
            }
        }
    };

    // Combine open + completed tasks for filtering
    const allDisplayTasks = showCompleted ? [...tasks, ...completedTasks] : tasks;

    // Filter results based on status checkboxes
    const filteredResults = allDisplayTasks.filter(task => {
        const isCompleted = task.WarehouseTaskStatus === 'C';
        if (isCompleted && showCompleted) return true;
        if (!isCompleted && showOpen) return true;
        return false;
    });

    const openCount = tasks.length;
    const completedCount = completedTasks.length;

    const renderError = () => {
        if (!error) return null;
        return (
            <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg shadow-sm flex items-start justify-between">
                <div className="flex gap-3">
                    <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                    <p className="text-sm text-red-700 whitespace-pre-wrap">{error}</p>
                </div>
                <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-md shrink-0 ml-4"><X size={16} className="text-red-500" /></button>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
            {/* Header */}
            <header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                <div className="flex justify-between items-center relative">
                    <button onClick={() => navigate(-1)} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" title="Back">
                        <ArrowLeft size={20} className="text-white" />
                    </button>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <h1 className="text-xl font-bold text-white tracking-wide">Picking</h1>
                        <p className="text-blue-200 text-[10px] font-medium uppercase tracking-wider mt-0.5">Tasks</p>
                    </div>
                    <button onClick={() => navigate('/menu', { replace: true })} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" title="Home">
                        <Home size={20} className="text-white" />
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 content-area pb-24" style={{ zIndex: 10, position: 'relative' }}>
                <div className="max-w-md mx-auto">
                    {renderError()}
                    {/* System Guided Entry Button */}
                    <button
                        onClick={() => {
                            setClaimResourceId('');
                            setClaimError(null);
                            setClaimFeedback(null);
                            setShowClaimModal(true);
                        }}
                        className="w-full flex items-center justify-center gap-2 bg-white border border-slate-200 text-brand-blue font-bold py-3 rounded-xl shadow-sm hover:bg-blue-50 hover:border-brand-blue transition-all mb-3"
                    >
                        <Zap size={18} className="text-amber-500" />
                        Picking — System Guided
                    </button>

                    <div className="bg-white shadow-sm border border-slate-200 w-full p-5 rounded-xl">
                        <form id="pickingSearchForm" onSubmit={handleSearch} className="flex flex-col gap-4">

                            {/* Warehouse */}
                            <div className="w-full">
                                <Select
                                    label={<>Warehouse <span className="text-red-500">*</span></>}
                                    value={selectedWarehouse}
                                    onChange={(e) => setSelectedWarehouse(e.target.value)}
                                    required
                                    options={[
                                        { value: '', label: 'Select Warehouse', disabled: true },
                                        ...warehouses.map(w => ({
                                            value: w.EWMWarehouse,
                                            label: `${w.EWMWarehouse} - ${w.EWMWarehouse_Text || w.EWMWarehouse}`
                                        }))
                                    ]}
                                />
                            </div>

                            {/* Search By + Input */}
                            <div className="flex flex-col gap-4">
                                <div className="w-full">
                                    <Select
                                        label="Search By"
                                        value={searchBy}
                                        onChange={(e) => { setSearchBy(e.target.value); setSearchValue(''); setDropdownOptions([]); }}
                                        options={[
                                            { value: 'OBD', label: 'Outbound Delivery' },
                                            { value: 'WarehouseOrder', label: 'Warehouse Order' },
                                            { value: 'Product', label: 'Product / GTIN' },
                                            { value: 'HU', label: 'Handling Unit' }
                                        ]}
                                    />
                                </div>
                                <div className="w-full">
                                    <div className="relative">
                                        <Input
                                            label={<span className="md:hidden">{searchBy === 'OBD' ? 'Delivery Number' : searchBy === 'WarehouseOrder' ? 'Warehouse Order' : searchBy === 'HU' ? 'HU Identifier' : 'Product ID or GTIN'}</span>}
                                            placeholder={searchBy === 'OBD' ? 'Leave empty for all open OBDs' : searchBy === 'WarehouseOrder' ? 'Scan or type Order' : searchBy === 'Product' ? 'Scan GTIN or type Product ID' : 'Scan or type HU'}
                                            value={searchValue}
                                            onChange={(e) => setSearchValue(e.target.value.toUpperCase())}
                                            onFocus={() => { if (searchBy !== 'OBD') setIsDropdownOpen(true); }}
                                            onBlur={() => { setTimeout(() => setIsDropdownOpen(false), 200); }}
                                            leftIcon={<Search size={18} />}
                                            rightIcon={
                                                <div className="flex items-center gap-1 shrink-0 bg-transparent h-full mr-2">
                                                    {searchBy === 'OBD' && (
                                                        <button
                                                            type="button"
                                                            onClick={handleOpenValueHelp}
                                                            className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-brand-blue hover:bg-blue-50 bg-slate-100 rounded-lg transition-colors"
                                                            title="Browse Deliveries"
                                                        >
                                                            <List size={20} />
                                                        </button>
                                                    )}
                                                    {searchBy !== 'OBD' && (
                                                        <button
                                                            type="button"
                                                            onMouseDown={(e) => { 
                                                                e.preventDefault();
                                                                setIsDropdownOpen(prev => !prev); 
                                                                if (!isDropdownOpen && dropdownOptions.length === 0) fetchDropdownOptions(searchBy); 
                                                            }}
                                                            className="w-9 h-9 p-0 flex items-center justify-center text-gray-400 hover:text-brand-blue hover:bg-slate-200 rounded-md transition-colors"
                                                            title="Browse list"
                                                        >
                                                            <List size={20} />
                                                        </button>
                                                    )}
                                                    {searchValue && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setSearchValue('')}
                                                            className="w-9 h-9 p-0 flex items-center justify-center text-gray-300 hover:text-gray-500 rounded-md transition-colors"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowScanner(true)}
                                                        className="w-9 h-9 p-0 flex items-center justify-center bg-brand-blue text-white rounded-lg hover:opacity-90 transition-colors shrink-0"
                                                        title="Open Scanner"
                                                    >
                                                        <Scan size={20} />
                                                    </button>
                                                </div>
                                            }
                                            autoComplete="off"
                                            autoCorrect="off"
                                            wrapperClassName="md:mt-5"
                                        />

                                        {/* Dropdown value help (HU & Product only) */}
                                        {isDropdownOpen && searchBy !== 'OBD' && (
                                            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto top-full left-0">
                                                {fetchingDropdown ? (
                                                    <div className="p-4 text-sm text-gray-500 text-center flex items-center justify-center gap-2">
                                                        <div className="w-5 h-5 border-2 border-brand-blue border-t-transparent rounded-full animate-spin"></div> Loading...
                                                    </div>
                                                ) : filteredOptions.length === 0 ? (
                                                    <div className="p-4 text-sm text-gray-500 text-center">
                                                        {searchBy === 'Product' ? 'No products found. You can still type a Product ID or GTIN.' :
                                                         searchBy === 'WarehouseOrder' ? 'No open Warehouse Orders found today.' :
                                                            `No handling units found.`}
                                                    </div>
                                                ) : (
                                                    <div className="py-1">
                                                        {filteredOptions.map((opt, i) => {
                                                            const { val, sub } = renderDropdownItem(opt);
                                                            return (
                                                                <div
                                                                    key={val + '-' + i}
                                                                    className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b last:border-0 border-gray-100 text-left transition-colors"
                                                                    onMouseDown={(e) => {
                                                                        e.preventDefault();
                                                                        setSearchValue(getDropdownSelectValue(opt));
                                                                        setIsDropdownOpen(false);
                                                                    }}
                                                                >
                                                                    <div className="font-semibold text-gray-800 text-sm">{val}</div>
                                                                    {sub && <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {searchBy === 'Product' && (
                                            <p className="text-[11px] text-gray-400 mt-1.5 px-1">
                                                Enter a Product ID (e.g. TG30) or scan a GTIN barcode.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* OBD optional filters (collapsible) */}
                            {searchBy === 'OBD' && (
                                <div className="border-t border-slate-100 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => setShowFilters(p => !p)}
                                        className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 transition-colors py-1 w-full text-left"
                                    >
                                        <SlidersHorizontal size={12} />
                                        Optional Filters
                                        <ChevronDown size={12} className={`ml-auto transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                                    </button>
                                    {showFilters && (
                                        <div className="space-y-3 mt-2">
                                            <div>
                                                <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Ship-To Party</label>
                                                <input type="text" value={obdShipTo} onChange={e => setObdShipTo(e.target.value)} placeholder="e.g. 10001234"
                                                    className="w-full h-11 bg-slate-50 border border-blue-200 rounded-lg px-3 text-sm font-bold text-blue-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
                                            </div>
                                            <div className="flex flex-col gap-3">
                                                <div>
                                                    <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 flex items-center gap-1"><Calendar size={10} /> Date From</label>
                                                    <input type="date" value={obdDateFrom} onChange={e => setObdDateFrom(e.target.value)}
                                                        className="w-full h-11 bg-slate-50 border border-blue-200 rounded-lg px-3 text-sm font-bold text-blue-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 flex items-center gap-1"><Calendar size={10} /> Date To</label>
                                                    <input type="date" value={obdDateTo} onChange={e => setObdDateTo(e.target.value)}
                                                        className="w-full h-11 bg-slate-50 border border-blue-200 rounded-lg px-3 text-sm font-bold text-blue-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="w-full mt-6">
                                <Button
                                    type="submit"
                                    form="pickingSearchForm"
                                    disabled={loading}
                                    className="w-full flex justify-center items-center gap-2"
                                    style={{ minHeight: '3.5rem' }}
                                >
                                    {loading ? (
                                        <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Searching...</>
                                    ) : (
                                        <><Search size={20} /> <span className="text-[16px]">Find Task</span></>
                                    )}
                                </Button>
                            </div>
                        </form>
                    </div>

                    {/* Results List */}
                    {showResults && tasks.length > 0 && (
                        <div className="mt-4 px-2 md:px-0">
                            <div className="flex justify-between items-end mb-3 px-2">
                                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Select Task to Execute</h2>
                                <span className="text-xs font-semibold text-blue-600 bg-blue-100 px-2.5 py-1 rounded-full">{filteredResults.length} Shown</span>
                            </div>

                            {/* Status Filter Checkboxes */}
                            <div className="flex items-center gap-4 mb-3 px-2">
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input type="checkbox" checked={showOpen} onChange={(e) => setShowOpen(e.target.checked)}
                                        className="rounded border-slate-300 text-brand-blue focus:ring-blue-500" style={{ width: 16, height: 16 }} />
                                    <span className="text-xs text-slate-600 font-medium">Open ({openCount})</span>
                                </label>
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input type="checkbox" checked={showCompleted} onChange={(e) => handleToggleCompleted(e.target.checked)}
                                        className="rounded border-slate-300 text-brand-blue focus:ring-blue-500" style={{ width: 16, height: 16 }} />
                                    <span className="text-xs text-slate-600 font-medium">
                                        Completed {fetchingCompleted ? '...' : `(${completedCount})`}
                                    </span>
                                    {fetchingCompleted && (
                                        <div className="w-3 h-3 border-2 border-brand-blue border-t-transparent rounded-full animate-spin"></div>
                                    )}
                                </label>
                            </div>

                            <div className="space-y-3 pb-8">
                                {filteredResults.map((doc, idx) => {
                                    const isCompleted = doc.WarehouseTaskStatus === 'C';
                                    return (
                                        <div
                                            key={doc.WarehouseTask + idx}
                                            onClick={() => !isCompleted && navigate(`/warehouse-outbound/picking/${selectedWarehouse}/${doc.WarehouseTask}/${doc.WarehouseTaskItem}`)}
                                            className={`bg-white rounded-xl p-4 shadow-sm border transition-colors flex items-center justify-between group ${isCompleted
                                                ? 'border-slate-200 opacity-60 cursor-default'
                                                : 'border-slate-200 active:bg-slate-100 hover:border-blue-300 cursor-pointer'
                                                }`}
                                        >
                                            <div className="flex items-start gap-4 flex-1 min-w-0">
                                                <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${isCompleted ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                                                    {isCompleted ? <CheckCircle size={20} /> : <PackageOpen size={20} />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start">
                                                        <h3 className="font-bold text-gray-800 text-base">WT: {doc.WarehouseTask}</h3>
                                                        <span className="font-mono font-bold text-brand-blue">{doc.TargetQuantityInBaseUnit} {doc.BaseUnit}</span>
                                                    </div>
                                                    <p className="text-xs text-slate-500 mt-1 truncate">
                                                        Product: <span className="font-semibold text-gray-700">{stripZeros(doc.Product)}</span>
                                                        {getDescription(doc.Product) && <span className="text-xs text-slate-400 font-normal"> · {getDescription(doc.Product)}</span>}
                                                    </p>

                                                    <p className="text-[11px] text-gray-400 mt-0.5">
                                                        {doc.SourceStorageBin || 'ZONE'} ➔ {doc.DestinationStorageBin || 'Any Bin'}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isCompleted
                                                            ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                            {isCompleted ? 'Completed' : 'Open'}
                                                        </span>
                                                        {doc.WarehouseActivityType && (
                                                            <span className="text-[10px] text-slate-400 font-medium">
                                                                {doc.WarehouseActivityType}{ACTIVITY_TYPE_LABELS[doc.WarehouseActivityType] ? ` · ${ACTIVITY_TYPE_LABELS[doc.WarehouseActivityType]}` : ''}
                                                            </span>
                                                        )}

                                                    </div>
                                                </div>
                                            </div>
                                            {!isCompleted && <ChevronRight className="text-gray-400 group-hover:text-blue-500 transition-colors shrink-0 ml-2" size={20} />}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    {showResults && !loading && tasks.length === 0 && (
                        <div className="mt-6 animate-in fade-in slide-in-from-bottom-2 duration-300 px-2 md:px-0">
                            <div className="text-center py-10 px-4 bg-white rounded-xl border-2 border-dashed border-red-200 shadow-sm">
                                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <AlertCircle size={32} className="text-red-400" />
                                </div>
                                <h3 className="text-gray-900 font-bold text-lg mb-1">No Tasks Found</h3>
                                <p className="text-gray-500 text-sm max-w-xs mx-auto mb-4">
                                    No picking tasks found for {searchBy === 'OBD' ? 'Outbound Delivery' : searchBy === 'Product' ? 'Product' : 'Handling Unit'} <span className="font-mono font-bold text-gray-700">{searchValue}</span>.
                                </p>
                                <div className="bg-orange-50 text-orange-800 text-xs px-3 py-2 rounded-lg inline-block border border-orange-100 text-left">
                                    <ul className="list-disc list-inside space-y-1">
                                        <li>Double-check the ID you entered.</li>
                                        <li>Ensure the task hasn't already been completed.</li>
                                        <li>Verify the task exists in Warehouse {selectedWarehouse}.</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {showScanner && (
                <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
            )}

            {showValueHelp && (
                <OutboundDeliveryValueHelp
                    onSelect={handleValueHelpSelect}
                    onClose={() => setShowValueHelp(false)}
                    deliveries={valueHelpDeliveries || []}
                    loading={fetchingValueHelp}
                />
            )}

            {/* Claim Resource Modal */}
            {showClaimModal && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <Zap size={18} className="text-amber-500" />
                                <h3 className="font-bold text-slate-800">Claim Resource</h3>
                            </div>
                            <button onClick={() => setShowClaimModal(false)} className="p-1 rounded-full hover:bg-slate-100"><X size={20} /></button>
                        </div>
                        <div className="px-5 py-4 space-y-4">
                            <p className="text-xs text-slate-500">Scan or enter your Resource ID to load all picking tasks assigned to you.</p>

                            {/* Resource ID Input */}
                            <div className="relative">
                                <Input
                                    label="Resource ID"
                                    value={claimResourceId}
                                    onChange={e => { setClaimResourceId(e.target.value.toUpperCase()); setClaimError(null); setClaimFeedback(null); setShowResourceHelp(false); }}
                                    placeholder="Scan or type resource..."
                                    className="font-mono uppercase"
                                    autoFocus
                                    rightIcon={
                                        <div className="flex h-full">
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    if (showResourceHelp) { setShowResourceHelp(false); return; }
                                                    if (!selectedWarehouse) { setClaimError('Select a warehouse first.'); return; }
                                                    setShowResourceHelp(true);
                                                    setResourceHelpLoading(true);
                                                    try {
                                                        const res = await api.fetchWarehouseResources(apiConfig, selectedWarehouse);
                                                        setResourceHelpList(res.value || []);
                                                    } catch (_) { setResourceHelpList([]); }
                                                    finally { setResourceHelpLoading(false); }
                                                }}
                                                className="px-2.5 flex items-center justify-center bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors border-l border-slate-200"
                                                title="Browse Resources"
                                            >
                                                <List size={18} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setClaimScannerOpen(true)}
                                                className="w-9 h-9 flex items-center justify-center bg-brand-blue text-white rounded-r-lg hover:bg-blue-800 transition"
                                            >
                                                <Scan size={18} />
                                            </button>
                                        </div>
                                    }
                                />
                                {/* Resource Value Help Dropdown */}
                                {showResourceHelp && (
                                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                                        {resourceHelpLoading ? (
                                            <div className="flex justify-center p-4"><Loader size={20} className="animate-spin text-blue-500" /></div>
                                        ) : resourceHelpList.length === 0 ? (
                                            <p className="p-3 text-sm text-slate-400 text-center">No resources found for {selectedWarehouse}.</p>
                                        ) : (
                                            resourceHelpList
                                                .filter(r => !claimResourceId || (r.EWMResource || '').toUpperCase().includes(claimResourceId))
                                                .map(r => (
                                                    <button
                                                        key={r.EWMResource}
                                                        type="button"
                                                        onClick={() => { setClaimResourceId(r.EWMResource); setShowResourceHelp(false); setClaimError(null); }}
                                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0 flex justify-between items-center"
                                                    >
                                                        <div>
                                                            <span className="font-bold text-slate-800 font-mono">{r.EWMResource}</span>
                                                            {r.EWMResourceGroup && <span className="text-xs text-slate-400 ml-2">({r.EWMResourceGroup})</span>}
                                                        </div>
                                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${r.LogonStatus === 'X' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                                            {r.LogonStatus === 'X' ? 'Online' : 'Offline'}
                                                        </span>
                                                    </button>
                                                ))
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Feedback */}
                            {claimError && (
                                <div className="flex items-center gap-2 bg-red-50 text-red-700 p-3 rounded-lg border border-red-200 text-sm">
                                    <AlertCircle size={15} className="shrink-0" /> {claimError}
                                </div>
                            )}
                            {claimFeedback && (
                                <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${claimFeedback.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                    {claimFeedback.ok ? <CheckCircle size={15} className="shrink-0" /> : <AlertCircle size={15} className="shrink-0" />}
                                    {claimFeedback.msg}
                                </div>
                            )}
                        </div>
                        <div className="px-5 pb-5 flex gap-3">
                            <button
                                onClick={() => setShowClaimModal(false)}
                                className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleClaimResource}
                                disabled={claimLoading || !claimResourceId.trim()}
                                className="flex-1 py-3 bg-brand-blue text-white rounded-xl font-bold text-sm hover:bg-opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                            >
                                {claimLoading ? <Loader size={16} className="animate-spin" /> : <><Navigation size={16} /> Claim Resource</>}
                            </button>
                        </div>
                    </div>

                    {/* Scanner inside modal */}
                    {claimScannerOpen && (
                        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
                            <div className="bg-white rounded-2xl p-4 w-full max-w-sm">
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="font-bold text-slate-800">Scan Resource ID</h3>
                                    <button onClick={() => setClaimScannerOpen(false)} className="p-1 rounded-full hover:bg-slate-100"><X size={20} /></button>
                                </div>
                                <BarcodeScanner
                                    onScan={(val) => {
                                        setClaimResourceId(val.trim().toUpperCase());
                                        setClaimScannerOpen(false);
                                        setClaimError(null);
                                        setClaimFeedback({ ok: true, msg: `Scanned: ${val.trim().toUpperCase()}` });
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default PickingSearch;
