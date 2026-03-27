import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Home, PackageOpen, AlertCircle, Loader, X, ChevronRight, SearchX, Search, Filter, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { useSwipeBack } from '../../hooks/useSwipeBack';

const InboundDeliveryList = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { apiConfig } = useAuth();

    useSwipeBack(() => navigate(-1));

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [deliveries, setDeliveries] = useState([]);

    // Task data
    const [taskMap, setTaskMap] = useState(new Map());
    const [taskLoading, setTaskLoading] = useState(false);

    // Filter state
    const [filterText, setFilterText] = useState('');
    const [showCompleted, setShowCompleted] = useState(true);
    const [showOpen, setShowOpen] = useState(true);

    // Task status tri-state filter
    const [showTaskNotStarted, setShowTaskNotStarted] = useState(true);
    const [showTaskPartial, setShowTaskPartial] = useState(true);
    const [showTaskConfirmed, setShowTaskConfirmed] = useState(true);

    // Extract state passed from Search screen
    const { filters, searchBy, searchValue, deliveries: passedDeliveries } = location.state || {};

    // Fetch warehouse tasks for enrichment
    const fetchTaskData = async (warehouse) => {
        setTaskLoading(true);
        try {
            const wtRes = await api.fetchWarehouseTasks(apiConfig, { warehouse });
            const allTasks = (wtRes && wtRes.value) ? wtRes.value : [];
            const map = new Map();
            allTasks.forEach(t => {
                const del = (t.EWMDelivery || '').trim();
                if (!del) return;
                if (!map.has(del)) {
                    map.set(del, { open: 0, completed: 0, products: new Set() });
                }
                const entry = map.get(del);
                if (t.WarehouseTaskStatus === 'C') {
                    entry.completed++;
                } else {
                    entry.open++;
                }
                if (t.Product) entry.products.add(t.Product.trim());
            });
            setTaskMap(map);
        } catch (err) {
            console.warn("Failed to fetch task data for enrichment:", err);
        } finally {
            setTaskLoading(false);
        }
    };

    useEffect(() => {
        if (!filters && !passedDeliveries) {
            navigate('/warehouse-inbound/deliveries');
            return;
        }
        if (passedDeliveries && passedDeliveries.length > 0) {
            enrichDeliveries(passedDeliveries);
        } else {
            fetchData();
        }
        // eslint-disable-next-line
    }, [filters, apiConfig]);

    useEffect(() => {
        const warehouse = filters?.warehouse || (deliveries.length > 0 ? deliveries[0].EWMWarehouse : null);
        if (warehouse) {
            fetchTaskData(warehouse);
        }
    }, [deliveries, filters, apiConfig]);

    const enrichDeliveries = async (ewmDocs) => {
        setLoading(true);
        setError(null);
        try {
            const enrichedDocs = await Promise.all(
                ewmDocs.map(async (doc) => {
                    let imData = null;
                    try {
                        const imRes = await api.fetchIMInboundDeliveryHeader(apiConfig, doc.EWMInboundDelivery);
                        if (imRes && imRes.d) {
                            imData = imRes.d;
                        }
                    } catch (e) {
                        console.warn(`Failed to fetch IM data for ${doc.EWMInboundDelivery}`, e);
                    }
                    return { ...doc, imData };
                })
            );
            setDeliveries(enrichedDocs);
        } catch (err) {
            setError(err.message || 'Error occurred while loading deliveries.');
        } finally {
            setLoading(false);
        }
    };

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.fetchInboundDeliveriesA2X(apiConfig, filters);
            if (!res || !res.value || res.value.length === 0) {
                setDeliveries([]);
                setLoading(false);
                return;
            }
            const ewmDocs = res.value;
            if (ewmDocs.length === 1 && searchBy === 'IBD') {
                navigate(`/warehouse-inbound/deliveries/${ewmDocs[0].EWMWarehouse}/${ewmDocs[0].EWMInboundDelivery}`);
                return;
            }
            await enrichDeliveries(ewmDocs);
        } catch (err) {
            setError(err.message || 'Error occurred while loading deliveries.');
        } finally {
            setLoading(false);
        }
    };

    const getSupplierName = (imData, fallbackDoc) => {
        if (imData?.to_DeliveryDocumentPartner?.results) {
            const vendorPartner = imData.to_DeliveryDocumentPartner.results.find(p => p.PartnerFunction === 'LF' || p.PartnerFunction === 'VN');
            if (vendorPartner && vendorPartner.SupplierName) return vendorPartner.SupplierName;
        }
        return fallbackDoc.ShipFromPartyName || fallbackDoc.Supplier || fallbackDoc.ASN || 'N/A';
    };

    const formatDDMMYYYY = (dateString) => {
        if (!dateString) return 'N/A';
        try {
            if (dateString.includes('/Date(')) {
                const ms = parseInt(dateString.match(/\d+/)[0], 10);
                const dt = new Date(ms);
                return `${String(dt.getUTCDate()).padStart(2, '0')}.${String(dt.getUTCMonth() + 1).padStart(2, '0')}.${dt.getUTCFullYear()}`;
            }
            const dt = new Date(dateString);
            if (isNaN(dt.getTime())) return dateString;
            return `${String(dt.getUTCDate()).padStart(2, '0')}.${String(dt.getUTCMonth() + 1).padStart(2, '0')}.${dt.getUTCFullYear()}`;
        } catch { return dateString; }
    };

    const getGRStatus = (doc) => doc.imData?.OverallGoodsMovementStatus || doc.WarehouseProcessingStatus || 'A';

    const getBadgeStyle = (status) => {
        switch (status) {
            case 'A': return { text: 'Not Started', classes: 'text-gray-500 font-bold' };
            case 'B': return { text: 'Partial', classes: 'text-orange-600 font-bold' };
            case 'C': return { text: 'Completed', classes: 'text-emerald-600 font-bold' };
            default: return { text: status || 'Not Started', classes: 'text-gray-500 font-bold' };
        }
    };

    const getTaskStatus = (doc) => {
        const delNum = (doc.EWMInboundDelivery || '').trim();
        const taskInfo = taskMap.get(delNum);
        if (!taskInfo) return 'not_started';
        const total = taskInfo.open + taskInfo.completed;
        if (total === 0) return 'not_started';
        if (taskInfo.completed === 0) return 'not_started';
        if (taskInfo.open === 0) return 'fully_confirmed';
        return 'partially_confirmed';
    };

    const getTaskBadge = (status) => {
        switch (status) {
            case 'not_started': return { label: 'Not Started', bg: 'bg-slate-100', text: 'text-slate-600', icon: Clock };
            case 'partially_confirmed': return { label: 'Partial', bg: 'bg-amber-100', text: 'text-amber-700', icon: AlertTriangle };
            case 'fully_confirmed': return { label: 'Confirmed', bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle };
            default: return { label: 'Unknown', bg: 'bg-slate-100', text: 'text-slate-500', icon: Clock };
        }
    };

    const getTaskInfo = (doc) => {
        const delNum = (doc.EWMInboundDelivery || '').trim();
        return taskMap.get(delNum) || { open: 0, completed: 0, products: new Set() };
    };

    const taskStatusCounts = useMemo(() => {
        let notStarted = 0, partial = 0, confirmed = 0;
        deliveries.forEach(doc => {
            const status = getTaskStatus(doc);
            if (status === 'not_started') notStarted++;
            else if (status === 'partially_confirmed') partial++;
            else if (status === 'fully_confirmed') confirmed++;
        });
        return { notStarted, partial, confirmed };
    }, [deliveries, taskMap]);

    const filteredDeliveries = useMemo(() => {
        return deliveries.filter(doc => {
            if (filterText) {
                const text = filterText.toUpperCase();
                const deliveryNum = (doc.EWMInboundDelivery || '').toUpperCase();
                const supplier = getSupplierName(doc.imData, doc).toUpperCase();
                const warehouse = (doc.EWMWarehouse || '').toUpperCase();
                if (!deliveryNum.includes(text) && !supplier.includes(text) && !warehouse.includes(text)) return false;
            }
            const grStatus = getGRStatus(doc);
            if (!showCompleted && grStatus === 'C') return false;
            if (!showOpen && (grStatus === 'A' || grStatus === 'B')) return false;
            const taskStatus = getTaskStatus(doc);
            if (taskStatus === 'not_started' && !showTaskNotStarted) return false;
            if (taskStatus === 'partially_confirmed' && !showTaskPartial) return false;
            if (taskStatus === 'fully_confirmed' && !showTaskConfirmed) return false;
            return true;
        });
    }, [deliveries, filterText, showCompleted, showOpen, showTaskNotStarted, showTaskPartial, showTaskConfirmed, taskMap]);

    const renderError = () => {
        if (!error) return null;
        return (
            <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg shadow-sm flex items-start justify-between">
                <div className="flex gap-3">
                    <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                    <p className="text-sm text-red-700 whitespace-pre-wrap">{error}</p>
                </div>
                <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-md shrink-0 ml-4"><X size={16} className="text-red-500" /></button>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
            <header className="app-header-straight pb-3 px-6 shadow-md flex-none z-20 relative rounded-b-curved" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
                <div className="flex justify-between items-center relative">
                    <button onClick={() => navigate(-1)} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" disabled={loading} title="Back">
                                            <ArrowLeft size={20} className="text-white" />
                                        </button>
                    
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <h1 className="text-xl font-bold text-white tracking-wide">
                            Select Delivery
                        </h1>
                                                <p className="text-blue-200 text-[10px] font-medium uppercase tracking-wider mt-0.5">
                                                    {loading ? 'Loading...' : deliveries.length > 0 ? `${filteredDeliveries.length} of ${deliveries.length} Shown` : 'No Results'}
                                                </p>
                    </div>

                    <button onClick={() => navigate('/menu', { replace: true })} className="z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors" title="Home">
                                            <Home size={20} className="text-white" />
                                        </button>
                </div>
            </header>

            
            {/* EXPANDED FILTER BAR (FIXED) */}
            {!loading && deliveries.length > 0 && (
                <div className="flex-none bg-slate-50 z-20 shadow-sm border-b border-slate-200 pb-3 pt-4 px-4">
                    <div className="max-w-md mx-auto">
                        <div className="flex flex-col gap-1.5">
                                                            {/* Search input */}
                                <div className="relative flex items-center w-full border border-gray-300 rounded-lg bg-white shadow-sm focus-within:ring-2 focus-within:ring-brand-blue focus-within:border-brand-blue transition-all overflow-hidden mb-2">
                                    <div className="pl-3 pr-2 flex items-center pointer-events-none text-gray-400"><Search size={16} /></div>
                                    <input type="text" placeholder="Filter by delivery no., supplier..." className="w-full py-2.5 pr-8 bg-transparent text-sm border-none focus:ring-0 outline-none" value={filterText} onChange={(e) => setFilterText(e.target.value)} autoComplete="off" />
                                    {filterText && (<button onClick={() => setFilterText('')} className="absolute right-2 p-1 text-gray-300 hover:text-gray-500 rounded-md transition-colors"><X size={14} /></button>)}
                                </div>

                                {/* GR Status filter */}
                                <div className="flex flex-wrap items-center gap-3 text-[11px] mb-1.5">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-1">GR:</span>
                                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                        <input type="checkbox" checked={showOpen} onChange={(e) => setShowOpen(e.target.checked)} className="rounded border-gray-300 text-brand-blue focus:ring-brand-blue cursor-pointer" style={{ width: 16, height: 16 }} />
                                        <span className="font-medium text-gray-600">Open / In Progress</span>
                                    </label>
                                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                        <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} className="rounded border-gray-300 text-brand-blue focus:ring-brand-blue cursor-pointer" style={{ width: 16, height: 16 }} />
                                        <span className="font-medium text-gray-600">Completed</span>
                                    </label>
                                </div>

                                {/* Task Status filter */}
                                <div className="flex flex-wrap items-center gap-3 text-[11px]">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-1">Tasks:</span>
                                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                        <input type="checkbox" checked={showTaskNotStarted} onChange={(e) => setShowTaskNotStarted(e.target.checked)} className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue cursor-pointer" style={{ width: 16, height: 16 }} />
                                        <span className="font-medium text-slate-600">Not Started ({taskStatusCounts.notStarted})</span>
                                    </label>
                                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                        <input type="checkbox" checked={showTaskPartial} onChange={(e) => setShowTaskPartial(e.target.checked)} className="rounded border-amber-300 text-brand-blue focus:ring-brand-blue cursor-pointer" style={{ width: 16, height: 16 }} />
                                        <span className="font-medium text-amber-700">Partial ({taskStatusCounts.partial})</span>
                                    </label>
                                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                        <input type="checkbox" checked={showTaskConfirmed} onChange={(e) => setShowTaskConfirmed(e.target.checked)} className="rounded border-green-300 text-brand-blue focus:ring-brand-blue cursor-pointer" style={{ width: 16, height: 16 }} />
                                        <span className="font-medium text-green-700">Confirmed ({taskStatusCounts.confirmed})</span>
                                    </label>
                                    {taskLoading && (
                                        <span className="text-[10px] text-gray-400 flex items-center gap-1">
                                            <div className="w-3 h-3 border-2 border-brand-blue border-t-transparent rounded-full animate-spin"></div>
                                        </span>
                                    )}
                                </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-y-auto px-4 pb-8 content-area" style={{ zIndex: 10, position: 'relative' }}>
                <div className="max-w-md mx-auto pt-4">
                    {renderError()}
                    {loading ? (
                        <div className="flex flex-col justify-center items-center py-20 text-blue-600 space-y-4">
                            <Loader size={48} className="animate-spin" />
                            <p className="font-semibold text-gray-500 text-sm">Loading Deliveries...</p>
                        </div>
                    ) : deliveries.length > 0 ? (
                        <div className="pb-8">
                            {/* Delivery Cards */}
                            <div className="space-y-3 mt-2 px-2">
                                {filteredDeliveries.length > 0 ? (
                                    filteredDeliveries.map((doc, idx) => {
                                        const imData = doc.imData;
                                        const totalItemsCounts = imData?.to_DeliveryDocumentItem?.results?.length || 0;
                                        const grStatus = getGRStatus(doc);
                                        const badge = getBadgeStyle(grStatus);
                                        const supplierName = getSupplierName(imData, doc);
                                        const plannedGIDate = formatDDMMYYYY(doc.PlannedDeliveryUTCDateTime || imData?.DeliveryDate);
                                        const taskStatus = getTaskStatus(doc);
                                        const taskBadge = getTaskBadge(taskStatus);
                                        const TaskIcon = taskBadge.icon;
                                        const tInfo = getTaskInfo(doc);
                                        const totalTasks = tInfo.open + tInfo.completed;

                                        return (
                                            <div
                                                key={doc.EWMInboundDelivery + idx}
                                                onClick={() => navigate(`/warehouse-inbound/deliveries/${doc.EWMWarehouse}/${doc.EWMInboundDelivery}`, { state: location.state })}
                                                className="bg-white rounded-xl p-4 shadow border border-slate-200 hover:shadow-lg hover:border-blue-200 cursor-pointer transition-all active:scale-[0.98] flex items-center justify-between group"
                                            >
                                                <div className="flex items-start gap-4 flex-1 min-w-0">
                                                    <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${taskBadge.bg} ${taskBadge.text}`}>
                                                        <TaskIcon size={20} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex justify-between items-start">
                                                            <h3 className="font-bold text-gray-800 text-base">{doc.EWMInboundDelivery}</h3>
                                                            <span className="text-[11px] font-bold ml-2 shrink-0">
                                                                <span className="text-gray-500">GR: </span>
                                                                <span className={badge.classes}>{badge.text}</span>
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-slate-500 mt-0.5 truncate">{supplierName} · {doc.EWMWarehouse}</p>
                                                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${taskBadge.bg} ${taskBadge.text}`}>
                                                                <TaskIcon size={10} />{taskBadge.label}
                                                            </span>
                                                            <span className="text-[11px] text-slate-400">
                                                                {totalTasks > 0 ? `${totalTasks} task${totalTasks !== 1 ? 's' : ''}` : 'No tasks'}
                                                                {tInfo.open > 0 && <span className="text-amber-600 font-semibold"> · {tInfo.open} open</span>}
                                                                {tInfo.completed > 0 && <span className="text-green-600"> · {tInfo.completed} done</span>}
                                                            </span>
                                                        </div>
                                                        <p className="text-[11px] text-gray-400 mt-0.5">{totalItemsCounts} item{totalItemsCounts !== 1 ? 's' : ''} · {plannedGIDate}</p>
                                                    </div>
                                                </div>
                                                <ChevronRight className="text-gray-400 group-hover:text-blue-500 transition-colors shrink-0 ml-2" size={20} />
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                                        <div className="bg-gray-100 p-3 rounded-full mb-3"><Filter size={32} className="text-gray-400" /></div>
                                        <h3 className="text-base font-bold text-gray-700 mb-1">No Matching Deliveries</h3>
                                        <p className="text-sm text-gray-500 max-w-xs">No deliveries match your current filter.</p>
                                        <button onClick={() => { setFilterText(''); setShowCompleted(true); setShowOpen(true); setShowTaskNotStarted(true); setShowTaskPartial(true); setShowTaskConfirmed(true); }} className="mt-4 px-5 py-2 bg-brand-blue text-white rounded-lg font-medium text-sm hover:opacity-90 transition-colors">Clear Filters</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 px-4 text-center mt-10">
                            <div className="bg-gray-100 p-4 rounded-full mb-4"><SearchX size={48} className="text-gray-400" /></div>
                            <h3 className="text-lg font-bold text-gray-700 mb-1">No Inbound Deliveries Found</h3>
                            <p className="text-sm text-gray-500 max-w-xs">We couldn't find any inbound deliveries matching your search criteria.</p>

                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default InboundDeliveryList;
