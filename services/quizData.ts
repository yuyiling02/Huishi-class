
// 答题模式 - 预设题库
// 每学科 5 题，共 15 题

export interface QuizQuestion {
  id: string;
  subject: '化学' | '生物' | '地理';
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

// ─── 化学题库 ───────────────────────────────────────────────

const CHEMISTRY_QUESTIONS: QuizQuestion[] = [
  {
    id: 'chem-1',
    subject: '化学',
    question: '金刚石中每个碳原子与几个碳原子形成共价键？',
    options: ['3 个', '4 个'],
    correctIndex: 1,
    explanation: '金刚石中每个碳原子以 sp3 杂化方式与周围 4 个碳原子形成共价键，构成正四面体结构。',
  },
  {
    id: 'chem-2',
    subject: '化学',
    question: 'NaCl 晶体中，钠离子和氯离子之间的化学键属于什么类型？',
    options: ['离子键', '共价键'],
    correctIndex: 0,
    explanation: 'NaCl 是典型的离子晶体，钠原子失去电子形成 Na⁺，氯原子得到电子形成 Cl⁻，二者通过离子键结合。',
  },
  {
    id: 'chem-3',
    subject: '化学',
    question: '硝基苯的化学式是 C₆H₅NO₂，其中硝基（-NO₂）连接在什么结构上？',
    options: ['苯环', '碳链'],
    correctIndex: 0,
    explanation: '硝基苯是苯环上的一个氢被硝基（-NO₂）取代后形成的芳香族化合物。',
  },
  {
    id: 'chem-4',
    subject: '化学',
    question: '二氧化硅（SiO₂）晶体中，每个硅原子与几个氧原子相连？',
    options: ['2 个', '4 个'],
    correctIndex: 1,
    explanation: 'SiO₂ 中每个硅原子与 4 个氧原子以共价键相连，形成正四面体结构，属于原子晶体。',
  },
  {
    id: 'chem-5',
    subject: '化学',
    question: '金刚石和石墨都是碳的同素异形体，它们的根本区别在于什么？',
    options: ['碳原子的排列方式不同', '碳原子的数量不同'],
    correctIndex: 0,
    explanation: '同素异形体是同种元素组成的不同单质，金刚石与石墨的区别在于碳原子的空间排列方式不同。',
  },
];

// ─── 生物题库 ───────────────────────────────────────────────

const BIOLOGY_QUESTIONS: QuizQuestion[] = [
  {
    id: 'bio-1',
    subject: '生物',
    question: '人体心脏有几个腔室？',
    options: ['三个腔室', '四个腔室'],
    correctIndex: 1,
    explanation: '人体心脏分为左心房、左心室、右心房、右心室四个腔室。',
  },
  {
    id: 'bio-2',
    subject: '生物',
    question: '心脏中哪个腔室的肌肉壁最厚？',
    options: ['左心室', '右心室'],
    correctIndex: 0,
    explanation: '左心室负责将血液泵向全身（体循环），需要更大的压力，因此肌肉壁最厚。',
  },
  {
    id: 'bio-3',
    subject: '生物',
    question: 'HIV 病毒主要攻击人体免疫系统中的哪种细胞？',
    options: ['T 淋巴细胞', '红细胞'],
    correctIndex: 0,
    explanation: 'HIV（人类免疫缺陷病毒）主要攻击并破坏辅助性 T 淋巴细胞（CD4+ T 细胞），导致免疫功能下降。',
  },
  {
    id: 'bio-4',
    subject: '生物',
    question: '血液从右心室泵出后，首先进入哪个血管？',
    options: ['主动脉', '肺动脉'],
    correctIndex: 1,
    explanation: '右心室将血液泵入肺动脉，进行肺循环，在肺部进行气体交换后经肺静脉回到左心房。',
  },
  {
    id: 'bio-5',
    subject: '生物',
    question: 'HIV 病毒的遗传物质是什么？',
    options: ['RNA', 'DNA'],
    correctIndex: 0,
    explanation: 'HIV 是一种逆转录病毒，其遗传物质为 RNA。进入宿主细胞后，通过逆转录酶将 RNA 转录为 DNA。',
  },
];

// ─── 地理题库 ───────────────────────────────────────────────

const GEOGRAPHY_QUESTIONS: QuizQuestion[] = [
  {
    id: 'geo-1',
    subject: '地理',
    question: '地球内部由外到内依次是哪三个圈层？',
    options: ['地壳、地幔、地核', '地幔、地壳、地核'],
    correctIndex: 0,
    explanation: '地球内部结构由外到内依次为：地壳（最薄）、地幔（最厚）、地核（最中心）。',
  },
  {
    id: 'geo-2',
    subject: '地理',
    question: '地壳平均厚度约为多少？',
    options: ['约 17 千米', '约 170 千米'],
    correctIndex: 0,
    explanation: '地壳的平均厚度约为 17 千米，其中大陆地壳较厚（约 33 千米），海洋地壳较薄（约 6 千米）。',
  },
  {
    id: 'geo-3',
    subject: '地理',
    question: '地幔中的物质缓慢运动形成的循环叫什么？',
    options: ['地幔对流', '板块漂移'],
    correctIndex: 0,
    explanation: '地幔物质因放射性元素衰变产生的热量而发生缓慢的对流运动，这就是地幔对流，它是板块运动的驱动力。',
  },
  {
    id: 'geo-4',
    subject: '地理',
    question: '地球的外核主要由什么物质组成，处于什么状态？',
    options: ['液态铁镍', '固态岩石'],
    correctIndex: 0,
    explanation: '地球外核主要由铁和镍组成，处于液态（熔融状态），正是液态外核中的对流运动产生了地球磁场。',
  },
  {
    id: 'geo-5',
    subject: '地理',
    question: '以下哪种地形是由流水侵蚀作用形成的？',
    options: ['V 形峡谷', '沙丘'],
    correctIndex: 0,
    explanation: 'V 形峡谷是河流长期向下切割岩石形成的侵蚀地貌，而沙丘是风力堆积作用形成的。',
  },
];

// ─── 全部题库 ───────────────────────────────────────────────

const ALL_QUESTIONS: QuizQuestion[] = [
  ...CHEMISTRY_QUESTIONS,
  ...BIOLOGY_QUESTIONS,
  ...GEOGRAPHY_QUESTIONS,
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
export function createQuizSession(count: number = 5): QuizSession {
  const questions = shuffleArray(ALL_QUESTIONS).slice(0, Math.min(count, ALL_QUESTIONS.length));
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
