<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useStudyStore } from '../domain/store'
import type { Question, QuestionInput } from '../domain/types'
import { clearQuestionDraft, readQuestionDraft, writeQuestionDraft } from '../utils/draft'
import type { QuestionDraft, QuestionDraftForm } from '../utils/draft'
import AppIcon from './AppIcon.vue'
import QuestionFlowSteps from './QuestionFlowSteps.vue'
import TagPicker from './TagPicker.vue'
import AttachmentGallery from './AttachmentGallery.vue'
import { MAX_TAGS, MAX_TAG_LENGTH, isValidSubject, normalizeSubject, parseTags } from '../domain/taxonomy'
import { GenerationCancelledError, startQuestionGeneration } from '../services/questionAi'
import type { GeneratedQuestion, GenerationTask } from '../services/questionAi'

const props = defineProps<{ question?: Question; autoGenerate?: boolean; focusRemark?: boolean }>()
const emit = defineEmits<{ close: []; saved: [id: string] }>()
const store = useStudyStore()
const loading = ref(false)
const selectingImage = ref(false)
const selectingRemarkImages = ref(false)
const remarkScrollTarget = ref('')
const metadataOpen = ref(false)
// Keep the editing session's intent stable if a storage failure leaves an in-memory update.
const isPending = !props.question || props.question.organizationStatus === 'pending'
const savingMode = ref<'progress' | 'complete' | null>(null)
const form = reactive<QuestionDraftForm>({ title: props.question?.title || '', subject: props.question?.subject ?? '', stem: props.question?.stem || '', answer: props.question?.answer || '', analysis: props.question?.analysis || '', userAnswer: props.question?.userAnswer || '', remark: props.question?.remark ?? '', remarkImages: [...(props.question?.remarkImages ?? [])], difficulty: props.question?.difficulty ?? '', source: props.question?.source || '', tags: props.question?.tags.join('，') || '', images: [...(props.question?.images || [])] })
const canComplete = computed(() => isValidSubject(form.subject) && ['基础', '进阶', '挑战'].includes(form.difficulty))
const aiLoading = ref(false)
const aiError = ref('')
const aiNotice = ref('')
const aiResult = ref<GeneratedQuestion | null>(null)
const aiInputSnapshot = ref('')
let aiTask: GenerationTask | null = null
let aiSequence = 0
const aiSource = computed(() => JSON.stringify({ title: form.title, stem: form.stem, images: form.images, subject: form.subject, tags: form.tags, answer: form.answer, analysis: form.analysis, difficulty: form.difficulty }))
const aiResultStale = computed(() => !!aiResult.value && aiInputSnapshot.value !== aiSource.value)
const aiStreamStem = ref('')
const aiStemSeconds = ref('')
let aiStartedAt = 0
const aiStemLabel = computed(() => aiStreamStem.value ? (aiStemSeconds.value ? `题干已识别 · ${aiStemSeconds.value}s` : '题干已识别') : '正在识别题干…')
const aiButtonLabel = computed(() => aiLoading.value ? (aiStreamStem.value ? '正在生成解析…' : '正在识别题干…') : aiError.value ? '重试 AI 整理' : '开始 AI 整理')
const draftQuestionId = props.question?.id ?? null
const initialQuestionVersion = props.question?.updatedAt ?? null
const draftBaseVersion = ref(initialQuestionVersion)
const initialForm = JSON.stringify(form)
const dirty = computed(() => JSON.stringify(form) !== initialForm)
const tagValues = computed(() => parseTags(form.tags))
const subjects = computed(() => [...new Set([...store.availableSubjects.value, ...(form.subject ? [form.subject] : [])])])
const expandedSubjects = ref(false)
const shownSubjects = computed(() => expandedSubjects.value ? subjects.value : [...new Set([...subjects.value.slice(0, 8), ...(form.subject ? [form.subject] : [])])])
const customSubjectOpen = ref(false)
const customSubjectName = ref('')
const customSubjectError = ref('')
function addCustomSubject() {
  try { form.subject = normalizeSubject(customSubjectName.value); customSubjectName.value = ''; customSubjectOpen.value = false; customSubjectError.value = '' }
  catch (error) { customSubjectError.value = error instanceof Error ? error.message : '请填写科目名称' }
}
const pendingDraft = ref<QuestionDraft | null>(null)
const draftReadError = ref('')
const draftError = ref('')
const saveError = ref('')
const draftState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const draftSavedAt = ref('')
const oldVersionRestored = ref(false)
const closeConfirm = ref<'save-draft' | 'discard' | 'leave-ai' | null>(null)
const pendingIsOlder = computed(() => !!props.question && !!pendingDraft.value && pendingDraft.value.baseQuestionUpdatedAt !== initialQuestionVersion)
const sessionQuestionId = ref(props.question?.id)
let draftTimer: ReturnType<typeof setTimeout> | undefined
let suspendDraftWatch = false
let skipUnmountWrite = false
let disposed = false

const loadedDraft = readQuestionDraft(draftQuestionId, { remark: form.remark, remarkImages: form.remarkImages })
pendingDraft.value = loadedDraft.draft
draftReadError.value = loadedDraft.error ?? ''

// A capture choice authorizes this one request only. Reopening the saved question
// uses the regular editor without autoGenerate and never repeats it silently.
onMounted(() => {
  if (props.focusRemark && !pendingDraft.value && !draftReadError.value) void nextTick(() => { remarkScrollTarget.value = 'question-remark-section' })
  if (props.autoGenerate && props.question?.organizationStatus === 'pending' && !pendingDraft.value && !draftReadError.value) void generateWithMiMo()
})

