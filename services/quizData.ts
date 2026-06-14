// 答题模式 - 全局题库
// 每个模型 5 题，共 50 题

export interface QuizQuestion {
  id: string;
  modelUrl: string; // 唯一对应模型
  subject: string; // UI 上显示的中文名称
  question: string;
  options: [string, string];
  correctIndex: 0 | 1;
  explanation: string;
}

export interface QuizSession {
  questions: QuizQuestion[];
  currentIndex: number;
  answers: (0 | 1 | null)[];
  startTime: number;
}

const HEART_QUESTIONS: QuizQuestion[] = [
  { id: 'heart-1', modelUrl: '/models/heart-optimized.glb', subject: '心脏模型', question: '人体心脏有几个腔室？', options: ['三个腔室', '四个腔室'], correctIndex: 1, explanation: '人体心脏分为左心房、左心室、右心房、右心室四个腔室。' },
  { id: 'heart-2', modelUrl: '/models/heart-optimized.glb', subject: '心脏模型', question: '心脏中哪个腔室的肌肉壁最厚？', options: ['左心室', '右心室'], correctIndex: 0, explanation: '左心室负责将血液泵向全身（体循环），需要更大的压力，因此肌肉壁最厚。' },
  { id: 'heart-3', modelUrl: '/models/heart-optimized.glb', subject: '心脏模型', question: '血液从右心室泵出后，首先进入哪个血管？', options: ['主动脉', '肺动脉'], correctIndex: 1, explanation: '右心室将血液泵入肺动脉，进行肺循环，在肺部进行气体交换后经肺静脉回到左心房。' },
  { id: 'heart-4', modelUrl: '/models/heart-optimized.glb', subject: '心脏模型', question: '左心房和左心室之间的瓣膜叫什么？', options: ['二尖瓣', '三尖瓣'], correctIndex: 0, explanation: '左心房与左心室之间是二尖瓣，它能防止血液倒流回心房。' },
  { id: 'heart-5', modelUrl: '/models/heart-optimized.glb', subject: '心脏模型', question: '心脏自身跳动的电信号起源于哪里？', options: ['窦房结', '房室结'], correctIndex: 0, explanation: '窦房结被称为心脏的天然起搏器，它产生电信号引发心脏收缩。' },
];

const HIV_QUESTIONS: QuizQuestion[] = [
  { id: 'hiv-1', modelUrl: '/models/hiv-virus.glb', subject: 'HIV 病毒模型', question: 'HIV 病毒的遗传物质是什么？', options: ['RNA', 'DNA'], correctIndex: 0, explanation: 'HIV 是一种逆转录病毒，其核心包含两条单链 RNA 作为遗传物质。' },
  { id: 'hiv-2', modelUrl: '/models/hiv-virus.glb', subject: 'HIV 病毒模型', question: 'HIV 病毒主要攻击人体免疫系统中的哪种细胞？', options: ['辅助性 T 细胞', 'B 淋巴细胞'], correctIndex: 0, explanation: 'HIV 主要感染并破坏带有 CD4 受体的辅助性 T 细胞（CD4+ T 细胞）。' },
  { id: 'hiv-3', modelUrl: '/models/hiv-virus.glb', subject: 'HIV 病毒模型', question: 'HIV 病毒表面用于附着宿主细胞的关键蛋白是什么？', options: ['gp120 蛋白', '血凝素蛋白'], correctIndex: 0, explanation: 'HIV 表面的包膜糖蛋白 gp120 能够与宿主细胞的 CD4 受体特异性结合。' },
  { id: 'hiv-4', modelUrl: '/models/hiv-virus.glb', subject: 'HIV 病毒模型', question: 'HIV 病毒在细胞内复制时，利用哪种特殊的酶将 RNA 转化为 DNA？', options: ['逆转录酶', 'RNA 聚合酶'], correctIndex: 0, explanation: 'HIV 病毒携带逆转录酶，进入宿主细胞后将自身的 RNA 逆转录成 DNA 并整合到宿主基因组中。' },
  { id: 'hiv-5', modelUrl: '/models/hiv-virus.glb', subject: 'HIV 病毒模型', question: 'HIV 病毒衣壳通常呈现什么形状？', options: ['圆柱形', '圆锥形'], correctIndex: 1, explanation: '成熟的 HIV 病毒粒子内部有一个特征性的圆锥形（锥状）核心衣壳，包裹着 RNA 和酶。' },
];

