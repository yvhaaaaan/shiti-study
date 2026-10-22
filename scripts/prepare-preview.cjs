const fs = require('node:fs')
const path = require('node:path')
const project = path.resolve(__dirname, '..')
const source = path.join(project, 'dist', 'build', 'h5')
const target = path.join(project, 'dist', 'client')
// copyFileSync avoids an fs.cpSync crash in some Windows Node 24 builds.
function copyDirectory(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const input = path.join(from, entry.name)
    const output = path.join(to, entry.name)
    if (entry.isDirectory()) copyDirectory(input, output)
    else if (entry.isFile()) fs.copyFileSync(input, output)
  }
}
if (!fs.existsSync(path.join(source, 'index.html'))) throw new Error('Build H5 before preparing the preview')
copyDirectory(source, target)
console.log('H5 preview prepared in dist/client')
