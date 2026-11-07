<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStudyStore } from '../domain/store'
import AppIcon from './AppIcon.vue'
import MathText from './MathText.vue'
import AttachmentGallery from './AttachmentGallery.vue'
import ForgeProgress from './ForgeProgress.vue'
import StarMeter from './StarMeter.vue'
import QuestionReflection from './QuestionReflection.vue'
import { forgeProgress } from '../domain/forge'
import { formatLocalDate } from '../utils/format'
const props = defineProps<{ id: string }>()
const emit = defineEmits<{ close: []; edit: [id: string]; editRemark: [id: string]; practice: [ids: string[]]; searchKnowledgePoint: [point: string] }>()
const store = useStudyStore()
const q = computed(() => store.questions.value.find(item => item.id === props.id))
const pending = computed(() => q.value?.organizationStatus === 'pending')
const progress = computed(() => forgeProgress(props.id, store.state.reviews))
const revealed = ref(false)
const detailTab = ref<'question' | 'reflection' | 'history'>('question')
const expandedHistory = ref<string[]>([])
const history = computed(() => store.state.reviews.filter(item => item.questionId === props.id).slice().reverse())
function toggleHistory(id: string) { expandedHistory.value = expandedHistory.value.includes(id) ? expandedHistory.value.filter(item => item !== id) : [...expandedHistory.value, id] }
function remove() {
  const completed = progress.value.completed
  const mature = completed === 5
  const title = mature ? '删除这道题？' : '熟练度还未达到 5 星'
  const content = mature
    ? '这道题已经达到 5 星熟练度。删除后会移入回收站，复习记录仍会保留。'
    : `这道题当前熟练度为 ${completed} 星，还没有达到 5 星。你确定要手动删除吗？删除后仍可在回收站恢复。`
  uni.showModal({ title, content, confirmText: '确认删除', cancelText: '继续保留', success: async res => { if (res.confirm) { store.deleteQuestion(props.id); try { await store.flushPersistence(); emit('close'); uni.showToast({ title: '已移入回收站', icon: 'none' }) } catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '保存未完成', icon: 'none' }) } } } })
}
async function setDate(event: any) { try { store.setPlan(props.id, event.detail.value); await store.flushPersistence(); uni.showToast({ title: '复习日期已安排', icon: 'success' }) } catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '日期尚未保存', icon: 'none' }) } }
async function clearDate() { try { store.setPlan(props.id, null); await store.flushPersistence() } catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '取消未保存，请重试', icon: 'none' }) } }

function previewImage(image: string) { if (q.value) uni.previewImage({ urls: q.value.images, current: image }) }
</script>

