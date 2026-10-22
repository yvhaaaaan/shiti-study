import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { handleQuestionGenerate } from '../server/mimo-question.mjs'

/** Loopback-only development adapter; credentials stay in process.env. */
export function createAiServer(env = process.env) {
  return createServer(async (incoming, outgoing) => {
    const address = outgoing.socket?.localAddress || '127.0.0.1'
    const port = outgoing.socket?.localPort || 8787
    const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`])
    const sendError = (status, code, message) => {
      outgoing.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      outgoing.end(JSON.stringify({ error: { code, message } }))
    }
    if (!allowedHosts.has(incoming.headers.host || '')) return sendError(403, 'HOST_NOT_ALLOWED', '本地服务仅接受loopback地址。')
    const base = `http://${address.includes(':') ? `[${address}]` : address}:${port}`
    const target = new URL(incoming.url || '/', base)
    if (target.origin !== new URL(base).origin) return sendError(403, 'HOST_NOT_ALLOWED', '本地服务仅接受loopback地址。')
    if (target.pathname !== '/api/question-generate') return sendError(404, 'NOT_FOUND', '未找到此接口。')
    const controller = new AbortController()
    incoming.once('aborted', () => controller.abort())
    outgoing.once('close', () => { if (!outgoing.writableEnded) controller.abort() })
    try {
      const headers = new Headers()
      for (const [name, value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
      const method = incoming.method || 'GET'
      const request = new Request(target, { method, headers, signal: controller.signal, ...(!['GET', 'HEAD'].includes(method) ? { body: Readable.toWeb(incoming), duplex: 'half' } : {}) })
      const response = await handleQuestionGenerate(request, env, { allowLocalOrigins: true })
      if (outgoing.destroyed) return
      outgoing.writeHead(response.status, Object.fromEntries(response.headers))
      if (!response.body) { outgoing.end(); return }
      const body = Readable.fromWeb(response.body)
      body.on('error', () => { if (!outgoing.destroyed) outgoing.destroy() })
      body.pipe(outgoing)
    } catch {
      if (!outgoing.destroyed && !outgoing.headersSent) sendError(500, 'LOCAL_SERVER_ERROR', '本地生成服务暂时不可用，请稍后重试。')
      else if (!outgoing.destroyed) outgoing.end()
    }
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const configuredPort = Number(process.env.SHITI_AI_PORT || 8787)
  if (!Number.isInteger(configuredPort) || configuredPort < 1024 || configuredPort > 65535) {
    console.error('本地AI端口配置无效，请将SHITI_AI_PORT设为1024至65535的整数。')
    process.exitCode = 1
  } else {
    const server = createAiServer()
    server.on('error', () => { console.error('本地AI服务未能启动，请检查端口是否被占用。'); process.exitCode = 1 })
    server.listen(configuredPort, '127.0.0.1', () => console.log(`拾题 MiMo API：http://127.0.0.1:${configuredPort}/api/question-generate`))
  }
}
