<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { useStudyStore } from '../domain/store'
import type { QuestionInput } from '../domain/types'
import { readCaptureImage } from '../services/captureImage'
import { splitQuestionPage } from '../services/questionSplit'

type CaptureMode = 'photos' | 'page'
interface QueueItem { key: number; title: string; stem: string; image: string; selected: boolean }
const emit = defineEmits<{ close: []; saved: [ids: string[]] }>()
const store = useStudyStore()
const mode = ref<CaptureMode>('photos')
const queue = ref<QueueItem[]>([])
const pageImage = ref('')
const selecting = ref(false)
const choosing = ref(false)
const generating = ref(false)
const splitReceivedCount = ref(0)
const splitIncomplete = ref(false)
const saving = ref(false)
const saveStarted = ref(false)
const savedIds = ref<string[]>([])
const error = ref('')
const notice = ref('')
const saveError = ref('')
const dragActive = ref(false)
const overlay = ref<HTMLElement | { $el: HTMLElement } | null>(null)
const selectedItems = computed(() => queue.value.filter(item => item.selected))
const hasContent = computed(() => !!pageImage.value || !!queue.value.length)
const locked = computed(() => saveStarted.value || saving.value)
const busy = computed(() => choosing.value || selecting.value || generating.value || locked.value)
const queueLocked = computed(() => choosing.value || selecting.value || locked.value || (generating.value && !splitReceivedCount.value))
const allSelected = computed(() => !!queue.value.length && queue.value.every(item => item.selected))
let nextKey = 0
let disposed = false
let splitSequence = 0
let splitController: AbortController | null = null
let readController: AbortController | null = null
let pendingInputs: QuestionInput[] | null = null
let completed = false
// Saved mini-program files must remain available after the store references them.
const ownedImageFiles = new Set<string>()

function makeItem(title = '', stem = '', image = ''): QueueItem { return { key: ++nextKey, title, stem, image, selected: true } }
function toast(message: string) { uni.showToast({ title: message, icon: 'none', duration: 3000 }) }
function confirmAction(title: string, content: string, confirmText: string): Promise<boolean> {
  return new Promise(resolve => uni.showModal({ title, content, confirmText, cancelText: '继续编辑', success: result => resolve(result.confirm), fail: () => resolve(false) }))
}
function cancelSplit() {
  const wasGenerating = generating.value
  splitSequence += 1
  splitController?.abort()
  splitController = null
  generating.value = false
  if (wasGenerating && !disposed) {
    splitIncomplete.value = true
    error.value = ''
    notice.value = splitReceivedCount.value ? `已停止拆题，保留已完整识别的 ${splitReceivedCount.value} 道题。` : '已取消拆题，原图和原有队列仍保留，可重试或手动拆题。'
  }
}
async function changeMode(next: CaptureMode) {
  if (next === mode.value || busy.value) return
  if (hasContent.value && !await confirmAction('切换批量方式？', '当前尚未保存的题目和原图将清空。', '切换并清空')) return
  if (disposed || busy.value) return
  mode.value = next
  queue.value = []
  pageImage.value = ''
  error.value = ''
  notice.value = ''
  saveError.value = ''
  splitReceivedCount.value = 0
  splitIncomplete.value = false
}
async function requestClose() {
  if (saving.value) return
  if (saveStarted.value) { saveError.value = '保存尚未完成，请先重试或保留当前页；已收录的题目不会重复添加。'; return }
  if (hasContent.value && !await confirmAction('退出本次批量录题？', '尚未保存的题目和原图将丢弃。', '退出')) return
  if (disposed || saving.value || saveStarted.value) return
  cancelSplit()
  readController?.abort()
  emit('close')
}
function removeItem(key: number) {
  if (busy.value) return
  queue.value = queue.value.filter(item => item.key !== key)
}
function addManualItem() {
  if (busy.value || queue.value.length >= 20 || mode.value !== 'page') return
  queue.value.push(makeItem())
  notice.value = '已新增一道题，请填写独立的题干与选项；整页原图会一并保留。'
}
function selectAll() {
  if (queueLocked.value) return
  const next = !allSelected.value
  for (const item of queue.value) item.selected = next
}
function previewImage(image: string) { if (image) uni.previewImage({ urls: [image], current: image }) }
async function preparePageReplacement() {
  if (mode.value !== 'page' || (!pageImage.value && !queue.value.length)) return true
  return confirmAction('更换整页原图？', '当前拆分出的题目和修改将清空，更换后可重新拆题。', '更换并清空')
}

