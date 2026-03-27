import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api, extractSapMessage } from '../../services/api';
import { CheckCircle, UserX, AlertCircle, X, ChevronDown, ChevronUp, LogIn, LogOut, Trash2, ListOrdered, Users, Loader } from 'lucide-react';
import PageHeader from '../../components/PageHeader';

const ManageResourceList = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, apiConfig } = useAuth();
    const getConfig = () => apiConfig || JSON.parse(localStorage.getItem('sapConfig') || '{}');
    const currentUser = (user?.username || '').toUpperCase();

    // The data passed from the search screen
    const { warehouse, resourceId, initialResources } = location.state || {};

    const [resources, setResources] = useState(initialResources || []);
    const [actionLoading, setActionLoading] = useState(null); // 'logon-RES1', etc.
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');
    const [expandedId, setExpandedId] = useState(null);
    const [selectedQueue, setSelectedQueue] = useState('');

    useEffect(() => {
        // If arrived without state (e.g. direct URL hit), go back to search
        if (!warehouse) {
            navigate('/manage-resource', { replace: true });
        }
        
        // If we only have warehouse but not initial resources, we should fetch them
        if (warehouse && (!initialResources || initialResources.length === 0)) {
            refreshResources();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [warehouse, initialResources, navigate]);

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

    const refreshResources = async () => {
        try {
            const config = getConfig();
            if (resourceId && resourceId.trim()) {
                const res = await api.fetchWarehouseResource(config, warehouse, resourceId);
                let queueSeq = [];
                try {
                    queueSeq = await api.fetchResourceQueueSequence(config, warehouse, resourceId);
                } catch (_) { /* ignore */ }
                setResources(res ? [{ ...res, _WhseResourceGroupQueueSqnc: queueSeq }] : []);
            } else {
                const res = await api.fetchWarehouseResources(config, warehouse);
                setResources(res.value || []);
            }
        } catch (err) {
            if (err.message && (err.message.includes('404') || err.message.includes('Not Found'))) {
                setResources([]);
            } else {
                showMessage(extractSapMessage(err), true);
            }
        }
    };

    const handleLogon = async (res) => {
        const key = `logon-${res.EWMResource}`;
        setActionLoading(key);
        try {
            await api.logonWarehouseResource(getConfig(), res.EWMWarehouse, res.EWMResource);
            showMessage(`Claimed resource ${res.EWMResource} successfully!`);
            await refreshResources();
        } catch (err) {
            showMessage(extractSapMessage(err), true);
        } finally {
            setActionLoading(null);
        }
    };

    const handleLogoff = async (res) => {
        const key = `logoff-${res.EWMResource}`;
        setActionLoading(key);
        try {
            await api.logoffWarehouseResource(getConfig(), res.EWMWarehouse, res.EWMResource);
            showMessage(`Released resource ${res.EWMResource} successfully!`);
            await refreshResources();
        } catch (err) {
            showMessage(extractSapMessage(err), true);
        } finally {
            setActionLoading(null);
        }
    };

    const handleAssignQueue = async (res) => {
        if (!selectedQueue) {
            showMessage('Select a queue first.', true);
            return;
        }
        const key = `queue-${res.EWMResource}`;
        setActionLoading(key);
        try {
            await api.updateWarehouseResourceQueue(getConfig(), res.EWMWarehouse, res.EWMResource, selectedQueue);
            showMessage(`Queue updated to "${selectedQueue}" for ${res.EWMResource}!`);
            setSelectedQueue('');
            await refreshResources();
        } catch (err) {
            showMessage(extractSapMessage(err), true);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDelete = async (res) => {
        if (!window.confirm(`Permanently delete resource ${res.EWMResource}?`)) return;
        const key = `delete-${res.EWMResource}`;
        setActionLoading(key);
        try {
            await api.deleteWarehouseResource(getConfig(), res.EWMWarehouse, res.EWMResource);
            showMessage(`Resource ${res.EWMResource} deleted successfully!`);
            await refreshResources();
            // If we deleted the only one, go back to search
            if (resources.length === 1) {
                setTimeout(() => navigate('/manage-resource'), 1500);
            }
        } catch (err) {
            showMessage(extractSapMessage(err), true);
        } finally {
            setActionLoading(null);
        }
    };

    const isOwnedByCurrentUser = (res) => {
        const resUser = (res.UserName || '').trim().toUpperCase();
        return resUser === currentUser && resUser !== '';
    };

    const isLoggedOn = (res) => {
        return res.EWMRsceIsLoggedOntoByCurUser === true || (res.UserName && res.UserName.trim() !== '');
    };

    const isOwnedByOther = (res) => {
        return isLoggedOn(res) && !isOwnedByCurrentUser(res);
    };

    const getStatusInfo = (res) => {
        if (res.EWMRsceIsLoggedOntoByCurUser) {
            return { label: 'Claimed by YOU', bgClass: 'bg-emerald-100', textClass: 'text-emerald-700', Icon: CheckCircle };
        }
        const userName = (res.UserName || '').trim();
        if (userName) {
            return { label: `Claimed: ${userName}`, bgClass: 'bg-amber-100', textClass: 'text-amber-700', Icon: Users };
        }
        return { label: 'Available', bgClass: 'bg-slate-100', textClass: 'text-slate-500', Icon: UserX };
    };

    const toggleExpand = (resId) => {
        if (expandedId === resId) {
            setExpandedId(null);
            setSelectedQueue('');
        } else {
            setExpandedId(resId);
            setSelectedQueue('');
        }
    };

    if (!warehouse) return null; // Will redirect in useEffect

    return (
        <div className="flex flex-col h-screen bg-slate-50 font-sans overflow-hidden">
            <PageHeader title="Manage Resource" subtitle="RESOURCE LIST" backPath="/manage-resource" />

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

            {/* Sub-header context */}
            <div className="px-4 py-2">
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex justify-between items-center shadow-sm">
                    <div>
                        <p className="text-[10px] uppercase font-bold text-blue-400">Warehouse</p>
                        <p className="font-bold text-blue-900">{warehouse}</p>
                    </div>
                    {resourceId && (
                        <div className="text-right">
                            <p className="text-[10px] uppercase font-bold text-blue-400">Filtered ID</p>
                            <p className="font-bold text-blue-900">{resourceId}</p>
                        </div>
                    )}
                    <div className="text-right">
                        <p className="text-[10px] uppercase font-bold text-blue-400">Total</p>
                        <p className="font-bold text-blue-900">{resources.length}</p>
                    </div>
                </div>
            </div>

            {/* Resource List (scrollable) */}
            <div className="flex-1 overflow-y-auto px-4 pb-8 content-area" style={{ zIndex: 10, position: 'relative' }}>
                <div className="max-w-md mx-auto pt-2">
                    {resources.length > 0 ? (
                        <div className="space-y-3">
                            {resources.map((res) => {
                                const status = getStatusInfo(res);
                                const StatusIcon = status.Icon;
                                const isExpanded = expandedId === res.EWMResource;
                                const ownedByOther = isOwnedByOther(res);
                                const queueSeq = res._WhseResourceGroupQueueSqnc || [];

                                return (
                                    <div
                                        key={`${res.EWMWarehouse}-${res.EWMResource}`}
                                        className={`bg-white rounded-xl shadow border transition-all ${isExpanded ? 'border-blue-300 shadow-lg' : 'border-slate-200 hover:shadow-md hover:border-blue-200'}`}
                                    >
                                        <button
                                            onClick={() => toggleExpand(res.EWMResource)}
                                            className="w-full p-4 flex items-center justify-between text-left bg-transparent border-none cursor-pointer"
                                        >
                                            <div className="flex items-start gap-3 flex-1 min-w-0">
                                                <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${status.bgClass} ${status.textClass}`}>
                                                    <StatusIcon size={20} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start">
                                                        <h3 className="font-bold text-gray-800 text-base">{res.EWMResource}</h3>
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ml-2 shrink-0 ${status.bgClass} ${status.textClass}`}>
                                                            <StatusIcon size={10} />{status.label}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                                                        Group: {res.EWMResourceGroup || 'None'} · Type: {res.EWMResourceType || 'N/A'}
                                                    </p>
                                                    <p className="text-[11px] text-slate-400 mt-0.5">
                                                        Queue: <span className="font-semibold text-brand-blue">{res.WarehouseOrderQueue || 'None'}</span>
                                                        {res.EWMCurrentQueue && res.EWMCurrentQueue !== res.WarehouseOrderQueue && (
                                                            <> · Current: <span className="font-semibold text-amber-600">{res.EWMCurrentQueue}</span></>
                                                        )}
                                                    </p>
                                                </div>
                                            </div>
                                            {isExpanded ? <ChevronUp size={18} className="text-brand-blue shrink-0 ml-2" /> : <ChevronDown size={18} className="text-slate-400 shrink-0 ml-2" />}
                                        </button>

                                        {isExpanded && (
                                            <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3 animate-in slide-in-from-top-2 fade-in duration-150">
                                                {ownedByOther && (
                                                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-center gap-2">
                                                        <AlertCircle size={14} className="text-amber-500 shrink-0" />
                                                        <p className="text-[11px] text-amber-700 font-medium">
                                                            Actions disabled – resource claimed by <strong>{res.UserName}</strong>
                                                        </p>
                                                    </div>
                                                )}

                                                <div className="grid grid-cols-2 gap-3">
                                                    <button
                                                        onClick={() => handleLogon(res)}
                                                        disabled={!!actionLoading || ownedByOther}
                                                        className="w-full py-2.5 rounded-xl font-bold text-white text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5"
                                                    >
                                                        {actionLoading === `logon-${res.EWMResource}` ? <Loader size={14} className="animate-spin" /> : <LogIn size={14} />}
                                                        Claim
                                                    </button>
                                                    <button
                                                        onClick={() => handleLogoff(res)}
                                                        disabled={!!actionLoading || ownedByOther}
                                                        className="w-full py-2.5 rounded-xl font-bold text-white text-xs bg-slate-600 hover:bg-slate-700 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5"
                                                    >
                                                        {actionLoading === `logoff-${res.EWMResource}` ? <Loader size={14} className="animate-spin" /> : <LogOut size={14} />}
                                                        Release
                                                    </button>
                                                </div>

                                                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                                    <label className="text-[10px] uppercase font-bold text-slate-400 mb-1.5 block flex items-center gap-1">
                                                        <ListOrdered size={12} /> Assign Queue
                                                    </label>
                                                    {queueSeq.length > 0 ? (
                                                        <select
                                                            value={selectedQueue}
                                                            onChange={e => setSelectedQueue(e.target.value)}
                                                            disabled={!!actionLoading || ownedByOther}
                                                            className="w-full py-2 px-3 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-brand-blue focus:border-brand-blue outline-none transition-all disabled:opacity-50 mb-2"
                                                        >
                                                            <option value="">Select a queue...</option>
                                                            {queueSeq.map((q, i) => (
                                                                <option key={`${q.WarehouseOrderQueue}-${i}`} value={q.WarehouseOrderQueue}>
                                                                    {q.WarehouseOrderQueue} (Seq: {q.EWMResourceGroupQueueSqncNmbr})
                                                                </option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <p className="text-[11px] text-slate-400 mb-2 italic">No queue sequence available for this resource group.</p>
                                                    )}
                                                    <button
                                                        onClick={() => handleAssignQueue(res)}
                                                        disabled={!!actionLoading || ownedByOther || !selectedQueue}
                                                        className="w-full py-2.5 rounded-xl font-bold text-white text-xs bg-brand-blue hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5"
                                                    >
                                                        {actionLoading === `queue-${res.EWMResource}` ? <Loader size={14} className="animate-spin" /> : <ListOrdered size={14} />}
                                                        Assign Queue
                                                    </button>
                                                </div>

                                                <button
                                                    onClick={() => handleDelete(res)}
                                                    disabled={!!actionLoading || ownedByOther}
                                                    className="w-full py-2.5 rounded-xl font-bold text-xs border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5 bg-white"
                                                >
                                                    {actionLoading === `delete-${res.EWMResource}` ? <Loader size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                                    Delete Resource
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                            <div className="bg-gray-100 p-4 rounded-full mb-4">
                                <Users size={40} className="text-gray-400" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-700 mb-1">No Resources Found</h3>
                            <p className="text-sm text-gray-500 max-w-xs mb-5">
                                We couldn't find the requested resources in warehouse <strong>{warehouse}</strong>.
                            </p>
                            <button
                                onClick={() => navigate('/manage-resource')}
                                className="w-full py-3 rounded-xl font-bold text-white text-sm bg-brand-blue hover:opacity-90 transition-all flex items-center justify-center gap-2"
                            >
                                Go Back
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ManageResourceList;
