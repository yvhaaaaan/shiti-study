<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import MathText from './MathText.vue'
import AttachmentGallery from './AttachmentGallery.vue'
import { useStudyStore } from '../domain/store'
import type { Subject } from '../domain/types'

const emit = defineEmits<{ (event: 'open-question', id: string): void; (event: 'practice', ids: string[]): void }>()
const store = useStudyStore()
const query = ref('')
const subjectFilter = ref<Subject | '全部'>('全部')
const detailId = ref<string | null>(null)
const editing = ref(false)
const editingId = ref<string | undefined>()
const title = ref('')
const content = ref('')
const images = ref<string[]>([])
const selectingImages = ref(false)
const subject = ref<Subject>('数学')
const linkedIds = ref<string[]>([])
const questionSearch = ref('')
const saving = ref(false)

const activeQuestions = computed(() => store.questions.value.filter(question => !question.deletedAt))
const noteItems = computed(() => store.notes.value)
const subjects = computed(() => store.availableSubjects.value)
const editorSubjects = subjects
const filteredNotes = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  return noteItems.value.filter(note => (subjectFilter.value === '全部' || note.subject === subjectFilter.value) && (!keyword || `${note.title} ${note.content} ${note.subject}`.toLowerCase().includes(keyword)))
})
const detail = computed(() => noteItems.value.find(note => note.id === detailId.value))
const relatedQuestions = computed(() => activeQuestions.value.filter(question => detail.value?.questionIds.includes(question.id)))
const selectableQuestions = computed(() => {
  const keyword = questionSearch.value.trim().toLowerCase()
  return activeQuestions.value.filter(question => question.organizationStatus !== 'pending' && question.subject === subject.value && (!keyword || `${question.title} ${question.stem}`.toLowerCase().includes(keyword)))
})

function openEditor(id?: string) {
  const note = noteItems.value.find(item => item.id === id)
  editingId.value = note?.id
  title.value = note?.title ?? ''
  content.value = note?.content ?? ''
  images.value = [...(note?.images ?? [])]
  subject.value = note?.subject ?? (subjectFilter.value === '全部' ? '数学' : subjectFilter.value)
  linkedIds.value = note ? [...note.questionIds] : []
  questionSearch.value = ''
  editing.value = true
}

function toggleQuestion(id: string) {
  linkedIds.value = linkedIds.value.includes(id) ? linkedIds.value.filter(item => item !== id) : [...linkedIds.value, id]
}

async function save() {
  if (!title.value.trim()) return uni.showToast({ title: '给这份笔记起个名字吧', icon: 'none' })
  if (!content.value.trim() && !images.value.length) return uni.showToast({ title: '写下总结或添加图片再保存', icon: 'none' })
  if (saving.value || selectingImages.value) return
  saving.value = true
  try {
    const note = await store.saveNote({ id: editingId.value, title: title.value.trim(), subject: subject.value, content: content.value.trim(), images: [...images.value], questionIds: linkedIds.value })
    editingId.value = note.id
    await store.flushPersistence()
    detailId.value = note.id
    editing.value = false
    uni.showToast({ title: store.state.storageError ? '保存未完成，当前内容仍保留' : '笔记已保存', icon: 'none', duration: store.state.storageError ? 3500 : 1500 })
  } catch {
    uni.showToast({ title: '保存失败，请稍后重试', icon: 'none' })
  } finally {
    saving.value = false
  }
}

function closeEditor() { if (!saving.value && !selectingImages.value) editing.value = false }

function removeNote() {
  if (!detail.value) return
  const id = detail.value.id
  uni.showModal({ title: '删除这份笔记？', content: '关联的错题会保留，笔记删除后无法恢复。', confirmText: '删除笔记', confirmColor: '#a4533e', success: async result => {
    if (!result.confirm) return
    store.deleteNote(id)
    try { await store.flushPersistence() } catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '删除未保存，请重试', icon: 'none' }); return }
    detailId.value = null
    uni.showToast({ title: store.state.storageError ? '保存未完成，当前内容仍保留' : '笔记已删除', icon: 'none', duration: store.state.storageError ? 3500 : 1500 })
  } })
}
</script>

