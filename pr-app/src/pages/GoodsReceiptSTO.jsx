/**
 * @file GoodsReceiptSTO.jsx
 * @description Screen: Goods Receipt against Stock Transfer Order (STO)
 *
 * Allows the receiving plant to post a Goods Receipt for an inter-plant
 * Stock Transfer Order (STO). The supplying plant issues goods via GI (mvt 351),
 * and this screen posts the corresponding GR at the receiving plant (mvt 101).
 *
 * ## SAP Flow
 *  1. Supplying plant creates STO (PO type UB)
 *  2. Supplying plant posts GI (movement type 351) — goods in transit
 *  3. Receiving plant posts GR here (movement type 101) — goods received
 *
 * SAP API: API_PURCHASEORDER_PROCESS_SRV + API_GOODSMOVEMENT_SRV
 *
 * @route /gr-sto
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { constructGRPayload } from '../services/payloadHelper';
import {
    Search, ArrowLeft, Home, AlertCircle, Loader, CheckCircle,
    X, Filter, Calendar, FileText, ChevronDown, ChevronUp, Scan
} from 'lucide-react';
import BarcodeScanner from '../components/BarcodeScanner';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

const GoodsReceiptSTO = () => {
    const navigate = useNavigate();
    const { apiConfig } = useAuth();

    const [view, setView] = useState('filter'); // 'filter' | 'list' | 'items'
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');

    const [showScanner, setShowScanner] = useState(false);
    const [scanField, setScanField] = useState(null);

    const toISO = (d) => d.toISOString().split('T')[0];
    const today = new Date();
    const ninetyDaysAgo = new Date(); ninetyDaysAgo.setDate(today.getDate() - 90);

    const [filters, setFilters] = useState({
        stoNumber: '',
        supplyingPlant: '',
        dateFrom: toISO(ninetyDaysAgo),
        dateTo: toISO(today),
    });

    const [stos, setStos] = useState([]);
    const [selectedSTO, setSelectedSTO] = useState(null);
    const [stoItems, setStoItems] = useState([]);
    const [expandedSTO, setExpandedSTO] = useState(null);
    const [expandedItem, setExpandedItem] = useState(null);
    const [itemQtys, setItemQtys] = useState({});
    const [itemSloc, setItemSloc] = useState({});
    const [itemBatch, setItemBatch] = useState({});
    const [itemSerials, setItemSerials] = useState({});
    const [postLoading, setPostLoading] = useState(false);
    const [postingDate] = useState(toISO(today));

    const handleScan = (code) => {
        if (scanField === 'stoNumber') setFilters(f => ({ ...f, stoNumber: code.trim() }));
        else if (scanField && scanField.startsWith('batch_')) {
            const itemId = scanField.replace('batch_', '');
            setItemBatch(b => ({ ...b, [itemId]: code.trim() }));
        } else if (scanField && scanField.startsWith('serial_')) {
            const parts = scanField.split('_');
            const itemId = parts[1];
            const idx = parseInt(parts[2], 10);
            setItemSerials(s => {
                const prev = s[itemId] || [];
                const updated = [...prev];
                updated[idx] = code.trim();
                return { ...s, [itemId]: updated };
            });
        }
        setShowScanner(false);
        setScanField(null);
    };

    const loadSTOs = async () => {
        if (!filters.stoNumber && !filters.supplyingPlant && !filters.dateFrom) {
            setError('Please enter at least one filter before searching.');
            return;
        }
        setLoading(true);
        setError(null);
        setStos([]);
        try {
            const apiFilters = { purchaseOrderType: 'UB' };
            if (filters.stoNumber?.trim()) apiFilters.purchaseOrder = filters.stoNumber.trim();
            if (filters.supplyingPlant?.trim()) apiFilters.supplyingPlant = filters.supplyingPlant.trim();
            if (filters.dateFrom) apiFilters.dateFrom = filters.dateFrom;
            if (filters.dateTo) apiFilters.dateTo = filters.dateTo;

            const res = await api.fetchPOs(apiConfig, 100, apiFilters);
            const results = res?.d?.results || res?.value || [];
            setStos(results);
            if (results.length > 0) setView('list');
            else setError('No STOs found matching your filters.');
        } catch (err) {
            setError('Failed to load STOs: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleViewItems = (sto) => {
        setSelectedSTO(sto);
        const items = sto.to_PurchaseOrderItem?.results || [];
        // Show only open (not completely delivered) items
        const openItems = items.filter(i => !i.IsCompletelyDelivered);
        setStoItems(openItems);
        // Pre-populate quantities with open qty and sloc from PO item
        const qtys = {};
        const slocs = {};
        openItems.forEach(item => {
            const ordered = parseFloat(item.OrderQuantity || 0);
            const delivered = parseFloat(item.QuantityInPurchaseOrderPriceUnit || 0);
            qtys[item.PurchaseOrderItem] = Math.max(0, ordered - delivered).toString();
            slocs[item.PurchaseOrderItem] = item.StorageLocation || '';
        });
        setItemQtys(qtys);
        setItemSloc(slocs);
        setView('items');
    };

    const handlePostGR = async () => {
        const itemsToPost = stoItems.filter(item => {
            const qty = parseFloat(itemQtys[item.PurchaseOrderItem] || 0);
            return qty > 0 && itemSloc[item.PurchaseOrderItem];
        });

        if (itemsToPost.length === 0) {
            setError('No items ready to post. Ensure each item has a quantity and storage location.');
            return;
        }
        const missingSloc = stoItems.find(i => parseFloat(itemQtys[i.PurchaseOrderItem] || 0) > 0 && !itemSloc[i.PurchaseOrderItem]);
        if (missingSloc) {
            setError(`Item ${missingSloc.PurchaseOrderItem} is missing a Storage Location.`);
            return;
        }
        if (!window.confirm(`Post GR for STO ${selectedSTO?.PurchaseOrder} — ${itemsToPost.length} item(s)?`)) return;

        setPostLoading(true);
        setError(null);
        let successCount = 0;
        const errors = [];
        try {
            for (const item of itemsToPost) {
                const payload = constructGRPayload({
                    item,
                    quantity: itemQtys[item.PurchaseOrderItem],
                    date: postingDate,
                    headerText: `GR for STO ${selectedSTO.PurchaseOrder}`,
                    itemText: '',
                    deliveryNote: '',
                    storageLocation: itemSloc[item.PurchaseOrderItem],
                    movementType: '101',
                    batch: itemBatch[item.PurchaseOrderItem] || '',
                    serialNumbers: (itemSerials[item.PurchaseOrderItem] || []).filter(s => s && s.trim())
                });
                try {
                    await api.postGoodsReceipt(apiConfig, payload);
                    successCount++;
                } catch (e) {
                    errors.push(`Item ${item.PurchaseOrderItem}: ${e.message}`);
                }
            }
            if (errors.length > 0) {
                setError(errors.join('; '));
                if (successCount > 0) setSuccessMsg(`Partial: Posted ${successCount} items.`);
            } else {
                setSuccessMsg(`GR Posted! ${successCount} item(s) for STO ${selectedSTO.PurchaseOrder}.`);
                setTimeout(() => { setSuccessMsg(''); setView('list'); loadSTOs(); }, 3000);
            }
        } catch (err) {
            setError('Post GR failed: ' + err.message);
        } finally {
            setPostLoading(false);
        }
    };

    const stripZeros = str => str ? String(str).replace(/^0+/, '') || '0' : '';

    return (
        <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
            {/* Header */}
            <header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                <div className="flex justify-between items-center relative">
                    <button onClick={() => view === 'filter' ? navigate(-1) : view === 'items' ? setView('list') : setView('filter')}
                                            className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition" title="Back">
                                            <ArrowLeft size={20} />
                                        </button>
                    
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <h1 className="text-xl font-bold text-white tracking-wide">
                            {view === 'list' ? `${stos.length}` : view === 'items' ? `STO ${stripZeros(selectedSTO?.PurchaseOrder || '')}` : 'GR for STO'}
                        {view === 'list' && <span className="text-lg text-blue-200"> STOs</span>}
                        </h1>
                                                <p className="text-blue-200 text-[10px] font-medium uppercase tracking-wider mt-0.5">
                                                    {view === 'filter' ? 'Search Filters' : view === 'items' ? 'STO Items' : 'Stock Transfer Orders'}
                                                </p>
                    </div>

                    <button onClick={() => { setError(null); navigate('/menu', { replace: true }); }}
                                            className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition" title="Home">
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
                            <p className="text-[11px] text-emerald-600 flex-1">{successMsg}</p>
                        </div>
                    )}
                </div>
            )}

            <main className="flex-1 overflow-y-auto px-4 pt-4 pb-32 content-area">
                <div className="max-w-5xl mx-auto">

                    {/* ── Filter Form ── */}
                    {view === 'filter' && (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mt-4 space-y-4">
                            <div className="flex items-center gap-2 mb-1">
                                <Filter size={16} className="text-blue-600" />
                                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Search Filters</h2>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">STO Number</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={filters.stoNumber}
                                        onChange={e => setFilters(f => ({ ...f, stoNumber: e.target.value }))}
                                        placeholder="e.g. 4500000123"
                                        className="flex-1 h-11 bg-slate-50 border border-blue-200 rounded-lg px-3 text-sm font-bold text-blue-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                                    />
                                    <button type="button" onClick={() => { setScanField('stoNumber'); setShowScanner(true); }} className="h-11 w-11 flex-none bg-brand-blue text-white rounded-lg flex items-center justify-center hover:opacity-90 transition-colors" title="Scan">
                                        <Scan size={18} />
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Supplying Plant</label>
                                <input
                                    type="text"
                                    value={filters.supplyingPlant}
                                    onChange={e => setFilters(f => ({ ...f, supplyingPlant: e.target.value.toUpperCase() }))}
                                    placeholder="e.g. 1000"
                                    className="w-full h-11 bg-slate-50 border border-blue-200 rounded-lg px-3 text-sm font-bold text-blue-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                                />
                            </div>

                            <div className="flex flex-col gap-3">
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Date From</label>
                                    <input
                                        type="date"
                                        value={filters.dateFrom}
                                        onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
                                        className="w-full h-11 bg-slate-50 border border-blue-200 rounded-lg px-3 text-sm font-bold text-blue-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-blue-900/70 mb-1.5 block">Date To</label>
                                    <input
                                        type="date"
                                        value={filters.dateTo}
                                        onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))}
                                        className="w-full h-11 bg-slate-50 border border-blue-200 rounded-lg px-3 text-sm font-bold text-blue-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                                    />
                                </div>
                            </div>

                            <div className="w-full mt-4">
                                <button
                                    onClick={loadSTOs}
                                    disabled={loading}
                                    className="w-full bg-brand-blue hover:bg-opacity-90 text-white font-bold py-3.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60"
                                >
                                    {loading ? <><Loader className="animate-spin" size={16} /> Searching...</> : <><Search size={16} /> Search STOs</>}
                                </button>
                            </div>
                        </div>
                    )}


                    {/* ── STO List ── */}
                    {view === 'list' && (
                        <div className="space-y-3">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs text-slate-500 font-medium">{stos.length} STO{stos.length !== 1 ? 's' : ''} found</span>
                                <button onClick={() => setView('filter')} className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline">
                                    <Filter size={12} /> Change Filters
                                </button>
                            </div>
                            {loading ? (
                                <div className="text-center py-10"><Loader className="animate-spin mx-auto text-blue-600" size={32} /></div>
                            ) : stos.map(sto => {
                                const items = sto.to_PurchaseOrderItem?.results || [];
                                const openCount = items.filter(i => !i.IsCompletelyDelivered).length;
                                return (
                                    <div key={sto.PurchaseOrder} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                        <div className="flex items-stretch min-h-[80px]">
                                            <div className="w-2 bg-teal-500 flex-shrink-0" />
                                            <div className="flex-1 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
                                                onClick={() => setExpandedSTO(expandedSTO === sto.PurchaseOrder ? null : sto.PurchaseOrder)}>
                                                <div className="flex justify-between items-start">
                                                    <h3 className="text-base font-bold text-blue-950">#{stripZeros(sto.PurchaseOrder)}</h3>
                                                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${openCount > 0 ? 'bg-teal-100 text-teal-700 border-teal-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                                        {openCount > 0 ? `${openCount} Open` : 'Complete'}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-500 mt-1">
                                                    {sto.SupplyingPlant ? `Supply Plant: ${sto.SupplyingPlant}` : ''} {sto.CreationDate ? '· ' + new Date(parseInt(sto.CreationDate.replace(/\/Date\((-?\d+)\)\//, '$1'))).toLocaleDateString() : ''}
                                                </p>
                                                {expandedSTO === sto.PurchaseOrder && (
                                                    <div className="mt-3 pt-3 border-t border-slate-100">
                                                        <Button onClick={() => handleViewItems(sto)} disabled={openCount === 0} className="w-full">
                                                            View Items & Post GR
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* ── Items view ── */}
                    {view === 'items' && selectedSTO && (
                        <div className="space-y-4 pb-20">
                            {/* STO summary card */}
                            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
                                <h2 className="text-xl font-bold text-slate-800">STO #{stripZeros(selectedSTO.PurchaseOrder)}</h2>
                                <p className="text-xs text-slate-500 mt-1">
                                    Supply Plant: <span className="text-teal-600 font-bold">{selectedSTO.SupplyingPlant || 'N/A'}</span>
                                    {' · '}Type: <span className="font-bold text-slate-700">{selectedSTO.PurchaseOrderType}</span>
                                    {' · '}Movement: <span className="font-bold">101</span>
                                </p>
                            </div>

                            {stoItems.length === 0 ? (
                                <div className="text-center py-12 text-slate-400">
                                    <FileText size={36} className="mx-auto mb-3 opacity-30" />
                                    <p>No open items on this STO.</p>
                                </div>
                            ) : (
                                stoItems.map(item => (
                                    <div key={item.PurchaseOrderItem}
                                        className={`bg-white rounded-xl shadow border border-slate-200 ${expandedItem === item.PurchaseOrderItem ? 'ring-2 ring-teal-100' : ''}`}>
                                        {/* Item summary row */}
                                        <div className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                                            onClick={() => setExpandedItem(expandedItem === item.PurchaseOrderItem ? null : item.PurchaseOrderItem)}>
                                            <div className="flex justify-between items-start">
                                                <div className="flex items-start gap-3">
                                                    <div className="w-8 h-8 rounded bg-teal-50 flex items-center justify-center font-mono text-xs font-bold text-teal-600 mt-0.5">
                                                        {item.PurchaseOrderItem}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-sm text-slate-800">{item.Material}</p>
                                                        <p className="text-xs text-slate-400 mt-0.5">Plant: {item.Plant}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-bold text-slate-800">{itemQtys[item.PurchaseOrderItem] || '0'} <span className="text-xs text-slate-400">{item.OrderQuantityUnit || 'EA'}</span></p>
                                                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${itemSloc[item.PurchaseOrderItem] ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                                        {itemSloc[item.PurchaseOrderItem] ? 'Ready' : 'Set SLoc'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Expanded edit form */}
                                        {expandedItem === item.PurchaseOrderItem && (
                                            <div className="bg-slate-50 border-t border-slate-200 p-4 space-y-3">
                                                <div>
                                                    <label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">Storage Location <span className="text-red-500">*</span></label>
                                                    <input
                                                        type="text"
                                                        value={itemSloc[item.PurchaseOrderItem] || ''}
                                                        onChange={e => setItemSloc(s => ({ ...s, [item.PurchaseOrderItem]: e.target.value.toUpperCase() }))}
                                                        placeholder="e.g. 0001"
                                                        className="w-full h-11 border border-slate-200 rounded-xl px-3 text-sm font-bold text-slate-800 bg-white outline-none focus:border-brand-blue focus:ring-2 focus:ring-blue-100"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">GR Quantity</label>
                                                    <div className="flex items-center gap-3">
                                                        <button type="button" className="w-11 h-11 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-lg font-bold text-slate-700 hover:bg-slate-100"
                                                            onClick={() => setItemQtys(q => ({ ...q, [item.PurchaseOrderItem]: Math.max(0, parseFloat(q[item.PurchaseOrderItem] || 0) - 1).toString() }))}>
                                                            −
                                                        </button>
                                                        <input
                                                            type="number"
                                                            value={itemQtys[item.PurchaseOrderItem] || ''}
                                                            onChange={e => setItemQtys(q => ({ ...q, [item.PurchaseOrderItem]: e.target.value }))}
                                                            className="flex-1 h-11 border border-slate-200 rounded-xl text-center text-2xl font-bold bg-white outline-none focus:border-brand-blue"
                                                        />
                                                        <button type="button" className="w-11 h-11 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-lg font-bold text-slate-700 hover:bg-slate-100"
                                                            onClick={() => setItemQtys(q => ({ ...q, [item.PurchaseOrderItem]: (parseFloat(q[item.PurchaseOrderItem] || 0) + 1).toString() }))}>
                                                            +
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Batch Input */}
                                                <div>
                                                    <label className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 block">Batch (Optional)</label>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="text"
                                                            value={itemBatch[item.PurchaseOrderItem] || ''}
                                                            onChange={e => setItemBatch(b => ({ ...b, [item.PurchaseOrderItem]: e.target.value }))}
                                                            placeholder="Enter batch number"
                                                            className="flex-1 h-11 border border-slate-200 rounded-xl px-3 text-sm font-bold text-slate-800 bg-white outline-none focus:border-brand-blue focus:ring-2 focus:ring-blue-100"
                                                        />
                                                        <button type="button"
                                                            onClick={() => { setScanField(`batch_${item.PurchaseOrderItem}`); setShowScanner(true); }}
                                                            className="h-11 w-11 flex-none bg-brand-blue text-white rounded-xl flex items-center justify-center hover:opacity-90 transition-colors"
                                                            title="Scan Batch">
                                                            <Scan size={16} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Serial Numbers */}
                                                {(() => {
                                                    const qty = parseFloat(itemQtys[item.PurchaseOrderItem] || 0);
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
                                                                            value={(itemSerials[item.PurchaseOrderItem] || [])[idx] || ''}
                                                                            onChange={e => {
                                                                                setItemSerials(s => {
                                                                                    const prev = s[item.PurchaseOrderItem] || [];
                                                                                    const updated = [...prev];
                                                                                    updated[idx] = e.target.value;
                                                                                    return { ...s, [item.PurchaseOrderItem]: updated };
                                                                                });
                                                                            }}
                                                                            placeholder={`Serial #${idx + 1}`}
                                                                        />
                                                                        <button type="button"
                                                                            onClick={() => { setScanField(`serial_${item.PurchaseOrderItem}_${idx}`); setShowScanner(true); }}
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

                                                <button
                                                    onClick={() => setExpandedItem(null)}
                                                    className="w-full h-10 bg-brand-blue text-white font-bold text-sm rounded-xl transition hover:opacity-90">
                                                    Confirm Item
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}

                            {/* Post GR button */}
                            {stoItems.length > 0 && (
                                <div className="w-full mt-4">
                                    <Button onClick={handlePostGR} disabled={postLoading} className="w-full">
                                        {postLoading ? <Loader size={20} className="animate-spin mr-2" /> : <CheckCircle size={20} className="mr-2" />}
                                        Post GR for STO
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>

            {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
        </div>
    );
};

export default GoodsReceiptSTO;