// #ifdef H5
let dropTarget: HTMLElement | null = null
let dragDepth = 0
async function addBrowserImages(blobs: Blob[]) {
  if (busy.value || disposed) return
  if (mode.value === 'photos' && queue.value.length >= 10) { error.value = '每批最多添加 10 张题图。'; return }
  if (mode.value === 'page' && blobs.length !== 1) { error.value = '整页拆题每次请选择一张图片。'; return }
  if (mode.value === 'page' && !await preparePageReplacement()) return
  if (busy.value || disposed) return
  selecting.value = true
  error.value = ''
  notice.value = ''
  readController = new AbortController()
  const errors = new Set<string>()
  let added = 0
  try {
    for (const blob of blobs) {
      if (disposed || readController.signal.aborted) break
      if (mode.value === 'photos' && queue.value.length >= 10) { errors.add('每批最多 10 张，其余题图未添加。'); break }
      try {
        const source = await readCaptureImage(blob, readController.signal)
        if (disposed || readController.signal.aborted) break
        if (mode.value === 'page') { pageImage.value = source; queue.value = []; splitReceivedCount.value = 0; splitIncomplete.value = false; added += 1 }
        else if (!queue.value.some(item => item.image === source)) { queue.value.push(makeItem('', '', source)); added += 1 }
        else errors.add('重复图片已跳过。')
      } catch (failure) { if (!disposed) errors.add(failure instanceof Error ? failure.message : '题图添加失败，请重试。') }
    }
    if (!disposed) {
      error.value = [...errors].join(' ')
      if (added) notice.value = mode.value === 'page' ? '原图已就绪。请选择 AI 拆题，或手动新增独立题目。' : `已添加 ${added} 张题图，每张独立收录为一道题。`
    }
  } finally { readController = null; if (!disposed) selecting.value = false }
}
function isFileDrag(event: DragEvent) { return !!event.dataTransfer && (Array.from(event.dataTransfer.types).includes('Files') || event.dataTransfer.files.length > 0) }
function onDragEnter(event: DragEvent) {
  if (!isFileDrag(event)) return
  event.preventDefault()
  dragDepth += 1
  dragActive.value = !busy.value
}
function onDragOver(event: DragEvent) {
  if (!isFileDrag(event)) {
    if (event.dataTransfer?.types.includes('text/uri-list')) event.preventDefault()
    return
  }
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = busy.value ? 'none' : 'copy'
}
function onDragLeave(event: DragEvent) {
  if (!isFileDrag(event)) return
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth) dragActive.value = false
}
function onDrop(event: DragEvent) {
  dragDepth = 0
  dragActive.value = false
  if (!isFileDrag(event)) {
    if (event.dataTransfer?.types.includes('text/uri-list')) { event.preventDefault(); error.value = '请先将网页图片保存为文件，再拖入。' }
    return
  }
  event.preventDefault()
  const files = Array.from(event.dataTransfer?.files ?? [])
  if (!files.length) { error.value = '未读取到图片文件，请重新选择。'; return }
  void addBrowserImages(files)
}
function onPaste(event: ClipboardEvent) {
  if (disposed || event.defaultPrevented || !event.clipboardData) return
  const files = Array.from(event.clipboardData.items).filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => !!file)
  if (!files.length) return
  event.preventDefault()
  void addBrowserImages(files)
}
onMounted(() => {
  const element = overlay.value
  dropTarget = element && ('$el' in element ? element.$el : element)
  dropTarget?.addEventListener('dragenter', onDragEnter)
  dropTarget?.addEventListener('dragover', onDragOver)
  dropTarget?.addEventListener('dragleave', onDragLeave)
  dropTarget?.addEventListener('drop', onDrop)
  document.addEventListener('paste', onPaste)
})
// #endif