const DIAMOND_QUESTIONS: QuizQuestion[] = [
  { id: 'dia-1', modelUrl: '/models/diamond.glb', subject: '金刚石模型', question: '金刚石中每个碳原子与周围几个碳原子成键？', options: ['3 个', '4 个'], correctIndex: 1, explanation: '每个碳原子以 sp3 杂化，与周围 4 个碳原子形成坚固的共价键。' },
  { id: 'dia-2', modelUrl: '/models/diamond.glb', subject: '金刚石模型', question: '金刚石的碳原子空间排列构成了什么几何形状？', options: ['正四面体', '正六边形'], correctIndex: 0, explanation: '碳原子之间以共价键相连，形成连续的、高度对称的正四面体立体网状结构。' },
  { id: 'dia-3', modelUrl: '/models/diamond.glb', subject: '金刚石模型', question: '金刚石之所以是自然界已知最硬的物质，是因为？', options: ['全为牢固的共价键', '原子之间距离极远'], correctIndex: 0, explanation: '整个晶体由强大的 C-C 共价键构成三维网状结构，键能极大，导致极高的硬度。' },
  { id: 'dia-4', modelUrl: '/models/diamond.glb', subject: '金刚石模型', question: '金刚石晶体属于哪一类晶体？', options: ['离子晶体', '原子晶体（共价晶体）'], correctIndex: 1, explanation: '由于金刚石是由碳原子通过共价键连接而成的三维网络，它属于典型的原子晶体。' },
  { id: 'dia-5', modelUrl: '/models/diamond.glb', subject: '金刚石模型', question: '纯净的金刚石通常具备哪种物理特性？', options: ['透明，不导电', '不透明，具有导电性'], correctIndex: 0, explanation: '金刚石中没有自由移动的电子（所有价电子都参与形成共价键），因此它不导电。' },
];

const DIAMOND_UNIT_CELL_QUESTIONS: QuizQuestion[] = [
  { id: 'duc-1', modelUrl: '/models/diamond-unit-cell_NIH3D.glb', subject: '金刚石晶胞', question: '一个金刚石晶胞中实际上包含几个完整的碳原子？', options: ['4 个', '8 个'], correctIndex: 1, explanation: '顶点占8×1/8=1个，面心占6×1/2=3个，体内有4个完全属于该晶胞，共计 1+3+4 = 8 个碳原子。' },
  { id: 'duc-2', modelUrl: '/models/diamond-unit-cell_NIH3D.glb', subject: '金刚石晶胞', question: '金刚石晶胞属于哪种晶格类型？', options: ['面心立方 (FCC)', '体心立方 (BCC)'], correctIndex: 0, explanation: '金刚石晶体结构可以看作是两套面心立方晶格沿着体对角线错开 1/4 长度嵌套而成。' },
  { id: 'duc-3', modelUrl: '/models/diamond-unit-cell_NIH3D.glb', subject: '金刚石晶胞', question: '在金刚石晶胞内部的四个碳原子占据了什么位置？', options: ['八面体空隙', '四面体空隙'], correctIndex: 1, explanation: '这四个碳原子占据了面心立方晶格中 8 个四面体空隙的一半（即 4 个）。' },
  { id: 'duc-4', modelUrl: '/models/diamond-unit-cell_NIH3D.glb', subject: '金刚石晶胞', question: '金刚石晶胞的空间利用率大约是多少？', options: ['34%', '74%'], correctIndex: 0, explanation: '由于正四面体结构比较疏松，金刚石的空间利用率仅约为 34%，是比较小的。' },
  { id: 'duc-5', modelUrl: '/models/diamond-unit-cell_NIH3D.glb', subject: '金刚石晶胞', question: '碳原子之间通过什么类型的轨道杂化形成这种晶胞结构？', options: ['sp2 杂化', 'sp3 杂化'], correctIndex: 1, explanation: '在金刚石中，碳原子的 2s 轨道和三个 2p 轨道进行 sp3 杂化，形成四个等价的杂化轨道。' },
];

