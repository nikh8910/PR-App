/**
 * @file GoodsReceiptProduction.jsx
 * @description Screen: Goods Receipt against Production Order / Work Order
 *
 * Posts a Goods Receipt for a completed production or work order. The operator
 * enters the production order number, which is used to look up the order header
 * and finished goods material, then posts GR to SAP (movement type 101).
 *
 * ## SAP Flow
 *  1. Production order is created in SAP PP (CO01/CO40)
 *  2. Manufacturing produces the goods
 *  3. Operator posts GR here (movement type 101) — goods received into warehouse
 *
 * SAP API: API_PRODUCTION_ORDER_SRV (order lookup) + API_GOODSMOVEMENT_SRV (post)
 *
 * @route /gr-production
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
    Search, ArrowLeft, Home, AlertCircle, Loader, CheckCircle,
    X, Factory, Package, Scan, List
} from 'lucide-react';
import BarcodeScanner from '../components/BarcodeScanner';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';

const GoodsReceiptProduction = () => {
    const navigate = useNavigate();
    const { apiConfig } = useAuth();

    const [loading, setLoading] = useState(false);
    const [lookupLoading, setLookupLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');

    const [showScanner, setShowScanner] = useState(false);

    // Order lookup
    const [orderNumber, setOrderNumber] = useState('');
    const [orderData, setOrderData] = useState(null); // fetched order header

    // GR form fields (pre-filled from order, editable)
    const [material, setMaterial] = useState('');
    const [plant, setPlant] = useState('');
    const [storageLocation, setStorageLocation] = useState('');
    const [quantity, setQuantity] = useState('');
    const [unit, setUnit] = useState('EA');

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

    const toISO = (d) => d.toISOString().split('T')[0];
    const [postingDate] = useState(toISO(new Date()));

    // Batch and serial
    const [batchInput, setBatchInput] = useState('');
    const [serialInputs, setSerialInputs] = useState([]);
    const [scanTarget, setScanTarget] = useState(null); // 'order' | 'batch' | 'serial_0' etc.

    useEffect(() => {
        loadPlants();
    }, []);

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

    const loadMaterialOptions = async (searchTerm = '') => {
        setMaterialHelpLoading(true);
        try {
            const config = apiConfig || JSON.parse(localStorage.getItem('sapConfig') || '{}');
            const data = await api.fetchMaterialStock(config, {
                material: searchTerm.trim(),
                plant: plant.trim(),
                storageLocation: storageLocation.trim()
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
        if (plant) {
            loadMaterialOptions('');
        }
    };

    const handleScan = (code) => {
        if (scanTarget === 'batch') {
            setBatchInput(code.trim());
        } else if (scanTarget && scanTarget.startsWith('serial_')) {
            const idx = parseInt(scanTarget.split('_')[1], 10);
            setSerialInputs(prev => {
                const updated = [...prev];
                updated[idx] = code.trim();
                return updated;
            });
        } else {
            setOrderNumber(code.trim());
        }
        setShowScanner(false);
        setScanTarget(null);
    };

    /**
     * Try to look up the production order header from SAP.
     * If it fails, try Maintenance Order.
     * If both fail, falls back to manual entry mode.
     */
    const handleLookupOrder = async () => {
        if (!orderNumber.trim()) {
            setError('Enter a Production or Work Order number.');
            return;
        }
        setLookupLoading(true);
        setError(null);
        setOrderData(null);
        try {
            let res = null;
            let isMaintenance = false;

            // 1. Try Production Order
            try {
                if (typeof api.fetchProductionOrder === 'function') {
                    res = await api.fetchProductionOrder(apiConfig, orderNumber.trim());
                }
            } catch (prodErr) {
                console.warn('Production order lookup failed:', prodErr.message);
            }

            // 2. Try Maintenance Order
            if (!res) {
                try {
                    if (typeof api.fetchMaintenanceOrder === 'function') {
                        res = await api.fetchMaintenanceOrder(apiConfig, orderNumber.trim());
                        isMaintenance = true;
                    }
                } catch (maintErr) {
                    console.warn('Maintenance order lookup failed:', maintErr.message);
                }
            }

            // 3. Process
            if (res) {
                setOrderData({ ...res, isMaintenance });
                setMaterial(res.ProductionOrderProduct || res.Material || res.Assembly || '');
                setPlant(res.ProductionPlant || res.Plant || res.MaintenancePlant || '');
                setUnit(res.ProductionOrderYieldDeviationQtyUnit || res.BaseUnit || 'EA');
                const planned = parseFloat(res.TotalQuantity || res.PlannedOrderQuantity || 0);
                const received = parseFloat(res.ConfirmedYieldQuantity || 0);
                setQuantity(Math.max(0, planned - received).toString());
                return;
            }

            // API not available or order not found — manual entry
            setOrderData({ manual: true, orderNumber: orderNumber.trim() });
        } catch (err) {
            console.warn('Order lookup failed, using manual entry:', err.message);
            setOrderData({ manual: true, orderNumber: orderNumber.trim() });
        } finally {
            setLookupLoading(false);
        }
    };

    const handlePostGR = async () => {
        if (!material.trim()) { setError('Enter a Material.'); return; }
        if (!plant.trim()) { setError('Enter a Plant.'); return; }
        if (!storageLocation.trim()) { setError('Enter a Storage Location.'); return; }
        const qty = parseFloat(quantity);
        if (!quantity || isNaN(qty) || qty <= 0) { setError('Enter a valid quantity.'); return; }

        if (!window.confirm(`Post GR for Order ${orderNumber}?\n${qty} ${unit} of ${material} into ${plant} / ${storageLocation}`)) return;

        setLoading(true);
        setError(null);
        try {
            // Post via A_MaterialDocumentHeader (same API as GR for PO)
            // Material Document Header for Movement 101 (goods receipt)
            const payload = {
                GoodsMovementCode: '01',
                DocumentDate: postingDate,
                PostingDate: postingDate,
                HeaderText: `GR for Order ${orderNumber}`,
                to_MaterialDocumentItem: {
                    results: [(() => {
                        const docItem = {
                            Material: material.toUpperCase().trim(),
                            Plant: plant.toUpperCase().trim(),
                            StorageLocation: storageLocation.toUpperCase().trim(),
                            QuantityInEntryUnit: qty,
                            EntryUnit: unit || 'EA',
                            GoodsMovementType: '101',
                            SpecialStockIdfgSalesOrder: '',
                        };
                        if (batchInput.trim()) docItem.Batch = batchInput.trim();
                        const validSerials = serialInputs.filter(s => s && s.trim());
                        if (validSerials.length > 0) {
                            docItem.to_SerialNumber = {
                                results: validSerials.map(sn => ({ SerialNumber: sn.trim() }))
                            };
                        }
                        return docItem;
                    })()]
                }
            };
            await api.postGoodsReceipt(apiConfig, payload);
            setSuccessMsg(`GR Posted! Order ${orderNumber} - ${qty} ${unit} of ${material}`);
            setTimeout(() => {
                setSuccessMsg('');
                setOrderNumber('');
                setOrderData(null);
                setMaterial('');
                setPlant('');
                setStorageLocation('');
                setQuantity('');
                setUnit('EA');
                setBatchInput('');
                setSerialInputs([]);
            }, 3000);
        } catch (err) {
            setError('Post GR failed: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
            {/* Header */}
            <header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                <div className="flex justify-between items-center relative">
                    <button onClick={() => navigate(-1)} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition" title="Back">
                                            <ArrowLeft size={20} />
                                        </button>
                    
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <h1 className="text-xl font-bold text-white tracking-wide">
                            GR Production
                        </h1>
                                                <p className="text-blue-200 text-[10px] font-medium uppercase tracking-wider mt-0.5">
                                                    Production / Work Order Receipt
                                                </p>
                    </div>

                    <button onClick={() => { setError(null); navigate('/menu', { replace: true }); }} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition" title="Home">
                                            <Home size={20} />
                                        </button>
                </div>
            </header>

            {/* Messages */}
            {(error || successMsg) && (
                <div className="px-4 py-3 z-50 w-full shrink-0 flex flex-col gap-2">
                    {error && (
                        <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-3 shadow-md flex gap-3 items-start">
                             <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                            <p className="text-[11px] text-red-600 flex-1">{error}</p>
                            <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-md">
                                <X size={14} className="text-red-500" />
                            </button>
                        </div>
                    )}
                    {successMsg && (
                        <div className="bg-emerald-50 border-l-4 border-emerald-500 rounded-lg p-3 shadow-md flex gap-3 items-start">
                            <CheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={18} />
                            <p className="text-[11px] text-emerald-700 flex-1 font-bold">{successMsg}</p>
                        </div>
                    )}
                </div>
            )}

            <main className="flex-1 overflow-y-auto px-4 pt-4 pb-32 content-area">
                <div className="max-w-lg mx-auto space-y-4">

                    {/* ── Step 1: Order Lookup ── */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <Factory size={18} className="text-violet-600" />
                            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Production / Work Order</h2>
                        </div>
                        <Input
                            label="Order Number *"
                            value={orderNumber}
                            onChange={e => { setOrderNumber(e.target.value); setOrderData(null); }}
                            placeholder="e.g. 1000001234"
                            rightIcon={
                                <button type="button" onClick={() => setShowScanner(true)} className="hover:text-brand-blue">
                                    <Scan size={18} />
                                </button>
                            }
                        />
                        <div className="mt-3">
                            <Button onClick={handleLookupOrder} disabled={lookupLoading || !orderNumber.trim()} className="w-full">
                                {lookupLoading ? <><Loader size={18} className="animate-spin mr-2" />Looking up...</> : <><Search size={18} className="mr-2" />Look Up Order</>}
                            </Button>
                        </div>
                        {orderData && !orderData.manual && (
                            <div className="mt-3 p-3 bg-violet-50 rounded-xl border border-violet-100">
                                <p className="text-xs font-bold text-violet-700">{orderData.isMaintenance ? 'Maintenance / Work Order Found' : 'Production Order Found'}</p>
                                <p className="text-xs text-violet-600 mt-0.5">{orderData.ProductionOrderProduct || orderData.Material || orderData.Assembly} · Plant: {orderData.ProductionPlant || orderData.Plant || orderData.MaintenancePlant}</p>
                            </div>
                        )}
                        {orderData?.manual && (
                            <div className="mt-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
                                <p className="text-xs font-bold text-amber-700">Manual Entry Mode</p>
                                <p className="text-xs text-amber-600 mt-0.5">Please fill in the material, plant, location and quantity below.</p>
                            </div>
                        )}
                    </div>

                    {/* ── Step 2: GR Details (shown after lookup or in manual mode) ── */}
                    {orderData && (
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <Package size={18} className="text-emerald-600" />
                                <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">GR Details — Movement 101</h2>
                            </div>

                            <div className="space-y-3">
                                <Input
                                    label="Material *"
                                    value={material}
                                    onChange={e => setMaterial(e.target.value.toUpperCase())}
                                    placeholder="e.g. MAT001"
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
                                />
                                <div className="grid grid-cols-2 gap-3">
                                    <Select
                                        label="Plant *"
                                        value={plant}
                                        onChange={(e) => setPlant(e.target.value)}
                                        options={[
                                            { value: '', label: 'Select Plant' },
                                            ...availablePlants.map(p => ({
                                                value: p.Plant,
                                                label: `${p.Plant}${p.PlantName ? ` - ${p.PlantName}` : ''}`
                                            }))
                                        ]}
                                    />
                                    <Select
                                        label="Storage Loc *"
                                        value={storageLocation}
                                        onChange={(e) => setStorageLocation(e.target.value)}
                                        disabled={!plant}
                                        options={[
                                            { value: '', label: 'Select SLoc' },
                                            ...availableSLocs.map(sl => ({
                                                value: sl.StorageLocation,
                                                label: `${sl.StorageLocation}${sl.StorageLocationName ? ` - ${sl.StorageLocationName}` : ''}`
                                            }))
                                        ]}
                                    />
                                </div>

                                {/* Quantity stepper */}
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-slate-500 mb-2 block">GR Quantity <span className="text-red-500">*</span></label>
                                    <div className="flex items-center gap-3">
                                        <button type="button"
                                            onClick={() => setQuantity(Math.max(0, parseFloat(quantity || 0) - 1).toString())}
                                            className="w-12 h-12 bg-white border-2 border-slate-200 rounded-2xl flex items-center justify-center text-xl font-bold hover:bg-slate-100 transition-colors">
                                            −
                                        </button>
                                        <input
                                            type="number"
                                            value={quantity}
                                            onChange={e => setQuantity(e.target.value)}
                                            inputMode="decimal"
                                            className="flex-1 h-14 border-2 border-slate-200 rounded-2xl text-center text-3xl font-bold bg-white outline-none focus:border-brand-blue"
                                        />
                                        <button type="button"
                                            onClick={() => setQuantity((parseFloat(quantity || 0) + 1).toString())}
                                            className="w-12 h-12 bg-white border-2 border-slate-200 rounded-2xl flex items-center justify-center text-xl font-bold hover:bg-slate-100 transition-colors">
                                            +
                                        </button>
                                    </div>
                                </div>
                                <Input
                                    label="Unit of Measure"
                                    value={unit}
                                    onChange={e => setUnit(e.target.value.toUpperCase())}
                                    placeholder="EA"
                                />

                                {/* Batch Input */}
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">Batch (Optional)</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            className="flex-1 h-11 border border-slate-200 rounded-xl px-3 text-sm font-bold text-slate-800 bg-white outline-none focus:border-brand-blue focus:ring-2 focus:ring-blue-100"
                                            value={batchInput}
                                            onChange={e => setBatchInput(e.target.value)}
                                            placeholder="Enter batch number"
                                        />
                                        <button type="button"
                                            onClick={() => { setScanTarget('batch'); setShowScanner(true); }}
                                            className="h-11 w-11 flex-none bg-brand-blue text-white rounded-xl flex items-center justify-center hover:opacity-90 transition-colors"
                                            title="Scan Batch">
                                            <Scan size={16} />
                                        </button>
                                    </div>
                                </div>

                                {/* Serial Numbers */}
                                {(() => {
                                    const qty = parseFloat(quantity || 0);
                                    const serialCount = Number.isInteger(qty) && qty > 0 && qty <= 50 ? qty : 0;
                                    if (serialCount === 0) return null;
                                    return (
                                        <div>
                                            <label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">
                                                Serial Numbers ({serialCount})
                                            </label>
                                            <div className="space-y-2">
                                                {Array.from({ length: serialCount }).map((_, idx) => (
                                                    <div key={idx} className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold text-slate-400 w-5 text-right">{idx + 1}</span>
                                                        <input
                                                            className="flex-1 h-9 border border-slate-200 rounded-lg px-3 text-sm font-bold text-slate-800 bg-white outline-none focus:border-brand-blue focus:ring-2 focus:ring-blue-100"
                                                            value={serialInputs[idx] || ''}
                                                            onChange={e => {
                                                                setSerialInputs(prev => {
                                                                    const updated = [...prev];
                                                                    updated[idx] = e.target.value;
                                                                    return updated;
                                                                });
                                                            }}
                                                            placeholder={`Serial #${idx + 1}`}
                                                        />
                                                        <button type="button"
                                                            onClick={() => { setScanTarget(`serial_${idx}`); setShowScanner(true); }}
                                                            className="h-9 w-9 flex-none bg-brand-blue text-white rounded-lg flex items-center justify-center hover:opacity-90 transition-colors"
                                                            title={`Scan Serial #${idx + 1}`}>
                                                            <Scan size={14} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            <div className="mt-5">
                                <Button onClick={handlePostGR} disabled={loading} className="w-full">
                                    {loading ? <><Loader size={20} className="animate-spin mr-2" />Posting...</> : <><CheckCircle size={20} className="mr-2" />Post GR</>}
                                </Button>
                            </div>
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
                                    {plant ? `Plant: ${plant}` : 'All plants'}{storageLocation ? ` • SLoc: ${storageLocation}` : ''}
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
                                    {materialOptions.map((opt, i) => (
                                        <button
                                            key={i}
                                            onClick={() => {
                                                setMaterial(opt.Material);
                                                if (!plant && opt.Plant) setPlant(opt.Plant);
                                                if (!storageLocation && opt.StorageLocation) setStorageLocation(opt.StorageLocation);
                                                setShowMaterialHelp(false);
                                            }}
                                            className="w-full text-left bg-white p-3 rounded-xl border border-gray-100 shadow-sm hover:border-brand-blue hover:shadow-md transition-all group"
                                        >
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="font-bold text-gray-800 group-hover:text-brand-blue transition-colors">{opt.Material.replace(/^0+/, '')}</span>
                                                <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{opt.Qty} {opt.MaterialBaseUnit}</span>
                                            </div>
                                            <p className="text-xs text-gray-500 line-clamp-1">{opt.MaterialDescription}</p>
                                            <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400 font-medium">
                                                <span className="flex items-center gap-1"><Factory size={10} /> {opt.Plant || 'N/A'}</span>
                                                <span className="flex items-center gap-1"><Package size={10} /> {opt.StorageLocation || 'N/A'}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => { setShowScanner(false); setScanTarget(null); }} />}
        </div>
    );
};

export default GoodsReceiptProduction;
