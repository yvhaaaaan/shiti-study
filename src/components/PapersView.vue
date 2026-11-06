<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import MathText from './MathText.vue'
import PaperPrintPreview from './PaperPrintPreview.vue'
import PaperForgeWorkbench from './PaperForgeWorkbench.vue'
import { useStudyStore } from '../domain/store'
import type { Paper, PaperSubject, Question } from '../domain/types'
import { exportPaper } from '../utils/exportPaper'

const emit = defineEmits<{ (event: 'open-question', id: string): void }>()
const store = useStudyStore()
const selectedPaperId = ref<string | null>(null)
const editorOpen = ref(false)
const printPaper = ref<Paper | null>(null)
const editingId = ref<string | undefined>()
const title = ref('')
const subject = ref<PaperSubject>('数学')
const targetText = ref('10')
const query = ref('')
const statusFilter = ref<'all' | 'reinforce' | 'mastered'>('all')
const favoritesOnly = ref(false)
const selectedIds = ref<string[]>([])
const retainedUnavailableIds = ref<string[]>([])
const originalPaperIds = ref<string[]>([])
const includeAnswers = ref(false)
const exportingId = ref<string | null>(null)
const saving = ref(false)
const paperForged = ref(0)
const paperFilter = ref('全部')
const papers = computed(() => store.papers.value)
const subjects = computed(() => store.availableSubjects.value)
const paperSubjects = computed(() => [...new Set(papers.value.map(item => item.subject))])
const shownPapers = computed(() => papers.value.filter(item => paperFilter.value === '全部' || item.subject === paperFilter.value))
const activeQuestions = computed(() => store.readyQuestions.value)
const paper = computed(() => papers.value.find(item => item.id === selectedPaperId.value))
const paperQuestions = computed(() => paper.value ? questionsFor(paper.value.questionIds) : [])
const missingAnswers = computed(() => paperQuestions.value.filter(question => !question.answer.trim()).length)
const unavailableCount = computed(() => paper.value ? paper.value.questionIds.length - paperQuestions.value.length : 0)
const targetCount = computed(() => {
  const value = Number.parseInt(targetText.value, 10)
  return Number.isFinite(value) ? Math.max(1, Math.min(100, value)) : 10
})
const candidates = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  return activeQuestions.value.filter(question => (subject.value === '综合' || question.subject === subject.value)
    && (statusFilter.value === 'all' || question.status === statusFilter.value)
    && (!favoritesOnly.value || question.favorite)
    && (!keyword || `${question.title} ${question.stem} ${question.tags.join(' ')}`.toLowerCase().includes(keyword)))
})
const selectedQuestions = computed(() => questionsFor(selectedIds.value))
const selectionHint = computed(() => {
  if (selectedQuestions.value.length === targetCount.value) return '题量刚刚好，可以保存试卷了。'
  if (selectedQuestions.value.length > targetCount.value) return `比目标多 ${selectedQuestions.value.length - targetCount.value} 道，可调整题数或移除题目。`
  return `距离目标还差 ${targetCount.value - selectedQuestions.value.length} 道。`
})

function questionsFor(ids: string[]): Question[] {
  return ids.map(id => activeQuestions.value.find(question => question.id === id)).filter((question): question is Question => !!question)
}

function formatDate(value: string) {
  const date = new Date(value)
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

function openEditor(existing?: Paper) {
  editingId.value = existing?.id
  originalPaperIds.value = [...(existing?.questionIds || [])]
  title.value = existing?.title ?? ''
  subject.value = existing?.subject ?? '数学'
  selectedIds.value = existing ? questionsFor(existing.questionIds).map(question => question.id) : []
  retainedUnavailableIds.value = existing ? existing.questionIds.filter(id => !selectedIds.value.includes(id)) : []
  targetText.value = String(existing ? Math.max(1, selectedIds.value.length) : 10)
  query.value = ''
  statusFilter.value = 'all'
  favoritesOnly.value = false
  editorOpen.value = true
}

async function setSubject(value: PaperSubject) {
  const removed = value === '综合' ? 0 : selectedQuestions.value.filter(q => q.subject !== value).length + retainedUnavailableIds.value.filter(id => store.state.questions.find(q => q.id === id)?.subject !== value).length
  if (removed && !await confirmAction({ title: '切换科目将移除不匹配的题目', content: `已选内容中 ${removed} 道不属于“${value}”，继续切换将从本卷移除它们。`, confirmText: '切换并移除' })) return
  subject.value = value
  if (value !== '综合') retainedUnavailableIds.value = retainedUnavailableIds.value.filter(id => store.state.questions.find(q => q.id === id)?.subject === value)
  if (value !== '综合') selectedIds.value = selectedIds.value.filter(id => activeQuestions.value.find(question => question.id === id)?.subject === value)
}

function toggleQuestion(id: string) {
  if (selectedIds.value.includes(id)) {
    selectedIds.value = selectedIds.value.filter(item => item !== id)
    return
  }
  if (selectedQuestions.value.length >= targetCount.value) return uni.showToast({ title: `已达到 ${targetCount.value} 道目标，可先调整题数`, icon: 'none' })
  selectedIds.value = [...selectedIds.value, id]
}

function fillSelection() {
  const available = candidates.value.filter(question => !selectedIds.value.includes(question.id))
  const remaining = Math.max(0, targetCount.value - selectedQuestions.value.length)
  selectedIds.value = [...selectedIds.value, ...available.slice(0, remaining).map(question => question.id)]
  const gap = targetCount.value - selectedQuestions.value.length
  uni.showToast({ title: gap > 0 ? `筛选题量不足，已选 ${selectedQuestions.value.length} 道，还差 ${gap} 道` : remaining ? '已按当前筛选补齐题目' : '当前题量已达到目标', icon: 'none', duration: 2400 })
}

function moveQuestion(index: number, direction: number) {
  const destination = index + direction
  if (destination < 0 || destination >= selectedIds.value.length) return
  const next = [...selectedIds.value]
  const current = next[index]
  const other = next[destination]
  if (!current || !other) return
  next[index] = other
  next[destination] = current
  selectedIds.value = next
}

function confirmAction(options: { title: string; content: string; confirmText: string }) {
  return new Promise<boolean>(resolve => uni.showModal({ ...options, confirmColor: '#a7653c', success: result => resolve(result.confirm), fail: () => resolve(false) }))
}

function savedQuestionIds(): string[] {
  const available = selectedQuestions.value.map(q => q.id)
  const retained = new Set(retainedUnavailableIds.value)
  const ids: string[] = []
  let cursor = 0
  for (const previous of originalPaperIds.value) {
    if (retained.has(previous)) ids.push(previous)
    else if (cursor < available.length) ids.push(available[cursor++]!)
  }
  return ids.concat(available.slice(cursor))
}

async function save() {
  if (!title.value.trim()) return uni.showToast({ title: '请先为试卷起个名字', icon: 'none' })
  if (!selectedQuestions.value.length) return uni.showToast({ title: '至少选择一道题目再保存', icon: 'none' })
  if (saving.value) return
  if (selectedQuestions.value.length !== targetCount.value) {
    const confirmed = await confirmAction({ title: '按实际题数保存？', content: `目标为 ${targetCount.value} 道，当前已选 ${selectedQuestions.value.length} 道。可以返回继续选题，也可以按当前题量保存。`, confirmText: '保存当前题目' })
    if (!confirmed) return
  }
  saving.value = true
  try {
    const saved = store.savePaper({ id: editingId.value, title: title.value.trim(), subject: subject.value, questionIds: savedQuestionIds() })
    editingId.value = saved.id
    await store.flushPersistence()
    selectedPaperId.value = saved.id
    paperFilter.value = '全部'
    editorOpen.value = false
    if (!store.state.storageError) paperForged.value++
    uni.showToast({ title: store.state.storageError ? '保存未完成，当前内容仍保留' : '试卷已保存', icon: 'none', duration: store.state.storageError ? 3500 : 1500 })
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '保存失败，请稍后再试', icon: 'none' })
  } finally {
    saving.value = false
  }
}

