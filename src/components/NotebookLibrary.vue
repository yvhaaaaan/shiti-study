<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import QuestionCard from './QuestionCard.vue'
import { useStudyStore } from '../domain/store'
import { normalizeTags } from '../domain/taxonomy'
import type { Question } from '../domain/types'

type Collection = 'all' | 'pending' | 'ready'
const props = defineProps<{ scope: 'library' | 'favorites' | 'recycle'; search: string; collection: Collection; tag: string }>()
const emit = defineEmits<{ 'update:search': [value: string]; 'update:collection': [value: Collection]; 'update:tag': [value: string]; open: [id: string]; edit: [id: string]; add: [] }>()
const store = useStudyStore()
const subject = ref('')
const status = ref('')
const difficulty = ref('')
const sortIndex = ref(0)
const layout = ref<'grid' | 'list'>('grid')
const selecting = ref(false)
const selected = ref<string[]>([])
const currentPage = ref(1)
const busy = ref(false)
const actionError = ref('')
const pageSize = 8
const sortOptions = ['最新收录', '最早收录', '最近修改', '复习次数最多']
const statusOptions = ['全部掌握状态', '待巩固', '已掌握']
const difficultyOptions = ['全部难度', '基础', '进阶', '挑战']
const collectionOptions: { id: Collection; label: string; icon: string }[] = [
  { id: 'all', label: '全部题目', icon: 'book-open' },
  { id: 'pending', label: '待整理', icon: 'folder-open' },
  { id: 'ready', label: '已整理', icon: 'check-check' },
]
const source = computed(() => store.state.questions.filter(q => props.scope === 'recycle' ? !!q.deletedAt : !q.deletedAt && (props.scope !== 'favorites' || q.favorite)))
const counts = computed(() => ({ all: source.value.length, pending: source.value.filter(q => q.organizationStatus === 'pending').length, ready: source.value.filter(q => q.organizationStatus !== 'pending').length }))
const title = computed(() => ({ library: '我的错题', favorites: '我的收藏', recycle: '回收站' })[props.scope])
const description = computed(() => ({ library: '找到那道题，再向前一步。', favorites: '值得回看的好题，留在这里。', recycle: '暂时放下的题目，随时可以恢复。' })[props.scope])
const terms = computed(() => props.search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean))
function matches(q: Question, except?: 'subject' | 'tag') {
  if (props.collection !== 'all' && (q.organizationStatus === 'pending' ? 'pending' : 'ready') !== props.collection) return false
  if (except !== 'subject' && subject.value && (subject.value === '__unclassified' ? !!q.subject : q.subject !== subject.value)) return false
  if (except !== 'tag' && props.tag && !q.tags.includes(props.tag)) return false
  if (status.value && (q.organizationStatus === 'pending' || q.status !== status.value)) return false
  if (difficulty.value && q.difficulty !== difficulty.value) return false
  if (terms.value.length) {
    const text = [q.subject, q.title, q.stem, q.answer, q.analysis, q.userAnswer, q.remark, q.source, ...q.tags].join(' ').toLocaleLowerCase()
    if (!terms.value.every(term => text.includes(term))) return false
  }
  return true
}
const subjectOptions = computed(() => {
  const matching = source.value.filter(q => matches(q, 'subject'))
  const names = [...new Set(matching.map(q => q.subject || '__unclassified'))]
  if (subject.value && !names.includes(subject.value)) names.push(subject.value)
  names.sort((a, b) => a === '__unclassified' ? 1 : b === '__unclassified' ? -1 : a.localeCompare(b, 'zh-CN'))
  return [{ id: '', label: '全部科目', count: matching.length }, ...names.map(id => ({ id, label: id === '__unclassified' ? '未分类' : id, count: matching.filter(q => (q.subject || '__unclassified') === id).length }))]
})
const tagOptions = computed(() => {
  const tags = new Set(source.value.filter(q => matches(q, 'tag')).flatMap(q => q.tags))
  if (props.tag) tags.add(props.tag)
  return ['全部标签', ...[...tags].sort((a, b) => a.localeCompare(b, 'zh-CN'))]
})
const filtered = computed(() => source.value.filter(q => matches(q)).sort((a, b) => {
  if (sortIndex.value === 1) return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
  if (sortIndex.value === 2) return b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id)
  if (sortIndex.value === 3) return b.reviewCount - a.reviewCount || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
  return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
}))
const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))
const paginated = computed(() => filtered.value.slice((currentPage.value - 1) * pageSize, currentPage.value * pageSize))
const allPageSelected = computed(() => !!paginated.value.length && paginated.value.every(q => selected.value.includes(q.id)))
const filters = computed(() => [
  ...(props.search.trim() ? [{ key: 'search', label: `搜索：${props.search.trim()}` }] : []),
  ...(subject.value ? [{ key: 'subject', label: subject.value === '__unclassified' ? '未分类' : subject.value }] : []),
  ...(props.tag ? [{ key: 'tag', label: `# ${props.tag}` }] : []),
  ...(status.value ? [{ key: 'status', label: status.value === 'mastered' ? '已掌握' : '待巩固' }] : []),
  ...(difficulty.value ? [{ key: 'difficulty', label: difficulty.value }] : []),
])
const emptyTitle = computed(() => filters.value.length ? '没有找到匹配的题目' : !source.value.length ? props.scope === 'favorites' ? '还没有收藏的题目' : props.scope === 'recycle' ? '回收站里空空的' : '从第一道错题开始' : props.collection === 'pending' ? '暂时没有待整理题目' : '还没有整理完成的题目')
const emptyCopy = computed(() => filters.value.length ? '试试减少筛选条件，或换一个关键词。' : !source.value.length ? props.scope === 'favorites' ? '在题目卡片上点一下收藏，就能在这里找到它。' : props.scope === 'recycle' ? '移入回收站的题目会保留在这里。' : '输入文字或上传题图，分类和解析可以稍后补充。' : props.collection === 'pending' ? '已收录的题目都已整理，可以去回看和巩固。' : '进入待整理，手动补充或使用 AI 辅助整理。')
watch([() => props.scope, () => props.collection, () => props.search, () => props.tag, subject, status, difficulty, sortIndex], () => { currentPage.value = 1; selected.value = []; actionError.value = '' })
watch(() => props.scope, () => { clearFilters(); selecting.value = false })
watch(() => props.collection, value => { if (value === 'pending') { status.value = ''; difficulty.value = '' } })
watch(totalPages, max => { currentPage.value = Math.min(currentPage.value, max) })
watch(() => source.value.map(q => q.id), ids => { selected.value = selected.value.filter(id => ids.includes(id)) })
function changeCollection(value: Collection) {
  emit('update:collection', value)
  if (value === 'pending') { status.value = ''; difficulty.value = '' }
  selecting.value = false
}
function clearFilter(key: string) {
  if (key === 'search') emit('update:search', '')
  if (key === 'subject') subject.value = ''
  if (key === 'tag') emit('update:tag', '')
  if (key === 'status') status.value = ''
  if (key === 'difficulty') difficulty.value = ''
}
function clearFilters() { emit('update:search', ''); emit('update:tag', ''); subject.value = ''; status.value = ''; difficulty.value = '' }
function showAll() { clearFilters(); emit('update:collection', 'all') }
function pickTag(event: any) { const index = Number(event.detail.value); emit('update:tag', index > 0 ? tagOptions.value[index] || '' : '') }
function onSearch(event: any) { emit('update:search', event.detail.value) }
function pickStatus(event: any) { status.value = ['', 'reinforce', 'mastered'][Number(event.detail.value)] || '' }
function pickDifficulty(event: any) { difficulty.value = ['', '基础', '进阶', '挑战'][Number(event.detail.value)] || '' }
function toggleSelect(id: string) { if (!busy.value) selected.value = selected.value.includes(id) ? selected.value.filter(value => value !== id) : [...selected.value, id] }
function togglePage() {
  const ids = paginated.value.map(q => q.id)
  selected.value = allPageSelected.value ? selected.value.filter(id => !ids.includes(id)) : [...new Set([...selected.value, ...ids])]
}
function toggleSelecting() { selecting.value = !selecting.value; selected.value = []; actionError.value = '' }
async function saveMutation(mutate: () => void, message: string) {
  if (busy.value) return
  busy.value = true; actionError.value = ''
  try { mutate(); await store.flushPersistence(); selected.value = []; uni.showToast({ title: message, icon: 'success' }) }
  catch (error) { actionError.value = error instanceof Error ? error.message : '保存未完成，请重试保存。' }
  finally { busy.value = false }
}
async function retrySave() {
  if (busy.value) return
  busy.value = true
  try { await store.retryPersistence(); actionError.value = ''; uni.showToast({ title: '已保存', icon: 'success' }) }
  catch (error) { actionError.value = error instanceof Error ? error.message : '保存未完成，请保留当前页面并重试。' }
  finally { busy.value = false }
}
function batchDelete() {
  if (!selected.value.length || busy.value) return
  const ids = [...selected.value]
  uni.showModal({ title: `移入回收站 ${ids.length} 道题？`, content: '题目和复习记录会保留，之后可在回收站恢复。', confirmText: '移入回收站', success: result => { if (result.confirm) void saveMutation(() => store.deleteQuestions(ids), '已移入回收站') } })
}
function batchTag() {
  if (!selected.value.length || busy.value) return
  const ids = [...selected.value]
  uni.showModal({ title: `为 ${ids.length} 道题添加标签`, editable: true, placeholderText: '多个标签用逗号分隔', success: result => {
    if (!result.confirm || !result.content?.trim()) return
    void saveMutation(() => store.addTagsToQuestions(ids, normalizeTags([result.content!])), '标签已添加')
  } })
}
function restore(ids: string[]) { if (ids.length) void saveMutation(() => store.restoreQuestions(ids), `已恢复 ${ids.length} 道题`) }
</script>

