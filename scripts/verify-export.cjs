const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { unzipSync, strFromU8 } = require('fflate')

const project = path.resolve(__dirname, '..')
const original = fs.readFileSync(path.join(project, 'src/utils/exportPaper.ts'), 'utf8')
const question = {
  id: 'q-1', title: '一元一次方程', subject: '数学', stem: '解方程：2x + 3 = 11\n比较 A < B & C。',
  answer: 'x = 4', analysis: '先移项，再将两边同除以 2。', userAnswer: 'x = 7',
  tags: ['方程'], difficulty: '基础', source: '单元测试', favorite: false, status: 'reinforce',
  images: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZxkAAAAASUVORK5CYII='],
  createdAt: '', updatedAt: '', reviewCount: 0,
}

function selectPlatform(source, platform) {
  let enabled = true
  return source.split('\n').filter(line => {
    const start = line.match(/\/\/ #ifdef (\S+)/)
    if (start) { enabled = start[1] === platform; return false }
    if (line.includes('// #endif')) { enabled = true; return false }
    return enabled
  }).join('\n')
}

async function verify(platform, includeAnswers) {
  let output
  const context = {
    require, module: { exports: {} }, exports: {}, Uint8Array, ArrayBuffer, DataView, Blob,
    setTimeout: () => 0,
    document: { body: { appendChild() {} }, createElement: () => ({ click() {}, remove() {} }) },
    URL: { createObjectURL: blob => { output = blob; return 'blob:test' }, revokeObjectURL() {} },
    wx: { env: { USER_DATA_PATH: '/test' } },
    uni: {
      showToast() {},
      getFileSystemManager: () => ({ writeFile: ({ data, success }) => { output = data; success() } }),
      openDocument: ({ filePath, fileType, success }) => { assert.equal(fileType, 'docx'); assert.match(filePath, /\.docx$/); success() },
    },
  }
  context.exports = context.module.exports
  const compiled = ts.transpileModule(selectPlatform(original, platform), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  vm.runInNewContext(compiled, context)
  await context.module.exports.exportPaper({ id: 'paper-1', title: '数学专项练习', questionIds: ['q-1'] }, [question], includeAnswers)
  const bytes = output instanceof Blob ? new Uint8Array(await output.arrayBuffer()) : new Uint8Array(output)
  const files = unzipSync(bytes)
  const document = strFromU8(files['word/document.xml'])
  assert.ok(files['[Content_Types].xml'])
  assert.ok(files['word/styles.xml'])
  assert.ok(files['word/media/image1.png'])
  assert.match(document, /A &lt; B &amp; C/)
  assert.equal(document.includes('参考答案与解析'), includeAnswers)
  assert.equal(document.includes('x = 4'), includeAnswers)
  assert.ok(!document.includes('错因提醒'))
  assert.ok(!document.includes('未能嵌入'))
  assert.match(strFromU8(files['word/_rels/document.xml.rels']), /rIdImage1/)
  console.log(`${platform}: ${includeAnswers ? 'answers' : 'questions only'}, ${bytes.length} bytes, embedded PNG, valid package parts`)
  if (platform === 'H5' && includeAnswers) {
    const directory = path.join(project, '.validation')
    fs.mkdirSync(directory, { recursive: true })
    fs.writeFileSync(path.join(directory, 'export-test.docx'), bytes)
  }
}

Promise.resolve().then(async () => {
  await verify('H5', true)
  await verify('H5', false)
  await verify('MP-WEIXIN', true)
  await verify('MP-WEIXIN', false)
}).catch(error => { console.error(error); process.exitCode = 1 })
