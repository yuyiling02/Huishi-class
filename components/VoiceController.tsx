import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { ControlRefs, InteractionMode } from '../types';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { isXiaozhiSpeechActive, prepareXiaozhiSpeech, subscribeXiaozhiSpeechActivity } from '../services/xiaozhiSpeechService';
import { parseVoiceInteractionMode } from '../services/voiceInteractionMode';
import {
  getVoiceActivationDisposition,
  shouldCloseVoiceInputAfterFinalUtterance,
  type VoiceActivationRequest,
  type VoiceRecognitionState,
} from '../services/voiceInputLifecycle';
import {
  BrowserSpeechRecognition,
  BrowserSpeechRecognitionError,
  describeBrowserSpeechRecognitionError,
  isBrowserSpeechRecognitionSupported,
} from '../services/browserSpeechRecognition';

// ====== 语音命令模式（扩展版，支持中英混合 + 自然语言变体）======
// 注意：lock_rotation 用 _WEAK 标记容易误伤的模糊词（单独的 stop/pause/freeze），
// extractCommands 里会根据 voiceRotationActive 决定是否忽略
const LOCK_STRONG = /锁定旋转|锁住旋转|停止旋转|停止转动|别转|不要转|停转|停下旋转|停下来|转.*停|停.*转|不再旋转|别再转|不用转|暂停旋转|暂停转动|暂停|停止/;
const LOCK_WEAK   = /\b(?:stop(?:\s+rotation|\s+turn|\s+it)?|lock(?:\s+rotation)?|freeze)\b/i;

const COMMAND_PATTERNS: [RegExp, string, (ctrl: ControlRefs) => void, boolean?][] = [
  [/再?放?大一点|大一点|大些|大一些|靠近|拉近|近一点|近一些|放大|\b(big|bigger|zoomin|zoom in|zoom-in|in|larger|close[ -]?up|closer)\b/i, 'zoom_in', (c) => { console.log('[VoiceCmd] zoom_in fired'); c.zoomSpeed = 15.0; setTimeout(() => { if (!c.voiceRotationActive) c.zoomSpeed = 0; }, 1500); }],
  [/再?缩?小一点|小一点|小些|小一些|远离|拉远|远一点|远一些|缩小|\b(small|smaller|zoomout|zoom out|zoom-out|out|farther|further|away)\b/i, 'zoom_out', (c) => { console.log('[VoiceCmd] zoom_out fired'); c.zoomSpeed = -15.0; setTimeout(() => { if (!c.voiceRotationActive) c.zoomSpeed = 0; }, 1500); }],
  [null, 'lock_rotation', (c) => { console.log('[VoiceCmd] lock_rotation fired'); c.rotationLocked = true; c.voiceRotationActive = false; c.zoomSpeed = 0; c.rotationVelocity = { x: 0, y: 0 }; }],
  [/转(九十度|90度|一下|几圈|一圈)|右?转(九十度|90度)|左?转(九十度|90度)|\bturn(?:\s+(?:90|right|left|around|once))\b|\bspin\s+(?:once|90)\b/i, 'turn_burst', (c) => { console.log('[VoiceCmd] turn_burst fired'); c.rotationLocked = false; c.voiceRotationActive = false; c.rotationVelocity = { x: 0, y: 0.06 }; setTimeout(() => { if (!c.voiceRotationActive) c.rotationVelocity = { x: 0, y: 0 }; }, 400); }],
  [/解锁旋转|解除锁定|取消锁定|恢复旋转|继续旋转|继续转|开始转|转圈|旋转|一直转|转起来|转动|\b(rotate|rotation|keep[ -]?turning|continuously|start[ -]?spin|keep[ -]?spin)\b/i, 'spin', (c) => { console.log('[VoiceCmd] spin fired, setting velocity.y=0.035'); c.rotationLocked = false; c.voiceRotationActive = true; c.rotationVelocity = { x: 0, y: 0.035 }; }],
];

