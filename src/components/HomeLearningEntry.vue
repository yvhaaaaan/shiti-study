<script setup lang="ts">
import { useStudyStore } from '../domain/store'
import AppIcon from './AppIcon.vue'
const emit = defineEmits<{ notebook: []; review: []; open: [id: string] }>()
const store = useStudyStore()
</script>
<template><view class="home-study-entry"><view><AppIcon name="calendar-days" :size="18" tone="green" /><text>{{ store.stats.value.dueToday ? `今天有 ${store.stats.value.dueToday} 道题待练习` : '今天没有到期练习' }}</text></view><button class="text-button" @tap="emit('review')">去练习<AppIcon name="arrow-right" :size="16" tone="green" /></button></view></template>
<style scoped>.home-study-entry{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#edf4ef;border:1px solid #dce8df;padding:15px 19px;border-radius:9px;margin-bottom:22px}.home-study-entry>view{display:flex;gap:10px;align-items:center;color:#5f7869;font-size:13px}.home-study-entry .text-button{flex-shrink:0}@media(max-width:600px){.home-study-entry{padding:14px}.home-study-entry>view{font-size:12px}}</style>
