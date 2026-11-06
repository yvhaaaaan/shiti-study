<script setup lang="ts">
defineProps<{ active: 1 | 2 }>()
</script>

<template>
  <view class="question-flow-steps" aria-label="录题流程">
    <view class="flow-step" :class="{ 'flow-current': active === 1, 'flow-done': active === 2 }" :aria-current="active === 1 ? 'step' : undefined"><text class="flow-number">{{ active === 2 ? '✓' : '1' }}</text><view><text>收录题目</text><text>文字或图片即可保存</text></view></view>
    <view class="flow-connector" />
    <view class="flow-step" :class="{ 'flow-current': active === 2 }" :aria-current="active === 2 ? 'step' : undefined"><text class="flow-number">2</text><view><text>补充整理（可选）</text><text>AI 辅助或手动补充</text></view></view>
  </view>
</template>

<style scoped>
.question-flow-steps{display:flex;align-items:center;gap:16px;padding:16px 28px;border-bottom:1px solid #f1ebe5;background:#fdfbf9;flex-shrink:0}.flow-step{display:flex;align-items:center;gap:9px;color:#aca29a;flex-shrink:0}.flow-number{display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;border:1px solid #e6dcd2;background:#f8f4f1;font-size:11px}.flow-step>view>text{display:block;font-size:11px;line-height:1.6}.flow-step>view>text:last-child{font-size:9px;font-weight:400;color:#afa39a;margin-top:1px}.flow-current{color:#6b5442;font-weight:600}.flow-current>.flow-number{background:#f1eae2;border-color:#cbb9ac}.flow-done{color:#957f6f}.flow-done>.flow-number{background:#f4eee9;color:#886e5a}.flow-connector{flex:1;height:1px;background:#e8e0d7;min-width:15px}@media(max-width:600px){.question-flow-steps{padding:13px 20px;gap:12px}.flow-step{gap:7px}.flow-step>view>text{font-size:10px}.flow-step>view>text:last-child{font-size:8px}.flow-number{width:24px;height:24px}.flow-connector{min-width:10px}}
</style>
