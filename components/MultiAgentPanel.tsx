import React, { useState } from 'react';
import { Brain, ClipboardCheck, Eye, EyeOff, Loader2, Play, Route, Settings2 } from 'lucide-react';
import { AgentRole, AgentStatus, AgentTimelineItem } from '../types';

interface MultiAgentPanelProps {
  statuses: Record<AgentRole, AgentStatus>;
  timeline: AgentTimelineItem[];
  summary: string;
  thinking: string;
  isRunning: boolean;
  onStart: (request: string) => void;
}

const roleMeta: Record<AgentRole, { title: string; icon: React.ReactNode; color: string }> = {
  planner: { title: '理解规划Agent', icon: <Brain size={14} />, color: 'text-indigo-600 bg-indigo-50 border-indigo-100' },
  executor: { title: '演示执行Agent', icon: <Settings2 size={14} />, color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
  evaluator: { title: '学情评估Agent', icon: <ClipboardCheck size={14} />, color: 'text-amber-600 bg-amber-50 border-amber-100' },
};

const statusText: Record<AgentStatus, string> = {
  idle: '待命',
  thinking: '规划中',
  running: '执行中',
  done: '完成',
  error: '异常',
};

const MultiAgentPanel: React.FC<MultiAgentPanelProps> = ({ statuses, timeline, summary, thinking, isRunning, onStart }) => {
  const [request, setRequest] = useState('讲解地球内部结构，展示地壳、地幔、外核和内核的关系');
  const [isHidden, setIsHidden] = useState(false);

  const handleStart = () => {
    const trimmedRequest = request.trim();

    if (isRunning || !trimmedRequest) {
      return;
    }

    onStart(trimmedRequest);
    setIsHidden(true);
  };

  const handleRequestKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    event.preventDefault();
    handleStart();
  };

  if (isHidden) {
    return (
      <button
        type="button"
        onClick={() => setIsHidden(false)}
        className="absolute top-6 left-6 z-50 flex h-12 items-center gap-2 rounded-2xl border border-white/70 bg-white/90 px-4 text-xs font-black text-gray-700 shadow-2xl backdrop-blur-xl transition hover:bg-white hover:text-gray-900"
        aria-label="显示多智能体协作台"
        title="显示多智能体协作台"
      >
        {isRunning ? <Loader2 size={16} className="animate-spin text-[#86e3ce]" /> : <Route size={16} className="text-[#86e3ce]" />}
        <span>多智能体</span>
        <Eye size={15} className="text-gray-400" />
      </button>
    );
  }

  return (
    <div className={`absolute top-6 left-6 z-50 max-w-[calc(100%-3rem)] rounded-3xl border border-white/70 bg-white/90 shadow-2xl backdrop-blur-xl transition-all ${isRunning || timeline.length > 0 ? 'w-[310px] p-3' : 'w-[360px] p-4'}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-black text-gray-700">
            <Route size={16} className="text-[#86e3ce]" />
            多智能体协作台
          </div>
          <div className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">Plan · Tool Use · Summary</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setIsHidden(true)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 text-gray-400 shadow-sm transition hover:bg-white hover:text-gray-700"
            aria-label="隐藏多智能体协作台"
            title="隐藏多智能体协作台"
          >
            <EyeOff size={17} />
          </button>
          <button
            type="button"
            disabled={isRunning}
            onClick={handleStart}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-900 text-white shadow-lg transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="启动多智能体演示"
            title="启动多智能体演示"
          >
            {isRunning ? <Loader2 size={17} className="animate-spin" /> : <Play size={17} />}
          </button>
        </div>
      </div>

      <textarea
        value={request}
        disabled={isRunning}
        onChange={(event) => setRequest(event.target.value)}
        onKeyDown={handleRequestKeyDown}
        className={`mb-3 w-full resize-none rounded-2xl border border-gray-200/70 bg-white/80 px-3 py-2 text-xs font-medium leading-relaxed text-gray-700 outline-none transition focus:border-[#86e3ce] focus:ring-2 focus:ring-[#86e3ce]/20 disabled:opacity-60 ${isRunning || timeline.length > 0 ? 'h-12' : 'h-20'}`}
        placeholder="输入教学需求，按 Enter 开始，Shift+Enter 换行"
        title="按 Enter 开始，Shift+Enter 换行"
      />

      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(roleMeta) as AgentRole[]).map((role) => (
          <div key={role} className={`rounded-2xl border p-2 ${roleMeta[role].color}`}>
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-black">
              {roleMeta[role].icon}
              <span className="truncate">{roleMeta[role].title.replace('Agent', '')}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[9px] font-bold">
              <span className={`h-1.5 w-1.5 rounded-full ${statuses[role] === 'running' || statuses[role] === 'thinking' ? 'animate-pulse bg-current' : 'bg-current opacity-50'}`} />
              {statusText[statuses[role]]}
            </div>
          </div>
        ))}
      </div>

      {thinking && (
        <div className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50/80 px-3 py-2">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-black text-indigo-600">
            <Brain size={13} />
            Agent 思考
          </div>
          <p className="text-[11px] font-medium leading-relaxed text-gray-600">{thinking}</p>
        </div>
      )}

      <div className={`mt-3 space-y-1.5 overflow-y-auto pr-1 ${isRunning || timeline.length > 0 ? 'max-h-24' : 'max-h-36'}`}>
        {timeline.length === 0 ? (
          <div className="rounded-2xl bg-gray-50 px-3 py-3 text-[11px] font-medium text-gray-400">
            等待输入教学需求，智能体会生成演示步骤并调用3D工具。
          </div>
        ) : (
          timeline.map((item) => (
            <div key={item.id} className="rounded-2xl border border-gray-100 bg-white/70 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black text-gray-600">{item.title}</span>
                <span className="text-[9px] font-black uppercase text-gray-400">{statusText[item.status === 'pending' ? 'idle' : item.status === 'running' ? 'running' : item.status === 'error' ? 'error' : 'done']}</span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-[10px] font-medium leading-relaxed text-gray-500">{item.detail}</p>
            </div>
          ))
        )}
      </div>

      {summary && (
        <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50/70 px-3 py-2">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-black text-amber-600">
            <ClipboardCheck size={13} />
            课堂小结
          </div>
          <p className="text-[11px] font-medium leading-relaxed text-gray-600">{summary}</p>
        </div>
      )}
    </div>
  );
};

export default MultiAgentPanel;
