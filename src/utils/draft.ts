import { isValidSubject } from '../domain/taxonomy'
import type { Difficulty, Subject } from '../domain/types'
import { storageStatus } from '../services/studyStorage'

export interface QuestionDraftForm {
  title: string
  subject: Subject
  stem: string
  answer: string
  analysis: string
  userAnswer: string
  remark: string
  remarkImages: string[]
  difficulty: Difficulty | ''
  source: string
  tags: string
  images: string[]
}

export interface QuestionDraft {
  version: 1
  questionId: string | null
  baseQuestionUpdatedAt: string | null
  updatedAt: string
  form: QuestionDraftForm
}

type DraftReadResult = { draft: QuestionDraft | null; error: string | null }
type DraftWriteResult = { ok: true; draft: QuestionDraft } | { ok: false; error: string }
type DraftClearResult = { ok: true } | { ok: false; error: string }

export const QUESTION_DRAFT_PREFIX = 'shiti.question-draft.v1:'

/** Drafts are independent from the saved study state and from other questions. */
export function questionDraftKey(questionId?: string | null): string {
  const account = storageStatus.cloud && storageStatus.user ? `account:${encodeURIComponent(storageStatus.user.ID)}:` : ''
  return `${QUESTION_DRAFT_PREFIX}${account}${questionId ? `question:${encodeURIComponent(questionId)}` : 'new'}`
}

function validForm(value: unknown): value is QuestionDraftForm {
  if (!value || typeof value !== 'object') return false
  const form = value as Partial<QuestionDraftForm>
  const textFields: Array<keyof QuestionDraftForm> = ['title', 'stem', 'answer', 'analysis', 'userAnswer', 'source', 'tags']
  return textFields.every(field => typeof form[field] === 'string')
    && (form.subject === '' || isValidSubject(form.subject))
    && typeof form.difficulty === 'string' && ['', '基础', '进阶', '挑战'].includes(form.difficulty)
    && Array.isArray(form.images) && form.images.every(image => typeof image === 'string')
    && (form.remark === undefined || (typeof form.remark === 'string' && form.remark.length <= 5000))
    && (form.remarkImages === undefined || (Array.isArray(form.remarkImages) && form.remarkImages.length <= 6 && form.remarkImages.every(image => typeof image === 'string')))
}

function copyForm(form: QuestionDraftForm): QuestionDraftForm {
  return {
    title: form.title, subject: form.subject, stem: form.stem,
    answer: form.answer, analysis: form.analysis, userAnswer: form.userAnswer,
    remark: form.remark ?? '', remarkImages: [...(form.remarkImages ?? [])],
    difficulty: form.difficulty, source: form.source,
    tags: form.tags, images: [...form.images],
  }
}

export function readQuestionDraft(questionId?: string | null, remarks?: Pick<QuestionDraftForm, 'remark' | 'remarkImages'>): DraftReadResult {
  try {
    if (typeof uni === 'undefined') throw new Error('Storage unavailable')
    const stored: unknown = uni.getStorageSync(questionDraftKey(questionId))
    if (stored === '' || stored === null || stored === undefined) return { draft: null, error: null }
    const value: unknown = typeof stored === 'string' ? JSON.parse(stored) : stored
    if (!value || typeof value !== 'object') throw new Error('Invalid draft')
    const draft = value as Partial<QuestionDraft>
    if (draft.version !== 1) return { draft: null, error: '上次草稿的版本暂不支持，尚未覆盖原草稿。' }
    if (draft.questionId !== (questionId || null)) return { draft: null, error: '上次草稿与当前题目不匹配，尚未覆盖原草稿。' }
    if ((draft.baseQuestionUpdatedAt !== null && typeof draft.baseQuestionUpdatedAt !== 'string')
      || typeof draft.updatedAt !== 'string' || Number.isNaN(new Date(draft.updatedAt).getTime()) || !validForm(draft.form)) throw new Error('Invalid draft')
    const form = copyForm(draft.form)
    // Drafts created before remarks existed cannot intentionally clear them.
    if (draft.form.remark === undefined) form.remark = remarks?.remark ?? ''
    if (draft.form.remarkImages === undefined) form.remarkImages = [...(remarks?.remarkImages ?? [])]
    return { draft: { version: 1, questionId: draft.questionId, baseQuestionUpdatedAt: draft.baseQuestionUpdatedAt, updatedAt: draft.updatedAt, form }, error: null }
  } catch {
    return { draft: null, error: '上次草稿暂时无法读取，尚未覆盖原草稿。' }
  }
}

export function writeQuestionDraft(form: QuestionDraftForm, questionId?: string | null, baseQuestionUpdatedAt?: string | null): DraftWriteResult {
  try {
    if (typeof uni === 'undefined') throw new Error('Storage unavailable')
    if (!validForm(form)) throw new Error('Invalid draft')
    const draft: QuestionDraft = { version: 1, questionId: questionId || null, baseQuestionUpdatedAt: baseQuestionUpdatedAt || null, updatedAt: new Date().toISOString(), form: copyForm(form) }
    uni.setStorageSync(questionDraftKey(questionId), draft)
    return { ok: true, draft }
  } catch {
    return { ok: false, error: '草稿未能保存到设备，当前输入只保留在本次页面，请勿直接退出。' }
  }
}

export function clearQuestionDraft(questionId?: string | null): DraftClearResult {
  try {
    if (typeof uni === 'undefined') throw new Error('Storage unavailable')
    uni.removeStorageSync(questionDraftKey(questionId))
    return { ok: true }
  } catch {
    return { ok: false, error: '旧草稿暂时无法清除，请稍后重试。' }
  }
}
