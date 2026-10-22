<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from '../../components/AppIcon.vue'
import StudyAccess from '../../components/StudyAccess.vue'
import { logout, changePassword, reauthenticate } from '../../services/studyStorage'
import QuestionCard from '../../components/QuestionCard.vue'
import NotebookLibrary from '../../components/NotebookLibrary.vue'
import QuestionEditor from '../../components/QuestionEditor.vue'
import QuickCapture from '../../components/QuickCapture.vue'
import BatchCapture from '../../components/BatchCapture.vue'
import QuestionDetail from '../../components/QuestionDetail.vue'
import ReviewSession from '../../components/ReviewSession.vue'
import KnowledgeView from '../../components/KnowledgeView.vue'
import InsightsView from '../../components/InsightsView.vue'
import PapersView from '../../components/PapersView.vue'
import DataManager from '../../components/DataManager.vue'
import { useStudyStore } from '../../domain/store'
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
const homeSubject = ref<Subject | '全部'>('全部')
const activeTag = ref('')
const detailId = ref('')
const editorOpen = ref(false)
const editorStartAi = ref(false)
const editorFocusRemark = ref(false)
const captureOpen = ref(false)
const batchCaptureOpen = ref(false)
const captureInitialMode = ref<'manual' | 'image'>('manual')
const lastCapturedId = ref('')
const lastCapturedCount = ref(1)
const learningOverviewOpen = ref(false)
const collectionFilter = ref<'all' | 'pending' | 'ready'>('all')
const libraryVisitKey = ref(0)
const editingQuestion = ref<Question | undefined>()
const reviewIds = ref<string[]>([])
const reviewTitle = ref('')
const mobileMenu = ref(false)
const profileOpen = ref(false)
const dataManagerOpen = ref(false)
const helpOpen = ref(false)
const profileDraft = ref({ ...state.profile })
const navItems: { id: Page; label: string; icon: string }[] = [
  { id: 'home', label: '首页', icon: 'layout-dashboard' },
  { id: 'library', label: '我的错题', icon: 'book-open' },
  { id: 'review', label: '复习计划', icon: 'calendar-days' },
  { id: 'notes', label: '知识笔记', icon: 'notebook-pen' },
  { id: 'papers', label: '练习组卷', icon: 'files' },
  { id: 'insights', label: '学习报告', icon: 'chart-no-axes-combined' },
]
const titles: Record<Page, string> = { home: '首页', library: '我的错题', review: '复习计划', notes: '知识笔记', papers: '练习组卷', insights: '学习报告', favorites: '我的收藏', recycle: '回收站' }
const now = new Date()
const dateLabel = `${now.getMonth() + 1}月${now.getDate()}日，星期${'日一二三四五六'[now.getDay()]}`
const greeting = now.getHours() < 11 ? '早上好' : now.getHours() < 14 ? '中午好' : now.getHours() < 18 ? '下午好' : '晚上好'
const homeSubjects = computed(() => availableSubjects.value.filter(subject => questions.value.some(question => question.subject === subject)))
const lastCaptured = computed(() => questions.value.find(question => question.id === lastCapturedId.value && !question.deletedAt))
watch(homeSubjects, subjects => { if (homeSubject.value !== '全部' && !subjects.includes(homeSubject.value)) homeSubject.value = '全部' })
const recent = computed(() => questions.value.filter(q => !q.deletedAt && (homeSubject.value === '全部' || q.subject === homeSubject.value)).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4))
const reviewScheduled = computed(() => readyQuestions.value.filter(q => q.nextReviewDate && q.status !== 'mastered').sort((a, b) => (a.nextReviewDate || '').localeCompare(b.nextReviewDate || '')))
const reviewUnscheduled = computed(() => readyQuestions.value.filter(q => !q.nextReviewDate && q.status !== 'mastered'))
const week = computed(() => {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() + 6) % 7)
  return Array.from({ length: 7 }, (_, i) => { const day = new Date(monday); day.setDate(monday.getDate() + i); return { label: ['一', '二', '三', '四', '五', '六', '日'][i], day: day.getDate(), today: day.toDateString() === now.toDateString(), date: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}` } })
})
const activityMaximum = computed(() => Math.max(...stats.value.weeklyHistory.map(d => d.reviewed), 1))
function navigate(target: Page) { page.value = target; libraryVisitKey.value++; mobileMenu.value = false; search.value = ''; activeTag.value = ''; collectionFilter.value = 'all'; nextTick(() => uni.pageScrollTo({ scrollTop: 0, duration: 0 })) }
function openPending() { navigate('library'); collectionFilter.value = 'pending' }
function globalSearch() { if (search.value.trim()) { mobileMenu.value = false; page.value = 'library'; libraryVisitKey.value++; collectionFilter.value = 'all'; activeTag.value = '' } }
function openQuestion(id: string) { detailId.value = id }
function newQuestion(mode: 'manual' | 'image' = 'manual') { captureInitialMode.value = mode; captureOpen.value = true; mobileMenu.value = false }
function onCaptured(id: string, intent: 'later' | 'ai' = 'later') {
  captureOpen.value = false
  lastCapturedId.value = id
  lastCapturedCount.value = 1
  homeSubject.value = '全部'
  navigate('home')
  if (intent === 'ai') editQuestion(id, true)
}
function onBatchCaptured(ids: string[]) {
  batchCaptureOpen.value = false
  if (!ids.length) return
  lastCapturedId.value = ids[0]
  lastCapturedCount.value = ids.length
  homeSubject.value = '全部'
  navigate('home')
  uni.showToast({ title: `已收录 ${ids.length} 道题`, icon: 'success' })
}
function continueAdding() { if (lastCapturedCount.value > 1) batchCaptureOpen.value = true; else newQuestion(captureInitialMode.value) }
function editQuestion(id: string, startAi = false, focusRemark = false) { editingQuestion.value = questions.value.find(q => q.id === id); if (!editingQuestion.value) return; editorStartAi.value = startAi; editorFocusRemark.value = focusRemark; detailId.value = ''; editorOpen.value = true }
function onSaved(id: string) {
  editorOpen.value = false
  const question = questions.value.find(q => q.id === id)
  if (page.value !== 'library' && page.value !== 'favorites') { navigate('library'); collectionFilter.value = question?.organizationStatus === 'pending' ? 'pending' : 'ready' }
  detailId.value = id
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
function searchByTag(tag: string) { navigate('library'); activeTag.value = tag; detailId.value = '' }


function setPlan(id: string, event: any) { try { store.setPlan(id, event.detail.value); notifySaved('复习日期已安排') } catch (e) { uni.showToast({ title: e instanceof Error ? e.message : '日期无效', icon: 'none' }) } }
function openHelp() { mobileMenu.value = false; helpOpen.value = true }
function openProfile() { profileDraft.value = { ...state.profile }; profileOpen.value = true; mobileMenu.value = false }
function openDataManager() { profileOpen.value = false; mobileMenu.value = false; dataManagerOpen.value = true }
function onDataRestored() { detailId.value = ''; editorOpen.value = false; captureOpen.value = false; batchCaptureOpen.value = false; lastCapturedId.value = ''; reviewIds.value = []; navigate('home') }
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
          <view class="page-heading home-heading capture-home-heading"><view><view class="greeting-line"><text class="eyebrow">A LITTLE BETTER, EVERY DAY</text><view class="greeting-star">✦</view></view><text class="page-title">{{ greeting }}，{{ state.profile.nickname }}<text class="greeting-comma">。</text></text><text class="page-description">先留住题目，每天多懂一点。</text></view><view class="today-label"><AppIcon name="calendar-days" :size="15" tone="muted" /><text>{{ dateLabel }}</text></view></view>
          <view class="capture-home-panel">
            <view class="capture-home-copy"><text class="capture-home-kicker">每一次进步，从这里开始</text><text class="capture-home-title">添加错题</text><text class="capture-home-description">文字或图片都能保存，科目、标签与解析稍后再补。</text></view>
            <view class="capture-home-actions">
              <button class="capture-home-action capture-home-image" aria-label="拍照或上传题图" @tap="newQuestion('image')"><view class="capture-home-action-icon"><AppIcon name="camera" :size="25" tone="green" /></view><view class="capture-home-action-copy"><text>拍照 / 上传题图</text><text>手机拍照 · 电脑拖拽或粘贴</text></view><AppIcon name="arrow-up-right" :size="20" tone="green" /></button>
              <button class="capture-home-action capture-home-manual" aria-label="输入题目" @tap="newQuestion('manual')"><view class="capture-home-action-icon"><AppIcon name="keyboard" :size="25" tone="white" /></view><view class="capture-home-action-copy"><text>输入题目</text><text>输入或粘贴题干，直接收录</text></view><AppIcon name="arrow-up-right" :size="20" tone="white" /></button>
            </view>
            <view class="capture-home-batch-row"><text>多张题图或一整张试卷？</text><button class="capture-home-batch" @tap="batchCaptureOpen = true"><AppIcon name="layers" :size="15" tone="white" /><text>批量录入</text><AppIcon name="arrow-right" :size="14" tone="white" /></button></view>
          </view>
          <view v-if="lastCaptured" class="capture-receipt panel" role="status" aria-live="polite">
            <image v-if="lastCaptured.images.length" class="capture-receipt-thumbnail" :src="lastCaptured.images[0]" mode="aspectFill" />
            <view v-else class="capture-receipt-symbol"><AppIcon name="check-check" :size="24" tone="green" /></view>
            <view class="capture-receipt-copy"><text class="capture-receipt-title">{{ lastCapturedCount > 1 ? `已收录 ${lastCapturedCount} 道题` : lastCaptured.organizationStatus === 'pending' ? '已收录 · 待整理' : '已收录 · 已整理' }}</text><text class="capture-receipt-preview">{{ lastCapturedCount > 1 ? '其中一道：' : '' }}{{ lastCaptured.stem || (lastCaptured.images.length ? `已保存 ${lastCaptured.images.length} 张题图，可随时继续整理。` : lastCaptured.title) }}</text></view>
            <view class="capture-receipt-actions"><button class="button button-quiet" @tap="continueAdding">继续添加</button><button v-if="lastCapturedCount > 1" class="button button-primary" @tap="openPending">查看待整理</button><button v-else-if="lastCaptured.organizationStatus === 'pending'" class="button button-primary" @tap="editQuestion(lastCaptured.id, true)"><AppIcon name="sparkles" :size="15" tone="white" /><text>AI 整理</text></button><button v-else class="button button-primary" @tap="openQuestion(lastCaptured.id)">查看题目</button></view>
            <button class="icon-button capture-receipt-dismiss" aria-label="关闭收录成功提示" @tap="lastCapturedId = ''"><AppIcon name="x" :size="16" tone="muted" /></button>
          </view>
          <view class="home-collection">
            <view class="pending-inbox panel">
              <view class="pending-inbox-icon"><AppIcon name="folder-open" :size="24" tone="orange" /></view>
              <view class="pending-inbox-copy"><view><text class="pending-inbox-title">待整理</text><text class="pending-inbox-count">{{ pendingQuestions.length }}</text></view><text>{{ pendingQuestions.length ? '这些题目已经保存，可手动补充或使用 AI 整理。' : '暂时没有待整理题目，随时收录下一道。' }}</text></view>
              <button class="pending-inbox-button" aria-label="查看待整理错题" @tap="openPending"><text>{{ pendingQuestions.length ? '去整理' : '查看' }}</text><AppIcon name="arrow-right" :size="16" tone="green" /></button>
            </view>
            <view class="recent-heading"><view><text class="section-title">最近收录</text><text class="section-caption">刚保存的题目在这里，整理进度一目了然</text></view><button class="text-button" @tap="navigate('library')"><text>查看全部</text><AppIcon name="arrow-up-right" :size="15" tone="green" /></button></view><view class="home-filters"><scroll-view scroll-x class="home-subject-scroll" :show-scrollbar="false"><view class="home-subject-tabs"><button v-for="s in ['全部', ...homeSubjects]" :key="s" class="home-filter" :class="{ active: homeSubject === s }" @tap="homeSubject = s as Subject | '全部'">{{ s }}<view v-if="homeSubject === s" /></button></view></scroll-view><view class="home-filter-right"><AppIcon name="grid-2x2" :size="15" tone="muted" /><text>按收录时间</text></view></view>
            <view v-if="recent.length" class="question-grid home-question-grid"><QuestionCard v-for="q in recent" :key="q.id" :question="q" @open="openQuestion" @favorite="store.toggleFavorite" @process="editQuestion" /></view><view v-else class="empty-state"><AppIcon name="book-open" :size="35" tone="muted" /><text>{{ homeSubject === '全部' ? '还没有收录题目，添加文字或题图就能开始。' : '这个科目还没有收录题目，试试其他科目。' }}</text><button class="button button-primary" @tap="newQuestion()">收录错题</button></view>
          </view>
          <button class="learning-overview-toggle panel" :aria-expanded="learningOverviewOpen" aria-controls="home-learning-overview" @tap="learningOverviewOpen = !learningOverviewOpen"><view class="learning-overview-toggle-copy"><AppIcon name="chart-no-axes-combined" :size="20" tone="green" /><view><text>学习概览</text><text>{{ stats.dueToday ? `今日 ${stats.dueToday} 道待复习 · ` : '' }}累计收录 {{ stats.total }} 道，看看这段时间的进步</text></view></view><view class="learning-overview-toggle-state" :class="{ expanded: learningOverviewOpen }"><text>{{ learningOverviewOpen ? '收起' : '展开' }}</text><AppIcon name="chevron-down" :size="17" tone="muted" /></view></button>
          <view v-if="learningOverviewOpen" id="home-learning-overview" class="home-learning-overview">
            <view class="metrics-row"><view class="overview-metric"><view class="metric-label"><view class="metric-icon metric-icon-green"><AppIcon name="book-open" :size="16" tone="green" /></view><text>累计收录</text></view><view class="metric-number-row"><text class="metric-number">{{ stats.total }}</text><text class="metric-unit">道错题</text></view><text class="metric-caption">{{ stats.pending }} 道待整理 · {{ stats.ready }} 道已整理</text></view><view class="overview-metric"><view class="metric-label"><view class="metric-icon metric-icon-orange"><AppIcon name="check-check" :size="16" tone="orange" /></view><text>已经掌握</text></view><view class="metric-number-row"><text class="metric-number">{{ stats.mastered }}</text><text class="metric-unit">道难题</text></view><view class="metric-progress"><view :style="{ width: `${stats.ready ? stats.mastered / stats.ready * 100 : 0}%` }" /></view></view><view class="overview-metric"><view class="metric-label"><view class="metric-icon metric-icon-soft"><AppIcon name="flame" :size="16" tone="orange" /></view><text>连续学习</text></view><view class="metric-number-row"><text class="metric-number">{{ stats.streak }}</text><text class="metric-unit">天坚持</text><text class="streak-badge">KEEP GOING</text></view><text class="metric-caption">小小的坚持，会有大大的回响</text></view></view>
            <view class="learning-review-entry"><view><text class="section-title">{{ stats.dueToday ? '给今天，留一刻复习。' : '把收录的题，慢慢变成会做的题。' }}</text><text class="section-caption">{{ stats.dueToday ? `${stats.dueToday} 道题，等待再想一遍` : state.profile.goal || '也可以选择几道题，主动巩固一下' }}</text></view><button class="button button-primary" @tap="startDaily"><AppIcon name="refresh-cw" :size="16" tone="white" /><text>{{ stats.dueToday ? '开始今日复习' : '开始自主练习' }}</text></button></view>
            <view class="dashboard-aside home-learning-panels">
            <view class="today-panel panel"><view class="aside-heading"><text class="section-title">我的学习日历</text><view class="calendar-month"><text>{{ now.getMonth() + 1 }}月</text><AppIcon name="calendar-days" :size="14" tone="muted" /></view></view><view class="week-strip"><view v-for="d in week" :key="d.date" class="week-day" :class="{ today: d.today }"><text class="week-label">{{ d.label }}</text><text class="week-number">{{ d.day }}</text><view class="week-dot" :class="{ has: reviewScheduled.some(q => q.nextReviewDate === d.date) }" /></view></view><view class="today-task-heading"><view><view class="orange-dot" /><text>今日待复习</text><text class="today-task-count">{{ stats.dueToday }}</text></view><text class="muted">不急，一题一题来</text></view><view v-if="dueQuestions.length" class="agenda-list"><view v-for="(q, index) in dueQuestions.slice(0, 3)" :key="q.id" class="agenda-item" @tap="openQuestion(q.id)"><view class="agenda-index">{{ String(index + 1).padStart(2, '0') }}</view><view class="agenda-text"><text>{{ q.title }}</text><text>{{ q.subject }} · {{ q.tags[0] || '温故知新' }}</text></view><AppIcon name="chevron-right" :size="14" tone="muted" /></view></view><view v-else class="agenda-empty"><AppIcon name="check-check" :size="25" tone="green" /><text>{{ stats.todayReviewCount ? '今天的复习已完成' : '今天暂无到期复习' }}</text></view><button class="today-start" @tap="stats.dueToday ? practice(dueQuestions.map(q => q.id), '今日复习') : navigate('review')"><text>{{ stats.dueToday ? `去复习这 ${stats.dueToday} 道题` : '安排下一次复习' }}</text><AppIcon name="arrow-right" :size="16" tone="green" /></button></view>
            <view class="activity-panel panel"><view class="aside-heading"><text class="section-title">这一周的认真</text><view class="activity-tag"><view /><text>持续生长中</text></view></view><view class="mini-chart"><view v-for="(d, index) in stats.weeklyHistory" :key="d.date" class="mini-chart-day"><view class="mini-bar-track"><view class="mini-bar" :class="{ current: index === 6 }" :style="{ height: `${Math.max(5, d.reviewed / activityMaximum * 70)}px` }" /></view><text>{{ index === 6 ? '今' : d.label }}</text></view></view><view class="activity-footer"><text>累计完成 {{ stats.reviewCount }} 次复习</text><button class="text-button" @tap="navigate('insights')"><AppIcon name="arrow-up-right" :size="15" tone="green" /></button></view></view>
            <view class="daily-note"><AppIcon name="quote" :size="23" tone="green" /><text class="daily-quote">比做对更重要的，<text>是弄懂为什么。</text></text><text class="daily-quote-en">Understanding is a kind of progress.</text><view class="daily-note-bottom"><view /><text>拾题 · 今日一言</text></view></view>
            <button class="quick-add-note" @tap="navigate('notes')"><view class="quick-note-icon"><AppIcon name="notebook-pen" :size="21" tone="orange" /></view><view><text>灵感，别让它溜走</text><text>把刚想通的知识点记下来</text></view><AppIcon name="arrow-up-right" :size="16" tone="muted" /></button>
            </view>
          </view>
          <view class="home-bottom-note"><view class="small-brand-mark">拾</view><text>把错题留在这里，把进步带去下一次。</text><text class="home-bottom-en">LESS MISTAKES. MORE POSSIBILITIES.</text></view>
        </template>

        <NotebookLibrary v-else-if="['library', 'favorites', 'recycle'].includes(page)" :key="libraryVisitKey" :scope="page === 'favorites' ? 'favorites' : page === 'recycle' ? 'recycle' : 'library'" v-model:search="search" v-model:collection="collectionFilter" v-model:tag="activeTag" @open="openQuestion" @edit="editQuestion" @add="newQuestion()" />

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
      <button v-if="page !== 'recycle'" class="floating-add" aria-label="快捷添加错题" @tap="newQuestion()"><AppIcon name="plus" :size="25" tone="white" /></button>
    </view>

    <view class="mobile-bottom"><button :class="{ active: page === 'home' }" @tap="navigate('home')"><AppIcon name="house" :tone="page === 'home' ? 'green' : 'muted'" :size="21" /><text>首页</text></button><button :class="{ active: page === 'library' }" @tap="navigate('library')"><AppIcon name="book-open" :tone="page === 'library' ? 'green' : 'muted'" :size="21" /><text>错题本</text></button><button class="mobile-capture" @tap="newQuestion()"><view><AppIcon name="plus" :size="24" tone="white" /></view><text>收录</text></button><button :class="{ active: page === 'review' }" @tap="navigate('review')"><AppIcon name="calendar-days" :tone="page === 'review' ? 'green' : 'muted'" :size="21" /><text>复习</text></button><button @tap="mobileMenu = true"><AppIcon name="grid-2x2" :size="21" tone="muted" /><text>工作台</text></button></view>
    <DataManager v-if="dataManagerOpen" @close="dataManagerOpen = false" @restored="onDataRestored" />
    <QuickCapture v-if="captureOpen" :initial-mode="captureInitialMode" @close="captureOpen = false" @saved="onCaptured" />
    <BatchCapture v-if="batchCaptureOpen" @close="batchCaptureOpen = false" @saved="onBatchCaptured" />
    <QuestionEditor v-if="editorOpen" :question="editingQuestion" :auto-generate="editorStartAi" :focus-remark="editorFocusRemark" @close="editorOpen = false" @saved="onSaved" />
    <QuestionDetail v-if="detailId" :id="detailId" @close="detailId = ''" @edit="editQuestion" @edit-remark="editQuestion($event, false, true)" @practice="practice" @search-tag="searchByTag" />
    <ReviewSession v-if="reviewIds.length" :ids="reviewIds" :title="reviewTitle" @close="reviewIds = []" />
    <view v-if="profileOpen" class="modal-overlay" @tap.self="profileOpen = false"><view class="modal-window profile-window"><view class="modal-header"><view><text class="eyebrow">YOUR OWN PACE</text><text class="modal-title">你的学习空间</text></view><button class="icon-button" aria-label="关闭资料" @tap="profileOpen = false"><AppIcon name="x" /></button></view><scroll-view scroll-y class="modal-scroll"><view class="profile-content"><view class="profile-large-avatar">{{ profileDraft.nickname.slice(0, 1) || '拾' }}</view><text class="field-label">怎么称呼你</text><input v-model="profileDraft.nickname" class="form-input" maxlength="12" placeholder="你的昵称" /><view class="form-columns"><view><text class="field-label">学习阶段</text><input v-model="profileDraft.grade" class="form-input" maxlength="20" placeholder="例如：高二" /></view><view><text class="field-label">学校或学习方向</text><input v-model="profileDraft.school" class="form-input" maxlength="20" placeholder="例如：我的自习室" /></view></view><text class="field-label">给自己的小目标</text><input v-model="profileDraft.goal" class="form-input" maxlength="60" placeholder="不急，每天多懂一点" /><view class="local-data-info"><AppIcon name="shield-check" :size="19" tone="green" /><view><text>{{ storageStatus.cloud ? '属于你的云端学习空间' : '属于你的本地学习空间' }}</text><text>{{ storageStatus.cloud ? '题目、题图和复习记录保存在服务器。电脑与手机登录同一账号，即可继续查看；切换设备后刷新页面获取最新档案。' : '题目、笔记和记录保存在当前浏览器数据库。建议定期导出备份；如需跨设备使用，可前往服务器版。' }}</text></view></view><button class="profile-backup-link" @tap="openDataManager"><AppIcon name="download" :size="16" tone="green" /><text>备份与恢复我的学习档案</text><AppIcon name="chevron-right" :size="14" tone="muted" /></button><view v-if="storageStatus.cloud" class="cloud-account"><text class="field-label">账号：{{ storageStatus.user?.Username }}</text><input v-model="oldPassword" class="form-input" password placeholder="原登录密码" maxlength="128" /><input v-model="newPassword" class="form-input" password placeholder="新密码，至少10位" maxlength="128" /><button class="button button-quiet" :loading="passwordSaving" :disabled="!oldPassword || newPassword.length < 10" @tap="saveAccountPassword">更新登录密码</button><button v-if="storageStatus.expired" class="button button-quiet" :disabled="!oldPassword" @tap="renewSession">使用原密码恢复登录</button><button class="text-button" @tap="signOut">退出当前账号</button></view><button v-else class="button button-quiet" @tap="openServerWorkspace">前往服务器云端版<AppIcon name="arrow-up-right" :size="15" tone="green" /></button><button class="text-button reset-demo" @tap="resetDemo"><AppIcon name="refresh-cw" :size="14" tone="muted" /><text>重新载入示例数据</text></button></view></scroll-view><view class="modal-footer"><button class="button button-quiet" @tap="profileOpen = false">取消</button><button class="button button-primary" @tap="saveProfile">保存个人信息</button></view></view></view>
    <view v-if="helpOpen" class="modal-overlay" @tap.self="helpOpen = false"><view class="modal-window help-window"><view class="modal-header"><text class="modal-title">把错题，慢慢变成会做的题</text><button class="icon-button" aria-label="关闭指南" @tap="helpOpen = false"><AppIcon name="x" /></button></view><view class="help-content"><view v-for="(item, index) in [{title:'收录与整理',text:'添加文字或题图，保存后即已收录。科目、标签和解析可以稍后补充，也可使用 AI 整理并核对结果。'}, {title:'主动回忆',text:'先独立重做，再查看解答，诚实记录掌握情况。'}, {title:'安排下一次',text:'在题目档案选择复习日期，首页学习概览会列出到期任务。'}, {title:'串起知识',text:'把相关题目连到笔记，也可以自主组卷、下载Word练习。'}]" :key="index" class="help-step"><text>{{ String(index + 1).padStart(2, '0') }}</text><view><text>{{ item.title }}</text><text>{{ item.text }}</text></view></view><button class="button button-primary" @tap="helpOpen = false">开始我的学习</button></view></view></view>
  </view>
  </view>
</template>

<style scoped>
.capture-home-heading { margin-bottom: 22px; }
.capture-home-heading .today-label { padding-top: 0; }
.capture-home-panel { position: relative; overflow: hidden; border-radius: 20px; padding: 28px 32px 18px; background: #204d38; box-shadow: 0 10px 28px #204d380a; }
.capture-home-panel::after { content: ''; position: absolute; width: 320px; height: 320px; border: 1px solid #bbd2ac1c; border-radius: 50%; right: -130px; top: -180px; pointer-events: none; }
.capture-home-copy { position: relative; z-index: 1; }
.capture-home-kicker { display: block; color: #c3d4b2; font-size: 11px; letter-spacing: 1px; }
.capture-home-title { display: block; color: #f2f6e9; font-size: 30px; font-weight: 600; letter-spacing: -.5px; margin-top: 6px; line-height: 1.4; }
.capture-home-description { display: block; color: #b1c6a7; font-size: 12px; line-height: 1.8; margin-top: 6px; }
.capture-home-actions { position: relative; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 23px; z-index: 1; }
.capture-home-action { width: 100%; min-width: 0; margin: 0; display: flex; align-items: center; gap: 14px; padding: 18px 20px; border: 1px solid #ffffff2e; border-radius: 13px; text-align: left; line-height: 1.5; transition: transform 160ms ease, background 160ms ease; }
.capture-home-action:hover { transform: translateY(-2px); }
.capture-home-image { background: #eef3df; color: #28583b; border-color: #eef3df; }
.capture-home-image:hover { background: #f6f8ec; }
.capture-home-manual { background: #ffffff0e; color: #eef4e3; }
.capture-home-manual:hover { background: #ffffff1b; }
.capture-home-action-icon { width: 45px; height: 45px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: #204d380b; border: 1px solid #204d3809; border-radius: 12px; }
.capture-home-manual .capture-home-action-icon { background: #ffffff0b; border-color: #ffffff14; }
.capture-home-action-copy { flex: 1; min-width: 0; }
.capture-home-action-copy > text:first-child { display: block; font-size: 16px; font-weight: 600; }
.capture-home-action-copy > text:last-child { display: block; font-size: 11px; color: #72876a; margin-top: 4px; line-height: 1.7; }
.capture-home-manual .capture-home-action-copy > text:last-child { color: #afc2a5; }
.capture-home-batch-row { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 14px; color: #a6bd9b; font-size: 10px; }
.capture-home-batch { display: flex; align-items: center; gap: 6px; margin: 0; padding: 5px 0 5px 4px; background: none; color: #e2ecd6; font-size: 11px; }
.capture-receipt { display: grid; grid-template-columns: 48px minmax(0, 1fr) auto 22px; align-items: center; gap: 14px; padding: 17px 18px; margin-top: 16px; background: #f3f8ec; border-color: #dbe6cf; }
.capture-receipt-thumbnail, .capture-receipt-symbol { width: 48px; height: 48px; border-radius: 10px; background: #e6efdb; }
.capture-receipt-symbol { display: flex; align-items: center; justify-content: center; }
.capture-receipt-copy { min-width: 0; }
.capture-receipt-title { display: block; font-size: 13px; font-weight: 600; color: #3d6b47; line-height: 1.7; }
.capture-receipt-preview { display: block; font-size: 11px; color: #829274; margin-top: 3px; line-height: 1.8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.capture-receipt-actions { display: flex; align-items: center; gap: 8px; }
.capture-receipt-actions .button { min-height: 36px; padding: 8px 12px; font-size: 11px; white-space: nowrap; }
.capture-receipt-dismiss { width: 22px; height: 28px; margin: 0; }
.home-collection { min-width: 0; }
.home-collection .pending-inbox { margin: 17px 0 0; }
.home-collection .recent-heading { margin-top: 25px; }
.learning-overview-toggle { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 26px 0 0; padding: 19px 22px; text-align: left; }
.learning-overview-toggle-copy { display: flex; align-items: center; gap: 13px; min-width: 0; }
.learning-overview-toggle-copy > view { min-width: 0; }
.learning-overview-toggle-copy > view > text:first-child { display: block; font-size: 14px; font-weight: 600; color: #496847; line-height: 1.5; }
.learning-overview-toggle-copy > view > text:last-child { display: block; font-size: 11px; color: #94a187; line-height: 1.8; margin-top: 4px; }
.learning-overview-toggle-state { display: flex; align-items: center; gap: 7px; flex-shrink: 0; color: #94a187; font-size: 11px; }
.learning-overview-toggle-state.expanded > .app-icon { transform: rotate(180deg); }
.home-learning-overview > .metrics-row { margin-top: 16px; }
.learning-review-entry { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin: 18px 0; padding: 20px 22px; background: #edf3e4; border-radius: 13px; }
.learning-review-entry .section-title { font-size: 14px; }
.learning-review-entry .section-caption { color: #8e9e7c; }
.learning-review-entry .button { flex-shrink: 0; font-size: 12px; }
.home-learning-panels { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 18px; }
.home-learning-panels .today-panel { grid-row: span 2; }
.home-learning-panels .quick-add-note { grid-column: 1 / -1; }
@media (max-width: 780px) {
  .capture-home-panel { padding: 25px 24px 16px; }
  .capture-home-action { padding: 16px; gap: 11px; }
  .capture-home-action-copy > text:first-child { font-size: 14px; }
  .capture-home-action-copy > text:last-child { font-size: 10px; }
  .capture-home-action-icon { width: 39px; height: 39px; }
  .capture-receipt { grid-template-columns: 44px minmax(0, 1fr) 22px; gap: 11px; }
  .capture-receipt-thumbnail, .capture-receipt-symbol { width: 44px; height: 44px; }
  .capture-receipt-actions { grid-column: 2; grid-row: 2; }
  .capture-receipt-dismiss { grid-column: 3; grid-row: 1; align-self: start; }
}
@media (max-width: 600px) {
  .capture-home-heading { gap: 8px; margin-bottom: 19px; }
  .capture-home-heading .today-label { display: none; }
  .capture-home-panel { border-radius: 16px; padding: 22px 18px 14px; }
  .capture-home-kicker { font-size: 10px; }
  .capture-home-title { font-size: 26px; margin-top: 5px; }
  .capture-home-description { font-size: 11px; line-height: 1.9; margin-top: 5px; }
  .capture-home-actions { gap: 10px; margin-top: 18px; }
  .capture-home-action { position: relative; flex-direction: column; align-items: flex-start; gap: 10px; padding: 15px 12px 14px; min-height: 129px; border-radius: 12px; }
  .capture-home-action > .app-icon { position: absolute; top: 16px; right: 12px; width: 16px !important; height: 16px !important; }
  .capture-home-action-icon { width: 36px; height: 36px; border-radius: 10px; }
  .capture-home-action-icon > .app-icon { width: 22px !important; height: 22px !important; }
  .capture-home-action-copy { flex: auto; width: 100%; }
  .capture-home-action-copy > text:first-child { font-size: 13px; }
  .capture-home-action-copy > text:last-child { font-size: 10px; line-height: 1.7; }
  .capture-home-batch-row { justify-content: space-between; gap: 7px; font-size: 9px; margin-top: 10px; }
  .capture-home-batch { font-size: 10px; }
  .capture-receipt { padding: 14px 13px; border-radius: 12px; margin-top: 13px; row-gap: 10px; }
  .capture-receipt-title { font-size: 12px; }
  .capture-receipt-preview { font-size: 10px; }
  .capture-receipt-actions { grid-column: 1 / 3; width: 100%; }
  .capture-receipt-actions .button { flex: 1; }
  .home-collection .pending-inbox { margin-top: 14px; }
  .home-collection .recent-heading { margin-top: 23px; }
  .learning-overview-toggle { padding: 16px; gap: 10px; margin-top: 22px; }
  .learning-overview-toggle-copy { gap: 10px; }
  .learning-overview-toggle-copy > view > text:first-child { font-size: 13px; }
  .learning-overview-toggle-copy > view > text:last-child { font-size: 10px; }
  .learning-overview-toggle-state { font-size: 10px; gap: 4px; }
  .learning-review-entry { padding: 17px 16px; flex-wrap: wrap; gap: 14px; }
  .learning-review-entry .button { width: 100%; }
  .home-learning-panels { grid-template-columns: minmax(0, 1fr); gap: 15px; }
  .home-learning-panels .today-panel { grid-row: auto; }
}
@media (prefers-reduced-motion: reduce) { .capture-home-action { transition: none; } .capture-home-action:hover { transform: none; } }
</style>
