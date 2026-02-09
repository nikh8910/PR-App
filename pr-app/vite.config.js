import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
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
      }
    }
  }
})
