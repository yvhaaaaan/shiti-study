<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { prepareAttachmentImage } from '../services/studyStorage'

const props = withDefaults(defineProps<{ modelValue: string[]; readonly?: boolean; disabled?: boolean; label?: string; limit?: number }>(), { readonly: false, disabled: false, label: '附图', limit: 6 })
const emit = defineEmits<{ 'update:modelValue': [images: string[]]; busy: [value: boolean] }>()
const busy = ref(false)
const hovering = ref(false)
const error = ref('')
let disposed = false
const dropArea = ref<HTMLElement | { $el: HTMLElement } | null>(null)
// #ifdef H5
let dropTarget: HTMLElement | null = null
onMounted(() => {
  const element = dropArea.value
  dropTarget = element && ('$el' in element ? element.$el : element)
  dropTarget?.addEventListener('dragover', dragOver)
  dropTarget?.addEventListener('dragleave', dragLeave)
  dropTarget?.addEventListener('drop', drop)
  dropTarget?.addEventListener('paste', paste)
})
// #endif
onBeforeUnmount(() => {
  disposed = true
  // #ifdef H5
  dropTarget?.removeEventListener('dragover', dragOver)
  dropTarget?.removeEventListener('dragleave', dragLeave)
  dropTarget?.removeEventListener('drop', drop)
  dropTarget?.removeEventListener('paste', paste)
  dropTarget = null
  // #endif
})
function setBusy(value: boolean) { busy.value = value; emit('busy', value) }
function preview(image: string) { uni.previewImage({ urls: [...props.modelValue], current: image }) }
function remove(index: number) { if (!props.disabled && !busy.value) emit('update:modelValue', props.modelValue.filter((_, i) => i !== index)) }
function available() { return !props.disabled && !props.readonly && !busy.value && props.modelValue.length < props.limit }

// #ifdef H5
async function addFiles(files: File[]) {
  if (!available() || !files.length) return
  setBusy(true); error.value = ''; hovering.value = false
  const images = [...props.modelValue]
  const messages: string[] = []
  try {
    for (const file of files) {
      if (disposed) break
      if (images.length >= props.limit) { messages.push(`最多保留 ${props.limit} 张图片。`); break }
      if (!/^image\/(?:jpeg|png|webp)$/i.test(file.type)) { messages.push('请选择 JPG、PNG 或 WebP 图片。'); continue }
      if (!file.size || file.size > 2 * 1024 * 1024) { messages.push('每张图片请控制在 2 MB 以内。'); continue }
      try {
        const source = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('图片读取失败，请重试。')); reader.readAsDataURL(file) })
        const stored = await prepareAttachmentImage(source)
        if (!disposed && !images.includes(stored)) { images.push(stored); emit('update:modelValue', [...images]) }
      } catch (cause) { messages.push(cause instanceof Error ? cause.message : '图片添加失败，请重试。') }
    }
  } finally { if (!disposed) { error.value = [...new Set(messages)].join(' '); setBusy(false) } }
}
function dragOver(event: DragEvent) { event.preventDefault(); hovering.value = available(); if (event.dataTransfer) event.dataTransfer.dropEffect = available() ? 'copy' : 'none' }
function dragLeave(event: DragEvent) { event.preventDefault(); hovering.value = false }
function drop(event: DragEvent) { event.preventDefault(); event.stopPropagation(); hovering.value = false; if (event.dataTransfer?.files.length) void addFiles(Array.from(event.dataTransfer.files)) }
function paste(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.files ?? [])
  if (files.length && available()) { event.preventDefault(); void addFiles(files) }
}
// #endif
function choose() {
  if (!available()) return
  error.value = ''
  // #ifdef H5
  const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp'; input.multiple = true
  input.onchange = () => { if (!disposed) void addFiles(Array.from(input.files ?? [])) }
  input.click()
  // #endif
  // #ifdef MP-WEIXIN
  setBusy(true)
  uni.chooseImage({ count: props.limit - props.modelValue.length, sizeType: ['compressed'], sourceType: ['album', 'camera'], success: async result => {
    const images = [...props.modelValue]
    try {
      for (const file of result.tempFiles as UniApp.ChooseImageSuccessCallbackResultFile[]) {
        if (disposed || images.length >= props.limit) break
        if (file.size > 2 * 1024 * 1024) { error.value = '每张图片请控制在 2 MB 以内。'; continue }
        const path = await new Promise<string>((resolve, reject) => uni.saveFile({ tempFilePath: file.path, success: saved => resolve(saved.savedFilePath), fail: reject }))
        if (!disposed && !images.includes(path)) { images.push(path); emit('update:modelValue', [...images]) }
      }
    } catch { error.value = '图片添加失败，请重试。' }
    finally { if (!disposed) setBusy(false) }
  }, fail: () => { if (!disposed) setBusy(false) } })
  // #endif
}
</script>

