import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sites } from './build/sites-vite-plugin'

const hostRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(async () => {
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= 'false'
  process.env.WRANGLER_SEND_METRICS ??= 'false'
  process.env.WRANGLER_WRITE_LOGS ??= 'false'
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs'
  process.env.WRANGLER_REGISTRY_PATH ??= '.wrangler/dev-registry'
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry'

  const { cloudflare } = await import('@cloudflare/vite-plugin')
  return {
    root: hostRoot,
    publicDir: resolve(hostRoot, '../dist/build/h5'),
    build: { outDir: 'dist', emptyOutDir: true },
    plugins: [
      sites({ mockAuth: false }),
      cloudflare({
        viteEnvironment: { name: 'server' },
        inspectorPort: false,
        config: {
          name: 'shiti-sites-host',
          main: resolve(hostRoot, '../server/sites-worker.mjs'),
          compatibility_date: '2026-05-15',
          compatibility_flags: ['nodejs_compat', 'enable_request_signal'],
          assets: {
            binding: 'ASSETS',
            run_worker_first: ['/api/*'],
            not_found_handling: 'none',
          },
        },
      }),
    ],
  }
})
