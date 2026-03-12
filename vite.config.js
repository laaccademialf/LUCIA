import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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

          if (id.includes('/jszip/')) {
            return 'vendor-zip'
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
