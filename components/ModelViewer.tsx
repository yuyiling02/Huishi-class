
import React, { useRef, Suspense, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Html } from '@react-three/drei';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ControlRefs, ModelType } from '../types';
import { ProceduralTerrain } from './ProceduralTerrain';

// Fix for TypeScript errors regarding R3F intrinsic elements and missing HTML elements
declare global {
  namespace JSX {
    interface IntrinsicElements {
      group: any;
      primitive: any;
      ambientLight: any;
      spotLight: any;
      pointLight: any;
      mesh: any;
      planeGeometry: any;
      meshStandardMaterial: any;
      [elemName: string]: any;
    }
  }
}

type CameraTarget = [number, number, number];

interface ModelViewerProps {
  modelUrl: string;
  modelType: ModelType;
  assetUrls?: Record<string, string>;
  controlRef: React.MutableRefObject<ControlRefs>;
}

const MODEL_BASE_Y = -0.49;
const MODEL_TARGET_SIZE = 1.5;
const EARTH_LAYERS_TARGET_SIZE = 3.8;
const EARTH_POLITICAL_TARGET_SIZE = 3.5;

type GrabbablePart = THREE.Object3D;

const vectorFromTarget = (target: CameraTarget) => new THREE.Vector3(target[0], target[1], target[2]);

const isMeshObject = (object: THREE.Object3D): object is THREE.Mesh => {
  return Boolean((object as THREE.Mesh).isMesh);
};

const hasRenderableMesh = (object: THREE.Object3D): boolean => {
  let found = false;
  object.traverse((child) => {
    if (!found && isMeshObject(child)) {
      found = true;
    }
  });
  return found;
};

const collectMeshes = (object: THREE.Object3D): THREE.Mesh[] => {
  const meshes: THREE.Mesh[] = [];
  object.traverse((child) => {
    if (isMeshObject(child)) {
      meshes.push(child);
    }
  });
  return meshes;
};

const findLayerRoots = (root: THREE.Object3D): GrabbablePart[] => {
  const explicitLayerRoots: GrabbablePart[] = [];
  root.traverse((node) => {
    if (node.userData?.teachingRole === 'earth-internal-layer' && hasRenderableMesh(node)) {
      explicitLayerRoots.push(node);
    }
  });

  if (explicitLayerRoots.length > 1) {
    const layerOrder = new Map([
      ['Crust', 0],
      ['Mantle', 1],
      ['OuterCore', 2],
      ['InnerCore', 3],
    ]);
    return explicitLayerRoots.sort((a, b) => (layerOrder.get(a.name) ?? 99) - (layerOrder.get(b.name) ?? 99));
  }

  const walk = (node: THREE.Object3D): GrabbablePart[] => {
    const childrenWithMeshes = node.children.filter(hasRenderableMesh);

    if (childrenWithMeshes.length > 1) {
      return childrenWithMeshes;
    }

    if (childrenWithMeshes.length === 1) {
      return walk(childrenWithMeshes[0]);
    }

    return collectMeshes(node);
  };

  const layerRoots = walk(root);
  if (layerRoots.length > 1) {
    return layerRoots;
  }

  const meshParts = collectMeshes(root);
  return meshParts.length > 1 ? meshParts : [];
};

const isDescendantOf = (object: THREE.Object3D, ancestor: THREE.Object3D): boolean => {
  let current: THREE.Object3D | null = object;

  while (current) {
    if (current === ancestor) {
      return true;
    }
    current = current.parent;
  }

  return false;
};

const configureModel = (root: THREE.Object3D, targetSize = MODEL_TARGET_SIZE) => {
  root.scale.set(1, 1, 1);
  root.position.set(0, 0, 0);

  let box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  if (maxDim > 0 && Number.isFinite(maxDim)) {
    root.scale.setScalar(targetSize / maxDim);
  }

  box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.set(-center.x, MODEL_BASE_Y - box.min.y, -center.z);

  root.traverse((child) => {
    if (isMeshObject(child)) {
      child.castShadow = true;
      child.receiveShadow = true;

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material: any) => {
        if (material) {
          material.envMapIntensity = 1.2;
          material.side = THREE.DoubleSide;
          // Ensure solid rendering: force depth writes and disable transparency
          // for base earth surfaces so the globe appears solid, not see-through.
          material.depthWrite = true;
          if (material.transparent && material.opacity !== undefined && material.opacity < 0.9) {
            // Keep atmosphere glow transparent, but boost its base color for visibility
            if (material.opacity < 0.5) {
              material.opacity = Math.max(material.opacity, 0.25);
            }
          }
        }
      });
    }
  });
};

