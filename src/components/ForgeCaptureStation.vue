<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import AnimatedForgeScene from './AnimatedForgeScene.vue'
const props = withDefaults(defineProps<{ trigger?: number; addedCount?: number }>(), { trigger: 0, addedCount: 1 })
const emit = defineEmits<{ capture: [mode: 'manual' | 'image']; batch: [] }>()
const tossing = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
watch(() => props.trigger, () => {
  if (timer) clearTimeout(timer)
  tossing.value = true
  timer = setTimeout(() => { tossing.value = false }, 1300)
})
onBeforeUnmount(() => { if (timer) clearTimeout(timer) })
</script>

<template>
  <view class="fc-station" :class="{ tossing }">
    <view class="fc-scene"><AnimatedForgeScene kind="furnace" :trigger="trigger" /></view>
    <view class="fc-controls">
      <text class="fc-label">添一份材料</text>
      <button class="fc-action fc-image" aria-label="拍照或上传题图" @tap="emit('capture', 'image')"><view class="fc-action-icon"><AppIcon name="camera" :size="21" tone="orange" /></view><view class="fc-copy"><text>拍照上传</text><text>投入图片材料</text></view><AppIcon class="fc-arrow" name="arrow-up-right" :size="15" tone="orange" /></button>
      <button class="fc-action fc-manual" aria-label="输入题目" @tap="emit('capture', 'manual')"><view class="fc-action-icon"><AppIcon name="keyboard" :size="21" tone="white" /></view><view class="fc-copy"><text>输入题目</text><text>投入文字材料</text></view><AppIcon class="fc-arrow" name="arrow-up-right" :size="15" tone="white" /></button>
      <button class="fc-batch" @tap="emit('batch')"><AppIcon name="layers" :size="14" tone="orange" /><text>批量投料</text><AppIcon name="arrow-right" :size="13" tone="orange" /></button>
    </view>
    <view v-if="tossing" :key="trigger" class="fc-flying-ore" aria-hidden="true" />
    <text class="fc-result" role="status" aria-live="polite">{{ tossing ? `已添入 ${addedCount} 份新材料` : '' }}</text>
  </view>
</template>

<style scoped>
.fc-station{position:relative;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);align-items:center;gap:22px;min-height:262px;padding:14px 30px 14px 18px;box-sizing:border-box;overflow:hidden;border:1px solid #644534;border-radius:20px;background:radial-gradient(ellipse at 23% 70%,#a9582926,transparent 60%),#30251f;box-shadow:inset 0 1px #ffffff0a}
.fc-scene{height:250px;min-width:0;position:relative}.fc-controls{position:relative;display:flex;flex-direction:column;gap:12px;min-width:0;width:100%;max-width:390px;z-index:1}.fc-label{font-size:13px;line-height:1.5;color:#d8b898;letter-spacing:1px;margin:0 0 2px}.fc-action{display:flex;align-items:center;gap:12px;box-sizing:border-box;min-width:0;width:100%;min-height:67px;margin:0;padding:12px 15px;border:1px solid #ab815a54;border-radius:12px;text-align:left;line-height:1.5;transition:transform .18s,background .18s}.fc-action::after,.fc-batch::after{border:0}.fc-action:active{transform:translateY(2px)}.fc-action:focus-visible,.fc-batch:focus-visible{outline:2px solid #f4b56e;outline-offset:3px}.fc-image{background:#f5e4c8;border-color:#e2bd8b;color:#794822;box-shadow:0 3px 0 #ba805a55}.fc-manual{background:#fff0da0a;color:#fff2e1;border-color:#ae81534d}.fc-action-icon{display:flex;align-items:center;justify-content:center;width:37px;height:37px;flex-shrink:0;border-radius:10px;background:#ba6d3020}.fc-manual .fc-action-icon{background:#fff0da0d}.fc-copy{flex:1;min-width:0}.fc-copy>text{display:block}.fc-copy>text:first-child{font-size:15px;font-weight:600;white-space:nowrap}.fc-copy>text:last-child{margin-top:2px;font-size:12px;color:#936b4a;line-height:1.5}.fc-manual .fc-copy>text:last-child{color:#c7ad93}.fc-arrow{flex-shrink:0}.fc-batch{display:flex;align-items:center;gap:6px;align-self:flex-end;min-height:30px;margin:0;padding:4px 1px;background:transparent;color:#d4aa80;font-size:12px;line-height:1.5}.fc-flying-ore{position:absolute;z-index:3;width:22px;height:19px;left:72%;top:44%;border-radius:5px 9px 5px 7px;background:linear-gradient(140deg,#f4b574,#ad623b 65%,#70402e);border:2px solid #71422c;box-shadow:inset 3px 3px #ffd9a14d,0 0 14px #ffb9604d;pointer-events:none;animation:fc-toss 1.05s cubic-bezier(.32,.1,.66,.9) both}.fc-result{position:absolute;left:14px;bottom:4px;font-size:11px;line-height:1.5;color:#efc697;pointer-events:none}
@keyframes fc-toss{0%{left:72%;top:44%;opacity:0;transform:rotate(-20deg) scale(.6)}12%{opacity:1}45%{left:48%;top:14%;transform:rotate(-130deg) scale(1)}82%{left:24%;top:55%;opacity:1;transform:rotate(-250deg) scale(.65)}100%{left:24%;top:60%;opacity:0;transform:rotate(-290deg) scale(.1)}}
@media(max-width:600px){.fc-station{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:9px;min-height:216px;padding:12px 14px 12px 5px;border-radius:16px}.fc-scene{height:190px}.fc-controls{gap:11px}.fc-label{font-size:12px;letter-spacing:.5px;margin:0}.fc-action{min-height:55px;padding:8px;gap:7px;border-radius:10px}.fc-action-icon{width:27px;height:29px;border-radius:7px}.fc-action-icon :deep(.app-icon){width:18px!important;height:18px!important}.fc-copy>text:first-child{font-size:13px}.fc-copy>text:last-child{font-size:11px}.fc-arrow{display:none}.fc-batch{font-size:11px;min-height:26px}.fc-result{left:12px;bottom:4px;font-size:11px}}
@media(max-width:360px){.fc-station{gap:6px;padding-right:10px}.fc-action{gap:5px;padding:7px 6px}.fc-action-icon{width:24px}.fc-copy>text:first-child{font-size:12px}.fc-scene{height:181px}}
@media(prefers-reduced-motion:reduce){.fc-flying-ore{display:none}.fc-action{transition:none}}
</style>
