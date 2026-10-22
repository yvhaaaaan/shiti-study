import { normalizeSubject, normalizeTags } from '../domain/taxonomy'
import type { Difficulty } from '../domain/types'
import { cloudEnabled, cloudImageReference, imageAsDataUrl } from './studyStorage'

export interface GeneratedQuestion {
  title: string
  subject: string
  stem: string
  answer: string
  analysis: string
  tags: string[]
  difficulty: Difficulty
}
export interface GenerationInput { stem: string; images: string[]; subject: string; tags: string[] }
export interface GenerationHandlers {
  /** 完整题干从模型流里闭合时触发，用于先上屏。 */
  onStem?: (stem: string) => void
  /** 累计的模型正文，用于调试或后续做渐进预览。 */
  onDelta?: (text: string) => void
}
export interface GenerationTask { promise: Promise<GeneratedQuestion>; cancel: () => void }

export class GenerationCancelledError extends Error {
  constructor() { super('已取消本次生成'); this.name = 'GenerationCancelledError' }
}

const MAX_PAYLOAD = 900 * 1024
function payloadBytes(text: string) { return encodeURIComponent(text).replace(/%[A-F\d]{2}/gi, 'x').length }

async function prepareImage(source: string, budget: number, targetEndpoint: string): Promise<string> {
  // #ifdef H5
  const target = new URL(targetEndpoint, window.location.href)
  // Only our authenticated, same-origin VPS endpoint understands private media
  // references. The upload cache also covers images saved in the current view,
  // whose reactive question still carries the original data URL until reload.
  if (cloudEnabled() && target.origin === window.location.origin && target.pathname === '/api/question-generate' && !target.search && !target.hash && !target.username && !target.password) {
    const reference = cloudImageReference(source)
    if (reference) return reference
  }
  if (/^\/api\/media\/[a-f0-9]{64}$/.test(source)) source = await imageAsDataUrl(source)
  if (!/^data:image\/(?:jpeg|png|webp);base64,/i.test(source)) throw new Error('请重新上传 JPG、PNG 或 WebP 题图后识别')
  if (source.length <= budget) return source
  const photo = await new Promise<HTMLImageElement>((resolve, reject) => {
    const item = new window.Image()
    item.onload = () => resolve(item)
    item.onerror = () => reject(new Error('题图无法读取，请重新上传'))
    item.src = source
  })
  for (const edge of [1800, 1500, 1200]) {
    const scale = Math.min(1, edge / Math.max(photo.naturalWidth, photo.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale))
    const painter = canvas.getContext('2d')
    if (!painter) throw new Error('图片处理失败，请裁剪题图后重试')
    painter.fillStyle = '#ffffff'
    painter.fillRect(0, 0, canvas.width, canvas.height)
    painter.drawImage(photo, 0, 0, canvas.width, canvas.height)
    for (const quality of [0.86, 0.72, 0.58]) {
      const reduced = canvas.toDataURL('image/jpeg', quality)
      if (reduced.length <= budget) return reduced
    }
  }
  // #endif
  // #ifdef MP-WEIXIN
  const fileSystem = uni.getFileSystemManager()
  async function read(path: string): Promise<string> {
    return new Promise((resolve, reject) => fileSystem.readFile({
      filePath: path, encoding: 'base64',
      success: result => resolve(String(result.data)), fail: () => reject(new Error('题图无法读取，请重新上传')),
    }))
  }
  if (/^data:image\/(?:jpeg|png|webp);base64,/i.test(source) && source.length <= budget) return source
  if (/^data:|^https?:/i.test(source)) throw new Error('请在当前设备重新上传题图后识别')
  const info = await new Promise<UniApp.GetImageInfoSuccessData>((resolve, reject) => uni.getImageInfo({ src: source, success: resolve, fail: () => reject(new Error('题图无法读取，请重新上传')) }))
  for (const edge of [1600, 1200]) {
    for (const quality of [75, 55]) {
      const path = await new Promise<string>((resolve, reject) => uni.compressImage({
        src: source, quality, compressedWidth: Math.max(1, Math.round(info.width * Math.min(1, edge / Math.max(info.width, info.height)))),
        success: result => resolve(result.tempFilePath), fail: () => reject(new Error('图片处理失败，请裁剪题图后重试')),
      }))
      const encoded = await read(path)
      const mime = encoded.startsWith('/9j/') ? 'image/jpeg' : encoded.startsWith('iVBORw0KGgo') ? 'image/png' : encoded.startsWith('UklGR') ? 'image/webp' : ''
      if (!mime) throw new Error('题图仅支持 JPG、PNG 或 WebP，请重新上传')
      const reduced = `data:${mime};base64,${encoded}`
      if (reduced.length <= budget) return reduced
    }
  }
  // #endif
  throw new Error('题图较大，请裁剪到单道题或减少图片后重试')
}

