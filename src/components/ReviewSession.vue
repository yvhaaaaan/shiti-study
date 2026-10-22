<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useStudyStore } from '../domain/store'
import { dayOffset, localDate } from '../domain/seed'
import type { Question, ReviewRating } from '../domain/types'
import AppIcon from './AppIcon.vue'
const props = defineProps<{ ids: string[]; title?: string }>()
const emit = defineEmits<{ close: [] }>()
const store = useStudyStore()
const items = ref<Question[]>(questionsFor(props.ids))
const index = ref(0)
const revealed = ref(false)
const answer = ref('')
const planDate = ref('')
const finished = ref(false)
const submitting = ref(false)
const scrollTop = ref(0)
let lastScrollTop = 0
const round = ref(1)
const results = ref<Array<{ questionId: string; title: string; rating: ReviewRating; planDate?: string }>>([])
const counts = computed(() => results.value.reduce((total, result) => {
  total[result.rating]++
  return total
}, { correct: 0, wrong: 0, mastered: 0 }))
const q = computed(() => items.value[index.value])
const today = localDate()
const dateOptions = [1, 3, 7].map(days => ({ days, date: dayOffset(days) }))
const customDateSelected = computed(() => Boolean(planDate.value && !dateOptions.some(option => option.date === planDate.value)))
const ratingLabels: Record<ReviewRating, string> = { wrong: '还不会', correct: '答对了', mastered: '已掌握' }
const requestId = ref(newRequestId())

