import { strToU8, zipSync } from 'fflate'
import type { Question } from '../domain/types'

// #ifdef MP-WEIXIN
declare const wx: { env: { USER_DATA_PATH: string } }
// #endif

type PaperForExport = { id: string; title: string; questionIds: string[] }
type EmbeddedImage = { name: string; extension: 'png' | 'jpeg'; bytes: Uint8Array; relation: string; width: number; height: number }

const xml = (value: unknown) => String(value ?? '')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')

const paragraph = (text: string, style?: string) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`
const lines = (text: string) => text.split(/\r?\n/).map(line => paragraph(line)).join('')

function decodeBase64(value: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const clean = value.replace(/[^A-Za-z0-9+/]/g, '')
  const bytes = new Uint8Array(Math.floor(clean.length * 6 / 8))
  let buffer = 0, bits = 0, cursor = 0
  for (const char of clean) {
    buffer = (buffer << 6) | alphabet.indexOf(char)
    bits += 6
    if (bits >= 8) { bits -= 8; bytes[cursor++] = (buffer >> bits) & 255 }
  }
  return bytes
}

async function imageBytes(source: string): Promise<Uint8Array> {
  if (source.startsWith('data:')) {
    const match = source.match(/^data:[^;]+;base64,(.+)$/s)
    if (!match) throw new Error('不支持的图片编码')
    return decodeBase64(match[1])
  }
  // #ifdef H5
  const response = await fetch(source)
  if (!response.ok) throw new Error('题图读取失败')
  return new Uint8Array(await response.arrayBuffer())
  // #endif
  // #ifdef MP-WEIXIN
  const filePath = /^https?:/.test(source)
    ? await new Promise<string>((resolve, reject) => uni.downloadFile({ url: source, success: result => result.statusCode === 200 ? resolve(result.tempFilePath) : reject(new Error('题图下载失败')), fail: reject }))
    : source
  return new Promise<Uint8Array>((resolve, reject) => uni.getFileSystemManager().readFile({
    filePath,
    success: result => resolve(new Uint8Array(result.data as ArrayBuffer)),
    fail: reject,
  }))
  // #endif
}

function imageDimensions(bytes: Uint8Array): { extension: 'png' | 'jpeg'; width: number; height: number } {
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { extension: 'png', width: view.getUint32(16), height: view.getUint32(20) }
  }
  if (bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 255) break
      const marker = bytes[offset + 1]
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3]
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
        return { extension: 'jpeg', height: (bytes[offset + 5] << 8) | bytes[offset + 6], width: (bytes[offset + 7] << 8) | bytes[offset + 8] }
      }
      if (length < 2) break
      offset += 2 + length
    }
  }
  throw new Error('文档题图支持 PNG/JPEG，请在应用中查看此图片')
}

async function documentImage(bytes: Uint8Array): Promise<Uint8Array> {
  // #ifdef H5
  if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') {
    const source = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'image/webp' }))
    try {
      const image = new window.Image()
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('题图读取失败')); image.src = source })
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
      const context = canvas.getContext('2d'); if (!context) throw new Error('题图转换失败')
      context.drawImage(image, 0, 0)
      return decodeBase64(canvas.toDataURL('image/png').split(',')[1]!)
    } finally { URL.revokeObjectURL(source) }
  }
  // #endif
  return bytes
}

function imageParagraph(image: EmbeddedImage, index: number): string {
  const maxWidth = 5400000, maxHeight = 6400000
  const ratio = Math.min(maxWidth / image.width, maxHeight / image.height, 9525)
  const width = Math.round(image.width * ratio), height = Math.round(image.height * ratio)
  return `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${width}" cy="${height}"/><wp:docPr id="${index}" name="题图 ${index}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${index}" name="${image.name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${image.relation}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
}

