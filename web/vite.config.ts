import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The API runs separately in dev; send /api calls to it.
    proxy: { '/api': 'http://localhost:4000' },
  },
})
