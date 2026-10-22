<script setup lang="ts">
import { computed } from 'vue'
// #ifdef MP-WEIXIN
import { iconSources } from './iconSources'
// #endif

const props = withDefaults(defineProps<{
  name: string
  size?: number
  tone?: 'ink' | 'green' | 'white' | 'muted' | 'orange'
}>(), { size: 20, tone: 'ink' })

const source = computed(() => {
  // #ifdef MP-WEIXIN
  return iconSources[`${props.name}-${props.tone}`] || iconSources['circle-alert-muted']
  // #endif
  // #ifdef H5
  return `/static/icons/${props.name}-${props.tone}.svg`
  // #endif
})
const dimensions = computed(() => ({ width: `${props.size}px`, height: `${props.size}px` }))
</script>

<template>
  <image class="app-icon" :class="[`app-icon-${name}`, `app-icon-tone-${tone}`]" :src="source" :style="dimensions" mode="aspectFit" aria-hidden="true" />
</template>

<style scoped>
.app-icon { display: inline-block; flex-shrink: 0; vertical-align: middle; transform-origin: center; transition: transform 200ms ease; }
@media (prefers-reduced-motion: reduce) { .app-icon { transition: none; } }
</style>
