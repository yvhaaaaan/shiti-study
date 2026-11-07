<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import MathText from './MathText.vue'
import AnimatedForgeScene from './AnimatedForgeScene.vue'
import StarMeter from './StarMeter.vue'
import { useStudyStore } from '../domain/store'
import { forgeProgress } from '../domain/forge'

const emit = defineEmits<{ practice: [ids: string[], title: string]; open: [id: string]; edit: [id: string]; library: []; pending: [] }>()
const store = useStudyStore()
const mode = ref<'due' | 'custom'>('due')
const subject = ref('')
const stageFilter = ref<'all' | 'new' | 'progress' | 'complete'>('all')
const search = ref('')
const selected = ref<string[]>([])
const visibleLimit = ref(24)
const savingPlan = ref('')
const error = ref('')
const filtersOpen = ref(false)
const hammerTrigger = ref(0)
const batchLimit = 10
const today = computed(() => store.studyDay.value)
const missingAnswers = computed(() => store.readyQuestions.value.filter(q => !q.answer.trim()))
const subjects = computed(() => [...new Set(store.practiceQuestions.value.map(q => q.subject))].sort((a, b) => a.localeCompare(b, 'zh-CN')))
const source = computed(() => (mode.value === 'due' ? store.dueQuestions.value : store.practiceQuestions.value).slice().sort((a, b) => {
  if (mode.value === 'due') return (a.nextReviewDate || '').localeCompare(b.nextReviewDate || '') || a.createdAt.localeCompare(b.createdAt)
  return b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)
}))
const rows = computed(() => source.value.map(q => ({ q, completed: forgeProgress(q.id, store.state.reviews).completed })).filter(({ q, completed }) => {
  if (subject.value && q.subject !== subject.value) return false
  if (stageFilter.value === 'new' && completed !== 0 || stageFilter.value === 'progress' && (completed === 0 || completed === 5) || stageFilter.value === 'complete' && completed !== 5) return false
  const words = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const text = [q.title, q.stem, q.subject, ...q.tags].join(' ').toLocaleLowerCase()
  return words.every(word => text.includes(word))
}))
const shown = computed(() => rows.value.slice(0, visibleLimit.value))
const selectedEligible = computed(() => selected.value.filter(id => source.value.some(q => q.id === id)))
const selectedHidden = computed(() => selectedEligible.value.filter(id => !rows.value.some(row => row.q.id === id)).length)
const hasFilters = computed(() => !!subject.value || stageFilter.value !== 'all' || !!search.value.trim())
const stageOptions = [{ id: 'all', label: '全部进度' }, { id: 'new', label: '新铁料' }, { id: 'progress', label: '锻造中' }, { id: 'complete', label: '已成锋' }] as const
watch(mode, () => { selected.value = []; clearFilters(); error.value = '' })
watch([subject, stageFilter, search], () => { visibleLimit.value = 24 })
watch(() => store.practiceQuestions.value.map(q => q.id), ids => { selected.value = selected.value.filter(id => ids.includes(id)) })
watch(subjects, values => { if (subject.value && !values.includes(subject.value)) subject.value = '' })
function clearFilters() { subject.value = ''; stageFilter.value = 'all'; search.value = '' }
function toggle(id: string) {
  error.value = ''
  if (selected.value.includes(id)) selected.value = selected.value.filter(value => value !== id)
  else if (selectedEligible.value.length >= batchLimit) error.value = `每轮最多选 ${batchLimit} 道题，完成后可以继续下一轮。`
  else { selected.value = [...selected.value, id]; hammerTrigger.value++ }
}
function chooseBatch() {
  selected.value = rows.value.slice(0, batchLimit).map(row => row.q.id)
  error.value = ''
  if (selected.value.length) hammerTrigger.value++
}
function clearSelected() { selected.value = []; error.value = '' }
function onSelectionKey(event: KeyboardEvent, id: string) {
  if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return
  event.preventDefault(); toggle(id)
}
function start() {
  store.refreshDay()
  const ids = selectedEligible.value.slice(0, batchLimit)
  if (!ids.length) return
  emit('practice', ids, mode.value === 'due' ? '今日到期测试' : subject.value ? `${subject.value} · 自主测试` : '自主选题测试')
}
async function schedule(id: string, date?: string) {
  if (savingPlan.value) return
  savingPlan.value = id; error.value = ''
  try { store.setPlan(id, date); await store.flushPersistence(); uni.showToast({ title: date ? '提醒日期已保存' : '提醒已取消', icon: 'none' }) }
  catch (e) { error.value = e instanceof Error ? e.message : '提醒未保存，请重试。' }
  finally { savingPlan.value = '' }
}
</script>