function stopDraftTimer() { if (draftTimer) clearTimeout(draftTimer); draftTimer = undefined }
function draftTime(value: string) {
  const date = new Date(value)
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
function persistDraft() {
  stopDraftTimer()
  const result = writeQuestionDraft(form, draftQuestionId, draftBaseVersion.value)
  if (result.ok) {
    pendingDraft.value = null
    draftReadError.value = ''
    draftError.value = ''
    draftState.value = 'saved'
    draftSavedAt.value = result.draft.updatedAt
  } else {
    draftState.value = 'error'
    draftError.value = result.error
  }
  return result.ok
}

watch(form, () => {
  if (suspendDraftWatch || skipUnmountWrite) return
  stopDraftTimer()
  if (pendingDraft.value || draftReadError.value) return
  if (!dirty.value) {
    const result = clearQuestionDraft(draftQuestionId)
    draftState.value = result.ok ? 'idle' : 'error'
    draftError.value = result.ok ? '' : result.error
    return
  }
  draftState.value = 'saving'
  draftTimer = setTimeout(() => { persistDraft() }, 400)
}, { deep: true, flush: 'sync' })

function restoreDraft() {
  const draft = pendingDraft.value
  if (!draft) return
  stopDraftTimer()
  suspendDraftWatch = true
  oldVersionRestored.value = pendingIsOlder.value
  draftBaseVersion.value = draft.baseQuestionUpdatedAt
  Object.assign(form, { ...draft.form, images: [...draft.form.images], remarkImages: [...draft.form.remarkImages] })
  pendingDraft.value = null
  draftReadError.value = ''
  draftError.value = ''
  draftState.value = 'saved'
  draftSavedAt.value = draft.updatedAt
  suspendDraftWatch = false
  if (props.focusRemark) void nextTick(() => { remarkScrollTarget.value = 'question-remark-section' })
  uni.showToast({ title: '草稿已恢复，保存后才会更新错题本', icon: 'none' })
}

function discardDraft() {
  const result = clearQuestionDraft(draftQuestionId)
  if (!result.ok) {
    draftError.value = result.error
    uni.showToast({ title: result.error, icon: 'none' })
    return
  }
  pendingDraft.value = null
  draftReadError.value = ''
  draftError.value = ''
  draftState.value = 'idle'
  if (dirty.value) persistDraft()
}

function requestClose() {
  if (loading.value || selectingRemarkImages.value) return
  cancelGeneration()
  if (aiResult.value) { closeConfirm.value = 'leave-ai'; return }
  if (!dirty.value) { skipUnmountWrite = true; emit('close'); return }
  closeConfirm.value = 'save-draft'
}

function confirmClose() {
  if (closeConfirm.value === 'leave-ai') {
    if (dirty.value && !persistDraft()) { closeConfirm.value = 'discard'; return }
    skipUnmountWrite = true
    emit('close')
    return
  }
  if (closeConfirm.value === 'discard') {
    skipUnmountWrite = true
    stopDraftTimer()
    emit('close')
    return
  }
  if (!persistDraft()) { closeConfirm.value = 'discard'; return }
  skipUnmountWrite = true
  emit('close')
  uni.showToast({ title: '草稿已保存，下次可继续编辑', icon: 'none' })
}

onBeforeUnmount(() => {
  disposed = true
  cancelGeneration()
  stopDraftTimer()
  if (!skipUnmountWrite && dirty.value && !pendingDraft.value && !draftReadError.value) persistDraft()
})

function chooseImage() {
  if (selectingImage.value || selectingRemarkImages.value || loading.value || aiLoading.value) return
  if (form.images.length >= 3) return uni.showToast({ title: '每道题最多添加3张图片', icon: 'none' })
  selectingImage.value = true
  uni.chooseImage({ count: 3 - form.images.length, sizeType: ['compressed'], sourceType: ['album', 'camera'], success: async (res) => {
    try {
      for (const path of res.tempFilePaths as string[]) {
        if (disposed || form.images.length >= 3) break
        let savedPath = path
        // #ifdef H5
        const blob = await (await fetch(path)).blob()
        if (blob.size > 2 * 1024 * 1024) { uni.showToast({ title: '请选择2MB以内的图片', icon: 'none' }); continue }
        if (!/^image\/(?:jpeg|png|webp)$/i.test(blob.type)) { uni.showToast({ title: '请选择 JPG、PNG 或 WebP 图片', icon: 'none' }); continue }
        savedPath = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob) })
        // #endif
        // #ifdef MP-WEIXIN
        savedPath = await new Promise<string>((resolve, reject) => uni.saveFile({ tempFilePath: path, success: r => resolve(r.savedFilePath), fail: reject }))
        // #endif
        if (!disposed && !form.images.includes(savedPath)) form.images.push(savedPath)
      }
    } catch { uni.showToast({ title: '图片添加失败，请重试', icon: 'none' }) }
    finally { selectingImage.value = false }
  }, fail: () => { selectingImage.value = false } })
}
function previewImage(image: string) { uni.previewImage({ urls: form.images, current: image }) }
function cancelGeneration() {
  aiSequence += 1
  aiTask?.cancel()
  aiTask = null
  aiLoading.value = false
  aiStreamStem.value = ''
  aiStemSeconds.value = ''
}
async function generateWithMiMo() {
  if (aiLoading.value || loading.value || selectingImage.value || selectingRemarkImages.value) return
  if (!form.stem.trim() && !form.images.length) { aiError.value = '先输入题干或上传题图，再开始智能整理'; return }
  if (pendingDraft.value || draftReadError.value) { aiError.value = '请先恢复或清除上次草稿，再开始智能整理'; return }
  const sequence = ++aiSequence
  aiLoading.value = true
  aiError.value = ''
  aiNotice.value = ''
  aiResult.value = null
  aiInputSnapshot.value = aiSource.value
  aiStreamStem.value = ''
  aiStemSeconds.value = ''
  aiStartedAt = Date.now()
  aiTask = startQuestionGeneration({ stem: form.stem, images: [...form.images], subject: form.subject, tags: [...tagValues.value] }, {
    onStem: stem => {
      if (disposed || sequence !== aiSequence) return
      if (!aiStreamStem.value) aiStemSeconds.value = ((Date.now() - aiStartedAt) / 1000).toFixed(1)
      aiStreamStem.value = stem
    },
  })
  try {
    const result = await aiTask.promise
    if (!disposed && sequence === aiSequence) { aiResult.value = result; aiNotice.value = '整理结果已生成，核对无误后保存整理结果。' }
  } catch (error) {
    if (!disposed && sequence === aiSequence && !(error instanceof GenerationCancelledError)) aiError.value = error instanceof Error ? error.message : '本次生成失败，当前输入已保留'
  } finally {
    if (sequence === aiSequence) { aiLoading.value = false; aiTask = null; aiStreamStem.value = ''; aiStemSeconds.value = '' }
  }
}
function applyGeneratedQuestion() {
  if (!aiResult.value || aiResultStale.value) return false
  const result = aiResult.value
  const tags = parseTags([...tagValues.value, ...result.tags].join('，')).slice(0, MAX_TAGS)
  Object.assign(form, { title: result.title, subject: result.subject, stem: result.stem, answer: result.answer, analysis: result.analysis, tags: tags.join('，'), difficulty: result.difficulty })
  customSubjectName.value = ''
  customSubjectError.value = ''
  customSubjectOpen.value = false
  aiResult.value = null
  aiNotice.value = isPending ? '已填入分类、答案与解析。核对后点击“完成整理”，才会更新原题。' : '已填入题干、答案与解析，可核对修改后保存。'
  return true
}
function editAiResult() {
  if (applyGeneratedQuestion()) return
  aiResult.value = null
  aiNotice.value = '已保留当前修改，请手动核对或重新使用 AI 整理。'
}
function confirmAiResult() {
  if (loading.value || aiLoading.value || pendingDraft.value || draftReadError.value) return
  if (applyGeneratedQuestion()) save('complete')
}
async function save(mode: 'progress' | 'complete' = 'complete') {
  if (aiLoading.value || selectingImage.value || selectingRemarkImages.value) return
  if (!form.stem.trim() && !form.images.length) return uni.showToast({ title: '请填写题目或添加一张题图', icon: 'none' })
  if (tagValues.value.length > MAX_TAGS || tagValues.value.some(tag => Array.from(tag).length > MAX_TAG_LENGTH)) return uni.showToast({ title: `每题最多${MAX_TAGS}个标签，单个最多${MAX_TAG_LENGTH}字`, icon: 'none' })
  if (customSubjectOpen.value && customSubjectName.value.trim()) { addCustomSubject(); if (customSubjectError.value) return }
  const organizationStatus = isPending && mode === 'progress' ? 'pending' : 'ready'
  if (organizationStatus === 'ready' && !canComplete.value) {
    saveError.value = '请先选择科目和难度；答案与解析可以手动补充，也可以暂时留空。'
    return uni.showToast({ title: '请先选择科目和难度', icon: 'none' })
  }
  if (loading.value) return
  loading.value = true
  savingMode.value = mode
  saveError.value = ''
  stopDraftTimer()
  try {
    const input: QuestionInput = { ...form, title: form.title.trim() || form.stem.slice(0, 22) || '图片错题', tags: tagValues.value, stem: form.stem.trim(), images: [...form.images], remarkImages: [...form.remarkImages], organizationStatus }
    if (sessionQuestionId.value) store.updateQuestion(sessionQuestionId.value, input)
    else sessionQuestionId.value = store.addQuestion(input).id
    await store.flushPersistence()
    if (store.state.storageError) {
      const draftSaved = persistDraft()
      saveError.value = draftSaved ? '设备空间不足，题目暂存于本次会话；草稿已保留。释放空间后可再次保存。' : '设备空间不足，题目与草稿均未能保存到设备，请勿关闭页面。'
      uni.showToast({ title: '设备空间不足，内容暂存于本次会话', icon: 'none', duration: 3000 })
      return
    }
    const cleared = clearQuestionDraft(draftQuestionId)
    skipUnmountWrite = true
    emit('saved', sessionQuestionId.value)
    uni.showToast({ title: cleared.ok ? organizationStatus === 'pending' ? '题目已保存，可稍后继续整理' : isPending ? '整理完成，已保存' : '修改已保存' : '题目已保存，旧草稿暂未清除', icon: cleared.ok ? 'success' : 'none' })
  } catch (error) {
    persistDraft()
    saveError.value = error instanceof Error ? error.message : '保存失败，请重试'
    uni.showToast({ title: saveError.value, icon: 'none' })
  }
  finally { loading.value = false; savingMode.value = null }
}
</script>