function openPreview(existing: Paper) {
  if (!questionsFor(existing.questionIds).length) return uni.showToast({ title: '试卷没有可用题目，请先调整选题', icon: 'none' })
  printPaper.value = existing
}

async function download(existing: Paper) {
  if (exportingId.value) return
  let questions = questionsFor(existing.questionIds)
  if (!questions.length) return uni.showToast({ title: '这份试卷暂无可导出的题目', icon: 'none' })
  exportingId.value = existing.id
  try {
    await exportPaper({ id: existing.id, title: existing.title, questionIds: questions.map(question => question.id) }, store.questions.value, includeAnswers.value)
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '导出失败，请稍后重试', icon: 'none', duration: 2600 })
  } finally {
    exportingId.value = null
  }
}
</script>

<template>
  <view class="papers-view pf-page">
    <view class="pf-heading"><view><text class="pf-title">组卷工坊</text><text class="pf-subtitle">把打磨过的题，装订成自己的试卷。</text></view><view class="pf-heading-mark" aria-hidden="true"><AppIcon name="files" :size="22" tone="orange" /></view></view>
    <PaperForgeWorkbench :paper-count="papers.length" :available-count="activeQuestions.length" :trigger="paperForged" @create="openEditor()" />

    <view class="pf-shelf-heading"><view><text>已成卷</text><text class="pf-shelf-count">{{ papers.length }}</text></view><text class="pf-shelf-caption">A4 打印 · Word 下载</text></view>
    <view v-if="paperSubjects.length > 1" class="pf-subject-filter" aria-label="按科目筛选试卷"><button :class="{ active: paperFilter === '全部' }" :aria-pressed="paperFilter === '全部'" @click="paperFilter = '全部'">全部</button><button v-for="item in paperSubjects" :key="item" :class="{ active: paperFilter === item }" :aria-pressed="paperFilter === item" @click="paperFilter = item">{{ item }}</button></view>

    <view v-if="shownPapers.length" class="pf-card-grid">
      <view v-for="(item, index) in shownPapers" :key="item.id" class="pf-paper" :class="{ 'pf-paper-selected': selectedPaperId === item.id }" role="button" tabindex="0" :aria-label="'查看试卷：' + item.title" :aria-pressed="selectedPaperId === item.id" @click="selectedPaperId = item.id" @keydown.enter.self="selectedPaperId = item.id" @keydown.space.self.prevent="selectedPaperId = item.id">
        <view class="pf-binding" aria-hidden="true"><view /><view /></view>
        <view class="pf-paper-top"><text class="pf-paper-subject">{{ item.subject }}</text><text class="pf-paper-number">{{ String(index + 1).padStart(2, '0') }}</text></view>
        <text class="pf-paper-title">{{ item.title }}</text>
        <view class="pf-paper-meta"><text>{{ questionsFor(item.questionIds).length }} 道题</text><text>{{ formatDate(item.updatedAt) }}</text></view>
        <view class="pf-paper-rule" aria-hidden="true"><view /><view /></view>
        <view class="pf-paper-actions"><button @click.stop="selectedPaperId = item.id"><text>查看</text><AppIcon name="arrow-up-right" :size="14" tone="orange" /></button><button class="pf-paper-print" @click.stop="openPreview(item)"><AppIcon name="file-text" :size="13" tone="orange" /><text>打印预览</text></button></view>
      </view>
    </view>
    <view v-else class="pf-empty"><view class="pf-empty-stack" aria-hidden="true"><AppIcon name="files" :size="31" tone="orange" /></view><text>{{ papers.length ? '这个科目还没有试卷' : '第一份试卷，等你装订' }}</text><text>挑几道想再练的题，组成一份专属练习。</text><button @click="papers.length ? paperFilter = '全部' : openEditor()">{{ papers.length ? '查看全部试卷' : '开始选题' }}<AppIcon name="arrow-right" :size="15" tone="orange" /></button></view>

    <view v-if="paper" class="paper-detail panel"><view class="pf-detail-topline"><text>试卷档案</text><button aria-label="关闭试卷详情" @click="selectedPaperId = null"><AppIcon name="x" :size="17" tone="muted" /></button></view><view class="detail-heading"><view><view class="detail-kicker"><text class="badge" :title="paper.subject">{{ paper.subject }}</text><text class="detail-date">{{ formatDate(paper.updatedAt) }} 更新</text></view><text class="detail-title">{{ paper.title }}</text><text class="detail-description">共 {{ paperQuestions.length }} 道题 · 按当前顺序排版</text></view><button class="button button-quiet edit-paper" @click="openEditor(paper)"><AppIcon name="pencil" :size="16" tone="orange" /><text>调整题目</text></button></view><view v-if="unavailableCount" class="paper-warning"><AppIcon name="info" :size="15" tone="orange" /><text>{{ unavailableCount }} 道题已删除或尚未整理，本次预览与导出仅包含可用题目；恢复并整理后会重新显示。</text></view>
      <view class="paper-question-list"><view v-for="(question, index) in paperQuestions" :key="question.id" class="paper-question" @click="emit('open-question', question.id)"><text class="question-order">{{ String(index + 1).padStart(2, '0') }}</text><view class="paper-question-content"><text class="paper-question-title">{{ question.title }}</text><MathText inline :text="question.stem" class="paper-question-stem" /><view class="paper-question-tags"><text>{{ question.subject }}</text><text>{{ question.difficulty }}</text><text :class="{ 'question-mastered': question.status === 'mastered' }">{{ question.status === 'mastered' ? '五阶完成' : '待练习' }}</text></view></view><AppIcon name="chevron-right" :size="17" tone="muted" /></view></view>
      <view v-if="!paperQuestions.length" class="no-paper-questions"><text>这份卷子里的题目暂时不可用，可调整题目后再打印。</text></view>
      <view class="paper-export-section"><view class="export-description"><view class="export-title-row"><AppIcon name="download" :size="17" tone="orange" /><text>导出 Word 试卷</text></view><text>题目按当前顺序排版，可打印，也可编辑。</text></view><view class="export-options"><button class="export-format" :class="{ selected: !includeAnswers }" @click="includeAnswers = false">题目版</button><button class="export-format" :class="{ selected: includeAnswers }" @click="includeAnswers = true">含答案版</button></view></view><view v-if="includeAnswers && missingAnswers" class="answer-warning"><AppIcon name="info" :size="14" tone="orange" /><text>{{ missingAnswers }} 道题未填写答案，题目将全部保留，卷末答案页会标记“参考答案待补充”。</text></view><view class="detail-footer"><text class="export-footnote">{{ includeAnswers ? '参考答案与解析将另页附在卷末。' : '题目版保留作答空白，适合独立练习。' }}</text><view class="detail-footer-actions"><button class="button button-quiet" :disabled="!!exportingId" @click="download(paper)"><AppIcon name="download" :size="16" tone="orange" /><text>{{ exportingId === paper.id ? '正在导出…' : '下载 Word' }}</text></button><button class="button button-primary" @click="openPreview(paper)"><AppIcon name="file-text" :size="16" tone="white" /><text>打印试卷</text></button></view></view></view>

    <view v-else-if="papers.length" class="select-paper-hint"><AppIcon name="arrow-up-right" :size="16" tone="muted" /><text>轻点一份试卷，查看题目与导出选项。</text></view>


    <PaperPrintPreview v-if="printPaper" :paper="printPaper" :questions="questionsFor(printPaper.questionIds)" :initial-answers="includeAnswers" :unavailable="printPaper.questionIds.length - questionsFor(printPaper.questionIds).length" @close="printPaper = null" />
    <view v-if="editorOpen" class="modal-overlay paper-modal-overlay" @click="editorOpen = false"><view class="modal-window paper-builder" @click.stop><view class="modal-header builder-header"><view><text class="pf-builder-kicker">选料 · 排序 · 成卷</text><text class="builder-title">{{ editingId ? '调整试卷' : '装订一份新试卷' }}</text></view><button class="plain-icon" aria-label="关闭组卷" @click="editorOpen = false"><AppIcon name="x" :size="21" tone="muted" /></button></view>
      <scroll-view scroll-y class="modal-scroll builder-scroll"><view class="builder-content"><view class="builder-settings"><text class="builder-label">试卷名称</text><input v-model="title" class="form-input builder-name-input" placeholder="例如：周末数学 · 方程专项巩固" :maxlength="60" /><text class="builder-label">选择学科</text><view class="builder-subjects"><button class="builder-chip" :class="{ selected: subject === '综合' }" @click="setSubject('综合')"><text>综合</text></button><button v-for="item in subjects" :key="item" class="builder-chip" :class="{ selected: subject === item }" :aria-label="item" :title="item" @click="setSubject(item)"><text>{{ item }}</text></button></view><view class="quantity-heading"><text class="builder-label">目标题数</text><text>最多 100 道</text></view><view class="quantity-row"><button v-for="count in [5, 10, 15, 20]" :key="count" class="quantity-choice" :class="{ selected: targetCount === count }" @click="targetText = String(count)">{{ count }} 道</button><view class="custom-quantity"><input v-model="targetText" type="number" :maxlength="3" /><text>道</text></view></view></view>
        <view v-if="retainedUnavailableIds.length" class="paper-warning"><text>{{ retainedUnavailableIds.length }} 道暂不可用题目仍保留在原卷中，恢复后可重新显示。</text><button class="text-button" @click="retainedUnavailableIds = []">从本卷移除这些题</button></view><view class="builder-columns"><view class="candidate-section"><view class="candidate-heading"><text class="builder-label">从错题本选题</text><text>{{ candidates.length }} 道符合筛选</text></view><view class="candidate-search"><AppIcon name="search" :size="17" tone="muted" /><input v-model="query" placeholder="搜索题目或知识点" /></view><view class="candidate-filters"><button class="filter-chip" :class="{ active: statusFilter === 'all' }" @click="statusFilter = 'all'">全部</button><button class="filter-chip" :class="{ active: statusFilter === 'reinforce' }" @click="statusFilter = 'reinforce'">待练习</button><button class="filter-chip" :class="{ active: statusFilter === 'mastered' }" @click="statusFilter = 'mastered'">五阶完成</button><button class="favorite-filter" :class="{ active: favoritesOnly }" @click="favoritesOnly = !favoritesOnly"><AppIcon name="star" :size="13" :tone="favoritesOnly ? 'orange' : 'muted'" /><text>收藏</text></button></view><button class="fill-button" @click="fillSelection"><AppIcon name="plus" :size="15" tone="orange" /><text>按当前筛选补齐至 {{ targetCount }} 道</text></button><view v-if="candidates.length" class="candidate-list"><view v-for="question in candidates" :key="question.id" class="candidate-question" :class="{ 'candidate-selected': selectedIds.includes(question.id) }" @click="toggleQuestion(question.id)"><view class="selection-square" :class="{ checked: selectedIds.includes(question.id) }"><AppIcon v-if="selectedIds.includes(question.id)" name="check" :size="13" tone="white" /></view><view class="candidate-question-body"><text class="candidate-question-title">{{ question.title }}</text><MathText inline :text="question.stem" class="candidate-question-stem" /><view class="candidate-meta"><text>{{ question.subject }}</text><text>{{ question.difficulty }}</text><text>{{ question.status === 'mastered' ? '五阶完成' : '待练习' }}</text></view></view></view></view><view v-else class="candidate-empty"><AppIcon name="search" :size="25" tone="muted" /><text>没有符合条件的题目</text><text>试试切换学科、锻造状态或搜索词。</text></view></view>
          <view class="selected-section"><view class="selected-heading"><view><text>已选题目</text><text class="selection-total">{{ selectedQuestions.length }} / {{ targetCount }}</text></view><button v-if="selectedQuestions.length" class="clear-selection" @click="selectedIds = []">清空</button></view><text class="selection-hint">{{ selectionHint }}</text><view v-if="selectedQuestions.length" class="selected-question-list"><view v-for="(question, index) in selectedQuestions" :key="question.id" class="selected-question"><view class="selected-question-main"><text class="selected-order">{{ index + 1 }}</text><text class="selected-title">{{ question.title }}</text><button class="plain-icon remove-selected" aria-label="移除题目" @click="toggleQuestion(question.id)"><AppIcon name="x" :size="15" tone="muted" /></button></view><view class="selected-question-bottom"><text>{{ question.subject }} · {{ question.difficulty }}</text><view class="order-buttons"><button class="order-button" :disabled="index === 0" aria-label="上移题目" @click="moveQuestion(index, -1)"><AppIcon name="arrow-up" :size="13" :tone="index === 0 ? 'muted' : 'orange'" /></button><button class="order-button" :disabled="index === selectedQuestions.length - 1" aria-label="下移题目" @click="moveQuestion(index, 1)"><AppIcon name="arrow-down" :size="13" :tone="index === selectedQuestions.length - 1 ? 'muted' : 'orange'" /></button></view></view></view></view><view v-else class="selection-empty"><view class="selection-empty-lines"><view /><view /><view /></view><text>从左侧选入题目</text><text>手机上可从上方选择</text></view><view class="selection-bottom-hint"><AppIcon name="info" :size="13" tone="muted" /><text>使用上下箭头调整顺序，保存后可打印试卷或导出。</text></view></view></view>
      </view></scroll-view><view class="modal-footer builder-footer"><text :title="subject">已选 {{ selectedQuestions.length }} 道 · {{ subject }}试卷</text><view><button class="button button-quiet" @click="editorOpen = false">取消</button><button class="button button-primary" :disabled="saving" @click="save"><AppIcon name="check" :size="17" tone="white" /><text>{{ saving ? '正在保存…' : '保存试卷' }}</text></button></view></view></view></view>
  </view>
