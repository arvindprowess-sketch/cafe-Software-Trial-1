import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Serve the Expo static export (customer MOBILE APP) under /mobile.
//
// Two responsibilities:
//  1. Extension-less routes (/mobile, /mobile/, /mobile/home ...) must return the
//     Expo index.html so Expo Router can client-side route.
//  2. Static asset files (with an extension: .js .css .ttf .png .json .map ...) must be
//     served DIRECTLY from disk. Vite's dev server otherwise intercepts any URL that
//     contains "/node_modules/" (the Expo export nests fonts under
//     assets/node_modules/@expo/...) and the SPA fallback returns index.html (text/html)
//     instead of the real binary — which corrupts the bundled fonts (Ionicons / Anton /
//     Hanken Grotesk) and makes every icon + custom font render as a "tofu" box.
//
// This plugin intercepts ALL /mobile/* requests before Vite's internal middlewares so the
// static export is served exactly as it is on disk.
const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
  '.wasm': 'application/wasm',
}

function serveMobile() {
  const MOBILE_DIR = path.resolve(process.cwd(), 'public/mobile')
  const sendIndex = (res: any) => {
    const indexPath = path.join(MOBILE_DIR, 'index.html')
    if (fs.existsSync(indexPath)) {
      res.setHeader('Content-Type', 'text/html')
      res.end(fs.readFileSync(indexPath))
      return true
    }
    return false
  }
  return {
    name: 'serve-mobile-app',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const urlPath: string = decodeURIComponent((req.url || '').split('?')[0])
        if (urlPath !== '/mobile' && !urlPath.startsWith('/mobile/')) return next()

        const ext = path.extname(urlPath).toLowerCase()

        // 1) Routes (no file extension) -> Expo index.html for client-side routing
        if (urlPath === '/mobile' || !ext) {
          if (sendIndex(res)) return
          return next()
        }

        // 2) Static asset with an extension -> serve from disk if it exists
        const rel = urlPath.replace(/^\/mobile\/?/, '')
        const filePath = path.join(MOBILE_DIR, rel)
        if (!filePath.startsWith(MOBILE_DIR)) return next() // path-traversal guard
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream')
          res.setHeader('Cache-Control', 'public, max-age=31536000')
          res.end(fs.readFileSync(filePath))
          return
        }
        return next()
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