// #ifdef MP-WEIXIN
function discardMiniImage(path: string) { uni.getFileSystemManager().unlink({ filePath: path, fail: () => {} }) }
function miniImageSize(path: string) {
  return new Promise<number>((resolve, reject) => uni.getFileInfo({ filePath: path, success: file => resolve(file.size), fail: () => reject(new Error('题图读取失败，请重新添加。')) }))
}
async function prepareMiniImage(path: string) {
  const size = await miniImageSize(path)
  if (!size || size > 20 * 1024 * 1024) throw new Error('原图为空或超过 20MB，请裁剪后重新添加。')
  const info = await new Promise<UniApp.GetImageInfoSuccessData>((resolve, reject) => uni.getImageInfo({ src: path, success: resolve, fail: () => reject(new Error('图片已损坏，请重新选择。')) }))
  if (!/^(?:jpe?g|png|webp)$/i.test(info.type || '')) throw new Error('请选择 JPG、PNG 或 WebP 图片。')
  if (!info.width || !info.height || info.width * info.height > 64000000 || Math.max(info.width, info.height) > 20000) throw new Error('图片尺寸过大，请裁剪后重新添加。')
  let prepared = path
  const temporary = new Set<string>()
  try {
    if (size > 2 * 1024 * 1024 || Math.max(info.width, info.height) > 2400) {
      let reduced = false
      for (const edge of [2400, 2000, 1800, 1600]) {
        const scale = Math.min(1, edge / Math.max(info.width, info.height))
        for (const quality of [92, 85, 76, 65]) {
          if (disposed) throw new Error('已取消题图读取。')
          const compressed = await new Promise<string>((resolve, reject) => uni.compressImage({ src: path, quality, compressedWidth: Math.max(1, Math.round(info.width * scale)), success: file => resolve(file.tempFilePath), fail: () => reject(new Error('图片压缩失败，请裁剪后重新添加。')) }))
          if (compressed !== path) temporary.add(compressed)
          if (await miniImageSize(compressed) <= 2 * 1024 * 1024) { prepared = compressed; reduced = true; break }
        }
        if (reduced) break
      }
      if (!reduced) throw new Error('图片压缩后仍超过 2MB，请裁剪后重新添加。')
    }
    if (disposed) throw new Error('已取消题图读取。')
    const saved = await new Promise<string>((resolve, reject) => uni.saveFile({ tempFilePath: prepared, success: file => resolve(file.savedFilePath), fail: () => reject(new Error('题图保存失败，请重新添加。')) }))
    temporary.delete(prepared)
    if (disposed) { discardMiniImage(saved); throw new Error('已取消题图读取。') }
    ownedImageFiles.add(saved)
    return saved
  } finally { for (const file of temporary) discardMiniImage(file) }
}
// #endif

async function chooseImages() {
  if (busy.value) return
  const count = mode.value === 'page' ? 1 : 10 - queue.value.length
  if (count <= 0) { error.value = '每批最多添加 10 张题图。'; return }
  // #ifdef MP-WEIXIN
  if (!await preparePageReplacement() || disposed || busy.value) return
  // #endif
  choosing.value = true
  uni.chooseImage({ count, sizeType: ['compressed'], sourceType: ['album', 'camera'], success: async result => {
    choosing.value = false
    if (disposed || busy.value) {
      // #ifdef H5
      for (const path of result.tempFilePaths as string[]) if (path.startsWith('blob:')) URL.revokeObjectURL(path)
      // #endif
      return
    }
    // #ifdef H5
    const blobs: Blob[] = []
    const pendingUrls = new Set((result.tempFilePaths as string[]).filter(path => path.startsWith('blob:')))
    selecting.value = true
    try {
      for (const path of result.tempFilePaths as string[]) {
        try { blobs.push(await (await fetch(path)).blob()) }
        finally { if (pendingUrls.delete(path)) URL.revokeObjectURL(path) }
      }
      selecting.value = false
      await addBrowserImages(blobs)
    } catch { if (!disposed) error.value = '题图读取失败，请重新添加。' }
    finally { for (const path of pendingUrls) URL.revokeObjectURL(path); if (!disposed) selecting.value = false }
    // #endif
    // #ifdef MP-WEIXIN
    if (disposed || busy.value) return
    selecting.value = true
    error.value = ''
    let added = 0
    try {
      for (const path of result.tempFilePaths as string[]) {
        if (disposed || (mode.value === 'photos' && queue.value.length >= 10)) break
        const saved = await prepareMiniImage(path)
        if (disposed) break
        if (mode.value === 'page') { pageImage.value = saved; queue.value = []; splitReceivedCount.value = 0; splitIncomplete.value = false }
        else queue.value.push(makeItem('', '', saved))
        added += 1
      }
      if (!disposed && added) notice.value = mode.value === 'page' ? '原图已就绪，可 AI 拆题或手动新增题目。' : `已添加 ${added} 张题图。`
    } catch (failure) { if (!disposed) error.value = `${failure instanceof Error ? failure.message : '部分图片未能添加。'} 已添加的题图仍保留。` }
    finally { if (!disposed) selecting.value = false }
    // #endif
  }, fail: () => { choosing.value = false } })
}