</template>

<style scoped>
.pf-page{max-width:1120px;margin:0 auto;color:#49382e;--pf-ink:#49382e;--pf-copper:#a6603a;--pf-muted:#9a826e;--pf-line:#e8d9c8;--pf-cream:#fffcf5}
.pf-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:2px 0 19px}.pf-title{display:block;font-size:27px;font-weight:700;line-height:1.4;letter-spacing:-.5px;color:#3d2c23}.pf-subtitle{display:block;font-size:13px;line-height:1.7;color:#9c826c;margin-top:5px}.pf-heading-mark{display:flex;align-items:center;justify-content:center;width:43px;height:43px;border:1px solid #e9d7c2;border-radius:13px;background:#f6ebdb;transform:rotate(6deg);flex-shrink:0}
.pf-shelf-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:27px 0 18px}.pf-shelf-heading>view{display:flex;align-items:center;gap:9px;font-size:16px;font-weight:600;color:#634832}.pf-shelf-count{min-width:20px;padding:2px 6px;border-radius:6px;background:#efdfcb;color:#9b6b45;text-align:center;font-size:11px;font-weight:500}.pf-shelf-caption{font-size:12px;color:#a58e78}.pf-subject-filter{display:flex;flex-wrap:wrap;gap:7px;margin:-2px 0 19px}.pf-subject-filter>button{margin:0;padding:7px 13px;border:1px solid transparent;border-radius:8px;background:transparent;color:#a38971;font-size:12px;line-height:1.5}.pf-subject-filter>button.active{background:#edddc8;border-color:#e0c5a6;color:#94552f}.pf-subject-filter>button::after{border:0}
.pf-card-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px 21px;padding-bottom:7px}.pf-paper{position:relative;isolation:isolate;min-width:0;padding:19px 19px 14px;border:1px solid #e0cdb5;border-radius:4px 15px 15px 15px;background:#fffaf0;box-shadow:0 4px 0 #f5ebdd,0 5px 0 #e6d5bf;cursor:pointer;transition:transform .18s,border-color .18s,box-shadow .18s}.pf-paper::before{content:'';position:absolute;inset:0;z-index:-1;pointer-events:none;background:linear-gradient(90deg,#d8bb9626 0,transparent 20px);border-radius:inherit}.pf-paper-selected{border-color:#b16d43;box-shadow:inset 0 0 0 1px #b16d43,0 4px 0 #ecdbc4,0 5px 0 #d2ac7d}.pf-paper:focus-visible{outline:2px solid #b16d43;outline-offset:5px}.pf-binding{position:absolute;left:25px;right:25px;top:-7px;display:flex;justify-content:space-between;pointer-events:none}.pf-binding>view{width:7px;height:15px;border:2px solid #b08c65;border-bottom-color:#d2b08a;border-radius:4px;background:#f9eedd;box-shadow:1px 1px #fff7e9}.pf-paper-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:2px 0 16px}.pf-paper-subject{max-width:75%;padding:3px 9px;border-radius:3px 7px 7px 3px;background:#edddc5;color:#986443;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.5}.pf-paper-number{font:18px Georgia,serif;color:#cfb499;letter-spacing:1px}.pf-paper-title{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;min-height:48px;max-height:48px;overflow:hidden;font-size:16px;font-weight:600;line-height:1.5;color:#60432e;overflow-wrap:anywhere}.pf-paper-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:11px;color:#a58a72;line-height:1.6;margin-top:8px}.pf-paper-meta>text:first-child{color:#a06d45}.pf-paper-rule{padding:7px 0 1px;pointer-events:none}.pf-paper-rule>view{height:1px;background:#eadac4;margin-top:7px;opacity:.7}.pf-paper-rule>view:last-child{width:74%}.pf-paper-actions{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:15px}.pf-paper-actions>button{display:flex;align-items:center;justify-content:center;gap:4px;margin:0;padding:5px 0;font-size:12px;line-height:1.5;background:transparent;color:#a66b41;white-space:nowrap}.pf-paper-actions>button::after{border:0}.pf-paper-actions>.pf-paper-print{padding:6px 9px;border-radius:7px;border:1px solid #e5cdb0;background:#f4e7d4;color:#9c6239}.pf-paper-actions>button:active{transform:translateY(1px)}
.pf-empty{display:flex;align-items:center;flex-direction:column;gap:12px;padding:32px 20px;background:#fffcf6;border:1px dashed #ddc6aa;border-radius:15px;text-align:center}.pf-empty-stack{width:64px;height:65px;background:#f3e6d1;border:1px solid #e5d0b1;border-radius:10px 16px 14px 10px;display:flex;align-items:center;justify-content:center;box-shadow:4px 3px #ead9c1;transform:rotate(-5deg);margin-bottom:5px}.pf-empty>text:first-of-type{font-size:17px;font-weight:600;color:#795436}.pf-empty>text:last-of-type{font-size:12px;line-height:1.8;color:#a18a74}.pf-empty>button{display:flex;align-items:center;gap:7px;margin:3px 0 0;padding:9px 13px;border:1px solid #dfc3a0;border-radius:8px;background:#f4e4cb;font-size:12px;line-height:1.5;color:#9d5c31}.pf-empty>button::after{border:0}
.pf-page .paper-detail{margin-top:27px;padding:22px 25px;border:1px solid #e4d3be;border-radius:15px;background:#fffdf7;box-shadow:none}.pf-detail-topline{display:flex;align-items:center;justify-content:space-between;margin-bottom:15px;padding-bottom:12px;border-bottom:1px dashed #e8d8c2;font-size:12px;color:#a98969;letter-spacing:1px}.pf-detail-topline>button{display:flex;align-items:center;justify-content:center;min-width:30px;min-height:30px;margin:-5px 0;padding:5px;background:#f3e9dd;border-radius:50%}.pf-detail-topline>button::after{border:0}.detail-heading{display:flex;justify-content:space-between;align-items:center;gap:15px}.detail-heading>view{min-width:0;flex:1}.detail-kicker{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.pf-page .detail-kicker .badge{min-width:0;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#f1dfc5;color:#976039;font-size:11px}.detail-date{font-size:11px;color:#ac937c;flex-shrink:0}.detail-title{display:block;font-size:22px;font-weight:600;line-height:1.5;margin-top:11px;color:#5c3f2b;overflow-wrap:anywhere}.detail-description{display:block;color:#a48b75;font-size:12px;line-height:1.8;margin-top:5px}.pf-page .edit-paper{display:flex;align-items:center;gap:6px;flex-shrink:0;font-size:12px;border-color:#e1c8a8;background:#f6e8d4;color:#98603a}
.paper-warning{margin-top:17px;padding:11px 13px;border:1px solid #ead6b8;background:#fcf3e3;border-radius:9px;display:flex;align-items:flex-start;gap:8px;font-size:11px;line-height:1.8;color:#a77d4e}.paper-warning .text-button{font-size:11px;color:#a26335;flex-shrink:0}.paper-question-list{margin-top:19px;border-top:1px solid #eddfce}.paper-question{display:flex;align-items:center;gap:15px;padding:17px 0;border-bottom:1px solid #eddfce;cursor:pointer}.question-order{font-size:13px;color:#bc9c7a;align-self:flex-start;margin-top:2px;font-weight:600;min-width:22px}.paper-question-content{flex:1;min-width:0}.paper-question-title{font-size:14px;font-weight:600;display:block;line-height:1.6;color:#644a34}.paper-question-stem{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:12px;color:#a38a76;line-height:1.8;margin-top:6px}.paper-question-tags{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}.paper-question-tags>text{font-size:11px;padding:2px 6px;border-radius:4px;background:#f2e9dc;color:#9c7a5c}.paper-question-tags>text:first-child{min-width:0;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.paper-question-tags>text:last-child{background:#f5e5ce;color:#ac7747}.paper-question-tags>text.question-mastered{background:#efe2cf;color:#956340}
.paper-export-section{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-top:22px}.export-title-row{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:#79573c}.export-description>text{display:block;font-size:11px;line-height:1.8;color:#a88f78;margin:6px 0 0 24px}.export-options{display:flex;background:#f2e7d7;border:1px solid #e9d5bb;padding:4px;border-radius:9px}.export-format{padding:7px 12px;background:none;border-radius:6px;font-size:12px;line-height:1.5;color:#ab8e72;margin:0;white-space:nowrap}.export-format.selected{background:#fffbf3;color:#9d6035;box-shadow:0 1px 4px #79522b0c}.answer-warning{display:flex;align-items:flex-start;gap:7px;font-size:11px;line-height:1.8;color:#b08751;padding-top:14px}.detail-footer{display:flex;align-items:center;justify-content:space-between;gap:15px;border-top:1px solid #eddfce;margin-top:19px;padding-top:18px}.export-footnote{font-size:11px;line-height:1.8;color:#ac947e}.detail-footer-actions{display:flex;gap:10px;flex-shrink:0}.pf-page .detail-footer-actions .button{display:flex;align-items:center;justify-content:center;gap:7px;font-size:12px}.pf-page .button-primary{background:#aa663f;color:#fff8eb}.pf-page .button-quiet{background:#f8efdf;border-color:#e3cdae;color:#9a6840}.no-paper-questions{font-size:12px;color:#a98d77;padding:25px 0;text-align:center}.select-paper-hint{display:flex;align-items:center;justify-content:center;gap:7px;font-size:12px;line-height:1.8;color:#af9780;padding:23px 10px 0}
.pf-page .paper-builder{width:920px!important;max-width:100%;height:calc(100vh - 70px);max-height:900px;background:#fffcf6;border:1px solid #e7d1b4;border-radius:21px;overflow:hidden;display:flex;flex-direction:column}.pf-page .builder-header{padding:20px 26px!important;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;border-bottom:1px solid #ebdcc7;background:#fff8ec}.pf-builder-kicker{display:block;font-size:11px;letter-spacing:1px;color:#b18b62}.builder-title{display:block;font-size:21px;font-weight:600;margin-top:5px;color:#6b472d}.plain-icon{background:#f2e5d1;margin:0;padding:5px;width:31px;height:31px;display:flex;align-items:center;justify-content:center;border-radius:50%;flex-shrink:0}.builder-scroll{height:0;min-height:0;max-height:none;flex:1;position:relative;overflow:hidden}.builder-content{padding:0 26px 24px}.builder-settings{padding-bottom:22px;border-bottom:1px dashed #e4d1b5}.builder-label{display:block;font-size:13px;font-weight:600;color:#7c593b;margin:17px 0 10px}.pf-page .builder-name-input{height:43px!important;box-sizing:border-box;font-size:13px!important;border-color:#e4cdb0;background:#fffaf0;color:#755035}.builder-subjects{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px}.builder-chip{min-width:0;max-width:100%;display:flex;align-items:center;justify-content:center;margin:0;border:1px solid #e9d8c1;background:#f9f0e2;color:#a3866a;line-height:1.5;padding:8px 12px;font-size:12px;border-radius:7px;white-space:nowrap}.builder-chip>text{display:block;max-width:100%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.builder-chip.selected{background:#eed9bb;border-color:#cfa06f;color:#96582d}.quantity-heading{display:flex;align-items:center;justify-content:space-between}.quantity-heading>text:last-child{font-size:11px;color:#af9478;margin-top:7px}.quantity-row{display:flex;align-items:center;gap:8px}.quantity-choice{margin:0;line-height:1.5;background:#f9f0e2;border:1px solid #e9d8c1;padding:9px 15px;font-size:12px;color:#a3866a;border-radius:8px;white-space:nowrap}.quantity-choice.selected{background:#eed9bb;border-color:#cfa06f;color:#96582d}.custom-quantity{display:flex;align-items:center;gap:7px;margin-left:4px;font-size:11px;color:#a3866a}.custom-quantity input{width:48px;height:36px;border:1px solid #e4ccb0;border-radius:8px;text-align:center;font-size:12px;background:#fffbf3;color:#795236}
.builder-columns{display:grid;grid-template-columns:minmax(0,1fr) 270px;gap:23px;margin-top:7px}.candidate-section{min-width:0}.candidate-heading{display:flex;align-items:center;justify-content:space-between;gap:10px}.candidate-heading>text:last-child{font-size:11px;color:#b0987e;margin-top:8px}.candidate-search{height:40px;display:flex;align-items:center;gap:8px;background:#f9f0e3;border:1px solid #e6d1b6;border-radius:9px;padding:0 11px}.candidate-search input{flex:1;min-width:0;width:0;font-size:12px;color:#765238}.candidate-filters{display:flex;align-items:center;gap:5px;margin-top:10px}.pf-page .filter-chip{padding:5px 9px;margin:0;line-height:1.6;font-size:11px;border-radius:6px;color:#ae9275;background:transparent;border-color:transparent}.pf-page .filter-chip.active{background:#eedcbe;color:#9e6033;border-color:#ddbd94}.favorite-filter{display:flex;align-items:center;justify-content:center;gap:4px;margin:0 0 0 auto;padding:5px 6px;font-size:11px;background:transparent;line-height:1.6;color:#af9275}.favorite-filter.active{color:#b5783a}.fill-button{display:flex;align-items:center;justify-content:center;gap:5px;width:100%;background:#f4e7d1;border:1px dashed #d8b48a;padding:9px;font-size:12px;line-height:1.6;color:#9e6339;margin:12px 0 5px;border-radius:8px}.candidate-question{display:flex;align-items:flex-start;gap:10px;padding:15px 5px;border-bottom:1px solid #eee0cc;cursor:pointer;transition:background .15s}.candidate-selected{background:#f7eddc}.selection-square{margin-top:2px;width:19px;height:19px;box-sizing:border-box;border:1px solid #d9b992;border-radius:5px;background:#fff9ef;display:flex;align-items:center;justify-content:center;flex-shrink:0}.selection-square.checked{background:#ae7044;border-color:#ae7044}.candidate-question-body{min-width:0;flex:1}.candidate-question-title{font-size:13px;font-weight:600;line-height:1.7;display:block;color:#745036}.candidate-question-stem{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:12px;color:#ac9178;line-height:1.8;margin-top:5px}.candidate-meta{display:flex;gap:9px;font-size:11px;color:#af9073;margin-top:8px;min-width:0}.candidate-meta>text{flex-shrink:0}.candidate-meta>text:first-child{min-width:0;max-width:50%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:1}.candidate-empty{display:flex;align-items:center;flex-direction:column;text-align:center;gap:12px;font-size:12px;color:#aa8766;padding:32px 10px}.candidate-empty>text:last-child{font-size:11px;color:#b39c85;line-height:1.8}
.selected-section{background:#f6ead6;border:1px solid #e5cfb0;border-radius:12px;padding:16px;margin-top:17px;align-self:start;min-width:0}.selected-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}.selected-heading>view{display:flex;align-items:center;gap:9px;font-size:13px;font-weight:600;color:#906039}.selection-total{font-size:12px;color:#ab8059;font-weight:400}.clear-selection{background:none;font-size:11px;line-height:1.6;color:#ad8b6b;margin:0;padding:0}.selection-hint{display:block;font-size:11px;color:#b09377;line-height:1.8;margin-top:9px}.selected-question-list{margin-top:14px}.selected-question{border:1px solid #e7d1b1;border-radius:8px;background:#fffbf2;padding:10px;margin-top:9px}.selected-question-main{display:flex;align-items:flex-start;gap:7px}.selected-order{font-size:11px;color:#b08a62;margin-top:2px;min-width:12px}.selected-title{font-size:12px;line-height:1.8;color:#86613f;flex:1;min-width:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.remove-selected{width:23px;height:23px;padding:2px;flex-shrink:0}.selected-question-bottom{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:9px;padding-left:19px;font-size:11px;color:#b3977c}.selected-question-bottom>text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.order-buttons{display:flex;align-items:center;gap:5px;flex-shrink:0}.order-button{width:26px;height:26px;display:flex;align-items:center;justify-content:center;border:1px solid #e6cdb0;background:#f7ebd8;margin:0;padding:0;border-radius:6px}.order-button[disabled]{opacity:.4;background:#f3e7d5}.selection-empty{text-align:center;color:#b2987e;padding:28px 10px;display:flex;align-items:center;flex-direction:column;gap:8px;font-size:12px}.selection-empty>text:last-child{font-size:11px;color:#bca58f}.selection-empty-lines{width:63px;margin:0 auto 10px;padding:12px 9px;background:#eedfc6;border-radius:8px}.selection-empty-lines>view{height:3px;background:#dcc3a1;border-radius:3px;margin:7px 0}.selection-empty-lines>view:nth-child(2){width:80%}.selection-empty-lines>view:nth-child(3){width:60%}.selection-bottom-hint{display:flex;align-items:flex-start;gap:6px;font-size:11px;line-height:1.8;color:#b19275;border-top:1px solid #e4cfb1;margin-top:16px;padding-top:12px}
.pf-page .builder-footer{padding:16px 26px!important;display:flex;align-items:center;justify-content:space-between;gap:15px;flex-shrink:0;background:#fff7e9;border-top:1px solid #e8d4b8}.builder-footer>text{font-size:12px;color:#a98661;min-width:0;max-width:36%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.builder-footer>view{display:flex;align-items:center;gap:10px;flex-shrink:0}.pf-page .builder-footer .button{display:flex;align-items:center;gap:6px;justify-content:center;font-size:12px;margin:0}.pf-page button:focus-visible{outline:2px solid #b16d43;outline-offset:3px}.plain-icon::after,.builder-chip::after,.quantity-choice::after,.filter-chip::after,.favorite-filter::after,.fill-button::after,.clear-selection::after,.order-button::after,.export-format::after{border:0}
/* #ifdef H5 */
.builder-scroll > :deep(.uni-scroll-view){position:absolute;inset:0;height:100%!important;max-height:100%!important}
/* #endif */
@media(hover:hover){.pf-paper:hover{transform:translateY(-3px);border-color:#c59d71;box-shadow:0 4px 0 #efdfc9,0 5px 0 #dec39e,0 13px 25px #6b45240c}.pf-paper-selected:hover{box-shadow:inset 0 0 0 1px #b16d43,0 4px 0 #ecdbc4,0 5px 0 #d2ac7d,0 13px 25px #6b45240c}}
@media(max-width:1050px){.pf-card-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.builder-columns{grid-template-columns:minmax(0,1fr) 245px;gap:18px}.detail-footer{align-items:flex-end}.export-footnote{max-width:220px}}
@media(max-width:650px){.pf-heading{margin:0 0 15px}.pf-title{font-size:24px}.pf-subtitle{font-size:12px}.pf-heading-mark{width:35px;height:37px;border-radius:10px}.pf-shelf-heading{margin:22px 0 16px}.pf-shelf-heading>view{font-size:15px}.pf-shelf-caption{font-size:11px}.pf-subject-filter{gap:6px;margin-bottom:17px}.pf-subject-filter>button{font-size:11px;padding:6px 11px}.pf-card-grid{gap:20px 13px}.pf-paper{padding:15px 12px 11px;border-radius:4px 12px 12px 12px}.pf-binding{left:19px;right:19px}.pf-paper-top{margin:2px 0 12px;gap:6px}.pf-paper-subject{font-size:11px;padding:2px 7px}.pf-paper-number{font-size:15px}.pf-paper-title{font-size:14px;min-height:44px;max-height:44px;line-height:1.6}.pf-paper-meta{font-size:11px;gap:3px 7px;flex-direction:column;align-items:flex-start;line-height:1.7;margin-top:6px}.pf-paper-rule{padding-top:3px}.pf-paper-actions{margin-top:12px;gap:4px}.pf-paper-actions>button{font-size:11px;gap:2px}.pf-paper-actions>.pf-paper-print{padding:5px 6px}.pf-empty{padding:28px 18px}.pf-empty>text:first-of-type{font-size:16px}.pf-page .paper-detail{padding:16px;margin-top:23px}.detail-heading{align-items:flex-start;gap:10px}.detail-title{font-size:18px;margin-top:9px}.detail-date{font-size:11px}.detail-description{font-size:11px}.pf-page .edit-paper{font-size:11px;padding:8px;gap:4px;margin-top:2px;min-height:36px}.paper-question{gap:10px;padding:15px 0}.question-order{font-size:12px;min-width:19px}.paper-question-title{font-size:13px}.paper-question-stem{font-size:12px}.paper-export-section{align-items:flex-start;flex-direction:column;gap:13px;margin-top:19px}.export-description>text{font-size:11px}.export-options{align-self:stretch}.export-format{flex:1;text-align:center;font-size:11px}.detail-footer{align-items:flex-start;flex-direction:column;gap:13px;margin-top:16px;padding-top:15px}.export-footnote{font-size:11px;max-width:none}.detail-footer-actions{width:100%;gap:8px}.pf-page .detail-footer-actions .button{flex:1;font-size:12px;gap:5px;padding:10px}.select-paper-hint{font-size:11px;padding-top:20px}.paper-warning{font-size:11px;flex-wrap:wrap}.answer-warning{font-size:11px}.pf-page .paper-builder{height:calc(100vh - 38px);max-height:calc(100vh - 38px);border-radius:19px 19px 0 0}.pf-page .builder-header{padding:17px 19px!important}.builder-title{font-size:19px}.pf-builder-kicker{font-size:11px}.builder-content{padding:0 19px 20px}.builder-columns{grid-template-columns:minmax(0,1fr);gap:0}.builder-settings{padding-bottom:20px}.builder-subjects{grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.builder-chip{padding:8px 11px;font-size:12px}.quantity-row{gap:6px}.quantity-choice{padding:8px 10px;font-size:11px}.custom-quantity{gap:5px;margin-left:0;font-size:11px}.custom-quantity input{width:38px;height:33px;font-size:12px}.builder-label{font-size:12px}.pf-page .builder-name-input{font-size:12px!important}.candidate-heading>text:last-child{font-size:11px}.candidate-filters{gap:3px}.pf-page .filter-chip{padding:5px 7px;font-size:11px}.favorite-filter{font-size:11px;gap:3px;padding-left:3px;padding-right:3px}.fill-button{font-size:12px}.candidate-question-title{font-size:13px}.candidate-question-stem{font-size:12px}.selected-section{padding:14px;margin-top:20px}.selected-question-list{display:grid;grid-template-columns:minmax(0,1fr);gap:0}.selection-empty{padding:20px 10px}.selection-empty>text:first-of-type{display:none}.pf-page .builder-footer{padding:14px 19px!important;gap:8px}.builder-footer>text{font-size:11px;max-width:90px;line-height:1.8}.builder-footer>view{gap:7px}.pf-page .builder-footer .button{font-size:12px;padding:10px 12px}}
@media(max-width:360px){.pf-subtitle{max-width:235px}.pf-heading-mark{display:none}.pf-shelf-caption{font-size:11px;letter-spacing:-.3px}.pf-card-grid{gap:18px 10px}.pf-paper{padding-left:10px;padding-right:10px}.pf-paper-actions>.pf-paper-print .app-icon{display:none}.pf-paper-actions>.pf-paper-print{padding:5px 4px}.pf-paper-actions>button{font-size:11px}.pf-page .paper-detail{padding:14px}.detail-heading{flex-wrap:wrap}.pf-page .edit-paper{margin-top:0}.quantity-row{flex-wrap:wrap;gap:6px}.quantity-choice{flex:1;padding:8px 10px}.custom-quantity{margin-top:3px}.candidate-filters{flex-wrap:wrap}.pf-page .builder-footer{padding-left:16px!important;padding-right:16px!important}.builder-footer>text{max-width:65px}.pf-page .builder-footer .button{padding:10px 9px;font-size:11px}.builder-content{padding-left:16px;padding-right:16px}}
@media(prefers-reduced-motion:reduce){.pf-paper,.candidate-question{transition:none}.pf-paper:hover{transform:none}}
</style>
