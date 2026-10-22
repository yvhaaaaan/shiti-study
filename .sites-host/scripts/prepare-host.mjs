import { readFile, mkdir, writeFile, access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const hostRoot = fileURLToPath(new URL('..', import.meta.url))
const projectRoot = resolve(hostRoot, '..')
const manifest = JSON.parse(await readFile(resolve(projectRoot, '.openai/hosting.json'), 'utf8'))
if (!manifest.project_id) throw new Error('Existing Site project_id is required.')
delete manifest.static
await access(resolve(projectRoot, 'dist/build/h5/index.html'))
await access(resolve(projectRoot, 'server/sites-worker.mjs'))
await mkdir(resolve(hostRoot, '.openai'), { recursive: true })
await writeFile(resolve(hostRoot, '.openai/hosting.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log('Prepared Worker hosting metadata; existing H5 assets will be copied unchanged.')
