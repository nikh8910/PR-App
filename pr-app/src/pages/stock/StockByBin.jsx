import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    ArrowLeft, Home, Search, Scan, AlertCircle, X, List,
    BarChart3, LayoutList, TrendingUp, Layers, Hash, Package
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import BarcodeScanner from '../../components/BarcodeScanner';
import { useSwipeBack } from '../../hooks/useSwipeBack';

import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';

// === WM Chart Colors ===
const COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6', '#f97316'];

// === WM ChartView for StockByBin ===
const WMBinChartView = ({ results, stripZeros, setViewMode }) => {
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

    // Aggregate by product
    const byProduct = useMemo(() => {
        const map = new Map();
        results.forEach(item => {
            const prod = stripZeros(item.Product) || 'Unknown';
            const qty = parseFloat(item.AvailableEWMStockQty || 0);
            const unit = item.EWMStockQuantityBaseUnit || 'EA';
            if (map.has(prod)) { map.get(prod).qty += qty; map.get(prod).count++; }
            else map.set(prod, { product: prod, qty, count: 1, unit });
        });
        return Array.from(map.values()).sort((a, b) => b.qty - a.qty);
    }, [results, stripZeros]);

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
    const defaultUnit = results[0]?.EWMStockQuantityBaseUnit || '';
    const maxProductQty = byProduct.length > 0 ? byProduct[0].qty : 1;

    const stats = [
        { label: 'Total Qty', value: totalQty.toFixed(0) + ' ' + defaultUnit, icon: TrendingUp, color: 'blue' },
        { label: 'Products', value: byProduct.length, icon: Package, color: 'violet' },
        { label: 'Stock Records', value: results.length, icon: Layers, color: 'emerald' },
        { label: 'Handling Units', value: huCount || '—', icon: Hash, color: 'amber' },
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

            {/* Bar Chart — Stock by Product */}
            <div className={`bg-white rounded-xl p-4 border border-slate-200 shadow transition-all duration-500 ${animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`} style={{ transitionDelay: '360ms' }}>
                <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                    <BarChart3 size={16} className="text-brand-blue" />
                    Stock by Product
                </h3>
                <div className="space-y-3">
                    {byProduct.slice(0, 10).map((entry, i) => {
                        const pct = maxProductQty > 0 ? (entry.qty / maxProductQty) * 100 : 0;
                        return (
                            <div key={entry.product}>
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs font-bold text-slate-700 truncate flex-1">{entry.product}</span>
                                    <span className="text-xs font-mono font-bold text-slate-800 ml-2">
                                        {entry.qty.toFixed(0)} <span className="text-slate-400 font-normal">{entry.unit}</span>
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

            {/* Product Breakdown Cards */}
            <div className={`transition-all duration-500 ${animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`} style={{ transitionDelay: '640ms' }}>
                <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2 px-1">
                    <Hash size={16} className="text-brand-blue" />
                    Product Breakdown
                </h3>
                <div className="grid grid-cols-2 gap-2">
                    {byProduct.map((entry, i) => (
                        <div key={entry.product} className="bg-white rounded-lg p-3 border border-slate-200 shadow hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-2 mb-1">
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                <span className="text-xs font-bold text-slate-800 truncate">{entry.product}</span>
                            </div>
                            <p className="text-lg font-bold text-slate-700">{entry.qty.toFixed(0)}</p>
                            <p className="text-[10px] text-slate-400">{entry.count} record{entry.count !== 1 ? 's' : ''} · {entry.unit}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const StockByBin = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { apiConfig } = useAuth();
    useSwipeBack(() => {
        if (results !== null) {
            setResults(null);
            setError(null);
        } else {
            navigate(-1);
        }
    });

    // Use location state if present to restore search
    const [warehouses, setWarehouses] = useState([]);
    const [selectedWarehouse, setSelectedWarehouse] = useState('');
    const [binValue, setBinValue] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [results, setResults] = useState(null);

    // Sync with location state for history navigation
    useEffect(() => {
        if (location.state && location.state.results) {
            setResults(location.state.results);
            if (location.state.binValue) setBinValue(location.state.binValue);
            if (location.state.selectedWarehouse) setSelectedWarehouse(location.state.selectedWarehouse);
        } else {
            setResults(null);
        }
    }, [location.state]);
    const [showScanner, setShowScanner] = useState(false);
    const [viewMode, setViewMode] = useState('list'); // 'list' | 'chart'

    // Storage Type state
    const [storageTypes, setStorageTypes] = useState([]);
    const [selectedStorageType, setSelectedStorageType] = useState('');
    const [loadingTypes, setLoadingTypes] = useState(false);

    // Bin value help modal
    const [showBinHelp, setShowBinHelp] = useState(false);
    const [bins, setBins] = useState([]);
    const [loadingBins, setLoadingBins] = useState(false);
    const [binFilter, setBinFilter] = useState('');

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

    // Fetch storage types when warehouse changes
    useEffect(() => {
        if (!selectedWarehouse) { setStorageTypes([]); setSelectedStorageType(''); return; }
        (async () => {
            setLoadingTypes(true);
            try {
                const res = await api.fetchStorageTypes(apiConfig, selectedWarehouse);
                setStorageTypes(res?.value || []);
            } catch (err) { console.error("Failed to fetch storage types:", err); setStorageTypes([]); }
            finally { setLoadingTypes(false); }
        })();
    }, [selectedWarehouse, apiConfig]);

    // Reset on warehouse change
    useEffect(() => { setSelectedStorageType(''); setBinValue(''); setResults(null); }, [selectedWarehouse]);

    const stripZeros = (str) => str ? String(str).replace(/^0+/, '') || '0' : '';

    const handleSearch = async (e) => {
        if (e) e.preventDefault();
        setError(null); setResults(null);
        if (!selectedWarehouse) { setError("Select a warehouse."); return; }
        if (!binValue.trim()) { setError("Enter a storage bin."); return; }

        setLoading(true);
        try {
            const res = await api.fetchAvailableStock(apiConfig, selectedWarehouse, { storageBin: binValue.trim() });
            const items = res.value || [];
            if (items.length === 0) setError(`No stock found in bin "${binValue.trim()}".`);

            // Push history!
            navigate('.', { state: { results: items, binValue: binValue.trim(), selectedWarehouse } });

            setViewMode('list');
        } catch (err) { setError("Search failed: " + err.message); }
        finally { setLoading(false); }
    };

    const handleOpenBinHelp = async () => {
        if (!selectedWarehouse) { setError("Please select a warehouse first."); return; }
        setShowBinHelp(true);
        setBinFilter('');
        setBins([]);
        setLoadingBins(true);
        try {
            // Fetch available stock and deduplicate by bin — only shows bins with actual stock
            const res = await api.fetchAvailableStock(apiConfig, selectedWarehouse,
                selectedStorageType ? { storageType: selectedStorageType } : {});
            const stockItems = res?.value || [];
            // Deduplicate by EWMStorageBin, aggregate qty
            const binMap = new Map();
            stockItems.forEach(item => {
                const bin = item.EWMStorageBin;
                if (!bin) return;
                const qty = parseFloat(item.AvailableEWMStockQty || 0);
                if (binMap.has(bin)) {
                    binMap.get(bin).qty += qty;
                    binMap.get(bin).count++;
                } else {
                    binMap.set(bin, { EWMStorageBin: bin, EWMStorageType: item.EWMStorageType || selectedStorageType || '', qty, count: 1 });
                }
            });
            // Sort alphabetically
            const uniqueBins = Array.from(binMap.values()).sort((a, b) => a.EWMStorageBin.localeCompare(b.EWMStorageBin));
            setBins(uniqueBins);
        } catch (err) { console.error("Failed to fetch bins:", err); setBins([]); }
        finally { setLoadingBins(false); }
    };

    const filteredBins = useMemo(() => {
        if (!binFilter) return bins;
        const upper = binFilter.toUpperCase();
        return bins.filter(b => b.EWMStorageBin && b.EWMStorageBin.toUpperCase().includes(upper));
    }, [bins, binFilter]);

    const hasResults = results && results.length > 0;

    return (
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
                            Stock by Bin
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

                                <div className="w-full relative">
                                    <Select
                                        label="Storage Type"
                                        value={selectedStorageType}
                                        onChange={e => { setSelectedStorageType(e.target.value); setBinValue(''); setResults(null); }}
                                        disabled={loadingTypes || storageTypes.length === 0}
                                        options={[
                                            { value: '', label: 'All Storage Types' },
                                            ...storageTypes.map(st => {
                                                const desc = st.EWMStorageType_Text || st.EWMStorageTypeDescription || st.EWMStorageTypeName || '';
                                                return {
                                                    value: st.EWMStorageType,
                                                    label: `${st.EWMStorageType}${desc ? ` - ${desc}` : ''}`
                                                };
                                            })
                                        ]}
                                    />
                                    {loadingTypes && (
                                        <div className="absolute right-3 top-10 pointer-events-none">
                                            <div className="w-4 h-4 border-2 border-brand-blue border-t-transparent rounded-full animate-spin" />
                                        </div>
                                    )}
                                </div>

                                <div className="w-full">
                                    <Input
                                        label="Storage Bin"
                                        placeholder="Scan or type bin"
                                        value={binValue}
                                        onChange={e => setBinValue(e.target.value.toUpperCase())}
                                        leftIcon={<Search size={18} />}
                                        rightIcon={
                                            <div className="flex items-center">
                                                {binValue && (
                                                    <button type="button" onClick={() => setBinValue('')} className="w-8 h-8 p-0 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-md">
                                                        <X size={16} />
                                                    </button>
                                                )}
                                                <button type="button" onClick={handleOpenBinHelp} className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-brand-blue hover:bg-blue-50 bg-slate-100 rounded-lg transition-colors" title="Browse Bins">
                                            <List size={20} />
                                        </button>
                                                <button type="button" onClick={() => setShowScanner(true)} className="w-9 h-9 mr-1 p-0 flex items-center justify-center text-gray-400 hover:text-brand-blue rounded-md"><Scan size={20} /></button>
                                            </div>
                                        }
                                        autoComplete="off"
                                        wrapperClassName="mb-0"
                                    />
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

                    {/* Empty results */}
                    {results && results.length === 0 && (
                        <div className="mt-4 text-center py-10 px-4 bg-white rounded-xl border border-slate-200 shadow">
                            <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-3">
                                <AlertCircle size={28} />
                            </div>
                            <p className="text-gray-700 font-bold text-base mb-1">No Stock Found</p>
                            <p className="text-xs text-gray-400 mt-1">No stock data found in bin "{binValue}" for warehouse {selectedWarehouse}.</p>
                        </div>
                    )}

                    {/* Results */}
                    {hasResults && (
                        <div className="mt-4">
                            {/* List / Chart toggle */}
                            <div className="flex items-center justify-between mb-3 px-1">
                                <p className="text-xs text-slate-500 font-medium">
                                    {results.length} item{results.length !== 1 ? 's' : ''} in {binValue}
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
                                /* ===== LIST VIEW ===== */
                                <div className="flex flex-col gap-3">
                                    {results.map((item, i) => (
                                        <div key={i} className="bg-white shadow border border-slate-200 p-4 rounded-xl">
                                            <div className="flex justify-between items-start">
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-bold text-gray-800 text-sm">{stripZeros(item.Product)}</div>
                                                    <div className="text-xs text-gray-500 mt-0.5">
                                                        {[item.Batch ? `Batch: ${item.Batch}` : '', item.HandlingUnitExternalID ? `HU: ${item.HandlingUnitExternalID}` : '', item.EWMStockType ? `Type: ${item.EWMStockType}` : ''].filter(Boolean).join(' | ') || ''}
                                                    </div>
                                                    <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                                                        <MapPin size={12} /> {item.EWMStorageBin} ({item.EWMStorageType || '-'})
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <div className="font-bold text-lg text-brand-blue">{parseFloat(item.AvailableEWMStockQty)}</div>
                                                    <div className="text-xs text-gray-400">{item.EWMStockQuantityBaseUnit}</div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                /* ===== CHART VIEW ===== */
                                <WMBinChartView results={results} stripZeros={stripZeros} setViewMode={setViewMode} />
                            )}
                        </div>
                    )}
                </div>
            </div>

            {showScanner && <BarcodeScanner onScan={(code) => { setShowScanner(false); setBinValue(code); }} onClose={() => setShowScanner(false)} />}

            {/* Bin Value Help Modal — rendered via portal to escape root overflow-hidden stacking context */}
            {showBinHelp && createPortal(
                <div
                    style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
                    onClick={e => { if (e.target === e.currentTarget) setShowBinHelp(false); }}
                >
                    <div
                        style={{ backgroundColor: '#fff', width: '100%', maxWidth: '28rem', borderTopLeftRadius: '1rem', borderTopRightRadius: '1rem', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex justify-between items-center p-4 border-b border-gray-100 shrink-0">
                            <div>
                                <h3 className="text-lg font-bold text-gray-800">Select Storage Bin</h3>
                                <p className="text-xs text-brand-blue font-medium mt-0.5 flex items-center gap-1">
                                    <MapPin size={12} />
                                    {selectedStorageType ? `Type: ${selectedStorageType}` : 'All storage types'} • {selectedWarehouse}
                                </p>
                            </div>
                            <button onClick={() => setShowBinHelp(false)} className="w-10 h-10 p-0 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Filter */}
                        <div className="px-4 pt-3 pb-2 border-b border-gray-100 shrink-0">
                            <Input
                                placeholder="Filter bins..."
                                value={binFilter}
                                onChange={(e) => setBinFilter(e.target.value)}
                                leftIcon={<Search size={16} />}
                                rightIcon={
                                    binFilter && (
                                        <button onClick={() => setBinFilter('')} className="p-1 mr-2 text-gray-400 hover:text-gray-600"><X size={14} /></button>
                                    )
                                }
                                wrapperClassName="mb-1 w-full"
                                autoComplete="off"
                                autoFocus
                            />
                            <p className="text-[11px] text-slate-400 ml-1">{filteredBins.length} of {bins.length} bins</p>
                        </div>

                        {/* Bin List */}
                        <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50">
                            {loadingBins ? (
                                <div className="flex flex-col items-center justify-center h-32 text-gray-500">
                                    <div className="w-8 h-8 border-4 border-brand-blue border-t-transparent rounded-full animate-spin mb-3" />
                                    <p className="text-sm font-medium">Fetching bins...</p>
                                </div>
                            ) : filteredBins.length === 0 ? (
                                <div className="text-center py-10 px-4">
                                    <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-3"><AlertCircle size={28} /></div>
                                    <p className="text-gray-700 font-bold text-base mb-1">No Bins Found</p>
                                    <p className="text-xs text-gray-400 mt-1">{binFilter ? 'No bins match your filter.' : 'No storage bins found for the selected type.'}</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {filteredBins.map((bin) => (
                                        <button
                                            key={bin.EWMStorageBin}
                                            type="button"
                                            onClick={() => { setBinValue(bin.EWMStorageBin); setShowBinHelp(false); setBins([]); }}
                                            className="w-full text-left bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:border-brand-blue hover:shadow-md transition-all active:scale-[0.98] group cursor-pointer block"
                                            style={{ height: 'auto', minHeight: '56px', display: 'block', padding: '1rem' }}
                                        >
                                            <div className="flex justify-between items-start">
                                                <h4 className="font-bold text-gray-800 text-base group-hover:text-brand-blue transition-colors">
                                                    {bin.EWMStorageBin}
                                                </h4>
                                                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#DBEAFE', color: '#1E40AF' }}>
                                                    Qty: {bin.qty.toFixed(0)}
                                                </span>
                                            </div>
                                            <div className="mt-1.5 space-y-0.5">
                                                <p className="text-xs text-slate-500">
                                                    <span className="font-semibold text-gray-600">Type:</span> {bin.EWMStorageType || '-'}
                                                    {bin.count > 0 && <span className="text-slate-400"> &bull; {bin.count} stock line{bin.count !== 1 ? 's' : ''}</span>}
                                                </p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 bg-white border-t border-gray-100 shrink-0 sm:rounded-b-2xl pb-safe">
                            <button onClick={() => setShowBinHelp(false)} className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
                , document.body)}
        </div>
    );
};

export default StockByBin;
