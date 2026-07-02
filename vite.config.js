import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: 'all',
    cors: true,
    // Same-origin режим: фронт завжди ходить на власний origin,
    // а в dev ці шляхи проксуються на custom-db сервер (MIGRATION_PORT).
    proxy: (() => {
      const backend = `http://127.0.0.1:${process.env.MIGRATION_PORT || 8787}`
      const paths = ['/api', '/auth', '/settings', '/health', '/db', '/migration']
      return Object.fromEntries(paths.map((p) => [p, { target: backend, changeOrigin: true }]))
    })(),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          if (id.includes('/react/') || id.includes('/react-dom/')) {
            return 'vendor-react'
          }

          if (id.includes('/firebase/')) {
            return 'vendor-firebase'
          }

          if (id.includes('/recharts/')) {
            return 'vendor-charts'
          }

          if (id.includes('/xlsx/')) {
            return 'vendor-xlsx'
          }

          if (id.includes('/@tanstack/react-table/')) {
            return 'vendor-table'
          }

          if (id.includes('/@headlessui/react/')) {
            return 'vendor-headlessui'
          }

          if (id.includes('/@zxing/browser/')) {
            return 'vendor-zxing'
          }

          if (id.includes('/qrcode/')) {
            return 'vendor-qrcode'
          }

          if (id.includes('/react-hook-form/')) {
            return 'vendor-forms'
          }

          if (id.includes('/lucide-react/')) {
            return 'vendor-icons'
          }

          return 'vendor-misc'
        },
      },
    },
  },
})
