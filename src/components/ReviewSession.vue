<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useStudyStore } from '../domain/store'
import { dayOffset } from '../domain/seed'
import { forgeProgress, FORGE_STAGES, questionContentKey } from '../domain/forge'
import type { ForgeStage, Question, ReviewRating } from '../domain/types'
import AppIcon from './AppIcon.vue'
import BrandMark from './BrandMark.vue'
import { assessAnswer } from '../services/assessment'
import type { AssessmentResult } from '../domain/assessment'
import MathText from './MathText.vue'
import ForgeProgress from './ForgeProgress.vue'
const props = defineProps<{ ids: string[]; title?: string }>()
const emit = defineEmits<{ close: [] }>()
const store = useStudyStore()
function questionsFor(ids: string[]) { return [...new Set(ids)].map(id => store.practiceQuestions.value.find(q => q.id === id)).filter((q): q is Question => !!q).map(q => JSON.parse(JSON.stringify(q)) as Question) }
const items = ref(questionsFor(props.ids))
const index = ref(0)
const q = computed(() => items.value[index.value])
const progress = computed(() => forgeProgress(q.value?.id ?? '', store.state.reviews))
const attemptStage = ref<ForgeStage>(progress.value.nextStage)
const expectedContent = ref(q.value ? questionContentKey(q.value) : '')
const liveQuestion = computed(() => store.practiceQuestions.value.find(row => row.id === q.value?.id))
const questionChanged = computed(() => !!q.value && (!liveQuestion.value || questionContentKey(liveQuestion.value) !== expectedContent.value))
// Keep the task stable while persistence is pending or being retried.
const task = computed(() => FORGE_STAGES[attemptStage.value - 1]!)
const revealed = ref(false)
const answer = ref('')
const reflection = ref('')
const assessment = ref<AssessmentResult | null>(null)
const submittedAnswer = ref('')
const judging = ref(false)
const planDate = ref(dayOffset(task.value.interval))
const finished = ref(false)
const submitting = ref(false)
const feedback = ref(false)
const error = ref('')
const scrollTop = ref(0)
let lastScrollTop = 0
const results = ref<Array<{ questionId: string; title: string; rating: ReviewRating; stage: ForgeStage; completed: number; planDate?: string }>>([])
const failedQuestionIds = computed(() => [...new Map(results.value.map(row => [row.questionId, row])).values()].filter(row => row.rating === 'wrong').map(row => row.questionId))
const lastResult = computed(() => results.value[results.value.length - 1])
const successCount = computed(() => results.value.filter(row => row.rating !== 'wrong').length)
const masteredCount = computed(() => new Set(results.value.filter(row => row.completed === 5).map(row => row.questionId)).size)
const requestId = ref(newRequestId())
const canPass = computed(() => assessment.value?.verdict === 'correct' && !!submittedAnswer.value)
function newRequestId() { return `forge-${Date.now()}-${Math.random().toString(16).slice(2)}` }
function nextPlanDate() {
  const interval = Number(task.value?.interval)
  return Number.isFinite(interval) ? dayOffset(interval) : dayOffset(1)
}
function normalizedPlanDate() {
  const value = String(planDate.value || '')
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : nextPlanDate()
}
function resetQuestion() { const current = questionsFor([q.value?.id || ''])[0]; if (current) items.value[index.value] = current; expectedContent.value = q.value ? questionContentKey(q.value) : ''; attemptStage.value = progress.value.nextStage; answer.value = ''; reflection.value = ''; assessment.value = null; submittedAnswer.value = ''; revealed.value = false; feedback.value = false; planDate.value = nextPlanDate(); requestId.value = newRequestId(); error.value = '' }
async function scrollToStart() { scrollTop.value = lastScrollTop; await nextTick(); scrollTop.value = 0 }
function advance() { if (index.value + 1 >= items.value.length) finished.value = true; else { index.value++; resetQuestion() }; void scrollToStart() }
async function submitTest() {
  if (!q.value || judging.value || revealed.value || !answer.value.trim() || questionChanged.value) return
  judging.value = true; error.value = ''
  const snapshot = answer.value.trim()
  try {
    const result = await assessAnswer({ stem: q.value.stem, reference: q.value.answer, answer: snapshot, stage: attemptStage.value, images: q.value.images })
    assessment.value = result
    if (result.verdict === 'unresolved') { error.value = result.feedback; return }
    submittedAnswer.value = snapshot; revealed.value = true
    await grade(result.verdict)
  } catch (e) { error.value = e instanceof Error ? e.message : '判题暂不可用，请重试。' }
  finally { judging.value = false }
}
async function grade(rating: 'wrong' | 'correct') {
  if (!q.value || submitting.value || feedback.value || !revealed.value || !assessment.value || assessment.value.verdict !== rating) return
  if (rating === 'correct' && !canPass.value) { error.value = '请先完成判题。'; return }
  submitting.value = true; error.value = ''
  try {
    const safePlanDate = normalizedPlanDate()
    const record = store.submitReview(q.value.id, {
      answer: submittedAnswer.value, rating, expectedContent: expectedContent.value, requestId: requestId.value,
      ...(safePlanDate ? { planDate: safePlanDate } : {}),
      forge: { stage: attemptStage.value, reflection: reflection.value, assessment: { verdict: rating, method: assessment.value.method, feedback: assessment.value.feedback, submittedAnswer: submittedAnswer.value } },
    })
    await store.flushPersistence()
    if (record.forge?.retired) throw new Error('题目在保存期间已修改，请重新载入后测试。')
    results.value.push({ questionId: q.value.id, title: record.questionSnapshot?.title || q.value.title, rating: record.rating, stage: record.forge!.stage, completed: forgeProgress(q.value.id, store.state.reviews).completed, planDate: record.planDate })
    feedback.value = true
    void scrollToStart()
  } catch (e) { error.value = e instanceof Error ? e.message : '保存未完成，请重试。' }
  finally { submitting.value = false }
}
function retryCurrent() { resetQuestion(); void scrollToStart() }
function retryWrong() { items.value = questionsFor(failedQuestionIds.value); index.value = 0; finished.value = false; resetQuestion(); void scrollToStart() }
function quit() {
  if (submitting.value || judging.value) return
  if (finished.value || !items.value.length || feedback.value) return emit('close')
  uni.showModal({ title: '暂时结束练习？', content: '已提交的成长记录会保留。本题未提交的作答与心得不会保存。', confirmText: '结束练习', cancelText: '继续打磨', success: res => { if (res.confirm) emit('close') } })
}
</script>

