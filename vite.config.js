import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/* 版の新しさを数で持つ。ファイル名のハッシュは前後が分からないため、
   「古い画面が自分の版を最新として知らせてしまう」事故を防げない。
   CI では対象コミットの時刻を入れる（BUILD_ID）。手元では現在時刻。 */
const BUILD_ID = process.env.BUILD_ID || String(Math.floor(Date.now() / 1000))

export default defineConfig({
  base: '/worktalk-sales/',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
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