<template>
  <view class="practice-hub">
    <view class="pd-heading"><view><text class="pd-title">锻刀练习</text><text class="pd-subtitle">一题一刃，每一锤都算数。</text></view><text class="pd-date">{{ today }}</text></view>

    <view class="pd-desk">
      <view class="pd-animation"><AnimatedForgeScene kind="hammer" :trigger="hammerTrigger" :working="selectedEligible.length > 0" /></view>
      <view class="pd-desk-controls">
        <text class="pd-desk-label">我的锻刀台</text>
        <view class="pd-desk-count"><text>{{ selectedEligible.length }}</text><text> / {{ batchLimit }} 道</text></view>
        <text class="pd-desk-status" aria-live="polite">{{ selectedEligible.length ? '铁料已就位，可以落锤了' : '从下方挑选题目上砧' }}</text>
        <view class="pd-material-slots" aria-hidden="true"><view v-for="slot in batchLimit" :key="slot" :class="{ filled: selectedEligible.length >= slot }" /></view>
        <button class="pd-start" :disabled="!selectedEligible.length" @tap="start"><AppIcon name="hammer" :size="17" tone="white" /><text>{{ selectedEligible.length ? '开始锻造' : '等待上砧' }}</text></button>
        <button v-if="rows.length" class="pd-auto-select" @tap="chooseBatch">装入前 {{ Math.min(batchLimit, rows.length) }} 道<AppIcon name="arrow-right" :size="13" tone="orange" /></button>
      </view>
    </view>

    <view v-if="store.pendingQuestions.value.length || missingAnswers.length" class="pd-preparation">
      <view class="pd-preparation-title"><AppIcon name="folder-open" :size="17" tone="orange" /><text>待备好的铁料</text></view>
      <view class="pd-preparation-actions"><button v-if="store.pendingQuestions.value.length" @tap="emit('pending')">整理 {{ store.pendingQuestions.value.length }} 道<AppIcon name="arrow-up-right" :size="13" tone="orange" /></button><button v-if="missingAnswers.length" @tap="emit('edit', missingAnswers[0]!.id)">补答案 {{ missingAnswers.length }} 道<AppIcon name="arrow-up-right" :size="13" tone="orange" /></button></view>
    </view>

    <view class="pd-modes"><button :class="{ active: mode === 'due' }" :aria-pressed="mode === 'due'" @tap="mode = 'due'"><text>今日回炉</text><text class="pd-mode-count">{{ store.dueQuestions.value.length }}</text></button><button :class="{ active: mode === 'custom' }" :aria-pressed="mode === 'custom'" @tap="mode = 'custom'"><text>自由锻造</text><text class="pd-mode-count">{{ store.practiceQuestions.value.length }}</text></button></view>
    <view v-if="source.length" class="pd-filter-panel">
      <view class="pd-search-row"><view class="pd-search"><AppIcon name="search" :size="16" tone="muted" /><input v-model="search" placeholder="搜索题目、知识点" aria-label="搜索练习题目" /><button v-if="search" class="pd-clear-search" aria-label="清空搜索" @tap="search = ''"><AppIcon name="x" :size="15" tone="muted" /></button></view><button class="pd-filter-toggle" :class="{ filtered: hasFilters, expanded: filtersOpen }" :aria-expanded="filtersOpen" aria-controls="practice-advanced-filters" @tap="filtersOpen = !filtersOpen"><AppIcon name="sliders-horizontal" :size="15" tone="orange" /><text>筛选</text></button></view>
      <view v-if="filtersOpen" id="practice-advanced-filters" class="pd-advanced-filters">
        <view class="pd-subjects"><button :class="{ active: !subject }" :aria-pressed="!subject" @tap="subject = ''">全部科目</button><button v-for="name in subjects" :key="name" :class="{ active: subject === name }" :aria-pressed="subject === name" @tap="subject = name">{{ name }}</button></view>
        <view class="pd-stages"><button v-for="option in stageOptions" :key="option.id" :class="{ active: stageFilter === option.id }" :aria-pressed="stageFilter === option.id" @tap="stageFilter = option.id">{{ option.label }}</button></view>
      </view>
      <view v-if="hasFilters" class="pd-applied-filters"><text>{{ subject || '全部科目' }} · {{ stageOptions.find(option => option.id === stageFilter)?.label }}</text><button @tap="clearFilters">清空筛选</button></view>
    </view>
    <view v-if="source.length" class="pd-selection-bar"><view><text>可锻造 {{ rows.length }} 道</text><text>已上砧 {{ selectedEligible.length }}/{{ batchLimit }}</text></view><button v-if="selected.length" @tap="clearSelected">全部取下</button><text v-else class="pd-selection-tip">点选题目上砧</text></view>
    <text v-if="selectedHidden" class="pd-selection-note">另有 {{ selectedHidden }} 道已选题目不在当前筛选中，仍会加入本轮。</text>
    <text v-if="error" class="pd-error" role="alert">{{ error }}</text>

    <view v-if="rows.length" class="pd-question-list">
      <view v-for="row in shown" :key="row.q.id" class="pd-question" :class="{ selected: selected.includes(row.q.id) }" role="checkbox" :aria-checked="selected.includes(row.q.id)" :aria-label="`选择测试题：${row.q.title}`" tabindex="0" @tap="toggle(row.q.id)" @keydown="onSelectionKey($event, row.q.id)">
        <view class="pd-question-main">
          <view class="pd-checkbox" aria-hidden="true"><AppIcon v-if="selected.includes(row.q.id)" name="check" :size="13" tone="white" /></view>
          <view class="pd-question-copy">
            <view class="pd-question-meta"><text class="pd-subject">{{ row.q.subject }}</text><text>{{ row.completed === 5 ? '已成锋' : row.completed ? '锻造中' : '新铁料' }} · {{ row.completed }}/5</text><text v-if="row.q.nextReviewDate && row.q.nextReviewDate <= today" class="pd-due">{{ row.q.nextReviewDate < today ? '待回炉' : '今日回炉' }}</text></view>
            <button class="pd-question-title" @tap.stop="emit('open', row.q.id)">{{ row.q.title }}</button>
            <MathText inline :text="row.q.stem || (row.q.images.length ? `包含 ${row.q.images.length} 张题图，可打开题目查看` : '题干待补充')" class="pd-question-stem" />
             <view class="pd-star-row"><StarMeter :value="row.q.importance" label="重要" tone="gold" compact /><StarMeter :value="row.completed" label="熟练度" tone="green" compact /></view><view class="pd-progress" :aria-label="`累计答对 ${row.completed} 次，共五阶`"><view v-for="step in 5" :key="step" :class="{ done: row.completed >= step }" /></view>
          </view>
        </view>
        <view class="pd-question-footer" @tap.stop><button class="pd-open" @tap="emit('open', row.q.id)">查看题目<AppIcon name="arrow-up-right" :size="12" tone="orange" /></button><view class="pd-plan"><text>{{ savingPlan === row.q.id ? '正在保存…' : row.q.nextReviewDate || '未设提醒' }}</text><picker mode="date" :value="row.q.nextReviewDate || today" @change="schedule(row.q.id, $event.detail.value)"><view class="pd-plan-button">{{ row.q.nextReviewDate ? '改期' : '设提醒' }}</view></picker><button v-if="row.q.nextReviewDate" :disabled="!!savingPlan" @tap="schedule(row.q.id)">取消</button></view></view>
      </view>
    </view>
    <view v-else class="pd-empty"><AppIcon :name="mode === 'due' && !hasFilters ? 'check-check' : 'hammer'" :size="32" tone="orange" /><text class="pd-empty-title">{{ hasFilters ? '没有找到这块铁料' : mode === 'due' ? '今天的回炉已安排妥当' : '砧台还在等第一块铁料' }}</text><text>{{ hasFilters ? '换个筛选试试，已选题目会保留。' : mode === 'due' ? '还想再锻一轮？随时可以自由选题。' : '先收录错题并补好答案，再来锻造。' }}</text><button v-if="hasFilters" class="pd-empty-action" @tap="clearFilters">清空筛选</button><button v-else-if="mode === 'due' && store.practiceQuestions.value.length" class="pd-empty-action" @tap="mode = 'custom'">去自由锻造<AppIcon name="arrow-right" :size="15" tone="orange" /></button><button v-else class="pd-empty-action" @tap="emit('library')">去错题本准备题目<AppIcon name="arrow-right" :size="15" tone="orange" /></button></view>
    <button v-if="rows.length > shown.length" class="pd-load-more" @tap="visibleLimit += 24">继续显示 · 还有 {{ rows.length - shown.length }} 道</button>
    <text class="pd-footnote">每次答对推进一阶，累计五次通过完成锻造；答错保留已有进度。</text>
  </view>
