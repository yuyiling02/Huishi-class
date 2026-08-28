export type ModelInfoCategory = '化学' | '生物' | '地理';

export interface ModelInfoMetric {
  label: string;
  value: string;
}

export interface ModelInfoTip {
  title: string;
  content: string;
}

export interface ModelInfoProfile {
  seedKey: string;
  category: ModelInfoCategory;
  title: string;
  subtitle: string;
  description: string;
  illustration: string;
  metrics: ModelInfoMetric[];
  tips: [ModelInfoTip, ModelInfoTip];
  capabilities: {
    organTools: boolean;
  };
}

const organProfile = (
  seedKey: string,
  title: string,
  subtitle: string,
  description: string,
  illustrationName: string,
  metrics: ModelInfoMetric[],
  medical: string,
  funFact: string,
): ModelInfoProfile => ({
  seedKey,
  category: '生物',
  title,
  subtitle,
  description,
  illustration: `/images/model-info/organs/${illustrationName}.webp`,
  metrics,
  tips: [
    { title: '医学提示', content: medical },
    { title: '你知道吗', content: funFact },
  ],
  capabilities: { organTools: true },
});

export const MODEL_INFO_PROFILES: Record<string, ModelInfoProfile> = {
  'chem-diamond': {
    seedKey: 'chem-diamond', category: '化学', title: '金刚石模型', subtitle: '碳原子织成的坚硬星网',
    description: '每个碳原子以四面体方式连接四个相邻碳原子，形成延伸至整个晶体的三维共价网络。',
    illustration: '/images/diamond-structure.png',
    metrics: [
      { label: '化学组成', value: 'C' }, { label: '杂化方式', value: 'sp³' },
      { label: '配位数', value: '4' }, { label: '晶体类型', value: '共价晶体' },
    ],
    tips: [
      { title: '结构提示', content: '强共价键遍布整个晶格，使金刚石具有极高硬度。' },
      { title: '性质联系', content: '价电子被束缚在共价键中，因此纯金刚石通常不导电。' },
    ], capabilities: { organTools: false },
  },
  'chem-diamond-cell': {
    seedKey: 'chem-diamond-cell', category: '化学', title: '金刚石晶胞', subtitle: '在最小重复单元中看见秩序',
    description: '金刚石立方晶胞由两个相互穿插的面心立方子晶格构成，可用于理解宏观晶体如何由周期性单元重复生成。',
    illustration: '/images/diamond-structure.png',
    metrics: [
      { label: '晶系', value: '立方晶系' }, { label: '常规晶胞原子数', value: '8' },
      { label: '配位构型', value: '正四面体' }, { label: '重复方式', value: '三维周期' },
    ],
    tips: [
      { title: '观察提示', content: '转动晶胞，辨认顶点、面心和晶胞内部原子的空间关系。' },
      { title: '计数提示', content: '晶胞边界上的原子会与相邻晶胞共享，计数时要按占有比例折算。' },
    ], capabilities: { organTools: false },
  },
  'chem-dichlorotoluene': {
    seedKey: 'chem-dichlorotoluene', category: '化学', title: '1,4-二氯甲基苯', subtitle: '取代基在芳香环上遥相呼应',
    description: '该分子以苯环为骨架，两个含氯甲基取代基处在对位；三维模型可帮助辨认键角、空间朝向与分子对称性。',
    illustration: '/images/dichlorotoluene-structure.png',
    metrics: [
      { label: '核心骨架', value: '苯环' }, { label: '取代位置', value: '1,4-对位' },
      { label: '元素组成', value: 'C、H、Cl' }, { label: '模型重点', value: '空间构型' },
    ],
    tips: [
      { title: '结构提示', content: '苯环整体近似平面，环上碳原子主要呈 sp² 杂化。' },
      { title: '观察建议', content: '从环平面上方观察，更容易比较两个取代基的相对位置。' },
    ], capabilities: { organTools: false },
  },
  'chem-nitrobenzene': {
    seedKey: 'chem-nitrobenzene', category: '化学', title: '硝基苯', subtitle: '芳香环与强吸电子基的相遇',
    description: '硝基苯由一个硝基连接苯环构成，是理解芳香取代效应、电子离域和官能团性质的典型分子。',
    illustration: '/images/nitrobenzene-structure.svg',
    metrics: [
      { label: '分子式', value: 'C₆H₅NO₂' }, { label: '官能团', value: '硝基' },
      { label: '母体结构', value: '苯' }, { label: '电子效应', value: '吸电子' },
    ],
    tips: [
      { title: '电子结构', content: '硝基中的电荷与 π 电子存在离域，不能只用单一静态键式理解。' },
      { title: '反应提示', content: '硝基使芳环失活，并在亲电取代反应中表现出间位定位效应。' },
    ], capabilities: { organTools: false },
  },
  'bio-heart': {
    seedKey: 'bio-heart', category: '生物', title: '心脏模型1', subtitle: '十个部件协作的生命泵站',
    description: '这套可拆解心脏模型展示主要腔室、血管与结构部件，适合通过真实部件拆解理解血液循环路径。',
    illustration: '/images/heart-structure.png',
    metrics: [
      { label: '所属系统', value: '心血管系统' }, { label: '主要腔室', value: '四个' },
      { label: '模型部件', value: '十个' }, { label: '主要功能', value: '泵送血液' },
    ],
    tips: [
      { title: '学习提示', content: '沿腔静脉、右心、肺循环、左心和主动脉追踪血流方向。' },
      { title: '模型能力', content: '该模型保留原有真实部件拆解，并同时支持剖面与线框观察。' },
    ], capabilities: { organTools: true },
  },
  'bio-hiv': {
    seedKey: 'bio-hiv', category: '生物', title: 'HIV 病毒模型', subtitle: '微小颗粒中的复制密码',
    description: '模型呈现 HIV 病毒颗粒的包膜、蛋白与内部遗传物质层次，用于理解其结构与感染过程。',
    illustration: '/images/hiv-structure.png',
    metrics: [
      { label: '类型', value: '逆转录病毒' }, { label: '遗传物质', value: 'RNA' },
      { label: '主要靶细胞', value: 'CD4⁺ T 细胞' }, { label: '结构特征', value: '有包膜' },
    ],
    tips: [
      { title: '结构提示', content: '病毒表面糖蛋白参与识别宿主细胞，内部酶参与逆转录和整合。' },
      { title: '概念辨析', content: 'HIV 是病毒名称；未经治疗后可能发展为获得性免疫缺陷综合征。' },
    ], capabilities: { organTools: false },
  },
  'geo-earth-layers': {
    seedKey: 'geo-earth-layers', category: '地理', title: '地球内部结构', subtitle: '穿过地壳，抵达炽热的核心',
    description: '分层模型展示地壳、地幔、外核和内核的相对位置，帮助建立地球内部圈层的空间概念。',
    illustration: '/images/earth-layers-diagram.png',
    metrics: [
      { label: '主要圈层', value: '地壳、地幔、外核、内核' }, { label: '地球半径', value: '约 6,371 km' },
      { label: '外核状态', value: '液态' }, { label: '内核状态', value: '固态' },
    ],
    tips: [
      { title: '尺度提示', content: '地壳相对地球半径非常薄，示意模型常会适度夸大其厚度。' },
      { title: '动力来源', content: '地幔缓慢对流与地球内部热量共同影响板块运动。' },
    ], capabilities: { organTools: false },
  },
  'geo-terrain': {
    seedKey: 'geo-terrain', category: '地理', title: '地形地貌总览', subtitle: '让高低起伏讲述大地的故事',
    description: '地形模型综合呈现山地、河谷、平原与水系，可从高度、坡度和地表过程理解地貌形成。',
    illustration: '/images/terrain-topography-diagram.png',
    metrics: [
      { label: '主要要素', value: '高程与坡度' }, { label: '塑造力量', value: '内力与外力' },
      { label: '水系作用', value: '侵蚀、搬运、沉积' }, { label: '观察方式', value: '俯视与剖面' },
    ],
    tips: [
      { title: '判读提示', content: '等高线越密集通常代表坡度越陡，越稀疏则地势越平缓。' },
      { title: '过程联系', content: '流水沿低处汇集，长期侵蚀与沉积会持续改变地表形态。' },
    ], capabilities: { organTools: false },
  },
  'bio-organ-heart': organProfile('bio-organ-heart', '心脏（解剖）', '不知疲倦的泵', '一个把血液泵送至全身的肌性器官，为每一个细胞输送氧气与养分。', 'heart', [
    { label: '大小', value: '约与你的拳头相当' }, { label: '重量', value: '250–350 克' }, { label: '每日', value: '每天约跳动 10 万次' },
    { label: '位置', value: '位于胸骨后方，略偏左侧' }, { label: '血液供应', value: '左、右冠状动脉' }, { label: '功能', value: '推动含氧血液循环' },
  ], '它的电节律协调着每一次心跳。', '一生中约跳动 25 亿次，而且早在出生之前就已开始跳动。'),
  'bio-organ-brain': organProfile('bio-organ-brain', '大脑', '体内的宇宙', '身体的指挥中枢，整合感觉、记忆、情绪与精细动作。', 'brain', [
    { label: '大小', value: '约相当于两个握紧的拳头' }, { label: '重量', value: '1.3–1.4 千克' }, { label: '每日', value: '消耗全身约 20% 的能量' },
    { label: '位置', value: '受颅骨保护' }, { label: '血液供应', value: '颈内动脉与椎动脉' }, { label: '功能', value: '处理并协调各种信号' },
  ], '数以十亿计的神经元通过电信号与化学信号彼此通讯。', '大脑本身没有痛觉感受器——头痛其实来自它周围的组织。'),
  'bio-organ-lungs': organProfile('bio-organ-lungs', '肺', '生命的呼吸', '成对的器官，通过一片辽阔而精细的表面吸入空气，并以氧气交换二氧化碳。', 'lungs', [
    { label: '大小', value: '每侧高约 25 厘米' }, { label: '重量', value: '两侧共约 1 千克' }, { label: '每日', value: '每天流通约 11,000 升空气' },
    { label: '位置', value: '位于心脏两侧、胸廓之内' }, { label: '血液供应', value: '肺动脉与支气管动脉' }, { label: '功能', value: '交换氧气与二氧化碳' },
  ], '肺泡把一片网球场大小的交换面折叠进胸腔之中。', '右肺有三叶，左肺只有两叶，为心脏让出了空间。'),
  'bio-organ-liver': organProfile('bio-organ-liver', '肝脏', '沉默的炼金术士', '一个了不起的代谢器官，过滤血液、处理养分并分泌胆汁。', 'liver', [
    { label: '大小', value: '约与一个橄榄球相当' }, { label: '重量', value: '1.4–1.6 千克' }, { label: '每日', value: '承担 500 多项功能' },
    { label: '位置', value: '右上腹' }, { label: '血液供应', value: '肝动脉与门静脉' }, { label: '功能', value: '代谢、解毒与分泌胆汁' },
  ], '它能够再生相当大一部分失去的组织。', '它是唯一能从自身一小部分重新长回完整体积的人体器官。'),
  'bio-organ-kidneys': organProfile('bio-organ-kidneys', '肾脏', '精密的过滤器', '成对的过滤器官，平衡体液、电解质、血压与废物排出。', 'kidneys', [
    { label: '大小', value: '每颗约相当于一只鼠标' }, { label: '重量', value: '每颗 120–170 克' }, { label: '每日', value: '每天过滤约 180 升液体' },
    { label: '位置', value: '脊柱两侧、肋骨下方' }, { label: '血液供应', value: '肾动脉' }, { label: '功能', value: '过滤血液并生成尿液' },
  ], '肾单位精细地调节着血液的化学组成。', '过滤出的液体几乎都被重新吸收，最终只有约 1–2 升成为尿液。'),
  'bio-organ-eyeball': organProfile('bio-organ-eyeball', '眼球', '以光造成的窗', '一个精密的感觉器官，把聚焦的光线转换为被解读为视觉的神经信号。', 'eyeball', [
    { label: '大小', value: '直径约 24 毫米' }, { label: '重量', value: '约 7.5 克' }, { label: '每日', value: '每天完成数千次细微运动' },
    { label: '位置', value: '位于骨性眼眶之内' }, { label: '血液供应', value: '眼动脉' }, { label: '功能', value: '捕捉并聚焦光线' },
  ], '视网膜其实是中枢神经系统的延伸。', '角膜完全没有血管，它直接从空气中获取氧气。'),
  'bio-organ-intestine': organProfile('bio-organ-intestine', '肠', '体内的花园', '一条折叠的消化通道，在此吸收养分，肠道菌群则支撑着全身健康。', 'intestine', [
    { label: '大小', value: '展开后约 6–7 米' }, { label: '重量', value: '随内容物而变化' }, { label: '每日', value: '栖息着数以万亿计的微生物' },
    { label: '位置', value: '腹部中段与下部' }, { label: '血液供应', value: '肠系膜上、下动脉' }, { label: '功能', value: '消化与养分吸收' },
  ], '皱襞、绒毛与微绒毛把它的表面积成倍放大。', '它的内壁每隔几天就更新一次，是全身更新最快的组织。'),
  'bio-organ-pancreas': organProfile('bio-organ-pancreas', '胰腺', '沉默的调节者', '一个身兼两职的腺体，向肠道释放消化酶，并分泌稳定血糖的激素。', 'pancreas', [
    { label: '大小', value: '长约 15 厘米' }, { label: '重量', value: '70–100 克' }, { label: '每日', value: '分泌约 1.5 升胰液' },
    { label: '位置', value: '胃的后方，横跨上腹' }, { label: '血液供应', value: '脾动脉与胰十二指肠动脉' }, { label: '功能', value: '分泌消化酶与胰岛素' },
  ], '胰岛通过释放胰岛素与胰高血糖素来平衡血糖。', '仅约 2% 的组织分泌激素，其余都用于制造消化酶。'),
  'bio-organ-skin': organProfile('bio-organ-skin', '皮肤', '有生命的边界', '人体面积最大的器官——一道有生命的屏障，感知触觉、保住水分并调节体温。', 'skin', [
    { label: '大小', value: '摊开后约 2 平方米' }, { label: '重量', value: '3.5–5 千克' }, { label: '每日', value: '脱落约 5 亿个细胞' },
    { label: '位置', value: '覆盖全身' }, { label: '血液供应', value: '真皮血管丛' }, { label: '功能', value: '保护、感知与散热' },
  ], '表皮、真皮与皮下组织三层，各司其职。', '仅一平方厘米就可能容纳数百个汗腺和数米长的血管。'),
  'chem-nacl': {
    seedKey: 'chem-nacl', category: '化学', title: 'NaCl 离子晶体', subtitle: '钠与氯的离子之舞',
    description: '氯化钠晶体中，每个钠离子被六个氯离子包围，每个氯离子也被六个钠离子包围，形成经典的岩盐结构。',
    illustration: '/images/diamond-structure.png',
    metrics: [
      { label: '化学式', value: 'NaCl' }, { label: '晶体类型', value: '离子晶体' },
      { label: '配位数', value: '6' }, { label: '晶系', value: '立方晶系' },
    ],
    tips: [
      { title: '结构提示', content: '钠离子与氯离子交替排列，靠静电吸引维持稳定。' },
      { title: '性质联系', content: '离子键较强，因此氯化钠熔点较高、易溶于水。' },
    ], capabilities: { organTools: false },
  },
  'chem-sio2': {
    seedKey: 'chem-sio2', category: '化学', title: 'SiO₂ 二氧化硅网络', subtitle: '硅氧四面体的无限延伸',
    description: '二氧化硅晶体中，每个硅原子与四个氧原子形成共价键，每个氧原子被两个硅原子共享，构成三维网状结构。',
    illustration: '/images/diamond-structure.png',
    metrics: [
      { label: '化学式', value: 'SiO₂' }, { label: '晶体类型', value: '原子晶体' },
      { label: '硅配位数', value: '4' }, { label: '结构基元', value: '硅氧四面体' },
    ],
    tips: [
      { title: '结构提示', content: '硅氧四面体通过共用顶点氧原子连接，形成三维网状结构。' },
      { title: '性质联系', content: '全部以共价键连接，因此二氧化硅硬度高、熔点高。' },
    ], capabilities: { organTools: false },
  },
};

