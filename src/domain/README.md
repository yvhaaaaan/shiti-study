# 打铁匠数据层

`useStudyStore()` 返回共享 Vue 响应式单例。页面通过方法修改状态，并等待 `flushPersistence()` 后显示保存成功；不要直接改动 `state`。当前生效的产品规则见 [产品逻辑设计](../../docs/产品逻辑设计.md)。

## 状态与边界

- `state` 包含 `notebooks / questions / notes / papers / reviews / profile`，数据版本仍为 1。
- `notebooks`、`questions`、`pendingQuestions`、`readyQuestions`、`practiceQuestions`、`notes`、`papers`、`availableSubjects`、`dueQuestions`、`stats` 是 computed，在 script 中使用 `.value`。
- H5 通过 `studyStorage.ts` 写入本地 IndexedDB，或在云端模式使用服务端档案；旧 `shiti.study.v1` 同步存储用于兼容迁移。小程序使用本地存储适配器。
- 存储失败时保留内存修改并显示错误，不能宣称已持久化。完整导入先校验并写入成功，再替换内存。
- 计划日期为设备本地 `YYYY-MM-DD`，创建/修改和历史记录使用 ISO 时间戳。`studyDay` 与 `refreshDay()` 用于跨日刷新。

## 自建错题本

`Notebook` 字段为 `{id,title,audience,coverId,subject,createdAt,updatedAt,automatic?}`；`audience` 为 `k12 | computer | civil | general`。`subject` 可空，仅用于默认学科建议，不能限制成员题目的学科。

`NOTEBOOK_COVERS` 位于 `notebooks.ts`，包含 K12 6 种、计算机 5 种、考公 3 种、通用 4 种封面。`notebookCover(id)` 返回封面视觉元数据，`normalizeNotebook()` 统一校验。

题目的 `notebookId` 是实际归属，与 `subject` 独立。旧题无归属时通过 `migrateNotebooks()` 按学科生成确定 ID 的默认本；空本、自建本和已有归属保留。自动待分类题完成整理后可迁至学科默认本，明确选择的自建本不随学科变化迁移。细节见 [自建错题本](../../docs/自建错题本.md)。

## 方法

| 方法 | 行为 |
| --- | --- |
| `saveNotebook({id?,title,audience,coverId,subject?})` | 无 ID 创建空本，有 ID 改名/换封面/修改默认科目；名称最多 40 字，返回 Notebook。 |
| `deleteNotebook(id)` | 只有本内没有任何题目（包括回收站题目）时才删除；否则抛错并保持原状态。 |
| `moveQuestionsToNotebook(ids, notebookId)` | 整批校验后移动未删除题目，只改归属，不重置锻造。 |
| `addQuestion(input)` / `addQuestions(inputs)` | 题干或图片至少一项。指定 notebookId 时校验目标存在；未指定时按科目自动归档。批量校验全部通过后才修改数据。 |
| `updateQuestion(id, patch)` | 更新原题；题干、答案、原图实质改变时归档旧测试。科目改变后不匹配的关联单科卷转为综合。仅改归属、标题、备注或复盘不重置进度。 |
| `toggleFavorite` / `deleteQuestion` / `restoreQuestion` | 收藏或软删除/恢复，不级联删除错题本、历史、笔记及试卷引用。 |
| `submitReview(id, input, now?)` | 校验判题证据、内容快照和阶段；相同 requestId 重试不重复记数。expectedContent 与当前题目不一致时拒绝旧判题结果；云端提交传入服务器时间。 |
| `setPlan(id, date?)` | 设置或取消提醒，不修改锻造完成状态。 |
| `saveNote(input)` / `deleteNote(id)` | 管理知识笔记与题目关联；标题必填，文字或附图至少一项。 |
| `savePaper(input)` | 新选题必须已整理且未删除；原卷已有的暂不可用引用可保留。单科有效题必须匹配，跨科使用综合。 |
| `updateProfile(patch)` | 更新允许的个人资料字段。 |
| `resetDemo()` | 替换为示例资料，包含迁移后的默认错题本；界面需明确告知覆盖行为。 |
| `exportBackup()` / `validateBackup(json)` / `importBackup(json)` | 完整导出、无副作用校验、原子替换式恢复。counts 包含 notebooks。 |

调用方需要捕获中文 Error，并在必须确认持久化的操作后等待 `flushPersistence()`。

## 整理、测试与锻造

整理状态 `pending | ready`、测试资格和五阶进度是三件独立的事。已整理题目允许暂缺答案，可以记复盘、组卷和打印；未删除、已整理且有参考答案的题才进入 `practiceQuestions`。

当前规则是**同一道题累计五次明确判题通过**完成锻造，不是五种能力任务。允许同日完成，不要求连续正确，无强制心得、变式题或隔天门槛。答错不扣已通过次数；完成后仍可额外巩固，进度上限五阶。`status` 由当前有效通过记录派生，不能由输入手工标成 mastered。

新记录通过 `forge.assessment` 保存判题结果、方式、反馈与锁定作答。历史自评和 `retired` 的旧题版本不计入新进度。`questionSnapshot` 保存当时题干、答案、解析和原图，不能被后续编辑改写。

本地只可靠核对简单选项或数值；题目明确要求步骤/证明/解释，或包含原图时使用 AI 辅助核验，无法判断不升级。详见 [测试与锻造](../../docs/测试与锻造.md)。

提醒不限制随时测试。提交测试会消耗到期提醒；已有未来提醒与本次推荐未来日期取较早者，第五次通过不抹掉原有未来提醒。

## 备份与迁移

格式为 `{format:'shiti-backup',schemaVersion:1,exportedAt,data:{version:1,notebooks,questions,notes,papers,reviews,profile}}`，不导出 storageError。`BackupCounts` 为 `{notebooks,questions,notes,papers,reviews}`。

- 上限 50 MB UTF-8、2000 本错题本、10000 道题、5000 篇笔记、2000 份试卷、50000 条历史。
- 旧备份无 notebooks、旧题无 notebookId 时按科目迁移，不丢题、不重复建本。新数据显式引用不存在的本子、无效封面、重复 ID 或非法引用时整份拒绝。
- 空本和回收站题目的归属一起保存。统计恢复预览必须展示错题本数量。
- 仅白名单重建字段；历史次数与完成状态重新计算，旧记录无题面快照仍保留，不倒填伪造快照。
- data URI 图片随 JSON 保存；外链和本地路径按引用保存，本地/临时路径可能在换设备后失效，恢复界面需要展示校验结果中的图片提示。
- 恢复是整份替换，不自动合并。校验和存储写入成功后才替换内存；失败不覆盖当前档案。

## 统计

`stats` 包含题目总数、整理数、到期数、收藏数、五阶完成数、测试活动、连续学习天数、学科分布等。

- 普通常规统计只计算未删除题目；学科/完成率只使用已整理题。
- `dueToday` 为今天或已逾期且具备测试条件的提醒，五阶完成题主动设提醒后也可到期。
- `accuracy` 仅使用当前有效、明确判题且未 retired 的测试记录。旧自评不算测试通过率。
- 活动次数和近七天历史保留真实发生的旧行为；它们与当前版本的测试通过率口径不同。
- 五阶完成是练习成就，不等价于永久理解程度；个人复盘不是系统评分。

## 验证

`npm run verify:notebooks` 验证空本、封面、归属、迁移和备份；`npm run verify:forge` 验证次数、版本、提醒与引用一致性；`npm run verify:assessment` 验证判题路由和协议。
