<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import QuestionFlowSteps from './QuestionFlowSteps.vue'
import { useStudyStore } from '../domain/store'
import { canUseLocalOcr, OcrCancelledError, startQuestionOcr } from '../services/questionOcr'
import type { OcrTask } from '../services/questionOcr'
// #ifdef H5
import { readCaptureImage } from '../services/captureImage'
// #endif

const props = withDefaults(defineProps<{ initialMode?: 'manual' | 'image' }>(), { initialMode: 'manual' })
const emit = defineEmits<{ close: []; saved: [id: string, intent: 'later' | 'ai'] }>()
const store = useStudyStore()
const mode = ref<'manual' | 'image'>(props.initialMode)
const stem = ref('')
const images = ref<string[]>([])
const selecting = ref(false)
const saving = ref(false)
const captureOverlay = ref<HTMLElement | { $el: HTMLElement } | null>(null)
const dragActive = ref(false)
const organizeMode = ref<'later' | 'ai'>('later')
const selectionError = ref('')
const saveError = ref('')
const ocrBusy = ref(false)
const ocrError = ref('')
const ocrNotice = ref('')
const ocrPercent = ref(0)
const ocrLabel = ref('')
const showTextExtraction = ref(false)
const recognizedText = ref('')
const recognitionSnapshot = ref('')
const sourceSnapshot = computed(() => JSON.stringify({ stem: stem.value, images: images.value }))
const resultStale = computed(() => !!recognizedText.value && recognitionSnapshot.value !== sourceSnapshot.value)
const ocrSupported = canUseLocalOcr()
let unavailableMessage = '当前浏览器暂不支持本地文字识别，可以先保存原图，再用智能整理。'
// #ifdef MP-WEIXIN
unavailableMessage = '当前小程序暂不支持本地文字识别，可以先保存原图，再用智能整理。'
// #endif
let disposed = false
let ocrSequence = 0
let ocrTask: OcrTask | null = null
let savedQuestionId: string | null = null
const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const MAX_SOURCE_BYTES = 20 * 1024 * 1024
// #ifdef H5
const imageReadController = new AbortController()
let dropTarget: HTMLElement | null = null
let dragDepth = 0

async function appendBrowserImages(blobs: Blob[]) {
  const errors = new Set<string>()
  let added = 0
  for (const blob of blobs) {
    if (disposed) return
    if (images.value.length >= 3) { errors.add('同一道题最多保留 3 张图片，其余图片未添加。'); break }
    try {
      const source = await readCaptureImage(blob, imageReadController.signal)
      if (disposed) return
      if (!images.value.includes(source)) { images.value.push(source); added += 1 }
    } catch (error) { errors.add(error instanceof Error ? error.message : '题图添加失败，请重试。') }
  }
  if (!disposed) {
    selectionError.value = [...errors].join(' ') || (added ? '' : '这些题图已经添加，请勿重复添加。')
    if (added) mode.value = 'image'
  }
}

async function addBrowserImages(blobs: Blob[]) {
  if (selecting.value || saving.value || disposed) return
  if (images.value.length >= 3) { selectionError.value = '同一道题最多保留 3 张图片，请先移除一张再添加。'; return }
  selecting.value = true
  selectionError.value = ''
  try { await appendBrowserImages(blobs) }
  finally { if (!disposed) selecting.value = false }
}

function onPaste(event: ClipboardEvent) {
  if (disposed || event.defaultPrevented || !event.clipboardData) return
  const files = Array.from(event.clipboardData.items).filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => !!file)
  if (!files.length) return
  event.preventDefault()
  void addBrowserImages(files)
}