<template>
  <view class="notebook-library">
    <view class="notebook-heading">
      <view><text class="eyebrow">{{ scope === 'recycle' ? 'ROOM FOR ANOTHER TRY' : 'A LITTLE CLEARER, EVERY DAY' }}</text><view class="notebook-title-line"><text class="notebook-title">{{ title }}</text><text class="notebook-total">{{ counts.all }} 道</text></view><text class="notebook-description">{{ description }}</text></view>
      <button v-if="scope !== 'recycle'" class="button button-primary notebook-add" @tap="emit('add')"><AppIcon name="plus" :size="18" tone="white" /><text>添加错题</text></button>
    </view>

    <view class="notebook-collections" aria-label="整理状态">
      <button v-for="item in collectionOptions" :key="item.id" class="notebook-collection" :class="{ active: collection === item.id, warm: item.id === 'pending' }" :aria-pressed="collection === item.id" @tap="changeCollection(item.id)"><view class="notebook-collection-icon"><AppIcon :name="item.icon" :size="20" :tone="collection === item.id ? item.id === 'pending' ? 'orange' : 'green' : 'muted'" /></view><view><text class="notebook-collection-label">{{ item.label }}</text><text class="notebook-collection-count">{{ counts[item.id] }}</text></view><view v-if="collection === item.id" class="notebook-active-dot" /></button>
    </view>

    <view class="notebook-filters panel">
      <view class="notebook-search"><AppIcon name="search" :size="20" tone="muted" /><input :value="search" placeholder="搜索题目、知识点、答案或备注" aria-label="搜索错题" confirm-type="search" @input="onSearch" /><button v-if="search" class="icon-button" aria-label="清空题目搜索" @tap="emit('update:search', '')"><AppIcon name="x" :size="16" tone="muted" /></button></view>
      <scroll-view scroll-x class="notebook-subject-scroll" :show-scrollbar="false"><view class="notebook-subjects"><button v-for="item in subjectOptions" :key="item.id" class="notebook-subject" :class="{ active: subject === item.id }" :aria-pressed="subject === item.id" :title="item.label" @tap="subject = item.id"><text>{{ item.label }}</text><text>{{ item.count }}</text></button></view></scroll-view>
      <view class="notebook-filter-row">
        <picker :range="tagOptions" :value="Math.max(0, tagOptions.indexOf(tag))" @change="pickTag"><view class="notebook-picker" :class="{ chosen: tag }"><AppIcon name="layers" :size="15" :tone="tag ? 'green' : 'muted'" /><text>{{ tag || '全部标签' }}</text><AppIcon name="chevron-down" :size="13" tone="muted" /></view></picker>
        <picker v-if="collection !== 'pending'" :range="statusOptions" :value="status === 'mastered' ? 2 : status === 'reinforce' ? 1 : 0" @change="pickStatus"><view class="notebook-picker" :class="{ chosen: status }"><text>{{ status ? status === 'mastered' ? '已掌握' : '待巩固' : '掌握状态' }}</text><AppIcon name="chevron-down" :size="13" tone="muted" /></view></picker>
        <picker v-if="collection !== 'pending'" :range="difficultyOptions" :value="Math.max(0, difficultyOptions.indexOf(difficulty))" @change="pickDifficulty"><view class="notebook-picker" :class="{ chosen: difficulty }"><text>{{ difficulty || '难度' }}</text><AppIcon name="chevron-down" :size="13" tone="muted" /></view></picker>
        <text class="notebook-filter-tip">{{ collection === 'pending' ? '先收录，按自己的节奏整理。' : '按科目和知识点，找回需要的题。' }}</text>
      </view>
      <view v-if="filters.length" class="notebook-applied"><text>已筛选</text><button v-for="filter in filters" :key="filter.key" class="notebook-filter-chip" :aria-label="`移除筛选：${filter.label}`" @tap="clearFilter(filter.key)"><text>{{ filter.label }}</text><AppIcon name="x" :size="12" tone="green" /></button><button class="notebook-clear" @tap="clearFilters">清空条件</button></view>
    </view>

    <view v-if="collection === 'pending' && counts.pending" class="notebook-inbox-hint"><AppIcon name="lightbulb" :size="19" tone="orange" /><text>题图和文字已保存。点击题目先查看，选择「继续整理」再补充分类与解析。</text></view>
    <view class="notebook-result-bar"><view class="notebook-result-count"><text>{{ filters.length || collection !== 'all' ? '筛选结果' : '全部收录' }}</text><text>{{ filtered.length }} <text>道题</text></text></view><view class="notebook-result-actions"><picker :range="sortOptions" :value="sortIndex" @change="sortIndex = Number($event.detail.value)"><view class="notebook-sort"><text>{{ sortOptions[sortIndex] }}</text><AppIcon name="chevron-down" :size="13" tone="muted" /></view></picker><view class="notebook-layout"><button class="icon-button" :class="{ active: layout === 'grid' }" aria-label="卡片视图" :aria-pressed="layout === 'grid'" @tap="layout = 'grid'"><AppIcon name="grid-2x2" :size="17" :tone="layout === 'grid' ? 'green' : 'muted'" /></button><button class="icon-button" :class="{ active: layout === 'list' }" aria-label="列表视图" :aria-pressed="layout === 'list'" @tap="layout = 'list'"><AppIcon name="list" :size="18" :tone="layout === 'list' ? 'green' : 'muted'" /></button></view><button class="notebook-manage" :class="{ active: selecting }" :disabled="busy || (!source.length && !selecting)" @tap="toggleSelecting"><AppIcon :name="selecting ? 'x' : 'check-check'" :size="16" tone="green" /><text>{{ selecting ? '退出管理' : '批量管理' }}</text></button></view></view>

    <view v-if="selecting" class="notebook-batch"><view class="notebook-batch-selection"><button :disabled="busy || !paginated.length" @tap="togglePage"><view class="notebook-page-checkbox" :class="{ checked: allPageSelected }"><AppIcon v-if="allPageSelected" name="check" :size="13" tone="white" /></view><text>{{ allPageSelected ? '取消本页' : '选择本页' }}</text></button><text>已选 {{ selected.length }} 道</text><button v-if="filtered.length > pageSize && selected.length !== filtered.length" class="notebook-select-all" :disabled="busy" @tap="selected = filtered.map(q => q.id)">选择全部 {{ filtered.length }} 道</button></view><view class="notebook-batch-actions"><button v-if="scope !== 'recycle'" :disabled="busy || !selected.length" @tap="batchTag"><AppIcon name="layers" :size="15" tone="green" /><text>添加标签</text></button><button v-if="scope !== 'recycle'" class="notebook-danger" :disabled="busy || !selected.length" @tap="batchDelete"><AppIcon name="trash-2" :size="15" tone="muted" /><text>移入回收站</text></button><button v-else :disabled="busy || !selected.length" @tap="restore([...selected])"><AppIcon name="rotate-ccw" :size="15" tone="green" /><text>恢复所选</text></button></view></view>
    <view v-if="actionError" class="notebook-error" role="alert"><text>{{ actionError }}</text><button v-if="store.state.storageError" class="text-button" :disabled="busy" @tap="retrySave">重试保存</button></view>
    <view v-if="busy" class="notebook-saving" aria-live="polite">正在保存本次更改…</view>

    <view v-if="paginated.length" class="notebook-grid" :class="{ 'notebook-list': layout === 'list' }"><view v-for="q in paginated" :key="q.id" class="notebook-item"><QuestionCard :question="q" library :compact="layout === 'list'" :archived="scope === 'recycle'" :selecting="selecting" :selected="selected.includes(q.id)" @open="scope !== 'recycle' && emit('open', q.id)" @favorite="scope !== 'recycle' && store.toggleFavorite(q.id)" @select="toggleSelect" @process="emit('edit', q.id)" @edit="emit('edit', q.id)" /><button v-if="scope === 'recycle' && !selecting" class="notebook-restore" :disabled="busy" @tap="restore([q.id])"><AppIcon name="rotate-ccw" :size="16" tone="green" /><text>恢复这道题</text></button></view></view>
    <view v-else class="notebook-empty panel"><view class="notebook-empty-symbol"><AppIcon :name="scope === 'recycle' ? 'trash-2' : filters.length ? 'search' : 'book-open'" :size="31" tone="green" /></view><text class="notebook-empty-title">{{ emptyTitle }}</text><text>{{ emptyCopy }}</text><button v-if="filters.length" class="button button-quiet" @tap="clearFilters">清空筛选条件</button><button v-else-if="source.length" class="button button-quiet" @tap="showAll">查看全部题目</button><button v-else-if="scope === 'library'" class="button button-primary" @tap="emit('add')">添加第一道错题</button></view>
    <view v-if="filtered.length" class="notebook-pagination"><text>{{ (currentPage - 1) * pageSize + 1 }}–{{ Math.min(currentPage * pageSize, filtered.length) }} / {{ filtered.length }} 道</text><view><button class="icon-button" :disabled="busy || currentPage <= 1" aria-label="上一页" @tap="currentPage--"><AppIcon name="chevron-left" :size="17" tone="green" /></button><text>第 {{ currentPage }} / {{ totalPages }} 页</text><button class="icon-button" :disabled="busy || currentPage >= totalPages" aria-label="下一页" @tap="currentPage++"><AppIcon name="chevron-right" :size="17" tone="green" /></button></view></view>
  </view>
