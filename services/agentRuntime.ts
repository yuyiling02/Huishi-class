import type {
  AgentPlan,
  AgentPlanStep,
  AgentToolCall,
  FollowUpQuestion,
  FollowUpResult,
  OrchestratorDecision,
  TeachingModelId,
} from '../types.ts';
import { createQuizSession } from './quizData.ts';
import { readPartialJsonString } from './speechTextProcessing.ts';

type DeepSeekMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type AiTask = 'orchestrator' | 'planner' | 'explanation' | 'followup';

const modelNames: Record<TeachingModelId, string> = {
  heart: '心脏模型1',
  biodigital_heart: '心脏模型2',
  hiv: 'HIV 病毒模型',
  diamond: '金刚石模型',
  diamond_unit_cell: '金刚石晶胞',
  pubchem_6233: '1,4-二氯甲基苯',
  earth_layers: '地球内部结构',
  terrain: '地形地貌',
  nacl: 'NaCl 离子晶体',
  sio2: 'SiO₂ 二氧化硅网络',
  nitrobenzene: '硝基苯',
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
  if (/心脏(?:模型)?2|BioDigital|网页/i.test(request)) return 'biodigital_heart';
  if (/心脏|心房|心室|瓣膜|主动脉|静脉|动脉|心肌|冠状|血液|循环|人体|生物/.test(request)) return 'heart';
  if (/地形|地貌|高原|山地|盆地|平原|丘陵|河流|三角洲/.test(request)) return 'terrain';
  if (/地球|地壳|地幔|外核|内核|板块/.test(request)) return 'earth_layers';
  if (/病毒|HIV|免疫/i.test(request)) return 'hiv';
  if (/6233|PubChem|NIH3D|BAS|二氯甲基/i.test(request)) return 'pubchem_6233';
  if (/金刚石晶胞|钻石晶胞|diamond\s*unit\s*cell|CB_NIH3D|晶胞/i.test(request)) return 'diamond_unit_cell';
  if (/NaCl|离子晶体|氯化钠|食盐/i.test(request)) return 'nacl';
  if (/SiO2|二氧化硅|石英|硅氧|原子晶体/i.test(request)) return 'sio2';
  if (/硝基苯|nitrobenzene|7416/i.test(request)) return 'nitrobenzene';
  if (/金刚石|钻石|碳原子|晶体|化学|分子/.test(request)) return 'diamond';
  return null;
};

const pickModel = (request: string): TeachingModelId => detectRequestedModel(request) ?? 'earth_layers';

export const inferTeachingModel = (request: string): TeachingModelId => pickModel(request);

export const getTeachingModelName = (modelId: TeachingModelId): string => modelNames[modelId];

const supportsModelDisassembly = (modelId: TeachingModelId): boolean => ![
  'biodigital_heart',
  'diamond',
  'diamond_unit_cell',
].includes(modelId);

export const getAutonomousDisassemblyArgs = (
  modelId: TeachingModelId,
  args: Record<string, unknown> = {},
): Record<string, unknown> => {
  if (modelId !== 'heart') return args;

  const requestedStrength = Number(args.strength ?? 0.18);
  const requestedSpacing = Number(args.spacing ?? 0.17);

  return {
    ...args,
    strength: Math.min(Number.isFinite(requestedStrength) ? requestedStrength : 0.18, 0.18),
    spacing: Math.min(Number.isFinite(requestedSpacing) ? requestedSpacing : 0.17, 0.17),
  };
};

const createFallbackPlan = (request: string): AgentPlan => {
  const modelId = pickModel(request);
  const modelName = modelNames[modelId];
  const supportsDisassembly = supportsModelDisassembly(modelId);

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
            tool('explode', 'explode_model', '模型自主拆解散开', getAutonomousDisassemblyArgs(modelId, { strength: 0.95, spacing: 1.15 })),
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
          : call.name === 'explode_model'
            ? getAutonomousDisassemblyArgs(modelId, typeof call.args === 'object' && call.args ? call.args : {})
            : (typeof call.args === 'object' && call.args ? call.args : {}),
      ))
      .filter((call) => supportsModelDisassembly(modelId) || call.name !== 'explode_model');

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
  const shouldDisassemble = supportsModelDisassembly(modelId);
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
          tool('auto-explode', 'explode_model', `拆解${modelNames[modelId]}`, getAutonomousDisassemblyArgs(modelId, { strength: 0.95, spacing: 1.15, durationMs: 1800 })),
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