<template>
  <view class="knowledge-view">
    <view class="knowledge-heading">
      <view><text class="eyebrow">CONNECT THE DOTS</text><text class="knowledge-title">把想通的，记下来。</text><text class="muted heading-description">从一道错题，连接到一个知识点。</text></view>
      <button class="button button-primary new-note" @click="openEditor()"><AppIcon name="plus" :size="18" tone="white" /><text>新建笔记</text></button>
    </view>

    <view class="knowledge-layout">
      <view class="notes-library">
        <view class="library-tools">
          <view class="search-field"><AppIcon name="search" :size="18" tone="muted" /><input v-model="query" class="search-input" placeholder="搜索知识点或笔记内容" placeholder-style="color:#9ba69d" /></view>
          <scroll-view class="subject-scroll" scroll-x :show-scrollbar="false"><view class="subject-tabs"><button class="subject-tab" :class="{ selected: subjectFilter === '全部' }" @click="subjectFilter = '全部'">全部<text>{{ noteItems.length }}</text></button><button v-for="item in subjects" :key="item" class="subject-tab" :class="{ selected: subjectFilter === item }" :aria-label="item" :title="item" @click="subjectFilter = item"><text class="subject-tab-label">{{ item }}</text></button></view></scroll-view>
        </view>

        <view v-if="filteredNotes.length" class="note-grid">
          <view v-for="(note, index) in filteredNotes" :key="note.id" class="note-card panel" :class="{ 'note-card-active': detailId === note.id }" @click="detailId = note.id">
            <view class="note-card-top"><view class="note-icon" :class="`note-icon-${index % 3}`"><AppIcon name="book-open" :size="20" tone="green" /></view><text class="note-subject" :title="note.subject">{{ note.subject }}</text><AppIcon class="note-arrow" name="arrow-up-right" :size="18" tone="muted" /></view>
            <text class="note-title">{{ note.title }}</text>
            <view v-if="note.images?.length" class="note-cover"><image :src="note.images[0]" mode="aspectFill" /><view><AppIcon name="image" :size="12" tone="white" /><text>{{ note.images.length }} 张附图</text></view></view>
            <text class="note-excerpt" :class="{ 'note-excerpt-with-image': note.images?.length }">{{ note.content || '一份用图片记录的知识笔记' }}</text>
            <view class="note-card-bottom"><AppIcon name="link" :size="14" tone="muted" /><text>{{ activeQuestions.filter(question => note.questionIds.includes(question.id)).length }} 道关联错题</text><text class="open-note">查看笔记</text></view>
          </view>
        </view>
        <view v-else class="empty-state empty-notes panel"><view class="empty-icon"><AppIcon name="notebook-pen" :size="32" tone="green" /></view><text class="empty-title">{{ query || subjectFilter !== '全部' ? '没有找到这份笔记' : '给知识留一个位置' }}</text><text class="muted">{{ query || subjectFilter !== '全部' ? '试试其他关键词，或切换学科。' : '写下解题方法，再把相关错题连起来。' }}</text><button v-if="!query && subjectFilter === '全部'" class="button button-primary" @click="openEditor()">写第一份笔记</button></view>

        <view class="knowledge-tip"><view class="tip-symbol"><AppIcon name="sparkles" :size="19" tone="orange" /></view><view><text class="tip-title">写给下次的自己</text><text class="tip-content">试着写下「为什么错」与「下次怎么做」，比只抄答案更有用。</text></view></view>
      </view>

      <view v-if="detail" class="reader-mask" @click="detailId = null" />
      <view class="note-reader panel" :class="{ 'note-reader-open': detail }">
        <template v-if="detail">
          <view class="reader-top"><text class="badge reader-subject" :title="detail.subject">{{ detail.subject }} · 知识笔记</text><view class="reader-top-actions"><button class="icon-button" aria-label="编辑笔记" @click="openEditor(detail.id)"><AppIcon name="pencil" :size="18" tone="green" /></button><button class="icon-button reader-close" aria-label="关闭笔记详情" @click="detailId = null"><AppIcon name="x" :size="20" tone="muted" /></button></view></view>
          <text class="reader-title">{{ detail.title }}</text>
          <MathText :text="detail.content" class="reader-content" />
          <AttachmentGallery v-if="detail.images?.length" :model-value="detail.images" readonly label="笔记附图" />
          <view class="related-heading"><text class="related-title">关联错题</text><text class="related-count">{{ relatedQuestions.length }} 道</text></view>
          <view v-if="relatedQuestions.length" class="related-list"><view v-for="question in relatedQuestions" :key="question.id" class="related-question" @click="emit('open-question', question.id)"><view class="related-question-body"><text class="related-question-title">{{ question.title }}</text><text class="related-question-status">{{ question.status === 'mastered' ? '已掌握' : '待巩固' }}</text></view><AppIcon name="chevron-right" :size="17" tone="muted" /></view><button class="button button-quiet practice-linked" @click="emit('practice', relatedQuestions.map(question => question.id))"><AppIcon name="play" :size="16" tone="green" /><text>复习关联错题</text></button></view>
          <view v-else class="reader-no-questions"><text>还没有关联错题</text><button class="inline-action" @click="openEditor(detail.id)">添加关联</button></view>
          <button class="delete-note" @click="removeNote"><AppIcon name="trash-2" :size="15" tone="muted" /><text>删除笔记</text></button>
        </template>
        <view v-else class="reader-placeholder"><view class="reader-placeholder-icon"><AppIcon name="book-open" :size="34" tone="green" /></view><text class="reader-placeholder-title">让知识，慢慢连成线。</text><text class="muted">选择一份笔记，查看总结与关联错题。</text><view class="placeholder-decoration"><view /><view /><view /></view></view>
      </view>
    </view>

    <view v-if="editing" class="editor-mask" @click="closeEditor"><view class="note-editor" @click.stop>
      <view class="editor-heading"><view><text class="eyebrow">YOUR KNOWLEDGE</text><text class="editor-title">{{ editingId ? '编辑知识笔记' : '新建知识笔记' }}</text></view><button class="icon-button close-editor" aria-label="关闭编辑器" :disabled="saving || selectingImages" @click="closeEditor"><AppIcon name="x" :size="21" tone="muted" /></button></view>
      <scroll-view scroll-y class="editor-scroll"><view class="editor-fields">
        <text class="field-label">笔记标题</text><input v-model="title" class="editor-input" placeholder="例如：一元二次方程的易错点" :maxlength="60" />
        <text class="field-label">所属学科</text><view class="editor-subjects"><button v-for="item in editorSubjects" :key="item" class="editor-subject" :class="{ selected: subject === item }" :aria-label="item" :title="item" @click="subject = item"><text>{{ item }}</text></button></view>
        <view class="field-label-row"><text class="field-label">知识总结</text><text class="field-caption">用自己的话，讲清楚它</text></view><textarea v-model="content" class="editor-textarea" placeholder="核心知识是什么？容易在哪一步出错？下次可以怎样判断？" :maxlength="10000" />
        <AttachmentGallery v-model="images" label="笔记附图" :disabled="saving" @busy="selectingImages = $event" />
        <view class="field-label-row"><text class="field-label">关联错题</text><text class="field-caption">已选 {{ linkedIds.length }} 道 · 可跨学科保留</text></view>
        <view class="search-field association-search"><AppIcon name="search" :size="17" tone="muted" /><input v-model="questionSearch" class="search-input" :placeholder="`搜索${subject}错题`" /></view>
        <view v-if="selectableQuestions.length" class="association-list"><view v-for="question in selectableQuestions" :key="question.id" class="association-question" @click="toggleQuestion(question.id)"><view class="selection-box" :class="{ checked: linkedIds.includes(question.id) }"><AppIcon v-if="linkedIds.includes(question.id)" name="check" :size="14" tone="white" /></view><view class="association-body"><text>{{ question.title }}</text><MathText inline :text="question.stem" class="association-stem" /></view></view></view><text v-else class="association-empty">当前学科没有匹配的错题，先保存笔记也可以。</text>
      </view></scroll-view>
      <view class="editor-actions"><button class="button button-quiet" :disabled="saving || selectingImages" @click="closeEditor">取消</button><button class="button button-primary" :disabled="saving || selectingImages" @click="save"><AppIcon name="check" :size="17" tone="white" /><text>{{ saving ? '保存中…' : selectingImages ? '正在添加图片…' : '保存笔记' }}</text></button></view>
    </view></view>
  </view>