function endpoint(): string {
  const configured = String(import.meta.env.VITE_SHITI_AI_URL || '').trim()
  if (configured && !/^https:\/\//i.test(configured) && !/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\//i.test(configured)) throw new Error('智能录题服务地址需使用 HTTPS')
  // #ifdef MP-WEIXIN
  if (!configured) throw new Error('微信端尚未配置智能录题服务地址，请先配置后端接口')
  // #endif
  return configured || '/api/question-generate'
}

function parseResult(value: unknown): GeneratedQuestion {
  if (!value || typeof value !== 'object') throw new Error('生成结果格式异常，请重试')
  const item = value as Record<string, unknown>
  for (const [key, limit] of Object.entries({ title: 60, stem: 5000, answer: 5000, analysis: 10000 })) {
    if (typeof item[key] !== 'string' || !(item[key] as string).trim() || (item[key] as string).length > limit) throw new Error('生成内容不完整或过长，请裁剪为单道题后重试')
  }
  if (!Array.isArray(item.tags) || !item.tags.every(tag => typeof tag === 'string') || !['基础', '进阶', '挑战'].includes(String(item.difficulty))) throw new Error('生成结果格式异常，请重试')
  const subject = normalizeSubject(item.subject)
  return { title: String(item.title).trim(), subject, stem: String(item.stem).trim(), answer: String(item.answer).trim(), analysis: String(item.analysis).trim(), tags: normalizeTags(item.tags), difficulty: item.difficulty as Difficulty }
}

// #ifdef H5
function isAbortError(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { name?: unknown }).name === 'AbortError'
}

/** 从尚未闭合的 JSON 文本里读出字符串字段；未闭合或转义不完整时返回 null。 */
function readJsonStringField(source: string, key: string): string | null {
  const marker = `"${key}"`
  let index = source.indexOf(marker)
  if (index < 0) return null
  index = source.indexOf(':', index + marker.length)
  if (index < 0) return null
  index += 1
  while (index < source.length && /\s/.test(source[index] as string)) index += 1
  if (source[index] !== '"') return null
  index += 1
  let value = ''
  while (index < source.length) {
    const char = source[index] as string
    if (char === '"') return value
    if (char === '\\') {
      const next = source[index + 1]
      if (next === undefined) return null
      if (next === 'u') {
        const hex = source.slice(index + 2, index + 6)
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) return null
        value += String.fromCharCode(parseInt(hex, 16))
        index += 6
        continue
      }
      const escapes: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }
      const escaped = escapes[next]
      if (escaped === undefined) return null
      value += escaped
      index += 2
      continue
    }
    value += char
    index += 1
  }
  return null
}

function parseEventBlock(block: string): { name: string; data: any } | null {
  let name = 'message'
  const data: string[] = []
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) name = line.slice(6).trim()
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
  }
  if (!data.length) return null
  try { return { name, data: JSON.parse(data.join('\n')) } } catch { return null }
}

async function readEventStream(body: ReadableStream<Uint8Array>, handlers: GenerationHandlers, isCancelled: () => boolean): Promise<GeneratedQuestion> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let stem = ''
  let result: GeneratedQuestion | null = null
  let failure: Error | null = null
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (isCancelled()) throw new GenerationCancelledError()
      buffer += decoder.decode(value, { stream: true })
      buffer = buffer.replace(/\r\n/g, '\n')
      let boundary = buffer.indexOf('\n\n')
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf('\n\n')
        const event = parseEventBlock(block)
        if (!event) continue
        if (event.name === 'delta') {
          const chunk = typeof event.data?.text === 'string' ? event.data.text : ''
          if (!chunk) continue
          content += chunk
          handlers.onDelta?.(content)
          const nextStem = readJsonStringField(content, 'stem')
          if (nextStem && nextStem !== stem) { stem = nextStem; handlers.onStem?.(stem) }
        } else if (event.name === 'done') {
          result = parseResult(event.data)
        } else if (event.name === 'error') {
          const message = event.data?.error?.message
          failure = new Error(typeof message === 'string' ? message : '本次生成失败，请稍后重试')
        }
      }
    }
  } catch (error) {
    if (isCancelled() || isAbortError(error)) throw new GenerationCancelledError()
    throw error
  } finally {
    try { reader.releaseLock() } catch {}
  }
  if (failure) throw failure
  if (result) return result
  throw new Error('生成结果不完整，请重试')
}

