import React from 'react';
import { Mic, MicOff } from 'lucide-react';
import XiaozhiMascot, { XIAOZHI_STATE_META, type XiaozhiVisualState } from './XiaozhiMascot';

export type { XiaozhiVisualState } from './XiaozhiMascot';

interface XiaozhiAssistantProps {
  state: XiaozhiVisualState;
  message: string;
  voiceActive: boolean;
  assistantSpeaking: boolean;
  voiceInputDisabled?: boolean;
  onVoiceToggle: () => void;
}

const XiaozhiAssistant: React.FC<XiaozhiAssistantProps> = ({
  state,
  message,
  voiceActive,
  assistantSpeaking,
  voiceInputDisabled = false,
  onVoiceToggle,
}) => {
  const meta = XIAOZHI_STATE_META[state];

  return (
    <div className="w-full rounded-2xl border border-cyan/20 bg-cyan-50/82 p-3 text-ink shadow-2xl shadow-cyan-950/40 backdrop-blur-xl">
      <div className="flex gap-3">
        <div className="relative flex h-[112px] w-[96px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-cyan/18 bg-[radial-gradient(circle_at_50%_40%,rgba(47,177,255,0.12),rgba(2,8,18,0.78)_72%)]">
          <div className="absolute inset-x-5 bottom-3 h-5 rounded-full bg-cyan-300/8 blur-xl" />
          <XiaozhiMascot
            state={state}
            size={92}
            motion="stateful"
            speaking={assistantSpeaking}
            ariaLabel={`小智，${meta.label}`}
            className="relative z-10"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <XiaozhiMascot state={state} size={15} motion="static" />
            <span className="text-sm font-black text-cyan">小智</span>
            <span className="ml-auto h-2 w-2 rounded-full" style={{ backgroundColor: meta.accent }} />
          </div>
          <div className="mt-1 text-[10px] font-bold text-cyan/70">
            {voiceActive ? '语音在线 · ' : ''}{meta.label}
          </div>
          <p className="mt-2 line-clamp-4 min-h-[48px] text-[11px] font-medium leading-relaxed text-ink-soft">
            {message || '你好呀！我是小智，你的数智课堂AI老师。有什么想学的3D模型或知识吗？'}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onVoiceToggle}
        disabled={voiceInputDisabled}
        className={`mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border text-xs font-bold transition active:scale-[0.98] ${voiceInputDisabled
          ? 'cursor-not-allowed border-slate-600/30 bg-slate-700/15 text-slate-500'
          : voiceActive
          ? 'border-rose-400/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25'
          : 'border-cyan/25 bg-cyan-400/12 text-cyan hover:border-cyan/45 hover:bg-cyan-400/20'
        }`}
        aria-label={voiceActive ? '关闭语音输入' : '开启语音输入'}
        title={voiceInputDisabled ? 'Agent 工作期间语音输入已关闭' : (voiceActive ? '点击关闭语音输入' : '点击开始语音输入')}
      >
        {voiceActive && !assistantSpeaking ? <Mic className="h-4 w-4 animate-pulse" /> : <MicOff className="h-4 w-4" />}
        {voiceInputDisabled
          ? 'Agent 工作中，语音输入已关闭'
          : voiceActive ? '正在聆听，再次点击关闭' : '点击开始语音输入'}
      </button>
    </div>
  );
};

export default XiaozhiAssistant;
