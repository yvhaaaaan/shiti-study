import { reactive } from 'vue'
import type { StudyState } from '../domain/types'

declare global { interface Window { __SHITI_CLOUD__?: boolean } }
export const storageStatus = reactive({ initializing: true, ready: false, cloud: false, expired: false, user: null as null | { ID: string; Username: string }, busy: false, error: '', saving: false, savedAt: '' })
let database: Promise<IDBDatabase> | undefined
let revision = 0
let failedWrite: { revision: number; writeId: string; data: StudyState } | undefined
const uploads = new Map<string, string>()
let uploadGeneration = 0
let activeUploads = 0
const pendingUploads = new Map<string, Promise<string>>()
const uploadControllers = new Set<AbortController>()
const uploadQueue: { generation: number; run: () => Promise<string>; resolve: (url: string) => void; reject: (error: unknown) => void }[] = []

function ensureUploadSession(generation: number) {
  if (generation !== uploadGeneration) throw new Error('登录账号已变化，本次保存已停止，请在当前账号重新操作。')
}
function resetUploadSession() {
  uploadGeneration += 1
  uploads.clear(); pendingUploads.clear()
  for (const controller of uploadControllers) controller.abort()
  for (const task of uploadQueue.splice(0)) task.reject(new Error('登录账号已变化，已停止原账号的题图上传。'))
}
function drainUploadQueue() {
  while (activeUploads < 3 && uploadQueue.length) {
    const task = uploadQueue.shift()!
    if (task.generation !== uploadGeneration) { task.reject(new Error('登录账号已变化，已停止原账号的题图上传。')); continue }
    activeUploads += 1
    void task.run().then(task.resolve, task.reject).finally(() => { activeUploads -= 1; drainUploadQueue() })
  }
}
function queuedUpload(generation: number, run: () => Promise<string>): Promise<string> {
  return new Promise((resolve, reject) => { uploadQueue.push({ generation, run, resolve, reject }); drainUploadQueue() })
}

