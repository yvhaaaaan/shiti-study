<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Paper, Question } from '../domain/types'
import AppIcon from './AppIcon.vue'
import MathText from './MathText.vue'
import { exportPaper } from '../utils/exportPaper'
// #ifdef H5
import { renderMathText } from '../utils/mathText'
import katexCss from 'katex/dist/katex.min.css?inline'
// #endif
const props = defineProps<{ paper: Paper; questions: Question[]; initialAnswers: boolean; unavailable: number }>()
const emit = defineEmits<{ close: [] }>()
const includeAnswers = ref(props.initialAnswers)
const space = ref(4)
const loaded = ref(false)
const printing = ref(false)
const error = ref('')
// #ifdef H5
const frame = ref<HTMLIFrameElement>()
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const documentHtml = computed(() => {
  const images = (q: Question) => q.images.map(src => /^(?:https?:\/\/|blob:|data:image\/(?:png|jpeg|webp);base64,|\/)/i.test(src) ? `<img src="${escape(src)}" alt="原题附图" />` : '<p>题图无法读取，请返回检查原题。</p>').join('')
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><base href="${escape(window.location.href)}"><title>${escape(props.paper.title)}</title><style>${katexCss}
  @page{size:A4;margin:16mm 17mm}*{box-sizing:border-box}html{background:#e7e9e8}body{margin:0;color:#111;font:14px/1.85 'Microsoft YaHei','PingFang SC',sans-serif}.sheet{width:210mm;min-height:297mm;margin:18px auto;padding:16mm 17mm;background:#fff;box-shadow:0 2px 13px #0001}h1{text-align:center;font-size:24px;line-height:1.6;margin:0 0 12px}h2{font-size:15px;line-height:1.8;margin:0 0 10px;break-after:avoid}p{margin:8px 0}.exam-meta{text-align:center;color:#555;font-size:12px}.student-info{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #222;padding:15px 0 17px;margin-bottom:22px;font-size:13px}.exam-item{margin:0 0 24px;break-inside:avoid}.stem,.answer{white-space:normal;overflow-wrap:anywhere}.math-plain,.math-fallback{white-space:pre-wrap}.math-run{display:inline-block;max-width:100%;vertical-align:middle}.math-block{display:block;text-align:center;padding:8px 0}.katex{font-size:1.05em}.katex-display{margin:6px 0}img{display:block;max-width:100%;max-height:135mm;object-fit:contain;object-position:left center;margin:12px 0}.answer-space{min-height:${space.value * 9}mm;border-bottom:1px solid #ddd;margin-top:12px}.answers{break-before:page;page-break-before:always}.answers h1{font-size:22px}.answer-label{font-weight:600;margin-top:10px}.missing{color:#555}.exam-footer{text-align:center;font-size:11px;color:#777;border-top:1px solid #ddd;padding-top:12px;margin-top:25px}
  @media(max-width:810px){html{background:#fff}.sheet{width:100%;min-height:0;margin:0;padding:24px;box-shadow:none}.student-info{flex-wrap:wrap}}
  @media print{html,body{background:#fff;font-size:11pt}.sheet{width:auto;min-height:0;padding:0;margin:0;box-shadow:none}.exam-item{break-inside:avoid}.student-info{flex-wrap:nowrap}a{color:#111;text-decoration:none}.katex{white-space:normal}.answers{break-before:page}}
  </style></head><body><main class="sheet"><h1>${escape(props.paper.title)}</h1><p class="exam-meta">${escape(props.paper.subject)} · 共 ${props.questions.length} 题</p><div class="student-info"><span>姓名：_______________</span><span>班级：_______________</span><span>日期：_______________</span></div>${props.questions.map((q, i) => `<section class="exam-item"><h2>第 ${i + 1} 题</h2><div class="stem">${renderMathText(q.stem)}</div>${images(q)}<div class="answer-space" aria-label="作答区域"></div></section>`).join('')}<p class="exam-footer">试题结束，请检查作答。</p>${includeAnswers.value ? `<section class="answers"><h1>参考答案与解析</h1>${props.questions.map((q, i) => `<section class="exam-item"><h2>第 ${i + 1} 题</h2><div class="answer">${renderMathText(q.answer || '参考答案待补充')}</div>${q.analysis ? `<p class="answer-label">解析</p><div class="answer">${renderMathText(q.analysis)}</div>` : ''}</section>`).join('')}</section>` : ''}</main></body></html>`
})
watch(documentHtml, () => { loaded.value = false; error.value = '' })
async function printWeb() {
  if (printing.value || !loaded.value) return
  printing.value = true; error.value = ''
  try {
    const target = frame.value?.contentWindow
    if (!target) throw new Error('打印预览尚未准备好，请稍后再试。')
    await target.document.fonts.ready
    const images = Array.from(target.document.images)
    await Promise.all(images.map(img => img.decode().catch(() => {})))
    if (images.some(img => !img.naturalWidth)) throw new Error('部分题图未能加载，请检查网络后重新打开预览，避免打印缺图试卷。')
    target.focus(); target.print()
  } catch (e) { error.value = e instanceof Error ? e.message : '暂时无法打印，请下载 Word 后打印。' }
  finally { printing.value = false }
}
// #endif
// #ifdef MP-WEIXIN
loaded.value = true
async function printNative() {
  if (printing.value) return
  printing.value = true; error.value = ''
  try { await exportPaper(props.paper, props.questions, includeAnswers.value) }
  catch (e) { error.value = e instanceof Error ? e.message : '导出失败，请重试。' }
  finally { printing.value = false }
}
// #endif
function print() {
  // #ifdef H5
  void printWeb()
  // #endif
  // #ifdef MP-WEIXIN
  void printNative()
  // #endif
}
</script>
<template>
  <view class="paper-print-preview">
    <view class="print-toolbar"><view><text class="print-title">试卷打印预览</text><text class="print-subtitle">A4 纵向 · {{ questions.length }} 题 · 按组卷顺序排版</text></view><button class="icon-button" aria-label="关闭打印预览" @tap="emit('close')"><AppIcon name="x" /></button></view>
    <view class="print-settings"><view class="print-setting"><text>每题留白</text><button v-for="option in [{ n: 2, name: '紧凑' }, { n: 4, name: '标准' }, { n: 7, name: '宽松' }]" :key="option.n" :class="{ selected: space === option.n }" :aria-pressed="space === option.n" @tap="space = option.n">{{ option.name }}</button></view><button class="print-answer-toggle" :aria-pressed="includeAnswers" @tap="includeAnswers = !includeAnswers"><text>{{ includeAnswers ? '☑' : '□' }} 卷末附参考答案与解析</text></button></view>
    <text v-if="unavailable" class="print-notice">原卷中 {{ unavailable }} 道题暂不可用，本次仅打印上方显示的 {{ questions.length }} 题。</text>
    <text v-if="error" class="print-error" role="alert">{{ error }}</text>
    <!-- #ifdef H5 -->
    <iframe ref="frame" class="print-frame" :srcdoc="documentHtml" sandbox="allow-same-origin allow-modals" title="A4 试卷内容" @load="loaded = true" />
    <!-- #endif -->
    <!-- #ifdef MP-WEIXIN -->
    <scroll-view scroll-y class="print-native-preview"><text class="print-native-title">{{ paper.title }}</text><view v-for="(q, index) in questions" :key="q.id" class="print-native-question"><text>第 {{ index + 1 }} 题</text><MathText :text="q.stem" /><image v-for="src in q.images" :key="src" :src="src" mode="widthFix" style="width:100%" /></view></scroll-view>
    <!-- #endif -->
    <view class="print-footer"><text>题目不显示原作答、掌握状态或测试记录。</text><button class="button button-primary print-submit" :disabled="printing || !loaded || !questions.length" @tap="print">
      <!-- #ifdef H5 -->
      {{ printing ? '正在准备…' : '打印试卷 / 存为 PDF' }}
      <!-- #endif -->
      <!-- #ifdef MP-WEIXIN -->
      {{ printing ? '正在导出…' : '导出 Word 后打印' }}
      <!-- #endif -->
    </button></view>
  </view>
</template>
<style scoped>
.paper-print-preview{position:fixed;inset:0;z-index:950;background:#edf1ee;display:flex;flex-direction:column;color:#354a3a}.print-toolbar{display:flex;align-items:center;justify-content:space-between;padding:18px 28px;background:white;border-bottom:1px solid #dfe6df}.print-title{display:block;font-size:19px;font-weight:600}.print-subtitle{display:block;font-size:12px;color:#879789;margin-top:5px}.print-settings{display:flex;align-items:center;justify-content:center;gap:28px;padding:13px 20px;background:#f8faf7;flex-wrap:wrap}.print-setting{display:flex;align-items:center;gap:8px;font-size:12px}.print-setting>text{margin-right:7px;color:#82937c}.print-setting>button{padding:7px 12px;border-radius:5px;background:#edf2e9;color:#8a9a80;margin:0;font-size:12px}.print-setting>button.selected{background:#4b6942;color:white}.print-answer-toggle{background:none;padding:6px;margin:0;color:#6f865f;font-size:12px}.print-frame{display:block;border:0;width:100%;height:0;flex:1;min-height:0}.print-footer{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:14px 25px;background:white;border-top:1px solid #dfe6da}.print-footer>text{font-size:11px;color:#95a28a}.print-footer .button{font-size:13px;flex-shrink:0}.print-error,.print-notice{display:block;padding:10px 20px;font-size:12px;background:#fff3df;color:#927239}.print-native-preview{height:0;flex:1;padding:22px;background:#fff}.print-native-title{display:block;font-size:21px;text-align:center}.print-native-question{margin-top:25px;font-size:15px}.print-native-question>text{display:block;font-weight:600;margin-bottom:12px}@media(max-width:600px){.print-toolbar{padding:16px 18px}.print-settings{justify-content:flex-start;gap:12px;padding:12px 18px}.print-footer{padding:13px 18px;flex-direction:column;align-items:stretch}.print-footer .button{width:100%}.print-title{font-size:17px}}
</style>