</template>

<style scoped>
.notebook-page-checkbox{width:18px;height:18px;border:1px solid #a9bd99;border-radius:5px;display:flex;align-items:center;justify-content:center}.notebook-page-checkbox.checked{background:#39775a;border-color:#39775a}
.notebook-library{max-width:1260px;margin:0 auto}.notebook-heading{display:flex;align-items:center;justify-content:space-between;gap:20px;margin:3px 0 27px}.notebook-title-line{display:flex;align-items:center;gap:14px;margin:8px 0 9px}.notebook-title{font-size:30px;font-weight:650;letter-spacing:-.7px;color:#263f31;line-height:1.5}.notebook-total{font-size:12px;color:#7e9073;border:1px solid #e0e7d7;border-radius:7px;padding:4px 9px;white-space:nowrap}.notebook-description{font-size:14px;color:#819079;line-height:1.8}.notebook-add{font-size:13px;min-height:44px;padding:12px 18px}.notebook-collections{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:21px}.notebook-collection{position:relative;display:flex;align-items:center;gap:13px;text-align:left;padding:18px 20px;margin:0;background:#eef1e8;border:1px solid transparent;border-radius:13px;min-width:0}.notebook-collection.active{background:#fff;border-color:#b7cdb0;box-shadow:0 3px 12px #34583205}.notebook-collection.active.warm{border-color:#dccaa5;background:#fffef9}.notebook-collection-icon{display:flex;align-items:center;justify-content:center;width:40px;height:40px;flex-shrink:0;background:#e6ecde;border-radius:11px}.active .notebook-collection-icon{background:#edf4e8}.warm.active .notebook-collection-icon{background:#f8efde}.notebook-collection>view:nth-child(2){display:flex;flex:1;align-items:center;justify-content:space-between;gap:12px;min-width:0}.notebook-collection-label{font-size:14px;color:#687f5f;white-space:nowrap}.notebook-collection-count{font-size:24px;line-height:1.4;font-weight:550;color:#56764e}.warm.active .notebook-collection-count{color:#a47d43}.notebook-active-dot{position:absolute;width:5px;height:5px;border-radius:50%;background:#729265;right:10px;top:10px}.warm .notebook-active-dot{background:#b79861}.notebook-filters{padding:19px 22px 14px;border-radius:15px}.notebook-search{display:flex;align-items:center;gap:11px;min-width:0;border:1px solid #e2e7d9;background:#f9faf6;border-radius:10px;padding:0 13px;min-height:46px}.notebook-search:focus-within{border-color:#a0ba92;box-shadow:0 0 0 3px #edf3e6}.notebook-search input{flex:1;width:0;font-size:14px;height:44px;color:#3c5337}.notebook-subject-scroll{width:100%;white-space:nowrap;margin-top:17px}.notebook-subjects{display:inline-flex;gap:8px;min-width:100%;padding-bottom:8px}.notebook-subject{display:flex;align-items:center;gap:8px;border-radius:7px;margin:0;padding:8px 11px;flex-shrink:0;color:#89967e;background:transparent;font-size:13px;min-height:36px;max-width:210px}.notebook-subject>text:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.notebook-subject>text:last-child{font-size:11px;color:#9fac93}.notebook-subject.active{background:#eaf1e3;color:#3f6f47}.notebook-subject.active>text:last-child{color:#6d8d58}.notebook-filter-row{border-top:1px solid #edf0e7;padding-top:12px;margin-top:3px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.notebook-filter-row>picker{max-width:220px;min-width:0}.notebook-picker{display:flex;align-items:center;gap:8px;font-size:12px;padding:7px 9px;min-height:34px;background:#f6f8f1;border:1px solid #e8ecdf;border-radius:7px;max-width:220px}.notebook-picker>text{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px;color:#7a8d6d}.notebook-picker.chosen{border-color:#b9cda9;background:#eff5e9}.notebook-filter-tip{margin-left:auto;color:#a1ac94;font-size:11px}.notebook-applied{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding-top:14px;margin-top:12px;border-top:1px dashed #e4e9db}.notebook-applied>text{font-size:11px;color:#97a089}.notebook-filter-chip{display:flex;align-items:center;gap:8px;max-width:100%;background:#eef4e8;color:#60804e;border-radius:6px;font-size:12px;padding:6px 9px;margin:0}.notebook-filter-chip>text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px}.notebook-clear{font-size:12px;color:#839576;background:none;padding:5px;margin:0}.notebook-inbox-hint{display:flex;align-items:flex-start;gap:9px;padding:13px 16px;background:#faf5e9;border:1px solid #ece3cd;border-radius:10px;margin-top:17px;color:#9b835d;font-size:12px;line-height:1.8}.notebook-inbox-hint>.app-icon{margin-top:1px}.notebook-result-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:24px 0 15px}.notebook-result-count{display:flex;align-items:center;gap:10px;font-size:12px;color:#96a18b}.notebook-result-count>text:last-child{color:#4e7148;font-size:17px;font-weight:550;white-space:nowrap}.notebook-result-count>text:last-child>text{font-size:12px;font-weight:400;color:#8a9a7d}.notebook-result-actions{display:flex;align-items:center;gap:13px}.notebook-sort{display:flex;align-items:center;gap:7px;font-size:12px;color:#829475;min-height:36px;white-space:nowrap}.notebook-layout{display:flex;border:1px solid #e1e7d7;border-radius:8px;padding:2px;gap:1px}.notebook-layout .icon-button{width:30px;height:29px;min-width:29px}.notebook-layout .active{background:#e8f0e0}.notebook-manage{display:flex;align-items:center;justify-content:center;gap:6px;background:white;border:1px solid #dfe6d6;border-radius:8px;padding:9px 11px;margin:0;font-size:12px;color:#657f57;white-space:nowrap;min-height:36px}.notebook-manage.active{background:#e8f1e0;border-color:#bed1ac}.notebook-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:17px;align-items:stretch}.notebook-list{grid-template-columns:minmax(0,1fr)}.notebook-item{min-width:0;display:flex;flex-direction:column}.notebook-item :deep(.question-card){flex:1}.notebook-batch{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:#eaf1e1;border:1px solid #d6e3c8;border-radius:10px;padding:12px 15px;margin-bottom:16px}.notebook-batch-selection,.notebook-batch-actions{display:flex;align-items:center;gap:17px;flex-wrap:wrap}.notebook-batch button{background:none;padding:3px 0;margin:0;display:flex;align-items:center;gap:6px;font-size:12px;color:#5d7d4d;min-height:30px}.notebook-batch-selection>text{font-size:12px;color:#8a9b79}.notebook-batch .notebook-select-all{font-size:11px;text-decoration:underline;text-underline-offset:3px}.notebook-batch .notebook-danger{color:#aa7d69}.notebook-restore{display:flex;align-items:center;justify-content:center;gap:7px;padding:12px;margin:6px 0 0;background:#edf4e6;border-radius:8px;font-size:12px;color:#5e8050}.notebook-error{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px;margin-bottom:15px;background:#fff3e5;border-radius:8px;font-size:12px;line-height:1.8;color:#a37646;word-break:break-word}.notebook-saving{font-size:12px;color:#80966d;margin-bottom:13px}.notebook-empty{min-height:310px;padding:42px 22px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center}.notebook-empty-symbol{display:flex;align-items:center;justify-content:center;width:66px;height:66px;border-radius:22px;background:#edf3e5;margin-bottom:2px}.notebook-empty-title{font-size:18px;font-weight:550;color:#5a7650}.notebook-empty>text:nth-last-of-type(1){font-size:13px;line-height:1.9;color:#96a18a;max-width:360px}.notebook-empty .button{margin-top:8px}.notebook-pagination{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:23px;color:#91a082;font-size:12px}.notebook-pagination>view{display:flex;align-items:center;gap:11px}.notebook-pagination .icon-button{background:#fff;border:1px solid #e1e7d7}.notebook-pagination>view>text{font-size:12px;white-space:nowrap}
@media(min-width:1600px){.notebook-grid:not(.notebook-list){grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:900px){.notebook-filter-tip{display:none}.notebook-collection{padding:15px;gap:9px}.notebook-collection-count{font-size:22px}}
@media(max-width:600px){.notebook-heading{margin:0 0 22px;gap:10px}.notebook-heading .eyebrow{font-size:8px;letter-spacing:1.1px}.notebook-title{font-size:26px}.notebook-title-line{gap:9px;margin:6px 0}.notebook-total{font-size:11px;padding:3px 7px}.notebook-description{font-size:12px}.notebook-add{font-size:12px;padding:11px 12px;min-height:42px;gap:5px}.notebook-collections{gap:8px;margin-bottom:15px}.notebook-collection{padding:13px 10px;gap:8px;align-items:flex-start}.notebook-collection-icon{width:30px;height:30px;border-radius:9px;display:none}.notebook-collection>view:nth-child(2){flex-direction:column;align-items:flex-start;gap:6px}.notebook-collection-label{font-size:12px}.notebook-collection-count{font-size:24px}.notebook-filters{padding:14px 14px 12px;border-radius:13px}.notebook-search{padding:0 10px;gap:8px;min-height:44px}.notebook-search input{font-size:13px;min-width:0}.notebook-subject-scroll{margin-top:13px}.notebook-subject{font-size:12px;max-width:175px;padding:7px 9px;gap:7px}.notebook-subjects{gap:5px}.notebook-filter-row{gap:6px;padding-top:10px}.notebook-picker{font-size:11px;padding:7px 8px;gap:6px;max-width:180px}.notebook-picker>text{max-width:105px}.notebook-applied{gap:6px;padding-top:11px;margin-top:10px}.notebook-filter-chip{font-size:11px}.notebook-filter-chip>text{max-width:180px}.notebook-inbox-hint{font-size:11px;padding:12px;gap:8px;line-height:1.9}.notebook-result-bar{flex-wrap:wrap;margin:21px 0 13px;gap:11px}.notebook-result-count{font-size:11px;gap:8px}.notebook-result-count>text:last-child{font-size:16px}.notebook-result-actions{gap:9px;margin-left:auto}.notebook-sort{font-size:11px;gap:4px}.notebook-manage{font-size:11px;padding:8px 9px;gap:4px}.notebook-layout{display:flex}.notebook-layout .icon-button{min-width:27px;width:27px}.notebook-grid{grid-template-columns:minmax(0,1fr);gap:13px}.notebook-batch{padding:10px 12px;gap:5px}.notebook-batch-selection{gap:12px}.notebook-batch-actions{gap:20px;width:100%;border-top:1px solid #dae5cf;padding-top:6px;margin-top:3px}.notebook-batch button{font-size:12px;min-height:34px}.notebook-batch-selection>text{font-size:11px}.notebook-empty{min-height:290px;padding:32px 18px}.notebook-empty-title{font-size:17px}.notebook-empty>text:nth-last-of-type(1){font-size:12px}.notebook-pagination{font-size:11px;margin-top:20px}.notebook-pagination>view{gap:7px}.notebook-pagination>view>text{font-size:11px}}
@media(max-width:360px){.notebook-result-count{width:100%}.notebook-result-actions{justify-content:space-between;margin-left:0;width:100%}.notebook-title{font-size:24px}.notebook-total{font-size:10px}.notebook-add{padding:10px;font-size:11px}.notebook-picker{max-width:165px}}
</style>
