/**
 * @file OutboundDeliverySearch.jsx
 * @description Screen: Outbound Delivery Search
 *
 * Search interface for SAP Outbound Deliveries (OBDs). Users can search by
 * delivery number, ship-to party, or date range. Results link to
 * OutboundDeliveryDetail for goods issue processing.
 *
 * @route /warehouse-outbound/deliveries
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Search, Scan, AlertCircle, X, ChevronRight, ChevronDown, Loader, ArrowLeft, List, Calendar, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import BarcodeScanner from '../../components/BarcodeScanner';
import { useSwipeBack } from '../../hooks/useSwipeBack';
import OutboundDeliveryValueHelp from './OutboundDeliveryValueHelp';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

const OutboundDeliverySearch = () => {
    const navigate = useNavigate();
    const { apiConfig } = useAuth();

    useSwipeBack(() => navigate(-1));

    const [warehouses, setWarehouses] = useState([]);
    const [selectedWarehouse, setSelectedWarehouse] = useState('');
    const [searchBy, setSearchBy] = useState('OBD'); // OBD, HU, Product
    const [searchValue, setSearchValue] = useState('');

    // OBD-specific optional filters
    const toISO = (d) => d ? d.toISOString().slice(0, 10) : '';
    const today = new Date();
    const ninetyDaysAgo = new Date(); ninetyDaysAgo.setDate(today.getDate() - 90);
    const [obdShipTo, setObdShipTo] = useState('');
    const [obdDateFrom, setObdDateFrom] = useState(toISO(ninetyDaysAgo));
    const [obdDateTo, setObdDateTo] = useState(toISO(today));
    const [showFilters, setShowFilters] = useState(false);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showScanner, setShowScanner] = useState(false);

    // Dropdown state (for HU & Product)
    const [dropdownOptions, setDropdownOptions] = useState([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [fetchingDropdown, setFetchingDropdown] = useState(false);

    // OBD Value Help state (task-enriched modal)
    const [showValueHelp, setShowValueHelp] = useState(false);
    const [valueHelpDeliveries, setValueHelpDeliveries] = useState(null);
    const [fetchingValueHelp, setFetchingValueHelp] = useState(false);

    // Helper: strip leading zeros for comparisons
    const stripZeros = (str) => str ? String(str).replace(/^0+/, '') || '0' : '';

    // Fetch task-enriched delivery list for OBD value help modal
    const fetchTaskEnrichedDeliveries = useCallback(async (warehouse) => {
        setFetchingValueHelp(true);
        try {
            const obdRes = await api.fetchOutboundDeliveriesA2X(apiConfig, { warehouse });
            const allOBDs = (obdRes && obdRes.value) ? obdRes.value : [];
            const validOBDSet = new Set(allOBDs.map(d => (d.EWMOutboundDeliveryOrder || '').trim()));

            const deliveryMap = new Map();
            allOBDs.forEach(d => {
                const delNum = (d.EWMOutboundDeliveryOrder || '').trim();
                if (!delNum) return;
                deliveryMap.set(delNum, {
                    EWMOutboundDelivery: delNum,
                    openTaskCount: 0,
                    completedTaskCount: 0,
                    products: new Set(),
                    shipToParty: d.ShipToParty || '',
                });
            });

            const wtRes = await api.fetchWarehouseTasks(apiConfig, { warehouse });
            const allTasks = ((wtRes && wtRes.value) ? wtRes.value : []);
            allTasks.forEach(t => {
                const del = (t.EWMDelivery || '').trim();
                if (!del || !validOBDSet.has(del)) return;
                const entry = deliveryMap.get(del);
                if (!entry) return;
                if (t.WarehouseTaskStatus === 'C') entry.completedTaskCount++;
                else entry.openTaskCount++;
                if (t.Product) entry.products.add(t.Product.trim());
            });

            const obdList = Array.from(deliveryMap.values()).map(d => ({
                EWMOutboundDelivery: d.EWMOutboundDelivery,
                openTaskCount: d.openTaskCount,
                completedTaskCount: d.completedTaskCount,
                totalTaskCount: d.openTaskCount + d.completedTaskCount,
                products: [...d.products],
                shipToParty: d.shipToParty,
            }));
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
            } else if (type === 'Product') {
                const headers = { ...api.getHeaders?.(apiConfig) || {} };
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
        } else if (selectedWarehouse && searchBy === 'HU') {
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
        } else if (searchBy === 'Product') {
            const prodMatch = opt.Product && opt.Product.toUpperCase().includes(upper);
            const eanMatch = opt.ProductStandardID && opt.ProductStandardID.includes(upper);
            return prodMatch || eanMatch;
        }
        return true;
    });

    // Initial Load: Fetch Warehouses
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

    // Reset value help when warehouse changes
    useEffect(() => {
        setValueHelpDeliveries(null);
    }, [selectedWarehouse]);

    const handleOpenValueHelp = () => {
        if (!selectedWarehouse) {
            setError("Please select a warehouse first.");
            return;
        }
        setError(null);
        if (!valueHelpDeliveries) {
            fetchTaskEnrichedDeliveries(selectedWarehouse);
        }
        setShowValueHelp(true);
    };

    const handleValueHelpSelect = (val) => {
        setSearchValue(val);
        setShowValueHelp(false);
    };

    // Helper: detect if a string looks like a GTIN (all digits, 8-14 chars)
    const isGTIN = (val) => /^\d{8,14}$/.test(val);

    // Helper: extract GTIN from GS1 barcode (AI 01 = GTIN)
    const extractGTIN = (scanned) => {
        const gs1Match = scanned.match(/(?:\(01\)|^01)(\d{14})/);
        if (gs1Match) return gs1Match[1];
        if (/^\d{8,14}$/.test(scanned)) return scanned;
        return null;
    };

    const handleSearch = async (e) => {
        if (e) e.preventDefault();
        setError(null);

        if (!selectedWarehouse) {
            setError('Please select a Warehouse.');
            return;
        }

        if (!searchValue.trim() && searchBy !== 'OBD') {
            setError('Please enter a search value.');
            return;
        }

        setLoading(true);

        try {
            let finalSearchValue = searchValue.trim();

            const filters = { warehouse: selectedWarehouse };

            if (searchBy === 'OBD') {
                if (finalSearchValue) filters.deliveryDocument = finalSearchValue;
                if (!finalSearchValue && showFilters) {
                    if (obdShipTo.trim()) filters.shipToParty = obdShipTo.trim().toUpperCase();
                    if (obdDateFrom) filters.dateFrom = obdDateFrom;
                    if (obdDateTo) filters.dateTo = obdDateTo;
                }
            } else if (searchBy === 'HU' && finalSearchValue) {
                try {
                    const huInfo = await api.fetchHandlingUnitDetails(apiConfig, finalSearchValue);
                    if (huInfo) {
                        const obdRef = huInfo.HandlingUnitReferenceDocument;
                        if (obdRef && obdRef.trim() !== '' && !/^0+$/.test(obdRef)) {
                            filters.deliveryDocument = obdRef;
                        } else {
                            throw new Error("Handling unit found but has no valid Outbound Delivery reference.");
                        }
                    } else {
                        throw new Error("Handling unit not found.");
                    }
                } catch (huErr) {
                    throw huErr;
                }
            } else if (searchBy === 'Product' && finalSearchValue) {
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

                const allRes = await api.fetchOutboundDeliveriesA2X(apiConfig, filters);
                const allOBDs = allRes.value || [];

                if (allOBDs.length === 0) {
                    setError("No Outbound Deliveries found in this warehouse.");
                    setLoading(false);
                    return;
                }

                const productIdStripped = stripZeros(productId).toUpperCase();
                const matchingOBDs = [];
                await Promise.all(allOBDs.map(async (obd) => {
                    try {
                        const itemsRes = await api.fetchOutboundDeliveryItemsA2X(apiConfig, selectedWarehouse, obd.EWMOutboundDeliveryOrder);
                        if (itemsRes && itemsRes.value) {
                            const hasProduct = itemsRes.value.some(item => {
                                const itemProd = stripZeros(item.Product || '').toUpperCase();
                                return itemProd === productIdStripped;
                            });
                            if (hasProduct) {
                                matchingOBDs.push(obd);
                            }
                        }
                    } catch (err) {
                        console.warn("Failed to check items for OBD:", obd.EWMOutboundDeliveryOrder, err);
                    }
                }));

                setLoading(false);

                if (matchingOBDs.length === 0) {
                    setError(`No Outbound Deliveries found containing product "${productId}".`);
                    return;
                } else if (matchingOBDs.length === 1) {
                    navigate(`/warehouse-outbound/deliveries/${selectedWarehouse}/${matchingOBDs[0].EWMOutboundDeliveryOrder}`);
                    return;
                } else {
                    navigate('/warehouse-outbound/deliveries/list', {
                        state: { deliveries: matchingOBDs, warehouse: selectedWarehouse, searchBy, searchValue: productId }
                    });
                    return;
                }
            }

            // OBD / HU search — fetch deliveries
            const res = await api.fetchOutboundDeliveriesA2X(apiConfig, filters);
            let deliveries = res.value || [];

            if (deliveries.length === 0 && filters.deliveryDocument) {
                const padded = filters.deliveryDocument.padStart(10, '0');
                if (padded !== filters.deliveryDocument) {
                    const res2 = await api.fetchOutboundDeliveriesA2X(apiConfig, { ...filters, deliveryDocument: padded });
                    deliveries = res2.value || [];
                }
            }

            setLoading(false);
            console.log('OBD search result:', deliveries);

            if (deliveries.length === 0) {
                setError("No Outbound Deliveries found matching your search criteria.");
            } else if (deliveries.length === 1) {
                const delivId = deliveries[0].EWMOutboundDeliveryOrder || deliveries[0].EWMOutboundDelivery || deliveries[0].OutboundDelivery;
                if (!delivId) {
                    setError("Delivery found but ID field is missing. Check API response.");
                    return;
                }
                navigate(`/warehouse-outbound/deliveries/${selectedWarehouse}/${delivId}`);
            } else {
                navigate('/warehouse-outbound/deliveries/list', {
                    state: { deliveries, warehouse: selectedWarehouse, searchBy, searchValue: finalSearchValue }
                });
            }
        } catch (err) {
            setError(err.message || 'Error occurred during search.');
            setLoading(false);
        }
    };

    const handleScan = (code) => {
        setShowScanner(false);
        setSearchValue(code);
    };

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

    // Render dropdown item based on search type
    const renderDropdownItem = (opt) => {
        if (searchBy === 'OBD') {
            return { val: opt.EWMOutboundDeliveryOrder, sub: opt.ShipToParty ? `Ship-To: ${opt.ShipToParty}` : '' };
        } else if (searchBy === 'HU') {
            return { val: opt.HandlingUnitExternalID, sub: opt._HandlingUnitItem ? `Items: ${opt._HandlingUnitItem.length}` : '' };
        } else if (searchBy === 'Product') {
            return {
                val: opt.Product,
                sub: opt.ProductStandardID ? `GTIN: ${opt.ProductStandardID}` : ''
            };
        }
        return { val: '', sub: '' };
    };

    // What value to set when a dropdown item is selected
    const getDropdownSelectValue = (opt) => {
        if (searchBy === 'OBD') return opt.EWMOutboundDeliveryOrder;
        if (searchBy === 'HU') return opt.HandlingUnitExternalID;
        if (searchBy === 'Product') return opt.Product;
        return '';
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
                        <h1 className="text-xl font-bold text-white tracking-wide">Outbound</h1>
                        <p className="text-blue-200 text-[10px] font-medium uppercase tracking-wider mt-0.5">Deliveries</p>
                    </div>
                    <button onClick={() => navigate('/menu', { replace: true })} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" title="Home">
                        <Home size={20} className="text-white" />
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 content-area pb-24" style={{ zIndex: 10, position: 'relative' }}>
                <div className="max-w-md mx-auto">
                    {renderError()}
                    <div className="bg-white shadow-sm border border-slate-200 w-full p-5 rounded-xl mt-6">
                        <form id="outboundSearchForm" onSubmit={handleSearch} className="flex flex-col gap-4">

                            {/* Warehouse Dropdown */}
                            <Select
                                label="Warehouse *"
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

                            {/* Search By */}
                            <div className="flex flex-col gap-4">
                                <div className="w-full">
                                    <Select
                                        label="Search By"
                                        value={searchBy}
                                        onChange={(e) => { setSearchBy(e.target.value); setSearchValue(''); setDropdownOptions([]); }}
                                        options={[
                                            { value: "OBD", label: "Outbound Delivery" },
                                            { value: "Product", label: "Product / GTIN" },
                                            { value: "HU", label: "Handling Unit" }
                                        ]}
                                    />
                                </div>

                                <div className="w-full">
                                    <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wider md:hidden">
                                        {searchBy === 'OBD' ? 'Delivery Number' : searchBy === 'HU' ? 'HU Identifier' : 'Product ID or GTIN'}
                                    </label>
                                    <div className="mt-1 relative">
                                        <Input
                                            leftIcon={<Search size={18} className="text-gray-400" />}
                                            placeholder={
                                                searchBy === 'OBD' ? 'Leave empty for all OBDs' :
                                                    searchBy === 'Product' ? 'Scan GTIN or type Product ID' :
                                                        `Scan or type ${searchBy}`
                                            }
                                            value={searchValue}
                                            onChange={(e) => setSearchValue(e.target.value.toUpperCase())}
                                            onFocus={() => { if (searchBy !== 'OBD') setIsDropdownOpen(true); }}
                                            onBlur={() => {
                                                setTimeout(() => setIsDropdownOpen(false), 200);
                                            }}
                                            autoComplete="off"
                                            autoCorrect="off"
                                            className="font-mono uppercase"
                                            rightIcon={
                                                <div className="flex items-center gap-1">
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
                                                            onClick={() => {
                                                                if (isDropdownOpen) {
                                                                    setIsDropdownOpen(false);
                                                                } else {
                                                                    setIsDropdownOpen(true);
                                                                }
                                                            }}
                                                            className="p-1.5 text-gray-400 hover:text-brand-blue hover:bg-blue-50 rounded-md transition-colors"
                                                            title="Browse List"
                                                        >
                                                            <List size={20} />
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowScanner(true)}
                                                        className="w-9 h-9 p-0 flex items-center justify-center bg-brand-blue text-white rounded-lg hover:opacity-90 transition-colors shrink-0"
                                                        title="Open Scanner"
                                                    >
                                                        <Scan size={18} />
                                                    </button>
                                                </div>
                                            }
                                        />

                                        {/* Dropdown for HU & Product */}
                                        {isDropdownOpen && searchBy !== 'OBD' && (
                                            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto top-full left-0">
                                                {fetchingDropdown ? (
                                                    <div className="p-4 text-sm text-gray-500 text-center flex items-center justify-center gap-2">
                                                        <div className="w-5 h-5 border-2 border-brand-blue border-t-transparent rounded-full animate-spin"></div> Loading...
                                                    </div>
                                                ) : filteredOptions.length === 0 ? (
                                                    <div className="p-4 text-sm text-gray-500 text-center">
                                                        {searchBy === 'Product' ? 'No products found. You can still type a Product ID or GTIN.' :
                                                            `No handling units found.`}
                                                    </div>
                                                ) : (
                                                    <div className="py-1 relative z-50">
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

                                        {/* Product hint text */}
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
                                    form="outboundSearchForm"
                                    disabled={loading}
                                    className="w-full flex justify-center items-center gap-2"
                                    style={{ minHeight: '3.5rem' }}
                                >
                                    {loading ? (
                                        <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Searching...</>
                                    ) : (
                                        <><Search size={20} /> <span className="text-[16px]">Search Deliveries</span></>
                                    )}
                                </Button>
                            </div>
                        </form>
                    </div>
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
        </div>
    );
};

export default OutboundDeliverySearch;
