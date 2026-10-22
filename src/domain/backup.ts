import { normalizePaperSubject, normalizeSubject, normalizeTags } from './taxonomy'
import type { BackupCounts, BackupEnvelope, BackupValidationResult, Note, Paper, Profile, Question, QuestionSnapshot, ReviewRecord, StudyState } from './types'

export const MAX_BACKUP_BYTES = 50 * 1024 * 1024
export const BACKUP_LIMITS = { questions: 10000, notes: 5000, papers: 2000, reviews: 50000 } as const

type Row = Record<string, unknown>

function fail(message: string): never { throw new Error(message) }

function object(value: unknown, label: string): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}格式不正确。`)
  return value as Row
}

function text(value: unknown, label: string, nonempty = false): string {
  if (typeof value !== 'string' || (nonempty && !value.trim())) fail(`${label}${nonempty ? '不能为空' : '必须是文字'}。`)
  return value
}

function list(value: unknown, label: string, limit: number): unknown[] {
  if (!Array.isArray(value)) fail(`${label}必须是列表。`)
  if (value.length > limit) fail(`${label}超过 ${limit} 条，无法导入。`)
  return value
}

function strings(value: unknown, label: string, limit = 10000): string[] {
  const values = list(value, label, limit).map((item) => text(item, label, true))
  if (new Set(values).size !== values.length) fail(`${label}存在重复项。`)
  return values
}

function choice<T extends string>(value: unknown, options: readonly T[], label: string): T {
  if (typeof value !== 'string' || !options.includes(value as T)) fail(`${label}不是支持的选项。`)
  return value as T
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') fail(`${label}必须是布尔值。`)
  return value
}

function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail(`${label}必须是非负整数。`)
  return value
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T12:00:00`)
  if (!Number.isFinite(parsed.getTime())) return false
  return parsed.getFullYear() === Number(value.slice(0, 4)) && parsed.getMonth() + 1 === Number(value.slice(5, 7)) && parsed.getDate() === Number(value.slice(8, 10))
}

function calendarDate(value: unknown, label: string): string {
  const date = text(value, label, true)
  if (!isCalendarDate(date)) fail(`${label}应为有效的 YYYY-MM-DD 日期。`)
  return date
}

function timestamp(value: unknown, label: string): string {
  const date = text(value, label, true)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(date) || !isCalendarDate(date.slice(0, 10)) || !Number.isFinite(new Date(date).getTime())) fail(`${label}不是有效的完整时间。`)
  return date
}

function optionalDate(row: Row, key: string, label: string, fullTime = false): string | undefined {
  return row[key] === undefined ? undefined : fullTime ? timestamp(row[key], label) : calendarDate(row[key], label)
}

function assertUnique<T>(rows: T[], key: (row: T) => string, label: string): void {
  const seen = new Set<string>()
  for (const row of rows) {
    const value = key(row)
    if (seen.has(value)) fail(`${label}存在重复标识“${value.slice(0, 40)}”。`)
    seen.add(value)
  }
}

function byteLength(value: string): number {
  let bytes = 0
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x7f) bytes += 1
    else if (code <= 0x7ff) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) { bytes += 4; index += 1 }
    else bytes += 3
    if (bytes > MAX_BACKUP_BYTES) break
  }
  return bytes
}

function checkSize(json: string): void {
  if (json.length > MAX_BACKUP_BYTES || byteLength(json) > MAX_BACKUP_BYTES) fail('备份文件超过 50 MB，请减少题图后重新导出。')
}