const callDeepSeek = async (
  messages: DeepSeekMessage[],
  fallbackText: string,
  signal?: AbortSignal,
  task: AiTask = 'planner',
  sessionId?: number | null,
): Promise<string> => {
  const response = await fetch('/api/ai/completion', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ task, messages, jsonMode: true, sessionId }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`DeepSeek request failed: ${response.status}`);
  }

  const data = await response.json();
  return data?.content || fallbackText;
};

const callDeepSeekStream = async (
  messages: DeepSeekMessage[],
  onToken: (token: string) => void,
  onDone: (fullText: string) => void,
  onError: (error: Error) => void,
  signal?: AbortSignal,
  jsonMode = false,
  task: AiTask = 'explanation',
  sessionId?: number | null,
): Promise<void> => {
  try {
    const response = await fetch('/api/ai/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ task, messages, jsonMode, sessionId }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`DeepSeek stream request failed: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let accumulated = '';
    let buffer = '';

    const processLines = () => {
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const content = parsed?.choices?.[0]?.delta?.content || '';
          if (content) {
            accumulated += content;
            onToken(content);
          }
        } catch {
          // skip malformed JSON lines
        }
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      processLines();
    }
    // flush remaining buffer
    processLines();
    onDone(accumulated);
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)));
  }
};

