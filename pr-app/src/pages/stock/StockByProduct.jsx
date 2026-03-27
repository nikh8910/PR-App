/**
 * @file StockByProduct.jsx
 * @description Screen: Warehouse Stock by Product (EWM)
 *
 * Displays warehouse stock at the EWM level (storage bin + storage type) for
 * a selected product and warehouse. Unlike StockOverview (which shows plant-level
 * MM stock), this screen shows EWM physical stock with bin granularity.
 *
 * ## Key Features
 *  - Search by product code or HU — filters to the selected warehouse
 *  - Lists stock by storage type, bin, batch, and HU (if applicable)
 *  - Shows open Warehouse Tasks (WTs) for the product with a count badge
 *  - Tapping an open WT navigates to AdhocTaskConfirm (pre-loaded task)
 *  - Transfer Type filter excludes PICK/PUTAWAY tasks from the WT count
 *    (only shows internal tasks like S400 Transfer Posting)
 *
 * ## SAP APIs Used
 *  - api_whse_product_stck       → Available stock per bin/batch/HU
 *  - api_warehouse_order_task_2  → Open warehouse tasks for the product
 *
 * @route /warehouse-stock/by-product
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Home, Search, Scan, AlertCircle, X, MapPin, ArrowLeft,
    BarChart3, LayoutList, TrendingUp, Layers, Package, Hash, ArrowRight,
    MoveRight, PackageOpen, CheckCircle, Loader, ClipboardList, ChevronRight
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api, getHeaders } from '../../services/api';
import BarcodeScanner from '../../components/BarcodeScanner';
import { useSwipeBack } from '../../hooks/useSwipeBack';

import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { useProductDescription } from '../../hooks/useProductDescription';
import { STOCK_TYPE_LABELS } from '../../utils/wmLabels';

// === WM Chart Colors ===
const COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6', '#f97316'];

// === WM ChartView for StockByProduct ===
const WMChartView = ({ results, stripZeros, setViewMode }) => {
    const [animate, setAnimate] = useState(false);
    useEffect(() => { const t = setTimeout(() => setAnimate(true), 50); return () => clearTimeout(t); }, []);

    const getColorClasses = (color) => {
        switch (color) {
            case 'blue': return 'bg-blue-50 text-blue-500 hover:bg-blue-100';
            case 'violet': return 'bg-violet-50 text-violet-500 hover:bg-violet-100';
            case 'emerald': return 'bg-emerald-50 text-emerald-500 hover:bg-emerald-100';
            case 'amber': return 'bg-amber-50 text-amber-500 hover:bg-amber-100';
            default: return 'bg-slate-50 text-slate-500 hover:bg-slate-100';
        }
    };

    // Aggregate by bin
    const byBin = useMemo(() => {
        const map = new Map();
        results.forEach(item => {
            const bin = item.EWMStorageBin || '(No Bin)';
            const qty = parseFloat(item.AvailableEWMStockQty || 0);
            if (map.has(bin)) map.get(bin).qty += qty;
            else map.set(bin, { bin, qty, type: item.EWMStorageType || '' });
        });
        return Array.from(map.values()).sort((a, b) => b.qty - a.qty);
    }, [results]);

    // Aggregate by stock type
    const byStockType = useMemo(() => {
        const map = new Map();
        results.forEach(item => {
            const st = item.EWMStockType || 'Available';
            const qty = parseFloat(item.AvailableEWMStockQty || 0);
            if (map.has(st)) map.get(st).qty += qty;
            else map.set(st, { type: st, qty });
        });
        return Array.from(map.values()).sort((a, b) => b.qty - a.qty);
    }, [results]);

    // HU count
    const huCount = useMemo(() => {
        const hus = new Set(results.filter(i => i.HandlingUnitExternalID).map(i => i.HandlingUnitExternalID));
        return hus.size;
    }, [results]);

    const totalQty = useMemo(() => results.reduce((s, i) => s + parseFloat(i.AvailableEWMStockQty || 0), 0), [results]);
    const unit = results[0]?.EWMStockQuantityBaseUnit || '';
    const maxBinQty = byBin.length > 0 ? byBin[0].qty : 1;

    const stats = [
        { label: 'Total Qty', value: totalQty.toFixed(0) + ' ' + unit, icon: TrendingUp, color: 'blue' },
        { label: 'Bins', value: byBin.length, icon: MapPin, color: 'violet' },
        { label: 'Stock Records', value: results.length, icon: Layers, color: 'emerald' },
        { label: 'Handling Units', value: huCount || '—', icon: Package, color: 'amber' },
    ];

    return (
        <div className="flex flex-col gap-4">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 gap-3">
                {stats.map((stat, i) => (
                    <button
                        key={i}
                        type="button"
                        onClick={() => setViewMode('list')}
                        className={`bg-white rounded-xl p-4 border border-slate-200 shadow hover:shadow-md transition-all duration-500 flex flex-col items-start ${animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}
                        style={{ transitionDelay: `${i * 80}ms` }}
                    >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 transition-colors ${getColorClasses(stat.color)}`}>
                            <stat.icon size={16} />
                        </div>
                        <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mt-1">{stat.label}</p>
                    </button>
                ))}
            </div>

            {/* Bar Chart — Qty by Bin */}
            <div className={`bg-white rounded-xl p-4 border border-slate-200 shadow transition-all duration-500 ${animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`} style={{ transitionDelay: '360ms' }}>
                <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                    <BarChart3 size={16} className="text-brand-blue" />
                    Stock by Bin
                </h3>
                <div className="space-y-3">
                    {byBin.slice(0, 10).map((entry, i) => {
                        const pct = maxBinQty > 0 ? (entry.qty / maxBinQty) * 100 : 0;
                        return (
                            <div key={entry.bin}>
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs font-bold text-slate-700 truncate flex-1">{entry.bin}</span>
                                    <span className="text-xs font-mono font-bold text-slate-800 ml-2">
                                        {entry.qty.toFixed(0)} <span className="text-slate-400 font-normal">{unit}</span>
                                    </span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-5 overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-1000 ease-out flex items-center justify-end pr-2"
                                        style={{
                                            width: animate ? `${Math.max(pct, 3)}%` : '0%',
                                            backgroundColor: COLORS[i % COLORS.length],
                                            transitionDelay: `${420 + i * 80}ms`
                                        }}
                                    >
                                        {pct > 18 && <span className="text-[10px] text-white font-bold">{pct.toFixed(0)}%</span>}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Stock Type Distribution */}
            {byStockType.length > 0 && (
                <div className={`bg-white rounded-xl p-4 border border-slate-200 shadow transition-all duration-500 ${animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`} style={{ transitionDelay: '500ms' }}>
                    <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                        <Layers size={16} className="text-brand-blue" />
                        By Stock Type
                    </h3>
                    <div className="flex rounded-lg overflow-hidden h-8 mb-3">
                        {byStockType.map((entry, i) => {
                            const pct = totalQty > 0 ? (entry.qty / totalQty) * 100 : 0;
                            return (
                                <div
                                    key={entry.type}
                                    className="h-full transition-all duration-1000 ease-out flex items-center justify-center"
                                    style={{
                                        width: animate ? `${Math.max(pct, 4)}%` : '0%',
                                        backgroundColor: COLORS[i % COLORS.length],
                                        transitionDelay: `${580 + i * 60}ms`
                                    }}
                                    title={`${entry.type}: ${entry.qty.toFixed(0)} (${pct.toFixed(1)}%)`}
                                >
                                    {pct > 15 && <span className="text-[9px] text-white font-bold">{entry.type}</span>}
                                </div>
                            );
                        })}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {byStockType.map((entry, i) => (
                            <div key={entry.type} className="flex items-center gap-2 text-xs">
                                <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                <span className="font-semibold text-slate-700 truncate">{entry.type}</span>
                                <span className="text-slate-400 ml-auto shrink-0">{entry.qty.toFixed(0)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Bin Breakdown Cards */}
            <div className={`transition-all duration-500 ${animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`} style={{ transitionDelay: '640ms' }}>
                <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2 px-1">
                    <Hash size={16} className="text-brand-blue" />
                    Bin Breakdown
                </h3>
                <div className="grid grid-cols-2 gap-2">
                    {byBin.map((entry, i) => (
                        <div key={entry.bin} className="bg-white rounded-lg p-3 border border-slate-200 shadow hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-2 mb-1">
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                <span className="text-xs font-bold text-slate-800 truncate">{entry.bin}</span>
                            </div>
                            <p className="text-lg font-bold text-slate-700">{entry.qty.toFixed(0)}</p>
                            <p className="text-[10px] text-slate-400">{unit}{entry.type ? ` · ${entry.type}` : ''}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const StockByProduct = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { apiConfig } = useAuth();
    useSwipeBack(() => {
        if (results !== null) {
            // If viewing results, swipe back just clears results to show search form
            setResults(null);
            setError(null);
        } else {
            // If already on search, exit screen
            navigate(-1);
        }
    });
    const { getDescription } = useProductDescription();

    const [warehouses, setWarehouses] = useState([]);
    const [selectedWarehouse, setSelectedWarehouse] = useState('');
    const [productValue, setProductValue] = useState('');

    // Sync with location state for history navigation
    useEffect(() => {
        if (location.state && location.state.results) {
            setResults(location.state.results);
            if (location.state.productValue) setProductValue(location.state.productValue);
            if (location.state.selectedWarehouse) setSelectedWarehouse(location.state.selectedWarehouse);
        } else {
            setResults(null);
        }
    }, [location.state]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [results, setResults] = useState(null);
    const [showScanner, setShowScanner] = useState(false);
    const [viewMode, setViewMode] = useState('list'); // 'list' | 'chart'

    // Dropdown value help state
    const [dropdownOptions, setDropdownOptions] = useState([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [fetchingDropdown, setFetchingDropdown] = useState(false);

    // ───── Drag-Drop State ─────
    const draggedItem = useRef(null);
    const [dragOverTarget, setDragOverTarget] = useState(null);
    const [showDDModal, setShowDDModal] = useState(false);
    const [ddScenario, setDdScenario] = useState(null);
    const [ddQty, setDdQty] = useState('');
    const [ddLoading, setDdLoading] = useState(false);
    const [ddError, setDdError] = useState(null);
    const [ddSuccess, setDdSuccess] = useState(null);
    const [ddProcessType, setDdProcessType] = useState('S400');

    // Open Warehouse Task count badges (loaded in background after stock search)
    const [wtCountMap, setWtCountMap] = useState({}); // key: `${product}|${bin}` → number
    // WT task popup (shown when badge is clicked)
    const [wtPopup, setWtPopup] = useState(null); // { product, bin, tasks: [], loading: bool }

    // Process type options (same list as AdhocTaskCreate)
    const DD_PROCESS_TYPES = [
        { code: 'S012', text: 'Putaway (Distributive)' },
        { code: 'S110', text: 'Putaway' },
        { code: 'S201', text: 'Stock Removal for Production Supply' },
        { code: 'S210', text: 'Picking' },
        { code: 'S310', text: 'Replenishment' },
        { code: 'S340', text: 'Packing' },
        { code: 'S350', text: 'Move HU' },
        { code: 'S400', text: 'Transfer Posting' },
        { code: 'S401', text: 'Transfer Posting for Production Supply' },
        { code: 'S410', text: 'Post to Unrestricted (PC before WT)' },
        { code: 'S420', text: 'Post to Scrap (PC before WT)' },
        { code: 'S425', text: 'Scrap to Cost Center/Sample Consumption' },
        { code: 'S430', text: 'Posting Change always in Storage Bin' },
        { code: 'S996', text: 'Kanban Reversal' },
        { code: 'S997', text: 'Putaway from Clarification' },
        { code: 'S999', text: 'Warehouse Supervision' },
    ];

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

    // Fetch product/GTIN dropdown
    useEffect(() => {
        (async () => {
            setFetchingDropdown(true);
            try {
                const headers = getHeaders(apiConfig);
                const baseUrl = api.getProductSrvUrl(apiConfig);
                let url = `${baseUrl}/A_ProductUnitsOfMeasureEAN?$top=50&$format=json`;
                if (import.meta.env.DEV) {
                    if (url.includes('api.s4hana.cloud.sap')) url = url.replace(/https:\/\/my\d+-api\.s4hana\.cloud\.sap(:443)?/g, '');
                    if (url.includes('sandbox.api.sap.com')) url = url.replace('https://sandbox.api.sap.com', '/s4hanacloud');
                }
                const response = await fetch(url, { headers });
                if (response.ok) {
                    const data = await response.json();
                    const results = data.d?.results || [];
                    const seen = new Map();
                    results.forEach(r => {
                        const prod = r.Product?.trim();
                        if (prod && !seen.has(prod)) {
                            seen.set(prod, { Product: prod, ProductStandardID: r.ProductStandardID || '' });
                        }
                    });
                    setDropdownOptions(Array.from(seen.values()));
                }
            } catch (err) { console.error("Failed to fetch product dropdown:", err); }
            finally { setFetchingDropdown(false); }
        })();
    }, [apiConfig]);

    const stripZeros = (str) => str ? String(str).replace(/^0+/, '') || '0' : '';

    const extractGTIN = (scanned) => {
        const gs1Match = scanned.match(/(?:\(01\)|^01)(\d{14})/);
        if (gs1Match) return gs1Match[1];
        if (/^\d{8,14}$/.test(scanned)) return scanned;
        return null;
    };

    const filteredOptions = dropdownOptions.filter(opt => {
        if (!productValue) return true;
        const upper = productValue.toUpperCase();
        return (opt.Product && opt.Product.toUpperCase().includes(upper)) ||
            (opt.ProductStandardID && opt.ProductStandardID.includes(upper));
    });

    const handleSearch = async (e) => {
        if (e) e.preventDefault();
        setError(null); setResults(null);
        if (!selectedWarehouse) { setError("Select a warehouse."); return; }
        if (!productValue.trim()) { setError("Enter a Product ID or GTIN."); return; }

        setLoading(true);
        try {
            let productId = productValue.trim();

            // Try GTIN resolution
            const gtinCandidate = extractGTIN(productId);
            if (gtinCandidate) {
                try {
                    const eanResult = await api.fetchProductByGTIN(apiConfig, gtinCandidate);
                    if (eanResult?.Product) {
                        productId = eanResult.Product.trim();
                    } else {
                        setError(`No product found for GTIN "${gtinCandidate}".`);
                        setLoading(false); return;
                    }
                } catch (gtinErr) {
                    setError(`GTIN lookup failed: ${gtinErr.message}`);
                    setLoading(false); return;
                }
            }

            const res = await api.fetchAvailableStock(apiConfig, selectedWarehouse, { product: productId });
            const items = res.value || [];
            if (items.length === 0) {
                setError(`No stock found for product "${stripZeros(productId)}".`);
            }
            setResults(items);
            setViewMode('list');
            setWtCountMap({}); // clear old counts
            // load WT counts per individual stock line (non-blocking)
            if (items.length > 0) {
                const wh = selectedWarehouse;
                Promise.all(items.map(async (item) => {
                    const product = item.Product || '';
                    const bin = item.EWMStorageBin || '';
                    const hu = item.HandlingUnitExternalID || '';
                    // key includes HU so each row gets its own count
                    const key = `${product}|${bin}|${hu}`;
                    const count = await api.fetchWarehouseTaskCount(apiConfig, wh, product, bin, hu || undefined);
                    return { key, count };
                })).then(results => {
                    const map = {};
                    results.forEach(({ key, count }) => { map[key] = count; });
                    setWtCountMap(map);
                }).catch(() => { });
            }
        } catch (err) {
            setError("Search failed: " + err.message);
        } finally { setLoading(false); }
    };

    // Group by bin for list display
    const groupedByBin = results ? results.reduce((acc, item) => {
        const bin = item.EWMStorageBin || '(No Bin)';
        if (!acc[bin]) acc[bin] = [];
        acc[bin].push(item);
        return acc;
    }, {}) : {};

    // Load WT counts per individual stock line — runs in background after refresh
    const loadWTCounts = async (items, warehouse) => {
        if (!items || !warehouse) return;
        const newCounts = {};
        await Promise.all(items.map(async (item) => {
            const product = item.Product || '';
            const bin = item.EWMStorageBin || '';
            const hu = item.HandlingUnitExternalID || '';
            const key = `${product}|${bin}|${hu}`;
            const count = await api.fetchWarehouseTaskCount(apiConfig, warehouse, product, bin, hu || undefined);
            newCounts[key] = count;
        }));
        setWtCountMap(prev => ({ ...prev, ...newCounts }));
    };

    // Open WT popup for a stock item
    const openWTPopup = async (product, bin, hu) => {
        setWtPopup({ product, bin, hu, tasks: [], loading: true });
        try {
            const filters = { warehouse: selectedWarehouse, product, sourceBin: bin };
            if (hu) filters.sourceHU = hu;
            const res = await api.fetchWarehouseTasks(apiConfig, filters);
            const allOpen = (res?.value || []).filter(t => t.WarehouseTaskStatus !== 'C');
            // Debug: log what process types come back
            console.log('[WT popup] raw tasks:', allOpen.map(t => ({ wt: t.WarehouseTask, type: JSON.stringify(t.WarehouseProcessType) })));
            // Only show transfer tasks — exclude picking and putaway process types
            const EXCLUDE_TYPES = new Set(['S210', 'S201', 'S012', 'S110', 'S997']);
            const tasks = allOpen.filter(t => !EXCLUDE_TYPES.has((t.WarehouseProcessType || '').trim()));
            setWtPopup(prev => prev ? { ...prev, tasks, loading: false } : null);
        } catch {
            setWtPopup(prev => prev ? { ...prev, tasks: [], loading: false } : null);
        }
    };

    const hasResults = results && results.length > 0;

    // ───── Drag-Drop Handlers ─────
    const handleDragStart = (e, item, bin) => {
        draggedItem.current = { ...item, _fromBin: (bin || '').toUpperCase() };
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e, targetKey) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverTarget(targetKey);
    };

    const handleDragLeave = () => setDragOverTarget(null);

    // Drop onto a bin header → bin-to-bin
    const handleDropOnBin = (e, destBin) => {
        e.preventDefault();
        setDragOverTarget(null);
        const src = draggedItem.current;
        if (!src || src._fromBin === (destBin || '').toUpperCase()) return;
        const destBinUpper = (destBin || '').toUpperCase();
        // Look up the destination storage type from existing results
        const destBinItems = groupedByBin[destBin] || groupedByBin[destBinUpper] || [];
        const destStorageType = destBinItems[0]?.EWMStorageType || '';
        setDdScenario({ type: 'bin-to-bin', src, destBin: destBinUpper, destStorageType });
        setDdQty(parseFloat(src.AvailableEWMStockQty || 0).toString());
        setDdError(null); setDdSuccess(null);
        setShowDDModal(true);
    };

    // Drop onto a row
    const handleDropOnRow = (e, targetItem, targetBin) => {
        e.preventDefault();
        setDragOverTarget(null);
        const src = draggedItem.current;
        if (!src) return;
        if (src === targetItem) return;

        const srcHasHU = !!(src.HandlingUnitExternalID);
        const destHasHU = !!(targetItem.HandlingUnitExternalID);

        if (srcHasHU && destHasHU) {
            // HU-to-HU transfer
            setDdScenario({ type: 'hu-to-hu', src, dest: targetItem });
            setDdError(null); setDdSuccess(null);
            setShowDDModal(true);
        } else if (!srcHasHU && destHasHU && src._fromBin === targetBin) {
            // Pack product into HU (same bin)
            setDdScenario({ type: 'pack-to-hu', src, dest: targetItem });
            setDdQty(parseFloat(src.AvailableEWMStockQty || 0).toString());
            setDdError(null); setDdSuccess(null);
            setShowDDModal(true);
        } else if (src._fromBin !== (targetBin || '').toUpperCase()) {
            // Bin-to-bin (dropped on a row in different bin)
            const targetBinUpper = (targetBin || '').toUpperCase();
            const destBinItems = groupedByBin[targetBin] || groupedByBin[targetBinUpper] || [];
            const destStorageType = destBinItems[0]?.EWMStorageType || '';
            setDdScenario({ type: 'bin-to-bin', src, destBin: targetBinUpper, destStorageType });
            setDdQty(parseFloat(src.AvailableEWMStockQty || 0).toString());
            setDdError(null); setDdSuccess(null);
            setShowDDModal(true);
        }
    };

    const handleDDConfirm = async () => {
        setDdLoading(true);
        setDdError(null);
        try {
            const { type, src, dest, destBin } = ddScenario;
            console.log('[drag-drop] FULL src item:', JSON.stringify(src, null, 2));
            console.log('[drag-drop] destStorageType:', ddScenario.destStorageType, 'destBin:', destBin);

            if (type === 'bin-to-bin') {
                let payload;
                const effectiveHU = src.HandlingUnitExternalID || '';

                if (effectiveHU) {
                    // HU move — item is explicitly tagged with an HU
                    payload = {
                        EWMWarehouse: selectedWarehouse,
                        WarehouseProcessType: ddProcessType,
                        SourceHandlingUnit: effectiveHU,
                        DestinationStorageType: ddScenario.destStorageType || '',
                        DestinationStorageBin: destBin,
                    };
                } else {
                    // Pure product bin-to-bin move
                    // Step 1: try to get reference document from physical stock
                    const stockUUID = src.StockItemUUID || src.WarehouseAvailableStockUUID || null;
                    let refDocInfo = null;
                    if (stockUUID) {
                        refDocInfo = await api.fetchPhysicalStockByStockUUID(apiConfig, selectedWarehouse, stockUUID);
                        console.log('[drag-drop bin-to-bin] physicalStockRefDoc:', refDocInfo);
                    }

                    payload = {
                        EWMWarehouse: selectedWarehouse,
                        WarehouseProcessType: ddProcessType,
                        Product: src.Product || '',
                        Batch: src.Batch || '',
                        TargetQuantityInAltvUnit: parseFloat(ddQty),
                        AlternativeUnit: src.EWMStockQuantityBaseUnit || 'EA',
                        EWMStockType: src.EWMStockType || 'F',
                        EntitledToDisposeParty: src.EWMStockOwner || '',
                        EWMStockOwner: src.EWMStockOwner || '',
                        SourceStorageType: src.EWMStorageType || '',
                        SourceStorageBin: src._fromBin,
                        SourceHandlingUnit: '',
                        DestinationStorageType: ddScenario.destStorageType || '',
                        DestinationStorageBin: destBin,
                        DestinationHandlingUnit: '',
                    };
                    // Step 2: add reference doc fields if found
                    if (refDocInfo?.EWMDocumentCategory) {
                        payload.EWMDocumentCategory = refDocInfo.EWMDocumentCategory;
                    }
                    if (refDocInfo?.EWMStockReferenceDocument) {
                        payload.EWMStockReferenceDocument = refDocInfo.EWMStockReferenceDocument;
                    }
                    if (refDocInfo?.EWMStockReferenceDocumentItem) {
                        payload.EWMStockReferenceDocumentItem = refDocInfo.EWMStockReferenceDocumentItem;
                    }
                }
                console.log('[drag-drop bin-to-bin] effectiveHU:', effectiveHU || 'none', 'payload:', JSON.stringify(payload, null, 2));
                const createdTask = await api.createWarehouseTask(apiConfig, payload);

                // Step 3: auto-confirm the created task
                const taskData = createdTask?.value?.[0] || createdTask;
                if (taskData?.WarehouseTask && taskData?.WarehouseTaskItem) {
                    console.log('[drag-drop] auto-confirming task:', taskData.WarehouseTask, taskData.WarehouseTaskItem);
                    await api.confirmWarehouseTask(
                        apiConfig,
                        taskData.EWMWarehouse || selectedWarehouse,
                        taskData.WarehouseTask,
                        taskData.WarehouseTaskItem,
                        { DirectWhseTaskConfIsAllowed: true },
                        true
                    );
                    setDdSuccess('Task created and confirmed! Refreshing...');
                } else {
                    setDdSuccess('Task created (not auto-confirmed — task ID unavailable). Refreshing...');
                }

            } else if (type === 'hu-to-hu') {
                // Exact same flow as HUTransfer.jsx — fetch HU contents then repack each item
                const huDetails = await api.fetchHUDetails(apiConfig, src.HandlingUnitExternalID, selectedWarehouse);
                let items = [];
                if (huDetails?._HandlingUnitItem) items = huDetails._HandlingUnitItem;
                else if (huDetails?.value?.[0]?._HandlingUnitItem) items = huDetails.value[0]._HandlingUnitItem;

                if (items.length === 0) {
                    throw new Error('Source HU has no items to transfer.');
                }
                const errors = [];
                for (const huItem of items) {
                    if (!huItem.StockItemUUID) {
                        errors.push(`Item missing StockItemUUID — skipped.`);
                        continue;
                    }
                    const qty = parseFloat(huItem.HandlingUnitQuantity || 0);
                    await api.repackHUItem(
                        apiConfig,
                        src.HandlingUnitExternalID,
                        selectedWarehouse,
                        huItem.StockItemUUID,
                        dest.HandlingUnitExternalID,
                        qty,
                        huItem.HandlingUnitQuantityUnit || 'EA'
                    );
                }
                if (errors.length > 0) throw new Error(errors.join('\n'));

                setDdSuccess('Movement completed! Refreshing...');
            } else if (type === 'pack-to-hu') {
                // Exact same payload as PackProduct.jsx
                const items = [{
                    Material: src.Product,
                    HandlingUnitQuantity: parseFloat(ddQty),
                    HandlingUnitQuantityUnit: src.EWMStockQuantityBaseUnit || 'EA',
                }];
                if (src.Batch) items[0].Batch = src.Batch;
                await api.packProductToHU(apiConfig, dest.HandlingUnitExternalID, selectedWarehouse, items);

                setDdSuccess('Movement completed! Refreshing...');
            }

            // Refresh results after short delay
            setTimeout(async () => {
                try {
                    const res = await api.fetchAvailableStock(apiConfig, selectedWarehouse, { product: results[0]?.Product || productValue });
                    const refreshed = res.value || [];
                    setResults(refreshed);
                    loadWTCounts(refreshed, selectedWarehouse);
                    // eslint-disable-next-line no-unused-vars
                } catch (e) { /* ignore */ }
                setShowDDModal(false);
                setDdSuccess(null);
            }, 1800);

        } catch (err) {
            setDdError(err.message);
        } finally {
            setDdLoading(false);
        }
    };

    return (
        <>
            <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
                <header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                <div className="flex justify-between items-center relative">
                    <button onClick={() => {
                                                if (results !== null) {
                                                    setResults(null);
                                                    setError(null);
                                                } else {
                                                    navigate(-1);
                                                }
                                            }} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" title="Back">
                                                <ArrowLeft size={20} className="text-white" />
                                            </button>
                    
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <h1 className="text-xl font-bold text-white tracking-wide">
                            Stock by Product
                        </h1>
                                                <p className="text-blue-200 text-[10px] font-medium uppercase tracking-wider mt-0.5">
                                                    {hasResults ? `${results.length} Record${results.length !== 1 ? 's' : ''}` : 'Available Stock'}
                                                </p>
                    </div>

                    <button onClick={() => navigate('/menu', { replace: true })} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" title="Home">
                                                <Home size={20} className="text-white" />
                                            </button>
                </div>
            </header>

                {error && (
                    <div className="bg-red-50 border-b border-red-500 p-3 shadow-md flex gap-3 items-start absolute top-0 left-0 right-0 z-50">
                        <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                        <p className="text-[11px] text-red-600 mt-0.5 flex-1 whitespace-pre-wrap">{error}</p>
                        <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-md shrink-0"><X size={14} className="text-red-500" /></button>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto p-4 content-area pb-8" style={{ zIndex: 10, position: 'relative' }}>
                    <div className="max-w-md mx-auto">
                        {/* Search Form */}
                        {results === null && (
                            <div className="bg-white shadow border border-slate-200 w-full p-4 md:rounded-xl mt-6">
                                <form onSubmit={handleSearch} className="flex flex-col gap-4">
                                    <div className="w-full">
                                        <Select
                                            label={<>Warehouse <span className="text-red-500">*</span></>}
                                            value={selectedWarehouse}
                                            onChange={e => setSelectedWarehouse(e.target.value)}
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

                                    <div className="w-full">
                                        <Input
                                            label="Product ID or GTIN"
                                            placeholder="Scan GTIN or type Product ID"
                                            value={productValue}
                                            onChange={e => setProductValue(e.target.value.toUpperCase())}
                                            onFocus={() => setIsDropdownOpen(true)}
                                            onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
                                            leftIcon={<Search size={18} />}
                                            rightIcon={<button type="button" onClick={() => setShowScanner(true)} className="w-9 h-9 mr-2 p-0 flex items-center justify-center text-gray-400 hover:text-brand-blue rounded-md"><Scan size={20} /></button>}
                                            autoComplete="off"
                                            wrapperClassName="mb-1"
                                        />
                                        <div className="relative">
                                            {isDropdownOpen && (
                                                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto top-full left-0">
                                                    {fetchingDropdown ? (
                                                        <div className="p-4 text-sm text-gray-500 text-center flex items-center justify-center gap-2">
                                                            <div className="w-5 h-5 border-2 border-brand-blue border-t-transparent rounded-full animate-spin" /> Loading...
                                                        </div>
                                                    ) : filteredOptions.length === 0 ? (
                                                        <div className="p-4 text-sm text-gray-500 text-center">No products found. You can still type a Product ID or GTIN.</div>
                                                    ) : (
                                                        <div className="py-1">
                                                            {filteredOptions.map((opt, i) => (
                                                                <div key={opt.Product + '-' + i}
                                                                    className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b last:border-0 border-gray-100 text-left transition-colors"
                                                                    onMouseDown={(e) => { e.preventDefault(); setProductValue(opt.Product); setIsDropdownOpen(false); }}>
                                                                    <div className="font-semibold text-gray-800 text-sm">{opt.Product}</div>
                                                                    {opt.ProductStandardID && <div className="text-[11px] text-gray-500 mt-0.5">GTIN: {opt.ProductStandardID}</div>}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            <p className="text-[11px] text-gray-400 mt-1.5 px-1">Enter a Product ID (e.g. TG30) or scan a GTIN barcode.</p>
                                        </div>
                                    </div>

                                    <div className="w-full mt-2">
                                        <Button
                                            type="submit"
                                            disabled={loading}
                                            className="w-full py-3.5"
                                        >
                                            {loading ? (
                                                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Searching...</>
                                            ) : (
                                                <><Search size={16} /> Search Stock</>
                                            )}
                                        </Button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {/* Results */}
                        {results !== null && (
                            <div className="mt-4">
                                {/* List / Chart toggle */}
                                <div className="flex items-center justify-between mb-3 px-1">
                                    <p className="text-xs text-slate-500 font-medium">
                                        {results.length} record{results.length !== 1 ? 's' : ''} across {Object.keys(groupedByBin).length} bin{Object.keys(groupedByBin).length !== 1 ? 's' : ''}
                                    </p>
                                    <div className="flex bg-slate-200/70 p-1 rounded-xl shrink-0">
                                        <button
                                            onClick={() => setViewMode('list')}
                                            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'list' ? 'bg-white text-brand-blue shadow-md' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                                        >
                                            <LayoutList size={14} /> List
                                        </button>
                                        <button
                                            onClick={() => setViewMode('chart')}
                                            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'chart' ? 'bg-white text-brand-blue shadow-md' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                                        >
                                            <BarChart3 size={14} /> Chart
                                        </button>
                                    </div>
                                </div>

                                {viewMode === 'list' ? (
                                    /* ===== LIST VIEW — grouped by bin with drag-drop ===== */
                                    <div>
                                        <p className="text-[10px] text-slate-400 text-center mb-3 italic">💡 Drag rows between bins to move stock, or drop onto an HU to pack</p>
                                        {Object.entries(groupedByBin).map(([bin, items]) => (
                                            <div key={bin} className="mb-4">
                                                {/* Bin header — drop target for bin-to-bin */}
                                                <div
                                                    className={`flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg transition-all ${dragOverTarget === `bin-${bin}` ? 'bg-blue-100 border-2 border-dashed border-blue-400 scale-[1.01]' : 'border-2 border-transparent'}`}
                                                    onDragOver={(e) => handleDragOver(e, `bin-${bin}`)}
                                                    onDragLeave={handleDragLeave}
                                                    onDrop={(e) => handleDropOnBin(e, bin)}
                                                >
                                                    <MapPin size={14} className={`${dragOverTarget === `bin-${bin}` ? 'text-blue-600' : 'text-brand-blue'}`} />
                                                    <span className="text-sm font-bold text-gray-700">{bin}</span>
                                                    <span className="text-[10px] text-gray-400 font-medium">{items[0]?.EWMStorageType || ''}</span>
                                                    {dragOverTarget === `bin-${bin}` && (
                                                        <span className="ml-auto text-[10px] font-bold text-blue-600 animate-pulse">Drop to move here →</span>
                                                    )}
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    {items.map((item, i) => {
                                                        const product = item.Product ? stripZeros(item.Product) : '';
                                                        const prodDesc = getDescription(product);
                                                        const batch = item.Batch || '';
                                                        const hu = item.HandlingUnitExternalID || '';
                                                        const stockType = item.EWMStockType || '';
                                                        const stockTypeDesc = STOCK_TYPE_LABELS[stockType] ? `${stockType} - ${STOCK_TYPE_LABELS[stockType]}` : stockType;
                                                        const owner = item.EWMStockOwner ? stripZeros(item.EWMStockOwner) : '';
                                                        const rowKey = `row-${bin}-${i}`;

                                                        const isDragOver = dragOverTarget === rowKey;
                                                        return (
                                                            <div
                                                                key={i}
                                                                draggable
                                                                onDragStart={(e) => handleDragStart(e, item, bin)}
                                                                onDragOver={(e) => handleDragOver(e, rowKey)}
                                                                onDragLeave={handleDragLeave}
                                                                onDrop={(e) => handleDropOnRow(e, item, bin)}
                                                                className={`bg-white shadow border p-4 sm:p-5 rounded-2xl ml-2 sm:ml-5 cursor-grab active:cursor-grabbing transition-all select-none
                                                                ${isDragOver ? 'border-blue-400 bg-blue-50 scale-[1.01] shadow-md' : 'border-slate-200'}
                                                                ${hu ? 'border-l-[5px] border-l-violet-400' : ''}`}
                                                                title={hu ? `HU: ${hu} — drag onto another HU to transfer` : 'Drag to move stock'}
                                                            >
                                                                <div className="flex justify-between items-center gap-3">
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="text-sm font-bold text-slate-800 truncate">
                                                                            {product} {prodDesc && <span className="font-normal text-slate-500 ml-1">— {prodDesc}</span>}
                                                                        </div>
                                                                        <div className="text-xs sm:text-sm text-slate-500 mt-1.5 truncate">
                                                                            {[
                                                                                stockType && `Type: ${stockTypeDesc}`,
                                                                                hu && `HU: ${hu}`,
                                                                                batch && `Batch: ${batch}`,
                                                                                owner && `Owner: ${owner}`
                                                                            ].filter(Boolean).join('  •  ')}
                                                                        </div>
                                                                        {isDragOver && (
                                                                            <div className="text-xs sm:text-sm text-blue-600 font-bold mt-1.5 animate-pulse">Drop to pack/transfer here</div>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex items-center gap-3 shrink-0">
                                                                        {hu && (
                                                                            <span className="text-[10px] sm:text-xs bg-violet-100 text-violet-700 font-bold px-2 py-1 rounded-full uppercase">HU</span>
                                                                        )}
                                                                        <div className="text-right">
                                                                            <span className="text-base sm:text-lg font-bold text-brand-blue">{parseFloat(item.AvailableEWMStockQty)}</span>
                                                                            <span className="text-xs sm:text-sm text-gray-400 ml-1">{item.EWMStockQuantityBaseUnit}</span>
                                                                        </div>
                                                                        {/* WT Count Badge */}
                                                                        {(() => {
                                                                            // Per-item key includes HU for accurate individual count
                                                                            const key = `${item.Product}|${bin}|${hu}`;
                                                                            const cnt = wtCountMap[key];
                                                                            if (cnt === undefined) return null;
                                                                            return (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={(e) => { e.stopPropagation(); openWTPopup(item.Product, bin, hu || undefined); }}
                                                                                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold transition-colors ${cnt > 0 ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-slate-100 text-slate-400'}`}
                                                                                    title={cnt > 0 ? `${cnt} open warehouse task(s)` : 'No open tasks'}
                                                                                >
                                                                                    <ClipboardList size={12} />
                                                                                    {cnt}
                                                                                </button>
                                                                            );
                                                                        })()}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    /* ===== CHART VIEW ===== */
                                    <WMChartView results={results} stripZeros={stripZeros} />
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {showScanner && <BarcodeScanner onScan={(code) => { setShowScanner(false); setProductValue(code); }} onClose={() => setShowScanner(false)} />}

            </div>

            {/* WT Task Popup — rendered OUTSIDE overflow-hidden parent to avoid clipping */}
            {wtPopup && (
                <div
                    style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', fontFamily: 'inherit' }}
                    onClick={(e) => { if (e.target === e.currentTarget) setWtPopup(null); }}
                >
                    <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '75vh', display: 'flex', flexDirection: 'column', boxShadow: '0 -8px 40px rgba(0,0,0,0.2)' }}>
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 20px 12px', borderBottom: '1px solid #f1f5f9' }}>
                            <div>
                                <p style={{ fontWeight: 700, fontSize: '15px', color: '#1e293b', margin: 0 }}>Open Warehouse Tasks</p>
                                <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                                    Product: <strong style={{ color: '#475569' }}>{stripZeros(wtPopup.product)}</strong>
                                    {' · '}Bin: <strong style={{ color: '#475569' }}>{wtPopup.bin}</strong>
                                </p>
                            </div>
                            <button onClick={() => setWtPopup(null)}
                                style={{ width: '32px', height: '32px', borderRadius: '50%', border: 'none', background: '#f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                                <X size={18} />
                            </button>
                        </div>
                        {/* Body */}
                        <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px 32px' }}>
                            {wtPopup.loading ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: '12px', color: '#94a3b8' }}>
                                    <Loader size={22} className="animate-spin" />
                                    <span style={{ fontSize: '14px' }}>Loading tasks...</span>
                                </div>
                            ) : wtPopup.tasks.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                                    <ClipboardList size={28} style={{ margin: '0 auto 12px', opacity: 0.4, display: 'block' }} />
                                    <p style={{ fontSize: '14px' }}>No open tasks found.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {wtPopup.tasks.map((task, idx) => (
                                        <button
                                            key={(task.WarehouseTask || '') + idx}
                                            onClick={() => { setWtPopup(null); navigate('/warehouse-internal/confirm-task', { state: { task, returnPath: '/warehouse-stock/by-product' } }); }}
                                            style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left', cursor: 'pointer', width: '100%', transition: 'box-shadow 0.15s, border-color 0.15s' }}
                                        >
                                            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                <ClipboardList size={16} style={{ color: '#d97706' }} />
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <p style={{ fontWeight: 700, fontSize: '13px', color: '#1e293b', margin: '0 0 2px' }}>WT: {task.WarehouseTask}</p>
                                                <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 1px' }}>
                                                    {task.SourceStorageBin || '?'} → {task.DestinationStorageBin || '?'}
                                                </p>
                                                <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>
                                                    {parseFloat(task.TargetQuantityInBaseUnit || 0).toFixed(2)} {task.BaseUnit || ''}
                                                    {task.WarehouseProcessType && <span style={{ marginLeft: '8px', color: '#3b82f6', fontWeight: 600 }}>{task.WarehouseProcessType}</span>}
                                                </p>
                                            </div>
                                            <ChevronRight size={18} style={{ color: '#cbd5e1', flexShrink: 0 }} />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Drag-Drop Confirmation Modal */}
            {showDDModal && ddScenario && (() => {
                const srcHasHU = !!(ddScenario.src.HandlingUnitExternalID);
                // For bin-to-bin: if src has HU it's an HU Move, otherwise product move
                const isHUMove = ddScenario.type === 'bin-to-bin' && srcHasHU;
                const accentColor = isHUMove ? '#7c3aed'
                    : ddScenario.type === 'bin-to-bin' ? '#2563eb'
                        : ddScenario.type === 'hu-to-hu' ? '#7c3aed' : '#0d9488';
                const typeLabel = isHUMove ? 'HU Move'
                    : ddScenario.type === 'bin-to-bin' ? 'Bin-to-Bin Transfer'
                        : ddScenario.type === 'hu-to-hu' ? 'HU-to-HU Transfer' : 'Pack Product into HU';

                // FROM labels
                const fromLabel = ddScenario.type === 'bin-to-bin'
                    ? (srcHasHU ? ddScenario.src.HandlingUnitExternalID : ddScenario.src._fromBin)
                    : ddScenario.type === 'hu-to-hu' ? ddScenario.src.HandlingUnitExternalID
                        : stripZeros(ddScenario.src.Product);
                const fromSub = ddScenario.type === 'bin-to-bin'
                    ? (srcHasHU ? `Bin: ${ddScenario.src._fromBin}` : `Product: ${stripZeros(ddScenario.src.Product)}`)
                    : ddScenario.type === 'hu-to-hu' ? `Bin: ${ddScenario.src._fromBin}`
                        : `Bin: ${ddScenario.src._fromBin}`;

                // TO labels
                const toLabel = ddScenario.type === 'bin-to-bin' ? ddScenario.destBin
                    : ddScenario.type === 'hu-to-hu' ? ddScenario.dest.HandlingUnitExternalID
                        : ddScenario.dest.HandlingUnitExternalID;
                const toSub = ddScenario.type === 'bin-to-bin'
                    ? (srcHasHU ? ddScenario.src.HandlingUnitExternalID : 'Destination Bin')
                    : ddScenario.type === 'hu-to-hu' ? (ddScenario.dest._fromBin || 'Target HU')
                        : 'Target HU';

                return (
                    <div
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: 'inherit' }}
                        onClick={(e) => { if (e.target === e.currentTarget && !ddLoading) setShowDDModal(false); }}
                    >
                        <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '340px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

                            {/* Coloured header */}
                            <div style={{ background: accentColor, padding: '20px 20px 16px' }}>
                                <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>{typeLabel}</p>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    {/* FROM box */}
                                    <div style={{ flex: 1, background: 'rgba(255,255,255,0.18)', borderRadius: '10px', padding: '10px 12px' }}>
                                        <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>FROM</p>
                                        <p style={{ color: '#fff', fontWeight: 700, fontSize: '15px', lineHeight: 1.2 }}>{fromLabel}</p>
                                        <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '11px', marginTop: '2px' }}>{fromSub}</p>
                                    </div>
                                    {/* Arrow */}
                                    <ArrowRight size={22} style={{ color: '#fff', flexShrink: 0 }} />
                                    {/* TO box */}
                                    <div style={{ flex: 1, background: 'rgba(255,255,255,0.18)', borderRadius: '10px', padding: '10px 12px' }}>
                                        <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>TO</p>
                                        <p style={{ color: '#fff', fontWeight: 700, fontSize: '15px', lineHeight: 1.2 }}>{toLabel}</p>
                                        <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '11px', marginTop: '2px' }}>{toSub}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Body */}
                            <div style={{ padding: '16px 20px 20px' }}>
                                {/* Process Type dropdown — shown for bin-to-bin transfers */}
                                {(ddScenario.type === 'bin-to-bin') && (
                                    <div style={{ marginBottom: '14px' }}>
                                        <p style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Process Type</p>
                                        <div style={{ position: 'relative' }}>
                                            <select
                                                value={ddProcessType}
                                                onChange={e => setDdProcessType(e.target.value)}
                                                style={{ width: '100%', height: '42px', border: '1.5px solid #cbd5e1', borderRadius: '10px', padding: '0 32px 0 12px', fontSize: '13px', fontWeight: 600, color: '#1e293b', background: '#fff', appearance: 'none', cursor: 'pointer', outline: 'none' }}
                                            >
                                                {DD_PROCESS_TYPES.map(pt => (
                                                    <option key={pt.code} value={pt.code}>{pt.code} - {pt.text}</option>
                                                ))}
                                            </select>
                                            <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#64748b' }}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 9l-7 7-7-7" /></svg>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Quantity stepper — only for non-HU bin-to-bin and pack-to-hu */}
                                {((ddScenario.type === 'bin-to-bin' && !ddScenario.src.HandlingUnitExternalID) || ddScenario.type === 'pack-to-hu') && (
                                    <div style={{ marginBottom: '14px' }}>
                                        <p style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Quantity</p>
                                        <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid #cbd5e1', borderRadius: '10px', overflow: 'hidden' }}>
                                            <button
                                                style={{ width: '44px', height: '44px', background: '#f1f5f9', border: 'none', fontSize: '20px', fontWeight: 700, color: '#475569', cursor: 'pointer', flexShrink: 0 }}
                                                onClick={() => setDdQty(q => Math.max(0, parseFloat(q || 0) - 1).toString())}
                                            >−</button>
                                            <input
                                                type="number" step="any"
                                                style={{ flex: 1, height: '44px', textAlign: 'center', fontWeight: 700, fontSize: '18px', color: '#1e293b', border: 'none', outline: 'none', background: '#fff' }}
                                                value={ddQty}
                                                onChange={e => setDdQty(e.target.value)}
                                            />
                                            <button
                                                style={{ width: '44px', height: '44px', background: '#f1f5f9', border: 'none', fontSize: '20px', fontWeight: 700, color: '#475569', cursor: 'pointer', flexShrink: 0 }}
                                                onClick={() => setDdQty(q => (parseFloat(q || 0) + 1).toString())}
                                            >+</button>
                                        </div>
                                        <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                                            Available: {parseFloat(ddScenario.src.AvailableEWMStockQty || 0)} {ddScenario.src.EWMStockQuantityBaseUnit}
                                        </p>
                                    </div>
                                )}

                                {/* Error */}
                                {ddError && (
                                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                        <AlertCircle size={15} style={{ color: '#ef4444', flexShrink: 0, marginTop: '1px' }} />
                                        <p style={{ fontSize: '12px', color: '#dc2626', margin: 0 }}>{ddError}</p>
                                    </div>
                                )}

                                {/* Success */}
                                {ddSuccess && (
                                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                        <CheckCircle size={15} style={{ color: '#22c55e', flexShrink: 0, marginTop: '1px' }} />
                                        <p style={{ fontSize: '12px', color: '#16a34a', margin: 0 }}>{ddSuccess}</p>
                                    </div>
                                )}

                                {/* Action buttons */}
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button
                                        onClick={() => { if (!ddLoading) setShowDDModal(false); }}
                                        disabled={ddLoading}
                                        style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 700, fontSize: '14px', cursor: ddLoading ? 'not-allowed' : 'pointer', opacity: ddLoading ? 0.5 : 1 }}
                                    >Cancel</button>
                                    <button
                                        onClick={handleDDConfirm}
                                        disabled={ddLoading || !!ddSuccess}
                                        style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: (ddLoading || ddSuccess) ? '#94a3b8' : accentColor, color: '#fff', fontWeight: 700, fontSize: '14px', cursor: (ddLoading || ddSuccess) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', transition: 'background 0.15s' }}
                                    >
                                        {ddLoading ? <><Loader size={15} className="animate-spin" /> Processing...</> : 'Confirm'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </>
    );
};

export default StockByProduct;
