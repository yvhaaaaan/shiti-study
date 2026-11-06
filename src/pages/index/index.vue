<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import BrandMark from '../../components/BrandMark.vue'
import AppIcon from '../../components/AppIcon.vue'
import StudyAccess from '../../components/StudyAccess.vue'
import { logout, changePassword, reauthenticate } from '../../services/studyStorage'
import NotebookLibrary from '../../components/NotebookShelf.vue'
import QuestionEditor from '../../components/QuestionEditor.vue'
import QuickCapture from '../../components/QuickCapture.vue'
import BatchCapture from '../../components/BatchCapture.vue'
import QuestionDetail from '../../components/QuestionDetail.vue'
import ReviewSession from '../../components/ReviewSession.vue'
import KnowledgeView from '../../components/KnowledgeView.vue'
import InsightsView from '../../components/InsightsView.vue'
import PapersView from '../../components/PapersView.vue'
import DataManager from '../../components/DataManager.vue'
import HomeLearningEntry from '../../components/HomeLearningEntry.vue'
import ForgeCaptureStation from '../../components/ForgeCaptureStation.vue'
import PracticeHub from '../../components/PracticeHub.vue'
import { useStudyStore } from '../../domain/store'
import type { Question } from '../../domain/types'
import { DAILY_QUOTES } from '../../domain/dailyQuotes'

