/**
 * @file StockOverview.jsx
 * @description Screen: Stock Overview (Inventory Cockpit)
 *
 * Allows users to search available material stock filtered by Plant, Storage
 * Location, and Material number. Results can be viewed as a list or a bar chart.
 *
 * ## Drag-and-Drop Stock Transfer
 * Stock items can be dragged onto each other to initiate a quick stock transfer
 * (goods movement). The dragged + dropped items must be the same material.
 * SAP movement type is automatically selected:
 *  - Same plant, different SLoc → type 311 (SLoc-to-SLoc transfer)
 *  - Different plant             → type 301 (Plant-to-Plant transfer)
 *
 * A transfer confirmation modal collects the quantity before POSTing to SAP.
 * Touch drag is also supported for mobile/Android devices (ghost element).
 *
 * @route /stock
 */
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { useSwipeBack } from '../hooks/useSwipeBack';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import {
    Warehouse, Search, Home, ArrowLeft, Package, AlertCircle, Loader, MapPin, Factory,
    ChevronDown, List, X, ChevronRight, BarChart3, LayoutList, TrendingUp, Layers, Hash,
    ArrowRight, CheckCircle, MoveRight, RefreshCw
} from 'lucide-react';

// === Chart View Component ===
const COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6', '#f97316'];

