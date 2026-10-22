# 拾题数据层

`useStudyStore()` 返回跨页面共享的 Vue 响应式单例。`state` 是 reactive 对象；`questions`、`pendingQuestions`、`readyQuestions`、`notes`、`papers`、`availableSubjects`、`dueQuestions`、`stats` 为 computed，在 script 中用 `.value` 访问。不要直接改动状态，统一使用方法，以便写入本地存储。

## 持久化与边界

- 使用 `uni.getStorageSync` / `uni.setStorageSync`，key 为 `shiti.study.v1`；不依赖 DOM 或 `localStorage`。
- 初次打开与 `resetDemo()` 载入 10 道错题、6 篇知识笔记、2 份练习卷、12 条真实可核对的复习记录，近 7 天每天均有记录，今天有 5 道到期题。
- 示例日期相对设备本地自然日生成，复习计划为 `YYYY-MM-DD`；不使用 UTC 截取日期。创建/更新时间为 ISO 时间戳。
- `state.storageError` 为存储失败提示；失败时本次修改继续保留在内存中，不宣称已持久化。
- 题目图片数组保存跨端可读的路径。录入页应先用 `uni.saveFile` 或上传后获得可持久访问的地址，再传 `images`；临时选择路径并不保证重启后有效。
- 学习档案保存在本设备；题目解析统一写入 analysis，MiMo 生成请求与结果确认由上层界面处理。数据层不实现登录、云同步或自动排期。

## 方法

| 方法 | 参数与行为 |
| --- | --- |
| `addQuestion(input)` | 题干 `stem` 或有效 `images` 至少有一项。快速采集显式传 `organizationStatus:'pending',subject:'',difficulty:''`；已整理题传 ready 且必须选择科目、难度。答案、解析和标签均可空；纯图片题默认标题为“图片错题”。返回新 Question。 |
| `updateQuestion(id, patch)` | 更新可编辑字段，保留 id、创建时间、历史次数；返回 Question。 |
| `remark` / `remarkImages` | 每道题的选填补充说明，最多 5000 字、6 张独立附图。旧题和旧备份缺少时默认空值；完整备份包含附图。 |
| `toggleFavorite(id)` | 切换收藏，返回 Question。 |
| `deleteQuestion(id)` | 设置 deletedAt，进入回收站。不会级联删除笔记、练习卷或历史。 |
| `restoreQuestion(id)` | 清除 deletedAt，恢复原有收藏、计划和关联。回收站由 `state.questions.filter(q => q.deletedAt)` 获取。 |
| `submitReview(id, {answer, rating, requestId, planDate?})` | rating 为 wrong / correct / mastered。requestId 每次用户提交唯一，重试复用，重复请求不重复计数。wrong、correct 都回到待巩固；mastered 退出计划。提交会消耗当前计划，只有显式传入 planDate 才设置下次日期。 |
| `setPlan(id, date)` | 仅已整理题可设置日期；null / undefined / 空串清除计划。为已掌握题设置日期时，会将其恢复为待巩固。 |
| `saveNote({id?,title,subject,content,images?,questionIds?})` | 无 id 新建，有 id 更新；返回 Note。标题必填，文字与附图至少一项。每篇最多 6 张附图，更新时未传 images 会保留已有图片。 |
| `deleteNote(id)` | 删除指定笔记。 |
| `savePaper({id?,title,subject,questionIds})` | subject 为单一学科或“综合”；去掉重复、已删除、无效题目，至少保留一道。待处理题不能加入试卷；单科卷只接受该科题目。返回 Paper。 |
| `updateProfile(patch)` | 可改 nickname / school / grade / goal / avatarColor；返回 Profile。 |
| `resetDemo()` | 用相对今天的新示例覆盖全部本地数据，界面应先明确告知。 |
| `exportBackup()` | 返回 JSON 字符串，包含全部题目（含回收站）、笔记、练习卷、复习记录和个人资料；先按恢复规则校验。 |
| `validateBackup(json)` | 无副作用地返回 `{counts:{questions,notes,papers,reviews},warnings,localImageCount,data}`。data 是独立、校验后的完整状态。 |
| `importBackup(json)` | 再次全量校验，先一次性写入存储，成功后整份替换状态；返回上述 counts。失败抛中文 Error，不改变原有状态。 |

