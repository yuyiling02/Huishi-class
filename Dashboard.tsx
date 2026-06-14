
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { AgentRole, AgentStatus, AgentTimelineItem, AgentToolCall, GestureType, MoveDirection, ControlRefs, InteractionMode, TeachingModelId } from './types';
import { ProcessingOverlay } from './components/UIComponents';
import HandController from './components/HandController';
import ModelViewer from './components/ModelViewer';
import BioDigitalViewer from './components/BioDigitalViewer';
import VoiceController from './components/VoiceController';
import QuizOverlay from './components/QuizOverlay';
import { buildTeachingPlan, getTeachingModelName, inferTeachingModel, buildKnowledgeExplanation } from './services/agentRuntime';
import { Sparkles, Box, Atom, Globe, ChevronDown, ChevronLeft, ChevronRight, MessageSquare, Hand, ScanFace, Move3d, Maximize2, Minimize2, FlaskConical, Heart, Settings, X, ClipboardCheck, Loader2, Play, Download, LogOut, Upload } from 'lucide-react';
import { ModelType } from './types';
import type { AuthUser } from './Login';

const ENABLE_GEMINI = (import.meta as any).env?.VITE_ENABLE_GEMINI === 'true';
const BIODIGITAL_HEART_URL = 'https://human.biodigital.com/view?id=7F0a&lang=zh&ref=share';
const BUILT_IN_MODELS = {
  heart: '/models/heart-optimized.glb',
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

const INTRO_INSTRUCTION =
  '右手捏合：拖拽 | 右手食指中指并拢：控制旋转\n左手张开/闭合：缩放';

interface DashboardProps {
  playIntro?: boolean;
  onBack?: () => void;
  currentUser: AuthUser;
  onLogout: () => void;
  onUserUpdated: (user: AuthUser) => void;
}

async function readError(response: Response) {
  try {
    const data = await response.json();
    return data.message || '请求失败';
  } catch {
    return '请求失败';
  }
}

function userLabel(user: AuthUser) {
  return user.displayName || user.username;
}

function userInitial(user: AuthUser) {
  return userLabel(user).trim().slice(0, 1).toUpperCase() || 'U';
}

function resizeAvatarFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      reject(new Error('请选择 PNG、JPEG 或 WebP 图片'));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      reject(new Error('头像图片不能超过 5MB'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('头像读取失败'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('头像解析失败'));
      image.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        if (!context) {
          reject(new Error('当前浏览器不支持头像处理'));
          return;
        }

        canvas.width = size;
        canvas.height = size;

        const scale = Math.max(size / image.width, size / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        const x = (size - width) / 2;
        const y = (size - height) / 2;

        context.fillStyle = '#071018';
        context.fillRect(0, 0, size, size);
        context.drawImage(image, x, y, width, height);
        resolve(canvas.toDataURL('image/webp', 0.86));
      };
      image.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

const App: React.FC<DashboardProps> = ({ playIntro = true, onBack, currentUser, onLogout, onUserUpdated }) => {
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
  const [introReady, setIntroReady] = useState(!playIntro);
  const [streamedInstruction, setStreamedInstruction] = useState(playIntro ? '' : INTRO_INSTRUCTION);
  const [aiAnalysis, setAiAnalysis] = useState('等待指令中...');

  // Hand/Voice state
  const [gestureStatus, setGestureStatus] = useState<GestureType>(GestureType.NONE);
  const [directionStatus, setDirectionStatus] = useState<MoveDirection>(MoveDirection.CENTER);
  const [isDragging, setIsDragging] = useState(false);

  // Interaction speed settings
  const [showSettings, setShowSettings] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState(userLabel(currentUser));
  const [profileAvatar, setProfileAvatar] = useState(currentUser.avatarUrl || '');
  const [profileMessage, setProfileMessage] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isAvatarProcessing, setIsAvatarProcessing] = useState(false);
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
  const [loadProgress, setLoadProgress] = useState<{ loaded: number; total: number; percent: number } | null>(null);
  const [quizMode, setQuizMode] = useState(false);
  const [quizSubjectFilter, setQuizSubjectFilter] = useState<string | undefined>(undefined);
  const quizButtonRef = useRef<HTMLButtonElement>(null);
  const [handNearQuizButton, setHandNearQuizButton] = useState(false);
  const structureImageRef = useRef<HTMLButtonElement>(null);
  const hasAutoOpenedCameraRef = useRef(false);
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
    if (!playIntro) {
      setIntroReady(true);
      setStreamedInstruction(INTRO_INSTRUCTION);
      return;
    }

    setIntroReady(false);
    setStreamedInstruction('');

    let streamInterval: number | undefined;
    const readyTimer = window.setTimeout(() => setIntroReady(true), 2000);
    const streamStartTimer = window.setTimeout(() => {
      let index = 0;
      streamInterval = window.setInterval(() => {
        index += 1;
        setStreamedInstruction(INTRO_INSTRUCTION.slice(0, index));
        if (index >= INTRO_INSTRUCTION.length && streamInterval) {
          window.clearInterval(streamInterval);
        }
      }, 58);
    }, 2100);

    return () => {
      window.clearTimeout(readyTimer);
      window.clearTimeout(streamStartTimer);
      if (streamInterval) window.clearInterval(streamInterval);
    };
  }, [playIntro]);

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

  // Hand proximity: trigger quiz mode button loading
  useEffect(() => {
    if (!cameraActive || quizMode || !modelUrl) {
      setHandNearQuizButton(false);
      return;
    }

    const checkProximity = () => {
      const handLm = controlRef.current.interactionHandLandmarks;
      if (!handLm || handLm.length < 9) {
        setHandNearQuizButton(false);
        return;
      }
      const indexTip = handLm[8];
      if (!indexTip) {
        setHandNearQuizButton(false);
        return;
      }

      const stageEl = stageRef.current;
      if (!stageEl) {
        setHandNearQuizButton(false);
        return;
      }

      const stageRect = stageEl.getBoundingClientRect();
      const screenX = stageRect.left + (1 - indexTip.x) * stageRect.width;
      const screenY = stageRect.top + indexTip.y * stageRect.height;

      const btnEl = quizButtonRef.current;
      if (!btnEl) {
        setHandNearQuizButton(false);
        return;
      }

      const rect = btnEl.getBoundingClientRect();
      const margin = 2;
      const isNear = (
        screenX >= rect.left - margin &&
        screenX <= rect.right + margin &&
        screenY >= rect.top - margin &&
        screenY <= rect.bottom + margin
      );

      setHandNearQuizButton(isNear);
    };

    const intervalId = setInterval(checkProximity, 100);
    return () => clearInterval(intervalId);
  }, [cameraActive, controlRef, quizMode, modelUrl]);

  // Loading progress timer for quiz button
  const quizProgressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let animFrame: number;
    let startTime: number | null = null;
    const duration = 2000;

    if (handNearQuizButton) {
      const animate = (timestamp: number) => {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        let progress = (elapsed / duration) * 100;

        if (progress >= 100) {
          progress = 100;
          if (quizProgressRef.current) {
            quizProgressRef.current.style.width = '100%';
          }
          setQuizSubjectFilter(modelUrl!);
          setQuizMode(true);
          setHandNearQuizButton(false);
        } else {
          if (quizProgressRef.current) {
            quizProgressRef.current.style.width = `${progress}%`;
          }
          animFrame = requestAnimationFrame(animate);
        }
      };
      animFrame = requestAnimationFrame(animate);
      
      return () => {
        cancelAnimationFrame(animFrame);
        if (quizProgressRef.current) {
            quizProgressRef.current.style.width = '0%';
        }
      };
    } else {
      if (quizProgressRef.current) {
          quizProgressRef.current.style.width = '0%';
      }
    }
  }, [handNearQuizButton, modelUrl]);

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

  // 低优先级预加载优化版心脏模型
  useEffect(() => {
    const prefetch = async () => {
      try {
        await fetch(BUILT_IN_MODELS.heart, {
          cache: 'force-cache',
          priority: 'low' as RequestPriority,
        });
      } catch {
        // 预加载失败不影响主流程
      }
    };
    const timer = setTimeout(prefetch, 3000);
    return () => clearTimeout(timer);
  }, []);

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
      if (!hasAutoOpenedCameraRef.current) {
        hasAutoOpenedCameraRef.current = true;
        setCameraActive(true);
      }
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
      setLoadProgress(null);
      resetControls();
      setAiAnalysis(`模型已加载: ${modelFile.name}，将按内部层级自动启用拆解`);
      event.target.value = '';
    }
  };

  const loadDemoModel = (url: string, name: string, type: ModelType = 'glb') => {
    if (!hasAutoOpenedCameraRef.current) {
      hasAutoOpenedCameraRef.current = true;
      setCameraActive(true);
    }
    showModelStage();
    if (/^https?:\/\//i.test(url)) {
      setAiAnalysis('演示模型已切换为离线模式，请直接导入本地 GLB/GLTF/FBX 模型。');
      return;
    }
    setModelUrl(url);
    setModelType(type);
    setModelAssetUrls({});
    setFileName(name);
    setLoadProgress(null);
    resetControls();
    setAiAnalysis(`正在演示: ${name}`);
  };

  const loadHeartFallbackModel = () => {
    loadDemoModel(BUILT_IN_MODELS.heart, '心脏模型1', 'glb');
  };

  const loadTeachingModel = (modelId: TeachingModelId) => {
    switch (modelId) {
      case 'heart':
        showModelStage();
        loadDemoModel(BUILT_IN_MODELS.heart, '心脏模型1', 'glb');
        return;
      case 'biodigital_heart':
        showBioDigitalStage();
        return;
      case 'hiv':
        showModelStage();
        loadDemoModel(BUILT_IN_MODELS.hiv, 'HIV 病毒模型', 'glb');
        return;
      case 'diamond':
        showModelStage();
        loadDemoModel(BUILT_IN_MODELS.diamond, '金刚石模型', 'glb');
        return;
      case 'diamond_unit_cell':
        showModelStage();
        loadDemoModel(BUILT_IN_MODELS.diamondUnitCell, '金刚石晶胞', 'glb');
        return;
      case 'pubchem_6233':
        showModelStage();
        loadDemoModel(BUILT_IN_MODELS.pubchem6233, '1,4-二氯甲基苯', 'glb');
        return;
      case 'nacl':
        showModelStage();
        loadDemoModel(BUILT_IN_MODELS.nacl, 'NaCl 离子晶体', 'glb');
        return;
      case 'sio2':
        showModelStage();
        loadDemoModel(BUILT_IN_MODELS.sio2, 'SiO₂ 二氧化硅网络', 'glb');
        return;
      case 'nitrobenzene':
        showModelStage();
        loadDemoModel(BUILT_IN_MODELS.nitrobenzene, '硝基苯', 'glb');
        return;
      case 'terrain':
        showModelStage();
        loadDemoModel('/models/terrain-topography.glb', '地形地貌', 'glb');
        return;
      case 'earth_layers':
      default:
        showModelStage();
        loadDemoModel('/models/earth-layers.glb', '地球内部结构', 'glb');
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

  const openProfileSettings = () => {
    setProfileName(userLabel(currentUser));
    setProfileAvatar(currentUser.avatarUrl || '');
    setProfileMessage('');
    setIsAccountMenuOpen(false);
    setIsProfileOpen(true);
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setProfileMessage('');
    setIsAvatarProcessing(true);

    try {
      const dataUrl = await resizeAvatarFile(file);
      setProfileAvatar(dataUrl);
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : '头像处理失败');
    } finally {
      setIsAvatarProcessing(false);
    }
  };

  const saveProfile = async () => {
    setProfileMessage('');
    setIsSavingProfile(true);

    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: profileName,
          avatarUrl: profileAvatar,
        }),
      });

      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      onUserUpdated(data.user);
      setIsProfileOpen(false);
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : '个人资料保存失败');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Sync interaction speed settings to controlRef
  useEffect(() => {
    controlRef.current.interactionSettings = {
      zoomSpeed: zoomSpeedMultiplier,
      rotationSpeed: rotationSpeedMultiplier,
    };
  }, [zoomSpeedMultiplier, rotationSpeedMultiplier]);

  return (
    <div className={`lab-shell flex h-screen flex-col overflow-hidden text-white ${playIntro ? 'lab-intro' : ''}`}>
      <div className="lab-stars" aria-hidden="true" />
      <div className="lab-ambient lab-ambient-left" aria-hidden="true" />
      <div className="lab-ambient lab-ambient-bottom" aria-hidden="true" />
      {/* 顶部导航 */}
      <nav className="relative z-50 flex h-[84px] items-center justify-between px-7">
        <div className="flex items-center gap-6">
          <div 
            className="flex items-center space-x-3 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={onBack}
          >
            <img src="/brand/smart-cube-tech/mark.svg" alt="数智课堂 Logo" className="h-10 w-10 drop-shadow-[0_0_18px_rgba(39,242,255,0.46)]" />
            <div className="flex flex-col">
              <span className="text-xl font-black tracking-tight text-white">数智课堂</span>
              <span className="text-xs font-semibold tracking-wide text-slate-400">AI 沉浸式教学系统</span>
            </div>
          </div>

          {/* 答题模式按钮 */}
          <button
            type="button"
            onClick={() => {
              if (!cameraActive) setCameraActive(true);
              setQuizMode(true);
            }}
            className="lab-pill-button ml-2"
            aria-label="答题挑战"
            title="进入答题模式"
          >
            <ClipboardCheck className="mr-1 text-yellow-400" size={15} />
            <span>答题挑战</span>
          </button>
        </div>

        <div className="flex items-center gap-5">
          <div className="relative group">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageTo3D}
              disabled={isProcessing}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <button className="lab-pill-button">
              <Sparkles className="mr-1.5 text-white/90" size={14} /> 图片转 3D
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
            <button className="lab-pill-button">
              <Download className="mr-1.5 text-white/90" size={14} /> 导入模型
            </button>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsAccountMenuOpen((open) => !open)}
              className="flex h-10 items-center gap-1.5 rounded-full border border-[#3ff6ff]/45 bg-[#09222b]/80 px-2 pr-3 text-white shadow-[0_0_24px_rgba(39,242,255,0.22),inset_0_0_18px_rgba(39,242,255,0.18)] transition hover:border-[#3ff6ff]/75 hover:bg-[#0b2d38]"
              aria-label="打开个人中心"
            >
              <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-full border border-white/15 bg-cyan-200 text-xs font-black text-[#061626]">
                {currentUser.avatarUrl ? (
                  <img src={currentUser.avatarUrl} alt={userLabel(currentUser)} className="h-full w-full object-cover" />
                ) : (
                  userInitial(currentUser)
                )}
              </span>
              <span className="max-w-[100px] truncate text-xs font-bold text-slate-100">{userLabel(currentUser)}</span>
              <ChevronDown className={`h-3.5 w-3.5 text-cyan-100 transition ${isAccountMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {isAccountMenuOpen && (
              <div className="absolute right-0 top-[calc(100%+10px)] z-[80] w-44 overflow-hidden rounded-xl border border-white/12 bg-[#07121d]/95 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl">
                <button
                  type="button"
                  onClick={openProfileSettings}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-white/82 transition hover:bg-cyan-300/10 hover:text-white"
                >
                  <Settings className="h-4 w-4" />
                  个人设置
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAccountMenuOpen(false);
                    onLogout();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-white/82 transition hover:bg-red-400/10 hover:text-red-100"
                >
                  <LogOut className="h-4 w-4" />
                  退出
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {isProfileOpen && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/55 px-5 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl border border-cyan-300/18 bg-[#07121d]/96 p-6 text-white shadow-2xl shadow-black/60">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/55">Profile</p>
                <h2 className="mt-2 text-2xl font-black">个人设置</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsProfileOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
                aria-label="关闭个人设置"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 flex items-center gap-4">
              <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full border border-cyan-200/35 bg-cyan-200 text-2xl font-black text-[#061626] shadow-[0_0_28px_rgba(39,242,255,0.24)]">
                {profileAvatar ? (
                  <img src={profileAvatar} alt="头像预览" className="h-full w-full object-cover" />
                ) : (
                  userInitial(currentUser)
                )}
              </div>
              <div className="min-w-0 flex-1">
                <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 text-sm font-bold text-cyan-50 transition hover:bg-cyan-300/16">
                  <Upload className="h-4 w-4" />
                  {isAvatarProcessing ? '处理中...' : '上传头像'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleAvatarChange}
                    className="sr-only"
                    disabled={isAvatarProcessing}
                  />
                </label>
                {profileAvatar && (
                  <button
                    type="button"
                    onClick={() => setProfileAvatar('')}
                    className="ml-3 text-sm font-semibold text-white/45 transition hover:text-white"
                  >
                    移除
                  </button>
                )}
                <p className="mt-2 text-xs leading-5 text-white/42">支持 PNG、JPEG、WebP，保存前会自动压缩。</p>
              </div>
            </div>

            <label className="mt-6 block">
              <span className="text-sm font-bold text-white/70">昵称</span>
              <input
                value={profileName}
                onChange={(event) => setProfileName(event.target.value)}
                maxLength={32}
                className="mt-2 h-12 w-full rounded-lg border border-white/10 bg-white/[0.05] px-4 text-white outline-none transition placeholder:text-white/28 focus:border-cyan-300/60 focus:bg-white/[0.08]"
                placeholder="请输入昵称"
              />
            </label>

            <div className="mt-3 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-white/48">
              登录用户名：{currentUser.username}
            </div>

            {profileMessage && (
              <div className="mt-4 rounded-lg border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {profileMessage}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsProfileOpen(false)}
                className="h-10 rounded-lg border border-white/10 bg-white/5 px-4 text-sm font-bold text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                取消
              </button>
              <button
                type="button"
                onClick={saveProfile}
                disabled={isSavingProfile || isAvatarProcessing}
                className="h-10 rounded-lg bg-cyan-200 px-5 text-sm font-black text-[#061626] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-55"
              >
                {isSavingProfile ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 主体区域 */}
      <main className="relative z-10 flex flex-1 gap-5 overflow-hidden px-6 pb-6">
        {/* 侧边栏 */}
        <aside className={`lab-sidebar flex shrink-0 flex-col transition-all ${playIntro ? 'lab-sidebar-enter' : ''} ${isSidebarCollapsed ? 'w-[86px] items-center overflow-hidden p-3' : 'lab-sidebar-expanded w-72 overflow-y-auto p-6'}`}>
          {isSidebarCollapsed ? (
            <>
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(false)}
                className="lab-icon-button mb-5"
                aria-label="展开资源库"
                title="展开资源库"
              >
                <ChevronRight size={18} />
              </button>

              <div className="flex w-full flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => { showModelStage(); loadDemoModel(BUILT_IN_MODELS.diamond, '金刚石模型', 'glb'); }}
                  className="lab-icon-button"
                  aria-label="化学"
                  title="化学 · 金刚石模型"
                >
                  <FlaskConical size={19} />
                </button>
                <div className="my-2 h-px w-8 bg-white/5" />
                <button
                  type="button"
                  onClick={() => { showModelStage(); loadDemoModel(BUILT_IN_MODELS.heart, '心脏模型1', 'glb'); }}
                  className={`lab-icon-button ${modelUrl === BUILT_IN_MODELS.heart ? 'is-active' : ''}`}
                  aria-label="生物"
                  title="生物 · 心脏/HIV 病毒"
                >
                  <Heart size={19} />
                </button>
                <div className="my-2 h-px w-8 bg-white/5" />
                <button
                  type="button"
                  onClick={() => { showModelStage(); loadDemoModel('/models/earth-layers.glb', '地球内部结构', 'glb'); }}
                  className={`lab-icon-button ${modelUrl === '/models/earth-layers.glb' ? 'is-active' : ''}`}
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
                  className={`lab-icon-button h-14 w-14 ${activeContent === 'biodigital'
                    ? 'text-slate-500'
                    : cameraActive
                    ? 'is-active text-red-400'
                    : 'text-slate-500 hover:text-[#22f4df]'
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
                      className="w-full p-2.5 flex items-center justify-between text-sm font-bold text-cyan-400 hover:bg-cyan-950/40 transition-colors rounded-2xl"
                    >
                      <div className="flex items-center gap-2.5">
                        <FlaskConical size={16} className="text-cyan-400" />
                        <span>化学</span>
                      </div>
                      <ChevronDown size={13} className={`text-cyan-500 transition-transform duration-200 ${expandedCategories.has('化学') ? 'rotate-180' : ''}`} />
                    </button>
                    {expandedCategories.has('化学') && (
                      <div className="px-2 pb-2 space-y-2.5">
                        <div>
                          <div className="flex items-center gap-1.5 mb-1 pl-1">
                            <Atom size={11} className="text-cyan-500/70" />
                            <span className="text-[10px] font-black text-cyan-500/70 uppercase tracking-wider">化学分子</span>
                          </div>
                          <div className="space-y-0.5">
                            <div onClick={() => { showModelStage(); loadDemoModel(BUILT_IN_MODELS.diamond, '金刚石模型', 'glb'); }} className={`py-1.5 px-2.5 rounded-lg flex items-center text-xs font-medium cursor-pointer transition-colors ${modelUrl === BUILT_IN_MODELS.diamond ? 'bg-cyan-900/40 text-cyan-300' : 'text-slate-400 hover:bg-cyan-950/30'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full mr-2 ${modelUrl === BUILT_IN_MODELS.diamond ? 'bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.6)]' : 'bg-slate-600'}`}></span>金刚石模型
                            </div>
                            <div onClick={() => { showModelStage(); loadDemoModel(BUILT_IN_MODELS.diamondUnitCell, '金刚石晶胞', 'glb'); }} className={`py-1.5 px-2.5 rounded-lg flex items-center text-xs font-medium cursor-pointer transition-colors ${modelUrl === BUILT_IN_MODELS.diamondUnitCell ? 'bg-cyan-900/40 text-cyan-300' : 'text-slate-400 hover:bg-cyan-950/30'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full mr-2 ${modelUrl === BUILT_IN_MODELS.diamondUnitCell ? 'bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.6)]' : 'bg-slate-600'}`}></span>金刚石晶胞
                            </div>
                            <div onClick={() => { showModelStage(); loadDemoModel(BUILT_IN_MODELS.pubchem6233, '1,4-二氯甲基苯', 'glb'); }} className={`py-1.5 px-2.5 rounded-lg flex items-center text-xs font-medium cursor-pointer transition-colors ${modelUrl === BUILT_IN_MODELS.pubchem6233 ? 'bg-cyan-900/40 text-cyan-300' : 'text-slate-400 hover:bg-cyan-950/30'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full mr-2 ${modelUrl === BUILT_IN_MODELS.pubchem6233 ? 'bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.6)]' : 'bg-slate-600'}`}></span>1,4-二氯甲基苯
                            </div>
                            <div onClick={() => { showModelStage(); loadDemoModel(BUILT_IN_MODELS.nitrobenzene, '硝基苯', 'glb'); }} className={`py-1.5 px-2.5 rounded-lg flex items-center text-xs font-medium cursor-pointer transition-colors ${modelUrl === BUILT_IN_MODELS.nitrobenzene ? 'bg-cyan-900/40 text-cyan-300' : 'text-slate-400 hover:bg-cyan-950/30'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full mr-2 ${modelUrl === BUILT_IN_MODELS.nitrobenzene ? 'bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.6)]' : 'bg-slate-600'}`}></span>硝基苯
                            </div>
                            <div aria-disabled="true" title="暂不可用" className="py-1.5 px-2.5 rounded-lg flex items-center text-xs font-medium cursor-not-allowed transition-colors bg-cyan-950/10 text-slate-500 opacity-70">
                              <span className="w-1.5 h-1.5 rounded-full mr-2 bg-slate-700"></span>NaCl 离子晶体
                            </div>
                            <div aria-disabled="true" title="暂不可用" className="py-1.5 px-2.5 rounded-lg flex items-center text-xs font-medium cursor-not-allowed transition-colors bg-cyan-950/10 text-slate-500 opacity-70">
                              <span className="w-1.5 h-1.5 rounded-full mr-2 bg-slate-700"></span>SiO₂ 二氧化硅网络
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
                      className="w-full p-2.5 flex items-center justify-between text-sm font-bold text-cyan-400 hover:bg-cyan-950/40 transition-colors rounded-2xl"
                    >
                      <div className="flex items-center gap-2.5">
                        <Heart size={16} className="text-cyan-400" />
                        <span>生物</span>
                      </div>
                      <ChevronDown size={13} className={`text-cyan-500 transition-transform duration-200 ${expandedCategories.has('生物') ? 'rotate-180' : ''}`} />
                    </button>
                    {expandedCategories.has('生物') && (
                      <div className="px-2 pb-2 space-y-2.5">
                        <div>
                          <div className="flex items-center gap-1.5 mb-1 pl-1">
                            <Heart size={11} className="text-cyan-500/70" />
                            <span className="text-[10px] font-black text-cyan-500/70 uppercase tracking-wider">人体解剖</span>
                          </div>
                          <div className="space-y-0.5">
                            <div onClick={() => { showModelStage(); loadDemoModel(BUILT_IN_MODELS.heart, '心脏模型1', 'glb'); }} className={`py-1.5 px-2.5 rounded-lg flex items-center text-xs font-medium cursor-pointer transition-colors ${modelUrl === BUILT_IN_MODELS.heart ? 'bg-cyan-900/40 text-cyan-300' : 'text-slate-400 hover:bg-cyan-950/30'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full mr-2 ${modelUrl === BUILT_IN_MODELS.heart ? 'bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.6)]' : 'bg-slate-600'}`}></span>心脏模型1
                            </div>
                            <div aria-disabled="true" title="暂不可用" className="py-1.5 px-2.5 rounded-lg flex items-center text-xs font-medium cursor-not-allowed transition-colors bg-cyan-950/10 text-slate-500 opacity-70">
                              <span className="w-1.5 h-1.5 rounded-full mr-2 bg-slate-700"></span>心脏模型2
                            </div>
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 mb-1 pl-1">
                            <Heart size={11} className="text-cyan-500/70" />
                            <span className="text-[10px] font-black text-cyan-500/70 uppercase tracking-wider">病毒模型</span>
                          </div>
                          <div className="space-y-0.5">
                            <div onClick={() => { showModelStage(); loadDemoModel(BUILT_IN_MODELS.hiv, 'HIV 病毒模型', 'glb'); }} className={`py-1.5 px-2.5 rounded-lg flex items-center text-xs font-medium cursor-pointer transition-colors ${modelUrl === BUILT_IN_MODELS.hiv ? 'bg-cyan-900/40 text-cyan-300' : 'text-slate-400 hover:bg-cyan-950/30'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full mr-2 ${modelUrl === BUILT_IN_MODELS.hiv ? 'bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.6)]' : 'bg-slate-600'}`}></span>HIV 病毒模型
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
                      className="w-full p-2.5 flex items-center justify-between text-sm font-bold text-cyan-400 hover:bg-cyan-950/40 transition-colors rounded-2xl"
                    >
                      <div className="flex items-center gap-2.5">
                        <Globe size={16} className="text-cyan-400" />
                        <span>地理</span>
                      </div>
                      <ChevronDown size={13} className={`text-cyan-500 transition-transform duration-200 ${expandedCategories.has('地理') ? 'rotate-180' : ''}`} />
                    </button>
                    {expandedCategories.has('地理') && (
                      <div className="px-2 pb-2 space-y-0.5">
                        <div onClick={() => { showModelStage(); loadDemoModel('/models/earth-layers.glb', '地球内部结构', 'glb'); }} className={`py-1.5 px-2.5 rounded-lg flex items-center text-xs font-medium cursor-pointer transition-colors ${modelUrl === '/models/earth-layers.glb' ? 'bg-cyan-900/40 text-cyan-300' : 'text-slate-400 hover:bg-cyan-950/30'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full mr-2 ${modelUrl === '/models/earth-layers.glb' ? 'bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.6)]' : 'bg-slate-600'}`}></span>地球内部结构
                        </div>
                        <div onClick={() => { showModelStage(); loadDemoModel('/models/terrain-topography.glb', '地形地貌', 'glb'); }} className={`py-1.5 px-2.5 rounded-lg flex items-center text-xs font-medium cursor-pointer transition-colors ${modelUrl === '/models/terrain-topography.glb' ? 'bg-cyan-900/40 text-cyan-300' : 'text-slate-400 hover:bg-cyan-950/30'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full mr-2 ${modelUrl === '/models/terrain-topography.glb' ? 'bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.6)]' : 'bg-slate-600'}`}></span>地形地貌总览
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
                    className="w-full resize-none rounded-2xl border border-cyan-900/50 bg-cyan-950/20 px-3 py-2 text-xs font-medium leading-relaxed text-slate-300 placeholder-slate-500 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-60 h-16"
                    placeholder="输入教学需求，按 Enter 开始，Shift+Enter 换行"
                    title="按 Enter 开始，Shift+Enter 换行"
                  />
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['planner', 'executor', 'evaluator'] as AgentRole[]).map((role) => {
                      const metas: Record<AgentRole, { title: string; color: string }> = {
                        planner: { title: '理解规划', color: 'text-cyan-400 bg-cyan-950/40 border-cyan-900/50' },
                        executor: { title: '演示执行', color: 'text-cyan-400 bg-cyan-950/40 border-cyan-900/50' },
                        evaluator: { title: '知识讲解', color: 'text-cyan-400 bg-cyan-950/40 border-cyan-900/50' },
                      };
                      const m = metas[role];
                      const statusMap: Record<AgentStatus, string> = { idle: '待命', thinking: '规划中', running: '执行中', done: '完成', error: '异常' };
                      return (
                        <div key={role} className={`rounded-xl border p-1.5 ${m.color}`}>
                          <div className="text-[9px] font-bold truncate">{m.title}</div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className={`h-1.5 w-1.5 rounded-full ${agentStatuses[role] === 'running' || agentStatuses[role] === 'thinking' ? 'animate-pulse bg-cyan-400 shadow-[0_0_5px_rgba(34,211,238,0.5)]' : 'bg-current opacity-50'}`} />
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
                    className="w-full py-2 rounded-xl bg-cyan-900/40 border border-cyan-500/30 text-cyan-300 text-xs font-bold shadow-[0_0_10px_rgba(34,211,238,0.1)] transition hover:bg-cyan-900/60 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50 disabled:border-cyan-900/20 disabled:shadow-none flex items-center justify-center gap-1.5"
                  >
                    {isAgentRunning ? (
                      <><Loader2 size={14} className="animate-spin" /> 运行中...</>
                    ) : (
                      <><Play size={14} /> 开始演示</>
                    )}
                  </button>
                  {agentThinking && (
                    <div className="rounded-2xl border border-cyan-900/40 bg-cyan-950/30 px-2.5 py-2">
                      <p className="text-[10px] font-medium leading-relaxed text-slate-400">{agentThinking}</p>
                    </div>
                  )}
                  <div className={`space-y-1 overflow-y-auto pr-0.5 ${agentTimeline.length > 0 ? 'max-h-24' : ''}`}>
                    {agentTimeline.length === 0 ? (
                      <div className="rounded-xl border border-cyan-900/20 bg-cyan-950/10 px-2.5 py-2 text-[10px] font-medium text-slate-500">
                        等待输入教学需求...
                      </div>
                    ) : (
                      agentTimeline.map((item) => (
                        <div key={item.id} className="rounded-xl border border-cyan-900/30 bg-cyan-950/20 px-2.5 py-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[9px] font-bold text-slate-300 truncate">{item.title}</span>
                            <span className={`text-[7px] font-black uppercase ${
                              item.status === 'running' ? 'text-cyan-400' :
                              item.status === 'error' ? 'text-rose-400' :
                              item.status === 'done' ? 'text-teal-400' : 'text-slate-500'
                            }`}>{item.status === 'running' ? '运行中' : item.status === 'error' ? '异常' : item.status === 'done' ? '完成' : '待命'}</span>
                          </div>
                          <p className="mt-0.5 line-clamp-1 text-[9px] font-medium text-slate-500">{item.detail}</p>
                        </div>
                      ))
                    )}
                  </div>
                  {(knowledgeContent || isKnowledgeStreaming) && (
                    <div className="rounded-2xl border border-cyan-900/40 bg-cyan-950/20 px-2.5 py-2">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {isKnowledgeStreaming ? (
                          <div className="w-1.5 h-1.5 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)] rounded-full animate-pulse" />
                        ) : (
                          <ClipboardCheck size={11} className="text-cyan-400" />
                        )}
                        <span className="text-[9px] font-bold text-cyan-400">知识讲解</span>
                      </div>
                      <p className="text-[10px] font-medium leading-relaxed text-slate-400 line-clamp-3">{knowledgeContent || (isKnowledgeStreaming ? '正在生成知识讲解...' : '')}</p>
                    </div>
                  )}
                </div>
                )}
              </div>

              <div>
                <h3 className="font-black text-xs text-gray-400 uppercase tracking-[0.2em] mb-4 border-l-4 border-cyan-400 pl-3">全息指令表</h3>
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-cyan-950/20 border border-cyan-900/30 space-y-3">
                    <div className="grid grid-cols-2 gap-2 rounded-2xl bg-cyan-950/40 p-1">
                      <button
                        type="button"
                        onClick={() => handleInteractionModeChange('dual')}
                        className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-[10px] font-black transition ${interactionMode === 'dual' ? 'bg-cyan-900/50 text-cyan-300 shadow-sm' : 'text-slate-400 hover:bg-cyan-900/20'}`}
                      >
                        <Move3d size={13} /> 双手模式
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInteractionModeChange('single')}
                        className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-[10px] font-black transition ${interactionMode === 'single' ? 'bg-cyan-900/50 text-cyan-300 shadow-sm' : 'text-slate-400 hover:bg-cyan-900/20'}`}
                      >
                        <Hand size={13} /> 单手模式
                      </button>
                    </div>

                    {interactionMode === 'dual' ? (
                      <>
                        <div className="flex items-center gap-2 pb-2 border-b border-cyan-900/40">
                          <div className="p-1.5 bg-cyan-900/40 rounded-lg"><Move3d size={14} className="text-cyan-400" /></div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-gray-500 uppercase">双手协同</span>
                            <span className="text-[9px] text-cyan-300 font-bold">左手缩放 | 右手旋转/拖拽</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-cyan-900/40 rounded-lg"><Hand size={14} className="text-cyan-400" /></div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-gray-500 uppercase">左手缩放</span>
                            <span className="text-[9px] text-slate-400 font-bold">张开 → 放大 | 握拳 → 缩小</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-cyan-900/40 rounded-lg"><ScanFace size={14} className="text-cyan-400" /></div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-gray-500 uppercase">右手交互</span>
                            <span className="text-[9px] text-cyan-300 font-bold">捏合 → 拖拽零件</span>
                            <span className="text-[9px] text-slate-400 font-bold">食指+中指并拢滑动 → 旋转画面</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 pb-2 border-b border-cyan-900/40">
                          <div className="p-1.5 bg-cyan-900/40 rounded-lg"><Hand size={14} className="text-cyan-400" /></div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-gray-500 uppercase">右手优先</span>
                            <span className="text-[9px] text-cyan-300 font-bold">张掌放大 | 握拳缩小</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-cyan-900/40 rounded-lg"><Hand size={14} className="text-cyan-400" /></div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-gray-500 uppercase">捏合拖拽</span>
                            <span className="text-[9px] text-slate-400 font-bold">食指+拇指捏合 → 拖拽零件</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-cyan-900/40 rounded-lg"><ScanFace size={14} className="text-cyan-400" /></div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-gray-500 uppercase">互斥控制</span>
                            <span className="text-[9px] text-cyan-300 font-bold">双指旋转优先；缩放与拖拽不会同时触发</span>
                          </div>
                        </div>
                      </>
                    )}

                    <div className="hidden">

                    {/* 组合指令 */}
                    <div className="flex items-center gap-2 pb-2 border-b border-cyan-900/40">
                      <div className="p-1.5 bg-cyan-900/40 rounded-lg"><Move3d size={14} className="text-cyan-400" /></div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-gray-500 uppercase">双人/双手</span>
                        <span className="text-[9px] text-cyan-300 font-bold">双手协同控制模型</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-cyan-900/40 rounded-lg"><Hand size={14} className="text-cyan-400" /></div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-gray-500 uppercase">左手 (缩放)</span>
                        <span className="text-[9px] text-slate-400 font-bold">张开 → 放大 | 握拳 → 缩小</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-cyan-900/40 rounded-lg"><ScanFace size={14} className="text-cyan-400" /></div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-gray-500 uppercase">右手 (拆解/旋转)</span>
                        <span className="text-[9px] text-cyan-300 font-bold">捏合 (食+拇) → 抓取零件</span>
                        <span className="text-[9px] text-slate-400 font-bold">双指并拢 (食+中) → 旋转画面</span>
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
                      ? 'bg-cyan-950/10 border-cyan-900/20 text-slate-500 cursor-not-allowed'
                      : cameraActive
                      ? 'bg-rose-950/30 border-rose-900/50 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.15)]'
                      : 'bg-cyan-950/30 border-cyan-900/50 text-cyan-400 hover:bg-cyan-900/40 hover:text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.1)]'
                      }`}
                  >
                    {activeContent === 'biodigital' ? '手势捕捉不可用' : cameraActive ? '停用摄像头' : '启用手势捕捉'}
                  </button>
                </div>
              </div>

              <div className="mt-auto pt-4">
                <div className="bg-cyan-950/20 p-4 rounded-2xl border border-cyan-900/40 relative overflow-hidden">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare size={14} className="text-cyan-400" />
                    <p className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">助教日志</p>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed font-medium italic min-h-[3em]">
                    "{aiAnalysis}"
                  </p>
                </div>
              </div>
            </>
          )}
        </aside>

        {/* 视口展示区 */}
        <section ref={stageRef} className={`lab-stage relative flex-1 overflow-hidden group ${isStageFullscreen ? 'h-screen w-screen rounded-none' : 'rounded-[30px]'} ${playIntro ? 'lab-stage-enter' : ''}`}>
          <div className="lab-stage-grid" aria-hidden="true" />
          <div className="lab-orbit lab-orbit-one" aria-hidden="true" />
          <div className="lab-orbit lab-orbit-two" aria-hidden="true" />
          <div className="lab-wire-cube lab-wire-cube-left" aria-hidden="true" />
          <div className="lab-wire-cube lab-wire-cube-right" aria-hidden="true" />

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
                className={`p-3 rounded-full shadow-[0_0_15px_rgba(34,211,238,0.15)] border transition-all active:scale-90 ${showSettings ? 'bg-cyan-900/60 border-cyan-500/50 text-cyan-300' : 'bg-cyan-950/40 border-cyan-900/50 text-cyan-500 hover:bg-cyan-900/60 hover:text-cyan-300'}`}
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

              {/* 全局模型：答题模式入口 */}
              {modelUrl && !quizMode && (
                <button
                  ref={quizButtonRef}
                  onClick={() => {
                    setQuizSubjectFilter(modelUrl);
                    setQuizMode(true);
                  }}
                  className="relative overflow-hidden px-3 py-1.5 sm:px-4 sm:py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-full shadow-[0_0_15px_rgba(34,211,238,0.4)] text-xs font-black tracking-widest uppercase transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 sm:gap-2 border border-cyan-400/30"
                >
                  <div 
                    ref={quizProgressRef}
                    className="absolute left-0 top-0 bottom-0 bg-white/20"
                    style={{ width: '0%' }}
                  />
                  <span className="relative z-10 animate-pulse">✨</span>
                  <span className="relative z-10">答题模式</span>
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
            {activeContent === 'model' && cameraActive && (
              <div className="lab-stage-chip text-cyan-400 border border-cyan-400/30 bg-cyan-950/40 shadow-[0_0_15px_rgba(34,211,238,0.15)]">
                <div className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)] animate-pulse"></div>
                AI 动势追踪
              </div>
            )}
            <button
              type="button"
              onClick={toggleStageFullscreen}
              className="lab-square-button"
              aria-label={isStageFullscreen ? '退出全屏' : '展示区全屏'}
              title={isStageFullscreen ? '退出全屏' : '展示区全屏'}
            >
              {isStageFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          </div>

          {/* 3D 模型层 */}
          <div className="relative z-10 w-full h-full transition-opacity duration-300 opacity-100">
            {activeContent === 'biodigital' ? (
              <BioDigitalViewer src={BIODIGITAL_HEART_URL} onFallback={loadHeartFallbackModel} />
            ) : modelUrl ? (
              <>
                <ModelViewer
                  modelUrl={modelUrl}
                  modelType={modelType}
                  assetUrls={modelAssetUrls}
                  controlRef={controlRef}
                  showLabels={showLabels}
                  onShowLabelsChange={setShowLabels}
                  onLoadProgress={(progress) => setLoadProgress(progress)}
                  onLoadComplete={() => setLoadProgress(null)}
                />
                {/* 模型加载进度遮罩 */}
                {loadProgress !== null && loadProgress.percent < 100 && (
                  <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity duration-300">
                    <div className="bg-slate-900/80 backdrop-blur-xl border border-cyan-500/20 rounded-2xl px-8 py-6 shadow-2xl max-w-xs w-full text-center">
                      <div className="text-cyan-400 text-sm font-bold mb-1">🫀 正在加载模型</div>
                      <div className="text-slate-400 text-xs mb-4">{fileName || '3D 模型'}</div>
                      <div className="w-full bg-slate-700/60 rounded-full h-2.5 mb-3 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300 ease-out"
                          style={{ width: `${loadProgress.percent}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-500">
                        <span>{loadProgress.total > 0 ? `${(loadProgress.loaded / 1024 / 1024).toFixed(1)}MB / ${(loadProgress.total / 1024 / 1024).toFixed(1)}MB` : '计算中...'}</span>
                        <span className="text-cyan-400 font-semibold">{loadProgress.percent}%</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="lab-welcome">
                <div className={`lab-cube-card ${playIntro ? 'lab-cube-enter' : ''}`}>
                  <Box className="lab-cube-icon" strokeWidth={1.55} />
                </div>
                <div className={`lab-welcome-copy ${introReady ? 'is-ready' : ''}`}>
                  <h2 className="lab-welcome-title">
                    欢迎来到 <span>数智课堂</span>
                  </h2>
                  <div className="lab-stream">
                    <b>交互指令：</b>
                    <p>
                      {streamedInstruction.split('\n').map((line, index) => (
                        <React.Fragment key={index}>
                          {line}
                          {index < streamedInstruction.split('\n').length - 1 && <br />}
                        </React.Fragment>
                      ))}
                      {streamedInstruction.length < INTRO_INSTRUCTION.length && <span className="lab-stream-cursor" />}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 摄像头预览区 */}
          {activeContent === 'model' && cameraActive && (
            <div className={`absolute bottom-6 right-6 w-56 h-40 rounded-3xl border-4 border-white shadow-2xl overflow-hidden bg-black transition-all hover:scale-105 ${quizMode ? 'z-[9001]' : 'z-30'}`}>
              <HandController controlRef={controlRef} onStateChange={handleGestureUpdate} interactionMode={interactionMode} />
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <div className="bg-[#86e3ce] w-2 h-2 rounded-full animate-pulse shadow-[0_0_8px_#86e3ce]"></div>
                <span className="text-[8px] font-black text-white/70 uppercase tracking-widest">Vision Sensor</span>
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className="relative z-10 flex h-8 items-center px-7 text-[11px] font-bold tracking-wider text-slate-500">
        <span>© 2026 慧视课堂 | 教育 AI 实验室</span>
      </footer>

      {/* 答题模式全屏浮层 */}
      {quizMode && (
        <QuizOverlay
          stageRef={stageRef}
          controlRef={controlRef}
          cameraActive={cameraActive}
          onExit={() => setQuizMode(false)}
          subjectFilter={quizSubjectFilter}
        />
      )}
    </div>
  );
};

export default App;
