/**
 * @file AuthContext.jsx
 * @description Global authentication context for the SAP S/4HANA mobile app.
 *
 * Stores the currently authenticated user and the SAP API connection config
 * (base URL, credentials). Configuration persists across app restarts via
 * localStorage so the user does not need to log in every session.
 *
 * ## Usage
 *   const { user, apiConfig, login, logout } = useAuth();
 *
 * ## apiConfig shape
 *   {
 *     baseUrl: string  — SAP OData service root URL
 *     username: string — S/4HANA system user (Basic Auth)
 *     password: string — S/4HANA password (Basic Auth)
 *     apiKey:  string  — SAP API Key (alternative to Basic Auth)
 *   }
 */
import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

/** Convenience hook to consume the auth context from any component. */
export const useAuth = () => useContext(AuthContext);

/**
 * AuthProvider — wraps the app tree and provides auth state to all children.
 * Reads saved credentials from localStorage on first mount.
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  // Default apiConfig points to the SAP S/4HANA Cloud sandbox.
  // Users override this on the Login screen before any API calls are made.
  const [apiConfig, setApiConfig] = useState({
    baseUrl: 'https://my422909-api.s4hana.cloud.sap:443/sap/opu/odata4/sap/api_purchaserequisition_2/srvd_a2x/sap/purchaserequisition/0001',
    username: '',
    password: '',
    apiKey: '', // Used when SAP API Key auth is preferred over Basic Auth
  });

  // Rehydrate auth state from localStorage on app launch.
  useEffect(() => {
    const saved = localStorage.getItem('pr_app_auth');
    if (saved) {
      const parsed = JSON.parse(saved);
      setUser(parsed.user);
      setApiConfig(parsed.apiConfig);
    }
  }, []);

  /**
   * Stores user credentials and API config in state and localStorage.
   * Credentials are validated lazily — an API call will fail if invalid.
   *
   * @param {string} username
   * @param {string} password
   * @param {string} baseUrl  - SAP OData service root URL
   * @param {string} apiKey   - Optional; takes precedence over Basic Auth
   */
  const login = (username, password, baseUrl, apiKey) => {
    const newUser = { username };
    const newConfig = { username, password, baseUrl, apiKey };
    setUser(newUser);
    setApiConfig(newConfig);
    localStorage.setItem('pr_app_auth', JSON.stringify({ user: newUser, apiConfig: newConfig }));
  };

  /**
   * Clears user state and removes credentials from localStorage.
   * The baseUrl is preserved so the user's server address stays pre-filled.
   */
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