export const BUILTIN_MODEL_SEED_KEYS = Object.freeze(Object.keys(MODEL_INFO_PROFILES));

export const MODEL_SEED_KEY_BY_URL: Record<string, string> = {
  '/models/diamond.glb': 'chem-diamond',
  '/models/diamond-unit-cell_NIH3D.glb': 'chem-diamond-cell',
  '/models/pubchem-6233-bas-color-print_NIH3D.glb': 'chem-dichlorotoluene',
  '/models/7416-bas-color-print_NIH3D.glb': 'chem-nitrobenzene',
  '/models/heart-optimized.glb': 'bio-heart',
  '/models/hiv-virus.glb': 'bio-hiv',
  '/models/earth-layers.glb': 'geo-earth-layers',
  '/models/terrain-topography.glb': 'geo-terrain',
  '/models/organ-heart.glb': 'bio-organ-heart',
  '/models/organ-brain.glb': 'bio-organ-brain',
  '/models/organ-lungs.glb': 'bio-organ-lungs',
  '/models/organ-liver.glb': 'bio-organ-liver',
  '/models/organ-kidneys.glb': 'bio-organ-kidneys',
  '/models/organ-eyeball.glb': 'bio-organ-eyeball',
  '/models/organ-intestine.glb': 'bio-organ-intestine',
  '/models/organ-pancreas.glb': 'bio-organ-pancreas',
  '/models/organ-skin.glb': 'bio-organ-skin',
  '/models/nacl-crystal.glb': 'chem-nacl',
  '/models/sio2-crystal.glb': 'chem-sio2',
};

export function getModelInfoProfile(seedKey?: string | null) {
  return seedKey ? MODEL_INFO_PROFILES[seedKey] || null : null;
}

export function getModelSeedKeyByUrl(url: string) {
  try {
    return MODEL_SEED_KEY_BY_URL[new URL(url, 'https://local.invalid').pathname] || null;
  } catch {
    return null;
  }
}
