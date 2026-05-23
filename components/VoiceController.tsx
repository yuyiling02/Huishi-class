import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ControlRefs } from '../types';
import { Mic, MicOff, Loader2 } from 'lucide-react';

// ====== 语音命令模式（扩展版，支持自然语言变体）======
const COMMAND_PATTERNS: [RegExp, string, (ctrl: ControlRefs) => void][] = [
  [/再?放?大一点|大一点|大些|大一些|靠近|拉近|近一点|近一些|放大/, 'zoom_in', (c) => { c.zoomSpeed = 2.0; setTimeout(() => { c.zoomSpeed = 0; }, 1500); }],
  [/再?缩?小一点|小一点|小些|小一些|远离|拉远|远一点|远一些|缩小/, 'zoom_out', (c) => { c.zoomSpeed = -2.0; setTimeout(() => { c.zoomSpeed = 0; }, 1500); }],
  [/旋转|转起来|转动|转一转|转圈|转一下|开始转/, 'rotate', (c) => { c.rotationVelocity = { x: 0, y: 0.02 }; }],
  [/停止|停|暂停|别转|停下|不要转|停下来|结束/, 'stop', (c) => { c.zoomSpeed = 0; c.rotationVelocity = { x: 0, y: 0 }; }],
];

function extractCommands(text: string, controlRef: ControlRefs): string[] {
  const fired: string[] = [];
  for (const [pattern, name, action] of COMMAND_PATTERNS) {
    if (pattern.test(text)) {
      action(controlRef);
      fired.push(name);
    }
  }
  return fired;
}

interface VoiceControllerProps {
  controlRef: React.MutableRefObject<ControlRefs>;
  onStatusChange: (status: string) => void;
  onRecognizedText?: (text: string) => void;
}

const VoiceController: React.FC<VoiceControllerProps> = ({ controlRef, onStatusChange, onRecognizedText }) => {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [recognizedText, setRecognizedText] = useState('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const stoppedRef = useRef(false);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try { rec.abort(); } catch { /* ignore */ }
    }
    setIsActive(false);
    clearDisplayText();
    onStatusChange('语音助手已离线');
  }, [clearDisplayText, onStatusChange]);

  const startSession = useCallback(() => {
    stoppedRef.current = false;
    setIsConnecting(true);
    onStatusChange('正在启动语音识别...');

    // 检查浏览器是否支持 Web Speech API
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      onStatusChange('当前浏览器不支持语音识别，请使用 Chrome 或 Edge。');
      setIsConnecting(false);
      return;
    }

    const recognition = new SpeechRecognitionAPI() as SpeechRecognition;
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = (event: any) => {
      if (stoppedRef.current) return;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript.trim();

        if (text) {
          if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
          setRecognizedText(text);
          onRecognizedText?.(text);

          clearTimerRef.current = setTimeout(() => {
            setRecognizedText('');
            onRecognizedText?.('');
            clearTimerRef.current = null;
          }, 3000);
        }

        if (result.isFinal) {
          const commands = extractCommands(text, controlRef.current);
          if (commands.length > 0) {
            const cmdNames: Record<string, string> = { zoom_in: '放大', zoom_out: '缩小', rotate: '旋转', stop: '停止' };
            onStatusChange(`识别: "${text}" → 执行: ${commands.map((c) => cmdNames[c] || c).join('、')}`);
          } else if (text) {
            onStatusChange(`识别: "${text}"`);
          }
        }
      }
    };

    recognition.onerror = (event: any) => {
      if (stoppedRef.current) return;
      console.error('[Voice] Recognition error:', event.error);
      if (event.error === 'not-allowed') {
        onStatusChange('麦克风访问被拒绝，请允许浏览器使用麦克风。');
        stopSession();
      } else if (event.error === 'no-speech' || event.error === 'aborted') {
        // 静默忽略，onend 会负责重启
        return;
      } else {
        onStatusChange(`语音识别错误: ${event.error}`);
        stopSession();
      }
    };

    recognition.onend = () => {
      if (stoppedRef.current) return;
      // 如果不是手动停止，自动重启识别
      if (recognitionRef.current === recognition) {
        try { recognition.start(); } catch { /* already started */ }
      }
    };

    try {
      recognition.start();
      setIsActive(true);
      setIsConnecting(false);
      onStatusChange('语音识别已就绪（试试说：放大、再大一点、缩小、旋转、停止）');
    } catch (err) {
      console.error('[Voice] Start error:', err);
      setIsConnecting(false);
      onStatusChange('语音识别启动失败，请重试。');
    }
  }, [controlRef, onStatusChange, onRecognizedText, stopSession]);

  const toggleVoice = useCallback(() => {
    if (isActive) {
      stopSession();
    } else {
      startSession();
    }
  }, [isActive, stopSession, startSession]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      if (rec) {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        try { rec.abort(); } catch { /* ignore */ }
      }
    };
  }, []);

  return (
    <div className="relative flex items-center gap-3">
      {/* 实时识别文字气泡 */}
      {recognizedText && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 whitespace-nowrap z-50">
          <div className="px-4 py-2 rounded-xl bg-gray-900/90 backdrop-blur-md text-white text-sm font-medium shadow-lg border border-white/10 max-w-[320px] truncate">
            <span className="text-[#86e3ce] mr-1.5">♪</span>
            {recognizedText}
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-transparent border-t-gray-900/90" />
        </div>
      )}
      {isActive && (
        <div className="flex gap-1 h-4 items-center px-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="w-1 bg-[#86e3ce] rounded-full animate-bounce"
              style={{ animationDelay: `${i * 0.1}s`, height: `${40 + Math.random() * 60}%` }}
            />
          ))}
        </div>
      )}
      <button
        onClick={toggleVoice}
        disabled={isConnecting}
        className={`p-3 rounded-full shadow-lg transition-all active:scale-90 ${
          isActive ? 'bg-pink-400 text-white animate-pulse' : 'bg-white text-gray-400 hover:text-[#86e3ce]'
        }`}
        aria-label={isActive ? '关闭语音识别' : '开启语音识别'}
        title={isActive ? '关闭语音识别' : '开启语音识别'}
      >
        {isConnecting ? <Loader2 className="animate-spin" size={20} /> : isActive ? <Mic size={20} /> : <MicOff size={20} />}
      </button>
    </div>
  );
};

export default VoiceController;
