import React, { useState, useMemo } from 'react';
import { Search, X, Package, AlertCircle, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

/**
 * OutboundDeliveryValueHelp
 *
 * Props:
 *   onSelect(val) – callback with the selected delivery number
 *   onClose()     – close the modal
 *   deliveries    – pre-fetched delivery data with task info
 *   loading       – external loading state
 */
const OutboundDeliveryValueHelp = ({ onSelect, onClose, deliveries = [], loading = false }) => {
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
            // Text filter
            if (filterText) {
                const upper = filterText.toUpperCase();
                const matchId = d.EWMOutboundDelivery && d.EWMOutboundDelivery.toUpperCase().includes(upper);
                const matchProduct = d.products && d.products.some(p => p.toUpperCase().includes(upper));
                const matchShipTo = d.shipToParty && d.shipToParty.toUpperCase().includes(upper);
                if (!matchId && !matchProduct && !matchShipTo) return false;
            }
            // Status filter
            const status = getTaskStatus(d);
            if (status === 'not_started' && showNotStarted) return true;
            if (status === 'partially_confirmed' && showPartial) return true;
            if (status === 'fully_confirmed' && showCompleted) return true;
            return false;
        });
    }, [deliveries, filterText, showNotStarted, showPartial, showCompleted]);

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
                <div className="flex justify-between items-center p-4 border-b border-gray-100 shrink-0">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">Select Delivery</h3>
                        <p className="text-xs text-brand-blue font-medium mt-0.5 flex items-center gap-1">
                            <Package size={12} />
                            {filteredDeliveries.length} of {deliveries.length} Shown
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 p-0 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Search & Filters */}
                <div className="px-4 pt-3 pb-2 border-b border-gray-100 shrink-0">
                    <Input
                        leftIcon={<Search size={16} className="text-gray-400" />}
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        placeholder="Filter by delivery no., supplier..."
                        autoFocus
                        rightIcon={
                            filterText && (
                                <button onClick={() => setFilterText('')} className="p-1 mr-1 text-gray-400 hover:text-gray-600">
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
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-32 text-gray-500">
                            <div className="w-8 h-8 border-4 border-brand-blue border-t-transparent rounded-full animate-spin mb-3"></div>
                            <p className="text-sm font-medium">Fetching deliveries...</p>
                        </div>
                    ) : filteredDeliveries.length === 0 ? (
                        <div className="text-center py-10 px-4">
                            <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-3">
                                <AlertCircle size={28} />
                            </div>
                            <p className="text-gray-700 font-bold text-base mb-1">No Deliveries Found</p>
                            <p className="text-xs text-gray-400 mt-1">
                                {filterText ? 'No deliveries match your filter.' : 'No outbound deliveries with picking tasks found.'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredDeliveries.map((obd) => {
                                const status = getTaskStatus(obd);
                                const badge = getStatusBadge(status);
                                const BadgeIcon = badge.icon;
                                return (
                                    <button
                                        key={obd.EWMOutboundDelivery}
                                        type="button"
                                        onClick={() => onSelect(obd.EWMOutboundDelivery)}
                                        className="w-full text-left bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:border-brand-blue hover:shadow-md transition-all active:scale-[0.98] group cursor-pointer block"
                                        style={{ height: 'auto', minHeight: '56px', display: 'block', padding: '1rem' }}
                                    >
                                        <div className="flex justify-between items-start">
                                            <h4 className="font-bold text-gray-800 text-base group-hover:text-brand-blue transition-colors">
                                                {obd.EWMOutboundDelivery}
                                            </h4>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${badge.bg} ${badge.text}`}>
                                                <BadgeIcon size={10} />
                                                {badge.label}
                                            </span>
                                        </div>

                                        <div className="mt-2 space-y-1">
                                            <p className="text-xs text-slate-500">
                                                <span className="font-semibold text-gray-600">Tasks:</span>{' '}
                                                {obd.totalTaskCount || 0} total
                                                {(obd.openTaskCount || 0) > 0 && <span className="text-amber-600 font-semibold"> • {obd.openTaskCount} open</span>}
                                                {(obd.completedTaskCount || 0) > 0 && <span className="text-green-600"> • {obd.completedTaskCount} done</span>}
                                            </p>
                                            {obd.shipToParty && (
                                                <p className="text-[11px] text-gray-400 truncate">
                                                    Ship-To: {obd.shipToParty}
                                                </p>
                                            )}
                                            {obd.products && obd.products.length > 0 && (
                                                <p className="text-[11px] text-gray-400 truncate">
                                                    Products: {obd.products.join(', ')}
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
                        onClick={onClose}
                        variant="secondary"
                        className="w-full"
                    >
                        Close
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default OutboundDeliveryValueHelp;
