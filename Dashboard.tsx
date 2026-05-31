
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { AgentRole, AgentStatus, AgentTimelineItem, AgentToolCall, GestureType, MoveDirection, ControlRefs, InteractionMode, TeachingModelId } from './types';
import { ProcessingOverlay } from './components/UIComponents';
import HandController from './components/HandController';
import ModelViewer from './components/ModelViewer';
import BioDigitalViewer from './components/BioDigitalViewer';
import VoiceController from './components/VoiceController';
import { buildTeachingPlan, getTeachingModelName, inferTeachingModel, buildKnowledgeExplanation } from './services/agentRuntime';
import { Sparkles, Box, Atom, Globe, ChevronDown, ChevronLeft, ChevronRight, MessageSquare, Hand, ScanFace, Move3d, Maximize2, Minimize2, FlaskConical, Heart, Settings, X, ClipboardCheck, Loader2, Play, Download } from 'lucide-react';
import { ModelType } from './types';

const ENABLE_GEMINI = (import.meta as any).env?.VITE_ENABLE_GEMINI === 'true';
const BIODIGITAL_HEART_URL = 'https://human.biodigital.com/view?id=7F0a&lang=zh&ref=share';
const BUILT_IN_MODELS = {
  heart: '/models/心脏模型.glb',
  hiv: '/models/hiv-virus.glb',
  diamond: '/models/diamond.glb',
  diamondUnitCell: '/models/diamond-unit-cell_NIH3D.glb',
  pubchem6233: '/models/pubchem-6233-bas-color-print_NIH3D.glb',
  nacl: '/models/nacl-crystal.glb',
  sio2: '/models/sio2-crystal.glb',
  nitrobenzene: '/models/7416-bas-color-print_NIH3D.glb',
} as const;
const DIAMOND_STRUCTURE_IMAGE = '/images/diamond-structure.png';
const DICHLOROTOLUENE_STRUCTURE_IMAGE = '/images/dichlorotoluene-structure.png';
const NITROBENZENE_STRUCTURE_IMAGE = '/images/nitrobenzene-structure.svg';
const HEART_STRUCTURE_IMAGE = '/images/heart-structure.png';
const HIV_STRUCTURE_IMAGE = '/images/hiv-structure.png';
const EARTH_LAYERS_IMAGE = '/images/earth-layers-diagram.png';
const TERRAIN_TOPOGRAPHY_IMAGE = '/images/terrain-topography-diagram.png';
const STRUCTURE_IMAGE_BY_MODEL: Record<string, string> = {
  [BUILT_IN_MODELS.heart]: HEART_STRUCTURE_IMAGE,
  [BUILT_IN_MODELS.hiv]: HIV_STRUCTURE_IMAGE,
  [BUILT_IN_MODELS.diamond]: DIAMOND_STRUCTURE_IMAGE,
  [BUILT_IN_MODELS.diamondUnitCell]: DIAMOND_STRUCTURE_IMAGE,
  [BUILT_IN_MODELS.pubchem6233]: DICHLOROTOLUENE_STRUCTURE_IMAGE,
  [BUILT_IN_MODELS.nitrobenzene]: NITROBENZENE_STRUCTURE_IMAGE,
  '/models/earth-layers.glb': EARTH_LAYERS_IMAGE,
  '/models/terrain-topography.glb': TERRAIN_TOPOGRAPHY_IMAGE,
};
type ActiveContent = 'model' | 'biodigital';

