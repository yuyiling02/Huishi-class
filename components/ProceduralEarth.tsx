import React, { useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { ControlRefs } from '../types';

interface ProceduralEarthProps {
  controlRef: React.MutableRefObject<ControlRefs>;
  showLabels?: boolean;
  cameraTarget?: [number, number, number];
}

// 教学标签组件：悬浮显示各图层信息
const LayerLabel = ({ labelPos, title, subtitle, dotColor, visible }: {
  labelPos: [number, number, number];
  title: string;
  subtitle: React.ReactNode;
  dotColor: string;
  visible: boolean;
}) => {
  if (!visible) return null;
  return (
    <group>
      {/* 悬浮信息面板 */}
      <Html distanceFactor={10} position={labelPos} center>
        <div className="bg-white/95 backdrop-blur-md px-3 py-2 rounded-xl text-slate-800 text-[10px] whitespace-nowrap border shadow-lg font-bold" style={{ borderColor: dotColor }}>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: dotColor }}></div>
            <span style={{ color: dotColor }} className="text-[11px] font-extrabold">{title}</span>
          </div>
          <div className="font-medium text-slate-500 leading-relaxed text-[9px]">
            {subtitle}
          </div>
        </div>
      </Html>
    </group>
  );
};

export const ProceduralEarthLayers: React.FC<ProceduralEarthProps> = ({ controlRef, showLabels = true, cameraTarget = [0, 1.0, 0] }) => {
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const orbitTarget = React.useMemo(() => new THREE.Vector3(cameraTarget[0], cameraTarget[1], cameraTarget[2]), [cameraTarget]);
  
  // Persistent spherical coords for smooth camera orbit
  const sphericalRef = useRef<THREE.Spherical | null>(null);
  const cameraInitialized = useRef(false);
  const wasCameraGestureActiveRef = useRef(false);
  
  // Load textures using TextureLoader
  const colorMap = useLoader(THREE.TextureLoader, '/textures/earth_atmos_2048.jpg');
  const normalMap = useLoader(THREE.TextureLoader, '/textures/earth_normal_2048.jpg');
  const specularMap = useLoader(THREE.TextureLoader, '/textures/earth_specular_2048.jpg');

  useFrame((state) => {
    // 1. Slow rotation for showcase
    if (groupRef.current && controlRef.current.rotationVelocity.x === 0 && controlRef.current.rotationVelocity.y === 0) {
      groupRef.current.rotation.y += 0.002;
    }

    // 2. Camera Controls
    const { rotationVelocity, zoomSpeed } = controlRef.current;
    
    const hasCameraGestureInput =
      Math.abs(rotationVelocity.x) > 0.0001 ||
      Math.abs(rotationVelocity.y) > 0.0001 ||
      zoomSpeed !== 0;

    const offset = new THREE.Vector3().subVectors(camera.position, orbitTarget);
    if (!cameraInitialized.current || !wasCameraGestureActiveRef.current) {
      sphericalRef.current = new THREE.Spherical().setFromVector3(offset);
      cameraInitialized.current = true;
    }

    const sph = sphericalRef.current!;

    if (hasCameraGestureInput && (Math.abs(rotationVelocity.x) > 0.0001 || Math.abs(rotationVelocity.y) > 0.0001)) {
      const sensitivity = 5.0;
      sph.theta -= rotationVelocity.y * sensitivity;
      sph.phi -= rotationVelocity.x * sensitivity;
      sph.phi = Math.max(0.1, Math.min(Math.PI - 0.1, sph.phi));
      sph.makeSafe();
    }

    if (hasCameraGestureInput && zoomSpeed !== 0) {
      sph.radius = Math.max(0.05, sph.radius - zoomSpeed * 0.15);
    }

    if (hasCameraGestureInput) {
      camera.position.setFromSpherical(sph).add(orbitTarget);
      camera.lookAt(orbitTarget);
    } else {
      sphericalRef.current.setFromVector3(offset);
    }
    wasCameraGestureActiveRef.current = hasCameraGestureInput;
  });

  const phiStart = 0;
  const phiLength = Math.PI * 1.5;

  const innerCoreRadius = 0.6;
  const outerCoreRadius = 1.2;
  const mantleRadius = 2.2;
  const crustRadius = 2.3;

  return (
    <group ref={groupRef} scale={0.8} position={[0, 1.0, 0]}>
      {/* ===== 地球各图层 ===== */}

      {/* Inner Core - 内核 */}
      <mesh>
        <sphereGeometry args={[innerCoreRadius, 32, 32, phiStart, phiLength]} />
        <meshStandardMaterial color="#fffbe6" emissive="#ffea00" emissiveIntensity={2} roughness={0.2} side={THREE.DoubleSide} />
      </mesh>

      {/* Outer Core - 外核 */}
      <mesh>
        <sphereGeometry args={[outerCoreRadius, 64, 64, phiStart, phiLength]} />
        <meshStandardMaterial color="#ff5500" emissive="#cc3300" emissiveIntensity={0.8} roughness={0.1} side={THREE.DoubleSide} />
      </mesh>

      {/* Mantle - 地幔 */}
      <mesh>
        <sphereGeometry args={[mantleRadius, 64, 64, phiStart, phiLength]} />
        <meshStandardMaterial color="#8b0000" emissive="#440000" emissiveIntensity={0.6} roughness={0.8} side={THREE.DoubleSide} />
      </mesh>

      {/* Crust - 地壳 */}
      <mesh>
        <sphereGeometry args={[crustRadius, 64, 64, phiStart, phiLength]} />
        <meshStandardMaterial 
          map={colorMap} 
          normalMap={normalMap} 
          roughnessMap={specularMap} 
          roughness={0.7}
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* Atmosphere Glow - 大气层 */}
      <mesh>
        <sphereGeometry args={[crustRadius + 0.05, 64, 64]} />
        <meshStandardMaterial color="#4488ff" transparent opacity={0.15} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* ===== 教学信息标签（标签悬浮在外围） ===== */}

      {/* 地壳标签 */}
      <LayerLabel
        labelPos={[3.2, 2.5, 0]}
        title="🌍 地壳 (Crust)"
        subtitle={<>厚度: 5-70km<br/>状态: 固态岩石圈<br/>特征: 生命栖息地</>}
        dotColor="#4488ff"
        visible={showLabels}
      />

      {/* 地幔标签 */}
      <LayerLabel
        labelPos={[3.2, 1.0, 0]}
        title="🔥 地幔 (Mantle)"
        subtitle={<>厚度: ~2900km<br/>状态: 塑性固态<br/>特征: 岩浆发源地，对流活跃</>}
        dotColor="#cc3333"
        visible={showLabels}
      />

      {/* 外核标签 */}
      <LayerLabel
        labelPos={[3.2, -0.5, 0]}
        title="🌊 外核 (Outer Core)"
        subtitle={<>厚度: ~2200km<br/>状态: 液态金属<br/>特征: 产生地球磁场</>}
        dotColor="#ff6600"
        visible={showLabels}
      />

      {/* 内核标签 */}
      <LayerLabel
        labelPos={[3.2, -2.0, 0]}
        title="💛 内核 (Inner Core)"
        subtitle={<>温度: ~5400℃<br/>状态: 固态铁镍<br/>深度: 5150-6371km</>}
        dotColor="#ffcc00"
        visible={showLabels}
      />
    </group>
  );
};
