<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { useStudyStore } from '../domain/store'
import { localDate } from '../domain/seed'

// #ifdef MP-WEIXIN
declare const wx: { env: { USER_DATA_PATH: string }; shareFileMessage(options: { filePath: string; fileName: string; success: () => void; fail: (error: { errMsg?: string }) => void }): void }
// #endif

const emit = defineEmits<{ close: []; restored: [] }>()
const store = useStudyStore()
const importing = ref(false)
const exporting = ref(false)
const fileName = ref('')
const backupText = ref('')
const error = ref('')
const preview = ref<{ counts: { questions: number; notes: number; papers: number; reviews: number }; warnings: string[]; localImageCount: number } | null>(null)
const restored = ref(false)
const currentCounts = computed(() => [
  { label: '题目档案', value: store.state.questions.length },
  { label: '知识笔记', value: store.state.notes.length },
  { label: '练习卷', value: store.state.papers.length },
  { label: '复习记录', value: store.state.reviews.length },
])
const incomingCounts = computed(() => preview.value ? [
  { label: '题目档案', value: preview.value.counts.questions },
  { label: '知识笔记', value: preview.value.counts.notes },
  { label: '练习卷', value: preview.value.counts.papers },
  { label: '复习记录', value: preview.value.counts.reviews },
] : [])

function showError(value: unknown) { error.value = value instanceof Error ? value.message : '操作未完成，请再试一次。' }
function clearPreview() { preview.value = null; backupText.value = ''; fileName.value = ''; restored.value = false }
function inspectBackup(content: string, name: string) {
  error.value = ''; restored.value = false
  try {
    const result = store.validateBackup(content)
    backupText.value = content; fileName.value = name
    preview.value = { counts: result.counts, warnings: result.warnings, localImageCount: result.localImageCount }
  } catch (e) { preview.value = null; backupText.value = ''; showError(e) }
}

function chooseBackup() {
  error.value = ''
  // #ifdef H5
  const input = document.createElement('input')
  input.type = 'file'; input.accept = '.json,application/json'
  input.style.display = 'none'
  input.onchange = async () => {
    const file = input.files?.[0]
    input.remove()
    if (!file) return
    clearPreview()
    if (file.size > 50 * 1024 * 1024) return showError(new Error('备份文件超过50MB，请选择较小的备份。'))
    try { inspectBackup(await file.text(), file.name) } catch (e) { showError(e) }
  }
  input.oncancel = () => input.remove()
  document.body.appendChild(input); input.click()
  // #endif
  // #ifdef MP-WEIXIN
  uni.chooseMessageFile({ count: 1, type: 'file', extension: ['json'], success: result => {
    const file = result.tempFiles[0]
    if (!file) return
    clearPreview()
    if (file.size > 50 * 1024 * 1024) return showError(new Error('备份文件超过50MB，请选择较小的备份。'))
    uni.getFileSystemManager().readFile({ filePath: file.path, encoding: 'utf8', success: r => inspectBackup(String(r.data), file.name), fail: () => showError(new Error('文件读取失败，请重新选择备份。')) })
  } })
  // #endif
}

async function exportData() {
  if (exporting.value) return
  exporting.value = true; error.value = ''
  try {
    const json = await store.exportBackup()
    const name = `拾题备份-${localDate()}.json`
    // #ifdef H5
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = name
    document.body.appendChild(link); link.click(); link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    uni.showToast({ title: '备份已下载，请妥善保存', icon: 'none' })
    // #endif
    // #ifdef MP-WEIXIN
    const filePath = `${wx.env.USER_DATA_PATH}/shiti-backup-${localDate()}.json`
    await new Promise<void>((resolve, reject) => uni.getFileSystemManager().writeFile({ filePath, data: json, encoding: 'utf8', success: () => resolve(), fail: () => reject(new Error('备份写入失败，请检查设备空间。')) }))
    await new Promise<void>((resolve, reject) => wx.shareFileMessage({ filePath, fileName: name, success: () => resolve(), fail: result => reject(new Error(result.errMsg?.includes('cancel') ? '已取消发送，你可以再次导出备份。' : '备份已生成，但文件分享失败，请稍后重试。')) }))
    // #endif
  } catch (e) { showError(e) }
  finally { exporting.value = false }
}

function restoreBackup() {
  if (!preview.value || importing.value) return
  uni.showModal({ title: '用这份备份替换当前数据？', content: '当前学习档案中的题目、笔记、试卷、复习记录和个人资料将被整份替换，不会合并。建议先导出当前数据作为备份。', confirmText: '确认替换', confirmColor: '#39775a', success: async result => {
    if (!result.confirm) return
    importing.value = true; error.value = ''
    try {
      await store.importBackup(backupText.value)
      restored.value = true; preview.value = null; backupText.value = ''
      emit('restored')
      uni.showToast({ title: '学习档案已恢复', icon: 'success' })
    } catch (e) { showError(e) }
    finally { importing.value = false }
  } })
}
</script>

