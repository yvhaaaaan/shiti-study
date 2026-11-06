<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
const props = defineProps<{ stage: number; animate?: boolean }>()
const duration = 4200
const stages = [
  { title: '炉火初燃', label: '加热', asset: 'furnace', description: '炉火渐旺，剑胚慢慢烧红。', frames: [0, 0, 1, 1, 2, 2, 3] },
  { title: '千锤成形', label: '锤打', asset: 'hammer', description: '抬锤、落锤，让剑胚逐渐成形。', frames: [0, 0, 1, 2, 3, 0, 0, 1, 2, 3, 0, 0, 1, 2, 3] },
  { title: '入水淬炼', label: '淬火', asset: 'quench', description: '热刃入水，蒸汽散去后更坚韧。', frames: [0, 0, 1, 1, 2, 2, 2, 3, 3] },
  { title: '细磨剑锋', label: '磨刃', asset: 'grind', description: '磨去钝边，让剑锋一点点清晰。', frames: [0, 0, 1, 2, 1, 2, 1, 2, 3, 3] },
  { title: '此刻，成锋', label: '成锋', asset: 'finish', description: '最后一束光，照见你铸成的本领。', frames: [0, 0, 1, 1, 2, 2, 3, 3] },
] as const
const safeStage = computed(() => Number.isFinite(props.stage) ? Math.max(1, Math.min(5, Math.round(props.stage))) : 1)
const current = computed(() => stages[safeStage.value - 1]!)
const frame = ref(0)
const elapsed = ref(0)
const playing = ref(false)
const paused = ref(false)
const reduced = ref(false)
const ready = ref(false)
const failed = ref(false)
const playback = ref(0)
const retryCount = ref(0)
const ended = ref(false)
const visible = ref(true)
const sheet = computed(() => '/static/forge/' + current.value.asset + '-cartoon-v1.webp' + (retryCount.value ? '?retry=' + retryCount.value : ''))
const frameStyle = computed(() => ({
  backgroundImage: 'url("' + sheet.value + '")',
  backgroundPosition: (frame.value % 2 * 100) + '% ' + (Math.floor(frame.value / 2) * 100) + '%',
}))
const statusMessage = computed(() => failed.value ? '画面未加载，可重试。' : !ready.value ? '正在准备锻造画面。' : reduced.value ? current.value.title + '，静态画面。' : paused.value ? '动画已暂停。' : playing.value ? current.value.title + '，动画播放中。' : ended.value ? '本阶段动画播放完毕。' : current.value.title + '，可播放动画。')
const buttonLabel = computed(() => failed.value ? '重新加载锻造动画' : !ready.value ? '正在准备锻造动画' : !playing.value ? '重播锻造动画' : paused.value ? '继续锻造动画' : '暂停锻造动画')
let ticker: ReturnType<typeof setInterval> | undefined
let preference: MediaQueryList | undefined
let lastTickAt = 0
let visibilityPaused = false
let retryWantsPlay = false
function clearTicker() { if (ticker) clearInterval(ticker); ticker = undefined }
function updateFrame() {
  const sequence = current.value.frames
  frame.value = sequence[Math.min(sequence.length - 1, Math.floor(elapsed.value / duration * sequence.length))]!
}
function finish() {
  clearTicker(); elapsed.value = duration; frame.value = 3
  playing.value = false; paused.value = false; ended.value = true; visibilityPaused = false
}
function advance() {
  const now = Date.now()
  elapsed.value = Math.min(duration, elapsed.value + Math.max(0, now - lastTickAt)); lastTickAt = now
  updateFrame()
  if (elapsed.value >= duration) finish()
}
function startTicker() { clearTicker(); lastTickAt = Date.now(); ticker = setInterval(advance, 50) }
function stop(finalFrame = false) {
  clearTicker(); playing.value = false; paused.value = false; visibilityPaused = false
  elapsed.value = finalFrame ? duration : 0; frame.value = finalFrame ? 3 : 0; ended.value = finalFrame
}
function play() {
  if (!ready.value || failed.value || reduced.value) return
  stop(); playback.value++; playing.value = true
  if (!visible.value) { paused.value = true; visibilityPaused = true; return }
  startTicker()
}
function pause(fromVisibility = false) {
  if (!playing.value || paused.value) return
  advance()
  if (!playing.value) return
  clearTicker(); paused.value = true; visibilityPaused = fromVisibility
}
function resume() {
  if (!playing.value || !paused.value || reduced.value) return
  if (!visible.value) { visibilityPaused = true; return }
  paused.value = false; visibilityPaused = false; startTicker()
}
function assetLoaded(stage: number) {
  if (stage !== safeStage.value) return
  failed.value = false; ready.value = true
  if (reduced.value) { stop(true); return }
  if (props.animate || retryWantsPlay) { retryWantsPlay = false; play() }
}
function assetFailed(stage: number) {
  if (stage !== safeStage.value) return
  stop(); ready.value = false; failed.value = true
}
function retry() { stop(); ready.value = false; failed.value = false; retryWantsPlay = true; retryCount.value++ }
function control() {
  if (failed.value) retry()
  else if (!playing.value) play()
  else if (paused.value) resume()
  else pause()
}
function changePreference() { reduced.value = !!preference?.matches; if (reduced.value) stop(true) }
function visibilityChanged() {
  // #ifdef H5
  visible.value = document.visibilityState !== 'hidden'
  if (!visible.value) pause(true)
  else if (visibilityPaused) resume()
  // #endif
}
watch(safeStage, () => {
  stop(); ready.value = false; failed.value = false; retryWantsPlay = false; retryCount.value = 0
  if (reduced.value) frame.value = 3
})
watch(() => props.animate, value => {
  if (value) { if (ready.value) play() }
  else stop(reduced.value)
})
onMounted(() => {
  // #ifdef H5
  preference = window.matchMedia('(prefers-reduced-motion: reduce)')
  changePreference(); preference.addEventListener('change', changePreference)
  document.addEventListener('visibilitychange', visibilityChanged); visibilityChanged()
  // #endif
  if (props.animate && ready.value) play()
})
onBeforeUnmount(() => {
  clearTicker(); preference?.removeEventListener('change', changePreference)
  // #ifdef H5
  document.removeEventListener('visibilitychange', visibilityChanged)
  // #endif
})
</script>
<template>
  <view class="forge-cinema" :class="['scene-stage-' + safeStage, { playing, paused, reduced, loaded: ready, ended }]" :data-stage="safeStage" :data-frame="frame" :data-playing="playing" :data-paused="paused" :data-elapsed="Math.round(elapsed)">
    <image v-for="request in [{ stage: safeStage, src: sheet }]" :key="request.src" class="scene-preload" :src="request.src" aria-hidden="true" @load="assetLoaded(request.stage)" @error="assetFailed(request.stage)" />
    <view class="scene-viewport">
      <view class="scene-overline"><view class="scene-chapter-mark"><text>{{ String(safeStage).padStart(2, '0') }}</text><text>/ 05</text></view><text class="scene-action-label">{{ current.label }}</text></view>
      <view v-if="ready && !failed" class="scene-artboard" role="img" :aria-label="current.title + '：' + current.description">
        <view :key="playback" class="scene-effects" aria-hidden="true">
          <view class="scene-warmth" />
          <template v-if="safeStage === 2 || safeStage === 4"><view class="scene-contact-flash" /><view v-for="spark in 8" :key="spark" class="scene-contact-spark" :style="{ '--angle': (-120 + spark * 24) + 'deg', '--travel': (30 + spark % 4 * 11) + 'px', '--spark-delay': (spark % 3 * .035) + 's' }" /></template>
          <template v-if="safeStage === 3"><view v-for="puff in 4" :key="'steam' + puff" class="scene-steam" :style="{ '--drift': ((puff - 2.5) * 18) + 'px', '--steam-delay': (1.6 + puff * .12) + 's' }" /><view class="scene-ripple ripple-one" /><view class="scene-ripple ripple-two" /></template>
          <template v-if="safeStage === 5"><view class="scene-reveal-ring" /><view class="scene-blade-light" /><view class="scene-finish-star star-one" /><view class="scene-finish-star star-two" /></template>
        </view>
        <view class="scene-sprite" :style="frameStyle" />
      </view>
      <view v-else class="scene-placeholder"><AppIcon :name="failed ? 'image' : 'loader-circle'" :size="30" tone="orange" /><text>{{ failed ? '画面暂未加载' : '正在准备锻造画面' }}</text><button v-if="failed" class="scene-retry" @tap="retry">重新加载</button></view>
      <view class="scene-playback-progress" aria-hidden="true"><view :style="{ width: (elapsed / duration * 100) + '%' }" /></view>
    </view>
    <view class="scene-caption">
      <view class="scene-caption-copy"><text class="scene-title">{{ current.title }}</text><text class="scene-description">{{ current.description }}</text></view>
      <button v-if="!reduced" class="scene-play" :disabled="!ready && !failed" :aria-label="buttonLabel" @tap="control"><view v-if="playing && !paused && !failed" class="scene-pause-glyph" /><AppIcon v-else :name="paused ? 'play' : 'rotate-ccw'" :size="14" tone="white" /><text>{{ failed ? '重试' : !ready ? '准备中' : !playing ? '重播' : paused ? '继续' : '暂停' }}</text></button>
      <text v-else class="scene-static-label">静态画面</text>
    </view>
    <text class="scene-status" role="status" aria-live="polite">{{ statusMessage }}</text>
  </view>
