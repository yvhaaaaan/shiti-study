import type { PaperSubject, Subject } from './types'

export const SUBJECT_MAX_LENGTH = 20
export const MAX_TAGS = 30
export const MAX_TAG_LENGTH = 32

function characterCount(value: string): number { return Array.from(value).length }

/** Only canonical names are valid; use normalizeSubject for user input. */
export function isValidSubject(value: unknown): value is Subject {
  return typeof value === 'string'
    && value.length > 0
    && value === value.trim()
    && characterCount(value) <= SUBJECT_MAX_LENGTH
    && !/[\u0000-\u001f\u007f\u2028\u2029]/.test(value)
    && value !== '全部'
    && value !== '综合'
}

export function normalizeSubject(value: unknown): Subject {
  if (typeof value !== 'string') throw new Error('请选择或填写学科名称。')
  const subject = value.trim()
  if (!subject) throw new Error('请填写学科名称。')
  if (subject === '全部' || subject === '综合') throw new Error('“全部”和“综合”用于筛选或组卷，请填写具体学科。')
  if (characterCount(subject) > SUBJECT_MAX_LENGTH) throw new Error(`学科名称最多 ${SUBJECT_MAX_LENGTH} 个字。`)
  if (!isValidSubject(subject)) throw new Error('学科名称不能包含换行或控制字符。')
  return subject
}

export function normalizePaperSubject(value: unknown): PaperSubject {
  if (typeof value === 'string' && value.trim() === '综合') return '综合'
  return normalizeSubject(value)
}

/** Split typing/pasting input without splitting spaces or historical tags like "since / for". */
export function parseTags(value: string | readonly string[]): string[] {
  const values = typeof value === 'string' ? [value] : value
  if (!Array.isArray(values) || values.some((item) => typeof item !== 'string')) throw new Error('标签必须是文字。')
  return [...new Set(values.flatMap((item: string) => item.split(/[,，、;；\r\n]+/)).map((item: string) => item.trim()).filter(Boolean))]
}

/** Final persistence validation; never silently discard over-limit tags. */
export function normalizeTags(value?: string | readonly string[]): string[] {
  const tags = value === undefined ? [] : parseTags(value)
  if (tags.length > MAX_TAGS) throw new Error(`每道题最多添加 ${MAX_TAGS} 个标签。`)
  const longTag = tags.find((tag) => characterCount(tag) > MAX_TAG_LENGTH)
  if (longTag) throw new Error(`每个标签最多 ${MAX_TAG_LENGTH} 个字，请缩短“${Array.from(longTag).slice(0, 12).join('')}…”。`)
  if (tags.some((tag) => /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u2028\u2029]/.test(tag))) throw new Error('标签不能包含控制字符。')
  return tags
}
