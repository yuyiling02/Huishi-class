import { AgentPlan, AgentPlanStep, AgentToolCall, TeachingModelId } from '../types';

type DeepSeekMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';

const modelNames: Record<TeachingModelId, string> = {
  heart: '心脏模型1',
  biodigital_heart: '心脏模型2',
  hiv: 'HIV 病毒模型',
  diamond: '金刚石模型',
  pubchem_6233: 'PubChem 6233 BAS 分子模型',
  earth_layers: '地球内部结构',
  terrain: '地形地貌',
};

const tool = (id: string, name: AgentToolCall['name'], label: string, args: Record<string, unknown> = {}): AgentToolCall => ({
  id,
  name,
  label,
  args,
});

const createStep = (id: string, title: string, narration: string, toolCalls: AgentToolCall[]): AgentPlanStep => ({
  id,
  title,
  narration,
  toolCalls,
});

const detectRequestedModel = (request: string): TeachingModelId | null => {
  if (/心脏2|BioDigital|网页/i.test(request)) return 'biodigital_heart';
  if (/心脏|心房|心室|瓣膜|主动脉|静脉|动脉|心肌|冠状|血液|循环|人体|生物/.test(request)) return 'heart';
  if (/地形|地貌|高原|山地|盆地|平原|丘陵|河流|三角洲/.test(request)) return 'terrain';
  if (/地球|地壳|地幔|外核|内核|板块/.test(request)) return 'earth_layers';
  if (/病毒|HIV|免疫/i.test(request)) return 'hiv';
  if (/6233|PubChem|NIH3D|BAS/i.test(request)) return 'pubchem_6233';
  if (/金刚石|晶体|化学|碳原子|分子/.test(request)) return 'diamond';
  return null;
};

const pickModel = (request: string): TeachingModelId => detectRequestedModel(request) ?? 'earth_layers';

export const inferTeachingModel = (request: string): TeachingModelId => pickModel(request);

export const getTeachingModelName = (modelId: TeachingModelId): string => modelNames[modelId];

const createFallbackPlan = (request: string): AgentPlan => {
  const modelId = pickModel(request);
  const modelName = modelNames[modelId];
  const supportsDisassembly = modelId !== 'biodigital_heart';

  const steps: AgentPlanStep[] = [
    createStep(
      'step-load',
      `载入${modelName}`,
      `先根据教学需求选择${modelName}，让学生建立整体空间印象。`,
      [
        tool('load-model', 'load_model', `加载${modelName}`, { modelId }),
        tool('gesture-on', 'enable_gesture', '开启手势捕捉'),
      ],
    ),
    createStep(
      'step-observe',
      '整体观察',
      '通过自动旋转和适度放大，带学生从整体轮廓进入关键结构。',
      [
        tool('rotate-main', 'auto_rotate', '自动旋转观察', { speed: 0.018, durationMs: 2600 }),
        tool('zoom-in', 'auto_zoom', '放大关键区域', { direction: 'in', durationMs: 1400 }),
      ],
    ),
    createStep(
      'step-explain',
      supportsDisassembly ? '自主拆解展示' : '互动页面展示',
      supportsDisassembly
        ? '将模型部件向四周平滑散开，避免重叠，突出各结构之间的空间关系。'
        : '切换到外部互动页面，引导学生观察更细致的人体结构。',
      supportsDisassembly
        ? [
            tool('explode', 'explode_model', '模型自主拆解散开', { strength: 0.95, spacing: 1.15 }),
            tool('rotate-exploded', 'auto_rotate', '拆解后慢速旋转', { speed: 0.011, durationMs: 3200 }),
          ]
        : [tool('open-biodigital', 'load_model', '打开心脏模型2', { modelId: 'biodigital_heart' })],
    ),
    createStep(
      'step-close',
      '归纳总结',
      '回到稳定视角，形成课堂小结，为提问和复盘做准备。',
      [
        tool('stop-motion', 'set_teacher_log', '记录演示结论', { text: `${modelName}演示完成，进入课堂小结。` }),
        tool('stop', 'auto_rotate', '停止自动旋转', { speed: 0, durationMs: 200 }),
      ],
    ),
  ];

  return {
    topic: request.trim() || `${modelName}互动教学`,
    modelId,
    steps,
    summaryFocus: ['核心结构识别', '空间关系理解', '互动观察表现'],
  };
};

