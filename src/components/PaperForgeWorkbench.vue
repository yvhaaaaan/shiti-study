<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import AnimatedForgeScene from './AnimatedForgeScene.vue'
import AppIcon from './AppIcon.vue'
const props = withDefaults(defineProps<{ paperCount: number; availableCount: number; trigger?: number }>(), { trigger: 0 })
const emit = defineEmits<{ create: [] }>()
const completed = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
watch(() => props.trigger, () => {
  completed.value = true
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { completed.value = false }, 2400)
})
onBeforeUnmount(() => { if (timer) clearTimeout(timer) })
</script>

<template>
  <view class="pw-workbench" :class="{ completed }">
    <view class="pw-animation"><AnimatedForgeScene kind="press" :trigger="trigger" /></view>
    <view class="pw-controls">
      <text class="pw-label">我的组卷台</text>
      <view class="pw-stats"><view><text>{{ paperCount }}</text><text>份已成卷</text></view><view><text>{{ availableCount }}</text><text>道题可选</text></view></view>
      <button class="pw-create" aria-label="新建试卷" @tap="emit('create')"><AppIcon name="plus" :size="18" tone="white" /><text>新建试卷</text></button>
      <text class="pw-hint" role="status" aria-live="polite">{{ completed ? '新试卷已装订完成' : '选题 · 排序 · 打印' }}</text>
    </view>
  </view>
</template>

<style scoped>
.pw-workbench{position:relative;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);align-items:center;gap:28px;min-height:246px;box-sizing:border-box;padding:15px 36px 15px 20px;overflow:hidden;border:1px solid #5a3b2c;border-radius:21px;background:radial-gradient(ellipse at 21% 69%,#a75b372b,transparent 55%),#30251f;box-shadow:inset 0 1px #ffffff0c}.pw-animation{height:226px;min-width:0}.pw-controls{min-width:0;max-width:320px}.pw-label{display:block;font-size:14px;line-height:1.6;font-weight:550;letter-spacing:1px;color:#e4c8ad}.pw-stats{display:flex;gap:24px;margin:14px 0 20px}.pw-stats>view{min-width:0;display:flex;flex-direction:column;gap:4px}.pw-stats>view>text:first-child{font-size:32px;line-height:1.15;font-weight:650;color:#fff3e3;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.pw-stats>view>text:last-child{font-size:12px;line-height:1.5;color:#c9ab8f}.pw-create{display:flex;justify-content:center;align-items:center;gap:8px;margin:0;min-height:46px;width:100%;box-sizing:border-box;padding:11px 12px;border-radius:11px;background:linear-gradient(180deg,#c17a4b,#aa5f38);box-shadow:inset 0 1px #ffffff24,0 4px 0 #743f28;color:#fff9ed;font-size:15px;line-height:1.5;font-weight:600;transition:transform .15s,filter .15s}.pw-create::after{border:0}.pw-create:active{transform:translateY(2px);box-shadow:inset 0 1px #ffffff24,0 2px 0 #743f28}.pw-create:focus-visible{outline:2px solid #f1bd83;outline-offset:3px}.pw-hint{display:block;text-align:center;font-size:12px;color:#cda982;line-height:1.6;margin-top:12px}.completed .pw-hint{color:#ffe1ae}
@media(max-width:600px){.pw-workbench{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;min-height:210px;padding:12px 16px 12px 8px;border-radius:17px}.pw-animation{height:184px}.pw-label{font-size:12px;letter-spacing:.5px}.pw-stats{gap:16px;margin:12px 0 16px}.pw-stats>view>text:first-child{font-size:27px}.pw-stats>view>text:last-child{font-size:11px}.pw-create{min-height:42px;padding:10px 6px;font-size:13px;gap:5px;border-radius:9px}.pw-hint{font-size:11px;margin-top:10px}}
@media(max-width:360px){.pw-workbench{gap:7px;padding-left:5px;padding-right:11px}.pw-animation{height:178px}.pw-stats{gap:13px}.pw-stats>view>text:first-child{font-size:25px}.pw-create{font-size:12px}}
@media(prefers-reduced-motion:reduce){.pw-create{transition:none}}
</style>