</template>

<style scoped>
.note-cover{height:110px;position:relative;overflow:hidden;border-radius:10px;margin-top:12px;background:#f0f4e9}.note-cover>image{width:100%;height:100%;display:block}.note-cover>view{position:absolute;bottom:8px;right:8px;display:flex;align-items:center;gap:4px;font-size:10px;color:#fff;background:#34553ea8;padding:3px 7px;border-radius:6px}.note-excerpt.note-excerpt-with-image{height:42px;-webkit-line-clamp:2;margin-top:10px}
.knowledge-view{color:#173e34}.knowledge-heading{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-bottom:30px}.knowledge-title{display:block;margin-top:8px;font-size:26px;font-weight:650;letter-spacing:-.6px}.heading-description{display:block;margin-top:10px;font-size:13px}.new-note{flex-shrink:0;display:flex;align-items:center;gap:8px}.knowledge-layout{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:24px;align-items:start}.library-tools{margin-bottom:18px}.search-field{height:46px;box-sizing:border-box;border:1px solid #e7e9e3;background:#fff;border-radius:12px;display:flex;align-items:center;gap:10px;padding:0 14px}.search-input{flex:1;min-width:0;font-size:13px;color:#173e34}.subject-scroll{width:100%;white-space:nowrap;margin-top:14px}.subject-tabs{display:flex;align-items:center;gap:8px}.subject-tab,.editor-subject{margin:0;padding:7px 14px;border-radius:9px;background:transparent;color:#7d8b80;font-size:12px;line-height:20px;border:1px solid transparent;flex-shrink:0}.subject-tab::after,.editor-subject::after,.icon-button::after,.inline-action::after,.delete-note::after{border:0}.subject-tab text{margin-left:7px;font-size:11px;opacity:.75}.subject-tab.selected,.editor-subject.selected{background:#e9f0e8;border-color:#dce6da;color:#39775a;font-weight:600}.note-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.note-card{padding:21px;min-height:218px;box-sizing:border-box;cursor:pointer;border:1px solid #e7e9e3;transition:border-color .2s,transform .2s}.note-card-active{border-color:#93b69a;background:#fcfdf9}.note-card-top{display:flex;align-items:center;gap:9px;margin-bottom:18px}.note-icon{width:36px;height:36px;border-radius:10px;background:#eaf1e8;display:flex;align-items:center;justify-content:center}.note-icon-1{background:#f6eddf}.note-icon-2{background:#eef0f7}.note-subject{font-size:11px;color:#8a978c}.note-arrow{margin-left:auto}.note-title{display:block;font-size:16px;line-height:1.5;font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.note-excerpt{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;font-size:12px;line-height:1.9;color:#8a948b;margin:11px 0 18px;height:68px;white-space:pre-line}.note-card-bottom{display:flex;align-items:center;gap:6px;font-size:10px;color:#8a978c;border-top:1px solid #f0f1ed;padding-top:13px}.open-note{margin-left:auto;color:#578267}.knowledge-tip{display:flex;gap:12px;padding:20px 7px}.tip-symbol{margin-top:1px;flex-shrink:0}.tip-title{display:block;font-size:12px;font-weight:600}.tip-content{display:block;font-size:11px;line-height:1.8;color:#8a948b;margin-top:5px}.note-reader{padding:25px;min-height:390px;box-sizing:border-box}.reader-top{display:flex;align-items:center;justify-content:space-between}.icon-button{display:flex;align-items:center;justify-content:center;background:transparent;margin:0;padding:7px;width:34px;height:34px;line-height:20px}.reader-title{display:block;font-size:21px;line-height:1.5;font-weight:650;margin:22px 0 16px}.reader-content{display:block;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:2;color:#697c6c}.related-heading{display:flex;justify-content:space-between;align-items:center;border-top:1px solid #e7e9e3;margin-top:28px;padding-top:22px}.related-title{font-size:13px;font-weight:600}.related-count{font-size:11px;color:#8a978c}.related-question{display:flex;align-items:center;gap:10px;background:#f7f8f4;padding:13px 11px;border-radius:10px;margin-top:10px;cursor:pointer}.related-question-body{min-width:0;flex:1}.related-question-title{display:block;font-size:12px;line-height:1.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.related-question-status{display:block;font-size:10px;color:#8a978c;margin-top:5px}.practice-linked{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;margin-top:14px}.reader-no-questions{font-size:11px;color:#8a978c;padding:18px 0;display:flex;align-items:center;justify-content:space-between}.inline-action{margin:0;padding:0;background:none;font-size:11px;line-height:20px;color:#39775a}.delete-note{display:flex;align-items:center;justify-content:center;gap:7px;background:none;color:#9aa198;font-size:11px;margin:25px auto 0;padding:5px;line-height:20px}.reader-placeholder{padding:50px 10px 22px;text-align:center}.reader-placeholder-icon{width:74px;height:74px;border-radius:22px;display:flex;align-items:center;justify-content:center;background:#eff3e9;margin:0 auto 22px}.reader-placeholder-title{font-size:16px;display:block;margin-bottom:11px}.reader-placeholder .muted{font-size:11px;line-height:1.8;display:block}.placeholder-decoration{margin:27px auto 0;max-width:150px}.placeholder-decoration view{height:5px;background:#f1f3ec;margin:9px auto;border-radius:4px}.placeholder-decoration view:nth-child(2){width:80%}.placeholder-decoration view:nth-child(3){width:55%}.empty-notes{padding:48px 25px;display:flex;align-items:center;flex-direction:column;gap:15px;text-align:center}.empty-icon{display:flex;align-items:center;justify-content:center;width:65px;height:65px;border-radius:18px;background:#eff3e9}.empty-title{font-size:17px;font-weight:600}.empty-notes .muted{font-size:12px;line-height:1.8}.empty-notes .button{margin-top:5px}.editor-mask{position:fixed;inset:0;background:rgba(23,46,35,.3);z-index:80;padding:32px 20px;display:flex;align-items:center;justify-content:center;box-sizing:border-box}.note-editor{width:640px;max-width:100%;max-height:90vh;background:#fff;border:1px solid #e7e9e3;border-radius:22px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 28px 80px rgba(23,46,35,.12)}.editor-heading{display:flex;justify-content:space-between;align-items:center;padding:25px 27px 20px;border-bottom:1px solid #edf0e7}.editor-title{display:block;font-size:21px;font-weight:600;margin-top:7px}.editor-scroll{height:58vh;min-height:220px;max-height:620px}.editor-fields{padding:5px 27px 25px}.field-label{display:block;font-size:12px;font-weight:600;margin:20px 0 10px}.editor-input{height:44px;padding:0 12px;background:#f7f8f4;border:1px solid #e7e9e3;border-radius:10px;font-size:13px}.editor-subjects{display:flex;flex-wrap:wrap;gap:7px}.editor-subject{background:#f7f8f4;color:#7f8c81;font-size:12px;padding:6px 13px}.field-label-row{display:flex;align-items:center;justify-content:space-between;gap:8px}.field-caption{font-size:10px;color:#9aa398;margin-top:10px}.editor-textarea{width:100%;height:160px;box-sizing:border-box;background:#f7f8f4;border:1px solid #e7e9e3;border-radius:11px;padding:12px;font-size:13px;line-height:1.9;color:#173e34}.association-search{height:39px;background:#f7f8f4}.association-list{margin-top:9px}.association-question{padding:12px 3px;display:flex;align-items:center;gap:11px;border-bottom:1px solid #f0f2ec;cursor:pointer}.selection-box{width:19px;height:19px;border:1px solid #d7dfd3;border-radius:5px;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-sizing:border-box;background:#fff}.selection-box.checked{border-color:#39775a;background:#39775a}.association-body{flex:1;min-width:0;font-size:12px}.association-body>text{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.6}.association-stem{font-size:11px;color:#94a08f;margin-top:3px}.association-empty{font-size:11px;color:#8a978c;display:block;padding:17px 0;line-height:1.8}.editor-actions{display:flex;justify-content:flex-end;gap:10px;padding:17px 27px;border-top:1px solid #edf0e7;background:#fcfdf9}.editor-actions .button{margin:0;display:flex;gap:7px;align-items:center;justify-content:center;min-width:95px}
.reader-mask,.reader-close{display:none}.reader-top-actions{display:flex;align-items:center;gap:5px}
@media(min-width:1200px){.knowledge-layout{grid-template-columns:minmax(0,1fr) 360px}.note-card{padding:24px}.note-title{font-size:17px}}
@media(max-width:1050px){.knowledge-layout{grid-template-columns:minmax(0,1fr)}.note-reader{min-height:220px}.reader-placeholder{padding:10px}.reader-placeholder-icon{width:50px;height:50px;border-radius:15px;margin-bottom:14px}.placeholder-decoration{display:none}}
@media(max-width:600px){.knowledge-heading{gap:12px;align-items:flex-start;margin-bottom:23px}.knowledge-title{font-size:22px;max-width:210px;line-height:1.5}.heading-description{font-size:11px;line-height:1.7;max-width:210px;margin-top:5px}.new-note{font-size:11px;padding:9px 11px;gap:4px;margin-top:27px}.note-grid{grid-template-columns:minmax(0,1fr);gap:12px}.note-card{padding:19px;min-height:195px}.note-card-top{margin-bottom:12px}.note-title{font-size:16px}.note-excerpt{height:auto;max-height:66px;margin:9px 0 14px}.knowledge-layout{gap:12px}.note-reader{padding:21px}.knowledge-tip{padding:18px 3px}.editor-mask{padding:16px 12px}.note-editor{border-radius:18px;max-height:92vh}.editor-heading{padding:20px}.editor-fields{padding:0 20px 20px}.editor-scroll{height:61vh}.editor-actions{padding:14px 20px}.field-caption{font-size:9px}.editor-subject{padding:5px 11px}}
@media(max-width:600px){.reader-mask{display:block;position:fixed;inset:0;z-index:60;background:rgba(23,46,35,.3)}.note-reader-open{position:fixed;left:12px;right:12px;bottom:18px;max-height:82vh;overflow-y:auto;z-index:61;box-shadow:0 24px 70px rgba(23,46,35,.15)}.reader-close{display:flex}}
.notes-library{min-width:0}.subject-scroll{max-width:100%;overflow:hidden}.subject-tabs{display:inline-flex;min-width:100%;border:0;margin-bottom:0;overflow:visible}.subject-tab{display:inline-flex;align-items:center;max-width:190px;min-width:0}.subject-tab .subject-tab-label{display:block;min-width:0;max-width:152px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-left:0;font-size:12px;opacity:1}.note-icon,.note-arrow,.reader-top-actions{flex-shrink:0}.note-subject{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.reader-subject{min-width:0;max-width:calc(100% - 86px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.editor-subjects{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))}.editor-subject{min-width:0;max-width:100%;display:flex;align-items:center;justify-content:center;white-space:nowrap}.editor-subject>text{display:block;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}@media(max-width:600px){.editor-subjects{grid-template-columns:repeat(3,minmax(0,1fr))}.subject-tab{max-width:166px}.subject-tab .subject-tab-label{max-width:138px;font-size:11px}}
.editor-mask{z-index:360}.note-editor{height:90vh;max-height:850px}.editor-heading,.editor-actions{flex-shrink:0}.editor-scroll{height:0;min-height:0;max-height:none;flex:1;position:relative;overflow:hidden}
/* #ifdef H5 */
.editor-scroll > :deep(.uni-scroll-view){position:absolute;inset:0;height:100%!important;max-height:100%!important}
/* #endif */
@media(max-width:600px){.note-editor{height:calc(100vh - 54px);max-height:calc(100vh - 54px)}}
</style>