function isFileDrag(event: DragEvent) {
  return !!event.dataTransfer && (Array.from(event.dataTransfer.types).includes('Files') || event.dataTransfer.files.length > 0)
}
function resetDrag() { dragDepth = 0; dragActive.value = false }
function onDragEnter(event: DragEvent) {
  if (!isFileDrag(event)) return
  event.preventDefault()
  dragDepth += 1
  dragActive.value = !selecting.value && !saving.value
}
function onDragOver(event: DragEvent) {
  if (!isFileDrag(event)) {
    if (event.dataTransfer?.types.includes('text/uri-list')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }
    return
  }
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = selecting.value || saving.value ? 'none' : 'copy'
}
function onDragLeave(event: DragEvent) {
  if (!isFileDrag(event)) return
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth) dragActive.value = false
}
async function onDrop(event: DragEvent) {
  resetDrag()
  if (!isFileDrag(event)) {
    // Keep a dragged web image URL from navigating away from the unfinished capture.
    if (event.dataTransfer?.types.includes('text/uri-list')) {
      event.preventDefault()
      selectionError.value = '请先把图片保存到电脑，再拖入图片文件。'
    }
    return
  }
  event.preventDefault()
  const files = Array.from(event.dataTransfer?.files ?? [])
  if (!files.length) { selectionError.value = '没有读到图片文件，请从电脑选择或拖入题图。'; return }
  await addBrowserImages(files)
}
onMounted(() => {
  const element = captureOverlay.value
  dropTarget = element && ('$el' in element ? element.$el : element)
  dropTarget?.addEventListener('dragenter', onDragEnter)
  dropTarget?.addEventListener('dragover', onDragOver)
  dropTarget?.addEventListener('dragleave', onDragLeave)
  dropTarget?.addEventListener('drop', onDrop)
  document.addEventListener('paste', onPaste)
})
// #endif

// #ifdef MP-WEIXIN
const ownedImageFiles = new Set<string>()
const imageFingerprints = new Map<string, string>()
function discardImageFile(path: string) { uni.getFileSystemManager().unlink({ filePath: path, fail: () => {} }) }
async function imageFileSize(path: string) {
  return new Promise<number>((resolve, reject) => uni.getFileInfo({ filePath: path, success: result => resolve(result.size), fail: () => reject(new Error('题图读取失败，请重新选择。')) }))
}
async function readMiniImage(path: string, declaredSize?: number): Promise<{ path: string; fingerprint: string }> {
  const size = declaredSize ?? await imageFileSize(path)
  if (!size || size > MAX_SOURCE_BYTES) throw new Error('原图为空或超过 20MB，请裁剪为单道题后再添加。')
  const info = await new Promise<UniApp.GetImageInfoSuccessData>((resolve, reject) => uni.getImageInfo({ src: path, success: resolve, fail: () => reject(new Error('图片已损坏，请重新选择 JPG、PNG 或 WebP。')) }))
  if (!/^(?:jpe?g|png|webp)$/i.test(String(info.type ?? ''))) throw new Error('请选择 JPG、PNG 或 WebP 图片。')
  if (!info.width || !info.height || info.width * info.height > 64000000 || Math.max(info.width, info.height) > 20000) throw new Error('图片尺寸过大，请先裁剪到单道题后再添加。')
  let prepared = path
  const temporary = new Set<string>()
  try {
    if (size > MAX_IMAGE_BYTES || Math.max(info.width, info.height) > 2400) {
      let reduced = false
      for (const edge of [1800, 1600, 1400, 1200]) {
        for (const quality of [90, 78, 65]) {
          if (disposed) throw new Error('已取消题图读取。')
          const scale = Math.min(1, edge / Math.max(info.width, info.height))
          const compressed = await new Promise<string>((resolve, reject) => uni.compressImage({ src: path, quality, compressedWidth: Math.max(1, Math.round(info.width * scale)), success: result => resolve(result.tempFilePath), fail: () => reject(new Error('图片压缩失败，请裁剪后重新选择。')) }))
          if (compressed !== path) temporary.add(compressed)
          if (await imageFileSize(compressed) <= MAX_IMAGE_BYTES) { prepared = compressed; reduced = true; break }
        }
        if (reduced) break
      }
      if (!reduced) throw new Error('图片仍然过大，请裁剪为单道题后重试。')
    }
    const encoded = await new Promise<string>((resolve, reject) => uni.getFileSystemManager().readFile({ filePath: prepared, encoding: 'base64', success: result => resolve(String(result.data)), fail: () => reject(new Error('题图读取失败，请重新选择。')) }))
    let hash = 2166136261
    for (let index = 0; index < encoded.length; index++) hash = Math.imul(hash ^ encoded.charCodeAt(index), 16777619)
    const fingerprint = `${encoded.length}:${hash >>> 0}`
    if (disposed) throw new Error('已取消题图读取。')
    if ([...imageFingerprints.values()].includes(fingerprint)) return { path: '', fingerprint }
    const saved = await new Promise<string>((resolve, reject) => uni.saveFile({ tempFilePath: prepared, success: result => resolve(result.savedFilePath), fail: () => reject(new Error('题图保存失败，请重新选择。')) }))
    temporary.delete(prepared)
    if (disposed) { discardImageFile(saved); throw new Error('已取消题图读取。') }
    ownedImageFiles.add(saved)
    imageFingerprints.set(saved, fingerprint)
    return { path: saved, fingerprint }
  } finally { for (const temporaryPath of temporary) discardImageFile(temporaryPath) }
}
// #endif

