/**
 * @file PackProduct.jsx
 * @description Screen: Pack Product into Handling Unit (EWM Packing)
 *
 * Allows operators to pack a product (by Product ID or scanned GTIN barcode) into
 * a destination Handling Unit with a specified quantity, unit, and optional batch.
 *
 * ## GTIN Resolution
 *  When a scanned barcode is a GS1-compliant GTIN (8–14 digits or prefixed with AI 01),
 *  the app resolves the GTIN to a SAP Product ID via api.fetchProductByGTIN before packing.
 *
 * ## Value Help Dropdowns
 *  - Products: fetched from API_PRODUCT_SRV (A_ProductUnitsOfMeasureEAN)
 *  - Destination HUs: fetched from the selected warehouse via api.fetchHandlingUnits
 *
 * SAP API: EWM Pack HU API (api.packProductToHU), API_PRODUCT_SRV (GTIN lookup)
 *
 * @route /warehouse-packing/pack-product
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Home, Search, Scan, AlertCircle, X, CheckCircle, ScanLine } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api, getHeaders } from '../../services/api';
import BarcodeScanner from '../../components/BarcodeScanner';
import { useSwipeBack } from '../../hooks/useSwipeBack';

import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';

const PackProduct = () => {
    const navigate = useNavigate();
    const { apiConfig } = useAuth();
    useSwipeBack(() => navigate(-1));

    const [warehouses, setWarehouses] = useState([]);
    const [selectedWarehouse, setSelectedWarehouse] = useState('');
    const [productValue, setProductValue] = useState('');
    const [quantity, setQuantity] = useState('');
    const [unit, setUnit] = useState('EA');
    const [batch, setBatch] = useState('');
    const [destHU, setDestHU] = useState('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');
    const [showScanner, setShowScanner] = useState(false);
    const [scanTarget, setScanTarget] = useState('');

    // Product dropdown value help
    const [productDropdownOptions, setProductDropdownOptions] = useState([]);
    const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
    const [fetchingProductDropdown, setFetchingProductDropdown] = useState(false);

    // HU dropdown value help
    const [huDropdownOptions, setHuDropdownOptions] = useState([]);
    const [isHuDropdownOpen, setIsHuDropdownOpen] = useState(false);
    const [fetchingHuDropdown, setFetchingHuDropdown] = useState(false);

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

    // Product/GTIN value help
    useEffect(() => {
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
    }, [apiConfig]);

    // HU value help
    useEffect(() => {
        if (!selectedWarehouse) return;
        (async () => {
            setFetchingHuDropdown(true);
            try {
                const res = await api.fetchHandlingUnits(apiConfig, { warehouse: selectedWarehouse });
                if (res?.value) setHuDropdownOptions(res.value);
            } catch (err) { console.error("Failed to fetch HU dropdown:", err); }
            finally { setFetchingHuDropdown(false); }
        })();
    }, [apiConfig, selectedWarehouse]);

    const filteredProductOptions = productDropdownOptions.filter(opt => {
        if (!productValue) return true;
        const upper = productValue.toUpperCase();
        return (opt.Product && opt.Product.toUpperCase().includes(upper)) ||
            (opt.ProductStandardID && opt.ProductStandardID.includes(upper));
    });

    const filteredHuOptions = huDropdownOptions.filter(opt => {
        if (!destHU) return true;
        return opt.HandlingUnitExternalID && opt.HandlingUnitExternalID.toUpperCase().includes(destHU.toUpperCase());
    });

    const extractGTIN = (scanned) => {
        const gs1Match = scanned.match(/(?:\(01\)|^01)(\d{14})/);
        if (gs1Match) return gs1Match[1];
        if (/^\d{8,14}$/.test(scanned)) return scanned;
        return null;
    };

    const handleScan = (code) => {
        setShowScanner(false);
        if (scanTarget === 'product') setProductValue(code);
        else if (scanTarget === 'hu') setDestHU(code);
        else if (scanTarget === 'batch') setBatch(code.trim().toUpperCase());
    };

    const handlePack = async (e) => {
        if (e) e.preventDefault();
        setError(null); setSuccessMsg('');

        if (!selectedWarehouse) { setError("Select a warehouse."); return; }
        if (!productValue.trim()) { setError("Enter a product."); return; }
        if (!quantity || parseFloat(quantity) <= 0) { setError("Enter a valid quantity."); return; }
        if (!destHU.trim()) { setError("Enter destination HU."); return; }

        setLoading(true);
        try {
            let productId = productValue.trim();

            // Resolve GTIN
            const gtinCandidate = extractGTIN(productId);
            if (gtinCandidate) {
                const eanResult = await api.fetchProductByGTIN(apiConfig, gtinCandidate);
                if (eanResult?.Product) productId = eanResult.Product.trim();
                else { setError(`No product found for GTIN "${gtinCandidate}".`); setLoading(false); return; }
            }

            const items = [{
                Material: productId,
                HandlingUnitQuantity: parseFloat(quantity),
                HandlingUnitQuantityUnit: unit,
            }];
            if (batch) items[0].Batch = batch;

            console.log("Packing product to HU:", destHU.trim(), "Items:", JSON.stringify(items));
            await api.packProductToHU(apiConfig, destHU.trim(), selectedWarehouse, items);
            setSuccessMsg(`Product ${productId} packed into HU ${destHU.trim()} successfully!`);
            setProductValue(''); setQuantity(''); setBatch('');
        } catch (err) {
            setError("Pack failed: " + err.message);
        } finally { setLoading(false); }
    };

    const inputFieldStyle = "w-full border border-gray-300 rounded-lg p-3 text-sm bg-white focus:ring-2 focus:ring-brand-blue focus:border-brand-blue";
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
                            Pack Product
                        </h1>
                                                <p className="text-blue-200 text-[10px] font-medium uppercase tracking-wider mt-0.5">
                                                    Product → HU
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
                        <form onSubmit={handlePack} className="flex flex-col gap-4">
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
                                    label={<>Product / GTIN <span className="text-red-500">*</span></>}
                                    placeholder="Scan GTIN or type Product ID"
                                    value={productValue}
                                    onChange={e => setProductValue(e.target.value.toUpperCase())}
                                    onFocus={() => setIsProductDropdownOpen(true)}
                                    onBlur={() => setTimeout(() => setIsProductDropdownOpen(false), 200)}
                                    leftIcon={<Search size={18} />}
                                    rightIcon={<button type="button" onClick={() => { setScanTarget('product'); setShowScanner(true); }} className="w-9 h-9 mr-2 p-0 flex items-center justify-center text-gray-400 hover:text-brand-blue rounded-md"><Scan size={20} /></button>}
                                    autoComplete="off"
                                    wrapperClassName="mb-1"
                                />
                                <div className="relative">
                                    {isProductDropdownOpen && (
                                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto top-full left-0">
                                            {fetchingProductDropdown ? (
                                                <div className="p-4 text-sm text-gray-500 text-center flex items-center justify-center gap-2">
                                                    <div className="w-5 h-5 border-2 border-brand-blue border-t-transparent rounded-full animate-spin"></div> Loading...
                                                </div>
                                            ) : filteredProductOptions.length === 0 ? (
                                                <div className="p-4 text-sm text-gray-500 text-center">No products found. You can still type a Product ID or GTIN.</div>
                                            ) : (
                                                <div className="py-1">
                                                    {filteredProductOptions.map((opt, i) => (
                                                        <div key={opt.Product + '-' + i}
                                                            className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b last:border-0 border-gray-100 text-left transition-colors"
                                                            onMouseDown={(e) => { e.preventDefault(); setProductValue(opt.Product); setIsProductDropdownOpen(false); }}>
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

                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <Input
                                        type="number"
                                        label={<>Quantity <span className="text-red-500">*</span></>}
                                        step="0.001"
                                        value={quantity}
                                        onChange={e => setQuantity(e.target.value)}
                                        placeholder="0"
                                    />
                                </div>
                                <div className="w-24">
                                    <Input
                                        label="Unit"
                                        value={unit}
                                        onChange={e => setUnit(e.target.value.toUpperCase())}
                                        className="font-mono uppercase"
                                    />
                                </div>
                            </div>

                            {/* Batch */}
                            <div className="w-full">
                                <Input
                                    label={<>Batch <span className="text-gray-400">(optional)</span></>}
                                    value={batch}
                                    onChange={e => setBatch(e.target.value.toUpperCase())}
                                    placeholder="Scan or type batch number"
                                    className="font-mono uppercase"
                                    rightIcon={
                                        <button type="button" onClick={() => { setScanTarget('batch'); setShowScanner(true); }}
                                            className="w-9 h-9 flex items-center justify-center bg-brand-blue text-white rounded-lg hover:bg-opacity-90 transition">
                                            <ScanLine size={18} />
                                        </button>
                                    }
                                />
                            </div>

                            <div className="w-full">
                                <Input
                                    label={<>Destination HU <span className="text-red-500">*</span></>}
                                    placeholder="Scan destination HU"
                                    value={destHU}
                                    onChange={e => setDestHU(e.target.value.toUpperCase())}
                                    onFocus={() => setIsHuDropdownOpen(true)}
                                    onBlur={() => setTimeout(() => setIsHuDropdownOpen(false), 200)}
                                    leftIcon={<Search size={18} />}
                                    rightIcon={<button type="button" onClick={() => { setScanTarget('hu'); setShowScanner(true); }} className="w-9 h-9 mr-2 p-0 flex items-center justify-center text-gray-400 hover:text-brand-blue rounded-md"><Scan size={20} /></button>}
                                    autoComplete="off"
                                    wrapperClassName="mb-1"
                                />
                                <div className="relative">
                                    {isHuDropdownOpen && (
                                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto top-full left-0">
                                            {fetchingHuDropdown ? (
                                                <div className="p-4 text-sm text-gray-500 text-center flex items-center justify-center gap-2">
                                                    <div className="w-5 h-5 border-2 border-brand-blue border-t-transparent rounded-full animate-spin"></div> Loading...
                                                </div>
                                            ) : filteredHuOptions.length === 0 ? (
                                                <div className="p-4 text-sm text-gray-500 text-center">No HUs found. You can still type an HU ID.</div>
                                            ) : (
                                                <div className="py-1">
                                                    {filteredHuOptions.map((opt, i) => (
                                                        <div key={opt.HandlingUnitExternalID + '-' + i}
                                                            className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b last:border-0 border-gray-100 text-left transition-colors"
                                                            onMouseDown={(e) => { e.preventDefault(); setDestHU(opt.HandlingUnitExternalID); setIsHuDropdownOpen(false); }}>
                                                            <div className="font-semibold text-gray-800 text-sm">{opt.HandlingUnitExternalID}</div>
                                                            {opt.PackagingMaterial && <div className="text-[11px] text-gray-500 mt-0.5">Pkg: {opt.PackagingMaterial}</div>}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="w-full mt-2">
                                <Button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full py-3.5"
                                >
                                    {loading ? (
                                        <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Packing...</>
                                    ) : (
                                        <><CheckCircle size={16} /> Pack Product</>
                                    )}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
        </div>
    );
};

export default PackProduct;