export const buildTeachingPlan = async (request: string, signal?: AbortSignal): Promise<AgentPlan> => {
  const fallback = createFallbackPlan(request);
  const fallbackText = JSON.stringify(fallback);

  try {
    const content = await callDeepSeek([
      {
        role: 'system',
        content: [
          '你是数智课堂的理解规划Agent。',
          '请把用户的教学需求转成可执行的3D教具演示计划。',
          '只能输出JSON对象，不要输出Markdown。',
          'modelId只能是 heart, biodigital_heart, hiv, diamond, diamond_unit_cell, pubchem_6233, earth_layers, terrain, nacl, sio2, nitrobenzene 之一。',
          '工具名只能是 load_model, auto_rotate, auto_zoom, explode_model, enable_gesture, set_teacher_log。',
          'explode_model用于自主拆解散开，必须给 strength 和 spacing。',
          '金刚石模型和金刚石晶胞是完整结构展示，禁止调用explode_model。',
          '地球内部结构拆解后必须保持四层分离展示，不要调用reset_model_layout或生成恢复原样的步骤。',
          '每个步骤包含 id, title, narration, toolCalls。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: `教学需求：${request}`,
      },
    ], fallbackText, signal);

    return normalizePlan(JSON.parse(content), request);
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    console.warn('Planner Agent fallback:', error);
    return fallback;
  }
};

type OrchestratorContext = {
  currentModelId?: TeachingModelId | null;
  currentModelName?: string;
  hasModel?: boolean;
  sessionId?: number | null;
};

const hasExplicitModelGenerationIntent = (request: string): boolean => (
  /建模|生成模型|图生|文生|创建\s*3d|创建模型|做模型/i.test(request)
);

const hasTeachingDemoIntent = (request: string): boolean => (
  /讲解|介绍|演示|教学|分析|展示|学习|看看|看一下|查看/.test(request)
);

const hasDirectModelSwitchIntent = (request: string): boolean => (
  /切换|切到|换成|换到|打开|加载|载入|调出/.test(request)
);

const isDeterministicBuiltInModelRequest = (request: string): boolean => (
  detectRequestedModel(request) !== null
  && (hasTeachingDemoIntent(request) || hasDirectModelSwitchIntent(request))
);

const DEEPSEEK_UNAVAILABLE_RESPONSE = '我刚刚没有连上大模型，请检查 DeepSeek 配置后再问我一次。';

const directClassroomDecision = (request: string): OrchestratorDecision | null => {
  const text = request.trim().replace(/[，。！？、,.!?；;：:\s]+/g, '');
  const gestureTarget = '(?:手势(?:操纵|操作|控制|捕捉|识别)?|摄像头)';
  const disableGesture = new RegExp(`(?:关闭|关掉|停用|禁用|停止|取消)(?:一下)?${gestureTarget}|${gestureTarget}(?:关闭|关掉|停用|禁用|停止|取消)`);
  const enableGesture = new RegExp(`(?:开启|打开|启用|启动)(?:一下)?${gestureTarget}|${gestureTarget}(?:开启|打开|启用|启动)`);
  const commandPrefix = '(?:小智)?(?:请|帮我|麻烦)?(?:把|将)?';
  const enterFullscreen = new RegExp(`^${commandPrefix}(?:(?:进入|打开|切换到|切到)?(?:展示区|模型|画面)?全屏(?:展示|模式)?|(?:展示区|模型|画面)?(?:进入|打开|切换到|切到)全屏(?:展示|模式)?|放大展示)(?:一下)?$`);
  const exitFullscreen = new RegExp(`^${commandPrefix}(?:(?:取消|退出|关闭|结束)(?:展示区|模型|画面)?全屏(?:展示|模式)?|(?:展示区|模型|画面)?(?:取消|退出|关闭)全屏(?:展示|模式)?|(?:切回|恢复)(?:窗口|小屏)|小屏|恢复窗口)(?:一下)?$`);
  const shortControlText = text.length <= 12;

  if (exitFullscreen.test(text)) {
    return {
      action: 'control_model',
      response: '好的，我来退出全屏展示。',
      request,
      toolCalls: [tool('xiaozhi-exit-fullscreen', 'exit_fullscreen', '退出展示区全屏')],
    };
  }

  if (enterFullscreen.test(text)) {
    return {
      action: 'control_model',
      response: '好的，我来进入展示区全屏。',
      request,
      toolCalls: [tool('xiaozhi-enter-fullscreen', 'enter_fullscreen', '进入展示区全屏')],
    };
  }

  if (disableGesture.test(text)) {
    return {
      action: 'control_model',
      response: '好的，手势操纵已关闭。',
      request,
      toolCalls: [tool('xiaozhi-gesture-off', 'disable_gesture', '关闭手势操纵')],
    };
  }

  if (enableGesture.test(text)) {
    return {
      action: 'control_model',
      response: '好的，手势操纵已开启。',
      request,
      toolCalls: [tool('xiaozhi-gesture-on', 'enable_gesture', '开启手势操纵')],
    };
  }

  if (/(?:切换|打开|进入|显示|回到)(?:一下|至|到)?(?:学科)?资源库/.test(text)) {
    return {
      action: 'control_model',
      response: '好的，已切换到学科资源库。',
      request,
      toolCalls: [tool('xiaozhi-open-resources', 'switch_sidebar', '切换到学科资源库', { tab: 'resource' })],
    };
  }

  if (/(?:切换|打开|进入|显示|回到)(?:一下|至|到)?多智能体(?:平台|面板|协作台)?/.test(text)) {
    return {
      action: 'control_model',
      response: '好的，已切换到多智能体平台。',
      request,
      toolCalls: [tool('xiaozhi-open-agents', 'switch_sidebar', '切换到多智能体平台', { tab: 'agent' })],
    };
  }

  if (shortControlText && /^(?:再)?(?:放大|拉近|靠近|大一点|大一些)(?:一点|一些|一下)?$/.test(text)) {
    return {
      action: 'control_model',
      response: '收到，我把视角拉近一点，方便你看细节。',
      request,
      toolCalls: [tool('xiaozhi-zoom-in', 'auto_zoom', '放大观察', { direction: 'in', durationMs: 1000 })],
    };
  }

  if (shortControlText && /^(?:再)?(?:缩小|拉远|远一点|远一些|小一点|小一些)(?:一点|一些|一下)?$/.test(text)) {
    return {
      action: 'control_model',
      response: '好，我把视角拉远一点，让整体结构更清楚。',
      request,
      toolCalls: [tool('xiaozhi-zoom-out', 'auto_zoom', '缩小观察', { direction: 'out', durationMs: 1000 })],
    };
  }

  if (shortControlText && /^(?:停止|暂停|停下|停掉|关闭|不要|别)(?:自动)?(?:旋转|转动|转起来|转)?$/.test(text)) {
    return {
      action: 'control_model',
      response: '好的，模型已经停止旋转。',
      request,
      toolCalls: [tool('xiaozhi-stop-rotate', 'auto_rotate', '停止旋转', { speed: 0, durationMs: 200 })],
    };
  }

  if (shortControlText && /^(?:继续)?(?:旋转|转动|转一转|转一下|转起来|转圈)$/.test(text)) {
    return {
      action: 'control_model',
      response: '来啦，我让模型慢慢转起来。',
      request,
      toolCalls: [tool('xiaozhi-rotate', 'auto_rotate', '旋转观察', { speed: 0.016, durationMs: 2200 })],
    };
  }

  return null;
};

export const detectDirectClassroomCommand = (request: string): OrchestratorDecision | null => (
  directClassroomDecision(request)
);

const normalizeOrchestratorDecision = (raw: any, request: string): OrchestratorDecision => {
  const fallbackModelId = inferTeachingModel(request);
  const action = String(raw?.action || '').trim();
  const allowedActions = new Set(['teach_demo', 'switch_model', 'answer', 'open_model_generation', 'start_quiz', 'control_model']);
  const normalizedAction = allowedActions.has(action) ? action as OrchestratorDecision['action'] : 'teach_demo';

  // Opening the generation workspace is disruptive, so never infer it merely from
  // a built-in model name such as "心脏模型". It requires an explicit creation verb.
  if (normalizedAction === 'open_model_generation' && !hasExplicitModelGenerationIntent(request)) {
    return createFallbackOrchestratorDecision(request);
  }

  const rawModelId = raw?.modelId && modelNames[raw.modelId as TeachingModelId]
    ? raw.modelId as TeachingModelId
    : undefined;
  const rawTools = Array.isArray(raw?.toolCalls) ? raw.toolCalls : [];
  const allowedControlTools = new Set<AgentToolCall['name']>([
    'auto_rotate',
    'auto_zoom',
    'explode_model',
    'reset_model_layout',
    'enable_gesture',
    'disable_gesture',
    'enter_fullscreen',
    'exit_fullscreen',
    'switch_sidebar',
    'set_teacher_log',
  ]);
  const toolCalls = rawTools
    .filter((call: any) => typeof call?.name === 'string' && allowedControlTools.has(call.name))
    .slice(0, 4)
    .map((call: any, index: number) => tool(
      String(call.id || `xiaozhi-tool-${index}`),
      call.name,
      String(call.label || call.name),
      typeof call.args === 'object' && call.args ? call.args : {},
    ));

  return {
    action: normalizedAction,
    response: String(raw?.response || '好的，我来安排。'),
    request: String(raw?.request || request),
    modelId: rawModelId || (normalizedAction === 'teach_demo' || normalizedAction === 'switch_model' ? fallbackModelId : undefined),
    toolCalls: normalizedAction === 'switch_model' ? [] : toolCalls,
  };
};

const createFallbackOrchestratorDecision = (
  request: string,
  context: OrchestratorContext = {},
): OrchestratorDecision => {
  const text = request.trim();

  const directDecision = directClassroomDecision(text);
  if (directDecision) return directDecision;

  if (hasExplicitModelGenerationIntent(text)) {
    return {
      action: 'open_model_generation',
      response: '好呀，我带你去 3D 建模工作台，把想法变成可以转起来看的模型。',
      request: text,
    };
  }

  if (/答题|考考|提问|小测|问题|追问/.test(text)) {
    return {
      action: 'start_quiz',
      response: '没问题，小智来出一题轻松的小挑战。',
      request: text,
      modelId: context.currentModelId || inferTeachingModel(text),
    };
  }

  const requestedModel = detectRequestedModel(text);
  if (requestedModel && hasTeachingDemoIntent(text)) {
    return {
      action: 'teach_demo',
      response: `好呀，小智会先规划路线，再带你观察${modelNames[requestedModel]}。`,
      request: text,
      modelId: requestedModel,
    };
  }

  if (requestedModel && hasDirectModelSwitchIntent(text)) {
    const alreadyActive = context.currentModelId === requestedModel;
    return {
      action: 'switch_model',
      response: alreadyActive
        ? `${modelNames[requestedModel]}已经在展示中了。`
        : `好的，已为你切换到${modelNames[requestedModel]}。`,
      request: text,
      modelId: requestedModel,
      toolCalls: [],
    };
  }

  if (/放大|靠近/.test(text)) {
    return {
      action: 'control_model',
      response: '收到，我把视角拉近一点，方便你看细节。',
      request: text,
      toolCalls: [tool('xiaozhi-zoom-in', 'auto_zoom', '放大观察', { direction: 'in', durationMs: 1000 })],
    };
  }

  if (/缩小|拉远|远一点/.test(text)) {
    return {
      action: 'control_model',
      response: '好，我把视角拉远一点，让整体结构更清楚。',
      request: text,
      toolCalls: [tool('xiaozhi-zoom-out', 'auto_zoom', '缩小观察', { direction: 'out', durationMs: 1000 })],
    };
  }

  if (/旋转|转一转|转动/.test(text)) {
    return {
      action: 'control_model',
      response: '来啦，我让模型慢慢转起来。',
      request: text,
      toolCalls: [tool('xiaozhi-rotate', 'auto_rotate', '旋转观察', { speed: 0.016, durationMs: 2200 })],
    };
  }

  if (/讲解|展示|演示|学习|看看|介绍|结构|模型/.test(text)) {
    const modelId = inferTeachingModel(text);
    return {
      action: 'teach_demo',
      response: `好呀，小智会先规划路线，再带你观察${modelNames[modelId]}。`,
      request: text,
      modelId,
    };
  }

  return {
    action: 'answer',
    response: DEEPSEEK_UNAVAILABLE_RESPONSE,
    request: text,
  };
};

export const buildOrchestratorDecision = async (
  request: string,
  context: OrchestratorContext = {},
  signal?: AbortSignal,
  onResponseToken?: (token: string) => void,
): Promise<OrchestratorDecision> => {
  const fallback = createFallbackOrchestratorDecision(request, context);
  const fallbackText = JSON.stringify(fallback);

  const directDecision = directClassroomDecision(request);
  if (directDecision) {
    onResponseToken?.(directDecision.response);
    return directDecision;
  }

  // Model selection commands are unambiguous and should not be reclassified by
  // the LLM. This also prevents a wrong streamed response from being spoken before
  // the final action is normalized.
  if (isDeterministicBuiltInModelRequest(request) && !hasExplicitModelGenerationIntent(request)) {
    onResponseToken?.(fallback.response);
    return fallback;
  }

  const messages: DeepSeekMessage[] = [
      {
        role: 'system',
        content: [
          '你是“小智”，数智课堂的总调度 AI 老师。',
          '你负责理解学生或老师的自然语言需求，并调度规划 agent、执行 agent、讲解 agent、追问 agent 完成课堂任务。',
          '你的目标是让学生在 3D 建模和模型互动中边玩边学。',
          '回答课外问题、身份问题或开放式聊天时，也要以“小智”的背景自然回答：你是由数智课堂系统、语音识别、3D交互工具和 DeepSeek 大模型能力共同组成的课堂 AI 助手。',
          '你说话像真实老师或学习助手：清楚、耐心、亲切，有一点活泼幽默，但不啰嗦。',
          '遇到可执行的课堂任务时，先规划，再调用工具执行，再用学生能听懂的话讲解结果。',
          '不要暴露内部 JSON、工具细节或密钥。默认使用中文回答。',
          '只能输出JSON对象，不要输出Markdown。',
          'action只能是 teach_demo, switch_model, answer, open_model_generation, start_quiz, control_model 之一。',
          '用户说切换、切到、换成、打开、加载、载入或调出某个内置模型，且没有讲解意图时，必须使用switch_model，只切换模型，不调用其他agent或工具。',
          '用户说讲解、介绍、演示、教学、分析、展示、学习或查看某个模型时，必须使用teach_demo；同时出现切换词和讲解词时，teach_demo优先。',
          '只有用户明确说建模、生成模型或创建模型时，才能使用open_model_generation。',
          'modelId只能是 heart, biodigital_heart, hiv, diamond, diamond_unit_cell, pubchem_6233, earth_layers, terrain, nacl, sio2, nitrobenzene 之一。',
          'control_model 的 toolCalls 工具名只能是 auto_rotate, auto_zoom, explode_model, reset_model_layout, enable_gesture, disable_gesture, enter_fullscreen, exit_fullscreen, switch_sidebar, set_teacher_log。',
          '用户要求开启或关闭手势时分别调用enable_gesture或disable_gesture；用户要求全屏展示时调用enter_fullscreen，要求取消全屏、退出全屏、小屏或恢复窗口时调用exit_fullscreen；用户要求切换学科资源库或多智能体平台时调用switch_sidebar，tab分别为resource或agent。',
          '普通知识问答、课外问题、身份问题和闲聊必须使用answer，并在response中直接回答；不要用“我听到啦”开头复述用户原话。',
          '必须先输出response字段，以便语音系统尽快开始朗读。',
          '输出结构：{ "response": "给用户听的简短回应", "action": "...", "request": "后续agent要处理的教学需求", "modelId": "...", "toolCalls": [] }',
        ].join('\n'),
      },
      {
        role: 'user',
        content: `用户输入：${request}\n当前上下文：${JSON.stringify(context)}`,
      },
    ];

  if (onResponseToken) {
    return new Promise<OrchestratorDecision>((resolve, reject) => {
      let streamedJson = '';
      let emittedResponse = '';
      callDeepSeekStream(
        messages,
        (token) => {
          streamedJson += token;
          const partialResponse = readPartialJsonString(streamedJson, 'response');
          if (partialResponse.length > emittedResponse.length) {
            onResponseToken(partialResponse.slice(emittedResponse.length));
            emittedResponse = partialResponse;
          }
        },
        (fullText) => {
          try {
            const decision = normalizeOrchestratorDecision(JSON.parse(fullText), request);
            if (decision.response.length > emittedResponse.length && decision.response.startsWith(emittedResponse)) {
              onResponseToken(decision.response.slice(emittedResponse.length));
            }
            resolve(decision);
          } catch (error) {
            console.warn('Orchestrator Agent stream fallback:', error);
            if (!emittedResponse) onResponseToken(fallback.response);
            resolve(fallback);
          }
        },
        (error) => {
          if (error.name === 'AbortError') reject(error);
          else {
            console.warn('Orchestrator Agent stream fallback:', error);
            if (!emittedResponse) onResponseToken(fallback.response);
            resolve(fallback);
          }
        },
        signal,
        true,
        'orchestrator',
        context.sessionId,
      );
    });
  }

  try {
    const content = await callDeepSeek(messages, fallbackText, signal, 'orchestrator', context.sessionId);

    return normalizeOrchestratorDecision(JSON.parse(content), request);
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    console.warn('Orchestrator Agent fallback:', error);
    return fallback;
  }
};

export const buildKnowledgeExplanation = async (
  request: string,
  modelId: TeachingModelId,
  onToken: (token: string) => void,
  signal?: AbortSignal,
): Promise<string> => {
  const modelName = modelNames[modelId] || '3D模型';
  const fallback = `${modelName}是一个用于教学演示的三维模型。它展示了内部结构和层次关系，可以帮助学生建立空间认知。请结合3D演示进行观察，注意各部件之间的位置关系和连接方式。拆解展示可以更清晰地看到内部细节。`;

  return new Promise<string>((resolve, reject) => {
    callDeepSeekStream(
      [
        {
          role: 'system',
          content: [
            '你是数智课堂的知识讲解Agent。',
            '根据用户的教学需求和当前展示的3D模型，生成适合中学生理解的教学知识内容。',
            '语气像课堂老师讲解，通俗易懂，内容准确、有条理。',
            '用纯文本输出，不要使用JSON或Markdown格式。',
            '控制在200-400字之间。',
          ].join('\n'),
        },
        {
          role: 'user',
          content: `当前模型：${modelName}\n教学需求：${request}\n请生成知识讲解内容。`,
        },
      ],
      onToken,
      (fullText) => resolve(fullText || fallback),
      (error) => error.name === 'AbortError' ? reject(error) : resolve(fallback),
      signal,
      false,
      'explanation',
    );
  });
};

type FollowUpContext = {
  modelId?: TeachingModelId | null;
  modelUrl?: string | null;
  modelName?: string;
  topic?: string;
};

const fallbackFollowUpQuestion = (context: FollowUpContext = {}): FollowUpQuestion => {
  const session = createQuizSession(1, context.modelUrl || undefined);
  const quizQuestion = session.questions[0] || createQuizSession(1, '/models/earth-layers.glb').questions[0];

  const fallbackOptions = (quizQuestion.options || []).slice(0, 2) as [string, string];
  const safeCorrect = quizQuestion.correctIndex >= 0 && quizQuestion.correctIndex < 2 ? quizQuestion.correctIndex as 0 | 1 : 0;

  return {
    id: `fallback-${quizQuestion.id}`,
    subject: quizQuestion.subject,
    question: quizQuestion.question,
    options: fallbackOptions,
    correctIndex: safeCorrect,
    explanation: quizQuestion.explanation,
  };
};

const normalizeFollowUpQuestion = (raw: any, context: FollowUpContext = {}): FollowUpQuestion => {
  const fallback = fallbackFollowUpQuestion(context);
  const options = Array.isArray(raw?.options) ? raw.options.map(String).slice(0, 2) : fallback.options;
  const correctIndex = Number(raw?.correctIndex);

  return {
    id: String(raw?.id || `questioner-${Date.now()}`),
    subject: String(raw?.subject || context.modelName || fallback.subject),
    question: String(raw?.question || fallback.question).slice(0, 80),
    options: options.length === 2 ? [options[0], options[1]] : fallback.options,
    correctIndex: correctIndex === 0 || correctIndex === 1 ? correctIndex : fallback.correctIndex,
    explanation: String(raw?.explanation || fallback.explanation),
  };
};

export const buildFollowUpQuestion = async (
  context: FollowUpContext = {},
  signal?: AbortSignal,
): Promise<FollowUpQuestion> => {
  const fallback = fallbackFollowUpQuestion(context);
  const fallbackText = JSON.stringify(fallback);

  try {
    const content = await callDeepSeek([
      {
        role: 'system',
        content: [
          '你是一个活泼可爱的教师助手，刚刚向学生展示了当前 3D 画面。',
          '请根据当前画面，向学生提出一个轻松有趣的单选题，不超过 50 个字，并给出两个选项、正确答案和解释。',
          '语气要鼓励学生，像在陪他边玩边学。',
          '只能输出JSON对象，不要输出Markdown。',
          '输出结构：{ "subject": "主题", "question": "题目", "options": ["A选项", "B选项"], "correctIndex": 0, "explanation": "解释" }',
        ].join('\n'),
      },
      {
        role: 'user',
        content: `当前模型/画面：${JSON.stringify(context)}`,
      },
    ], fallbackText, signal, 'followup');

    return normalizeFollowUpQuestion(JSON.parse(content), context);
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    console.warn('Questioner Agent fallback:', error);
    return fallback;
  }
};

export const judgeFollowUpAnswer = (
  question: FollowUpQuestion,
  selectedIndex: 0 | 1,
): FollowUpResult => {
  const isCorrect = selectedIndex === question.correctIndex;
  const correctOption = question.options[question.correctIndex];

  return {
    selectedIndex,
    isCorrect,
    feedback: isCorrect
      ? `答对啦，很棒！${question.explanation}`
      : `差一点点，没关系。正确答案是${question.correctIndex === 0 ? 'A' : 'B'}：${correctOption}。${question.explanation}`,
  };
};