const setPartHighlight = (part: GrabbablePart, color: number) => {
  part.traverse((child) => {
    if (!isMeshObject(child) || !child.material) return;

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material: any) => {
      if (material.emissive) {
        material.emissive.setHex(color);
      }
    });
  });
};

const getAssetKey = (url: string): string => {
  const cleanUrl = url.split(/[?#]/)[0];
  const decodedUrl = decodeURIComponent(cleanUrl);
  return decodedUrl.substring(decodedUrl.lastIndexOf('/') + 1).toLowerCase();
};

const getOriginalPosition = (part: GrabbablePart): THREE.Vector3 => {
  const original = part.userData.originalPosition;
  return original?.isVector3 ? original.clone() : part.position.clone();
};

const getManualTargetPosition = (part: GrabbablePart): THREE.Vector3 | null => {
  const manualTarget = part.userData.manualTargetPosition;
  return manualTarget?.isVector3 ? manualTarget.clone() : null;
};

const calculateDisassemblyTargets = (
  parts: GrabbablePart[],
  strength: number,
  spacing: number,
): Map<string, THREE.Vector3> => {
  const targets = new Map<string, THREE.Vector3>();
  if (parts.length === 0) return targets;

  const rootBox = new THREE.Box3();
  parts.forEach((part) => rootBox.expandByObject(part));
  const rootCenter = rootBox.getCenter(new THREE.Vector3());
  const placed: THREE.Vector3[] = [];
  const spreadDistance = spacing * (1.2 + strength * 2.2);

  parts.forEach((part, index) => {
    const original = getOriginalPosition(part);
    const partBox = new THREE.Box3().setFromObject(part);
    const partCenter = partBox.getCenter(new THREE.Vector3());
    const angle = (index / Math.max(1, parts.length)) * Math.PI * 2;
    const fallbackDirection = new THREE.Vector3(
      Math.cos(angle),
      ((index % 3) - 1) * 0.32,
      Math.sin(angle),
    ).normalize();

    const direction = partCenter.sub(rootCenter);
    if (direction.lengthSq() < 0.0001) {
      direction.copy(fallbackDirection);
    } else {
      direction.normalize();
      direction.addScaledVector(fallbackDirection, 0.35).normalize();
    }

    const target = original.clone().addScaledVector(direction, spreadDistance + index * spacing * 0.08);

    let guard = 0;
    while (placed.some((point) => point.distanceTo(target) < spacing) && guard < 10) {
      const adjustAngle = angle + guard * 0.77;
      target.add(new THREE.Vector3(Math.cos(adjustAngle), 0.18, Math.sin(adjustAngle)).multiplyScalar(spacing * 0.45));
      guard++;
    }

    placed.push(target.clone());
    targets.set(part.uuid, target);
  });

  return targets;
};

const createLocalLoadingManager = (assetUrls?: Record<string, string>) => {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((requestedUrl) => {
    if (!assetUrls || requestedUrl.startsWith('blob:') || requestedUrl.startsWith('data:')) {
      return requestedUrl;
    }

    const directUrl = assetUrls[requestedUrl] || assetUrls[requestedUrl.toLowerCase()];
    if (directUrl) return directUrl;

    const assetKey = getAssetKey(requestedUrl);
    return assetUrls[assetKey] || requestedUrl;
  });
  return manager;
};

const earthLayerMeta = [
  { key: 'crust', title: '地壳 Crust', detail: '5-70 km · 固态岩石圈', color: '#2f8f5b' },
  { key: 'mantle', title: '地幔 Mantle', detail: '~2900 km · 高温固态', color: '#e85a24' },
  { key: 'outercore', title: '外核 Outer Core', detail: '~2200 km · 液态金属', color: '#f5a623' },
  { key: 'innercore', title: '内核 Inner Core', detail: '~1220 km · 固态铁镍', color: '#f6d84a' },
] as const;

const getEarthLayerMeta = (part: GrabbablePart, index: number) => {
  const normalizedName = part.name.toLowerCase().replace(/[^a-z]/g, '');
  return earthLayerMeta.find((meta) => normalizedName.includes(meta.key)) || earthLayerMeta[index % earthLayerMeta.length];
};

const EarthLayerFollowLabels: React.FC<{
  parts: GrabbablePart[];
  rootGroupRef: React.RefObject<THREE.Group>;
  controlRef: React.MutableRefObject<ControlRefs>;
  enabled: boolean;
}> = ({ parts, rootGroupRef, controlRef, enabled }) => {
  const labelRefs = useRef<THREE.Group[]>([]);

  useFrame(() => {
    const shouldShow = enabled && Boolean(controlRef.current.agentDisassembly?.enabled);
    labelRefs.current.forEach((label) => {
      if (label) label.visible = shouldShow;
    });

    if (!shouldShow || !rootGroupRef.current) return;

    parts.slice(0, 4).forEach((part, index) => {
      const label = labelRefs.current[index];
      if (!label) return;

      const box = new THREE.Box3().setFromObject(part);
      const worldPosition = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      worldPosition.y += Math.max(0.35, size.y * 0.58);
      const localPosition = rootGroupRef.current!.worldToLocal(worldPosition);
      label.position.lerp(localPosition, 0.18);
      label.visible = true;
    });
  });

  if (!enabled || parts.length === 0) return null;

  return (
    <>
      {parts.slice(0, 4).map((part, index) => {
        const meta = getEarthLayerMeta(part, index);
        return (
          <group
            key={part.uuid}
            visible={false}
            ref={(node: THREE.Group | null) => {
              if (node) labelRefs.current[index] = node;
            }}
          >
            <Html distanceFactor={10} center>
              <div className="bg-white/95 backdrop-blur-md px-3 py-2 rounded-xl text-slate-800 text-[10px] whitespace-nowrap border shadow-lg font-bold" style={{ borderColor: meta.color }}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
                  <span style={{ color: meta.color }} className="text-[11px] font-extrabold">{meta.title}</span>
                </div>
                <div className="font-medium text-slate-500 leading-relaxed text-[9px]">{meta.detail}</div>
              </div>
            </Html>
          </group>
        );
      })}
    </>
  );
};

const LocalEnvironment: React.FC = () => {
  const { gl, scene } = useThree();

  useEffect(() => {
    const pmremGenerator = new THREE.PMREMGenerator(gl);
    const environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    const previousEnvironment = scene.environment;

    scene.environment = environment;

    return () => {
      scene.environment = previousEnvironment;
      environment.dispose();
      pmremGenerator.dispose();
    };
  }, [gl, scene]);

  return null;
};

// Unified model component. FBX / GLB / GLTF all use the same layer-based disassembly path.
const LayeredModel: React.FC<{ url: string; modelType: ModelType; assetUrls?: Record<string, string>; controlRef: React.MutableRefObject<ControlRefs>; cameraTarget: CameraTarget; showEarthLabels?: boolean }> = ({ url, modelType, assetUrls, controlRef, cameraTarget, showEarthLabels = false }) => {
  const [modelScene, setModelScene] = useState<THREE.Object3D | null>(null);
  const [modelParts, setModelParts] = useState<GrabbablePart[]>([]);
  const groupRef = useRef<THREE.Group>(null);
  const { camera, raycaster, scene } = useThree();
  const orbitTarget = useMemo(() => vectorFromTarget(cameraTarget), [cameraTarget]);

  // ========== 一比一复刻第一版变量 ==========
  const isGrabbingRef = useRef(false);
  const grabbedPartRef = useRef<GrabbablePart | null>(null);
  const grabOffsetRef = useRef(new THREE.Vector3());
  const dragPlaneRef = useRef(new THREE.Plane());

  // 手部状态 (一比一复刻第一版 handsState)
  const interactionHandStateRef = useRef<{
    exists: boolean;
    isFist: boolean;
    isOpen: boolean;
    isPinching: boolean;
    ndc: THREE.Vector2 | null;
  }>({
    exists: false,
    isFist: false,
    isOpen: false,
    isPinching: false,
    ndc: null
  });

  // 虚拟平面 (用于手部3D投影)
  const handPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));

  // Persistent spherical coords for smooth camera orbit (avoids zoom+rotation conflict)
  const sphericalRef = useRef<THREE.Spherical | null>(null);
  const cameraInitialized = useRef(false);
  const wasCameraGestureActiveRef = useRef(false);
  const disassemblyTargetsRef = useRef<Map<string, THREE.Vector3>>(new Map());
  const lastDisassemblyActionRef = useRef(-1);

  // Load model and detect whether the file contains detachable internal layers.
  useEffect(() => {
    let disposed = false;
    let loadedRoot: THREE.Object3D | null = null;
    let loadedParts: GrabbablePart[] = [];
    let dracoLoader: DRACOLoader | null = null;
    const loadingManager = createLocalLoadingManager(assetUrls);

    setModelScene(null);
    setModelParts([]);
    grabbedPartRef.current = null;
    isGrabbingRef.current = false;
    cameraInitialized.current = false;
    wasCameraGestureActiveRef.current = false;
    disassemblyTargetsRef.current.clear();
    lastDisassemblyActionRef.current = -1;

    const handleLoadedModel = (root: THREE.Object3D) => {
      if (disposed) return;

      const lowerUrl = url.toLowerCase();
      const isEarthLayers = lowerUrl.includes('earth-layers');
      const isEarthPolitical = lowerUrl.includes('earth-political') || lowerUrl.includes('earth_political');
      let targetSize = MODEL_TARGET_SIZE;
      if (isEarthLayers) targetSize = EARTH_LAYERS_TARGET_SIZE;
      else if (isEarthPolitical) targetSize = EARTH_POLITICAL_TARGET_SIZE;
      configureModel(root, targetSize);

      const parts = findLayerRoots(root);
      parts.forEach((part) => {
        part.userData.originalPosition = part.position.clone();
      });

      loadedRoot = root;
      loadedParts = parts;
      setModelParts(parts);
      setModelScene(root);

      const format = modelType.toUpperCase();
      const message = parts.length > 0
        ? `${format}加载完成，检测到 ${parts.length} 个可拆解层级`
        : `${format}加载完成，当前模型没有可拆解层级`;
      console.log(message);
    };

    const handleLoadError = (error: unknown) => {
      console.error('模型加载失败:', error);
    };

    if (modelType === 'fbx') {
      const loader = new FBXLoader(loadingManager);
      loader.load(url, handleLoadedModel, undefined, handleLoadError);
    } else {
      const loader = new GLTFLoader(loadingManager);
      dracoLoader = new DRACOLoader(loadingManager);
      dracoLoader.setDecoderPath('/draco/');
      dracoLoader.setDecoderConfig({ type: 'wasm' });
      loader.setDRACOLoader(dracoLoader);
      loader.load(url, (gltf) => handleLoadedModel(gltf.scene), undefined, handleLoadError);
    }

    return () => {
      disposed = true;
      dracoLoader?.dispose();
      loadedParts.forEach((part) => {
        if (part.parent === scene) {
          scene.remove(part);
        }
      });
    };
  }, [assetUrls, modelType, scene, url]);

  // 更新手部状态 (一比一复刻第一版 updateHandState)
  const updateHandState = (landmarks: { x: number; y: number; z: number }[]) => {
    const state = interactionHandStateRef.current;
    state.exists = true;

    // 更新虚拟平面
    const planeDistance = 2;
    const cameraDir = camera.getWorldDirection(new THREE.Vector3());
    const planePoint = camera.position.clone().addScaledVector(cameraDir, planeDistance);
    handPlaneRef.current.setFromNormalAndCoplanarPoint(cameraDir, planePoint);

    // 将landmarks投影到3D世界坐标
    const project3D = (lmk: { x: number; y: number; z: number }): THREE.Vector3 => {
      const ndcX = (0.5 - lmk.x) * 2;
      const ndcY = -(lmk.y - 0.5) * 2;
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      const point = new THREE.Vector3();
      raycaster.ray.intersectPlane(handPlaneRef.current, point);
      return point;
    };

    const wrist = project3D(landmarks[0]);
    const middleMCP = project3D(landmarks[9]);
    const handScale = wrist.distanceTo(middleMCP);

    // 计算指尖到腕关节的平均距离
    const tipIndices = [4, 8, 12, 16, 20];
    let totalDist = 0;
    tipIndices.forEach(i => {
      totalDist += project3D(landmarks[i]).distanceTo(wrist);
    });
    const avgDist = totalDist / 5;

    // 归一化距离 (一比一复刻第一版阈值)
    const normalizedDist = handScale > 0 ? avgDist / handScale : 0;
    state.isFist = normalizedDist < 1.2;
    state.isOpen = normalizedDist > 1.8;

    // 捏合检测 (一比一复刻第一版)
    const thumbTip = project3D(landmarks[4]);
    const indexTip = project3D(landmarks[8]);
    const pinchDist = thumbTip.distanceTo(indexTip);
    const normalizedPinchDist = handScale > 0 ? pinchDist / handScale : 1;

    // 施密特触发器 (Hysteresis)
    if (state.isPinching) {
      state.isPinching = normalizedPinchDist < 0.6; // 退出阈值
    } else {
      state.isPinching = normalizedPinchDist < 0.4; // 进入阈值
    }

    // 优先级: 握拳 > 捏合
    if (state.isFist) {
      state.isPinching = false;
    }
    // 捏合时不算张开
    if (state.isPinching) {
      state.isOpen = false;
    }

    // 计算NDC (一比一复刻平滑滤波)
    const avgX = (landmarks[4].x + landmarks[8].x) / 2;
    const avgY = (landmarks[4].y + landmarks[8].y) / 2;
    const targetNdcX = (0.5 - avgX) * 2;
    const targetNdcY = -(avgY - 0.5) * 2;

    if (!state.ndc) {
      state.ndc = new THREE.Vector2(targetNdcX, targetNdcY);
    } else {
      const alpha = 0.2;
      state.ndc.x += (targetNdcX - state.ndc.x) * alpha;
      state.ndc.y += (targetNdcY - state.ndc.y) * alpha;
    }

  };

  // 释放零件 (一比一复刻第一版 releaseGrab)
  const releaseGrab = () => {
    const part = grabbedPartRef.current;
    if (part) {
      part.userData.manualTargetPosition = part.position.clone();
      setPartHighlight(part, 0x000000);
    }

    isGrabbingRef.current = false;
    grabbedPartRef.current = null;
    console.log('Released part - display position preserved.');
  };

  useFrame((state) => {
    if (!modelScene || !groupRef.current) return;

    const { rotationVelocity, zoomSpeed, handLandmarks } = controlRef.current;

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

    // 旋转 — modify angles on persistent spherical
    if (hasCameraGestureInput && (Math.abs(rotationVelocity.x) > 0.0001 || Math.abs(rotationVelocity.y) > 0.0001)) {
      const sensitivity = 5.0 * (controlRef.current.interactionSettings?.rotationSpeed ?? 1.0);
      sph.theta -= rotationVelocity.y * sensitivity;
      sph.phi -= rotationVelocity.x * sensitivity;
      sph.phi = Math.max(0.1, Math.min(Math.PI - 0.1, sph.phi));
      sph.makeSafe();
    }

    // 缩放 — modify radius on persistent spherical (no conflict with rotation)
    if (hasCameraGestureInput && zoomSpeed !== 0) {
      sph.radius = Math.max(0.05, sph.radius - zoomSpeed * 0.15 * (controlRef.current.interactionSettings?.zoomSpeed ?? 1.0));
    }

    // Apply spherical to camera
    if (hasCameraGestureInput) {
      camera.position.setFromSpherical(sph).add(orbitTarget);
      camera.lookAt(orbitTarget);
    } else {
      sphericalRef.current.setFromVector3(offset);
    }
    wasCameraGestureActiveRef.current = hasCameraGestureInput;

    const disassembly = controlRef.current.agentDisassembly;
    if (disassembly && disassembly.actionId !== lastDisassemblyActionRef.current) {
      modelParts.forEach((part) => {
        delete part.userData.manualTargetPosition;
      });
      disassemblyTargetsRef.current = disassembly.enabled
        ? calculateDisassemblyTargets(modelParts, disassembly.strength, disassembly.spacing)
        : new Map();
      lastDisassemblyActionRef.current = disassembly.actionId;
    }

    if (modelParts.length > 0 && !isGrabbingRef.current) {
      modelParts.forEach((part) => {
        if (part === grabbedPartRef.current) return;
        const manualTarget = getManualTargetPosition(part);
        const target = manualTarget ?? (disassembly?.enabled
          ? disassemblyTargetsRef.current.get(part.uuid) || getOriginalPosition(part)
          : getOriginalPosition(part));
        part.position.lerp(target, disassembly?.enabled ? 0.075 : 0.09);
      });
    }

    // ========== 一比一复刻第一版手部交互 ==========
    const rightLandmarks = handLandmarks?.right;
    const handState = interactionHandStateRef.current;

    if (rightLandmarks && rightLandmarks.length >= 21) {
      updateHandState(rightLandmarks);

      // 抓取逻辑 (一比一复刻 executeInteractions)
      if (handState.isPinching && !isGrabbingRef.current && handState.ndc && modelParts.length > 0) {
        raycaster.setFromCamera(handState.ndc, camera);
        const intersects = raycaster.intersectObjects(modelParts, true);

        if (intersects.length > 0) {
          const hitPart = modelParts.find((part) => isDescendantOf(intersects[0].object, part));
          if (!hitPart) return;

          isGrabbingRef.current = true;
          grabbedPartRef.current = hitPart;

          // 获取世界坐标
          const worldPos = new THREE.Vector3();
          const worldQuat = new THREE.Quaternion();
          const worldScale = new THREE.Vector3();
          hitPart.getWorldPosition(worldPos);
          hitPart.getWorldQuaternion(worldQuat);
          hitPart.getWorldScale(worldScale);

          // 移到场景根节点
          if (hitPart.parent) {
            hitPart.parent.remove(hitPart);
          }
          scene.add(hitPart);

          hitPart.position.copy(worldPos);
          hitPart.quaternion.copy(worldQuat);
          hitPart.scale.copy(worldScale);

          // 高亮
          setPartHighlight(hitPart, 0x333333);

          // 设置拖拽平面
          dragPlaneRef.current.setFromNormalAndCoplanarPoint(
            camera.getWorldDirection(new THREE.Vector3()),
            worldPos
          );

          // 计算偏移
          const intersectPoint = new THREE.Vector3();
          raycaster.ray.intersectPlane(dragPlaneRef.current, intersectPoint);
          grabOffsetRef.current.copy(worldPos).sub(intersectPoint);
          console.log('✓ 抓取零件');
        }
      } else if (!handState.isPinching && isGrabbingRef.current) {
        releaseGrab();
      }

      // 拖拽
      if (isGrabbingRef.current && grabbedPartRef.current && handState.ndc) {
        raycaster.setFromCamera(handState.ndc, camera);
        const targetPoint = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(dragPlaneRef.current, targetPoint)) {
          grabbedPartRef.current.position.copy(targetPoint).add(grabOffsetRef.current);
        }
      }
    } else {
      // 手部丢失
      handState.exists = false;
      if (isGrabbingRef.current) {
        releaseGrab();
      }
    }

    // 待机动画
    if (rotationVelocity.x === 0 && rotationVelocity.y === 0 && !isGrabbingRef.current) {
      groupRef.current.rotation.y += Math.sin(state.clock.elapsedTime * 0.3) * 0.001;
    }
  });

  if (!modelScene) {
    return (
      <group>
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[0.5, 16, 16]} />
          <meshStandardMaterial color="#86e3ce" wireframe />
        </mesh>
      </group>
    );
  }

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <primitive object={modelScene} />
      <EarthLayerFollowLabels parts={modelParts} rootGroupRef={groupRef} controlRef={controlRef} enabled={showEarthLabels} />
    </group>
  );
};