const DICHLOROTOLUENE_QUESTIONS: QuizQuestion[] = [
  { id: 'pub-1', modelUrl: '/models/pubchem-6233-bas-color-print_NIH3D.glb', subject: '1,4-二氯甲基苯', question: '1,4-二氯甲基苯分子中包含几个氯原子？', options: ['1 个', '2 个'], correctIndex: 1, explanation: '分子中包含两个氯原子（Cl），这从名称中的“二氯”即可判断。' },
  { id: 'pub-2', modelUrl: '/models/pubchem-6233-bas-color-print_NIH3D.glb', subject: '1,4-二氯甲基苯', question: '该分子中的芳香环是什么类型的环？', options: ['环己烷环', '苯环'], correctIndex: 1, explanation: '它是一种芳香族化合物，中心结构是一个由六个碳原子组成的苯环。' },
  { id: 'pub-3', modelUrl: '/models/pubchem-6233-bas-color-print_NIH3D.glb', subject: '1,4-二氯甲基苯', question: '“1,4-” 在化学命名中代表两个取代基处于什么位置关系？', options: ['邻位 (ortho)', '对位 (para)'], correctIndex: 1, explanation: '在苯环上，1,4-位置即相对的对角线位置，被称为“对位”。' },
  { id: 'pub-4', modelUrl: '/models/pubchem-6233-bas-color-print_NIH3D.glb', subject: '1,4-二氯甲基苯', question: '苯环上的碳原子采用的是什么杂化方式？', options: ['sp2 杂化', 'sp3 杂化'], correctIndex: 0, explanation: '苯环上的碳原子全部采用 sp2 杂化，形成平面六边形结构，并存在离域大π键。' },
  { id: 'pub-5', modelUrl: '/models/pubchem-6233-bas-color-print_NIH3D.glb', subject: '1,4-二氯甲基苯', question: '这个分子是否具有偶极矩？', options: ['有，它是极性分子', '没有，它是非极性分子'], correctIndex: 0, explanation: '虽然主结构有一定对称性，但由于取代基（甲基和氯原子）不同且不对称，它是极性分子。' },
];

const NACL_QUESTIONS: QuizQuestion[] = [
  { id: 'nacl-1', modelUrl: '/models/nacl-crystal.glb', subject: 'NaCl 离子晶体', question: 'NaCl 晶体是由什么粒子构成的？', options: ['钠离子和氯离子', '钠原子和氯原子'], correctIndex: 0, explanation: 'NaCl 是离子晶体，由带正电的钠离子 (Na⁺) 和带负电的氯离子 (Cl⁻) 构成。' },
  { id: 'nacl-2', modelUrl: '/models/nacl-crystal.glb', subject: 'NaCl 离子晶体', question: '在 NaCl 晶体中，每个 Na⁺ 周围紧邻几个 Cl⁻？', options: ['4 个', '6 个'], correctIndex: 1, explanation: '在面心立方晶格中，每个钠离子的上、下、左、右、前、后共有 6 个紧邻的氯离子（配位数为 6）。' },
  { id: 'nacl-3', modelUrl: '/models/nacl-crystal.glb', subject: 'NaCl 离子晶体', question: '由于存在强烈的静电吸引，NaCl 在常温下是什么状态？', options: ['气体', '固体'], correctIndex: 1, explanation: '强烈的离子键使得 NaCl 具有较高的熔点和沸点，在常温下呈现坚硬的固体状态。' },
  { id: 'nacl-4', modelUrl: '/models/nacl-crystal.glb', subject: 'NaCl 离子晶体', question: '固态 NaCl 能否导电？', options: ['能', '不能'], correctIndex: 1, explanation: '固态离子晶体中离子被束缚在晶格中，无法自由移动，因此固态不导电；只有在熔融状态或水溶液中才导电。' },
  { id: 'nacl-5', modelUrl: '/models/nacl-crystal.glb', subject: 'NaCl 离子晶体', question: 'NaCl 晶胞包含几个 NaCl 分子？', options: ['1 个', '4 个'], correctIndex: 1, explanation: 'NaCl 晶胞中 Na⁺ 和 Cl⁻ 各有 4 个（通过顶点、面心和棱心、体心计算），相当于 4 个 NaCl 分子。' },
];

