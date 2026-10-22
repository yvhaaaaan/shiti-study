/**
 * Optional, hand-curated tag suggestions. Nothing in this catalogue infers a
 * question's knowledge points or adds tags to a user's question automatically.
 */
export interface TagGroup {
  id: string
  label: string
  tags: string[]
}

function group(id: string, label: string, tags: string[]): TagGroup {
  return { id, label, tags }
}

/** Shared suggestions remain available for a user's custom subject. */
export const TAG_GROUPS: TagGroup[] = [
  group('common-question-types', '题型', [
    '选择题', '填空题', '判断题', '简答题', '计算题', '证明题',
    '实验题', '材料分析题', '阅读理解', '写作题', '综合应用题', '编程题',
  ]),
  group('common-stages', '学段', ['小学', '初中', '高中', '大学', '备考']),
  group('common-methods', '解题方法', [
    '分类讨论', '数形结合', '建立等量关系', '控制变量', '比较分析', '因果分析',
    '归纳总结', '演绎推理', '图表解读', '模型建构', '实验探究', '反例检验',
  ]),
]

const civicsGroups: TagGroup[] = [
  group('civics-self-society', '成长与社会生活', [
    '认识自我', '情绪管理', '生命安全', '责任与担当', '规则与秩序',
    '诚信与友善', '个人与集体', '文化认同', '公共参与', '职业道德',
  ]),
  group('civics-law-politics', '法治与政治经济', [
    '宪法与公民权利', '权利与义务', '法治意识', '国家机构', '基本经济制度',
    '市场与政府', '经济全球化', '哲学基本问题', '唯物辩证法', '社会历史观',
  ]),
]

const computingGroups: TagGroup[] = [
  group('computing-literacy', '信息素养与应用', [
    '信息检索', '信息可信度', '数字公民', '隐私保护',
    '网络安全', '文档排版', '电子表格', '数字媒体',
  ]),
  group('computing-programming', '算法与程序设计', [
    '算法设计', '流程图', '变量与数据类型', '条件与循环',
    '函数与模块', '数组与字符串', '数据结构', '程序调试',
  ]),
  group('computing-systems', '系统与数据', [
    '计算机组成', '操作系统', '计算机网络', '数据库基础',
    '数据编码', '数据分析', '人工智能基础', '物联网',
  ]),
]

/**
 * Subject names match the preset subject list. 政治 / 道德与法治 and
 * 计算机 / 信息技术 share suggestions without changing a user's subject name.
 */
