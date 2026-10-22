import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const hostRoot = fileURLToPath(new URL('..', import.meta.url))
const output = resolve(hostRoot, 'dist')
const configPath = resolve(output, 'server/wrangler.json')
const config = JSON.parse(await readFile(configPath, 'utf8'))
const manifest = JSON.parse(await readFile(resolve(output, '.openai/hosting.json'), 'utf8'))
assert.ok(manifest.project_id && !manifest.static, 'Worker manifest must retain project_id and omit static.')
assert.equal(config.assets?.binding, 'ASSETS', 'ASSETS binding is required.')
assert.ok(config.assets?.run_worker_first?.includes('/api/*'), 'API requests must run the Worker first.')
const assetDirectory = resolve(output, 'server', config.assets.directory)
assert.equal(assetDirectory, resolve(output, 'client'), 'Generated assets.directory must point to the client output.')
const workerMain = resolve(output, 'server', config.main)
assert.equal(workerMain, resolve(output, 'server/index.js'), 'Sites requires dist/server/index.js.')
assert.ok((await stat(workerMain)).isFile(), 'Worker entry must exist.')

const sourceRoot = resolve(hostRoot, '../dist/build/h5')
let checkedFiles = 0
let checkedBytes = 0
async function verifyDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const input = resolve(directory, entry.name)
    if (entry.isDirectory()) await verifyDirectory(input)
    else {
      assert.ok(entry.isFile(), 'Assets must be regular files, not symlinks.')
      const suffix = relative(sourceRoot, input)
      assert.ok(!isAbsolute(suffix) && !suffix.startsWith('..'))
      const [source, target] = await Promise.all([readFile(input), readFile(resolve(assetDirectory, suffix))])
      assert.equal(createHash('sha256').update(target).digest('hex'), createHash('sha256').update(source).digest('hex'), `Static asset changed: ${suffix}`)
      checkedFiles += 1
      checkedBytes += source.length
    }
  }
}
await verifyDirectory(sourceRoot)
console.log(JSON.stringify({ worker: relative(hostRoot, workerMain), config: relative(hostRoot, configPath), assets: relative(hostRoot, assetDirectory), verifiedAssetFiles: checkedFiles, verifiedAssetBytes: checkedBytes }))
