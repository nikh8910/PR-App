/**
 * @file WarehouseStock.jsx
 * @description Screen: Warehouse Available Stock Sub-Menu
 *
 * Landing screen for EWM Available Stock enquiries. Provides navigation tiles to:
 *  - Stock by Bin (view stock in a specific storage bin) → /warehouse-stock/by-bin
 *  - Stock by Product (search by Product ID or GTIN) → /warehouse-stock/by-product
 *
 * Uses swipe-back gesture (useSwipeBack hook) to navigate to the previous screen.
 *
 * @route /warehouse-stock
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Package } from 'lucide-react';
import { useSwipeBack } from '../hooks/useSwipeBack';
import PageHeader from '../components/PageHeader';

const WarehouseStock = () => {
    const navigate = useNavigate();

    useSwipeBack(() => navigate(-1));

    return (
        <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
            <PageHeader title="Available Stock" subtitle="Warehouse" />

            <div className="flex-1 overflow-y-auto p-4 content-area pb-8">
                <div className="max-w-md mx-auto flex flex-col gap-4 mt-6">
                    <button
                        onClick={() => navigate('/warehouse-stock/by-bin')}
                        className="glass-card flex flex-col items-center justify-center gap-4 hover:shadow-md transition-shadow active:scale-[0.98] w-full"
                        style={{ border: '1px solid #e2e8f0', minHeight: '180px', height: 'auto', padding: '1.5rem', borderRadius: '1rem' }}
                    >
                        <div style={{ width: '4rem', height: '4rem', backgroundColor: '#dbeafe', borderRadius: '50%', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Search size={32} />
                        </div>
                        <div className="text-center">
                            <h2 className="text-xl font-bold text-brand-blue" style={{ margin: 0 }}>Stock by Bin</h2>
                            <p className="text-sm text-slate-500 mt-1" style={{ marginTop: '0.25rem' }}>View available stock in a specific storage bin</p>
                        </div>
                    </button>

                    <button
                        onClick={() => navigate('/warehouse-stock/by-product')}
                        className="glass-card flex flex-col items-center justify-center gap-4 hover:shadow-md transition-shadow active:scale-[0.98] w-full"
                        style={{ border: '1px solid #e2e8f0', minHeight: '180px', height: 'auto', padding: '1.5rem', borderRadius: '1rem' }}
                    >
                        <div style={{ width: '4rem', height: '4rem', backgroundColor: '#d1fae5', borderRadius: '50%', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Package size={32} />
                        </div>
                        <div className="text-center">
                            <h2 className="text-xl font-bold text-brand-blue" style={{ margin: 0 }}>Stock by Product</h2>
                            <p className="text-sm text-slate-500 mt-1" style={{ marginTop: '0.25rem' }}>Search stock by Product ID or GTIN</p>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WarehouseStock;