<template>
  <view class="modal-overlay" @tap.self="emit('close')"><view class="modal-window data-manager">
    <view class="modal-header"><view><text class="eyebrow">KEEP YOUR PROGRESS SAFE</text><text class="modal-title">认真留下的，值得好好保存。</text></view><button class="icon-button" aria-label="关闭备份" @tap="emit('close')"><AppIcon name="x" /></button></view>
    <scroll-view scroll-y class="modal-scroll data-scroll"><view class="data-content">
      <view v-if="restored" class="restore-success"><view><AppIcon name="check-check" :size="28" tone="green" /></view><text>学习档案，已经重新回到这里。</text><text>题目、笔记和复习记录均已恢复，可以继续学习了。</text></view>
      <template v-else>
        <view class="data-intro"><view class="archive-mark"><view class="archive-paper" /><AppIcon name="shield-check" :size="31" tone="green" /></view><view><text class="data-intro-title">你的进步档案</text><text class="data-intro-caption">为记录留一份副本，让每一次认真都有归处。</text></view></view>
        <view class="backup-counts"><view v-for="item in currentCounts" :key="item.label"><text>{{ item.value }}</text><text>{{ item.label }}</text></view></view>
        <text class="data-count-note">题目数量包含回收站，备份保留全部档案与关联关系。</text>
        <view class="data-action-card"><view class="data-action-icon"><AppIcon name="download" :size="23" tone="green" /></view><view class="data-action-copy"><text>导出一份完整备份</text><text>将题目、笔记、练习卷和复习足迹保存为文件。</text></view><button class="button button-primary export-backup" :loading="exporting" @tap="exportData">导出备份</button></view>
        <view class="data-action-card import-card"><view class="data-action-icon warm"><AppIcon name="upload" :size="23" tone="orange" /></view><view class="data-action-copy"><text>从备份继续学习</text><text>先查看备份内容，确认后恢复到当前学习档案。</text></view><button class="button button-quiet choose-backup" @tap="chooseBackup">选择备份</button></view>
        <view v-if="preview" class="backup-preview"><view class="preview-heading"><AppIcon name="file-text" :size="18" tone="green" /><view><text>这份备份已通过检查</text><text>{{ fileName }}</text></view><button class="icon-button" aria-label="取消恢复" @tap="preview = null; backupText = ''"><AppIcon name="x" :size="15" tone="muted" /></button></view><view class="backup-counts incoming-counts"><view v-for="item in incomingCounts" :key="item.label"><text>{{ item.value }}</text><text>{{ item.label }}</text></view></view><view v-for="warning in preview.warnings" :key="warning" class="backup-warning"><AppIcon name="circle-alert" :size="15" tone="orange" /><text>{{ warning }}</text></view><view class="replace-note"><AppIcon name="info" :size="15" tone="muted" /><text>恢复会替换当前全部数据，不会与现有记录合并。</text></view><button class="button button-primary restore-backup" :loading="importing" @tap="restoreBackup">确认恢复这份备份<AppIcon name="arrow-right" :size="16" tone="white" /></button></view>
        <view v-if="error" class="backup-error" role="alert"><AppIcon name="circle-alert" :size="17" tone="orange" /><view><text>这次操作还没有完成</text><text>{{ error }}</text></view></view>
        <view class="backup-footnote"><AppIcon name="shield-check" :size="15" tone="muted" /><view><text>文件由你自己保管，不上传到云端。</text><text>网页版内嵌题图会随备份保存。小程序本地图片路径仅适合同一设备，换设备前请另存原图。</text></view></view>
      </template>
    </view></scroll-view><view class="modal-footer"><button class="button button-quiet" @tap="emit('close')">{{ restored ? '继续学习' : '完成' }}</button></view>
  </view></view>
</template>

