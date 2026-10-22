<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from '../../components/AppIcon.vue'
import StudyAccess from '../../components/StudyAccess.vue'
import { logout, changePassword, reauthenticate } from '../../services/studyStorage'
import QuestionCard from '../../components/QuestionCard.vue'
import QuestionEditor from '../../components/QuestionEditor.vue'
import QuickCapture from '../../components/QuickCapture.vue'
import QuestionDetail from '../../components/QuestionDetail.vue'
import ReviewSession from '../../components/ReviewSession.vue'
import KnowledgeView from '../../components/KnowledgeView.vue'
import InsightsView from '../../components/InsightsView.vue'
import PapersView from '../../components/PapersView.vue'
import DataManager from '../../components/DataManager.vue'
import { useStudyStore } from '../../domain/store'
import { normalizeTags } from '../../domain/taxonomy'
import type { Question, Subject } from '../../domain/types'

type Page = 'home' | 'library' | 'review' | 'notes' | 'papers' | 'insights' | 'favorites' | 'recycle'
const store = useStudyStore()
const { state, questions, pendingQuestions, readyQuestions, dueQuestions, stats, availableSubjects } = store
const storageStatus = store.storageStatus
const oldPassword = ref('')
const newPassword = ref('')
const passwordSaving = ref(false)
onMounted(() => { void store.initialize().catch(() => {}) })
async function saveAccountPassword() {
  if (passwordSaving.value) return
  passwordSaving.value = true
  try { await changePassword(oldPassword.value, newPassword.value); oldPassword.value = ''; newPassword.value = ''; uni.showToast({ title: '登录密码已更新', icon: 'success' }) }
  catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '改密未完成', icon: 'none' }) }
  finally { passwordSaving.value = false }
}
async function renewSession() { try { await reauthenticate(oldPassword.value); oldPassword.value = ''; uni.showToast({ title: '登录已恢复，可以继续保存', icon: 'success' }) } catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '验证未完成', icon: 'none' }) } }
async function signOut() {
  try { await store.flushPersistence() } catch { return uni.showToast({ title: '请先保存当前修改或导出备份', icon: 'none' }) }
  uni.showModal({ title: '退出当前账号？', content: '已保存的档案会保留在服务器，重新登录即可继续学习。', success: async result => { if (!result.confirm) return; try { await logout() } catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '退出未完成', icon: 'none' }) } } })
}
function openServerWorkspace() {
  // #ifdef H5
  window.open('/server', '_blank', 'noopener')
  // #endif
}
const page = ref<Page>('home')
const search = ref('')
const subject = ref<Subject | '全部'>('全部')
const homeSubject = ref<Subject | '全部'>('全部')
const activeTag = ref('')
const status = ref('全部状态')
const sort = ref('最新收录')
const difficulty = ref('全部难度')
const extraFilters = ref(false)
const layout = ref('grid')
const selectionMode = ref(false)
const selected = ref<string[]>([])
const detailId = ref('')
const editorOpen = ref(false)
const editorStartAi = ref(false)
const editorFocusRemark = ref(false)
const captureOpen = ref(false)
const collectionFilter = ref<'all' | 'pending' | 'ready'>('all')
const editingQuestion = ref<Question | undefined>()
const reviewIds = ref<string[]>([])
const reviewTitle = ref('')
const mobileMenu = ref(false)
const profileOpen = ref(false)
const dataManagerOpen = ref(false)
const helpOpen = ref(false)
const profileDraft = ref({ ...state.profile })
const currentPage = ref(1)
const pageSize = 8
const navItems: { id: Page; label: string; icon: string }[] = [
  { id: 'home', label: '学习概览', icon: 'layout-dashboard' },
  { id: 'library', label: '我的错题', icon: 'book-open' },
  { id: 'review', label: '复习计划', icon: 'calendar-days' },
  { id: 'notes', label: '知识笔记', icon: 'notebook-pen' },
  { id: 'papers', label: '练习组卷', icon: 'files' },
  { id: 'insights', label: '学习报告', icon: 'chart-no-axes-combined' },
]
const titles: Record<Page, string> = { home: '学习概览', library: '我的错题', review: '复习计划', notes: '知识笔记', papers: '练习组卷', insights: '学习报告', favorites: '我的收藏', recycle: '回收站' }
const now = new Date()
const dateLabel = `${now.getMonth() + 1}月${now.getDate()}日，星期${'日一二三四五六'[now.getDay()]}`
const greeting = now.getHours() < 11 ? '早上好' : now.getHours() < 14 ? '中午好' : now.getHours() < 18 ? '下午好' : '晚上好'
const recycleQuestions = computed(() => state.questions.filter(q => q.deletedAt))
const collectionCounts = computed(() => {
  const source = (page.value === 'recycle' ? recycleQuestions.value : questions.value).filter(q => page.value !== 'favorites' || q.favorite)
  return { all: source.length, pending: source.filter(q => q.organizationStatus === 'pending').length, ready: source.filter(q => q.organizationStatus !== 'pending').length }
})
const homeSubjects = computed(() => availableSubjects.value.filter(subject => readyQuestions.value.some(question => question.subject === subject)))
watch(homeSubjects, subjects => { if (homeSubject.value !== '全部' && !subjects.includes(homeSubject.value)) homeSubject.value = '全部' })
const tagOptions = computed(() => ['全部标签', ...[...new Set((page.value === 'recycle' ? recycleQuestions.value : questions.value).filter(question => (subject.value === '全部' || question.subject === subject.value) && (page.value !== 'favorites' || question.favorite)).flatMap(question => question.tags))].sort((a, b) => a.localeCompare(b, 'zh-CN'))])
watch(subject, () => { activeTag.value = '' }, { flush: 'sync' })
const filtered = computed(() => {
  const source = page.value === 'recycle' ? recycleQuestions.value : questions.value
  const term = search.value.trim().toLowerCase()
  const result = source.filter(q => (page.value !== 'favorites' || q.favorite) && (collectionFilter.value === 'all' || (collectionFilter.value === 'pending' ? q.organizationStatus === 'pending' : q.organizationStatus !== 'pending')) && (subject.value === '全部' || q.subject === subject.value) && (!activeTag.value || q.tags.includes(activeTag.value)) && (status.value === '全部状态' || (q.organizationStatus !== 'pending' && q.status === (status.value === '已掌握' ? 'mastered' : 'reinforce'))) && (difficulty.value === '全部难度' || q.difficulty === difficulty.value) && (!term || `${q.subject} ${q.title} ${q.stem} ${q.analysis} ${q.tags.join(' ')} ${q.source}`.toLowerCase().includes(term)))
  return result.slice().sort((a, b) => sort.value === '最早收录' ? a.createdAt.localeCompare(b.createdAt) : sort.value === '复习次数' ? b.reviewCount - a.reviewCount : b.createdAt.localeCompare(a.createdAt))
})
const paginated = computed(() => filtered.value.slice((currentPage.value - 1) * pageSize, currentPage.value * pageSize))
const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))
const recent = computed(() => questions.value.filter(q => !q.deletedAt && (homeSubject.value === '全部' || q.subject === homeSubject.value)).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4))
const reviewScheduled = computed(() => readyQuestions.value.filter(q => q.nextReviewDate && q.status !== 'mastered').sort((a, b) => (a.nextReviewDate || '').localeCompare(b.nextReviewDate || '')))
const reviewUnscheduled = computed(() => readyQuestions.value.filter(q => !q.nextReviewDate && q.status !== 'mastered'))
const week = computed(() => {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() + 6) % 7)
  return Array.from({ length: 7 }, (_, i) => { const day = new Date(monday); day.setDate(monday.getDate() + i); return { label: ['一', '二', '三', '四', '五', '六', '日'][i], day: day.getDate(), today: day.toDateString() === now.toDateString(), date: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}` } })
})
const activityMaximum = computed(() => Math.max(...stats.value.weeklyHistory.map(d => d.reviewed), 1))
const libraryDescription = computed(() => page.value === 'favorites' ? '留下好题，也留下值得反复回看的解题解析。' : page.value === 'recycle' ? '暂时放下的题目，随时可以重新拾起。' : '把没弄懂的地方，变成下一次进步的起点。')
watch([search, subject, activeTag, status, difficulty, sort, collectionFilter], () => { currentPage.value = 1; selected.value = [] })
watch(totalPages, max => { currentPage.value = Math.min(currentPage.value, max) })

function navigate(target: Page) { page.value = target; mobileMenu.value = false; selected.value = []; selectionMode.value = false; search.value = ''; subject.value = '全部'; status.value = '全部状态'; activeTag.value = ''; difficulty.value = '全部难度'; collectionFilter.value = 'all'; currentPage.value = 1; nextTick(() => uni.pageScrollTo({ scrollTop: 0, duration: 0 })) }
function openPending() { navigate('library'); collectionFilter.value = 'pending' }
function setCollectionFilter(value: 'all' | 'pending' | 'ready') {
  collectionFilter.value = value
  subject.value = '全部'; status.value = '全部状态'; difficulty.value = '全部难度'; activeTag.value = ''
  extraFilters.value = false; selectionMode.value = false; selected.value = []
}
function globalSearch() { if (search.value.trim()) { mobileMenu.value = false; page.value = 'library'; collectionFilter.value = 'all'; subject.value = '全部'; status.value = '全部状态'; difficulty.value = '全部难度'; activeTag.value = ''; currentPage.value = 1 } }
function openQuestion(id: string) {
  if (questions.value.find(q => q.id === id)?.organizationStatus === 'pending') editQuestion(id)
  else detailId.value = id
}
function newQuestion() { captureOpen.value = true; mobileMenu.value = false }
function onCaptured(id: string, intent: 'later' | 'ai' = 'later') { captureOpen.value = false; if (intent === 'ai') editQuestion(id, true); else { navigate('home'); uni.showToast({ title: '题目已保存到待处理', icon: 'success' }) } }
function editQuestion(id: string, startAi = false, focusRemark = false) { editingQuestion.value = questions.value.find(q => q.id === id); if (!editingQuestion.value) return; editorStartAi.value = startAi; editorFocusRemark.value = focusRemark; detailId.value = ''; editorOpen.value = true }
function onSaved(id: string) {
  editorOpen.value = false
  const question = questions.value.find(q => q.id === id)
  if (question?.organizationStatus === 'pending') { detailId.value = ''; openPending(); return }
  navigate('library'); collectionFilter.value = 'ready'; detailId.value = id
}
function practice(ids: string[], title = '专注复习') {
  if (!ids.length) return uni.showToast({ title: '还没有待复习的题目，可以先安排日期', icon: 'none' })
  const valid = ids.filter(id => readyQuestions.value.find(q => q.id === id && q.answer.trim()))
  if (!valid.length) return uni.showToast({ title: '请先完成整理并补充参考答案', icon: 'none' })
  if (valid.length < ids.length) uni.showToast({ title: `已略过${ids.length - valid.length}道缺少答案的题目`, icon: 'none' })
  detailId.value = ''; reviewIds.value = valid; reviewTitle.value = title
}
function startDaily() { const ids = dueQuestions.value.length ? dueQuestions.value.map(q => q.id) : readyQuestions.value.filter(q => q.status === 'reinforce' && q.answer.trim()).map(q => q.id); practice(ids, dueQuestions.value.length ? '今日复习' : '自主练习') }
async function notifySaved(title: string): Promise<boolean> { try { await store.flushPersistence(); uni.showToast({ title, icon: 'success' }); return true } catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '保存尚未完成，当前内容仍保留', icon: 'none', duration: 3500 }); return false } }
function selectQuestion(id: string) { selected.value = selected.value.includes(id) ? selected.value.filter(v => v !== id) : [...selected.value, id] }
function toggleAll() { selected.value = selected.value.length === filtered.value.length ? [] : filtered.value.map(q => q.id) }
function batchDelete() { if (!selected.value.length) return; uni.showModal({ title: `移入回收站 ${selected.value.length} 道题？`, content: '你可以在回收站恢复这些题目。', confirmText: '移入回收站', success: async r => { if (r.confirm) { selected.value.forEach(id => store.deleteQuestion(id)); if (await notifySaved('已移入回收站')) { selected.value = []; selectionMode.value = false } } } }) }
function batchTag() {
  if (!selected.value.length) return
  uni.showModal({ title: '批量添加标签', editable: true, placeholderText: '输入标签，可用逗号分隔', success: result => {
    if (!result.confirm || !result.content?.trim()) return
    try {
      const updates = selected.value.map(id => questions.value.find(q => q.id === id)).filter((q): q is Question => !!q).map(q => ({ id: q.id, tags: normalizeTags([...q.tags, result.content!]) }))
      updates.forEach(update => store.updateQuestion(update.id, { tags: update.tags })); notifySaved('标签已添加')
    } catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '标签添加失败', icon: 'none' }) }
  } })
}
function selectTag(event: any) { const index = Number(event.detail.value); activeTag.value = index > 0 ? (tagOptions.value[index] || '') : '' }
function searchByTag(tag: string) { navigate('library'); activeTag.value = tag; detailId.value = '' }

function restore(id: string) { store.restoreQuestion(id); notifySaved('题目已恢复') }
function setPlan(id: string, event: any) { try { store.setPlan(id, event.detail.value); notifySaved('复习日期已安排') } catch (e) { uni.showToast({ title: e instanceof Error ? e.message : '日期无效', icon: 'none' }) } }
function selectOption(type: 'status' | 'sort' | 'difficulty') {
  const items = type === 'status' ? ['全部状态', '待巩固', '已掌握'] : type === 'sort' ? ['最新收录', '最早收录', '复习次数'] : ['全部难度', '基础', '进阶', '挑战']
  uni.showActionSheet({ itemList: items, success: r => { const value = items[r.tapIndex]; if (type === 'status') status.value = value; else if (type === 'sort') sort.value = value; else difficulty.value = value } })
}
function openHelp() { mobileMenu.value = false; helpOpen.value = true }
function openProfile() { profileDraft.value = { ...state.profile }; profileOpen.value = true; mobileMenu.value = false }
function openDataManager() { profileOpen.value = false; mobileMenu.value = false; dataManagerOpen.value = true }
function onDataRestored() { detailId.value = ''; editorOpen.value = false; captureOpen.value = false; reviewIds.value = []; navigate('home') }
async function saveProfile() { if (!profileDraft.value.nickname.trim()) return uni.showToast({ title: '请填写你的昵称', icon: 'none' }); store.updateProfile(profileDraft.value); if (await notifySaved('个人信息已保存')) profileOpen.value = false }
function resetDemo() { uni.showModal({ title: '重新载入示例数据？', content: '将替换当前学习档案中的题目、笔记和练习记录。请确认你不需要保留当前内容。', confirmText: '重新载入', success: async r => { if (r.confirm) { store.resetDemo(); if (await notifySaved('示例数据已重置')) { profileOpen.value = false; navigate('home') } } } }) }
// #ifdef H5
let previousMenuFocus: HTMLElement | null = null
let previousBodyOverflow = ''
watch(mobileMenu, async open => {
  if (open) {
    previousMenuFocus = document.activeElement as HTMLElement | null
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    await nextTick()
    document.querySelector<HTMLElement>('.drawer-close')?.focus()
  } else {
    document.body.style.overflow = previousBodyOverflow
    if (previousMenuFocus?.isConnected) previousMenuFocus.focus()
  }
})
function handleMenuKey(event: KeyboardEvent) {
  if (!mobileMenu.value) return
  if (event.key === 'Escape') { event.preventDefault(); mobileMenu.value = false; return }
  if (event.key !== 'Tab') return
  const controls = Array.from(document.querySelectorAll<HTMLElement>('.navigation-drawer uni-button, .navigation-drawer button, .navigation-drawer [tabindex="0"]')).filter(el => !el.hasAttribute('disabled') && el.getClientRects().length)
  const first = controls[0], last = controls[controls.length - 1]
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
onMounted(() => document.addEventListener('keydown', handleMenuKey))
onBeforeUnmount(() => { document.removeEventListener('keydown', handleMenuKey); if (mobileMenu.value) document.body.style.overflow = previousBodyOverflow })
// #endif
</script>

<template>
  <view>
  <StudyAccess v-if="!storageStatus.ready" />
  <view v-else class="app-shell">
    <view v-if="mobileMenu" class="navigation-backdrop" aria-label="关闭导航菜单" @tap="mobileMenu = false" />
    <view v-if="mobileMenu" id="study-navigation" class="sidebar navigation-drawer" role="dialog" aria-modal="true" aria-label="学习工作台导航">
      <view class="drawer-heading"><view><text class="eyebrow">YOUR LEARNING SPACE</text><text class="drawer-title">学习工作台</text></view><button tabindex="0" class="icon-button drawer-close" aria-label="关闭菜单" @tap="mobileMenu = false"><AppIcon name="x" :size="20" tone="muted" /></button></view>
      <scroll-view scroll-y class="drawer-content">
      <view class="sidebar-workspace"><view class="workspace-avatar"><AppIcon name="graduation-cap" :size="18" tone="green" /></view><view><text class="workspace-title">我的学习空间</text><text class="workspace-sub">认真一点，离答案近一点</text></view><AppIcon name="chevron-down" :size="13" tone="muted" /></view>
      <text class="nav-group-label">学习工作台</text>
      <view class="nav-list"><button v-for="nav in navItems" :key="nav.id" tabindex="0" class="nav-item" :class="{ active: page === nav.id }" @tap="navigate(nav.id)"><AppIcon :name="nav.icon" :size="19" :tone="page === nav.id ? 'green' : 'muted'" /><text>{{ nav.label }}</text><text v-if="nav.id === 'library'" class="nav-count">{{ stats.total }}</text><text v-if="nav.id === 'review' && stats.dueToday" class="nav-count nav-count-warm">{{ stats.dueToday }}</text><view v-if="page === nav.id" class="nav-active-dot" /></button></view>
      <view class="nav-divider" /><text class="nav-group-label">我的整理</text><button tabindex="0" class="nav-item" :class="{ active: page === 'favorites' }" @tap="navigate('favorites')"><AppIcon name="bookmark" :size="19" :tone="page === 'favorites' ? 'green' : 'muted'" /><text>我的收藏</text><text class="nav-count">{{ stats.favorites }}</text></button><button tabindex="0" class="nav-item" :class="{ active: page === 'recycle' }" @tap="navigate('recycle')"><AppIcon name="trash-2" :size="19" :tone="page === 'recycle' ? 'green' : 'muted'" /><text>回收站</text></button>
      <view class="sidebar-bottom"><view class="sidebar-note"><view class="tiny-sparkle">✦</view><text class="sidebar-note-title">不必一下子很厉害</text><text class="sidebar-note-sub">每天，往前一小步就好。</text><view class="note-lines"><view /><view /><view /></view></view><button tabindex="0" class="sidebar-help data-shortcut" @tap="openDataManager"><AppIcon name="shield-check" :size="16" tone="green" /><text>备份与恢复</text><AppIcon name="arrow-up-right" :size="14" tone="muted" /></button><button tabindex="0" class="sidebar-help" @tap="openHelp"><AppIcon name="circle-alert" :size="16" tone="muted" /><text>使用指南</text><AppIcon name="arrow-up-right" :size="14" tone="muted" /></button><button tabindex="0" class="profile-button" @tap="openProfile"><view class="profile-avatar">{{ state.profile.nickname.slice(0, 1) }}</view><view><text class="profile-name">{{ state.profile.nickname }}</text><text class="profile-school">{{ state.profile.grade }} · {{ state.profile.school }}</text></view><AppIcon name="settings" :size="17" tone="muted" /></button></view>
      </scroll-view>
    </view>

    <view class="app-main"><view class="topbar"><view class="header-left"><button tabindex="0" class="icon-button navigation-toggle" :class="{ 'is-open': mobileMenu }" :aria-label="mobileMenu ? '关闭菜单' : '打开菜单'" :aria-expanded="mobileMenu" aria-controls="study-navigation" @tap="mobileMenu = !mobileMenu"><AppIcon :name="mobileMenu ? 'x' : 'menu'" :size="21" :tone="mobileMenu ? 'green' : 'ink'" /></button><button tabindex="0" class="brand header-brand" aria-label="拾题，返回学习概览" @tap="navigate('home')"><view class="brand-mark"><view class="brand-page page-one" /><view class="brand-page page-two" /><view class="brand-page page-three" /></view><view><text class="brand-word">拾题<text class="brand-word-en">SHITI</text></text><text class="brand-tagline">让进步，有迹可循</text></view></button><view class="brand-divider" /><view class="breadcrumb"><AppIcon class="breadcrumb-home" name="house" :size="15" tone="muted" /><text class="breadcrumb-slash">/</text><text>{{ titles[page] }}</text></view></view><view class="topbar-right"><view class="global-search"><AppIcon name="search" :size="16" tone="muted" /><input v-model="search" placeholder="搜索错题、知识点…" confirm-type="search" @confirm="globalSearch" @input="globalSearch" /><text class="search-label">搜索</text></view><button class="icon-button notification-button" aria-label="查看复习提醒" @tap="navigate('review')"><AppIcon name="bell" :size="20" /><view v-if="stats.dueToday" class="notification-dot" /></button><view class="header-divider" /><button class="header-avatar" aria-label="个人资料" @tap="openProfile">{{ state.profile.nickname.slice(0, 1) }}</button></view></view>

      <view v-if="state.storageError" class="storage-warning"><AppIcon name="circle-alert" :size="16" tone="orange" /><text>{{ state.storageError }}</text><button v-if="storageStatus.expired" class="text-button" @tap="openProfile">重新登录</button><button class="text-button" @tap="store.retryPersistence().catch(() => {})">重试保存</button></view><view v-else-if="storageStatus.cloud" class="cloud-save-status"><AppIcon :name="storageStatus.saving ? 'loader-circle' : 'cloud-check'" :size="14" tone="green" /><text>{{ storageStatus.saving ? '正在保存到云端…' : '云端档案 · 已连接' }}</text></view>
      <view class="page-content">
        <template v-if="page === 'home'">
          <view class="page-heading home-heading"><view><view class="greeting-line"><text class="eyebrow">A LITTLE BETTER, EVERY DAY</text><view class="greeting-star">✦</view></view><text class="page-title">{{ greeting }}，{{ state.profile.nickname }}<text class="greeting-comma">。</text></text><text class="page-description">新的进步，就从弄懂一道错题开始。</text></view><view class="home-heading-actions"><view class="today-label"><AppIcon name="calendar-days" :size="15" tone="muted" /><text>{{ dateLabel }}</text></view><button class="button button-primary home-add-button" tabindex="0" aria-label="添加错题" @tap="newQuestion"><AppIcon name="plus" :size="18" tone="white" /><text>添加错题</text></button></view></view>
          <view class="dashboard-grid"><view class="dashboard-primary">
            <view class="hero-card"><view class="hero-content"><view class="hero-kicker"><view class="hero-kicker-dot" /><text>每一个「原来如此」，都值得被记住</text></view><text class="hero-title">拾起错题，<text class="hero-second-line">也拾起进步的可能。</text></text><text class="hero-description">{{ state.profile.goal || '不用追赶所有人，今天比昨天多懂一点。' }}</text><button class="hero-button" @tap="startDaily"><text>{{ stats.dueToday ? '开始今日复习' : '开始自主练习' }}</text><AppIcon name="arrow-up-right" :size="17" tone="white" /></button></view><view class="hero-art"><view class="art-orbit orbit-one" /><view class="art-orbit orbit-two" /><view class="paper-back" /><view class="hero-book"><view class="book-topline"><text>我的进步档案</text><view class="book-mini-star">✳</view></view><view class="book-mark">拾<text>题</text><view class="book-mark-dot" /></view><view class="book-bottom"><view /><text>ONE STEP AT A TIME</text></view></view><view class="hero-check"><AppIcon name="check" :size="20" tone="green" /></view><view class="hero-small-star">✦</view><text class="hero-math">x² + y²</text></view></view>
            <view class="pending-inbox panel">
              <view class="pending-inbox-icon"><AppIcon name="folder-open" :size="24" tone="orange" /></view>
              <view class="pending-inbox-copy"><view><text class="pending-inbox-title">待处理</text><text class="pending-inbox-count">{{ pendingQuestions.length }}</text></view><text>{{ pendingQuestions.length ? '题目已收好，准备好时再慢慢整理。' : '拍照或输入题干，先把题目留下来。' }}</text></view>
              <button class="pending-inbox-button" aria-label="查看待处理错题" @tap="openPending"><text>{{ pendingQuestions.length ? '去整理' : '查看' }}</text><AppIcon name="arrow-right" :size="16" tone="green" /></button>
            </view>
            <view class="metrics-row"><view class="overview-metric"><view class="metric-label"><view class="metric-icon metric-icon-green"><AppIcon name="book-open" :size="16" tone="green" /></view><text>累计收录</text></view><view class="metric-number-row"><text class="metric-number">{{ stats.total }}</text><text class="metric-unit">道错题</text></view><text class="metric-caption">{{ stats.pending }} 道待处理 · {{ stats.ready }} 道已整理</text></view><view class="overview-metric"><view class="metric-label"><view class="metric-icon metric-icon-orange"><AppIcon name="check-check" :size="16" tone="orange" /></view><text>已经掌握</text></view><view class="metric-number-row"><text class="metric-number">{{ stats.mastered }}</text><text class="metric-unit">道难题</text></view><view class="metric-progress"><view :style="{ width: `${stats.ready ? stats.mastered / stats.ready * 100 : 0}%` }" /></view></view><view class="overview-metric"><view class="metric-label"><view class="metric-icon metric-icon-soft"><AppIcon name="flame" :size="16" tone="orange" /></view><text>连续学习</text></view><view class="metric-number-row"><text class="metric-number">{{ stats.streak }}</text><text class="metric-unit">天坚持</text><text class="streak-badge">KEEP GOING</text></view><text class="metric-caption">小小的坚持，会有大大的回响</text></view></view>
            <view class="mobile-daily-focus" @tap="startDaily"><view class="daily-focus-icon"><AppIcon name="refresh-cw" :size="23" tone="green" /></view><view class="daily-focus-copy"><text>{{ stats.dueToday ? '给今天，留一刻复习。' : stats.todayReviewCount ? '今天的复习，已认真完成。' : '今天暂无到期复习。' }}</text><text>{{ stats.dueToday ? `${stats.dueToday} 道题，等待再想一遍` : '也可以选择几道题，主动巩固一下' }}</text></view><view class="daily-focus-go"><AppIcon name="arrow-right" :size="19" tone="green" /></view></view><view class="recent-heading"><view><text class="section-title">最近收录</text><text class="section-caption">先把题目留下来，再慢慢整理成会做的题</text></view><button class="text-button" @tap="navigate('library')"><text>查看全部</text><AppIcon name="arrow-up-right" :size="15" tone="green" /></button></view><view class="home-filters"><scroll-view scroll-x class="home-subject-scroll" :show-scrollbar="false"><view class="home-subject-tabs"><button v-for="s in ['全部', ...homeSubjects]" :key="s" class="home-filter" :class="{ active: homeSubject === s }" @tap="homeSubject = s as Subject | '全部'">{{ s }}<view v-if="homeSubject === s" /></button></view></scroll-view><view class="home-filter-right"><AppIcon name="grid-2x2" :size="15" tone="muted" /><text>按整理时间</text></view></view>
            <view v-if="recent.length" class="question-grid home-question-grid"><QuestionCard v-for="q in recent" :key="q.id" :question="q" @open="openQuestion" @favorite="store.toggleFavorite" @process="editQuestion" /></view><view v-else class="empty-state"><AppIcon name="book-open" :size="35" tone="muted" /><text>这里展示已整理的题目，待处理题目可从上方继续整理。</text><button class="button button-primary" @tap="newQuestion">收录错题</button></view>
            <view class="home-bottom-note"><view class="small-brand-mark">拾</view><text>把错题留在这里，把进步带去下一次。</text><text class="home-bottom-en">LESS MISTAKES. MORE POSSIBILITIES.</text></view>
          </view><view class="dashboard-aside">
            <view class="today-panel panel"><view class="aside-heading"><text class="section-title">我的学习日历</text><view class="calendar-month"><text>{{ now.getMonth() + 1 }}月</text><AppIcon name="calendar-days" :size="14" tone="muted" /></view></view><view class="week-strip"><view v-for="d in week" :key="d.date" class="week-day" :class="{ today: d.today }"><text class="week-label">{{ d.label }}</text><text class="week-number">{{ d.day }}</text><view class="week-dot" :class="{ has: reviewScheduled.some(q => q.nextReviewDate === d.date) }" /></view></view><view class="today-task-heading"><view><view class="orange-dot" /><text>今日待复习</text><text class="today-task-count">{{ stats.dueToday }}</text></view><text class="muted">不急，一题一题来</text></view><view v-if="dueQuestions.length" class="agenda-list"><view v-for="(q, index) in dueQuestions.slice(0, 3)" :key="q.id" class="agenda-item" @tap="openQuestion(q.id)"><view class="agenda-index">{{ String(index + 1).padStart(2, '0') }}</view><view class="agenda-text"><text>{{ q.title }}</text><text>{{ q.subject }} · {{ q.tags[0] || '温故知新' }}</text></view><AppIcon name="chevron-right" :size="14" tone="muted" /></view></view><view v-else class="agenda-empty"><AppIcon name="check-check" :size="25" tone="green" /><text>{{ stats.todayReviewCount ? '今天的复习已完成' : '今天暂无到期复习' }}</text></view><button class="today-start" @tap="stats.dueToday ? practice(dueQuestions.map(q => q.id), '今日复习') : navigate('review')"><text>{{ stats.dueToday ? `去复习这 ${stats.dueToday} 道题` : '安排下一次复习' }}</text><AppIcon name="arrow-right" :size="16" tone="green" /></button></view>
            <view class="activity-panel panel"><view class="aside-heading"><text class="section-title">这一周的认真</text><view class="activity-tag"><view /><text>持续生长中</text></view></view><view class="mini-chart"><view v-for="(d, index) in stats.weeklyHistory" :key="d.date" class="mini-chart-day"><view class="mini-bar-track"><view class="mini-bar" :class="{ current: index === 6 }" :style="{ height: `${Math.max(5, d.reviewed / activityMaximum * 70)}px` }" /></view><text>{{ index === 6 ? '今' : d.label }}</text></view></view><view class="activity-footer"><text>累计完成 {{ stats.reviewCount }} 次复习</text><button class="text-button" @tap="navigate('insights')"><AppIcon name="arrow-up-right" :size="15" tone="green" /></button></view></view>
            <view class="daily-note"><AppIcon name="quote" :size="23" tone="green" /><text class="daily-quote">比做对更重要的，<text>是弄懂为什么。</text></text><text class="daily-quote-en">Understanding is a kind of progress.</text><view class="daily-note-bottom"><view /><text>拾题 · 今日一言</text></view></view>
            <button class="quick-add-note" @tap="navigate('notes')"><view class="quick-note-icon"><AppIcon name="notebook-pen" :size="21" tone="orange" /></view><view><text>灵感，别让它溜走</text><text>把刚想通的知识点记下来</text></view><AppIcon name="arrow-up-right" :size="16" tone="muted" /></button>
          </view></view>
        </template>

        <template v-else-if="['library', 'favorites', 'recycle'].includes(page)">
          <view class="page-heading"><view><text class="eyebrow">{{ page === 'favorites' ? 'WORTH COMING BACK TO' : page === 'recycle' ? 'NOT GONE, JUST PUT ASIDE' : 'YOUR COLLECTION OF PROGRESS' }}</text><text class="page-title">{{ titles[page] }}<text class="heading-total">{{ page === 'favorites' ? stats.favorites : page === 'recycle' ? recycleQuestions.length : stats.total }}</text></text><text class="page-description">{{ libraryDescription }}</text></view><button v-if="page !== 'recycle'" class="button button-primary desktop-add" @tap="newQuestion"><AppIcon name="plus" :size="17" tone="white" /><text>添加错题</text></button></view>
          <view class="collection-tabs" aria-label="按整理状态筛选"><button class="collection-tab" :class="{ active: collectionFilter === 'all' }" :aria-pressed="collectionFilter === 'all'" @tap="setCollectionFilter('all')">全部题目<text>{{ collectionCounts.all }}</text></button><button class="collection-tab" :class="{ active: collectionFilter === 'pending' }" :aria-pressed="collectionFilter === 'pending'" @tap="setCollectionFilter('pending')"><AppIcon name="clock-3" :size="15" :tone="collectionFilter === 'pending' ? 'orange' : 'muted'" />待处理<text>{{ collectionCounts.pending }}</text></button><button class="collection-tab" :class="{ active: collectionFilter === 'ready' }" :aria-pressed="collectionFilter === 'ready'" @tap="setCollectionFilter('ready')">已整理<text>{{ collectionCounts.ready }}</text></button></view>
          <view v-if="collectionFilter === 'pending'" class="pending-library-hint"><AppIcon name="info" :size="15" tone="muted" /><text>题目已保存。点击卡片继续整理，可手动补充或让 AI 生成，核对后确认入库。</text></view>
          <view class="library-toolbar panel"><scroll-view scroll-x :scroll-into-view="`library-subject-${Math.max(0, ['全部', ...availableSubjects].indexOf(subject))}`" class="library-subject-scroll" :show-scrollbar="false"><view class="subject-tabs"><button v-for="(s, index) in ['全部', ...availableSubjects]" :id="`library-subject-${index}`" :key="s" class="subject-tab" :class="{ active: subject === s }" @tap="subject = s as Subject | '全部'"><text>{{ s }}</text><text v-if="s === '全部'" class="tab-count">{{ page === 'recycle' ? recycleQuestions.length : page === 'favorites' ? stats.favorites : stats.total }}</text></button></view></scroll-view><view class="library-search-row"><view class="library-search"><AppIcon name="search" :size="17" tone="muted" /><input v-model="search" placeholder="搜索题目、标签、解题解析…" /><button v-if="search" class="icon-button" aria-label="清空搜索" @tap="search = ''"><AppIcon name="x" :size="14" tone="muted" /></button></view><button v-if="collectionFilter !== 'pending'" class="filter-button" @tap="selectOption('status')"><text>{{ status }}</text><AppIcon name="chevron-down" :size="13" tone="muted" /></button><picker class="tag-filter-picker" :range="tagOptions" :value="activeTag ? Math.max(0, tagOptions.slice(1).indexOf(activeTag) + 1) : 0" @change="selectTag"><view class="filter-button tag-filter-button" :class="{ 'tag-filter-active': !!activeTag }"><AppIcon name="layers" :size="15" :tone="!activeTag ? 'muted' : 'green'" /><text>{{ activeTag || '全部标签' }}</text><AppIcon name="chevron-down" :size="12" tone="muted" /></view></picker><button class="filter-button more-filter" :class="{ 'is-on': extraFilters }" @tap="extraFilters = !extraFilters"><AppIcon name="sliders-horizontal" :size="16" tone="muted" /><text>更多筛选</text></button></view><view v-if="extraFilters" class="extra-filters"><button v-if="collectionFilter !== 'pending'" class="filter-chip" @tap="selectOption('difficulty')">{{ difficulty }}<AppIcon name="chevron-down" :size="12" tone="muted" /></button><button class="text-button" @tap="difficulty = '全部难度'; status = '全部状态'; activeTag = ''">重置筛选</button></view></view>
          <view class="results-toolbar"><view class="results-description"><text>找到 <text class="result-number">{{ filtered.length }}</text> 道{{ page === 'recycle' ? '已删除题目' : '题目' }}</text><text v-if="selectionMode"> · 已选 {{ selected.length }} 道</text></view><view class="result-actions"><button v-if="page !== 'recycle'" class="text-button batch-button" @tap="selectionMode = !selectionMode; selected = []"><AppIcon name="check-check" :size="15" tone="muted" /><text>{{ selectionMode ? '取消批量' : '批量管理' }}</text></button><button class="text-button sort-button" @tap="selectOption('sort')"><text>{{ sort }}</text><AppIcon name="chevron-down" :size="12" tone="muted" /></button><view class="layout-switch"><button class="icon-button" :class="{ active: layout === 'grid' }" aria-label="卡片视图" @tap="layout = 'grid'"><AppIcon name="grid-2x2" :size="16" :tone="layout === 'grid' ? 'green' : 'muted'" /></button><button class="icon-button" :class="{ active: layout === 'list' }" aria-label="列表视图" @tap="layout = 'list'"><AppIcon name="list" :size="17" :tone="layout === 'list' ? 'green' : 'muted'" /></button></view></view></view>
          <view v-if="selectionMode" class="batch-toolbar"><button class="text-button" @tap="toggleAll">{{ selected.length === filtered.length && filtered.length ? '取消全选' : '选择全部' }}</button><text class="batch-count">已选 {{ selected.length }} 道</text><button class="text-button" :disabled="!selected.length" @tap="batchTag">添加标签</button><button class="text-button danger-text" :disabled="!selected.length" @tap="batchDelete">移入回收站</button></view>
          <view v-if="paginated.length" class="question-grid library-question-grid" :class="{ 'list-layout': layout === 'list' }"><view v-for="q in paginated" :key="q.id" class="question-wrapper"><QuestionCard :question="q" :archived="page === 'recycle'" :selecting="selectionMode" :selected="selected.includes(q.id)" @open="page === 'recycle' ? undefined : openQuestion(q.id)" @favorite="page === 'recycle' ? undefined : store.toggleFavorite(q.id)" @select="selectQuestion" @process="editQuestion" /><button v-if="page === 'recycle'" class="restore-button" @tap="restore(q.id)"><AppIcon name="rotate-ccw" :size="15" tone="green" /><text>恢复这道题</text></button></view></view><view v-else class="empty-state library-empty"><view class="empty-symbol"><AppIcon :name="page === 'recycle' ? 'trash-2' : 'search'" :size="33" tone="muted" /></view><text class="empty-title">{{ page === 'recycle' ? '回收站里空空的' : '暂时没有找到这类题目' }}</text><text>试试调整筛选条件，或收录一道新题。</text><button class="button button-quiet" @tap="search = ''; subject = '全部'; status = '全部状态'; difficulty = '全部难度'; activeTag = ''">清空筛选</button></view>
          <view v-if="filtered.length" class="pagination"><text>每页 {{ pageSize }} 道，共 {{ filtered.length }} 道</text><view><button class="icon-button" :disabled="currentPage === 1" aria-label="上一页" @tap="currentPage--"><AppIcon name="chevron-left" :size="16" tone="muted" /></button><button v-for="i in totalPages" :key="i" class="page-number" :class="{ active: currentPage === i }" @tap="currentPage = i">{{ i }}</button><button class="icon-button" :disabled="currentPage >= totalPages" aria-label="下一页" @tap="currentPage++"><AppIcon name="chevron-right" :size="16" tone="muted" /></button></view></view>
        </template>

        <template v-else-if="page === 'review'">
          <view class="page-heading"><view><text class="eyebrow">REMEMBER A LITTLE LONGER</text><text class="page-title">让知识，多留一会儿。</text><text class="page-description">主动回忆一次，比匆匆看过答案更有收获。</text></view><button class="button button-primary" :disabled="!dueQuestions.length" @tap="startDaily"><AppIcon name="refresh-cw" :size="17" tone="white" /><text>开始今日复习</text></button></view>
          <view class="review-summary-grid"><view class="review-summary featured"><view class="review-summary-icon"><AppIcon name="calendar-days" :size="25" tone="green" /></view><view><text class="review-summary-number">{{ stats.dueToday }}<text>道</text></text><text class="review-summary-label">今天，重新认识它们</text></view><text class="review-summary-caption">包含已逾期、尚未完成的计划</text></view><view class="review-summary"><view class="review-summary-icon warm"><AppIcon name="check-check" :size="25" tone="orange" /></view><view><text class="review-summary-number">{{ stats.todayReviewCount }}<text>次</text></text><text class="review-summary-label">今日已经认真想过</text></view></view><view class="review-summary"><view class="review-summary-icon"><AppIcon name="flame" :size="25" tone="green" /></view><view><text class="review-summary-number">{{ stats.streak }}<text>天</text></text><text class="review-summary-label">学习的节奏，慢慢建立</text></view></view></view>
          <view class="review-content-grid"><view class="panel plan-list-panel"><view class="section-heading"><view><text class="section-title">我的复习安排</text><text class="section-caption">按计划日期排序，逾期题优先</text></view><text class="badge badge-neutral">{{ reviewScheduled.length }} 道已安排</text></view><view v-for="(q, index) in reviewScheduled" :key="q.id" class="plan-item"><view class="plan-item-number">{{ String(index + 1).padStart(2, '0') }}</view><view class="plan-item-content" @tap="openQuestion(q.id)"><text>{{ q.title }}</text><text>{{ q.subject }} · {{ q.tags[0] || '自主整理' }}</text></view><picker mode="date" :value="q.nextReviewDate" @change="setPlan(q.id, $event)"><view class="plan-date"><AppIcon name="calendar-days" :size="13" tone="muted" /><text>{{ q.nextReviewDate?.slice(5).replace('-', '/') }}</text></view></picker><button class="icon-button" aria-label="复习这道题" @tap="practice([q.id])"><AppIcon name="arrow-right" :size="17" tone="green" /></button></view><view v-if="!reviewScheduled.length" class="empty-state"><AppIcon name="calendar-days" :size="30" tone="muted" /><text>还没有复习计划，给下方题目选个日期吧。</text></view></view><view class="review-tip-panel"><view class="review-tip-symbol"><AppIcon name="lightbulb" :size="28" tone="green" /></view><text class="review-tip-title">不是记住答案，<text>而是学会思考。</text></text><view class="review-step"><text>01</text><view><text>先独立想一想</text><text>把答案挡住，试着完整做一遍</text></view></view><view class="review-step"><text>02</text><view><text>对照解答找差距</text><text>真正理解卡住的那一步</text></view></view><view class="review-step"><text>03</text><view><text>诚实记录掌握情况</text><text>再为需要巩固的题安排日期</text></view></view></view></view>
          <view class="section-heading unscheduled-heading"><view><text class="section-title">还可以再巩固的题</text><text class="section-caption">为它们选一个合适的复习日期</text></view><text class="muted small">{{ reviewUnscheduled.length }} 道尚未安排</text></view><view class="unscheduled-grid"><view v-for="q in reviewUnscheduled" :key="q.id" class="unscheduled-card panel"><view @tap="openQuestion(q.id)"><text class="badge">{{ q.subject }}</text><text class="unscheduled-title">{{ q.title }}</text><text class="small muted">{{ q.tags.join(' · ') }}</text></view><picker mode="date" @change="setPlan(q.id, $event)"><view class="schedule-button"><AppIcon name="plus" :size="14" tone="green" /><text>安排复习</text></view></picker></view></view>
        </template>
        <KnowledgeView v-else-if="page === 'notes'" @open-question="openQuestion" @practice="practice($event, '知识点巩固')" />
        <PapersView v-else-if="page === 'papers'" @open-question="openQuestion" @practice="practice($event, '专题自测')" />
        <InsightsView v-else-if="page === 'insights'" @open-question="openQuestion" @practice="practice($event, '薄弱项巩固')" />
      </view>
      <button v-if="page !== 'recycle'" class="floating-add" aria-label="快捷添加错题" @tap="newQuestion"><AppIcon name="plus" :size="25" tone="white" /></button>
    </view>

    <view class="mobile-bottom"><button :class="{ active: page === 'home' }" @tap="navigate('home')"><AppIcon name="house" :tone="page === 'home' ? 'green' : 'muted'" :size="21" /><text>首页</text></button><button :class="{ active: page === 'library' }" @tap="navigate('library')"><AppIcon name="book-open" :tone="page === 'library' ? 'green' : 'muted'" :size="21" /><text>错题本</text></button><button class="mobile-capture" @tap="newQuestion"><view><AppIcon name="plus" :size="24" tone="white" /></view><text>收录</text></button><button :class="{ active: page === 'review' }" @tap="navigate('review')"><AppIcon name="calendar-days" :tone="page === 'review' ? 'green' : 'muted'" :size="21" /><text>复习</text></button><button @tap="mobileMenu = true"><AppIcon name="grid-2x2" :size="21" tone="muted" /><text>工作台</text></button></view>
    <DataManager v-if="dataManagerOpen" @close="dataManagerOpen = false" @restored="onDataRestored" />
    <QuickCapture v-if="captureOpen" @close="captureOpen = false" @saved="onCaptured" />
    <QuestionEditor v-if="editorOpen" :question="editingQuestion" :auto-generate="editorStartAi" :focus-remark="editorFocusRemark" @close="editorOpen = false" @saved="onSaved" />
    <QuestionDetail v-if="detailId" :id="detailId" @close="detailId = ''" @edit="editQuestion" @edit-remark="editQuestion($event, false, true)" @practice="practice" @search-tag="searchByTag" />
    <ReviewSession v-if="reviewIds.length" :ids="reviewIds" :title="reviewTitle" @close="reviewIds = []" />
    <view v-if="profileOpen" class="modal-overlay" @tap.self="profileOpen = false"><view class="modal-window profile-window"><view class="modal-header"><view><text class="eyebrow">YOUR OWN PACE</text><text class="modal-title">你的学习空间</text></view><button class="icon-button" aria-label="关闭资料" @tap="profileOpen = false"><AppIcon name="x" /></button></view><scroll-view scroll-y class="modal-scroll"><view class="profile-content"><view class="profile-large-avatar">{{ profileDraft.nickname.slice(0, 1) || '拾' }}</view><text class="field-label">怎么称呼你</text><input v-model="profileDraft.nickname" class="form-input" maxlength="12" placeholder="你的昵称" /><view class="form-columns"><view><text class="field-label">学习阶段</text><input v-model="profileDraft.grade" class="form-input" maxlength="20" placeholder="例如：高二" /></view><view><text class="field-label">学校或学习方向</text><input v-model="profileDraft.school" class="form-input" maxlength="20" placeholder="例如：我的自习室" /></view></view><text class="field-label">给自己的小目标</text><input v-model="profileDraft.goal" class="form-input" maxlength="60" placeholder="不急，每天多懂一点" /><view class="local-data-info"><AppIcon name="shield-check" :size="19" tone="green" /><view><text>{{ storageStatus.cloud ? '属于你的云端学习空间' : '属于你的本地学习空间' }}</text><text>{{ storageStatus.cloud ? '题目、题图和复习记录保存在服务器。电脑与手机登录同一账号，即可继续查看；切换设备后刷新页面获取最新档案。' : '题目、笔记和记录保存在当前浏览器数据库。建议定期导出备份；如需跨设备使用，可前往服务器版。' }}</text></view></view><button class="profile-backup-link" @tap="openDataManager"><AppIcon name="download" :size="16" tone="green" /><text>备份与恢复我的学习档案</text><AppIcon name="chevron-right" :size="14" tone="muted" /></button><view v-if="storageStatus.cloud" class="cloud-account"><text class="field-label">账号：{{ storageStatus.user?.Username }}</text><input v-model="oldPassword" class="form-input" password placeholder="原登录密码" maxlength="128" /><input v-model="newPassword" class="form-input" password placeholder="新密码，至少10位" maxlength="128" /><button class="button button-quiet" :loading="passwordSaving" :disabled="!oldPassword || newPassword.length < 10" @tap="saveAccountPassword">更新登录密码</button><button v-if="storageStatus.expired" class="button button-quiet" :disabled="!oldPassword" @tap="renewSession">使用原密码恢复登录</button><button class="text-button" @tap="signOut">退出当前账号</button></view><button v-else class="button button-quiet" @tap="openServerWorkspace">前往服务器云端版<AppIcon name="arrow-up-right" :size="15" tone="green" /></button><button class="text-button reset-demo" @tap="resetDemo"><AppIcon name="refresh-cw" :size="14" tone="muted" /><text>重新载入示例数据</text></button></view></scroll-view><view class="modal-footer"><button class="button button-quiet" @tap="profileOpen = false">取消</button><button class="button button-primary" @tap="saveProfile">保存个人信息</button></view></view></view>
    <view v-if="helpOpen" class="modal-overlay" @tap.self="helpOpen = false"><view class="modal-window help-window"><view class="modal-header"><text class="modal-title">把错题，慢慢变成会做的题</text><button class="icon-button" aria-label="关闭指南" @tap="helpOpen = false"><AppIcon name="x" /></button></view><view class="help-content"><view v-for="(item, index) in [{title:'收录与整理',text:'拍照或输入题干，先存入待处理；选择待会整理，或用 AI 生成结果，核对后确认入库。'}, {title:'主动回忆',text:'先独立重做，再查看解答，诚实记录掌握情况。'}, {title:'安排下一次',text:'在题目档案选择复习日期，首页会列出到期任务。'}, {title:'串起知识',text:'把相关题目连到笔记，也可以自主组卷、下载Word练习。'}]" :key="index" class="help-step"><text>{{ String(index + 1).padStart(2, '0') }}</text><view><text>{{ item.title }}</text><text>{{ item.text }}</text></view></view><button class="button button-primary" @tap="helpOpen = false">开始我的学习</button></view></view></view>
  </view>
  </view>
</template>
