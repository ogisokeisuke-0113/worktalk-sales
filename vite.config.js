import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: parseInt(process.env.PORT || '5173'),
    strictPort: false,
  },
  preview: {
    port: parseInt(process.env.PORT || '4173'),
    host: '0.0.0.0',
    // Tailscale MagicDNS host (*.ts.net) からのアクセスを許可。
    // preview は Tailscale Serve 経由の HTTPS でのみ社外に公開されるため
    // ホスト制限を緩めても安全。
    allowedHosts: ['.ts.net', '.local', 'localhost'],
  },
})
