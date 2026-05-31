import React, { useRef, useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars, Float, Sphere, MeshDistortMaterial, OrbitControls } from '@react-three/drei';
import { 
  Search, ChevronRight, Sparkles, Folder, BarChart2, 
  Hand, Mic, Maximize2, FileText, Minus, X, Square,
  Menu, Cpu, Activity, Glasses, Box, Share2
} from 'lucide-react';

// === 3D Background Component ===
function BackgroundScene() {
  const sphereRef = useRef<any>(null);
  
  useFrame(({ clock }) => {
    if (sphereRef.current) {
      sphereRef.current.rotation.x = clock.getElapsedTime() * 0.1;
      sphereRef.current.rotation.y = clock.getElapsedTime() * 0.15;
    }
  });

  return (
    <>
      <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={1} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 10]} intensity={1} color="#00d2ff" />
      <directionalLight position={[-10, -10, -10]} intensity={0.5} color="#3D81E3" />
      
      <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
        <group ref={sphereRef} position={[5, 2, -10]}>
          <Sphere args={[3, 64, 64]}>
            <MeshDistortMaterial 
              color="#001a33" 
              attach="material" 
              distort={0.4} 
              speed={1.5} 
              roughness={0.2}
              metalness={0.8}
              wireframe={true}
              transparent
              opacity={0.3}
            />
          </Sphere>
        </group>
      </Float>
    </>
  );
}

// === 3D Heart Mockup Component ===
function HeartMockup() {
  const meshRef = useRef<any>(null);
  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = clock.getElapsedTime() * 0.5;
      meshRef.current.scale.setScalar(1 + Math.sin(clock.getElapsedTime() * 3) * 0.05);
    }
  });

  return (
    <group position={[0, 0, 0]}>
      <ambientLight intensity={0.8} />
      <pointLight position={[10, 10, 10]} color="#ff4081" intensity={2} />
      <pointLight position={[-10, -10, -10]} color="#00d2ff" intensity={1} />
      <Float speed={4} rotationIntensity={0.5} floatIntensity={0.5}>
        <mesh ref={meshRef}>
          <sphereGeometry args={[1.5, 32, 32]} />
          <meshStandardMaterial color="#e91e63" roughness={0.3} metalness={0.1} wireframe />
        </mesh>
      </Float>
    </group>
  );
}

// === Primitive UI Components ===
const LogoMark = () => (
  <svg viewBox="0 0 256 256" fill="white" className="w-8 h-8">
    <path d="M 0 128 C 70.692 128 128 185.308 128 256 L 64 256 C 64 220.654 35.346 192 0 192 Z M 256 192 C 220.654 192 192 220.654 192 256 L 128 256 C 128 185.308 185.308 128 256 128 Z M 128 0 C 128 70.692 70.692 128 0 128 L 0 64 C 35.346 64 64 35.346 64 0 Z M 192 0 C 192 35.346 220.654 64 256 64 L 256 128 C 185.308 128 128 70.692 128 0 Z" />
  </svg>
);

const AppleLogo = ({ className = "w-3.5 h-3.5" }) => (
  <svg viewBox="0 0 384 512" fill="currentColor" className={className}>
    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
  </svg>
);

const SectionEyebrow = ({ label }: { label: string }) => (
  <div className="flex items-center gap-3">
    <div className="flex items-center gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
      <span className="text-sm font-medium text-white tracking-wide">{label}</span>
    </div>
  </div>
);

