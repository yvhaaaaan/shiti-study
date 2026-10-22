<script setup lang="ts">
import { computed } from 'vue'
import type { Question } from '../domain/types'
import AppIcon from './AppIcon.vue'
const props = defineProps<{ question: Question; compact?: boolean; selected?: boolean; selecting?: boolean; archived?: boolean; library?: boolean }>()
const emit = defineEmits<{ open: [id: string]; favorite: [id: string]; select: [id: string]; process: [id: string]; edit: [id: string] }>()
const pending = computed(() => props.question.organizationStatus === 'pending')
const visibleTags = computed(() => props.question.tags.slice(0, props.library ? 3 : 2))
const remainingTags = computed(() => props.question.tags.length - visibleTags.value.length)
const createdDate = computed(() => props.question.createdAt.slice(0, 10).replace(/-/g, '/'))
const title = computed(() => props.question.title || (props.question.images.length ? '图片题目' : '未命名题目'))
const subjectLabel = computed(() => props.question.subject || '待分类')
const subjectIcon = computed(() => {
  if (pending.value && !props.question.subject) return 'folder-open'
  const icons: Record<string, string> = {
    数学: 'calculator', 英语: 'languages', 语文: 'book-open-text', 物理: 'atom', 化学: 'flask-conical',
    生物: 'leaf', 历史: 'clock-3', 地理: 'globe', 政治: 'graduation-cap',
    '道德与法治': 'shield-check', '信息技术': 'keyboard', 计算机: 'command', 编程: 'command', 科学: 'lightbulb', 日语: 'languages',
  }
  return icons[props.question.subject] ?? 'book-open-text'
})
const subjectStyle = computed(() => ['数学', '英语', '物理', '化学', '语文'].includes(props.question.subject) ? props.question.subject : 'custom')
function showLabel(kind: string, value: string) { uni.showModal({ title: kind, content: value, showCancel: false, confirmText: '知道了', confirmColor: '#39775a' }) }
function activate() { if (props.selecting) emit('select', props.question.id); else if (!props.archived) emit('open', props.question.id) }
function handleSelectionKey(event: KeyboardEvent) {
  if (!props.library || !props.selecting || event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return
  event.preventDefault()
  activate()
}
</script>

<template>
  <view class="question-card" :class="[{ compact, selected, pending, 'library-card': library, 'archived-card': archived, 'with-picture': library && question.images.length }, `subject-${subjectStyle}`]" :role="library ? selecting ? 'checkbox' : 'group' : undefined" :aria-label="library ? `${selecting ? '选择题目：' : '题目：'}${title}` : undefined" :aria-checked="library && selecting ? !!selected : undefined" :tabindex="library && selecting ? 0 : undefined" @tap="activate" @keydown="handleSelectionKey">
    <view class="question-card-top">
      <view class="subject-pill" :class="`pill-${subjectStyle}`" :aria-label="`学科：${subjectLabel}`" :title="subjectLabel" @longpress.stop="showLabel('所属学科', subjectLabel)"><AppIcon :name="subjectIcon" :size="14" /><text>{{ subjectLabel }}</text></view>
      <view class="card-top-actions"><text v-if="library && !pending && question.difficulty" class="card-difficulty">{{ question.difficulty }}</text><view v-if="selecting" class="selection-box" :class="{ checked: selected }" aria-hidden="true"><AppIcon v-if="selected" name="check" :size="14" tone="white" /></view><button v-else-if="!archived" class="icon-button bookmark-button" :aria-label="question.favorite ? '取消收藏' : '收藏题目'" :aria-pressed="question.favorite" @tap.stop="emit('favorite', question.id)"><AppIcon :name="question.favorite ? 'bookmark-check' : 'bookmark'" :size="18" :tone="question.favorite ? 'orange' : 'muted'" /></button></view>
    </view>
    <button v-if="library && !selecting && !archived" class="question-title card-open-button" :aria-label="`查看题目：${title}`" @tap.stop="emit('open', question.id)">{{ title }}</button><text v-else class="question-title">{{ title }}</text>
    <view v-if="library" class="card-preview" :class="{ 'has-picture': question.images.length }"><view class="question-excerpt"><text>{{ question.stem || (question.images.length ? '原题图片已保存，打开题目即可查看。' : '还没有题干，可在整理时补充。') }}</text></view><view v-if="question.images.length" class="card-picture"><image class="card-thumbnail" :src="question.images[0]" mode="aspectFit" /><text class="card-picture-count"><AppIcon name="image" :size="11" tone="muted" />{{ question.images.length }} 张题图</text></view></view>
    <view v-else class="question-excerpt"><image v-if="pending && question.images.length" class="pending-thumbnail" :src="question.images[0]" mode="aspectFill" /><text>{{ question.stem || (question.images.length ? '题图已保存，可随时识别文字或补充整理。' : '题目内容待补充') }}</text></view>
    <view v-if="question.tags.length || !library" class="question-tags" :class="{ 'has-more-tags': remainingTags > 0 }"><text v-for="tag in visibleTags" :key="tag" class="question-tag" :title="tag" @longpress.stop="showLabel('知识点标签', tag)">{{ tag }}</text><text v-if="remainingTags > 0" class="question-tag question-tag-more" :aria-label="`另有${remainingTags}个标签，打开题目查看全部`">+{{ remainingTags }}</text><text v-if="!question.tags.length" class="question-tag">{{ pending ? '标签待补充' : '暂无标签' }}</text></view>
    <view v-if="library" class="card-library-meta"><text class="card-source" :title="question.source || '自主收录'">{{ question.source || '自主收录' }}</text><text>{{ createdDate }}</text></view>
    <view class="question-card-bottom"><view class="status-label" :class="{ mastered: !pending && question.status === 'mastered' }"><view class="status-dot" /><text>{{ pending ? '待整理' : question.status === 'mastered' ? '已掌握' : '待巩固' }}</text></view><button v-if="!selecting && !archived && (library || pending)" class="pending-process" :aria-label="pending ? '继续整理这道题' : '编辑这道题'" @tap.stop="pending ? emit('process', question.id) : emit('edit', question.id)"><AppIcon v-if="library" :name="pending ? 'notebook-pen' : 'pencil'" :size="14" tone="green" /><text>{{ library ? pending ? '继续整理' : '编辑' : '整理' }}</text><AppIcon v-if="!library || pending" name="arrow-up-right" :size="13" tone="green" /></button><text v-else-if="!library" class="question-date">{{ question.source || '自主收录' }}<text v-if="!compact"> · {{ question.createdAt.slice(5, 10).replace('-', '/') }}</text></text><text v-else-if="selecting" class="card-selection-hint">{{ selected ? '已选择' : '点击选择' }}</text><text v-else class="card-selection-hint">移入回收站</text></view>
  </view>
</template>

<style scoped>
.question-card{background:#fff;border:1px solid var(--line,#e6e9e1);border-radius:17px;padding:19px 20px 15px;cursor:pointer;transition:transform .18s,border-color .18s,box-shadow .18s;min-width:0;position:relative}
.question-card:hover{transform:translateY(-3px);border-color:#c1d1c3;box-shadow:0 8px 24px #193b2810}.question-card.selected{border-color:#39775a;box-shadow:0 0 0 1px #39775a;background:#fcfffa}.question-card-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:13px}.subject-pill{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;padding:5px 8px;border-radius:7px;color:#3d6856;background:#edf3e9}.pill-英语{background:#f5eedf;color:#9a7441}.pill-物理{background:#eaf0f7;color:#637899}.pill-化学{background:#f3ebf4;color:#936a99}.pill-语文{background:#f4e9e3;color:#a47866}.bookmark-button{margin:0;padding:2px;width:25px;height:25px;background:transparent}.question-title{display:block;font-size:15px;font-weight:650;color:#243b30;line-height:1.6;margin-bottom:10px}.question-excerpt{font-family:Georgia,'Times New Roman','PingFang SC',serif;font-size:14px;line-height:1.85;color:#667268;min-height:53px;max-height:53px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.question-tags{display:flex;gap:6px;margin:16px 0 17px;min-height:21px;flex-wrap:wrap}.question-tag{font-size:10px;line-height:1.4;border:1px solid #e9ece5;border-radius:5px;padding:3px 6px;color:#8a9389;white-space:nowrap}.question-card-bottom{display:flex;align-items:center;justify-content:space-between;border-top:1px solid #f0f1eb;padding-top:12px;gap:8px}.status-label{display:flex;align-items:center;gap:5px;font-size:10px;color:#b17a40;white-space:nowrap}.status-dot{width:5px;height:5px;border-radius:50%;background:#d7a264}.status-label.mastered{color:#528466}.mastered .status-dot{background:#6f9874}.question-date{font-size:10px;color:#a2a89e;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.selection-box{width:19px;height:19px;border:1px solid #d5ddd1;border-radius:5px;display:flex;align-items:center;justify-content:center}.selection-box.checked{background:#39775a;border-color:#39775a}.compact{padding:15px 17px}.compact .question-excerpt{font-size:13px}.compact .question-title{font-size:14px}.compact .question-tags{margin:12px 0}
@media(max-width:600px){.question-card{padding:17px}.question-title{font-size:15px}.question-excerpt{font-size:14px}}
</style>

<style scoped>
.status-label{flex-shrink:0}.question-date{display:block;flex:1;min-width:0;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.question-card-top{gap:9px;min-width:0}.subject-pill{min-width:0;max-width:calc(100% - 36px);box-sizing:border-box}.subject-pill>text{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.subject-pill>.app-icon,.bookmark-button,.selection-box{flex-shrink:0}.card-top-actions{display:flex;align-items:center;gap:10px;flex-shrink:0}.question-tags{flex-wrap:nowrap;min-width:0;max-width:100%;overflow:hidden}.question-tag{display:block;min-width:0;max-width:calc((100% - 6px)/2);box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:0 1 auto}.has-more-tags .question-tag{max-width:calc((100% - 42px)/2)}.question-tags .question-tag-more{flex:0 0 auto;max-width:none;background:#f2f6eb;color:#68845b;border-color:#e2e9d9;font-weight:600}
@media(max-width:600px){.question-date{max-width:130px}}

.question-card.pending{border-color:#e6e2d4;background:#fffefa}.pending .subject-pill{background:#f5efdf;color:#9a8355}.pending-thumbnail{width:47px;height:47px;border-radius:6px;float:left;margin:2px 11px 0 0;flex-shrink:0}.pending-process{display:flex;align-items:center;gap:3px;background:#f0f4e9;margin:0;padding:4px 8px;border-radius:5px;color:#648252;font-size:10px;line-height:1.8}.pending .question-card-bottom{padding-top:9px}.pending .question-excerpt{display:block;font-size:13px}.pending .question-tag{border-color:#ece9df;color:#a1a18d}
</style>

<style scoped>
.question-card.library-card{display:flex;flex-direction:column;border-radius:18px;padding:21px 22px 16px;min-height:296px;background:#fff;box-shadow:0 3px 13px #28463204}
.question-card.library-card.pending{background:#fffefa;border-color:#e8e1cd}
.question-card.library-card.selected{background:#f8fcf4;border-color:#39775a;box-shadow:0 0 0 1px #39775a}
.question-card.library-card:focus-visible{outline:3px solid #84a66d;outline-offset:4px}
.question-card.library-card .question-card-top{margin-bottom:14px;gap:12px}
.question-card.library-card .subject-pill{font-size:12px;padding:6px 9px;max-width:calc(100% - 76px);gap:6px}
.question-card.library-card .card-difficulty{font-size:11px;color:#7a8776;white-space:nowrap}
.question-card.library-card .bookmark-button{width:32px;min-width:32px;height:32px;border-radius:9px}
.question-card.library-card .question-title{font-size:16px;font-weight:600;line-height:1.55;letter-spacing:0;color:#283e31;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;max-height:50px;margin:0 0 11px;word-break:break-word;overflow-wrap:anywhere;white-space:normal}
.question-card.library-card .card-open-button{padding:0;text-align:left;background:none;width:100%;border-radius:3px}
.question-card.library-card .card-open-button:focus-visible{outline-offset:4px}
.question-card.library-card .card-preview{display:flex;gap:16px;align-items:flex-start;min-width:0}
.question-card.library-card .question-excerpt{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;font-family:inherit;font-size:14px;line-height:1.85;color:#647064;min-height:104px;max-height:104px;word-break:break-word;overflow-wrap:anywhere;white-space:pre-line;flex:1;min-width:0}
.question-card.library-card .card-picture{width:116px;height:112px;flex-shrink:0;overflow:hidden;background:#f7f8f3;border:1px solid #edf0e7;border-radius:10px;display:flex;flex-direction:column}
.question-card.library-card .card-thumbnail{display:block;width:100%;height:86px;flex-shrink:0}
.question-card.library-card .card-picture-count{display:flex;align-items:center;justify-content:center;gap:5px;font-size:10px;line-height:24px;color:#829078;white-space:nowrap;background:#f0f3e9}
.question-card.library-card .question-tags{gap:6px;margin:14px 0 0;min-height:25px;flex-wrap:nowrap;max-width:100%}
.question-card.library-card .question-tag{font-size:11px;line-height:1.5;padding:3px 7px;max-width:100%;border-color:#e6ecdf;color:#718165;background:#fafcf6}
.question-card.library-card .has-more-tags .question-tag{max-width:calc((100% - 48px)/3)}
.question-card.library-card .question-tag-more{max-width:none;background:#eef4e7;color:#5c7e4d}
.question-card.library-card .card-library-meta{display:flex;align-items:center;gap:12px;min-width:0;font-size:11px;line-height:1.7;color:#89927f;padding-top:15px;margin-top:auto;margin-bottom:11px}
.question-card.library-card .card-library-meta>text:last-child{flex-shrink:0;white-space:nowrap}
.question-card.library-card .card-source{display:block;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.question-card.library-card .question-card-bottom{min-height:44px;padding-top:10px;gap:12px;border-top-color:#edf0e7}
.question-card.library-card .status-label{font-size:12px;color:#a17b40;gap:7px}
.question-card.library-card .status-label.mastered{color:#538163}
.question-card.library-card .status-dot{width:6px;height:6px}
.question-card.library-card .pending-process{font-size:12px;gap:6px;min-height:34px;padding:6px 10px;border-radius:8px;color:#527343;background:#f0f5e9;white-space:nowrap}
.question-card.library-card .pending-process:hover{background:#e7efdd}
.question-card.library-card .selection-box{width:24px;height:24px;border-radius:7px;border-color:#b9c9af}
.question-card.library-card .selection-box.checked{border-color:#39775a}
.question-card.library-card .card-selection-hint{font-size:11px;color:#839475}
.question-card.library-card.compact{padding:18px 22px 14px;min-height:0}
.question-card.library-card.compact .question-excerpt{min-height:52px;max-height:78px;-webkit-line-clamp:3}
.question-card.library-card.compact .card-picture{width:132px;height:90px}
.question-card.library-card.compact .card-thumbnail{height:65px}
.question-card.library-card.compact .card-library-meta{padding-top:12px}
.question-card.library-card.archived-card{cursor:default}
.question-card.library-card.archived-card:hover{transform:none;box-shadow:0 3px 13px #28463204;border-color:var(--line,#e6e9e1)}
@media(min-width:700px){
  .question-card.library-card.compact{display:grid;grid-template-columns:minmax(0,1fr) 176px;column-gap:22px;row-gap:6px;padding:16px 22px;min-height:0;align-items:start}
  .question-card.library-card.compact .question-card-top,.question-card.library-card.compact .card-preview{display:contents}
  .question-card.library-card.compact .subject-pill{grid-column:1;grid-row:1;justify-self:start;max-width:100%;margin:0}
  .question-card.library-card.compact .card-top-actions{grid-column:2;grid-row:1;justify-self:end}
  .question-card.library-card.compact .question-title{grid-column:1;grid-row:2;margin:0;max-height:25px;-webkit-line-clamp:1}
  .question-card.library-card.compact .question-excerpt{grid-column:1;grid-row:3;min-height:52px;max-height:52px;-webkit-line-clamp:2}
  .question-card.library-card.compact .card-picture{grid-column:2;grid-row:2 / 5;align-self:center;justify-self:end;width:154px;height:112px}
  .question-card.library-card.compact .card-thumbnail{height:87px}
  .question-card.library-card.compact .question-tags{grid-column:1;grid-row:4;margin:0;align-self:center;min-height:24px}
  .question-card.library-card.compact .card-library-meta{grid-column:1;grid-row:5;padding:0;margin:0;align-self:center;min-height:34px}
  .question-card.library-card.compact .question-card-bottom{grid-column:2;grid-row:5;padding:0;border:0;min-height:34px;align-self:center;gap:10px}
  .question-card.library-card.compact:not(.with-picture) .question-title,.question-card.library-card.compact:not(.with-picture) .question-excerpt,.question-card.library-card.compact:not(.with-picture) .question-tags{grid-column:1 / -1}
}
@media(max-width:600px){
  .question-card.library-card,.question-card.library-card.compact{padding:18px 18px 14px;min-height:0;border-radius:16px}
  .question-card.library-card .question-title{font-size:16px;max-height:50px;margin-bottom:11px}
  .question-card.library-card .question-excerpt,.question-card.library-card.compact .question-excerpt{font-size:14px;line-height:1.85;min-height:78px;max-height:104px;-webkit-line-clamp:4}
  .question-card.library-card .card-preview{gap:13px}
  .question-card.library-card .card-picture,.question-card.library-card.compact .card-picture{width:94px;height:104px}
  .question-card.library-card .card-thumbnail,.question-card.library-card.compact .card-thumbnail{height:79px}
  .question-card.library-card .question-tags{margin-top:13px}
  .question-card.library-card .card-library-meta{padding-top:14px;font-size:11px;gap:8px}
  .question-card.library-card .pending-process{min-height:36px}
}
@media(max-width:350px){
  .question-card.library-card,.question-card.library-card.compact{padding:16px 14px 12px}
  .question-card.library-card .card-picture,.question-card.library-card.compact .card-picture{width:82px}
  .question-card.library-card .card-preview{gap:10px}
  .question-card.library-card .question-tag{padding-left:5px;padding-right:5px}
  .question-card.library-card .card-library-meta{font-size:10px}
}
@media(prefers-reduced-motion:reduce){.question-card.library-card{transition:none}.question-card.library-card:hover{transform:none}}
</style>
