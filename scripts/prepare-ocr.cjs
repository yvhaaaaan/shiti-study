const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const project = path.resolve(__dirname, '..')
// uni-app excludes static/h5 from Mini Program builds. These are browser-only assets.
const output = path.join(project, 'src', 'static', 'h5', 'ocr', 'v7')
const manifest = []
const packageDirectory = name => path.dirname(require.resolve(`${name}/package.json`, { paths: [project] }))

function copy(source, relative) {
  if (!fs.existsSync(source)) throw new Error(`OCR resource is missing: ${source}. Run the project dependency installer first.`)
  const target = path.join(output, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const bytes = fs.readFileSync(source)
  if (!fs.existsSync(target) || !fs.readFileSync(target).equals(bytes)) fs.writeFileSync(target, bytes)
  manifest.push({ file: relative.replace(/\\/g, '/'), bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') })
}

const library = packageDirectory('tesseract.js')
const core = packageDirectory('tesseract.js-core')
for (const [directory, name] of [[library, 'tesseract.js'], [core, 'tesseract.js-core']]) {
  const version = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8')).version
  if (version !== '7.0.0') throw new Error(`Expected ${name}@7.0.0, received ${version}`)
}
copy(path.join(library, 'dist', 'worker.min.js'), 'worker.min.js')
for (const filename of ['worker.min.js.LICENSE.txt']) {
  if (fs.existsSync(path.join(library, 'dist', filename))) copy(path.join(library, 'dist', filename), filename)
}
// OEM is pinned to LSTM_ONLY. Include scalar/SIMD/relaxed-SIMD wrappers so the
// worker can choose the supported core, without fetching any CDN resource.
// These .wasm.js files embed their WASM bytes; separate .wasm files are not used.
for (const variant of ['lstm', 'simd-lstm', 'relaxedsimd-lstm']) {
  const filename = `tesseract-core-${variant}.wasm.js`
  copy(path.join(core, filename), path.join('core', filename))
}
copy(path.join(core, 'LICENSE'), 'licenses/tesseract-core-LICENSE.txt')
copy(path.join(__dirname, 'licenses', 'tessdata-LICENSE.txt'), 'licenses/tessdata-LICENSE.txt')
for (const filename of ['LICENSE.md', 'LICENSE']) {
  if (fs.existsSync(path.join(library, filename))) {
    copy(path.join(library, filename), 'licenses/tesseract-js-LICENSE.txt')
    break
  }
}
for (const language of ['chi_sim', 'eng']) {
  const directory = packageDirectory(`@tesseract.js-data/${language}`)
  copy(path.join(directory, '4.0.0_best_int', `${language}.traineddata.gz`), path.join('lang', `${language}.traineddata.gz`))
  copy(path.join(directory, 'README.md'), `licenses/${language}-README.md`)
}
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({
  engine: 'Tesseract.js 7.0.0', core: 'tesseract.js-core 7.0.0',
  languagePackages: { chi_sim: '1.0.0', eng: '1.0.0' }, modelVariant: '4.0.0_best_int',
  modelLicense: { name: 'Apache-2.0', source: 'https://github.com/naptha/tessdata/blob/gh-pages/LICENSE', file: 'licenses/tessdata-LICENSE.txt' },
  files: manifest,
}, null, 2) + '\n')
console.log(`Prepared ${manifest.length} local OCR assets in src/static/h5/ocr/v7 (${(manifest.reduce((sum, file) => sum + file.bytes, 0) / 1024 / 1024).toFixed(1)} MiB).`)
