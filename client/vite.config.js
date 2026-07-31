import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Single-store build. The old multi-store `VITE_LAYOUT` swap is gone — the
// active store layout always lives in `src/layouts/store`.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@layout': path.resolve(__dirname, 'src/layouts/store'),
    },
  },
  server: {
    proxy: {
      // Port 3000, not 5000: macOS Control Center (AirPlay Receiver) binds
      // 5000 by default, so the proxy would silently hit AirPlay instead of
      // the API. 3000 also matches the port documented in CLAUDE.md.
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
})