function cancelRecognition(notify = true) {
  ocrSequence += 1
  ocrTask?.cancel()
  ocrTask = null
  if (ocrBusy.value && notify) ocrNotice.value = '文字识别已取消，原图仍保留，可以直接保存。'
  ocrBusy.value = false
}
watch(images, () => {
  if (ocrBusy.value) cancelRecognition()
}, { deep: true, flush: 'sync' })

function previewImage(image: string) { uni.previewImage({ current: image, urls: [...images.value] }) }
function removeImage(index: number) {
  if (saving.value || selecting.value || disposed) return
  const image = images.value[index]
  images.value.splice(index, 1)
  selectionError.value = ''
  // #ifdef MP-WEIXIN
  if (image && ownedImageFiles.delete(image)) discardImageFile(image)
  if (image) imageFingerprints.delete(image)
  // #endif
}

function chooseImages() {
  if (selecting.value || saving.value || disposed) return
  if (images.value.length >= 3) { selectionError.value = '同一道题最多保留 3 张图片。'; return }
  selecting.value = true
  selectionError.value = ''
  uni.chooseImage({ count: 3 - images.value.length, sizeType: ['compressed'], sourceType: ['album', 'camera'],
    success: async result => {
      const paths = result.tempFilePaths as string[]
      try {
        if (disposed) return
        // #ifdef H5
        const blobs: Blob[] = []
        for (const path of paths) {
          if (disposed) return
          const response = await fetch(path)
          if (!response.ok) throw new Error('题图读取失败，请重新选择。')
          blobs.push(await response.blob())
        }
        await appendBrowserImages(blobs)
        // #endif
        // #ifdef MP-WEIXIN
        const details = Array.isArray(result.tempFiles) ? result.tempFiles : []
        const errors = new Set<string>()
        let added = 0
        for (let index = 0; index < paths.length && images.value.length < 3; index++) {
          if (disposed) return
          try {
            const result = await readMiniImage(paths[index], (details[index] as { size?: number } | undefined)?.size)
            if (!disposed && result.path) { images.value.push(result.path); added += 1 }
          } catch (error) { errors.add(error instanceof Error ? error.message : '题图添加失败，请重试。') }
        }
        if (!disposed) {
          selectionError.value = [...errors].join(' ') || (added ? '' : '这些题图已经添加，请勿重复添加。')
          if (added) mode.value = 'image'
        }
        // #endif
      } catch (error) { if (!disposed) selectionError.value = error instanceof Error ? error.message : '题图添加失败，请重试' }
      finally {
        // #ifdef H5
        for (const path of paths) if (path.startsWith('blob:')) URL.revokeObjectURL(path)
        // #endif
        if (!disposed) selecting.value = false
      }
    },
    fail: error => { if (!disposed) { selecting.value = false; if (!/cancel/i.test(error.errMsg)) selectionError.value = '没有读到题图，请重新选择。' } },
  })
}

