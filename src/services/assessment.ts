import { prepareImage } from './questionAi'
import { assessObjective, requiresSemanticGrading, type AssessmentResult } from '../domain/assessment'

export async function assessAnswer(input: { stem: string; reference: string; answer: string; stage: number; images?: string[] }): Promise<AssessmentResult> {
  const objective = assessObjective(input.answer, input.reference)
  if (!requiresSemanticGrading(input.stem, input.images) && objective.verdict !== 'unresolved') return objective
  const configured = String(import.meta.env.VITE_SHITI_AI_URL || '').trim()
  if (configured && !/^https:\/\//i.test(configured) && !/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\//i.test(configured)) throw new Error('判题服务地址需使用 HTTPS。')
  // #ifdef MP-WEIXIN
  if (!configured) throw new Error('微信端尚未配置判题服务。')
  // #endif
  const sources = input.images || []
  const images: string[] = []
  const url = configured || '/api/question-generate'
  for (const source of sources) images.push(await prepareImage(source, Math.floor(820 * 1024 / Math.max(1, sources.length)), url))
  return new Promise((resolve, reject) => {
    const header: Record<string, string> = { 'Content-Type': 'application/json' }
    // #ifdef MP-WEIXIN
    header['X-Shiti-Client'] = 'mini-program'
    // #endif
    uni.request({ url: configured || '/api/question-generate', method: 'POST', header, timeout: 90000,
      data: { ...input, operation: 'assess', images, tags: [] },
      success(response) {
        const data = response.data as { verdict?: string; feedback?: string; method?: string; error?: { message?: string } }
        if (response.statusCode !== 200) return reject(new Error(data?.error?.message || '判题服务暂不可用，作答已保留，请重试。'))
        if (!data || !['correct', 'wrong', 'unresolved'].includes(data.verdict || '') || typeof data.feedback !== 'string' || !data.feedback.trim() || data.feedback.length > 1000 || data.method !== 'ai') return reject(new Error('判题结果不完整，本次不计入锻造。'))
        resolve({ verdict: data.verdict as AssessmentResult['verdict'], feedback: data.feedback, method: 'ai' })
      },
      fail() { reject(new Error('暂时无法连接判题服务，作答已保留，请稍后重试。')) },
    })
  })
}
