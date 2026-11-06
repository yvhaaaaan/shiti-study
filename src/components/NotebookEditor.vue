<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStudyStore } from '../domain/store'
import { NOTEBOOK_COVERS } from '../domain/notebooks'
import type { Notebook, NotebookAudience } from '../domain/types'
import AppIcon from './AppIcon.vue'
import NotebookCover from './NotebookCover.vue'
const props = defineProps<{ notebook?: Notebook; initialAudience?: NotebookAudience }>()
const emit = defineEmits<{ close: []; saved: [id: string]; deleted: [id: string] }>()
const store = useStudyStore()
const title = ref(props.notebook?.title || '')
const audience = ref<NotebookAudience>(props.notebook?.audience || props.initialAudience || 'general')
const coverId = ref(props.notebook?.coverId || NOTEBOOK_COVERS.find(item => item.audience === audience.value)!.id)
const subject = ref(props.notebook?.subject || '')
const busy = ref(false)
const error = ref('')
const createdId = ref(props.notebook?.id)
const directions: { id: NotebookAudience; label: string }[] = [{ id: 'k12', label: 'K12 课堂' }, { id: 'computer', label: '计算机学习' }, { id: 'civil', label: '考公备考' }, { id: 'general', label: '通用本子' }]
const covers = computed(() => NOTEBOOK_COVERS.filter(item => item.audience === audience.value))
function setAudience(value: NotebookAudience) {
  audience.value = value
  if (!covers.value.some(item => item.id === coverId.value)) coverId.value = covers.value[0]!.id
}
async function save() {
  if (busy.value) return
  if (!title.value.trim()) { error.value = '先给这本错题本起个名字吧。'; return }
  busy.value = true; error.value = ''
  try {
    const saved = store.saveNotebook({ ...(createdId.value ? { id: createdId.value } : {}), title: title.value.trim(), audience: audience.value, coverId: coverId.value, subject: subject.value.trim() })
    createdId.value = saved.id
    await store.flushPersistence()
    emit('saved', saved.id)
  } catch (e) { error.value = e instanceof Error ? e.message : '错题本未保存，请保留页面并重试。' }
  finally { busy.value = false }
}
function remove() {
  if (!props.notebook || busy.value) return
  uni.showModal({
    title: '删除这个空错题本？',
    content: '只有本内没有任何题目时才可以删除。删除后封面和本名将无法恢复。',
    confirmText: '删除空本',
    confirmColor: '#a05d45',
    success: async result => {
      if (!result.confirm || busy.value) return
      busy.value = true; error.value = ''
      try {
        store.deleteNotebook(props.notebook!.id)
        await store.flushPersistence()
        emit('deleted', props.notebook!.id)
      } catch (e) { error.value = e instanceof Error ? e.message : '删除未完成，请重试。' }
      finally { busy.value = false }
    },
  })
}
</script>
<template>
  <view class="modal-overlay notebook-editor-overlay" @tap.self="!busy && emit('close')"><view class="modal-window notebook-editor-window">
    <view class="modal-header"><view><text class="modal-title">{{ notebook ? '编辑错题本' : '建一个错题本' }}</text><text class="notebook-editor-subtitle">按自己的学习方式分类，封面和名字以后都能修改。</text></view><button class="icon-button" aria-label="关闭错题本编辑" :disabled="busy" @tap="emit('close')"><AppIcon name="x" /></button></view>
    <scroll-view scroll-y class="modal-scroll notebook-editor-scroll"><view class="notebook-editor-content">
      <view class="notebook-form"><text class="field-label">错题本名称</text><input v-model="title" class="form-input notebook-name-input" :disabled="busy" :maxlength="40" placeholder="例如：高三数学、数据结构、行测专项" aria-label="错题本名称" /><view class="notebook-name-hint"><text>可以按科目、考试或学习计划命名</text><text>{{ title.length }}/40</text></view>
      <text class="field-label">学习方向</text><view class="notebook-directions"><button v-for="direction in directions" :key="direction.id" :class="{ active: audience === direction.id }" :aria-pressed="audience === direction.id" :disabled="busy" @tap="setAudience(direction.id)">{{ direction.label }}</button></view>
      <view class="notebook-cover-label"><text class="field-label">选择封面</text><text>{{ covers.length }} 款</text></view>
      <view class="notebook-cover-grid"><button v-for="cover in covers" :key="cover.id" class="notebook-cover-option" :class="{ selected: coverId === cover.id }" :aria-label="`${cover.name}封面`" :aria-pressed="coverId === cover.id" :disabled="busy" @tap="coverId = cover.id"><NotebookCover :title="cover.name" :cover-id="cover.id" small /><view class="cover-option-caption"><text>{{ cover.name }}</text><text>{{ coverId === cover.id ? '✓' : '' }}</text></view></button></view>
      <text class="field-label">默认科目（选填）</text><input v-model="subject" class="form-input notebook-subject-input" :disabled="busy" :maxlength="20" placeholder="例如：数学、计算机、行测；也可以留空" aria-label="错题本默认科目" /><text class="notebook-subject-hint">收录时可作为分类提示，同一本子也能放不同科目的题。</text>
      </view><view class="notebook-preview"><text>封面预览</text><NotebookCover :title="title.trim() || '我的错题本'" :cover-id="coverId" /><text>空本也会保存在书架上，之后再慢慢收录。</text></view>
    </view></scroll-view>
    <view class="modal-footer notebook-editor-footer"><button v-if="notebook" class="delete-notebook" :disabled="busy" @tap="remove"><AppIcon name="trash-2" :size="15" tone="muted" /><text>删除空本</text></button><text v-if="error" class="notebook-save-error" role="alert">{{ error }}</text><view><button class="button button-quiet" :disabled="busy" @tap="emit('close')">取消</button><button class="button button-primary save-notebook" :disabled="busy || !title.trim()" @tap="save">{{ busy ? '正在保存…' : notebook ? '保存修改' : '创建错题本' }}</button></view></view>
  </view></view>