<template>
  <view class="review-overlay">
    <view class="review-top"><view class="review-brand"><BrandMark /><text>打铁匠</text><text class="review-top-title">/ {{ title || '测试锻造' }}</text></view><button class="button button-quiet" :disabled="submitting || judging" @tap="quit"><AppIcon name="x" :size="16" /><text>结束练习</text></button></view>
    <view v-if="store.state.storageError" class="review-storage-warning">记录尚未保存，请保留页面并重试。{{ store.state.storageError }}</view>
    <scroll-view scroll-y class="review-scroll" :scroll-top="scrollTop" @scroll="lastScrollTop = $event.detail.scrollTop"><view class="review-container">
      <view v-if="!items.length" class="review-finish"><text class="finish-title">先把解答补完整</text><text class="finish-sub">题目有参考答案后，才能开始测试。</text><button class="button button-primary" @tap="emit('close')">返回错题本</button></view>
      <view v-else-if="finished" class="review-finish">
        <text class="finish-title">本轮测试已完成</text><text class="finish-sub">判题结果与进度已保存到对应的错题页。</text>
        <view class="finish-stats"><view><text>{{ results.length }}</text><text>测试次数</text></view><view><text>{{ successCount }}</text><text>答对次数</text></view><view><text>{{ masteredCount }}</text><text>完成锻造的题目</text></view></view>
        <view class="round-results"><view v-for="(result, resultIndex) in results" :key="`${result.questionId}-${resultIndex}`" class="round-result-row"><text class="result-index">{{ resultIndex + 1 }}</text><view><text>{{ result.title }}</text><text class="result-sub">{{ result.rating === 'wrong' ? '未通过，进度保留' : '测试通过' }} · 已完成 {{ result.completed }}/5 阶</text></view></view></view>
        <view class="finish-actions"><button v-if="failedQuestionIds.length" class="button button-quiet" @tap="retryWrong">重练未通过的题</button><button class="button button-primary" @tap="emit('close')">回到错题本</button></view>
      </view>
      <view v-else-if="feedback && lastResult" class="forge-feedback" aria-live="polite">
        <text class="finish-title">{{ lastResult.rating === 'wrong' ? '这次没做对，订正后再试。' : lastResult.completed === 5 ? '五次通过，完成锻造！' : `测试通过，完成第 ${lastResult.completed} 阶。` }}</text>
        <ForgeProgress :completed="lastResult.completed" :active-stage="lastResult.stage" :animating="lastResult.rating !== 'wrong'" />
        <view class="test-verdict" :class="assessment?.verdict"><text>{{ assessment?.verdict === 'correct' ? '回答正确' : '还需订正' }}</text><text>{{ assessment?.feedback }}</text><text>{{ assessment?.method === 'ai' ? 'AI 辅助判题 · 请结合解析核对' : '客观答案自动核对' }}</text></view>
        <text class="feedback-copy">{{ lastResult.rating === 'wrong' ? '本次作答已保存，当前阶段不前进，之前通过的次数不扣除。' : '本次答对已自动记入锻造进度，不需要填写心得才能升级。' }}</text>
