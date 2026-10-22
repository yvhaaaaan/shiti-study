import { handleQuestionGenerate } from './mimo-question.mjs'

// Sites controls private access before dispatching to this Worker. Keep requests
// intact for the shared handler's same-origin checks and cancellation signal.
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname
    if (path === '/server') {
      try {
        if (!env.SHITI_SERVER_ENTRY || !env.SHITI_ENTRY_SECRET) throw new Error('not configured')
        const nonce = crypto.randomUUID()
        const discovery = new URL(env.SHITI_SERVER_ENTRY)
        discovery.searchParams.set('nonce', nonce)
        const response = await fetch(discovery, { redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { 'Cache-Control': 'no-cache' } })
        if (!response.ok) throw new Error('entry unavailable')
        const item = await response.json()
        const target = new URL(item.url)
        if (target.protocol !== 'https:' || !target.hostname.endsWith('.trycloudflare.com') || target.pathname !== '/' || target.search || target.username || target.password || target.port || target.hash || !/^[a-f0-9]{64}$/.test(item.signature)) throw new Error('untrusted entry')
        const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SHITI_ENTRY_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
        const signature = Uint8Array.from(item.signature.match(/../g), byte => parseInt(byte, 16))
        if (!await crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(item.url + '\n' + nonce))) throw new Error('invalid signature')
        return new Response(null, { status: 302, headers: { Location: target.href, 'Cache-Control': 'no-store' } })
      } catch {
        return new Response('服务器学习空间正在连接，请稍后刷新。原站档案仍可在首页查看和导出。', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
      }
    }
    if (path === '/api/question-generate') {
      return handleQuestionGenerate(request, env, {
        // Workers implements manual/follow, but not redirect: "error". Reject
        // redirects through the handler's non-2xx path without forwarding keys.
        fetchImpl: (input, init) => fetch(input, { ...init, redirect: 'manual' }),
      })
    }
    if (path === '/api' || path.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: '未找到此接口。' } }), {
        status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      })
    }
    return env.ASSETS.fetch(request)
  },
}
