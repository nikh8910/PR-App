import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api, extractSapMessage } from '../../services/api';
import { Search, Loader, AlertCircle, X, PlusCircle } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import WarehouseValueHelp from './WarehouseValueHelp';
import { Button } from '../../components/ui/Button';

const ManageResourceSearch = () => {
    const navigate = useNavigate();
    const { apiConfig } = useAuth();

    // Search state
    const [warehouse, setWarehouse] = useState('');
    const [resourceId, setResourceId] = useState('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');

    // Value help
    const [showWarehouseHelp, setShowWarehouseHelp] = useState(false);
    const [warehouseList, setWarehouseList] = useState(null);
    const [fetchingWarehouses, setFetchingWarehouses] = useState(false);

    // Create resource state
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newResourceId, setNewResourceId] = useState('');
    const [createLoading, setCreateLoading] = useState(false);

    useEffect(() => {
        if (apiConfig?.warehouse) {
            setWarehouse(apiConfig.warehouse);
        }
    }, [apiConfig]);

    const showMessage = (msg, isError = false) => {
        if (isError) {
            setError(msg);
            setSuccessMsg('');
            setTimeout(() => setError(null), 6000);
        } else {
            setSuccessMsg(msg);
            setError(null);
            setTimeout(() => setSuccessMsg(''), 5000);
        }
    };

    const getConfig = () => apiConfig || JSON.parse(localStorage.getItem('sapConfig') || '{}');

    const handleSearch = async () => {
        if (!warehouse.trim()) {
            showMessage('Enter a Warehouse to search.', true);
            return;
        }
        setLoading(true);
        setError(null);
        setSuccessMsg('');

        try {
            const config = getConfig();
            const whse = warehouse.trim().toUpperCase();
            const resId = resourceId.trim().toUpperCase();
            
            let fetchedResources = [];

            if (resId) {
                // Fetch single resource early to validate
                try {
                    const res = await api.fetchWarehouseResource(config, whse, resId);
                    if (res) {
                        let queueSeq = [];
                        try {
                            queueSeq = await api.fetchResourceQueueSequence(config, whse, resId);
                        } catch (_) { /* ignore */ }
                        fetchedResources = [{ ...res, _WhseResourceGroupQueueSqnc: queueSeq }];
                    }
                } catch (err) {
                    if (err.message && (err.message.includes('404') || err.message.includes('Not Found'))) {
                        showMessage(`Resource ${resId} not found in warehouse ${whse}.`, true);
                        setLoading(false);
                        return;
                    } else {
                        throw err;
                    }
                }
            } else {
                // Fetch all to validate there is at least one
                const res = await api.fetchWarehouseResources(config, whse);
                fetchedResources = res.value || [];
                if (fetchedResources.length === 0) {
                    showMessage(`No resources found in warehouse ${whse}.`, true);
                    setLoading(false);
                    return;
                }
            }

            // Navigate to the list screen, passing the state
            navigate('/manage-resource/list', {
                state: { 
                    warehouse: whse, 
                    resourceId: resId,
                    initialResources: fetchedResources
                }
            });

        } catch (err) {
            showMessage(extractSapMessage(err), true);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!newResourceId.trim()) {
            showMessage('Enter a Resource ID to create.', true);
            return;
        }
        setCreateLoading(true);
        try {
            await api.createWarehouseResource(getConfig(), {
                EWMWarehouse: warehouse.trim().toUpperCase(),
                EWMResource: newResourceId.trim().toUpperCase()
            });
            showMessage(`Resource ${newResourceId.toUpperCase()} created successfully!`);
            setNewResourceId('');
            setShowCreateForm(false);
            
            // Auto navigate to the newly created resource
            navigate('/manage-resource/list', {
                state: { 
                    warehouse: warehouse.trim().toUpperCase(), 
                    resourceId: newResourceId.trim().toUpperCase() 
                }
            });
        } catch (err) {
            showMessage(extractSapMessage(err), true);
        } finally {
            setCreateLoading(false);
        }
    };

    const handleOpenWarehouseHelp = async () => {
        setShowWarehouseHelp(true);
        if (!warehouseList) {
            setFetchingWarehouses(true);
            try {
                const data = await api.fetchWarehouses(getConfig());
                setWarehouseList(data?.value || []);
            } catch (err) {
                showMessage(extractSapMessage(err), true);
                setWarehouseList([]);
            } finally {
                setFetchingWarehouses(false);
            }
        }
    };

    return (
        <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
            <PageHeader title="Manage Resource" subtitle="WAREHOUSE RESOURCES" backPath="/menu" />

            {/* Messages */}
            <div className="px-4 py-2 z-50 w-full shrink-0 flex flex-col gap-2">
                {error && (
                    <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-3 shadow-md flex gap-3 items-start relative animate-in slide-in-from-top-2">
                        <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                        <p className="text-[11px] text-red-600 flex-1">{error}</p>
                        <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-md absolute top-2 right-2">
                            <X size={14} className="text-red-500" />
                        </button>
                    </div>
                )}
                {successMsg && (
                    <div className="bg-emerald-50 border-l-4 border-emerald-500 rounded-lg p-3 shadow-md flex gap-3 items-start relative animate-in slide-in-from-top-2">
                        <CheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={18} />
                        <p className="text-[11px] text-emerald-700 flex-1 font-bold">{successMsg}</p>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-8 content-area mt-4" style={{ zIndex: 10, position: 'relative' }}>
                <div className="max-w-md mx-auto">
                    {/* Search Panel */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-6">
                        <div className="flex flex-col gap-4">
                            {/* Warehouse Input */}
                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-400 mb-1.5 block">Warehouse</label>
                                <div className="relative flex items-center w-full border border-gray-300 rounded-lg bg-white focus-within:ring-2 focus-within:ring-brand-blue focus-within:border-brand-blue transition-all overflow-hidden h-12">
                                    <input
                                        type="text"
                                        value={warehouse}
                                        onChange={e => setWarehouse(e.target.value.toUpperCase())}
                                        placeholder="e.g. 1750"
                                        className="w-full py-2 px-3 bg-transparent text-sm border-none focus:ring-0 outline-none h-full"
                                        autoComplete="off"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleOpenWarehouseHelp}
                                        className="p-2 mr-1 hover:bg-slate-100 rounded text-slate-400 hover:text-brand-blue transition-colors"
                                        title="Select Warehouse"
                                    >
                                        <Search size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* Resource ID Input */}
                            <div>
                                <label className="text-[10px] uppercase font-bold text-slate-400 mb-1.5 block">Resource ID <span className="text-slate-300 normal-case">(optional)</span></label>
                                <input
                                    type="text"
                                    value={resourceId}
                                    onChange={e => setResourceId(e.target.value.toUpperCase())}
                                    placeholder="Leave blank for all resources"
                                    className="w-full h-12 px-3 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-brand-blue focus:border-brand-blue outline-none transition-all"
                                    autoComplete="off"
                                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                />
                            </div>

                            {/* Search Button */}
                            <Button
                                onClick={handleSearch}
                                disabled={loading || !warehouse.trim()}
                                className="mt-2"
                                style={{ height: '3.5rem' }}
                            >
                                {loading ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Searching...</> : <><Search size={20} /> <span className="text-[16px]">Search Resources</span></>}
                            </Button>
                        </div>
                    </div>

                    {/* Create Resource Section */}
                    <div className="pt-2 border-t border-slate-200 mt-6">
                        {!showCreateForm ? (
                            <button
                                onClick={() => setShowCreateForm(true)}
                                className="w-full mt-4 bg-[#002B49] text-white py-4 rounded-[100px] text-base font-semibold shadow-lg flex items-center justify-center gap-2 hover:opacity-95 active:scale-[0.98] transition-all"
                            >
                                <span className="text-xl leading-none font-normal">+</span> Create New Resource
                            </button>
                        ) : (
                            <div className="bg-white rounded-2xl shadow-lg border border-blue-200 p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-[16px] font-bold text-slate-800 flex items-center gap-2">
                                        <span className="text-xl leading-none font-normal text-brand-blue">+</span> Create Resource
                                    </h4>
                                    <button onClick={() => { setShowCreateForm(false); setNewResourceId(''); }} className="p-1 hover:bg-slate-100 rounded-md text-slate-400">
                                        <X size={18} />
                                    </button>
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 mb-1.5 block">Warehouse</label>
                                    <input type="text" value={warehouse} disabled className="w-full h-12 px-3 text-sm border border-gray-200 rounded-lg bg-slate-50 text-slate-600 font-bold" />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 mb-1.5 block">New Resource ID</label>
                                    <input
                                        type="text"
                                        value={newResourceId}
                                        onChange={e => setNewResourceId(e.target.value.toUpperCase())}
                                        placeholder="e.g. FORKLIFT1"
                                        className="w-full h-12 px-3 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-brand-blue focus:border-brand-blue outline-none transition-all uppercase"
                                        autoFocus
                                        onKeyDown={e => e.key === 'Enter' && handleCreate()}
                                    />
                                </div>
                                
                                <button
                                    onClick={handleCreate}
                                    disabled={createLoading || !newResourceId.trim()}
                                    className="w-full mt-2 bg-[#002B49] disabled:opacity-50 text-white py-4 rounded-[100px] text-base font-semibold shadow-lg flex items-center justify-center gap-2 hover:opacity-95 active:scale-[0.98] transition-all"
                                >
                                    {createLoading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <span className="text-xl leading-none font-normal">+</span>} 
                                    Create New Resource
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Warehouse Value Help */}
            {showWarehouseHelp && (
                <WarehouseValueHelp
                    warehouses={warehouseList || []}
                    loading={fetchingWarehouses}
                    onSelect={(val) => {
                        setWarehouse(val.toUpperCase());
                        setShowWarehouseHelp(false);
                    }}
                    onClose={() => setShowWarehouseHelp(false)}
                />
            )}
        </div>
    );
};

export default ManageResourceSearch;
