/** Browser-only, self-hosted Tesseract.js 7 text recognition. No inference API. */
import { imageAsDataUrl } from './studyStorage'
export interface OcrProgress { percent: number; label: string; imageIndex: number; imageCount: number }
export interface OcrResult { text: string; imageCount: number }
export interface OcrTask { promise: Promise<OcrResult>; cancel: () => void }
export class OcrCancelledError extends Error {
  constructor() { super('文字识别已取消，原图仍然保留'); this.name = 'OcrCancelledError' }
}

export function canUseLocalOcr(): boolean {
  // #ifdef H5
  return typeof window !== 'undefined' && typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined'
  // #endif
  return false
}

export function startQuestionOcr(images: string[], onProgress: (progress: OcrProgress) => void = () => {}): OcrTask {
  // #ifdef H5
  return startBrowserOcr([...images], onProgress)
  // #endif
  return { promise: Promise.reject(new Error('当前小程序暂不支持本地文字识别，请先保存原图，再用智能整理。')), cancel: () => {} }
}

// #ifdef H5
interface WorkerPacket { jobId?: string; status?: 'resolve' | 'reject' | 'progress'; data?: unknown }
interface PendingJob { resolve: (value: unknown) => void; reject: (error: Error) => void }

function startBrowserOcr(images: string[], onProgress: (progress: OcrProgress) => void): OcrTask {
  let worker: Worker | null = null
  let interrupted: Error | null = null
  let timeout: ReturnType<typeof setTimeout> | undefined
  let interruptReject: (error: Error) => void = () => {}
  let jobNumber = 0
  let imageIndex = 0
  const pending = new Map<string, PendingJob>()
  const controller = new AbortController()
  const workerId = `shiti-ocr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const interrupt = new Promise<never>((_, reject) => { interruptReject = reject })

  function report(percent: number, label: string) {
    if (interrupted) return
    onProgress({ percent: Math.max(0, Math.min(100, Math.round(percent))), label, imageIndex: Math.min(imageIndex + 1, images.length), imageCount: images.length })
  }
  function cleanUp() {
    if (timeout) clearTimeout(timeout)
    controller.abort()
    if (worker) { worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null; worker.terminate(); worker = null }
    for (const job of pending.values()) job.reject(interrupted ?? new OcrCancelledError())
    pending.clear()
  }
  function stop(error: Error) {
    if (interrupted) return
    interrupted = error
    cleanUp()
    interruptReject(error)
  }
  function request(action: string, payload: Record<string, unknown>): Promise<unknown> {
    if (interrupted) return Promise.reject(interrupted)
    return new Promise((resolve, reject) => {
      const jobId = `${workerId}-${++jobNumber}`
      pending.set(jobId, { resolve, reject })
      try { worker!.postMessage({ workerId, jobId, action, payload }) }
      catch { pending.delete(jobId); reject(new Error('无法启动文字识别，请先保存题图后重试')) }
    })
  }
  function progress(value: unknown) {
    const data = value as { status?: string; progress?: number }
    const ratio = Math.max(0, Math.min(1, Number(data?.progress) || 0))
    if (data?.status === 'loading tesseract core') report(3 + ratio * 12, '正在加载本地识别引擎…')
    else if (data?.status === 'loading language traineddata') report(15 + ratio * 25, '正在加载中文和英文识字资源…')
    else if (data?.status === 'initializing api' || data?.status === 'initializing tesseract') report(40 + ratio * 5, '正在准备文字识别…')
    else if (data?.status === 'recognizing text') report(45 + (imageIndex + ratio) / images.length * 54, `正在识别第 ${imageIndex + 1} / ${images.length} 张题图…`)
  }

  const operation = (async (): Promise<OcrResult> => {
    if (!canUseLocalOcr()) throw new Error('当前浏览器不支持本地文字识别，请先保存原图')
    if (!images.length || images.length > 3) throw new Error('请为同一道题添加 1 至 3 张图片')
    const base = new URL('/static/h5/ocr/v7/', window.location.href).href
    report(0, '首次使用正在准备识字资源，也可以先保存原图。')
    // Own the native worker from construction, rather than waiting for an async
    // createWorker() result. Tesseract.js 7's pinned worker protocol lets cancel
    // terminate it even during WASM/model initialization, without global patches.
    worker = new Worker(`${base}worker.min.js`, { name: 'shiti-local-text-ocr' })
    worker.onmessage = (event: MessageEvent<WorkerPacket>) => {
      const packet = event.data
      if (!packet || interrupted) return
      if (packet.status === 'progress') { progress(packet.data); return }
      const job = packet.jobId ? pending.get(packet.jobId) : undefined
      if (!job) return
      pending.delete(packet.jobId!)
      if (packet.status === 'resolve') job.resolve(packet.data)
      else job.reject(new Error('文字识别未能完成，请检查题图是否清晰，或先保存原图'))
    }
    worker.onerror = event => { event.preventDefault(); stop(new Error('本地识字资源未能加载，请检查网络，或先保存原图')) }
    worker.onmessageerror = () => stop(new Error('文字识别中断，请先保存原图后重试'))
    timeout = setTimeout(() => stop(new Error('识别用时较长，已停止本次识别。原图仍保留，可以先收录，稍后整理。')), 120000)
    await request('load', { options: { lstmOnly: true, corePath: `${base}core`, logging: false } })
    await request('loadLanguage', { langs: ['chi_sim', 'eng'], options: {
      langPath: `${base}lang`, cachePath: 'shiti-ocr-v7', cacheMethod: 'write', gzip: true, lstmOnly: true,
    } })
    await request('initialize', { langs: ['chi_sim', 'eng'], oem: 1, config: {} })
    await request('setParameters', { params: { tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' } })
    const texts: string[] = []
    for (imageIndex = 0; imageIndex < images.length; imageIndex++) {
      if (interrupted) throw interrupted
      if (/^\/api\/media\/[a-f0-9]{64}$/.test(images[imageIndex])) images[imageIndex] = await imageAsDataUrl(images[imageIndex]!)
      if (!/^data:image\/(?:png|jpe?g|webp);base64,/i.test(images[imageIndex])) throw new Error('请重新选择 JPG、PNG 或 WebP 题图，再识别文字')
      report(45 + imageIndex / images.length * 54, `正在读取第 ${imageIndex + 1} 张原图…`)
      const response = await fetch(images[imageIndex], { signal: controller.signal })
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (interrupted) throw interrupted
      const data = await request('recognize', { image: bytes, options: {}, output: { text: true } }) as { text?: unknown }
      if (typeof data?.text === 'string' && data.text.trim()) texts.push(data.text.replace(/\u0000/g, '').trim())
    }
    const text = texts.join('\n\n').trim()
    if (!text) throw new Error('没有识别到清晰文字，原图仍保留；可以先保存，或换一张更清晰的题图。')
    report(100, '文字识别完成，请核对后再填入题干。')
    return { text, imageCount: images.length }
  })()
  return { promise: Promise.race([operation, interrupt]).finally(cleanUp), cancel: () => stop(new OcrCancelledError()) }
}
// #endif
