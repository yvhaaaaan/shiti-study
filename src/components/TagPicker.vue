<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { useStudyStore } from '../domain/store'
import { MAX_TAGS, MAX_TAG_LENGTH, parseTags } from '../domain/taxonomy'
import { getTagGroups, TAG_GROUPS, SUBJECT_TAG_GROUPS } from '../domain/tagCatalog'
import type { TagGroup } from '../domain/tagCatalog'

const props = defineProps<{ modelValue: string; subject: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const store = useStudyStore()
const query = ref('')
const selectedTags = computed(() => parseTags(props.modelValue))
const tagError = computed(() => selectedTags.value.length > MAX_TAGS ? `每题最多 ${MAX_TAGS} 个标签，请移除一些后保存` : selectedTags.value.some(tag => Array.from(tag).length > MAX_TAG_LENGTH) ? `单个标签最多 ${MAX_TAG_LENGTH} 字，请缩短后保存` : '')
const previousTags = computed(() => {
  const counts = new Map<string, number>()
  store.questions.value.filter(question => query.value.trim() || question.subject === props.subject).forEach(question => question.tags.forEach(tag => counts.set(tag, (counts.get(tag) || 0) + 1)))
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag)
})
const allGroups = computed<TagGroup[]>(() => [...Object.entries(SUBJECT_TAG_GROUPS).flatMap(([subject, groups]) => groups.map(group => ({ ...group, id: `${subject}-${group.id}`, label: `${subject} · ${group.label}` }))), ...TAG_GROUPS])
const groups = computed(() => {
  const term = query.value.trim().toLowerCase()
  const source = term ? allGroups.value : getTagGroups(props.subject)
  const history = previousTags.value.length ? [{ id: 'previous-tags', label: '我用过的标签', tags: previousTags.value }] : []
  const seen = new Set<string>()
  return [...history, ...source].map(group => ({ ...group, tags: group.tags.filter(tag => {
    if (seen.has(tag) || (term && !`${tag} ${group.label}`.toLowerCase().includes(term))) return false
    seen.add(tag); return true
  }) })).filter(group => group.tags.length)
})
const resultCount = computed(() => groups.value.reduce((sum, group) => sum + group.tags.length, 0))
const catalogCount = new Set([...Object.values(SUBJECT_TAG_GROUPS).flatMap(groups => groups.flatMap(group => group.tags)), ...TAG_GROUPS.flatMap(group => group.tags)]).size

function onRawInput(event: any) { emit('update:modelValue', event.detail.value) }
function removeTag(tag: string) { emit('update:modelValue', selectedTags.value.filter(value => value !== tag).join('，')) }
function toggleTag(tag: string) {
  if (selectedTags.value.includes(tag)) return removeTag(tag)
  if (selectedTags.value.length >= MAX_TAGS) return uni.showToast({ title: `每题最多选择${MAX_TAGS}个标签`, icon: 'none' })
  emit('update:modelValue', [...selectedTags.value, tag].join('，'))
}
function useSearchAsTag() {
  const candidates = parseTags(query.value)
  if (!candidates.length) return
  const next = [...new Set([...selectedTags.value, ...candidates])]
  if (next.length > MAX_TAGS || next.some(tag => Array.from(tag).length > MAX_TAG_LENGTH)) return uni.showToast({ title: `每题最多${MAX_TAGS}个，单个标签最多${MAX_TAG_LENGTH}字`, icon: 'none' })
  emit('update:modelValue', next.join('，')); query.value = ''
}
</script>