/* ── Workbench — clean minimalist work surface ── */
const Workbench: React.FC = () => {
  return (
    <group position={[0, 0, 0]}>
      {/* Table top */}
      <mesh position={[0, 0, 0]} receiveShadow castShadow>
        <boxGeometry args={[4, 0.06, 3]} />
        <meshStandardMaterial
          color="#f5f0eb"
          roughness={0.55}
          metalness={0.0}
          envMapIntensity={0.3}
        />
      </mesh>
      {/* Table legs — slim round */}
      {([[-1.7, -0.25, -1.2], [1.7, -0.25, -1.2], [-1.7, -0.25, 1.2], [1.7, -0.25, 1.2]] as [number, number, number][]).map((pos, i) => (
        <mesh key={i} position={pos} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 0.5, 16]} />
          <meshStandardMaterial color="#e8e4e0" roughness={0.6} metalness={0.0} />
        </mesh>
      ))}
    </group>
  );
};

const EarthLayerLabels: React.FC<{ visible: boolean }> = ({ visible }) => {
  if (!visible) return null;

  const labels = [
    { title: '地壳 Crust', detail: '5-70 km · 固态岩石圈', color: '#2f8f5b', position: [2.95, 2.55, 0] },
    { title: '地幔 Mantle', detail: '~2900 km · 高温固态', color: '#e85a24', position: [3.05, 1.55, 0] },
    { title: '外核 Outer Core', detail: '~2200 km · 液态金属', color: '#f5a623', position: [3.05, 0.55, 0] },
    { title: '内核 Inner Core', detail: '~1220 km · 固态铁镍', color: '#f6d84a', position: [2.95, -0.45, 0] },
  ] as const;

  return (
    <group position={[0, 0.2, 0]}>
      {labels.map((label) => (
        <Html key={label.title} distanceFactor={10} position={label.position as unknown as [number, number, number]} center>
          <div className="bg-white/95 backdrop-blur-md px-3 py-2 rounded-xl text-slate-800 text-[10px] whitespace-nowrap border shadow-lg font-bold" style={{ borderColor: label.color }}>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: label.color }} />
              <span style={{ color: label.color }} className="text-[11px] font-extrabold">{label.title}</span>
            </div>
            <div className="font-medium text-slate-500 leading-relaxed text-[9px]">{label.detail}</div>
          </div>
        </Html>
      ))}
    </group>
  );
};

