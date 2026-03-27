/**
 * @file WarehouseInternal.jsx
 * @description Screen: Warehouse Internal Movements Sub-Menu
 *
 * Landing screen for EWM Internal processing. Provides navigation tiles to:
 *  - Adhoc Warehouse Task (product or HU transfers) → /warehouse-internal/adhoc-task
 *  - Confirm Task (confirm pending ad-hoc tasks) → /warehouse-internal/confirm-task
 *  - Physical Inventory (count by bin/HU/product) → /warehouse-internal/phys-inv
 *  - Adhoc PI Create (create new PI document) → /warehouse-internal/adhoc-pi
 *
 * Uses swipe-back gesture (useSwipeBack hook) to navigate to the previous screen.
 *
 * @route /warehouse-internal
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight, ClipboardList, FilePlus, CheckSquare } from 'lucide-react';
import { useSwipeBack } from '../hooks/useSwipeBack';
import PageHeader from '../components/PageHeader';

const WarehouseInternal = () => {
    const navigate = useNavigate();

    useSwipeBack(() => navigate(-1));

    const cards = [
        { title: 'Adhoc Warehouse Task', desc: 'Create product or HU warehouse tasks', icon: ArrowLeftRight, path: '/warehouse-internal/adhoc-task', color: '#7c3aed', bg: '#ede9fe' },
        { title: 'Confirm Task', desc: 'Confirm pending ad-hoc warehouse tasks', icon: CheckSquare, path: '/warehouse-internal/confirm-task', color: '#d97706', bg: '#fef3c7' },
        { title: 'Physical Inventory', desc: 'Scan bin, HU, product to count', icon: ClipboardList, path: '/warehouse-internal/phys-inv', color: '#0369a1', bg: '#e0f2fe' },
        { title: 'Adhoc PI Create', desc: 'Create new PI document', icon: FilePlus, path: '/warehouse-internal/adhoc-pi', color: '#059669', bg: '#d1fae5' },
        { title: 'Manage WO', desc: 'Assign/Unassign WO or Pick HUs', icon: CheckSquare, path: '/warehouse-internal/manage-wo', color: '#b91c1c', bg: '#fee2e2' },
    ];

    return (
        <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
            <PageHeader title="Internal" subtitle="Movements & Inventory" />

            <div className="flex-1 overflow-y-auto p-4 content-area pb-8">
                <div className="max-w-md mx-auto flex flex-col gap-4 mt-6">
                    {cards.map(card => (
                        <button key={card.path} onClick={() => navigate(card.path)}
                            className="glass-card flex flex-col items-center justify-center gap-4 hover:shadow-md transition-shadow active:scale-[0.98] w-full"
                            style={{ border: '1px solid #e2e8f0', minHeight: '160px', height: 'auto', padding: '1.5rem', borderRadius: '1rem' }}>
                            <div style={{ width: '4rem', height: '4rem', backgroundColor: card.bg, borderRadius: '50%', color: card.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <card.icon size={32} />
                            </div>
                            <div className="text-center">
                                <h2 className="text-xl font-bold text-brand-blue" style={{ margin: 0 }}>{card.title}</h2>
                                <p className="text-sm text-slate-500 mt-1" style={{ marginTop: '0.25rem' }}>{card.desc}</p>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};


export default WarehouseInternal;
