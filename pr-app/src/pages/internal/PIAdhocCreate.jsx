import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Home, Scan, AlertCircle, X, CheckCircle, Search, Plus, ChevronDown, Loader, Trash2, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api, getHeaders } from '../../services/api';
import BarcodeScanner from '../../components/BarcodeScanner';
import { useSwipeBack } from '../../hooks/useSwipeBack';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';

// ─── Portal Dropdown ───
const PortalDropdown = ({ inputRef, isOpen, children }) => {
    const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
    const updatePos = useCallback(() => {
        if (inputRef.current) {
            const rect = inputRef.current.getBoundingClientRect();
            setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
        }
    }, [inputRef]);
    useEffect(() => { if (isOpen) updatePos(); }, [isOpen, updatePos]);
    useEffect(() => {
        if (!isOpen) return;
        const onScroll = () => updatePos();
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onScroll);
        return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onScroll); };
    }, [isOpen, updatePos]);
    if (!isOpen) return null;
    return ReactDOM.createPortal(
        <div style={{
            position: 'fixed', top: pos.top, left: pos.left, width: pos.width,
            zIndex: 99999, maxHeight: '200px', overflowY: 'auto',
            backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0.5rem',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)'
        }}>{children}</div>,
        document.body
    );
};

const PIAdhocCreate = () => {
    const navigate = useNavigate();
    const { apiConfig } = useAuth();
    useSwipeBack(() => navigate(-1));

    // ── Shared / doc-level state ──
    const [warehouses, setWarehouses] = useState([]);
    const [selectedWarehouse, setSelectedWarehouse] = useState('');
    const [piDocType, setPiDocType] = useState('HL');

    // PI Procedure / Document Type options
    const piDocTypeOptions = [
        { code: 'HL', text: 'Ad Hoc PI (Bin-Specific)' },
        { code: 'HS', text: 'Ad Hoc PI (Product-Specific)' },
        { code: 'NL', text: 'Low Stock / Zero Stock PI' },
        { code: 'PL', text: 'Putaway Physical Inventory' },
        { code: 'ML', text: 'Storage Bin Check' },
    ];

    // ── Item form state (current item being edited) ──
    const [storageType, setStorageType] = useState('');
    const [storageBin, setStorageBin] = useState('');
    const [product, setProduct] = useState('');
    const [batch, setBatch] = useState('');
    const [reason, setReason] = useState('');

    // ── Items list (queue of items to create) ──
    const [itemsList, setItemsList] = useState([]);

    // ── Storage Type value help ──
    const [availableTypes, setAvailableTypes] = useState([]);
    const [showTypeDropdown, setShowTypeDropdown] = useState(false);
    const [fetchingTypes, setFetchingTypes] = useState(false);
    const typeInputRef = useRef(null);

    // ── Storage Bin value help ──
    const [availableBins, setAvailableBins] = useState([]);
    const [showBinDropdown, setShowBinDropdown] = useState(false);
    const [fetchingBins, setFetchingBins] = useState(false);
    const binInputRef = useRef(null);

    // ── Product value help ──
    const [productOptions, setProductOptions] = useState([]);
    const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
    const [fetchingProducts, setFetchingProducts] = useState(false);
    const productInputRef = useRef(null);

    // ── Reason codes ──
    const [reasonCodes, setReasonCodes] = useState([]);
    const [fetchingReasons, setFetchingReasons] = useState(false);

    // ── UI ──
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');
    const [showScanner, setShowScanner] = useState(false);
    const [scanTarget, setScanTarget] = useState('');

    // ════════════════════════════════════════
    // Data loading
    // ════════════════════════════════════════
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

    useEffect(() => {
        if (!selectedWarehouse) return;
        (async () => {
            setFetchingTypes(true);
            try {
                const res = await api.fetchStorageTypes(apiConfig, selectedWarehouse);
                setAvailableTypes(res?.value || []);
            } catch (err) { console.warn("Failed to fetch storage types:", err); }
            finally { setFetchingTypes(false); }
        })();
    }, [selectedWarehouse, apiConfig]);

    useEffect(() => {
        if (!selectedWarehouse || !storageType) { setAvailableBins([]); return; }
        (async () => {
            setFetchingBins(true);
            try {
                const res = await api.fetchStorageBins(apiConfig, selectedWarehouse, storageType);
                setAvailableBins(res?.value || []);
            } catch (err) { console.warn("Failed to fetch storage bins:", err); }
            finally { setFetchingBins(false); }
        })();
    }, [selectedWarehouse, storageType, apiConfig]);

    useEffect(() => {
        if (!selectedWarehouse) return;
        (async () => {
            setFetchingReasons(true);
            try {
                const piBaseUrl = api.getWhsePIUrl(apiConfig);
                const headers = getHeaders(apiConfig);
                let url = `${piBaseUrl}/WhsePhysicalInventoryItem?$filter=${encodeURIComponent(`EWMWarehouse eq '${selectedWarehouse}' and EWMPhysInvtryReason ne ''`)}&$select=EWMPhysInvtryReason&$top=200`;
                if (import.meta.env.DEV) {
                    if (url.includes('api.s4hana.cloud.sap')) url = url.replace(/https:\/\/my\d+-api\.s4hana\.cloud\.sap(:443)?/g, '');
                    if (url.includes('sandbox.api.sap.com')) url = url.replace('https://sandbox.api.sap.com', '/s4hanacloud');
                }
                const res = await fetch(url, { headers });
                if (res.ok) {
                    const json = await res.json();
                    const items = json.value || [];
                    const unique = [...new Set(items.map(i => (i.EWMPhysInvtryReason || '').trim()).filter(Boolean))].sort();
                    setReasonCodes(unique);
                } else { setReasonCodes([]); }
            } catch (err) { console.warn("Failed to fetch reason codes:", err); setReasonCodes([]); }
            finally { setFetchingReasons(false); }
        })();
    }, [selectedWarehouse, apiConfig]);

    useEffect(() => {
        if (!product || product.length < 2) { setProductOptions([]); return; }
        const debounce = setTimeout(async () => {
            setFetchingProducts(true);
            try {
                const prodBaseUrl = api.getProductSrvUrl(apiConfig);
                const headers = getHeaders(apiConfig);
                let url = `${prodBaseUrl}/A_ProductUnitsOfMeasureEAN?$top=50&$format=json`;
                if (import.meta.env.DEV) {
                    if (url.includes('api.s4hana.cloud.sap')) url = url.replace(/https:\/\/my\d+-api\.s4hana\.cloud\.sap(:443)?/g, '');
                    if (url.includes('sandbox.api.sap.com')) url = url.replace('https://sandbox.api.sap.com', '/s4hanacloud');
                }
                const response = await fetch(url, { headers });
                if (response.ok) {
                    const json = await response.json();
                    const results = json.d?.results || json.value || [];
                    const seen = new Map();
                    results.forEach(r => {
                        const prod = (r.Product || '').trim();
                        const gtin = (r.ProductStandardID || r.InternationalArticleNumber || '').trim();
                        if (prod && !seen.has(prod)) seen.set(prod, { Product: prod, GTIN: gtin });
                    });
                    const query = product.toUpperCase();
                    setProductOptions(Array.from(seen.values()).filter(p =>
                        p.Product.toUpperCase().includes(query) || (p.GTIN && p.GTIN.includes(query))
                    ));
                }
            } catch (err) { console.warn("Product dropdown error:", err); }
            finally { setFetchingProducts(false); }
        }, 300);
        return () => clearTimeout(debounce);
    }, [product, apiConfig]);

    // ════════════════════════════════════════
    // Helpers
    // ════════════════════════════════════════
    const resolveGTIN = async (code) => {
        try {
            const res = await api.fetchProductByGTIN(apiConfig, code);
            if (res?.Product) { setProduct(res.Product.trim()); return res.Product.trim(); }
        } catch (err) { console.warn("GTIN resolve failed:", err); }
        return null;
    };

    const handleScan = (code) => {
        setShowScanner(false);
        if (scanTarget === 'bin') setStorageBin(code);
        else if (scanTarget === 'product') { setProduct(code); resolveGTIN(code); }
    };

    const filteredBinOptions = availableBins.filter(b => {
        const binId = (b.EWMStorageBin || '').toUpperCase();
        return !storageBin || binId.includes(storageBin.toUpperCase());
    });

    const filteredTypeOptions = availableTypes.filter(t =>
        !storageType || (t.EWMStorageType || '').toUpperCase().includes(storageType.toUpperCase())
    );

    // ════════════════════════════════════════
    // Add Item to list
    // ════════════════════════════════════════
    const handleAddItem = async () => {
        setError(null);
        if (!selectedWarehouse) { setError("Select a warehouse."); return; }
        if (!piDocType) { setError("Select a PI Procedure."); return; }
        if (!storageBin.trim()) { setError("Enter a storage bin."); return; }

        let productId = product.trim();
        if (productId && /^\d{8,}$/.test(productId)) {
            const resolved = await resolveGTIN(productId);
            if (resolved) productId = resolved;
        }

        const item = {
            EWMWarehouse: selectedWarehouse,
            PhysicalInventoryDocumentType: piDocType,
            EWMStorageBin: storageBin.trim()
        };

        if (storageType.trim()) item.EWMStorageType = storageType.trim();
        if (productId) item.Product = productId;
        if (batch.trim()) item.Batch = batch.trim();
        if (reason) item.EWMPhysInvtryReason = reason;

        setItemsList(prev => [...prev, item]);

        // Clear item-level fields for next entry (keep warehouse, docType, storageType)
        setStorageBin('');
        setProduct('');
        setBatch('');
        setReason('');
    };

    const removeItem = (idx) => {
        setItemsList(prev => prev.filter((_, i) => i !== idx));
    };

    // ════════════════════════════════════════
    // Create PI — send all items
    // ════════════════════════════════════════
    const handleCreate = async () => {
        setError(null);
        setSuccessMsg('');

        if (itemsList.length === 0) {
            setError("Add at least one item before creating.");
            return;
        }

        setLoading(true);
        try {
            const result = await api.createWhsePIDocument(apiConfig, itemsList);
            const docNum = result?.PhysicalInventoryDocNumber || result?.d?.PhysicalInventoryDocNumber || '';
            const msg = docNum
                ? `PI Document ${docNum} created with ${itemsList.length} item(s)!`
                : `PI Document created with ${itemsList.length} item(s)!`;
            setSuccessMsg(msg);
            setItemsList([]);
        } catch (err) {
            console.error('[PIAdhocCreate] Create failed:', err);
            const msg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
            setError("Create PI failed: " + msg);
        } finally { setLoading(false); }
    };

    // ════════════════════════════════════════
    // Render
    // ════════════════════════════════════════
    const scanFieldStyle = "relative flex items-center w-full border border-gray-300 rounded-lg bg-slate-50 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-blue overflow-hidden";
    const chevron = (
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
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
                        <h1 className="text-xl font-bold text-white tracking-wide truncate">Adhoc PI Create</h1>
                        <p className="text-blue-200 text-xs font-medium tracking-wider mt-0.5 truncate">Create Physical Inventory Document</p>
                    </div>
                    <button onClick={() => navigate('/menu', { replace: true })} className="w-10 h-10 p-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" title="Home">
                        <Home size={22} className="text-white" />
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-4 content-area pb-8" style={{ zIndex: 10, position: 'relative' }}>
                <div className="max-w-md mx-auto">

                    {/* Messages */}
                    {error && (
                        <div className="bg-red-50 border border-red-300 rounded-lg p-3 shadow-md flex gap-3 items-start mb-3 mt-4">
                            <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                            <p className="text-xs text-red-600 mt-0.5 flex-1 whitespace-pre-wrap">{error}</p>
                            <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-md shrink-0"><X size={14} className="text-red-500" /></button>
                        </div>
                    )}
                    {successMsg && (
                        <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-3 shadow-md flex gap-3 items-start mb-3 mt-4">
                            <CheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={18} />
                            <p className="text-xs text-emerald-600 mt-0.5 flex-1">{successMsg}</p>
                            <button onClick={() => setSuccessMsg('')} className="p-1 hover:bg-emerald-100 rounded-md shrink-0"><X size={14} className="text-emerald-500" /></button>
                        </div>
                    )}

                    {/* ════ Added Items List ════ */}
                    {itemsList.length > 0 && (
                        <div className="bg-white shadow-sm border border-slate-200 w-full p-4 md:rounded-xl mt-6">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Items to Create ({itemsList.length})</h3>
                            </div>
                            <div className="space-y-2">
                                {itemsList.map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-white bg-brand-blue rounded-full w-5 h-5 flex items-center justify-center shrink-0">{idx + 1}</span>
                                                <span className="font-bold text-sm text-slate-800 font-mono">{item.EWMStorageBin}</span>
                                            </div>
                                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 ml-7">
                                                {item.EWMStorageType && <span className="text-[10px] text-slate-500">Type: <span className="font-semibold text-slate-700">{item.EWMStorageType}</span></span>}
                                                {item.Product && <span className="text-[10px] text-slate-500">Prod: <span className="font-semibold text-slate-700">{item.Product}</span></span>}
                                                {item.Batch && <span className="text-[10px] text-slate-500">Batch: <span className="font-semibold text-slate-700">{item.Batch}</span></span>}
                                                {item.EWMPhysInvtryReason && <span className="text-[10px] text-slate-500">Reason: <span className="font-semibold text-slate-700">{item.EWMPhysInvtryReason}</span></span>}
                                            </div>
                                        </div>
                                        <button onClick={() => removeItem(idx)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors shrink-0 ml-2">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* CREATE PI BUTTON */}
                            <Button onClick={handleCreate} disabled={loading} className="w-full mt-4">
                                {loading ? (
                                    <><Loader size={18} className="animate-spin mr-2" />Creating...</>
                                ) : (
                                    <><CheckCircle size={18} className="mr-2" />Create PI Document ({itemsList.length} item{itemsList.length !== 1 ? 's' : ''})</>
                                )}
                            </Button>
                        </div>
                    )}

                    {/* ════ Item Form ════ */}
                    <div className="bg-white shadow-sm border border-slate-200 w-full p-4 md:rounded-xl mt-4">
                        <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-4">
                            {itemsList.length > 0 ? 'Add Another Item' : 'Add Item'}
                        </h3>
                        <div className="flex flex-col gap-4">

                            {/* Warehouse */}
                            <div className="mb-2">
                                <Select
                                    label="Warehouse *"
                                    value={selectedWarehouse}
                                    onChange={e => { setSelectedWarehouse(e.target.value); setItemsList([]); }}
                                    options={[
                                        { value: '', label: 'Select Warehouse', disabled: true },
                                        ...warehouses.map(w => ({ value: w.EWMWarehouse, label: `${w.EWMWarehouse} - ${w.EWMWarehouse_Text || w.EWMWarehouse}` }))
                                    ]}
                                    required
                                />
                            </div>

                            {/* PI Procedure */}
                            <div className="mb-2">
                                <Select
                                    label="PI Procedure *"
                                    value={piDocType}
                                    onChange={e => setPiDocType(e.target.value)}
                                    options={piDocTypeOptions.map(opt => ({ value: opt.code, label: `${opt.code} — ${opt.text}` }))}
                                />
                            </div>

                            {/* Storage Type */}
                            <div className="mb-2" ref={typeInputRef}>
                                <Input
                                    label="Storage Type"
                                    placeholder="e.g. Z100"
                                    maxLength={4}
                                    value={storageType}
                                    onChange={e => { setStorageType(e.target.value.toUpperCase()); setStorageBin(''); setShowTypeDropdown(true); }}
                                    onFocus={() => setShowTypeDropdown(true)}
                                    onBlur={() => setTimeout(() => setShowTypeDropdown(false), 200)}
                                    rightIcon={
                                        <button type="button" onClick={() => setShowTypeDropdown(!showTypeDropdown)} className="p-1 px-2 text-gray-400 hover:text-brand-blue hover:bg-gray-50 rounded-md">
                                            <ChevronDown size={16} />
                                        </button>
                                    }
                                />
                                <PortalDropdown inputRef={typeInputRef} isOpen={showTypeDropdown}>
                                    {fetchingTypes ? (
                                        <div className="flex justify-center p-4"><Loader className="animate-spin text-blue-500" size={20} /></div>
                                    ) : filteredTypeOptions.length === 0 ? (
                                        <div className="p-3 text-center text-sm text-gray-500">No types found.</div>
                                    ) : (
                                        filteredTypeOptions.map((type, idx) => (
                                            <div key={type.EWMStorageType}
                                                className={`px-4 py-2.5 cursor-pointer hover:bg-blue-50 transition-colors ${idx < filteredTypeOptions.length - 1 ? 'border-b border-gray-100' : ''}`}
                                                onMouseDown={e => { e.preventDefault(); setStorageType(type.EWMStorageType); setShowTypeDropdown(false); setStorageBin(''); }}>
                                                <div className="font-bold text-slate-800 text-sm font-mono">{type.EWMStorageType}</div>
                                                {type.EWMStorageTypeName && <div className="text-[10px] text-gray-500 mt-0.5">{type.EWMStorageTypeName}</div>}
                                            </div>
                                        ))
                                    )}
                                </PortalDropdown>
                            </div>

                            {/* Storage Bin */}
                            <div className="mb-2" ref={binInputRef}>
                                <Input
                                    label="Storage Bin *"
                                    placeholder={storageType ? "Type or select bin" : "Select Storage Type first"}
                                    value={storageBin}
                                    onChange={e => { setStorageBin(e.target.value.toUpperCase()); setShowBinDropdown(true); }}
                                    onFocus={() => { if (storageType) setShowBinDropdown(true); }}
                                    onBlur={() => setTimeout(() => setShowBinDropdown(false), 200)}
                                    autoComplete="off"
                                    leftIcon={<Search size={18} className="text-gray-400" />}
                                    rightIcon={
                                        <button type="button" onClick={() => { setScanTarget('bin'); setShowScanner(true); }} className="p-1 px-2 text-brand-blue hover:bg-blue-50 rounded-md">
                                            <Scan size={20} />
                                        </button>
                                    }
                                />
                                <PortalDropdown inputRef={binInputRef} isOpen={showBinDropdown && !!storageType}>
                                    {fetchingBins ? (
                                        <div className="flex justify-center p-4"><Loader className="animate-spin text-blue-500" size={20} /></div>
                                    ) : filteredBinOptions.length === 0 ? (
                                        <div className="p-3 text-center text-sm text-gray-500">No bins found.</div>
                                    ) : (
                                        <div className="py-1">
                                            {filteredBinOptions.map((bin, i) => (
                                                <div key={(bin.EWMStorageBin || '') + '-' + i}
                                                    className="px-4 py-2.5 hover:bg-blue-50 cursor-pointer border-b last:border-0 border-gray-100 text-left transition-colors"
                                                    onMouseDown={e => { e.preventDefault(); setStorageBin(bin.EWMStorageBin); setShowBinDropdown(false); }}>
                                                    <div className="font-semibold text-gray-800 text-sm font-mono">{bin.EWMStorageBin}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </PortalDropdown>
                            </div>

                            {/* Product */}
                            <div className="mb-2" ref={productInputRef}>
                                <Input
                                    label="Product / GTIN"
                                    placeholder="Product ID or scan GTIN"
                                    value={product}
                                    onChange={e => { setProduct(e.target.value.toUpperCase()); setIsProductDropdownOpen(true); }}
                                    onFocus={() => { if (productOptions.length > 0) setIsProductDropdownOpen(true); }}
                                    onBlur={() => setTimeout(() => setIsProductDropdownOpen(false), 200)}
                                    autoComplete="off"
                                    leftIcon={<Search size={18} className="text-gray-400" />}
                                    rightIcon={
                                        <div className="flex items-center gap-1">
                                            {fetchingProducts && <Loader size={16} className="animate-spin text-brand-blue mr-1" />}
                                            <button type="button" onClick={() => { setScanTarget('product'); setShowScanner(true); }} className="p-1 px-2 text-brand-blue hover:bg-blue-50 rounded-md">
                                                <Scan size={20} />
                                            </button>
                                        </div>
                                    }
                                />
                                <PortalDropdown inputRef={productInputRef} isOpen={isProductDropdownOpen && productOptions.length > 0}>
                                    <div className="py-1">
                                        {productOptions.map((opt, i) => (
                                            <div key={opt.Product + '-' + i}
                                                className="px-4 py-2.5 hover:bg-blue-50 cursor-pointer border-b last:border-0 border-gray-100 text-left transition-colors"
                                                onMouseDown={e => { e.preventDefault(); setProduct(opt.Product); setIsProductDropdownOpen(false); }}>
                                                <div className="font-semibold text-gray-800 text-sm">{opt.Product}</div>
                                                {opt.GTIN && <div className="text-[10px] text-gray-500 mt-0.5">GTIN: {opt.GTIN}</div>}
                                            </div>
                                        ))}
                                    </div>
                                </PortalDropdown>
                            </div>

                            {/* Batch */}
                            <div className="mb-2">
                                <Input
                                    label="Batch"
                                    placeholder="Batch number (optional)"
                                    value={batch}
                                    onChange={e => setBatch(e.target.value)}
                                />
                            </div>

                            {/* Reason Code */}
                            <div className="mb-2">
                                <Select
                                    label="Reason Code"
                                    value={reason}
                                    onChange={e => setReason(e.target.value)}
                                    options={[
                                        { value: '', label: 'Select Reason (optional)' },
                                        ...(fetchingReasons ? [{ value: 'loading', label: 'Loading...', disabled: true }] : 
                                            reasonCodes.length === 0 ? [{ value: 'none', label: 'No reason codes found', disabled: true }] : 
                                            reasonCodes.map(rc => ({ value: rc, label: rc })))
                                    ]}
                                />
                            </div>

                            {/* ADD ITEM BUTTON */}
                            <Button type="button" onClick={handleAddItem} className="bg-brand-blue text-white w-full mt-2">
                                <Plus size={18} className="mr-2" />Add Item
                            </Button>
                        </div>
                    </div>

                    {/* Bottom spacer */}
                    <div className="h-8" />
                </div>
            </div>

            {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
        </div>
    );
};

export default PIAdhocCreate;
