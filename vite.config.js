import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/worktalk-sales/',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // 手動でバケット分けすると共有モジュールが意図しない側に入り、
        // 初回に不要なチャンクまで modulepreload されてしまう。
        // 分割は lazy() によるタブ単位のものだけに任せる。
      },
    },
  },
  server: {
    port: parseInt(process.env.PORT || '5173'),
    strictPort: false,
  },
})