const SIO2_QUESTIONS: QuizQuestion[] = [
  { id: 'sio2-1', modelUrl: '/models/sio2-crystal.glb', subject: 'SiO₂ 二氧化硅', question: 'SiO₂ 晶体中，每个硅原子与几个氧原子相连？', options: ['2 个', '4 个'], correctIndex: 1, explanation: '在 SiO₂（如石英）晶体中，每个硅原子与周围 4 个氧原子以共价键相连，形成正四面体。' },
  { id: 'sio2-2', modelUrl: '/models/sio2-crystal.glb', subject: 'SiO₂ 二氧化硅', question: 'SiO₂ 属于哪一种晶体类型？', options: ['分子晶体', '原子晶体'], correctIndex: 1, explanation: '二氧化硅是由硅原子和氧原子通过共价键组成的三维空间网状结构，属于原子晶体。' },
  { id: 'sio2-3', modelUrl: '/models/sio2-crystal.glb', subject: 'SiO₂ 二氧化硅', question: '在 SiO₂ 网络中，每个氧原子连接着几个硅原子？', options: ['2 个', '4 个'], correctIndex: 0, explanation: '为了保持化学式比例为 1:2，每个氧原子必须且仅连接 2 个硅原子，充当桥梁的作用。' },
  { id: 'sio2-4', modelUrl: '/models/sio2-crystal.glb', subject: 'SiO₂ 二氧化硅', question: 'SiO₂ 晶体的熔点通常表现出怎样的特征？', options: ['极低，易挥发', '极高，坚硬耐高温'], correctIndex: 1, explanation: '打断三维共价键网络需要极高的能量，因此原子晶体通常具有非常高的熔点。' },
  { id: 'sio2-5', modelUrl: '/models/sio2-crystal.glb', subject: 'SiO₂ 二氧化硅', question: '自然界中最常见的 SiO₂ 晶体矿物是什么？', options: ['石英', '方解石'], correctIndex: 0, explanation: '石英（Quartz）是自然界中广泛分布的二氧化硅晶体形态。' },
];

const NITROBENZENE_QUESTIONS: QuizQuestion[] = [
  { id: 'nitro-1', modelUrl: '/models/7416-bas-color-print_NIH3D.glb', subject: '硝基苯', question: '硝基苯分子的化学式是什么？', options: ['C₆H₆', 'C₆H₅NO₂'], correctIndex: 1, explanation: '硝基苯是由苯环上的一颗氢原子被硝基（-NO₂）取代形成的，因此化学式为 C₆H₅NO₂。' },
  { id: 'nitro-2', modelUrl: '/models/7416-bas-color-print_NIH3D.glb', subject: '硝基苯', question: '硝基（-NO₂）在这个分子中是一个怎样的官能团？', options: ['推电子基团', '吸电子基团'], correctIndex: 1, explanation: '硝基中含有电负性很强的氧和氮，是一个强吸电子基团，会降低苯环的电子云密度。' },
  { id: 'nitro-3', modelUrl: '/models/7416-bas-color-print_NIH3D.glb', subject: '硝基苯', question: '在常温常压下，硝基苯的状态和颜色通常是？', options: ['无色气体', '苦杏仁味的淡黄色液体'], correctIndex: 1, explanation: '硝基苯是一种高沸点的油状液体，纯品为无色，但通常呈微黄色，具有苦杏仁味，有毒。' },
  { id: 'nitro-4', modelUrl: '/models/7416-bas-color-print_NIH3D.glb', subject: '硝基苯', question: '硝基苯能和水互相溶解吗？', options: ['完全互溶', '不溶于水'], correctIndex: 1, explanation: '硝基苯是有机溶剂，极性不大且苯环占据主导，因此它不溶于水，且密度比水大。' },
  { id: 'nitro-5', modelUrl: '/models/7416-bas-color-print_NIH3D.glb', subject: '硝基苯', question: '硝基苯分子中是否所有的原子都处于同一个平面上？', options: ['不一定同平面', '严格完全同平面'], correctIndex: 0, explanation: '由于硝基（-NO₂）中的 O-N 键可以围绕 C-N 键旋转，分子在某些构象下并非所有原子严格共面。' },
];

const EARTH_QUESTIONS: QuizQuestion[] = [
  { id: 'earth-1', modelUrl: '/models/earth-layers.glb', subject: '地球内部结构', question: '地球内部由外到内依次是哪三个圈层？', options: ['地壳、地幔、地核', '地幔、地壳、地核'], correctIndex: 0, explanation: '地球内部结构由外到内依次为：地壳（最薄）、地幔（最厚）、地核（最中心）。' },
  { id: 'earth-2', modelUrl: '/models/earth-layers.glb', subject: '地球内部结构', question: '地壳在大陆和海洋区域的厚度表现有何差异？', options: ['大陆地壳更厚', '海洋地壳更厚'], correctIndex: 0, explanation: '大陆地壳平均厚度约 33 千米，而大洋地壳较薄，平均仅约 6 千米。' },
  { id: 'earth-3', modelUrl: '/models/earth-layers.glb', subject: '地球内部结构', question: '地幔由于高温高压发生局部熔融的部分被称为什么？', options: ['岩石圈', '软流层'], correctIndex: 1, explanation: '上地幔顶部存在一个软流层，物质呈半熔融状态，被认为是岩浆的主要发源地。' },
  { id: 'earth-4', modelUrl: '/models/earth-layers.glb', subject: '地球内部结构', question: '地球的地核被划分为外核和内核，外核的物质处于什么状态？', options: ['液态', '固态'], correctIndex: 0, explanation: '由于地震波横波无法穿过外核，科学家推断外核主要由液态的铁和镍组成。' },
  { id: 'earth-5', modelUrl: '/models/earth-layers.glb', subject: '地球内部结构', question: '地球磁场主要是由于地球哪一部分的流体运动产生的？', options: ['液态外核', '固态内核'], correctIndex: 0, explanation: '液态铁镍外核的对流运动，结合地球自转产生的科里奥利力，产生了所谓的“地磁发电机效应”。' },
];