/** Pure validation: no storage, reactive state, network, or file mutations. */
export function validateBackup(json: string): BackupValidationResult {
  if (typeof json !== 'string' || !json.trim()) fail('请先选择或粘贴拾题 JSON 备份。')
  checkSize(json)
  let parsed: unknown
  try { parsed = JSON.parse(json.replace(/^\uFEFF/, '')) } catch { fail('无法读取 JSON，请确认文件完整且未被修改。') }
  const envelope = object(parsed, '备份文件')
  if (envelope.format !== 'shiti-backup') fail('这不是拾题备份，请选择由拾题导出的 JSON 文件。')
  if (envelope.schemaVersion !== 1) fail('暂不支持此备份版本，请使用备份对应版本的拾题应用。')
  timestamp(envelope.exportedAt, '备份时间')
  const source = object(envelope.data, '备份数据')
  if (source.version !== 1) fail('备份中的数据版本不受支持。')

  const localImages = new Set<string>()
  const temporaryImages = new Set<string>()
  function images(value: unknown, label: string): string[] {
    return strings(value, label).map((path) => {
      if (/[\u0000-\u001f]/.test(path)) fail(`${label}含有无效图片路径。`)
      if (/^data:/i.test(path)) {
        if (!/^data:image\/[a-z0-9.+-]+(?:;charset=[a-z0-9-]+)?;base64,[a-z0-9+/]+={0,2}$/i.test(path)) fail(`${label}含有无效的图片数据。`)
        return path
      }
      const temporary = /^blob:/i.test(path) || /^(?:https?:\/\/tmp\/|wxfile:\/\/tmp(?:\/|_))/i.test(path)
      const miniLocal = /^https?:\/\/(?:tmp|usr)\//i.test(path)
      if (!miniLocal && /^https?:\/\/[^\s/?#]+(?:[/?#][^\s]*)?$/i.test(path)) return path
      if (/^[a-z][a-z0-9+.-]*:/i.test(path) && !/^(?:wxfile|file|blob|unifile|uniapp):/i.test(path) && !/^[a-z]:[\\/]/i.test(path) && !miniLocal) fail(`${label}含有不支持的图片地址。`)
      localImages.add(path)
      if (temporary) temporaryImages.add(path)
      return path
    })
  }

  const questions = list(source.questions, '题目', BACKUP_LIMITS.questions).map((value, index): Question => {
    const label = `第 ${index + 1} 道题`
    const row = object(value, label)
    const stem = text(row.stem, `${label}题干`)
    const questionImages = images(row.images, `${label}图片`)
    const remarkImages = images(row.remarkImages === undefined ? [] : row.remarkImages, `${label}备注附图`)
    if (remarkImages.length > 6) fail(`${label}备注附图超过 6 张。`)
    const remark = row.remark === undefined ? '' : text(row.remark, `${label}补充说明`)
    if (remark.length > 5000) fail(`${label}补充说明超过 5000 字。`)
    if (!stem.trim() && questionImages.length === 0) fail(`${label}缺少题干和图片。`)
    const organizationStatus = row.organizationStatus === undefined ? 'ready' : choice(row.organizationStatus, ['pending', 'ready'] as const, `${label}整理状态`)
    const subject = organizationStatus === 'pending' && text(row.subject, `${label}学科`).trim() === '' ? '' : normalizeSubject(row.subject)
    const difficulty = organizationStatus === 'pending' && row.difficulty === '' ? '' : choice(row.difficulty, ['基础', '进阶', '挑战'] as const, `${label}难度`)
    const organizedAt = optionalDate(row, 'organizedAt', `${label}整理完成时间`, true)
    const status = choice(row.status, ['reinforce', 'mastered'] as const, `${label}状态`)
    const nextReviewDate = optionalDate(row, 'nextReviewDate', `${label}复习日期`)
    if (organizationStatus === 'pending' && nextReviewDate) fail(`${label}尚待整理，不能安排复习计划。`)
    if (organizationStatus === 'pending' && organizedAt) fail(`${label}尚待整理，不能标记整理完成时间。`)
    if (status === 'mastered' && nextReviewDate) fail(`${label}已掌握，不能同时保留待复习计划。`)
    return {
      id: text(row.id, `${label}标识`, true), title: text(row.title, `${label}标题`, true),
      subject, stem,
      answer: text(row.answer, `${label}答案`), analysis: text(row.analysis, `${label}解析`),
      userAnswer: text(row.userAnswer, `${label}作答`),
      remark, remarkImages,
      tags: normalizeTags(strings(row.tags, `${label}标签`)), difficulty,
      source: text(row.source, `${label}来源`), favorite: boolean(row.favorite, `${label}收藏状态`), status, organizationStatus, organizedAt,
      createdAt: timestamp(row.createdAt, `${label}收录时间`), updatedAt: timestamp(row.updatedAt, `${label}更新时间`),
      deletedAt: optionalDate(row, 'deletedAt', `${label}删除时间`, true), images: questionImages, nextReviewDate,
      reviewCount: integer(row.reviewCount, `${label}复习次数`), lastReviewedAt: optionalDate(row, 'lastReviewedAt', `${label}最近复习时间`, true),
    }
  })
  assertUnique(questions, (question) => question.id, '题目')
  const questionMap = new Map(questions.map((question) => [question.id, question]))
  function references(value: unknown, label: string): string[] {
    const ids = strings(value, label, BACKUP_LIMITS.questions)
    if (ids.some((questionId) => !questionMap.has(questionId))) fail(`${label}引用了备份中不存在的题目，未导入任何数据。`)
    return ids
  }

  const notes = list(source.notes, '笔记', BACKUP_LIMITS.notes).map((value, index): Note => {
    const label = `第 ${index + 1} 篇笔记`, row = object(value, label)
    const noteImages = images(row.images === undefined ? [] : row.images, `${label}附图`)
    if (noteImages.length > 6) fail(`${label}附图超过 6 张。`)
    const content = text(row.content, `${label}正文`)
    if (!content.trim() && !noteImages.length) fail(`${label}缺少文字和图片。`)
    return {
      id: text(row.id, `${label}标识`, true), title: text(row.title, `${label}标题`, true),
      subject: normalizeSubject(row.subject), content, images: noteImages,
      questionIds: references(row.questionIds, `${label}关联题目`),
      createdAt: timestamp(row.createdAt, `${label}创建时间`), updatedAt: timestamp(row.updatedAt, `${label}更新时间`),
    }
  })
  assertUnique(notes, (note) => note.id, '笔记')

  const papers = list(source.papers, '练习卷', BACKUP_LIMITS.papers).map((value, index): Paper => {
    const label = `第 ${index + 1} 份练习卷`, row = object(value, label)
    const subject = normalizePaperSubject(row.subject)
    const questionIds = references(row.questionIds, `${label}题目`)
    if (!questionIds.length) fail(`${label}没有选题。`)
    if (subject !== '综合' && questionIds.some((questionId) => questionMap.get(questionId)!.organizationStatus === 'ready' && questionMap.get(questionId)!.subject !== subject)) fail(`${label}包含其他学科题目，单科练习卷不能跨科。`)
    return {
      id: text(row.id, `${label}标识`, true), title: text(row.title, `${label}标题`, true), subject, questionIds,
      createdAt: timestamp(row.createdAt, `${label}创建时间`), updatedAt: timestamp(row.updatedAt, `${label}更新时间`),
    }
  })
  assertUnique(papers, (paper) => paper.id, '练习卷')

  const reviews = list(source.reviews, '复习记录', BACKUP_LIMITS.reviews).map((value, index): ReviewRecord => {
    const label = `第 ${index + 1} 条复习记录`, row = object(value, label)
    const questionId = text(row.questionId, `${label}题目标识`, true)
    if (!questionMap.has(questionId)) fail(`${label}引用了备份中不存在的题目，未导入任何数据。`)
    let questionSnapshot: QuestionSnapshot | undefined
    if (row.questionSnapshot !== undefined) {
      const snapshot = object(row.questionSnapshot, `${label}题面快照`)
      const snapshotImages = images(snapshot.images, `${label}快照图片`)
      const snapshotStem = text(snapshot.stem, `${label}快照题干`)
      if (!snapshotStem.trim() && !snapshotImages.length) fail(`${label}题面快照缺少题干和图片。`)
      questionSnapshot = Object.freeze({
        title: text(snapshot.title, `${label}快照标题`, true), stem: snapshotStem,
        answer: text(snapshot.answer, `${label}快照答案`), analysis: text(snapshot.analysis, `${label}快照解析`),
        images: Object.freeze(snapshotImages),
      })
    }
    const rating = choice(row.rating, ['wrong', 'correct', 'mastered'] as const, `${label}自评`)
    const planDate = optionalDate(row, 'planDate', `${label}下次复习日期`)
    if (rating === 'mastered' && planDate) fail(`${label}已掌握，不能同时安排待复习日期。`)
    return {
      id: text(row.id, `${label}标识`, true), requestId: text(row.requestId, `${label}提交标识`, true),
      questionId, answer: text(row.answer, `${label}作答`), rating,
      reviewedAt: timestamp(row.reviewedAt, `${label}时间`), planDate, questionSnapshot,
    }
  })
  assertUnique(reviews, (review) => review.id, '复习记录')
  assertUnique(reviews, (review) => review.requestId, '复习提交')
  const history = new Map<string, { count: number; last?: string }>()
  for (const review of reviews) {
    const current = history.get(review.questionId) ?? { count: 0 }
    current.count += 1
    if (!current.last || new Date(review.reviewedAt).getTime() > new Date(current.last).getTime()) current.last = review.reviewedAt
    history.set(review.questionId, current)
  }
  for (const question of questions) {
    const current = history.get(question.id)
    question.reviewCount = current?.count ?? 0
    question.lastReviewedAt = current?.last
  }

  const profileSource = object(source.profile, '个人资料')
  const profile: Profile = {
    nickname: text(profileSource.nickname, '昵称', true), school: text(profileSource.school, '学校'),
    grade: text(profileSource.grade, '学习阶段'), goal: text(profileSource.goal, '学习目标'), avatarColor: text(profileSource.avatarColor, '头像颜色'),
  }
  const counts: BackupCounts = { questions: questions.length, notes: notes.length, papers: papers.length, reviews: reviews.length }
  const warnings: string[] = []
  if (localImages.size) warnings.push(`备份包含 ${localImages.size} 个本机图片路径（含复习快照，按路径去重）。JSON 仅保存路径，不包含对应图片文件；换设备或浏览器后可能无法显示。`)
  if (temporaryImages.size) warnings.push(`其中 ${temporaryImages.size} 个为临时图片路径，关闭页面或清理缓存后也可能失效。`)
  return { counts, warnings, localImageCount: localImages.size, data: { version: 1, questions, notes, papers, reviews, profile, storageError: null } }
}

/** Export only supported fields, and use the same validation as restoration. */
export function serializeBackup(state: StudyState): string {
  const envelope: BackupEnvelope = {
    format: 'shiti-backup', schemaVersion: 1, exportedAt: new Date().toISOString(),
    data: { version: 1, questions: state.questions, notes: state.notes, papers: state.papers, reviews: state.reviews, profile: state.profile },
  }
  let json: string
  try { json = JSON.stringify(envelope) } catch { fail('当前数据无法生成 JSON 备份，请检查记录后重试。') }
  const { data } = validateBackup(json)
  envelope.data = { version: 1, questions: data.questions, notes: data.notes, papers: data.papers, reviews: data.reviews, profile: data.profile }
  json = JSON.stringify(envelope)
  checkSize(json)
  return json
}
