<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { useStudyStore } from '../domain/store'
import { login } from '../services/studyStorage'
const store = useStudyStore()
const status = store.storageStatus
const username = ref('')
const password = ref('')
const invite = ref('')
const registering = ref(false)
async function submit() {
  if (status.busy) return
  try {
    await login(username.value.trim(), password.value, registering.value ? invite.value : undefined)
    await store.initialize(true)
    password.value = ''; invite.value = ''
  } catch { /* The service exposes a user-facing error without clearing inputs. */ }
}
function retry() { void store.initialize(true).catch(() => {}) }
</script>

<template>
  <view class="access-page">
    <view class="access-card">
      <view class="brand access-brand"><view class="brand-mark"><view class="brand-page page-one" /><view class="brand-page page-two" /><view class="brand-page page-three" /></view><view><text class="brand-word">拾题<text class="brand-word-en">SHITI</text></text><text class="brand-tagline">让进步，有迹可循</text></view></view>
      <template v-if="status.initializing"><AppIcon name="loader-circle" :size="32" tone="green" /><text class="access-title">正在打开学习空间</text><text class="access-caption">认真留下的题目，正在回到这里。</text></template>
      <template v-else-if="status.cloud && !status.user">
        <text class="eyebrow">YOUR PROGRESS, EVERYWHERE</text><text class="access-title">{{ registering ? '开启你的学习空间' : '欢迎回来，继续进步' }}</text><text class="access-caption">登录后，电脑与手机共用同一份学习档案。</text>
        <text class="field-label">账号</text><input v-model="username" class="form-input" maxlength="32" placeholder="请输入账号" autocomplete="username" />
        <text class="field-label">密码</text><input v-model="password" class="form-input" password maxlength="128" placeholder="请输入密码" autocomplete="current-password" @confirm="submit" />
        <template v-if="registering"><text class="field-label">课堂邀请码</text><input v-model="invite" class="form-input" maxlength="64" placeholder="向演示者获取邀请码" /></template>
        <text v-if="status.error" class="access-error" role="alert">{{ status.error }}</text>
        <button class="button button-primary access-submit" :loading="status.busy" :disabled="status.busy || !username.trim() || !password || (registering && !invite)" @tap="submit">{{ registering ? '创建学习空间' : '登录拾题' }}<AppIcon name="arrow-right" :size="18" tone="white" /></button>
        <button class="text-button access-switch" @tap="registering = !registering; status.error = ''">{{ registering ? '已有账号，返回登录' : '有邀请码？创建独立账号' }}</button>
      </template>
      <template v-else><AppIcon name="cloud-off" :size="32" tone="orange" /><text class="access-title">档案暂时没有打开</text><text class="access-error" role="alert">{{ status.error }}</text><button class="button button-primary access-submit" @tap="retry">重新连接</button></template>
      <view class="access-footnote"><AppIcon name="shield-check" :size="16" tone="green" /><text>每一份认真，都有自己的归处。</text></view>
    </view>
  </view>
</template>

<style scoped>
.access-page{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:30px 20px;box-sizing:border-box;background:radial-gradient(ellipse at 12% 0%,#e9efdf 0,transparent 58%),#f7f8f3}.access-card{width:100%;max-width:440px;padding:40px;box-sizing:border-box;background:#fff;border:1px solid #e4e9dd;border-radius:26px;box-shadow:0 22px 80px #2a4c3310;display:flex;flex-direction:column}.access-brand{margin-bottom:44px}.access-title{font-size:25px;font-weight:650;color:#243e33;margin:12px 0;line-height:1.5}.access-caption{font-size:14px;line-height:1.8;color:#7c887e;margin-bottom:22px}.access-card .field-label{margin-top:16px;margin-bottom:8px}.access-submit{width:100%;margin-top:26px;justify-content:center;gap:14px;min-height:46px}.access-switch{margin:16px auto 0;font-size:13px}.access-error{margin-top:16px;line-height:1.7;color:#a96336;font-size:13px}.access-footnote{margin-top:34px;padding-top:20px;border-top:1px solid #eef0e8;display:flex;gap:8px;align-items:center;font-size:12px;color:#8c998c}@media(max-width:480px){.access-card{padding:28px 24px}.access-title{font-size:23px}}
</style>
