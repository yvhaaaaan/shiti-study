<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import MathText from './MathText.vue'
import { useStudyStore } from '../domain/store'
import type { Paper, PaperSubject, Question } from '../domain/types'
import { exportPaper } from '../utils/exportPaper'

const emit = defineEmits<{ (event: 'practice', ids: string[]): void; (event: 'open-question', id: string): void }>()
const store = useStudyStore()
const selectedPaperId = ref<string | null>(null)
const editorOpen = ref(false)
const editingId = ref<string | undefined>()
const title = ref('')
const subject = ref<PaperSubject>('数学')
const targetText = ref('10')
const query = ref('')
const statusFilter = ref<'all' | 'reinforce' | 'mastered'>('all')
const favoritesOnly = ref(false)
const selectedIds = ref<string[]>([])
const includeAnswers = ref(false)
const exportingId = ref<string | null>(null)
const saving = ref(false)
const papers = computed(() => store.papers.value)
const subjects = computed(() => store.availableSubjects.value)
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
  if (selectedQuestions.value.length === targetCount.value) return '题量刚刚好，可以保存练习卷了。'
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
  title.value = existing?.title ?? ''
  subject.value = existing?.subject ?? '数学'
  selectedIds.value = existing ? questionsFor(existing.questionIds).map(question => question.id) : []
  targetText.value = String(existing ? Math.max(1, selectedIds.value.length) : 10)
  query.value = ''
  statusFilter.value = 'all'
  favoritesOnly.value = false
  editorOpen.value = true
}

function setSubject(value: PaperSubject) {
  subject.value = value
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
  return new Promise<boolean>(resolve => uni.showModal({ ...options, confirmColor: '#39775a', success: result => resolve(result.confirm), fail: () => resolve(false) }))
}

async function save() {
  if (!title.value.trim()) return uni.showToast({ title: '请先为练习卷起个名字', icon: 'none' })
  if (!selectedQuestions.value.length) return uni.showToast({ title: '至少选择一道题目再保存', icon: 'none' })
  if (saving.value) return
  if (selectedQuestions.value.length !== targetCount.value) {
    const confirmed = await confirmAction({ title: '按实际题数保存？', content: `目标为 ${targetCount.value} 道，当前已选 ${selectedQuestions.value.length} 道。可以返回继续选题，也可以按当前题量保存。`, confirmText: '保存当前题目' })
    if (!confirmed) return
  }
  saving.value = true
  try {
    const saved = store.savePaper({ id: editingId.value, title: title.value.trim(), subject: subject.value, questionIds: selectedQuestions.value.map(question => question.id) })
    editingId.value = saved.id
    await store.flushPersistence()
    selectedPaperId.value = saved.id
    editorOpen.value = false
    uni.showToast({ title: store.state.storageError ? '保存未完成，当前内容仍保留' : '练习卷已保存', icon: 'none', duration: store.state.storageError ? 3500 : 1500 })
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '保存失败，请稍后再试', icon: 'none' })
  } finally {
    saving.value = false
  }
}

function startPractice(existing: Paper) {
  const ids = questionsFor(existing.questionIds).map(question => question.id)
  if (!ids.length) return uni.showToast({ title: '这份练习卷暂无可用题目，请先调整题目', icon: 'none' })
  emit('practice', ids)
}

