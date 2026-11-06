<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStudyStore } from '../domain/store'
import { forgeProgress } from '../domain/forge'
import { defaultNotebook, notebookCover } from '../domain/notebooks'
import type { Notebook, NotebookAudience } from '../domain/types'
import NotebookLibrary from './NotebookLibrary.vue'
import NotebookEditor from './NotebookEditor.vue'
import NotebookCover from './NotebookCover.vue'
import AppIcon from './AppIcon.vue'
type Collection = 'all' | 'pending' | 'ready'
const props = defineProps<{ scope: 'library' | 'favorites' | 'recycle'; search: string; collection: Collection; tag: string }>()
const emit = defineEmits<{ 'update:search': [value: string]; 'update:collection': [value: Collection]; 'update:tag': [value: string]; open: [id: string]; edit: [id: string]; add: [notebookId?: string]; test: [ids: string[]] }>()
const store = useStudyStore()
const mode = ref<'subjects' | 'legacy' | 'all'>('subjects')
const activeBook = ref('')
const activeSubject = ref('')
const audience = ref<NotebookAudience | 'all'>('all')
const editorOpen = ref(false)
const editingBook = ref<Notebook>()
const directions: { id: NotebookAudience | 'all'; label: string }[] = [{ id: 'all', label: '全部本子' }, { id: 'k12', label: 'K12 课堂' }, { id: 'computer', label: '计算机学习' }, { id: 'civil', label: '考公备考' }, { id: 'general', label: '通用本子' }]
const selectedBook = computed(() => store.notebooks.value.find(book => book.id === activeBook.value))
const showShelf = computed(() => props.scope === 'library' && mode.value !== 'all' && !activeBook.value && !activeSubject.value && !props.search && !props.tag && props.collection === 'all')
const subjectBooks = computed(() => [...new Set(store.questions.value.filter(q => !q.deletedAt && q.subject).map(q => q.subject))].sort((a, b) => a.localeCompare(b, 'zh-CN')).map(subject => {
  const questions = store.questions.value.filter(q => !q.deletedAt && q.subject === subject)
  const oldBook = store.notebooks.value.find(book => book.subject === subject)
  const fallback = defaultNotebook(subject, '1970-01-01T00:00:00.000Z')
  const cover = notebookCover(oldBook?.coverId || fallback.coverId)
  return { id: `subject:${encodeURIComponent(subject)}`, title: `${subject}错题本`, subject, audience: oldBook?.audience || fallback.audience, coverId: oldBook?.coverId || cover.id, count: questions.length, reflected: questions.filter(q => q.reflection && Object.values(q.reflection).some(text => text.trim())).length, sharpened: questions.filter(q => forgeProgress(q.id, store.state.reviews).completed === 5).length }
}))
const legacyBooks = computed(() => store.notebooks.value.map(book => {
  const questions = store.questions.value.filter(q => q.notebookId === book.id)
  return { ...book, count: questions.length, reflected: questions.filter(q => q.reflection && Object.values(q.reflection).some(text => text.trim())).length, sharpened: questions.filter(q => forgeProgress(q.id, store.state.reviews).completed === 5).length }
}))
const visibleBooks = computed(() => (mode.value === 'legacy' ? legacyBooks.value : subjectBooks.value).filter(book => audience.value === 'all' || book.audience === audience.value))
const testIds = computed(() => store.practiceQuestions.value.filter(q => forgeProgress(q.id, store.state.reviews).completed < 5).map(q => q.id))
const recentQuestion = computed(() => [...store.readyQuestions.value].sort((a,b) => (b.lastReviewedAt || b.organizedAt || b.createdAt).localeCompare(a.lastReviewedAt || a.organizedAt || a.createdAt))[0])
const reflectionCount = computed(() => store.questions.value.filter(q => q.reflection && Object.values(q.reflection).some(text => text.trim())).length)
function resetLibraryFilters() { emit('update:search', ''); emit('update:tag', ''); emit('update:collection', 'all') }
function backToBooks() { activeBook.value = ''; activeSubject.value = ''; mode.value = 'subjects'; resetLibraryFilters() }
function openSubject(subject: string) { resetLibraryFilters(); mode.value = 'subjects'; activeBook.value = ''; activeSubject.value = subject }
function openLegacyBook(id: string) { resetLibraryFilters(); mode.value = 'legacy'; activeSubject.value = ''; activeBook.value = id }
function showQuestionBank() { activeBook.value = ''; activeSubject.value = ''; mode.value = 'all'; resetLibraryFilters() }
function showLegacyShelf() { activeBook.value = ''; activeSubject.value = ''; mode.value = 'legacy'; resetLibraryFilters() }
function createBook() { editingBook.value = undefined; editorOpen.value = true }
function editBook(book: any) { editingBook.value = book as Notebook; editorOpen.value = true }
function savedBook(id: string) { editorOpen.value = false; audience.value = 'all'; if (activeBook.value) activeBook.value = id }
function deletedBook(id: string) { editorOpen.value = false; audience.value = 'all'; if (activeBook.value === id) activeBook.value = '' }
</script>
<template>
  <view class="notebook-shelf-page">
    <template v-if="showShelf">
       <view class="shelf-heading"><view><text class="shelf-kicker">我的学习空间</text><text class="shelf-title">{{ mode === 'legacy' ? '旧版本子' : '我的错题本' }}</text><text class="shelf-subtitle">{{ mode === 'legacy' ? '保留旧数据的兼容入口，主流程仍按科目组织。' : '先按科目进入，再按知识点整理和巩固。' }}</text></view><button v-if="mode === 'legacy'" class="button button-primary create-notebook" @tap="createBook"><AppIcon name="plus" :size="18" tone="white" /><text>建一个旧版本子</text></button></view>
      <view v-if="recentQuestion" class="continue-strip"><view class="continue-icon"><AppIcon name="book-open" :size="23" tone="green" /></view><view class="continue-copy"><text class="continue-label">最近学习 · 继续复盘</text><text class="continue-title">{{ recentQuestion.title }}</text></view><button class="continue-button" @tap="emit('open', recentQuestion.id)"><text>继续复盘</text><AppIcon name="arrow-right" :size="17" tone="green" /></button></view>
    </template>
     <view v-if="scope === 'library'" class="shelf-toolbar"><view class="shelf-view-switch"><button :class="{ active: mode === 'subjects' && !activeSubject }" @tap="backToBooks">我的错题本<text class="tab-count">{{ subjectBooks.length }}</text></button><button :class="{ active: mode === 'all' }" @tap="showQuestionBank">错题库</button><button class="legacy-switch" :class="{ active: mode === 'legacy' }" @tap="showLegacyShelf">旧版本子</button></view><button v-if="showShelf" class="shelf-test" @tap="emit('test', testIds)"><AppIcon name="flame" :size="16" tone="green" /><text>去练习</text></button></view>
    <template v-if="showShelf">
      <scroll-view scroll-x class="shelf-audience-scroll" :show-scrollbar="false"><view class="shelf-audiences"><button v-for="direction in directions" :key="direction.id" :class="{ active: audience === direction.id }" :aria-pressed="audience === direction.id" @tap="audience = direction.id">{{ direction.label }}</button></view></scroll-view>
      <view class="book-grid">
        <view v-for="(book, index) in visibleBooks" :key="book.id" class="book-tile">
           <button class="notebook-cover" :aria-label="`翻开${book.title}`" @tap="mode === 'legacy' ? openLegacyBook(book.id) : openSubject(book.subject)"><NotebookCover :title="book.title" :cover-id="book.coverId" :count="book.count" :ordinal="index + 1" /></button>
           <view class="book-caption"><view><button class="book-open-caption" @tap="mode === 'legacy' ? openLegacyBook(book.id) : openSubject(book.subject)">{{ book.title }}</button><text class="book-meta">{{ book.reflected }} 页复盘<text> / </text>{{ book.sharpened }} 道完成五阶</text></view><button v-if="mode === 'legacy'" class="book-edit icon-button" :aria-label="`编辑${book.title}`" @tap="editBook(book)"><AppIcon name="pencil" :size="16" tone="muted" /></button></view>
        </view>
          <button v-if="mode === 'legacy'" class="new-notebook" @tap="createBook"><view class="new-notebook-icon"><AppIcon name="plus" :size="25" tone="muted" /></view><text>建一个旧版本子</text><text>旧数据整理入口，主流程按科目组织</text></button>
      </view>
       <view class="directory-summary"><text>{{ (mode === 'legacy' ? legacyBooks.length : subjectBooks.length) }} 本笔记 · {{ reflectionCount }} 页复盘</text><text>按自己的方式，记录每次理解。</text></view>
    </template>
    <template v-else>
       <view v-if="scope === 'library' && (selectedBook || activeSubject)" class="book-management"><button class="back-to-shelf" @tap="backToBooks"><AppIcon name="chevron-left" :size="15" tone="green" /><text>返回我的错题本</text></button><button v-if="selectedBook" class="edit-active-notebook text-button" @tap="editBook(selectedBook)"><AppIcon name="pencil" :size="14" tone="green" /><text>旧本名称与封面</text></button></view>
       <NotebookLibrary :key="`${scope}-${activeBook}-${activeSubject}`" :scope="scope" :search="search" :collection="collection" :tag="tag" :notebook-id="mode === 'legacy' ? activeBook || undefined : undefined" :notebook-subject="activeSubject || undefined" @update:search="emit('update:search', $event)" @update:collection="emit('update:collection', $event)" @update:tag="emit('update:tag', $event)" @open="emit('open', $event)" @edit="emit('edit', $event)" @add="emit('add', mode === 'legacy' ? activeBook || undefined : undefined)" />
    </template>
    <NotebookEditor v-if="editorOpen" :notebook="editingBook" :initial-audience="audience === 'all' ? undefined : audience" @close="editorOpen = false" @saved="savedBook" @deleted="deletedBook" />
  </view>