async function recognizeText() {
  if (!ocrSupported || !images.value.length || ocrBusy.value || selecting.value || saving.value || disposed) return
  const sequence = ++ocrSequence
  ocrBusy.value = true
  ocrError.value = ''
  ocrNotice.value = ''
  recognizedText.value = ''
  ocrPercent.value = 0
  recognitionSnapshot.value = sourceSnapshot.value
  ocrLabel.value = '准备识字资源…'
  ocrTask = startQuestionOcr([...images.value], progress => {
    if (!disposed && sequence === ocrSequence) { ocrPercent.value = progress.percent; ocrLabel.value = progress.label }
  })
  try {
    const result = await ocrTask.promise
    if (!disposed && sequence === ocrSequence) recognizedText.value = result.text
  } catch (error) {
    if (!disposed && sequence === ocrSequence && !(error instanceof OcrCancelledError)) ocrError.value = error instanceof Error ? error.message : '文字识别失败，可以直接保存原图。'
  } finally {
    if (sequence === ocrSequence) { ocrBusy.value = false; ocrTask = null }
  }
}
function applyRecognition() {
  const text = recognizedText.value.trim()
  if (saving.value || selecting.value || disposed || !text || resultStale.value || text.length > 5000) return
  stem.value = text
  recognizedText.value = ''
  ocrNotice.value = '文字已填入题干，原图仍保留。请检查公式、符号和手写内容。'
}
async function save(mode: 'later' | 'ai' = 'later') {
  if (saving.value || selecting.value || disposed || (!stem.value.trim() && !images.value.length)) return
  organizeMode.value = mode
  saving.value = true
  saveError.value = ''
  cancelRecognition(false)
  const input = { stem: stem.value.trim(), images: [...images.value], subject: '', difficulty: '' as const, answer: '', analysis: '', tags: [], organizationStatus: 'pending' as const, source: images.value.length ? '快速采集 · 题图' : '快速采集 · 文字' }
  try {
    if (savedQuestionId) store.updateQuestion(savedQuestionId, input)
    else savedQuestionId = store.addQuestion(input).id
    // Keep files referenced by a question even if persistence needs to be retried.
    // #ifdef MP-WEIXIN
    for (const image of input.images) ownedImageFiles.delete(image)
    // #endif
    await store.flushPersistence()
    if (disposed) return
    emit('saved', savedQuestionId, organizeMode.value)
  } catch (error) { if (!disposed) saveError.value = error instanceof Error ? error.message : '保存失败，请重试，当前题目仍保留。' }
  finally { if (!disposed) saving.value = false }
}
function close() {
  cancelRecognition(false)
  emit('close')
}
function requestClose() {
  if (saving.value) return
  if (!stem.value.trim() && !images.value.length && !selecting.value) { close(); return }
  uni.showModal({ title: '这道题还没有存好', content: saveError.value ? '当前内容仅暂留于本次页面，离开前建议先重试保存。确定离开吗？' : '离开会放弃本次尚未保存的题干与题图。', confirmText: '离开', cancelText: '继续收录', confirmColor: '#8d6c4a', success: result => { if (result.confirm) close() } })
}
onBeforeUnmount(() => {
  disposed = true
  cancelRecognition(false)
  // #ifdef H5
  dropTarget?.removeEventListener('dragenter', onDragEnter)
  dropTarget?.removeEventListener('dragover', onDragOver)
  dropTarget?.removeEventListener('dragleave', onDragLeave)
  dropTarget?.removeEventListener('drop', onDrop)
  document.removeEventListener('paste', onPaste)
  dropTarget = null
  imageReadController.abort()
  // #endif
  // #ifdef MP-WEIXIN
  for (const image of ownedImageFiles) discardImageFile(image)
  ownedImageFiles.clear()
  // #endif
})
</script>

