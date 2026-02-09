import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    FileText, PackagePlus, PackageMinus, ClipboardList, LogOut,
    Warehouse, Bell, X, Scan, Download, MoreVertical
} from 'lucide-react';

const Menu = () => {
    const navigate = useNavigate();
    const { logout, user } = useAuth();

    // State to track which menu is open
    const [openMenu, setOpenMenu] = useState(null);

    const menuItems = [
        {
            id: 'gr',
            title: 'Goods Receipt',
            icon: PackagePlus,
            color: '#10b981',
            iconBg: 'bg-emerald-50',
            iconColor: 'text-emerald-600',
            subMenus: [
                { id: 'gr-po', label: 'Purchase Orders', path: '/gr', available: true },
                { id: 'gr-inbound', label: 'Inbound Delivery', path: '/gr-inbound', available: true },
            ]
        },
        {
            id: 'gi',
            title: 'Goods Issue',
            icon: PackageMinus,
            color: '#f97316',
            iconBg: 'bg-orange-50',
            iconColor: 'text-orange-600',
            subMenus: [
                { id: 'gi-obd', label: 'Outbound Delivery', path: '/gi', available: true },
                { id: 'gi-reservation', label: 'Reservation', path: '/gi-reservation', available: true },
            ]
        },
        {
            id: 'inv',
            title: 'Physical Count',
            icon: ClipboardList,
            color: '#8b5cf6',
            iconBg: 'bg-purple-50',
            iconColor: 'text-purple-600',
            subMenus: [
                { id: 'count-inv', label: 'Count Inventory', path: '/inventory', available: true }
            ]
        },
        {
            id: 'stock',
            title: 'Stock Overview',
            icon: Warehouse,
            color: '#06b6d4',
            iconBg: 'bg-cyan-50',
            iconColor: 'text-cyan-600',
            subMenus: [
                { id: 'view-stock', label: 'View Stock', path: '/stock', available: true }
            ]
        },
        {
            id: 'pr',
            title: 'Purchase Req',
            icon: FileText,
            color: '#3b82f6',
            iconBg: 'bg-blue-50',
            iconColor: 'text-blue-600',
            subMenus: [
                { id: 'view-pr', label: 'View PRs', path: '/pr', available: true },
                { id: 'create-pr', label: 'Create PR', path: '/pr?view=create', available: true },
                { id: 'create-po', label: 'Create PO from PR', path: '/pr?view=createPO', available: true },
            ]
        }
    ];

    const toggleMenu = (menuId) => {
        console.log('Toggling menu:', menuId);
        setOpenMenu(prev => prev === menuId ? null : menuId);
    };

    const handleSubMenuClick = (path, available) => {
        if (!available) {
            alert('Coming Soon');
            return;
        }
        setOpenMenu(null);
        navigate(path);
    };

    const activeItem = menuItems.find(item => item.id === openMenu);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#f8fafc', overflow: 'hidden' }}>

            {/* Header */}
            <header className="app-header pb-12 px-8 rounded-b-curved shadow-2xl flex-none z-20 relative" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 2rem)' }}>
                <div className="flex justify-between items-start mb-6">
                    <img src="/logo.png" style={{ height: '48px', width: 'auto' }} className="object-contain drop-shadow-md" alt="Logo" />
                    <div className="flex gap-3">
                        <button className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition backdrop-blur-md border border-white/10">
                            <Bell size={20} />
                        </button>
                        <button onClick={logout} className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition backdrop-blur-md border border-white/10">
                            <MoreVertical size={20} />
                        </button>
                    </div>
                </div>

                {/* Decorative Elements */}
                <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none mix-blend-overlay"></div>

                {/* Title Section */}
                <div className="relative z-10 text-center mt-2">
                    <h3 className="text-white font-bold text-xl tracking-wider uppercase drop-shadow-sm">Welcome, {user?.username || 'Guest'}</h3>
                    <p className="text-blue-100/80 text-xs font-medium uppercase tracking-widest mt-1">Select a Module</p>
                </div>
            </header>

            {/* Main Content Area */}
            <main style={{ flex: 1, overflowY: 'auto', padding: '24px', marginTop: '16px', position: 'relative', zIndex: 30 }}>
                <div style={{ backgroundColor: 'white', borderRadius: '24px', padding: '24px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}>


                    {/* Inline Grid Style to force layout */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '48px 16px',
                        justifyItems: 'center'
                    }}>
                        {menuItems.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => toggleMenu(item.id)}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '12px',
                                    border: 'none',
                                    background: 'none',
                                    cursor: 'pointer',
                                    width: '100%'
                                }}
                            >
                                <div className={`
                                    w-16 h-16 rounded-2xl flex items-center justify-center border border-slate-100 shadow-sm transition-all duration-200
                                    ${openMenu === item.id ? 'bg-blue-600 text-white ring-4 ring-blue-100' : `${item.iconBg} ${item.iconColor}`}
                                `}>
                                    <item.icon size={32} strokeWidth={1.5} />
                                </div>
                                <span className="text-xs font-bold text-slate-700 text-center leading-tight" style={{ maxWidth: '80px' }}>
                                    {item.title}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            </main>

            {/* Sub Menu Overlay / Bottom Sheet */}
            {openMenu && activeItem && (
                <>
                    {/* Backdrop */}
                    <div
                        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 40 }}
                        onClick={() => setOpenMenu(null)}
                    ></div>

                    {/* Sheet */}
                    <div className="animate-in slide-in-from-bottom duration-300" style={{
                        position: 'fixed',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        backgroundColor: 'white',
                        borderTopLeftRadius: '32px',
                        borderTopRightRadius: '32px',
                        zIndex: 50,
                        boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
                        maxHeight: '80vh',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>

                        {/* Header */}
                        <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${activeItem.iconBg} ${activeItem.iconColor}`}>
                                    <activeItem.icon size={20} />
                                </div>
                                <h3 className="text-lg font-bold text-slate-900">{activeItem.title}</h3>
                            </div>
                            <button
                                onClick={() => setOpenMenu(null)}
                                className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* List */}
                        <div style={{ padding: '16px', overflowY: 'auto' }}>
                            <div className="space-y-3">
                                {activeItem.subMenus.map((sub) => (
                                    <button
                                        key={sub.id}
                                        onClick={() => handleSubMenuClick(sub.path, sub.available)}
                                        className={`w-full flex items-center justify-between px-5 py-4 rounded-xl border transition-all ${sub.available ? 'bg-white border-slate-200 hover:border-blue-300' : 'bg-slate-50 border-slate-100 opacity-60'}`}
                                    >
                                        <span className={`font-bold text-sm ${sub.available ? 'text-slate-800' : 'text-slate-400'}`}>
                                            {sub.label}
                                        </span>
                                        {sub.available && (
                                            <div className="flex gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-[#003366] text-white flex items-center justify-center">
                                                    <Scan size={16} />
                                                </div>

                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Safe Area */}
                        <div style={{ height: '24px' }}></div>
                    </div>
                </>
            )}
        </div>
    );
};

export default Menu;
