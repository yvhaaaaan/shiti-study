export interface SplitQuestion { title: string; stem: string }
export interface SplitHandlers { onQuestion?: (question: SplitQuestion, index: number) => void }

function validateSplitResult(value: unknown): SplitQuestion[] {
  const rows = value && typeof value === 'object' ? (value as { questions?: unknown }).questions : null
  if (!Array.isArray(rows) || !rows.length || rows.length > 20) throw new Error('未得到有效的题目列表，请重试或手动拆分。')
  return rows.map(row => {
    if (!row || typeof row.title !== 'string' || typeof row.stem !== 'string' || !row.title.trim() || !row.stem.trim() || row.title.length > 60 || row.stem.length > 5000) throw new Error('拆题结果不完整，请重试或手动拆分。')
    return { title: row.title.trim(), stem: row.stem.trim() }
  })
}

// #ifdef H5
function parseSplitEvent(block: string): { name: string; data: any } | null {
  let name = 'message'
  const data: string[] = []
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) name = line.slice(6).trim()
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
  }
  if (!data.length) return null
  try { return { name, data: JSON.parse(data.join('\n')) } } catch { throw new Error('拆题流格式异常，已收到的题目仍可核对。') }
}

async function readSplitStream(body: ReadableStream<Uint8Array>, handlers: SplitHandlers): Promise<SplitQuestion[]> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const received = new Map<number, SplitQuestion>()
  let buffer = ''
  let bytes = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 256 * 1024) throw new Error('拆题结果过长，请分区域拍摄后重试。')
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n')
      let boundary = buffer.indexOf('\n\n')
      while (boundary >= 0) {
        const event = parseSplitEvent(buffer.slice(0, boundary))
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf('\n\n')
        if (!event) continue
        if (event.name === 'error') throw new Error(typeof event.data?.error?.message === 'string' ? event.data.error.message : '拆题未全部完成，已收到的题目仍可核对。')
        if (event.name === 'question') {
          const index = event.data?.index
          if (!Number.isInteger(index) || index < 0 || index >= 20) throw new Error('拆题顺序异常，请重新识别或手动核对。')
          const question = validateSplitResult({ questions: [event.data.question] })[0]!
          const previous = received.get(index)
          if (previous) {
            if (previous.title !== question.title || previous.stem !== question.stem) throw new Error('拆题内容前后不一致，请核对原图后重试。')
            continue
          }
          if (index !== received.size) throw new Error('拆题顺序异常，请重新识别或手动核对。')
          received.set(index, question)
          handlers.onQuestion?.({ ...question }, index)
        } else if (event.name === 'done') {
          const result = validateSplitResult(event.data)
          if (result.length < received.size || [...received].some(([index, question]) => result[index]?.title !== question.title || result[index]?.stem !== question.stem)) throw new Error('拆题内容前后不一致，请核对原图后重试。')
          return result
        }
      }
    }
    throw new Error('拆题连接中断，已收到的题目仍保留；请核对或重新识别。')
  } finally {
    try { await reader.cancel() } catch {}
    reader.releaseLock()
  }
}
// #endif

export async function splitQuestionPage(image: string, signal?: AbortSignal, handlers: SplitHandlers = {}): Promise<SplitQuestion[]> {
  if (!/^data:image\/(?:jpeg|png|webp);base64,/i.test(image) && !/^\/api\/media\/[a-f0-9]{64}$/.test(image)) throw new Error('请先选择 JPG、PNG 或 WebP 整页题图。')
  const configured = String(import.meta.env.VITE_SHITI_AI_URL || '').trim()
  if (configured && !/^https:\/\//i.test(configured) && !/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\//i.test(configured)) throw new Error('拆题服务地址需使用 HTTPS。')
  const url = configured ? configured.replace(/\/question-generate\/?$/, '/question-split') : '/api/question-split'
  // #ifdef H5
  const controller = new AbortController()
  const cancel = () => controller.abort()
  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) controller.abort()
  const timer = setTimeout(cancel, 70000)
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify({ image }), signal: controller.signal })
    if (response.ok && (response.headers.get('Content-Type') || '').toLowerCase().includes('text/event-stream')) {
      if (!response.body) throw new Error('拆题连接未建立，原图仍保留。')
      return await readSplitStream(response.body, handlers)
    }
    let body: any
    try { body = await response.json() } catch { throw new Error('拆题服务未返回有效结果，原图仍保留。') }
    if (!response.ok) throw new Error(body?.error?.message || (response.status === 404 ? '整页拆题服务尚未部署，可先手动拆分。' : '拆题未完成，原图仍保留，请重试。'))
    return validateSplitResult(body)
  } catch (error) {
    if (controller.signal.aborted) throw new Error(signal?.aborted ? '已取消拆题，原图仍保留。' : '拆题超时，原图仍保留，可重试或手动拆分。')
    throw error instanceof Error ? error : new Error('暂时无法连接拆题服务，原图仍保留。')
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel) }
  // #endif
  // #ifdef MP-WEIXIN
  if (!configured) throw new Error('小程序尚未配置拆题服务，请先手动拆分。')
  return new Promise<SplitQuestion[]>((resolve, reject) => {
    const task = uni.request({ url, method: 'POST', data: { image }, timeout: 70000,
      success: response => { try {
        const body: any = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
        if (response.statusCode !== 200) throw new Error(body?.error?.message || '拆题未完成，原图仍保留。')
        resolve(validateSplitResult(body))
      } catch (error) { reject(error) } },
      fail: () => reject(new Error('拆题已中断，原图仍保留，请重试。')),
      complete: () => signal?.removeEventListener('abort', abort),
    })
    const abort = () => task.abort()
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
  })
  // #endif
}