/* ── Floor — soft neutral ground plane with grid texture ── */
const GridFloor: React.FC = () => {
  const gridTexture = useMemo(() => {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
    ctx.lineWidth = 1;
    const step = size / 8;
    for (let i = 0; i <= 8; i++) {
      const p = i * step;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    return tex;
  }, []);

  return (
    <mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[24, 24]} />
      <meshStandardMaterial
        map={gridTexture}
        roughness={0.85}
        metalness={0.0}
        color="#ffffff"
        transparent
        opacity={0.42}
      />
    </mesh>
  );
};

// 手部骨架连接定义 (从第一版移植)
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],   // 拇指
  [0, 5], [5, 6], [6, 7], [7, 8],   // 食指
  [0, 9], [9, 10], [10, 11], [11, 12], // 中指
  [0, 13], [13, 14], [14, 15], [15, 16], // 无名指
  [0, 17], [17, 18], [18, 19], [19, 20], // 小指
  [5, 9], [9, 13], [13, 17]         // 掌心连接
];

// 3D虚拟手组件 (从第一版移植)
const VirtualHand: React.FC<{ controlRef: React.MutableRefObject<ControlRefs> }> = ({ controlRef }) => {
  const { camera } = useThree();

  // 为每只手创建21个关节点引用
  const leftJointsRef = useRef<THREE.Mesh[]>([]);
  const rightJointsRef = useRef<THREE.Mesh[]>([]);
  const leftLinesRef = useRef<THREE.Line[]>([]);
  const rightLinesRef = useRef<THREE.Line[]>([]);

  // 初始化关节点和连线
  const [initialized, setInitialized] = useState(false);
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!groupRef.current) return;

    // 清除旧的对象
    while (groupRef.current.children.length > 0) {
      groupRef.current.remove(groupRef.current.children[0]);
    }

    // 创建关节点材质
    const leftMaterial = new THREE.MeshBasicMaterial({ color: 0xff8a5b, transparent: true, opacity: 0.92 });
    const rightMaterial = new THREE.MeshBasicMaterial({ color: 0x2dd4ff, transparent: true, opacity: 0.92 });
    const thumbMaterial = new THREE.MeshBasicMaterial({ color: 0xff4d5a, transparent: true, opacity: 0.98 });
    const indexMaterial = new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.98 });

    const jointGeometry = new THREE.SphereGeometry(0.018, 8, 8);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x2dd4ff, transparent: true, opacity: 0.82 });
    const leftLineMaterial = new THREE.LineBasicMaterial({ color: 0xff8a5b, transparent: true, opacity: 0.82 });

    // 创建左手关节点
    leftJointsRef.current = [];
    for (let i = 0; i < 21; i++) {
      const material = i === 4 ? thumbMaterial : i === 8 ? indexMaterial : leftMaterial;
      const sphere = new THREE.Mesh(jointGeometry, material);
      sphere.visible = false;
      sphere.frustumCulled = false;
      groupRef.current.add(sphere);
      leftJointsRef.current.push(sphere);
    }

    // 创建右手关节点
    rightJointsRef.current = [];
    for (let i = 0; i < 21; i++) {
      const material = i === 4 ? thumbMaterial : i === 8 ? indexMaterial : rightMaterial;
      const sphere = new THREE.Mesh(jointGeometry, material);
      sphere.visible = false;
      sphere.frustumCulled = false;
      groupRef.current.add(sphere);
      rightJointsRef.current.push(sphere);
    }

    // 创建连线
    leftLinesRef.current = [];
    rightLinesRef.current = [];

    HAND_CONNECTIONS.forEach(() => {
      // 左手连线
      const leftGeo = new THREE.BufferGeometry();
      leftGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const leftLine = new THREE.Line(leftGeo, leftLineMaterial);
      leftLine.visible = false;
      groupRef.current!.add(leftLine);
      leftLinesRef.current.push(leftLine);

      // 右手连线
      const rightGeo = new THREE.BufferGeometry();
      rightGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const rightLine = new THREE.Line(rightGeo, lineMaterial);
      rightLine.visible = false;
      groupRef.current!.add(rightLine);
      rightLinesRef.current.push(rightLine);
    });

    setInitialized(true);
  }, []);

  useFrame(() => {
    if (!initialized || !groupRef.current) return;

    const { handLandmarks } = controlRef.current;

    // 更新手部可视化的辅助函数
    const updateHand = (
      landmarks: { x: number; y: number; z: number }[] | null,
      joints: THREE.Mesh[],
      lines: THREE.Line[]
    ) => {
      if (!landmarks || landmarks.length < 21) {
        // 隐藏所有关节点和连线
        joints.forEach(j => j.visible = false);
        lines.forEach(l => l.visible = false);
        return;
      }

      // 虚拟平面设置
      const planeDistance = 3;
      const cameraDir = camera.getWorldDirection(new THREE.Vector3());
      const planePoint = camera.position.clone().addScaledVector(cameraDir, planeDistance);
      const handPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(cameraDir, planePoint);

      const positions: THREE.Vector3[] = [];
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();

      landmarks.forEach((pt, i) => {
        // NDC坐标转换 (镜像X轴)
        const ndcX = (0.5 - pt.x) * 2;
        const ndcY = -(pt.y - 0.5) * 2;

        mouse.set(ndcX, ndcY);
        raycaster.setFromCamera(mouse, camera);

        const projectionPoint = new THREE.Vector3();
        raycaster.ray.intersectPlane(handPlane, projectionPoint);

        positions.push(projectionPoint.clone());
        joints[i].position.copy(projectionPoint);
        joints[i].visible = true;
      });

      // 更新连线
      HAND_CONNECTIONS.forEach((conn, i) => {
        const line = lines[i];
        const posArray = line.geometry.attributes.position.array as Float32Array;

        posArray[0] = positions[conn[0]].x;
        posArray[1] = positions[conn[0]].y;
        posArray[2] = positions[conn[0]].z;
        posArray[3] = positions[conn[1]].x;
        posArray[4] = positions[conn[1]].y;
        posArray[5] = positions[conn[1]].z;

        line.geometry.attributes.position.needsUpdate = true;
        line.visible = true;
      });
    };

    // 更新左右手
    updateHand(handLandmarks.left, leftJointsRef.current, leftLinesRef.current);
    updateHand(handLandmarks.right, rightJointsRef.current, rightLinesRef.current);
  });

  return <group ref={groupRef} />;
};

