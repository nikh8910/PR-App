/**
 * @file InboundDeliverySearch.jsx
 * @description Screen: Inbound Delivery Search
 *
 * Search interface for SAP Inbound Deliveries (IBDs). Users can search by
 * delivery number, vendor, or date range. Results are shown as a list and
 * tapping a delivery navigates to InboundDeliveryDetail to post a goods receipt.
 *
 * @route /warehouse-inbound/deliveries
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Home, Search, Scan, AlertCircle, X, List, Calendar, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import BarcodeScanner from '../../components/BarcodeScanner';
import InboundDeliveryValueHelp from './InboundDeliveryValueHelp';
import { useSwipeBack } from '../../hooks/useSwipeBack';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Heading } from '../../components/ui/Heading';

const InboundDeliverySearch = () => {
    const navigate = useNavigate();
    const { apiConfig } = useAuth();

    useSwipeBack(() => navigate(-1));

    const [warehouses, setWarehouses] = useState([]);
    const [selectedWarehouse, setSelectedWarehouse] = useState('');
    const [searchBy, setSearchBy] = useState('IBD'); // IBD, HU, Product
    const [searchValue, setSearchValue] = useState('');

    // IBD-specific optional filters
    const toISO = (d) => d ? d.toISOString().slice(0, 10) : '';
    const today = new Date();
    const ninetyDaysAgo = new Date(); ninetyDaysAgo.setDate(today.getDate() - 90);
    const [ibdSupplier, setIbdSupplier] = useState('');
    const [ibdDateFrom, setIbdDateFrom] = useState(toISO(ninetyDaysAgo));
    const [ibdDateTo, setIbdDateTo] = useState(toISO(today));
    const [showFilters, setShowFilters] = useState(false);


    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showScanner, setShowScanner] = useState(false);
    const [showValueHelp, setShowValueHelp] = useState(false);
    const [valueHelpDeliveries, setValueHelpDeliveries] = useState(null);
    const [fetchingValueHelp, setFetchingValueHelp] = useState(false);

    // Helper: strip leading zeros for comparisons
    const stripZeros = (str) => str ? String(str).replace(/^0+/, '') || '0' : '';

    // Helper: detect if a string looks like a GTIN (all digits, 8-14 chars)
    const isGTIN = (val) => /^\d{8,14}$/.test(val);

    // Helper: extract GTIN from GS1 barcode (AI 01 = GTIN)
    const extractGTIN = (scanned) => {
        const gs1Match = scanned.match(/(?:\(01\)|^01)(\d{14})/);
        if (gs1Match) return gs1Match[1];
        if (/^\d{8,14}$/.test(scanned)) return scanned;
        return null;
    };

    // Fetch task-enriched delivery list for IBD value help modal
    const fetchTaskEnrichedDeliveries = async (warehouse) => {
        setFetchingValueHelp(true);
        try {
            const ibdRes = await api.fetchInboundDeliveriesA2X(apiConfig, { warehouse });
            const allIBDs = (ibdRes && ibdRes.value) ? ibdRes.value : [];
            const validIBDSet = new Set(allIBDs.map(d => (d.EWMInboundDelivery || '').trim()));

            const wtRes = await api.fetchWarehouseTasks(apiConfig, { warehouse });
            const allTasks = ((wtRes && wtRes.value) ? wtRes.value : []);
            const deliveryMap = new Map();

            allIBDs.forEach(d => {
                const delNum = (d.EWMInboundDelivery || '').trim();
                if (!delNum) return;
                deliveryMap.set(delNum, {
                    EWMInboundDelivery: delNum,
                    openTaskCount: 0,
                    completedTaskCount: 0,
                    products: new Set(),
                    Supplier: d.Supplier || '',
                });
            });

            allTasks.forEach(t => {
                const del = (t.EWMDelivery || '').trim();
                if (!del || !validIBDSet.has(del)) return;
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
                Supplier: d.Supplier || '',
            }));
            ibdList.sort((a, b) => b.openTaskCount - a.openTaskCount);
            setValueHelpDeliveries(ibdList);
        } catch (err) {
            console.error('Failed to fetch task-enriched IBD deliveries:', err);
            setValueHelpDeliveries([]);
        } finally {
            setFetchingValueHelp(false);
        }
    };

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

    const handleSearch = async (e) => {
        if (e) e.preventDefault();
        setError(null);

        if (!selectedWarehouse) {
            setError('Please select a Warehouse.');
            return;
        }

        if (!searchValue.trim() && searchBy !== 'IBD') {
            setError('Please enter a search value.');
            return;
        }

        setLoading(true);

        try {
            let finalSearchValue = searchValue.trim();

            const filters = { warehouse: selectedWarehouse };
            let navigationState = { filters, searchBy, searchValue: finalSearchValue };

            if (searchBy === 'IBD') {
                if (finalSearchValue) filters.deliveryDocument = finalSearchValue;
                if (!finalSearchValue && showFilters) {
                    if (ibdSupplier.trim()) filters.supplier = ibdSupplier.trim().toUpperCase();
                    if (ibdDateFrom) filters.dateFrom = ibdDateFrom;
                    if (ibdDateTo) filters.dateTo = ibdDateTo;
                }

                const res = await api.fetchInboundDeliveriesA2X(apiConfig, filters);
                const deliveries = (res && res.value) ? res.value : [];

                if (deliveries.length === 0) {
                    setError('No Inbound Deliveries found matching your search criteria.');
                    setLoading(false);
                    return;
                }

                if (finalSearchValue && deliveries.length === 1) {
                    navigate(`/warehouse-inbound/deliveries/${deliveries[0].EWMWarehouse}/${deliveries[0].EWMInboundDelivery}`);
                    return;
                }

                navigate('/warehouse-inbound/deliveries/list', {
                    state: { ...navigationState, deliveries }
                });
                return;

            } else if (searchBy === 'HU' && finalSearchValue) {
                try {
                    const huInfo = await api.fetchHandlingUnitDetails(apiConfig, finalSearchValue);
                    if (huInfo) {
                        const ibdRef = huInfo.HandlingUnitReferenceDocument;

                        if (ibdRef && ibdRef.trim() !== '' && !/^0+$/.test(ibdRef)) {
                            try {
                                const deliveryCheck = await api.fetchInboundDeliveriesA2X(apiConfig, { warehouse: selectedWarehouse, deliveryDocument: ibdRef });
                                if (deliveryCheck && deliveryCheck.value && deliveryCheck.value.length > 0) {
                                    filters.deliveryDocument = ibdRef;
                                } else {
                                    throw new Error(`Shipping Handling Unit found (Ref: ${ibdRef}), but no matching Inbound Delivery was found in Warehouse ${selectedWarehouse}.`);
                                }
                            } catch (chkErr) {
                                throw new Error(chkErr.message || "Failed to verify Inbound Delivery existence.");
                            }
                        } else {
                            throw new Error("Handling unit found but has no valid Inbound Delivery reference attached.");
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

                const allRes = await api.fetchInboundDeliveriesA2X(apiConfig, filters);
                const allIBDs = allRes.value || [];

                if (allIBDs.length === 0) {
                    setError("No Inbound Deliveries found in this warehouse.");
                    setLoading(false);
                    return;
                }

                const productIdStripped = stripZeros(productId).toUpperCase();
                const matchingIBDs = [];
                await Promise.all(allIBDs.map(async (ibd) => {
                    try {
                        const itemsRes = await api.fetchInboundDeliveryItemsA2X(apiConfig, selectedWarehouse, ibd.EWMInboundDelivery);
                        if (itemsRes && itemsRes.value) {
                            const hasProduct = itemsRes.value.some(item => {
                                const itemProd = stripZeros(item.Product || '').toUpperCase();
                                return itemProd === productIdStripped;
                            });
                            if (hasProduct) {
                                matchingIBDs.push(ibd);
                            }
                        }
                    } catch (err) {
                        console.warn("Failed to check items for IBD:", ibd.EWMInboundDelivery, err);
                    }
                }));

                setLoading(false);
                navigationState.searchValue = productId;

                if (matchingIBDs.length === 0) {
                    setError(`No Inbound Deliveries found containing product "${productId}".`);
                    return;
                } else {
                    navigate('/warehouse-inbound/deliveries/list', {
                        state: { ...navigationState, deliveries: matchingIBDs }
                    });
                    return;
                }
            }

            navigate('/warehouse-inbound/deliveries/list', { state: navigationState });

        } catch (err) {
            setError(err.message || 'Error occurred during search.');
        } finally {
            setLoading(false);
        }
    };


    const handleScan = (code) => {
        setShowScanner(false);
        setSearchValue(code);
    };

    const handleValueHelpSelect = (ibd) => {
        setSearchValue(ibd);
        setShowValueHelp(false);
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

    return (
        <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
            <header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                <div className="flex justify-between items-center relative">
                    <button onClick={() => navigate(-1)} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" title="Back">
                        <ArrowLeft size={20} className="text-white" />
                    </button>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <h1 className="text-xl font-bold text-white tracking-wide">Inbound</h1>
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
                        <form id="inboundSearchForm" onSubmit={handleSearch} className="flex flex-col gap-4">

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

                            <div className="flex flex-col gap-4">
                                <div className="w-full">
                                    <Select
                                        label="Search By"
                                        value={searchBy}
                                        onChange={(e) => { setSearchBy(e.target.value); setSearchValue(''); setIbdSupplier(''); }}
                                        options={[
                                            { value: "IBD", label: "Inbound Delivery" },
                                            { value: "Product", label: "Product / GTIN" },
                                            { value: "HU", label: "Handling Unit" }
                                        ]}
                                    />
                                </div>

                                <div className="w-full">
                                    <Input
                                        label={<span className="md:hidden">{searchBy === 'IBD' ? 'Delivery Number' : searchBy === 'HU' ? 'HU Identifier' : 'Product ID or GTIN'}</span>}
                                        leftIcon={<Search size={18} className="text-gray-400" />}
                                        placeholder={
                                            searchBy === 'IBD' ? 'Leave empty for all open IBDs' :
                                                searchBy === 'Product' ? 'Scan GTIN or type Product ID' :
                                                    `Scan or type ${searchBy}`
                                        }
                                        value={searchValue}
                                        onChange={(e) => setSearchValue(e.target.value.toUpperCase())}
                                        className="uppercase font-mono"
                                        rightIcon={
                                            <div className="flex items-center gap-1">
                                                {searchBy === 'IBD' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => !selectedWarehouse ? setError("Please select a warehouse first.") : setShowValueHelp(true)}
                                                        className="w-9 h-9 p-0 flex items-center justify-center text-brand-blue hover:text-blue-700 hover:bg-slate-200 rounded-md transition-colors"
                                                        title="Value Help (Open IBDs)"
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
                                </div>
                            </div>

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
                <InboundDeliveryValueHelp
                    warehouse={selectedWarehouse}
                    onSelect={handleValueHelpSelect}
                    onClose={() => setShowValueHelp(false)}
                />
            )}
        </div>
    );
};

export default InboundDeliverySearch;