const ChartView = ({ stockData, stripLeadingZeros }) => {
    // Aggregate by material
    const byMaterial = useMemo(() => {
        const map = new Map();
        stockData.forEach(item => {
            const mat = stripLeadingZeros(item.Material) || 'Unknown';
            const qty = parseFloat(item.MatlWrhsStkQtyInMatlBaseUnit || 0);
            if (map.has(mat)) {
                map.get(mat).qty += qty;
                map.get(mat).count++;
            } else {
                map.set(mat, { material: mat, qty, count: 1, unit: item.MaterialBaseUnit || 'EA' });
            }
        });
        return Array.from(map.values()).sort((a, b) => b.qty - a.qty);
    }, [stockData, stripLeadingZeros]);

    // Aggregate by storage location
    const byLocation = useMemo(() => {
        const map = new Map();
        stockData.forEach(item => {
            const loc = item.StorageLocation || 'N/A';
            const qty = parseFloat(item.MatlWrhsStkQtyInMatlBaseUnit || 0);
            if (map.has(loc)) {
                map.get(loc).qty += qty;
                map.get(loc).count++;
            } else {
                map.set(loc, { location: loc, qty, count: 1, plant: item.Plant || '' });
            }
        });
        return Array.from(map.values()).sort((a, b) => b.qty - a.qty);
    }, [stockData]);

    const totalQty = useMemo(() => stockData.reduce((s, i) => s + parseFloat(i.MatlWrhsStkQtyInMatlBaseUnit || 0), 0), [stockData]);
    const maxQty = byMaterial.length > 0 ? byMaterial[0].qty : 1;

    const [animate, setAnimate] = useState(false);
    useEffect(() => { const t = setTimeout(() => setAnimate(true), 50); return () => clearTimeout(t); }, []);

    return (
        <div className="flex flex-col gap-4">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 gap-3">
                {[
                    { label: 'Stock Items', value: stockData.length, icon: Package, color: 'blue' },
                    { label: 'Total Quantity', value: totalQty.toFixed(0), icon: TrendingUp, color: 'emerald' },
                    { label: 'Materials', value: byMaterial.length, icon: Layers, color: 'violet' },
                    { label: 'Locations', value: byLocation.length, icon: MapPin, color: 'amber' },
                ].map((stat, i) => (
                    <div key={i} className={`bg-white rounded-xl p-4 border border-slate-200 shadow-sm transition-all duration-500 ${animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`} style={{ transitionDelay: `${i * 80}ms` }}>
                        <div className="flex items-center gap-2 mb-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-${stat.color}-50 text-${stat.color}-500`}>
                                <stat.icon size={16} />
                            </div>
                        </div>
                        <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{stat.label}</p>
                    </div>
                ))}
            </div>

            {/* Bar Chart — Top Materials */}
            <div className={`bg-white rounded-xl p-4 border border-slate-200 shadow-sm transition-all duration-500 ${animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`} style={{ transitionDelay: '350ms' }}>
                <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                    <BarChart3 size={16} className="text-brand-blue" />
                    Stock by Material
                </h3>
                <div className="space-y-3">
                    {byMaterial.slice(0, 10).map((entry, i) => {
                        const pct = maxQty > 0 ? (entry.qty / maxQty) * 100 : 0;
                        return (
                            <div key={entry.material} className="group">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs font-bold text-slate-700 truncate flex-1">{entry.material}</span>
                                    <span className="text-xs font-mono font-bold text-slate-800 ml-2">{entry.qty.toFixed(0)} <span className="text-slate-400 font-normal">{entry.unit}</span></span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-5 overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-1000 ease-out flex items-center justify-end pr-2"
                                        style={{
                                            width: animate ? `${Math.max(pct, 3)}%` : '0%',
                                            backgroundColor: COLORS[i % COLORS.length],
                                            transitionDelay: `${400 + i * 100}ms`
                                        }}
                                    >
                                        {pct > 20 && <span className="text-[10px] text-white font-bold">{pct.toFixed(0)}%</span>}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Location Distribution */}
            {byLocation.length > 1 && (
                <div className={`bg-white rounded-xl p-4 border border-slate-200 shadow-sm transition-all duration-500 ${animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`} style={{ transitionDelay: '500ms' }}>
                    <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                        <MapPin size={16} className="text-brand-blue" />
                        Distribution by Location
                    </h3>
                    {/* Proportional blocks */}
                    <div className="flex rounded-lg overflow-hidden h-8 mb-3">
                        {byLocation.map((loc, i) => {
                            const pct = totalQty > 0 ? (loc.qty / totalQty) * 100 : 0;
                            return (
                                <div
                                    key={loc.location}
                                    className="h-full transition-all duration-1000 ease-out flex items-center justify-center relative group cursor-pointer"
                                    style={{
                                        width: animate ? `${Math.max(pct, 3)}%` : '0%',
                                        backgroundColor: COLORS[i % COLORS.length],
                                        transitionDelay: `${600 + i * 80}ms`
                                    }}
                                    title={`${loc.location}: ${loc.qty.toFixed(0)} (${pct.toFixed(1)}%)`}
                                >
                                    {pct > 12 && <span className="text-[9px] text-white font-bold">{loc.location}</span>}
                                </div>
                            );
                        })}
                    </div>
                    {/* Legend */}
                    <div className="grid grid-cols-2 gap-2">
                        {byLocation.map((loc, i) => (
                            <div key={loc.location} className="flex items-center gap-2 text-xs">
                                <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                                <span className="font-semibold text-slate-700 truncate">{loc.location}</span>
                                <span className="text-slate-400 ml-auto shrink-0">{loc.qty.toFixed(0)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Material Breakdown Cards */}
            <div className={`transition-all duration-500 ${animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`} style={{ transitionDelay: '650ms' }}>
                <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2 px-1">
                    <Hash size={16} className="text-brand-blue" />
                    Material Breakdown
                </h3>
                <div className="grid grid-cols-2 gap-2">
                    {byMaterial.map((entry, i) => (
                        <div key={entry.material} className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-2 mb-1">
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                                <span className="text-xs font-bold text-slate-800 truncate">{entry.material}</span>
                            </div>
                            <p className="text-lg font-bold text-slate-700">{entry.qty.toFixed(0)}</p>
                            <p className="text-[10px] text-slate-400">{entry.count} item{entry.count !== 1 ? 's' : ''} · {entry.unit}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const StockOverview = () => {
    const navigate = useNavigate();
    const { apiConfig } = useAuth();
    useSwipeBack(() => navigate(-1));

    // Search Filters
    const [material, setMaterial] = useState('');
    const [plant, setPlant] = useState('');
    const [storageLoc, setStorageLoc] = useState('');

    // Value Help States
    const [availablePlants, setAvailablePlants] = useState([]);
    const [availableSLocs, setAvailableSLocs] = useState([]);
    const [plantLoading, setPlantLoading] = useState(false);
    const [slocLoading, setSlocLoading] = useState(false);

    // Material Value Help Modal
    const [showMaterialHelp, setShowMaterialHelp] = useState(false);
    const [materialOptions, setMaterialOptions] = useState([]);
    const [materialHelpLoading, setMaterialHelpLoading] = useState(false);
    const [materialFilter, setMaterialFilter] = useState('');

    const [stockData, setStockData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [hasSearched, setHasSearched] = useState(false);
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'chart'

    // ─── Drag-and-Drop state ───
    const draggedItem = useRef(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);
    const touchCloneRef = useRef(null); // floating ghost element for touch drag
    const [ddModal, setDdModal] = useState(null); // { src, dst, type, qty, unit }
    const [ddQty, setDdQty] = useState('');
    const [ddLoading, setDdLoading] = useState(false);
    const [ddSuccess, setDdSuccess] = useState('');
    const [ddError, setDdError] = useState('');

    // Load Plants on mount
    useEffect(() => {
        loadPlants();
    }, []);

    // Load Storage Locations when Plant changes
    useEffect(() => {
        if (plant) {
            loadStorageLocations(plant);
        } else {
            setAvailableSLocs([]);
            setStorageLoc('');
        }
    }, [plant]);

    const loadPlants = async () => {
        setPlantLoading(true);
        try {
            const config = apiConfig || JSON.parse(localStorage.getItem('sapConfig') || '{}');
            const data = await api.fetchPlantList(config);
            const results = data.d ? data.d.results : (data.value || []);
            setAvailablePlants(results);
        } catch (err) {
            console.warn("Failed to load plants:", err);
        } finally {
            setPlantLoading(false);
        }
    };

    const loadStorageLocations = async (selectedPlant) => {
        setSlocLoading(true);
        try {
            const config = apiConfig || JSON.parse(localStorage.getItem('sapConfig') || '{}');
            const data = await api.fetchStorageLocationsByPlant(config, selectedPlant);
            const results = data.d ? data.d.results : (data.value || []);
            setAvailableSLocs(results);
        } catch (err) {
            console.warn("Failed to load storage locations:", err);
            setAvailableSLocs([]);
        } finally {
            setSlocLoading(false);
        }
    };

    // Load material suggestions based on plant/sloc — uses stock data to find materials
    const loadMaterialOptions = async (searchTerm = '') => {
        setMaterialHelpLoading(true);
        try {
            const config = apiConfig || JSON.parse(localStorage.getItem('sapConfig') || '{}');
            const data = await api.fetchMaterialStock(config, {
                material: searchTerm.trim(),
                plant: plant.trim(),
                storageLocation: storageLoc.trim()
            });
            const results = data.d ? data.d.results : (data.value || []);
            // Deduplicate by material
            const seen = new Map();
            results.forEach(item => {
                const mat = (item.Material || '').trim();
                if (mat && !seen.has(mat)) {
                    seen.set(mat, {
                        Material: mat,
                        MaterialDescription: item.MaterialDescription || item.MaterialName || item.ProductName || '',
                        Plant: item.Plant || '',
                        StorageLocation: item.StorageLocation || '',
                        MaterialBaseUnit: item.MaterialBaseUnit || 'EA',
                        Qty: parseFloat(item.MatlWrhsStkQtyInMatlBaseUnit || 0)
                    });
                } else if (mat && seen.has(mat)) {
                    const existing = seen.get(mat);
                    existing.Qty += parseFloat(item.MatlWrhsStkQtyInMatlBaseUnit || 0);
                }
            });
            setMaterialOptions(Array.from(seen.values()));
        } catch (err) {
            console.error("Failed to load material options:", err);
            setMaterialOptions([]);
        } finally {
            setMaterialHelpLoading(false);
        }
    };

    const handleOpenMaterialHelp = () => {
        setShowMaterialHelp(true);
        setMaterialFilter('');
        setMaterialOptions([]);
        // Auto-search on open if plant is set
        if (plant) {
            loadMaterialOptions('');
        }
    };

    const filteredMaterials = useMemo(() => {
        if (!materialFilter) return materialOptions;
        const upper = materialFilter.toUpperCase();
        return materialOptions.filter(m => m.Material.toUpperCase().includes(upper));
    }, [materialOptions, materialFilter]);

    const handleSearch = async (e) => {
        e?.preventDefault();

        // Need at least one filter
        if (!material.trim() && !plant.trim() && !storageLoc.trim()) {
            setError("Please enter at least one search criteria (Material, Plant, or Storage Location).");
            return;
        }

        setLoading(true);
        setError(null);
        setStockData([]);
        setHasSearched(true);

        try {
            const config = apiConfig || JSON.parse(localStorage.getItem('sapConfig') || '{}');
            if (!config.baseUrl) throw new Error("SAP Configuration not found. Please login again.");

            const data = await api.fetchMaterialStock(config, {
                material: material.trim(),
                plant: plant.trim(),
                storageLocation: storageLoc.trim()
            });
            const results = data.d ? data.d.results : (data.value || []);
            setStockData(results);

        } catch (err) {
            console.error(err);
            setError(err.message || "Failed to fetch stock data");
        } finally {
            setLoading(false);
        }
    };

    const getSearchDescription = () => {
        const parts = [];
        if (material) parts.push(`Material: ${material}`);
        if (plant) parts.push(`Plant: ${plant}`);
        if (storageLoc) parts.push(`SLoc: ${storageLoc}`);
        return parts.length > 0 ? parts.join(' | ') : 'Enter search criteria';
    };

    const stripLeadingZeros = (str) => str ? str.replace(/^0+/, '') || '0' : '';

    // ─── Drag/Drop helpers (shared between mouse and touch) ───
    const openTransferModal = useCallback((src, destItem) => {
        if (!src || !destItem) return;

        const srcMat = src.Material;
        const dstMat = destItem.Material;
        if (srcMat !== dstMat) {
            setError(`Cannot transfer: dragged material (${stripLeadingZeros(srcMat)}) differs from drop target (${stripLeadingZeros(dstMat)})`);
            return;
        }
        const srcPlant = src.Plant || '';
        const srcSloc = src.StorageLocation || '';
        const dstPlant = destItem.Plant || '';
        const dstSloc = destItem.StorageLocation || '';
        if (srcPlant === dstPlant && srcSloc === dstSloc) {
            setError('Source and destination are the same location.');
            return;
        }
        const mvtType = srcPlant !== dstPlant ? '301' : '311';
        const transferType = srcPlant !== dstPlant ? 'plant-to-plant' : 'sloc-to-sloc';
        const availableQty = parseFloat(src.MatlWrhsStkQtyInMatlBaseUnit || 0);
        setDdModal({ src, dst: destItem, type: transferType, mvtType, unit: src.MaterialBaseUnit || 'EA', availableQty });
        setDdQty(String(availableQty));
        setDdSuccess('');
        setDdError('');
    }, []);

    // ─── Mouse drag handlers ───
    const handleDragStart = useCallback((e, item, index) => {
        draggedItem.current = { ...item, _index: index };
        e.dataTransfer.effectAllowed = 'move';
    }, []);

    const handleDragOver = useCallback((e, index) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverIndex(index);
    }, []);

    const handleDragEnd = useCallback(() => {
        setDragOverIndex(null);
    }, []);

    const handleDrop = useCallback((e, destItem) => {
        e.preventDefault();
        setDragOverIndex(null);
        const src = draggedItem.current;
        draggedItem.current = null;
        openTransferModal(src, destItem);
    }, [openTransferModal]);

    // ─── Touch drag handlers (for Android/mobile) ───
    const handleTouchStart = useCallback((e, item, index) => {
        // Only initiate if it's a long-press-like touch on the card (could use a small delay if needed)
        draggedItem.current = { ...item, _index: index };

        // Create a floating ghost element
        const touch = e.touches[0];
        const clone = e.currentTarget.cloneNode(true);
        clone.style.cssText = `
            position: fixed; z-index: 9999; pointer-events: none; opacity: 0.85;
            width: ${e.currentTarget.offsetWidth}px;
            left: ${touch.clientX - e.currentTarget.offsetWidth / 2}px;
            top: ${touch.clientY - 40}px;
            transform: scale(1.05); box-shadow: 0 20px 40px rgba(0,0,0,0.25);
            border-radius: 12px; transition: none;
        `;
        document.body.appendChild(clone);
        touchCloneRef.current = clone;
    }, []);

    const handleTouchMove = useCallback((e) => {
        e.preventDefault(); // prevent page scroll during drag
        const touch = e.touches[0];
        if (touchCloneRef.current) {
            touchCloneRef.current.style.left = `${touch.clientX - touchCloneRef.current.offsetWidth / 2}px`;
            touchCloneRef.current.style.top = `${touch.clientY - 40}px`;
        }
        // Determine which card is under the finger
        if (touchCloneRef.current) touchCloneRef.current.style.display = 'none';
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        if (touchCloneRef.current) touchCloneRef.current.style.display = '';
        const card = el?.closest('[data-stock-index]');
        const idx = card ? parseInt(card.dataset.stockIndex, 10) : null;
        setDragOverIndex(idx);
    }, []);

    const handleTouchEnd = useCallback((e, allItems) => {
        // Clean up ghost
        if (touchCloneRef.current) {
            document.body.removeChild(touchCloneRef.current);
            touchCloneRef.current = null;
        }
        const touch = e.changedTouches[0];
        // Hide clone to do hit test
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        const card = el?.closest('[data-stock-index]');
        const idx = card ? parseInt(card.dataset.stockIndex, 10) : null;
        setDragOverIndex(null);

        const src = draggedItem.current;
        draggedItem.current = null;
        if (idx !== null && idx !== src?._index && allItems[idx]) {
            openTransferModal(src, allItems[idx]);
        }
    }, [openTransferModal]);

    const handleDDConfirm = async () => {
        if (!ddModal) return;
        const qty = parseFloat(ddQty);
        if (!qty || qty <= 0) {
            setDdError('Please enter a valid quantity.');
            return;
        }
        if (qty > ddModal.availableQty) {
            setDdError(`Quantity exceeds available stock (${ddModal.availableQty} ${ddModal.unit}).`);
            return;
        }

        setDdLoading(true);
        setDdError('');
        setDdSuccess('');

        try {
            const config = apiConfig || JSON.parse(localStorage.getItem('sapConfig') || '{}');

            const item = {
                Material: ddModal.src.Material,
                Plant: ddModal.src.Plant,
                StorageLocation: ddModal.src.StorageLocation,
                GoodsMovementType: ddModal.mvtType,
                EntryUnit: ddModal.unit,
                QuantityInEntryUnit: String(qty),
                ...(ddModal.type === 'plant-to-plant' ? {
                    DestinationPlant: ddModal.dst.Plant,
                    DestinationStorageLocation: ddModal.dst.StorageLocation,
                } : {
                    DestinationStorageLocation: ddModal.dst.StorageLocation,
                })
            };

            const result = await api.postGoodsMovement(config, [item]);
            const matDoc = result?.d?.MaterialDocument || result?.MaterialDocument || '';
            setDdSuccess(`✓ Transfer posted${matDoc ? ` — Material Doc: ${matDoc}` : ''}`);

            // Refresh stock after 2s
            setTimeout(async () => {
                setDdModal(null);
                await handleSearch();
            }, 2000);
        } catch (err) {
            setDdError(err.message || 'Transfer failed');
        } finally {
            setDdLoading(false);
        }
    };

    const hasResults = stockData && stockData.length > 0;

    return (
        <>
            <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">

                {/* Fixed Header */}
                <header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                <div className="flex justify-between items-center relative">
                    <button onClick={() => navigate(-1)} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition" title="Back">
                                                    <ArrowLeft size={20} />
                                                </button>
                    
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <h1 className="text-xl font-bold text-white tracking-wide">
                            Stock Overview
                        </h1>
                                                <p className="text-blue-200 text-[10px] font-medium uppercase tracking-wider mt-0.5">
                                                    {hasSearched ? `${stockData.length} Results` : 'Search Stock'}
                                                </p>
                    </div>

                    <button onClick={() => navigate('/menu', { replace: true })} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition" title="Home">
                                                    <Home size={20} />
                                                </button>
                </div>
            </header>

                {/* Error */}
                {error && (
                    <div className="px-4 py-3 z-50 w-full shrink-0 flex flex-col gap-2 relative">
                        <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-3 shadow-md flex gap-3 items-start w-full max-w-md mx-auto animate-in slide-in-from-top-2">
                            <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                            <p className="text-[11px] text-red-600 mt-0.5 flex-1 whitespace-pre-wrap">{error}</p>
                            <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-md transition-colors shrink-0">
                                <X size={14} className="text-red-500" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Main Content */}
                <main className="flex-1 overflow-y-auto px-4 pt-4 pb-20 z-10 content-area" style={{ WebkitOverflowScrolling: 'touch' }}>
                    <div className="max-w-md mx-auto">

                        {/* Search Form Card */}
                        <div className="bg-white shadow-sm border border-slate-200 w-full p-4 rounded-xl mt-2">
                            <form onSubmit={handleSearch} className="flex flex-col gap-4">

                                {/* Plant */}
                                <div className="w-full">
                                    <Select
                                        label="Plant"
                                        value={plant}
                                        onChange={(e) => setPlant(e.target.value)}
                                        options={[
                                            { value: '', label: 'All Plants' },
                                            ...availablePlants.map(p => ({
                                                value: p.Plant,
                                                label: `${p.Plant}${p.PlantName ? ` - ${p.PlantName}` : ''}`
                                            }))
                                        ]}
                                    />
                                </div>

                                {/* Storage Location */}
                                <div className="w-full">
                                    <Select
                                        label="Storage Loc"
                                        value={storageLoc}
                                        onChange={(e) => setStorageLoc(e.target.value)}
                                        disabled={!plant}
                                        options={[
                                            { value: '', label: 'All SLocs' },
                                            ...availableSLocs.map(sl => ({
                                                value: sl.StorageLocation,
                                                label: `${sl.StorageLocation}${sl.StorageLocationName ? ` - ${sl.StorageLocationName}` : ''}`
                                            }))
                                        ]}
                                    />
                                </div>

                                {/* Row 2: Material with value help */}
                                <div className="w-full">
                                    <Input
                                        label="Material"
                                        placeholder="Material Number (optional)"
                                        value={material}
                                        onChange={(e) => setMaterial(e.target.value.toUpperCase())}
                                        leftIcon={<Search size={18} />}
                                        rightIcon={
                                            <button
                                                type="button"
                                                onClick={handleOpenMaterialHelp}
                                                className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-brand-blue hover:bg-blue-50 bg-slate-100 rounded-lg transition-colors"
                                                title="Browse Materials"
                                            >
                                            <List size={20} />
                                        </button>
                                        }
                                        wrapperClassName="mb-0"
                                    />
                                </div>

                                {/* Search Button */}
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

                        {/* Results */}
                        {loading ? (
                            <div className="text-center py-12">
                                <Loader className="animate-spin mx-auto text-blue-600 mb-4" size={32} />
                                <p className="text-slate-400">Fetching stock info...</p>
                            </div>
                        ) : !hasSearched ? (
                            <div className="text-center py-16 text-slate-500 border-2 border-dashed border-slate-200 rounded-xl mt-4">
                                <Warehouse className="mx-auto mb-4 opacity-30 text-slate-400" size={48} />
                                <p className="font-medium">Search Stock by Material, Plant, or Storage Location</p>
                                <p className="text-sm text-slate-400 mt-2">Enter at least one criteria to search</p>
                            </div>
                        ) : stockData.length === 0 ? (
                            <div className="text-center py-16 text-slate-500 border-2 border-dashed border-slate-200 rounded-xl mt-4">
                                <Package className="mx-auto mb-4 opacity-30 text-slate-400" size={48} />
                                <p className="font-medium">No Stock Found</p>
                                <p className="text-sm text-slate-400 mt-2">{getSearchDescription()}</p>
                            </div>
                        ) : (
                            <div className="mt-4">
                                {/* View Toggle & Description */}
                                <div className="flex items-center justify-between mb-3 px-1">
                                    <div className="text-xs text-slate-500 font-medium">
                                        {getSearchDescription()}
                                    </div>
                                    <div className="flex bg-slate-100 rounded-lg p-0.5 shrink-0">
                                        <button
                                            onClick={() => setViewMode('list')}
                                            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${viewMode === 'list' ? 'bg-white text-brand-blue shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            <LayoutList size={14} /> List
                                        </button>
                                        <button
                                            onClick={() => setViewMode('chart')}
                                            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${viewMode === 'chart' ? 'bg-white text-brand-blue shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            <BarChart3 size={14} /> Chart
                                        </button>
                                    </div>
                                </div>

                                {viewMode === 'list' ? (
                                    /* ===== LIST VIEW with Drag-and-Drop ===== */
                                    <div className="flex flex-col gap-3">
                                        {/* Drag hint */}
                                        <p className="text-[11px] text-slate-400 text-center flex items-center justify-center gap-1 px-4">
                                            <MoveRight size={12} />
                                            Drag a row onto another to transfer stock between locations
                                        </p>
                                        {stockData.map((item, index) => {
                                            const qty = parseFloat(item.MatlWrhsStkQtyInMatlBaseUnit || 0);
                                            const unit = item.MaterialBaseUnit || 'EA';
                                            const stockValue = parseFloat(item.StockValue || item.StockValueInCompCodeCrcy || item.InventoryValue || 0);
                                            const currency = item.CompanyCodeCurrency || item.Currency || '';
                                            const isDragOver = dragOverIndex === index;

                                            return (
                                                <div
                                                    key={index}
                                                    data-stock-index={index}
                                                    draggable
                                                    onDragStart={(e) => handleDragStart(e, item, index)}
                                                    onDragOver={(e) => handleDragOver(e, index)}
                                                    onDragEnd={handleDragEnd}
                                                    onDrop={(e) => handleDrop(e, item)}
                                                    onTouchStart={(e) => handleTouchStart(e, item, index)}
                                                    onTouchMove={handleTouchMove}
                                                    onTouchEnd={(e) => handleTouchEnd(e, stockData)}
                                                    className={`relative bg-white rounded-xl shadow border overflow-hidden flex items-stretch min-h-[100px] cursor-grab active:cursor-grabbing transition-all ${isDragOver ? 'border-brand-blue shadow-lg scale-[1.02] ring-2 ring-brand-blue/30' : 'border-slate-200'}`}
                                                >
                                                    <div className={`w-2 flex-shrink-0 ${qty > 0 ? 'bg-blue-500' : 'bg-slate-300'}`}></div>
                                                    <div className="flex-1 px-4 py-3">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <h3 className="text-base font-bold text-blue-950 leading-tight">
                                                                {stripLeadingZeros(item.Material) || 'N/A'}
                                                            </h3>
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold border border-blue-200">
                                                                {item.InventoryStockType || item.StockType || '01'}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                                                            <Factory size={13} className="text-slate-400" />
                                                            <span>Plant: {item.Plant || 'N/A'}</span>
                                                            <MapPin size={13} className="text-slate-400 ml-2" />
                                                            <span>SLoc: {item.StorageLocation || 'N/A'}</span>
                                                        </div>
                                                        <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between items-end">
                                                            <div>
                                                                <p className="text-[10px] text-slate-400 uppercase font-bold">Available Stock</p>
                                                                <p className="font-bold text-slate-800 text-xl">
                                                                    {qty.toFixed(2)}
                                                                    <span className="text-xs font-medium text-slate-500 ml-1">{unit}</span>
                                                                </p>
                                                            </div>
                                                            <div className="flex items-center gap-3">
                                                                {stockValue > 0 && (
                                                                    <div className="text-right">
                                                                        <p className="text-[10px] text-slate-400 uppercase font-bold">Value</p>
                                                                        <p className="font-bold text-slate-700 text-sm">
                                                                            {stockValue.toFixed(2)}
                                                                            {currency && <span className="text-[10px] text-slate-400 ml-1">{currency}</span>}
                                                                        </p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {/* Drag target overlay indicator */}
                                                    {isDragOver && (
                                                        <div className="absolute inset-0 border-2 border-brand-blue rounded-xl pointer-events-none flex items-center justify-center bg-blue-50/60">
                                                            <span className="text-xs font-bold text-brand-blue bg-white px-3 py-1 rounded-full shadow">Drop to Transfer Here</span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    /* ===== CHART VIEW ===== */
                                    <ChartView stockData={stockData} stripLeadingZeros={stripLeadingZeros} />
                                )}
                            </div>
                        )}
                    </div>
                </main>

                {/* Material Value Help Modal */}
                {showMaterialHelp && (
                    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[85vh] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300">
                            {/* Header */}
                            <div className="flex justify-between items-center p-4 border-b border-gray-100 shrink-0">
                                <div>
                                    <h3 className="text-lg font-bold text-gray-800">Select Material</h3>
                                    <p className="text-xs text-brand-blue font-medium mt-0.5 flex items-center gap-1">
                                        <Package size={12} />
                                        {plant ? `Plant: ${plant}` : 'All plants'}{storageLoc ? ` • SLoc: ${storageLoc}` : ''}
                                    </p>
                                </div>
                                <button onClick={() => setShowMaterialHelp(false)} className="w-10 h-10 p-0 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors">
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Search Filter */}
                            <div className="px-4 pt-3 pb-2 border-b border-gray-100 shrink-0">
                                <div className="flex gap-2">
                                    <div className="flex-1 w-full">
                                        <Input
                                            type="text"
                                            placeholder="Type material number..."
                                            value={materialFilter}
                                            onChange={(e) => setMaterialFilter(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); loadMaterialOptions(materialFilter); } }}
                                            rightIcon={
                                                materialFilter && (
                                                    <button onClick={() => setMaterialFilter('')} className="p-1 mr-2 text-gray-400 hover:text-gray-600"><X size={14} /></button>
                                                )
                                            }
                                            wrapperClassName="mt-0 w-full"
                                            autoFocus
                                            autoComplete="off"
                                        />
                                    </div>
                                    <Button
                                        type="button"
                                        fullWidth={false}
                                        onClick={() => loadMaterialOptions(materialFilter)}
                                        disabled={materialHelpLoading}
                                        className="py-2.5 shrink-0 w-12 flex justify-center items-center"
                                        style={{ height: '56px', minHeight: '56px', width: '56px', padding: 0 }}
                                    >
                                        {materialHelpLoading ? <Loader className="animate-spin" size={20} /> : <Search size={20} />}
                                    </Button>
                                </div>
                                <p className="text-[11px] text-slate-400 mt-1.5 ml-1">
                                    {materialOptions.length > 0 ? `${materialOptions.length} materials found` : (plant ? 'Search to find materials' : 'Select a plant first')}
                                </p>
                            </div>

                            {/* Material List */}
                            <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50 min-h-[200px]">
                                {materialHelpLoading ? (
                                    <div className="flex flex-col items-center justify-center h-32 text-gray-500">
                                        <div className="w-8 h-8 border-4 border-brand-blue border-t-transparent rounded-full animate-spin mb-3"></div>
                                        <p className="text-sm font-medium">Fetching materials...</p>
                                    </div>
                                ) : materialOptions.length === 0 && !materialHelpLoading ? (
                                    <div className="text-center py-10 px-4">
                                        <div className="w-16 h-16 bg-blue-50 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-3">
                                            <Search size={28} />
                                        </div>
                                        <p className="text-gray-700 font-bold text-base mb-1">
                                            {plant ? 'Search for Materials' : 'Select a Plant First'}
                                        </p>
                                        <p className="text-xs text-gray-400 mt-1">
                                            {plant ? 'Type a material number above and press Search, or press Search to see all materials.' : 'Choose a plant from the dropdown to browse materials.'}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {filteredMaterials.map((m) => (
                                            <button
                                                key={m.Material}
                                                type="button"
                                                onClick={() => { setMaterial(stripLeadingZeros(m.Material)); setShowMaterialHelp(false); }}
                                                className="w-full text-left bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm hover:border-brand-blue hover:shadow-md transition-all active:scale-[0.98] group cursor-pointer flex items-center justify-between"
                                            >
                                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                                    <div className="h-9 w-9 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600 shrink-0">
                                                        <Package size={18} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="font-bold text-gray-800 text-sm group-hover:text-brand-blue transition-colors">
                                                            {stripLeadingZeros(m.Material)}
                                                        </h4>
                                                        {m.MaterialDescription && (
                                                            <p className="text-[11px] text-slate-600 truncate">{m.MaterialDescription}</p>
                                                        )}
                                                        <p className="text-[11px] text-slate-400 mt-0.5">
                                                            Stock: <span className="font-semibold text-brand-blue">{m.Qty.toFixed(2)}</span> {m.MaterialBaseUnit}
                                                        </p>
                                                    </div>
                                                </div>
                                                <ChevronRight className="text-gray-300 group-hover:text-blue-500 transition-colors shrink-0 ml-2" size={18} />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="p-4 bg-white border-t border-gray-100 shrink-0 sm:rounded-b-2xl pb-safe">
                                <button onClick={() => setShowMaterialHelp(false)} className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors">
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ===== Drag-Drop Confirm Modal (outside overflow-hidden) ===== */}
            {ddModal && createPortal(
                <div
                    style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
                    onClick={(e) => { if (!ddLoading && e.target === e.currentTarget) setDdModal(null); }}
                >
                    <div style={{ background: 'white', borderRadius: '1.5rem', width: '92%', maxWidth: '440px', boxShadow: '0 25px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
                        {/* Header */}
                        <div style={{ background: 'linear-gradient(135deg, #003366 0%, #0055aa 100%)', padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ color: 'white', fontWeight: 700, fontSize: '1.1rem', margin: 0 }}>
                                    {ddModal.type === 'plant-to-plant' ? '🏭 Plant Transfer (Mvt 301)' : '📦 SLoc Transfer (Mvt 311)'}
                                </h3>
                                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.7rem', margin: '0.25rem 0 0', fontWeight: 600, letterSpacing: '0.05em' }}>
                                    {stripLeadingZeros(ddModal.src.Material)} · {ddModal.unit}
                                </p>
                            </div>
                            {!ddLoading && (
                                <button
                                    onClick={() => { setDdModal(null); setDdError(''); setDdSuccess(''); }}
                                    className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors"
                                >
                                    <X size={18} />
                                </button>
                            )}
                        </div>

                        {/* Body */}
                        <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {/* From → To */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ flex: 1, background: '#fef3c7', borderRadius: '0.75rem', padding: '0.75rem', border: '1px solid #fde68a' }}>
                                    <p style={{ fontSize: '0.6rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 0.25rem' }}>From</p>
                                    <p style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.85rem', margin: 0 }}>Plant: {ddModal.src.Plant}</p>
                                    <p style={{ color: '#64748b', fontSize: '0.75rem', margin: '0.15rem 0 0', fontWeight: 600 }}>SLoc: {ddModal.src.StorageLocation || '—'}</p>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '2rem', height: '2rem', borderRadius: '50%', background: '#003366', flexShrink: 0 }}>
                                    <ArrowRight size={14} color="white" />
                                </div>
                                <div style={{ flex: 1, background: '#d1fae5', borderRadius: '0.75rem', padding: '0.75rem', border: '1px solid #a7f3d0' }}>
                                    <p style={{ fontSize: '0.6rem', fontWeight: 700, color: '#064e3b', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 0.25rem' }}>To</p>
                                    <p style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.85rem', margin: 0 }}>Plant: {ddModal.dst.Plant}</p>
                                    <p style={{ color: '#64748b', fontSize: '0.75rem', margin: '0.15rem 0 0', fontWeight: 600 }}>SLoc: {ddModal.dst.StorageLocation || '—'}</p>
                                </div>
                            </div>

                            {/* Qty Input */}
                            <div>
                                <Input
                                    label={`Quantity (Max: ${ddModal.availableQty} ${ddModal.unit})`}
                                    type="number"
                                    min="0"
                                    max={ddModal.availableQty}
                                    step="any"
                                    value={ddQty}
                                    onChange={(e) => setDdQty(e.target.value)}
                                    disabled={ddLoading || !!ddSuccess}
                                    className="font-bold text-lg text-right"
                                    wrapperClassName="mb-0"
                                />
                            </div>

                            {/* Messages */}
                            {ddError && (
                                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '0.5rem', padding: '0.6rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <AlertCircle size={14} color="#ef4444" />
                                    <span style={{ color: '#b91c1c', fontSize: '0.78rem', fontWeight: 600 }}>{ddError}</span>
                                </div>
                            )}
                            {ddSuccess && (
                                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '0.5rem', padding: '0.6rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <CheckCircle size={14} color="#16a34a" />
                                    <span style={{ color: '#15803d', fontSize: '0.78rem', fontWeight: 600 }}>{ddSuccess}</span>
                                </div>
                            )}

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                {!ddSuccess && (
                                    <>
                                        <button
                                            onClick={() => { setDdModal(null); setDdError(''); }}
                                            disabled={ddLoading}
                                            style={{ flex: 1, padding: '0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '0.75rem', fontWeight: 700, fontSize: '0.85rem', color: '#64748b', background: 'white', cursor: 'pointer' }}
                                        >
                                            Cancel
                                        </button>
                                        <Button
                                            onClick={handleDDConfirm}
                                            disabled={ddLoading}
                                            className="flex-2 py-3"
                                        >
                                            {ddLoading ? <><div style={{ width: '1rem', height: '1rem', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }}></div> Posting...</> : <>Confirm Transfer</>}
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

export default StockOverview;