async function requestStream(url: string, data: unknown, handlers: GenerationHandlers, isCancelled: () => boolean, assign: (controller: AbortController) => void): Promise<GeneratedQuestion> {
  const controller = new AbortController()
  assign(controller)
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, 90000)
  try {
    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(data),
        signal: controller.signal,
      })
    } catch (error) {
      if (timedOut) throw new Error('生成超时，当前输入已保留，请重试')
      if (isCancelled() || isAbortError(error)) throw new GenerationCancelledError()
      throw new Error('暂时无法连接生成服务，当前输入已保留')
    }
    if (!response.ok) {
      let payload: { error?: { message?: string } } | null = null
      try { payload = await response.json() as { error?: { message?: string } } } catch {}
      throw new Error(payload?.error?.message || (response.status === 413 ? '题图较大，请裁剪后重试' : response.status === 404 ? '生成服务尚未部署，请先配置服务端接口' : '本次生成失败，请稍后重试'))
    }
    const contentType = (response.headers.get('Content-Type') || '').toLowerCase()
    if (!contentType.includes('text/event-stream') || !response.body) {
      let payload: unknown
      try { payload = await response.json() } catch { throw new Error('生成结果格式异常，请重试') }
      return parseResult(payload)
    }
    return await readEventStream(response.body, handlers, isCancelled)
  } catch (error) {
    if (timedOut) throw new Error('生成超时，当前输入已保留，请重试')
    throw error
  } finally {
    clearTimeout(timer)
  }
}
// #endif

function requestBuffered(url: string, data: Record<string, unknown>, isCancelled: () => boolean, assign: (task: UniApp.RequestTask) => void): Promise<GeneratedQuestion> {
  return new Promise<GeneratedQuestion>((resolve, reject) => {
    const header: Record<string, string> = { 'Content-Type': 'application/json' }
    // #ifdef MP-WEIXIN
    header['X-Shiti-Client'] = 'mini-program'
    // #endif
    const task = uni.request({ url, method: 'POST', data, header, timeout: 90000,
      success: result => {
        if (isCancelled()) return reject(new GenerationCancelledError())
        try {
          let payload: unknown = result.data
          if (typeof payload === 'string') {
            try { payload = JSON.parse(payload) } catch { throw new Error('生成服务尚未部署，请先配置服务端接口') }
          }
          if (result.statusCode < 200 || result.statusCode >= 300) {
            const failure = payload as { error?: { message?: string } } | null
            throw new Error(failure?.error?.message || (result.statusCode === 413 ? '题图较大，请裁剪后重试' : result.statusCode === 404 ? '生成服务尚未部署，请先配置服务端接口' : '本次生成失败，请稍后重试'))
          }
          resolve(parseResult(payload))
        } catch (error) { reject(error) }
      },
      fail: error => reject(isCancelled() ? new GenerationCancelledError() : new Error(/timeout/i.test(error.errMsg) ? '生成超时，当前输入已保留，请重试' : '暂时无法连接生成服务，当前输入已保留')),
    })
    assign(task)
  })
}

export function startQuestionGeneration(input: GenerationInput, handlers: GenerationHandlers = {}): GenerationTask {
  let cancelled = false
  let request: UniApp.RequestTask | undefined
  let controller: AbortController | undefined
  const promise = (async () => {
    const url = endpoint()
    if (!input.stem.trim() && !input.images.length) throw new Error('先输入题干或上传题图，再生成解析')
    const budget = Math.floor(820 * 1024 / Math.max(1, input.images.length))
    const images: string[] = []
    for (const source of input.images) {
      if (cancelled) throw new GenerationCancelledError()
      images.push(await prepareImage(source, budget, url))
    }
    if (cancelled) throw new GenerationCancelledError()
    // An unclassified pending question has no subject hint; the model classifies it.
    const data = { stem: input.stem.trim(), images, ...(input.subject.trim() ? { subject: input.subject.trim() } : {}), tags: [...input.tags] }
    if (payloadBytes(JSON.stringify(data)) > MAX_PAYLOAD) throw new Error('题图较大，请裁剪到单道题后重试')
    // #ifdef H5
    return await requestStream(url, data, handlers, () => cancelled, value => { controller = value })
    // #endif
    // #ifdef MP-WEIXIN
    return await requestBuffered(url, data, () => cancelled, value => { request = value })
    // #endif
    throw new Error('当前平台暂不支持智能整理')
  })()
  return { promise, cancel: () => { cancelled = true; controller?.abort(); request?.abort() } }
}
