<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { getKnowledgeGroups } from '../domain/tagCatalog'
import { MAX_RELATED_KNOWLEDGE_POINTS, normalizeKnowledgePoint, normalizeRelatedKnowledgePoints } from '../domain/taxonomy'

const props = withDefaults(defineProps<{
  modelValue?: string
  related?: string[]
  subject: string
  disabled?: boolean
}>(), { modelValue: '', related: () => [], disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: string]; 'update:related': [value: string[]] }>()
const query = ref('')
const groups = computed(() => getKnowledgeGroups(props.subject))
const suggestions = computed(() => {
  const term = query.value.trim().toLowerCase()
  return groups.value.map(group => ({ ...group, tags: group.tags.filter(point => !term || `${point} ${group.label}`.toLowerCase().includes(term)) })).filter(group => group.tags.length)
})
const related = computed(() => normalizeRelatedKnowledgePoints(props.related, props.modelValue))

function choose(point: string) {
  if (props.disabled) return
  const primary = normalizeKnowledgePoint(point, props.subject)
  if (!props.modelValue) return emit('update:modelValue', primary)
  if (primary === props.modelValue) return
  const next = related.value.includes(primary) ? related.value.filter(item => item !== primary) : [...related.value, primary]
  if (next.length > MAX_RELATED_KNOWLEDGE_POINTS) return uni.showToast({ title: `最多选择${MAX_RELATED_KNOWLEDGE_POINTS}个相关知识点`, icon: 'none' })
  emit('update:related', next)
}

function removeRelated(point: string) { if (!props.disabled) emit('update:related', related.value.filter(item => item !== point)) }
function useCustom() {
  const point = query.value.trim()
  if (!point || props.disabled) return
  try {
    if (!props.modelValue) emit('update:modelValue', normalizeKnowledgePoint(point, props.subject))
    else if (!related.value.includes(point)) emit('update:related', normalizeRelatedKnowledgePoints([...related.value, point], props.modelValue))
    query.value = ''
  } catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '知识点名称无效', icon: 'none' }) }
}
</script>

<template>
  <view class="knowledge-point-picker">
    <view class="knowledge-heading"><view><text class="field-label">主知识点</text><text class="knowledge-hint">先归到一个最主要的知识点，再补充相关知识点</text></view><text class="knowledge-count">{{ related.length }} / {{ MAX_RELATED_KNOWLEDGE_POINTS }} 相关</text></view>
    <view class="primary-point" :class="{ empty: !modelValue }"><AppIcon name="target" :size="16" tone="green" /><text>{{ modelValue || (subject ? '待选择；未选择时归入待归类' : '选择科目后再归类') }}</text></view>
    <view v-if="related.length" class="related-points"><button v-for="point in related" :key="point" class="related-point" @tap="removeRelated(point)"><text>{{ point }}</text><AppIcon name="x" :size="11" tone="green" /></button></view>
    <view class="knowledge-search"><AppIcon name="search" :size="15" tone="muted" /><input v-model="query" :disabled="disabled || !subject" class="knowledge-search-input" placeholder="搜索或输入自定义知识点" confirm-type="done" @confirm="useCustom" /><button v-if="query" class="icon-button" aria-label="清空知识点搜索" @tap="query = ''"><AppIcon name="x" :size="13" tone="muted" /></button></view>
    <view v-if="suggestions.length" class="knowledge-groups"><view v-for="group in suggestions" :key="group.id" class="knowledge-group"><text class="knowledge-group-label">{{ group.label }}</text><view class="knowledge-options"><button v-for="point in group.tags" :key="point" class="knowledge-option" :class="{ primary: modelValue === point, related: related.includes(point) }" :disabled="disabled" @tap="choose(point)"><text>{{ modelValue === point ? '主 · ' : related.includes(point) ? '关 · ' : '+ ' }}{{ point }}</text></button></view></view></view>
    <view v-else-if="query" class="knowledge-no-result"><text>没有匹配的知识点</text><button class="text-button" :disabled="disabled || !subject" @tap="useCustom">使用“{{ query.trim() }}”</button></view>
    <text class="knowledge-footnote">知识点只在 {{ subject || '当前科目' }} 内生效；旧版标签仍保留在“高级整理”中。</text>
  </view>
</template>

<style scoped>
.knowledge-point-picker{margin:18px 0 4px;min-width:0}.knowledge-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:10px}.knowledge-heading>view{min-width:0}.knowledge-heading .field-label{display:block;margin:0}.knowledge-hint{display:block;font-size:10px;color:#a19489;line-height:1.7;margin-top:4px}.knowledge-count{font-size:10px;color:#9a8b80;white-space:nowrap}.primary-point{display:flex;align-items:center;gap:8px;margin-top:10px;padding:11px 12px;border:1px solid #cfdcca;background:#f5faf1;border-radius:9px;color:#59734e;font-size:12px;line-height:1.6}.primary-point.empty{border-style:dashed;color:#9a8d82;background:#fcfaf8}.related-points{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.related-point{display:flex;align-items:center;gap:5px;margin:0;padding:5px 8px;background:#f1f5ed;border:1px solid #dfe8d8;border-radius:6px;color:#617657;font-size:10px}.knowledge-search{display:flex;align-items:center;gap:8px;margin-top:11px;padding:8px 10px;border:1px solid #ebe3db;border-radius:8px;background:#fff}.knowledge-search-input{flex:1;min-width:0;height:22px;color:#6e5c4f;font-size:11px}.knowledge-search .icon-button{width:22px;height:22px;min-width:22px}.knowledge-groups{margin-top:12px}.knowledge-group+.knowledge-group{margin-top:13px}.knowledge-group-label{display:block;margin-bottom:7px;color:#9a8b80;font-size:10px}.knowledge-options{display:flex;flex-wrap:wrap;gap:6px}.knowledge-option{margin:0;padding:6px 8px;border:1px solid #ebe3dc;border-radius:6px;background:#fff;color:#806f62;font-size:10px;line-height:1.5}.knowledge-option.primary{border-color:#a9c39d;background:#edf5e9;color:#4f7045}.knowledge-option.related{border-color:#d9c9a3;background:#fbf5e6;color:#987b43}.knowledge-no-result{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;color:#a0958c;font-size:10px}.knowledge-no-result .text-button{font-size:10px}.knowledge-footnote{display:block;margin-top:9px;color:#a3988e;font-size:10px;line-height:1.8}@media(max-width:600px){.knowledge-hint{font-size:9px}.knowledge-option{font-size:10px;padding:7px 8px}.knowledge-footnote{font-size:9px}}
</style>
