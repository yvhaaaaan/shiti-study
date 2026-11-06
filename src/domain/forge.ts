import type { ForgeEvidence, ForgeStage, LearningReflection, QuestionSnapshot, ReviewRecord } from './types'

/** Metadata and personal notes can change without invalidating a test. */
export function questionContentKey(question: Pick<QuestionSnapshot, 'stem' | 'answer' | 'images'>): string {
  return JSON.stringify({ stem: question.stem, answer: question.answer, images: [...question.images] })
}

export const FORGE_STAGES = [
  { stage: 1, name: '选材', craft: '选材', title: '完成第一次测试', prompt: '独立作答，判题通过后完成第一阶。', placeholder: '这次弄懂了什么？（选填）', answerLabel: '我的作答', interval: 1 },
  { stage: 2, name: '锻形', craft: '锻形', title: '完成第二次测试', prompt: '每次答对推进一阶，答错不扣除已完成次数。', placeholder: '这次弄懂了什么？（选填）', answerLabel: '我的作答', interval: 1 },
  { stage: 3, name: '淬火', craft: '淬火', title: '完成第三次测试', prompt: '按题目要求作答，客观题自动核对，解答题由 AI 辅助判题。', placeholder: '这次弄懂了什么？（选填）', answerLabel: '我的作答', interval: 3 },
  { stage: 4, name: '磨刃', craft: '磨刃', title: '完成第四次测试', prompt: '继续测试这道题，答对即完成第四阶，无需另填变式题。', placeholder: '这次弄懂了什么？（选填）', answerLabel: '我的作答', interval: 3 },
  { stage: 5, name: '成锋', craft: '成锋', title: '完成第五次测试', prompt: '累计五次测试通过即可完成锻造，不要求连续答对或隔天作答。', placeholder: '这次弄懂了什么？（选填）', answerLabel: '我的作答', interval: 7 },
] as const

export function normalizeReflection(value: unknown): LearningReflection {
  if (value === undefined) return { mistake: '', insight: '', reminder: '' }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('我的复盘格式不正确。')
  const row = value as Record<string, unknown>
  const result = { mistake: '', insight: '', reminder: '' }
  for (const key of ['mistake', 'insight', 'reminder'] as const) {
    if (typeof row[key] !== 'string' || row[key].length > 2000) throw new Error('每项个人复盘需为文字，最多 2000 字。')
    result[key] = row[key].trim()
  }
  return result
}

export function normalizeForge(value: unknown): ForgeEvidence | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('锻造记录格式不正确。')
  const row = value as Record<string, unknown>
  if (!Number.isInteger(row.stage) || Number(row.stage) < 1 || Number(row.stage) > 5) throw new Error('锻造阶段应为 1 至 5。')
  if (typeof row.reflection !== 'string' || row.reflection.length > 2000) throw new Error('本次心得最多填写 2000 字。')
  const result: ForgeEvidence = { stage: row.stage as ForgeStage, reflection: row.reflection.trim() }
  for (const key of ['variantStem', 'variantAnswer'] as const) {
    if (row[key] !== undefined) {
      if (typeof row[key] !== 'string' || row[key].length > 5000) throw new Error('变式题与核对依据最多各填写 5000 字。')
      result[key] = row[key].trim()
    }
  }
  if (row.retired !== undefined) {
    if (typeof row.retired !== 'boolean') throw new Error('测试版本标记格式不正确。')
    result.retired = row.retired
  }
  if (row.assessment !== undefined) {
    const assessment = row.assessment as Record<string, unknown>
    if (!assessment || !['correct', 'wrong'].includes(String(assessment.verdict)) || !['objective', 'ai'].includes(String(assessment.method)) || typeof assessment.feedback !== 'string' || !assessment.feedback.trim() || assessment.feedback.length > 1000 || typeof assessment.submittedAnswer !== 'string' || !assessment.submittedAnswer.trim() || assessment.submittedAnswer.length > 5000) throw new Error('测试判题记录不完整。')
    result.assessment = { verdict: assessment.verdict as 'correct' | 'wrong', method: assessment.method as 'objective' | 'ai', feedback: assessment.feedback.trim(), submittedAnswer: assessment.submittedAnswer.trim() }
  }
  return result
}

/** Only judged test passes count. Historical self-assessments stay in the timeline. */
export function forgeProgress(questionId: string, reviews: readonly ReviewRecord[], _now = new Date()) {
  const seen = new Set<string>()
  const passed = reviews.filter(record => {
    if (record.questionId !== questionId || record.forge?.retired || record.forge?.assessment?.verdict !== 'correct' || record.rating === 'wrong' || seen.has(record.requestId)) return false
    seen.add(record.requestId); return true
  }).slice().sort((a,b) => a.reviewedAt.localeCompare(b.reviewedAt))
  const completed = Math.min(passed.length, 5)
  const nextStage = Math.min(completed + 1, 5) as ForgeStage
  return { completed, nextStage, lastPassedAt: passed.at(-1)?.reviewedAt, waitUntil: undefined as string | undefined, canAttempt: true, stage: FORGE_STAGES[nextStage - 1]! }
}

export function validateForgeAttempt(questionId: string, reviews: readonly ReviewRecord[], evidence: ForgeEvidence, answer: string, passed: boolean, now = new Date()) {
  const progress = forgeProgress(questionId, reviews, now)
  if (evidence.retired) throw new Error('不能提交已归档版本的测试。')
  if (evidence.stage !== progress.nextStage) throw new Error('锻造进度已变化，请重新打开这道题。')
  if (!evidence.assessment) throw new Error('请先提交测试并完成判题，不能自评升级。')
  if (!answer.trim() || evidence.assessment.submittedAnswer !== answer.trim() || (evidence.assessment.verdict === 'correct') !== passed) throw new Error('作答或结果与判题记录不一致，请重新测试。')
}

/** Old stages used different rules; retain them without inventing test evidence. */
export function validateForgeHistory(reviews: readonly ReviewRecord[]): void {
  for (const record of reviews) {
    const evidence = record.forge
    if (!evidence) continue
    if (evidence.assessment && (evidence.assessment.submittedAnswer !== record.answer.trim() || (evidence.assessment.verdict === 'correct') !== (record.rating !== 'wrong'))) throw new Error('测试判题记录与作答或结果不一致。')
  }
}