<style scoped>
.data-manager{width:680px}.data-manager .modal-title{font-size:22px}.data-content{padding:26px 28px 28px}.data-intro{display:flex;align-items:center;gap:18px;padding:3px 0 24px}.archive-mark{height:68px;width:65px;background:#e9f0df;border:1px solid #dce8cf;border-radius:17px;display:flex;align-items:center;justify-content:center;position:relative;flex-shrink:0;transform:rotate(-5deg)}.archive-paper{position:absolute;inset:9px 7px 9px 11px;border:1px solid #d2dfbf;background:#f5f8ed;border-radius:6px;transform:rotate(10deg)}.archive-mark>.app-icon{position:relative}.data-intro-title{font-size:19px;font-weight:600;color:#3e6540;display:block;margin-bottom:8px}.data-intro-caption{display:block;font-size:12px;line-height:1.8;color:#8b9d7d}.backup-counts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;background:#f7f9f2;border:1px solid #e8eedf;border-radius:12px;padding:20px 12px}.backup-counts>view{text-align:center;border-right:1px solid #e4ebd9}.backup-counts>view:last-child{border:0}.backup-counts>view>text:first-child{display:block;font-size:27px;font-weight:600;color:#477446;line-height:1.4}.backup-counts>view>text:last-child{display:block;font-size:10px;color:#93a183;margin-top:6px}.data-count-note{display:block;font-size:10px;color:#a2af92;margin:12px 2px 24px;line-height:1.8}.data-action-card{display:flex;align-items:center;gap:14px;border:1px solid #e4ecda;padding:19px 17px;border-radius:12px;margin-bottom:13px}.data-action-icon{width:43px;height:45px;border-radius:12px;background:#edf4e5;display:flex;align-items:center;justify-content:center;flex-shrink:0}.data-action-icon.warm{background:#faf1e4}.data-action-copy{min-width:0;flex:1}.data-action-copy>text:first-child{display:block;font-size:13px;font-weight:550;color:#5a7c48;margin-bottom:7px}.data-action-copy>text:last-child{display:block;font-size:10px;line-height:1.8;color:#9ba98c}.data-action-card .button{font-size:11px;padding:10px 13px;min-height:37px}.backup-preview{border:1px solid #d3e2c6;background:#fbfdf7;border-radius:13px;padding:20px;margin-top:21px}.preview-heading{display:flex;align-items:center;gap:10px;margin-bottom:18px}.preview-heading>view{flex:1;min-width:0}.preview-heading>view>text:first-child{font-size:12px;font-weight:550;display:block;color:#558047}.preview-heading>view>text:last-child{font-size:10px;display:block;color:#a0ae90;margin-top:5px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.incoming-counts{background:white;border:0;border-radius:8px;padding:14px 0;margin:10px 0 16px}.incoming-counts>view>text:first-child{font-size:23px}.backup-warning,.replace-note{display:flex;align-items:flex-start;gap:7px;font-size:11px;line-height:1.9;color:#a48b60;margin:12px 0}.backup-warning>.app-icon,.replace-note>.app-icon{margin-top:3px}.replace-note{color:#9ba98b;font-size:10px}.restore-backup{width:100%;margin-top:7px;justify-content:center}.backup-footnote{display:flex;align-items:flex-start;gap:9px;margin-top:24px;padding-top:18px;border-top:1px solid #edf1e5}.backup-footnote>.app-icon{margin-top:3px}.backup-footnote>view>text{display:block;font-size:10px;line-height:1.9;color:#9da990}.backup-footnote>view>text:last-child{margin-top:5px;color:#aeb89f}.backup-error{display:flex;gap:9px;align-items:flex-start;padding:15px;border:1px solid #efe0cb;background:#fff8ed;border-radius:9px;margin-top:18px}.backup-error>.app-icon{margin-top:3px}.backup-error>view>text:first-child{display:block;font-size:12px;color:#9c7c4b;font-weight:550}.backup-error>view>text:last-child{display:block;font-size:11px;color:#b09b79;line-height:1.9;margin-top:6px}.restore-success{text-align:center;padding:24px 0 30px}.restore-success>view{display:flex;align-items:center;justify-content:center;width:80px;height:80px;background:#e7f0dc;border-radius:25px;transform:rotate(-7deg);margin:0 auto 25px}.restore-success>text:first-of-type{display:block;font-size:20px;color:#548047;font-weight:550;line-height:1.8}.restore-success>text:last-of-type{display:block;font-size:12px;color:#9eaf8b;line-height:1.9;margin-top:12px}
@media(max-width:600px){.data-manager .modal-title{font-size:19px}.data-content{padding:22px 20px}.data-intro{gap:14px;padding-bottom:20px}.archive-mark{width:55px;height:59px;border-radius:14px}.data-intro-title{font-size:17px}.data-intro-caption{font-size:11px}.backup-counts{gap:3px;padding:17px 8px}.backup-counts>view>text:first-child{font-size:25px}.backup-counts>view>text:last-child{font-size:9px}.data-count-note{font-size:9px;margin-bottom:20px}.data-action-card{gap:10px;padding:17px 13px;flex-wrap:wrap}.data-action-icon{width:37px;height:39px;border-radius:10px}.data-action-copy>text:first-child{font-size:12px}.data-action-copy>text:last-child{font-size:10px}.data-action-card>.button{width:100%;margin-top:4px;min-height:39px}.backup-preview{padding:17px}.preview-heading>view>text:first-child{font-size:11px}.backup-footnote>view>text{font-size:10px}.backup-footnote>view>text:last-child{font-size:9px}.restore-success>text:first-of-type{font-size:18px}}
</style>