async function splitPage() {
  if (busy.value || !pageImage.value || mode.value !== 'page') return
  if (queue.value.length && !await confirmAction('重新拆分题目？', '当前队列中的修改将被新的拆题结果替换，原图仍保留。', '重新拆题')) return
  if (busy.value || disposed) return
  const sequence = ++splitSequence
  generating.value = true
  splitReceivedCount.value = 0
  splitIncomplete.value = false
  error.value = ''
  notice.value = ''
  splitController = typeof AbortController === 'function' ? new AbortController() : null
  try {
    let source = pageImage.value
    // #ifdef MP-WEIXIN
    const info = await new Promise<UniApp.GetImageInfoSuccessData>((resolve, reject) => uni.getImageInfo({ src: source, success: resolve, fail: () => reject(new Error('原图读取失败，请重新选择。')) }))
    const encoded = await new Promise<string>((resolve, reject) => uni.getFileSystemManager().readFile({ filePath: source, encoding: 'base64', success: result => resolve(String(result.data)), fail: () => reject(new Error('原图读取失败，请重新选择。')) }))
    if (disposed || sequence !== splitSequence) return
    source = `data:image/${info.type === 'png' ? 'png' : info.type === 'webp' ? 'webp' : 'jpeg'};base64,${encoded}`
    // #endif
    const receivedItems = new Map<number, number>()
    const items = await splitQuestionPage(source, splitController?.signal, { onQuestion: (question, index) => {
      if (disposed || sequence !== splitSequence || receivedItems.has(index)) return
      if (!receivedItems.size) queue.value = []
      const item = makeItem(question.title, question.stem)
      receivedItems.set(index, item.key)
      queue.value.push(item)
      splitReceivedCount.value = receivedItems.size
    } })
    if (disposed || sequence !== splitSequence) return
    if (!items.length) { error.value = '未找到可独立收录的题目，请手动新增，或换一张更清晰的原图。'; return }
    // Keep edits and selection made while later questions were arriving. The
    // final server result validates the stream; it must not overwrite the draft.
    if (!receivedItems.size) queue.value = items.map(item => makeItem(item.title, item.stem))
    else items.forEach((item, index) => { if (!receivedItems.has(index)) queue.value.push(makeItem(item.title, item.stem)) })
    splitReceivedCount.value = items.length
    splitIncomplete.value = false
    notice.value = `已拆出 ${queue.value.length} 道题。请逐题核对题号、公式、选项与条件，再保存。`
  } catch (failure) {
    if (!disposed && sequence === splitSequence) {
      splitIncomplete.value = true
      error.value = `${failure instanceof Error ? failure.message : '本次拆题失败。'} 原图和当前队列仍保留，可重试或手动拆题。`
    }
  } finally { if (sequence === splitSequence) { generating.value = false; splitController = null } }
}

async function saveSelected() {
  if (saving.value || selecting.value || generating.value) return
  if (!pendingInputs) {
    if (!selectedItems.value.length) { toast('请至少选择一道题。'); return }
    const incomplete = selectedItems.value.findIndex(item => !item.stem.trim() && (mode.value === 'page' || !item.image))
    if (incomplete >= 0) { saveError.value = `选中的第 ${incomplete + 1} 道题还没有独立题干，请补充后保存。`; return }
    pendingInputs = selectedItems.value.map((item, index) => ({
      title: item.title.trim() || item.stem.trim().slice(0, 22) || `图片错题 ${index + 1}`,
      subject: '', stem: item.stem.trim(), images: mode.value === 'page' ? (pageImage.value ? [pageImage.value] : []) : (item.image ? [item.image] : []),
      answer: '', analysis: '', userAnswer: '', remark: '', remarkImages: [], tags: [], difficulty: '',
      source: mode.value === 'page' ? '整页拆题' : '批量题图', organizationStatus: 'pending',
    }))
  }
  saving.value = true
  saveStarted.value = true
  saveError.value = ''
  try {
    // Cache IDs before persistence so retrying never adds the same batch twice.
    if (!savedIds.value.length) savedIds.value = store.addQuestions(pendingInputs).map(question => question.id)
    else await store.retryPersistence()
    await store.flushPersistence()
    if (store.state.storageError) throw new Error(store.state.storageError)
    if (disposed) return
    completed = true
    emit('saved', [...savedIds.value])
  } catch (failure) {
    if (!disposed) saveError.value = `${failure instanceof Error ? failure.message : '保存未完成。'} 队列已保留，请留在当前页重试；不会重复添加。`
  } finally { if (!disposed) saving.value = false }
}

