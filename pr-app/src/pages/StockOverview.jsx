import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
    Warehouse, Search, Home, Package, AlertCircle, Loader, MapPin, Factory,
    ChevronDown, CheckCircle, List
} from 'lucide-react';

const StockOverview = () => {
    const navigate = useNavigate();
    const { apiConfig } = useAuth();

    // Search Filters
    const [material, setMaterial] = useState('');
    const [plant, setPlant] = useState('');
    const [storageLoc, setStorageLoc] = useState('');

    // Value Help States
    const [availablePlants, setAvailablePlants] = useState([]);
    const [availableSLocs, setAvailableSLocs] = useState([]);
    const [showPlantHelp, setShowPlantHelp] = useState(false);
    const [showSLocHelp, setShowSLocHelp] = useState(false);
    const [plantLoading, setPlantLoading] = useState(false);
    const [slocLoading, setSlocLoading] = useState(false);

    const [stockData, setStockData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [hasSearched, setHasSearched] = useState(false);

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

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (!event.target.closest('.plant-dropdown')) setShowPlantHelp(false);
            if (!event.target.closest('.sloc-dropdown')) setShowSLocHelp(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">

            {/* Fixed Header - Blue Theme */}
            <header className="app-header-straight pb-8 px-6 shadow-lg flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)' }}>
                <div className="flex items-center justify-between mb-6">
                    <button onClick={() => navigate('/menu')} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition">
                        <Home size={20} />
                    </button>
                </div>

                <div className="flex flex-col items-center justify-center -mt-2 mb-2 relative">
                    <h1 className="text-3xl font-bold text-white mb-1">Stock Overview</h1>
                    <p className="text-blue-200 text-sm font-medium uppercase tracking-wider">
                        {hasSearched ? `${stockData.length} Results` : 'Search Stock'}
                    </p>
                </div>

                {/* Search Form */}
                <form onSubmit={handleSearch} className="mt-4 space-y-3">
                    {/* Material Input */}
                    <input
                        type="text"
                        placeholder="Material Number"
                        value={material}
                        onChange={(e) => setMaterial(e.target.value.toUpperCase())}
                        className="w-full bg-white h-11 rounded-lg px-4 text-slate-700 placeholder-slate-400 shadow-lg border-0 focus:ring-2 focus:ring-blue-400 text-center font-medium"
                    />

                    {/* Plant and Storage Location with Value Helps */}
                    <div className="flex gap-2">
                        {/* Plant Dropdown */}
                        <div className="relative plant-dropdown flex-1">
                            <div className="flex items-center relative">
                                <input
                                    type="text"
                                    placeholder="Plant"
                                    value={plant}
                                    onChange={(e) => setPlant(e.target.value.toUpperCase())}
                                    onFocus={() => setShowPlantHelp(true)}
                                    className="w-full bg-white h-11 rounded-lg px-4 pr-10 text-slate-700 placeholder-slate-400 shadow-lg border-0 focus:ring-2 focus:ring-blue-400 text-center font-medium"
                                />
                                <div className="absolute right-3 text-slate-400 pointer-events-none">
                                    {plantLoading ? <Loader className="animate-spin" size={16} /> : <List size={16} />}
                                </div>
                            </div>

                            {showPlantHelp && availablePlants.length > 0 && (
                                <div className="absolute top-full left-0 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
                                    {availablePlants.map(p => (
                                        <div
                                            key={p.Plant}
                                            onClick={() => { setPlant(p.Plant); setShowPlantHelp(false); }}
                                            className="p-3 hover:bg-blue-50 cursor-pointer border-b border-slate-100 last:border-0 flex justify-between items-center"
                                        >
                                            <div>
                                                <span className="font-bold text-slate-800 block">{p.Plant}</span>
                                                <span className="text-xs text-slate-500">{p.PlantName || ''}</span>
                                            </div>
                                            {plant === p.Plant && <CheckCircle size={16} className="text-blue-500" />}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {showPlantHelp && availablePlants.length === 0 && !plantLoading && (
                                <div className="absolute top-full left-0 w-full mt-1 bg-slate-50 border border-slate-200 rounded-lg shadow-xl z-50 p-3">
                                    <p className="text-xs text-slate-500 font-medium">Type a Plant code or check if stock data exists</p>
                                </div>
                            )}
                        </div>

                        {/* Storage Location Dropdown */}
                        <div className="relative sloc-dropdown flex-1">
                            <div className="flex items-center relative">
                                <input
                                    type="text"
                                    placeholder="Storage Loc"
                                    value={storageLoc}
                                    onChange={(e) => setStorageLoc(e.target.value.toUpperCase())}
                                    onFocus={() => setShowSLocHelp(true)}
                                    className="w-full bg-white h-11 rounded-lg px-4 pr-10 text-slate-700 placeholder-slate-400 shadow-lg border-0 focus:ring-2 focus:ring-blue-400 text-center font-medium"
                                />
                                <div className="absolute right-3 text-slate-400 pointer-events-none">
                                    {slocLoading ? <Loader className="animate-spin" size={16} /> : <List size={16} />}
                                </div>
                            </div>

                            {showSLocHelp && availableSLocs.length > 0 && (
                                <div className="absolute top-full left-0 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
                                    {availableSLocs.map(sl => (
                                        <div
                                            key={sl.StorageLocation}
                                            onClick={() => { setStorageLoc(sl.StorageLocation); setShowSLocHelp(false); }}
                                            className="p-3 hover:bg-blue-50 cursor-pointer border-b border-slate-100 last:border-0 flex justify-between items-center"
                                        >
                                            <div>
                                                <span className="font-bold text-slate-800 block">{sl.StorageLocation}</span>
                                                <span className="text-xs text-slate-500">{sl.StorageLocationName || ''}</span>
                                            </div>
                                            {storageLoc === sl.StorageLocation && <CheckCircle size={16} className="text-blue-500" />}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {showSLocHelp && !plant && (
                                <div className="absolute top-full left-0 w-full mt-1 bg-amber-50 border border-amber-200 rounded-lg shadow-xl z-50 p-3">
                                    <p className="text-xs text-amber-700 font-medium">Select a Plant first to see Storage Locations</p>
                                </div>
                            )}

                            {showSLocHelp && plant && availableSLocs.length === 0 && !slocLoading && (
                                <div className="absolute top-full left-0 w-full mt-1 bg-slate-50 border border-slate-200 rounded-lg shadow-xl z-50 p-3">
                                    <p className="text-xs text-slate-500 font-medium">No Storage Locations found for this Plant</p>
                                </div>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            style={{ backgroundColor: '#2563eb' }}
                            className="h-11 px-5 rounded-lg text-white font-bold text-sm hover:opacity-90 transition-colors shadow-lg disabled:opacity-50"
                        >
                            {loading ? <Loader className="animate-spin" size={18} /> : <Search size={18} />}
                        </button>
                    </div>
                </form>
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto px-4 pt-6 pb-32 -mt-2 z-10" style={{ WebkitOverflowScrolling: 'touch' }}>
                <div className="max-w-5xl mx-auto">

                    {error && (
                        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg flex gap-3 items-start animate-in fade-in slide-in-from-top-2 shadow-sm">
                            <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={20} />
                            <div>
                                <h4 className="text-sm font-bold text-red-700">Error</h4>
                                <p className="text-xs text-red-600 mt-1">{error}</p>
                            </div>
                        </div>
                    )}

                    {loading ? (
                        <div className="text-center py-12">
                            <Loader className="animate-spin mx-auto text-blue-600 mb-4" size={32} />
                            <p className="text-slate-400">Fetching stock info...</p>
                        </div>
                    ) : !hasSearched ? (
                        <div className="text-center py-16 text-slate-500 border-2 border-dashed border-slate-200 rounded-xl">
                            <Warehouse className="mx-auto mb-4 opacity-30 text-slate-400" size={48} />
                            <p className="font-medium">Search Stock by Material, Plant, or Storage Location</p>
                            <p className="text-sm text-slate-400 mt-2">Enter at least one criteria to search</p>
                        </div>
                    ) : stockData.length === 0 ? (
                        <div className="text-center py-16 text-slate-500 border-2 border-dashed border-slate-200 rounded-xl">
                            <Package className="mx-auto mb-4 opacity-30 text-slate-400" size={48} />
                            <p className="font-medium">No Stock Found</p>
                            <p className="text-sm text-slate-400 mt-2">{getSearchDescription()}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {/* Results Summary */}
                            <div className="text-xs text-slate-500 font-medium px-1 mb-2">
                                {getSearchDescription()}
                            </div>

                            {stockData.map((item, index) => (
                                <div
                                    key={index}
                                    className="relative bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex items-stretch min-h-[100px]"
                                >
                                    {/* Left Colored Strip - Blue for Stock */}
                                    <div className="w-2 bg-blue-500 flex-shrink-0"></div>

                                    <div className="flex-1 px-4 py-3">
                                        {/* Header Row */}
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="text-lg font-bold text-blue-950 leading-tight">
                                                {item.Material || 'N/A'}
                                            </h3>
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold border border-blue-200">
                                                {item.InventoryStockType || item.StockType || 'Unrestricted'}
                                            </span>
                                        </div>

                                        <div className="flex flex-col gap-1">
                                            {/* Plant / Storage Location */}
                                            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                                                <Factory size={13} className="text-slate-400" />
                                                <span>Plant: {item.Plant || 'N/A'}</span>
                                                <MapPin size={13} className="text-slate-400 ml-2" />
                                                <span>SLoc: {item.StorageLocation || 'N/A'}</span>
                                            </div>
                                        </div>

                                        {/* Quantity Display */}
                                        <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between items-end">
                                            <div>
                                                <p className="text-[10px] text-slate-400 uppercase font-bold">Available Stock</p>
                                                <p className="font-bold text-slate-800 text-xl">
                                                    {parseFloat(item.MatlWrhsStkQtyInMatlBaseUnit || 0).toFixed(2)}
                                                    <span className="text-xs font-medium text-slate-500 ml-1">
                                                        {item.MaterialBaseUnit || 'EA'}
                                                    </span>
                                                </p>
                                            </div>
                                            {item.StockValue && (
                                                <div className="text-right">
                                                    <p className="text-[10px] text-slate-400 uppercase font-bold">Value</p>
                                                    <p className="font-bold text-slate-700 text-sm">
                                                        {parseFloat(item.StockValue || 0).toFixed(2)}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default StockOverview;
