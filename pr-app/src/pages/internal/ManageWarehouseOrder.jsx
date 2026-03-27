import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Home, Search, Scan, AlertCircle, CheckCircle, X, Box, User, ClipboardList, Trash2, Plus, List } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { useSwipeBack } from '../../hooks/useSwipeBack';
import BarcodeScanner from '../../components/BarcodeScanner';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';

const ManageWarehouseOrder = () => {
    const navigate = useNavigate();
    const { apiConfig } = useAuth();
    useSwipeBack(() => navigate(-1));

    const [warehouses, setWarehouses] = useState([]);
    const [selectedWarehouse, setSelectedWarehouse] = useState('UKW2');
    const [searchValue, setSearchValue] = useState('');
    const [showScanner, setShowScanner] = useState(false);
    
    // Modal states for scanning/input
    const [showAssignResourceModal, setShowAssignResourceModal] = useState(false);
    const [resourceInput, setResourceInput] = useState('');
    
    const [showAssignHUModal, setShowAssignHUModal] = useState(false);
    const [huInput, setHuInput] = useState('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');
    
    const [orderInfo, setOrderInfo] = useState(null);
    const [tasks, setTasks] = useState([]);
    const [pickHUs, setPickHUs] = useState([]);

    useEffect(() => {
        const loadWarehouses = async () => {
            try {
                const res = await api.fetchWarehouses(apiConfig);
                if (res && res.value) {
                    setWarehouses(res.value);
                    if (res.value.length === 1) setSelectedWarehouse(res.value[0].EWMWarehouse);
                }
            } catch (err) {
                setError("Failed to load Warehouse list: " + err.message);
            }
        };
        loadWarehouses();
    }, [apiConfig]);

    const handleSearch = async (e) => {
        if (e) e.preventDefault();
        setError(null);
        setSuccessMsg('');
        setOrderInfo(null);
        setTasks([]);
        setPickHUs([]);

        if (!selectedWarehouse) {
            setError('Please select a warehouse first.'); return;
        }
        if (!searchValue.trim()) {
            setError('Please enter a Warehouse Order.'); return;
        }

        fetchOrderDetails(searchValue.trim().toUpperCase());
    };

    const fetchOrderDetails = async (orderId) => {
        setLoading(true);
        try {
            // 1. Fetch Order Info
            const orderRes = await api.fetchWarehouseOrders(apiConfig, { warehouse: selectedWarehouse, warehouseOrder: orderId });
            if (!orderRes || !orderRes.value || orderRes.value.length === 0) {
                setError(`Warehouse Order ${orderId} not found.`);
                setLoading(false);
                return;
            }
            const order = orderRes.value[0];
            setOrderInfo(order);

            // 2. Fetch Tasks for this order
            const taskRes = await api.fetchWarehouseTasks(apiConfig, { warehouse: selectedWarehouse, warehouseOrder: orderId });
            setTasks(taskRes.value || []);

            // 3. Fetch Pick HUs
            const huRes = await api.fetchPickHUs(apiConfig, selectedWarehouse, orderId);
            setPickHUs(huRes.value || []);

        } catch (err) {
            console.error(err);
            setError(err.message || "Failed to load Warehouse Order details.");
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (actionFn, successMessage) => {
        setError(null);
        setSuccessMsg('');
        setLoading(true);
        try {
            await actionFn();
            setSuccessMsg(successMessage);
            // Refresh details
            await fetchOrderDetails(orderInfo.WarehouseOrder);
        } catch (err) {
            setError(err.message || 'Action failed');
            setLoading(false);
        }
    };

    const doAssignResource = () => {
        if (!resourceInput.trim()) return;
        setShowAssignResourceModal(false);
        handleAction(
            () => api.assignWarehouseOrder(apiConfig, selectedWarehouse, orderInfo.WarehouseOrder, resourceInput.trim().toUpperCase()),
            `Resource ${resourceInput.toUpperCase()} assigned successfully.`
        );
    };

    const doUnassignResource = () => {
        handleAction(
            () => api.unassignWarehouseOrder(apiConfig, selectedWarehouse, orderInfo.WarehouseOrder),
            'Resource unassigned successfully.'
        );
    };

    const doAssignHU = () => {
        if (!huInput.trim()) return;
        setShowAssignHUModal(false);
        handleAction(
            () => api.assignPickHU(apiConfig, selectedWarehouse, orderInfo.WarehouseOrder, huInput.trim().toUpperCase()),
            `Pick-HU ${huInput.toUpperCase()} assigned successfully.`
        );
    };

    const doUnassignHU = (huId) => {
        handleAction(
            () => api.unassignPickHU(apiConfig, selectedWarehouse, orderInfo.WarehouseOrder, huId),
            `Pick-HU ${huId} unassigned successfully.`
        );
    };

    const handleScanComplete = (decodedText) => {
        setShowScanner(false);
        if (showAssignResourceModal) {
            setResourceInput(decodedText);
            // Optionally auto-submit
        } else if (showAssignHUModal) {
            setHuInput(decodedText);
        } else {
            setSearchValue(decodedText.toUpperCase());
            // Optionally auto-search
            fetchOrderDetails(decodedText.toUpperCase());
        }
    };

    return (
        <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
            {/* Header */}
            <header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                <div className="flex justify-between items-center relative">
                    <button onClick={() => navigate(-1)} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <h1 className="text-xl font-bold text-white tracking-wide">Manage WO</h1>
                    </div>
                    <button onClick={() => navigate('/menu', { replace: true })} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
                        <Home size={20} />
                    </button>
                </div>
            </header>

            {/* Content Container */}
            <div className="flex-1 overflow-y-auto p-4 content-area pb-24 relative z-10">
                <div className="max-w-md mx-auto flex flex-col gap-4">
                    {/* Messages */}
                    {error && (
                        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg shadow-sm flex items-start justify-between">
                            <div className="flex gap-3">
                                <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                                <p className="text-sm text-red-700 whitespace-pre-wrap">{error}</p>
                            </div>
                            <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-md shrink-0 ml-4"><X size={16} className="text-red-500" /></button>
                        </div>
                    )}
                    {successMsg && (
                        <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded-r-lg shadow-sm flex items-start justify-between">
                            <div className="flex gap-3">
                                <CheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={18} />
                                <p className="text-sm text-emerald-700 whitespace-pre-wrap">{successMsg}</p>
                            </div>
                            <button onClick={() => setSuccessMsg('')} className="p-1 hover:bg-emerald-100 rounded-md shrink-0 ml-4"><X size={16} className="text-emerald-500" /></button>
                        </div>
                    )}

                    {/* Search Form */}
                    <div className="bg-white shadow-sm border border-slate-200 w-full p-4 rounded-xl">
                        <form onSubmit={handleSearch} className="flex flex-col gap-4">
                            <Select
                                label="Warehouse"
                                value={selectedWarehouse}
                                onChange={(e) => setSelectedWarehouse(e.target.value)}
                                required
                                options={[
                                    { value: "", label: "Select Warehouse", disabled: true },
                                    ...warehouses.map(w => ({
                                        value: w.EWMWarehouse,
                                        label: `${w.EWMWarehouse} - ${w.EWMWarehouse_Text || w.EWMWarehouse}`
                                    }))
                                ]}
                            />
                            <div className="flex items-end gap-2">
                                <div className="flex-1 relative">
                                    <Input
                                        label="Warehouse Order"
                                        placeholder="Scan or type WO num..."
                                        value={searchValue}
                                        onChange={(e) => setSearchValue(e.target.value)}
                                        className="uppercase font-mono"
                                        rightIcon={
                                            <button
                                                type="button"
                                                onClick={() => { setShowAssignResourceModal(false); setShowAssignHUModal(false); setShowScanner(true); }}
                                                className="w-9 h-9 flex items-center justify-center text-white bg-brand-blue hover:bg-blue-800 rounded-lg shadow-sm"
                                            >
                                                <Scan size={20} />
                                            </button>
                                        }
                                    />
                                </div>
                                <Button type="submit" disabled={loading} style={{ height: '42px', padding: '0 1rem' }}>
                                    {loading && !orderInfo ? 'Searching...' : 'Search'}
                                </Button>
                            </div>
                        </form>
                    </div>

                    {/* Order Details */}
                    {orderInfo && (
                        <div className="bg-white shadow-sm border border-slate-200 rounded-xl overflow-hidden flex flex-col">
                            <div className="bg-slate-100 p-3 border-b border-slate-200 flex justify-between items-center">
                                <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                    <ClipboardList size={18} className="text-brand-blue" />
                                    Order: {orderInfo.WarehouseOrder}
                                </h2>
                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${orderInfo.WarehouseOrderStatus === 'C' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                                    {orderInfo.WarehouseOrderStatus === 'C' ? 'Completed' : 'Open'}
                                </span>
                            </div>
                            <div className="p-4 flex flex-col gap-4 text-sm">
                                <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                                    <div>
                                        <p className="text-slate-500 text-xs font-semibold mb-1 uppercase tracking-wider">Queue</p>
                                        <p className="font-medium text-slate-800">{orderInfo.EWMWarehouseOrderQueue || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500 text-xs font-semibold mb-1 uppercase tracking-wider">Creation Date</p>
                                        <p className="font-medium text-slate-800">{orderInfo.CreationDateTime ? new Date(orderInfo.CreationDateTime).toLocaleDateString() : '—'}</p>
                                    </div>
                                </div>
                                <div className="border-t border-slate-100 pt-3">
                                    <p className="text-slate-500 text-xs font-semibold mb-1 uppercase tracking-wider">Resource Assignment</p>
                                    <div className="flex items-center justify-between">
                                        {orderInfo.EWMResource ? (
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-brand-blue">
                                                    <User size={16} />
                                                </div>
                                                <span className="font-bold text-slate-800">{orderInfo.EWMResource}</span>
                                            </div>
                                        ) : (
                                            <span className="text-slate-400 italic">Unassigned</span>
                                        )}
                                        {orderInfo.EWMResource ? (
                                            <button onClick={doUnassignResource} disabled={loading} className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded text-xs font-bold transition-colors">
                                                Unassign
                                            </button>
                                        ) : (
                                            <button onClick={() => { setResourceInput(''); setShowAssignResourceModal(true); }} disabled={loading} className="px-3 py-1.5 bg-blue-50 text-brand-blue hover:bg-blue-100 rounded text-xs font-bold transition-colors">
                                                Assign Resource
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Pick HUs */}
                    {orderInfo && (
                        <div className="bg-white shadow-sm border border-slate-200 rounded-xl overflow-hidden flex flex-col">
                            <div className="bg-slate-100 p-3 border-b border-slate-200 flex justify-between items-center">
                                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                    <Box size={18} className="text-orange-600" />
                                    Pick HUs ({pickHUs.length})
                                </h3>
                                <button onClick={() => { setHuInput(''); setShowAssignHUModal(true); }} disabled={loading} className="w-8 h-8 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center hover:bg-orange-200 transition-colors" title="Assign Pick HU">
                                    <Plus size={18} />
                                </button>
                            </div>
                            <div className="p-0">
                                {pickHUs.length === 0 ? (
                                    <div className="p-4 text-center text-sm text-slate-400 italic">No Pick-HUs assigned.</div>
                                ) : (
                                    <ul className="divide-y divide-slate-100">
                                        {pickHUs.map((hu, i) => (
                                            <li key={i} className="flex justify-between items-center p-3 hover:bg-slate-50 transition-colors">
                                                <span className="font-mono font-medium text-slate-700">{hu.HandlingUnitExternalID}</span>
                                                <button onClick={() => doUnassignHU(hu.HandlingUnitExternalID)} disabled={loading} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Unassign HU">
                                                    <Trash2 size={16} />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Tasks */}
                    {orderInfo && (
                        <div className="bg-white shadow-sm border border-slate-200 rounded-xl overflow-hidden flex flex-col">
                            <div className="bg-slate-100 p-3 border-b border-slate-200">
                                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                    <List size={18} className="text-slate-600" />
                                    Tasks ({tasks.length})
                                </h3>
                            </div>
                            {tasks.length === 0 ? (
                                <div className="p-4 text-center text-sm text-slate-400 italic">No tasks found.</div>
                            ) : (
                                <ul className="divide-y divide-slate-100">
                                    {tasks.map((t, idx) => (
                                        <li key={idx} className="p-3">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-xs font-bold text-slate-500 uppercase">Item {t.WarehouseTaskItem || t.Item}</span>
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${t.WarehouseTaskStatus === 'C' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                                    {t.WarehouseTaskStatus === 'C' ? 'Confirmed' : 'Open'}
                                                </span>
                                            </div>
                                            <div className="text-sm font-medium text-slate-800 mb-1">
                                                {t.Product || 'HU Task'}
                                            </div>
                                            <div className="text-xs text-slate-500 flex justify-between">
                                                <span>{t.SourceStorageBin || 'N/A'} → {t.DestinationStorageBin || 'N/A'}</span>
                                                <span className="font-mono">{t.TargetQuantityInBaseUnit ? parseFloat(t.TargetQuantityInBaseUnit) : ''} {t.BaseUnit || ''}</span>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Modals & Overlays */}
            {showScanner && (
                <div className="fixed inset-0 z-50 bg-black flex flex-col">
                    <div className="p-4 flex justify-between items-center bg-black/50 absolute top-0 w-full z-10 pt-12">
                        <h2 className="text-white font-bold">Scan Barcode</h2>
                        <button onClick={() => setShowScanner(false)} className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white"><X size={24} /></button>
                    </div>
                    <div className="flex-1 relative">
                        <BarcodeScanner onScan={handleScanComplete} active={showScanner} />
                    </div>
                </div>
            )}

            {showAssignResourceModal && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800">Assign Resource</h3>
                            <button onClick={() => setShowAssignResourceModal(false)} className="text-slate-400 hover:text-slate-600 p-1"><X size={20} /></button>
                        </div>
                        <div className="p-4">
                            <Input
                                label="Resource ID"
                                value={resourceInput}
                                onChange={(e) => setResourceInput(e.target.value.toUpperCase())}
                                placeholder="Scan or type Resource..."
                                className="uppercase font-mono"
                                autoFocus
                                rightIcon={
                                    <button onClick={() => { setShowAssignResourceModal(true); setShowScanner(true); }} className="w-9 h-9 flex items-center justify-center text-brand-blue bg-blue-50 rounded-lg"><Scan size={20} /></button>
                                }
                            />
                        </div>
                        <div className="p-4 border-t border-slate-100 flex gap-3">
                            <Button variant="secondary" onClick={() => setShowAssignResourceModal(false)} className="flex-1">Cancel</Button>
                            <Button onClick={doAssignResource} className="flex-1">Assign</Button>
                        </div>
                    </div>
                </div>
            )}

            {showAssignHUModal && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800">Assign Pick-HU</h3>
                            <button onClick={() => setShowAssignHUModal(false)} className="text-slate-400 hover:text-slate-600 p-1"><X size={20} /></button>
                        </div>
                        <div className="p-4">
                            <Input
                                label="Handling Unit ID"
                                value={huInput}
                                onChange={(e) => setHuInput(e.target.value.toUpperCase())}
                                placeholder="Scan or type HU..."
                                className="uppercase font-mono flex-1"
                                autoFocus
                                rightIcon={
                                    <button onClick={() => { setShowAssignHUModal(true); setShowScanner(true); }} className="w-9 h-9 flex items-center justify-center text-brand-blue bg-blue-50 rounded-lg"><Scan size={20} /></button>
                                }
                            />
                        </div>
                        <div className="p-4 border-t border-slate-100 flex gap-3">
                            <Button variant="secondary" onClick={() => setShowAssignHUModal(false)} className="flex-1">Cancel</Button>
                            <Button onClick={doAssignHU} className="flex-1">Assign</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ManageWarehouseOrder;