<text v-if="lastResult.planDate" class="feedback-plan">下次复习提醒：{{ lastResult.planDate }}</text>
        <view v-if="q" class="review-solution"><text class="field-label">参考答案与解析</text><MathText :text="q.answer" class="solution-answer" /><MathText :text="q.analysis || '请对照题目条件核对。'" class="solution-analysis" /></view>
        <button v-if="lastResult.completed < 5 || lastResult.rating === 'wrong'" class="button button-quiet next-forge retry-current" @tap="retryCurrent">{{ lastResult.rating === 'wrong' ? '订正后重新测试' : '继续测试这道题' }}</button>
        <button class="button button-primary next-forge advance-test" @tap="advance">{{ index + 1 < items.length ? '下一道题' : '查看本轮结果' }}</button>
      </view>
      <view v-else-if="q" class="review-body">
        <view v-if="questionChanged" class="review-error stale-question" role="alert"><text>这道题已修改、删除或暂不具备测试条件，本次旧作答不会计入锻造。</text><button v-if="liveQuestion" class="button button-quiet" :disabled="judging || submitting" @tap="retryCurrent">重新载入题目</button><button v-else class="button button-quiet" :disabled="judging || submitting" @tap="advance">跳过此题</button></view>
        <view class="review-intro"><view><text class="review-page-title">第 {{ attemptStage }} 阶 · {{ task.craft }}</text></view><text class="review-counter">{{ index + 1 }} / {{ items.length }} 题</text></view>
        <view class="task-banner"><text>{{ progress.completed === 5 ? '锻造已完成，本次为额外巩固' : task.title }}</text><text>{{ task.prompt }}</text><ForgeProgress :completed="progress.completed" compact /></view>
        <view class="review-question"><view class="review-question-meta"><text class="badge">{{ q.subject }}</text><text class="muted small">独立测试</text></view><text class="review-question-title">{{ q.title }}</text><MathText :text="q.stem" class="review-stem" /><image v-for="image in q.images" :key="image" :src="image" mode="widthFix" class="review-image" />
          <view class="write-answer"><text class="field-label">我的作答</text><textarea v-model="answer" :disabled="revealed || judging || questionChanged" class="review-input review-answer-input" :maxlength="5000" aria-label="我的作答" placeholder="按题目要求填写答案，解答题请写必要步骤。" /></view>
          <view class="write-answer"><text class="field-label">本次心得（选填，不影响进度）</text><textarea v-model="reflection" :disabled="revealed || judging || questionChanged" class="review-input forge-reflection-input" :maxlength="2000" aria-label="本次心得" :placeholder="task.placeholder" /></view>
        </view>
        <view class="review-before"><text>每次测试答对自动推进一阶；答错不扣次数。累计五次通过完成锻造。</text><text v-if="error" class="review-error" role="alert">{{ error }}</text><button v-if="!revealed" class="button button-primary reveal-button" :disabled="judging || submitting || !answer.trim() || questionChanged" @tap="submitTest">{{ judging || submitting ? '正在核验并保存…' : '提交测试' }}</button><button v-else-if="!questionChanged" class="button button-primary reveal-button retry-save" :disabled="submitting" @tap="grade(assessment!.verdict as 'correct' | 'wrong')">{{ submitting ? '正在保存…' : '重试保存本次测试' }}</button></view>
        <text class="review-footnote">练习计划只用来提醒，不限制何时测试。五次通过不等于永久掌握，仍可再次巩固。</text>
      </view>
    </view></scroll-view>
  </view>
</template>

