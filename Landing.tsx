import React, { useRef, useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { 
  Search, ChevronRight, Sparkles, Folder, BarChart2, 
  Hand, Mic, Maximize2, FileText, Minus, X, Square,
  Menu, Cpu, Activity, Glasses, Box, Share2, BookOpen,
  Users, Download, ArrowUpRight
} from 'lucide-react';
import { useTheme } from './components/ThemeProvider';

export type MarketingPage = 'home' | 'solutions' | 'cases' | 'pricing' | 'docs' | 'join';

const NAV_ITEMS: { page: Exclude<MarketingPage, 'home'>; label: string; path: string }[] = [
  { page: 'solutions', label: '教学方案', path: '/solutions' },
  { page: 'cases', label: '案例', path: '/cases' },
  { page: 'pricing', label: '价格', path: '/pricing' },
  { page: 'docs', label: '文档', path: '/docs' },
  { page: 'join', label: '加入我们', path: '/join' },
];

const PAGE_INTROS: Record<Exclude<MarketingPage, 'home'>, { eyebrow: string; title: string; accent: string; description: string }> = {
  solutions: {
    eyebrow: 'AI × 空间计算',
    title: '为每一堂课提供',
    accent: '可触摸的教学方案',
    description: '从 3D 教具管理、空间手势到 AI 课堂助教，把抽象知识转化为可观察、可操作、可讨论的学习体验。',
  },
  cases: {
    eyebrow: '真实课堂实践',
    title: '好工具的价值，',
    accent: '由教学效果回答',
    description: '来自一线教师与教研团队的真实使用反馈，记录数智课堂如何进入不同学科的日常教学。',
  },
  pricing: {
    eyebrow: '灵活版本',
    title: '从一位教师到一所学校，',
    accent: '按需选择',
    description: '清晰、透明的版本方案，支持个人体验、教研组协作以及学校级部署。',
  },
  docs: {
    eyebrow: '产品文档中心',
    title: '快速了解并用好',
    accent: '数智课堂',
    description: '从首次登录到 3D 教具、手势互动和 AI 助教，按场景查找操作说明与教学建议。',
  },
  join: {
    eyebrow: '与教育创新者同行',
    title: '一起打造下一代',
    accent: '智慧课堂',
    description: '我们期待教师、学校、技术伙伴与教育内容创作者加入，共同让优质互动教学触达更多课堂。',
  },
};

// === 3D Neural Network Background Component ===
function NeuralNetwork({ accent }: { accent: string }) {
  const { particles, lines } = useMemo(() => {
    const particleCount = 300;
    const particles = new Float32Array(particleCount * 3);
    const linePositions: number[] = [];
    const maxDistance = 2.5;

    for (let i = 0; i < particleCount; i++) {
      particles[i * 3] = (Math.random() - 0.5) * 15;
      particles[i * 3 + 1] = (Math.random() - 0.5) * 15;
      particles[i * 3 + 2] = (Math.random() - 0.5) * 15;
    }

    for (let i = 0; i < particleCount; i++) {
      for (let j = i + 1; j < particleCount; j++) {
        const dx = particles[i * 3] - particles[j * 3];
        const dy = particles[i * 3 + 1] - particles[j * 3 + 1];
        const dz = particles[i * 3 + 2] - particles[j * 3 + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < maxDistance) {
          linePositions.push(
            particles[i * 3], particles[i * 3 + 1], particles[i * 3 + 2],
            particles[j * 3], particles[j * 3 + 1], particles[j * 3 + 2]
          );
        }
      }
    }

    return { particles, lines: new Float32Array(linePositions) };
  }, []);

  const groupRef = useRef<any>(null);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = clock.getElapsedTime() * 0.03;
      groupRef.current.rotation.x = clock.getElapsedTime() * 0.02;
    }
  });

  return (
    <group ref={groupRef}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={particles.length / 3} array={particles} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={0.04} color={accent} transparent opacity={0.8} sizeAttenuation />
      </points>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={lines.length / 3} array={lines} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial color={accent} transparent opacity={0.25} blending={THREE.AdditiveBlending} />
      </lineSegments>
    </group>
  );
}

function ParticleFlow({ accent }: { accent: string }) {
  const pointsRef = useRef<any>(null);
  const count = 1500;
  
  const particles = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20;
    }
    return positions;
  }, []);

  useFrame(({ clock }) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y = clock.getElapsedTime() * 0.02;
      pointsRef.current.position.y = Math.sin(clock.getElapsedTime() * 0.1) * 0.5;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={particles} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.015} color={accent} transparent opacity={0.3} sizeAttenuation />
    </points>
  );
}

