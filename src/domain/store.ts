import { computed, reactive } from 'vue'
import { createSeedState, dayOffset, localDate } from './seed'
import { SUBJECTS } from './types'
import { serializeBackup, validateBackup } from './backup'
import { isValidSubject, normalizePaperSubject, normalizeSubject, normalizeTags } from './taxonomy'
import { storageStatus, checkSession, loadLocalState, saveLocalState, loadCloudState, saveCloudState, portableState } from '../services/studyStorage'
import type { BackupCounts, Difficulty, Note, NoteInput, Paper, PaperInput, Profile, Question, QuestionInput, QuestionSnapshot, ReviewInput, ReviewRecord, StudyState, StudyStats, Subject } from './types'

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
  return {
    id: question.id, title: question.title, subject: question.subject, stem: question.stem,
    answer: question.answer, analysis: question.analysis, userAnswer: question.userAnswer,
    remark: question.remark ?? '', remarkImages: [...(question.remarkImages ?? [])],
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
    const reviews = data.reviews.map((review) => review.questionSnapshot ? { ...review, questionSnapshot: questionSnapshot(review.questionSnapshot) } : review)
    const questions = data.questions.map(copySavedQuestion)
    return { ...(data as StudyState), questions, reviews, storageError: null }
  } catch {
    const fallback = createSeedState()
    fallback.storageError = '未能读取本地记录，已载入示例数据。原有存储尚未覆盖。'
    return fallback
  }
}

const state = reactive<StudyState>(loadState())
const questions = computed(() => state.questions.filter((question) => !question.deletedAt))
const pendingQuestions = computed(() => questions.value.filter((question) => question.organizationStatus === 'pending'))
const readyQuestions = computed(() => questions.value.filter((question) => question.organizationStatus === 'ready'))
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
const dueQuestions = computed(() => {
  const today = localDate()
  return readyQuestions.value.filter((question) => question.status !== 'mastered' && question.nextReviewDate && question.nextReviewDate <= today)
    .sort((a, b) => (a.nextReviewDate ?? '').localeCompare(b.nextReviewDate ?? '') || a.createdAt.localeCompare(b.createdAt))
})