type Page = 'home' | 'library' | 'review' | 'notes' | 'papers' | 'insights' | 'favorites' | 'recycle'
const store = useStudyStore()
const { state, questions, pendingQuestions, readyQuestions, dueQuestions, stats } = store
const storageStatus = store.storageStatus
const oldPassword = ref('')
const newPassword = ref('')
const passwordSaving = ref(false)
let dayTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => { store.refreshDay(); dayTimer = setInterval(() => { clock.value = new Date(); store.refreshDay() }, 60000); void store.initialize().catch(() => {}) })
onBeforeUnmount(() => { if (dayTimer) clearInterval(dayTimer) })
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
const emberSeeds = Array.from({ length: 20 }, (_, index) => ({
  id: index,
  left: (index * 37 + 11) % 100,
  delay: -((index * 1.7) % 9),
  duration: 10 + (index % 5),
  size: 2 + (index % 3),
  drift: (index % 2 ? 1 : -1) * (12 + (index % 4) * 7),
}))
const search = ref('')
const activeTag = ref('')
const detailId = ref('')
const editorOpen = ref(false)
const editorStartAi = ref(false)
const editorFocusRemark = ref(false)
const captureOpen = ref(false)
const batchCaptureOpen = ref(false)
const captureInitialMode = ref<'manual' | 'image'>('manual')
const captureNotebookId = ref<string | undefined>()
const captureOrigin = ref<Page>('home')
const lastCapturedId = ref('')
const lastCapturedCount = ref(1)
const materialAdded = ref(0)
const collectionFilter = ref<'all' | 'pending' | 'ready'>('all')
const libraryVisitKey = ref(0)
const editingQuestion = ref<Question | undefined>()
const editorOrigin = ref<Page>('home')
const reviewIds = ref<string[]>([])
const reviewTitle = ref('')
const mobileMenu = ref(false)
const profileOpen = ref(false)
const dataManagerOpen = ref(false)
const helpOpen = ref(false)
const profileDraft = ref({ ...state.profile })
const navItems: { id: Page; label: string; icon: string }[] = [
  { id: 'home', label: '首页', icon: 'layout-dashboard' },
  { id: 'library', label: '我的错题本', icon: 'book-open' },
  { id: 'review', label: '练习', icon: 'calendar-days' },
  { id: 'notes', label: '知识笔记', icon: 'notebook-pen' },
  { id: 'papers', label: '组卷打印', icon: 'files' },
  { id: 'insights', label: '成长记录', icon: 'chart-no-axes-combined' },
]
const titles: Record<Page, string> = { home: '首页', library: '我的错题本', review: '练习', notes: '知识笔记', papers: '组卷打印', insights: '成长记录', favorites: '我的收藏', recycle: '回收站' }
const clock = ref(new Date())
const dateLabel = computed(() => { const now = clock.value; return `${now.getMonth() + 1}月${now.getDate()}日，星期${'日一二三四五六'[now.getDay()]}` })
const greeting = computed(() => { const hour = clock.value.getHours(); return hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好' })
const dailyQuote = computed(() => {
  const now = clock.value
  const day = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000)
  const random = (day * 9301 + 49297) % 233280
  const index = random % DAILY_QUOTES.length
  return { text: DAILY_QUOTES[index]!, index }
})
const lastCaptured = computed(() => questions.value.find(question => question.id === lastCapturedId.value && !question.deletedAt))
function navigate(target: Page) { store.refreshDay(); page.value = target; libraryVisitKey.value++; mobileMenu.value = false; search.value = ''; activeTag.value = ''; collectionFilter.value = 'all'; nextTick(() => uni.pageScrollTo({ scrollTop: 0, duration: 0 })) }
function openPending() { navigate('library'); collectionFilter.value = 'pending' }
function globalSearch() { if (search.value.trim()) { mobileMenu.value = false; page.value = 'library'; libraryVisitKey.value++; collectionFilter.value = 'all'; activeTag.value = '' } }
function openQuestion(id: string) { detailId.value = id }
function newQuestion(mode: 'manual' | 'image' = 'manual', notebookId?: string) { captureOrigin.value = page.value; captureNotebookId.value = notebookId; captureInitialMode.value = mode; captureOpen.value = true; mobileMenu.value = false }
function addToNotebook(notebookId?: string) { newQuestion('manual', notebookId) }
function openBatch(notebookId?: string) { captureNotebookId.value = notebookId; captureOrigin.value = page.value; batchCaptureOpen.value = true }
function onCaptured(id: string, intent: 'later' | 'ai' = 'later') {
  captureOpen.value = false
  lastCapturedId.value = id
  lastCapturedCount.value = 1
  if (!(captureOrigin.value === 'library' && captureNotebookId.value && questions.value.find(q => q.id === id)?.notebookId === captureNotebookId.value)) navigate('home')
  else uni.showToast({ title: '已收录到当前错题本', icon: 'none' })
  if (page.value === 'home') void nextTick(() => { materialAdded.value++ })
  if (intent === 'ai') editQuestion(id, true)
}
function onBatchCaptured(ids: string[]) {
  batchCaptureOpen.value = false
  if (!ids.length) return
  lastCapturedId.value = ids[0]
  lastCapturedCount.value = ids.length
  if (!(captureOrigin.value === 'library' && captureNotebookId.value && ids.every(id => questions.value.find(q => q.id === id)?.notebookId === captureNotebookId.value))) navigate('home')
  uni.showToast({ title: `已收录 ${ids.length} 道题`, icon: 'success' })
  if (page.value === 'home') void nextTick(() => { materialAdded.value++ })
}
function continueAdding() { if (lastCapturedCount.value > 1) openBatch(captureNotebookId.value); else newQuestion(captureInitialMode.value, captureNotebookId.value) }
function editQuestion(id: string, startAi = false, focusRemark = false) { editorOrigin.value = page.value; editingQuestion.value = questions.value.find(q => q.id === id); if (!editingQuestion.value) return; editorStartAi.value = startAi; editorFocusRemark.value = focusRemark; detailId.value = ''; editorOpen.value = true }
function onSaved(id: string) {
  editorOpen.value = false
  if (editorOrigin.value === 'review') {
    detailId.value = ''
    uni.showToast({ title: '已保存，可在练习页继续选题', icon: 'none' })
    return
  }
  detailId.value = id
}
function practice(ids: string[], title = '专注复习') {
  store.refreshDay()
  if (!ids.length) return uni.showToast({ title: '请先选择具备参考答案的题目，再开始测试', icon: 'none' })
  const valid = [...new Set(ids)].filter(id => store.practiceQuestions.value.some(q => q.id === id))
  if (!valid.length) return uni.showToast({ title: '请先完成题目整理并补充参考答案', icon: 'none' })
  if (valid.length < ids.length) uni.showToast({ title: `已略过${ids.length - valid.length}道尚未满足测试条件的题目`, icon: 'none' })
  if (valid.length > 10) uni.showToast({ title: '本轮先练前 10 道，其余题目可在下一轮继续选择', icon: 'none' })
  detailId.value = ''; reviewIds.value = valid.slice(0, 10); reviewTitle.value = title
}
async function notifySaved(title: string): Promise<boolean> { try { await store.flushPersistence(); uni.showToast({ title, icon: 'success' }); return true } catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '保存尚未完成，当前内容仍保留', icon: 'none', duration: 3500 }); return false } }
function searchByTag(tag: string) { navigate('library'); activeTag.value = tag; detailId.value = '' }


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
  <view v-else :class="['app-shell', `page-${page}`]">
    <view v-if="!['library', 'favorites', 'recycle'].includes(page)" class="ember-field" aria-hidden="true"><view v-for="ember in emberSeeds" :key="ember.id" class="ember" :style="{ left: `${ember.left}%`, animationDelay: `${ember.delay}s`, animationDuration: `${ember.duration}s`, width: `${ember.size}px`, height: `${ember.size}px`, '--ember-drift': `${ember.drift}px` }" /></view>
    <view v-if="mobileMenu" class="navigation-backdrop" aria-label="关闭导航菜单" @tap="mobileMenu = false" />
    <view :class="{ 'drawer-open': mobileMenu }" id="study-navigation" class="sidebar navigation-drawer" role="dialog" aria-modal="true" aria-label="我的锻造台导航">
      <view class="drawer-heading"><view class="drawer-brand"><BrandMark /><view class="drawer-brand-copy"><text>打铁匠</text><text>把错题，炼成本领</text></view></view><button tabindex="0" class="icon-button drawer-close" aria-label="关闭菜单" @tap="mobileMenu = false"><AppIcon name="x" :size="20" tone="muted" /></button></view>
      <scroll-view scroll-y class="drawer-content">
      <view class="sidebar-workspace"><view class="workspace-avatar"><AppIcon name="graduation-cap" :size="18" tone="green" /></view><view><text class="workspace-title">我的学习工坊</text><text class="workspace-sub">一锤一炼，把不会变成会</text></view><AppIcon name="chevron-down" :size="13" tone="muted" /></view>
      <text class="nav-group-label">我的锻造台</text>
      <view class="nav-list"><button v-for="nav in navItems" :key="nav.id" tabindex="0" class="nav-item" :class="{ active: page === nav.id }" @tap="navigate(nav.id)"><AppIcon :name="nav.icon" :size="19" :tone="page === nav.id ? 'green' : 'muted'" /><text>{{ nav.label }}</text><text v-if="nav.id === 'library'" class="nav-count">{{ stats.total }}</text><text v-if="nav.id === 'review' && stats.dueToday" class="nav-count nav-count-warm">{{ stats.dueToday }}</text><view v-if="page === nav.id" class="nav-active-dot" /></button></view>
      <view class="nav-divider" /><text class="nav-group-label">我的整理</text><button tabindex="0" class="nav-item" :class="{ active: page === 'favorites' }" @tap="navigate('favorites')"><AppIcon name="bookmark" :size="19" :tone="page === 'favorites' ? 'green' : 'muted'" /><text>我的收藏</text><text class="nav-count">{{ stats.favorites }}</text></button><button tabindex="0" class="nav-item" :class="{ active: page === 'recycle' }" @tap="navigate('recycle')"><AppIcon name="trash-2" :size="19" :tone="page === 'recycle' ? 'green' : 'muted'" /><text>回收站</text></button>
      <view class="sidebar-bottom"><view class="sidebar-note"><view class="tiny-sparkle">✦</view><text class="sidebar-note-title">不必一下子很厉害</text><text class="sidebar-note-sub">每天，往前一小步就好。</text><view class="note-lines"><view /><view /><view /></view></view><button tabindex="0" class="sidebar-help data-shortcut" @tap="openDataManager"><AppIcon name="shield-check" :size="16" tone="green" /><text>备份与恢复</text><AppIcon name="arrow-up-right" :size="14" tone="muted" /></button><button tabindex="0" class="sidebar-help" @tap="openHelp"><AppIcon name="circle-alert" :size="16" tone="muted" /><text>使用指南</text><AppIcon name="arrow-up-right" :size="14" tone="muted" /></button><button tabindex="0" class="profile-button" @tap="openProfile"><view class="profile-avatar">{{ state.profile.nickname.slice(0, 1) }}</view><view><text class="profile-name">{{ state.profile.nickname }}</text><text class="profile-school">{{ state.profile.grade }} · {{ state.profile.school }}</text></view><AppIcon name="settings" :size="17" tone="muted" /></button></view>
      </scroll-view>
    </view>

    <view class="app-main"><view class="topbar"><view class="header-left"><button tabindex="0" class="icon-button navigation-toggle" :class="{ 'is-open': mobileMenu }" :aria-label="mobileMenu ? '关闭菜单' : '打开菜单'" :aria-expanded="mobileMenu" aria-controls="study-navigation" @tap="mobileMenu = !mobileMenu"><AppIcon :name="mobileMenu ? 'x' : 'menu'" :size="21" :tone="mobileMenu ? 'green' : 'ink'" /></button><button tabindex="0" class="brand header-brand" aria-label="打铁匠，返回学习概览" @tap="navigate('home')"><BrandMark /><view><text class="brand-word">打铁匠<text class="brand-word-en">THE FORGE</text></text><text class="brand-tagline">把错题，炼成本领</text></view></button><view class="brand-divider" /><view class="breadcrumb"><AppIcon class="breadcrumb-home" name="house" :size="15" tone="muted" /><text class="breadcrumb-slash">/</text><text>{{ titles[page] }}</text></view></view><view class="topbar-right"><view class="global-search"><AppIcon name="search" :size="16" tone="muted" /><input v-model="search" placeholder="搜索错题、知识点…" confirm-type="search" @confirm="globalSearch" @input="globalSearch" /><text class="search-label">搜索</text></view><button class="icon-button notification-button" aria-label="查看复习提醒" @tap="navigate('review')"><AppIcon name="bell" :size="20" /><view v-if="stats.dueToday" class="notification-dot" /></button><view class="header-divider" /><button class="header-avatar" aria-label="个人资料" @tap="openProfile">{{ state.profile.nickname.slice(0, 1) }}</button></view></view>

      <view v-if="state.storageError" class="storage-warning"><AppIcon name="circle-alert" :size="16" tone="orange" /><text>{{ state.storageError }}</text><button v-if="storageStatus.expired" class="text-button" @tap="openProfile">重新登录</button><button class="text-button" @tap="store.retryPersistence().catch(() => {})">重试保存</button></view><view v-else-if="storageStatus.cloud" class="cloud-save-status"><AppIcon :name="storageStatus.saving ? 'loader-circle' : 'cloud-check'" :size="14" tone="green" /><text>{{ storageStatus.saving ? '正在保存到云端…' : '云端档案 · 已连接' }}</text></view>
      <view class="page-content">
        <template v-if="page === 'home'">
          <view class="page-heading home-heading capture-home-heading"><view><view class="greeting-line"><text class="eyebrow">A LITTLE BETTER, EVERY DAY</text><view class="greeting-star">✦</view></view><text class="page-title">{{ greeting }}，{{ state.profile.nickname }}<text class="greeting-comma">。</text></text><text class="page-description">收下错题，打磨属于自己的理解。</text></view><view class="today-label"><AppIcon name="calendar-days" :size="15" tone="muted" /><text>{{ dateLabel }}</text></view></view>
          <HomeLearningEntry @notebook="navigate('library')" @review="navigate('review')" />
          <ForgeCaptureStation :trigger="materialAdded" :added-count="lastCapturedCount" @capture="newQuestion($event)" @batch="openBatch()" />
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
            <view class="daily-quote-card" aria-live="polite"><view class="daily-quote-mark">“</view><view class="daily-quote-copy"><text class="daily-quote-kicker">送给那位同学的 · 每日一句</text><text class="daily-quote-text">{{ dailyQuote.text }}</text><text class="daily-quote-meta">今日第 {{ dailyQuote.index + 1 }} 句 · 明天会遇见新的一句</text></view><AppIcon name="sparkles" :size="19" tone="orange" /></view>
          </view>
          <view class="home-bottom-note"><AppIcon name="hammer" :size="17" tone="orange" /><text>每一锤，都让理解更扎实。</text><text class="home-bottom-en">FORGE YOUR UNDERSTANDING.</text></view>
        </template>

        <NotebookLibrary v-else-if="['library', 'favorites', 'recycle'].includes(page)" :key="libraryVisitKey" :scope="page === 'favorites' ? 'favorites' : page === 'recycle' ? 'recycle' : 'library'" v-model:search="search" v-model:collection="collectionFilter" v-model:tag="activeTag" @open="openQuestion" @edit="editQuestion" @add="addToNotebook" @test="navigate('review')" />

        <PracticeHub v-else-if="page === 'review'" @practice="practice" @open="openQuestion" @edit="editQuestion" @library="navigate('library')" @pending="openPending" />
        <KnowledgeView v-else-if="page === 'notes'" @open-question="openQuestion" @practice="practice($event, '知识点巩固')" />
        <PapersView v-else-if="page === 'papers'" @open-question="openQuestion" />
        <InsightsView v-else-if="page === 'insights'" @open-question="openQuestion" @practice="practice($event, '薄弱项巩固')" />
      </view>
      <button v-if="page !== 'recycle'" class="floating-add" aria-label="快捷添加错题" @tap="newQuestion()"><AppIcon name="plus" :size="25" tone="white" /></button>
    </view>

    <view class="mobile-bottom"><button :class="{ active: page === 'home' }" @tap="navigate('home')"><AppIcon name="house" :tone="page === 'home' ? 'green' : 'muted'" :size="21" /><text>首页</text></button><button :class="{ active: page === 'library' }" @tap="navigate('library')"><AppIcon name="book-open" :tone="page === 'library' ? 'green' : 'muted'" :size="21" /><text>错题本</text></button><button class="mobile-capture" @tap="newQuestion()"><view><AppIcon name="plus" :size="24" tone="white" /></view><text>收录</text></button><button :class="{ active: page === 'papers' }" @tap="navigate('papers')"><AppIcon name="files" :tone="page === 'papers' ? 'green' : 'muted'" :size="21" /><text>组卷</text></button><button :class="{ active: page === 'review' }" @tap="navigate('review')"><AppIcon name="hammer" :size="21" :tone="page === 'review' ? 'green' : 'muted'" /><text>练习</text></button></view>
    <DataManager v-if="dataManagerOpen" @close="dataManagerOpen = false" @restored="onDataRestored" />
    <QuickCapture v-if="captureOpen" :notebook-id="captureNotebookId" :initial-mode="captureInitialMode" @close="captureOpen = false" @saved="onCaptured" />
    <BatchCapture v-if="batchCaptureOpen" :notebook-id="captureNotebookId" @close="batchCaptureOpen = false" @saved="onBatchCaptured" />
    <QuestionEditor v-if="editorOpen" :question="editingQuestion" :auto-generate="editorStartAi" :focus-remark="editorFocusRemark" @close="editorOpen = false" @saved="onSaved" />
    <QuestionDetail v-if="detailId" :id="detailId" @close="detailId = ''" @edit="editQuestion" @edit-remark="editQuestion($event, false, true)" @practice="practice" @search-tag="searchByTag" />
    <ReviewSession v-if="reviewIds.length" :ids="reviewIds" :title="reviewTitle" @close="reviewIds = []" />
    <view v-if="profileOpen" class="modal-overlay" @tap.self="profileOpen = false"><view class="modal-window profile-window"><view class="modal-header"><view><text class="eyebrow">YOUR OWN PACE</text><text class="modal-title">你的学习空间</text></view><button class="icon-button" aria-label="关闭资料" @tap="profileOpen = false"><AppIcon name="x" /></button></view><scroll-view scroll-y class="modal-scroll"><view class="profile-content"><view class="profile-large-avatar">{{ profileDraft.nickname.slice(0, 1) || '拾' }}</view><text class="field-label">怎么称呼你</text><input v-model="profileDraft.nickname" class="form-input" maxlength="12" placeholder="你的昵称" /><view class="form-columns"><view><text class="field-label">学习阶段</text><input v-model="profileDraft.grade" class="form-input" maxlength="20" placeholder="例如：高二" /></view><view><text class="field-label">学校或学习方向</text><input v-model="profileDraft.school" class="form-input" maxlength="20" placeholder="例如：我的自习室" /></view></view><text class="field-label">给自己的小目标</text><input v-model="profileDraft.goal" class="form-input" maxlength="60" placeholder="不急，每天多懂一点" /><view class="local-data-info"><AppIcon name="shield-check" :size="19" tone="green" /><view><text>{{ storageStatus.cloud ? '属于你的云端学习空间' : '属于你的本地学习空间' }}</text><text>{{ storageStatus.cloud ? '题目、题图和复习记录保存在服务器。电脑与手机登录同一账号，即可继续查看；切换设备后刷新页面获取最新档案。' : '题目、笔记和记录保存在当前浏览器数据库。建议定期导出备份；如需跨设备使用，可前往服务器版。' }}</text></view></view><button class="profile-backup-link" @tap="openDataManager"><AppIcon name="download" :size="16" tone="green" /><text>备份与恢复我的学习档案</text><AppIcon name="chevron-right" :size="14" tone="muted" /></button><view v-if="storageStatus.cloud" class="cloud-account"><text class="field-label">账号：{{ storageStatus.user?.Username }}</text><input v-model="oldPassword" class="form-input" password placeholder="原登录密码" maxlength="128" /><input v-model="newPassword" class="form-input" password placeholder="新密码，至少10位" maxlength="128" /><button class="button button-quiet" :loading="passwordSaving" :disabled="!oldPassword || newPassword.length < 10" @tap="saveAccountPassword">更新登录密码</button><button v-if="storageStatus.expired" class="button button-quiet" :disabled="!oldPassword" @tap="renewSession">使用原密码恢复登录</button><button class="text-button" @tap="signOut">退出当前账号</button></view><button v-else class="button button-quiet" @tap="openServerWorkspace">前往服务器云端版<AppIcon name="arrow-up-right" :size="15" tone="green" /></button><button class="text-button reset-demo" @tap="resetDemo"><AppIcon name="refresh-cw" :size="14" tone="muted" /><text>重新载入示例数据</text></button></view></scroll-view><view class="modal-footer"><button class="button button-quiet" @tap="profileOpen = false">取消</button><button class="button button-primary" @tap="saveProfile">保存个人信息</button></view></view></view>
    <view v-if="helpOpen" class="modal-overlay" @tap.self="helpOpen = false"><view class="modal-window help-window"><view class="modal-header"><text class="modal-title">把错题，慢慢变成会做的题</text><button class="icon-button" aria-label="关闭指南" @tap="helpOpen = false"><AppIcon name="x" /></button></view><view class="help-content"><view v-for="(item, index) in [{title:'收录与整理',text:'添加文字或题图，保存后即已收录。科目、标签和解析可以稍后补充，也可使用 AI 整理并核对结果。'}, {title:'主动回忆',text:'先独立重做，再查看解答，诚实记录掌握情况。'}, {title:'安排下一次',text:'在题目档案选择复习日期，首页学习概览会列出到期任务。'}, {title:'串起知识',text:'把相关题目连到笔记，也可以自主组卷、下载Word练习。'}]" :key="index" class="help-step"><text>{{ String(index + 1).padStart(2, '0') }}</text><view><text>{{ item.title }}</text><text>{{ item.text }}</text></view></view><button class="button button-primary" @tap="helpOpen = false">开始我的学习</button></view></view></view>
  </view>
  </view>