onBeforeUnmount(() => {
  disposed = true
  cancelSplit()
  readController?.abort()
  // #ifdef H5
  dropTarget?.removeEventListener('dragenter', onDragEnter)
  dropTarget?.removeEventListener('dragover', onDragOver)
  dropTarget?.removeEventListener('dragleave', onDragLeave)
  dropTarget?.removeEventListener('drop', onDrop)
  document.removeEventListener('paste', onPaste)
  // #endif
  // #ifdef MP-WEIXIN
  if (!completed && !saveStarted.value) for (const file of ownedImageFiles) uni.getFileSystemManager().unlink({ filePath: file, fail: () => {} })
  // #endif
})
</script>

<template>
  <view ref="overlay" class="modal-overlay batch-overlay" @tap.self="requestClose"><view class="modal-window batch-window" :class="{ 'batch-drag-active': dragActive }">
    <view class="modal-header"><view><text class="eyebrow">KEEP EVERY QUESTION</text><text class="modal-title">批量收录题目</text><text class="batch-header-copy">先收好题目，分类与解析稍后补充。</text></view><button class="icon-button" aria-label="关闭批量录题" :disabled="saving" @tap="requestClose"><AppIcon name="x" /></button></view>
    <scroll-view scroll-y class="modal-scroll batch-scroll"><view class="batch-content">
      <view class="batch-mode-picker" role="group" aria-label="批量录题方式">
        <button class="batch-mode" :class="{ active: mode === 'photos' }" :disabled="busy" :aria-pressed="mode === 'photos'" @tap="changeMode('photos')"><AppIcon name="image" :size="21" tone="green" /><view><text>多张题图</text><text>每张一道，最多 10 张</text></view></button>
        <button class="batch-mode" :class="{ active: mode === 'page' }" :disabled="busy" :aria-pressed="mode === 'page'" @tap="changeMode('page')"><AppIcon name="scan-line" :size="21" tone="green" /><view><text>整页拆题</text><text>一张照片，多道题目</text></view></button>
      </view>
      <view class="batch-explainer"><AppIcon name="info" :size="16" tone="green" /><text>{{ mode === 'photos' ? '每张图会独立保存为一道题，题干可留空；整页有多道题时，请切换“整页拆题”。' : '先将整页拆成独立题目，再选择保存。AI 仅提取题干，不生成分类、答案或解析。' }}</text></view>
      <button class="batch-upload" :disabled="busy || (mode === 'photos' && queue.length >= 10)" @tap="chooseImages"><view class="batch-upload-icon"><AppIcon name="image" :size="24" tone="green" /></view><view><text>{{ selecting ? '正在读取并处理题图…' : mode === 'photos' ? '拍照或选择多张题图' : pageImage ? '更换整页原图' : '拍照或选择一张整页照片' }}</text><text>{{ mode === 'photos' ? `${queue.length} / 10 张 · JPG、PNG、WebP` : '原图会随每道独立题目保留' }}</text><text class="batch-desktop-tip">支持拖拽图片或粘贴截图</text></view><AppIcon name="plus" :size="18" tone="green" /></button>
      <view v-if="pageImage && mode === 'page'" class="batch-page-preview"><image :src="pageImage" mode="aspectFit" @tap="previewImage(pageImage)" /><view><text>整页原图</text><text>原图中含多题</text><button class="text-button" @tap="previewImage(pageImage)">放大核对原图</button></view></view>
      <view v-if="mode === 'page'" class="batch-split-actions"><button class="button button-primary" :disabled="busy || !pageImage" :loading="generating" @tap="splitPage"><AppIcon v-if="!generating" name="sparkles" :size="17" tone="white" /><text>{{ generating ? '正在识别并拆分…' : queue.length ? 'AI 重新拆分' : 'AI 拆分题目' }}</text></button><button class="button button-quiet" :disabled="busy || queue.length >= 20" @tap="addManualItem"><AppIcon name="plus" :size="16" tone="green" /><text>{{ queue.length ? '新增一道题' : '手动拆题' }}</text></button></view>
      <view v-if="generating" class="batch-generating" aria-live="polite"><text>{{ splitReceivedCount ? `已识别 ${splitReceivedCount} 道题，可以先核对；其余题目继续识别。` : '正在读取整页题图，完整识别一道就会先显示。' }}</text><button class="text-button" @tap="cancelSplit">取消拆题，保留原图</button></view>
      <text v-if="error" class="batch-error" role="alert">{{ error }}</text><text v-else-if="notice" class="batch-notice" aria-live="polite">{{ notice }}</text>
      <text v-if="splitIncomplete && mode === 'page'" class="batch-error" role="alert">本次拆题未全部完成。请对照原图检查是否漏题，补齐后再保存。</text>
      <view v-if="queue.length" class="batch-queue-heading"><view><text>核对收录队列</text><text>{{ queue.length }} 道题 · 已选 {{ selectedItems.length }} 道</text></view><button class="text-button" :disabled="queueLocked" @tap="selectAll">{{ allSelected ? '取消全选' : '全选' }}</button></view>
      <view v-for="(item, index) in queue" :key="item.key" class="batch-item" :class="{ 'batch-item-unselected': !item.selected }">
        <view class="batch-item-heading"><button class="batch-checkbox" role="checkbox" :aria-checked="item.selected" :aria-label="`选择第 ${index + 1} 道题`" :disabled="queueLocked" @tap="item.selected = !item.selected"><view :class="{ checked: item.selected }"><AppIcon v-if="item.selected" name="check" :size="13" tone="white" /></view><text>第 {{ index + 1 }} 道题</text></button><button class="icon-button batch-remove" :aria-label="`移除第 ${index + 1} 道题`" :disabled="busy" @tap="removeItem(item.key)"><AppIcon name="trash-2" :size="16" tone="muted" /></button></view>
        <view v-if="item.image" class="batch-item-image"><image :src="item.image" mode="aspectFit" @tap="previewImage(item.image)" /><button class="text-button" @tap="previewImage(item.image)">查看题图</button></view>
        <text v-else-if="pageImage && mode === 'page'" class="batch-shared-image-note">原图中含多题 · 请核对本题题号和完整条件</text>
        <input v-model="item.title" class="form-input batch-title-input" :disabled="queueLocked" :maxlength="60" :aria-label="`第 ${index + 1} 道题标题`" placeholder="标题（选填，保存时自动命名）" />
        <textarea v-model="item.stem" class="form-textarea batch-stem-input" :disabled="queueLocked" :maxlength="5000" :aria-label="`第 ${index + 1} 道题题干`" :placeholder="mode === 'page' ? '填写这道题的独立题干、条件与选项…' : '题干可选填，也可仅保存这张题图…'" />
        <view class="batch-item-caption"><text>{{ mode === 'page' ? '请保留独立解题所需的完整内容' : '题图已就绪，题干可稍后补充' }}</text><text>{{ item.stem.length }} / 5000</text></view>
      </view>
      <view v-if="!queue.length && !generating" class="batch-empty"><AppIcon name="folder-open" :size="30" tone="muted" /><text>{{ mode === 'photos' ? '添加题图后，在这里逐张核对。' : '拆出的题目会显示在这里，也可以手动新增。' }}</text></view>
      <view v-if="saveError" class="batch-save-error" role="alert"><AppIcon name="circle-alert" :size="18" tone="orange" /><text>{{ saveError }}</text></view>
    </view></scroll-view>
    <text class="batch-footer-hint">{{ saveStarted ? '本批已锁定，请重试完成保存，避免重复收录。' : '保存后立即进入待整理，后续可逐题使用 AI 整理。' }}</text>
    <view class="modal-footer batch-footer"><button class="button button-quiet" :disabled="saving" @tap="requestClose">返回</button><button class="button button-primary batch-save" :disabled="saving || selecting || generating || (!saveStarted && !selectedItems.length)" :loading="saving" @tap="saveSelected"><AppIcon v-if="!saving" name="check" :size="17" tone="white" /><text>{{ saving ? '正在保存…' : saveStarted ? `重试保存 ${savedIds.length || selectedItems.length} 道题` : `保存选中的 ${selectedItems.length} 道题` }}</text></button></view>
  </view></view>