<template>
  <view ref="captureOverlay" class="modal-overlay quick-capture-overlay" @tap.self="requestClose"><view class="modal-window quick-capture-window" :class="{ 'quick-drop-active': dragActive }" role="dialog" aria-modal="true" aria-label="快速收录题目">
    <view class="modal-header"><view><text class="eyebrow">KEEP A QUESTION</text><text class="modal-title">添加错题</text></view><button class="icon-button quick-close" aria-label="关闭快速收录" @tap="requestClose"><AppIcon name="x" /></button></view>
    <QuestionFlowSteps :active="1" />
    <scroll-view scroll-y class="quick-capture-scroll"><view class="quick-capture-content">
      <!-- #ifdef H5 -->
      <view class="quick-desktop-drop" :class="{ 'quick-desktop-drop-active': dragActive }" aria-live="polite"><AppIcon name="image" :size="21" tone="green" /><view><text>{{ dragActive ? '松开图片，添加题图' : '拖入图片，或直接粘贴截图' }}</text><text>只需文字或题图即可保存 · 识别与整理可以稍后进行</text></view><AppIcon :name="dragActive ? 'plus' : 'image'" :size="19" tone="muted" /></view>
      <!-- #endif -->
      <view class="quick-mode-picker"><button class="quick-mode" :class="{ 'quick-mode-active': mode === 'manual' }" :aria-pressed="mode === 'manual'" @tap="mode = 'manual'"><AppIcon name="keyboard" :size="24" :tone="mode === 'manual' ? 'green' : 'muted'" /><view><text>文字录入</text><text>记下题干，先留住思路</text></view><view v-if="mode === 'manual'" class="quick-mode-dot" /></button><button class="quick-mode" :class="{ 'quick-mode-active': mode === 'image' }" :aria-pressed="mode === 'image'" @tap="mode = 'image'"><AppIcon name="camera" :size="24" :tone="mode === 'image' ? 'green' : 'muted'" /><view><text>拍照 / 上传</text><text>保留题图，稍后再整理</text></view><view v-if="mode === 'image'" class="quick-mode-dot" /></button></view>
      <view v-if="mode === 'image'" class="quick-photo-section"><button class="quick-upload-button" aria-label="选择题目图片" :disabled="selecting || saving || images.length >= 3" @tap="chooseImages"><view class="quick-upload-icon"><AppIcon name="camera" :size="27" tone="green" /></view><view><text>{{ selecting ? '正在处理题图…' : images.length ? '再添加一张题图' : '拍照或添加题图' }}</text><text>请只记录同一道题，最多 3 张图片</text></view><AppIcon name="plus" :size="21" tone="muted" /></button><text class="quick-photo-hint">支持 JPG、PNG、WebP，原图最大 20MB，大图会自动压缩。请拍清完整题干。</text></view>
      <text v-if="selectionError" class="quick-error" role="alert">{{ selectionError }}</text>
      <view v-if="images.length" class="quick-image-section"><view class="quick-image-heading"><text>题图已添加 · 尚未保存</text><text>{{ images.length }} / 3 张 · 同一道题</text></view><view class="quick-image-grid"><view v-for="(image, index) in images" :key="image" class="quick-image-item"><image :src="image" class="quick-image" mode="aspectFit" :aria-label="`查看第${index + 1}张题图`" @tap="previewImage(image)" /><button class="quick-remove-image" :disabled="saving || selecting" :aria-label="`移除第${index + 1}张题图`" @tap="removeImage(index)"><AppIcon name="x" :size="12" tone="white" /></button><text>题图 {{ index + 1 }}</text></view></view></view>
      <view class="quick-stem-heading"><text class="field-label">题目内容 <text class="quick-optional">{{ images.length ? '可暂时留空' : '与题图至少填写一项' }}</text></text><text>{{ stem.length }} / 5000</text></view><textarea v-model="stem" class="form-textarea quick-stem" :disabled="saving" :maxlength="5000" placeholder="输入题干或先存一张题图，其他信息稍后整理…" />
      <view v-if="images.length" class="quick-ocr-panel"><button class="quick-ocr-heading quick-ocr-toggle" :aria-expanded="showTextExtraction" @tap="showTextExtraction = !showTextExtraction"><AppIcon name="scan-search" :size="20" tone="green" /><view><text>提取文字（可选）</text><text>仅转成可编辑文字，不影响直接保存题图</text></view><AppIcon name="chevron-down" :class="{ 'quick-chevron-expanded': showTextExtraction }" :size="16" tone="muted" /></button>
        <view v-if="showTextExtraction">
        <template v-if="ocrSupported"><text class="quick-ocr-copy">本机识别可提取题图中的文字，首次使用需加载识别资源。也可直接保存题图，稍后再整理。</text><button class="button button-quiet quick-ocr-start" :disabled="ocrBusy || selecting || saving" @tap="recognizeText"><AppIcon name="scan-line" :size="17" tone="green" /><text>{{ ocrBusy ? '正在识别文字…' : '开始提取文字' }}</text></button><view v-if="ocrBusy" class="quick-ocr-progress" aria-live="polite"><view><text>{{ ocrLabel }}</text><text>{{ ocrPercent }}%</text></view><progress :percent="ocrPercent" activeColor="#71966e" backgroundColor="#e5eddf" :stroke-width="4" /><button class="text-button quick-ocr-cancel" @tap="cancelRecognition()">停止识别，保留原图</button></view></template>
        <text v-else class="quick-ocr-copy quick-unsupported">{{ unavailableMessage }}</text>
        <text v-if="ocrError" class="quick-error" role="alert">{{ ocrError }}</text><text v-else-if="ocrNotice" class="quick-ocr-notice" aria-live="polite">{{ ocrNotice }}</text>
        </view>
      </view>
      <view v-if="recognizedText" class="quick-ocr-result"><view class="quick-result-heading"><AppIcon name="check-circle-2" :size="18" tone="green" /><text>识别结果，先核对一下</text></view><textarea v-model="recognizedText" class="form-textarea quick-result-text" :maxlength="20000" aria-label="OCR识别文字预览" /><text class="quick-result-hint" :class="{ 'quick-error': resultStale || recognizedText.length > 5000 }">{{ resultStale ? '题干或题图已更改，请重新识别后再填入，避免覆盖新内容。' : recognizedText.length > 5000 ? '识别内容超过5000字，请先精简识别结果再填入。' : '请核对公式、符号与手写内容。填入只更新题干，原图仍然保留。' }}</text><view class="quick-result-actions"><button class="button button-quiet button-small" @tap="recognizedText = ''">暂不填入</button><button class="button button-primary button-small quick-ocr-apply" :disabled="resultStale || !recognizedText.trim() || recognizedText.length > 5000" @tap="applyRecognition">填入题干</button></view></view>
      <view v-if="saveError" class="quick-save-error" role="alert"><AppIcon name="circle-alert" :size="18" tone="orange" /><text>{{ saveError }}</text></view>
    </view></scroll-view>
    <text class="quick-organize-description" aria-live="polite">保存后即为“已收录 · 待整理”。科目、标签与解析均可稍后补充。</text>
    <view class="modal-footer quick-capture-footer"><button class="button button-quiet quick-cancel" :disabled="saving" @tap="requestClose">取消</button><button class="button button-quiet quick-capture-save quick-save-ai" :disabled="saving || selecting || (!stem.trim() && !images.length)" :loading="saving && organizeMode === 'ai'" @tap="save('ai')"><AppIcon name="sparkles" :size="17" tone="green" /><text>保存并 AI 整理</text></button><button class="button button-primary quick-save-later" :disabled="saving || selecting || (!stem.trim() && !images.length)" :loading="saving && organizeMode === 'later'" @tap="save('later')"><AppIcon name="check" :size="17" tone="white" /><text>保存题目</text></button></view>
  </view></view>