</template>

<style scoped>
.practice-hub{max-width:1040px;margin:0 auto;color:#49382e;--pd-copper:#a75b37;--pd-line:#e8dcd0;--pd-muted:#8f7b6b;--pd-cream:#fffaf1}
.pd-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:2px 0 20px}.pd-title{display:block;font-size:27px;line-height:1.4;font-weight:700;letter-spacing:-.6px;color:#3d2b22}.pd-subtitle{display:block;margin-top:5px;font-size:13px;color:var(--pd-muted);line-height:1.7}.pd-date{font-size:12px;color:var(--pd-muted);white-space:nowrap}
.pd-desk{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);align-items:center;gap:28px;min-height:246px;padding:20px 36px 20px 22px;border:1px solid #5a3b2c;border-radius:22px;background:radial-gradient(ellipse at 21% 69%,#a75b372b,transparent 55%),#30251f;box-shadow:inset 0 1px #ffffff0c;overflow:hidden}.pd-animation{min-width:0;height:230px;overflow:hidden}.pd-animation :deep(.animated-forge-scene){height:100%}.pd-desk-controls{position:relative;min-width:0;max-width:300px;padding:8px 0}.pd-desk-label{display:block;font-size:13px;font-weight:550;color:#e4c8ad;letter-spacing:1px}.pd-desk-count{display:flex;align-items:baseline;gap:4px;margin-top:8px;line-height:1.2}.pd-desk-count>text:first-child{font-size:42px;font-weight:650;color:#fff4e4;font-variant-numeric:tabular-nums}.pd-desk-count>text:last-child{font-size:13px;color:#c7ab95}.pd-desk-status{display:block;font-size:12px;color:#d6bba4;margin-top:8px;line-height:1.6}.pd-material-slots{display:flex;gap:5px;margin:13px 0 17px;max-width:230px}.pd-material-slots>view{height:5px;flex:1;background:#ffffff17;border-radius:3px;transition:background .2s,box-shadow .2s}.pd-material-slots>view.filled{background:#edaa64;box-shadow:0 0 7px #edaa6455}.pd-start{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;min-height:46px;padding:11px 12px;margin:0;border-radius:11px;background:linear-gradient(180deg,#c17a4b,#aa5f38);box-shadow:inset 0 1px #ffffff24,0 4px 0 #743f28;color:#fff9ed;font-size:15px;font-weight:600;line-height:1.5;transition:transform .15s,filter .15s}.pd-start::after{border:0}.pd-start:not([disabled]):active{transform:translateY(2px);box-shadow:inset 0 1px #ffffff24,0 2px 0 #743f28}.pd-start[disabled]{background:#ffffff12;color:#bca995;box-shadow:inset 0 0 0 1px #ffffff13}.pd-start[disabled] :deep(.app-icon){opacity:.55}.pd-auto-select{display:flex;align-items:center;justify-content:center;gap:6px;margin:10px 0 0;width:100%;padding:5px 0;background:transparent;color:#d2ab89;font-size:12px;line-height:1.5}.pd-auto-select::after{border:0}
.pd-preparation{display:flex;justify-content:space-between;align-items:center;gap:14px;margin:14px 0 18px;padding:12px 14px;border:1px solid var(--pd-line);border-radius:11px;background:#f7f0e5}.pd-preparation-title{display:flex;align-items:center;gap:7px;flex-shrink:0;font-size:12px;color:#88664b}.pd-preparation-actions{display:flex;gap:14px;flex-wrap:wrap}.pd-preparation-actions>button{display:flex;align-items:center;gap:3px;margin:0;padding:0;background:transparent;font-size:12px;line-height:1.8;color:#965d3a}.pd-preparation-actions>button::after{border:0}
.pd-modes{display:flex;gap:6px;margin:22px 0 15px;padding:5px;background:#efe8df;border-radius:12px;width:fit-content;max-width:100%}.pd-modes>button{display:flex;align-items:center;justify-content:center;gap:8px;margin:0;min-height:38px;padding:8px 18px;font-size:13px;line-height:1.5;background:transparent;color:#8a7563;border-radius:8px}.pd-modes>button::after{border:0}.pd-modes>button.active{background:#fffbf5;color:#8c4c2d;font-weight:600;box-shadow:0 2px 5px #60402d0a}.pd-mode-count{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;font-size:11px;font-weight:500;color:#96775f;background:#eadbcb;border-radius:5px;padding:0 3px}
.pd-filter-panel{margin-bottom:12px}.pd-search-row{display:flex;align-items:stretch;gap:8px}.pd-search{display:flex;align-items:center;flex:1;min-width:0;gap:8px;padding:0 11px;border:1px solid var(--pd-line);border-radius:10px;background:#fffcf8;min-height:43px}.pd-search>input{flex:1;width:0;min-width:0;height:41px;color:#68513f;font-size:13px}.pd-clear-search{display:flex;align-items:center;justify-content:center;margin:0;padding:4px;background:transparent;min-width:24px}.pd-clear-search::after{border:0}.pd-filter-toggle{display:flex;align-items:center;justify-content:center;gap:6px;min-height:43px;margin:0;padding:9px 12px;border:1px solid var(--pd-line);border-radius:10px;background:#fffcf8;color:#846950;font-size:12px;line-height:1.5}.pd-filter-toggle::after{border:0}.pd-filter-toggle.filtered,.pd-filter-toggle.expanded{border-color:#d8b697;background:#f2e5d5;color:#8e4c2a}.pd-advanced-filters{padding:14px 12px 12px;margin-top:8px;border:1px solid var(--pd-line);border-radius:11px;background:#fffcf8}.pd-subjects,.pd-stages{display:flex;gap:6px;flex-wrap:wrap}.pd-subjects>button,.pd-stages>button{margin:0;padding:7px 10px;border:1px solid transparent;border-radius:7px;background:transparent;font-size:12px;color:#8d7562;line-height:1.5}.pd-subjects>button::after,.pd-stages>button::after{border:0}.pd-subjects>button.active,.pd-stages>button.active{background:#eedbc6;border-color:#dec0a0;color:#8a4c2c}.pd-stages{border-top:1px solid #efe3d5;padding-top:10px;margin-top:10px}.pd-stages>button{font-size:11px}.pd-applied-filters{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:11px;color:#9c785b;padding:9px 2px 0}.pd-applied-filters>button{margin:0;padding:3px 0;background:transparent;font-size:11px;color:#a05c35;line-height:1.5}.pd-applied-filters>button::after{border:0}
.pd-selection-bar{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:17px 0 12px;font-size:12px;line-height:1.7;color:#8d7766}.pd-selection-bar>view{display:flex;gap:12px;flex-wrap:wrap}.pd-selection-bar>view>text:last-child{color:#a35f39}.pd-selection-bar>button{margin:0;padding:4px 0;background:transparent;font-size:12px;line-height:1.5;color:#a35f39}.pd-selection-bar>button::after{border:0}.pd-selection-tip{font-size:11px;color:#a08c7b}.pd-selection-note{display:block;font-size:11px;line-height:1.8;color:#a28564;margin-bottom:12px}.pd-error{display:block;padding:11px 13px;margin-bottom:13px;border:1px solid #e8c5a6;border-radius:10px;background:#fff0dd;color:#a15b30;font-size:12px;line-height:1.8}
.pd-question-list{display:grid;gap:12px}.pd-question{padding:18px 19px 12px;background:#fffdfa;border:1px solid #e6dacd;border-radius:13px;min-width:0;cursor:pointer;transition:background .18s,border-color .18s,box-shadow .18s}.pd-question.selected{border-color:#c58a5e;background:#fff9ee;box-shadow:inset 3px 0 #b66d40}.pd-question:focus-visible{outline:2px solid #b66d40;outline-offset:3px}.pd-question-main{display:flex;gap:12px;min-width:0}.pd-checkbox{display:flex;align-items:center;justify-content:center;width:19px;height:19px;flex-shrink:0;margin-top:2px;border:1px solid #d8c3ad;border-radius:6px;background:#fffcf7;box-sizing:border-box}.selected .pd-checkbox{border-color:#ac623b;background:#ac623b}.pd-question-copy{flex:1;min-width:0}.pd-question-meta{display:flex;align-items:center;flex-wrap:wrap;gap:9px;font-size:11px;line-height:1.7;color:#9c836e}.pd-subject{padding:2px 7px;border-radius:5px;background:#f3e9dc;color:#956743}.pd-due{color:#b66c3a}.pd-question-title{display:block;margin:8px 0 6px;padding:0;width:100%;text-align:left;white-space:normal;border-radius:0;background:transparent;color:#57402f;font-size:16px;font-weight:600;line-height:1.7}.pd-question-title::after{border:0}.pd-question-stem{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;max-height:50px;overflow:hidden;word-break:break-word;font-size:13px;line-height:1.9;color:#96806f}.pd-progress{display:flex;gap:4px;width:112px;max-width:100%;margin-top:12px}.pd-progress>view{height:3px;flex:1;border-radius:2px;background:#eee2d5}.pd-progress>view.done{background:#bc8155}.pd-question-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:14px;padding-top:10px;border-top:1px solid #f0e7dd}.pd-open{display:flex;align-items:center;gap:4px;margin:0;padding:4px 0;background:transparent;font-size:11px;line-height:1.6;color:#a46d45;flex-shrink:0}.pd-open::after{border:0}.pd-plan{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:10px;font-size:11px;line-height:1.6;color:#a4907e}.pd-plan-button,.pd-plan>button{padding:4px 0;margin:0;background:transparent;font-size:11px;line-height:1.6;color:#a26b43}.pd-plan>button{color:#ad9a87}.pd-plan>button::after{border:0}
.pd-empty{display:flex;align-items:center;flex-direction:column;text-align:center;gap:12px;padding:32px 18px;border:1px dashed #ddc6af;border-radius:14px;background:#fffcf6;color:#9b826b;font-size:12px;line-height:1.8}.pd-empty-title{display:block;color:#79583f;font-size:16px;font-weight:600}.pd-empty-action{display:flex;align-items:center;gap:6px;margin:4px 0 0;padding:9px 13px;border:1px solid #e4c9ab;border-radius:8px;background:#f6e7d3;color:#9a5c32;font-size:12px;line-height:1.5}.pd-empty-action::after{border:0}.pd-load-more{display:block;margin:17px auto 0;padding:10px 15px;background:transparent;color:#9e7c60;font-size:12px;line-height:1.8}.pd-load-more::after{border:0}.pd-footnote{display:block;text-align:center;font-size:11px;line-height:1.8;color:#ac9682;margin-top:20px}
@media(max-width:600px){.pd-heading{margin:0 0 15px}.pd-title{font-size:24px}.pd-subtitle{font-size:12px}.pd-date{display:none}.pd-desk{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;min-height:202px;padding:12px 15px 12px 8px;border-radius:17px}.pd-animation{height:180px;align-self:center}.pd-desk-controls{padding:3px 0}.pd-desk-label{font-size:12px;letter-spacing:.5px}.pd-desk-count{margin-top:6px}.pd-desk-count>text:first-child{font-size:32px}.pd-desk-count>text:last-child{font-size:12px}.pd-desk-status{font-size:11px;margin-top:6px;line-height:1.6}.pd-material-slots{gap:3px;margin:10px 0 13px}.pd-material-slots>view{height:4px}.pd-start{font-size:13px;min-height:41px;padding:10px 7px;gap:6px;border-radius:9px}.pd-auto-select{font-size:11px;margin-top:8px;padding:4px 0;gap:4px}.pd-preparation{align-items:flex-start;padding:10px 11px;gap:9px;margin:12px 0 15px}.pd-preparation-title{font-size:11px;gap:5px}.pd-preparation-actions{justify-content:flex-end;gap:5px 10px}.pd-preparation-actions>button{font-size:11px;white-space:nowrap}.pd-modes{width:100%;box-sizing:border-box;margin:17px 0 12px}.pd-modes>button{flex:1;font-size:12px;padding:8px 9px;gap:6px;min-height:35px}.pd-mode-count{font-size:11px}.pd-search>input{font-size:12px}.pd-filter-toggle{font-size:11px;padding:9px 10px;gap:5px}.pd-subjects>button{font-size:11px}.pd-selection-bar{font-size:11px;margin-top:14px}.pd-selection-bar>view{gap:9px}.pd-selection-bar>button{font-size:11px}.pd-selection-tip{font-size:11px}.pd-question{padding:14px 12px 10px;border-radius:11px}.pd-question-main{gap:9px}.pd-checkbox{width:18px;height:18px;border-radius:5px}.pd-question-meta{font-size:11px;gap:6px}.pd-subject{padding:1px 5px}.pd-question-title{font-size:14px;margin:7px 0 5px}.pd-question-stem{font-size:12px;max-height:46px}.pd-question-footer{gap:7px;margin-top:12px;padding-top:8px}.pd-plan{font-size:11px;gap:7px}.pd-open,.pd-plan-button,.pd-plan>button{font-size:11px}.pd-progress{margin-top:10px}.pd-empty{padding:26px 15px;font-size:12px}.pd-empty-title{font-size:15px}.pd-footnote{font-size:11px;text-align:left;margin-top:17px}}
@media(max-width:360px){.pd-desk{gap:7px;padding-right:11px;padding-left:5px;min-height:193px}.pd-animation{height:173px}.pd-desk-status{font-size:11px}.pd-start{font-size:12px}.pd-preparation-title{flex-shrink:1;line-height:1.7}.pd-preparation-actions{gap:4px}.pd-question-footer{align-items:flex-start}.pd-plan{gap:5px}.pd-question-meta{gap:5px}}
@media(prefers-reduced-motion:reduce){.pd-question,.pd-start,.pd-material-slots>view{transition:none}}
</style>

<style scoped>
.pd-star-row{display:flex;align-items:center;gap:13px;flex-wrap:wrap;margin-top:10px}
</style>