const AGENT_STATUS_IDLE: Record<AgentRole, AgentStatus> = {
  planner: 'idle',
  executor: 'idle',
  evaluator: 'idle',
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const RECONSTRUCTION_STEPS = [
  "正在提取教具视觉特征...",
  "计算空间拓扑结构...",
  "构建 3D 教材网格...",
  "渲染物理贴图...",
  "导出交互式 GLB 模型"
];

const App: React.FC = () => {
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [modelType, setModelType] = useState<ModelType>('glb');
  const [modelAssetUrls, setModelAssetUrls] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState<string>('');
  const [cameraActive, setCameraActive] = useState(false);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('dual');
  const [activeContent, setActiveContent] = useState<ActiveContent>('model');
  const [isStageFullscreen, setIsStageFullscreen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['地理']));
  const [sidebarTab, setSidebarTab] = useState<'resource' | 'agent'>('resource');
  const [sidebarAgentRequest, setSidebarAgentRequest] = useState('讲解地球内部结构，展示地壳、地幔、外核和内核的关系');

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [aiAnalysis, setAiAnalysis] = useState('等待指令中...');

  // Hand/Voice state
  const [gestureStatus, setGestureStatus] = useState<GestureType>(GestureType.NONE);
  const [directionStatus, setDirectionStatus] = useState<MoveDirection>(MoveDirection.CENTER);
  const [isDragging, setIsDragging] = useState(false);

  // Interaction speed settings
  const [showSettings, setShowSettings] = useState(false);
  const [zoomSpeedMultiplier, setZoomSpeedMultiplier] = useState(0.8);
  const [rotationSpeedMultiplier, setRotationSpeedMultiplier] = useState(0.5);
  const [showLabels, setShowLabels] = useState(false);
  const [agentStatuses, setAgentStatuses] = useState<Record<AgentRole, AgentStatus>>(AGENT_STATUS_IDLE);
  const [agentTimeline, setAgentTimeline] = useState<AgentTimelineItem[]>([]);
  const [agentSummary, setAgentSummary] = useState('');
  const [agentThinking, setAgentThinking] = useState('');
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [expandedStructureImage, setExpandedStructureImage] = useState<string | null>(null);
  const [knowledgeContent, setKnowledgeContent] = useState('');
  const [isKnowledgeStreaming, setIsKnowledgeStreaming] = useState(false);
  const [handNearStructureImage, setHandNearStructureImage] = useState(false);
  const [isHandExpanded, setIsHandExpanded] = useState(false);
  const structureImageRef = useRef<HTMLButtonElement>(null);
  const knowledgeSpeechBufferRef = useRef('');
  const knowledgeSpeechClosedRef = useRef(false);
  const knowledgeSpeechSessionRef = useRef(0);
  const modelStructureImage = activeContent === 'model' && modelUrl
    ? STRUCTURE_IMAGE_BY_MODEL[modelUrl]
    : undefined;

  const resetKnowledgeSpeech = useCallback(() => {
    knowledgeSpeechBufferRef.current = '';
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const speakKnowledgeSegment = useCallback((text: string) => {
    const segment = text.trim();
    if (!segment || knowledgeSpeechClosedRef.current || !('speechSynthesis' in window)) return;

    const utterance = new SpeechSynthesisUtterance(segment);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    const zhVoice = window.speechSynthesis.getVoices().find((voice) => voice.lang.startsWith('zh'));
    if (zhVoice) utterance.voice = zhVoice;
    window.speechSynthesis.speak(utterance);
  }, []);

  const enqueueKnowledgeSpeech = useCallback((text: string) => {
    if (knowledgeSpeechClosedRef.current) return;
    let buffer = knowledgeSpeechBufferRef.current + text;

    while (buffer) {
      const punctuationIndex = buffer.search(/[。！？!?；;\n]/);
      const shouldFlushLongSegment = punctuationIndex < 0 && buffer.trim().length >= 45;
      if (punctuationIndex < 0 && !shouldFlushLongSegment) break;

      const endIndex = punctuationIndex >= 0 ? punctuationIndex + 1 : buffer.length;
      speakKnowledgeSegment(buffer.slice(0, endIndex));
      buffer = buffer.slice(endIndex);
    }

    knowledgeSpeechBufferRef.current = buffer;
  }, [speakKnowledgeSegment]);

  const flushKnowledgeSpeech = useCallback(() => {
    const remaining = knowledgeSpeechBufferRef.current;
    knowledgeSpeechBufferRef.current = '';
    speakKnowledgeSegment(remaining);
  }, [speakKnowledgeSegment]);

  const closeKnowledgePanel = useCallback(() => {
    knowledgeSpeechClosedRef.current = true;
    setKnowledgeContent('');
    setIsKnowledgeStreaming(false);
    resetKnowledgeSpeech();
  }, [resetKnowledgeSpeech]);

  // Refs
  const preloadedModelRef = useRef<TeachingModelId | null>(null);
  const stageRef = useRef<HTMLElement>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const controlRef = useRef<ControlRefs>({
    rotationVelocity: { x: 0, y: 0 },
    zoomSpeed: 0,
    panPosition: { x: 0, y: 0 },
    isDragging: false,
    handLandmarks: { left: null, right: null },
    interactionHandLandmarks: null,
    handNDCPosition: null,
    interactionSettings: { zoomSpeed: 0.8, rotationSpeed: 0.5 },
    agentDisassembly: {
      enabled: false,
      strength: 0,
      spacing: 1.1,
      avoidOverlap: true,
      actionId: 0,
      label: ''
    }
  });

  useEffect(() => {
    if (expandedStructureImage && expandedStructureImage !== modelStructureImage) {
      setExpandedStructureImage(null);
    }
  }, [expandedStructureImage, modelStructureImage]);

  // Hand proximity: auto-expand structure image when virtual hand is near
  useEffect(() => {
    if (!modelStructureImage || !cameraActive) return;

    const checkProximity = () => {
      const handLm = controlRef.current.interactionHandLandmarks;
      if (!handLm || handLm.length < 9) {
        setHandNearStructureImage(false);
        return;
      }
      // Use index finger tip (landmark 8)
      const indexTip = handLm[8];
      if (!indexTip) {
        setHandNearStructureImage(false);
        return;
      }

      const stageEl = stageRef.current;
      if (!stageEl) {
        setHandNearStructureImage(false);
        return;
      }

      // Convert normalized [0,1] camera coordinates to stage-relative viewport pixels.
      // In fullscreen the stage fills the viewport; outside fullscreen it is offset by the app chrome/sidebar.
      const stageRect = stageEl.getBoundingClientRect();
      const screenX = stageRect.left + (1 - indexTip.x) * stageRect.width;
      const screenY = stageRect.top + indexTip.y * stageRect.height;

      const imgEl = structureImageRef.current;
      if (!imgEl) {
        setHandNearStructureImage(false);
        return;
      }

      const rect = imgEl.getBoundingClientRect();
      const margin = 2;
      const isNear = (
        screenX >= rect.left - margin &&
        screenX <= rect.right + margin &&
        screenY >= rect.top - margin &&
        screenY <= rect.bottom + margin
      );

      setHandNearStructureImage(isNear);
    };

    const intervalId = setInterval(checkProximity, 100);
    return () => clearInterval(intervalId);
  }, [modelStructureImage, cameraActive, controlRef]);

  // Sync hand proximity to image expansion
  useEffect(() => {
    if (handNearStructureImage && modelStructureImage) {
      setExpandedStructureImage(modelStructureImage);
      setIsHandExpanded(true);
    } else if (!handNearStructureImage && isHandExpanded) {
      setExpandedStructureImage(null);
      setIsHandExpanded(false);
    }
  }, [handNearStructureImage, modelStructureImage, isHandExpanded]);

  const resetControls = () => {
    const nextActionId = (controlRef.current.agentDisassembly?.actionId ?? 0) + 1;
    controlRef.current = {
      rotationVelocity: { x: 0, y: 0 },
      zoomSpeed: 0,
      panPosition: { x: 0, y: 0 },
      isDragging: false,
      handLandmarks: { left: null, right: null },
      interactionHandLandmarks: null,
      handNDCPosition: null,
      interactionSettings: {
        zoomSpeed: zoomSpeedMultiplier,
        rotationSpeed: rotationSpeedMultiplier,
      },
      agentDisassembly: {
        enabled: false,
        strength: 0,
        spacing: 1.1,
        avoidOverlap: true,
        actionId: nextActionId,
        label: ''
      }
    };
  };

  const revokeObjectUrls = () => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
  };

  useEffect(() => revokeObjectUrls, []);

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsStageFullscreen(document.fullscreenElement === stageRef.current);
    };

    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, []);

  const showModelStage = () => {
    setActiveContent('model');
  };

  const showBioDigitalStage = () => {
    setActiveContent('biodigital');
    setCameraActive(false);
    resetControls();
    setAiAnalysis('正在加载心脏模型2：URL 交互展示页面。');
  };

  const clearLocalModel = () => {
    setModelUrl(null);
    setModelType('glb');
    setModelAssetUrls({});
    setFileName('');
    resetControls();
  };

  const toggleStageFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await stageRef.current?.requestFullscreen();
      }
    } catch (error) {
      console.error('Fullscreen failed:', error);
      setAiAnalysis('当前浏览器阻止了全屏操作，请检查浏览器权限或手动使用浏览器全屏。');
    }
  };

  const handleModelUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const modelFile = files.find((file) => /\.(glb|gltf|fbx)$/i.test(file.name));
    if (modelFile) {
      revokeObjectUrls();
      showModelStage();

      const nextAssetUrls: Record<string, string> = {};
      files.forEach((file) => {
        const url = URL.createObjectURL(file);
        objectUrlsRef.current.push(url);
        nextAssetUrls[file.name] = url;
        nextAssetUrls[file.name.toLowerCase()] = url;
      });

      const url = nextAssetUrls[modelFile.name];
      const lowerName = modelFile.name.toLowerCase();
      const nextModelType: ModelType = lowerName.endsWith('.fbx') ? 'fbx' : lowerName.endsWith('.gltf') ? 'gltf' : 'glb';

      setModelUrl(url);
      setModelType(nextModelType);
      setModelAssetUrls(nextAssetUrls);
      setFileName(modelFile.name);
      resetControls();
      setCameraActive(true);
      setAiAnalysis(`模型已加载: ${modelFile.name}，将按内部层级自动启用拆解`);
      event.target.value = '';
    }
  };

  const loadDemoModel = (url: string, name: string, type: ModelType = 'glb') => {
    showModelStage();
    if (/^https?:\/\//i.test(url)) {
      setAiAnalysis('演示模型已切换为离线模式，请直接导入本地 GLB/GLTF/FBX 模型。');
      return;
    }
    setModelUrl(url);
    setModelType(type);
    setModelAssetUrls({});
    setFileName(name);
    resetControls();
    setAiAnalysis(`正在演示: ${name}`);
  };

  const loadHeartFallbackModel = () => {
    loadDemoModel(BUILT_IN_MODELS.heart, '心脏模型1', 'glb');
    setCameraActive(true);
  };

  const loadTeachingModel = (modelId: TeachingModelId) => {
    switch (modelId) {
      case 'heart':
        showModelStage();
        loadDemoModel(BUILT_IN_MODELS.heart, '心脏模型1', 'glb');
        setCameraActive(true);
        return;
      case 'biodigital_heart':
        showBioDigitalStage();
        return;
      case 'hiv':
        showModelStage();
        loadDemoModel(BUILT_IN_MODELS.hiv, 'HIV 病毒模型', 'glb');
        setCameraActive(true);
        return;
      case 'diamond':
        showModelStage();
        loadDemoModel(BUILT_IN_MODELS.diamond, '金刚石模型', 'glb');
        setCameraActive(true);
        return;
      case 'diamond_unit_cell':
        showModelStage();
        loadDemoModel(BUILT_IN_MODELS.diamondUnitCell, '金刚石晶胞', 'glb');
        setCameraActive(true);
        return;
      case 'pubchem_6233':
        showModelStage();
        loadDemoModel(BUILT_IN_MODELS.pubchem6233, '1,4-二氯甲基苯', 'glb');
        setCameraActive(true);
        return;
      case 'nacl':
        showModelStage();
        loadDemoModel(BUILT_IN_MODELS.nacl, 'NaCl 离子晶体', 'glb');
        setCameraActive(true);
        return;
      case 'sio2':
        showModelStage();
        loadDemoModel(BUILT_IN_MODELS.sio2, 'SiO₂ 二氧化硅网络', 'glb');
        setCameraActive(true);
        return;
      case 'nitrobenzene':
        showModelStage();
        loadDemoModel(BUILT_IN_MODELS.nitrobenzene, '硝基苯', 'glb');
        setCameraActive(true);
        return;
      case 'terrain':
        showModelStage();
        loadDemoModel('/models/terrain-topography.glb', '地形地貌', 'glb');
        setCameraActive(true);
        return;
      case 'earth_layers':
      default:
        showModelStage();
        loadDemoModel('/models/earth-layers.glb', '地球内部结构', 'glb');
        setCameraActive(true);
    }
  };

  const setTimelineStatus = (id: string, status: AgentTimelineItem['status']) => {
    setAgentTimeline((items) => items.map((item) => item.id === id ? { ...item, status } : item));
  };

  const appendTimeline = (item: AgentTimelineItem) => {
    setAgentTimeline((items) => [...items, item]);
  };

  const runAgentTool = async (call: AgentToolCall): Promise<string> => {
    const timelineId = `${call.id}-${Date.now()}`;
    appendTimeline({
      id: timelineId,
      agent: 'executor',
      title: call.label,
      detail: `工具调用：${call.name}`,
      status: 'running',
    });

    try {
      switch (call.name) {
        case 'load_model': {
          const modelId = (call.args.modelId || 'earth_layers') as TeachingModelId;
          // 如果 handleAgentStart 已预加载过同一模型，跳过避免二次刷新
          if (preloadedModelRef.current === modelId) {
            preloadedModelRef.current = null;
            break;
          }
          loadTeachingModel(modelId);
          await sleep(700);
          controlRef.current.zoomSpeed = -0.026;
          await sleep(900);
          controlRef.current.zoomSpeed = 0;
          break;
        }
        case 'auto_rotate': {
          const speed = Number(call.args.speed ?? 0.016);
          const durationMs = Number(call.args.durationMs ?? 2200);
          controlRef.current.rotationVelocity = { x: 0, y: speed };
          await sleep(Math.max(100, durationMs));
          if (speed !== 0) {
            controlRef.current.rotationVelocity = { x: 0, y: 0 };
          }
          break;
        }
        case 'auto_zoom': {
          const direction = String(call.args.direction || 'in');
          const durationMs = Number(call.args.durationMs ?? 1200);
          controlRef.current.zoomSpeed = direction === 'out' ? -0.018 : 0.018;
          await sleep(Math.max(100, durationMs));
          controlRef.current.zoomSpeed = 0;
          break;
        }
        case 'explode_model': {
          if (modelUrl?.includes('diamond.glb') || modelUrl?.includes('diamond-unit-cell')) {
            setAiAnalysis('金刚石结构模型为完整结构展示，不支持拆解。');
            break;
          }
          controlRef.current.agentDisassembly = {
            enabled: true,
            strength: Math.max(0, Math.min(1.4, Number(call.args.strength ?? 0.95))),
            spacing: Math.max(0.6, Number(call.args.spacing ?? 1.15)),
            avoidOverlap: true,
            actionId: (controlRef.current.agentDisassembly?.actionId ?? 0) + 1,
            label: call.label,
          };
          await sleep(Number(call.args.durationMs ?? 1600));
          break;
        }
        case 'reset_model_layout': {
          if (modelUrl?.includes('earth-layers')) {
            setAiAnalysis('地球内部结构保持四层拆解展示，便于观众观察。');
          } else {
            controlRef.current.agentDisassembly = {
              enabled: false,
              strength: 0,
              spacing: 1.1,
              avoidOverlap: true,
              actionId: (controlRef.current.agentDisassembly?.actionId ?? 0) + 1,
              label: '恢复模型布局',
            };
          }
          await sleep(900);
          break;
        }
        case 'enable_gesture':
          if (activeContent === 'model') {
            setCameraActive(true);
          }
          await sleep(300);
          break;
        case 'set_teacher_log':
          setAiAnalysis(String(call.args.text || call.label));
          await sleep(250);
          break;
        default:
          await sleep(200);
      }

      setTimelineStatus(timelineId, 'done');
      return call.label;
    } catch (error) {
      console.error('Agent tool failed:', error);
      setTimelineStatus(timelineId, 'error');
      return `${call.label}失败`;
    }
  };

  const handleAgentStart = async (request: string) => {
    if (isAgentRunning) return;

    setIsSidebarCollapsed(true);
    try {
      if (!document.fullscreenElement) {
        await stageRef.current?.requestFullscreen();
      }
    } catch (error) {
      console.error('Agent fullscreen failed:', error);
    }

    setIsAgentRunning(true);
    knowledgeSpeechClosedRef.current = false;
    knowledgeSpeechSessionRef.current += 1;
    resetKnowledgeSpeech();
    setKnowledgeContent('');
    setIsKnowledgeStreaming(false);
    setAgentThinking('');
    setAgentTimeline([]);
    setAgentStatuses({ planner: 'thinking', executor: 'idle', evaluator: 'idle' });
    const matchedModel = inferTeachingModel(request);
    const matchedModelName = getTeachingModelName(matchedModel);
    const initialThinking = `我正在理解教学需求，先识别关键词并匹配教具：当前判断适合使用“${matchedModelName}”。随后会生成演示步骤并调用工具。`;
    setAgentThinking(initialThinking);
    setAiAnalysis(initialThinking);
    preloadedModelRef.current = matchedModel;
    loadTeachingModel(matchedModel);
    controlRef.current.zoomSpeed = -0.026;
    await sleep(900);
    controlRef.current.zoomSpeed = 0;

    const executedLogs: string[] = [];

    try {
      appendTimeline({
        id: `planner-${Date.now()}`,
        agent: 'planner',
        title: `自动匹配${matchedModelName}`,
        detail: `教学需求：${request}`,
        status: 'running',
      });

      const plan = await buildTeachingPlan(request);
      setAgentThinking(`规划完成：已选择“${getTeachingModelName(plan.modelId)}”，准备执行 ${plan.steps.length} 个演示步骤。`);
      executedLogs.push(`生成${plan.steps.length}个演示步骤：${plan.topic}`);
      setAgentStatuses({ planner: 'done', executor: 'running', evaluator: 'idle' });
      setAgentTimeline((items) => items.map((item) => item.agent === 'planner' ? { ...item, status: 'done', detail: `规划完成：${plan.topic}` } : item));
      setAiAnalysis(`规划完成：${plan.topic}`);

      // Auto zoom into the model
      setAiAnalysis('正在自动拉近视角...');
      controlRef.current.zoomSpeed = -0.026;
      await sleep(1200);
      controlRef.current.zoomSpeed = 0;
      await sleep(200);

      for (const step of plan.steps) {
        appendTimeline({
          id: step.id,
          agent: 'executor',
          title: step.title,
          detail: step.narration,
          status: 'running',
        });
        setAiAnalysis(step.narration);
        executedLogs.push(step.title);

        for (const call of step.toolCalls) {
          const log = await runAgentTool(call);
          executedLogs.push(log);
        }

        setTimelineStatus(step.id, 'done');
      }

      // Knowledge Explainer: stream knowledge content
      setAgentStatuses({ planner: 'done', executor: 'done', evaluator: 'thinking' });
      setAgentThinking('知识讲解Agent正在生成关于该模型的教学内容...');
      setAiAnalysis('知识讲解Agent正在生成教学内容...');
      setKnowledgeContent('');
      setIsKnowledgeStreaming(true);
      appendTimeline({
        id: `evaluator-${Date.now()}`,
        agent: 'evaluator',
        title: '生成知识讲解',
        detail: '根据模型和教学需求生成知识内容。',
        status: 'running',
      });

      const knowledgeSpeechSession = knowledgeSpeechSessionRef.current;
      let accumulatedKnowledge = '';
      let hasStreamedKnowledge = false;
      const fullKnowledge = await buildKnowledgeExplanation(
        request,
        plan.modelId,
        (token: string) => {
          if (knowledgeSpeechClosedRef.current || knowledgeSpeechSessionRef.current !== knowledgeSpeechSession) return;
          hasStreamedKnowledge = true;
          accumulatedKnowledge += token;
          setKnowledgeContent(accumulatedKnowledge);
          enqueueKnowledgeSpeech(token);
        },
      );

      if (!knowledgeSpeechClosedRef.current && knowledgeSpeechSessionRef.current === knowledgeSpeechSession) {
        if (!hasStreamedKnowledge && fullKnowledge) {
          enqueueKnowledgeSpeech(fullKnowledge);
        }
        flushKnowledgeSpeech();
        setKnowledgeContent(fullKnowledge);
        setAiAnalysis('知识讲解已生成，语音播报已同步进行。');
      }
      setIsKnowledgeStreaming(false);
      setAgentThinking('');
      setAgentStatuses({ planner: 'done', executor: 'done', evaluator: 'done' });
      setAgentTimeline((items) => items.map((item) => item.agent === 'evaluator' ? { ...item, status: 'done', detail: '知识讲解完成' } : item));
    } catch (error) {
      console.error('Agent run failed:', error);
      setIsKnowledgeStreaming(false);
      setAgentThinking('智能体流程异常：请检查网络或 DeepSeek 配置，系统仍可使用本地模型手动演示。');
      setAiAnalysis('多智能体演示失败，请检查 DeepSeek 配置或网络。');
      setAgentStatuses({ planner: 'error', executor: 'error', evaluator: 'idle' });
    } finally {
      setIsAgentRunning(false);
    }
  };

  const handleImageTo3D = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    showModelStage();
    setIsProcessing(true);
    setCurrentStep(0);
    setAiAnalysis('AI 正在扫描图片...');

    try {
      if (!ENABLE_GEMINI) {
        setAiAnalysis('离线模式已启用：图片转 3D 需要 Gemini 网络服务。请直接导入本地 GLB/GLTF/FBX 模型。');
        return;
      }

      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const base64Data = await base64Promise;
      const pureBase64 = base64Data.split(',')[1];

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { data: pureBase64, mimeType: file.type } },
            { text: "简要分析图中教具的3D形态，仅需两句话描述其形状和材质。这将被用于教育场景下的3D重建。" }
          ]
        }
      });
      setAiAnalysis(response.text || '已识别教学目标，正在开始 3D 转换...');

      for (let i = 1; i < RECONSTRUCTION_STEPS.length; i++) {
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 500));
        setCurrentStep(i);
      }

      setAiAnalysis('图片分析完成。当前离线版不再从外网下载演示模型，请导入生成后的本地 GLB/GLTF/FBX 文件。');
    } catch (error) {
      console.error("AI Reconstruction Error:", error);
      setAiAnalysis("AI 分析失败，请检查网络或配置。");
    } finally {
      setTimeout(() => setIsProcessing(false), 500);
    }
  };

  const handleGestureUpdate = useCallback((gesture: GestureType, direction: MoveDirection, dragging: boolean) => {
    setGestureStatus(gesture);
    setDirectionStatus(direction);
    setIsDragging(dragging);
  }, []);

  const handleInteractionModeChange = (mode: InteractionMode) => {
    setInteractionMode(mode);
    resetControls();
    setAiAnalysis(mode === 'dual'
      ? '已切换为双手模式：左手缩放，右手旋转/拖拽。'
      : '已切换为单手模式：右手优先；双指旋转，张掌/握拳缩放，捏合拖拽；缩放与拖拽互斥。'
    );
  };

  // Sync interaction speed settings to controlRef
  useEffect(() => {
    controlRef.current.interactionSettings = {
      zoomSpeed: zoomSpeedMultiplier,
      rotationSpeed: rotationSpeedMultiplier,
    };
  }, [zoomSpeedMultiplier, rotationSpeedMultiplier]);

  return (
    <div className="flex flex-col h-screen text-slate-700">
      {/* 顶部导航 */}
      <nav className="h-20 px-8 flex items-center justify-between z-50">
        <div className="flex items-center space-x-3">
          <img src="/brand/smart-cube-tech/mark.svg" alt="慧视课堂 Logo" className="w-10 h-10 animate-pulse drop-shadow-md" />
          <div className="flex flex-col">
            <span className="text-xl font-black text-gray-700 tracking-tight">慧视课堂</span>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">AI 沉浸式教学系统</span>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="relative group">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageTo3D}
              disabled={isProcessing}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <button className="px-6 py-2 rounded-full glass-panel text-gray-600 hover:bg-white flex items-center transition-all hover:scale-105 active:scale-95 shadow-sm">
              <Sparkles className="mr-2 text-[#86e3ce]" size={18} /> 图片转 3D
            </button>
          </div>

          <div className="relative group">
            <input
              type="file"
              accept=".fbx,.glb,.gltf,.bin,image/*"
              multiple
              onChange={handleModelUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <button className="px-6 py-2 rounded-full glass-panel text-orange-400 hover:text-orange-600 flex items-center transition-all hover:bg-orange-50">
              <Download className="mr-2 text-orange-300" size={18} /> 导入模型
            </button>
          </div>

          <div className="w-11 h-11 rounded-full border-4 border-white shadow-md overflow-hidden bg-white">
            <div className="w-full h-full bg-[#86e3ce] text-white flex items-center justify-center font-black text-sm">AI</div>
          </div>
        </div>
      </nav>

      {/* 主体区域 */}
      <main className="flex-1 flex px-6 pb-6 gap-6 overflow-hidden">
        {/* 侧边栏 */}
        <aside className={`glass-panel rounded-[32px] flex shrink-0 flex-col animate-in slide-in-from-left-8 duration-700 transition-all ${isSidebarCollapsed ? 'w-20 items-center p-3 overflow-hidden' : 'w-72 p-6 overflow-y-auto'}`}>
          {isSidebarCollapsed ? (
            <>
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(false)}
                className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/70 text-gray-500 shadow-sm transition hover:bg-white hover:text-gray-800"
                aria-label="展开资源库"
                title="展开资源库"
              >
                <ChevronRight size={18} />
              </button>

              <div className="flex w-full flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => { showModelStage(); loadDemoModel(BUILT_IN_MODELS.diamond, '金刚石模型', 'glb'); setCameraActive(true); }}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl text-blue-400 transition hover:bg-blue-50/60"
                  aria-label="化学"
                  title="化学 · 金刚石模型"
                >
                  <FlaskConical size={19} />
                </button>
                <div className="h-px w-6 bg-white/40" />
                <button
                  type="button"
                  onClick={() => { showModelStage(); loadDemoModel(BUILT_IN_MODELS.heart, '心脏模型1', 'glb'); setCameraActive(true); }}
                  className={`flex h-11 w-11 items-center justify-center rounded-2xl transition hover:bg-rose-50/60 ${modelUrl === BUILT_IN_MODELS.heart ? 'bg-white/80 text-rose-500 shadow-sm' : 'text-rose-400'}`}
                  aria-label="生物"
                  title="生物 · 心脏/HIV 病毒"
                >
                  <Heart size={19} />
                </button>
                <div className="h-px w-6 bg-white/40" />
                <button
                  type="button"
                  onClick={() => { showModelStage(); loadDemoModel('/models/earth-layers.glb', '地球内部结构', 'glb'); setCameraActive(true); }}
                  className={`flex h-11 w-11 items-center justify-center rounded-2xl transition hover:bg-emerald-50/60 ${modelUrl === '/models/earth-layers.glb' ? 'bg-white/80 text-emerald-600 shadow-sm' : 'text-emerald-500'}`}
                  aria-label="地理"
                  title="地理 · 地球内部结构/地形地貌"
                >
                  <Globe size={19} />
                </button>
              </div>

              <div className="mt-auto flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (activeContent === 'biodigital') {
                      setAiAnalysis('心脏模型2 是 URL 交互展示页面；本地手势控制会在心脏模型1等 GLB 模型视图中启用。');
                      return;
                    }
                    setCameraActive(!cameraActive);
                  }}
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition ${activeContent === 'biodigital'
                    ? 'border-white/70 bg-white/50 text-gray-400'
                    : cameraActive
                    ? 'border-red-100 bg-red-50 text-red-600'
                    : 'border-emerald-100 bg-emerald-50 text-emerald-600'
                    }`}
                  aria-label={activeContent === 'biodigital' ? '心脏模型2 URL 交互' : cameraActive ? '停用摄像头' : '启用手势捕捉'}
                  title={activeContent === 'biodigital' ? '心脏模型2 URL 交互' : cameraActive ? '停用摄像头' : '启用手势捕捉'}
                >
                  <Hand size={18} />
                </button>
                <div className="h-px w-8 bg-white/70" />
                <MessageSquare className="text-blue-400" size={18} aria-label="助教日志" />
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex bg-gray-100/80 rounded-xl p-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSidebarTab('resource');
                        setIsSidebarCollapsed(false);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                        sidebarTab === 'resource'
                          ? 'bg-white text-gray-700 shadow-sm'
                          : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      学科资源库
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSidebarTab('agent');
                        setIsSidebarCollapsed(false);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                        sidebarTab === 'agent'
                          ? 'bg-white text-gray-700 shadow-sm'
                          : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      多智能体平台
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSidebarCollapsed(true);
                      setSidebarTab('resource');
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/60 text-gray-400 shadow-sm transition hover:bg-white hover:text-gray-700"
                    aria-label="收起"
                    title="收起"
                  >
                    <ChevronLeft size={17} />
                  </button>
                </div>

                {sidebarTab === 'resource' ? (
                <div className="space-y-1.5">
                  {/* 化学 */}
                  <div className="rounded-2xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedCategories(prev => {
                          const next = new Set(prev);
                          next.has('化学') ? next.delete('化学') : next.add('化学');
                          return next;
                        });
                      }}
                      className="w-full p-2.5 flex items-center justify-between text-sm font-bold text-blue-600 hover:bg-blue-50/60 transition-colors rounded-2xl"
                    >
                      <div className="flex items-center gap-2.5">
                        <FlaskConical size={16} className="text-blue-400" />
                        <span>化学</span>
                      </div>
                      <ChevronDown size={13} className={`text-blue-300 transition-transform duration-200 ${expandedCategories.has('化学') ? 'rotate-180' : ''}`} />
                    </button>
                    {expandedCategories.has('化学') && (
                      <div className="px-2 pb-2 space-y-2.5">
                        <div>
                          <div className="flex items-center gap-1.5 mb-1 pl-1">
                            <Atom size={11} className="text-violet-400" />
                            <span className="text-[10px] font-black text-violet-400/70 uppercase tracking-wider">化学分子</span>
                          </div>
                          <div className="space-y-0.5">
                            <div onClick={() => { showModelStage(); loadDemoModel(BUILT_IN_MODELS.diamond, '金刚石模型', 'glb'); setCameraActive(true); }} className={`py-1.5 px-2.5 rounded-lg flex items-center text-xs font-medium cursor-pointer transition-colors ${modelUrl === BUILT_IN_MODELS.diamond ? 'bg-blue-100/60 text-blue-600' : 'text-gray-500 hover:bg-blue-50/40'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full mr-2 ${modelUrl === BUILT_IN_MODELS.diamond ? 'bg-violet-500 animate-pulse' : 'bg-violet-300'}`}></span>金刚石模型
                            </div>
                            <div onClick={() => { showModelStage(); loadDemoModel(BUILT_IN_MODELS.diamondUnitCell, '金刚石晶胞', 'glb'); setCameraActive(true); }} className={`py-1.5 px-2.5 rounded-lg flex items-center text-xs font-medium cursor-pointer transition-colors ${modelUrl === BUILT_IN_MODELS.diamondUnitCell ? 'bg-blue-100/60 text-blue-600' : 'text-gray-500 hover:bg-blue-50/40'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full mr-2 ${modelUrl === BUILT_IN_MODELS.diamondUnitCell ? 'bg-fuchsia-500 animate-pulse' : 'bg-fuchsia-300'}`}></span>金刚石晶胞
                            </div>
                            <div onClick={() => { showModelStage(); loadDemoModel(BUILT_IN_MODELS.pubchem6233, '1,4-二氯甲基苯', 'glb'); setCameraActive(true); }} className={`py-1.5 px-2.5 rounded-lg flex items-center text-xs font-medium cursor-pointer transition-colors ${modelUrl === BUILT_IN_MODELS.pubchem6233 ? 'bg-blue-100/60 text-blue-600' : 'text-gray-500 hover:bg-blue-50/40'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full mr-2 ${modelUrl === BUILT_IN_MODELS.pubchem6233 ? 'bg-sky-500 animate-pulse' : 'bg-sky-300'}`}></span>1,4-二氯甲基苯
                            </div>
                            <div onClick={() => { showModelStage(); loadDemoModel(BUILT_IN_MODELS.nitrobenzene, '硝基苯', 'glb'); setCameraActive(true); }} className={`py-1.5 px-2.5 rounded-lg flex items-center text-xs font-medium cursor-pointer transition-colors ${modelUrl === BUILT_IN_MODELS.nitrobenzene ? 'bg-blue-100/60 text-blue-600' : 'text-gray-500 hover:bg-blue-50/40'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full mr-2 ${modelUrl === BUILT_IN_MODELS.nitrobenzene ? 'bg-orange-500 animate-pulse' : 'bg-orange-300'}`}></span>硝基苯
                            </div>
                            <div aria-disabled="true" title="暂不可用" className="py-1.5 px-2.5 rounded-lg flex items-center text-xs font-medium cursor-not-allowed transition-colors bg-gray-50/40 text-gray-300 opacity-70">
                              <span className="w-1.5 h-1.5 rounded-full mr-2 bg-gray-300"></span>NaCl 离子晶体
                            </div>
                            <div aria-disabled="true" title="暂不可用" className="py-1.5 px-2.5 rounded-lg flex items-center text-xs font-medium cursor-not-allowed transition-colors bg-gray-50/40 text-gray-300 opacity-70">
                              <span className="w-1.5 h-1.5 rounded-full mr-2 bg-gray-300"></span>SiO₂ 二氧化硅网络
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 生物 */}
                  <div className="rounded-2xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedCategories(prev => {
                          const next = new Set(prev);
                          next.has('生物') ? next.delete('生物') : next.add('生物');
                          return next;
                        });
                      }}
                      className="w-full p-2.5 flex items-center justify-between text-sm font-bold text-rose-600 hover:bg-rose-50/60 transition-colors rounded-2xl"
                    >
                      <div className="flex items-center gap-2.5">
                        <Heart size={16} className="text-rose-400" />
                        <span>生物</span>
                      </div>
                      <ChevronDown size={13} className={`text-rose-300 transition-transform duration-200 ${expandedCategories.has('生物') ? 'rotate-180' : ''}`} />
                    </button>
                    {expandedCategories.has('生物') && (
                      <div className="px-2 pb-2 space-y-2.5">
                        <div>
                          <div className="flex items-center gap-1.5 mb-1 pl-1">
                            <Heart size={11} className="text-rose-400" />
                            <span className="text-[10px] font-black text-rose-400/70 uppercase tracking-wider">人体解剖</span>
                          </div>
                          <div className="space-y-0.5">
                            <div onClick={() => { showModelStage(); loadDemoModel(BUILT_IN_MODELS.heart, '心脏模型1', 'glb'); setCameraActive(true); }} className={`py-1.5 px-2.5 rounded-lg flex items-center text-xs font-medium cursor-pointer transition-colors ${modelUrl === BUILT_IN_MODELS.heart ? 'bg-rose-100/60 text-rose-600' : 'text-gray-500 hover:bg-rose-50/40'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full mr-2 ${modelUrl === BUILT_IN_MODELS.heart ? 'bg-rose-500 animate-pulse' : 'bg-rose-300'}`}></span>心脏模型1
                            </div>
                            <div aria-disabled="true" title="暂不可用" className="py-1.5 px-2.5 rounded-lg flex items-center text-xs font-medium cursor-not-allowed transition-colors bg-gray-50/40 text-gray-300 opacity-70">
                              <span className="w-1.5 h-1.5 rounded-full mr-2 bg-gray-300"></span>心脏模型2
                            </div>
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 mb-1 pl-1">
                            <Heart size={11} className="text-green-400" />
                            <span className="text-[10px] font-black text-green-400/70 uppercase tracking-wider">病毒模型</span>
                          </div>
                          <div className="space-y-0.5">
                            <div onClick={() => { showModelStage(); loadDemoModel(BUILT_IN_MODELS.hiv, 'HIV 病毒模型', 'glb'); setCameraActive(true); }} className={`py-1.5 px-2.5 rounded-lg flex items-center text-xs font-medium cursor-pointer transition-colors ${modelUrl === BUILT_IN_MODELS.hiv ? 'bg-rose-100/60 text-rose-600' : 'text-gray-500 hover:bg-rose-50/40'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full mr-2 ${modelUrl === BUILT_IN_MODELS.hiv ? 'bg-green-500 animate-pulse' : 'bg-green-300'}`}></span>HIV 病毒模型
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 地理 */}
                  <div className="rounded-2xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedCategories(prev => {
                          const next = new Set(prev);
                          next.has('地理') ? next.delete('地理') : next.add('地理');
                          return next;
                        });
                      }}
                      className="w-full p-2.5 flex items-center justify-between text-sm font-bold text-emerald-600 hover:bg-emerald-50/60 transition-colors rounded-2xl"
                    >
                      <div className="flex items-center gap-2.5">
                        <Globe size={16} className="text-emerald-500" />
                        <span>地理</span>
                      </div>
                      <ChevronDown size={13} className={`text-emerald-300 transition-transform duration-200 ${expandedCategories.has('地理') ? 'rotate-180' : ''}`} />
                    </button>
                    {expandedCategories.has('地理') && (
                      <div className="px-2 pb-2 space-y-0.5">
                        <div onClick={() => { showModelStage(); loadDemoModel('/models/earth-layers.glb', '地球内部结构', 'glb'); setCameraActive(true); }} className={`py-1.5 px-2.5 rounded-lg flex items-center text-xs font-medium cursor-pointer transition-colors ${modelUrl === '/models/earth-layers.glb' ? 'bg-emerald-100/60 text-emerald-600' : 'text-gray-500 hover:bg-emerald-50/40'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full mr-2 ${modelUrl === '/models/earth-layers.glb' ? 'bg-emerald-500 animate-pulse' : 'bg-emerald-300'}`}></span>地球内部结构
                        </div>
                        <div onClick={() => { showModelStage(); loadDemoModel('/models/terrain-topography.glb', '地形地貌', 'glb'); setCameraActive(true); }} className={`py-1.5 px-2.5 rounded-lg flex items-center text-xs font-medium cursor-pointer transition-colors ${modelUrl === '/models/terrain-topography.glb' ? 'bg-emerald-100/60 text-emerald-600' : 'text-gray-500 hover:bg-emerald-50/40'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full mr-2 ${modelUrl === '/models/terrain-topography.glb' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-300'}`}></span>地形地貌总览
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                ) : (
                <div className="space-y-3">
                  <textarea
                    value={sidebarAgentRequest}
                    disabled={isAgentRunning}
                    onChange={(e) => setSidebarAgentRequest(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (!isAgentRunning && sidebarAgentRequest.trim()) {
                          handleAgentStart(sidebarAgentRequest.trim());
                        }
                      }
                    }}
                    className="w-full resize-none rounded-2xl border border-gray-200/70 bg-white/80 px-3 py-2 text-xs font-medium leading-relaxed text-gray-700 outline-none transition focus:border-[#86e3ce] focus:ring-2 focus:ring-[#86e3ce]/20 disabled:opacity-60 h-16"
                    placeholder="输入教学需求，按 Enter 开始，Shift+Enter 换行"
                    title="按 Enter 开始，Shift+Enter 换行"
                  />
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['planner', 'executor', 'evaluator'] as AgentRole[]).map((role) => {
                      const metas: Record<AgentRole, { title: string; color: string }> = {
                        planner: { title: '理解规划', color: 'text-indigo-600 bg-indigo-50 border-indigo-100' },
                        executor: { title: '演示执行', color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
                        evaluator: { title: '知识讲解', color: 'text-amber-600 bg-amber-50 border-amber-100' },
                      };
                      const m = metas[role];
                      const statusMap: Record<AgentStatus, string> = { idle: '待命', thinking: '规划中', running: '执行中', done: '完成', error: '异常' };
                      return (
                        <div key={role} className={`rounded-xl border p-1.5 ${m.color}`}>
                          <div className="text-[9px] font-bold truncate">{m.title}</div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className={`h-1.5 w-1.5 rounded-full ${agentStatuses[role] === 'running' || agentStatuses[role] === 'thinking' ? 'animate-pulse bg-current' : 'bg-current opacity-50'}`} />
                            <span className="text-[8px] font-bold opacity-70">{statusMap[agentStatuses[role]]}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    disabled={isAgentRunning || !sidebarAgentRequest.trim()}
                    onClick={() => handleAgentStart(sidebarAgentRequest.trim())}
                    className="w-full py-2 rounded-xl bg-gray-900 text-white text-xs font-bold shadow-lg transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {isAgentRunning ? (
                      <><Loader2 size={14} className="animate-spin" /> 运行中...</>
                    ) : (
                      <><Play size={14} /> 开始演示</>
                    )}
                  </button>
                  {agentThinking && (
                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/80 px-2.5 py-2">
                      <p className="text-[10px] font-medium leading-relaxed text-gray-600">{agentThinking}</p>
                    </div>
                  )}
                  <div className={`space-y-1 overflow-y-auto pr-0.5 ${agentTimeline.length > 0 ? 'max-h-24' : ''}`}>
                    {agentTimeline.length === 0 ? (
                      <div className="rounded-xl bg-gray-50 px-2.5 py-2 text-[10px] font-medium text-gray-400">
                        等待输入教学需求...
                      </div>
                    ) : (
                      agentTimeline.map((item) => (
                        <div key={item.id} className="rounded-xl border border-gray-100 bg-white/70 px-2.5 py-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[9px] font-bold text-gray-600 truncate">{item.title}</span>
                            <span className={`text-[7px] font-black uppercase ${
                              item.status === 'running' ? 'text-blue-500' :
                              item.status === 'error' ? 'text-red-500' :
                              item.status === 'done' ? 'text-emerald-500' : 'text-gray-400'
                            }`}>{item.status === 'running' ? '运行中' : item.status === 'error' ? '异常' : item.status === 'done' ? '完成' : '待命'}</span>
                          </div>
                          <p className="mt-0.5 line-clamp-1 text-[9px] font-medium text-gray-400">{item.detail}</p>
                        </div>
                      ))
                    )}
                  </div>
                  {(knowledgeContent || isKnowledgeStreaming) && (
                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 px-2.5 py-2">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {isKnowledgeStreaming ? (
                          <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                        ) : (
                          <ClipboardCheck size={11} className="text-indigo-600" />
                        )}
                        <span className="text-[9px] font-bold text-indigo-600">知识讲解</span>
                      </div>
                      <p className="text-[10px] font-medium leading-relaxed text-gray-600 line-clamp-3">{knowledgeContent || (isKnowledgeStreaming ? '正在生成知识讲解...' : '')}</p>
                    </div>
                  )}
                </div>
                )}
              </div>

              <div>
                <h3 className="font-black text-xs text-gray-400 uppercase tracking-[0.2em] mb-4 border-l-4 border-pink-300 pl-3">全息指令表</h3>
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-white/40 border border-white/50 space-y-3">
                    <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/50 p-1">
                      <button
                        type="button"
                        onClick={() => handleInteractionModeChange('dual')}
                        className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-[10px] font-black transition ${interactionMode === 'dual' ? 'bg-indigo-100 text-indigo-600 shadow-sm' : 'text-gray-400 hover:bg-white/60'}`}
                      >
                        <Move3d size={13} /> 双手模式
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInteractionModeChange('single')}
                        className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-[10px] font-black transition ${interactionMode === 'single' ? 'bg-[#86e3ce]/25 text-emerald-600 shadow-sm' : 'text-gray-400 hover:bg-white/60'}`}
                      >
                        <Hand size={13} /> 单手模式
                      </button>
                    </div>

                    {interactionMode === 'dual' ? (
                      <>
                        <div className="flex items-center gap-2 pb-2 border-b border-white/30">
                          <div className="p-1.5 bg-indigo-100 rounded-lg"><Move3d size={14} className="text-indigo-400" /></div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-gray-500 uppercase">双手协同</span>
                            <span className="text-[9px] text-indigo-500 font-bold">左手缩放 | 右手旋转/拖拽</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-[#86e3ce]/20 rounded-lg"><Hand size={14} className="text-[#86e3ce]" /></div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-gray-500 uppercase">左手缩放</span>
                            <span className="text-[9px] text-gray-400 font-bold">张开 → 放大 | 握拳 → 缩小</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-purple-100 rounded-lg"><ScanFace size={14} className="text-purple-400" /></div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-gray-500 uppercase">右手交互</span>
                            <span className="text-[9px] text-purple-400 font-bold">捏合 → 拖拽零件</span>
                            <span className="text-[9px] text-gray-400 font-bold">食指+中指并拢滑动 → 旋转画面</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 pb-2 border-b border-white/30">
                          <div className="p-1.5 bg-[#86e3ce]/20 rounded-lg"><Hand size={14} className="text-[#86e3ce]" /></div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-gray-500 uppercase">右手优先</span>
                            <span className="text-[9px] text-emerald-500 font-bold">张掌放大 | 握拳缩小</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-amber-100 rounded-lg"><Hand size={14} className="text-amber-500" /></div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-gray-500 uppercase">捏合拖拽</span>
                            <span className="text-[9px] text-gray-400 font-bold">食指+拇指捏合 → 拖拽零件</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-purple-100 rounded-lg"><ScanFace size={14} className="text-purple-400" /></div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-gray-500 uppercase">互斥控制</span>
                            <span className="text-[9px] text-purple-400 font-bold">双指旋转优先；缩放与拖拽不会同时触发</span>
                          </div>
                        </div>
                      </>
                    )}

                    <div className="hidden">

                    {/* 组合指令 */}
                    <div className="flex items-center gap-2 pb-2 border-b border-white/30">
                      <div className="p-1.5 bg-indigo-100 rounded-lg"><Move3d size={14} className="text-indigo-400" /></div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-gray-500 uppercase">双人/双手</span>
                        <span className="text-[9px] text-indigo-500 font-bold">双手协同控制模型</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-[#86e3ce]/20 rounded-lg"><Hand size={14} className="text-[#86e3ce]" /></div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-gray-500 uppercase">左手 (缩放)</span>
                        <span className="text-[9px] text-gray-400 font-bold">张开 → 放大 | 握拳 → 缩小</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-purple-100 rounded-lg"><ScanFace size={14} className="text-purple-400" /></div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-gray-500 uppercase">右手 (拆解/旋转)</span>
                        <span className="text-[9px] text-purple-400 font-bold">捏合 (食+拇) → 抓取零件</span>
                        <span className="text-[9px] text-gray-400 font-bold">双指并拢 (食+中) → 旋转画面</span>
                      </div>
                    </div>
                  </div>
                  </div>

                  <button
                    onClick={() => {
                      if (activeContent === 'biodigital') {
                        setAiAnalysis('心脏模型2 是 URL 交互展示页面；本地手势控制会在心脏模型1等 GLB 模型视图中启用。');
                        return;
                      }
                      setCameraActive(!cameraActive);
                    }}
                    className={`w-full py-3 rounded-2xl text-[10px] font-black tracking-widest uppercase border transition-all ${activeContent === 'biodigital'
                      ? 'bg-white/50 border-white/70 text-gray-400'
                      : cameraActive
                      ? 'bg-red-50 border-red-100 text-red-600'
                      : 'bg-emerald-50 border-emerald-100 text-emerald-600'
                      }`}
                  >
                    {activeContent === 'biodigital' ? '心脏模型2 URL 交互' : cameraActive ? '停用摄像头' : '启用手势捕捉'}
                  </button>
                </div>
              </div>

              <div className="mt-auto">
                <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100/50 relative overflow-hidden">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare size={14} className="text-blue-400" />
                    <p className="text-[10px] text-blue-400 font-bold uppercase">助教日志</p>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed font-medium italic min-h-[3em]">
                    "{aiAnalysis}"
                  </p>
                </div>
              </div>
            </>
          )}
        </aside>

        {/* 视口展示区 */}
        <section ref={stageRef} className={`flex-1 glass-panel relative overflow-hidden group bg-white ${isStageFullscreen ? 'h-screen w-screen rounded-none' : 'rounded-[32px]'}`}>

          {isProcessing && (
            <ProcessingOverlay
              steps={RECONSTRUCTION_STEPS}
              currentStep={currentStep}
              aiAnalysis={aiAnalysis}
            />
          )}

          {activeContent === 'model' && (
            <div className="absolute bottom-6 left-6 z-50 flex items-center gap-2">
              <VoiceController
                controlRef={controlRef}
                onStatusChange={(msg) => setAiAnalysis(msg)}
                disabled={modelUrl === null}
              />
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`p-3 rounded-full shadow-lg transition-all active:scale-90 ${showSettings ? 'bg-gray-800 text-white' : 'bg-white/80 text-gray-400 hover:text-gray-600'}`}
                aria-label="交互速度设置"
                title="交互速度设置"
              >
                <Settings size={20} />
              </button>

              {modelUrl && (modelUrl.toLowerCase().includes('earth-layers') || modelUrl.toLowerCase().includes('terrain-topography')) && (
                <button
                  onClick={() => setShowLabels(!showLabels)}
                  className="px-3 py-1.5 sm:px-4 sm:py-2 bg-white/90 backdrop-blur-md rounded-full shadow-lg border border-gray-200/50 text-xs font-black tracking-widest uppercase text-gray-600 hover:text-[#86e3ce] hover:border-[#86e3ce]/50 transition-all flex items-center gap-1.5 sm:gap-2"
                >
                  <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${showLabels ? 'bg-[#86e3ce] shadow-[0_0_8px_#86e3ce]' : 'bg-gray-300'}`}></div>
                  {showLabels ? '关闭教学辅导标签' : '开启教学辅导标签'}
                </button>
              )}

              {showSettings && (
                <div className="absolute bottom-16 left-0 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-200/50 p-5 w-64">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-black text-gray-600 uppercase tracking-wider">交互速度设置</h4>
                    <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600 transition">
                      <X size={16} />
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-gray-500">缩放速度</label>
                        <span className="text-xs font-black text-[#86e3ce]">{zoomSpeedMultiplier.toFixed(1)}x</span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="5.0"
                        step="0.1"
                        value={zoomSpeedMultiplier}
                        onChange={(e) => setZoomSpeedMultiplier(parseFloat(e.target.value))}
                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[#86e3ce]"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-gray-500">旋转速度</label>
                        <span className="text-xs font-black text-[#86e3ce]">{rotationSpeedMultiplier.toFixed(1)}x</span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="5.0"
                        step="0.1"
                        value={rotationSpeedMultiplier}
                        onChange={(e) => setRotationSpeedMultiplier(parseFloat(e.target.value))}
                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[#86e3ce]"
                      />
                    </div>
                    <button
                      onClick={() => { setZoomSpeedMultiplier(0.8); setRotationSpeedMultiplier(0.5); }}
                      className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-500 text-xs font-black uppercase tracking-wider hover:bg-gray-200 transition"
                    >
                      重置默认
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {modelStructureImage && (
            <div className="absolute left-6 top-6 z-40 flex flex-col gap-2 max-w-[280px]">
              <button
                ref={structureImageRef}
                type="button"
                onClick={() => setExpandedStructureImage(modelStructureImage)}
                className={`overflow-hidden rounded-2xl border border-white/70 bg-white/90 shadow-xl backdrop-blur-md cursor-zoom-in transition hover:scale-[1.03] hover:bg-white active:scale-95 ${
                  isKnowledgeStreaming || knowledgeContent
                    ? 'w-20 h-20 opacity-70'
                    : 'w-28 sm:w-36 md:w-44 lg:w-52'
                }`}
                aria-label="放大结构图"
                title="放大结构图"
              >
                <img
                  src={modelStructureImage}
                  alt="结构图"
                  className="block w-full h-full object-contain"
                />
              </button>

              {(isKnowledgeStreaming || knowledgeContent) && (
                <div className="rounded-2xl border border-indigo-100 bg-white/95 shadow-xl backdrop-blur-md overflow-hidden">
                  <div className="px-4 py-3 bg-indigo-50/80 border-b border-indigo-100">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {isKnowledgeStreaming ? (
                          <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                        ) : (
                          <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                        )}
                        <span className="text-[11px] font-black text-indigo-600 uppercase tracking-wider">
                          知识讲解
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={closeKnowledgePanel}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-indigo-400 hover:bg-indigo-100 hover:text-indigo-600 transition"
                        aria-label="关闭知识讲解"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="px-4 py-3 max-h-[40vh] overflow-y-auto">
                    <p className="text-xs font-medium leading-relaxed text-gray-700 whitespace-pre-wrap">
                      {knowledgeContent}
                      {isKnowledgeStreaming && <span className="animate-pulse text-indigo-400">|</span>}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {expandedStructureImage && (
            <div
              className="absolute inset-0 z-[70] flex items-center justify-center bg-black/35 p-6 backdrop-blur-sm"
              onClick={() => setExpandedStructureImage(null)}
              role="dialog"
              aria-modal="true"
              aria-label="结构图放大预览"
            >
              <button
                type="button"
                onClick={() => setExpandedStructureImage(null)}
                className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-xl bg-white/90 text-gray-500 shadow-lg transition hover:bg-white hover:text-gray-800"
                aria-label="关闭结构图预览"
                title="关闭"
              >
                <X size={18} />
              </button>
              <img
                src={expandedStructureImage}
                alt="Chemical structure enlarged"
                className="max-h-[86%] max-w-[86%] rounded-2xl bg-white object-contain shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              />
            </div>
          )}

          <div className="absolute top-6 right-6 flex gap-2 z-40">
            {activeContent === 'model' && (
              <div className={`px-4 py-2 rounded-xl bg-white/80 backdrop-blur-md text-[10px] font-bold shadow-sm flex items-center gap-2 ${cameraActive ? 'text-emerald-500' : 'text-gray-400'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${cameraActive ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`}></div>
                {cameraActive ? 'AI 动势追踪' : '手势已关闭'}
              </div>
            )}
            <button
              type="button"
              onClick={toggleStageFullscreen}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 text-gray-500 shadow-sm backdrop-blur-md transition hover:bg-white hover:text-gray-800"
              aria-label={isStageFullscreen ? '退出全屏' : '展示区全屏'}
              title={isStageFullscreen ? '退出全屏' : '展示区全屏'}
            >
              {isStageFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          </div>

          {/* 3D 模型层 */}
          <div className="w-full h-full transition-opacity duration-300 opacity-100">
            {activeContent === 'biodigital' ? (
              <BioDigitalViewer src={BIODIGITAL_HEART_URL} onFallback={loadHeartFallbackModel} />
            ) : modelUrl ? (
              <ModelViewer modelUrl={modelUrl} modelType={modelType} assetUrls={modelAssetUrls} controlRef={controlRef} showLabels={showLabels} onShowLabelsChange={setShowLabels} />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-white/20">
                <div className="relative mb-8">
                  <div className="absolute inset-0 bg-[#86e3ce]/10 blur-[80px] rounded-full"></div>
                  <div className="relative w-40 h-40 bg-white/80 rounded-[40px] shadow-xl border border-white flex items-center justify-center">
                    <Box className="text-[#86e3ce] w-20 h-20 animate-spin-slow" strokeWidth={1} />
                  </div>
                </div>
                <div className="text-center px-8">
                  <h2 className="text-2xl font-black text-gray-700 mb-2">欢迎来到 3D AI 实验室</h2>
                  <p className="text-gray-400 text-sm font-medium max-w-[360px] leading-relaxed">
                    <b>交互指令更新：</b><br />
                    右手捏合：拖拽 | 右手双指并拢+滑动：控制旋转<br />
                    左手张开/闭合：缩放 | 双手协同：精细控制模型
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* 摄像头预览区 */}
          {activeContent === 'model' && cameraActive && (
            <div className="absolute bottom-6 right-6 w-56 h-40 rounded-3xl border-4 border-white shadow-2xl overflow-hidden bg-black z-30 transition-all hover:scale-105">
              <HandController controlRef={controlRef} onStateChange={handleGestureUpdate} interactionMode={interactionMode} />
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <div className="bg-[#86e3ce] w-2 h-2 rounded-full animate-pulse shadow-[0_0_8px_#86e3ce]"></div>
                <span className="text-[8px] font-black text-white/70 uppercase tracking-widest">Vision Sensor</span>
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className="h-8 px-10 flex items-center justify-between text-[10px] text-gray-400 uppercase tracking-widest font-bold bg-white/30 backdrop-blur-sm">
        <span>© 2026 慧视课堂 | 教育 AI 实验室</span>
      </footer>
    </div>
  );
};

export default App;
