<script setup lang="ts">
import { computed } from 'vue'
import type { Question } from '../domain/types'
import AppIcon from './AppIcon.vue'
const props = defineProps<{ question: Question; compact?: boolean; selected?: boolean; selecting?: boolean; archived?: boolean }>()
defineEmits<{ open: [id: string]; favorite: [id: string]; select: [id: string]; process: [id: string] }>()
const pending = computed(() => props.question.organizationStatus === 'pending')
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
</script>

<template>
  <view class="question-card" :class="[{ compact, selected, pending }, `subject-${subjectStyle}`]" @tap="selecting ? $emit('select', question.id) : $emit('open', question.id)">
    <view class="question-card-top">
      <view class="subject-pill" :class="`pill-${subjectStyle}`" :aria-label="`学科：${subjectLabel}`" :title="subjectLabel" @longpress.stop="showLabel('所属学科', subjectLabel)"><AppIcon :name="subjectIcon" :size="14" /><text>{{ subjectLabel }}</text></view>
      <view v-if="selecting" class="selection-box" :class="{ checked: selected }"><AppIcon v-if="selected" name="check" :size="14" tone="white" /></view>
      <button v-else class="icon-button bookmark-button" :aria-label="question.favorite ? '取消收藏' : '收藏题目'" @tap.stop="$emit('favorite', question.id)"><AppIcon :name="question.favorite ? 'bookmark-check' : 'bookmark'" :size="18" :tone="question.favorite ? 'orange' : 'muted'" /></button>
    </view>
    <text class="question-title">{{ question.title }}</text>
    <view class="question-excerpt"><image v-if="pending && question.images.length" class="pending-thumbnail" :src="question.images[0]" mode="aspectFill" /><text>{{ question.stem || (question.images.length ? '原图已保存，处理时可识别并完善题目。' : '题目内容待补充') }}</text></view>
    <view class="question-tags" :class="{ 'has-more-tags': question.tags.length > 2 }"><text v-for="tag in question.tags.slice(0, 2)" :key="tag" class="question-tag" :title="tag" @longpress.stop="showLabel('知识点标签', tag)">{{ tag }}</text><text v-if="question.tags.length > 2" class="question-tag question-tag-more" :aria-label="`另有${question.tags.length - 2}个标签，打开题目查看全部`">+{{ question.tags.length - 2 }}</text><text v-if="!question.tags.length" class="question-tag">{{ pending ? '标签待补充' : '暂无标签' }}</text></view>
    <view class="question-card-bottom"><view class="status-label" :class="{ mastered: !pending && question.status === 'mastered' }"><view class="status-dot" /><text>{{ pending ? '待处理' : question.status === 'mastered' ? '已掌握' : '待巩固' }}</text></view><button v-if="pending && !selecting && !archived" class="pending-process" aria-label="处理这道题" @tap.stop="$emit('process', question.id)"><text>整理</text><AppIcon name="arrow-up-right" :size="13" tone="green" /></button><text v-else class="question-date">{{ question.source || '自主收录' }}<text v-if="!compact"> · {{ question.createdAt.slice(5, 10).replace('-', '/') }}</text></text></view>
  </view>
</template>

<style scoped>
.question-card{background:#fff;border:1px solid var(--line,#e6e9e1);border-radius:17px;padding:19px 20px 15px;cursor:pointer;transition:transform .18s,border-color .18s,box-shadow .18s;min-width:0;position:relative}
.question-card:hover{transform:translateY(-3px);border-color:#c1d1c3;box-shadow:0 8px 24px #193b2810}.question-card.selected{border-color:#39775a;box-shadow:0 0 0 1px #39775a;background:#fcfffa}.question-card-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:13px}.subject-pill{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;padding:5px 8px;border-radius:7px;color:#3d6856;background:#edf3e9}.pill-英语{background:#f5eedf;color:#9a7441}.pill-物理{background:#eaf0f7;color:#637899}.pill-化学{background:#f3ebf4;color:#936a99}.pill-语文{background:#f4e9e3;color:#a47866}.bookmark-button{margin:0;padding:2px;width:25px;height:25px;background:transparent}.question-title{display:block;font-size:15px;font-weight:650;color:#243b30;line-height:1.6;margin-bottom:10px}.question-excerpt{font-family:Georgia,'Times New Roman','PingFang SC',serif;font-size:14px;line-height:1.85;color:#667268;min-height:53px;max-height:53px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.question-tags{display:flex;gap:6px;margin:16px 0 17px;min-height:21px;flex-wrap:wrap}.question-tag{font-size:10px;line-height:1.4;border:1px solid #e9ece5;border-radius:5px;padding:3px 6px;color:#8a9389;white-space:nowrap}.question-card-bottom{display:flex;align-items:center;justify-content:space-between;border-top:1px solid #f0f1eb;padding-top:12px;gap:8px}.status-label{display:flex;align-items:center;gap:5px;font-size:10px;color:#b17a40;white-space:nowrap}.status-dot{width:5px;height:5px;border-radius:50%;background:#d7a264}.status-label.mastered{color:#528466}.mastered .status-dot{background:#6f9874}.question-date{font-size:10px;color:#a2a89e;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.selection-box{width:19px;height:19px;border:1px solid #d5ddd1;border-radius:5px;display:flex;align-items:center;justify-content:center}.selection-box.checked{background:#39775a;border-color:#39775a}.compact{padding:15px 17px}.compact .question-excerpt{font-size:13px}.compact .question-title{font-size:14px}.compact .question-tags{margin:12px 0}
@media(max-width:600px){.question-card{padding:17px}.question-title{font-size:15px}.question-excerpt{font-size:14px}}
</style>

<style scoped>
.status-label{flex-shrink:0}.question-date{display:block;flex:1;min-width:0;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.question-card-top{gap:9px;min-width:0}.subject-pill{min-width:0;max-width:calc(100% - 36px);box-sizing:border-box}.subject-pill>text{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.subject-pill>.app-icon,.bookmark-button,.selection-box{flex-shrink:0}.question-tags{flex-wrap:nowrap;min-width:0;max-width:100%;overflow:hidden}.question-tag{display:block;min-width:0;max-width:calc((100% - 6px)/2);box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:0 1 auto}.has-more-tags .question-tag{max-width:calc((100% - 42px)/2)}.question-tags .question-tag-more{flex:0 0 auto;max-width:none;background:#f2f6eb;color:#68845b;border-color:#e2e9d9;font-weight:600}
@media(max-width:600px){.question-date{max-width:130px}}

.question-card.pending{border-color:#e6e2d4;background:#fffefa}.pending .subject-pill{background:#f5efdf;color:#9a8355}.pending-thumbnail{width:47px;height:47px;border-radius:6px;float:left;margin:2px 11px 0 0;flex-shrink:0}.pending-process{display:flex;align-items:center;gap:3px;background:#f0f4e9;margin:0;padding:4px 8px;border-radius:5px;color:#648252;font-size:10px;line-height:1.8}.pending .question-card-bottom{padding-top:9px}.pending .question-excerpt{display:block;font-size:13px}.pending .question-tag{border-color:#ece9df;color:#a1a18d}
</style>
