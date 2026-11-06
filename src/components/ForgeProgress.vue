<script setup lang="ts">
import { FORGE_STAGES } from '../domain/forge'
import ForgeScene from './ForgeScene.vue'
defineProps<{ completed: number; animating?: boolean; compact?: boolean; activeStage?: number }>()
</script>

<template>
  <view class="forge-panel" :class="[{ compact, working: animating, complete: completed === 5 }, `craft-stage-${activeStage || completed || 1}`]" :aria-label="`五阶锻造，已完成 ${completed} 阶`">
    <view v-if="!compact" class="forge-topline"><view><text class="forge-heading">一题一刃</text><text class="forge-subheading">每次通过，让剑锋更进一步</text></view><text class="forge-count">{{ completed }}<text> / 5</text></text></view>
    <ForgeScene v-if="!compact" :stage="activeStage || completed || 1" :animate="animating" />
    <view class="forge-track"><view v-for="item in FORGE_STAGES" :key="item.stage" class="forge-step" :class="{ done: completed >= item.stage, current: completed + 1 === item.stage }"><view class="forge-step-line" /><view class="forge-step-dot">{{ completed >= item.stage ? '✓' : item.stage }}</view><text>{{ item.name }}</text></view></view>
    <text v-if="!compact" class="forge-note">累计五次测试通过完成锻造 · 答错保留已完成的进度</text>
  </view>
</template>
<style scoped>
.forge-panel{background:#fff;border:1px solid #e1e8e2;border-radius:17px;padding:23px;overflow:hidden;text-align:left}.forge-topline{display:flex;justify-content:space-between;align-items:center;margin:0 0 18px;gap:20px}.forge-heading{display:block;font-size:17px;color:#354d40;font-weight:600;letter-spacing:2px}.forge-subheading{display:block;font-size:11px;color:#929f94;margin-top:5px}.forge-count{font:29px Georgia,serif;color:#496c52;white-space:nowrap}.forge-count>text{font:12px sans-serif;color:#a0ac9f}.forge-track{display:flex;margin-top:24px}.forge-step{position:relative;display:flex;flex:1;align-items:center;flex-direction:column;gap:8px;font-size:11px;color:#a5aea4}.forge-step-line{position:absolute;left:-50%;width:100%;height:1px;background:#e1e8dd;top:13px}.forge-step:first-child .forge-step-line{display:none}.forge-step-dot{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;width:27px;height:27px;border-radius:50%;border:1px solid #dce5d6;background:#fff;box-sizing:border-box;font-size:11px}.done{color:#53734e}.done .forge-step-dot{background:#456647;border-color:#456647;color:white}.done .forge-step-line{background:#96ac8c}.current{color:#a57c40}.current .forge-step-dot{border-color:#d7bf93;background:#faf5e9;color:#b18a51}.forge-note{display:block;font-size:10px;line-height:1.8;color:#a2ad9b;text-align:center;margin-top:18px}.compact{padding:9px 0 3px;border:0;background:transparent;border-radius:0}.compact .forge-track{margin-top:0}.compact .forge-step{font-size:10px;gap:5px}.compact .forge-step-dot{width:19px;height:19px;font-size:9px}.compact .forge-step-line{top:9px}
@media(max-width:600px){.forge-panel{padding:17px 14px;border-radius:13px}.forge-heading{font-size:15px}.forge-subheading{font-size:10px}.forge-topline{margin-bottom:15px}.forge-count{font-size:26px}.forge-track{margin-top:20px}.forge-note{font-size:9px}.compact{padding:8px 0 3px}}
</style>