const stats = computed<StudyStats>(() => {
  const active = questions.value
  const ready = readyQuestions.value
  const activeIds = new Set(ready.map((question) => question.id))
  const activeReviews = state.reviews.filter((review) => activeIds.has(review.questionId))
  const today = localDate()
  const reviewDays = new Set(activeReviews.map((review) => dateOfTimestamp(review.reviewedAt)).filter((date): date is string => date !== null))
  let streak = 0
  let offset = reviewDays.has(today) ? 0 : -1
  while (reviewDays.has(dayOffset(offset))) { streak += 1; offset -= 1 }
  const correct = activeReviews.filter((review) => review.rating !== 'wrong').length
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
    accuracy: activeReviews.length ? Math.round(correct / activeReviews.length * 100) : 0,
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
        Object.assign(state, checked)
      } else {
        if (storageStatus.cloud) Object.assign(state, createSeedState())
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
  const status = input.status === 'mastered' ? 'mastered' : 'reinforce'
  return {
    title: input.title?.trim() || stem.replace(/\s+/g, ' ').slice(0, 26) || '图片错题',
    subject, stem,
    answer: input.answer?.trim() ?? '', analysis: input.analysis?.trim() ?? '',
    userAnswer: input.userAnswer?.trim() ?? '',
    remark: input.remark?.trim() ?? '', remarkImages,
    tags: normalizeTags(input.tags), difficulty, source: input.source?.trim() || (organizationStatus === 'pending' ? '快速采集' : '手动录入'),
    favorite: Boolean(input.favorite), status, organizationStatus, images,
    nextReviewDate: organizationStatus === 'pending' || status === 'mastered' ? undefined : input.nextReviewDate || undefined,
  }
}

function addQuestion(input: QuestionInput): Question {
  const now = new Date().toISOString()
  const normalized = normalizeQuestion(input)
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
  const added: Question[] = normalized.map(input => ({ ...input, id: id('question'), createdAt: now, updatedAt: now, reviewCount: 0, organizedAt: input.organizationStatus === 'ready' ? now : undefined }))
  state.questions.unshift(...added)
  persist()
  return added.map(question => getQuestion(question.id))
}

function updateQuestion(questionId: string, patch: Partial<QuestionInput>): Question {
  const question = getQuestion(questionId)
  const normalized = normalizeQuestion({ ...question, ...patch })
  const now = new Date().toISOString()
  const completingOrganization = question.organizationStatus === 'pending' && normalized.organizationStatus === 'ready'
  if (completingOrganization) normalized.nextReviewDate = undefined
  Object.assign(question, normalized, { updatedAt: now, organizedAt: normalized.organizationStatus === 'pending' ? undefined : completingOrganization ? now : question.organizedAt })
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

function submitReview(questionId: string, input: ReviewInput): ReviewRecord {
  if (!input.requestId?.trim()) throw new Error('缺少复习提交标识，请重试。')
  const requestId = input.requestId.trim()
  const question = getQuestion(questionId)
  if (question.organizationStatus !== 'ready') throw new Error('请先完成这道题的整理，再开始复习。')
  const previous = state.reviews.find((review) => review.requestId === requestId)
  if (previous) {
    if (previous.questionId !== questionId) throw new Error('该提交标识已用于另一道题，请重新提交。')
    persist()
    return previous
  }
  if (!RATINGS.includes(input.rating)) throw new Error('请选择本次掌握情况。')
  if (input.planDate && !validDate(input.planDate)) throw new Error('复习日期格式应为 YYYY-MM-DD。')
  const now = new Date().toISOString()
  const review: ReviewRecord = { id: id('review'), questionId, answer: input.answer?.trim() ?? '', rating: input.rating, requestId, reviewedAt: now, questionSnapshot: questionSnapshot(question) }
  if (input.rating !== 'mastered' && input.planDate) review.planDate = input.planDate
  state.reviews.push(review)
  // Keep the answer recorded on entry; each later attempt belongs to its review.
  question.status = input.rating === 'mastered' ? 'mastered' : 'reinforce'
  question.nextReviewDate = review.planDate
  question.lastReviewedAt = now
  question.updatedAt = now
  question.reviewCount = state.reviews.filter((row) => row.questionId === questionId).length
  persist()
  return state.reviews[state.reviews.length - 1]!
}

function setPlan(questionId: string, date?: string | null): Question {
  if (date && !validDate(date)) throw new Error('复习日期格式应为 YYYY-MM-DD。')
  const question = getQuestion(questionId)
  if (question.organizationStatus !== 'ready') throw new Error('请先完成这道题的整理，再安排复习。')
  question.nextReviewDate = date || undefined
  if (date) question.status = 'reinforce'
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
  const subject = normalizePaperSubject(input.subject)
  if (!input.title?.trim()) throw new Error('请填写练习卷名称。')
  const existing = input.id ? state.papers.find((paper) => paper.id === input.id) : undefined
  if (input.id && !existing) throw new Error('这份练习卷不存在。')
  const questionIds = cleanStrings(input.questionIds).filter((questionId) => questions.value.some((question) => question.id === questionId))
  if (!questionIds.length) throw new Error('请至少选择一道仍在错题本中的题目。')
  if (questionIds.some((questionId) => getQuestion(questionId).organizationStatus !== 'ready')) throw new Error('待整理题目暂不能组卷，请先完成整理。')
  if (subject !== '综合' && questionIds.some((questionId) => getQuestion(questionId).subject !== subject)) throw new Error('跨学科选题时，请将练习卷学科设为“综合”。')
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
  Object.assign(state, createSeedState())
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
  await writeState(data, true)
  Object.assign(state, data)
  storageStatus.savedAt = new Date().toISOString()
  return counts
}

const store = { state, storageStatus, initialize, flushPersistence, retryPersistence, questions, pendingQuestions, readyQuestions, notes, papers, availableSubjects, dueQuestions, stats, addQuestion, addQuestions, updateQuestion, toggleFavorite, deleteQuestion, restoreQuestion, addTagsToQuestions, deleteQuestions, restoreQuestions, submitReview, setPlan, saveNote, deleteNote, savePaper, updateProfile, resetDemo, exportBackup, validateBackup, importBackup }

/** One reactive instance shared by all Vue pages; mutations always go through these methods. */
export function useStudyStore() { return store }

export type { BackupCounts, BackupEnvelope, BackupValidationResult, OrganizationStatus, Question, QuestionInput, QuestionSnapshot, Note, NoteInput, Paper, PaperInput, Profile, ReviewInput, ReviewRecord, StudyStats, Subject } from './types'
