/**
 * @file WarehouseOutbound.jsx
 * @description Screen: Warehouse Outbound Sub-Menu
 *
 * Landing screen for EWM Outbound processing. Provides navigation tiles to:
 *  - Manage Outbound Deliveries → /warehouse-outbound/deliveries
 *  - Manage Picking → /warehouse-outbound/picking
 *
 * Uses swipe-back gesture (useSwipeBack hook) to navigate to the previous screen.
 *
 * @route /warehouse-outbound
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PackageOpen, ArrowUpFromLine } from 'lucide-react';
import { useSwipeBack } from '../hooks/useSwipeBack';
import PageHeader from '../components/PageHeader';

const WarehouseOutbound = () => {
    const navigate = useNavigate();

    useSwipeBack(() => navigate(-1));

    return (
        <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
            <PageHeader title="Outbound" subtitle="Processing" />

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-4 content-area pb-8">
                <div className="max-w-md mx-auto flex flex-col gap-4 mt-6">
                    <button
                        onClick={() => navigate('/warehouse-outbound/deliveries')}
                        className="glass-card flex flex-col items-center justify-center gap-4 hover:shadow-md transition-shadow active:scale-[0.98] w-full"
                        style={{ border: '1px solid #e2e8f0', minHeight: '180px', height: 'auto', padding: '1.5rem', borderRadius: '1rem' }}
                    >
                        <div style={{ width: '4rem', height: '4rem', backgroundColor: '#ffedd5', borderRadius: '50%', color: '#ea580c', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <ArrowUpFromLine size={32} />
                        </div>
                        <div className="text-center">
                            <h2 className="text-xl font-bold text-brand-blue" style={{ margin: 0 }}>Manage Outbound Deliveries</h2>
                            <p className="text-sm text-slate-500 mt-1" style={{ marginTop: '0.25rem' }}>Search deliveries and create warehouse tasks</p>
                        </div>
                    </button>

                    <button
                        onClick={() => navigate('/warehouse-outbound/picking')}
                        className="glass-card flex flex-col items-center justify-center gap-4 hover:shadow-md transition-shadow active:scale-[0.98] w-full"
                        style={{ border: '1px solid #e2e8f0', minHeight: '180px', height: 'auto', padding: '1.5rem', borderRadius: '1rem' }}
                    >
                        <div style={{ width: '4rem', height: '4rem', backgroundColor: '#d1fae5', borderRadius: '50%', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <PackageOpen size={32} />
                        </div>
                        <div className="text-center">
                            <h2 className="text-xl font-bold text-brand-blue" style={{ margin: 0 }}>Manage Picking</h2>
                            <p className="text-sm text-slate-500 mt-1" style={{ marginTop: '0.25rem' }}>Confirm warehouse tasks and pick handling units</p>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WarehouseOutbound;
