import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/worktalk-sales/',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // 依存ライブラリを分けて、アプリ側の修正だけを配信したときに
        // ブラウザのキャッシュが効くようにする。
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/recharts|d3-|victory|decimal\.js/.test(id)) return 'charts'
          if (/@supabase|@?supabase/.test(id)) return 'supabase'
          if (/[\\/]react(-dom|-is)?[\\/]|scheduler/.test(id)) return 'react'
          return 'vendor'
        },
      },
    },
  },
  server: {
    port: parseInt(process.env.PORT || '5173'),
    strictPort: false,
  },
})
