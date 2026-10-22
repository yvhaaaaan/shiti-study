import type { Note, Paper, Question, ReviewRecord, StudyState } from './types'

export function localDate(value: Date = new Date()): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function dayOffset(offset: number, from: Date = new Date()): string {
  return localDate(new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset))
}

function atDay(offset: number, hour = 19, minute = 30): string {
  const date = new Date()
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset, hour, minute).toISOString()
}

/** Every reset creates dates relative to today, so the demo has usable due tasks. */
export function createSeedState(): StudyState {
  const questionData: Array<Omit<Question, 'createdAt' | 'updatedAt' | 'reviewCount' | 'organizationStatus'>> = [
    {
      id: 'q-math-001', title: '一元二次方程的因式分解', subject: '数学',
      stem: '解方程：x² − 5x + 6 = 0。', answer: 'x₁ = 2，x₂ = 3。',
      analysis: '先寻找乘积为 6、和为 −5 的两个数 −2 和 −3。原式可分解为 (x − 2)(x − 3) = 0，所以 x = 2 或 x = 3。注意检验两个根都满足原方程。\n\n易错提醒：只检查了两数乘积，忽略了一次项系数。',
      userAnswer: 'x₁ = 1，x₂ = 6。', tags: ['一元二次方程', '因式分解'], difficulty: '进阶', source: '数学周练 · 第 12 题',
      favorite: true, status: 'reinforce', images: [], nextReviewDate: dayOffset(0),
    },
    {
      id: 'q-math-002', title: '勾股定理中的斜边', subject: '数学',
      stem: '直角三角形的两条直角边长分别为 3 cm 和 4 cm，求斜边长。', answer: '5 cm。',
      analysis: '设斜边长为 c，根据勾股定理 c² = 3² + 4² = 25。长度取正值，因此 c = 5 cm。\n\n易错提醒：初次计算时把平方和误写成了边长和，已重新掌握。',
      userAnswer: '5 cm。', tags: ['勾股定理', '直角三角形'], difficulty: '基础', source: '课后练习 · 第 4 题',
      favorite: false, status: 'mastered', images: [],
    },
    {
      id: 'q-math-003', title: '不放回抽球的概率', subject: '数学',
      stem: '袋中有 3 个红球和 2 个蓝球。随机取出 1 个球后不放回，再取 1 个球。两次都取到红球的概率是多少？', answer: '3/10。',
      analysis: '第一次取红球的概率为 3/5。不放回后，袋中剩 4 个球，其中红球 2 个，第二次取红球的条件概率为 2/4。相乘得到 (3/5) × (2/4) = 3/10。\n\n易错提醒：把“不放回”误当成了“放回”，第二次仍使用 3/5。',
      userAnswer: '9/25。', tags: ['概率', '不放回抽样'], difficulty: '挑战', source: '单元测验 · 第 18 题',
      favorite: true, status: 'reinforce', images: [], nextReviewDate: dayOffset(0),
    },
    {
      id: 'q-math-004', title: '一次函数的自变量', subject: '数学',
      stem: '已知一次函数 y = 2x − 3，当 y = 5 时，求 x 的值。', answer: 'x = 4。',
      analysis: '把 y = 5 代入，得到 5 = 2x − 3。等式两边同时加 3 得 8 = 2x，再同时除以 2，得到 x = 4。\n\n易错提醒：移项时没有改变常数项符号。',
      userAnswer: 'x = 1。', tags: ['一次函数', '解方程'], difficulty: '基础', source: '课堂随练 · 第 7 题',
      favorite: false, status: 'reinforce', images: [], nextReviewDate: dayOffset(1),
    },
    {
      id: 'q-english-001', title: '一般现在时的被动语态', subject: '英语',
      stem: '用 clean 的适当形式填空：The classroom ______ every day.', answer: 'is cleaned',
      analysis: '主语 The classroom 是动作 clean 的承受者，因此使用被动语态。every day 表示习惯性动作，用一般现在时；单数主语搭配 is，结构为 is + 过去分词 cleaned。\n\n易错提醒：只关注时态，没有判断主语和动作的主动、被动关系。',
      userAnswer: 'cleans', tags: ['被动语态', '一般现在时'], difficulty: '进阶', source: '英语错题整理 · Unit 5',
      favorite: true, status: 'reinforce', images: [], nextReviewDate: dayOffset(0),
    },
    {
      id: 'q-english-002', title: 'since 与现在完成时', subject: '英语',
      stem: '用 live 的适当形式填空：I ______ in this city since 2019.', answer: 'have lived',
      analysis: 'since 2019 表示从过去某一时间开始并持续到现在。此处使用现在完成时，I 搭配 have，live 的过去分词为 lived。\n\n易错提醒：已能区分 since 的时间起点与 for 的持续时长。',
      userAnswer: 'have lived', tags: ['现在完成时', 'since / for'], difficulty: '基础', source: '英语周测 · 第 9 题',
      favorite: false, status: 'mastered', images: [],
    },
    {
      id: 'q-physics-001', title: '电功率的计算', subject: '物理',
      stem: '某用电器两端的电压为 6 V，通过它的电流为 0.5 A。求该用电器的电功率。', answer: '3 W。',
      analysis: '已知电压 U 和电流 I，直接用 P = UI。代入得到 P = 6 V × 0.5 A = 3 W。U/I 算出的是电阻，不能混用公式。\n\n易错提醒：混淆了电功率 P = UI 与电阻 R = U/I。',
      userAnswer: '12 W。', tags: ['电功率', '电学公式'], difficulty: '基础', source: '物理作业 · 第 6 题',
      favorite: false, status: 'reinforce', images: [], nextReviewDate: dayOffset(0),
    },
    {
      id: 'q-physics-002', title: '全程平均速度', subject: '物理',
      stem: '一名同学在前 10 s 跑了 80 m，在后 10 s 跑了 40 m。求他这 20 s 内的平均速度。', answer: '6 m/s。',
      analysis: '平均速度等于总路程除以总时间：v = (80 + 40)/(10 + 10) = 6 m/s。本题两段时间相等，分段速度的算术平均也恰好等于 6 m/s，但一般情形仍应使用总路程与总时间。\n\n易错提醒：只把分段速度相加，忘记计算全程平均速度。',
      userAnswer: '12 m/s。', tags: ['平均速度', '运动'], difficulty: '进阶', source: '期中复盘 · 第 10 题',
      favorite: false, status: 'reinforce', images: [], nextReviewDate: dayOffset(2),
    },
    {
      id: 'q-chemistry-001', title: '铁在氧气中燃烧的方程式配平', subject: '化学',
      stem: '铁在氧气中点燃生成四氧化三铁。配平下列反应式，并写出反应条件：Fe + O₂ → Fe₃O₄。', answer: '3Fe + 2O₂ → Fe₃O₄，反应条件为点燃。',
      analysis: '产物 Fe₃O₄ 中有 3 个铁原子、4 个氧原子。因此 Fe 前填 3、O₂ 前填 2，产物前为 1，左右各有 3 个铁原子与 4 个氧原子，反应条件标为点燃。配平只能修改系数，不能改变化学式中的下标。\n\n易错提醒：只尝试调整系数，没有逐项检查反应前后原子数。',
      userAnswer: '2Fe + 3O₂ → Fe₃O₄。', tags: ['化学方程式', '质量守恒'], difficulty: '进阶', source: '化学配平专项 · 第 3 题',
      favorite: false, status: 'reinforce', images: [], nextReviewDate: dayOffset(0),
    },
    {
      id: 'q-chinese-001', title: '辨析并修改成分残缺', subject: '语文',
      stem: '修改病句，保持原意：通过这次社会实践，使我更加理解了劳动的价值。', answer: '这次社会实践使我更加理解了劳动的价值。或：通过这次社会实践，我更加理解了劳动的价值。',
      analysis: '“通过……”是介词短语，与“使……”连用会使句子缺少主语。删去“通过”，由“这次社会实践”作主语；或删去“使”，由“我”作主语。任选一种即可。\n\n易错提醒：只把“使”换成“让”，没有解决主语缺失。',
      userAnswer: '通过这次社会实践，让我更加理解了劳动的价值。', tags: ['病句辨析', '成分残缺'], difficulty: '基础', source: '语文周练 · 第 2 题',
      favorite: false, status: 'reinforce', images: [], nextReviewDate: dayOffset(3),
    },
  ]

  const reviewSpecs: Array<[number, string, ReviewRecord['rating'], string]> = [
    [-6, 'q-math-001', 'wrong', 'x = 1 或 6'],
    [-6, 'q-english-001', 'wrong', 'cleans'],
    [-5, 'q-math-002', 'correct', '5 cm'],
    [-5, 'q-physics-001', 'wrong', '12 W'],
    [-4, 'q-math-003', 'wrong', '9/25'],
    [-4, 'q-math-001', 'correct', 'x = 2 或 3'],
    [-3, 'q-english-002', 'correct', 'have lived'],
    [-2, 'q-math-002', 'mastered', '5 cm'],
    [-2, 'q-physics-002', 'correct', '6 m/s'],
    [-1, 'q-english-001', 'correct', 'is cleaned'],
    [-1, 'q-chemistry-001', 'wrong', '2Fe + 3O₂ → Fe₃O₄'],
    [0, 'q-english-002', 'mastered', 'have lived'],
  ]
  const reviews: ReviewRecord[] = reviewSpecs.map(([offset, questionId, rating, answer], index) => ({
    id: `review-seed-${index + 1}`,
    requestId: `seed-request-${index + 1}`,
    questionId, answer, rating,
    reviewedAt: atDay(offset, offset === 0 ? 7 : 19, 10 + index),
  }))
  const questions: Question[] = questionData.map((question, index) => {
    const logs = reviews.filter((review) => review.questionId === question.id)
    return {
      ...question,
      organizationStatus: 'ready',
      createdAt: atDay(-12 + index, 17, 20),
      updatedAt: logs[logs.length - 1]?.reviewedAt ?? atDay(-12 + index, 17, 20),
      reviewCount: logs.length,
      lastReviewedAt: logs[logs.length - 1]?.reviewedAt,
    }
  })

  const noteData: Array<Omit<Note, 'createdAt' | 'updatedAt'>> = [
    { id: 'note-001', title: '因式分解：同时检查“和”与“积”', subject: '数学', questionIds: ['q-math-001'], content: '遇到 x² + bx + c，先寻找两个数 m、n，使 m + n = b、mn = c。\n\n检查顺序：\n1. 列出常数项的因数对。\n2. 根据一次项确定正负号。\n3. 展开验证，最后代根检验。\n\n例：x² − 5x + 6 = (x − 2)(x − 3)。不要只检查乘积！' },
    { id: 'note-002', title: '概率题先圈出“是否放回”', subject: '数学', questionIds: ['q-math-003'], content: '不放回抽样：每次抽完后，总数与目标数都会变化。\n\n解题时写出两个阶段的分子、分母，再相乘。3 红 2 蓝连续取两个红球：3/5 × 2/4 = 3/10。\n\n读题提醒：先圈“不放回”，再列样本数量。' },
    { id: 'note-003', title: '被动语态：先判断谁执行动作', subject: '英语', questionIds: ['q-english-001'], content: '一般现在时的被动语态：am / is / are + 过去分词。\n\n判断步骤：先找主语，再问“它是动作的执行者还是承受者？”\nThe classroom is cleaned every day. 教室承受打扫这一动作。\n\n再根据主语单复数与时间状语选择 be 动词的形式。' },
    { id: 'note-004', title: '电学公式要先认清物理量', subject: '物理', questionIds: ['q-physics-001'], content: '电功率：P = UI，单位 W。\n电阻：R = U/I，单位 Ω。\n电功：W = UIt，单位 J。\n\n先在题干旁标出已知量和所求量，再选公式；代入计算时写上单位，帮助发现公式用错。' },
    { id: 'note-005', title: '配平后逐个核对原子数', subject: '化学', questionIds: ['q-chemistry-001'], content: '配平时只改变化学式前面的系数，不能改变化学式中的下标。\n\n给定 Fe + O₂ → Fe₃O₄：右侧有 3 个铁原子、4 个氧原子，所以 Fe 前填 3、O₂ 前填 2，得到系数 3 : 2 : 1。最后逐个核对左右的原子数。\n\n铁在氧气中生成四氧化三铁的反应条件为点燃，书写方程式时别漏掉条件。' },
    { id: 'note-006', title: '“通过……使……”容易缺主语', subject: '语文', questionIds: ['q-chinese-001'], content: '看到“通过……使……”时，检查整句是否缺少主语。\n\n两种改法：\n① 去掉“通过”：这次实践使我理解了劳动的价值。\n② 去掉“使”：通过这次实践，我理解了劳动的价值。\n\n修改后重新读一遍，确认原意与语法都保留。' },
  ]
  const notes: Note[] = noteData.map((note, index) => ({ ...note, createdAt: atDay(-6 + index), updatedAt: atDay(-6 + index) }))
  const paperData: Array<Omit<Paper, 'createdAt' | 'updatedAt'>> = [
    { id: 'paper-001', title: '数学薄弱点 · 三题巩固', subject: '数学', questionIds: ['q-math-001', 'q-math-003', 'q-math-004'] },
    { id: 'paper-002', title: '周末复盘 · 基础专项', subject: '综合', questionIds: ['q-english-001', 'q-physics-001', 'q-chemistry-001', 'q-chinese-001'] },
  ]
  const papers: Paper[] = paperData.map((paper, index) => ({ ...paper, createdAt: atDay(-2 + index), updatedAt: atDay(-2 + index) }))
  return {
    version: 1,
    questions, notes, papers, reviews,
    profile: { nickname: '林同学', school: '青禾中学', grade: '初三', goal: '每天 20 分钟，把薄弱点学扎实。', avatarColor: '#3465e8' },
    storageError: null,
  }
}
