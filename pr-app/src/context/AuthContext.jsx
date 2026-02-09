import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [apiConfig, setApiConfig] = useState({
    baseUrl: 'https://my422909-api.s4hana.cloud.sap:443/sap/opu/odata4/sap/api_purchaserequisition_2/srvd_a2x/sap/purchaserequisition/0001',
    username: '',
    password: '',
    apiKey: '', // In case they use API Key instead
  });

  useEffect(() => {
    const saved = localStorage.getItem('pr_app_auth');
    if (saved) {
      const parsed = JSON.parse(saved);
      setUser(parsed.user);
      setApiConfig(parsed.apiConfig);
    }
  }, []);

  const login = (username, password, baseUrl, apiKey) => {
    // In a real app, we would validate against the server here.
    // For this demo/tool, we verify we can make a header or just store it.
    // We'll just store it and assume it's correct until a request fails.
    const newUser = { username };
    const newConfig = { username, password, baseUrl, apiKey };

    setUser(newUser);
    setApiConfig(newConfig);

    localStorage.setItem('pr_app_auth', JSON.stringify({ user: newUser, apiConfig: newConfig }));
  };

  const logout = () => {
    setUser(null);
    setApiConfig(prev => ({ ...prev, username: '', password: '', apiKey: '' }));
    localStorage.removeItem('pr_app_auth');
  };

  return (
    <AuthContext.Provider value={{ user, apiConfig, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
