import { defaultNotebook, defaultNotebookId, migrateNotebooks, normalizeNotebook } from './notebooks'
import { computed, reactive, ref } from 'vue'
import { createSeedState, dayOffset, localDate } from './seed'
import { SUBJECTS } from './types'
import { serializeBackup, validateBackup } from './backup'
import { isValidSubject, normalizeKnowledgePoint, normalizePaperSubject, normalizeRelatedKnowledgePoints, normalizeSubject, normalizeTags } from './taxonomy'
import { forgeProgress, normalizeForge, normalizeReflection, questionContentKey, validateForgeAttempt } from './forge'
import { storageStatus, checkSession, loadLocalState, saveLocalState, loadCloudState, saveCloudState, portableState } from '../services/studyStorage'
import type { BackupCounts, Difficulty, Notebook, NotebookInput, Note, NoteInput, Paper, PaperInput, Profile, Question, QuestionInput, QuestionSnapshot, ReviewInput, ReviewRecord, StudyState, StudyStats, Subject } from './types'

declare const uni: {
  getStorageSync(key: string): unknown
  setStorageSync(key: string, value: unknown): void
}

export const STORAGE_KEY = 'shiti.study.v1'
const RATINGS = ['wrong', 'correct', 'mastered'] as const
const DIFFICULTIES: Difficulty[] = ['基础', '进阶', '挑战']
let idSequence = 0

