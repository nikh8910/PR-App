/**
 * @file CreateHU.jsx
 * @description Screen: Create Handling Unit (EWM Packing)
 *
 * Form screen to create a new empty EWM Handling Unit. The operator selects
 * a Warehouse and Packaging Material, provides a Storage Bin (required), and
 * optionally selects a Plant and Storage Location. On submit the HU is created
 * in SAP and the new HU external ID is displayed for confirmation.
 *
 * Supports barcode/QR scanning for Packaging Material and Storage Bin fields
 * via the BarcodeScanner component.
 *
 * SAP API: API_HANDLING_UNIT_SRV (createHandlingUnit)
 *
 * @route /warehouse-packing/create-hu
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Home, AlertCircle, X, CheckCircle, Package, Scan } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api, extractSapMessage } from '../../services/api';
import { useSwipeBack } from '../../hooks/useSwipeBack';
import BarcodeScanner from '../../components/BarcodeScanner';

import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';

const CreateHU = () => {
    const navigate = useNavigate();
    const { apiConfig } = useAuth();
    useSwipeBack(() => navigate(-1));

    const [warehouses, setWarehouses] = useState([]);
    const [selectedWarehouse, setSelectedWarehouse] = useState('');
    const [packagingMaterial, setPackagingMaterial] = useState('');
    const [selectedPlant, setSelectedPlant] = useState('20UK');
    const [plants, setPlants] = useState([]);
    const [storageLoc, setStorageLoc] = useState('');
    const [storageBin, setStorageBin] = useState('');

    // Storage Locations value help
    const [storageLocOptions, setStorageLocOptions] = useState([]);
    const [fetchingSLocs, setFetchingSLocs] = useState(false);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');
    const [createdHU, setCreatedHU] = useState(null);

    // Scanner
    const [showScanner, setShowScanner] = useState(false);
    const [scanTarget, setScanTarget] = useState('');

    // ──── Load warehouses ────
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

    // ──── Load plants ────
    useEffect(() => {
        (async () => {
            try {
                const res = await api.fetchPlantList(apiConfig);
                const plantList = res?.value || res?.d?.results || [];
                setPlants(plantList);
            } catch (err) { console.warn("Failed to fetch plants:", err); }
        })();
    }, [apiConfig]);

    // ──── Load Storage Locations when plant changes ────
    useEffect(() => {
        if (!selectedPlant) {
            setStorageLocOptions([]);
            return;
        }
        (async () => {
            setFetchingSLocs(true);
            try {
                const res = await api.fetchStorageLocationsByPlant(apiConfig, selectedPlant);
                const slocs = res?.d?.results || res?.value || res || [];
                setStorageLocOptions(slocs);
            } catch (err) {
                console.warn("Failed to fetch storage locations:", err);
                setStorageLocOptions([]);
            } finally { setFetchingSLocs(false); }
        })();
    }, [selectedPlant, apiConfig]);

    // ──── Scanner ────
    const openScanner = (target) => { setScanTarget(target); setShowScanner(true); };
    const handleScan = (code) => {
        setShowScanner(false);
        if (scanTarget === 'packmat') setPackagingMaterial(code);
        else if (scanTarget === 'bin') setStorageBin(code);
    };

    // ──── Handle Create ────
    const handleCreate = async (e) => {
        if (e) e.preventDefault();
        setError(null); setSuccessMsg(''); setCreatedHU(null);

        if (!selectedWarehouse) { setError("Select a warehouse."); return; }
        if (!packagingMaterial.trim()) { setError("Enter a packaging material."); return; }
        if (!storageBin.trim()) { setError("Enter a storage bin."); return; }

        setLoading(true);
        try {
            const payload = {
                Warehouse: selectedWarehouse,
                PackagingMaterial: packagingMaterial.trim(),
                StorageBin: storageBin.trim(),
            };
            if (selectedPlant) payload.Plant = selectedPlant;
            if (storageLoc.trim()) payload.StorageLocation = storageLoc.trim();

            console.log("Creating HU payload:", JSON.stringify(payload, null, 2));
            const result = await api.createHandlingUnit(apiConfig, payload);
            const huId = result?.HandlingUnitExternalID || result?.value?.[0]?.HandlingUnitExternalID || 'Created';
            setCreatedHU(huId);
            setSuccessMsg(`Handling Unit created successfully!`);
            setPackagingMaterial(''); setStorageBin('');
        } catch (err) {
            console.error("Create HU error:", err);
            setError(extractSapMessage(err));
        } finally { setLoading(false); }
    };

    const inputFieldStyle = "w-full border border-gray-300 rounded-lg p-3 text-sm bg-white focus:ring-2 focus:ring-brand-blue focus:border-brand-blue transition-colors";
    const scanFieldStyle = "relative flex items-center w-full border border-gray-300 rounded-lg bg-slate-50 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-blue overflow-hidden";

    return (
        <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
            <header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                <div className="flex justify-between items-center relative">
                    <button onClick={() => navigate(-1)} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" title="Back">
                                            <ArrowLeft size={20} className="text-white" />
                                        </button>
                    
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <h1 className="text-xl font-bold text-white tracking-wide">
                            Create HU
                        </h1>
                                                <p className="text-blue-200 text-[10px] font-medium uppercase tracking-wider mt-0.5">
                                                    New Handling Unit
                                                </p>
                    </div>

                    <button onClick={() => navigate('/menu', { replace: true })} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" title="Home">
                                            <Home size={20} className="text-white" />
                                        </button>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 content-area pb-8" style={{ zIndex: 10, position: 'relative' }}>
                <div className="max-w-md mx-auto">
                    {/* Error/Success messages - inline, above the form */}
                    {error && (
                        <div className="bg-red-50 border border-red-300 rounded-xl p-4 shadow-sm flex gap-3 items-start mt-4 mb-3">
                            <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={20} />
                            <p className="text-sm text-red-700 mt-0.5 flex-1 font-medium whitespace-pre-wrap">{error}</p>
                            <button onClick={() => setError(null)} className="p-1.5 hover:bg-red-100 rounded-md shrink-0"><X size={16} className="text-red-500" /></button>
                        </div>
                    )}
                    {successMsg && (
                        <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 shadow-sm flex gap-3 items-start mt-4 mb-3">
                            <CheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={20} />
                            <p className="text-sm text-emerald-700 mt-0.5 flex-1 font-medium">{successMsg}</p>
                            <button onClick={() => setSuccessMsg('')} className="p-1.5 hover:bg-emerald-100 rounded-md shrink-0"><X size={16} className="text-emerald-500" /></button>
                        </div>
                    )}

                    <div className="bg-white shadow-sm border border-slate-200 w-full p-4 md:rounded-xl mt-6">
                        <form onSubmit={handleCreate} className="flex flex-col gap-4">
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
                                    label={<>Pack. Material <span className="text-red-500">*</span></>}
                                    placeholder="Scan or type material"
                                    value={packagingMaterial}
                                    onChange={e => setPackagingMaterial(e.target.value.toUpperCase())}
                                    rightIcon={<button type="button" onClick={() => openScanner('packmat')} className="w-9 h-9 mr-1 p-0 flex items-center justify-center text-gray-400 hover:text-brand-blue rounded-md"><Scan size={16} /></button>}
                                    autoComplete="off"
                                    className="font-mono uppercase"
                                />
                            </div>

                            <div className="w-full">
                                <Input
                                    label={<>Storage Bin <span className="text-red-500">*</span></>}
                                    placeholder="Scan or type bin"
                                    value={storageBin}
                                    onChange={e => setStorageBin(e.target.value.toUpperCase())}
                                    rightIcon={<button type="button" onClick={() => openScanner('bin')} className="w-9 h-9 mr-1 p-0 flex items-center justify-center text-gray-400 hover:text-brand-blue rounded-md"><Scan size={16} /></button>}
                                    autoComplete="off"
                                    className="font-mono uppercase"
                                />
                            </div>

                            <div className="w-full">
                                <Select
                                    label={<>Plant <span className="text-gray-400 text-[9px]">(optional)</span></>}
                                    value={selectedPlant}
                                    onChange={e => { setSelectedPlant(e.target.value); setStorageLoc(''); }}
                                    options={[
                                        { value: '', label: 'None' },
                                        ...plants.map(p => ({
                                            value: p.Plant,
                                            label: p.PlantName ? `${p.Plant} - ${p.PlantName}` : p.Plant
                                        }))
                                    ]}
                                />
                            </div>

                            <div className="w-full">
                                <Select
                                    label={<>Storage Location <span className="text-gray-400 text-[9px]">(optional)</span></>}
                                    value={storageLoc}
                                    onChange={e => setStorageLoc(e.target.value)}
                                    disabled={!selectedPlant || fetchingSLocs}
                                    options={[
                                        { value: '', label: fetchingSLocs ? 'Loading...' : selectedPlant ? 'Select Storage Location' : 'Select a Plant first' },
                                        ...storageLocOptions.map(sl => ({
                                            value: sl.StorageLocation,
                                            label: sl.StorageLocationName ? `${sl.StorageLocation} - ${sl.StorageLocationName}` : sl.StorageLocation
                                        }))
                                    ]}
                                />
                            </div>

                            <div className="w-full mt-2">
                                <Button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full py-3.5"
                                >
                                    {loading ? (
                                        <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Creating...</>
                                    ) : (
                                        <><Package size={16} /> Create Handling Unit</>
                                    )}
                                </Button>
                            </div>
                        </form>
                    </div>

                    {/* Created HU Result */}
                    {createdHU && (
                        <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                            <Package size={32} className="text-emerald-500 mx-auto mb-2" />
                            <p className="text-sm font-bold text-emerald-800">HU Created</p>
                            <p className="text-2xl font-mono font-extrabold text-brand-blue mt-1">{createdHU}</p>
                            <p className="text-xs text-gray-400 mt-2">You can now pack products into this HU</p>
                        </div>
                    )}
                </div>
            </div>

            {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
        </div>
    );
};

export default CreateHU;