</template>

<style scoped>
.capture-receipt { display: grid; grid-template-columns: 48px minmax(0, 1fr) auto 22px; align-items: center; gap: 14px; padding: 17px 18px; margin-top: 16px; background: #f7f2ed; border-color: #e5dbd0; }
.capture-receipt-thumbnail, .capture-receipt-symbol { width: 48px; height: 48px; border-radius: 10px; background: #eee5dc; }
.capture-receipt-symbol { display: flex; align-items: center; justify-content: center; }
.capture-receipt-copy { min-width: 0; }
.capture-receipt-title { display: block; font-size: 13px; font-weight: 600; color: #69513f; line-height: 1.7; }
.capture-receipt-preview { display: block; font-size: 11px; color: #908175; margin-top: 3px; line-height: 1.8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.capture-receipt-actions { display: flex; align-items: center; gap: 8px; }
.capture-receipt-actions .button { min-height: 36px; padding: 8px 12px; font-size: 11px; white-space: nowrap; }
.capture-receipt-dismiss { width: 22px; height: 28px; margin: 0; }
.home-collection { min-width: 0; }
.home-collection .pending-inbox { margin: 17px 0 0; }
.home-collection .recent-heading { margin-top: 25px; }
.learning-overview-toggle { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 26px 0 0; padding: 19px 22px; text-align: left; }
.learning-overview-toggle-copy { display: flex; align-items: center; gap: 13px; min-width: 0; }
.learning-overview-toggle-copy > view { min-width: 0; }
.learning-overview-toggle-copy > view > text:first-child { display: block; font-size: 14px; font-weight: 600; color: #665649; line-height: 1.5; }
.learning-overview-toggle-copy > view > text:last-child { display: block; font-size: 11px; color: #a09288; line-height: 1.8; margin-top: 4px; }
.learning-overview-toggle-state { display: flex; align-items: center; gap: 7px; flex-shrink: 0; color: #a09288; font-size: 11px; }
.learning-overview-toggle-state.expanded > .app-icon { transform: rotate(180deg); }
.home-learning-overview > .metrics-row { margin-top: 16px; }
.learning-review-entry { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin: 18px 0; padding: 20px 22px; background: #f2ece5; border-radius: 13px; }
.learning-review-entry .section-title { font-size: 14px; }
.learning-review-entry .section-caption { color: #9c8b7e; }
.learning-review-entry .button { flex-shrink: 0; font-size: 12px; }
.home-learning-panels { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 18px; }
.home-learning-panels .today-panel { grid-row: span 2; }
.home-learning-panels .quick-add-note { grid-column: 1 / -1; }
@media (max-width: 780px) {
  .capture-receipt { grid-template-columns: 44px minmax(0, 1fr) 22px; gap: 11px; }
  .capture-receipt-thumbnail, .capture-receipt-symbol { width: 44px; height: 44px; }
  .capture-receipt-actions { grid-column: 2; grid-row: 2; }
  .capture-receipt-dismiss { grid-column: 3; grid-row: 1; align-self: start; }
}
@media (max-width: 600px) {
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
</style>