<template>
  <view class="tag-picker">
    <view class="tag-heading"><text class="field-label">知识点标签</text><text class="tag-total">已选 {{ selectedTags.length }} / {{ MAX_TAGS }}</text></view>
    <view v-if="selectedTags.length" class="selected-tags"><button v-for="tag in selectedTags" :key="tag" class="selected-tag" :aria-label="`移除标签 ${tag}`" @tap="removeTag(tag)"><text>{{ tag }}</text><AppIcon name="x" :size="11" tone="green" /></button></view>
    <textarea :value="modelValue" class="form-textarea tag-free-input" :maxlength="2000" placeholder="自己输入标签，用逗号、分号或换行分隔；也可点选下方推荐" @input="onRawInput" />
    <text class="tag-feedback" :class="{ 'tag-feedback-error': tagError }">{{ tagError || '按需选择知识点、题型、学段或方法。已选标签都可用于搜索。' }}</text>
    <view class="tag-library">
      <view class="tag-library-heading"><view><AppIcon name="layers" :size="16" tone="green" /><text>标签库</text><text class="catalog-total">{{ catalogCount }} 个预设</text></view><text class="library-subject">{{ query.trim() ? '正在搜索全部科目' : `${subject} · 按需选取` }}</text></view>
      <view class="tag-search"><AppIcon name="search" :size="15" tone="muted" /><input v-model="query" class="tag-search-input" placeholder="搜索全部标签，或输入新标签" confirm-type="done" @confirm="useSearchAsTag" /><button v-if="query" class="icon-button" aria-label="清空标签搜索" @tap="query = ''"><AppIcon name="x" :size="13" tone="muted" /></button></view>
      <scroll-view scroll-y class="tag-suggestions" :show-scrollbar="true"><view class="tag-groups"><view v-for="group in groups" :key="group.id" class="tag-group"><text class="tag-group-label">{{ group.label }}</text><view class="suggestion-chips"><button v-for="tag in group.tags" :key="tag" class="suggested-tag" :class="{ 'tag-is-selected': selectedTags.includes(tag) }" :aria-pressed="selectedTags.includes(tag)" @tap="toggleTag(tag)"><text class="tag-chip-symbol">{{ selectedTags.includes(tag) ? '✓' : '+' }}</text><text>{{ tag }}</text></button></view></view><view v-if="!groups.length" class="tag-no-results"><text>标签库里还没有这个词</text><text>可以把它添加为自己的标签。</text></view></view></scroll-view>
      <view class="tag-library-footer"><text>{{ resultCount }} 个{{ query.trim() ? '匹配标签' : '可选标签' }} · 点选添加，再点取消</text><button v-if="query.trim()" class="create-tag-button" @tap="useSearchAsTag"><AppIcon name="plus" :size="12" tone="green" /><text>添加输入的标签</text></button></view>
    </view>
  </view>
</template>

<style scoped>
.tag-picker{margin-top:17px;min-width:0}.tag-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.tag-heading .field-label{margin:0 0 10px}.tag-total{font-size:10px;color:#8b9b80;white-space:nowrap;margin-bottom:10px}.selected-tags{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:11px}.selected-tag{margin:0;display:flex;align-items:center;gap:7px;padding:6px 9px;border:1px solid #cddfbe;background:#ecf4e5;border-radius:7px;font-size:11px;color:#4b7643;max-width:100%;line-height:1.5}.selected-tag>text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}.tag-free-input{height:66px;font-size:12px;line-height:1.8;padding:11px 12px}.tag-feedback{display:block;font-size:10px;line-height:1.8;color:#91a081;margin-top:7px}.tag-feedback-error{color:#bd7853}.tag-library{border:1px solid #e2ead8;background:#fafcf6;border-radius:12px;margin-top:14px;overflow:hidden}.tag-library-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:15px 15px 11px}.tag-library-heading>view{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:550;color:#5d7c4c}.catalog-total{font-size:9px;color:#9aa88b;font-weight:400}.library-subject{font-size:9px;color:#9aa88c;max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tag-search{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #e4eadc;border-radius:8px;margin:0 14px 13px;padding:8px 10px}.tag-search-input{flex:1;min-width:0;height:22px;font-size:11px;color:#557249}.tag-search .icon-button{width:22px;height:22px;min-width:22px}.tag-suggestions{height:218px}.tag-groups{padding:0 14px 16px}.tag-group+.tag-group{margin-top:17px}.tag-group-label{display:block;font-size:10px;color:#92a17f;margin-bottom:9px}.suggestion-chips{display:flex;flex-wrap:wrap;gap:7px}.suggested-tag{display:flex;align-items:center;gap:5px;padding:6px 9px;margin:0;background:#fff;border:1px solid #e4eadd;border-radius:6px;font-size:10px;color:#829376;line-height:1.5;max-width:100%}.suggested-tag>text:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tag-chip-symbol{font-size:12px;color:#9eae8e;flex-shrink:0}.suggested-tag.tag-is-selected{border-color:#b6d1a8;background:#e8f2df;color:#527d43}.tag-is-selected .tag-chip-symbol{color:#527d43}.tag-no-results{padding:26px 0;display:flex;align-items:center;flex-direction:column;gap:10px;font-size:11px;color:#91a082}.tag-no-results>text:last-child{font-size:10px;color:#a9b29b}.tag-library-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-top:1px solid #e9eede;background:#f5f8ee;font-size:9px;line-height:1.8;color:#99a78a}.create-tag-button{display:flex;align-items:center;gap:4px;margin:0;padding:0;font-size:10px;color:#638351;background:none;flex-shrink:0}
@media(max-width:600px){.tag-library-heading{align-items:flex-start;flex-direction:column;gap:7px}.library-subject{max-width:100%}.tag-suggestions{height:205px}.suggested-tag{font-size:11px;padding:7px 9px}.tag-library-footer{flex-wrap:wrap}.tag-free-input{height:83px}.selected-tag{font-size:11px}}
</style>