function extractCommands(text: string, controlRef: ControlRefs): string[] {
  const fired: string[] = [];
  const voiceActive = controlRef.voiceRotationActive;
  for (const entry of COMMAND_PATTERNS) {
    const [pattern, name, action] = entry;
    // 冲突保护：spin/turn_burst 优先于 lock_rotation（同一次 utterance 里）
    if (name === 'lock_rotation' && (fired.includes('spin') || fired.includes('turn_burst'))) continue;
    if ((name === 'spin' || name === 'turn_burst') && fired.includes('lock_rotation')) continue;

    // lock_rotation 特殊处理：用强弱两套正则
    if (name === 'lock_rotation') {
      const strong = LOCK_STRONG.test(text);
      const weak   = LOCK_WEAK.test(text);
      if (!strong && !weak) continue;
      // 语音旋转活跃中 → 只有"强"停止词才生效（"别转"/"停止旋转"等），忽略弱词（单独 stop/freeze）
      if (voiceActive && !strong) {
        console.log('[VoiceCmd] lock_rotation weak match IGNORED (voiceRotationActive=true), text="', text, '"');
        continue;
      }
      action(controlRef);
      fired.push(name);
      continue;
    }

    if (pattern!.test(text)) {
      action(controlRef);
      fired.push(name);
    }
  }
  return fired;
}

export type { VoiceActivationRequest, VoiceRecognitionState } from '../services/voiceInputLifecycle';

interface VoiceControllerProps {
  controlRef: React.MutableRefObject<ControlRefs>;
  onStatusChange: (status: string) => void;
  onRecognizedText?: (text: string) => void;
  onFinalUtterance?: (text: string) => void;
  onBargeIn?: () => void;
  onActiveChange?: (active: boolean) => void;
  onRecognitionStateChange?: (state: VoiceRecognitionState) => void;
  onInteractionModeChange?: (mode: InteractionMode) => void;
  assistantSpeechText?: string;
  assistantSpeaking?: boolean;
  answerOnly?: boolean;
  answerOptions?: string[];
  activeAnswerQuestionId?: string;
  toggleRequest?: number;
  forceToggleRequest?: number;
  activateRequest?: VoiceActivationRequest | null;
  deactivateRequest?: number;
  disabled?: boolean;
  listeningAllowed?: boolean;
}

