import React, { useRef, useState, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { ControlRefs } from '../types';

const frameDamping = (delta: number, speed: number) => 1 - Math.exp(-speed * Math.min(delta, 0.05));

interface ProceduralTerrainProps {
  controlRef: React.MutableRefObject<ControlRefs>;
  showLabels?: boolean;
  cameraTarget?: [number, number, number];
}

// 标签组件 (教学内容)
const EduLabel = ({ targetPosition, labelPosition, title, subtitle, colorClass, borderClass, shadowClass, lineColor, visible }: any) => {
  if (!visible) return null;
  return (
  <group>
    {/* 连线 */}
    <Line
      points={[targetPosition, labelPosition]}
      color={lineColor || '#ffffff'}
      lineWidth={1.5}
      dashed={false}
      transparent
      opacity={0.8}
    />
    {/* 锚点 */}
    <mesh position={targetPosition}>
      <sphereGeometry args={[0.02, 8, 8]} />
      <meshBasicMaterial color={lineColor || '#ffffff'} />
    </mesh>
    {/* 浮动面板 */}
    <Html distanceFactor={10} position={labelPosition} center>
      <div className={`bg-black/80 backdrop-blur-md px-2 py-1.5 rounded-lg text-white text-[8px] whitespace-nowrap border ${borderClass} ${shadowClass} transition-transform hover:scale-110 cursor-default shadow-xl`}>
        <b className={`${colorClass} text-[9px]`}>{title}</b><br/>
        <span className="text-gray-300 leading-tight block mt-0.5">{subtitle}</span>
      </div>
    </Html>
  </group>
  );
};

export const ProceduralTerrain: React.FC<ProceduralTerrainProps> = ({ controlRef, showLabels = true, cameraTarget = [0, 0.5, 0] }) => {
  const groupRef = useRef<THREE.Group>(null);
  const bedrockRef = useRef<THREE.Mesh>(null);
  const soilRef = useRef<THREE.Mesh>(null);
  const surfaceRef = useRef<THREE.Mesh>(null);
  const waterRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const orbitTarget = useMemo(() => new THREE.Vector3(cameraTarget[0], cameraTarget[1], cameraTarget[2]), [cameraTarget]);
  
  const sphericalRef = useRef(new THREE.Spherical());
  const cameraInitialized = useRef(false);
  const wasCameraGestureActiveRef = useRef(false);
  const frameScratchRef = useRef({
    offset: new THREE.Vector3(),
    bedrockTarget: new THREE.Vector3(),
    soilTarget: new THREE.Vector3(),
    surfaceTarget: new THREE.Vector3(),
    waterTarget: new THREE.Vector3()
  });

  // 自定义材质：通过着色器实现真实的等高线渲染
  const terrainMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      vertexColors: true,
      roughness: 0.8
    });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\nvarying float vElevation;'
      ).replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvElevation = position.z;'
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        '#include <common>\nvarying float vElevation;'
      ).replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
         float contourInterval = 0.15;
         float val = fract(vElevation / contourInterval);
         float f = fwidth(vElevation / contourInterval);
         // 等高线仅在陆地区域(vElevation > 0.0)绘制
         if (f > 0.0 && (val < f * 1.5 || val > 1.0 - f * 1.5) && vElevation > 0.02) {
            gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 1.0, 1.0), 0.7); 
         }
        `
      );
    };
    return mat;
  }, []);

  // 数学建模：生成具备所有教学特征的地形
  const terrainGeo = useMemo(() => {
    const geo = new THREE.PlaneGeometry(4, 4, 256, 256); // 提高精度以显示平滑河流
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      
      let h = 0;
      
      // 1. 基础倾斜：从西(-2)向东(2)倾斜 (西高东低)
      h += 0.3 - x * 0.15;
      
      let isRiverWater = false;
      let isPlateau = false;
      let isPlateauEdge = false;
      let isAlluvialFan = false;
      let isDelta = false;
      let isBasinBottom = false;
      let isMountain = false;
      let isMountainPeak = false;
      
      // 2. 山地 (Mountain) @ (-1.2, 1.2)
      const distM = Math.sqrt((x + 1.2)**2 + (y - 1.2)**2);
      if (distM < 1.5) {
         h += Math.max(0, 0.8 * Math.cos(distM * 1.5)) * Math.exp(-distM * 2);
         // 高频柏林噪声模拟陡峭山脉
         h += Math.max(0, (1 - distM) * 0.25 * Math.sin(x*15) * Math.sin(y*15));
         if (distM < 0.8) isMountain = true;
         if (distM < 0.3 && h > 0.8) isMountainPeak = true;
      }
      
      // 3. 高原 (Plateau) @ (-1.0, -1.0) - 顶部平坦
      const distP = Math.sqrt((x + 1.0)**2 + (y + 1.0)**2);
      if (distP < 0.6) {
        h += 1.2 - distP * 0.05; // 提高海拔，非常平缓
        isPlateau = true;
      } else if (distP < 0.8) {
        // 极陡峭的边缘悬崖 (Drop over 0.2 distance)
        const normDist = (distP - 0.6) / 0.2;
        h += 1.2 * (1 - Math.pow(normDist, 0.6)); // 快速跌落 (悬崖感)
        isPlateauEdge = true;
      }
      
      // 4. 丘陵 (Hills) @ (0.5, -1.0) - 连绵起伏
      const distH = Math.sqrt((x - 0.5)**2 + (y + 1.0)**2);
      h += Math.max(0, 0.25 * Math.sin(x * 12) * Math.cos(y * 12)) * Math.max(0, 1 - distH);
      
      // 5. 盆地 (Basin) @ (0.5, 1.2) - 四周高中间低
      const distB = Math.sqrt((x - 0.5)**2 + (y - 1.2)**2);
      if (distB < 0.3) {
        h -= 0.3; // 平坦如碗底
        isBasinBottom = true;
      } else if (distB < 0.8) {
        const normB = (distB - 0.3) / 0.5;
        h -= 0.3 * (1 - Math.pow(normB, 2)); // 碗边隆起
      }
      
      // 6. 河流侵蚀 (River Erosion)
      const riverY = 0.3 * Math.sin(x * 2) - 0.2 * x;
      const distRiver = Math.abs(y - riverY);
      
      // 普通河道下凹
      if (distRiver < 0.15 && x < 1.3) {
        const width = 0.05 + ((x + 2) / 4) * 0.10; 
        
        if (distRiver < width) {
          const carve = 0.1 * Math.cos((distRiver / width) * Math.PI / 2);
          h -= carve;
          // 河底水流
          if (distRiver < width * 0.4) {
            isRiverWater = true;
          }
        }
      }
      
      // 7. 冲积扇 (Alluvial Fan) @ 出山口 x=-0.2
      if (x > -0.4 && x < 0.4 && Math.abs(y - riverY) < 0.5) {
        const fanDist = Math.sqrt((x + 0.2)**2 + (y - riverY)**2);
        if (fanDist < 0.4 && x > -0.2 && !isRiverWater) {
           h += 0.15 * Math.pow((1 - fanDist / 0.4), 1.5); // 明显的锥形沉积隆起
           isAlluvialFan = true;
        }
      }
      
      // 8. 确保东侧(右侧)入海口平缓 (Delta / Ocean)
      if (x > 1.0) {
        // 三角洲网状分叉
        const deltaDist1 = Math.abs(y - (riverY + 0.3 * (x - 1.0)));
        const deltaDist2 = Math.abs(y - (riverY - 0.3 * (x - 1.0)));
        
        if ((distRiver < 0.05 || deltaDist1 < 0.05 || deltaDist2 < 0.05) && x < 1.8) {
          isRiverWater = true;
          h -= 0.05; // 分叉河道凹陷
        } else if (Math.abs(y - riverY) < 0.6 && x < 1.6) {
          // 泥沙堆积岛
          h += 0.06 * (1 - (x - 1.0) / 0.6);
          isDelta = true;
        }
        
        if (x > 1.2 && !isDelta && !isRiverWater) {
           h = Math.min(h, -0.05 - (x - 1.2) * 0.2); // 海洋底部
        }
      }

      // 添加地形微小噪点增强真实感
      h += (Math.sin(x*20) * Math.cos(y*20)) * 0.005;

      pos.setZ(i, h);

      // --- 顶点着色 (Vertex Coloring) ---
      let r = 0.18, g = 0.40, b = 0.15; // 基础平原深绿
      
      if (isRiverWater) {
        r = 0.0; g = 0.25; b = 0.65; // 深河流蓝
      } else if (h < -0.05 && x > 1.2) {
        r = 0.02; g = 0.20; b = 0.50; // 深邃海洋蓝
      } else if (isPlateauEdge) {
        r = 0.30; g = 0.25; b = 0.20; // 高原陡峭断崖（暗褐岩石）
      } else if (isPlateau) {
        r = 0.55; g = 0.45; b = 0.30; // 高原深黄褐色（不再发白）
      } else if (isMountainPeak) {
        r = 0.65; g = 0.70; b = 0.75; // 山峰微白带灰，不刺眼
      } else if (isMountain) {
        r = 0.35; g = 0.40; b = 0.30; // 山地深青灰色
      } else if (isAlluvialFan) {
        r = 0.55; g = 0.45; b = 0.25; // 冲积扇深泥沙黄
      } else if (isDelta) {
        r = 0.25; g = 0.45; b = 0.20; // 三角洲暗湿地绿
      } else if (isBasinBottom) {
        r = 0.10; g = 0.30; b = 0.10; // 盆地底部极深绿（茂盛森林）
      } else if (h > 0.4) {
        r = 0.25; g = 0.35; b = 0.20; // 丘陵/山脉深色过渡绿
      }
      
      // 添加地形微小噪点颜色增强真实感
      const noise = (Math.sin(x*50) * Math.cos(y*50)) * 0.03;
      colors[i * 3] = Math.min(1, Math.max(0, r + noise));
      colors[i * 3 + 1] = Math.min(1, Math.max(0, g + noise));
      colors[i * 3 + 2] = Math.min(1, Math.max(0, b + noise));
    }
    
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, []);

  useFrame((state, delta) => {
    if (groupRef.current && controlRef.current.rotationVelocity.x === 0 && controlRef.current.rotationVelocity.y === 0) {
      groupRef.current.rotation.y += 0.0015;
    }

    const { rotationVelocity, zoomSpeed } = controlRef.current;
    
    const hasCameraGestureInput =
      Math.abs(rotationVelocity.x) > 0.0001 ||
      Math.abs(rotationVelocity.y) > 0.0001 ||
      zoomSpeed !== 0;

    const scratch = frameScratchRef.current;
    const offset = scratch.offset.subVectors(camera.position, orbitTarget);
    if (!cameraInitialized.current || !wasCameraGestureActiveRef.current) {
      sphericalRef.current.setFromVector3(offset);
      cameraInitialized.current = true;
    }

    const sph = sphericalRef.current;

    if (hasCameraGestureInput && (Math.abs(rotationVelocity.x) > 0.0001 || Math.abs(rotationVelocity.y) > 0.0001)) {
      const sensitivity = 5.0 * (controlRef.current.interactionSettings?.rotationSpeed ?? 1.0);
      const frameScale = Math.min(delta * 60, 2);
      sph.theta -= rotationVelocity.y * sensitivity * frameScale;
      sph.phi -= rotationVelocity.x * sensitivity * frameScale;
      sph.phi = Math.max(0.1, Math.min(Math.PI - 0.1, sph.phi));
      sph.makeSafe();
    }

    if (hasCameraGestureInput && zoomSpeed !== 0) {
      const frameScale = Math.min(delta * 60, 2);
      sph.radius = Math.max(0.05, sph.radius - zoomSpeed * 0.15 * frameScale * (controlRef.current.interactionSettings?.zoomSpeed ?? 1.0));
    }

    if (hasCameraGestureInput) {
      camera.position.setFromSpherical(sph).add(orbitTarget);
      camera.lookAt(orbitTarget);
    } else {
      sphericalRef.current.setFromVector3(offset);
    }
    wasCameraGestureActiveRef.current = hasCameraGestureInput;

    const disassembly = controlRef.current.agentDisassembly;
    const strength = disassembly?.enabled ? Math.max(0, disassembly.strength) : 0;
    const moveMesh = (
      ref: React.RefObject<THREE.Mesh>,
      original: THREE.Vector3,
      offset: THREE.Vector3,
    ) => {
      if (!ref.current) return;
      const smooth = frameDamping(delta, strength > 0 ? 4.8 : 5.8);
      ref.current.position.lerp(original.addScaledVector(offset, strength), smooth);
    };

    moveMesh(bedrockRef, scratch.bedrockTarget.set(0, -0.6, 0), scratch.offset.set(-1.0, -0.35, -0.95));
    moveMesh(soilRef, scratch.soilTarget.set(0, -0.2, 0), scratch.offset.set(1.0, -0.05, -0.75));
    moveMesh(surfaceRef, scratch.surfaceTarget.set(0, 0, 0), scratch.offset.set(-0.35, 0.3, 0.9));
    moveMesh(waterRef, scratch.waterTarget.set(0, -0.05, 0), scratch.offset.set(1.1, 0.18, 0.9));
  }, -1);

  return (
    <group ref={groupRef} position={[0, 0.5, 0]}>
      {/* 1. 地质剖面底座 (Bedrock & Soil) */}
      <mesh ref={bedrockRef} position={[0, -0.6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <boxGeometry args={[4, 4, 0.6]} />
        <meshStandardMaterial color="#4a3b32" roughness={0.9} />
      </mesh>
      <mesh ref={soilRef} position={[0, -0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <boxGeometry args={[4, 4, 0.2]} />
        <meshStandardMaterial color="#7a5230" roughness={1} />
        {showLabels && (
          <Html distanceFactor={12} position={[-2.1, 0, 0]}>
            <div className="bg-black/80 px-2 py-1 rounded text-white text-[8px] border border-orange-900/50">剖面: 土壤与沉积岩层</div>
          </Html>
        )}
      </mesh>

      {/* 2. 真实地表 (Surface & Contour Lines) */}
      <mesh ref={surfaceRef} geometry={terrainGeo} position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow castShadow material={terrainMaterial}>
        {/* 等高线数值标注 (Elevation Numbers) */}
        {showLabels && (
          <group>
            {/* 高原顶部 (1.2 height ~ 1200m) */}
            <Html position={[-1.0, -1.0, 1.2]} distanceFactor={6} transform>
              <div className="text-white/90 text-[5px] font-mono font-bold tracking-widest" style={{ textShadow: '1px 1px 2px black' }}>1200m</div>
            </Html>
            {/* 高原边缘跌落 */}
            <Html position={[-0.8, -0.6, 1.05]} distanceFactor={6} transform>
              <div className="text-white/80 text-[4px] font-mono font-bold tracking-widest" style={{ textShadow: '1px 1px 2px black' }}>1050m</div>
            </Html>
            <Html position={[-0.6, -0.4, 0.75]} distanceFactor={6} transform>
              <div className="text-white/80 text-[4px] font-mono font-bold tracking-widest" style={{ textShadow: '1px 1px 2px black' }}>750m</div>
            </Html>
            {/* 山脉 */}
            <Html position={[-1.2, 1.2, 1.05]} distanceFactor={6} transform>
              <div className="text-white/90 text-[5px] font-mono font-bold tracking-widest" style={{ textShadow: '1px 1px 2px black' }}>1050m</div>
            </Html>
            <Html position={[-0.8, 1.0, 0.6]} distanceFactor={6} transform>
              <div className="text-white/80 text-[4px] font-mono font-bold tracking-widest" style={{ textShadow: '1px 1px 2px black' }}>600m</div>
            </Html>
            {/* 盆地 */}
            <Html position={[0.5, 1.2, -0.3]} distanceFactor={6} transform>
              <div className="text-white/90 text-[5px] font-mono font-bold tracking-widest" style={{ textShadow: '1px 1px 2px black' }}>-300m</div>
            </Html>
            <Html position={[0.2, 0.8, 0.0]} distanceFactor={6} transform>
              <div className="text-white/80 text-[4px] font-mono font-bold tracking-widest" style={{ textShadow: '1px 1px 2px black' }}>0m</div>
            </Html>
            {/* 丘陵 */}
            <Html position={[0.5, -1.0, 0.45]} distanceFactor={6} transform>
              <div className="text-white/80 text-[4px] font-mono font-bold tracking-widest" style={{ textShadow: '1px 1px 2px black' }}>450m</div>
            </Html>
            {/* 平原 */}
            <Html position={[1.5, -0.5, 0.15]} distanceFactor={6} transform>
              <div className="text-white/80 text-[4px] font-mono font-bold tracking-widest" style={{ textShadow: '1px 1px 2px black' }}>150m</div>
            </Html>
          </group>
        )}
      </mesh>

      {/* 4. 水体 (Water & Ocean) */}
      <mesh ref={waterRef} position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4, 4]} />
        <meshStandardMaterial color="#00bcd4" transparent opacity={0.7} roughness={0.1} />
      </mesh>

      {/* =========================================================
          教学信息标签栏 (UI Labels for Educational Features) 
          外围悬浮，不遮挡主体地形，使用线条连接至目标点
          ========================================================= */}
          
      {/* --- 地形地貌 --- */}
      <EduLabel 
        targetPosition={[-1.2, 1.2, -1.2]} 
        labelPosition={[-2.4, 2.2, -2.4]} 
        title="⛰️ 山地 (Mountain)" 
        subtitle="海拔>500m，坡度陡峭，脉络分明" 
        colorClass="text-emerald-400" borderClass="border-emerald-500/50" shadowClass="shadow-[0_0_15px_#10b981]" lineColor="#10b981" visible={showLabels}
      />
      
      <EduLabel 
        targetPosition={[-1.0, 1.5, 1.0]} 
        labelPosition={[-2.4, 2.4, 2.4]} 
        title="🏔️ 高原 (Plateau)" 
        subtitle="海拔高(>500m)，顶面平坦宽广，边缘陡峻" 
        colorClass="text-amber-400" borderClass="border-amber-500/50" shadowClass="shadow-[0_0_15px_#f59e0b]" lineColor="#f59e0b" visible={showLabels}
      />
      
      <EduLabel 
        targetPosition={[0.5, -0.1, -1.2]} 
        labelPosition={[0.5, 1.0, -2.6]} 
        title="🥣 盆地 (Basin)" 
        subtitle="四周高(山地/高原)，中间低平" 
        colorClass="text-lime-400" borderClass="border-lime-500/50" shadowClass="shadow-[0_0_15px_#84cc16]" lineColor="#84cc16" visible={showLabels}
      />
      
      <EduLabel 
        targetPosition={[0.5, 0.4, 1.0]} 
        labelPosition={[0.5, 1.5, 2.6]} 
        title="丘陵 (Hills)" 
        subtitle="海拔<500m，起伏平缓，连绵不断" 
        colorClass="text-green-300" borderClass="border-green-500/50" shadowClass="shadow-[0_0_15px_#22c55e]" lineColor="#22c55e" visible={showLabels}
      />
      
      <EduLabel 
        targetPosition={[1.5, 0.1, -0.5]} 
        labelPosition={[2.6, 1.2, -1.5]} 
        title="平原 (Plain)" 
        subtitle="海拔<200m，地势平坦广阔" 
        colorClass="text-green-500" borderClass="border-green-600/50" shadowClass="shadow-[0_0_15px_#16a34a]" lineColor="#16a34a" visible={showLabels}
      />

      {/* --- 河流地貌 --- */}
      <EduLabel 
        targetPosition={[-1.6, 0.6, 0.0]} 
        labelPosition={[-2.8, 1.8, 0.0]} 
        title="💧 河源 (Source)" 
        subtitle="V型谷，下蚀作用强烈，水流急" 
        colorClass="text-cyan-400" borderClass="border-cyan-500/50" shadowClass="shadow-[0_0_15px_#06b6d4]" lineColor="#06b6d4" visible={showLabels}
      />
      
      <EduLabel 
        targetPosition={[-0.2, 0.2, 0.0]} 
        labelPosition={[-0.2, 1.6, -1.8]} 
        title="🏜️ 冲积扇 (Alluvial Fan)" 
        subtitle="出山口流速锐减，泥沙呈扇状沉积" 
        colorClass="text-yellow-400" borderClass="border-yellow-500/50" shadowClass="shadow-[0_0_15px_#eab308]" lineColor="#eab308" visible={showLabels}
      />
      
      <EduLabel 
        targetPosition={[0.8, 0.0, 0.2]} 
        labelPosition={[1.2, 1.4, 2.2]} 
        title="〰️ 中下游曲流 (Meander)" 
        subtitle="侧蚀作用增强，河道弯曲，沉积显著" 
        colorClass="text-blue-400" borderClass="border-blue-500/50" shadowClass="shadow-[0_0_15px_#60a5fa]" lineColor="#60a5fa" visible={showLabels}
      />
      
      <EduLabel 
        targetPosition={[1.4, 0.05, 0.3]} 
        labelPosition={[2.6, 1.5, 1.5]} 
        title="🌊 三角洲 (Delta)" 
        subtitle="入海口流速极慢，大量泥沙堆积" 
        colorClass="text-indigo-400" borderClass="border-indigo-500/50" shadowClass="shadow-[0_0_15px_#6366f1]" lineColor="#6366f1" visible={showLabels}
      />

    </group>
  );
};