</template>
<style scoped>
.notebook-shelf-page{max-width:1060px;margin:0 auto}.shelf-heading{display:flex;justify-content:space-between;align-items:center;gap:24px;margin:12px 0 30px}.shelf-kicker{display:block;font-size:12px;color:#88877f;letter-spacing:2px;margin-bottom:12px}.shelf-title{display:block;font-size:30px;line-height:1.5;font-weight:650;letter-spacing:-1px;color:#262c2b}.shelf-subtitle{display:block;font-size:13px;color:#85877f;margin-top:10px;line-height:1.8}.shelf-heading>.button{flex-shrink:0;font-size:13px;padding:13px 19px;border-radius:8px}.continue-strip{display:flex;align-items:center;gap:16px;padding:19px 22px;background:#fff;border:1px solid #e7e7e2;border-radius:12px;margin-bottom:30px}.continue-icon{display:flex;align-items:center;justify-content:center;width:46px;height:46px;border-radius:12px;background:#f1f2e9;flex-shrink:0}.continue-copy{flex:1;min-width:0}.continue-label{display:block;font-size:11px;color:#8b8e83;margin-bottom:6px}.continue-title{display:block;font-size:14px;color:#41483f;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.continue-button{display:flex;align-items:center;gap:12px;padding:10px 0 10px 16px;background:none;color:#52614a;font-size:12px;margin:0;flex-shrink:0}.shelf-toolbar{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e4e5df;margin-bottom:18px}.shelf-view-switch{display:flex;gap:28px}.shelf-view-switch>button{display:flex;align-items:center;gap:8px;margin:0;padding:0 0 16px;background:none;border-radius:0;border-bottom:2px solid transparent;font-size:14px;color:#92938c}.shelf-view-switch>button.active{color:#303c31;border-color:#405344;font-weight:600}.tab-count{font-size:10px;padding:2px 6px;border-radius:5px;background:#e8ece4;color:#6b7763}.shelf-test{display:flex;align-items:center;gap:7px;background:transparent;color:#566c47;font-size:12px;padding:0 0 15px;margin:0}.shelf-audience-scroll{margin-bottom:25px;white-space:nowrap;max-width:100%}.shelf-audiences{display:flex;gap:9px;width:max-content;min-width:100%;padding-bottom:2px}.shelf-audiences>button{margin:0;padding:8px 12px;background:transparent;color:#8e9c88;border:1px solid transparent;border-radius:6px;font-size:12px;line-height:1.6;white-space:nowrap}.shelf-audiences>button.active{background:#eaf1e5;color:#5c774a;border-color:#d9e4ce}.book-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:30px 28px}.book-tile{min-width:0}.notebook-cover{display:block;width:100%;min-width:0;margin:0;padding:0;text-align:left;background:none;border-radius:0;overflow:visible;line-height:1.5}.book-caption{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:17px 2px 0}.book-caption>view{min-width:0;flex:1}.book-open-caption{display:block;max-width:100%;margin:0;padding:0;background:none;font-size:14px;font-weight:550;line-height:1.6;color:#353d36;text-align:left;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.book-meta{display:block;font-size:11px;color:#92988c;margin-top:6px;white-space:nowrap}.book-meta>text{margin:0 5px;color:#c0c3b9}.book-edit{opacity:.6;width:28px;height:28px;flex-shrink:0}.book-edit:hover{opacity:1;background:#e9eee4}.notebook-cover:hover :deep(.book-jacket){transform:translateY(-5px) rotate(-.5deg);box-shadow:2px 3px 0 #fff,3px 4px 0 #d3d2c9,0 14px 24px #24312c20}.new-notebook{display:flex;flex-direction:column;align-items:center;justify-content:center;align-self:start;min-height:270px;background:none;border:1px dashed #d8dcd0;border-radius:10px;margin:0;width:100%;color:#797f70;padding:20px 12px;line-height:1.8}.new-notebook-icon{display:flex;align-items:center;justify-content:center;width:44px;height:44px;border:1px solid #e0e3d9;border-radius:50%;margin-bottom:17px}.new-notebook>text{font-size:13px}.new-notebook>text:last-child{font-size:11px;color:#a1a597;margin-top:9px;text-align:center}.new-notebook:hover{background:#f1f3eb}.directory-summary{display:flex;justify-content:space-between;gap:15px;font-size:11px;color:#9b9e93;border-top:1px solid #e6e8df;padding-top:20px;margin-top:32px}.book-management{display:flex;align-items:center;justify-content:space-between;gap:15px;margin:20px 0}.back-to-shelf{display:flex;align-items:center;gap:5px;background:none;padding:0;margin:0;color:#617159;font-size:12px}.edit-active-notebook{font-size:12px}.notebook-cover:focus-visible,.new-notebook:focus-visible{outline:2px solid #7a8867;outline-offset:6px}
@media(max-width:1100px){.book-grid{gap:28px 22px}}
@media(max-width:780px){.book-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.shelf-title{font-size:27px}}
@media(max-width:600px){.shelf-heading{margin:7px 0 24px;align-items:flex-start;flex-direction:column;gap:18px}.shelf-kicker{font-size:10px;margin-bottom:8px}.shelf-title{font-size:25px;letter-spacing:-.6px}.shelf-subtitle{font-size:12px;margin-top:8px}.shelf-heading>.button{padding:11px 15px;min-height:40px;font-size:12px}.continue-strip{padding:14px 13px;gap:10px;margin-bottom:25px}.continue-icon{width:35px;height:39px;border-radius:9px}.continue-label{font-size:10px}.continue-title{font-size:12px}.continue-button{font-size:11px;gap:5px;padding-left:0}.continue-button .app-icon{display:none}.shelf-view-switch{gap:22px}.shelf-view-switch>button{font-size:13px;padding-bottom:13px}.shelf-toolbar{margin-bottom:16px}.shelf-audiences{gap:4px}.shelf-audiences>button{font-size:11px;padding:7px 9px}.shelf-audience-scroll{margin-bottom:22px}.book-grid{gap:23px 18px}.book-caption{padding-top:14px;gap:3px}.book-open-caption{font-size:13px}.book-meta{font-size:9px}.book-meta>text{margin:0 2px}.book-edit{width:21px;height:25px}.new-notebook{min-height:220px}.new-notebook>text{font-size:11px}.new-notebook>text:last-child{font-size:9px}.directory-summary{font-size:10px;margin-top:26px;flex-wrap:wrap}.book-management{margin:19px 0}.back-to-shelf,.edit-active-notebook{font-size:11px}}
@media(max-width:360px){.book-grid{gap:22px 13px}.new-notebook{min-height:205px}.shelf-title{font-size:24px}.book-meta{font-size:8px}.book-edit{width:18px}.book-open-caption{font-size:12px}}
@media(prefers-reduced-motion:reduce){.notebook-cover:hover :deep(.book-jacket){transform:none}}
</style>
