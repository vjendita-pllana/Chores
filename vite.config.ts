import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Vercel's Supabase integration adds NEXT_PUBLIC_* vars. Copy only the ones the app
// needs into VITE_* (exposing the whole NEXT_PUBLIC_ prefix broke the service worker build).
const env = process.env
const alias = (to: string, ...from: string[]) => {
  const value = from.map((k) => env[k]).find(Boolean)
  if (!env[to] && value) env[to] = value
}
alias('VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL')
alias('VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY')
alias('VITE_VAPID_PUBLIC_KEY', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY')

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // custom service worker so we can handle push events
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      devOptions: { enabled: true, type: 'module' },
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Chores',
        short_name: 'Chores',
        description: 'Shared chores with reminders',
        theme_color: '#f6f3ee',
        background_color: '#f6f3ee',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
