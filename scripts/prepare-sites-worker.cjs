const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const host = path.join(root, '.sites-host')
const vite = path.join(host, 'node_modules/vite/bin/vite.js')
if (!fs.existsSync(vite)) throw new Error('Install the isolated Sites host first: npm --prefix .sites-host ci')
for (const command of [[path.join(host, 'scripts/prepare-host.mjs')], [vite, 'build'], [path.join(host, 'scripts/verify-host.mjs')]]) {
  const result = spawnSync(process.execPath, command, { cwd: host, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}
const output = path.join(host, 'dist')
// Copy regular files only; keep the uni-app output available for Tencent and MP.
// fs.cpSync is avoided because of a Windows Node 24 runtime crash.
function copy(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const input = path.join(from, entry.name), target = path.join(to, entry.name)
    if (entry.isDirectory()) copy(input, target)
    else if (entry.isFile()) fs.copyFileSync(input, target)
    else throw new Error('Sites output must contain only regular files')
  }
}
for (const directory of ['server', 'client', '.openai']) copy(path.join(output, directory), path.join(root, 'dist', directory))
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dist/.openai/hosting.json'), 'utf8'))
if (manifest.static || !fs.existsSync(path.join(root, 'dist/server/index.js'))) throw new Error('Sites Worker artifact is incomplete')
console.log('Sites Worker, API, and Vue static assets prepared in dist')
