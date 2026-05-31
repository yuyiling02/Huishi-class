import React, { useState, useEffect } from 'react';
import { Box, Fingerprint } from 'lucide-react';

interface LoginProps {
  onStart: () => void;
}

const Login: React.FC<LoginProps> = ({ onStart }) => {
  const [mounted, setMounted] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleStart = () => {
    setIsStarting(true);
    setTimeout(() => {
      onStart();
    }, 800);
  };

  return (
    <div className="relative min-h-screen w-full bg-[#050914] flex flex-col items-center justify-center overflow-hidden font-sans select-none">
      
      {/* ================= 优雅渐变背景区 ================= */}
      <div className={`absolute inset-0 w-full h-full transition-opacity duration-1000 ${isStarting ? 'opacity-0' : 'opacity-100'}`}>
        
        {/* 左侧深紫晕染光效 */}
        <div className="absolute top-[20%] left-[-10%] w-[60rem] h-[60rem] bg-purple-900/40 rounded-full blur-[150px] pointer-events-none mix-blend-screen"></div>

        {/* 右侧青色晕染光效 */}
        <div className="absolute bottom-[10%] right-[-10%] w-[50rem] h-[50rem] bg-cyan-900/30 rounded-full blur-[150px] pointer-events-none mix-blend-screen"></div>
        
      </div>

      {/* 科技感点缀元素 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* 左上角十字准星 */}
        <div className="absolute top-[15%] left-[10%] w-8 h-8 opacity-30">
          <div className="absolute top-1/2 left-0 w-full h-[1px] bg-cyan-500/50"></div>
          <div className="absolute top-0 left-1/2 w-[1px] h-full bg-cyan-500/50"></div>
        </div>
        {/* 右下角准星与刻度 */}
        <div className="absolute bottom-[20%] right-[10%] opacity-20">
          <div className="w-12 h-12 border-r border-b border-purple-500/50"></div>
          <div className="text-purple-500/50 font-mono text-[10px] mt-2 tracking-widest">SYS.RDY // 90.2%</div>
        </div>
        {/* 散落的数据点 */}
        <div className="absolute top-[30%] right-[25%] w-1 h-1 bg-cyan-400 rounded-full opacity-40 shadow-[0_0_8px_#00f0ff]"></div>
        <div className="absolute bottom-[40%] left-[20%] w-1 h-1 bg-purple-400 rounded-full opacity-40 shadow-[0_0_8px_#a855f7]"></div>
        <div className="absolute top-[60%] left-[8%] w-1.5 h-1.5 bg-white/40 rounded-full opacity-20"></div>
        
        {/* 顶部数据流条纹 */}
        <div className="absolute top-[5%] left-1/2 -translate-x-1/2 flex gap-2 opacity-10">
          <div className="w-8 h-1 bg-white"></div>
          <div className="w-2 h-1 bg-white"></div>
          <div className="w-1 h-1 bg-white"></div>
          <div className="w-4 h-1 bg-white"></div>
        </div>
      </div>

      {/* ================= 两侧全息结构投影区 (Holograms) ================= */}
      <div className={`absolute inset-0 w-full h-full pointer-events-none transition-all duration-1000 ${mounted && !isStarting ? 'opacity-100' : 'opacity-0'}`}>
        
        {/* 左侧：金刚石结构与心脏结构 */}
        <div className="absolute left-[3%] top-[8%] w-[280px] opacity-[0.05] mix-blend-screen animate-[float_15s_ease-in-out_infinite] blur-[1px]">
          <img src="/images/diamond-structure.png" alt="Diamond Hologram" className="w-full h-auto drop-shadow-[0_0_15px_#00f0ff]" style={{ filter: 'hue-rotate(90deg) brightness(1.5)' }} />
          <div className="mt-4 text-[#00f0ff] font-mono text-xs tracking-widest text-center border-t border-[#00f0ff]/30 pt-2">C-STRUCTURE // CARBON</div>
        </div>
        
        <div className="absolute left-[6%] bottom-[8%] w-[250px] opacity-[0.05] mix-blend-screen animate-[float-delayed_12s_ease-in-out_infinite] blur-[1px]">
          <img src="/images/heart-structure.png" alt="Heart Hologram" className="w-full h-auto drop-shadow-[0_0_15px_#ff0055]" style={{ filter: 'hue-rotate(180deg) brightness(1.2) sepia(0.5)' }} />
          <div className="mt-4 text-[#00f0ff] font-mono text-xs tracking-widest text-center border-t border-[#00f0ff]/30 pt-2">BIO-M // HUMAN HEART</div>
        </div>

        {/* 右侧：地球结构与细胞(HIV)结构 */}
        <div className="absolute right-[3%] top-[6%] w-[300px] opacity-[0.05] mix-blend-screen animate-[float-delayed_18s_ease-in-out_infinite] blur-[1px]">
          <img src="/images/earth-layers-diagram.png" alt="Earth Hologram" className="w-full h-auto drop-shadow-[0_0_15px_#00f0ff]" style={{ filter: 'grayscale(0.8) sepia(1) hue-rotate(150deg) brightness(1.5)' }} />
          <div className="mt-4 text-[#00f0ff] font-mono text-xs tracking-widest text-center border-t border-[#00f0ff]/30 pt-2">GEO-L // EARTH LAYERS</div>
        </div>

        <div className="absolute right-[6%] bottom-[10%] w-[260px] opacity-[0.05] mix-blend-screen animate-[float_14s_ease-in-out_infinite] blur-[1px]">
          <img src="/images/hiv-structure.png" alt="Cell Hologram" className="w-full h-auto drop-shadow-[0_0_15px_#00f0ff]" style={{ filter: 'hue-rotate(200deg) brightness(1.3)' }} />
          <div className="mt-4 text-[#00f0ff] font-mono text-xs tracking-widest text-center border-t border-[#00f0ff]/30 pt-2">MICRO // CELLULAR</div>
        </div>
      </div>

      {/* ================= 中心主体内容 ================= */}
      <div className={`relative z-10 flex flex-col items-center max-w-4xl w-full px-8 transition-all duration-1000 transform ${mounted && !isStarting ? 'translate-y-0 opacity-100 scale-100' : isStarting ? 'translate-y-[-2rem] opacity-0 scale-110' : 'translate-y-12 opacity-0 scale-95'}`}>
        
        {/* 01 标签 */}
        <div className="flex items-center gap-4 mb-4 opacity-70">
          <span className="text-cyan-500 text-sm font-mono tracking-widest">01</span>
          <div className="h-[1px] w-16 bg-gradient-to-r from-cyan-500 to-transparent"></div>
        </div>

        {/* 引言 (单行) */}
        <h2 className="text-lg md:text-xl font-serif text-white/30 tracking-widest leading-tight mb-12">
          “真正的壁垒不再是冰冷的语法，而是打破常规的 <span className="font-sans italic font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400/50 to-purple-500/50 drop-shadow-[0_0_10px_rgba(0,240,255,0.2)]">Idea</span>”
        </h2>

        {/* 核心思路板块 */}
        <div className="flex flex-col items-center text-center">

          <h1 className="text-7xl md:text-8xl font-black tracking-[0.3em] mb-12 flex cursor-pointer" title="Hui Shi System">
          {"慧视课堂".split('').map((char, index) => (
            <span 
              key={index} 
              className="inline-block text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-gray-400 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)] transition-all duration-300 hover:text-white hover:drop-shadow-[0_0_30px_rgba(255,255,255,0.8)] relative"
            >
              {char}
            </span>
          ))}
        </h1>

          <div className="mt-4 text-white/90 text-lg md:text-2xl tracking-widest font-light leading-relaxed max-w-4xl">
            <p>
              致力于将灵感转化为现实。知识的广度与创新的深度，<br className="hidden md:block"/>远比单纯的技术堆砌更具力量。
            </p>
          </div>
        </div>
        
        {/* 极简优雅风格“进入”按钮 */}
        <button
          onClick={handleStart}
          className="group relative mt-20 px-12 py-4 rounded-full border border-gray-600 bg-white/5 text-gray-300 font-medium text-sm tracking-[0.3em] uppercase hover:bg-white/10 hover:text-white hover:border-cyan-500/50 hover:shadow-[0_0_30px_rgba(0,240,255,0.2)] transition-all duration-500 focus:outline-none overflow-hidden flex items-center justify-center gap-3"
        >
          <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent group-hover:translate-x-full transition-transform duration-1000 ease-in-out"></div>
          <Fingerprint size={18} className="relative z-10 group-hover:text-cyan-400 transition-colors duration-300" />
          <span className="relative z-10">探索数字世界</span>
        </button>
      </div>
      
    </div>
  );
};

export default Login;