function id(prefix: string): string {
  idSequence += 1
  return `${prefix}-${Date.now().toString(36)}-${idSequence.toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function cleanStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return [...new Set(values.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean))]
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  return localDate(new Date(year!, month! - 1, day!)) === value
}

function dateOfTimestamp(timestamp: string): string | null {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? null : localDate(date)
}

function isQuestionSnapshot(value: unknown): value is QuestionSnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Partial<QuestionSnapshot>
  return typeof snapshot.title === 'string' && typeof snapshot.stem === 'string' && typeof snapshot.answer === 'string' && typeof snapshot.analysis === 'string' && Array.isArray(snapshot.images) && snapshot.images.every((image) => typeof image === 'string')
}

function questionSnapshot(question: QuestionSnapshot): QuestionSnapshot {
  // Copy before freezing: a later edit must never rewrite a review's context.
  return Object.freeze({
    title: question.title,
    stem: question.stem,
    answer: question.answer,
    analysis: question.analysis,
    images: Object.freeze([...question.images]),
  })
}

/** Rebuild saved questions by schema so retired fields do not survive hydration. */
function copySavedQuestion(question: Question): Question {
  const organizationStatus = question.organizationStatus ?? 'ready'
  const knowledgePoint = normalizeKnowledgePoint(question.knowledgePoint, question.subject, organizationStatus === 'pending')
  return {
    notebookId: question.notebookId, id: question.id, title: question.title, subject: question.subject,
    knowledgePoint, relatedKnowledgePoints: normalizeRelatedKnowledgePoints(question.relatedKnowledgePoints, knowledgePoint), stem: question.stem,
    answer: question.answer, analysis: question.analysis, userAnswer: question.userAnswer,
    remark: question.remark ?? '', remarkImages: [...(question.remarkImages ?? [])],
    reflection: normalizeReflection(question.reflection),
    tags: normalizeTags(question.tags), difficulty: question.difficulty, source: question.source,
    favorite: question.favorite, status: question.status, organizationStatus,
    organizedAt: organizationStatus === 'ready' ? question.organizedAt : undefined, createdAt: question.createdAt,
    updatedAt: question.updatedAt, deletedAt: question.deletedAt, images: [...question.images],
    nextReviewDate: organizationStatus === 'ready' ? question.nextReviewDate : undefined, reviewCount: question.reviewCount, lastReviewedAt: question.lastReviewedAt,
  }
}

function loadState(): StudyState {
  try {
    if (typeof uni === 'undefined') return createSeedState()
    const stored = uni.getStorageSync(STORAGE_KEY)
    if (!stored) return createSeedState()
    const candidate: unknown = typeof stored === 'string' ? JSON.parse(stored) : stored
    if (!candidate || typeof candidate !== 'object') throw new Error('invalid storage')
    const data = candidate as Partial<StudyState>
    if (data.version !== 1 || !Array.isArray(data.questions) || !Array.isArray(data.notes) || !Array.isArray(data.papers) || !Array.isArray(data.reviews) || !data.profile || typeof data.profile.nickname !== 'string') throw new Error('invalid storage')
    // Reject partial/corrupt snapshots instead of letting malformed rows break screens.
    if (!data.questions.every((q) => q && typeof q.id === 'string' && (q.organizationStatus === undefined || ['pending', 'ready'].includes(q.organizationStatus)) && ((q.organizationStatus === 'pending' && q.subject === '') || isValidSubject(q.subject)) && ((q.organizationStatus === 'pending' && q.difficulty === '') || DIFFICULTIES.includes(q.difficulty as Difficulty)) && (q.organizedAt === undefined || (typeof q.organizedAt === 'string' && Number.isFinite(new Date(q.organizedAt).getTime()))) && typeof q.stem === 'string' && typeof q.title === 'string' && typeof q.createdAt === 'string' && Array.isArray(q.tags) && Array.isArray(q.images) && ['reinforce', 'mastered'].includes(q.status)) ||
      !data.notes.every((n) => n && typeof n.id === 'string' && isValidSubject(n.subject) && typeof n.title === 'string' && typeof n.content === 'string' && Array.isArray(n.questionIds)) ||
      !data.papers.every((p) => p && typeof p.id === 'string' && (p.subject === '综合' || isValidSubject(p.subject)) && typeof p.title === 'string' && Array.isArray(p.questionIds)) ||
      !data.reviews.every((r) => r && typeof r.id === 'string' && typeof r.requestId === 'string' && typeof r.questionId === 'string' && typeof r.reviewedAt === 'string' && RATINGS.includes(r.rating) && (r.questionSnapshot === undefined || isQuestionSnapshot(r.questionSnapshot)))) throw new Error('invalid storage')
    const reviews = data.reviews.map((review) => ({ ...review, forge: normalizeForge(review.forge), ...(review.questionSnapshot ? { questionSnapshot: questionSnapshot(review.questionSnapshot) } : {}) }))
    const questions = data.questions.map(copySavedQuestion)
    return migrateNotebooks({ ...(data as StudyState), questions, reviews, storageError: null })
  } catch {
    const fallback = createSeedState()
    fallback.storageError = '未能读取本地记录，已载入示例数据。原有存储尚未覆盖。'
    return fallback
  }
}

function syncTestMastery(data: StudyState) {
  for (const q of data.questions) q.status = forgeProgress(q.id, data.reviews).completed === 5 ? 'mastered' : 'reinforce'
  return data
}
const state = reactive<StudyState>(syncTestMastery(loadState()))
const questions = computed(() => state.questions.filter((question) => !question.deletedAt))
const pendingQuestions = computed(() => questions.value.filter((question) => question.organizationStatus === 'pending'))
const readyQuestions = computed(() => questions.value.filter((question) => question.organizationStatus === 'ready'))
const notebooks = computed(() => state.notebooks)
const notes = computed(() => state.notes)
const papers = computed(() => state.papers)
const availableSubjects = computed<Subject[]>(() => {
  const result: Subject[] = [...SUBJECTS]
  const seen = new Set<string>(result)
  const candidates = [...state.questions.map((question) => question.subject), ...state.notes.map((note) => note.subject), ...state.papers.map((paper) => paper.subject)]
  for (const subject of candidates) {
    if (isValidSubject(subject) && !seen.has(subject)) { seen.add(subject); result.push(subject) }
  }
  return result
})
const studyDay = ref(localDate())
function refreshDay() { studyDay.value = localDate() }
const practiceQuestions = computed(() => readyQuestions.value.filter(q => q.answer.trim()))
const dueQuestions = computed(() => {
  const today = studyDay.value
  return practiceQuestions.value.filter((question) => question.nextReviewDate && question.nextReviewDate <= today)
    .sort((a, b) => (a.nextReviewDate ?? '').localeCompare(b.nextReviewDate ?? '') || a.createdAt.localeCompare(b.createdAt))
})

const stats = computed<StudyStats>(() => {
  const active = questions.value
  const ready = readyQuestions.value
  const activeIds = new Set(ready.map((question) => question.id))
  const activeReviews = state.reviews.filter((review) => activeIds.has(review.questionId))
  const today = studyDay.value
  const reviewDays = new Set(activeReviews.map((review) => dateOfTimestamp(review.reviewedAt)).filter((date): date is string => date !== null))
  let streak = 0
  let offset = reviewDays.has(today) ? 0 : -1
  while (reviewDays.has(dayOffset(offset))) { streak += 1; offset -= 1 }
  const judgedReviews = activeReviews.filter(review => review.forge?.assessment && !review.forge.retired)
  const correct = judgedReviews.filter(review => review.forge?.assessment?.verdict === 'correct').length
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return {
    total: active.length,
    pending: pendingQuestions.value.length,
    ready: ready.length,
    reinforce: ready.filter((question) => question.status === 'reinforce').length,
    mastered: ready.filter((question) => question.status === 'mastered').length,
    favorites: active.filter((question) => question.favorite).length,
    dueToday: dueQuestions.value.length,
    reviewCount: activeReviews.length,
    todayReviewCount: activeReviews.filter((review) => dateOfTimestamp(review.reviewedAt) === today).length,
    accuracy: judgedReviews.length ? Math.round(correct / judgedReviews.length * 100) : 0,
    streak,
    noteCount: state.notes.length,
    paperCount: state.papers.length,
    subjectCounts: availableSubjects.value.map((subject) => {
      const rows = ready.filter((question) => question.subject === subject)
      return { subject, total: rows.length, reinforce: rows.filter((question) => question.status === 'reinforce').length, mastered: rows.filter((question) => question.status === 'mastered').length }
    }),
    weeklyHistory: Array.from({ length: 7 }, (_, index) => {
      const date = dayOffset(index - 6)
      const [year, month, day] = date.split('-').map(Number)
      const rows = activeReviews.filter((review) => dateOfTimestamp(review.reviewedAt) === date)
      return {
        date, label: weekdays[new Date(year!, month! - 1, day!).getDay()]!,
        reviewed: rows.length,
        correct: rows.filter((review) => review.rating !== 'wrong').length,
        wrong: rows.filter((review) => review.rating === 'wrong').length,
        mastered: rows.filter((review) => review.rating === 'mastered').length,
        added: active.filter((question) => dateOfTimestamp(question.createdAt) === date).length,
      }
    }),
  }
})

let persistence: Promise<void> = Promise.resolve()
let initialization: Promise<void> | undefined
function snapshot(): StudyState { return JSON.parse(JSON.stringify({ ...state, storageError: null })) as StudyState }
async function writeState(data: StudyState, preserveImages = false): Promise<void> {
  // #ifdef H5
  if (storageStatus.cloud) await saveCloudState(data, preserveImages)
  else await saveLocalState(data)
  return
  // #endif
  // #ifdef MP-WEIXIN
  uni.setStorageSync(STORAGE_KEY, data)
  // #endif
}
function persist(): void {
  const data = snapshot()
  storageStatus.saving = true
  const current = persistence.catch(() => {}).then(() => writeState(data))
  persistence = current
  // Attach an error observer even for one-click actions that do not await saves.
  void current.then(() => {
    state.storageError = null; storageStatus.savedAt = new Date().toISOString()
    if (current === persistence) storageStatus.saving = false
  }, error => {
    state.storageError = error instanceof Error ? error.message : '保存未完成，当前内容仍保留，请勿关闭页面。'
    if (current === persistence) storageStatus.saving = false
  })
}
async function flushPersistence(): Promise<void> { await persistence }
async function retryPersistence(): Promise<void> { persist(); await flushPersistence() }
async function initialize(force = false): Promise<void> {
  if (initialization && !force) return initialization
  storageStatus.initializing = true; storageStatus.error = ''
  initialization = (async () => {
    try {
      // #ifdef H5
      await checkSession()
      if (storageStatus.cloud && !storageStatus.user) return
      const saved = storageStatus.cloud ? await loadCloudState() : await loadLocalState()
      if (saved) {
        const checked = validateBackup(JSON.stringify({ format: 'shiti-backup', schemaVersion: 1, exportedAt: new Date().toISOString(), data: saved })).data
        Object.assign(state, syncTestMastery(checked))
      } else {
        if (storageStatus.cloud) Object.assign(state, syncTestMastery(createSeedState()))
        else if (state.storageError) throw new Error(state.storageError)
        // Complete and verify migration before displaying the editable app.
        // Legacy localStorage remains intact as a recovery copy.
        await writeState(snapshot())
      }
      // #endif
      storageStatus.ready = true
    } catch (error) { storageStatus.error = error instanceof Error ? error.message : '档案暂时无法打开，请稍后重试。'; throw error }
    finally { storageStatus.initializing = false }
  })()
  // The boot component owns the visible error and retry action.
  void initialization.catch(() => {})
  return initialization
}

function getQuestion(questionId: string, includeDeleted = false): Question {
  const question = state.questions.find((row) => row.id === questionId && (includeDeleted || !row.deletedAt))
  if (!question) throw new Error('这道题不存在或已移入回收站。')
  return question
}

function normalizeQuestion(input: QuestionInput): Omit<Question, 'id' | 'createdAt' | 'updatedAt' | 'reviewCount' | 'lastReviewedAt'> {
  const organizationStatus = input.organizationStatus ?? 'ready'
  if (!['pending', 'ready'].includes(organizationStatus)) throw new Error('请选择有效的整理状态。')
  const subject = organizationStatus === 'pending' && (input.subject === undefined || (typeof input.subject === 'string' && input.subject.trim() === '')) ? '' : normalizeSubject(input.subject)
  const knowledgePoint = normalizeKnowledgePoint(input.knowledgePoint, subject, organizationStatus === 'pending')
  const relatedKnowledgePoints = normalizeRelatedKnowledgePoints(input.relatedKnowledgePoints, knowledgePoint)
  const stem = input.stem?.trim() ?? ''
  const images = cleanStrings(input.images)
  const remarkImages = cleanStrings(input.remarkImages)
  if (remarkImages.length > 6) throw new Error('每道题的补充说明最多添加 6 张图片。')
  if ((input.remark?.length ?? 0) > 5000) throw new Error('补充说明最多填写 5000 字。')
  if (!stem && images.length === 0) throw new Error('请填写题干或添加一张题图，再保存错题。')
  const difficulty = input.difficulty ?? ''
  if (difficulty !== '' && !DIFFICULTIES.includes(difficulty)) throw new Error('请选择有效的难度。')
  if (organizationStatus === 'ready' && !difficulty) throw new Error('完成整理前请选择题目难度。')
  if (input.nextReviewDate && !validDate(input.nextReviewDate)) throw new Error('复习日期格式应为 YYYY-MM-DD。')
  // Mastery is derived from judged tests, never from an editable input flag.
  const status = 'reinforce' as const
  return {
    notebookId: input.notebookId,
    title: input.title?.trim() || stem.replace(/\s+/g, ' ').slice(0, 26) || '图片错题',
    subject, knowledgePoint, relatedKnowledgePoints, stem,
    answer: input.answer?.trim() ?? '', analysis: input.analysis?.trim() ?? '',
    userAnswer: input.userAnswer?.trim() ?? '',
    remark: input.remark?.trim() ?? '', remarkImages,
    reflection: normalizeReflection(input.reflection),
    tags: normalizeTags(input.tags), difficulty, source: input.source?.trim() || (organizationStatus === 'pending' ? '快速采集' : '手动录入'),
    favorite: Boolean(input.favorite), status, organizationStatus, images,
    nextReviewDate: organizationStatus === 'pending' ? undefined : input.nextReviewDate || undefined,
  }
}

function resolveNotebook(notebookId: string | undefined, subject: string, now: string): string {
  if (notebookId !== undefined) {
    if (!state.notebooks.some(book => book.id === notebookId)) throw new Error('请选择仍存在的错题本。')
    return notebookId
  }
  const key = defaultNotebookId(subject)
  if (!state.notebooks.some(book => book.id === key)) {
    if (state.notebooks.length >= 2000) throw new Error('错题本数量已达上限。')
    state.notebooks.push(defaultNotebook(subject, now))
  }
  return key
}

function saveNotebook(input: NotebookInput): Notebook {
  const fields = normalizeNotebook(input)
  const existing = input.id ? state.notebooks.find(book => book.id === input.id) : undefined
  if (input.id && !existing) throw new Error('这个错题本不存在。')
  if (!existing && state.notebooks.length >= 2000) throw new Error('错题本数量已达上限。')
  const now = new Date().toISOString()
  const book: Notebook = existing ? Object.assign(existing, fields, { automatic: false, updatedAt: now }) : { ...fields, id: id('notebook'), createdAt: now, updatedAt: now }
  if (!existing) state.notebooks.push(book)
  persist()
  return book
}

function deleteNotebook(notebookId: string): void {
  const index = state.notebooks.findIndex(book => book.id === notebookId)
  if (index < 0) throw new Error('这个错题本不存在。')
  // A notebook is a real container, so deleting it must never orphan a
  // question. Deleted questions are included as well; they still belong to
  // the notebook and can be restored later.
  if (state.questions.some(question => question.notebookId === notebookId)) {
    throw new Error('请先移动或清空本内题目，空本才可以删除。')
  }
  state.notebooks.splice(index, 1)
  persist()
}

function moveQuestionsToNotebook(questionIds: string[], notebookId: string): void {
  if (!state.notebooks.some(book => book.id === notebookId)) throw new Error('目标错题本不存在。')
  const targets = batchQuestions(questionIds, false)
  const now = new Date().toISOString()
  for (const q of targets) { q.notebookId = notebookId; q.updatedAt = now }
  persist()
}

function addQuestion(input: QuestionInput): Question {
  const now = new Date().toISOString()
  const normalized = normalizeQuestion(input)
  normalized.notebookId = resolveNotebook(normalized.notebookId, normalized.subject, now)
  const question: Question = { ...normalized, id: id('question'), createdAt: now, updatedAt: now, reviewCount: 0, organizedAt: normalized.organizationStatus === 'ready' ? now : undefined }
  state.questions.unshift(question)
  persist()
  return getQuestion(question.id)
}

function addQuestions(inputs: QuestionInput[]): Question[] {
  if (!inputs.length || inputs.length > 20) throw new Error('每批请选择 1 至 20 道题。')
  // Validate the entire batch before mutating state so a bad item cannot leave
  // a partially added queue. Persistence is scheduled once for the whole batch.
  const normalized = inputs.map(normalizeQuestion)
  const now = new Date().toISOString()
  // Validate the entire explicit assignment before adding automatic shelves.
  normalized.forEach(row => { if (row.notebookId !== undefined && !state.notebooks.some(book => book.id === row.notebookId)) throw new Error('请选择仍存在的错题本。') })
  const missingDefaults = new Set(normalized.filter(row => row.notebookId === undefined && !state.notebooks.some(book => book.id === defaultNotebookId(row.subject))).map(row => defaultNotebookId(row.subject)))
  if (state.notebooks.length + missingDefaults.size > 2000) throw new Error('错题本数量已达上限。')
  normalized.forEach(row => { row.notebookId = resolveNotebook(row.notebookId, row.subject, now) })
  const added: Question[] = normalized.map(input => ({ ...input, id: id('question'), createdAt: now, updatedAt: now, reviewCount: 0, organizedAt: input.organizationStatus === 'ready' ? now : undefined }))
  state.questions.unshift(...added)
  persist()
  return added.map(question => getQuestion(question.id))
}

function updateQuestion(questionId: string, patch: Partial<QuestionInput>): Question {
  const question = getQuestion(questionId)
  const normalized = normalizeQuestion({ ...question, ...patch })
  const now = new Date().toISOString()
  if (patch.notebookId !== undefined && !state.notebooks.some(book => book.id === patch.notebookId)) throw new Error('请选择仍存在的错题本。')
  const oldBook = state.notebooks.find(book => book.id === question.notebookId)
  const automaticUnclassified = (patch.notebookId === undefined || patch.notebookId === question.notebookId) && oldBook?.automatic && oldBook.id === defaultNotebookId('') && !!normalized.subject
  normalized.notebookId = automaticUnclassified ? resolveNotebook(undefined, normalized.subject, now) : resolveNotebook(normalized.notebookId, normalized.subject, now)
  const changedProblem = normalized.stem !== question.stem || normalized.answer !== question.answer || JSON.stringify(normalized.images) !== JSON.stringify(question.images)
  if (changedProblem) {
    for (const record of state.reviews) if (record.questionId === questionId && record.forge) record.forge.retired = true
    normalized.status = 'reinforce'
  }
  normalized.status = forgeProgress(questionId, state.reviews).completed === 5 ? 'mastered' : 'reinforce'
  const completingOrganization = question.organizationStatus === 'pending' && normalized.organizationStatus === 'ready'
  if (completingOrganization) normalized.nextReviewDate = undefined
  Object.assign(question, normalized, { updatedAt: now, organizedAt: normalized.organizationStatus === 'pending' ? undefined : completingOrganization ? now : question.organizedAt })
  // A question can move between subjects after being used in a saved paper.
  // Keep every saved paper valid instead of making the next backup unreadable.
  for (const paper of state.papers) {
    if (paper.subject !== '综合' && paper.questionIds.includes(questionId) && paper.questionIds.some(id => state.questions.some(q => q.id === id && q.organizationStatus === 'ready' && q.subject !== paper.subject))) {
      paper.subject = '综合'
      paper.updatedAt = now
    }
  }
  persist()
  return question
}

function toggleFavorite(questionId: string): Question {
  const question = getQuestion(questionId)
  question.favorite = !question.favorite
  question.updatedAt = new Date().toISOString()
  persist()
  return question
}

function deleteQuestion(questionId: string): void {
  const question = getQuestion(questionId)
  question.deletedAt = new Date().toISOString()
  question.updatedAt = question.deletedAt
  persist()
}

function restoreQuestion(questionId: string): Question {
  const question = getQuestion(questionId, true)
  delete question.deletedAt
  question.updatedAt = new Date().toISOString()
  persist()
  return question
}

function batchQuestions(questionIds: string[], deleted: boolean): Question[] {
  return [...new Set(questionIds)].map(questionId => {
    const question = getQuestion(questionId, deleted)
    if (deleted && !question.deletedAt) throw new Error('只能恢复已移入回收站的题目，请重新选择。')
    return question
  })
}

function addTagsToQuestions(questionIds: string[], tags: string[]): void {
  const targets = batchQuestions(questionIds, false)
  if (!targets.length) return
  const additions = normalizeTags(tags)
  const updates = targets.map(question => ({ question, tags: normalizeTags([...question.tags, ...additions]) }))
  const now = new Date().toISOString()
  // Validate every merged tag list before changing any selected question.
  updates.forEach(({ question, tags }) => { question.tags = tags; question.updatedAt = now })
  persist()
}

function deleteQuestions(questionIds: string[]): void {
  const targets = batchQuestions(questionIds, false)
  if (!targets.length) return
  const now = new Date().toISOString()
  targets.forEach(question => { question.deletedAt = now; question.updatedAt = now })
  persist()
}

function restoreQuestions(questionIds: string[]): void {
  const targets = batchQuestions(questionIds, true)
  if (!targets.length) return
  const now = new Date().toISOString()
  targets.forEach(question => { delete question.deletedAt; question.updatedAt = now })
  persist()
}

function submitReview(questionId: string, input: ReviewInput, now = new Date()): ReviewRecord {
  if (!input.requestId?.trim()) throw new Error('缺少复习提交标识，请重试。')
  const requestId = input.requestId.trim()
  const question = getQuestion(questionId)
  if (question.organizationStatus !== 'ready') throw new Error('请先完成这道题的整理，再开始复习。')
  if (input.expectedContent !== undefined && input.expectedContent !== questionContentKey(question)) throw new Error('题干、答案或题图已更新，请重新打开题目并作答。')
  const previous = state.reviews.find((review) => review.requestId === requestId)
  if (previous) {
    if (previous.questionId !== questionId) throw new Error('该提交标识已用于另一道题，请重新提交。')
    if (previous.forge?.retired) throw new Error('这次测试属于已归档的旧版题目，请重新作答。')
    persist()
    return previous
  }
  if (!RATINGS.includes(input.rating)) throw new Error('请选择本次掌握情况。')
  if (input.planDate && !validDate(input.planDate)) throw new Error('复习日期格式应为 YYYY-MM-DD。')
  const nowIso = now.toISOString()
  const forge = normalizeForge(input.forge)
  const answer = input.answer?.trim() ?? ''
  if (forge) validateForgeAttempt(questionId, state.reviews, forge, answer, input.rating !== 'wrong')
  if (input.rating === 'mastered' && (!forge || forge.stage !== 5)) throw new Error('完成五阶锻造后，才能标记为已掌握。')
  const rating = forge && input.rating !== 'wrong' ? forge.stage === 5 ? 'mastered' : 'correct' : input.rating
  const review: ReviewRecord = { id: id('review'), questionId, answer, rating, requestId, reviewedAt: nowIso, questionSnapshot: questionSnapshot(question), ...(forge ? { forge } : {}) }
  const today = localDate(now)
  const futurePlans = [question.nextReviewDate, rating !== 'mastered' ? input.planDate : undefined]
    .filter((date): date is string => !!date && date > today).sort()
  // A completed due reminder is consumed; future manual reminders survive
  // extra practice and are merged with the next default interval.
  if (futurePlans[0]) review.planDate = futurePlans[0]
  state.reviews.push(review)
  // Keep the answer recorded on entry; each later attempt belongs to its review.
  question.status = forgeProgress(questionId, state.reviews).completed === 5 ? 'mastered' : 'reinforce'
  question.nextReviewDate = review.planDate
  question.lastReviewedAt = nowIso
  question.updatedAt = nowIso
  question.reviewCount = state.reviews.filter((row) => row.questionId === questionId).length
  persist()
  return state.reviews[state.reviews.length - 1]!
}

function setPlan(questionId: string, date?: string | null): Question {
  if (date && !validDate(date)) throw new Error('复习日期格式应为 YYYY-MM-DD。')
  const question = getQuestion(questionId)
  if (question.organizationStatus !== 'ready') throw new Error('请先完成这道题的整理，再安排复习。')
  question.nextReviewDate = date || undefined
  // Scheduling changes the plan, not the result of a previous test.
  question.updatedAt = new Date().toISOString()
  persist()
  return question
}

function linkedQuestions(questionIds: string[] | undefined): string[] {
  // Retain references to deleted questions on edits, so restoring a question restores its context.
  return cleanStrings(questionIds).filter((questionId) => state.questions.some((question) => question.id === questionId))
}

function saveNote(input: NoteInput): Note {
  const subject = normalizeSubject(input.subject)
  if (!input.title?.trim()) throw new Error('请给笔记起一个标题。')
  const existing = input.id ? state.notes.find((note) => note.id === input.id) : undefined
  if (input.id && !existing) throw new Error('这篇笔记不存在。')
  const images = cleanStrings(input.images ?? existing?.images)
  if (images.length > 6) throw new Error('每篇笔记最多添加 6 张图片。')
  if (!input.content?.trim() && !images.length) throw new Error('请填写笔记内容或添加图片。')
  const now = new Date().toISOString()
  const fields = { title: input.title.trim(), subject, content: input.content.trim(), images, questionIds: linkedQuestions(input.questionIds ?? existing?.questionIds), updatedAt: now }
  const note: Note = existing ? Object.assign(existing, fields) : { ...fields, id: id('note'), createdAt: now }
  if (!existing) state.notes.unshift(note)
  persist()
  return state.notes.find((row) => row.id === note.id)!
}

function deleteNote(noteId: string): void {
  const index = state.notes.findIndex((note) => note.id === noteId)
  if (index === -1) throw new Error('这篇笔记不存在。')
  state.notes.splice(index, 1)
  persist()
}

function savePaper(input: PaperInput): Paper {
  let subject = normalizePaperSubject(input.subject)
  if (!input.title?.trim()) throw new Error('请填写练习卷名称。')
  const existing = input.id ? state.papers.find((paper) => paper.id === input.id) : undefined
  if (input.id && !existing) throw new Error('这份练习卷不存在。')
  const questionIds = cleanStrings(input.questionIds)
  if (!questionIds.length) throw new Error('请至少选择一道仍在错题本中的题目。')
  const retained = new Set(existing?.questionIds ?? [])
  const selected = questionIds.map(questionId => {
    const question = state.questions.find(row => row.id === questionId)
    if (!question) throw new Error('试卷引用了不存在的题目，请重新选题。')
    const available = !question.deletedAt && question.organizationStatus === 'ready'
    if (!available && !retained.has(questionId)) throw new Error('新增选题需为未删除且已整理的题目。')
    if (available && subject !== '综合' && question.subject !== subject) throw new Error('跨学科选题时，请将试卷学科设为“综合”。')
    return { question, available }
  })
  if (!selected.some(row => row.available)) throw new Error('请至少添加一道已整理且可用的题目，再保存试卷。')
  // Unavailable references can be retained for later restoration, but must not
  // make a single-subject paper invalid when editing its available questions.
  if (subject !== '综合' && selected.some(row => !row.available && row.question.organizationStatus === 'ready' && row.question.subject !== subject)) subject = '综合'
  const now = new Date().toISOString()
  const fields = { title: input.title.trim(), subject, questionIds, updatedAt: now }
  const paper: Paper = existing ? Object.assign(existing, fields) : { ...fields, id: id('paper'), createdAt: now }
  if (!existing) state.papers.unshift(paper)
  persist()
  return state.papers.find((row) => row.id === paper.id)!
}

function updateProfile(patch: Partial<Profile>): Profile {
  if (patch.nickname !== undefined && !patch.nickname.trim()) throw new Error('昵称不能为空。')
  const allowed: Array<keyof Profile> = ['nickname', 'school', 'grade', 'goal', 'avatarColor']
  for (const key of allowed) {
    const value = patch[key]
    if (typeof value === 'string') state.profile[key] = value.trim()
  }
  persist()
  return state.profile
}

function resetDemo(): void {
  Object.assign(state, syncTestMastery(createSeedState()))
  persist()
}

async function exportBackup(): Promise<string> {
  // #ifdef H5
  if (storageStatus.cloud) return serializeBackup(await portableState(snapshot()))
  // #endif
  return serializeBackup(state)
}

async function importBackup(json: string): Promise<BackupCounts> {
  // Revalidate the original JSON even if the UI already previewed it.
  const { data, counts } = validateBackup(json)
  await flushPersistence()
  // Commit the entire replacement before replacing any reactive data.
  const normalized = syncTestMastery(data)
  await writeState(normalized, true)
  Object.assign(state, normalized)
  storageStatus.savedAt = new Date().toISOString()
  return counts
}

const store = { notebooks, saveNotebook, deleteNotebook, moveQuestionsToNotebook, studyDay, refreshDay, practiceQuestions, state, storageStatus, initialize, flushPersistence, retryPersistence, questions, pendingQuestions, readyQuestions, notes, papers, availableSubjects, dueQuestions, stats, addQuestion, addQuestions, updateQuestion, toggleFavorite, deleteQuestion, restoreQuestion, addTagsToQuestions, deleteQuestions, restoreQuestions, submitReview, setPlan, saveNote, deleteNote, savePaper, updateProfile, resetDemo, exportBackup, validateBackup, importBackup }

/** One reactive instance shared by all Vue pages; mutations always go through these methods. */
export function useStudyStore() { return store }

export type { Notebook, NotebookInput, NotebookAudience, BackupCounts, BackupEnvelope, BackupValidationResult, OrganizationStatus, Question, QuestionInput, QuestionSnapshot, Note, NoteInput, Paper, PaperInput, Profile, ReviewInput, ReviewRecord, StudyStats, Subject } from './types'
