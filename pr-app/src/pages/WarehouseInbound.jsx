/**
 * @file WarehouseInbound.jsx
 * @description Screen: Warehouse Inbound Sub-Menu
 *
 * Landing screen for EWM Inbound processing. Provides navigation tiles to:
 *  - Manage Inbound Deliveries → /warehouse-inbound/deliveries
 *  - Manage Putaway → /warehouse-inbound/putaway
 *
 * Uses swipe-back gesture (useSwipeBack hook) to navigate to the previous screen.
 *
 * @route /warehouse-inbound
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PackageOpen, ArrowDownToLine } from 'lucide-react';
import { useSwipeBack } from '../hooks/useSwipeBack';
import PageHeader from '../components/PageHeader';

const WarehouseInbound = () => {
    const navigate = useNavigate();

    useSwipeBack(() => navigate(-1));

    return (
        <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
            <PageHeader title="Inbound" subtitle="Processing" />

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-4 content-area pb-8">
                <div className="max-w-md mx-auto flex flex-col gap-4 mt-6">
                    <button
                        onClick={() => navigate('/warehouse-inbound/deliveries')}
                        className="glass-card flex flex-col items-center justify-center gap-4 hover:shadow-md transition-shadow active:scale-[0.98] w-full"
                        style={{ border: '1px solid #e2e8f0', minHeight: '180px', height: 'auto', padding: '1.5rem', borderRadius: '1rem' }}
                    >
                        <div style={{ width: '4rem', height: '4rem', backgroundColor: '#dbeafe', borderRadius: '50%', color: '#1C2C5E', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <ArrowDownToLine size={32} />
                        </div>
                        <div className="text-center">
                            <h2 className="text-xl font-bold text-brand-blue" style={{ margin: 0 }}>Manage Inbound Deliveries</h2>
                            <p className="text-sm text-slate-500 mt-1" style={{ marginTop: '0.25rem' }}>Search deliveries and create warehouse tasks</p>
                        </div>
                    </button>

                    <button
                        onClick={() => navigate('/warehouse-inbound/putaway')}
                        className="glass-card flex flex-col items-center justify-center gap-4 hover:shadow-md transition-shadow active:scale-[0.98] w-full"
                        style={{ border: '1px solid #e2e8f0', minHeight: '180px', height: 'auto', padding: '1.5rem', borderRadius: '1rem' }}
                    >
                        <div style={{ width: '4rem', height: '4rem', backgroundColor: '#d1fae5', borderRadius: '50%', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <PackageOpen size={32} />
                        </div>
                        <div className="text-center">
                            <h2 className="text-xl font-bold text-brand-blue" style={{ margin: 0 }}>Manage Putaway</h2>
                            <p className="text-sm text-slate-500 mt-1" style={{ marginTop: '0.25rem' }}>Confirm warehouse tasks and process handling units</p>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WarehouseInbound;
