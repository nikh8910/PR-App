/**
 * @file WarehousePacking.jsx
 * @description Screen: Warehouse Packing & Handling Unit Sub-Menu
 *
 * Landing screen for EWM Packing / Handling Unit operations. Provides navigation tiles to:
 *  - HU to HU Transfer (repack items between HUs) → /warehouse-packing/hu-transfer
 *  - Pack Product to HU (scan product + qty → pack into an HU) → /warehouse-packing/pack-product
 *  - Create HU (create a new empty Handling Unit) → /warehouse-packing/create-hu
 *
 * Uses swipe-back gesture (useSwipeBack hook) to navigate to the previous screen.
 *
 * @route /warehouse-packing
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PackagePlus, ArrowLeftRight, Package } from 'lucide-react';
import { useSwipeBack } from '../hooks/useSwipeBack';
import PageHeader from '../components/PageHeader';

const WarehousePacking = () => {
    const navigate = useNavigate();

    useSwipeBack(() => navigate(-1));

    return (
        <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
            <PageHeader title="Packing" subtitle="Handling Units" />

            <div className="flex-1 overflow-y-auto p-4 content-area pb-8">
                <div className="max-w-md mx-auto flex flex-col gap-4 mt-6">
                    <button
                        onClick={() => navigate('/warehouse-packing/hu-transfer')}
                        className="glass-card flex flex-col items-center justify-center gap-4 hover:shadow-md transition-shadow active:scale-[0.98] w-full"
                        style={{ border: '1px solid #e2e8f0', minHeight: '160px', height: 'auto', padding: '1.5rem', borderRadius: '1rem' }}
                    >
                        <div style={{ width: '4rem', height: '4rem', backgroundColor: '#fce7f3', borderRadius: '50%', color: '#db2777', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <ArrowLeftRight size={32} />
                        </div>
                        <div className="text-center">
                            <h2 className="text-xl font-bold text-brand-blue" style={{ margin: 0 }}>HU to HU Transfer</h2>
                            <p className="text-sm text-slate-500 mt-1" style={{ marginTop: '0.25rem' }}>Scan source HU → destination HU to repack</p>
                        </div>
                    </button>

                    <button
                        onClick={() => navigate('/warehouse-packing/pack-product')}
                        className="glass-card flex flex-col items-center justify-center gap-4 hover:shadow-md transition-shadow active:scale-[0.98] w-full"
                        style={{ border: '1px solid #e2e8f0', minHeight: '160px', height: 'auto', padding: '1.5rem', borderRadius: '1rem' }}
                    >
                        <div style={{ width: '4rem', height: '4rem', backgroundColor: '#dbeafe', borderRadius: '50%', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Package size={32} />
                        </div>
                        <div className="text-center">
                            <h2 className="text-xl font-bold text-brand-blue" style={{ margin: 0 }}>Pack Product to HU</h2>
                            <p className="text-sm text-slate-500 mt-1" style={{ marginTop: '0.25rem' }}>Scan product, confirm qty, pack into HU</p>
                        </div>
                    </button>

                    <button
                        onClick={() => navigate('/warehouse-packing/create-hu')}
                        className="glass-card flex flex-col items-center justify-center gap-4 hover:shadow-md transition-shadow active:scale-[0.98] w-full"
                        style={{ border: '1px solid #e2e8f0', minHeight: '160px', height: 'auto', padding: '1.5rem', borderRadius: '1rem' }}
                    >
                        <div style={{ width: '4rem', height: '4rem', backgroundColor: '#d1fae5', borderRadius: '50%', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <PackagePlus size={32} />
                        </div>
                        <div className="text-center">
                            <h2 className="text-xl font-bold text-brand-blue" style={{ margin: 0 }}>Create HU</h2>
                            <p className="text-sm text-slate-500 mt-1" style={{ marginTop: '0.25rem' }}>Create a new empty handling unit</p>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WarehousePacking;