<template>
  <view class="modal-overlay" @tap.self="emit('close')"><view class="modal-window detail-window">
    <view class="modal-header"><view><text class="eyebrow">MY MISTAKES, MY UNDERSTANDING</text><text class="modal-title">我的错题页</text></view><view class="header-actions"><button v-if="q" class="icon-button" :aria-label="q.favorite ? '取消收藏' : '收藏'" @tap="store.toggleFavorite(q.id)"><AppIcon :name="q.favorite ? 'bookmark-check' : 'bookmark'" :tone="q.favorite ? 'orange' : 'muted'" /></button><button class="icon-button" aria-label="关闭" @tap="emit('close')"><AppIcon name="x" /></button></view></view>
    <scroll-view v-if="q" scroll-y class="modal-scroll"><view class="detail-content">
       <view class="detail-meta"><text class="badge">{{ q.subject || '待分类' }}</text><text class="badge badge-neutral">{{ q.difficulty || '难度待定' }}</text><text class="detail-status" :class="{ mastered: !pending && q.status === 'mastered' }">{{ pending ? '待整理' : q.status === 'mastered' ? '五阶完成' : '待练习' }}</text></view>
       <view class="detail-ratings"><StarMeter :value="q.importance" label="我的重要程度" tone="gold" /></view>
      <text class="detail-title">{{ q.title }}</text><text class="detail-source">{{ q.source || '自主收录' }} · {{ formatLocalDate(q.createdAt) }}</text>
      <view v-if="!pending" class="detail-forge"><ForgeProgress :completed="progress.completed" compact /><text v-if="q.status === 'mastered' && progress.completed < 5" class="legacy-mastery-note">保留原有掌握标记；五阶任务尚未完成验证。</text><text v-if="!progress.canAttempt" class="legacy-mastery-note">下一阶「回验」从 {{ progress.waitUntil }} 开始，可先回看复盘。</text></view>
      <view class="detail-tabs"><button :class="{ active: detailTab === 'question' }" :aria-pressed="detailTab === 'question'" @tap="detailTab = 'question'">题目与解析</button><button :class="{ active: detailTab === 'reflection' }" :aria-pressed="detailTab === 'reflection'" @tap="detailTab = 'reflection'">我的复盘</button><button :class="{ active: detailTab === 'history' }" :aria-pressed="detailTab === 'history'" @tap="detailTab = 'history'">练习记录 · {{ history.length }}</button></view>
      <view v-show="detailTab === 'question'">
      <view class="problem-sheet"><view class="sheet-label"><AppIcon name="file-text" :size="15" tone="muted" /><text>原题</text></view><MathText :text="q.stem" class="problem-stem" /><image v-for="image in q.images" :key="image" :src="image" mode="widthFix" class="detail-image" @tap="previewImage(image)" /></view>
      <view class="original-answer"><view><AppIcon name="pencil" :size="15" tone="orange" /><text>我的答案</text><text class="original-answer-hint">录入时的作答</text><button class="text-button personal-answer-edit" aria-label="编辑我的答案" @tap="emit('edit', q.id)">{{ q.userAnswer ? '编辑' : '添加' }}</button></view><MathText v-if="q.userAnswer" :text="q.userAnswer" class="original-answer-content" /><text v-else class="personal-answer-empty">还未记录，可选填自己的答案或思路。</text></view>
       <view v-if="q.knowledgePoint || q.relatedKnowledgePoints?.length" class="detail-tags"><button v-if="q.knowledgePoint" class="filter-chip detail-tag" :aria-label="`查找知识点 ${q.knowledgePoint} 的相关错题`" @tap="emit('searchKnowledgePoint', q.knowledgePoint)">知识点 · {{ q.knowledgePoint }}</button><button v-for="point in q.relatedKnowledgePoints" :key="point" class="filter-chip detail-tag" :aria-label="`查找相关知识点 ${point} 的错题`" @tap="emit('searchKnowledgePoint', point)">相关 · {{ point }}</button></view>
       <view v-if="pending" class="detail-pending-note"><view class="detail-pending-symbol"><AppIcon name="folder-open" :size="25" tone="orange" /></view><view><text>题目已收录，整理可以稍后继续。</text><text>文字和题图已保留。需要时可手动补充科目、知识点与解析，也可使用 AI 辅助，核对后保存整理结果。</text></view></view>
      <button v-else-if="!revealed" class="answer-reveal" @tap="revealed = true"><AppIcon name="lightbulb" :size="18" tone="green" /><view><text class="reveal-title">先想一想，再看答案</text><text class="reveal-sub">点击展开参考答案与解题解析</text></view><AppIcon name="chevron-down" :size="18" tone="muted" /></button>
      <view v-else-if="!pending" class="answer-block"><text class="field-label">参考答案</text><MathText :text="q.answer || '暂未补充参考答案，点击编辑完善。'" class="answer-text" /><text class="field-label answer-label">解题解析</text><MathText :text="q.analysis || '暂未补充解题解析，点击编辑完善。'" class="analysis-text" /></view>
      </view>
      <view v-show="detailTab === 'reflection'">
      <QuestionReflection :key="q.id" :question="q" />
      <view class="detail-remark-section">
        <view class="detail-remark-heading"><view><AppIcon name="notebook-pen" :size="17" tone="green" /><text>补充说明</text></view><button class="text-button detail-remark-edit" aria-label="编辑补充说明" @tap="emit('editRemark', q.id)"><AppIcon name="pencil" :size="13" tone="green" /><text>{{ q.remark || q.remarkImages?.length ? '编辑' : '添加补充说明' }}</text></button></view>
        <MathText v-if="q.remark" :text="q.remark" class="detail-remark-text" />
        <text v-if="!q.remark && !q.remarkImages?.length" class="detail-remark-empty">把板书、草稿和自己的理解，留在这道题旁边。</text>
        <AttachmentGallery v-if="q.remarkImages?.length" :model-value="q.remarkImages" readonly label="备注附图" />
      </view>
      </view>
      <view v-show="detailTab === 'history'">
      <view v-if="!pending" class="plan-row"><view class="plan-row-label"><AppIcon name="calendar-days" :size="18" tone="green" /><text>安排下一次复习</text></view><picker mode="date" :value="q.nextReviewDate || ''" @change="setDate"><view class="date-picker-value">{{ q.nextReviewDate || '选择日期' }}<AppIcon name="chevron-right" :size="14" tone="muted" /></view></picker></view>
      <view v-if="!pending && q.nextReviewDate" class="plan-clear-row"><button class="text-button muted" @tap="clearDate">取消此次计划</button></view>
      <view v-if="!pending" class="history-heading"><text class="field-label">我的成长足迹</text><text class="muted small">{{ history.length }} 次练习 · {{ progress.completed }}/5 阶</text></view>
      <view v-if="!pending && !history.length" class="history-empty"><AppIcon name="clock-3" :size="24" tone="muted" /><text>还没有复习记录，从第一次独立重做开始。</text></view>
      <view v-for="record in history.slice(0, 8)" :key="record.id" class="history-item"><view class="history-dot" :class="{ correct: record.rating !== 'wrong' }" /><view><text v-if="record.forge?.retired" class="history-forge-stage">旧版题目记录 · 不计入当前进度</text><text v-if="record.forge" class="history-forge-stage">第 {{ record.forge.stage }} 阶 · {{ (record.forge.assessment ? ['选材', '锻形', '淬火', '磨刃', '成锋'] : ['识错', '重做', '讲透', '迁移', '回验'])[record.forge.stage - 1] }} · {{ record.rating === 'wrong' ? '继续打磨' : record.forge.assessment ? '测试通过' : '历史自评达成' }}</text><text class="history-rating">{{ record.rating === 'wrong' ? '还需要巩固' : record.rating === 'mastered' ? '独立完成，五阶完成' : '答对了，继续巩固' }}</text><MathText v-if="record.answer" :text="'本次作答：' + record.answer" class="history-answer" /><MathText v-if="record.forge?.assessment" :text="'判题反馈：' + record.forge.assessment.feedback" class="history-answer" /><MathText v-if="record.forge?.reflection" :text="'本次心得：' + record.forge.reflection" class="history-answer" /><MathText v-if="record.forge?.variantStem" :text="'变式题：' + record.forge.variantStem" class="history-answer" /><MathText v-if="record.forge?.variantAnswer" :text="'核对依据：' + record.forge.variantAnswer" class="history-answer" /><button v-if="record.questionSnapshot" class="history-snapshot-button" @tap="toggleHistory(record.id)">{{ expandedHistory.includes(record.id) ? '收起当时题面' : '查看当时题面' }}</button><view v-if="record.questionSnapshot && expandedHistory.includes(record.id)" class="history-snapshot"><text>{{ record.questionSnapshot.title }}</text><MathText :text="record.questionSnapshot.stem" class="history-formula" /><MathText :text="'当时参考答案：' + record.questionSnapshot.answer" class="history-formula" /></view></view><text class="history-date">{{ formatLocalDate(record.reviewedAt || '', true) }}</text></view>
      </view>
    </view></scroll-view>
    <view v-else class="empty-state">这道题已被移入回收站。</view>
    <view v-if="q" class="modal-footer detail-footer"><button class="icon-button delete-button" aria-label="移入回收站" @tap="remove"><AppIcon name="trash-2" :size="18" tone="muted" /></button><button v-if="!pending" class="button button-quiet" @tap="emit('edit', q.id)"><AppIcon name="pencil" :size="15" /><text>编辑</text></button><button v-if="pending" class="button button-primary" @tap="emit('edit', q.id)"><AppIcon name="notebook-pen" :size="16" tone="white" /><text>继续整理</text></button><button v-else-if="!q.answer.trim()" class="button button-primary" @tap="emit('edit', q.id)"><AppIcon name="pencil" :size="16" tone="white" /><text>补充答案后测试</text></button><button v-else class="button button-primary" @tap="emit('practice', [q.id])"><AppIcon name="refresh-cw" :size="16" tone="white" /><text>{{ progress.completed === 5 ? '再次回验' : `开始测试 · 第 ${progress.nextStage} 阶` }}</text></button></view>
  </view></view>