</template>

<style scoped>
.batch-window{width:720px;height:min(860px,calc(100vh - 70px))}.batch-scroll{height:0;flex:1;min-height:0;position:relative;overflow:hidden}.batch-scroll>.uni-scroll-view{position:absolute;inset:0;height:100%!important;max-height:100%!important}.batch-header-copy{display:block;font-size:10px;line-height:1.8;color:#94a18a;margin-top:6px}.batch-content{padding:23px 28px 26px}.batch-mode-picker{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}.batch-mode{display:flex;align-items:center;gap:11px;min-width:0;margin:0;padding:16px 14px;text-align:left;border:1px solid #e3e9dc;border-radius:12px;background:#fafbf7}.batch-mode.active{background:#edf4e5;border-color:#a9c296}.batch-mode>view{min-width:0}.batch-mode>view>text{display:block;color:#59794e;font-size:12px;font-weight:600;line-height:1.7}.batch-mode>view>text:last-child{font-size:9px;font-weight:400;color:#99a68e;margin-top:4px}.batch-explainer{display:flex;align-items:flex-start;gap:8px;font-size:10px;color:#91a080;line-height:1.9;margin:15px 0 20px}.batch-explainer>.app-icon{margin-top:2px}.batch-upload{display:flex;align-items:center;gap:13px;min-width:0;width:100%;padding:17px;margin:0;text-align:left;background:#f5f8ef;border:1px dashed #b9cbaa;border-radius:12px}.batch-upload-icon{display:flex;align-items:center;justify-content:center;width:43px;height:43px;background:#e8f0de;border-radius:11px;flex-shrink:0}.batch-upload>view:nth-child(2){flex:1;min-width:0}.batch-upload>view>text{display:block;font-size:12px;font-weight:600;color:#53774a;line-height:1.8;overflow-wrap:anywhere}.batch-upload>view>text:nth-child(2){font-size:9px;font-weight:400;color:#99a68d;margin-top:3px}.batch-upload>view>.batch-desktop-tip{display:none;font-size:9px;font-weight:400;color:#99a68d;margin-top:3px}.batch-drag-active{outline:2px dashed #739767;outline-offset:-5px}.batch-page-preview{display:flex;align-items:center;gap:14px;padding:13px;border:1px solid #e4eadc;border-radius:11px;background:#fcfdf9;margin-top:15px}.batch-page-preview>image{width:77px;height:90px;border:1px solid #e7ecdF;background:#fff;border-radius:7px;flex-shrink:0}.batch-page-preview>view{min-width:0}.batch-page-preview>view>text{display:block;font-size:11px;color:#648257;line-height:1.8}.batch-page-preview>view>text:nth-child(2){font-size:9px;color:#b19360;margin-top:3px}.batch-page-preview .text-button{font-size:10px;padding:0;margin:8px 0 0}.batch-split-actions{display:flex;gap:9px;margin-top:15px}.batch-split-actions>.button{flex:1;min-width:0;padding:12px 10px;font-size:11px}.batch-generating{background:#f4f8ee;border:1px solid #e2ead7;border-radius:10px;padding:14px;margin-top:15px;font-size:10px;color:#7d9670;line-height:1.9}.batch-generating>.text-button{font-size:10px;margin:10px 0 0;padding:0}.batch-error,.batch-notice{display:block;font-size:10px;line-height:1.9;overflow-wrap:anywhere;margin-top:13px}.batch-error{color:#b17d4b}.batch-notice{color:#86a071}.batch-queue-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:25px 0 12px}.batch-queue-heading>view>text{display:block;font-size:12px;color:#587b4f;font-weight:600;line-height:1.8}.batch-queue-heading>view>text:last-child{font-size:9px;font-weight:400;color:#9ba78f;margin-top:3px}.batch-queue-heading>.text-button{font-size:10px;flex-shrink:0}.batch-item{padding:16px;border:1px solid #dfe8d7;border-radius:13px;background:#fdfefb;margin-top:12px;min-width:0}.batch-item-unselected{background:#fafbf7;border-color:#e8ecE2}.batch-item-heading{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px}.batch-checkbox{display:flex;align-items:center;gap:8px;background:none;padding:0;margin:0;color:#628355;font-size:11px;min-width:0;line-height:1.8}.batch-checkbox>view{display:flex;align-items:center;justify-content:center;height:18px;width:18px;border:1px solid #cddbbf;border-radius:5px;background:#fff;flex-shrink:0}.batch-checkbox>view.checked{background:#638858;border-color:#638858}.batch-remove{height:25px;width:25px;min-width:25px;padding:0;margin:0}.batch-item-image{display:flex;align-items:center;gap:13px;padding:9px 11px;background:#f4f7ee;border:1px solid #e5ebdc;border-radius:9px;margin-bottom:12px}.batch-item-image>image{display:block;width:80px;height:67px;border-radius:6px;background:#fff;flex-shrink:0}.batch-item-image>.text-button{font-size:10px;padding:0;margin:0}.batch-shared-image-note{display:block;font-size:9px;color:#a08e64;background:#faf6e9;border:1px solid #ede5ce;border-radius:7px;padding:8px 10px;line-height:1.8;margin-bottom:12px}.batch-title-input{width:100%;min-width:0;height:37px!important;box-sizing:border-box;background:#fff;font-size:11px!important}.batch-stem-input{width:100%;min-width:0;box-sizing:border-box;display:block;height:130px;min-height:100px;line-height:1.9;font-size:12px;background:#fff;margin-top:10px}.batch-item-caption{display:flex;align-items:flex-start;justify-content:space-between;gap:9px;color:#a2ad96;font-size:9px;line-height:1.8;margin-top:7px}.batch-item-caption>text:first-child{flex:1;min-width:0}.batch-item-caption>text:last-child{flex-shrink:0;white-space:nowrap}.batch-empty{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:13px;padding:37px 10px 20px;font-size:11px;color:#a6b097;text-align:center;line-height:1.9}.batch-save-error{display:flex;align-items:flex-start;gap:8px;padding:13px;background:#fcf5e9;border:1px solid #ecdfc6;border-radius:10px;margin-top:18px;color:#ad8352;font-size:10px;line-height:1.9;overflow-wrap:anywhere}.batch-save-error>.app-icon{margin-top:2px}.batch-footer-hint{display:block;flex-shrink:0;color:#98a58a;font-size:9px;line-height:1.8;margin:9px 29px 0;overflow-wrap:anywhere}.batch-footer{gap:10px}.batch-footer>.button{min-width:0;font-size:12px;padding:12px 16px}.batch-footer>.batch-save{min-width:210px}.batch-overlay button[disabled]{opacity:.55}@media(min-width:769px) and (hover:hover) and (pointer:fine){.batch-upload>view>.batch-desktop-tip{display:block}}@media(max-width:600px){.batch-window{height:calc(100vh - 38px);max-height:calc(100vh - 38px)}.batch-content{padding:20px 19px 23px}.batch-mode-picker{gap:9px}.batch-mode{padding:13px 10px;gap:8px}.batch-mode>view>text{font-size:11px}.batch-mode>view>text:last-child{font-size:8px}.batch-explainer{font-size:9px;margin:13px 0 17px}.batch-upload{padding:13px 11px;gap:10px}.batch-upload-icon{width:35px;height:39px}.batch-upload>view>text{font-size:11px}.batch-upload>view>text:nth-child(2){font-size:8px}.batch-split-actions>.button{font-size:10px;padding:11px 8px;gap:5px}.batch-queue-heading{margin-top:21px}.batch-item{padding:13px}.batch-stem-input{font-size:11px;height:137px}.batch-footer-hint{margin:8px 20px 0;font-size:8px}.batch-footer{padding:14px 19px 17px;gap:8px}.batch-footer>.button{font-size:11px;padding:12px 13px}.batch-footer>.batch-save{flex:1;min-width:0}.batch-header-copy{font-size:9px}}@media(max-width:350px){.batch-content{padding-left:15px;padding-right:15px}.batch-mode{padding:12px 8px;gap:6px}.batch-mode>view>text:last-child{font-size:7px}.batch-mode>.app-icon{width:18px!important;height:18px!important}.batch-footer{padding-left:15px;padding-right:15px}.batch-footer-hint{margin-left:16px;margin-right:16px}.batch-upload>view>text{font-size:10px}.batch-item-caption{font-size:8px}}
</style>