const HoverText = ({ text, className, style, charClassName, charStyle, gradientSpan }: { text: string, className?: string, style?: React.CSSProperties, charClassName?: string, charStyle?: React.CSSProperties, gradientSpan?: boolean }) => {
  return (
    <span className={className} style={style}>
      {text.split('').map((char, index) => {
        const computedStyle = { ...charStyle };
        if (gradientSpan) {
          computedStyle.backgroundSize = `${text.length * 100}% auto`;
          (computedStyle as any)['--bg-x'] = `${(index / Math.max(1, text.length - 1)) * 100}%`;
        }
        return (
          <motion.span
            key={index}
            className={`inline-block cursor-default ${charClassName || ''}`}
            style={computedStyle}
            whileHover={{ scale: 1.15, y: -8 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
          >
            {char === ' ' ? '\u00A0' : char}
          </motion.span>
        );
      })}
    </span>
  );
};

// === Main Page Component ===
export default function LandingPage({ onEnter }: { onEnter: () => void }) {
  const [time, setTime] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
      setTime(now.toLocaleDateString('zh-CN', options).replace(/,/g, ' '));
    };
    updateTime();
    const timer = setInterval(updateTime, 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#0c0c0c] text-white selection:bg-[#3D81E3]/30">
      
      {/* 1. 全局背景 (3D + 纵向排版线) */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <Canvas camera={{ position: [0, 0, 5], fov: 60 }}>
          <BackgroundScene />
        </Canvas>
      </div>
      <div className="fixed inset-0 z-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#00d2ff]/10 via-[#0c0c0c]/80 to-[#0c0c0c]" />
      
      <div className="hidden lg:block pointer-events-none fixed inset-y-0 left-1/2 -translate-x-[calc(50%+38rem)] w-px bg-white/[0.05] z-0" />
      <div className="hidden lg:block pointer-events-none fixed inset-y-0 left-1/2 translate-x-[calc(-50%+38rem)] w-px bg-white/[0.05] z-0" />

      {/* SVG Noise Filter */}
      <svg className="w-0 h-0 absolute pointer-events-none">
        <filter id="noise-filter">
          <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.25 0" />
          <feComposite in2="SourceGraphic" operator="in" result="noise" />
          <feBlend in="SourceGraphic" in2="noise" mode="screen" />
        </filter>
      </svg>

      <div className="relative z-10">
        
        {/* 2. Navbar */}
        <motion.nav 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-[76rem] mx-auto px-6 h-20 flex items-center relative sticky top-0 backdrop-blur-xl border-b border-white/[0.05] z-50 bg-[#0c0c0c]/50"
        >
          <div className="flex items-center gap-2 cursor-pointer absolute left-6">
            <LogoMark />
          </div>
          <div className="hidden md:flex items-center justify-center gap-8 w-full">
            {['教学方案', '案例', '价格', '文档', '加入我们'].map((item, i) => (
              <motion.a 
                key={item} href="#"
                initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                className="text-white/70 text-sm font-medium hover:text-white transition-colors"
              >
                {item}
              </motion.a>
            ))}
          </div>
          <button className="md:hidden w-10 h-10 flex items-center justify-center rounded-full bg-white/5 border border-white/10">
            <Menu className="w-5 h-5" />
          </button>
        </motion.nav>

        {/* 3. Hero 首屏 */}
        <section className="pt-24 md:pt-36 pb-24 text-center px-4 flex flex-col items-center">
          <motion.h1 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className="text-5xl md:text-[5.5rem] font-bold tracking-tight leading-[1.1] flex flex-col items-center"
          >
            <HoverText 
              text="你的专属 3D 互动教具库。" 
              className="text-white drop-shadow-lg flex" 
            />
            <HoverText 
              text="慧视课堂" 
              className="mt-2 pb-2 flex" 
              charClassName="animate-shiny"
              gradientSpan={true}
              charStyle={{
                backgroundImage: 'linear-gradient(to right, #001a33 0%, #3D81E3 25%, #A4F4FD 50%, #00d2ff 75%, #001a33 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
                WebkitTextFillColor: 'transparent',
                filter: 'url(#noise-filter)'
              }} 
            />
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 1 }}
            className="mt-8 text-white/60 max-w-2xl text-lg md:text-xl leading-relaxed"
          >
            结合强大的 AI 引擎与空间手势计算，重新定义智慧课堂。组织、展示、互动，一切都无比清晰。
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1, duration: 0.8 }}
            className="mt-12 flex flex-col items-center gap-4"
          >
            <button 
              onClick={onEnter}
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-white text-black font-bold text-base px-8 py-3.5 transition-all hover:bg-white/90 hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.4)] mt-2"
            >
              立即体验
              <ChevronRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </button>
            <span className="text-sm font-medium tracking-widest uppercase text-white/30 mt-4">
              AI 教具管理 · 手势互动 · 智慧课堂
            </span>
          </motion.div>
        </section>

        {/* 4. macOS 风格系统条 */}
        <motion.div 
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}
          className="w-full h-8 bg-black/60 backdrop-blur-md border-t border-b border-white/10"
        >
          <div className="max-w-[76rem] mx-auto px-4 h-full flex items-center justify-between text-[13px] font-medium tracking-wide">
            <div className="flex items-center gap-4">
              <AppleLogo className="w-3.5 h-3.5" />
              <span className="font-bold text-white pr-2">慧视课堂</span>
              <div className="hidden sm:flex items-center gap-4 text-white/80">
                {['文件', '编辑', '视图', '工具', '窗口', '帮助'].map(item => (
                  <span key={item} className="hover:text-white hover:bg-white/10 px-2 py-0.5 rounded cursor-default transition-colors">
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4 text-white/80">
              <Search className="w-4 h-4 hover:text-white cursor-pointer" />
              <span className="hidden sm:inline">{time || "正在获取时间..."}</span>
            </div>
          </div>
        </motion.div>

        {/* 5. 核心产品展示区 (3D 控制台 Mockup) */}
        <section className="max-w-[76rem] mx-auto px-6 py-20 relative z-20">
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.98 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className="relative rounded-2xl overflow-hidden border border-white/15 bg-[#0a0a0a]/80 backdrop-blur-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] ring-1 ring-white/5"
          >
            {/* 窗口头部 */}
            <div className="h-12 border-b border-white/10 bg-white/[0.02] flex items-center px-4 relative">
              <div className="flex gap-2 absolute left-4">
                <button className="w-3.5 h-3.5 rounded-full bg-[#ff5f57] flex items-center justify-center group hover:bg-[#ff5f57]/80"><X className="w-2.5 h-2.5 text-black/50 opacity-0 group-hover:opacity-100" /></button>
                <button className="w-3.5 h-3.5 rounded-full bg-[#febc2e] flex items-center justify-center group hover:bg-[#febc2e]/80"><Minus className="w-2.5 h-2.5 text-black/50 opacity-0 group-hover:opacity-100" /></button>
                <button className="w-3.5 h-3.5 rounded-full bg-[#28c840] flex items-center justify-center group hover:bg-[#28c840]/80"><Maximize2 className="w-2.5 h-2.5 text-black/50 opacity-0 group-hover:opacity-100 p-0.5" /></button>
              </div>
              <div className="w-full text-center text-xs font-semibold text-white/50 tracking-wider">
                慧视课堂 — 教具库
              </div>
            </div>

            {/* 界面主体三栏 */}
            <div className="grid grid-cols-1 md:grid-cols-12 h-[600px]">
              
              {/* 左侧 Sidebar */}
              <div className="hidden md:flex flex-col col-span-2 border-r border-white/10 bg-black/40 p-3">
                <button className="w-full flex items-center justify-center gap-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/5 text-white text-xs font-semibold px-3 py-2.5 mb-6 transition-all">
                  <Sparkles className="w-3.5 h-3.5 text-[#00d2ff]" />
                  AI 生成教具
                </button>
                
                <div className="space-y-0.5 mb-8">
                  {[
                    { icon: Folder, label: '我的教具库', active: true },
                    { icon: Activity, label: '课堂互动' },
                    { icon: Box, label: '3D 模型' },
                    { icon: Cpu, label: 'AI 助教' },
                    { icon: BarChart2, label: '数据分析' },
                  ].map((item, i) => (
                    <div key={i} className={`flex items-center gap-3 text-xs px-3 py-2 rounded-md cursor-pointer transition-colors ${item.active ? 'bg-white/10 text-white font-medium' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}>
                      <item.icon className="w-4 h-4 opacity-80" />
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>

                <div className="text-[10px] uppercase tracking-widest text-white/40 font-semibold mb-3 px-3">知识图谱标签</div>
                <div className="space-y-1">
                  {[
                    { label: '地理', color: '#3b82f6' },
                    { label: '生物', color: '#10b981' },
                    { label: '化学', color: '#f59e0b' },
                    { label: '物理', color: '#8b5cf6' },
                    { label: '历史', color: '#ec4899' },
                  ].map(tag => (
                    <div key={tag.label} className="flex items-center gap-2 text-xs px-3 py-1.5 text-white/60 hover:bg-white/5 cursor-pointer rounded-md">
                      <div className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: tag.color, color: tag.color }} />
                      {tag.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* 中间主视觉 (3D Canvas) */}
              <div className="col-span-1 md:col-span-7 border-r border-white/10 relative bg-black/20 flex flex-col">
                <div className="h-10 border-b border-white/10 px-4 flex items-center justify-between bg-black/40 backdrop-blur-sm z-10">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-2 py-1 bg-white/10 rounded text-white border border-white/5">心脏结构三维互动模型</span>
                    <span className="text-[10px] text-white/40 border border-white/10 px-1.5 rounded">生物 / 高中</span>
                  </div>
                  <div className="flex gap-2">
                    <button className="text-xs text-white/60 hover:text-white px-2 py-1 rounded hover:bg-white/10 flex items-center gap-1">
                      <Glasses className="w-3.5 h-3.5" /> AR 预览
                    </button>
                    <button className="text-xs text-white/60 hover:text-white px-2 py-1 rounded hover:bg-white/10 flex items-center gap-1">
                      <Share2 className="w-3.5 h-3.5" /> 投屏
                    </button>
                  </div>
                </div>

                <div className="flex-1 relative overflow-hidden">
                  {/* 3D 渲染区域 */}
                  <div className="absolute inset-0 cursor-move">
                    <Canvas camera={{ position: [0, 0, 4] }}>
                      <OrbitControls enableZoom={false} autoRotate autoRotateSpeed={0.5} />
                      <HeartMockup />
                    </Canvas>
                  </div>

                  {/* UI 叠加层：手势识别状态 */}
                  <div className="absolute bottom-6 inset-x-0 flex justify-center pointer-events-none">
                    <div className="bg-black/60 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full flex items-center gap-3">
                      <div className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00d2ff] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-[#00d2ff]"></span>
                      </div>
                      <span className="text-xs text-white/80 font-medium">MediaPipe 手势追踪已开启 · 尝试“捏合”缩放</span>
                      <Hand className="w-4 h-4 text-white/50 ml-2" />
                    </div>
                  </div>
                </div>
              </div>

              {/* 右侧详情面板 */}
              <div className="hidden md:flex flex-col col-span-3 bg-black/40 p-5 overflow-y-auto">
                <h3 className="text-sm font-bold text-white mb-4">AI 备课助手</h3>
                
                <div className="rounded-xl border border-[#00d2ff]/30 bg-[#00d2ff]/5 p-4 mb-6 shadow-inner relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-[#00d2ff] to-transparent" />
                  <div className="flex items-center gap-2 text-[#00d2ff] text-xs font-bold mb-3">
                    <Sparkles className="w-4 h-4" />
                    自动生成讲解词
                  </div>
                  <p className="text-xs text-white/80 leading-relaxed font-medium">
                    “同学们请看，这是人体心脏的 3D 模型。心脏有四个腔室，分为左心房、左心室、右心房和右心室。当我们将手掌张开时，模型将展示内部的瓣膜结构...”
                  </p>
                </div>

                <div className="space-y-5">
                  <div>
                    <div className="text-[10px] text-white/40 uppercase tracking-wider mb-2">互动提问生成</div>
                    <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-xs text-white/70">
                      1. 血液是如何通过二尖瓣流动的？<br/>
                      2. 右心室负责将血液泵向哪里？
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-[10px] text-white/40 uppercase tracking-wider mb-2">交互说明</div>
                    <div className="flex flex-wrap gap-2">
                      <span className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[10px] text-white/80 flex items-center gap-1"><Hand className="w-3 h-3"/> 挥手旋转模型</span>
                      <span className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[10px] text-white/80 flex items-center gap-1"><Mic className="w-3 h-3"/> 语音切换高亮</span>
                    </div>
                  </div>
                </div>

                <div className="mt-auto pt-6">
                  <button className="w-full bg-white text-black text-xs font-bold py-3 rounded-lg hover:bg-white/90 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                    开始课堂演示
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* 6. 功能区：AI 教具管理 */}
        <section className="max-w-[76rem] mx-auto px-6 py-24 border-t border-white/5">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div 
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
            >
              <SectionEyebrow label="多模态智能" />
              <h2 className="mt-6 text-4xl md:text-5xl font-bold tracking-tight leading-[1.1]">
                打破屏幕边界的<br/>
                <span className="text-[#00d2ff]">沉浸教学体验。</span>
              </h2>
              <p className="mt-6 text-white/60 text-lg leading-relaxed max-w-lg">
                慧视课堂不仅是一个教具云盘，更是一个懂你的教学引擎。通过空间计算和 AI 大模型，让每个教具都“活”起来。
              </p>
              
              <div className="mt-10 grid grid-cols-2 gap-4">
                {[
                  { icon: Hand, title: "空间手势互动", desc: "无需鼠标，挥手即可拆解模型" },
                  { icon: Mic, title: "语音智能助教", desc: "上课时随时呼叫 AI 回答问题" },
                  { icon: Folder, title: "自动教具分类", desc: "千万级资源，秒级图谱归档" },
                  { icon: BarChart2, title: "课堂行为分析", desc: "实时追踪学生的互动专注度" },
                ].map((feature, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                      <feature.icon className="w-5 h-5 text-[#00d2ff]" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">{feature.title}</div>
                      <div className="text-xs text-white/50 mt-1">{feature.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="space-y-4"
            >
              {/* Liquid glass feature cards */}
              <div className="liquid-glass rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-2 h-2 rounded-full bg-[#28c840] shadow-[0_0_10px_#28c840]" />
                  <span className="text-sm font-bold text-white">今日教具资源库动态</span>
                </div>
                <div className="space-y-3">
                  {[
                    { title: "已自动打标签 42 个新模型", color: "#00d2ff", progress: "100%" },
                    { title: "为 18 个物理实验生成了讲解词", color: "#A4F4FD", progress: "85%" },
                    { title: "3 个生物 3D 模型需要手动确认", color: "#febc2e", progress: "30%" },
                  ].map((item, i) => (
                    <div key={i} className="bg-black/30 border border-white/5 rounded-lg p-3">
                      <div className="text-xs text-white/80 font-medium mb-2">{item.title}</div>
                      <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: item.progress, backgroundColor: item.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="liquid-glass rounded-2xl p-6 flex flex-col items-center text-center justify-center h-40">
                  <Hand className="w-8 h-8 text-[#00d2ff] mb-3" />
                  <div className="text-sm font-bold">MediaPipe 引擎</div>
                  <div className="text-xs text-white/50 mt-1">毫秒级手势追踪就绪</div>
                </div>
                <div className="liquid-glass rounded-2xl p-6 flex flex-col items-center text-center justify-center h-40">
                  <Cpu className="w-8 h-8 text-[#00d2ff] mb-3" />
                  <div className="text-sm font-bold">Gemini AI 集成</div>
                  <div className="text-xs text-white/50 mt-1">多模态教学认知赋能</div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* 7. Logo Cloud */}
        <section className="max-w-[76rem] mx-auto px-6 py-20 border-t border-white/5">
          <div className="text-center text-[10px] md:text-xs uppercase tracking-[0.2em] text-white/40 font-semibold mb-12">
            适用于未来智慧课堂的各种教学场景
          </div>
          <div className="flex flex-wrap justify-center gap-x-12 gap-y-8">
            {['地理环境模拟', '生物微观实验', '化学分子解析', '力学物理模型', '古建历史重构', 'AI数字人助教', '空间手势黑板', '课堂多维数据'].map((name, i) => (
              <motion.div
                key={name}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="text-sm md:text-base font-bold text-white/50 hover:text-white transition-colors cursor-default"
              >
                {name}
              </motion.div>
            ))}
          </div>
        </section>

        {/* 8. Testimonials */}
        <section className="max-w-[76rem] mx-auto px-6 py-24 border-t border-white/5">
          <SectionEyebrow label="教育者的声音" />
          <h2 className="mt-4 text-3xl font-bold mb-12">一线名师的真实反馈。</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                quote: "慧视课堂让原本干瘪的 PPT 彻底进化。当我用手势在空中旋转地球仪，并放大地壳切面时，班里学生们的眼神里充满了震撼，专注度空前提高。",
                name: "张老师", role: "省级骨干教师", subject: "地理"
              },
              {
                quote: "AI 自动生成讲解词和课堂互动问题，帮我省去了大量的备课时间。我只需要将 3D 模型拖入库中，系统就会自动提取所有重点知识。",
                name: "李主任", role: "信息技术中心主任", subject: "技术组"
              },
              {
                quote: "物理课上的受力分析一直是个难点。现在通过空间手势和 3D 力学模型，原本抽象的概念具象化了，教学效果立竿见影。",
                name: "王老师", role: "高级教师", subject: "物理"
              }
            ].map((t, i) => (
              <motion.figure 
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.6 }}
                className="liquid-glass rounded-2xl p-8 flex flex-col justify-between group"
              >
                <blockquote className="text-sm text-white/80 leading-[1.8] relative z-10">
                  "{t.quote}"
                </blockquote>
                <figcaption className="mt-8 pt-6 border-t border-white/10 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-white group-hover:text-[#00d2ff] transition-colors">{t.name}</div>
                    <div className="text-xs text-white/50 mt-1">{t.role}</div>
                  </div>
                  <div className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs font-semibold text-white/70">
                    {t.subject}
                  </div>
                </figcaption>
              </motion.figure>
            ))}
          </div>
        </section>

        {/* 9. Pricing */}
        <section className="relative border-t border-white/5 py-32 overflow-hidden flex flex-col items-center">
          {/* 巨大的背景水印文字 */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[1200px] text-center z-0 pointer-events-none px-4">
            <div className="text-6xl md:text-[8rem] font-black tracking-tighter leading-[0.85] opacity-20 pricing-watermark">
              慧视课堂
            </div>
            <div className="text-4xl md:text-[5rem] font-bold text-white/5 tracking-tight mt-4">
              你的专属教具库。
            </div>
          </div>
          
          <div className="relative z-10 w-full max-w-[76rem] px-6">
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { tier: "免费版", price: "Free", desc: "适合个人教师初次探索智慧课堂体验。", features: ["10 个高精度教具资源", "基础 AI 模型分类", "标准 3D 课堂展示", "Web 端访问支持"] },
                { tier: "标准版", price: "¥29/月", desc: "适合需要常规授课的教师和小团队教研组。", features: ["100 个高级教具资源", "AI 智能生成讲解词", "手势识别互动展示", "教具云端同步与分享"], highlight: true },
                { tier: "专业版", price: "¥99/月", desc: "专为学校、机构和全学科生态系统打造。", features: ["无限制教具存储空间", "高级语音/手势多模态互动", "课堂专注度大数据分析", "专属学校品牌定制支持"] }
              ].map((plan, i) => (
                <div key={i} className={`liquid-glass rounded-3xl p-8 flex flex-col transition-all duration-500 ${plan.highlight ? 'border-[#00d2ff]/40 shadow-[0_0_30px_rgba(0,210,255,0.1)] -translate-y-4' : 'border-white/10'}`}>
                  <div className={`text-sm font-bold ${plan.highlight ? 'text-[#00d2ff]' : 'text-white/60'} mb-2`}>{plan.tier}</div>
                  <div className="text-4xl font-bold text-white mb-4">{plan.price}</div>
                  <div className="text-sm text-white/50 mb-8 min-h-[40px] leading-relaxed">{plan.desc}</div>
                  <ul className="space-y-4 mb-10 flex-1">
                    {plan.features.map((f, j) => (
                      <li key={j} className="flex items-start gap-3 text-sm text-white/80">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${plan.highlight ? 'bg-[#00d2ff]/20 text-[#00d2ff]' : 'bg-white/10 text-white'}`}>
                          <svg width="10" height="8" viewBox="0 0 12 10" fill="none"><path d="M1 5L4.5 8.5L11 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </div>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button className={`w-full py-3.5 rounded-xl font-bold text-sm transition-colors ${plan.highlight ? 'bg-white text-black hover:bg-white/90' : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'}`}>
                    选择计划
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 10. Final CTA */}
        <section className="max-w-[64rem] mx-auto px-6 py-24 pb-32">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="liquid-glass relative overflow-hidden rounded-[2.5rem] p-12 md:p-20 text-center border border-white/20 shadow-[0_30px_60px_rgba(0,0,0,0.8)]"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-[#00d2ff]/10 to-transparent opacity-50" />
            
            <h2 className="text-4xl md:text-[4rem] font-bold tracking-tight leading-[1.05] relative z-10 text-white drop-shadow-2xl">
              关闭枯燥课本。<br/>
              开启全息课堂。
            </h2>
            <p className="mt-8 text-white/70 max-w-lg mx-auto text-base md:text-lg leading-relaxed relative z-10">
              用空间计算与 AI 重新组织你的教学资源。让每一节课都更直观、更生动、更具有启发性。
            </p>
            <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4 relative z-10">
              <button className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-full bg-white text-black text-sm font-bold px-8 py-4 transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.4)]">
                免费下载客户端
              </button>
              <button className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-full border border-white/20 text-white text-sm font-bold px-8 py-4 hover:bg-white/10 transition-colors">
                联系学校部署
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </section>
        
        <footer className="py-8 border-t border-white/5 text-center flex flex-col items-center">
          <LogoMark />
          <div className="mt-4 text-xs text-white/30 font-medium tracking-wide">
            &copy; 2026 慧视课堂 · AI 互动教学平台. All rights reserved.
          </div>
        </footer>
      </div>
    </div>
  );
}