<style scoped>
.review-overlay{position:fixed;inset:0;z-index:900;display:flex;flex-direction:column;background:#f7f3f0;color:#473a30}.review-top{flex-shrink:0;height:74px;display:flex;align-items:center;justify-content:space-between;padding:0 32px;border-bottom:1px solid #e9e0d8;background:#fffffff0;gap:15px}.review-brand{display:flex;gap:10px;align-items:center;font-size:21px;font-weight:650;min-width:0}.review-top-title{font-size:12px;font-weight:400;color:#9f9187;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.review-scroll{height:0;flex:1;min-height:0}.review-container{max-width:740px;margin:auto;padding:36px 24px calc(70px + env(safe-area-inset-bottom))}.review-intro{display:flex;gap:20px;justify-content:space-between;align-items:center;margin-bottom:23px}.review-page-title{font-size:25px;line-height:1.5;display:block;margin-top:9px;font-weight:600;letter-spacing:-.6px}.review-counter{white-space:nowrap;font:15px Georgia,serif;color:#9a8b7f}.task-banner{background:#f3efdf;border:1px solid #e6dfc6;border-radius:14px;padding:18px 21px;margin-bottom:18px}.task-banner>text:first-child{display:block;font-size:12px;color:#a08752;font-weight:550}.task-banner>text:nth-child(2){display:block;font-size:12px;line-height:1.9;color:#918379;margin:8px 0}.review-question{padding:26px 28px;background:#fffefb;border:1px solid #e9e0d7;border-radius:16px;min-width:0}.review-question-meta{display:flex;align-items:center;justify-content:space-between}.review-question-title{font-size:20px;font-weight:600;line-height:1.6;display:block;margin:20px 0 14px}.review-stem{display:block;font-size:16px;line-height:2;color:#66574b;white-space:pre-wrap}.review-image{width:100%;margin-top:15px}.write-answer,.variant-fields{margin-top:22px;border-top:1px dashed #eae2db;padding-top:18px}.review-input{box-sizing:border-box;width:100%;min-height:108px;font-size:14px;line-height:1.9;color:#635347;margin-top:10px;background:#fbf8f6;border:1px solid #eae2da;border-radius:9px;padding:13px 15px}.original-attempt{background:#f9f1e3;border-radius:9px;padding:15px;margin-top:16px;font-size:12px;line-height:1.9;color:#9b8259}.original-attempt>text{display:block;font-size:10px;margin-bottom:7px}.review-before{text-align:center;margin-top:22px}.review-before>text{display:block;font-size:11px;color:#a2978e}.reveal-button{margin:16px auto 0;justify-content:center;min-height:46px;width:fit-content}.review-solution{padding:23px 25px;background:#f2ede8;border:1px solid #e7ddd3;border-radius:14px;margin-top:18px}.solution-answer{display:block;font-size:18px;line-height:1.9;margin:12px 0;color:#735d4d}.solution-analysis{display:block;font-size:13px;line-height:1.95;white-space:pre-wrap;color:#897a6e}.review-reflection{padding:22px 24px;margin-top:18px;border:1px solid #e8ded5;border-radius:14px;background:#fffef8}.forge-confirm{display:flex;gap:10px;align-items:flex-start;text-align:left;padding:13px 0 4px;margin:0;background:transparent;font-size:12px;line-height:1.8;color:#8e7e71}.confirmation-box{width:18px;height:18px;border-radius:4px;border:1px solid #c2b3a7;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px;box-sizing:border-box;margin-top:2px}.checked .confirmation-box{background:#846e5e;color:#fff;border-color:#846e5e}.self-assessment-note{font-size:10px;line-height:1.8;color:#aa9f96;display:block;margin:6px 0 0 28px}.review-next-plan{padding:19px 23px;background:#fffef9;border:1px solid #e8ded5;border-radius:14px;margin-top:18px}.review-plan-heading{display:flex;gap:8px;align-items:center;font-size:12px;font-weight:550}.review-plan-heading>.text-button{margin-left:auto;font-size:11px;padding:3px 0;color:#9f9288}.review-date-options{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:13px}.review-date-option{box-sizing:border-box;width:100%;padding:10px 5px;margin:0;border:1px solid #e8e0d7;border-radius:7px;font-size:12px;text-align:center;background:#fff;color:#928479;min-height:42px;line-height:20px}.review-date-option.selected{background:#f1eae3;border-color:#ae9887;color:#725c4c}.review-plan-help{display:block;font-size:10px;line-height:1.9;color:#a2968c;margin-top:10px}.grade-buttons{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:22px}.grade-button{width:100%;display:flex;gap:12px;align-items:center;justify-content:center;margin:0;border:1px solid #e5dbd0;border-radius:12px;background:#faf6f2;color:#7a624f;padding:17px 12px;font-size:14px;text-align:left;line-height:1.7;min-height:80px}.grade-button.wrong{background:#fffaf0;color:#a88b59;border-color:#e9dfc9}.grade-button[disabled]{opacity:.55}.grade-sub{display:block;font-size:10px;color:#a4968c}.review-footnote{display:block;text-align:center;font-size:10px;line-height:1.8;color:#a99d93;margin-top:25px}.review-error,.review-storage-warning{font-size:12px;line-height:1.8;color:#a37a46;background:#fff1dc;padding:12px 15px;border-radius:8px;margin-top:15px}.review-storage-warning{flex-shrink:0;margin:0;border-radius:0;text-align:center}.forge-feedback,.forge-wait,.review-finish{text-align:center}.forge-feedback{padding-top:22px}.finish-title{display:block;font-size:27px;line-height:1.65;font-weight:600;margin:14px 0 24px;letter-spacing:-.7px}.feedback-copy,.finish-sub{display:block;font-size:13px;line-height:2;color:#96867a;margin:20px auto;max-width:470px}.feedback-plan{display:block;font-size:12px;color:#a18b62;margin:15px 0}.next-forge{justify-content:center;min-width:210px;margin:24px auto;width:fit-content}.finish-stats{display:flex;justify-content:space-around;margin:30px 0}.finish-stats>view{display:flex;flex-direction:column;gap:9px;color:#a1958b;font-size:11px}.finish-stats>view>text:first-child{font:36px Georgia,serif;color:#756151}.round-results{text-align:left;background:#fffef8;border:1px solid #e9e0d7;border-radius:13px}.round-result-row{display:flex;gap:15px;padding:18px 20px;border-bottom:1px solid #f0ebe5;font-size:13px;line-height:1.8}.round-result-row:last-child{border:0}.result-index{color:#b3a79d;font-family:Georgia,serif}.round-result-row>view{min-width:0;word-break:break-word}.result-sub{display:block;font-size:11px;color:#a1968d;margin-top:3px}.finish-actions{display:flex;justify-content:center;gap:12px;flex-wrap:wrap;margin-top:25px}.review-finish>.button,.forge-wait>.button{width:fit-content;margin:18px auto;justify-content:center}.forge-wait .finish-title{font-size:24px;margin-bottom:10px}.forge-confirm::after,.grade-button::after,.review-date-option::after{border:0}
@media(max-width:600px){.review-top{height:64px;padding:0 16px;gap:9px}.review-brand{font-size:18px;gap:7px}.review-top-title{max-width:116px;font-size:10px}.review-top .button{font-size:11px;padding:10px}.review-container{padding:25px 16px calc(40px + env(safe-area-inset-bottom))}.review-page-title{font-size:21px}.review-intro{gap:10px}.review-counter{font-size:12px}.task-banner{padding:15px 16px}.review-question{padding:21px 18px}.review-question-title{font-size:18px}.review-stem{font-size:15px}.review-reflection,.review-solution{padding:20px 17px}.review-next-plan{padding:17px}.review-input{font-size:13px;padding:12px;min-height:116px}.grade-buttons{grid-template-columns:1fr;gap:9px}.grade-button{min-height:66px;justify-content:flex-start;padding:13px 18px}.grade-sub{font-size:11px}.finish-title{font-size:24px}.forge-feedback{padding-top:10px}.finish-actions{flex-direction:column}.finish-actions .button{width:100%;justify-content:center}.review-top>.button{flex-shrink:0}.review-date-option{font-size:11px}.review-footnote{font-size:10px}}
</style>

<style scoped>
.review-top{background:#2b251f;border-color:#4b3828}.review-brand{color:#f8e6c8}.review-top-title{color:#b49a7c}.review-top .button-quiet{background:#403226;border-color:#654b33;color:#dfc29a}.review-overlay{background:#f4eee4}.review-top .brand-mark{width:34px;height:36px}.review-page-title{color:#543a27}.review-counter{color:#a78053}.grade-button.correct{background:#f5e4ca;border-color:#d5ae7e;color:#9f542a}.task-banner{background:#f2e2ca;border-color:#e2cba8}
</style>

<style scoped>
.test-verdict{display:flex;flex-direction:column;gap:10px;margin-top:20px;padding:20px;border:1px solid #bdccb2;background:#edf4e6;border-radius:12px;font-size:13px;line-height:1.8;color:#49613b}.test-verdict>text:first-child{font-size:17px;font-weight:600}.test-verdict>text:last-child{font-size:11px;opacity:.75}.test-verdict.wrong{background:#fff1e6;border-color:#e6c7a9;color:#94623b}.grade-buttons{grid-template-columns:1fr}.review-overlay{background:#f8f9f5}.review-top{background:#eef1e8;border-color:#e0e5d7}.review-brand{color:#3b5039}.review-top-title{color:#829174}.review-top .button-quiet{background:#e3eadb;color:#596c4b;border-color:#d5dfca}.grade-button.correct{background:#eaf1e2;border-color:#b8caa8;color:#49613b}
</style>