</template>

<style scoped>
 .original-answer-content{font-size:14px;line-height:1.95;color:#8d7756}.personal-answer-edit{margin-left:auto;min-height:30px;font-size:11px;color:#a17d50}.original-answer .original-answer-hint{margin-left:8px}.original-answer .personal-answer-empty{font-size:12px;color:#a49b88}.history-formula{font-size:12px;line-height:1.9;margin-top:7px;color:#938377}.detail-content,.problem-sheet,.answer-block,.original-answer,.history-item>view:nth-child(2){min-width:0}.history-item>view:nth-child(2){flex:1}.problem-stem{font-family:inherit}.answer-text,.analysis-text{font-weight:400}.detail-ratings{margin-top:14px}
.detail-remark-section{background:#fbf8f6;border:1px solid #ebe3db;border-radius:13px;padding:18px;margin:20px 0 9px}.detail-remark-heading,.detail-remark-heading>view{display:flex;align-items:center;gap:7px}.detail-remark-heading{justify-content:space-between;color:#6f5c4d;font-size:12px;font-weight:550}.detail-remark-edit{display:flex;align-items:center;gap:5px;font-size:10px;font-weight:400;padding:3px 0;margin:0}.detail-remark-text{display:block;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.9;color:#7c6d62;margin-top:13px}.detail-remark-empty{display:block;font-size:11px;color:#a2978e;line-height:1.9;margin-top:12px}@media(max-width:600px){.detail-remark-section{padding:15px}}
.history-snapshot-button{font-size:10px;padding:0;margin:7px 0 0;color:#957c69;background:none;text-align:left}.history-snapshot{background:#f8f4ef;border:1px solid #ece3db;border-radius:7px;padding:12px;margin-top:9px;max-width:400px}.history-snapshot>text{display:block;font-size:11px;line-height:1.8;white-space:pre-wrap;color:#938377;margin-top:5px}.detail-window{width:690px}.header-actions{display:flex;gap:7px}.detail-content{padding:25px 30px 35px}.detail-meta{display:flex;align-items:center;gap:7px}.detail-status{margin-left:auto;font-size:11px;color:#b37c45}.detail-status.mastered{color:#866d5a}.detail-title{font-size:23px;line-height:1.55;font-weight:650;display:block;margin:20px 0 7px;letter-spacing:-.6px}.detail-source{font-size:11px;color:#a59a92}.problem-sheet{background:#f8f5f2;border-radius:12px;padding:21px;margin:24px 0 16px;border:1px solid #f0ebe5;background-image:linear-gradient(#ebe3db40 1px,transparent 1px);background-size:100% 28px}.sheet-label{display:flex;align-items:center;gap:6px;font-size:10px;color:#9c9086;margin-bottom:15px}.problem-stem{display:block;line-height:2;font-family:Georgia,'PingFang SC',serif;font-size:16px;white-space:pre-wrap}.detail-image{display:block;width:100%;margin-top:15px;border-radius:6px}.detail-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:25px}.answer-reveal{display:flex;align-items:center;text-align:left;background:#f5f0ec;padding:17px;gap:12px;border-radius:10px;margin:0;width:100%}.answer-reveal>.app-icon:last-child{margin-left:auto}.reveal-title{display:block;font-size:13px;color:#66503f;font-weight:600}.reveal-sub{display:block;font-size:10px;color:#a0958c;margin-top:4px}.answer-block{padding:20px;border:1px solid #e8ded5;background:#fcf9f5;border-radius:12px}.answer-text,.analysis-text{display:block;line-height:1.9;white-space:pre-wrap;font-size:14px}.answer-text{font-weight:600;color:#6a513e;margin-top:8px}.analysis-text{color:#84766c;font-size:13px;margin-top:8px}.answer-label{margin-top:23px!important}.plan-row{display:flex;align-items:center;justify-content:space-between;padding:20px 0 8px;gap:12px}.plan-row-label{display:flex;align-items:center;gap:8px;font-size:12px}.date-picker-value{display:flex;align-items:center;gap:7px;color:#83766c;font-size:12px}.plan-clear-row{display:flex;justify-content:flex-end}.history-heading{display:flex;justify-content:space-between;margin:28px 0 15px}.history-empty{display:flex;gap:10px;align-items:center;background:#f9f6f4;border-radius:10px;padding:18px;color:#a2978e;font-size:11px}.history-item{display:flex;align-items:flex-start;gap:9px;border-bottom:1px solid #f3eee9;padding:13px 0}.history-dot{width:6px;height:6px;background:#d7aa76;border-radius:50%;margin-top:5px;flex-shrink:0}.history-dot.correct{background:#9e8b7c}.history-rating{font-size:12px;display:block}.history-answer{display:block;font-size:11px;color:#9b8f85;max-width:350px;margin-top:5px;line-height:1.7}.history-date{margin-left:auto;white-space:nowrap;font-size:10px;color:#a89d94}.delete-button{margin-right:auto;color:#a3978e}.detail-footer{gap:10px}.small{font-size:11px}@media(max-width:600px){.detail-content{padding:20px}.detail-title{font-size:21px}.problem-stem{font-size:15px}.history-answer{max-width:190px}.detail-footer .button{padding:11px 17px}}
</style>

<style scoped>
.original-answer{background:#fcf7ee;border:1px solid #efe5d5;border-radius:11px;padding:17px 19px;margin-bottom:17px}.original-answer>view{display:flex;align-items:center;gap:6px;color:#b08b57;font-size:11px;font-weight:550;margin-bottom:10px}.original-answer-hint{margin-left:auto;font-size:9px;font-weight:400;color:#bdab91}.original-answer>text{display:block;font-size:13px;line-height:1.9;color:#9a815f;white-space:pre-wrap}@media(max-width:600px){.original-answer{padding:15px 16px}.original-answer-hint{display:none}}

.detail-pending-note{display:flex;align-items:flex-start;gap:13px;background:#faf6e9;border:1px solid #eae3cb;border-radius:12px;padding:19px;margin:21px 0 7px}.detail-pending-symbol{flex-shrink:0;display:flex;align-items:center;justify-content:center;width:41px;height:41px;background:#f2e8cf;border-radius:12px}.detail-pending-note>view:last-child{min-width:0}.detail-pending-note>view:last-child>text:first-child{display:block;font-size:13px;font-weight:550;color:#7d794d;line-height:1.8}.detail-pending-note>view:last-child>text:last-child{display:block;font-size:11px;color:#9b9a7c;line-height:1.9;margin-top:5px}@media(max-width:600px){.detail-pending-note{padding:15px;gap:10px}.detail-pending-note>view:last-child>text:first-child{font-size:12px}.detail-pending-note>view:last-child>text:last-child{font-size:10px}.detail-footer .button{font-size:11px;padding:11px 13px}.detail-footer{gap:7px}}
</style>

<style scoped>
.detail-forge{margin-top:22px}.legacy-mastery-note{display:block;font-size:11px;line-height:1.8;color:#a18a61;margin-top:9px}.history-forge-stage{display:block;font-size:10px;color:#9e8554;margin-bottom:6px}
</style>
