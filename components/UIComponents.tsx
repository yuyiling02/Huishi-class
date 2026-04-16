
import React from 'react';
import { Loader2, Sparkles, CheckCircle2, Circle } from 'lucide-react';

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className, children, ...props }) => (
  <button
    className={`px-6 py-2 rounded-full font-bold transition-all duration-300 active:scale-95 disabled:opacity-50 disabled:active:scale-100 ${className}`}
    {...props}
  >
    {children}
  </button>
);

export const Badge: React.FC<{ active: boolean; label: string; color?: string }> = ({ active, label, color = 'emerald' }) => {
  const colorMap: Record<string, string> = {
    emerald: active ? 'bg-emerald-100 text-emerald-600 border-emerald-200' : 'bg-white/40 text-gray-300 border-transparent',
    blue: active ? 'bg-blue-100 text-blue-600 border-blue-200' : 'bg-white/40 text-gray-300 border-transparent',
    orange: active ? 'bg-orange-100 text-orange-600 border-orange-200' : 'bg-white/40 text-gray-300 border-transparent',
    purple: active ? 'bg-purple-100 text-purple-600 border-purple-200' : 'bg-white/40 text-gray-300 border-transparent',
  };
  
  return (
    <span className={`px-4 py-1 rounded-full text-[10px] font-black tracking-wider uppercase transition-all duration-500 border ${colorMap[color]}`}>
      {label}
    </span>
  );
};

export const ProcessingOverlay: React.FC<{ steps: string[], currentStep: number, aiAnalysis?: string }> = ({ steps, currentStep, aiAnalysis }) => (
  <div className="absolute inset-0 z-[100] bg-white/40 backdrop-blur-2xl flex flex-col items-center justify-center animate-in fade-in duration-500">
    <div className="relative mb-12">
      <div className="absolute inset-0 bg-[#86e3ce]/20 blur-[100px] rounded-full animate-pulse"></div>
      <div className="relative bg-white p-10 rounded-full shadow-2xl border border-white">
        <Loader2 className="w-16 h-16 text-[#86e3ce] animate-spin" strokeWidth={1.5} />
      </div>
    </div>
    
    <div className="max-w-md w-full px-8">
      <div className="text-center mb-10">
        <h2 className="text-2xl font-black text-gray-700 mb-2 tracking-tight flex items-center justify-center gap-2">
          <Sparkles className="text-amber-400 w-6 h-6 animate-bounce" />
          AI 教具工坊
        </h2>
        <p className="text-gray-400 font-bold text-sm">正在将图片解析为可互动的空间模型</p>
      </div>

      <div className="space-y-4">
        {steps.map((step, idx) => (
          <div key={idx} className={`flex items-center gap-4 transition-all duration-500 ${idx === currentStep ? 'opacity-100 translate-x-2' : idx < currentStep ? 'opacity-40' : 'opacity-20'}`}>
            {idx < currentStep ? (
              <CheckCircle2 className="w-5 h-5 text-[#86e3ce]" />
            ) : idx === currentStep ? (
              <div className="w-5 h-5 rounded-full border-2 border-pink-400 border-t-transparent animate-spin"></div>
            ) : (
              <Circle className="w-5 h-5 text-gray-300" />
            )}
            <span className={`text-sm font-black ${idx === currentStep ? 'text-gray-700' : 'text-gray-400'}`}>
              {step}
            </span>
          </div>
        ))}
      </div>

      {aiAnalysis && (
        <div className="mt-10 p-5 bg-white/60 rounded-3xl border border-white shadow-sm animate-in slide-in-from-bottom-4">
          <p className="text-[11px] font-bold text-gray-500 leading-relaxed italic">
            <span className="text-[#86e3ce] mr-1">● AI LOG:</span>
            {aiAnalysis}
          </p>
        </div>
      )}
    </div>
  </div>
);