const TERRAIN_QUESTIONS: QuizQuestion[] = [
  { id: 'terr-1', modelUrl: '/models/terrain-topography.glb', subject: '地形地貌', question: '在地形图中，等高线密集的地方通常代表什么地形特征？', options: ['地形平缓', '坡度陡峭'], correctIndex: 1, explanation: '等高线越密集，表示在水平距离内海拔变化越大，也就是地形越陡峭。' },
  { id: 'terr-2', modelUrl: '/models/terrain-topography.glb', subject: '地形地貌', question: '河流在上游山区强烈的向下侵蚀作用，最容易形成什么形状的峡谷？', options: ['U 形谷', 'V 形谷'], correctIndex: 1, explanation: '河流上游落差大、流速快，以下切侵蚀为主，往往形成陡峻的“V”形峡谷。' },
  { id: 'terr-3', modelUrl: '/models/terrain-topography.glb', subject: '地形地貌', question: '河流在入海口或入湖口，由于流速减缓导致的泥沙堆积地貌称作什么？', options: ['冲积扇', '三角洲'], correctIndex: 1, explanation: '河流携带的泥沙在河口处因水流变缓而沉积，形成类似三角形的平原，即三角洲。' },
  { id: 'terr-4', modelUrl: '/models/terrain-topography.glb', subject: '地形地貌', question: '喀斯特地貌主要是由哪种岩石受到地下水溶蚀而形成的？', options: ['石灰岩', '花岗岩'], correctIndex: 0, explanation: '石灰岩（碳酸钙）易受含有二氧化碳的水的化学溶蚀，从而形成溶洞、石林等地貌。' },
  { id: 'terr-5', modelUrl: '/models/terrain-topography.glb', subject: '地形地貌', question: '风力侵蚀和风力堆积作用在何种气候区最为显著？', options: ['干旱、半干旱区', '湿润的热带雨林区'], correctIndex: 0, explanation: '干旱地区植被稀少，风力作用强烈，容易形成沙丘（风积）和风蚀蘑菇（风蚀）等地貌。' },
];

const ALL_QUESTIONS: QuizQuestion[] = [
  ...HEART_QUESTIONS,
  ...HIV_QUESTIONS,
  ...DIAMOND_QUESTIONS,
  ...DIAMOND_UNIT_CELL_QUESTIONS,
  ...DICHLOROTOLUENE_QUESTIONS,
  ...NACL_QUESTIONS,
  ...SIO2_QUESTIONS,
  ...NITROBENZENE_QUESTIONS,
  ...EARTH_QUESTIONS,
  ...TERRAIN_QUESTIONS,
];

/**
 * Fisher-Yates 洗牌算法
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * 从题库随机抽取指定数量的题目，创建答题会话
 */
export function createQuizSession(count: number = 5, modelUrlFilter?: string): QuizSession {
  let pool = ALL_QUESTIONS;
  if (modelUrlFilter) {
    pool = ALL_QUESTIONS.filter(q => q.modelUrl === modelUrlFilter);
  }
  const questions = shuffleArray(pool).slice(0, Math.min(count, pool.length));
  return {
    questions,
    currentIndex: 0,
    answers: new Array(questions.length).fill(null),
    startTime: Date.now(),
  };
}

/**
 * 计算答题结果
 */
export function getQuizResult(session: QuizSession) {
  let correctCount = 0;
  session.questions.forEach((q, i) => {
    if (session.answers[i] === q.correctIndex) {
      correctCount++;
    }
  });
  const totalTime = Math.round((Date.now() - session.startTime) / 1000);
  const totalQuestions = session.questions.length;
  const accuracy = Math.round((correctCount / totalQuestions) * 100);
  const stars = accuracy >= 80 ? 3 : accuracy >= 60 ? 2 : accuracy >= 40 ? 1 : 0;
  return { correctCount, totalQuestions, accuracy, totalTime, stars };
}
