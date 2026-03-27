import React, { useState, useEffect, useMemo } from 'react';
import { Search, X, Package, AlertCircle, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

/**
 * InboundDeliveryValueHelp
 *
 * Props:
 *   warehouse     – warehouse code (required)
 *   onSelect(val) – callback with the selected delivery number
 *   onClose()     – close the modal
 *   deliveries    – (optional) pre-fetched delivery data with task info
 *   loading       – (optional) external loading state
 */
const InboundDeliveryValueHelp = ({ warehouse, onSelect, onClose, deliveries: externalDeliveries, loading: externalLoading }) => {
    const { apiConfig } = useAuth();
    const [deliveries, setDeliveries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filterText, setFilterText] = useState('');

    // Tri-state task status filters
    const [showNotStarted, setShowNotStarted] = useState(true);
    const [showPartial, setShowPartial] = useState(true);
    const [showCompleted, setShowCompleted] = useState(true);

    // Compute task status for a delivery
    const getTaskStatus = (d) => {
        const open = d.openTaskCount || 0;
        const completed = d.completedTaskCount || 0;
        const total = open + completed;
        if (total === 0) return 'not_started';
        if (completed === 0) return 'not_started';
        if (open === 0) return 'fully_confirmed';
        return 'partially_confirmed';
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'not_started':
                return { label: 'Not Started', bg: 'bg-slate-100', text: 'text-slate-600', icon: Clock };
            case 'partially_confirmed':
                return { label: 'Partial', bg: 'bg-amber-100', text: 'text-amber-700', icon: AlertTriangle };
            case 'fully_confirmed':
                return { label: 'Confirmed', bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle };
            default:
                return { label: 'Unknown', bg: 'bg-slate-100', text: 'text-slate-500', icon: Clock };
        }
    };

    useEffect(() => {
        // If parent passes deliveries (even empty array), use those
        if (Array.isArray(externalDeliveries)) {
            setDeliveries(externalDeliveries);
            setLoading(false);
            return;
        }

        // null means parent is still fetching — show loading spinner, do NOT self-fetch
        if (externalDeliveries === null) {
            setLoading(true);
            return;
        }

        // undefined means no parent data — do our own internal IBD fetch
        const fetchDeliveries = async () => {
            if (!warehouse) {
                setError("Warehouse is required to fetch deliveries.");
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                setError(null);

                // STEP 1: Get the authoritative list of IBDs from the IBD API
                const ibdRes = await api.fetchInboundDeliveriesA2X(apiConfig, { warehouse });
                const allIBDs = (ibdRes && ibdRes.value) ? ibdRes.value : [];
                const validIBDSet = new Set(allIBDs.map(d => (d.EWMInboundDelivery || '').trim()));

                // STEP 2: Pre-populate delivery map from IBD list
                const deliveryMap = new Map();
                allIBDs.forEach(d => {
                    const delNum = (d.EWMInboundDelivery || '').trim();
                    if (!delNum) return;
                    deliveryMap.set(delNum, {
                        EWMInboundDelivery: delNum,
                        openTaskCount: 0,
                        completedTaskCount: 0,
                        totalTaskCount: 0,
                        products: new Set(),
                        Supplier: d.Supplier || '',
                    });
                });

                // STEP 3: Enrich with task counts — but ONLY for known IBDs
                try {
                    const wtRes = await api.fetchWarehouseTasks(apiConfig, { warehouse });
                    const allTasks = (wtRes && wtRes.value) ? wtRes.value : [];
                    allTasks.forEach(t => {
                        const del = (t.EWMDelivery || '').trim();
                        if (!del || !validIBDSet.has(del)) return; // skip OBDs and blank
                        const entry = deliveryMap.get(del);
                        if (!entry) return;
                        if (t.WarehouseTaskStatus === 'C') entry.completedTaskCount++;
                        else entry.openTaskCount++;
                        entry.totalTaskCount = entry.openTaskCount + entry.completedTaskCount;
                        if (t.Product) entry.products.add(t.Product.trim());
                    });
                } catch { /* tasks are optional enrichment */ }

                const ibdList = Array.from(deliveryMap.values()).map(d => ({
                    ...d,
                    products: d.products instanceof Set ? [...d.products] : (d.products || []),
                }));
                ibdList.sort((a, b) => b.openTaskCount - a.openTaskCount);
                setDeliveries(ibdList);
            } catch (err) {
                console.error("Failed to load value help IBDs:", err);
                setError(err.message || "Failed to load deliveries.");
            } finally {
                setLoading(false);
            }
        };

        fetchDeliveries();

    }, [warehouse, apiConfig, externalDeliveries, externalLoading]);

    useEffect(() => {
        if (externalLoading !== undefined) setLoading(externalLoading);
    }, [externalLoading]);

    useEffect(() => {
        if (externalDeliveries !== undefined && externalDeliveries !== null) {
            setDeliveries(externalDeliveries);
            setLoading(false);
        }
    }, [externalDeliveries]);

    // Count deliveries by status
    const statusCounts = useMemo(() => {
        let notStarted = 0, partial = 0, completed = 0;
        deliveries.forEach(d => {
            const status = getTaskStatus(d);
            if (status === 'not_started') notStarted++;
            else if (status === 'partially_confirmed') partial++;
            else if (status === 'fully_confirmed') completed++;
        });
        return { notStarted, partial, completed };
    }, [deliveries]);

    const filteredDeliveries = useMemo(() => {
        return deliveries.filter(d => {
            if (filterText) {
                const upper = filterText.toUpperCase();
                const matchId = d.EWMInboundDelivery && d.EWMInboundDelivery.toUpperCase().includes(upper);
                const matchProduct = d.products && d.products.some(p => p.toUpperCase().includes(upper));
                const matchSupplier = d.Supplier && d.Supplier.toUpperCase().includes(upper);
                if (!matchId && !matchProduct && !matchSupplier) return false;
            }
            const status = getTaskStatus(d);
            if (status === 'not_started' && !showNotStarted) return false;
            if (status === 'partially_confirmed' && !showPartial) return false;
            if (status === 'fully_confirmed' && !showCompleted) return false;
            return true;
        });
    }, [deliveries, filterText, showNotStarted, showPartial, showCompleted]);

    const isLoading = loading || externalLoading;

    return (
        <div
            className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            style={{ zIndex: 9999 }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[85vh] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300"
                style={{ position: 'relative', zIndex: 10000, paddingTop: 'env(safe-area-inset-top)' }}
            >
                {/* Header */}
                <div className="flex items-center p-4 border-b border-gray-100 shrink-0">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">Select Inbound Delivery</h3>
                        <p className="text-xs text-brand-blue font-medium mt-0.5 flex items-center gap-1">
                            <Package size={12} />
                            {filteredDeliveries.length} of {deliveries.length} Shown
                        </p>
                    </div>
                </div>

                {/* Search & Filters */}
                <div className="px-4 pt-3 pb-2 border-b border-gray-100 shrink-0">
                    <Input
                        leftIcon={<Search size={16} className="text-gray-400" />}
                        placeholder="Filter by delivery no., supplier..."
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        autoComplete="off"
                        autoFocus
                        rightIcon={
                            filterText && (
                                <button onClick={() => setFilterText('')} className="p-1 mr-2 text-gray-400 hover:text-gray-600">
                                    <X size={14} />
                                </button>
                            )
                        }
                    />

                    {/* Tri-state Task Status Filter */}
                    <div className="flex flex-wrap items-center gap-3 mt-2 mb-1">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input type="checkbox" checked={showNotStarted} onChange={(e) => setShowNotStarted(e.target.checked)}
                                className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue cursor-pointer" style={{ width: 16, height: 16 }} />
                            <span className="text-[11px] text-slate-600 font-medium">Not Started ({statusCounts.notStarted})</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input type="checkbox" checked={showPartial} onChange={(e) => setShowPartial(e.target.checked)}
                                className="rounded border-amber-300 text-brand-blue focus:ring-brand-blue cursor-pointer" style={{ width: 16, height: 16 }} />
                            <span className="text-[11px] text-amber-700 font-medium">Partial ({statusCounts.partial})</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)}
                                className="rounded border-green-300 text-brand-blue focus:ring-brand-blue cursor-pointer" style={{ width: 16, height: 16 }} />
                            <span className="text-[11px] text-green-700 font-medium">Confirmed ({statusCounts.completed})</span>
                        </label>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50" style={{ WebkitOverflowScrolling: 'touch' }}>
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-32 text-gray-500">
                            <div className="w-8 h-8 border-4 border-brand-blue border-t-transparent rounded-full animate-spin mb-3"></div>
                            <p className="text-sm font-medium">Fetching deliveries...</p>
                        </div>
                    ) : error ? (
                        <div className="bg-red-50 text-red-600 p-4 rounded-xl flex items-start gap-3 text-sm">
                            <AlertCircle size={18} className="shrink-0 mt-0.5" />
                            <p>{error}</p>
                        </div>
                    ) : filteredDeliveries.length === 0 ? (
                        <div className="text-center py-10 px-4">
                            <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-3">
                                <AlertCircle size={28} />
                            </div>
                            <p className="text-gray-700 font-bold text-base mb-1">No Deliveries Found</p>
                            <p className="text-xs text-gray-400 mt-1">
                                {filterText || !showNotStarted || !showPartial || !showCompleted ? 'No deliveries match your filter.' : `No inbound deliveries found in warehouse ${warehouse}.`}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredDeliveries.map((ibd) => {
                                const status = getTaskStatus(ibd);
                                const badge = getStatusBadge(status);
                                const BadgeIcon = badge.icon;
                                return (
                                    <button
                                        key={ibd.EWMInboundDelivery}
                                        type="button"
                                        onClick={() => onSelect(ibd.EWMInboundDelivery)}
                                        className="w-full text-left bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:border-brand-blue hover:shadow-md transition-all active:scale-[0.98] group cursor-pointer block"
                                        style={{ height: 'auto', minHeight: '56px', display: 'block', padding: '1rem' }}
                                    >
                                        <div className="flex justify-between items-start">
                                            <h4 className="font-bold text-gray-800 text-base group-hover:text-brand-blue transition-colors">
                                                {ibd.EWMInboundDelivery}
                                            </h4>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${badge.bg} ${badge.text}`}>
                                                <BadgeIcon size={10} />
                                                {badge.label}
                                            </span>
                                        </div>

                                        <div className="mt-2 space-y-1">
                                            <p className="text-xs text-slate-500">
                                                <span className="font-semibold text-gray-600">Tasks:</span>{' '}
                                                {ibd.totalTaskCount || 0} total
                                                {(ibd.openTaskCount || 0) > 0 && <span className="text-amber-600 font-semibold"> • {ibd.openTaskCount} open</span>}
                                                {(ibd.completedTaskCount || 0) > 0 && <span className="text-green-600"> • {ibd.completedTaskCount} done</span>}
                                            </p>
                                            {ibd.products && ibd.products.length > 0 && (
                                                <p className="text-[11px] text-gray-400 truncate">
                                                    Products: {ibd.products.join(', ')}
                                                </p>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-white border-t border-gray-100 shrink-0 sm:rounded-b-2xl pb-safe">
                    <Button
                        variant="secondary"
                        onClick={onClose}
                        className="w-full"
                    >
                        Close
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default InboundDeliveryValueHelp;
