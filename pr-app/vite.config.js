import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      host: true,
      proxy: {
        '/s4hanacloud': {
          target: 'https://sandbox.api.sap.com',
          changeOrigin: true,
          secure: false,
        },
        '/sap': {
          target: 'https://my432407-api.s4hana.cloud.sap',
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes) => {
              const setCookie = proxyRes.headers['set-cookie'];
              if (setCookie) {
                // Strip Secure flag and fix SameSite so SAP session cookies
                // work over HTTP in the dev proxy (needed for CSRF token sessions)
                proxyRes.headers['set-cookie'] = setCookie.map(cookie =>
                  cookie
                    .replace(/;\s*Secure/gi, '')
                    .replace(/;\s*SameSite=None/gi, '; SameSite=Lax')
                );
              }
            });
          },
        },
        // Proxy for MCP Server to bypass CORS and inject Ngrok headers server-side
        '/mcp': {
          target: env.VITE_MCP_SERVER_URL || 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/mcp/, ''),
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              // Inject the bypass header on the Node side so it never triggers browser CORS Preflight
              proxyReq.setHeader('ngrok-skip-browser-warning', '1');
            });
          }
        }
      }
    }
  };
});

