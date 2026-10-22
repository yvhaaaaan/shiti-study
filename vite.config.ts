import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [uni(), {
    name: 'shiti-local-host-mode',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] !== '/shiti-runtime.js') return next()
        response.setHeader('Content-Type', 'application/javascript; charset=utf-8')
        response.setHeader('Cache-Control', 'no-store')
        response.end('window.__SHITI_CLOUD__ = false;')
      })
    },
  }],
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    proxy: { '/api/question-generate': { target: 'http://127.0.0.1:8787', changeOrigin: true } },
    watch: { ignored: ['**/.validation/**', '**/.sites-runtime/**', '**/.sites-checkout/**'] },
  },
})
