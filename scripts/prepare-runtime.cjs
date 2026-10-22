const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
// uni-app copies src/static, whereas this small host selector must stay at the
// origin root. The standalone host overrides it; static hosts use local data.
fs.copyFileSync(path.join(root, 'public/shiti-runtime.js'), path.join(root, 'dist/build/h5/shiti-runtime.js'))