方法校验失败会抛出中文 `Error`，调用方应以 toast 等组件展示 `error.message`。软删除题目仍保留在 `state.questions`；常规列表和复习入口使用 `questions.value`。笔记与试卷展示关联题时应过滤已删除题目，并可提示“部分题目在回收站”。

## JSON 备份与恢复

格式为 `{format:"shiti-backup",schemaVersion:1,exportedAt,data:{version:1,questions,notes,papers,reviews,profile}}`，不导出 storageError。仅支持整份替换，不合并异号记录。恢复界面先调用 validateBackup 展示条数和图片警告，再明确询问“将覆盖当前设备的全部题目、笔记、练习卷、复习记录和个人资料，不合并；是否继续？”。获得用户确认后才调用 importBackup；data 预览对象不能代替原 JSON，导入时仍会重新校验。

- 上限为 UTF-8 总大小 10 MB，10000 道题、5000 篇笔记、2000 份练习卷、50000 条复习记录。
- 全量检查字段类型、枚举、有效日期、重复实体 ID/提交标识、快照、图片格式及题目引用。引用回收站题目有效；不存在的引用使整份备份校验失败，不会悄悄删除关联。
- 仅按字段白名单重建对象；不将文件的任意属性复制进状态。复习次数和最后复习时间从记录重算；旧记录没有快照仍合法。
- data URI 图片内容直接包含在 JSON 中；HTTPS/HTTP 外链保留 URL，不下载图片。本机文件、wxfile、blob、相对路径仅保存路径，并计入 localImageCount（题目与快照合计按路径去重）。这些文件不会随 JSON 移动，跨设备可能不可用；临时路径另行提示失效风险。
- 恢复不使用会吞掉存储错误的常规 persist。完整解析和校验成功后执行一次 setStorageSync，再替换内存；存储失败时抛错且保持旧内存数据，界面不能提示恢复成功。
- 备份保留 organizationStatus、organizedAt 及待处理题的空科目/难度。旧题没有整理状态时按 ready 恢复，不升级版本。待处理题若携带复习计划或整理完成时间，则整份校验失败；旧历史/题单引用保留，后续学习和导出仍按已整理状态拦截。

## 快速采集与后续整理

`Question.organizationStatus` 为 `pending | ready`，与 `status: reinforce | mastered` 独立。快速采集只要求题干或图片，不补填科目、难度、答案、解析、标签，也不自动安排日期。待处理题可保存部分整理进度，未选择的科目和难度保留空串。

完成整理用 `updateQuestion(id,{...,organizationStatus:'ready'})` 更新原题，保留 id 与 createdAt。必须选择有效科目及难度，答案与解析可以稍后手动完善，无需调用 AI。pending 转 ready 时 organizedAt 取本次时间，并清除任何旧的逾期计划；之后由用户手动安排复习。旧题缺少 organizationStatus 视为 ready，既有计划保持原样。

`pendingQuestions`、`readyQuestions` 均排除回收站。`stats.total` 包含两类题，`stats.pending`、`stats.ready` 分别计数；复习、科目分布、待巩固/已掌握、连续复习及正确率仅统计 ready。收藏与按收录日汇总仍包含全部题。setPlan、submitReview、savePaper 和 Word 导出拦截待处理题，防止未整理题进入练习。已有历史和关联不因暂存整理进度而删除。

## 学科与标签

预设学科按顺序为数学、英语、物理、化学、语文、生物、历史、地理、道德与法治、政治、科学、信息技术、通用技术、计算机、专业课、其他。另允许最多 20 个字的自定义学科名，去除首尾空白，不允许换行或控制字符；“全部”保留作筛选，“综合”仅用于跨学科组卷，不能作为普通题目或笔记的学科。

