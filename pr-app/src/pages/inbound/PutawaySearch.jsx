/**
 * @file PutawaySearch.jsx
 * @description Screen: Putaway Task Search (Inbound Warehouse Process)
 *
 * Allows warehouse operators to find and select putaway warehouse tasks for
 * inbound deliveries (IBDs). The operator can search by:
 *  - Inbound Delivery (IBD) number — the default mode
 *  - Handling Unit (HU) identifier — for HU-managed stock
 *  - Product ID or GTIN barcode
 *
 * PICK tasks are explicitly excluded so only putaway-type work is shown.
 * Tasks from the HU-linked look-up are merged with direct delivery tasks
 * to ensure no tasks are missed when HU packaging is used.
 *
 * If exactly one open task is found, the screen auto-navigates to ConfirmPutaway
 * to streamline the single-scan workflow.
 *
 * ## SAP Process Flow
 *   Search → Select WT → ConfirmPutaway (INB 50)
 *
 * @route /warehouse-inbound/putaway
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Home, Search, Scan, AlertCircle, X, ChevronRight, PackageOpen, List, CheckCircle, Calendar, SlidersHorizontal, ChevronDown, Zap, Navigation, Loader } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { useSwipeBack } from '../../hooks/useSwipeBack';
import BarcodeScanner from '../../components/BarcodeScanner';
import InboundDeliveryValueHelp from './InboundDeliveryValueHelp';
import { useProductDescription } from '../../hooks/useProductDescription';
import { ACTIVITY_TYPE_LABELS } from '../../utils/wmLabels';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Heading } from '../../components/ui/Heading';


const PutawaySearch = () => {
    const navigate = useNavigate();
    const { apiConfig } = useAuth();
    const location = useLocation();

    useSwipeBack(() => navigate(-1));
    const { getDescription } = useProductDescription();


    const [warehouses, setWarehouses] = useState([]);
    // Default to UKW2 if available, otherwise empty
    const [selectedWarehouse, setSelectedWarehouse] = useState('UKW2');
    const [searchBy, setSearchBy] = useState('IBD'); // IBD, HU
    const [searchValue, setSearchValue] = useState('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [results, setResults] = useState([]);
    const [showScanner, setShowScanner] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    // Success message (from ConfirmPutaway navigation state)
    const [successMsg, setSuccessMsg] = useState(location.state?.successMsg || '');

    // Value Help State
    const [showValueHelp, setShowValueHelp] = useState(false);
    const [valueHelpDeliveries, setValueHelpDeliveries] = useState(null);
    const [fetchingValueHelp, setFetchingValueHelp] = useState(false);

    // Optional IBD filters
    const [ibdSupplier, setIbdSupplier] = useState('');
    const [ibdDateFrom, setIbdDateFrom] = useState('');
    const [ibdDateTo, setIbdDateTo] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    // Dropdown state for WH Order and Product inline value help
    const [dropdownOptions, setDropdownOptions] = useState([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [fetchingDropdown, setFetchingDropdown] = useState(false);

    // Filter state for results
    const [showOpen, setShowOpen] = useState(true);
    const [showCompleted, setShowCompleted] = useState(false);

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

    // Helper: strip leading zeros for comparisons
    const stripZeros = (str) => str ? String(str).replace(/^0+/, '') || '0' : '';

    // Helper: extract GTIN from GS1 barcode (AI 01 = GTIN)
    const extractGTIN = (scanned) => {
        const gs1Match = scanned.match(/(?:\(01\)|^01)(\d{14})/);
        if (gs1Match) return gs1Match[1];
        if (/^\d{8,14}$/.test(scanned)) return scanned;
        return null;
    };

    // Fetch task-enriched delivery list for the value help modal
    // Cross-checks against real IBD list to exclude OBDs
    const fetchTaskEnrichedDeliveries = useCallback(async (warehouse) => {
        setFetchingValueHelp(true);
        try {
            // Fetch real IBD list first — the authoritative source of truth
            const ibdRes = await api.fetchInboundDeliveriesA2X(apiConfig, { warehouse });
            const allIBDs = (ibdRes && ibdRes.value) ? ibdRes.value : [];
            const validIBDSet = new Set(allIBDs.map(d => (d.EWMInboundDelivery || '').trim()));

            // Fetch warehouse tasks
            const wtRes = await api.fetchWarehouseTasks(apiConfig, { warehouse });
            const allTasks = ((wtRes && wtRes.value) ? wtRes.value : []);
            const deliveryMap = new Map();

            // Pre-populate from actual IBD list
            allIBDs.forEach(d => {
                const delNum = (d.EWMInboundDelivery || '').trim();
                if (!delNum) return;
                deliveryMap.set(delNum, {
                    EWMInboundDelivery: delNum,
                    openTaskCount: 0,
                    completedTaskCount: 0,
                    products: new Set(),
                });
            });

            // Enrich with task data — only for known IBDs, skip PICK tasks (those are OBD)
            allTasks.forEach(t => {
                if ((t.WarehouseActivityType || '').trim().toUpperCase() === 'PICK') return;
                const del = (t.EWMDelivery || '').trim();
                if (!del || !validIBDSet.has(del)) return; // skip OBDs
                const entry = deliveryMap.get(del);
                if (!entry) return;
                if (t.WarehouseTaskStatus === 'C') entry.completedTaskCount++;
                else entry.openTaskCount++;
                if (t.Product) entry.products.add(t.Product.trim());
            });

            const ibdList = Array.from(deliveryMap.values()).map(d => ({
                EWMInboundDelivery: d.EWMInboundDelivery,
                openTaskCount: d.openTaskCount,
                completedTaskCount: d.completedTaskCount,
                totalTaskCount: d.openTaskCount + d.completedTaskCount,
                products: [...d.products],
                status: d.openTaskCount > 0 ? 'Open' : 'Completed'
            }));
            ibdList.sort((a, b) => b.openTaskCount - a.openTaskCount);
            setValueHelpDeliveries(ibdList);
        } catch (err) {
            console.error('Failed to fetch task-enriched deliveries:', err);
            setValueHelpDeliveries([]);
        } finally {
            setFetchingValueHelp(false);
        }
    }, [apiConfig]);


    // Fetch dropdown options for WarehouseOrder and Product
    const fetchDropdownOptions = async (type) => {
        setFetchingDropdown(true);
        try {
            if (type === 'WarehouseOrder' && selectedWarehouse) {
                const res = await api.fetchWarehouseOrders(apiConfig, { warehouse: selectedWarehouse, dateToday: true });
                if (res && res.value) setDropdownOptions(res.value.filter(o => o.WarehouseOrderStatus !== 'C'));
            } else if (type === 'Product') {
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
                                ProductStandardID: r.ProductStandardID || ''
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
        } else if (selectedWarehouse && searchBy === 'WarehouseOrder') {
            fetchDropdownOptions(searchBy);
        } else {
            setDropdownOptions([]);
        }
    }, [searchBy, selectedWarehouse, apiConfig]);

    const filteredOptions = dropdownOptions.filter(opt => {
        if (!searchValue) return true;
        const upper = searchValue.toUpperCase();
        if (searchBy === 'WarehouseOrder') {
            return opt.WarehouseOrder && opt.WarehouseOrder.toUpperCase().includes(upper);
        } else if (searchBy === 'Product') {
            const prodMatch = opt.Product && opt.Product.toUpperCase().includes(upper);
            const eanMatch = opt.ProductStandardID && opt.ProductStandardID.includes(upper);
            return prodMatch || eanMatch;
        }
        return true;
    });

    const renderDropdownItem = (opt) => {
        if (searchBy === 'WarehouseOrder') {
            return { val: opt.WarehouseOrder, sub: `Created: ${opt.CreationDateTime ? opt.CreationDateTime.substring(0, 10) : ''}` };
        } else if (searchBy === 'Product') {
            return { val: opt.Product, sub: opt.ProductStandardID ? `GTIN: ${opt.ProductStandardID}` : '' };
        }
        return { val: '', sub: '' };
    };

    const getDropdownSelectValue = (opt) => {
        if (searchBy === 'WarehouseOrder') return opt.WarehouseOrder;
        if (searchBy === 'Product') return opt.Product;
        return '';
    };

    // --- State Restoration (sessionStorage) ---
    useEffect(() => {
        const saved = sessionStorage.getItem('putawaySearchState');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (parsed.searchBy) setSearchBy(parsed.searchBy);
                if (parsed.searchValue !== undefined) setSearchValue(parsed.searchValue);
                if (parsed.selectedWarehouse) setSelectedWarehouse(parsed.selectedWarehouse);
                
                let restoredTasks = parsed.results || [];
                if (window.history.state?.usr?.confirmedTaskId) {
                    restoredTasks = restoredTasks.filter(t => t.WarehouseTask !== window.history.state.usr.confirmedTaskId);
                }
                
                setResults(restoredTasks);
                if (parsed.hasSearched) setHasSearched(true);
                
                sessionStorage.setItem('putawaySearchState', JSON.stringify({
                    ...parsed,
                    results: restoredTasks
                }));
            } catch(e) { console.error('Error restoring session state', e); }
        }
    }, [location]);

    // Initial Load: Fetch Warehouses
    useEffect(() => {
        const loadWarehouses = async () => {
            try {
                const res = await api.fetchWarehouses(apiConfig);
                if (res && res.value) {
                    setWarehouses(res.value);
                    if (res.value.length === 1) {
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

    const handleSearch = async (e) => {
        if (e) e.preventDefault();
        setError(null);
        setResults([]);
        setHasSearched(true);

        if (!selectedWarehouse) {
            setError('Please select a warehouse first.');
            return;
        }

        let finalSearchValue = searchValue.trim();
        if (!finalSearchValue && searchBy === 'IBD' && !ibdSupplier && !ibdDateFrom && !ibdDateTo) {
            setError('Please enter a valid Delivery Document or use the optional filters.');
            return;
        }
        if (!finalSearchValue && searchBy === 'WarehouseOrder') {
            setError('Please enter a Warehouse Order.');
            return;
        }
        if (!finalSearchValue && searchBy === 'HU') {
            setError('Please enter a valid Handling Unit.');
            return;
        }
        if (searchBy === 'Product' && !finalSearchValue) {
            setError('Please enter a Product ID or scan a GTIN.');
            return;
        }

        // Convert GS1 barcode if it's a Product or HU scan
        if (finalSearchValue.startsWith('01') && finalSearchValue.length > 14) {
            finalSearchValue = finalSearchValue.substring(2, 16);
        }

        setLoading(true);
        try {
            let filters = { warehouse: selectedWarehouse };

            if (searchBy === 'IBD') {
                if (finalSearchValue) {
                    filters.deliveryDocument = finalSearchValue;
                } else if (ibdSupplier || ibdDateFrom || ibdDateTo) {
                    let ibdFilters = { warehouse: selectedWarehouse, supplier: ibdSupplier, dateFrom: ibdDateFrom, dateTo: ibdDateTo };
                    const ibdRes = await api.fetchInboundDeliveriesA2X(apiConfig, ibdFilters);
                    const ibds = (ibdRes && ibdRes.value) ? ibdRes.value : [];
                    if (ibds.length === 0) {
                        setError("No deliveries found matching those filters.");
                        setLoading(false);
                        return;
                    }
                    const delivIds = ibds.map(d => d.InboundDelivery || d.DeliveryDocument).filter(Boolean);
                    filters.deliveryDocuments = [...new Set(delivIds)].slice(0, 40); // Cap at 40
                }
            } else if (searchBy === 'WarehouseOrder') {
                filters.warehouseOrder = finalSearchValue;
            } else if (searchBy === 'WarehouseOrder') {
                filters.warehouseOrder = finalSearchValue;
            } else if (searchBy === 'HU') {
                filters.handlingUnit = finalSearchValue;
            } else if (searchBy === 'Product') {
                // Determine if input is a GTIN or Product ID
                let productId = finalSearchValue;
                const gtinCandidate = extractGTIN(finalSearchValue);

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

                // Use server-side product filter
                filters.product = productId;

                const allRes = await api.fetchWarehouseTasks(apiConfig, filters);
                const allTasks = (allRes && allRes.value) ? allRes.value : [];
                let filteredTasks = allTasks.filter(t => (t.WarehouseActivityType || '').trim().toUpperCase() !== 'PICK');

                if (filteredTasks.length === 0) {
                    setResults([]);
                } else {
                    setResults(filteredTasks);
                }
                setLoading(false);
                return;
            }

            // In INB 40, we only care about Open tasks (WT Status !== 'C')
            let res;
            let tasks = [];

            if (searchBy === 'IBD') {
                // 1. Load Warehouse Tasks tied directly to the Delivery Document
                res = await api.fetchWarehouseTasks(apiConfig, filters);
                tasks = (res && res.value) ? res.value : [];

                // 2. Additive Check: Also fetch Warehouse Tasks tied to HUs packed for this delivery
                try {
                    const huRes = await api.fetchHandlingUnits(apiConfig, { warehouse: selectedWarehouse, referenceDocument: finalSearchValue });
                    if (huRes && huRes.value && huRes.value.length > 0) {
                        const handlingUnits = huRes.value.map(hu => hu.HandlingUnitExternalID);
                        const huWtRes = await api.fetchWarehouseTasks(apiConfig, { warehouse: selectedWarehouse, handlingUnits });
                        if (huWtRes && huWtRes.value && huWtRes.value.length > 0) {
                            // Merge uniquely
                            const existingWTs = new Set(tasks.map(t => t.WarehouseTask));
                            const newWTs = huWtRes.value.filter(t => !existingWTs.has(t.WarehouseTask));
                            tasks = [...tasks, ...newWTs];
                        }
                    }
                } catch (huErr) {
                    console.warn("Failed to fetch Handling Units for additive WT lookup:", huErr);
                }
            } else {
                // If searching directly by HU, just use the direct fetch
                res = await api.fetchWarehouseTasks(apiConfig, filters);
                tasks = (res && res.value) ? res.value : [];
            }

            // Filter out PICK tasks
            tasks = tasks.filter(t => (t.WarehouseActivityType || '').trim().toUpperCase() !== 'PICK');

            if (tasks.length === 1 && tasks[0].WarehouseTaskStatus !== 'C') {
                // Navigate directly to Confirm screen INB 50
                const t = tasks[0];
                navigate(`/warehouse-inbound/putaway/${t.EWMWarehouse}/${t.WarehouseTask}/${t.WarehouseTaskItem}`);
            } else {
                // Show all tasks (open + completed) — user will filter
                setResults(tasks);
            }
            
            // Save search state for back navigation
            sessionStorage.setItem('putawaySearchState', JSON.stringify({
                searchBy, searchValue, selectedWarehouse, results: tasks, hasSearched: true
            }));
        } catch (err) {
            console.error(err);
            setError(err.message || 'Error occurred during search.');
        } finally {
            setLoading(false);
        }
    };

    const handleScan = (decodedText) => {
        setSearchValue(decodedText.toUpperCase());
        setShowScanner(false);
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
        setHasSearched(false);
        setResults([]);
        setError(null);
        // Fetch task-enriched data if not already fetched
        if (!valueHelpDeliveries) {
            fetchTaskEnrichedDeliveries(selectedWarehouse);
        }
        setShowValueHelp(true);
    };

    // Reset value help data when warehouse changes
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
            // Fetch all open non-PICK tasks for this resource in the selected warehouse
            const res = await api.fetchWarehouseTasks(apiConfig, {
                warehouse: selectedWarehouse,
                resource: claimResourceId.trim().toUpperCase(),
                statusNe: 'C'
            });
            const allTasks = (res && res.value) ? res.value : [];
            // Filter out PICK tasks — putaway uses non-PICK activity types
            const resourceTasks = allTasks.filter(t =>
                (t.WarehouseActivityType || '').trim().toUpperCase() !== 'PICK'
            );
            // Derive warehouse order from first task (if any)
            const warehouseOrder = resourceTasks.length > 0 ? (resourceTasks[0].WarehouseOrder || '') : '';
            setClaimFeedback({ ok: true, msg: `${resourceTasks.length} open task(s) found.` });
            // Short pause so user sees the green feedback, then navigate
            setTimeout(() => {
                setShowClaimModal(false);
                navigate('/warehouse-inbound/system-guided', {
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

    // Filter results based on status checkboxes
    const filteredResults = results.filter(task => {
        const isCompleted = task.WarehouseTaskStatus === 'C';
        if (isCompleted && showCompleted) return true;
        if (!isCompleted && showOpen) return true;
        return false;
    });

    const openCount = results.filter(t => t.WarehouseTaskStatus !== 'C').length;
    const completedCount = results.filter(t => t.WarehouseTaskStatus === 'C').length;

    const renderError = () => {
        if (!error) return null;
        return (
            <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg shadow-sm flex items-start justify-between">
                <div className="flex gap-3">
                    <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                    <p className="text-sm text-red-700 whitespace-pre-wrap">{error}</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); setError(null); }} className="p-1 hover:bg-red-100 rounded-md shrink-0 ml-4"><X size={16} className="text-red-500" /></button>
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
                        <h1 className="text-xl font-bold text-white tracking-wide">
                            Putaway
                        </h1>
                                                <p className="text-blue-200 text-[10px] font-medium uppercase tracking-wider mt-0.5">
                                                    Tasks
                                                </p>
                    </div>

                    <button onClick={() => navigate('/menu', { replace: true })} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" title="Home">
                                            <Home size={20} className="text-white" />
                                        </button>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 content-area pb-24" style={{ zIndex: 10, position: 'relative' }} onClick={() => { if (error) setError(null); }}>
                <div className="max-w-md mx-auto">
                    {successMsg && (
                        <div className="mb-4 bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded-r-lg shadow-sm flex items-start justify-between">
                            <div className="flex gap-3">
                                <CheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={18} />
                                <p className="text-sm text-emerald-700 whitespace-pre-wrap">{successMsg}</p>
                            </div>
                            <button onClick={() => setSuccessMsg('')} className="p-1 hover:bg-emerald-100 rounded-md shrink-0 ml-4"><X size={16} className="text-emerald-500" /></button>
                        </div>
                    )}
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
                        Putaway — System Guided
                    </button>

                    {/* Search Form */}
                    <div className="bg-white shadow-sm border border-slate-200 w-full p-5 rounded-xl">
                        <form id="putawaySearchForm" onSubmit={handleSearch} className="flex flex-col gap-4">

                            {/* Warehouse Dropdown */}
                            <Select
                                label="Warehouse"
                                value={selectedWarehouse}
                                onChange={(e) => setSelectedWarehouse(e.target.value)}
                                required
                                options={[
                                    { value: "", label: "Select Warehouse", disabled: true },
                                    ...warehouses.map(w => ({
                                        value: w.EWMWarehouse,
                                        label: `${w.EWMWarehouse} - ${w.EWMWarehouse_Text || w.EWMWarehouse}`
                                    }))
                                ]}
                            />

                            {/* Search By Dropdown & Input Row */}
                            <div className="flex flex-col gap-4">
                                <div className="w-full">
                                    <Select
                                        label="Search By"
                                        value={searchBy}
                                        onChange={(e) => {
                                            setSearchBy(e.target.value);
                                            setSearchValue('');
                                            setResults([]);
                                            setHasSearched(false);
                                            setError(null);
                                            setShowValueHelp(false);
                                        }}
                                        options={[
                                            { value: "IBD", label: "Inbound Delivery" },
                                            { value: "WarehouseOrder", label: "Warehouse Order" },
                                            { value: "Product", label: "Product / GTIN" },
                                            { value: "HU", label: "Handling Unit" }
                                        ]}
                                    />
                                </div>

                                <div className="w-full">
                                            <Input
                                                label={<span className="md:hidden">{searchBy === 'IBD' ? 'Delivery Number' : searchBy === 'WarehouseOrder' ? 'Warehouse Order' : searchBy === 'Product' ? 'Product ID or GTIN' : 'Handling Unit'}</span>}
                                                leftIcon={<Search size={18} className="text-gray-400" />}
                                                placeholder={
                                                    searchBy === 'Product' ? 'Scan GTIN or type Product ID' : searchBy === 'WarehouseOrder' ? 'Scan or type Order' :
                                                        `Scan or type ${searchBy}...`
                                                }
                                            value={searchValue}
                                            onChange={(e) => setSearchValue(e.target.value.toUpperCase())}
                                            onFocus={() => { if (searchBy !== 'IBD') setIsDropdownOpen(true); }}
                                            onBlur={() => { setTimeout(() => setIsDropdownOpen(false), 200); }}
                                            className="uppercase font-mono"
                                            rightIcon={
                                                <div className="flex items-center gap-1">
                                                    {searchBy === 'IBD' && (
                                                        <button
                                                            type="button"
                                                            onClick={handleOpenValueHelp}
                                                            className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-brand-blue hover:bg-blue-50 bg-slate-100 rounded-lg transition-colors"
                                                            title="Browse Deliveries"
                                                        >
                                            <List size={20} />
                                        </button>
                                                    )}
                                                    {searchBy !== 'IBD' && (
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
                                                            className="p-1 text-gray-300 hover:text-gray-500 rounded-md transition-colors"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowScanner(true)}
                                                        className="w-9 h-9 flex items-center justify-center text-white bg-brand-blue hover:bg-blue-800 rounded-lg shadow-sm transition-all active:scale-95"
                                                        title="Scan Barcode"
                                                    >
                                                        <Scan size={20} />
                                                    </button>
                                                </div>
                                            }
                                        />
                                        {/* Dropdown value help (HU & Product) */}
                                        {isDropdownOpen && searchBy !== 'IBD' && (
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
                                        
                                        {/* Helper text */}
                                        {searchBy === 'Product' && (
                                            <p className="text-[11px] text-gray-400 mt-1.5 px-1">
                                                Enter a Product ID (e.g. TG30) or scan a GTIN barcode.
                                            </p>
                                        )}
                                    </div>
                                </div>

                            {/* IBD optional filters (collapsible) */}
                            {searchBy === 'IBD' && (
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
                                                <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Supplier</label>
                                                <input type="text" value={ibdSupplier} onChange={e => setIbdSupplier(e.target.value)} placeholder="e.g. 10001234"
                                                    className="w-full h-11 bg-slate-50 border border-blue-200 rounded-lg px-3 text-sm font-bold text-blue-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
                                            </div>
                                            <div className="flex flex-col gap-3">
                                                <div>
                                                    <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 flex items-center gap-1"><Calendar size={10} /> Date From</label>
                                                    <input type="date" value={ibdDateFrom} onChange={e => setIbdDateFrom(e.target.value)}
                                                        className="w-full h-11 bg-slate-50 border border-blue-200 rounded-lg px-3 text-sm font-bold text-blue-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 flex items-center gap-1"><Calendar size={10} /> Date To</label>
                                                    <input type="date" value={ibdDateTo} onChange={e => setIbdDateTo(e.target.value)}
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
                                    form="putawaySearchForm"
                                    disabled={loading}
                                    className="w-full flex justify-center items-center gap-2"
                                    style={{ minHeight: '3.5rem' }}
                                >
                                    {loading ? (
                                        <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Searching...</>
                                    ) : (
                                        <><Search size={20} /> <span className="text-[16px]">Search Tasks</span></>
                                    )}
                                </Button>
                            </div>
                        </form>
                    </div>

                    {/* Results List (INB 45) */}
                    {
                        results.length > 0 && (
                            <div className="mt-4 px-2 md:px-0">
                                <div className="flex justify-between items-end mb-3 px-2">
                                    <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Select Task to Execute</h2>
                                    <span className="text-xs font-semibold text-blue-600 bg-blue-100 px-2.5 py-1 rounded-full">{filteredResults.length} Shown</span>
                                </div>

                                {/* Status Filter Checkboxes */}
                                <div className="flex items-center gap-4 mb-3 px-2">
                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                        <input type="checkbox" checked={showOpen} onChange={(e) => setShowOpen(e.target.checked)}
                                            className="w-4 h-4 rounded border-slate-300 text-brand-blue focus:ring-blue-500" />
                                        <span className="text-xs text-slate-600 font-medium">Open ({openCount})</span>
                                    </label>
                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                        <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)}
                                            className="w-4 h-4 rounded border-slate-300 text-brand-blue focus:ring-blue-500" />
                                        <span className="text-xs text-slate-600 font-medium">Completed ({completedCount})</span>
                                    </label>
                                </div>

                                <div className="space-y-3 pb-8">
                                    {filteredResults.map((doc, idx) => {
                                        const isCompleted = doc.WarehouseTaskStatus === 'C';
                                        return (
                                            <div
                                                key={doc.WarehouseTask + idx}
                                                onClick={() => !isCompleted && navigate(`/warehouse-inbound/putaway/${doc.EWMWarehouse}/${doc.WarehouseTask}/${doc.WarehouseTaskItem}`)}
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
                                                            {doc.HandlingUnit && <span className="ml-2 text-blue-600 font-medium">HU: {doc.HandlingUnit}</span>}
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
                        )
                    }
                    {
                        hasSearched && !loading && results.length === 0 && (
                            <div className="mt-6 animate-in fade-in slide-in-from-bottom-2 duration-300 px-2 md:px-0">
                                <div className="text-center py-10 px-4 bg-white rounded-xl border-2 border-dashed border-red-200 shadow-sm">
                                    <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <AlertCircle size={32} className="text-red-400" />
                                    </div>
                                    <h3 className="text-gray-900 font-bold text-lg mb-1">No Tasks Found</h3>
                                    <p className="text-gray-500 text-sm max-w-xs mx-auto mb-4">
                                        No open putaway tasks found for {searchBy === 'IBD' ? 'Inbound Delivery' : searchBy === 'Product' ? 'Product' : 'Handling Unit'} <span className="font-mono font-bold text-gray-700">{searchValue}</span>.
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
                        )
                    }
                </div >
            </div >

            {showScanner && (
                <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
            )}

            {
                showValueHelp && (
                    <InboundDeliveryValueHelp
                        warehouse={selectedWarehouse}
                        onSelect={handleValueHelpSelect}
                        onClose={() => setShowValueHelp(false)}

                        deliveries={valueHelpDeliveries}
                        loading={fetchingValueHelp}
                        mode="putaway"
                    />
                )
            }

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
                            <p className="text-xs text-slate-500">Scan or enter your Resource ID to load all putaway tasks assigned to you.</p>

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
        </div >
    );
};

export default PutawaySearch;
