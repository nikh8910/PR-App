/**
 * @file Login.jsx
 * @description Screen: Login / SAP Connection Setup
 *
 * Entry point for the app. The user provides either:
 *  - SAP API Endpoint + Username + Password (Basic Auth), or
 *  - SAP API Key (for sandbox/shared systems)
 *
 * Credentials are validated on login by calling api.validateCredentials,
 * which makes a lightweight request to the PR API. If successful, they are
 * persisted to localStorage via AuthContext so the user stays logged in
 * across app restarts without re-entering credentials.
 *
 * Already-authenticated users are automatically redirected to /menu.
 *
 * @route /login (default / root route)
 */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Key, Server, User, Loader, AlertCircle } from 'lucide-react';
import { api, extractSapMessage } from '../services/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Heading } from '../components/ui/Heading';

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
            navigate('/menu', { replace: true });
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
            navigate('/menu', { replace: true });
        } catch (err) {
            setError(extractSapMessage(err));
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
                        <Heading level={1} className="text-slate-200 mb-1">ODS mWH</Heading>
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

                    <form onSubmit={handleSubmit} className="flex flex-col">
                        <Input
                            label="API Endpoint"
                            value={baseUrl}
                            onChange={(e) => setBaseUrl(e.target.value)}
                            placeholder="https://..."
                            required
                            leftIcon={<Server size={16} />}
                            className="bg-slate-800/50 border-slate-700 text-slate-200 placeholder-slate-400"
                        />

                        <Input
                            label="Username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Username"
                            leftIcon={<User size={16} />}
                            className="bg-slate-800/50 border-slate-700 text-slate-200 placeholder-slate-400"
                        />

                        <Input
                            type="password"
                            label="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Password"
                            leftIcon={<Key size={16} />}
                            className="bg-slate-800/50 border-slate-700 text-slate-200 placeholder-slate-400"
                        />

                        <div className="relative my-2">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-slate-700/50"></div>
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-white px-2 text-slate-500">Or use API Key</span>
                            </div>
                        </div>

                        <Input
                            label="API Key (Sandbox)"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="API Key"
                            leftIcon={<Key size={16} />}
                            className="bg-slate-800/50 border-slate-700 text-slate-200 placeholder-slate-400"
                        />

                        <Button type="submit" className="mt-2" disabled={loading}>
                            {loading ? <Loader className="animate-spin" size={20} /> : 'Sign In'}
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Login;