export function cloudEnabled(): boolean {
  // #ifdef H5
  return window.__SHITI_CLOUD__ === true
  // #endif
  return false
}
/** Reuse the current account's completed upload without reading the image back. */
export function cloudImageReference(source: string): string | undefined {
  if (!cloudEnabled()) return undefined
  if (/^\/api\/media\/[a-f0-9]{64}$/.test(source)) return source
  return uploads.get(`optimized:${source}`) || uploads.get(`original:${source}`)
}
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) controller.abort()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const result = await fetch(path, { credentials: 'same-origin', ...options, signal: controller.signal })
    const data = await result.json()
    if (!result.ok) {
      if (result.status === 401 && path !== '/api/login') storageStatus.expired = true
      throw new Error(data?.error?.message || '保存未完成，请保留当前页面后重试。')
    }
    return data as T
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError' && !(error instanceof TypeError)) throw error
    throw new Error('暂时无法连接服务器，当前输入仍保留，请检查网络后重试。')
  } finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort) }
}
export async function checkSession() {
  storageStatus.cloud = cloudEnabled()
  if (!storageStatus.cloud) return
  const result = await request<{ user: typeof storageStatus.user }>('/api/session')
  if (result.user?.ID !== storageStatus.user?.ID) resetUploadSession()
  storageStatus.user = result.user
}
export async function login(username: string, password: string, inviteCode?: string) {
  storageStatus.busy = true; storageStatus.error = ''
  // Stop queued work before the login response can replace the session cookie.
  resetUploadSession()
  try {
    const result = await request<{ user: NonNullable<typeof storageStatus.user> }>(inviteCode === undefined ? '/api/login' : '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, inviteCode }) })
    resetUploadSession()
    storageStatus.initializing = true; storageStatus.user = result.user; storageStatus.expired = false; revision = 0; failedWrite = undefined
  } catch (error) { storageStatus.error = error instanceof Error ? error.message : '登录未完成，请重试。'; throw error }
  finally { storageStatus.busy = false }
}
export async function logout() {
  await request('/api/logout', { method: 'POST' })
  window.location.reload()
}
export async function changePassword(oldPassword: string, newPassword: string) {
  await request('/api/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oldPassword, newPassword }) })
}
export async function reauthenticate(password: string) {
  if (!storageStatus.user) throw new Error('请先登录拾题。')
  await request('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: storageStatus.user.Username, password }) })
  storageStatus.expired = false
}
function openDatabase(): Promise<IDBDatabase> {
  if (!database) database = new Promise((resolve, reject) => {
    const opening = indexedDB.open('shiti-study', 1)
    opening.onupgradeneeded = () => { if (!opening.result.objectStoreNames.contains('state')) opening.result.createObjectStore('state') }
    opening.onerror = () => { database = undefined; reject(new Error('浏览器数据库未能打开，请保留当前内容后重试。')) }
    opening.onblocked = () => { database = undefined; reject(new Error('请关闭其他拾题页面后再打开数据库。')) }
    opening.onsuccess = () => { const db = opening.result; db.onversionchange = () => { db.close(); database = undefined }; resolve(db) }
  })
  return database
}
export async function loadLocalState(): Promise<StudyState | null> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('state', 'readonly'); const read = tx.objectStore('state').get('study')
    tx.oncomplete = () => resolve((read.result as StudyState | undefined) ?? null)
    tx.onabort = tx.onerror = () => reject(new Error('本地档案未能读取，原有存储仍保留。'))
  })
}
export async function saveLocalState(snapshot: StudyState): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('state', 'readwrite'); tx.objectStore('state').put(snapshot, 'study')
    tx.oncomplete = () => resolve()
    tx.onabort = tx.onerror = () => reject(new Error(tx.error?.name === 'QuotaExceededError' ? '浏览器可用存储不足，请先导出备份；当前输入仍保留。' : '本地保存未完成，请保留页面并重试。'))
  })
}
export async function loadCloudState(): Promise<StudyState | null> {
  const result = await request<{ revision: number; data: StudyState | null }>('/api/state')
  revision = result.revision
  return result.data
}
export async function imageAsDataUrl(source: string): Promise<string> {
  if (/^data:image\//.test(source)) return source
  const target = new URL(source, window.location.href)
  if (target.origin !== window.location.origin || !/^\/api\/media\/[a-f0-9]{64}$/.test(target.pathname)) throw new Error('无法读取备份中的外部题图，请重新上传原图。')
  const response = await fetch(target, { credentials: 'same-origin' })
  if (!response.ok) throw new Error('题图读取失败，请重新登录后再试。')
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('题图读取失败。')); void response.blob().then(blob => reader.readAsDataURL(blob)).catch(reject) })
}
async function optimizedImage(source: string): Promise<Blob> {
  const response = await fetch(source); let blob = await response.blob()
  if (blob.size > 1024 * 1024) {
    const image = new window.Image(); const objectURL = URL.createObjectURL(blob)
    try {
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('题图读取失败。')); image.src = objectURL })
      const scale = Math.min(1, 2800 / Math.max(image.naturalWidth, image.naturalHeight)); const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale)); const context = canvas.getContext('2d')
      if (context) { context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height); const compressed = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92)); if (compressed && compressed.size < blob.size * 0.7) blob = compressed }
    } finally { URL.revokeObjectURL(objectURL) }
  }
  return blob
}
function uploadImage(source: string, preserveOriginal = false): Promise<string> {
  if (/^\/api\/media\/[a-f0-9]{64}$/.test(source)) return Promise.resolve(source)
  const cacheKey = `${preserveOriginal ? 'original:' : 'optimized:'}${source}`
  const known = uploads.get(cacheKey); if (known) return Promise.resolve(known)
  const pending = pendingUploads.get(cacheKey); if (pending) return pending
  if (!/^data:image\/(?:jpeg|png|webp);base64,/i.test(source)) return Promise.reject(new Error('题图地址无法迁移，请重新上传原图。'))
  const generation = uploadGeneration
  const transfer = queuedUpload(generation, async () => {
    ensureUploadSession(generation)
    const blob = preserveOriginal ? await (await fetch(source)).blob() : await optimizedImage(source)
    ensureUploadSession(generation)
    const controller = new AbortController()
    uploadControllers.add(controller)
    try {
      const result = await request<{ url: string }>('/api/media', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob, signal: controller.signal })
      ensureUploadSession(generation)
      if (!/^\/api\/media\/[a-f0-9]{64}$/.test(result.url)) throw new Error('服务器未返回有效的题图地址，请重试保存。')
      uploads.set(cacheKey, result.url)
      return result.url
    } finally { uploadControllers.delete(controller) }
  })
  const tracked: Promise<string> = transfer.then(url => { if (pendingUploads.get(cacheKey) === tracked) pendingUploads.delete(cacheKey); return url }, error => { if (pendingUploads.get(cacheKey) === tracked) pendingUploads.delete(cacheKey); throw error })
  pendingUploads.set(cacheKey, tracked)
  return tracked
}
/** Keep cloud attachment drafts small; the note itself is committed only on Save. */
export async function prepareAttachmentImage(source: string): Promise<string> {
  return cloudEnabled() ? uploadImage(source) : source
}
export async function cloudSnapshot(snapshot: StudyState, preserveOriginal = false): Promise<StudyState> {
  const generation = uploadGeneration
  const copy = JSON.parse(JSON.stringify(snapshot)) as StudyState
  const owners = [...copy.questions, ...copy.notes, ...copy.reviews.map(review => review.questionSnapshot).filter((row): row is NonNullable<typeof row> => Boolean(row))]
  const tasks: Promise<void>[] = []
  function schedule(sources: readonly string[] | undefined): string[] {
    const targets: string[] = new Array(sources?.length ?? 0)
    for (const [index, source] of (sources ?? []).entries()) tasks.push(uploadImage(source, preserveOriginal).then(url => { targets[index] = url }))
    return targets
  }
  // The pool spans all owners, including remarks and review snapshots. Only this
  // detached copy changes; committing the state still waits for every upload.
  for (const row of owners) (row as unknown as { images: string[] }).images = schedule(row.images)
  for (const question of copy.questions) question.remarkImages = schedule(question.remarkImages)
  // Wait for every scheduled image even after one fails, so a retry never races
  // an unfinished transfer from the previous snapshot.
  const results = await Promise.allSettled(tasks)
  ensureUploadSession(generation)
  const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
  if (failure) throw failure.reason
  return copy
}
async function sendWrite(write: NonNullable<typeof failedWrite>, generation: number) {
  ensureUploadSession(generation)
  const result = await request<{ revision: number }>('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(write) })
  ensureUploadSession(generation)
  revision = result.revision
}
export async function saveCloudState(snapshot: StudyState, preserveOriginal = false): Promise<void> {
  const generation = uploadGeneration
  if (failedWrite) { await sendWrite(failedWrite, generation); failedWrite = undefined }
  ensureUploadSession(generation)
  const data = await cloudSnapshot(snapshot, preserveOriginal)
  ensureUploadSession(generation)
  const write = { revision, writeId: `save-${Date.now()}-${Math.random().toString(36).slice(2)}`, data }
  try { await sendWrite(write, generation) }
  catch (error) { if (generation === uploadGeneration) failedWrite = write; throw error }
}
export async function portableState(snapshot: StudyState): Promise<StudyState> {
  const copy = JSON.parse(JSON.stringify(snapshot)) as StudyState
  const images = new Map<string, string>()
  const owners = [...copy.questions, ...copy.notes, ...copy.reviews.map(review => review.questionSnapshot).filter((row): row is NonNullable<typeof row> => Boolean(row))]
  async function embed(sources: readonly string[]): Promise<string[]> {
    const restored: string[] = []
    for (const source of sources) { let value = images.get(source); if (!value) { value = await imageAsDataUrl(source); images.set(source, value) }; restored.push(value) }
    return restored
  }
  for (const row of owners) (row as unknown as { images: string[] }).images = await embed(row.images ?? [])
  for (const question of copy.questions) question.remarkImages = await embed(question.remarkImages ?? [])
  return copy
}