`availableSubjects.value` 汇总预设及全部题目（含回收站）、笔记、练习卷实际使用的合法科目，去重且不包含“综合”；`subjectCounts` 同步包含这些科目，视图可过滤 total 为 0 的项。

公共工具 `taxonomy.ts`：`SUBJECT_MAX_LENGTH = 20`、`MAX_TAGS = 30`、`MAX_TAG_LENGTH = 32`，以及 `isValidSubject`、`normalizeSubject`、`normalizePaperSubject`、`parseTags`、`normalizeTags`。

- `parseTags(string | readonly string[])` 按中英文逗号、顿号、分号和换行拆分，去除首尾空白、空项与重复项；不拆分空格或斜线，保留“since / for”等历史标签。
- `normalizeTags(value?)` 在拆分后验证每题最多 30 个标签、每个最多 32 个字；超限抛中文错误，不静默截断。
- 题目新增、编辑、存储重载与备份恢复使用同一套学科/标签规则。旧 1 版 JSON 无需升级版本，原五科及合法历史标签继续可用。
- `src/utils/draft.ts` 使用相同学科校验，并允许科目、难度为空；支持自定义科目及待处理编辑进度。草稿保留标签输入原字符串，最终保存题目时再校验标签数量与长度。草稿表单不存整理状态，由编辑入口根据原题决定暂存或完成整理，旧草稿无需迁移。
- 错因字段已移除：旧 1 版设备数据、草稿或 JSON 中的 cause 会被忽略并剥离，其余已支持字段保持原值；不会因此触发版本失败。新题目、草稿、JSON 和 Word 导出均不包含该字段。预设标签目录移除“错因 / 复盘”组，用户原有同名自由标签继续保留。

## 类型和统计

`Question` 基础字段按项目约定，另有 `organizationStatus`、`organizedAt?`、`reviewCount` 和 `lastReviewedAt?`；difficulty 为 `Difficulty | ''`，空值仅供待处理题使用。`Note`、`Paper` 包含 `createdAt`、`updatedAt`。完整导出见 `types.ts`。

`state.reviews` 元素为 `{id, requestId, questionId, answer, rating, reviewedAt, planDate?, questionSnapshot?}`。新复习记录同时保存当次题面快照 `{title, stem, answer, analysis, images}`；快照与题目的图片数组不共享引用，快照对象及图片数组均冻结，题目后来编辑不会改写历史上下文。存储重载后仍恢复为独立、冻结的快照。

旧示例及旧本地记录允许没有 `questionSnapshot`，不会用当前题目倒填历史。界面回看这类记录时应明确提示“旧记录无题面快照”；有快照时展示快照内容。回收站题目的历史仍保留，但不参与统计；恢复题目后，相应历史重新参与统计。

`stats.value`：`total / pending / ready / reinforce / mastered / favorites / dueToday / reviewCount / todayReviewCount / accuracy / streak / noteCount / paperCount / subjectCounts / weeklyHistory`。

- total / pending / ready / favorites 只计算未删除题目；reinforce / mastered 只计算其中已整理的题目。
- dueToday 包含今天与逾期计划，不包含已掌握或已删除题目。
- reviewCount / todayReviewCount / accuracy / streak / weeklyHistory 中的复习数据仅使用未删除、已整理题目的有效记录。accuracy 为这些记录中非 wrong 的百分比（0–100），不是系统自动判卷结果。
- streak 为截至今天或昨天的连续复习自然日；今日尚未复习不会在白天直接清零。
- subjectCounts 为 `[{subject,total,reinforce,mastered}]`，含预设和实际使用的自定义学科。
- weeklyHistory 为近 7 个本地自然日 `[{date,label,reviewed,correct,wrong,mastered,added}]`；correct 包含 mastered，added 为当前未删除题目在该日的收录数量。
- 知识掌握情况依赖用户自评，不使用自动判题或未经验证的 AI 评分。
