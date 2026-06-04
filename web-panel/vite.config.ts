import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Serve the Expo static export (customer MOBILE APP) under /mobile.
// Asset files (with extensions) are served by Vite's static middleware from public/mobile.
// Extension-less routes (/mobile, /mobile/, /mobile/home ...) must return the Expo
// index.html so Expo Router can client-side route — otherwise Vite's SPA fallback
// would incorrectly serve the web-panel index.html.
function serveMobile() {
  return {
    name: 'serve-mobile-app',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url: string = (req.url || '').split('?')[0]
        if (url === '/mobile' || (url.startsWith('/mobile/') && !path.extname(url))) {
          const indexPath = path.resolve(process.cwd(), 'public/mobile/index.html')
          if (fs.existsSync(indexPath)) {
            res.setHeader('Content-Type', 'text/html')
            res.end(fs.readFileSync(indexPath))
            return
          }
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), serveMobile()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        ws: true,
      }
    }
  }
})
