<script setup lang="ts">
import type { QuestionImportance } from '../domain/types'

const props = withDefaults(defineProps<{
  value: number
  label?: string
  tone?: 'green' | 'gold'
  compact?: boolean
  interactive?: boolean
  disabled?: boolean
}>(), { label: '', tone: 'green', compact: false, interactive: false, disabled: false })
const emit = defineEmits<{ 'update:value': [value: QuestionImportance] }>()
const stars = [1, 2, 3, 4, 5] as const
function choose(value: number) {
  if (!props.interactive || props.disabled) return
  emit('update:value', value as QuestionImportance)
}
</script>

<template>
  <view class="star-meter" :class="[`star-meter-${tone}`, { compact, interactive, disabled }]" :aria-label="`${label || '星级'} ${value}/5`">
    <text v-if="label" class="star-meter-label">{{ label }}</text>
    <view class="star-meter-stars">
      <template v-if="interactive"><button v-for="star in stars" :key="star" class="star-meter-button" :class="{ filled: star <= value }" :disabled="disabled" :aria-label="`${star}星`" @tap="choose(star)">★</button></template>
      <template v-else><text v-for="star in stars" :key="star" class="star-meter-star" :class="{ filled: star <= value }">★</text></template>
    </view>
    <text class="star-meter-count">{{ value }}/5</text>
  </view>
</template>

<style scoped>
.star-meter{display:flex;align-items:center;gap:7px;min-width:0;color:#a49a90}.star-meter-label{font-size:10px;line-height:1.5;white-space:nowrap}.star-meter-stars{display:flex;align-items:center;gap:1px;line-height:1}.star-meter-star,.star-meter-button{padding:0;margin:0;border:0;background:transparent;font-size:14px;line-height:1;color:#ddd6cf}.star-meter-star.filled,.star-meter-button.filled{color:#71966e}.star-meter-gold .star-meter-star.filled,.star-meter-gold .star-meter-button.filled{color:#c9954f}.star-meter-count{font-size:10px;color:#998b7f;white-space:nowrap}.star-meter-button{width:20px;height:24px}.star-meter-button::after{border:0}.star-meter-button:disabled{opacity:1}.star-meter.interactive{padding:8px 10px;border:1px solid #e9e0d7;border-radius:9px;background:#fcfaf7}.star-meter.interactive .star-meter-stars{gap:3px}.star-meter.interactive .star-meter-button{font-size:22px;width:27px;height:30px}.star-meter.compact{gap:5px}.star-meter.compact .star-meter-label{font-size:9px}.star-meter.compact .star-meter-star{font-size:12px}.star-meter.compact .star-meter-count{font-size:9px}.star-meter.disabled{opacity:.65}
</style>