export const SUBJECT_TAG_GROUPS: Record<string, TagGroup[]> = {
  数学: [
    group('math-algebra', '数与代数', [
      '有理数', '实数', '整式', '分式', '一元一次方程', '二元一次方程组',
      '一元二次方程', '不等式与不等式组', '因式分解', '比例与百分数', '数列', '复数',
    ]),
    group('math-functions', '函数与分析', [
      '一次函数', '反比例函数', '二次函数', '函数性质', '指数函数',
      '对数函数', '三角函数', '导数', '定积分', '极限与连续',
    ]),
    group('math-geometry', '图形与几何', [
      '三角形', '全等与相似', '勾股定理', '四边形', '圆与切线', '图形变换',
      '平面向量', '直线与圆的方程', '圆锥曲线', '空间几何', '空间向量', '面积与体积',
    ]),
    group('math-probability', '统计与概率', [
      '数据整理', '平均数与中位数', '方差与标准差', '抽样方法',
      '排列组合', '古典概型', '条件概率', '随机变量',
    ]),
    group('math-foundations', '数学基础与大学专题', [
      '集合与逻辑', '命题与量词', '数学归纳法', '二项式定理',
      '线性代数', '多元微积分', '常微分方程', '离散数学',
    ]),
  ],
  英语: [
    group('english-grammar', '语法结构', [
      '时态', '语态', '主谓一致', '名词性从句', '定语从句', '状语从句',
      '非谓语动词', '情态动词', '虚拟语气', '倒装句', '强调句', '比较结构',
    ]),
    group('english-vocabulary', '词汇与句子', [
      '名词', '代词', '冠词', '介词', '连词', '形容词与副词',
      '动词短语', '固定搭配', '词形变化', '构词法', '词义辨析', '句子成分',
    ]),
    group('english-reading', '阅读与语篇', [
      '主旨大意', '细节定位', '推理判断', '词义猜测', '篇章结构',
      '指代关系', '语篇衔接', '完形填空', '七选五', '语法填空',
    ]),
    group('english-expression', '听说与写作', [
      '语音与重音', '听力信息提取', '口语交际', '应用文写作', '读后续写',
      '议论文写作', '段落组织', '句式改写', '中英翻译', '书面表达规范',
    ]),
  ],
  物理: [
    group('physics-mechanics', '运动与力', [
      '长度与时间测量', '速度与加速度', '匀变速直线运动', '力的合成与分解',
      '牛顿运动定律', '摩擦力', '压强', '浮力', '功与机械能',
      '动量与冲量', '曲线运动', '万有引力',
    ]),
    group('physics-electricity', '电与磁', [
      '电路连接', '欧姆定律', '电功率', '电能与焦耳定律', '电场',
      '电势与电容', '磁场', '安培力与洛伦兹力', '电磁感应', '交变电流',
    ]),
    group('physics-waves', '光、声与波', [
      '声音的产生与传播', '光的反射', '光的折射', '透镜成像', '机械振动',
      '机械波', '波的干涉与衍射', '电磁波', '光电效应',
    ]),
    group('physics-thermal-experiments', '热学与实验', [
      '物态变化', '内能与比热容', '热力学定律', '分子动理论', '原子与原子核',
      '实验误差', '力学实验', '电学实验', '物理图像',
    ]),
  ],
  化学: [
    group('chemistry-foundations', '物质与结构', [
      '物质分类', '元素与元素周期表', '原子结构', '化学键', '化合价',
      '化学式', '物质的量', '离子反应', '氧化还原反应', '化学方程式配平',
    ]),
    group('chemistry-inorganic', '常见物质', [
      '氧气与二氧化碳', '水与溶液', '金属与合金', '金属活动性', '酸碱盐',
      '常见气体', '卤素与卤化物', '硫及其化合物', '氮及其化合物', '硅及其化合物',
    ]),
    group('chemistry-reactions', '反应与计算', [
      '质量守恒定律', '溶解度', '溶液浓度', '化学计量计算', '反应热',
      '化学反应速率', '化学平衡', '电离平衡', '盐类水解', '电化学',
    ]),
    group('chemistry-organic-lab', '有机与实验', [
      '有机物命名', '官能团', '同分异构体', '有机反应类型', '高分子化合物',
      '实验仪器', '物质检验', '物质分离与提纯', '滴定实验', '实验安全',
    ]),
  ],
  语文: [
    group('chinese-language', '语言基础', [
      '字音字形', '词语运用', '成语辨析', '病句辨析', '标点符号', '句子衔接',
      '修辞手法', '语言得体', '语段压缩', '图文转换', '文学常识', '名句默写',
    ]),
    group('chinese-classics', '古诗文', [
      '文言实词', '文言虚词', '文言句式', '词类活用', '古今异义',
      '文言翻译', '诗歌意象', '诗歌情感', '诗歌表达技巧', '古代文化常识',
    ]),
    group('chinese-reading', '现代文阅读', [
      '记叙文阅读', '说明文阅读', '议论文阅读', '小说阅读', '散文阅读',
      '人物形象', '叙事视角', '文本结构', '论证方法', '信息筛选与整合',
    ]),
    group('chinese-writing', '表达与写作', [
      '审题立意', '材料组织', '作文结构', '细节描写', '叙议结合',
      '论据运用', '开头与结尾', '应用文格式', '整本书阅读', '口语表达',
    ]),
  ],
  生物: [
    group('biology-cells', '细胞与生命活动', [
      '细胞结构', '细胞膜运输', '酶与ATP', '细胞呼吸',
      '光合作用', '细胞分裂', '细胞分化', '显微镜使用',
    ]),
    group('biology-genetics', '遗传与进化', [
      'DNA与基因', '基因表达', '孟德尔遗传规律', '伴性遗传',
      '遗传变异', '生物育种', '生物进化', '遗传图谱',
    ]),
    group('biology-life-ecology', '人体、调节与生态', [
      '人体营养与消化', '呼吸与循环', '神经调节', '体液调节',
      '免疫调节', '植物激素', '种群与群落', '生态系统',
    ]),
  ],
  历史: [
    group('history-china-ancient', '中国古代史', [
      '早期文明', '先秦制度与思想', '秦汉统一', '魏晋南北朝',
      '隋唐制度', '宋元经济与社会', '明清国家治理', '古代科技与文化',
    ]),
    group('history-china-modern', '中国近现代史', [
      '近代民族危机', '近代化探索', '辛亥革命', '新民主主义革命',
      '中华人民共和国成立', '社会主义建设', '改革开放', '近现代社会生活',
    ]),
    group('history-world-methods', '世界史与史学方法', [
      '世界古代文明', '文艺复兴与启蒙运动', '工业革命', '世界大战',
      '冷战与世界格局', '史料辨析', '历史时序', '历史因果解释',
    ]),
  ],
  地理: [
    group('geography-physical', '自然地理', [
      '地球与地图', '地球运动', '天气与气候', '大气环流',
      '水循环', '洋流', '地貌与地质作用', '自然地理整体性',
    ]),
    group('geography-human', '人文地理', [
      '人口与城市', '农业区位', '工业区位', '交通运输布局',
      '服务业区位', '区域发展', '资源与环境', '可持续发展',
    ]),
    group('geography-regional', '区域与地理技能', [
      '中国地理', '世界地理', '经纬网定位', '等高线判读',
      '气候图判读', '地理统计图', '地理信息技术', '地理野外考察',
    ]),
  ],
  道德与法治: civicsGroups,
  政治: civicsGroups,
  科学: [
    group('science-matter-energy', '物质与能量', [
      '物质的性质', '物质的变化', '混合物分离', '热的传递',
      '简单机械', '能量转换', '电与磁现象',
    ]),
    group('science-life-earth', '生命、地球与宇宙', [
      '动植物分类', '生物与环境', '生命的周期', '人体健康',
      '地球圈层', '太阳系', '月相与日月食',
    ]),
    group('science-investigation', '科学探究', [
      '提出科学问题', '作出假设', '设计对照实验',
      '观察与测量', '整理实验数据', '解释实验现象',
    ]),
  ],
  信息技术: computingGroups,
  计算机: computingGroups,
  通用技术: [
    group('technology-design', '技术与设计', [
      '技术与社会', '设计的一般过程', '设计需求分析', '设计方案构思', '技术图样',
      '材料与加工', '模型制作', '技术试验', '设计评价', '知识产权',
    ]),
    group('technology-systems', '结构、流程与控制', [
      '结构与稳定性', '结构强度', '流程设计', '流程优化',
      '系统分析', '系统优化', '控制系统', '传感器应用',
    ]),
  ],
  专业课: [
    group('professional-foundations', '专业基础', [
      '专业术语', '核心原理', '专业公式', '专业理论', '学科发展史', '文献阅读',
    ]),
    group('professional-application', '应用与实践', [
      '案例分析', '实务操作', '工艺流程', '工程计算', '专业实验', '项目实践',
    ]),
    group('professional-assessment', '综合与规范', [
      '专业规范', '职业伦理', '方案论证', '研究方法', '实践报告', '专业综合题',
    ]),
  ],
  其他: [
    group('other-learning', '学习主题', [
      '跨学科主题', '生活实践', '劳动教育', '艺术鉴赏',
      '体育与健康', '心理健康', '职业规划', '社会调查',
    ]),
    group('other-skills', '通用学习技能', [
      '资料搜集', '概念辨析', '证据评价', '逻辑论证',
      '问题拆解', '方案比较', '过程记录', '成果表达',
    ]),
  ],
}

const SUBJECT_ALIASES: Record<string, string> = {
  生物学: '生物',
  道法: '道德与法治',
  '道德与法治/政治': '道德与法治',
  思想政治: '政治',
  '信息技术/计算机': '信息技术',
  计算机科学: '计算机',
}

/**
 * Read suggestions for a subject, followed by the shared groups. Every call
 * returns fresh group objects and tag arrays, so UI selection/filtering cannot
 * mutate the catalogue or another subject's shared suggestions.
 */
export function getTagGroups(subject: string): TagGroup[] {
  const name = subject.trim()
  const key = Object.prototype.hasOwnProperty.call(SUBJECT_ALIASES, name) ? SUBJECT_ALIASES[name]! : name
  const subjectGroups = Object.prototype.hasOwnProperty.call(SUBJECT_TAG_GROUPS, key) ? SUBJECT_TAG_GROUPS[key]! : []
  return [...subjectGroups, ...TAG_GROUPS].map(item => ({
    id: item.id,
    label: item.label,
    tags: [...item.tags],
  }))
}