/** Produces a real, editable DOCX with a separate optional answer appendix. */
export async function exportPaper(paper: PaperForExport, questions: Question[], includeAnswers: boolean): Promise<void> {
  const selected = paper.questionIds.map(id => questions.find(question => question.id === id)).filter((question): question is Question => !!question)
  if (!selected.length) throw new Error('请先为试卷添加题目')
  if (selected.some(question => question.organizationStatus === 'pending')) throw new Error('待整理题目暂不能导出练习卷，请先完成整理。')
  const title = paper.title.trim() || '我的错题练习卷'
  const images: EmbeddedImage[] = []
  let missingImages = 0
  let body = paragraph(title, 'Title')
    + paragraph(`拾题 · 错题专项练习    共 ${selected.length} 题`, 'Subtitle')
    + paragraph('姓名：________________    日期：________________')
    + paragraph('先独立作答，再核对答案。给每一道错题一次重新理解的机会。', 'Subtitle')

  for (const [index, question] of selected.entries()) {
    body += paragraph(`${index + 1}. ${question.title}`, 'Heading1')
    body += paragraph(`${question.subject} · ${question.difficulty}    ${question.tags.join(' / ')}`, 'Subtitle')
    body += lines(question.stem)
    for (const source of question.images ?? []) {
      try {
        const bytes = await documentImage(await imageBytes(source))
        const dimensions = imageDimensions(bytes)
        const image: EmbeddedImage = { bytes, ...dimensions, name: `image${images.length + 1}.${dimensions.extension}`, relation: `rIdImage${images.length + 1}` }
        images.push(image)
        body += imageParagraph(image, images.length)
      } catch {
        missingImages += 1
        body += paragraph('［此题图片未能嵌入，请在拾题应用中查看原始题图。］', 'Subtitle')
      }
    }
    body += paragraph('作答：') + paragraph('________________________________________________________________') + paragraph('________________________________________________________________') + paragraph('')
  }
  if (includeAnswers) {
    body += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' + paragraph('参考答案与解析', 'Title')
    selected.forEach((question, index) => {
      body += paragraph(`${index + 1}. ${question.title}`, 'Heading1')
      body += lines(`参考答案：${question.answer || '暂未填写'}`)
      body += lines(`解题分析：${question.analysis || '暂未填写'}`)
      body += paragraph('')
    })
  }

  const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(declaration + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`),
    '_rels/.rels': strToU8(declaration + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'),
    'docProps/core.xml': strToU8(declaration + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(title)}</dc:title><dc:creator>拾题</dc:creator></cp:coreProperties>`),
    'word/document.xml': strToU8(declaration + `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`),
    'word/styles.xml': strToU8(declaration + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:eastAsia="Microsoft YaHei"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="320" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:color w:val="173E34"/><w:sz w:val="36"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:rPr><w:color w:val="6E7B72"/><w:sz w:val="18"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="140"/></w:pPr><w:rPr><w:b/><w:color w:val="173E34"/><w:sz w:val="24"/></w:rPr></w:style></w:styles>'),
    'word/_rels/document.xml.rels': strToU8(declaration + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${images.map(image => `<Relationship Id="${image.relation}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${image.name}"/>`).join('')}</Relationships>`),
  }
  images.forEach(image => { files[`word/media/${image.name}`] = image.bytes })
  const bytes = zipSync(files, { level: 6 })
  const filename = `${title.replace(/[\\/:*?"<>|]/g, '_')}${includeAnswers ? '_含答案' : ''}.docx`

  // #ifdef H5
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  // #endif
  // #ifdef MP-WEIXIN
  const filePath = `${wx.env.USER_DATA_PATH}/${filename}`
  await new Promise<void>((resolve, reject) => uni.getFileSystemManager().writeFile({ filePath, data: bytes.slice().buffer as ArrayBuffer, success: () => resolve(), fail: reject }))
  await new Promise<void>((resolve, reject) => uni.openDocument({ filePath, fileType: 'docx', showMenu: true, success: () => resolve(), fail: reject }))
  // #endif
  if (missingImages) uni.showToast({ title: `${missingImages} 张题图未能嵌入，已在文档标注`, icon: 'none', duration: 3000 })
}
