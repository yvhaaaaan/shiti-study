<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
const props = withDefaults(defineProps<{ kind: 'furnace' | 'hammer' | 'press'; trigger?: number; working?: boolean }>(), { trigger: 0, working: false })
const frame = ref(0)
const playing = ref(false)
const reduced = ref(false)
const visible = ref(true)
const ready = ref(false)
const failed = ref(false)
const sheet = computed(() => `/static/forge/${props.kind}-cartoon-v1.webp`)
const description = computed(() => ({ furnace: '卡通炉火加热剑胚，投料后火焰升起', hammer: '卡通铁锤落向剑胚，迸出锻造火星', press: '卡通装订机合拢，将纸页装订成一份试卷' })[props.kind])
const previewLabel = computed(() => ({ furnace: '预览投料动画', hammer: '预览锤击动画', press: '预览装订动画' })[props.kind])
const frameStyle = computed(() => ({ backgroundImage: `url("${sheet.value}")`, backgroundPosition: `${frame.value % 2 * 100}% ${Math.floor(frame.value / 2) * 100}%` }))
let ticker: ReturnType<typeof setInterval> | undefined
let preference: MediaQueryList | undefined
let started = 0
let idleTick = 0
function play() {
  if (reduced.value || !visible.value || !ready.value || failed.value) return
  started = Date.now(); playing.value = true; frame.value = 0
}
function tick() {
  if (reduced.value || !visible.value || !ready.value) return
  if (playing.value) {
    const elapsed = Date.now() - started
    const timeline = props.kind === 'furnace' ? [0, 0, 1, 1, 2, 2, 3, 3] : [0, 0, 1, 2, 3, 0]
    frame.value = timeline[Math.min(Math.floor(elapsed / 150), timeline.length - 1)]!
    if (elapsed >= timeline.length * 150) { playing.value = false; frame.value = 0; idleTick = 0 }
  } else {
    idleTick++
    if (props.kind === 'furnace') frame.value = [0, 1, 3, 1][Math.floor(idleTick / 4) % 4]!
    else if (idleTick >= (props.working ? 18 : 32)) play()
  }
}
function changePreference() {
  reduced.value = !!preference?.matches
  if (reduced.value) { playing.value = false; frame.value = 0 }
}
function visibilityChanged() {
  visible.value = document.visibilityState !== 'hidden'
  if (!visible.value) { playing.value = false; frame.value = 0 }
}
watch(() => props.trigger, () => play())
watch(() => props.working, value => { if (value) play() })
onMounted(() => {
  // #ifdef H5
  preference = window.matchMedia('(prefers-reduced-motion: reduce)')
  changePreference(); preference.addEventListener('change', changePreference)
  document.addEventListener('visibilitychange', visibilityChanged)
  visibilityChanged()
  // #endif
  ticker = setInterval(tick, 100)
})
onBeforeUnmount(() => {
  if (ticker) clearInterval(ticker)
  preference?.removeEventListener('change', changePreference)
  // #ifdef H5
  document.removeEventListener('visibilitychange', visibilityChanged)
  // #endif
})
</script>

<template>
  <view class="animated-forge-scene" :class="[kind, { playing, reduced, ready }]" :data-frame="frame" :data-playing="playing">
    <image class="af-preload" :src="sheet" aria-hidden="true" @load="ready = true" @error="failed = true" />
    <view class="af-halo" aria-hidden="true" />
    <view v-if="!failed" class="af-sprite" :style="frameStyle" role="img" :aria-label="description" />
    <view v-else class="af-fallback">{{ kind === 'furnace' ? '炉火已点燃' : kind === 'press' ? '组卷台已就绪' : '锻刀台已就绪' }}</view>
    <view class="af-embers" aria-hidden="true"><view v-for="mote in 5" :key="mote" :style="{ '--mote': mote }" /></view>
    <button v-if="!reduced" class="af-replay" :aria-label="previewLabel" @tap="play"><text aria-hidden="true">↻</text></button>
  </view>
</template>

<style scoped>
.animated-forge-scene{position:relative;isolation:isolate;width:100%;height:100%;min-width:0;overflow:hidden;contain:layout paint;pointer-events:auto}
.af-preload{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.af-halo{position:absolute;inset:29% 4% 4%;border-radius:50%;background:radial-gradient(ellipse,#ec8d4829,transparent 70%);animation:af-warmth 2.4s ease-in-out infinite alternate;pointer-events:none}
.af-sprite{position:absolute;width:min(100%,260px);aspect-ratio:1;left:50%;top:50%;transform:translate(-50%,-50%);background-size:200% 200%;background-repeat:no-repeat;filter:drop-shadow(0 8px 8px #170e1526);pointer-events:none}
.playing .af-halo{background:radial-gradient(ellipse,#ffc86b4a,transparent 72%)}
.af-embers{position:absolute;inset:0;pointer-events:none}.af-embers>view{position:absolute;width:3px;height:5px;left:calc(25% + var(--mote)*9%);top:62%;border-radius:70% 20% 65% 30%;background:#f6b65f;opacity:0;animation:af-rise 2.8s ease-out infinite;animation-delay:calc(var(--mote)*-.55s)}
.af-replay{position:absolute;right:5px;bottom:6px;display:flex;align-items:center;justify-content:center;width:30px;height:30px;min-height:30px;margin:0;padding:0;border:1px solid #caa27b3d;border-radius:50%;background:#fff0d90b;color:#dfbc93;font-size:21px;line-height:1;opacity:.75}.af-replay::after{border:0}.af-replay:focus-visible{outline:2px solid #edb172;outline-offset:2px}.af-replay:hover{opacity:1;background:#fff0d91a}.af-fallback{display:flex;align-items:center;justify-content:center;height:100%;color:#e5bc8c;font-size:13px}
@keyframes af-warmth{to{opacity:.55;transform:scale(.92)}}@keyframes af-rise{0%{opacity:0;transform:translateY(0) rotate(15deg)}20%{opacity:.7}100%{opacity:0;transform:translate(8px,-60px) rotate(60deg)}}
@media(prefers-reduced-motion:reduce){.af-halo,.af-embers>view{animation:none}.af-replay{display:none}}
</style>