</template>

<style scoped>
.quick-desktop-drop{display:none}.quick-capture-window.quick-drop-active{outline:2px dashed #71966e;outline-offset:-5px}.quick-desktop-drop-active{background:#e8f1df!important;border-color:#71966e!important}@media(min-width:769px) and (hover:hover) and (pointer:fine){.quick-desktop-drop{display:flex;align-items:center;gap:11px;padding:15px 16px;margin:-3px 0 21px;border:1px dashed #b9cbaa;border-radius:12px;background:#f5f8ef;transition:background .15s,border-color .15s}.quick-desktop-drop>view{flex:1;min-width:0}.quick-desktop-drop>view>text:first-child{display:block;font-size:12px;line-height:1.8;color:#56794b;font-weight:600}.quick-desktop-drop>view>text:last-child{display:block;font-size:9px;line-height:1.8;color:#94a486;margin-top:3px}}
.quick-organize-options{display:flex;gap:4px;margin:16px 28px 0;padding:4px;border:1px solid #e3e9da;border-radius:11px;background:#f1f5eb;flex-shrink:0}.quick-organize-option{display:flex;align-items:center;justify-content:center;gap:7px;flex:1;min-width:0;margin:0;padding:11px 10px;background:transparent;border:1px solid transparent;border-radius:8px;font-size:12px;line-height:1.5;color:#8d9c80}.quick-organize-option>text{white-space:nowrap;min-width:0}.quick-organize-option.organize-selected{background:#fffef9;border-color:#d6e2cd;color:#52774b;font-weight:600;box-shadow:0 2px 6px #325b3606}.quick-organize-description{display:block;flex-shrink:0;font-size:10px;line-height:1.8;color:#92a183;margin:9px 30px 0}@media(max-width:600px){.quick-organize-options{margin:14px 20px 0}.quick-organize-option{font-size:11px;gap:6px;padding:11px 7px}.quick-organize-description{font-size:9px;margin:8px 21px 0}}@media(max-width:350px){.quick-organize-options{margin-left:17px;margin-right:17px}.quick-organize-option{gap:5px;padding-left:5px;padding-right:5px}.quick-organize-description{margin-left:18px;margin-right:18px}}
.quick-capture-window{width:640px;height:min(810px,calc(100vh - 70px));max-height:calc(100vh - 70px);display:flex;flex-direction:column}.quick-capture-scroll{height:0;flex:1;min-height:0;position:relative;overflow:hidden}.quick-capture-scroll>.uni-scroll-view{position:absolute;inset:0;height:100%!important;max-height:100%!important}.quick-capture-content{padding:23px 28px 27px}.quick-intro{display:flex;align-items:center;gap:11px;margin-bottom:22px}.quick-intro-icon{display:flex;align-items:center;justify-content:center;width:39px;height:39px;background:#edf4e5;border:1px solid #e4ecda;border-radius:11px;flex-shrink:0}.quick-intro>view:last-child>text:first-child{display:block;color:#537349;font-size:13px;font-weight:600}.quick-intro>view:last-child>text:last-child{display:block;color:#96a28b;font-size:10px;line-height:1.8;margin-top:4px}.quick-mode-picker{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;margin-bottom:23px}.quick-mode{position:relative;display:flex;align-items:center;gap:12px;padding:17px 14px;border:1px solid #e3e9dd;border-radius:12px;background:#fafbf7;text-align:left;margin:0;min-width:0}.quick-mode-active{background:#edf4e5;border-color:#a8c394}.quick-mode>view>text:first-child{display:block;font-size:13px;font-weight:600;color:#628157}.quick-mode>view>text:last-child{display:block;font-size:9px;color:#a0ac91;margin-top:6px;line-height:1.8}.quick-mode-dot{position:absolute;width:5px;height:5px;border-radius:50%;background:#72965f;right:10px;top:10px}.quick-upload-button{display:flex;align-items:center;gap:12px;width:100%;border:1px dashed #bdcdb1;border-radius:12px;background:#f6f9f1;padding:17px;margin:0;text-align:left}.quick-upload-icon{display:flex;align-items:center;justify-content:center;flex-shrink:0;width:43px;height:43px;background:#e8f0df;border-radius:11px}.quick-upload-button>view:nth-child(2){flex:1;min-width:0}.quick-upload-button>view:nth-child(2)>text:first-child{display:block;color:#4a6e44;font-size:13px;font-weight:600}.quick-upload-button>view:nth-child(2)>text:last-child{display:block;color:#9caa8d;font-size:10px;margin-top:6px;line-height:1.7}.quick-photo-hint{display:block;margin:9px 0 20px;font-size:10px;line-height:1.8;color:#9ba68f}.quick-image-section{margin:18px 0 23px}.quick-image-heading{display:flex;justify-content:space-between;gap:10px;font-size:11px;color:#7f9470;margin-bottom:10px}.quick-image-heading>text:last-child{font-size:10px;color:#a2ad96}.quick-image-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.quick-image-item{position:relative;min-width:0}.quick-image{display:block;width:100%;height:106px;background:#f4f6ef;border:1px solid #e8eddf;border-radius:10px}.quick-remove-image{position:absolute;display:flex;align-items:center;justify-content:center;width:23px;height:23px;padding:0;border-radius:50%;background:#52674c;right:5px;top:5px;z-index:1}.quick-image-item>text{display:block;text-align:center;font-size:9px;color:#a1ac93;margin-top:6px}.quick-stem-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:5px}.quick-stem-heading>.field-label{margin:0 0 10px}.quick-stem-heading>text:last-child{font-size:9px;color:#a6af9c;white-space:nowrap;margin-bottom:10px}.quick-optional{font-size:10px;font-weight:400;color:#a7af9b;margin-left:5px}.quick-stem{height:158px;line-height:1.9}.quick-ocr-panel{padding:17px;background:#f3f7ec;border:1px solid #e0e9d7;border-radius:12px;margin-top:22px}.quick-ocr-heading{display:flex;align-items:center;gap:8px}.quick-ocr-heading>view{flex:1;min-width:0}.quick-ocr-heading>view>text:first-child{display:block;font-size:12px;color:#4f7647;font-weight:600}.quick-ocr-heading>view>text:last-child{display:block;font-size:9px;color:#9ca98d;margin-top:4px}.quick-local-badge{font-size:9px;background:#eaf1e1;border:1px solid #dce7d1;padding:3px 5px;border-radius:5px;color:#89a174;white-space:nowrap}.quick-ocr-copy{display:block;font-size:10px;line-height:1.9;color:#91a080;margin-top:12px}.quick-ocr-start{width:100%;margin-top:13px;background:#fffef9;border-color:#dbe6cd;min-height:40px}.quick-ocr-progress{margin-top:15px}.quick-ocr-progress>view{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;font-size:10px;color:#80986d;margin-bottom:9px;line-height:1.8}.quick-ocr-progress>view>text:first-child{flex:1}.quick-ocr-cancel{display:flex;margin:12px 0 0;font-size:10px}.quick-ocr-notice,.quick-error{display:block;font-size:10px;line-height:1.9;margin-top:11px}.quick-ocr-notice{color:#86a071}.quick-error{color:#b27c50!important}.quick-ocr-result{border:1px solid #e0e8d7;background:#fdfef9;border-radius:12px;padding:17px;margin-top:16px}.quick-result-heading{display:flex;align-items:center;gap:7px;color:#4f7b4c;font-size:12px;font-weight:600;margin-bottom:12px}.quick-result-text{height:173px;background:#fff;font-size:12px}.quick-result-hint{display:block;color:#9da98f;font-size:10px;line-height:1.9;margin-top:11px}.quick-result-actions{display:flex;gap:9px;justify-content:flex-end;margin-top:14px}.quick-save-error{display:flex;align-items:flex-start;gap:8px;background:#fcf5e9;border:1px solid #eddfc7;border-radius:10px;padding:13px;color:#af8754;font-size:11px;line-height:1.8;margin-top:20px}.quick-save-error>.app-icon{margin-top:3px;flex-shrink:0}.quick-bottom-note{display:flex;align-items:flex-start;justify-content:center;gap:6px;font-size:10px;color:#a3ad96;line-height:1.8;margin-top:22px}.quick-bottom-note>.app-icon{flex-shrink:0;margin-top:1px}.quick-capture-footer{gap:10px}.quick-capture-footer>.button:first-child{margin-left:auto}.quick-capture-save{min-width:151px}.quick-save-later{min-width:108px;border:1px solid #dce7d4;background:#fbfdf8}.quick-save-ai{min-width:151px}.quick-unsupported{font-size:11px}
@media(max-width:600px){.quick-capture-window{width:100%;height:calc(100vh - 38px);max-height:calc(100vh - 38px)}.quick-capture-content{padding:21px 20px 25px}.quick-mode-picker{gap:9px}.quick-mode{gap:8px;padding:15px 11px}.quick-mode>.app-icon{width:21px!important;height:21px!important}.quick-mode>view>text:first-child{font-size:12px}.quick-mode>view>text:last-child{font-size:8px}.quick-intro>view:last-child>text:last-child{font-size:9px}.quick-upload-button{padding:14px 12px;gap:10px}.quick-upload-icon{width:36px;height:39px}.quick-upload-button>view:nth-child(2)>text:first-child{font-size:12px}.quick-upload-button>view:nth-child(2)>text:last-child{font-size:9px}.quick-photo-hint{font-size:9px}.quick-image-grid{gap:8px}.quick-image{height:85px}.quick-stem{height:143px}.quick-optional{display:block;font-size:9px;margin-left:0;margin-top:4px}.quick-stem-heading{align-items:flex-end}.quick-stem-heading>text:last-child{margin-bottom:11px}.quick-ocr-panel,.quick-ocr-result{padding:14px}.quick-local-badge{font-size:8px}.quick-ocr-copy,.quick-result-hint{font-size:9px}.quick-bottom-note{font-size:9px}.quick-capture-save{min-width:145px}}
@media(max-width:350px){.quick-capture-content{padding-left:17px;padding-right:17px}.quick-mode{gap:7px;padding:14px 9px}.quick-mode>view>text:last-child{font-size:7px}.quick-local-badge{display:none}.quick-capture-footer{padding-left:17px;padding-right:17px}.quick-capture-save{min-width:139px}}
.quick-ocr-toggle{width:100%;padding:0;margin:0;border:0;border-radius:0;background:transparent;text-align:left;line-height:1.6}.quick-ocr-toggle:hover{background:transparent}.quick-chevron-expanded{transform:rotate(180deg)}.quick-save-later{border:0;background:#356849;min-width:115px}.quick-save-later:hover{background:#285b3c}.quick-capture-footer .quick-save-ai{background:#f3f5ee;border:1px solid #e0e8d6}.quick-capture-footer .quick-save-ai:hover{background:#eaf0e1}
@media(max-width:600px){.quick-capture-footer{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:9px}.quick-capture-footer>.quick-cancel{display:none}.quick-capture-footer>.quick-save-ai,.quick-capture-footer>.quick-save-later{width:100%;min-width:0;padding:12px 9px;font-size:11px;margin:0}.quick-capture-footer>.quick-save-ai{gap:5px}.quick-organize-description{margin-bottom:3px}}
</style>