<template>
  <view class="modal-overlay" @tap.self="requestClose"><view class="modal-window editor-window">
    <view class="modal-header"><view><text class="eyebrow">REVIEW & KEEP</text><text class="modal-title">{{ isPending ? '补充整理' : '编辑错题' }}</text></view><button class="icon-button" aria-label="关闭" :disabled="loading || selectingRemarkImages" @tap="requestClose"><AppIcon name="x" /></button></view>
    <QuestionFlowSteps v-if="isPending" :active="2" />
    <scroll-view scroll-y class="modal-scroll" :scroll-into-view="remarkScrollTarget"><view class="editor-content">
      <view v-if="pendingDraft" class="draft-banner"><view class="draft-banner-heading"><AppIcon name="notebook-pen" :size="18" tone="green" /><text>上次的修改还在</text></view><text class="draft-banner-copy">{{ draftTime(pendingDraft.updatedAt) }} 保存。恢复后继续编辑，或丢弃这份草稿。</text><text v-if="pendingIsOlder" class="draft-version-warning">原题已有更新，恢复后请核对再保存。</text><view class="draft-banner-actions"><button class="draft-action" @tap="restoreDraft">恢复草稿</button><button class="draft-action draft-action-muted" @tap="discardDraft">丢弃旧草稿</button></view></view>
      <view v-else-if="draftReadError" class="draft-banner draft-banner-warning"><text class="draft-banner-copy">{{ draftReadError }}</text><button class="draft-action draft-action-muted" @tap="discardDraft">清除旧草稿</button></view>
      <view v-if="saveError || draftError" class="editor-warning" role="alert"><AppIcon name="info" :size="16" tone="orange" /><text>{{ saveError || draftError }}</text></view>
      <view v-if="oldVersionRestored" class="restored-version-note"><text>已恢复较早的草稿，请核对后再保存。</text></view>

      <view v-if="!aiResult" id="question-ai-panel" class="ai-capture-panel">
        <view class="ai-capture-heading"><view class="ai-capture-symbol"><AppIcon name="sparkles" :size="20" tone="green" /></view><view><text class="ai-capture-title">AI 辅助整理</text><text class="ai-capture-copy">一起生成分类、标签、答案和解析</text></view></view>
        <button class="button button-primary ai-generate-button" :disabled="aiLoading || loading || selectingImage || selectingRemarkImages || !!pendingDraft || !!draftReadError || (!form.stem.trim() && !form.images.length)" :loading="aiLoading" @tap="generateWithMiMo"><AppIcon v-if="!aiLoading" name="sparkles" :size="17" tone="white" /><text>{{ aiButtonLabel }}</text></button>
        <view v-if="aiLoading" class="ai-stream-panel" aria-live="polite">
          <view class="ai-stream-heading"><AppIcon name="scan-line" :size="15" tone="green" /><text>{{ aiStemLabel }}</text></view>
          <text v-if="aiStreamStem" class="ai-stream-stem">{{ aiStreamStem }}</text>
          <text v-else class="ai-stream-placeholder">题图已收到，通常 1 秒左右先出题干。</text>
          <text class="ai-stream-hint">{{ aiStreamStem ? '解析继续生成中，完成后由你核对确认。' : '识别到完整题干后会先显示在这里。' }}</text>
        </view>
        <view class="ai-capture-feedback" aria-live="polite"><text v-if="aiLoading">{{ props.question ? '题目已收录，生成后由你核对确认。' : '当前输入仍保留在此页面，生成后由你核对确认。' }}</text><text v-else-if="aiError" class="ai-error">{{ aiError }} 也可以在下方手动整理。</text><text v-else-if="aiNotice">{{ aiNotice }}</text><text v-else>{{ pendingDraft || draftReadError ? '请先处理上次草稿。' : '也可以直接在下方手动补充。' }}</text><button v-if="aiLoading" class="text-button ai-cancel" @tap="cancelGeneration">改为手动整理</button></view>
      </view>

      <view v-if="aiResult" class="ai-result-panel">
        <view class="ai-result-heading"><AppIcon name="check-circle-2" :size="18" tone="green" /><text>请核对整理结果</text><text class="badge">{{ aiResult.subject }} · {{ aiResult.difficulty }}</text></view>
        <text class="ai-result-title">{{ aiResult.title }}</text>
        <view v-if="form.images.length" class="ai-source-images"><text>对照原图</text><view class="image-previews"><view v-for="image in form.images" :key="image" class="image-preview"><image :src="image" mode="aspectFit" @tap="previewImage(image)" /></view></view></view>
        <view class="ai-result-copy"><text class="ai-result-label">题目内容</text><text>{{ aiResult.stem }}</text><text class="ai-result-label">参考答案</text><text>{{ aiResult.answer }}</text><text class="ai-result-label">解题解析</text><text>{{ aiResult.analysis }}</text><text v-if="aiResult.tags.length" class="ai-result-label">检索标签</text><text v-if="aiResult.tags.length" class="ai-result-tags">{{ aiResult.tags.join(' · ') }}</text></view>
        <text class="ai-apply-hint" :class="{ 'ai-error': aiResultStale }">{{ aiResultStale ? '题目信息已更改，请返回修改或重新生成。' : '核对无误后保存整理结果；需要调整时，先修改内容。' }}</text>
      </view>

      <view v-show="!aiLoading && !aiResult" class="editor-manual-form">
        <view class="editor-section-heading"><text>核对题目</text><button class="text-button editor-add-image" :disabled="selectingImage || loading || form.images.length >= 3" @tap="chooseImage"><AppIcon name="image" :size="15" tone="green" /><text>{{ selectingImage ? '正在添加…' : '添加题图' }}</text></button></view>
        <view v-if="form.images.length" class="image-previews"><view v-for="(image, index) in form.images" :key="image" class="image-preview"><image :src="image" mode="aspectFit" @tap="previewImage(image)" /><button class="remove-image" aria-label="移除图片" @tap="form.images.splice(index, 1)"><AppIcon name="x" :size="12" tone="white" /></button></view></view>
        <text class="field-label">题目内容 <text class="optional">与题图至少保留一项</text></text><textarea v-model="form.stem" class="form-textarea editor-stem" maxlength="5000" placeholder="核对题干、公式和选项…" /><text class="field-counter">{{ form.stem.length }} / 5000</text>

        <view class="editor-section-heading"><text>分类与标签</text></view>
        <view class="form-label-row"><text class="field-label">科目 <text class="optional">完成整理时必选</text></text><button class="custom-subject-toggle" @tap="customSubjectOpen = !customSubjectOpen"><AppIcon name="plus" :size="13" tone="green" /><text>自定义科目</text></button></view>
        <view class="subject-picker"><button v-if="isPending" class="subject-choice" :class="{ active: !form.subject }" :aria-pressed="!form.subject" @tap="form.subject = ''">暂不分类</button><button v-for="subject in shownSubjects" :key="subject" class="subject-choice" :class="{ active: form.subject === subject }" :aria-pressed="form.subject === subject" @tap="form.subject = subject">{{ subject }}</button><button v-if="subjects.length > 8" class="subject-choice subject-more" @tap="expandedSubjects = !expandedSubjects"><text>{{ expandedSubjects ? '收起科目' : '更多科目' }}</text><AppIcon name="chevron-down" :size="12" tone="green" /></button></view>
        <view v-if="customSubjectOpen" class="custom-subject"><view class="custom-subject-row"><input v-model="customSubjectName" class="form-input custom-subject-input" :maxlength="20" placeholder="例如：高等数学、经济学、日语" @confirm="addCustomSubject" /><button class="button button-quiet custom-subject-apply" @tap="addCustomSubject">使用此科目</button></view><text class="custom-subject-hint" :class="{ 'custom-subject-error': customSubjectError }">{{ customSubjectError || '最多 20 字，保存后可用于筛选。' }}</text></view>
        <text class="field-label">难度 <text class="optional">完成整理时必选</text></text><view class="difficulty-picker"><button v-if="isPending" class="filter-chip" :class="{ active: !form.difficulty }" @tap="form.difficulty = ''">暂不选择</button><button v-for="level in ['基础', '进阶', '挑战']" :key="level" class="filter-chip" :class="{ active: form.difficulty === level }" @tap="form.difficulty = level as Question['difficulty']">{{ level }}</button></view>
        <TagPicker v-model="form.tags" :subject="form.subject || '未分类'" />

        <view class="editor-section-heading"><text>答案与解析</text><text class="optional">可稍后补充</text></view>
        <text class="field-label">参考答案</text><textarea v-model="form.answer" class="form-textarea short editor-answer" maxlength="5000" placeholder="正确答案是什么？" /><text class="field-counter">{{ form.answer.length }} / 5000</text>
        <text class="field-label">解题解析</text><textarea v-model="form.analysis" class="form-textarea editor-analysis" maxlength="10000" placeholder="记录解题步骤与关键结论…" /><text class="field-counter">{{ form.analysis.length }} / 10000</text>

        <view id="question-remark-section" class="editor-remark-section">
          <view class="editor-section-heading"><view><AppIcon name="notebook-pen" :size="16" tone="green" /><text>补充说明</text></view><text class="optional">选填</text></view>
          <text class="editor-remark-hint">留下课堂板书、解题草稿，或想提醒自己的话。</text>
          <textarea v-model="form.remark" class="form-textarea editor-remark" :maxlength="5000" placeholder="给这道题补充一些说明，也可以直接添加图片…" aria-label="题目补充说明" /><text class="field-counter">{{ form.remark.length }} / 5000</text>
          <AttachmentGallery v-model="form.remarkImages" label="备注附图" :disabled="loading || aiLoading || selectingImage" @busy="selectingRemarkImages = $event" />
        </view>

        <button class="editor-metadata-toggle" :aria-expanded="metadataOpen" @tap="metadataOpen = !metadataOpen"><AppIcon name="notebook-pen" :size="16" tone="muted" /><text>标题、来源与原作答</text><text class="optional">选填</text><AppIcon name="chevron-down" :class="{ 'metadata-expanded': metadataOpen }" :size="15" tone="muted" /></button>
        <view v-if="metadataOpen" class="editor-metadata">
          <text class="field-label">题目标题</text><input v-model="form.title" class="form-input editor-title" maxlength="60" placeholder="留空时会根据题干命名" />
          <text class="field-label">题目来源</text><input v-model="form.source" class="form-input editor-source" maxlength="120" placeholder="例如：周测 · 第 8 题" />
          <text class="field-label">我的原作答</text><textarea v-model="form.userAnswer" class="form-textarea short editor-user-answer" maxlength="5000" placeholder="保留当时的答案或思路…" /><text class="field-counter">{{ form.userAnswer.length }} / 5000</text>
        </view>
      </view>
    </view></scroll-view>
    <view class="editor-draft-status"><view class="draft-state-dot" :class="{ 'draft-state-error': draftState === 'error', 'draft-state-saving': draftState === 'saving' }" /><text>{{ aiResult ? 'AI 建议待你确认，尚未更新题目' : aiLoading ? '正在生成整理建议，完成后再核对保存' : pendingDraft || draftReadError ? '上次的修改待恢复' : draftState === 'error' ? '修改暂未保存，请保留当前页面' : draftState === 'saving' ? '正在保存草稿…' : draftState === 'saved' ? '修改已存为草稿，确认保存后更新题目' : isPending ? props.question ? '题目已收录 · 待整理，可稍后继续' : '保存题目即可收录，分类与解析可稍后补充' : '核对后保存本次修改' }}</text></view>
    <text v-if="isPending && !canComplete && !aiLoading && !aiResult" class="organization-completion-hint">完成整理前，请选择科目和难度。</text>
    <view class="modal-footer organization-footer">
      <template v-if="aiResult"><button class="button button-quiet ai-edit-result" :disabled="loading" @tap="editAiResult">修改内容</button><button class="button button-primary ai-confirm-save" :disabled="loading || aiResultStale || !!pendingDraft || !!draftReadError" :loading="loading" @tap="confirmAiResult"><AppIcon name="check" :size="17" tone="white" /><text>保存整理结果</text></button></template>
      <button v-else-if="aiLoading" class="button button-quiet editor-close-action" @tap="requestClose">{{ props.question ? '返回待整理' : '返回' }}</button>
      <template v-else><button class="button button-quiet editor-close-action" :disabled="loading || selectingRemarkImages" @tap="requestClose">返回</button><button v-if="isPending" class="button button-quiet editor-save-progress" :loading="loading && savingMode === 'progress'" :disabled="loading || selectingImage || selectingRemarkImages" @tap="save('progress')">保存进度</button><button class="button button-primary editor-save-complete" :loading="loading && savingMode === 'complete'" :disabled="loading || selectingImage || selectingRemarkImages || !canComplete" @tap="save('complete')"><AppIcon name="check" :size="17" tone="white" /><text>{{ selectingRemarkImages ? '正在添加图片…' : isPending ? '完成整理' : '保存修改' }}</text></button></template>
    </view>
  </view>
  <view v-if="closeConfirm" class="editor-confirm-overlay" @tap.stop><view class="editor-confirm-dialog"><view class="confirm-symbol"><AppIcon name="notebook-pen" :size="24" tone="green" /></view><text class="editor-confirm-title">{{ closeConfirm === 'leave-ai' ? '整理结果还未确认' : closeConfirm === 'discard' ? '草稿没有保存成功' : '保存修改，稍后继续？' }}</text><text class="editor-confirm-copy">{{ closeConfirm === 'leave-ai' ? '原题会保留，离开后这次 AI 建议不再保留。也可以返回继续核对。' : closeConfirm === 'discard' ? '当前修改尚未保存，确认离开将放弃这次修改。' : '修改会单独存为草稿，下次可以继续；原题暂不改变。' }}</text><view class="editor-confirm-actions"><button class="button button-quiet" @tap="closeConfirm = null">{{ closeConfirm === 'leave-ai' ? '继续核对' : '继续编辑' }}</button><button class="button" :class="closeConfirm === 'discard' ? 'confirm-discard-button' : 'button-primary'" @tap="confirmClose">{{ closeConfirm === 'leave-ai' ? '保留原题并离开' : closeConfirm === 'discard' ? '确认放弃' : '保存草稿并离开' }}</button></view></view></view>
  </view>