function EnergyCore({ primary, accent }: { primary: string; accent: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const offset = useMemo(() => Math.random() * 100, []);
  
  useFrame(({ clock }) => {
    if (groupRef.current) {
      const t = clock.getElapsedTime() + offset;
      
      // 自转
      groupRef.current.rotation.y = t * 0.15;
      groupRef.current.rotation.x = t * 0.2;
      
      // 全屏范围内的随机/平滑游走 (Lissajous curve)
      // 左右大幅游走
      const x = Math.sin(t * 0.12) * 14 + Math.cos(t * 0.08) * 4;
      // 上下随机漂浮
      const y = Math.cos(t * 0.15) * 8 + Math.sin(t * 0.1) * 3;
      // 深度随机变化 (忽大忽小，忽远忽近)
      const z = -6 + Math.sin(t * 0.09) * 8; 
      
      groupRef.current.position.set(x, y, z);
    }
  });

  return (
    <group ref={groupRef}>
      {/* 外部辅助能量环 */}
      <mesh>
        <sphereGeometry args={[3.2, 32, 32]} />
        <meshBasicMaterial 
          color={primary} 
          transparent 
          opacity={0.15} 
          wireframe={true}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* 核心网格 */}
      <mesh>
        <sphereGeometry args={[2.8, 64, 64]} />
        <meshBasicMaterial 
          color={accent} 
          transparent 
          opacity={0.35} 
          wireframe={true}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* 核心内发光 */}
      <mesh>
        <sphereGeometry args={[2.2, 32, 32]} />
        <meshBasicMaterial color={primary} transparent opacity={0.15} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

function BackgroundScene({ primary, accent }: { primary: string; accent: string }) {
  return (
    <>
      <fog attach="fog" args={['#000000', 3, 12]} />
      <NeuralNetwork accent={accent} />
      <ParticleFlow accent={accent} />
      <EnergyCore primary={primary} accent={accent} />
      {/* 3D 浮动发光体 - 模拟 3D 光效 */}
      <Float speed={1.5} rotationIntensity={0.5} floatIntensity={1}>
        <mesh position={[3, 2, -4]}>
          <sphereGeometry args={[1.5, 32, 32]} />
          <meshBasicMaterial color={primary} transparent opacity={0.08} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
        <mesh position={[-3, -2, -6]}>
          <sphereGeometry args={[2, 32, 32]} />
          <meshBasicMaterial color={accent} transparent opacity={0.05} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      </Float>
    </>
  );
}

// === 3D Heart Mockup Component ===
function HeartMockup({ accent }: { accent: string }) {
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
      <pointLight position={[-10, -10, -10]} color={accent} intensity={1} />
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
  <img src="/brand/smart-cube-tech/mark.svg" alt="数智课堂 Logo" className="w-8 h-8 drop-shadow-[0_0_8px_rgba(var(--theme-accent-rgb),0.4)]" />
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
      <span className="text-sm font-medium text-ink tracking-wide">{label}</span>
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
export default function LandingPage({
  page,
  onNavigate,
  onEnter,
}: {
  page: MarketingPage;
  onNavigate: (page: MarketingPage) => void;
  onEnter: () => void;
}) {
  const [time, setTime] = useState("");
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { themeDef } = useTheme();

  const handleEnterClick = () => {
    onEnter();
  };

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    
    const updateTime = () => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
      setTime(now.toLocaleDateString('zh-CN', options).replace(/,/g, ' '));
    };
    updateTime();
    const timer = setInterval(updateTime, 60000);
    return () => {
      clearInterval(timer);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    setIsMenuOpen(false);
    document.title = page === 'home'
      ? '数智课堂 · AI 互动教学平台'
      : `${NAV_ITEMS.find((item) => item.page === page)?.label || '数智课堂'} · 数智课堂`;
  }, [page]);

  const navigateTo = (nextPage: MarketingPage) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    onNavigate(nextPage);
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[var(--theme-bg)] text-ink selection:bg-brand/30">
      
      {/* 1. 全局背景 (深空渐变 + 3D 神经网络粒子流 + 体积光) */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        {/* 深海蓝 -> 黑色径向渐变，制造极致深邃感 */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--theme-bg-soft)_0%,_var(--theme-bg)_80%)]" />
        
        {/* 强化微弱体积光晕 */}
        <div className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-[rgba(var(--theme-primary-rgb),0.20)] mix-blend-screen blur-[150px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-[rgba(var(--theme-accent-rgb),0.15)] mix-blend-screen blur-[130px]" />

        {/* 底部补充环境光 */}
        <div className="absolute inset-x-0 bottom-0 h-64 bg-[radial-gradient(ellipse_at_bottom,rgba(var(--theme-accent-rgb),0.15),transparent_70%)]" />

        <div className="absolute inset-0 opacity-80">
          <Canvas camera={{ position: [0, 0, 5], fov: 60 }}>
            <BackgroundScene primary={themeDef.primary} accent={themeDef.accent} />
          </Canvas>
        </div>
      </div>

      {/* SVG Noise Filter */}
      <svg className="w-0 h-0 absolute pointer-events-none">
        <filter id="noise-filter">
          <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.25 0" />
          <feComposite in2="SourceGraphic" operator="in" result="noise" />
          <feBlend in="SourceGraphic" in2="noise" mode="screen" />
        </filter>
      </svg>

      <div className="relative z-10 min-h-screen flex flex-col">
        
        {/* 2. Navbar */}
        <motion.nav 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className={`w-full px-10 h-20 flex items-center relative sticky top-0 z-50 transition-all duration-500 ${isScrolled ? 'bg-cyan-50/70 backdrop-blur-2xl border-b border-line/10 shadow-[0_10px_30px_rgba(0,0,0,0.5)]' : 'bg-transparent border-transparent'}`}
        >
          <a href="/" onClick={navigateTo('home')} aria-label="返回首页" className="flex items-center gap-2 cursor-pointer absolute left-6 md:left-10">
            <LogoMark />
          </a>
          <div className="hidden md:flex items-center justify-center gap-8 w-full">
            {NAV_ITEMS.map((item, i) => (
              <motion.a 
                key={item.page}
                href={item.path}
                onClick={navigateTo(item.page)}
                initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                aria-current={page === item.page ? 'page' : undefined}
                className={`text-sm font-semibold transition-colors relative group py-2 ${page === item.page ? 'text-cyan' : 'text-ink/70 hover:text-cyan'}`}
              >
                {item.label}
                <div className={`absolute bottom-0 left-0 w-full h-[2px] bg-cyan transition-transform origin-left duration-300 shadow-[0_0_10px_var(--theme-accent)] ${page === item.page ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'}`}></div>
              </motion.a>
            ))}
          </div>
          <button
            type="button"
            aria-label={isMenuOpen ? '关闭导航菜单' : '打开导航菜单'}
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((open) => !open)}
            className="md:hidden absolute right-6 w-10 h-10 flex items-center justify-center rounded-full bg-white/5 border border-line/10"
          >
            {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </motion.nav>

        {isMenuOpen && (
          <div className="fixed top-20 inset-x-4 z-50 md:hidden rounded-2xl border border-line/10 bg-cyan-50/95 backdrop-blur-2xl p-3 shadow-2xl">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.page}
                href={item.path}
                onClick={navigateTo(item.page)}
                className={`block rounded-xl px-4 py-3 text-sm font-semibold ${page === item.page ? 'bg-cyan/10 text-cyan' : 'text-ink/70 hover:bg-white/5 hover:text-ink'}`}
              >
                {item.label}
              </a>
            ))}
          </div>
        )}

        {page !== 'home' && (
          <header className="max-w-[76rem] mx-auto px-6 pt-24 pb-16 text-center relative z-20">
            <div className="flex justify-center"><SectionEyebrow label={PAGE_INTROS[page].eyebrow} /></div>
            <h1 className="mt-7 text-4xl md:text-6xl font-black tracking-tight leading-[1.08]">
              {PAGE_INTROS[page].title}<br />
              <span className="text-cyan">{PAGE_INTROS[page].accent}</span>
            </h1>
            <p className="mt-7 mx-auto max-w-2xl text-base md:text-lg leading-relaxed text-ink/60">
              {PAGE_INTROS[page].description}
            </p>
          </header>
        )}

        {/* 3. Hero 首屏 */}
        {page === 'home' && (
        <section className="landing-home-hero pt-28 md:pt-32 pb-12 text-center px-4 flex flex-col items-center relative z-20">
          
          {/* 浮动技术徽章 (填补两侧空洞) */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden max-w-[100vw] hidden md:block z-0 opacity-60">
            <motion.div 
              initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.8, duration: 1 }}
              className="absolute top-[15%] left-[2%] lg:left-[5%] flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.03] border border-line/10 backdrop-blur-md shadow-[0_0_15px_rgba(var(--theme-accent-rgb),0.1)]"
            >
              <div className="w-2 h-2 rounded-full bg-cyan shadow-[0_0_8px_var(--theme-accent)] animate-pulse" />
              <span className="text-xs font-semibold text-ink/60 tracking-wider">AI 空间驱动</span>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1, duration: 1 }}
              className="absolute top-[20%] right-[2%] lg:right-[5%] flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.03] border border-line/10 backdrop-blur-md shadow-[0_0_15px_rgba(var(--theme-accent-rgb),0.1)]"
            >
              <Activity className="w-3.5 h-3.5 text-cyan" />
              <span className="text-xs font-semibold text-ink/60 tracking-wider">60FPS 实时渲染</span>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2, duration: 1 }}
              className="absolute bottom-[25%] left-[4%] lg:left-[8%] flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.03] border border-line/10 backdrop-blur-md shadow-[0_0_15px_rgba(var(--theme-accent-rgb),0.1)]"
            >
              <Hand className="w-3.5 h-3.5 text-cyan" />
              <span className="text-xs font-semibold text-ink/60 tracking-wider">毫秒级手势交互</span>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.4, duration: 1 }}
              className="absolute bottom-[20%] right-[4%] lg:right-[8%] flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.03] border border-line/10 backdrop-blur-md shadow-[0_0_15px_rgba(var(--theme-accent-rgb),0.1)]"
            >
              <Share2 className="w-3.5 h-3.5 text-cyan" />
              <span className="text-xs font-semibold text-ink/60 tracking-wider">跨端无缝协同</span>
            </motion.div>
          </div>

          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center leading-[1.15]"
          >
            <HoverText
              text="你的专属 3D 互动教具库"
              className="text-5xl md:text-[5.5rem] font-[900] tracking-tight mb-4 flex justify-center"
              charStyle={{
                backgroundImage: 'linear-gradient(to bottom, #ffffff 30%, #a5d2ff 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                color: 'transparent',
                WebkitTextStroke: '1px rgba(255,255,255,0.25)',
                textShadow: '0 0 30px rgba(165, 210, 255, 0.4)'
              }}
            />
            <div className="relative mt-2 pb-4">
              <HoverText
                text="数智课堂"
                className="text-6xl md:text-[6.5rem] font-black tracking-widest relative z-10 flex justify-center"
                charClassName="animate-shiny"
                gradientSpan={true}
                charStyle={{
                  backgroundImage: 'linear-gradient(to right, #00f0ff, #0055ff, #00f0ff)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  color: 'transparent',
                  textShadow: '0 0 20px rgba(var(--theme-accent-rgb), 0.3), 0 0 40px rgba(0, 85, 255, 0.2)'
                }}
              />
              {/* 发光高亮背板加强 -> 柔和背板以减少视觉疲劳 */}
              <div className="absolute inset-0 bg-cyan/10 blur-[60px] rounded-full pointer-events-none z-0" />
            </div>
          </motion.div>

          <motion.p 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 1, ease: "easeOut" }}
            className="landing-hero-subtitle mt-8 text-ink/60 max-w-2xl text-lg md:text-xl leading-relaxed font-medium"
          >
            让每个抽象知识点<br />都能被看见、触摸和理解
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.8 }}
            className="landing-hero-actions mt-14 flex flex-col items-center gap-6"
          >
            <motion.button 
              onClick={handleEnterClick}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              className="relative group inline-flex items-center justify-center gap-3 rounded-full px-12 py-4 text-base font-bold text-ink overflow-hidden transition-all duration-300 shadow-[0_0_30px_rgba(var(--theme-accent-rgb),0.2)] hover:shadow-[0_0_50px_rgba(var(--theme-accent-rgb),0.4)]"
            >
              <div className="absolute inset-0 bg-cyan-50/40 backdrop-blur-md rounded-full border border-line/10 group-hover:border-cyan/50 transition-colors duration-300" />
              <div className="absolute inset-0 bg-gradient-to-r from-cyan/0 via-cyan/10 to-cyan/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-md" />
              <div className="absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-cyan/80 to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-300" />
              
              <span className="relative z-10 flex items-center gap-2 drop-shadow-md group-hover:text-cyan transition-colors duration-300">
                立即体验
                <ChevronRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
              </span>
            </motion.button>

            <span className="text-sm font-medium tracking-widest uppercase text-ink/30">
              AI 教具管理 · 手势互动 · 智慧课堂
            </span>
          </motion.div>
        </section>
        )}


        {/* 5. 教学案例展示区 (3D 控制台 Mockup) */}
        {page === 'cases' && (
        <section className="max-w-[76rem] mx-auto px-6 py-20 relative z-20">
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.98 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className="relative rounded-2xl overflow-hidden border border-line/15 bg-cyan-50/80 backdrop-blur-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] ring-1 ring-white/5"
          >
            {/* 窗口头部 */}
            <div className="h-12 border-b border-line/10 bg-white/[0.02] flex items-center px-4 relative">
              <div className="flex gap-2 absolute left-4">
                <button className="w-3.5 h-3.5 rounded-full bg-[#ff5f57] flex items-center justify-center group hover:bg-[#ff5f57]/80"><X className="w-2.5 h-2.5 text-black/50 opacity-0 group-hover:opacity-100" /></button>
                <button className="w-3.5 h-3.5 rounded-full bg-[#febc2e] flex items-center justify-center group hover:bg-[#febc2e]/80"><Minus className="w-2.5 h-2.5 text-black/50 opacity-0 group-hover:opacity-100" /></button>
                <button className="w-3.5 h-3.5 rounded-full bg-[#28c840] flex items-center justify-center group hover:bg-[#28c840]/80"><Maximize2 className="w-2.5 h-2.5 text-black/50 opacity-0 group-hover:opacity-100 p-0.5" /></button>
              </div>
              <div className="w-full text-center text-xs font-semibold text-ink/50 tracking-wider">
                数智课堂 — 教具库
              </div>
            </div>

            {/* 界面主体三栏 */}
            <div className="grid grid-cols-1 md:grid-cols-12 h-[600px]">
              
              {/* 左侧 Sidebar */}
              <div className="hidden md:flex flex-col col-span-2 border-r border-line/10 bg-cyan/40 p-3">
                <button className="w-full flex items-center justify-center gap-2 rounded-lg bg-white/10 hover:bg-white/15 border border-line/5 text-ink text-xs font-semibold px-3 py-2.5 mb-6 transition-all">
                  <Sparkles className="w-3.5 h-3.5 text-cyan" />
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
                    <div key={i} className={`flex items-center gap-3 text-xs px-3 py-2 rounded-md cursor-pointer transition-colors ${item.active ? 'bg-white/10 text-ink font-medium' : 'text-ink/60 hover:bg-white/5 hover:text-ink'}`}>
                      <item.icon className="w-4 h-4 opacity-80" />
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>

                <div className="text-[10px] uppercase tracking-widest text-ink/40 font-semibold mb-3 px-3">知识图谱标签</div>
                <div className="space-y-1">
                  {[
                    { label: '地理', color: '#3b82f6' },
                    { label: '生物', color: '#10b981' },
                    { label: '化学', color: '#f59e0b' },
                    { label: '物理', color: '#8b5cf6' },
                    { label: '历史', color: '#ec4899' },
                  ].map(tag => (
                    <div key={tag.label} className="flex items-center gap-2 text-xs px-3 py-1.5 text-ink/60 hover:bg-white/5 cursor-pointer rounded-md">
                      <div className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: tag.color, color: tag.color }} />
                      {tag.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* 中间主视觉 (3D Canvas) */}
              <div className="col-span-1 md:col-span-7 border-r border-line/10 relative bg-cyan/20 flex flex-col">
                <div className="h-10 border-b border-line/10 px-4 flex items-center justify-end bg-cyan/40 backdrop-blur-sm z-10">
                  <div className="flex gap-2">
                    <button className="text-xs text-ink/60 hover:text-ink px-2 py-1 rounded hover:bg-white/10 flex items-center gap-1">
                      <Glasses className="w-3.5 h-3.5" /> AR 预览
                    </button>
                    <button className="text-xs text-ink/60 hover:text-ink px-2 py-1 rounded hover:bg-white/10 flex items-center gap-1">
                      <Share2 className="w-3.5 h-3.5" /> 投屏
                    </button>
                  </div>
                </div>

                <div className="flex-1 relative overflow-hidden">
                  {/* 3D 渲染区域 */}
                  <div className="absolute inset-0 cursor-move">
                    <Canvas camera={{ position: [0, 0, 4] }}>
                      <OrbitControls enableZoom={false} autoRotate autoRotateSpeed={0.5} />
                      <HeartMockup accent={themeDef.accent} />
                    </Canvas>
                  </div>

                  {/* UI 叠加层：手势识别状态 */}
                  <div className="absolute bottom-6 inset-x-0 flex justify-center pointer-events-none">
                    <div className="bg-cyan/60 backdrop-blur-md border border-line/10 px-4 py-2 rounded-full flex items-center gap-3">
                      <div className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan"></span>
                      </div>
                      <span className="text-xs text-ink/80 font-medium">MediaPipe 手势追踪已开启 · 尝试“捏合”缩放</span>
                      <Hand className="w-4 h-4 text-ink/50 ml-2" />
                    </div>
                  </div>
                </div>
              </div>

              {/* 右侧详情面板 */}
              <div className="hidden md:flex flex-col col-span-3 bg-cyan/40 p-5 overflow-y-auto">
                <h3 className="text-sm font-bold text-ink mb-4">AI 备课助手</h3>
                
                <div className="rounded-xl border border-cyan/30 bg-cyan/5 p-4 mb-6 shadow-inner relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-cyan to-transparent" />
                  <div className="flex items-center gap-2 text-cyan text-xs font-bold mb-3">
                    <Sparkles className="w-4 h-4" />
                    自动生成讲解词
                  </div>
                  <p className="text-xs text-ink/80 leading-relaxed font-medium">
                    “同学们请看，这是人体心脏的 3D 模型。心脏有四个腔室，分为左心房、左心室、右心房和右心室。当我们将手掌张开时，模型将展示内部的瓣膜结构...”
                  </p>
                </div>

                <div className="space-y-5">
                  <div>
                    <div className="text-[10px] text-ink/40 uppercase tracking-wider mb-2">互动提问生成</div>
                    <div className="bg-white/5 border border-line/10 rounded-lg p-3 text-xs text-ink/70">
                      1. 血液是如何通过二尖瓣流动的？<br/>
                      2. 右心室负责将血液泵向哪里？
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-[10px] text-ink/40 uppercase tracking-wider mb-2">交互说明</div>
                    <div className="flex flex-wrap gap-2">
                      <span className="px-2 py-1 bg-white/5 border border-line/10 rounded text-[10px] text-ink/80 flex items-center gap-1"><Hand className="w-3 h-3"/> 挥手旋转模型</span>
                      <span className="px-2 py-1 bg-white/5 border border-line/10 rounded text-[10px] text-ink/80 flex items-center gap-1"><Mic className="w-3 h-3"/> 语音切换高亮</span>
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
        )}

        {/* 6. 功能区：AI 教具管理 */}
        {page === 'solutions' && (
        <>
        <section className="max-w-[76rem] mx-auto px-6 py-24 border-t border-line/5">
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
                <span className="text-cyan">沉浸教学体验</span>
              </h2>
              <p className="mt-6 text-ink/60 text-lg leading-relaxed max-w-lg">
                数智课堂不仅是一个教具云盘，更是一个懂你的教学引擎。通过空间计算和 AI 大模型，让每个教具都“活”起来。
              </p>
              
              <div className="mt-10 grid grid-cols-2 gap-4">
                {[
                  { icon: Hand, title: "空间手势互动", desc: "无需鼠标，挥手即可拆解模型" },
                  { icon: Mic, title: "语音智能助教", desc: "上课时随时呼叫 AI 回答问题" },
                  { icon: Folder, title: "自动教具分类", desc: "千万级资源，秒级图谱归档" },
                  { icon: BarChart2, title: "课堂行为分析", desc: "实时追踪学生的互动专注度" },
                ].map((feature, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-10 h-10 rounded-lg bg-white/5 border border-line/10 flex items-center justify-center shrink-0">
                      <feature.icon className="w-5 h-5 text-cyan" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-ink">{feature.title}</div>
                      <div className="text-xs text-ink/50 mt-1">{feature.desc}</div>
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
                  <span className="text-sm font-bold text-ink">今日教具资源库动态</span>
                </div>
                <div className="space-y-3">
                  {[
                    { title: "已自动打标签 42 个新模型", color: "var(--theme-accent)", progress: "100%" },
                    { title: "为 18 个物理实验生成了讲解词", color: "#A4F4FD", progress: "85%" },
                    { title: "3 个生物 3D 模型需要手动确认", color: "#febc2e", progress: "30%" },
                  ].map((item, i) => (
                    <div key={i} className="bg-cyan/30 border border-line/5 rounded-lg p-3">
                      <div className="text-xs text-ink/80 font-medium mb-2">{item.title}</div>
                      <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: item.progress, backgroundColor: item.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="liquid-glass rounded-2xl p-6 flex flex-col items-center text-center justify-center h-40">
                  <Hand className="w-8 h-8 text-cyan mb-3" />
                  <div className="text-sm font-bold">MediaPipe 引擎</div>
                  <div className="text-xs text-ink/50 mt-1">毫秒级手势追踪就绪</div>
                </div>
                <div className="liquid-glass rounded-2xl p-6 flex flex-col items-center text-center justify-center h-40">
                  <Cpu className="w-8 h-8 text-cyan mb-3" />
                  <div className="text-xs text-ink/50 mt-1">多模态教学认知赋能</div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* 7. Logo Cloud */}
        <section className="max-w-[76rem] mx-auto px-6 py-20 border-t border-line/5">
          <div className="text-center text-[10px] md:text-xs uppercase tracking-[0.2em] text-ink/40 font-semibold mb-12">
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
                className="text-sm md:text-base font-bold text-ink/50 hover:text-ink transition-colors cursor-default"
              >
                {name}
              </motion.div>
            ))}
          </div>
        </section>
        </>
        )}

        {/* 8. Testimonials */}
        {page === 'cases' && (
        <section className="max-w-[76rem] mx-auto px-6 py-24 border-t border-line/5">
          <SectionEyebrow label="教育者的声音" />
          <h2 className="mt-4 text-3xl font-bold mb-12">一线名师的真实反馈</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                quote: "数智课堂让原本干瘪的 PPT 彻底进化。当我用手势在空中旋转地球仪，并放大地壳切面时，班里学生们的眼神里充满了震撼，专注度空前提高。",
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
                <blockquote className="text-sm text-ink/80 leading-[1.8] relative z-10">
                  "{t.quote}"
                </blockquote>
                <figcaption className="mt-8 pt-6 border-t border-line/10 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-ink group-hover:text-cyan transition-colors">{t.name}</div>
                    <div className="text-xs text-ink/50 mt-1">{t.role}</div>
                  </div>
                  <div className="px-3 py-1 bg-white/5 border border-line/10 rounded-full text-xs font-semibold text-ink/70">
                    {t.subject}
                  </div>
                </figcaption>
              </motion.figure>
            ))}
          </div>
        </section>
        )}

        {/* 9. Pricing */}
        {page === 'pricing' && (
        <section className="relative border-t border-line/5 py-32 overflow-hidden flex flex-col items-center">
          {/* 巨大的背景水印文字 */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[1200px] text-center z-0 pointer-events-none px-4">
            <div className="text-6xl md:text-[8rem] font-black tracking-tighter leading-[0.85] opacity-20 pricing-watermark">
              数智课堂
            </div>
            <div className="text-4xl md:text-[5rem] font-bold text-ink/5 tracking-tight mt-4">
              你的专属教具库
            </div>
          </div>
          
          <div className="relative z-10 w-full max-w-[76rem] px-6">
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { tier: "免费版", price: "Free", desc: "适合个人教师初次探索智慧课堂体验。", features: ["10 个高精度教具资源", "基础 AI 模型分类", "标准 3D 课堂展示", "Web 端访问支持"] },
                { tier: "标准版", price: "¥29/月", desc: "适合需要常规授课的教师和小团队教研组。", features: ["100 个高级教具资源", "AI 智能生成讲解词", "手势识别互动展示", "教具云端同步与分享"], highlight: true },
                { tier: "专业版", price: "¥99/月", desc: "专为学校、机构和全学科生态系统打造。", features: ["无限制教具存储空间", "高级语音/手势多模态互动", "课堂专注度大数据分析", "专属学校品牌定制支持"] }
              ].map((plan, i) => (
                <div key={i} className={`liquid-glass rounded-3xl p-8 flex flex-col transition-all duration-500 ${plan.highlight ? 'border-cyan/40 shadow-[0_0_30px_rgba(var(--theme-accent-rgb),0.1)] -translate-y-4' : 'border-line/10'}`}>
                  <div className={`text-sm font-bold ${plan.highlight ? 'text-cyan' : 'text-ink/60'} mb-2`}>{plan.tier}</div>
                  <div className="text-4xl font-bold text-ink mb-4">{plan.price}</div>
                  <div className="text-sm text-ink/50 mb-8 min-h-[40px] leading-relaxed">{plan.desc}</div>
                  <ul className="space-y-4 mb-10 flex-1">
                    {plan.features.map((f, j) => (
                      <li key={j} className="flex items-start gap-3 text-sm text-ink/80">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${plan.highlight ? 'bg-cyan/20 text-cyan' : 'bg-white/10 text-ink'}`}>
                          <svg width="10" height="8" viewBox="0 0 12 10" fill="none"><path d="M1 5L4.5 8.5L11 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </div>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button className={`w-full py-3.5 rounded-xl font-bold text-sm transition-colors ${plan.highlight ? 'bg-white text-black hover:bg-white/90' : 'bg-white/5 text-ink hover:bg-white/10 border border-line/10'}`}>
                    选择计划
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
        )}

        {page === 'docs' && (
          <section className="max-w-[76rem] mx-auto px-6 py-20 border-t border-line/5">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[
                { icon: BookOpen, title: '快速开始', description: '完成登录、创建教具库，并开始你的第一场 3D 课堂演示。', meta: '约 5 分钟' },
                { icon: Box, title: '3D 教具指南', description: '了解模型导入、分类、高亮、拆解和课堂投屏的完整流程。', meta: '教具管理' },
                { icon: Hand, title: '空间手势操作', description: '掌握旋转、缩放与模型交互手势，并排查摄像头识别问题。', meta: '互动控制' },
                { icon: Mic, title: '语音与 AI 助教', description: '配置语音交互，生成讲解词、课堂问题与追问回答。', meta: 'AI 助教' },
                { icon: BarChart2, title: '课堂数据', description: '查看互动记录与学习反馈，用数据帮助下一次备课。', meta: '教学分析' },
                { icon: Download, title: '部署与设备', description: '查看浏览器、摄像头、投屏设备及学校网络环境建议。', meta: '环境配置' },
              ].map((doc) => (
                <article key={doc.title} className="liquid-glass rounded-2xl p-7 min-h-56 flex flex-col group">
                  <div className="w-11 h-11 rounded-xl bg-cyan/10 border border-cyan/20 flex items-center justify-center">
                    <doc.icon className="w-5 h-5 text-cyan" />
                  </div>
                  <h2 className="mt-6 text-xl font-bold group-hover:text-cyan transition-colors">{doc.title}</h2>
                  <p className="mt-3 text-sm leading-relaxed text-ink/55 flex-1">{doc.description}</p>
                  <div className="mt-6 flex items-center justify-between text-xs text-ink/40">
                    <span>{doc.meta}</span>
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-10 liquid-glass rounded-2xl p-7 md:p-9 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h2 className="text-xl font-bold">准备开始实际操作？</h2>
                <p className="mt-2 text-sm text-ink/55">进入平台后，可以直接使用示例教具熟悉完整课堂流程。</p>
              </div>
              <button onClick={handleEnterClick} className="shrink-0 rounded-full bg-white text-black px-7 py-3 text-sm font-bold hover:bg-white/90 transition-colors">
                进入数智课堂
              </button>
            </div>
          </section>
        )}

        {page === 'join' && (
        <>
        <section className="max-w-[76rem] mx-auto px-6 py-20 border-t border-line/5">
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: Users, title: '学校与教研团队', description: '共同设计学科示范课、校本资源库与教师培训方案。' },
              { icon: BookOpen, title: '教师与内容创作者', description: '把优秀教学经验转化为可复用的 3D 互动课程内容。' },
              { icon: Cpu, title: '技术与生态伙伴', description: '围绕硬件、模型资源和教育场景建设开放合作生态。' },
            ].map((item) => (
              <div key={item.title} className="liquid-glass rounded-2xl p-8 text-center">
                <div className="mx-auto w-12 h-12 rounded-xl bg-cyan/10 border border-cyan/20 flex items-center justify-center">
                  <item.icon className="w-6 h-6 text-cyan" />
                </div>
                <h2 className="mt-6 text-lg font-bold">{item.title}</h2>
                <p className="mt-3 text-sm text-ink/55 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 10. Final CTA */}
        <section className="max-w-[64rem] mx-auto px-6 py-24 pb-32">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="liquid-glass relative overflow-hidden rounded-[2.5rem] p-12 md:p-20 text-center border border-line/20 shadow-[0_30px_60px_rgba(0,0,0,0.8)]"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-cyan/10 to-transparent opacity-50" />
            
            <h2 className="text-4xl md:text-[4rem] font-bold tracking-tight leading-[1.05] relative z-10 text-ink drop-shadow-2xl">
              把你的教育经验，<br/>
              带进未来课堂。
            </h2>
            <p className="mt-8 text-ink/70 max-w-lg mx-auto text-base md:text-lg leading-relaxed relative z-10">
              无论你来自学校、教研团队还是技术生态，我们都期待与你一起探索更直观、更生动的教学方式。
            </p>
            <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4 relative z-10">
              <button onClick={() => onNavigate('solutions')} className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-full bg-white text-black text-sm font-bold px-8 py-4 transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.4)]">
                查看教学方案
              </button>
              <button onClick={handleEnterClick} className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-full border border-line/20 text-ink text-sm font-bold px-8 py-4 hover:bg-white/10 transition-colors">
                立即体验产品
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </section>
        </>
        )}
        
        <footer className={`${page === 'home' ? 'py-4' : 'py-8'} mt-auto border-t border-line/5 text-center flex flex-col items-center`}>
          <a href="/" onClick={navigateTo('home')} aria-label="返回首页"><LogoMark /></a>
          <div className={`${page === 'home' ? 'mt-2' : 'mt-4'} text-xs text-ink/40 font-medium tracking-wide`}>
            &copy; 2026 数智课堂 · AI 互动教学平台. All rights reserved.
          </div>
        </footer>
      </div>
    </div>
  );
}