const ModelViewer: React.FC<ModelViewerProps> = ({ modelUrl, modelType, assetUrls, controlRef }) => {
  const dirLightRef = useRef<THREE.DirectionalLight>(null);
  const [showLabels, setShowLabels] = useState(true);
  const lowerModelUrl = modelUrl.toLowerCase();
  const cameraTarget = useMemo<CameraTarget>(() => {
    if (lowerModelUrl.includes('earth-layers')) return [0, 1.0, 0];
    if (lowerModelUrl.includes('terrain-topography')) return [0, 0.5, 0];
    return [0, 0.3, 0];
  }, [lowerModelUrl]);

  return (
    <div className="w-full h-full bg-white relative">
      {(lowerModelUrl.includes('earth-layers') || lowerModelUrl.includes('terrain-topography')) && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50">
          <button
            onClick={() => setShowLabels(!showLabels)}
            className="px-5 py-2.5 bg-white/90 backdrop-blur-md rounded-2xl shadow-lg border border-gray-200/50 text-xs font-black tracking-widest uppercase text-gray-600 hover:text-[#86e3ce] hover:border-[#86e3ce]/50 transition-all flex items-center gap-2"
          >
            <div className={`w-2 h-2 rounded-full ${showLabels ? 'bg-[#86e3ce] shadow-[0_0_8px_#86e3ce]' : 'bg-gray-300'}`}></div>
            {showLabels ? '关闭教学辅导标签' : '开启教学辅导标签'}
          </button>
        </div>
      )}
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [3.5, 4, 3.5], fov: 45, near: 0.1, far: 100 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, alpha: false }}
        raycaster={{ far: 100 }}
        onCreated={({ gl }) => { gl.setClearColor('#ffffff'); }}
      >
        <Suspense fallback={null}>
          {/* ---- Lighting — warm & soft (from 环境 package) ---- */}
          <ambientLight intensity={0.6} color="#fff8f0" />
          <directionalLight
            ref={dirLightRef}
            position={[5, 8, 4]}
            intensity={1.2}
            color="#ffffff"
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-left={-5}
            shadow-camera-right={5}
            shadow-camera-top={5}
            shadow-camera-bottom={-5}
            shadow-camera-near={0.5}
            shadow-camera-far={20}
            shadow-bias={-0.0005}
          />
          <pointLight position={[-4, 3, 2]} intensity={0.3} color="#e0f0ff" />
          <pointLight position={[3, 2, -3]} intensity={0.2} color="#fff0e8" />

          {/* ---- Local environment reflections ---- */}
          <LocalEnvironment />

          {/* ---- Grid Floor ---- */}
          <GridFloor />

          {/* ---- Uploaded Model ---- */}
          {lowerModelUrl.includes('terrain-topography') ? (
            <ProceduralTerrain controlRef={controlRef} showLabels={showLabels} cameraTarget={cameraTarget} />
          ) : (
            <>
              <LayeredModel
                url={modelUrl}
                modelType={modelType}
                assetUrls={assetUrls}
                controlRef={controlRef}
                cameraTarget={cameraTarget}
                showEarthLabels={lowerModelUrl.includes('earth-layers')}
              />
            </>
          )}

          {/* 3D虚拟手骨架可视化 */}
          <VirtualHand controlRef={controlRef} />

          {/* ---- Contact shadows on floor ---- */}
          <ContactShadows
            position={[0, -0.49, 0]}
            opacity={0.12}
            scale={14}
            blur={4}
            far={4}
            color="#cbd5e1"
          />

          {/* ---- Camera controls ---- */}
          <OrbitControls
            makeDefault
            target={cameraTarget}
            enablePan={false}
            enableZoom={true}
            minPolarAngle={Math.PI / 6}
            maxPolarAngle={Math.PI / 2.2}
            enableDamping
            dampingFactor={0.06}
          />
        </Suspense>
      </Canvas>
    </div>
  );
};

export default ModelViewer;