</template>

<style scoped>
.editor-remark-section>.editor-section-heading>view{display:flex;align-items:center;gap:7px}.editor-remark-hint{display:block;font-size:11px;line-height:1.8;color:#91a080;margin-bottom:12px}.editor-remark{height:120px;min-height:90px}.editor-remark-section{scroll-margin-top:18px}
.metadata-expanded{transform:rotate(180deg)}
.editor-section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:20px 0 13px;margin-top:7px;border-top:1px solid #e9eedf;color:#4c7045;font-size:13px;font-weight:600}.editor-section-heading:first-child{border-top:0;margin-top:0;padding-top:0}.editor-add-image{font-size:11px;font-weight:400}.editor-content>.ai-capture-panel{margin:0 0 22px}.editor-content>.ai-result-panel{margin:0}.editor-metadata-toggle{display:flex;align-items:center;gap:8px;width:100%;padding:16px 0;margin:20px 0 0;border-top:1px solid #e6ecdd;background:transparent;font-size:12px;text-align:left;color:#819475}.editor-metadata-toggle>.app-icon:last-child{margin-left:auto}.editor-metadata{padding:4px 0 10px}.ai-source-images{margin:14px 0 19px}.ai-source-images>text{font-size:10px;color:#91a182}.ai-source-images>.image-previews{margin:8px 0}.ai-source-images .image-preview{width:80px;height:70px}.ai-source-images .image-preview>image{background:#f3f6ec}.ai-result-copy>.ai-result-tags{margin-top:0}.organization-footer>.ai-edit-result{margin-left:auto}.organization-footer>.ai-confirm-save{min-width:150px}.editor-manual-form .difficulty-picker{margin-bottom:19px}@media(max-width:600px){.editor-section-heading{font-size:12px;padding-top:18px}.editor-metadata-toggle{font-size:11px}.organization-footer>.ai-confirm-save{min-width:144px}}
.editor-auto-ai{display:flex;flex-direction:column}.editor-auto-ai>.ai-capture-panel{order:-2;margin-top:0}.editor-auto-ai>.ai-result-panel{order:-1}.editor-auto-ai>.draft-banner,.editor-auto-ai>.editor-warning,.editor-auto-ai>.restored-version-note{order:-3}
.editor-window{width:680px}.editor-content{padding:24px 28px 30px}.form-label-row{display:flex;justify-content:space-between;align-items:center}.subject-picker{display:flex;gap:9px;margin:9px 0 22px}.subject-choice{flex:1;padding:10px 5px;border:1px solid #e5e9df;border-radius:9px;font-size:13px;background:white;color:#7b867b}.subject-choice.active{border-color:#7b9c7a;background:#edf4e9;color:#39704b;font-weight:600}.image-upload{display:flex;align-items:center;gap:13px;border:1px dashed #bdcbb5;border-radius:12px;background:#f6f9f1;padding:17px;cursor:pointer;margin-bottom:24px}.upload-symbol{height:45px;width:45px;display:flex;align-items:center;justify-content:center;background:#e6eedf;border-radius:11px}.upload-title{display:block;font-size:14px;font-weight:600}.upload-hint{display:block;font-size:11px;color:#8c9685;margin-top:5px}.image-upload>.app-icon{margin-left:auto}.image-previews{display:flex;gap:12px;margin-bottom:20px}.image-preview{position:relative;width:90px;height:90px}.image-preview image{width:90px;height:90px;border-radius:8px}.remove-image{position:absolute;right:-5px;top:-5px;background:#3d5145;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center}.field-divider{display:flex;align-items:center;gap:8px;margin:25px 0 20px;border-top:1px solid #edf0e7;padding-top:23px;font-size:13px;font-weight:600}.field-divider>.muted{margin-left:auto;font-weight:400}.difficulty-picker{display:flex;flex-wrap:wrap;gap:7px;margin:8px 0 20px}.optional{font-size:10px;color:#a0a89b;font-weight:400;margin-left:6px}.form-columns{display:grid;grid-template-columns:1fr 1fr;gap:16px}.form-columns>view{min-width:0}@media(max-width:600px){.editor-content{padding:20px}.upload-hint{font-size:10px;max-width:205px}.field-divider>.muted{display:none}.form-columns{grid-template-columns:1fr}.image-upload{padding:13px}}
.draft-banner{background:#f0f5e9;border:1px solid #dfe8d6;border-radius:12px;padding:15px 16px;margin-bottom:22px}.draft-banner-heading{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:#3a684a}.draft-banner-copy{display:block;font-size:10px;line-height:1.9;color:#829477;margin-top:8px}.draft-banner-actions{display:flex;align-items:center;gap:18px;margin-top:10px}.draft-action{font-size:11px;line-height:20px;color:#39775a;font-weight:600;background:none;padding:0;margin:0;display:inline-flex}.draft-action::after{border:0}.draft-action-muted{font-weight:400;color:#93a084}.draft-banner-warning{background:#fcf5e9;border-color:#eddfc7}.draft-banner-warning .draft-banner-heading{color:#a37f4c}.draft-banner-warning .draft-action{margin-top:10px}.draft-version-warning{display:block;color:#ad8951;font-size:10px;line-height:1.8;margin-top:8px}.editor-warning{display:flex;align-items:flex-start;gap:8px;padding:12px 14px;border:1px solid #edddc5;border-radius:10px;background:#fcf5e9;color:#a8814e;font-size:11px;line-height:1.8;margin-bottom:20px}.editor-warning>.app-icon{flex-shrink:0;margin-top:2px}.restored-version-note{display:flex;align-items:flex-start;gap:7px;color:#ab8b58;font-size:10px;line-height:1.8;margin-bottom:19px}.restored-version-note>.app-icon{flex-shrink:0;margin-top:2px}.field-counter{display:block;text-align:right;font-size:10px;line-height:1.6;color:#a0aa96;margin-top:6px}.counter-near-limit{color:#c08d4a}.tag-feedback{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:9px;color:#9aa68d;line-height:1.8;margin-top:7px}.tag-feedback-error{color:#bc7753}.answer-field-feedback{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-top:6px}.answer-field-feedback>text:first-child{font-size:9px;color:#a0aa96;line-height:1.8}.answer-field-feedback .field-counter{margin-top:0;white-space:nowrap}.editor-draft-status{display:flex;align-items:center;gap:7px;font-size:9px;line-height:1.8;color:#94a087;padding:11px 28px 0;flex-shrink:0}.draft-state-dot{width:5px;height:5px;border-radius:50%;background:#8dac79;flex-shrink:0}.draft-state-error{background:#d3a268}.draft-state-saving{background:#b9c6a5}.editor-confirm-overlay{position:fixed;inset:0;background:rgba(23,46,35,.32);z-index:120;display:flex;align-items:center;justify-content:center;padding:22px;box-sizing:border-box}.editor-confirm-dialog{background:#fff;border:1px solid #e5eadd;border-radius:19px;padding:28px;box-sizing:border-box;width:410px;max-width:100%;box-shadow:0 20px 65px rgba(23,46,35,.12)}.confirm-symbol{width:48px;height:48px;background:#f0f5e9;border-radius:14px;display:flex;align-items:center;justify-content:center;margin-bottom:20px}.editor-confirm-title{display:block;font-size:18px;font-weight:600;line-height:1.6;color:#173e34}.editor-confirm-copy{display:block;font-size:12px;line-height:1.9;color:#8b9a7e;margin-top:12px}.editor-confirm-actions{display:flex;align-items:center;gap:10px;margin-top:24px}.editor-confirm-actions .button{flex:1;white-space:nowrap;font-size:11px;padding:11px 13px;margin:0}.confirm-discard-button{background:#b98457;color:#fff;border-color:#b98457}@media(max-width:600px){.editor-draft-status{padding:10px 20px 0;font-size:8px}.editor-confirm-overlay{padding:19px}.editor-confirm-dialog{padding:24px 22px}.editor-confirm-title{font-size:17px}.editor-confirm-copy{font-size:11px}.editor-confirm-actions{gap:8px}.editor-confirm-actions .button{font-size:10px;padding:11px 9px}.draft-banner{padding:13px 14px}.draft-banner-heading{font-size:11px}.draft-banner-copy,.draft-version-warning{font-size:9px}.draft-action{font-size:10px}.answer-field-feedback>text:first-child{font-size:8px}.field-counter{font-size:9px}.editor-warning{font-size:10px}}

.input-mode-picker{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin:0 0 22px}.input-mode{display:flex;align-items:center;gap:11px;position:relative;margin:0;padding:15px 14px;background:#fafbf7;border:1px solid #e5eade;border-radius:12px;text-align:left;min-width:0}.input-mode.mode-active{background:#edf4e6;border-color:#a1bd8f;box-shadow:0 0 0 1px #aac69a16}.input-mode-icon{width:38px;height:38px;background:#edf1e6;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}.mode-active .input-mode-icon{background:#dfeacc}.input-mode>view:nth-child(2){min-width:0}.input-mode>view:nth-child(2)>text:first-child{display:block;font-size:13px;font-weight:600;color:#59774a}.input-mode>view:nth-child(2)>text:last-child{display:block;font-size:10px;line-height:1.8;color:#95a184;margin-top:4px}.mode-dot{position:absolute;right:10px;top:10px;width:5px;height:5px;border-radius:50%;background:#6f955a}.subject-picker{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:15px}.subject-choice{margin:0;min-width:0;padding:10px 6px;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.7}.custom-subject-toggle{display:flex;align-items:center;gap:4px;background:none;padding:5px 0;margin:5px 0 0;font-size:11px;color:#759664;white-space:nowrap}.custom-subject-active{color:#39775a}.custom-subject{background:#f6f9f0;border:1px solid #e4ecda;border-radius:10px;padding:12px;margin:0 0 18px}.custom-subject-row{display:flex;align-items:center;gap:9px}.custom-subject-input{min-width:0;flex:1;font-size:11px}.custom-subject-apply{padding:10px 12px;font-size:11px;flex-shrink:0;min-height:42px;background:#e8f1df;border-color:#d5e4c5}.custom-subject-hint{display:block;font-size:10px;color:#9aaa8b;line-height:1.8;margin-top:8px}.custom-subject-error{color:#b97b54}.capture-note{display:block;font-size:10px;color:#a38f6b;line-height:1.8;margin:-13px 0 19px}.image-previews{flex-wrap:wrap}.form-label-row .field-label{margin-top:0}.editor-draft-status{background:#fff;position:relative;z-index:1}
@media(max-width:600px){.input-mode-picker{gap:9px;margin-bottom:22px}.input-mode{gap:8px;padding:13px 11px;flex-direction:column;align-items:flex-start}.input-mode-icon{width:33px;height:33px;border-radius:9px}.input-mode>view:nth-child(2)>text:first-child{font-size:13px}.input-mode>view:nth-child(2)>text:last-child{font-size:9px}.subject-picker{grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.subject-choice{font-size:12px;padding:9px 5px}.custom-subject-row{flex-wrap:wrap}.custom-subject-input{min-width:150px}.custom-subject-apply{font-size:10px}.custom-subject-hint{font-size:9px}.capture-note{font-size:10px}}

.subject-more{display:flex;align-items:center;justify-content:center;gap:5px;color:#78966a;background:#f3f7ed;border-style:dashed}.subjects-expanded{transform:rotate(180deg)}
.organization-note{display:flex;align-items:flex-start;gap:11px;padding:15px 16px;margin-bottom:22px;background:#f4f7ed;border:1px solid #e2e9d7;border-radius:12px;color:#8b9b7f;font-size:11px;line-height:1.9}.organization-note>.app-icon{flex-shrink:0;margin-top:3px}.organization-note>view>text{display:block}.organization-note-title{font-size:12px;font-weight:600;color:#54764a;margin-bottom:4px}.organization-completion-hint{display:block;padding:10px 28px 0;font-size:10px;line-height:1.8;color:#91a080;flex-shrink:0}.organization-footer{gap:9px}.organization-footer>.button{margin:0;min-width:0}.organization-footer>.editor-close-action{margin-right:auto}@media(max-width:600px){.organization-note{font-size:10px;padding:13px 14px}.organization-note-title{font-size:11px}.organization-completion-hint{font-size:9px;padding:9px 20px 0}.organization-footer{gap:7px}.organization-footer>.button{font-size:11px;padding:11px 12px;gap:5px}.organization-footer>.editor-close-action{padding-left:0;padding-right:9px}}
.ai-capture-panel{margin:20px 0 24px;padding:17px;border:1px solid #dce8d2;border-radius:13px;background:#f5f9ef}.ai-capture-heading{display:flex;align-items:center;gap:10px;min-width:0}.ai-capture-symbol{display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:11px;background:#e8f0df;flex-shrink:0}.ai-capture-title{display:block;font-size:13px;font-weight:600;color:#3e6c4f}.ai-capture-copy{display:block;font-size:10px;color:#8b9d7d;margin-top:5px;line-height:1.7}.ai-model-label{font-size:9px;letter-spacing:1px;border:1px solid #dce6d0;border-radius:5px;padding:3px 6px;color:#8a9c7a;margin-left:auto;flex-shrink:0}.ai-generate-button{display:flex;width:100%;margin:15px 0 0;min-height:40px;font-size:12px}.ai-capture-feedback{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:11px;font-size:10px;line-height:1.8;color:#8b9a7e}.ai-capture-feedback>text{flex:1;min-width:0}.ai-capture-feedback>.text-button{flex-shrink:0;font-size:10px}.ai-error{color:#b17851!important}.ai-stream-panel{margin-top:13px;padding:13px 14px;border:1px solid #dfe9d5;border-radius:11px;background:#fbfdf7}.ai-stream-heading{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:600;color:#4c7245}.ai-stream-stem{display:block;margin-top:9px;max-height:132px;overflow:hidden;white-space:pre-wrap;font-size:13px;line-height:1.9;color:#3f5c45}.ai-stream-placeholder{display:block;margin-top:9px;font-size:11px;line-height:1.9;color:#9aa78c}.ai-stream-hint{display:block;margin-top:9px;font-size:10px;line-height:1.8;color:#a0ab93}.ai-result-panel{margin:-7px 0 24px;padding:17px;border:1px solid #dce8d4;border-radius:12px;background:#fdfef9}.ai-result-heading{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:#3c714f;flex-wrap:wrap}.ai-result-heading>.badge{font-size:9px;margin-left:auto;font-weight:400}.ai-result-title{display:block;font-size:14px;font-weight:600;line-height:1.7;margin:14px 0 8px;color:#395a40}.ai-result-scroll{height:240px}.ai-result-copy>text{display:block;white-space:pre-wrap;line-height:1.9;font-size:12px;color:#718268}.ai-result-copy>.ai-result-label{font-size:10px;font-weight:600;color:#3f6b4c;margin:12px 0 5px}.ai-result-copy>.ai-result-tags{font-size:10px;color:#94a284;margin-top:15px}.ai-apply-hint{display:block;font-size:10px;color:#91a182;line-height:1.8;border-top:1px solid #e9efdf;padding-top:12px;margin-top:12px}.ai-result-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:14px}
@media(max-width:600px){.ai-capture-panel,.ai-result-panel{padding:14px}.ai-stream-panel{padding:12px}.ai-stream-stem{font-size:12px;max-height:110px}.ai-capture-heading{gap:8px}.ai-capture-title{font-size:12px}.ai-capture-copy{font-size:9px}.ai-model-label{display:none}.ai-capture-feedback,.ai-apply-hint{font-size:9px}.ai-generate-button{font-size:11px}.ai-result-heading{font-size:11px}.ai-result-heading>.badge{margin-left:0}.ai-result-title{font-size:13px}.ai-result-copy>text{font-size:11px}.ai-result-scroll{height:220px}}
@media(max-width:600px){.input-mode{flex-direction:row;align-items:center;gap:8px;padding:14px 10px}.input-mode-icon{width:29px;height:31px}.input-mode-icon>.app-icon{width:19px!important;height:19px!important}.input-mode>view:nth-child(2)>text:first-child{font-size:12px}.input-mode>view:nth-child(2)>text:last-child{font-size:8px;line-height:1.7}}
</style>