<template>
  <view class="attachment-gallery" :class="{ 'attachment-readonly': readonly }">
    <view class="attachment-heading"><view><AppIcon name="image" :size="15" tone="green" /><text>{{ label }}</text></view><text class="attachment-count">{{ modelValue.length }}{{ readonly ? ' 张' : ` / ${limit}` }}</text></view>
    <view v-if="modelValue.length" class="attachment-grid">
      <view v-for="(image, index) in modelValue" :key="`${index}-${image}`" class="attachment-item">
        <button class="attachment-preview" :aria-label="`放大${label} ${index + 1}`" @tap="preview(image)"><image :src="image" mode="aspectFill" /><view class="attachment-zoom"><AppIcon name="external-link" :size="15" tone="white" /></view></button>
        <button v-if="!readonly" class="attachment-remove" :aria-label="`移除${label} ${index + 1}`" :disabled="disabled || busy" @tap="remove(index)"><AppIcon name="x" :size="13" tone="white" /></button>
      </view>
    </view>
    <!-- #ifdef H5 -->
    <view v-if="!readonly" ref="dropArea" class="attachment-drop" :class="{ 'attachment-hover': hovering, 'attachment-disabled': disabled || busy }" tabindex="0" :aria-label="`${label}上传区域，可拖入或粘贴图片`">
      <button class="attachment-add" :disabled="!available()" :aria-disabled="!available()" :aria-label="`添加${label}`" @tap="choose"><AppIcon :name="busy ? 'loader-circle' : 'image'" :size="18" tone="green" /><text>{{ busy ? '正在添加图片…' : modelValue.length >= limit ? '图片已添满' : '添加图片' }}</text></button>
      <text class="attachment-hint">可拖入图片，或选中此区域粘贴截图</text>
    </view>
    <!-- #endif -->
    <!-- #ifdef MP-WEIXIN -->
    <button v-if="!readonly" class="attachment-add" :disabled="!available()" :aria-disabled="!available()" :aria-label="`添加${label}`" @tap="choose"><AppIcon name="image" :size="18" tone="green" /><text>{{ busy ? '正在添加图片…' : '添加图片' }}</text></button>
    <!-- #endif -->
    <text v-if="!readonly" class="attachment-limit">JPG / PNG / WebP · 每张 ≤ 2 MB · 图片随内容保存</text>
    <text v-if="error" role="alert" class="attachment-error">{{ error }}</text>
  </view>
</template>

<style scoped>
.attachment-gallery{margin:16px 0 8px;min-width:0}.attachment-heading,.attachment-heading>view{display:flex;align-items:center;gap:7px}.attachment-heading{justify-content:space-between;margin-bottom:12px;font-size:12px;color:#416c52}.attachment-count{font-size:10px;color:#91a08b}.attachment-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:13px}.attachment-item{position:relative;min-width:0}.attachment-preview{display:block;position:relative;padding:0;margin:0;width:100%;height:112px;background:#edf2e7;border:1px solid #e0e8d9;border-radius:12px;overflow:hidden}.attachment-preview image{width:100%;height:100%;display:block}.attachment-zoom{position:absolute;right:8px;bottom:8px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:#2647359c}.attachment-remove{position:absolute;top:-6px;right:-5px;width:25px;height:25px;padding:0;margin:0;border-radius:50%;background:#42614d;display:flex;align-items:center;justify-content:center;border:2px solid #fff}.attachment-remove[disabled]{opacity:.45}.attachment-drop{display:flex;align-items:center;flex-wrap:wrap;gap:8px 14px;padding:13px 15px;background:#f6f9f2;border:1px dashed #c2d1b9;border-radius:12px;outline-offset:3px}.attachment-hover{border-color:#39775a;background:#e9f3e4}.attachment-add{display:flex;align-items:center;justify-content:center;gap:7px;margin:0;padding:0;background:transparent;font-size:12px;font-weight:550;line-height:24px;color:#39775a}.attachment-add[disabled]{opacity:.55}.attachment-hint,.attachment-limit{font-size:10px;color:#98a28e;line-height:1.8}.attachment-limit{display:block;margin-top:7px}.attachment-error{display:block;color:#ae6d3f;font-size:11px;line-height:1.8;margin-top:8px}.attachment-preview::after,.attachment-remove::after,.attachment-add::after{border:0}.attachment-readonly .attachment-preview{height:132px}.attachment-disabled{opacity:.75}@media(max-width:600px){.attachment-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.attachment-preview,.attachment-readonly .attachment-preview{height:115px}.attachment-hint{display:none}.attachment-drop{justify-content:center;padding:13px}.attachment-limit{font-size:9px}}
</style>