const normalizePlan = (raw: any, request: string): AgentPlan => {
  const fallback = createFallbackPlan(request);
  const requestedModelId = detectRequestedModel(request);
  const rawModelId = (raw?.modelId && modelNames[raw.modelId as TeachingModelId])
    ? raw.modelId as TeachingModelId
    : null;
  const modelId = requestedModelId ?? rawModelId ?? fallback.modelId;
  const shouldUseFallbackSteps = Boolean(requestedModelId && rawModelId && requestedModelId !== rawModelId);

  const rawSteps = !shouldUseFallbackSteps && Array.isArray(raw?.steps) ? raw.steps : [];
  const steps = rawSteps.slice(0, 5).map((step: any, stepIndex: number) => {
    const toolCalls = Array.isArray(step?.toolCalls) ? step.toolCalls : [];
    const normalizedTools = toolCalls
      .filter((call: any) => typeof call?.name === 'string')
      .slice(0, 4)
      .map((call: any, callIndex: number) => tool(
        String(call.id || `ai-tool-${stepIndex}-${callIndex}`),
        call.name,
        String(call.label || call.name),
        call.name === 'load_model'
          ? { ...(typeof call.args === 'object' && call.args ? call.args : {}), modelId }
          : (typeof call.args === 'object' && call.args ? call.args : {}),
      ));

    return createStep(
      String(step?.id || `ai-step-${stepIndex}`),
      String(step?.title || `演示步骤 ${stepIndex + 1}`),
      String(step?.narration || '根据教学目标执行演示动作。'),
      normalizedTools,
    );
  });

  const normalizedSteps = steps.length > 0 ? steps : fallback.steps;
  const hasModelLoad = normalizedSteps.some((step) =>
    step.toolCalls.some((call) => call.name === 'load_model')
  );
  const shouldDisassemble = modelId !== 'biodigital_heart';
  const hasDisassembly = normalizedSteps.some((step) =>
    step.toolCalls.some((call) => call.name === 'explode_model')
  );

  let finalSteps = hasModelLoad
    ? normalizedSteps
    : [
        createStep(
          'step-auto-load',
          `自动匹配${modelNames[modelId]}`,
          `理解规划Agent已根据教学需求匹配到${modelNames[modelId]}，先载入对应教具。`,
          [
            tool('auto-load-model', 'load_model', `加载${modelNames[modelId]}`, { modelId }),
            tool('auto-enable-gesture', 'enable_gesture', '开启手势捕捉'),
          ],
        ),
        ...normalizedSteps,
      ];

  if (shouldDisassemble && !hasDisassembly) {
    finalSteps = [
      ...finalSteps,
      createStep(
        'step-auto-disassemble',
        `自主拆解${modelNames[modelId]}`,
        `演示执行Agent将${modelNames[modelId]}自动拆解散开，突出内部结构和空间层次。`,
        [
          tool('auto-explode', 'explode_model', `拆解${modelNames[modelId]}`, { strength: 0.95, spacing: 1.15, durationMs: 1800 }),
          tool('auto-rotate-after-explode', 'auto_rotate', '拆解后慢速旋转观察', { speed: 0.01, durationMs: 2600 }),
        ],
      ),
    ];
  }

  return {
    topic: String(raw?.topic || fallback.topic),
    modelId,
    steps: finalSteps,
    summaryFocus: Array.isArray(raw?.summaryFocus) ? raw.summaryFocus.map(String).slice(0, 4) : fallback.summaryFocus,
  };
};

const callDeepSeek = async (messages: DeepSeekMessage[], fallbackText: string): Promise<string> => {
  const env = (import.meta as any).env || {};
  const apiKey = env.VITE_DEEPSEEK_API_KEY;
  if (!apiKey) return fallbackText;

  const response = await fetch(DEEPSEEK_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: env.VITE_DEEPSEEK_MODEL || 'deepseek-chat',
      messages,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek request failed: ${response.status}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || fallbackText;
};

export const buildTeachingPlan = async (request: string): Promise<AgentPlan> => {
  const fallback = createFallbackPlan(request);
  const fallbackText = JSON.stringify(fallback);

  try {
    const content = await callDeepSeek([
      {
        role: 'system',
        content: [
          '你是慧视课堂的理解规划Agent。',
          '请把用户的教学需求转成可执行的3D教具演示计划。',
          '只能输出JSON对象，不要输出Markdown。',
          'modelId只能是 heart, biodigital_heart, hiv, diamond, pubchem_6233, earth_layers, terrain 之一。',
          '工具名只能是 load_model, auto_rotate, auto_zoom, explode_model, enable_gesture, set_teacher_log。',
          'explode_model用于自主拆解散开，必须给 strength 和 spacing。',
          '地球内部结构拆解后必须保持四层分离展示，不要调用reset_model_layout或生成恢复原样的步骤。',
          '每个步骤包含 id, title, narration, toolCalls。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: `教学需求：${request}`,
      },
    ], fallbackText);

    return normalizePlan(JSON.parse(content), request);
  } catch (error) {
    console.warn('Planner Agent fallback:', error);
    return fallback;
  }
};

export const buildClassroomSummary = async (request: string, plan: AgentPlan, executedLogs: string[]): Promise<string> => {
  const fallback = [
    `课堂小结：本次围绕“${plan.topic}”完成了${modelNames[plan.modelId]}的互动演示。`,
    '学生应能说出核心结构名称，描述整体与局部的空间关系，并理解拆解观察比静态图片更适合建立三维概念。',
    `演示记录：${executedLogs.slice(-4).join('；')}`,
  ].join('\n');

  try {
    const content = await callDeepSeek([
      {
        role: 'system',
        content: '你是学情评估Agent。请输出JSON对象，字段summary为中文课堂小结，语气像教师课后记录，80到140字。',
      },
      {
        role: 'user',
        content: JSON.stringify({
          teachingRequest: request,
          planTopic: plan.topic,
          model: modelNames[plan.modelId],
          executedLogs,
          summaryFocus: plan.summaryFocus,
        }),
      },
    ], JSON.stringify({ summary: fallback }));

    const parsed = JSON.parse(content);
    return String(parsed.summary || fallback);
  } catch (error) {
    console.warn('Evaluator Agent fallback:', error);
    return fallback;
  }
};
