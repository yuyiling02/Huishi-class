
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { GestureType, MoveDirection, ControlRefs, InteractionMode } from './types';
import { ProcessingOverlay } from './components/UIComponents';
import HandController from './components/HandController';
import ModelViewer from './components/ModelViewer';
import BioDigitalViewer from './components/BioDigitalViewer';
import VoiceController from './components/VoiceController';
import { Upload, Sparkles, Box, Atom, Globe, ChevronDown, ChevronLeft, ChevronRight, MessageSquare, Video, Film, Hand, ScanFace, Move3d, Maximize2, Minimize2, FlaskConical, Heart, Settings, X } from 'lucide-react';
import { ModelType } from './types';

const ENABLE_GEMINI = (import.meta as any).env?.VITE_ENABLE_GEMINI === 'true';
const BIODIGITAL_HEART_URL = 'https://human.biodigital.com/view?id=7F0a&lang=zh&ref=share';
const BUILT_IN_MODELS = {
  heart: '/models/心脏模型.glb',
  hiv: '/models/hiv-virus.glb',
  diamond: '/models/diamond.glb',
} as const;
type ActiveContent = 'model' | 'biodigital';

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
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isVideoMode, setIsVideoMode] = useState(false);
  const [fileName, setFileName] = useState<string>('');
  const [cameraActive, setCameraActive] = useState(false);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('dual');
  const [activeContent, setActiveContent] = useState<ActiveContent>('model');
  const [isStageFullscreen, setIsStageFullscreen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['地理']));

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
  const [zoomSpeedMultiplier, setZoomSpeedMultiplier] = useState(1.0);
  const [rotationSpeedMultiplier, setRotationSpeedMultiplier] = useState(1.0);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const controlRef = useRef<ControlRefs>({
    rotationVelocity: { x: 0, y: 0 },
    zoomSpeed: 0,
    panPosition: { x: 0, y: 0 },
    isDragging: false,
    handLandmarks: { left: null, right: null },
    interactionSettings: { zoomSpeed: 1.0, rotationSpeed: 1.0 }
  });

  const resetControls = () => {
    controlRef.current = {
      rotationVelocity: { x: 0, y: 0 },
      zoomSpeed: 0,
      panPosition: { x: 0, y: 0 },
      isDragging: false,
      handLandmarks: { left: null, right: null }
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
    setIsVideoMode(false);
  };

  const showBioDigitalStage = () => {
    setActiveContent('biodigital');
    setIsVideoMode(false);
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

  const handleVideoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setAiAnalysis(`视频已就绪: 双手接触即可播放`);
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

    const shouldBeVideoMode = gesture === GestureType.DUAL_HAND_CONTACT;

    setIsVideoMode((prev) => {
      if (prev !== shouldBeVideoMode) {
        if (shouldBeVideoMode && videoUrl) {
          setAiAnalysis('视频模式：双手保持接触中');
        }
        return shouldBeVideoMode;
      }
      return prev;
    });
  }, [videoUrl]);

  const handleInteractionModeChange = (mode: InteractionMode) => {
    setInteractionMode(mode);
    setIsVideoMode(false);
    resetControls();
    setAiAnalysis(mode === 'dual'
      ? '已切换为双手模式：左手缩放，右手旋转/拖拽，双手接触播放视频。'
      : '已切换为单手模式：张开放大，握拳缩小，食指和中指并拢滑动旋转。'
    );
  };

  // Sync interaction speed settings to controlRef
  useEffect(() => {
    controlRef.current.interactionSettings = {
      zoomSpeed: zoomSpeedMultiplier,
      rotationSpeed: rotationSpeedMultiplier,
    };
  }, [zoomSpeedMultiplier, rotationSpeedMultiplier]);
  useEffect(() => {
    if (videoRef.current) {
      if (isVideoMode) {
        videoRef.current.play().catch(console.error);
      } else {
        videoRef.current.pause();
      }
    }
  }, [isVideoMode]);

  return (
    <div className="flex flex-col h-screen text-slate-700">
      {/* 顶部导航 */}
      <nav className="h-20 px-8 flex items-center justify-between z-50">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-[#86e3ce] rounded-full flex items-center justify-center text-white shadow-lg animate-pulse">
            <Box size={20} />
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-black text-gray-700 tracking-tight">慧视课堂</span>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest -mt-1">AI 沉浸式教学系统</span>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="relative group">
            <input
              type="file"
              accept="video/*"
              onChange={handleVideoUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <button className="px-6 py-2 rounded-full glass-panel text-gray-500 hover:text-purple-500 flex items-center transition-all hover:bg-purple-50">
              <Video className="mr-2" size={18} /> 导入视频
            </button>
          </div>

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
              <Upload className="mr-2" size={16} /> 导入模型
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
        <aside className={`glass-panel rounded-[32px] flex shrink-0 flex-col animate-in slide-in-from-left-8 duration-700 transition-all ${isSidebarCollapsed ? 'w-20 items-center p-3' : 'w-72 p-6 space-y-8'}`}>
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
                  aria-label="物理化学"
                  title="物理化学 · 金刚石模型"
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
                  <h3 className="font-black text-xs text-gray-400 uppercase tracking-[0.2em] border-l-4 border-[#86e3ce] pl-3">学科资源库</h3>
                  <button
                    type="button"
                    onClick={() => setIsSidebarCollapsed(true)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/60 text-gray-400 shadow-sm transition hover:bg-white hover:text-gray-700"
                    aria-label="收起资源库"
                    title="收起资源库"
                  >
                    <ChevronLeft size={17} />
                  </button>
                </div>

                <div className="space-y-1.5">
                  {/* 物理化学 */}
                  <div className="rounded-2xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedCategories(prev => {
                          const next = new Set(prev);
                          next.has('物理化学') ? next.delete('物理化学') : next.add('物理化学');
                          return next;
                        });
                      }}
                      className="w-full p-2.5 flex items-center justify-between text-sm font-bold text-blue-600 hover:bg-blue-50/60 transition-colors rounded-2xl"
                    >
                      <div className="flex items-center gap-2.5">
                        <FlaskConical size={16} className="text-blue-400" />
                        <span>物理化学</span>
                      </div>
                      <ChevronDown size={13} className={`text-blue-300 transition-transform duration-200 ${expandedCategories.has('物理化学') ? 'rotate-180' : ''}`} />
                    </button>
                    {expandedCategories.has('物理化学') && (
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
                            <div onClick={showBioDigitalStage} className={`py-1.5 px-2.5 rounded-lg flex items-center text-xs font-medium cursor-pointer transition-colors ${activeContent === 'biodigital' ? 'bg-rose-100/60 text-rose-600' : 'text-gray-500 hover:bg-rose-50/40'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full mr-2 ${activeContent === 'biodigital' ? 'bg-rose-500 animate-pulse' : 'bg-rose-300'}`}></span>心脏模型2
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
                            <span className="text-[10px] font-black text-gray-500 uppercase">双手接触</span>
                            <span className="text-[9px] text-indigo-500 font-bold">保持接触 → 视频展示</span>
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
                            <span className="text-[10px] font-black text-gray-500 uppercase">张开手掌</span>
                            <span className="text-[9px] text-emerald-500 font-bold">放大画面</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-amber-100 rounded-lg"><Hand size={14} className="text-amber-500" /></div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-gray-500 uppercase">握拳</span>
                            <span className="text-[9px] text-gray-400 font-bold">缩小画面</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-purple-100 rounded-lg"><ScanFace size={14} className="text-purple-400" /></div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-gray-500 uppercase">食指+中指并拢</span>
                            <span className="text-[9px] text-purple-400 font-bold">保持并滑动 → 旋转画面</span>
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
                        <span className="text-[9px] text-indigo-500 font-bold">双手接触 (保持) → 视频展示</span>
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

          {/* 视频播放层 */}
          <div className={`absolute inset-0 z-20 bg-black transition-opacity duration-300 ${isVideoMode ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
            {videoUrl && (
              <video
                ref={videoRef}
                src={videoUrl}
                className="w-full h-full object-contain"
                loop
                controls={false}
                muted
              />
            )}
            <div className="absolute top-6 left-6 px-4 py-2 bg-black/50 backdrop-blur-md rounded-xl text-white/80 text-xs font-bold border border-white/20 flex items-center gap-2">
              <Film size={14} className="text-purple-400" />
              视频模式 (分开双手关闭)
            </div>
          </div>

          {activeContent === 'model' && (
            <div className="absolute bottom-6 left-6 z-50 flex items-center gap-2">
              <VoiceController
                controlRef={controlRef}
                onStatusChange={(msg) => setAiAnalysis(msg)}
              />
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`p-3 rounded-full shadow-lg transition-all active:scale-90 ${showSettings ? 'bg-gray-800 text-white' : 'bg-white/80 text-gray-400 hover:text-gray-600'}`}
                aria-label="交互速度设置"
                title="交互速度设置"
              >
                <Settings size={20} />
              </button>

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
                      onClick={() => { setZoomSpeedMultiplier(1.0); setRotationSpeedMultiplier(1.0); }}
                      className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-500 text-xs font-black uppercase tracking-wider hover:bg-gray-200 transition"
                    >
                      重置默认
                    </button>
                  </div>
                </div>
              )}
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
          <div className={`w-full h-full transition-opacity duration-300 ${isVideoMode ? 'opacity-0' : 'opacity-100'}`}>
            {activeContent === 'biodigital' ? (
              <BioDigitalViewer src={BIODIGITAL_HEART_URL} onFallback={loadHeartFallbackModel} />
            ) : modelUrl ? (
              <ModelViewer modelUrl={modelUrl} modelType={modelType} assetUrls={modelAssetUrls} controlRef={controlRef} />
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
                    左手张开/闭合：缩放 | 双手接触：播放视频
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
        <span>© 2025 慧视课堂 | 教育 AI 实验室</span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1 text-[#86e3ce]">
            <div className="w-1 h-1 bg-[#86e3ce] rounded-full animate-ping"></div>
            Gemini Live API 已接入
          </span>
          <span>v3.7.0-FINGER-CTRL</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
