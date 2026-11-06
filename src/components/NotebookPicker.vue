<script setup lang="ts">
import { computed } from 'vue'
import { useStudyStore } from '../domain/store'
import AppIcon from './AppIcon.vue'
const props = withDefaults(defineProps<{ modelValue?: string; disabled?: boolean; label?: string }>(), { modelValue: '', disabled: false, label: '收录到' })
const emit = defineEmits<{ 'update:modelValue': [id: string] }>()
const store = useStudyStore()
const options = computed(() => [{ id: '', title: '按科目自动归档' }, ...store.notebooks.value.map(book => ({ id: book.id, title: book.title }))])
const selectedIndex = computed(() => Math.max(0, options.value.findIndex(item => item.id === props.modelValue)))
const missing = computed(() => !!props.modelValue && !options.value.some(item => item.id === props.modelValue))
function change(event: { detail: { value: number | string } }) {
  const option = options.value[Number(event.detail.value)]
  if (option) emit('update:modelValue', option.id)
}
function changeHtml(event: Event) { emit('update:modelValue', (event.target as HTMLSelectElement).value) }
</script>
<template>
  <view class="notebook-picker-field">
    <text class="notebook-picker-label">{{ label }}</text>
    <!-- #ifdef H5 -->
    <view class="notebook-picker-value"><AppIcon name="book-open" :size="17" tone="green" /><select class="notebook-native-select" :value="modelValue" :disabled="disabled" :aria-label="label" @change="changeHtml"><option v-if="missing" :value="modelValue" disabled>原错题本已不可用，请重新选择</option><option v-for="option in options" :key="option.id" :value="option.id">{{ option.title }}</option></select><AppIcon name="chevron-down" :size="15" tone="muted" /></view>
    <!-- #endif -->
    <!-- #ifdef MP-WEIXIN -->
    <picker class="notebook-picker" :disabled="disabled" :range="options" range-key="title" :value="selectedIndex" @change="change">
      <view class="notebook-picker-value"><AppIcon name="book-open" :size="17" tone="green" /><text>{{ missing ? '原错题本已不可用，请重新选择' : options[selectedIndex]?.title }}</text><AppIcon name="chevron-down" :size="15" tone="muted" /></view>
    </picker>
    <!-- #endif -->
    <text class="notebook-picker-hint">错题本与学科分类独立；默认科目只作整理建议，可按每道题修改。</text>
  </view>
</template>
<style scoped>
.notebook-picker-field{margin:0 0 22px;min-width:0}.notebook-picker-label{display:block;font-size:12px;font-weight:550;color:#53684f;margin-bottom:9px}.notebook-picker{display:block;min-width:0}.notebook-picker-value{display:flex;align-items:center;gap:10px;border:1px solid #dfe7d9;background:#f8fbf5;border-radius:8px;padding:12px 13px;min-height:44px;color:#56734a;font-size:13px}.notebook-picker-value>text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.notebook-native-select{display:block;flex:1;width:0;min-width:0;border:0;outline:none;background:transparent;color:inherit;font:inherit;appearance:none;text-overflow:ellipsis;cursor:pointer}.notebook-native-select:disabled{opacity:.6;cursor:default}.notebook-picker-hint{display:block;font-size:10px;color:#98a68b;line-height:1.8;margin-top:7px}@media(max-width:600px){.notebook-picker-field{margin-bottom:19px}.notebook-picker-value{font-size:12px;padding:11px 12px}.notebook-picker-hint{font-size:10px}}
</style>
