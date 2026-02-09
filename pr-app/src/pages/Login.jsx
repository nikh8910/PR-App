import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Key, Server, User, Loader, AlertCircle } from 'lucide-react';
import { api } from '../services/api';

const Login = () => {
    const { apiConfig, login, user } = useAuth();
    const [baseUrl, setBaseUrl] = useState('https://my432407-api.s4hana.cloud.sap:443/sap/opu/odata4/sap/api_purchaserequisition_2/srvd_a2x/sap/purchaserequisition/0001/PurchaseReqn');
    const [username, setUsername] = useState('ODS_COMM_USER');
    const [password, setPassword] = useState('NyAXndoxKbW6=TTW\\#9]S\\afQt4u{TxM9c<fe4NS');
    const [apiKey, setApiKey] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        if (user) {
            navigate('/menu');
        }
    }, [user, navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const config = { baseUrl, username, password, apiKey };

        try {
            // Validate credentials before logging in
            await api.validateCredentials(config);
            login(username, password, baseUrl, apiKey);
            navigate('/menu');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-full w-full overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="flex items-center justify-center min-h-full p-4">
                <div className="glass-card w-full max-w-md shadow-2xl">
                    <div className="text-center mb-8 flex flex-col items-center">
                        <img
                            src="/logo.png"
                            alt="On Device Solutions"
                            className="w-full max-w-[260px] h-auto mb-6 object-contain"
                        />
                        <h1 className="text-xl font-bold tracking-tight mb-1 text-slate-200">Purchase Requisition</h1>
                        <p className="text-slate-500 text-xs uppercase tracking-wider">Manager</p>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 bg-red-900/20 border border-red-500/30 rounded-lg flex items-start gap-3">
                            <AlertCircle className="text-red-400 shrink-0 mt-0.5" size={18} />
                            <div>
                                <h3 className="text-sm font-semibold text-red-300">Login Failed</h3>
                                <p className="text-xs text-red-200 mt-1">{error}</p>
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                        <div>
                            <label className="block text-xs uppercase font-bold text-slate-500 mb-1.5 ml-1">
                                API Endpoint
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={baseUrl}
                                    onChange={(e) => setBaseUrl(e.target.value)}
                                    placeholder="https://..."
                                    required
                                    className="pl-10 bg-slate-800/50 border-slate-700 focus:border-blue-500"
                                />
                                <Server size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs uppercase font-bold text-slate-500 mb-1.5 ml-1">
                                Username
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="Username"
                                    className="pl-10 bg-slate-800/50 border-slate-700 focus:border-blue-500"
                                />
                                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs uppercase font-bold text-slate-500 mb-1.5 ml-1">
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Password"
                                    className="pl-10 bg-slate-800/50 border-slate-700 focus:border-blue-500"
                                />
                                <Key size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            </div>
                        </div>

                        <div className="relative my-2">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-slate-700/50"></div>
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-slate-900 px-2 text-slate-500">Or use API Key</span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs uppercase font-bold text-slate-500 mb-1.5 ml-1">
                                API Key (Sandbox)
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    placeholder="API Key"
                                    className="pl-10 bg-slate-800/50 border-slate-700 focus:border-blue-500"
                                />
                                <Key size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            </div>
                        </div>

                        <button type="submit" className="btn-primary mt-2 w-full justify-center py-3 text-base" disabled={loading}>
                            {loading ? <Loader className="animate-spin" size={20} /> : 'Sign In'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Login;