const VoiceController: React.FC<VoiceControllerProps> = ({
  controlRef,
  onStatusChange,
  onRecognizedText,
  onFinalUtterance,
  onBargeIn,
  onActiveChange,
  onRecognitionStateChange,
  onInteractionModeChange,
  assistantSpeechText = '',
  assistantSpeaking = false,
  answerOnly = false,
  answerOptions = [],
  activeAnswerQuestionId,
  toggleRequest = 0,
  forceToggleRequest = 0,
  activateRequest = null,
  deactivateRequest = 0,
  disabled = false,
  listeningAllowed = true,
}) => {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [speechActive, setSpeechActive] = useState(isXiaozhiSpeechActive);
  const [recognizedText, setRecognizedText] = useState('');
  const [speechRecognitionSupported] = useState(isBrowserSpeechRecognitionSupported);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const sessionStartingRef = useRef(false);
  const stoppedRef = useRef(false);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const utteranceStartedRef = useRef(false);
  const lastToggleRequestRef = useRef(toggleRequest);
  const lastForceToggleRequestRef = useRef(forceToggleRequest);
  const lastActivateRequestRef = useRef(activateRequest?.id ?? 0);
  const lastDeactivateRequestRef = useRef(deactivateRequest);
  const pendingActivationRequestRef = useRef<VoiceActivationRequest | null>(null);
  const pausedForAssistantRef = useRef(false);
  const answerOnlyRef = useRef(answerOnly);
  const answerOptionsRef = useRef(answerOptions);
  const activeAnswerQuestionIdRef = useRef(activeAnswerQuestionId);
  const disabledRef = useRef(disabled);
  const listeningAllowedRef = useRef(listeningAllowed);
  const onBargeInRef = useRef(onBargeIn);
  const onFinalUtteranceRef = useRef(onFinalUtterance);
  const onInteractionModeChangeRef = useRef(onInteractionModeChange);
  const onRecognitionStateChangeRef = useRef(onRecognitionStateChange);
  const assistantSpeakingRef = useRef(assistantSpeaking);
  const assistantSpeechTextRef = useRef(assistantSpeechText);

  // The browser recognition client keeps its original callbacks for the whole
  // session. Keep changing interaction state/callbacks fresh without reconnecting.
  answerOnlyRef.current = answerOnly;
  answerOptionsRef.current = answerOptions;
  activeAnswerQuestionIdRef.current = activeAnswerQuestionId;
  disabledRef.current = disabled;
  listeningAllowedRef.current = listeningAllowed;
  onBargeInRef.current = onBargeIn;
  onFinalUtteranceRef.current = onFinalUtterance;
  onInteractionModeChangeRef.current = onInteractionModeChange;
  onRecognitionStateChangeRef.current = onRecognitionStateChange;
  assistantSpeakingRef.current = assistantSpeaking;
  assistantSpeechTextRef.current = assistantSpeechText;

  const publishRecognitionState = useCallback((state: VoiceRecognitionState) => {
    onRecognitionStateChangeRef.current?.(state);
  }, []);

  const isAssistantEcho = useCallback((text: string) => {
    if (!assistantSpeakingRef.current) return false;
    const normalize = (value: string) => value.toLowerCase().replace(/[\s，。！？、,.!?；;：“”'‘’]/g, '');
    const recognized = normalize(text);
    const assistant = normalize(assistantSpeechTextRef.current);
    if (recognized.length < 4 || !assistant) return false;
    return assistant.includes(recognized) || recognized.includes(assistant.slice(0, Math.min(assistant.length, 16)));
  }, []);

  const clearDisplayText = useCallback(() => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    setRecognizedText('');
    onRecognizedText?.('');
  }, [onRecognizedText]);

  const stopSession = useCallback(() => {
    stoppedRef.current = true;
    pausedForAssistantRef.current = false;
    sessionStartingRef.current = false;
    utteranceStartedRef.current = false;
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) void rec.stop();
    setIsActive(false);
    setIsConnecting(false);
    onActiveChange?.(false);
    clearDisplayText();
    onStatusChange('语音助手已离线');
    publishRecognitionState({ phase: 'idle' });
  }, [clearDisplayText, onActiveChange, onStatusChange, publishRecognitionState]);

  const handleRecognition = useCallback((rawText: string, isFinal: boolean) => {
    if (stoppedRef.current) return;
    const text = rawText.trim();
    const assistantEcho = text ? isAssistantEcho(text) : false;

    if (text && !assistantEcho) {
      if (!utteranceStartedRef.current) {
        utteranceStartedRef.current = true;
        onBargeInRef.current?.();
      }
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      setRecognizedText(text);
      onRecognizedText?.(text);
      publishRecognitionState({ phase: isFinal ? 'recognized' : 'recognizing', text });
      clearTimerRef.current = setTimeout(() => {
        setRecognizedText('');
        onRecognizedText?.('');
        if (!isFinal) publishRecognitionState({ phase: 'listening' });
        clearTimerRef.current = null;
      }, 5000);
    }

    if (!isFinal) return;
    utteranceStartedRef.current = false;
    if (assistantEcho || !text) return;

    const interactionMode = answerOnlyRef.current ? null : parseVoiceInteractionMode(text);
    const commands = answerOnlyRef.current ? [] : extractCommands(text, controlRef.current);
    if (interactionMode) {
      onInteractionModeChangeRef.current?.(interactionMode);
      commands.unshift(interactionMode === 'single' ? 'single_mode' : 'dual_mode');
    }
    if (commands.length > 0) {
      const cmdNames: Record<string, string> = {
        zoom_in: '放大',
        zoom_out: '缩小',
        rotate: '旋转/解锁',
        lock_rotation: '锁定旋转',
        single_mode: '单手模式',
        dual_mode: '双手模式',
      };
      onStatusChange(`识别: "${text}" → 执行: ${commands.map((command) => cmdNames[command] || command).join('、')}`);
      return;
    }

    onStatusChange(answerOnlyRef.current
      ? `追问作答: "${text}"`
      : `识别: "${text}"`);
    const shouldCloseVoiceInput = shouldCloseVoiceInputAfterFinalUtterance(text, {
      answerOnly: answerOnlyRef.current,
      answerOptions: answerOptionsRef.current,
    });
    if (answerOnlyRef.current && !shouldCloseVoiceInput) {
      onStatusChange(`追问作答未匹配选项: "${text}"，请说 A 或 B`);
      return;
    }
    if (shouldCloseVoiceInput) stopSession();
    onFinalUtteranceRef.current?.(text);
  }, [controlRef, isAssistantEcho, onRecognizedText, onStatusChange, publishRecognitionState, stopSession]);

  const startSession = useCallback(async () => {
    if (!speechRecognitionSupported) {
      const message = describeBrowserSpeechRecognitionError(
        new BrowserSpeechRecognitionError('unsupported', 'SpeechRecognition is unavailable'),
      );
      onStatusChange(message);
      publishRecognitionState({ phase: 'error', message });
      return false;
    }
    if (disabledRef.current || !listeningAllowedRef.current || isXiaozhiSpeechActive() || sessionStartingRef.current || recognitionRef.current) return false;
    stoppedRef.current = false;
    pausedForAssistantRef.current = false;
    sessionStartingRef.current = true;
    setIsConnecting(true);
    onStatusChange('正在启动浏览器语音识别...');
    publishRecognitionState({ phase: 'connecting' });

    const recognition = new BrowserSpeechRecognition({
      onPartial: (text) => handleRecognition(text, false),
      onFinal: (text) => handleRecognition(text, true),
      onError: (error) => {
        if (recognitionRef.current !== recognition) return;
        stopSession();
        const message = describeBrowserSpeechRecognitionError(error);
        onStatusChange(message);
        publishRecognitionState({ phase: 'error', message });
      },
    }, undefined, () => listeningAllowedRef.current && !disabledRef.current && !isXiaozhiSpeechActive());
    recognitionRef.current = recognition;

    try {
      await recognition.start();
      // A response can begin while microphone permission/ASR is still connecting.
      // Do not let that late connection reactivate recording during the response.
      if (disabledRef.current || !listeningAllowedRef.current || isXiaozhiSpeechActive() || stoppedRef.current || recognitionRef.current !== recognition) {
        // A connection that becomes invalid here must clear its ref; otherwise
        // the pending follow-up request can never reconnect after TTS releases.
        stopSession();
        return false;
      }
      setIsActive(true);
      onActiveChange?.(true);
      publishRecognitionState({ phase: 'listening' });
      onStatusChange(answerOnlyRef.current
        ? '浏览器语音识别已就绪（请说 A 或 B）'
        : '浏览器语音识别已就绪（试试说：放大、缩小、旋转、停止旋转）');
      return true;
    } catch (error) {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      stoppedRef.current = true;
      setIsActive(false);
      onActiveChange?.(false);
      const recognitionError = error instanceof BrowserSpeechRecognitionError
        ? error
        : new BrowserSpeechRecognitionError('start_failed', error instanceof Error ? error.message : String(error));
      const message = describeBrowserSpeechRecognitionError(recognitionError);
      onStatusChange(message);
      publishRecognitionState({ phase: 'error', message });
      return false;
    } finally {
      sessionStartingRef.current = false;
      setIsConnecting(false);
    }
  }, [handleRecognition, onActiveChange, onStatusChange, publishRecognitionState, speechRecognitionSupported, stopSession]);

  const toggleVoice = useCallback(() => {
    if (isActive) {
      stopSession();
    } else if (!disabled && listeningAllowed) {
      prepareXiaozhiSpeech();
      startSession();
    }
  }, [disabled, isActive, listeningAllowed, stopSession, startSession]);

  useEffect(() => {
    if (toggleRequest === lastToggleRequestRef.current) return;
    lastToggleRequestRef.current = toggleRequest;
    toggleVoice();
  }, [toggleRequest, toggleVoice]);

  useEffect(() => {
    if (forceToggleRequest === lastForceToggleRequestRef.current) return;
    lastForceToggleRequestRef.current = forceToggleRequest;
    if (isActive) {
      stopSession();
    } else {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* noop */ }
        recognitionRef.current = null;
      }
      sessionStartingRef.current = false;
      stoppedRef.current = false;
      pausedForAssistantRef.current = false;
      prepareXiaozhiSpeech();
      startSession();
    }
  }, [forceToggleRequest, isActive, stopSession, startSession]);

  const tryPendingActivation = useCallback(() => {
    const request = pendingActivationRequestRef.current;
    if (!request || request.id === lastActivateRequestRef.current) return;
    if (!speechRecognitionSupported) {
      const message = '当前浏览器不支持语音识别，请使用最新版 Chrome 或 Edge。';
      lastActivateRequestRef.current = request.id;
      pendingActivationRequestRef.current = null;
      onStatusChange(message);
      publishRecognitionState({ phase: 'error', message });
      return;
    }
    const disposition = getVoiceActivationDisposition(request, {
      answerOnly: answerOnlyRef.current,
      activeAnswerQuestionId: activeAnswerQuestionIdRef.current,
      disabled,
      listeningAllowed,
      speechActive,
    });
    if (disposition === 'drop') {
      lastActivateRequestRef.current = request.id;
      pendingActivationRequestRef.current = null;
      return;
    }
    // Follow-up requests wait through TTS/output-tail locks, while ordinary
    // continuous-conversation requests are dropped as stale when locked. Keep
    // the request until a state change makes it safe to open the microphone.
    if (disposition === 'wait') {
      publishRecognitionState({ phase: 'waiting', message: '等待题目播报结束后开启识别' });
      return;
    }
    if (isActive) {
      lastActivateRequestRef.current = request.id;
      pendingActivationRequestRef.current = null;
      return;
    }
    prepareXiaozhiSpeech();
    void startSession().then((started) => {
      if (!started || pendingActivationRequestRef.current !== request) return;
      lastActivateRequestRef.current = request.id;
      pendingActivationRequestRef.current = null;
    });
  }, [disabled, isActive, listeningAllowed, onStatusChange, publishRecognitionState, speechActive, speechRecognitionSupported, startSession]);

  useEffect(() => {
    if (!activateRequest || activateRequest.id === lastActivateRequestRef.current) return;
    pendingActivationRequestRef.current = activateRequest;
    tryPendingActivation();
  }, [activateRequest, tryPendingActivation]);

  // Retries the same current-question request when TTS or the Dashboard's
  // microphone lock releases. A stale request is dropped by the lifecycle guard.
  useEffect(() => {
    tryPendingActivation();
  }, [tryPendingActivation]);

  useEffect(() => {
    if (deactivateRequest === lastDeactivateRequestRef.current) return;
    lastDeactivateRequestRef.current = deactivateRequest;
    pendingActivationRequestRef.current = null;
    stopSession();
  }, [deactivateRequest, stopSession]);

  useEffect(() => {
    // Abort recognition even while the browser is still requesting permission.
    // This prevents the assistant's own playback from being recognized.
    if ((disabled || !listeningAllowed || isXiaozhiSpeechActive()) && recognitionRef.current) stopSession();
  }, [disabled, listeningAllowed, stopSession]);

  useEffect(() => subscribeXiaozhiSpeechActivity((active) => {
    // This subscription fires synchronously when any TTS source starts, so the
    // microphone is released without waiting for Dashboard to re-render.
    setSpeechActive(active);
    if (active && recognitionRef.current) stopSession();
  }), [stopSession]);

  useEffect(() => {
    if (!isActive || stoppedRef.current) return;
    const recognition = recognitionRef.current;
    if (!recognition) return;

    if (assistantSpeaking) stopSession();
  }, [assistantSpeaking, isActive, onStatusChange, stopSession]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      sessionStartingRef.current = false;
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      if (rec) void rec.stop();
    };
  }, []);

  return (
    <div className="relative flex items-center gap-3">
      {/* 实时识别文字气泡 */}
      {recognizedText && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 whitespace-nowrap z-50">
          <div className="px-4 py-2 rounded-xl bg-cyan-950/80 backdrop-blur-md text-cyan text-sm font-medium shadow-[0_0_15px_rgba(34,211,238,0.2)] border border-cyan/30 max-w-[320px] truncate">
            <span className="text-cyan mr-1.5">♪</span>
            {recognizedText}
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-transparent border-t-cyan-950/80" />
        </div>
      )}
      {isActive && !assistantSpeaking && (
        <div className="flex gap-1 h-4 items-center px-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="w-1 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] rounded-full animate-bounce"
              style={{ animationDelay: `${i * 0.1}s`, height: `${40 + Math.random() * 60}%` }}
            />
          ))}
        </div>
      )}
      <button
        onClick={toggleVoice}
        disabled={isConnecting || disabled || !speechRecognitionSupported}
        className={`p-3 rounded-full shadow-[0_0_15px_rgba(34,211,238,0.15)] border transition-all active:scale-95 hover:scale-105 ${
          disabled || !speechRecognitionSupported
            ? 'bg-cyan-950/20 border-cyan/30 text-slate-600 cursor-not-allowed shadow-none'
            : isActive ? 'bg-rose-950/40 border-rose-900/50 text-rose-400 animate-pulse shadow-[0_0_20px_rgba(244,63,94,0.3)]' : 'bg-cyan-950/40 border-cyan/50 text-cyan hover:bg-cyan-900/60 hover:text-cyan shadow-[0_0_15px_rgba(34,211,238,0.3)]'
        }`}
        aria-label={isActive ? '关闭语音识别' : '开启语音识别'}
        title={!speechRecognitionSupported
          ? '当前浏览器不支持语音识别，请使用最新版 Chrome 或 Edge'
          : disabled ? '请先加载模型' : (isActive ? '关闭语音识别' : '开启语音识别')}
      >
        {isConnecting ? <Loader2 className="animate-spin" size={20} /> : isActive ? <Mic size={20} /> : <MicOff size={20} />}
      </button>
    </div>
  );
};

export default VoiceController;
