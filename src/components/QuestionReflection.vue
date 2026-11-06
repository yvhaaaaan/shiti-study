<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useStudyStore } from '../domain/store'
import { normalizeReflection } from '../domain/forge'
import type { Question } from '../domain/types'
import AppIcon from './AppIcon.vue'
import MathText from './MathText.vue'
const props = defineProps<{ question: Question }>()
const store = useStudyStore()
const draft = reactive(normalizeReflection(props.question.reflection))
const editing = ref(false)
const saving = ref(false)
const error = ref('')
const hasReflection = computed(() => Object.values(props.question.reflection ?? {}).some(value => value.trim()))
const fields = [
  { key: 'mistake', label: '当时为什么错', hint: '写具体卡住的那一步，例如：只检查了乘积，漏掉一次项系数。' },
  { key: 'insight', label: '我现在的理解', hint: '用自己的话写方法与理由，比抄一遍解析更有用。' },
  { key: 'reminder', label: '下次提醒自己', hint: '留一句做题时能用上的提醒，例如：和与积都要检查。' },
] as const
watch(() => props.question.id, () => { Object.assign(draft, normalizeReflection(props.question.reflection)); editing.value = false; error.value = '' })
function edit() { Object.assign(draft, normalizeReflection(props.question.reflection)); editing.value = true }
async function save() {
  if (saving.value) return
  saving.value = true; error.value = ''
  try { store.updateQuestion(props.question.id, { reflection: { ...draft } }); await store.flushPersistence(); editing.value = false }
  catch (e) { error.value = e instanceof Error ? e.message : '复盘尚未保存，请重试。' }
  finally { saving.value = false }
}
</script>
<template>
  <view class="personal-reflection">
    <view class="reflection-heading"><view><AppIcon name="notebook-pen" :size="18" tone="green" /><text>我的复盘</text></view><button v-if="!editing" class="text-button" @tap="edit">{{ hasReflection ? '编辑复盘' : '写下我的理解' }}</button><text v-else class="reflection-optional">可以分次补充</text></view>
    <text v-if="!hasReflection && !editing" class="reflection-intro">这页属于你。把犯错的原因、弄懂的过程，留在原题旁边。</text>
    <view v-for="(field, index) in fields" :key="field.key" class="reflection-field"><text class="reflection-label"><text>0{{ index + 1 }}</text>{{ field.label }}</text><textarea v-if="editing" v-model="draft[field.key]" :aria-label="field.label" :maxlength="2000" :placeholder="field.hint" class="reflection-input" auto-height /><MathText v-else-if="question.reflection?.[field.key]" :text="question.reflection[field.key]" class="reflection-copy" /><text v-else class="reflection-empty">{{ field.hint }}</text></view>
    <view v-if="editing" class="reflection-actions"><text v-if="error" class="reflection-error" role="alert">{{ error }}</text><button class="button button-quiet" :disabled="saving" @tap="editing = false">取消</button><button class="button button-primary save-reflection" :disabled="saving" @tap="save">{{ saving ? '正在保存…' : '保存复盘' }}</button></view>
  </view>
</template>
<style scoped>
.personal-reflection{margin:22px 0;background:#fffdf7;border:1px solid #e7e7d7;border-radius:14px;padding:20px 21px;background-image:linear-gradient(90deg,transparent 32px,#d4b99325 32px,#d4b99325 33px,transparent 33px)}.reflection-heading,.reflection-heading>view{display:flex;align-items:center;gap:8px}.reflection-heading{justify-content:space-between;font-size:14px;font-weight:600;color:#69584b}.reflection-heading .text-button{font-size:11px;font-weight:400;margin:0;padding:7px 0;min-height:32px}.reflection-optional{font-size:10px;color:#a1968d;font-weight:400}.reflection-intro{display:block;font-size:11px;line-height:1.9;color:#9a8c81;margin-top:9px}.reflection-field{margin-top:18px;padding-bottom:14px;border-bottom:1px dashed #eae2da}.reflection-field:last-of-type{border:0;padding-bottom:0}.reflection-label{display:flex;gap:10px;font-size:12px;color:#796555;font-weight:550}.reflection-label>text{font:12px Georgia,serif;color:#b4a27c}.reflection-copy,.reflection-empty{display:block;font-size:12px;line-height:1.9;margin-top:9px;color:#7a6c61;white-space:pre-wrap;word-break:break-word}.reflection-empty{color:#a99e95;font-size:11px}.reflection-input{box-sizing:border-box;min-height:76px;width:100%;border:1px solid #e8ded5;background:#fffefb;border-radius:8px;padding:12px;margin-top:10px;font-size:13px;line-height:1.8;color:#615246}.reflection-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap}.reflection-actions .button{font-size:12px;padding:10px 15px}.reflection-error{width:100%;font-size:12px;line-height:1.8;color:#b0804c}.personal-reflection :deep(.uni-textarea-placeholder){color:#b2a9a2}@media(max-width:600px){.personal-reflection{padding:17px 16px}.reflection-heading{font-size:13px}.reflection-heading .text-button{font-size:11px}}
</style>
