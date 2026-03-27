import React, { useState, useMemo } from 'react';
import { Search, X, Server, AlertCircle } from 'lucide-react';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

const WarehouseValueHelp = ({ onSelect, onClose, warehouses = [], loading = false }) => {
    const [filterText, setFilterText] = useState('');

    const filteredWarehouses = useMemo(() => {
        if (!warehouses) return [];
        return warehouses.filter(w => {
            if (!filterText) return true;
            const upper = filterText.toUpperCase();
            const matchId = w.Warehouse && w.Warehouse.toUpperCase().includes(upper);
            const matchDesc = w.WarehouseDescription && w.WarehouseDescription.toUpperCase().includes(upper);
            return matchId || matchDesc;
        });
    }, [warehouses, filterText]);

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
                        <h3 className="text-lg font-bold text-gray-800">Select Warehouse</h3>
                        <p className="text-xs text-brand-blue font-medium mt-0.5 flex items-center gap-1">
                            <Server size={12} />
                            {filteredWarehouses.length} of {warehouses?.length || 0} Shown
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 p-0 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Search */}
                <div className="px-4 pt-3 pb-3 border-b border-gray-100 shrink-0">
                    <Input
                        leftIcon={<Search size={16} className="text-gray-400" />}
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        placeholder="Search by ID or Name..."
                        autoFocus
                        rightIcon={
                            filterText && (
                                <button onClick={() => setFilterText('')} className="p-1 mr-1 text-gray-400 hover:text-gray-600">
                                    <X size={14} />
                                </button>
                            )
                        }
                    />
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50" style={{ WebkitOverflowScrolling: 'touch' }}>
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-32 text-gray-500">
                            <div className="w-8 h-8 border-4 border-brand-blue border-t-transparent rounded-full animate-spin mb-3"></div>
                            <p className="text-sm font-medium">Fetching warehouses...</p>
                        </div>
                    ) : filteredWarehouses.length === 0 ? (
                        <div className="text-center py-10 px-4">
                            <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-3">
                                <AlertCircle size={28} />
                            </div>
                            <p className="text-gray-700 font-bold text-base mb-1">No Warehouses Found</p>
                            <p className="text-xs text-gray-400 mt-1">
                                {filterText ? 'No warehouses match your search.' : 'No warehouses available.'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredWarehouses.map((w) => (
                                <button
                                    key={w.Warehouse || w.EWMWarehouse}
                                    type="button"
                                    onClick={() => onSelect(w.Warehouse || w.EWMWarehouse)}
                                    className="w-full text-left bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:border-brand-blue hover:shadow-md transition-all active:scale-[0.98] group cursor-pointer block flex items-center gap-3"
                                >
                                    <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                        <Server size={18} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-bold text-gray-800 text-base group-hover:text-brand-blue transition-colors">
                                            {w.Warehouse || w.EWMWarehouse}
                                        </h4>
                                        <p className="text-xs text-slate-500 truncate">
                                            {w.WarehouseDescription || 'No description'}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-white border-t border-gray-100 shrink-0 sm:rounded-b-2xl pb-safe">
                    <Button onClick={onClose} variant="secondary" className="w-full">
                        Close
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default WarehouseValueHelp;