async function download(existing: Paper) {
  if (exportingId.value) return
  let questions = questionsFor(existing.questionIds)
  if (!questions.length) return uni.showToast({ title: '这份练习卷暂无可导出的题目', icon: 'none' })
  if (includeAnswers.value) {
    const missing = questions.filter(question => !question.answer.trim()).length
    if (missing === questions.length) return uni.showToast({ title: '全部题目尚未填写答案，可切换题目版导出', icon: 'none', duration: 2600 })
    if (missing) {
      const confirmed = await confirmAction({ title: '部分题目没有参考答案', content: `${missing} 道题尚未填写答案，本次含答案版将排除这些题目，导出其余 ${questions.length - missing} 道。题目版可以保留全部题目。`, confirmText: '导出有答案题目' })
      if (!confirmed) return
      questions = questions.filter(question => question.answer.trim())
    }
  }
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
  <view class="papers-view">
    <view class="papers-heading"><view><text class="eyebrow">MAKE IT YOUR OWN</text><text class="papers-title">为自己，出一份好题。</text><text class="muted papers-description">把需要再练的错题，整理成专属练习卷。</text></view><button class="button button-primary new-paper" @click="openEditor()"><AppIcon name="plus" :size="18" tone="white" /><text>新建练习卷</text></button></view>

    <view class="papers-summary"><view class="summary-left"><view class="summary-icon"><AppIcon name="file-text" :size="23" tone="green" /></view><view><text class="summary-title">我的练习卷<text>{{ papers.length }} 份</text></text><text class="summary-caption">自己选题 · 在线练习 · Word 导出</text></view></view><text class="summary-available">{{ activeQuestions.length }} 道错题可选</text></view>

    <view v-if="papers.length" class="paper-grid"><view v-for="(item, index) in papers" :key="item.id" class="paper-card panel" :class="{ 'paper-card-selected': selectedPaperId === item.id }" @click="selectedPaperId = item.id"><view class="paper-cover"><view class="paper-cover-top"><text>PRACTICE SET</text><text>{{ String(index + 1).padStart(2, '0') }}</text></view><view class="paper-cover-symbol"><AppIcon name="file-text" :size="33" tone="green" /></view><view class="paper-cover-lines"><view /><view /><view /></view><text class="paper-cover-subject" :title="item.subject">{{ item.subject }} · 专项巩固</text></view><view class="paper-card-body"><text class="paper-title">{{ item.title }}</text><view class="paper-card-meta"><text>{{ questionsFor(item.questionIds).length }} 道题</text><view class="meta-dot" /><text>{{ formatDate(item.updatedAt) }}</text></view><view class="paper-card-actions"><button class="paper-open" @click.stop="selectedPaperId = item.id"><text>查看练习卷</text><AppIcon name="arrow-up-right" :size="15" tone="green" /></button><button class="paper-practice" @click.stop="startPractice(item)"><AppIcon name="play" :size="13" tone="green" /><text>开始练习</text></button></view></view></view></view>
    <view v-else class="papers-empty panel"><view class="empty-paper-icon"><AppIcon name="file-text" :size="37" tone="green" /></view><text>第一份练习卷，由你来出。</text><text class="muted">选择学科与题量，把薄弱点放在一起练。</text><button class="button button-primary" @click="openEditor()">创建练习卷</button></view>

    <view v-if="paper" class="paper-detail panel"><view class="detail-heading"><view><view class="detail-kicker"><text class="badge" :title="paper.subject">{{ paper.subject }}</text><text class="detail-date">{{ formatDate(paper.updatedAt) }} 更新</text></view><text class="detail-title">{{ paper.title }}</text><text class="detail-description">共 {{ paperQuestions.length }} 道可用题目，按照下方顺序练习与导出。</text></view><button class="button button-quiet edit-paper" @click="openEditor(paper)"><AppIcon name="pencil" :size="16" tone="green" /><text>调整题目</text></button></view><view v-if="unavailableCount" class="paper-warning"><AppIcon name="info" :size="15" tone="orange" /><text>{{ unavailableCount }} 道题已移入回收站，练习与导出时自动跳过；恢复题目后会重新显示。</text></view>
      <view class="paper-question-list"><view v-for="(question, index) in paperQuestions" :key="question.id" class="paper-question" @click="emit('open-question', question.id)"><text class="question-order">{{ String(index + 1).padStart(2, '0') }}</text><view class="paper-question-content"><text class="paper-question-title">{{ question.title }}</text><MathText inline :text="question.stem" class="paper-question-stem" /><view class="paper-question-tags"><text>{{ question.subject }}</text><text>{{ question.difficulty }}</text><text :class="{ 'question-mastered': question.status === 'mastered' }">{{ question.status === 'mastered' ? '已掌握' : '待巩固' }}</text></view></view><AppIcon name="chevron-right" :size="17" tone="muted" /></view></view>
      <view v-if="!paperQuestions.length" class="no-paper-questions"><text>这份卷子里的题目暂时不可用，可调整题目后再练习。</text></view>
      <view class="paper-export-section"><view class="export-description"><view class="export-title-row"><AppIcon name="download" :size="17" tone="green" /><text>导出 Word 练习卷</text></view><text>题目按当前顺序排版，可打印，也可编辑。</text></view><view class="export-options"><button class="export-format" :class="{ selected: !includeAnswers }" @click="includeAnswers = false">题目版</button><button class="export-format" :class="{ selected: includeAnswers }" @click="includeAnswers = true">含答案版</button></view></view><view v-if="includeAnswers && missingAnswers" class="answer-warning"><AppIcon name="info" :size="14" tone="orange" /><text>{{ missingAnswers }} 道题未填写答案，含答案版仅导出其余 {{ paperQuestions.length - missingAnswers }} 道。</text></view><view class="detail-footer"><text class="export-footnote">{{ includeAnswers ? '参考答案与解析将另页附在卷末。' : '题目版保留作答空白，适合独立练习。' }}</text><view class="detail-footer-actions"><button class="button button-quiet" :disabled="!!exportingId" @click="download(paper)"><AppIcon name="download" :size="16" tone="green" /><text>{{ exportingId === paper.id ? '正在导出…' : '下载 Word' }}</text></button><button class="button button-primary" @click="startPractice(paper)"><AppIcon name="play" :size="16" tone="white" /><text>在线练习</text></button></view></view></view>

    <view v-else-if="papers.length" class="select-paper-hint"><AppIcon name="arrow-up-right" :size="16" tone="muted" /><text>选择一份练习卷，查看题目或导出 Word。</text></view>

    <view class="paper-tip"><AppIcon name="sparkles" :size="18" tone="orange" /><view><text>少一点题，多一次理解。</text><text>从同一个薄弱点开始，做完后把还没想通的题继续留下。</text></view></view>

    <view v-if="editorOpen" class="modal-overlay paper-modal-overlay" @click="editorOpen = false"><view class="modal-window paper-builder" @click.stop><view class="modal-header builder-header"><view><text class="eyebrow">BUILD YOUR PRACTICE</text><text class="builder-title">{{ editingId ? '调整练习卷' : '创建专属练习卷' }}</text></view><button class="plain-icon" aria-label="关闭组卷" @click="editorOpen = false"><AppIcon name="x" :size="21" tone="muted" /></button></view>
      <scroll-view scroll-y class="modal-scroll builder-scroll"><view class="builder-content"><view class="builder-settings"><text class="builder-label">练习卷名称</text><input v-model="title" class="form-input builder-name-input" placeholder="例如：周末数学 · 方程专项巩固" :maxlength="60" /><text class="builder-label">选择学科</text><view class="builder-subjects"><button class="builder-chip" :class="{ selected: subject === '综合' }" @click="setSubject('综合')"><text>综合</text></button><button v-for="item in subjects" :key="item" class="builder-chip" :class="{ selected: subject === item }" :aria-label="item" :title="item" @click="setSubject(item)"><text>{{ item }}</text></button></view><view class="quantity-heading"><text class="builder-label">目标题数</text><text>最多 100 道</text></view><view class="quantity-row"><button v-for="count in [5, 10, 15, 20]" :key="count" class="quantity-choice" :class="{ selected: targetCount === count }" @click="targetText = String(count)">{{ count }} 道</button><view class="custom-quantity"><input v-model="targetText" type="number" :maxlength="3" /><text>道</text></view></view></view>
        <view class="builder-columns"><view class="candidate-section"><view class="candidate-heading"><text class="builder-label">从错题本选题</text><text>{{ candidates.length }} 道符合筛选</text></view><view class="candidate-search"><AppIcon name="search" :size="17" tone="muted" /><input v-model="query" placeholder="搜索题目或知识点" /></view><view class="candidate-filters"><button class="filter-chip" :class="{ active: statusFilter === 'all' }" @click="statusFilter = 'all'">全部</button><button class="filter-chip" :class="{ active: statusFilter === 'reinforce' }" @click="statusFilter = 'reinforce'">待巩固</button><button class="filter-chip" :class="{ active: statusFilter === 'mastered' }" @click="statusFilter = 'mastered'">已掌握</button><button class="favorite-filter" :class="{ active: favoritesOnly }" @click="favoritesOnly = !favoritesOnly"><AppIcon name="star" :size="13" :tone="favoritesOnly ? 'orange' : 'muted'" /><text>收藏</text></button></view><button class="fill-button" @click="fillSelection"><AppIcon name="plus" :size="15" tone="green" /><text>按当前筛选补齐至 {{ targetCount }} 道</text></button><view v-if="candidates.length" class="candidate-list"><view v-for="question in candidates" :key="question.id" class="candidate-question" :class="{ 'candidate-selected': selectedIds.includes(question.id) }" @click="toggleQuestion(question.id)"><view class="selection-square" :class="{ checked: selectedIds.includes(question.id) }"><AppIcon v-if="selectedIds.includes(question.id)" name="check" :size="13" tone="white" /></view><view class="candidate-question-body"><text class="candidate-question-title">{{ question.title }}</text><MathText inline :text="question.stem" class="candidate-question-stem" /><view class="candidate-meta"><text>{{ question.subject }}</text><text>{{ question.difficulty }}</text><text>{{ question.status === 'mastered' ? '已掌握' : '待巩固' }}</text></view></view></view></view><view v-else class="candidate-empty"><AppIcon name="search" :size="25" tone="muted" /><text>没有符合条件的题目</text><text>试试切换学科、掌握状态或搜索词。</text></view></view>
          <view class="selected-section"><view class="selected-heading"><view><text>已选题目</text><text class="selection-total">{{ selectedQuestions.length }} / {{ targetCount }}</text></view><button v-if="selectedQuestions.length" class="clear-selection" @click="selectedIds = []">清空</button></view><text class="selection-hint">{{ selectionHint }}</text><view v-if="selectedQuestions.length" class="selected-question-list"><view v-for="(question, index) in selectedQuestions" :key="question.id" class="selected-question"><view class="selected-question-main"><text class="selected-order">{{ index + 1 }}</text><text class="selected-title">{{ question.title }}</text><button class="plain-icon remove-selected" aria-label="移除题目" @click="toggleQuestion(question.id)"><AppIcon name="x" :size="15" tone="muted" /></button></view><view class="selected-question-bottom"><text>{{ question.subject }} · {{ question.difficulty }}</text><view class="order-buttons"><button class="order-button" :disabled="index === 0" aria-label="上移题目" @click="moveQuestion(index, -1)"><AppIcon name="arrow-up" :size="13" :tone="index === 0 ? 'muted' : 'green'" /></button><button class="order-button" :disabled="index === selectedQuestions.length - 1" aria-label="下移题目" @click="moveQuestion(index, 1)"><AppIcon name="arrow-down" :size="13" :tone="index === selectedQuestions.length - 1 ? 'muted' : 'green'" /></button></view></view></view></view><view v-else class="selection-empty"><view class="selection-empty-lines"><view /><view /><view /></view><text>从左侧选入题目</text><text>手机上可从上方选择</text></view><view class="selection-bottom-hint"><AppIcon name="info" :size="13" tone="muted" /><text>使用上下箭头调整顺序，保存后可在线练习或导出。</text></view></view></view>
      </view></scroll-view><view class="modal-footer builder-footer"><text :title="subject">已选 {{ selectedQuestions.length }} 道 · {{ subject }}练习卷</text><view><button class="button button-quiet" @click="editorOpen = false">取消</button><button class="button button-primary" :disabled="saving" @click="save"><AppIcon name="check" :size="17" tone="white" /><text>{{ saving ? '正在保存…' : '保存练习卷' }}</text></button></view></view></view></view>
  </view>
</template>

<style scoped>
.papers-view{color:#173e34}.papers-heading{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:30px}.papers-title{display:block;font-size:26px;font-weight:650;letter-spacing:-.6px;margin-top:8px}.papers-description{font-size:13px;display:block;margin-top:10px}.new-paper{display:flex;align-items:center;gap:7px;flex-shrink:0}.papers-summary{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:22px;padding:0 2px}.summary-left{display:flex;align-items:center;gap:12px}.summary-icon{width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:#eaf0e5;border-radius:12px}.summary-title{font-size:15px;font-weight:600;display:block}.summary-title>text{font-size:10px;font-weight:400;color:#91a186;margin-left:11px}.summary-caption{display:block;font-size:10px;color:#98a28f;margin-top:6px}.summary-available{font-size:11px;color:#84957b}.paper-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:19px}.paper-card{padding:9px;border:1px solid #e7e9e3;cursor:pointer}.paper-card-selected{border-color:#93b69a}.paper-cover{background:#eff3e9;border:1px solid #e8eddf;border-radius:12px;padding:15px 18px 13px;position:relative;overflow:hidden;min-height:128px;box-sizing:border-box}.paper-cover-top{display:flex;align-items:center;justify-content:space-between;font-size:8px;letter-spacing:1.4px;color:#91a184}.paper-cover-top>text:last-child{font-size:13px;letter-spacing:.5px;color:#6c8962}.paper-cover-symbol{margin-top:21px;position:relative;z-index:1}.paper-cover-lines{position:absolute;right:28px;top:48px;width:75px;transform:rotate(-8deg)}.paper-cover-lines>view{height:4px;background:#dde6d3;border-radius:3px;margin:12px 0}.paper-cover-lines>view:nth-child(2){width:85%}.paper-cover-lines>view:nth-child(3){width:63%}.paper-cover-subject{font-size:9px;color:#839574;display:block;margin-top:15px}.paper-card-body{padding:17px 13px 12px}.paper-title{font-size:15px;font-weight:600;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.6}.paper-card-meta{display:flex;align-items:center;gap:8px;font-size:10px;color:#96a18d;margin-top:9px}.meta-dot{width:3px;height:3px;border-radius:50%;background:#c1cbb7}.paper-card-actions{display:flex;align-items:center;justify-content:space-between;border-top:1px solid #eff1e9;padding-top:13px;margin-top:17px;gap:10px}.paper-open,.paper-practice{display:flex;align-items:center;justify-content:center;gap:5px;font-size:10px;background:transparent;padding:0;margin:0;line-height:20px;color:#52784c}.paper-practice{font-size:9px;border:1px solid #e2e9da;background:#f7f9f2;padding:3px 7px;border-radius:6px}.paper-open::after,.paper-practice::after,.plain-icon::after,.builder-chip::after,.quantity-choice::after,.filter-chip::after,.favorite-filter::after,.fill-button::after,.clear-selection::after,.order-button::after,.export-format::after{border:0}.paper-detail{margin-top:26px;padding:27px}.detail-heading{display:flex;justify-content:space-between;align-items:center;gap:15px}.detail-kicker{display:flex;align-items:center;gap:12px}.detail-date{font-size:10px;color:#9aa58f}.detail-title{display:block;font-size:21px;font-weight:600;line-height:1.5;margin-top:14px}.detail-description{display:block;color:#96a18e;font-size:11px;line-height:1.8;margin-top:6px}.edit-paper{display:flex;align-items:center;gap:7px;flex-shrink:0;font-size:11px}.paper-warning{margin-top:17px;padding:11px 13px;border:1px solid #f1e6d2;background:#fcf7ed;border-radius:9px;display:flex;align-items:flex-start;gap:8px;font-size:10px;line-height:1.8;color:#ab8c57}.paper-question-list{margin-top:23px;border-top:1px solid #edf0e7}.paper-question{display:flex;align-items:center;gap:17px;padding:19px 0;border-bottom:1px solid #edf0e7;cursor:pointer}.question-order{font-size:13px;color:#9eac91;align-self:flex-start;margin-top:2px;font-weight:600;min-width:21px}.paper-question-content{flex:1;min-width:0}.paper-question-title{font-size:13px;font-weight:600;display:block;line-height:1.6}.paper-question-stem{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:11px;color:#96a18c;line-height:1.8;margin-top:7px}.paper-question-tags{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.paper-question-tags>text{font-size:9px;padding:3px 6px;border-radius:4px;background:#f3f5ed;color:#8d9d7e}.paper-question-tags>text:last-child{background:#fcf2e3;color:#bc955c}.paper-question-tags>text.question-mastered{background:#edf5e8;color:#769964}.paper-export-section{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-top:25px}.export-title-row{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600}.export-description>text{display:block;font-size:10px;line-height:1.8;color:#99a38f;margin:7px 0 0 24px}.export-options{display:flex;background:#f2f5ec;border:1px solid #e8eddf;padding:4px;border-radius:9px}.export-format{padding:6px 12px;background:none;border-radius:6px;font-size:10px;line-height:18px;color:#98a38b;margin:0;white-space:nowrap}.export-format.selected{background:#fff;color:#39775a;box-shadow:0 1px 4px rgba(40,65,30,.05)}.answer-warning{display:flex;align-items:flex-start;gap:7px;font-size:10px;line-height:1.8;color:#b39360;padding-top:16px}.detail-footer{display:flex;align-items:center;justify-content:space-between;gap:15px;border-top:1px solid #edf0e7;margin-top:21px;padding-top:20px}.export-footnote{font-size:10px;line-height:1.8;color:#9ba58f}.detail-footer-actions{display:flex;gap:10px;flex-shrink:0}.detail-footer-actions .button{display:flex;align-items:center;justify-content:center;gap:7px;font-size:11px}.no-paper-questions{font-size:12px;color:#93a086;padding:25px 0;text-align:center}.select-paper-hint{display:flex;align-items:center;justify-content:center;gap:7px;font-size:11px;line-height:1.8;color:#99a58e;padding:25px 10px 0}.paper-tip{display:flex;align-items:flex-start;gap:10px;margin:25px 3px 0}.paper-tip>view>text:first-child{display:block;font-size:11px;font-weight:600}.paper-tip>view>text:last-child{display:block;font-size:10px;color:#99a38f;margin-top:6px;line-height:1.8}.papers-empty{padding:48px 25px;display:flex;align-items:center;flex-direction:column;gap:15px;text-align:center}.empty-paper-icon{width:75px;height:75px;border-radius:21px;background:#eff3e8;display:flex;align-items:center;justify-content:center;margin-bottom:5px}.papers-empty>text:first-of-type{font-size:18px;font-weight:600}.papers-empty .muted{font-size:12px;line-height:1.8}.papers-empty .button{margin-top:8px}.paper-builder{width:900px!important;max-width:100%;max-height:92vh;background:#fff;border-radius:21px;overflow:hidden;display:flex;flex-direction:column}.builder-header{padding:24px 28px!important;display:flex;align-items:center;justify-content:space-between}.builder-title{display:block;font-size:21px;font-weight:600;margin-top:7px}.plain-icon{background:transparent;margin:0;padding:5px;width:29px;height:29px;display:flex;align-items:center;justify-content:center}.builder-scroll{height:64vh;max-height:740px}.builder-content{padding:0 28px 25px}.builder-settings{padding-bottom:23px;border-bottom:1px solid #edf0e7}.builder-label{display:block;font-size:12px;font-weight:600;margin:17px 0 10px}.builder-name-input{height:43px!important;box-sizing:border-box;font-size:13px!important}.builder-subjects{display:flex;gap:7px;flex-wrap:wrap}.builder-chip{margin:0;border:1px solid #edf0e7;background:#f7f8f3;color:#8c9a80;line-height:20px;padding:5px 14px;font-size:11px;border-radius:7px}.builder-chip.selected{background:#eaf2e3;border-color:#d5e3c9;color:#39775a}.quantity-heading{display:flex;align-items:center;justify-content:space-between}.quantity-heading>text:last-child{font-size:9px;color:#9daa92;margin-top:7px}.quantity-row{display:flex;align-items:center;gap:8px}.quantity-choice{margin:0;line-height:20px;background:#f7f8f3;border:1px solid #e7ebdf;padding:7px 17px;font-size:11px;color:#8c9a80;border-radius:8px}.quantity-choice.selected{background:#eaf2e3;border-color:#d5e3c9;color:#39775a}.custom-quantity{display:flex;align-items:center;gap:7px;margin-left:4px;font-size:10px;color:#95a18a}.custom-quantity input{width:48px;height:34px;border:1px solid #e5ebdc;border-radius:8px;text-align:center;font-size:12px;background:#fff;color:#173e34}.builder-columns{display:grid;grid-template-columns:minmax(0,1fr) 265px;gap:23px;margin-top:7px}.candidate-heading{display:flex;align-items:center;justify-content:space-between;gap:10px}.candidate-heading>text:last-child{font-size:9px;color:#9daa92;margin-top:8px}.candidate-search{height:38px;display:flex;align-items:center;gap:8px;background:#f7f8f3;border:1px solid #e7ebdf;border-radius:9px;padding:0 11px}.candidate-search input{flex:1;min-width:0;font-size:11px;color:#173e34}.candidate-filters{display:flex;align-items:center;gap:5px;margin-top:10px}.filter-chip{padding:4px 8px;margin:0;line-height:20px;font-size:10px;border-radius:6px;color:#91a086;background:transparent}.filter-chip.active{background:#edf3e6;color:#39775a}.favorite-filter{display:flex;align-items:center;justify-content:center;gap:4px;margin:0 0 0 auto;padding:3px 6px;font-size:10px;background:transparent;line-height:20px;color:#94a08b}.favorite-filter.active{color:#b48c55}.fill-button{display:flex;align-items:center;justify-content:center;gap:5px;width:100%;background:#f0f5e9;border:1px dashed #d5e3c7;padding:7px 9px;font-size:10px;line-height:20px;color:#39775a;margin:12px 0 5px;border-radius:7px}.candidate-question{display:flex;align-items:flex-start;gap:10px;padding:14px 3px;border-bottom:1px solid #f0f2ea;cursor:pointer}.candidate-selected{background:#fcfdf9}.selection-square{margin-top:2px;width:18px;height:18px;box-sizing:border-box;border:1px solid #d8e1ce;border-radius:5px;background:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0}.selection-square.checked{background:#39775a;border-color:#39775a}.candidate-question-body{min-width:0;flex:1}.candidate-question-title{font-size:11px;font-weight:600;line-height:1.7;display:block}.candidate-question-stem{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:10px;color:#9ba58f;line-height:1.8;margin-top:5px}.candidate-meta{display:flex;gap:9px;font-size:9px;color:#94a286;margin-top:8px}.candidate-empty{display:flex;align-items:center;flex-direction:column;text-align:center;gap:12px;font-size:11px;color:#829474;padding:35px 10px}.candidate-empty>text:last-child{font-size:10px;color:#a0aa93;line-height:1.8}.selected-section{background:#f7f9f2;border:1px solid #e8edde;border-radius:12px;padding:17px;margin-top:17px;align-self:start;min-width:0}.selected-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}.selected-heading>view{display:flex;align-items:center;gap:9px;font-size:12px;font-weight:600}.selection-total{font-size:10px;color:#8ba176;font-weight:400}.clear-selection{background:none;font-size:9px;line-height:20px;color:#9ca78e;margin:0;padding:0}.selection-hint{display:block;font-size:9px;color:#a1ab94;line-height:1.8;margin-top:9px}.selected-question-list{margin-top:14px}.selected-question{border:1px solid #e7eddd;border-radius:8px;background:#fff;padding:10px;margin-top:9px}.selected-question-main{display:flex;align-items:flex-start;gap:7px}.selected-order{font-size:10px;color:#8ea578;margin-top:2px;min-width:12px}.selected-title{font-size:10px;line-height:1.8;color:#526d46;flex:1;min-width:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.remove-selected{width:21px;height:21px;padding:2px;flex-shrink:0}.selected-question-bottom{display:flex;align-items:center;justify-content:space-between;margin-top:9px;padding-left:19px;font-size:8px;color:#a0ac92}.order-buttons{display:flex;align-items:center;gap:5px}.order-button{width:22px;height:22px;display:flex;align-items:center;justify-content:center;border:1px solid #eaf0e1;background:#fafcf6;margin:0;padding:0;border-radius:5px}.order-button[disabled]{opacity:.4;background:#f4f6ef}.selection-empty{text-align:center;color:#a3ae97;padding:35px 10px;display:flex;align-items:center;flex-direction:column;gap:8px;font-size:10px}.selection-empty>text:last-child{font-size:9px;color:#b0b9a5}.selection-empty-lines{width:63px;margin:0 auto 12px;padding:12px 9px;background:#eef3e5;border-radius:8px}.selection-empty-lines>view{height:3px;background:#dce6cf;border-radius:3px;margin:7px 0}.selection-empty-lines>view:nth-child(2){width:80%}.selection-empty-lines>view:nth-child(3){width:60%}.selection-bottom-hint{display:flex;align-items:flex-start;gap:6px;font-size:9px;line-height:1.8;color:#a0ac92;border-top:1px solid #e4eadb;margin-top:18px;padding-top:13px}.builder-footer{padding:17px 28px!important;display:flex;align-items:center;justify-content:space-between;gap:15px}.builder-footer>text{font-size:10px;color:#98a78a}.builder-footer>view{display:flex;align-items:center;gap:10px}.builder-footer .button{display:flex;align-items:center;gap:6px;justify-content:center;font-size:11px;margin:0}
@media(max-width:1050px){.paper-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.paper-builder{width:800px!important}.builder-columns{grid-template-columns:minmax(0,1fr) 245px;gap:18px}.detail-footer{align-items:flex-end}.export-footnote{max-width:220px}}
@media(max-width:650px){.papers-heading{align-items:flex-start;gap:11px;margin-bottom:25px}.papers-title{font-size:22px;line-height:1.5;max-width:220px}.papers-description{font-size:11px;line-height:1.8;max-width:215px;margin-top:5px}.new-paper{font-size:10px;gap:4px;padding:9px 10px;margin-top:28px}.papers-summary{margin-bottom:17px;gap:10px}.summary-icon{width:38px;height:38px;border-radius:10px}.summary-left{gap:10px}.summary-title{font-size:13px}.summary-caption{font-size:9px}.summary-available{font-size:9px}.paper-grid{gap:12px}.paper-cover{padding:11px 12px;min-height:114px}.paper-cover-top{font-size:6px;letter-spacing:.8px}.paper-cover-top>text:last-child{font-size:11px}.paper-cover-symbol{margin-top:17px}.paper-cover-lines{right:15px;top:44px;width:39px}.paper-cover-lines>view{height:3px;margin:9px 0}.paper-cover-subject{font-size:8px;margin-top:12px}.paper-card{padding:6px;border-radius:13px}.paper-card-body{padding:13px 7px 8px}.paper-title{font-size:12px}.paper-card-meta{font-size:8px;gap:6px}.paper-card-actions{gap:7px;flex-wrap:wrap;margin-top:13px;padding-top:10px}.paper-open{font-size:9px}.paper-practice{font-size:8px;padding:2px 5px}.paper-detail{padding:20px;margin-top:20px}.detail-heading{align-items:flex-start;gap:10px}.detail-title{font-size:18px;margin-top:12px}.detail-date{font-size:8px}.detail-description{font-size:10px}.edit-paper{font-size:9px;padding:8px;gap:4px;margin-top:3px}.paper-question{gap:11px;padding:17px 0}.question-order{font-size:11px;min-width:17px}.paper-question-title{font-size:12px}.paper-question-stem{font-size:10px}.paper-export-section{align-items:flex-start;flex-direction:column;gap:14px;margin-top:20px}.export-description>text{font-size:9px}.export-options{align-self:stretch}.export-format{flex:1;text-align:center}.detail-footer{align-items:flex-start;flex-direction:column;gap:15px;margin-top:16px;padding-top:16px}.export-footnote{font-size:9px;max-width:none}.detail-footer-actions{width:100%;gap:8px}.detail-footer-actions .button{flex:1;font-size:10px;gap:5px;padding:10px}.paper-tip{margin-top:21px}.paper-tip>view>text:last-child{font-size:9px}.papers-empty{padding:38px 20px}.papers-empty>text:first-of-type{font-size:16px}.papers-empty .muted{font-size:11px}.builder-header{padding:20px!important}.builder-title{font-size:19px}.builder-content{padding:0 20px 20px}.builder-columns{grid-template-columns:minmax(0,1fr);gap:0}.builder-settings{padding-bottom:20px}.builder-chip{padding:5px 11px;font-size:10px}.quantity-row{gap:5px}.quantity-choice{padding:6px 11px;font-size:10px}.custom-quantity{gap:5px;margin-left:1px;font-size:9px}.custom-quantity input{width:40px;height:31px;font-size:11px}.builder-label{font-size:11px}.builder-name-input{font-size:12px!important}.builder-scroll{height:65vh}.selected-section{padding:15px;margin-top:22px}.selected-question-list{display:grid;grid-template-columns:minmax(0,1fr);gap:0}.selection-empty{padding:20px 10px}.selection-empty>text:first-of-type{display:none}.builder-footer{padding:15px 20px!important;gap:10px}.builder-footer>text{font-size:8px;max-width:85px;line-height:1.8}.builder-footer>view{gap:7px}.builder-footer .button{font-size:10px;padding:9px 12px}.candidate-filters{gap:3px}.filter-chip{padding:4px 7px}.paper-warning{font-size:9px}.answer-warning{font-size:9px}}
@media(max-width:380px){.paper-grid{grid-template-columns:minmax(0,1fr)}.paper-cover{min-height:112px}.paper-cover-lines{right:35px;width:82px}.paper-card-actions{flex-wrap:nowrap}.summary-available{font-size:8px}.new-paper{font-size:9px;padding:8px}.papers-title{font-size:21px}.quantity-choice{padding:6px 9px}.builder-content{padding:0 17px 17px}.builder-header{padding:18px!important}}
.builder-subjects{display:grid;grid-template-columns:repeat(6,minmax(0,1fr))}.builder-chip{min-width:0;max-width:100%;display:flex;align-items:center;justify-content:center;white-space:nowrap}.builder-chip>text{display:block;max-width:100%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.paper-cover-subject{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.detail-heading>view{min-width:0;flex:1}.detail-kicker{min-width:0}.detail-kicker .badge{min-width:0;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.detail-date{flex-shrink:0}.paper-question-tags>text:first-child{min-width:0;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.candidate-meta{min-width:0}.candidate-meta>text{flex-shrink:0}.candidate-meta>text:first-child{min-width:0;max-width:50%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:1}.selected-question-bottom>text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.order-buttons{flex-shrink:0}.builder-footer>text{min-width:0;max-width:36%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.builder-footer>view{flex-shrink:0}@media(max-width:650px){.builder-subjects{grid-template-columns:repeat(3,minmax(0,1fr))}.detail-kicker{flex-wrap:wrap;gap:7px}.detail-kicker .badge{max-width:160px}.builder-footer>text{max-width:85px}}
.paper-builder{height:calc(100vh - 70px);max-height:900px}.builder-header,.builder-footer{flex-shrink:0}.builder-scroll{height:0;min-height:0;max-height:none;flex:1;position:relative;overflow:hidden}
/* #ifdef H5 */
.builder-scroll > :deep(.uni-scroll-view){position:absolute;inset:0;height:100%!important;max-height:100%!important}
/* #endif */
@media(max-width:650px){.paper-builder{height:calc(100vh - 38px);max-height:calc(100vh - 38px)}}
</style>
