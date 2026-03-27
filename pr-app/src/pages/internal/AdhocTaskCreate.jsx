import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Home, Search, Scan, AlertCircle, X, CheckCircle, ArrowRight, Loader, Package, Box, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api, getHeaders } from '../../services/api';
import BarcodeScanner from '../../components/BarcodeScanner';
import { useSwipeBack } from '../../hooks/useSwipeBack';

// Extracted as a proper component so React hooks (useRef, useState, useCallback, useEffect) are valid
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
const BinDropdownInput = ({ label, value, setValue, isOpen, setIsOpen, filteredOptions, scanKey, isFetching, openScanner, scanFieldStyle }) => {
    const inputRef = useRef(null);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0, flipUp: false });

    const updatePosition = useCallback(() => {
        if (inputRef.current) {
            const rect = inputRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const flipUp = spaceBelow < 200;
            setDropdownPos({
                top: flipUp ? rect.top - 4 : rect.bottom + 4,
                left: rect.left,
                width: rect.width,
                flipUp
            });
        }
    }, []);

    // Recalculate position whenever dropdown opens or options change
    useEffect(() => {
        if (isOpen) updatePosition();
    }, [isOpen, filteredOptions, updatePosition]);

    const handleFocus = () => { updatePosition(); setIsOpen(true); };

    return (
        <div className="flex-1" ref={inputRef}>
            <div className="relative">
                <Input
                    label={`${label} *`}
                    placeholder={label}
                    value={value}
                    onChange={e => setValue(e.target.value.toUpperCase())}
                    onFocus={handleFocus}
                    onBlur={() => setTimeout(() => setIsOpen(false), 200)}
                    autoComplete="off"
                    rightIcon={
                        <button type="button" onClick={() => openScanner(scanKey)} className="p-1 text-gray-400 hover:text-brand-blue">
                            <Scan size={16} />
                        </button>
                    }
                />
                {isOpen && ReactDOM.createPortal(
                    <div style={{
                        position: 'fixed',
                        ...(dropdownPos.flipUp
                            ? { bottom: window.innerHeight - dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }
                            : { top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }),
                        zIndex: 99999
                    }}
                        className="bg-white border border-gray-200 rounded-lg shadow-2xl max-h-48 overflow-y-auto">
                        {isFetching ? (
                            <div className="p-3 text-sm text-gray-500 text-center flex items-center justify-center gap-2">
                                <Loader size={14} className="animate-spin" /> Loading...
                            </div>
                        ) : filteredOptions.length === 0 ? (
                            <div className="p-3 text-sm text-gray-500 text-center">No bins found. Type or scan a bin ID.</div>
                        ) : (
                            <div className="py-1">
                                {filteredOptions.map((b, i) => {
                                    const binId = b.EWMStorageBin || b.WarehouseStorageBin || '';
                                    return (
                                        <div key={binId + '-' + i}
                                            className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b last:border-0 border-gray-100 text-left transition-colors"
                                            onMouseDown={(e) => { e.preventDefault(); setValue(binId); setIsOpen(false); }}>
                                            <div className="font-semibold text-gray-800 text-sm font-mono">{binId}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>,
                    document.body
                )}
            </div>
        </div>
    );
};

const AdhocTaskCreate = () => {
    const navigate = useNavigate();
    const { apiConfig } = useAuth();
    useSwipeBack(() => navigate(-1));

    // Core selections
    const [warehouses, setWarehouses] = useState([]);
    const [selectedWarehouse, setSelectedWarehouse] = useState('');
    const [taskType, setTaskType] = useState('Product'); // Product or HU

    // Product fields
    const [productValue, setProductValue] = useState('');
    const [quantity, setQuantity] = useState('');
    const [unit, setUnit] = useState('EA');
    const [stockType, setStockType] = useState('F');
    const [selectedPlant, setSelectedPlant] = useState('20UK');

    // HU fields
    const [huValue, setHuValue] = useState('');

    // Storage type & bin — separate for source and destination
    const [srcStorageType, setSrcStorageType] = useState('');
    const [srcBin, setSrcBin] = useState('');
    const [dstStorageType, setDstStorageType] = useState('');
    const [dstBin, setDstBin] = useState('');

    // Optional HU fields (Product task)
    const [srcHU, setSrcHU] = useState('');
    const [dstHU, setDstHU] = useState('');

    // Process type
    const processTypeOptions = [
        { code: 'S012', text: 'Putaway (Distributive)' },
        { code: 'S110', text: 'Putaway' },
        { code: 'S115', text: 'Putaway from Production' },
        { code: 'S116', text: 'Putaway w/o Auto WT' },
        { code: 'S117', text: 'Putaway w Auto WT' },
        { code: 'S126', text: 'HU Putaway w/o Auto WT' },
        { code: 'S127', text: 'HU Putaway w Auto WT' },
        { code: 'S201', text: 'Stock Removal for Production Supply' },
        { code: 'S210', text: 'Picking' },
        { code: 'S220', text: 'Staging for Production (Single Order)' },
        { code: 'S310', text: 'Replenishment' },
        { code: 'S320', text: 'Staging for Production (Cross Order)' },
        { code: 'S325', text: 'Reverse Staging for Production' },
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
    const [processType, setProcessType] = useState('S400');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');
    const [showScanner, setShowScanner] = useState(false);
    const [scanTarget, setScanTarget] = useState('');

    // Value help data
    const [productDropdownOptions, setProductDropdownOptions] = useState([]);
    const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
    const [fetchingProductDropdown, setFetchingProductDropdown] = useState(false);

    const [huDropdownOptions, setHuDropdownOptions] = useState([]);
    const [isHuDropdownOpen, setIsHuDropdownOpen] = useState(false);
    const [fetchingHuDropdown, setFetchingHuDropdown] = useState(false);

    const [storageTypes, setStorageTypes] = useState([]);
    const [fetchingTypes, setFetchingTypes] = useState(false);

    const [srcBins, setSrcBins] = useState([]);
    const [dstBins, setDstBins] = useState([]);
    const [fetchingSrcBins, setFetchingSrcBins] = useState(false);
    const [fetchingDstBins, setFetchingDstBins] = useState(false);
    const [isSrcBinOpen, setIsSrcBinOpen] = useState(false);
    const [isDstBinOpen, setIsDstBinOpen] = useState(false);

    // Plants for stock owner derivation
    const [plants, setPlants] = useState([]);

    // Product stock bins (for filtering source bins to only those with product)
    const [productStockBins, setProductStockBins] = useState([]);

    // Source HU value help
    const [srcHUOptions, setSrcHUOptions] = useState([]);
    const [fetchingSrcHU, setFetchingSrcHU] = useState(false);
    const [isSrcHUOpen, setIsSrcHUOpen] = useState(false);
    const srcHUInputRef = useRef(null);
    const [srcHUDropdownPos, setSrcHUDropdownPos] = useState({ top: 0, left: 0, width: 0, flipUp: false });

    // Portal dropdown refs for Product + HU
    const productInputRef = useRef(null);
    const huInputRef = useRef(null);
    const [productDropdownPos, setProductDropdownPos] = useState({ top: 0, left: 0, width: 0 });
    const [huDropdownPos, setHuDropdownPos] = useState({ top: 0, left: 0, width: 0 });

    const updatePortalPos = useCallback((ref, setter) => {
        if (ref.current) {
            const rect = ref.current.getBoundingClientRect();
            setter({ top: rect.bottom + 4, left: rect.left, width: rect.width });
        }
    }, []);

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

    // ──── Load storage types when warehouse changes ────
    useEffect(() => {
        if (!selectedWarehouse) return;
        (async () => {
            setFetchingTypes(true);
            try {
                const res = await api.fetchStorageTypes(apiConfig, selectedWarehouse);
                setStorageTypes(res?.value || []);
            } catch (err) { console.error("Failed to fetch storage types:", err); }
            finally { setFetchingTypes(false); }
        })();
        // Reset storage type & bin selections
        setSrcStorageType(''); setSrcBin(''); setSrcBins([]);
        setDstStorageType(''); setDstBin(''); setDstBins([]);
    }, [apiConfig, selectedWarehouse]);

    // ──── Load source bins when source storage type changes ────
    useEffect(() => {
        if (!selectedWarehouse || !srcStorageType) { setSrcBins([]); return; }
        (async () => {
            setFetchingSrcBins(true);
            try {
                const res = await api.fetchStorageBins(apiConfig, selectedWarehouse, srcStorageType);
                let allBins = res?.value || [];
                let bins = allBins;
                // If product is set, try to filter to bins where product has stock
                if (taskType === 'Product' && productValue.trim() && productStockBins.length > 0) {
                    const stockBinSet = new Set(
                        productStockBins
                            .filter(sb => !sb.storageType || sb.storageType === srcStorageType)
                            .map(sb => sb.bin)
                    );
                    const filtered = allBins.filter(b => {
                        const binId = b.EWMStorageBin || b.WarehouseStorageBin || '';
                        return stockBinSet.has(binId);
                    });
                    // Only use filtered list if it found matches, otherwise show all bins
                    if (filtered.length > 0) bins = filtered;
                }
                setSrcBins(bins);
            } catch (err) { console.error("Failed to fetch source bins:", err); }
            finally { setFetchingSrcBins(false); }
        })();
        setSrcBin('');
    }, [apiConfig, selectedWarehouse, srcStorageType, productStockBins]);

    // ──── Load dest bins when dest storage type changes ────
    useEffect(() => {
        if (!selectedWarehouse || !dstStorageType) { setDstBins([]); return; }
        (async () => {
            setFetchingDstBins(true);
            try {
                const res = await api.fetchStorageBins(apiConfig, selectedWarehouse, dstStorageType);
                setDstBins(res?.value || []);
            } catch (err) { console.error("Failed to fetch dest bins:", err); }
            finally { setFetchingDstBins(false); }
        })();
        setDstBin('');
    }, [apiConfig, selectedWarehouse, dstStorageType]);

    // ──── Fetch products for value help ────
    useEffect(() => {
        if (taskType !== 'Product') return;
        (async () => {
            setFetchingProductDropdown(true);
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
                    setProductDropdownOptions(Array.from(seen.values()));
                }
            } catch (err) { console.error("Failed to fetch product dropdown:", err); }
            finally { setFetchingProductDropdown(false); }
        })();
    }, [apiConfig, taskType]);

    // ──── Fetch HUs when HU task type selected ────
    useEffect(() => {
        if (taskType !== 'HU' || !selectedWarehouse) return;
        (async () => {
            setFetchingHuDropdown(true);
            try {
                const res = await api.fetchHandlingUnits(apiConfig, { warehouse: selectedWarehouse });
                if (res?.value) setHuDropdownOptions(res.value);
            } catch (err) { console.error("Failed to fetch HU dropdown:", err); }
            finally { setFetchingHuDropdown(false); }
        })();
    }, [apiConfig, selectedWarehouse, taskType]);

    // ──── Fetch product stock bins (for source bin filtering) ────
    useEffect(() => {
        if (taskType !== 'Product' || !selectedWarehouse || !productValue.trim()) {
            setProductStockBins([]);
            return;
        }
        const timer = setTimeout(async () => {
            try {
                const res = await api.fetchWarehouseProducts(apiConfig, selectedWarehouse);
                const stocks = res?.value || [];
                const prodUpper = productValue.trim().toUpperCase();
                const binEntries = stocks
                    .filter(s => (s.Product || '').trim().toUpperCase() === prodUpper && s.EWMStorageBin)
                    .map(s => ({ bin: s.EWMStorageBin.trim(), storageType: (s.EWMStorageType || '').trim() }));
                // Deduplicate by bin+storageType
                const seen = new Set();
                const unique = binEntries.filter(e => {
                    const key = `${e.bin}|${e.storageType}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
                setProductStockBins(unique);
                console.log(`Product ${prodUpper} found in bins:`, unique);
            } catch (err) { console.error("Failed to fetch product stock:", err); }
        }, 500); // debounce
        return () => clearTimeout(timer);
    }, [apiConfig, selectedWarehouse, taskType, productValue]);

    // ──── Fetch plants for stock owner derivation ────
    useEffect(() => {
        if (taskType !== 'Product') return;
        (async () => {
            try {
                const res = await api.fetchPlantList(apiConfig);
                const plantList = res?.value || res?.d?.results || [];
                setPlants(plantList);
                if (plantList.length > 0 && !selectedPlant) {
                    const ukPlant = plantList.find(p => p.Plant === '20UK');
                    setSelectedPlant(ukPlant ? '20UK' : plantList[0].Plant || '');
                }
            } catch (err) { console.error("Failed to fetch plants:", err); }
        })();
    }, [apiConfig, taskType]);

    // ──── Fetch Source HU options when source bin changes ────
    useEffect(() => {
        if (taskType !== 'Product' || !selectedWarehouse || !srcBin.trim()) {
            setSrcHUOptions([]); return;
        }
        (async () => {
            setFetchingSrcHU(true);
            try {
                const res = await api.fetchHandlingUnits(apiConfig, {
                    warehouse: selectedWarehouse,
                    storageBin: srcBin.trim()
                });
                setSrcHUOptions(res?.value || []);
            } catch (err) {
                console.error("Failed to fetch source HUs:", err);
                setSrcHUOptions([]);
            } finally { setFetchingSrcHU(false); }
        })();
    }, [apiConfig, selectedWarehouse, srcBin, taskType]);

    // ──── Derive BP from selected plant ────
    const deriveBP = () => {
        const plant = plants.find(p => p.Plant === selectedPlant);
        if (!plant) return '';
        return (plant.PlantCustomer || plant.PlantSupplier || '').trim();
    };


    // ──── Filtered lists ────
    const filteredProductOptions = productDropdownOptions.filter(opt => {
        if (!productValue) return true;
        const upper = productValue.toUpperCase();
        return (opt.Product && opt.Product.toUpperCase().includes(upper)) ||
            (opt.ProductStandardID && opt.ProductStandardID.includes(upper));
    });

    const filteredHuOptions = huDropdownOptions.filter(opt => {
        if (!huValue) return true;
        return opt.HandlingUnitExternalID && opt.HandlingUnitExternalID.toUpperCase().includes(huValue.toUpperCase());
    });

    const filteredSrcBins = useMemo(() => {
        const q = srcBin.toUpperCase();
        return srcBins.filter(b => {
            const binId = (b.EWMStorageBin || b.WarehouseStorageBin || '').toUpperCase();
            return !q || binId.includes(q);
        }).slice(0, 30);
    }, [srcBins, srcBin]);

    const filteredDstBins = useMemo(() => {
        const q = dstBin.toUpperCase();
        return dstBins.filter(b => {
            const binId = (b.EWMStorageBin || b.WarehouseStorageBin || '').toUpperCase();
            return !q || binId.includes(q);
        }).slice(0, 30);
    }, [dstBins, dstBin]);

    // ──── Helpers ────
    const extractGTIN = (scanned) => {
        const gs1Match = scanned.match(/(?:\(01\)|^01)(\d{14})/);
        if (gs1Match) return gs1Match[1];
        if (/^\d{8,14}$/.test(scanned)) return scanned;
        return null;
    };

    const handleScan = (code) => {
        setShowScanner(false);
        if (scanTarget === 'product') setProductValue(code);
        else if (scanTarget === 'hu') setHuValue(code);
        else if (scanTarget === 'source') setSrcBin(code);
        else if (scanTarget === 'dest') setDstBin(code);
        else if (scanTarget === 'srcHU') setSrcHU(code);
        else if (scanTarget === 'dstHU') setDstHU(code);
    };

    const openScanner = (target) => { setScanTarget(target); setShowScanner(true); };

    // ──── Submit ────
    const handleCreate = async (e) => {
        if (e) e.preventDefault();
        setError(null); setSuccessMsg('');

        if (!selectedWarehouse) { setError("Select a warehouse."); return; }

        if (taskType === 'Product') {
            if (!productValue.trim()) { setError("Enter a product."); return; }
            if (!quantity || parseFloat(quantity) <= 0) { setError("Enter a valid quantity."); return; }
            if (!srcStorageType) { setError("Select source storage type."); return; }
            if (!srcBin.trim()) { setError("Enter source bin."); return; }
            if (!dstStorageType) { setError("Select destination storage type."); return; }
            if (!dstBin.trim()) { setError("Enter destination bin."); return; }
        } else {
            if (!huValue.trim()) { setError("Enter a Handling Unit."); return; }
            if (!dstStorageType) { setError("Select destination storage type."); return; }
            if (!dstBin.trim()) { setError("Enter destination bin."); return; }
        }

        setLoading(true);
        try {
            let productId = productValue.trim();

            // Resolve GTIN if product task
            if (taskType === 'Product') {
                const gtinCandidate = extractGTIN(productId);
                if (gtinCandidate) {
                    const eanResult = await api.fetchProductByGTIN(apiConfig, gtinCandidate);
                    if (eanResult?.Product) productId = eanResult.Product.trim();
                    else { setError(`No product found for GTIN "${gtinCandidate}".`); setLoading(false); return; }
                }
            }

            if (taskType === 'Product') {
                // Exact SAP documented field order for ad hoc product WT
                const bp = deriveBP();
                const payload = {
                    EWMWarehouse: selectedWarehouse,
                    WarehouseProcessType: processType,
                    Product: productId,
                    Batch: '',
                    TargetQuantityInAltvUnit: parseFloat(quantity),
                    AlternativeUnit: unit,
                    EWMStockType: stockType,
                    EntitledToDisposeParty: bp || '',
                    EWMStockOwner: bp || '',
                    SourceStorageType: srcStorageType,
                    SourceStorageBin: srcBin.trim(),
                    DestinationStorageType: dstStorageType,
                    DestinationStorageBin: dstBin.trim(),
                };
                if (srcHU.trim()) payload.SourceHandlingUnit = srcHU.trim();
                if (dstHU.trim()) payload.DestinationHandlingUnit = dstHU.trim();

                console.log("Creating adhoc Product WT:", JSON.stringify(payload, null, 2));
                await api.createWarehouseTask(apiConfig, payload);
            } else {
                // Exact SAP documented field order for ad hoc HU WT
                const payload = {
                    EWMWarehouse: selectedWarehouse,
                    WarehouseProcessType: processType,
                    SourceHandlingUnit: huValue.trim(),
                    DestinationStorageType: dstStorageType,
                    DestinationStorageBin: dstBin.trim(),
                };

                console.log("Creating adhoc HU WT:", JSON.stringify(payload, null, 2));
                await api.createWarehouseTask(apiConfig, payload);
            }
            setSuccessMsg(`Warehouse Task created successfully!`);
            setProductValue(''); setHuValue(''); setQuantity('');
            setSrcBin(''); setDstBin(''); setSrcHU(''); setDstHU('');
        } catch (err) {
            setError("Failed to create task: " + err.message);
        } finally { setLoading(false); }
    };

    // ──── Styles ────
    const inputFieldStyle = "w-full border border-gray-300 rounded-lg p-3 text-sm bg-white focus:ring-2 focus:ring-brand-blue focus:border-brand-blue transition-colors";
    const scanFieldStyle = "relative flex items-center w-full border border-gray-300 rounded-lg bg-slate-50 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-blue overflow-hidden";
    const selectWrap = "relative";
    const selectChevron = (
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
        </div>
    );

    // ──── Reusable components ────
    const renderStorageTypeSelect = (label, value, setValue, required = true) => {
        const options = [
            { value: '', label: 'Select Type' },
            ...storageTypes.map(st => ({
                value: st.EWMStorageType,
                label: `${st.EWMStorageType}${st.EWMStorageTypeName ? ` - ${st.EWMStorageTypeName}` : ''}`
            }))
        ];
        return (
            <div className="flex-1">
                <Select
                    label={`${label}${required ? ' *' : ''}`}
                    options={options}
                    value={value}
                    onChange={e => setValue(e.target.value)}
                />
            </div>
        );
    };

    const filteredSrcHUOptions = useMemo(() => {
        const q = srcHU.toUpperCase();
        return srcHUOptions.filter(opt => {
            const huId = (opt.HandlingUnitExternalID || '').toUpperCase();
            return !q || huId.includes(q);
        }).slice(0, 30);
    }, [srcHUOptions, srcHU]);

    const updateSrcHUPosition = useCallback(() => {
        if (srcHUInputRef.current) {
            const rect = srcHUInputRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const flipUp = spaceBelow < 200;
            setSrcHUDropdownPos({
                top: flipUp ? rect.top - 4 : rect.bottom + 4,
                left: rect.left,
                width: rect.width,
                flipUp
            });
        }
    }, []);

    const renderSourceHUInput = () => (
        <div className="flex-1 pt-1" ref={srcHUInputRef}>
            <div className="relative">
                <Input
                    label="Source HU (optional)"
                    placeholder="Scan HU"
                    value={srcHU}
                    onChange={e => setSrcHU(e.target.value.toUpperCase())}
                    onFocus={() => { updateSrcHUPosition(); setIsSrcHUOpen(true); }}
                    onBlur={() => setTimeout(() => setIsSrcHUOpen(false), 200)}
                    autoComplete="off"
                    rightIcon={
                        <button type="button" onClick={() => openScanner('srcHU')} className="p-1 text-gray-400 hover:text-brand-blue">
                            <Scan size={16} />
                        </button>
                    }
                />
                {isSrcHUOpen && ReactDOM.createPortal(
                    <div style={{
                        position: 'fixed',
                        ...(srcHUDropdownPos.flipUp
                            ? { bottom: window.innerHeight - srcHUDropdownPos.top, left: srcHUDropdownPos.left, width: srcHUDropdownPos.width }
                            : { top: srcHUDropdownPos.top, left: srcHUDropdownPos.left, width: srcHUDropdownPos.width }),
                        zIndex: 99999
                    }}
                        className="bg-white border border-gray-200 rounded-lg shadow-2xl max-h-48 overflow-y-auto">
                        {fetchingSrcHU ? (
                            <div className="p-3 text-sm text-gray-500 text-center flex items-center justify-center gap-2">
                                <Loader size={14} className="animate-spin" /> Loading HUs...
                            </div>
                        ) : !srcBin.trim() ? (
                            <div className="p-3 text-sm text-gray-500 text-center">Select a source bin first.</div>
                        ) : filteredSrcHUOptions.length === 0 ? (
                            <div className="p-3 text-sm text-gray-500 text-center">No HUs in this bin. Type or scan.</div>
                        ) : (
                            <div className="py-1">
                                {filteredSrcHUOptions.map((opt, i) => (
                                    <div key={opt.HandlingUnitExternalID + '-' + i}
                                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b last:border-0 border-gray-100 text-left transition-colors"
                                        onMouseDown={(e) => { e.preventDefault(); setSrcHU(opt.HandlingUnitExternalID); setIsSrcHUOpen(false); }}>
                                        <div className="font-semibold text-gray-800 text-sm font-mono">{opt.HandlingUnitExternalID}</div>
                                        {opt.PackagingMaterial && <div className="text-[11px] text-gray-500 mt-0.5">Pkg: {opt.PackagingMaterial}</div>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>,
                    document.body
                )}
            </div>
        </div>
    );


    const renderOptionalHUInput = (label, value, setValue, scanKey) => (
        <div className="flex-1 mt-1">
            <Input
                label={`${label} (optional)`}
                placeholder="Scan HU"
                value={value}
                onChange={e => setValue(e.target.value.toUpperCase())}
                autoComplete="off"
                rightIcon={
                    <button type="button" onClick={() => openScanner(scanKey)} className="p-1 text-gray-400 hover:text-brand-blue">
                        <Scan size={16} />
                    </button>
                }
            />
        </div>
    );

    return (
        <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
            {/* Header */}
            <header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="w-10 h-10 p-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" title="Back">
                        <ArrowLeft size={22} className="text-white" />
                    </button>
                    <div className="flex flex-col flex-1 min-w-0">
                        <h1 className="text-xl font-bold text-white tracking-wide truncate">Create Warehouse Task</h1>
                        <p className="text-blue-200 text-xs font-medium tracking-wider mt-0.5 truncate">{selectedWarehouse ? `Whse: ${selectedWarehouse}` : 'Select Warehouse'} • {taskType} Task</p>
                    </div>
                    <button onClick={() => navigate('/menu', { replace: true })} className="w-10 h-10 p-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" title="Home">
                        <Home size={22} className="text-white" />
                    </button>
                </div>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 content-area pb-8">
                <div className="max-w-md mx-auto flex flex-col gap-3">
                    {/* Messages */}
                    {error && (
                        <div className="flex items-center gap-2 bg-red-50 text-red-700 p-3 rounded-lg border border-red-200">
                            <AlertCircle size={16} /> <span className="text-sm flex-1">{error}</span>
                            <button onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
                        </div>
                    )}
                    {successMsg && (
                        <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 p-3 rounded-lg border border-emerald-200">
                            <CheckCircle size={16} /> <span className="text-sm font-bold flex-1">{successMsg}</span>
                            <button onClick={() => setSuccessMsg('')} className="ml-auto"><X size={14} /></button>
                        </div>
                    )}

                    {/* ─── Card 1: Warehouse + Task Type + Process ─── */}
                    <div className="glass-card" style={{ padding: '1rem', borderRadius: '1rem', border: '1px solid #e2e8f0' }}>
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Task Settings</h3>

                        {/* Warehouse */}
                        <div className="mb-4">
                            <Select
                                label="Warehouse *"
                                value={selectedWarehouse}
                                onChange={e => setSelectedWarehouse(e.target.value)}
                                options={[
                                    { value: '', label: 'Select Warehouse', disabled: true },
                                    ...warehouses.map(w => ({ value: w.EWMWarehouse, label: `${w.EWMWarehouse} - ${w.EWMWarehouse_Text || w.EWMWarehouse}` }))
                                ]}
                                required
                            />
                        </div>

                        {/* Task Type Toggle */}
                        <div className="mb-3">
                            <label className="block text-xs font-bold text-slate-500 mb-2">Task Type</label>
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setTaskType('Product')}
                                    className={`flex-1 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all border ${taskType === 'Product' ? 'bg-brand-blue text-white border-brand-blue shadow-md' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                                    <Package size={16} /> Product WT
                                </button>
                                <button type="button" onClick={() => setTaskType('HU')}
                                    className={`flex-1 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all border ${taskType === 'HU' ? 'bg-brand-blue text-white border-brand-blue shadow-md' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                                    <Box size={16} /> HU WT
                                </button>
                            </div>
                        </div>

                        {/* Process Type */}
                        <div className="mb-2">
                            <Select
                                label="Process Type *"
                                value={processType}
                                onChange={e => setProcessType(e.target.value)}
                                options={processTypeOptions.map(pt => ({ value: pt.code, label: `${pt.code} - ${pt.text}` }))}
                            />
                        </div>
                    </div>

                    {/* ─── Card 2: Product / HU Input ─── */}
                    <div className="glass-card" style={{ padding: '1rem', borderRadius: '1rem', border: '1px solid #e2e8f0' }}>
                        {taskType === 'Product' ? (
                            <>
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Product Details</h3>

                                {/* Product / GTIN */}
                                <div className="mb-4" ref={productInputRef}>
                                    <Input
                                        label="Product / GTIN *"
                                        placeholder="Scan GTIN or type Product ID"
                                        value={productValue}
                                        onChange={e => setProductValue(e.target.value.toUpperCase())}
                                        onFocus={() => { updatePortalPos(productInputRef, setProductDropdownPos); setIsProductDropdownOpen(true); }}
                                        onBlur={() => setTimeout(() => setIsProductDropdownOpen(false), 200)}
                                        autoComplete="off"
                                        rightIcon={
                                            <button type="button" onClick={() => openScanner('product')} className="p-1 px-2 text-brand-blue">
                                                <Scan size={20} />
                                            </button>
                                        }
                                    />
                                    {/* Portal Dropdown */}
                                    {isProductDropdownOpen && ReactDOM.createPortal(
                                        <div style={{
                                            position: 'fixed', top: productDropdownPos.top, left: productDropdownPos.left, width: productDropdownPos.width,
                                            zIndex: 99999, maxHeight: '240px', overflowY: 'auto',
                                            backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0.5rem',
                                            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
                                        }}>
                                            {fetchingProductDropdown ? (
                                                <div className="p-3 text-sm text-slate-500 text-center flex items-center justify-center gap-2"><Loader size={14} className="animate-spin" /> Loading...</div>
                                            ) : filteredProductOptions.length === 0 ? (
                                                <div className="p-3 text-sm text-slate-500 text-center">No products found. Type an ID or scan GTIN.</div>
                                            ) : (
                                                <div className="py-1">
                                                    {filteredProductOptions.map((opt, i) => (
                                                        <div key={opt.Product + '-' + i}
                                                            className="px-3 py-2.5 hover:bg-blue-50 cursor-pointer border-b last:border-0 border-slate-100 text-left transition-colors"
                                                            onMouseDown={(e) => { e.preventDefault(); setProductValue(opt.Product); setIsProductDropdownOpen(false); }}>
                                                            <div className="font-semibold text-slate-800 text-sm">{opt.Product}</div>
                                                            {opt.ProductStandardID && <div className="text-[11px] text-slate-500 mt-0.5">GTIN: {opt.ProductStandardID}</div>}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>,
                                        document.body
                                    )}
                                </div>

                                {/* Quantity + Unit */}
                                <div className="flex gap-3 mb-4">
                                    <div className="flex-1">
                                        <Input type="number" step="0.001" label="Quantity *" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0" />
                                    </div>
                                    <div className="w-24">
                                        <Input label="Unit" value={unit} onChange={e => setUnit(e.target.value.toUpperCase())} />
                                    </div>
                                </div>

                                {/* Stock Type + Plant/Owner */}
                                <div className="flex gap-3 mb-2">
                                    <div className="w-28">
                                        <Input label="Stock Type" value={stockType} onChange={e => setStockType(e.target.value.toUpperCase())} placeholder="F" />
                                    </div>
                                    <div className="flex-1">
                                        <Select
                                            label="Plant / Owner"
                                            value={selectedPlant}
                                            onChange={e => setSelectedPlant(e.target.value)}
                                            options={[
                                                { value: '', label: 'Select Plant' },
                                                ...plants.map(p => ({ value: p.Plant, label: `${p.Plant}${p.PlantName ? ` - ${p.PlantName}` : ''}` }))
                                            ]}
                                        />
                                        {selectedPlant && deriveBP() && (
                                            <p className="text-[10px] text-slate-500 mt-1 px-1">BP: {deriveBP()}</p>
                                        )}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Handling Unit</h3>

                                {/* HU Input */}
                                <div className="mb-2" ref={huInputRef}>
                                    <Input
                                        label="Source Handling Unit *"
                                        placeholder="Scan or type HU"
                                        value={huValue}
                                        onChange={e => setHuValue(e.target.value.toUpperCase())}
                                        onFocus={() => { updatePortalPos(huInputRef, setHuDropdownPos); setIsHuDropdownOpen(true); }}
                                        onBlur={() => setTimeout(() => setIsHuDropdownOpen(false), 200)}
                                        autoComplete="off"
                                        rightIcon={
                                            <button type="button" onClick={() => openScanner('hu')} className="p-1 px-2 text-brand-blue">
                                                <Scan size={20} />
                                            </button>
                                        }
                                    />
                                    {/* Portal Dropdown */}
                                    {isHuDropdownOpen && ReactDOM.createPortal(
                                        <div style={{
                                            position: 'fixed', top: huDropdownPos.top, left: huDropdownPos.left, width: huDropdownPos.width,
                                            zIndex: 99999, maxHeight: '240px', overflowY: 'auto',
                                            backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0.5rem',
                                            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
                                        }}>
                                            {fetchingHuDropdown ? (
                                                <div className="p-3 text-sm text-slate-500 text-center flex items-center justify-center gap-2"><Loader size={14} className="animate-spin" /> Loading...</div>
                                            ) : filteredHuOptions.length === 0 ? (
                                                <div className="p-3 text-sm text-slate-500 text-center">No HUs found. Type an HU ID.</div>
                                            ) : (
                                                <div className="py-1">
                                                    {filteredHuOptions.map((opt, i) => (
                                                        <div key={opt.HandlingUnitExternalID + '-' + i}
                                                            className="px-3 py-2.5 hover:bg-blue-50 cursor-pointer border-b last:border-0 border-slate-100 text-left transition-colors"
                                                            onMouseDown={(e) => { e.preventDefault(); setHuValue(opt.HandlingUnitExternalID); setIsHuDropdownOpen(false); }}>
                                                            <div className="font-semibold text-slate-800 text-sm font-mono">{opt.HandlingUnitExternalID}</div>
                                                            {opt.PackagingMaterial && <div className="text-[11px] text-slate-500 mt-0.5">Pkg: {opt.PackagingMaterial}</div>}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>,
                                        document.body
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    {/* ─── Card 3: Source (Product only) ─── */}
                    {taskType === 'Product' && (
                        <div className="glass-card" style={{ padding: '1rem', borderRadius: '1rem', border: '1px solid #e2e8f0' }}>
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Source</h3>

                            <div className="mb-3">
                                {renderStorageTypeSelect('Storage Type', srcStorageType, setSrcStorageType)}
                            </div>
                            {srcStorageType && (
                                <div className="mb-3">
                                    <BinDropdownInput label="Storage Bin" value={srcBin} setValue={setSrcBin} isOpen={isSrcBinOpen} setIsOpen={setIsSrcBinOpen} filteredOptions={filteredSrcBins} scanKey="source" isFetching={fetchingSrcBins} openScanner={openScanner} scanFieldStyle={scanFieldStyle} />
                                </div>
                            )}

                            {/* Optional: Source HU */}
                            <div className="border-t border-slate-100 pt-3">
                                {renderSourceHUInput()}
                            </div>
                        </div>
                    )}

                    {/* ─── Card 4: Destination ─── */}
                    <div className="glass-card" style={{ padding: '1rem', borderRadius: '1rem', border: '1px solid #e2e8f0' }}>
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Destination</h3>

                        <div className="mb-3">
                            {renderStorageTypeSelect('Storage Type', dstStorageType, setDstStorageType)}
                        </div>
                        {dstStorageType && (
                            <div className="mb-3">
                                <BinDropdownInput label="Storage Bin" value={dstBin} setValue={setDstBin} isOpen={isDstBinOpen} setIsOpen={setIsDstBinOpen} filteredOptions={filteredDstBins} scanKey="dest" isFetching={fetchingDstBins} openScanner={openScanner} scanFieldStyle={scanFieldStyle} />
                            </div>
                        )}

                        {/* Optional: Dest HU (Product only) */}
                        {taskType === 'Product' && (
                            <div className="border-t border-slate-100 pt-3">
                                {renderOptionalHUInput('Dest. HU', dstHU, setDstHU, 'dstHU')}
                            </div>
                        )}
                    </div>

                    {/* ─── Create Button ─── */}
                    <Button onClick={handleCreate} disabled={loading} className="w-full mt-1">
                        {loading ? <><Loader size={18} className="animate-spin mr-2" />Creating...</> : <><CheckCircle size={18} className="mr-2" />Create Task</>}
                    </Button>

                    <div className="h-6" />
                </div>
            </div>

            {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
        </div>
    );
};

export default AdhocTaskCreate;