</template>
<style scoped>
.forge-cinema{width:100%;min-width:0;overflow:hidden;border:1px solid #6a4932;border-radius:16px;background:#30251f;color:#fff0d9;isolation:isolate}
.scene-preload{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.scene-viewport{position:relative;height:320px;overflow:hidden;background:radial-gradient(ellipse at 50% 61%,#af62372c,transparent 67%),#30251f}
.scene-overline{position:absolute;inset:17px 21px auto;display:flex;justify-content:space-between;align-items:center;z-index:2;pointer-events:none}
.scene-chapter-mark{display:flex;align-items:baseline;gap:6px;color:#c3a07c;font-size:11px;font-variant-numeric:tabular-nums}.scene-chapter-mark>text:first-child{font-size:21px;color:#e4c49b;letter-spacing:1px}.scene-action-label{font-size:11px;line-height:1.6;border:1px solid #a77c513d;border-radius:6px;padding:3px 8px;color:#dbb58c;background:#fff1dc05;letter-spacing:2px}
.scene-artboard{position:absolute;left:50%;top:50%;width:284px;height:284px;transform:translate(-50%,-50%);isolation:isolate}.scene-sprite{position:absolute;inset:0;background-size:200% 200%;background-repeat:no-repeat;filter:drop-shadow(0 10px 10px #1b0f0b33);z-index:1}.scene-effects{position:absolute;inset:0;pointer-events:none}.scene-warmth{position:absolute;inset:20% 4% 3%;background:radial-gradient(ellipse,#ee9a4b28,transparent 70%);border-radius:50%}
.scene-placeholder{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;font-size:12px;color:#d1af8d}.scene-retry{margin:0;padding:8px 13px;background:#ba7d4940;border:1px solid #c48b514d;border-radius:8px;color:#efcfaa;font-size:12px;line-height:1.5}.scene-retry::after{border:0}
.scene-playback-progress{position:absolute;bottom:0;left:0;right:0;height:3px;background:#fff0dd0c}.scene-playback-progress>view{height:100%;background:#d79a5c;border-radius:0 2px 2px 0;transition:width 50ms linear}
.scene-caption{display:flex;align-items:center;justify-content:space-between;gap:17px;padding:17px 21px 18px;background:#ffffff04;border-top:1px solid #bb85532b}.scene-caption-copy{flex:1;min-width:0}.scene-title{display:block;font-size:21px;font-weight:600;line-height:1.5;letter-spacing:1px;color:#fff0d9}.scene-description{display:block;font-size:12px;line-height:1.8;margin-top:5px;color:#c6a98c}
.scene-play{display:flex;align-items:center;justify-content:center;gap:6px;flex-shrink:0;min-width:76px;min-height:38px;margin:0;padding:9px 12px;border:1px solid #c798633d;border-radius:10px;background:#e8b77410;color:#f2d2a8;font-size:12px;line-height:1.5}.scene-play::after{border:0}.scene-play[disabled]{opacity:.55}.scene-play:focus-visible,.scene-retry:focus-visible{outline:2px solid #efba75;outline-offset:3px}.scene-play:hover:not([disabled]){background:#e8b77420}.scene-pause-glyph{width:10px;height:12px;border-left:3px solid #f4d6af;border-right:3px solid #f4d6af;box-sizing:border-box;margin:0 2px}.scene-static-label{flex-shrink:0;font-size:11px;color:#b99d80}.scene-status{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
.scene-contact-flash{position:absolute;left:39%;top:54%;width:22%;height:16%;background:radial-gradient(ellipse,#fff1a08c,transparent 65%);border-radius:50%;opacity:0;z-index:2}.scene-contact-spark{position:absolute;left:49%;top:60%;width:3px;height:11px;background:linear-gradient(#fff0ad,#e29a44,transparent);border-radius:50%;transform-origin:center bottom;opacity:0;z-index:2}.scene-stage-4 .scene-contact-flash{left:46%;top:44%}.scene-stage-4 .scene-contact-spark{left:56%;top:50%}
.scene-steam{position:absolute;left:44%;top:44%;width:40px;height:40px;opacity:0;border-radius:50%;background:radial-gradient(ellipse,#ffe8cda6,transparent 72%);filter:blur(3px);z-index:2}.scene-ripple{position:absolute;left:28%;top:57%;width:45%;height:9%;border:1px solid #cbd3b780;border-radius:50%;opacity:0;z-index:2}
.scene-reveal-ring{position:absolute;inset:7%;border:1px solid #ce995340;border-radius:50%;opacity:0}.scene-blade-light{position:absolute;left:37%;top:46%;width:26%;height:3px;opacity:0;z-index:2;background:linear-gradient(90deg,transparent,#fff7d3,transparent);box-shadow:0 0 13px #ffeab688;transform:rotate(-50deg)}.scene-finish-star{position:absolute;width:19px;height:19px;z-index:2;opacity:0}.scene-finish-star::before,.scene-finish-star::after{content:'';position:absolute;inset:0;background:linear-gradient(0deg,transparent,#fff0b7,transparent);width:2px;left:calc(50% - 1px)}.scene-finish-star::after{transform:rotate(90deg)}.star-one{left:66%;top:22%}.star-two{left:24%;top:54%;width:12px;height:12px}
.playing .scene-warmth{animation:scene-heat 1.4s ease-in-out 3 both}.scene-stage-2.playing .scene-contact-flash{animation:scene-impact 1.4s ease-out 3 both}.scene-stage-2.playing .scene-contact-spark{animation:scene-spark 1.4s ease-out var(--spark-delay) 3 both}.scene-stage-4.playing .scene-contact-flash{animation:scene-grind-flash .5s ease-in-out .8s 6 both}.scene-stage-4.playing .scene-contact-spark{animation:scene-grind-spark .65s ease-out calc(.8s + var(--spark-delay)) 5 both}
.playing .scene-steam{animation:scene-steam-rise 2.4s ease-out var(--steam-delay) both}.playing .scene-ripple{animation:scene-water-ring 1.1s ease-out 1.65s 2 both}.playing .ripple-two{animation-delay:1.85s}.playing .scene-reveal-ring{animation:scene-aura 4.2s ease-out both}.playing .scene-blade-light{animation:scene-edge-sweep 4.2s ease-in-out both}.playing .scene-finish-star{animation:scene-star 4.2s ease-out both}.playing .star-two{animation-delay:.12s}.paused .scene-effects,.paused .scene-effects *{animation-play-state:paused!important}.ended.scene-stage-5 .scene-reveal-ring{opacity:1}.ended.scene-stage-5 .scene-finish-star{opacity:.7}
@keyframes scene-heat{0%,100%{opacity:.55;transform:scale(.96)}50%{opacity:1;transform:scale(1.05)}}
@keyframes scene-impact{0%,58%,82%,100%{opacity:0}61%{opacity:1;transform:scale(1.3)}71%{opacity:.3}}
@keyframes scene-spark{0%,58%{opacity:0;transform:rotate(var(--angle)) translateY(0) scaleY(.3)}62%{opacity:1;transform:rotate(var(--angle)) translateY(-5px) scaleY(1)}88%,100%{opacity:0;transform:rotate(var(--angle)) translateY(calc(var(--travel) * -1)) scaleY(.2)}}
@keyframes scene-grind-flash{from{opacity:.2}to{opacity:.85}}
@keyframes scene-grind-spark{0%{opacity:0;transform:rotate(45deg) translateY(0)}20%{opacity:1}100%{opacity:0;transform:rotate(45deg) translateY(calc(var(--travel) * -1))}}
@keyframes scene-steam-rise{0%{opacity:0;transform:translate(0,10px) scale(.4)}20%{opacity:.8}100%{opacity:0;transform:translate(var(--drift),-80px) scale(2.2)}}
@keyframes scene-water-ring{from{opacity:.7;transform:scale(.4)}to{opacity:0;transform:scale(1.25)}}
@keyframes scene-aura{0%{opacity:0;transform:scale(.7)}65%,100%{opacity:1;transform:scale(1)}}
@keyframes scene-edge-sweep{0%,20%{opacity:0;transform:translate(-35px,43px) rotate(-50deg)}35%{opacity:1}68%{opacity:1;transform:translate(38px,-45px) rotate(-50deg)}82%,100%{opacity:0;transform:translate(55px,-60px) rotate(-50deg)}}
@keyframes scene-star{0%,48%{opacity:0;transform:scale(.3) rotate(-15deg)}70%{opacity:1;transform:scale(1.2) rotate(8deg)}100%{opacity:.7;transform:scale(1) rotate(0)}}
@media(max-width:600px){.forge-cinema{border-radius:12px}.scene-viewport{height:247px}.scene-overline{inset:13px 15px auto}.scene-chapter-mark>text:first-child{font-size:18px}.scene-artboard{width:224px;height:224px;top:53%}.scene-caption{padding:14px 15px 15px;gap:12px}.scene-title{font-size:18px;letter-spacing:.5px}.scene-description{font-size:12px;line-height:1.75;margin-top:4px}.scene-play{min-width:68px;min-height:37px;padding:8px 10px;font-size:12px}}
@media(max-width:360px){.scene-viewport{height:224px}.scene-artboard{width:204px;height:204px}.scene-caption{padding:12px;gap:9px}.scene-title{font-size:17px}.scene-description{font-size:11px}.scene-play{min-width:62px;padding:8px}.scene-action-label{letter-spacing:1px}}
@media(prefers-reduced-motion:reduce){.scene-effects,.scene-effects *{animation:none!important}.scene-playback-progress>view{transition:none}}
</style>