function questionsFor(ids: string[]): Question[] {
  return [...new Set(ids)]
    .map(id => store.readyQuestions.value.find(question => question.id === id))
    .filter((question): question is Question => Boolean(question?.answer.trim()))
}
function newRequestId() {
  return `review-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
function resetQuestion() {
  answer.value = ''
  revealed.value = false
  planDate.value = ''
  requestId.value = newRequestId()
}
function selectDate(event: { detail: { value: string } }) {
  planDate.value = event.detail.value
}
function rememberScroll(event: { detail: { scrollTop: number } }) {
  lastScrollTop = event.detail.scrollTop
}
async function scrollToStart() {
  // Sync the current position first so setting 0 also works after a prior reset.
  scrollTop.value = lastScrollTop
  await nextTick()
  scrollTop.value = 0
}
async function grade(rating: ReviewRating) {
  if (!q.value || submitting.value || !revealed.value) return
  submitting.value = true
  try {
    const record = store.submitReview(q.value.id, {
      answer: answer.value,
      rating,
      requestId: requestId.value,
      ...(rating !== 'mastered' && planDate.value ? { planDate: planDate.value } : {}),
    })
    await store.flushPersistence()
    results.value.push({ questionId: record.questionId, title: record.questionSnapshot?.title || q.value.title, rating: record.rating, planDate: record.planDate })
    if (index.value + 1 >= items.value.length) finished.value = true
    else { index.value++; resetQuestion() }
    void scrollToStart()
  } catch (e) { uni.showToast({ title: e instanceof Error ? e.message : '记录失败，请重试', icon: 'none' }) }
  finally { submitting.value = false }
}
function retryWrong() {
  const wrongIds = results.value.filter(result => result.rating === 'wrong').map(result => result.questionId)
  const nextItems = questionsFor(wrongIds)
  if (!nextItems.length) {
    uni.showToast({ title: '这些题目暂时无法重练，请返回错题本查看。', icon: 'none' })
    return
  }
  items.value = nextItems
  results.value = []
  index.value = 0
  round.value++
  resetQuestion()
  finished.value = false
  void scrollToStart()
}
function quit() {
  if (finished.value || !items.value.length) return emit('close')
  uni.showModal({
    title: '暂时结束这一轮？',
    content: `${store.state.storageError ? '已提交的记录会保留在本次会话中。' : '已提交的复习记录会保留。'}本题未提交的答案与日期不会保存。`,
    confirmText: '结束复习',
    cancelText: '继续复习',
    success: result => { if (result.confirm) emit('close') },
  })
}
</script>

<template>
  <view class="review-overlay"><view class="review-top"><view class="review-brand"><view class="brand-mini"><AppIcon name="book-open" :size="19" tone="white" /></view><text>拾题</text><text class="review-top-divider">/</text><text class="review-top-title">{{ title || '专注复习' }}</text></view><button class="button button-quiet" @tap="quit"><AppIcon name="x" :size="16" /><text>结束复习</text></button></view>
    <view v-if="store.state.storageError" class="review-storage-warning">本轮记录尚未保存，请保留页面并重试。</view><scroll-view scroll-y class="review-scroll" :scroll-top="scrollTop" @scroll="rememberScroll"><view class="review-container">
      <view v-if="!items.length" class="review-finish"><view class="finish-symbol"><AppIcon name="notebook-pen" :size="35" tone="green" /></view><text class="finish-title">先把解答补完整</text><text class="finish-sub">选择的题目还没有参考答案，完善之后再开始独立重做。</text><button class="button button-primary" @tap="emit('close')">返回错题本</button></view>
      <view v-else-if="finished" class="review-finish">
        <view class="finish-confetti"><text>✦</text><view class="finish-symbol"><AppIcon name="check-check" :size="37" tone="green" /></view><text>✦</text></view>
        <text class="eyebrow">A LITTLE BETTER, EVERY DAY</text>
        <text class="finish-title">每一份认真，都算数。</text>
        <text class="finish-sub">{{ store.state.storageError ? '这一轮记录暂存于本次页面，请检查连接并重试保存。' : '这一轮，你又向前迈了一小步。已完成的复习记录都保存好了。' }}</text>
        <view class="finish-stats"><view><text class="finish-number">{{ results.length }}</text><text>本轮复习</text></view><view><text class="finish-number">{{ counts.correct + counts.mastered }}</text><text>独立答对</text></view><view><text class="finish-number">{{ counts.mastered }}</text><text>标记掌握</text></view></view>
        <view class="round-results">
          <view class="round-results-heading"><text>本轮逐题回顾</text><text>第 {{ round }} 轮 · {{ results.length }} 道</text></view>
          <view v-for="(result, resultIndex) in results" :key="result.questionId" class="round-result-row">
            <text class="round-result-index">{{ String(resultIndex + 1).padStart(2, '0') }}</text>
            <view class="round-result-content"><text class="round-result-title">{{ result.title }}</text><text class="round-result-plan">{{ result.rating === 'mastered' ? '已掌握，不再安排复习' : result.planDate ? `下次复习：${result.planDate}` : '未安排下次复习' }}</text></view>
            <text class="round-result-status" :class="result.rating">{{ ratingLabels[result.rating] }}</text>
          </view>
        </view>
        <view v-if="counts.wrong" class="finish-reflection"><AppIcon name="lightbulb" :size="17" tone="orange" /><text>还有 {{ counts.wrong }} 道题值得再琢磨。再练一轮，之前提交的记录仍会保留。</text></view>
        <view class="finish-actions">
          <button v-if="counts.wrong" class="button button-primary retry-wrong-button" @tap="retryWrong"><AppIcon name="rotate-ccw" :size="17" tone="white" /><text>再练不会的题（{{ counts.wrong }}）</text></button>
          <button class="button finish-close-button" :class="counts.wrong ? 'button-outline' : 'button-primary'" @tap="emit('close')"><text>完成复习，返回</text><AppIcon name="arrow-right" :size="17" :tone="counts.wrong ? 'green' : 'white'" /></button>
        </view>
      </view>
      <view v-else-if="q" class="review-working"><view class="review-intro"><view><text class="eyebrow">FOCUS ON ONE THING</text><text class="review-page-title">现在，只专注这一题。</text></view><view class="review-counter"><text>{{ String(index + 1).padStart(2, '0') }}</text><text class="counter-total"> / {{ String(items.length).padStart(2, '0') }}</text></view></view><view class="review-progress"><view :style="{ width: `${(index / items.length) * 100}%` }" /></view>
        <view class="review-question"><view class="review-question-meta"><text class="badge">{{ q.subject }}</text><text v-for="tag in q.tags.slice(0, 2)" :key="tag" class="review-tag">{{ tag }}</text><AppIcon name="sparkles" :size="18" tone="muted" /></view><text class="review-question-title">{{ q.title }}</text><text class="review-stem">{{ q.stem }}</text><image v-for="image in q.images" :key="image" :src="image" mode="widthFix" class="review-image" /><view class="write-answer"><text class="small muted">我的独立作答</text><textarea v-model="answer" class="review-answer-input" maxlength="5000" placeholder="把答案或关键思路写在这里，也可以先在纸上完成…" /></view></view>
        <view v-if="!revealed" class="review-before"><text><AppIcon name="lightbulb" :size="14" tone="muted" /> 先尝试回忆，给自己一点思考的时间。</text><button class="button button-primary reveal-button" @tap="revealed = true"><text>我想好了，查看答案</text><AppIcon name="arrow-right" :size="17" tone="white" /></button></view>
        <view v-else>
          <view class="review-solution"><view class="solution-heading"><AppIcon name="check-circle-2" :size="19" tone="green" /><text>参考答案</text></view><text class="solution-answer">{{ q.answer }}</text><text class="solution-analysis">{{ q.analysis || '对照参考答案，再想一想这道题的关键。' }}</text></view>
          <view class="review-next-plan">
            <view class="review-plan-heading"><AppIcon name="calendar-days" :size="18" tone="green" /><text>下次什么时候再练？</text><text class="review-plan-optional">可选</text></view>
            <view class="review-date-options">
              <button v-for="option in dateOptions" :key="option.days" class="review-date-option" :class="{ selected: planDate === option.date }" :disabled="submitting" @tap="planDate = option.date"><text>{{ option.days }} 天后</text><text class="date-option-detail">{{ option.date.slice(5).replace('-', '/') }}</text></button>
              <picker mode="date" :start="today" :value="planDate || today" :disabled="submitting" class="review-date-picker" @change="selectDate"><view class="review-date-option custom" :class="{ selected: customDateSelected }"><AppIcon name="calendar-days" :size="17" tone="green" /><text>自选日期</text></view></picker>
            </view>
            <view class="review-plan-summary"><text>{{ planDate ? `已选 ${planDate}，随本题提交` : '尚未选择，不安排下次日期' }}</text><button v-if="planDate" class="review-plan-clear" :disabled="submitting" @tap="planDate = ''">清空日期</button></view>
            <text class="review-plan-help">选择「还不会」或「答对了」时使用此日期；标记「已掌握」不再安排。</text>
          </view>
          <text class="review-evaluate">对照答案，这次的掌握情况如何？</text>
          <view class="grade-buttons"><button class="grade-button wrong" :disabled="submitting" @tap="grade('wrong')"><AppIcon name="rotate-ccw" :size="20" tone="orange" /><text>还不会</text><text class="grade-sub">再给自己一点时间</text></button><button class="grade-button correct" :disabled="submitting" @tap="grade('correct')"><AppIcon name="check" :size="20" tone="green" /><text>答对了</text><text class="grade-sub">继续巩固一下</text></button><button class="grade-button mastered" :disabled="submitting" @tap="grade('mastered')"><AppIcon name="check-check" :size="20" tone="green" /><text>已掌握</text><text class="grade-sub">理解透彻，移出计划</text></button></view>
        </view>
        <view class="review-footnote"><view class="mini-dot" /><text>不急着做完，试着真正弄懂。</text></view>
      </view>
    </view></scroll-view>
  </view>
</template>

<style scoped>
.review-storage-warning{background:#fff3df;color:#a67f46;padding:12px 22px;font-size:12px;text-align:center}.review-overlay{position:fixed;inset:0;z-index:1000;background:#f5f7f0;color:#263b2f}.review-top{height:78px;background:#ffffffc9;border-bottom:1px solid #e5eadf;display:flex;align-items:center;justify-content:space-between;padding:0 40px}.review-brand{display:flex;align-items:center;gap:10px;font-size:20px;font-weight:700}.brand-mini{width:34px;height:34px;border-radius:10px;background:#2d6348;display:flex;align-items:center;justify-content:center}.review-top-divider{font-weight:400;color:#cbd2c4;margin:0 8px}.review-top-title{font-size:13px;font-weight:400;color:#89947e}.review-scroll{height:calc(100vh - 79px)}.review-container{max-width:740px;margin:auto;padding:44px 24px 70px}.review-intro{display:flex;justify-content:space-between;align-items:center}.review-page-title{display:block;font-size:27px;font-weight:650;letter-spacing:-1px;margin-top:9px}.review-counter{font-family:Georgia,serif;font-size:31px;color:#356648}.counter-total{font-size:18px;color:#a5b09a}.review-progress{height:4px;background:#e4e9da;border-radius:5px;margin:22px 0 28px;overflow:hidden}.review-progress>view{height:100%;background:#5d8b61;transition:width .4s}.review-question{background:white;border:1px solid #e1e8d8;border-radius:20px;padding:29px 31px;box-shadow:0 8px 30px #344c2a04}.review-question-meta{display:flex;align-items:center;gap:8px}.review-question-meta>.app-icon{margin-left:auto}.review-tag{font-size:10px;color:#9aa58e;padding:4px 7px;border:1px solid #e8eddf;border-radius:5px}.review-question-title{font-size:21px;font-weight:600;display:block;margin:23px 0 19px}.review-stem{display:block;white-space:pre-wrap;font-family:Georgia,'PingFang SC',serif;font-size:17px;line-height:2.1;color:#54664b}.review-image{width:100%;margin-top:18px}.write-answer{border-top:1px dashed #e5e9de;margin-top:25px;padding-top:20px}.review-answer-input{width:100%;box-sizing:border-box;height:95px;font-size:14px;line-height:1.9;margin-top:12px;color:#43543d}.review-before{text-align:center;padding-top:28px}.review-before>text{display:block;font-size:11px;color:#a1ab94}.review-before>text>.app-icon{vertical-align:middle;margin-right:5px}.reveal-button{margin:18px auto 0!important;min-width:230px;justify-content:center}.review-solution{background:#eef4e8;border:1px solid #dbe7d0;border-radius:15px;padding:25px 28px;margin-top:20px}.solution-heading{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600}.solution-answer{display:block;font-size:19px;font-weight:600;color:#3b704a;margin:15px 0;white-space:pre-wrap;line-height:1.8}.solution-analysis{display:block;font-size:13px;line-height:1.9;color:#7a8c6d;white-space:pre-wrap}.review-evaluate{display:block;font-size:12px;color:#839375;text-align:center;margin:25px 0 15px}.grade-buttons{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}.grade-button{padding:17px 9px;border:1px solid #e3e7dc;background:white;border-radius:12px;display:flex;flex-direction:column;align-items:center;gap:8px;font-size:14px;color:#4c6744}.grade-button:hover{border-color:#9ab58b;background:#fafff5}.grade-button.wrong{color:#ad804f}.grade-sub{font-size:10px;color:#a4ac99}.review-footnote{display:flex;align-items:center;justify-content:center;gap:6px;font-size:10px;color:#a1ab94;margin-top:28px}.mini-dot{width:4px;height:4px;background:#a7b391;border-radius:50%}.review-finish{text-align:center;padding:45px 0 0}.finish-symbol{width:100px;height:100px;border-radius:28px;background:#e4eedb;display:flex;align-items:center;justify-content:center;margin:0 auto 28px;transform:rotate(-7deg)}.finish-confetti{display:flex;justify-content:center;align-items:center;gap:30px;color:#bf994d;font-size:26px;margin:0 auto 30px}.finish-confetti .finish-symbol{margin:0}.finish-title{display:block;font-size:31px;font-weight:650;letter-spacing:-1px;margin:17px 0}.finish-sub{display:block;font-size:13px;line-height:1.9;color:#8b987d;max-width:420px;margin:auto}.finish-stats{display:flex;justify-content:center;gap:60px;margin:38px auto}.finish-stats>view{display:flex;flex-direction:column;gap:9px;font-size:11px;color:#97a289}.finish-number{font-family:Georgia,serif;font-size:39px;color:#3b6846}.finish-reflection{display:flex;align-items:center;justify-content:center;gap:7px;background:#fcf5e9;border-radius:9px;padding:13px;font-size:11px;color:#a7895c;margin:25px 0}.review-finish>.button{display:flex;justify-content:center;margin:27px auto;width:fit-content}@media(max-width:600px){.review-top{height:64px;padding:0 18px}.review-scroll{height:calc(100vh - 65px)}.review-container{padding:28px 16px 45px}.review-top .button{font-size:11px;padding:9px 11px}.review-top-title{font-size:11px}.review-top-divider{margin:0 2px}.review-page-title{font-size:23px}.review-question{padding:23px 21px}.review-question-title{font-size:19px}.review-stem{font-size:16px}.grade-buttons{gap:7px}.grade-button{font-size:13px;padding:14px 5px}.grade-sub{font-size:9px}.review-solution{padding:22px}.finish-stats{gap:40px}.finish-title{font-size:27px}}
</style>

<style scoped>
.review-overlay{display:flex;flex-direction:column;z-index:900}.review-top,.review-storage-warning{flex-shrink:0}.review-scroll{height:0;min-height:0;flex:1}.review-container{padding-bottom:calc(70px + env(safe-area-inset-bottom))}.grade-button{width:100%;margin:0;line-height:1.5;min-height:112px}.grade-button::after,.review-date-option::after,.review-plan-clear::after{border:0}.grade-sub{line-height:1.6}.review-next-plan{margin-top:20px;border:1px solid #e1e8d8;background:#fffef9;border-radius:15px;padding:20px 22px}.review-plan-heading{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#4d684c}.review-plan-optional{margin-left:auto;font-size:11px;font-weight:400;color:#94a087}.review-date-options{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:16px}.review-date-option{box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;width:100%;min-height:65px;margin:0;padding:9px 5px;border:1px solid #e5eadf;border-radius:10px;background:#fff;color:#617557;font-size:13px;line-height:1.5}.review-date-option.selected{border-color:#789d72;background:#eef5e9;color:#366147}.date-option-detail{font-size:11px;color:#95a08b}.review-date-picker{min-width:0}.review-date-option.custom{height:100%;min-height:65px;font-size:12px}.review-plan-summary{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:32px;margin-top:10px;font-size:12px;color:#6f8463;line-height:1.7}.review-plan-clear{flex-shrink:0;min-height:32px;margin:0;padding:4px 2px;background:transparent;color:#7a8d6e;font-size:12px;line-height:1.5}.review-plan-help{display:block;font-size:11px;line-height:1.8;color:#98a28f}.round-results{border:1px solid #e1e8d8;background:#fffefb;border-radius:16px;text-align:left;overflow:hidden}.round-results-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:17px 20px;background:#f1f5e9;font-size:13px;font-weight:600;color:#4d6b48}.round-results-heading>text:last-child{font-size:11px;font-weight:400;color:#8a987c}.round-result-row{display:flex;align-items:center;gap:13px;padding:17px 20px;border-top:1px solid #edf0e6}.round-result-index{font-family:Georgia,serif;color:#a4b094;font-size:15px}.round-result-content{flex:1;min-width:0}.round-result-title{display:block;white-space:normal;word-break:break-word;font-size:13px;line-height:1.7;color:#4a6242}.round-result-plan{display:block;font-size:11px;line-height:1.7;color:#98a18d;margin-top:3px}.round-result-status{flex-shrink:0;border-radius:6px;padding:5px 8px;background:#edf4e6;color:#5e8557;font-size:11px;line-height:1.5}.round-result-status.wrong{background:#fcf2e4;color:#ab8051}.round-result-status.mastered{background:#e7f0e1;color:#497647}.finish-actions{display:flex;justify-content:center;flex-wrap:wrap;gap:12px;margin:26px 0}.finish-actions>.button{margin:0;justify-content:center;min-height:46px;box-sizing:border-box}.finish-actions>.button-outline{background:#fffef9;border:1px solid #dbe5d1;color:#4f7047}.finish-reflection{text-align:left;line-height:1.8}.finish-reflection>.app-icon{flex-shrink:0}
@media(max-width:600px){.review-top{gap:12px}.review-brand{min-width:0;gap:7px}.review-top-title{max-width:110px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.review-top>.button{flex-shrink:0;min-height:40px}.review-container{padding-bottom:calc(45px + env(safe-area-inset-bottom))}.review-next-plan{padding:17px 16px}.review-date-options{gap:6px}.review-date-option{min-height:65px;font-size:12px}.review-plan-summary{font-size:11px}.review-plan-help{font-size:11px}.grade-buttons{grid-template-columns:1fr;gap:9px}.grade-button{display:grid;grid-template-columns:24px 70px 1fr;gap:9px;min-height:62px;padding:14px 16px;align-items:center;justify-content:start;text-align:left;font-size:14px}.grade-sub{font-size:11px;text-align:right;line-height:1.7}.review-evaluate{font-size:13px;margin-top:24px}.review-finish{padding-top:22px}.finish-stats{gap:0;justify-content:space-around;margin:30px 0}.finish-title{font-size:26px}.finish-confetti{margin-bottom:24px}.round-results-heading,.round-result-row{padding:15px}.round-result-row{gap:10px}.round-result-title{font-size:12px}.round-result-status{font-size:11px;padding:5px 7px}.finish-actions{flex-direction:column}.finish-actions>.button{width:100%;min-height:48px}.finish-reflection{font-size:12px}.review-page-title{font-size:22px}}
@media(max-width:360px){.review-top-title{max-width:75px}.review-top{padding:0 12px;gap:6px}.review-brand{font-size:17px}.grade-button{grid-template-columns:20px 62px 1fr;padding:13px 12px;gap:7px}.grade-sub{font-size:10px}.review-plan-heading{font-size:12px}.round-result-status{padding:4px 5px;font-size:10px}}
</style>
