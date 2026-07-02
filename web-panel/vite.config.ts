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
  // Expo Router static export prerenders ONE html file per route
  // (index.html, home.html, menu.html, cart.html, order-detail.html, ...).
  // We must serve the route-specific html so client hydration matches the server
  // markup; serving the generic index.html for every route causes a React #418
  // hydration mismatch and the screen gets stuck on its loading spinner.
  const sendHtml = (res: any, route: string) => {
    const clean = route.replace(/^\/+|\/+$/g, '') // trim slashes
    const candidates = clean === ''
      ? ['index.html']
      : [`${clean}.html`, `${clean}/index.html`, 'index.html']
    for (const c of candidates) {
      const p = path.join(MOBILE_DIR, c)
      if (p.startsWith(MOBILE_DIR) && fs.existsSync(p) && fs.statSync(p).isFile()) {
        res.setHeader('Content-Type', 'text/html')
        res.end(fs.readFileSync(p))
        return true
      }
    }
    return false
  }
  // Shared middleware so /mobile works on BOTH the dev server (configureServer)
  // and the production preview server (configurePreviewServer). It reads the
  // Expo export straight from public/mobile on disk, so it behaves identically
  // in dev and in `vite preview`.
  const mobileMiddleware = (req: any, res: any, next: any) => {
    const urlPath: string = decodeURIComponent((req.url || '').split('?')[0])
    if (urlPath !== '/mobile' && !urlPath.startsWith('/mobile/')) return next()

    const ext = path.extname(urlPath).toLowerCase()

    // 1) Routes (no file extension) -> matching prerendered Expo html
    if (urlPath === '/mobile' || !ext) {
      const route = urlPath.replace(/^\/mobile/, '')
      if (sendHtml(res, route)) return
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
  }
  return {
    name: 'serve-mobile-app',
    configureServer(server: any) { server.middlewares.use(mobileMiddleware) },
    configurePreviewServer(server: any) { server.middlewares.use(mobileMiddleware) },
  }
}

export default defineConfig({
  plugins: [react(), serveMobile()],
  // Dev server (local `vite`). The deployed preview uses `vite preview` (below)
  // to avoid HMR reloads entirely — see start-both.sh.
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
  },
  // Production preview server (what the deployed preview runs). No HMR client,
  // so no websocket-reconnect page reloads. `vite preview` does NOT reuse the
  // `server` block, so the /api proxy is repeated here; /mobile is handled by
  // serveMobile()'s configurePreviewServer hook.
  preview: {
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