</template>
<style scoped>
.notebook-editor-overlay{z-index:700}.notebook-editor-window{width:980px;max-width:calc(100vw - 56px);max-height:calc(100vh - 64px);display:flex;flex-direction:column}.notebook-editor-subtitle{display:block;font-size:12px;color:#8a988d;margin-top:7px;line-height:1.7}.notebook-editor-scroll{height:0;flex:1;min-height:0}.notebook-editor-content{display:grid;grid-template-columns:minmax(0,1fr) 230px;gap:34px;padding:24px 28px 30px}.notebook-form{min-width:0}.notebook-form>.field-label:first-child{margin-top:0}.notebook-name-hint{display:flex;justify-content:space-between;gap:12px;font-size:11px;color:#9aa69a;margin-top:8px}.notebook-directions{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.notebook-directions>button{margin:0;background:#f0f4ee;color:#899b80;padding:10px 5px;border:1px solid transparent;border-radius:6px;font-size:12px;line-height:1.7}.notebook-directions>button.active{border-color:#9bad8d;background:#eaf2e4;color:#5b7748}.notebook-cover-label{display:flex;align-items:center;justify-content:space-between;color:#a0ac99;font-size:11px}.notebook-cover-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:17px 14px;padding-bottom:5px}.notebook-cover-option{display:block;background:transparent;margin:0;padding:4px;min-width:0;border:2px solid transparent;border-radius:10px;text-align:left}.notebook-cover-option.selected{border-color:#7e9b65;background:#f1f7eb}.cover-option-caption{display:flex;justify-content:space-between;gap:5px;font-size:11px;color:#829475;padding:10px 2px 3px}.cover-option-caption>text:last-child{color:#628448;font-weight:600}.notebook-subject-hint{display:block;font-size:11px;color:#98a68f;line-height:1.8;margin-top:9px}.notebook-preview{padding-top:4px;min-width:0}.notebook-preview>text:first-child{display:block;font-size:12px;color:#95a38b;margin-bottom:17px}.notebook-preview>text:last-child{display:block;font-size:11px;line-height:1.9;color:#a0ad97;margin-top:20px}.notebook-preview .book-jacket{width:100%}.notebook-editor-footer{display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap}.notebook-editor-footer>view{display:flex;justify-content:flex-end;gap:10px;margin-left:auto}.notebook-save-error{font-size:12px;line-height:1.8;color:#a77549;flex:1}.notebook-editor-footer .button{font-size:12px}.delete-notebook{display:flex;align-items:center;gap:6px;color:#9a796c;background:transparent;font-size:12px;padding:8px 0;margin:0}.delete-notebook:disabled{opacity:.55}.notebook-name-input,.notebook-subject-input{min-width:0}.notebook-cover-option::after,.notebook-directions>button::after{border:0}
@media(max-width:800px){.notebook-editor-content{grid-template-columns:minmax(0,1fr);gap:22px}.notebook-preview{display:none}.notebook-cover-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:600px){.notebook-editor-window{width:100%;max-width:100%;height:calc(100vh - 18px);max-height:calc(100vh - 18px);margin-top:auto;border-radius:15px 15px 0 0}.notebook-editor-overlay{padding:0}.notebook-editor-content{padding:19px 18px 25px}.notebook-editor-window .modal-header{padding:18px}.notebook-editor-subtitle{font-size:11px;max-width:270px}.notebook-directions{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.notebook-directions>button{font-size:12px;padding:9px}.notebook-cover-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 10px}.notebook-name-hint{font-size:10px}.notebook-editor-footer{padding:15px 18px!important}.notebook-save-error{flex-basis:100%}.notebook-editor-footer>view{width:100%}.notebook-editor-footer .button{flex:1}.notebook-cover-option{padding:3px}.cover-option-caption{font-size:11px}}
</style>
