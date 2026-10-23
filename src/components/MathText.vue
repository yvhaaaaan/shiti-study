<script setup lang="ts">
import { computed } from 'vue'
// #ifdef H5
import { renderMathText } from '../utils/mathText'
import 'katex/dist/katex.min.css'
// #endif
// #ifdef MP-WEIXIN
import { plainMathText } from '../utils/mathText'
// #endif

const props = withDefaults(defineProps<{ text: string; inline?: boolean }>(), { inline: false })
// #ifdef H5
const html = computed(() => renderMathText(props.text || '', props.inline))
// #endif
// #ifdef MP-WEIXIN
const plain = computed(() => plainMathText(props.text || ''))
// #endif
</script>

<template>
  <!-- #ifdef H5 -->
  <view class="math-text" :class="{ 'math-text-inline': inline }" v-html="html" />
  <!-- #endif -->
  <!-- #ifdef MP-WEIXIN -->
  <text class="math-text math-text-fallback">{{ plain }}</text>
  <!-- #endif -->
</template>

<style scoped>
.math-text{min-width:0;max-width:100%;white-space:normal;word-break:break-word;overflow-wrap:anywhere;line-height:inherit;color:inherit;font-size:inherit}
.math-text-fallback{display:block;white-space:pre-wrap}
.math-text :deep(.math-plain),.math-text :deep(.math-fallback){white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere}
.math-text :deep(.math-run){display:inline-block;max-width:100%;overflow-x:auto;overflow-y:hidden;vertical-align:middle;padding:.14em .04em .22em;box-sizing:border-box;overscroll-behavior-x:contain}
.math-text :deep(.math-block){display:block;max-width:100%;overflow-x:auto;overflow-y:hidden;padding:.5em .16em .65em;box-sizing:border-box;overscroll-behavior-x:contain;text-align:center}
.math-text :deep(.katex){font-size:1.1em;line-height:1.3;text-indent:0;white-space:nowrap;word-break:normal;overflow-wrap:normal}
.math-text :deep(.katex-display){margin:0;max-width:100%}
.math-text :deep(.katex-display>.katex){display:inline-block;max-width:none;text-align:initial}
.math-text-inline :deep(.katex){font-size:1.04em}
.math-text-inline :deep(.math-run){padding-top:.1em;padding-bottom:.12em}
</style>
