
import React, { useRef, Suspense, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Html } from '@react-three/drei';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { clone as cloneSkinnedModel } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ControlRefs, ModelType } from '../types';
import { resolveModelAssetUrl } from '../services/modelAssetUrl';
import { ProceduralTerrain } from './ProceduralTerrain';
import { useTheme } from './ThemeProvider';

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

interface LoadProgress {
  loaded: number;
  total: number;
  percent: number;
}

interface ModelLoadError {
  title: string;
  detail: string;
}

interface ModelViewerProps {
  modelUrl: string;
  modelType: ModelType;
  assetUrls?: Record<string, string>;
  controlRef: React.MutableRefObject<ControlRefs>;
  showLabels?: boolean;
  onShowLabelsChange?: (val: boolean) => void;
  onLoadProgress?: (progress: LoadProgress) => void;
  onLoadComplete?: () => void;
  onLoadError?: (error: ModelLoadError) => void;
  onPartMoved?: (partName: string) => void;
  quizMode?: boolean;  // 新增：是否处于答题模式
  presentationSplitActive?: boolean;
  crossSectionEnabled?: boolean;
  wireframeEnabled?: boolean;
}

const MODEL_BASE_Y = -0.49;
const MODEL_TARGET_SIZE = 1.5;
const EARTH_LAYERS_TARGET_SIZE = 3.0;
const EARTH_POLITICAL_TARGET_SIZE = 3.5;
const PUBCHEM_6233_MODEL_KEY = 'pubchem-6233-bas-color-print_nih3d.glb';
const NITROBENZENE_MODEL_KEY = '7416-bas-color-print_nih3d.glb';
const DIAMOND_UNIT_CELL_KEY = 'diamond-unit-cell_nih3d.glb';
const DIAMOND_MODEL_KEY = 'diamond.glb';

type GrabbablePart = THREE.Object3D;
type HighlightMaterial = THREE.Material & { emissive?: THREE.Color };
interface DragPickProxy {
  part: GrabbablePart;
  localBox: THREE.Box3;
  worldBox: THREE.Box3;
}

type PubchemPartKind = 'left-methyl' | 'right-methyl' | 'core';
type NitrobenzenePartKind = 'nitro' | 'remainder';

const vectorFromTarget = (target: CameraTarget) => new THREE.Vector3(target[0], target[1], target[2]);
const PINCH_RELEASE_GRACE_MS = 0;
const PART_MOVE_LOG_THRESHOLD = 0.03;

const isMeshObject = (object: THREE.Object3D): object is THREE.Mesh => {
  return Boolean((object as THREE.Mesh).isMesh);
};

const getReadablePartLabel = (part: GrabbablePart): string => {
  const label = part.name.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim();
  return label || '未命名部件';
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

const collectHighlightMaterials = (part: GrabbablePart): HighlightMaterial[] => {
  const materials = new Set<HighlightMaterial>();

  part.traverse((child) => {
    if (!isMeshObject(child) || !child.material) return;

    const meshMaterials = Array.isArray(child.material) ? child.material : [child.material];
    meshMaterials.forEach((material) => {
      const highlightMaterial = material as HighlightMaterial;
      if (highlightMaterial.emissive) {
        materials.add(highlightMaterial);
      }
    });
  });

  return Array.from(materials);
};

const createDragPickProxy = (part: GrabbablePart): DragPickProxy | null => {
  part.updateWorldMatrix(true, true);

  const inversePartMatrix = new THREE.Matrix4().copy(part.matrixWorld).invert();
  const localBox = new THREE.Box3();
  const meshLocalBox = new THREE.Box3();

  collectMeshes(part).forEach((mesh) => {
    if (!mesh.geometry) return;
    if (!mesh.geometry.boundingBox) {
      mesh.geometry.computeBoundingBox();
    }
    if (!mesh.geometry.boundingBox) return;

    mesh.updateWorldMatrix(true, false);
    meshLocalBox.copy(mesh.geometry.boundingBox)
      .applyMatrix4(mesh.matrixWorld)
      .applyMatrix4(inversePartMatrix);
    localBox.union(meshLocalBox);
  });

  if (localBox.isEmpty()) {
    const fallbackWorldBox = new THREE.Box3().setFromObject(part);
    if (fallbackWorldBox.isEmpty()) return null;
    localBox.copy(fallbackWorldBox).applyMatrix4(inversePartMatrix);
  }

  return {
    part,
    localBox: localBox.clone(),
    worldBox: new THREE.Box3(),
  };
};

const findLayerRoots = (root: THREE.Object3D): GrabbablePart[] => {
  const explicitDisassemblyRoots: GrabbablePart[] = [];
  root.traverse((node) => {
    if (node.userData?.teachingRole === 'disassembly-part' && hasRenderableMesh(node)) {
      explicitDisassemblyRoots.push(node);
    }
  });

  if (explicitDisassemblyRoots.length > 0) {
    return explicitDisassemblyRoots;
  }

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

const enhanceDiamondModel = (root: THREE.Object3D) => {
  const atomsNode = root.getObjectByName('atoms') as THREE.Mesh | null;
  const bondsNode = root.getObjectByName('bonds') as THREE.Mesh | null;

  // Carbon atom material — crystalline diamond look
  const atomMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#e8f4fd'),
    metalness: 0.05,
    roughness: 0.18,
    clearcoat: 0.35,
    clearcoatRoughness: 0.15,
    reflectivity: 1.0,
    envMapIntensity: 1.6,
    specularIntensity: 0.7,
    specularColor: new THREE.Color('#c8e8ff'),
  });

  // Covalent bond material — subtle metallic gray
  const bondMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#b0bec5'),
    metalness: 0.3,
    roughness: 0.35,
    envMapIntensity: 1.0,
  });

  if (atomsNode && isMeshObject(atomsNode)) {
    atomsNode.material = atomMaterial;
    atomsNode.castShadow = true;
    atomsNode.receiveShadow = true;
  }

  if (bondsNode && isMeshObject(bondsNode)) {
    bondsNode.material = bondMaterial;
    bondsNode.castShadow = true;
    bondsNode.receiveShadow = true;
  }

  // Also traverse to catch any unnamed meshes
  root.traverse((child) => {
    if (!isMeshObject(child) || child === atomsNode || child === bondsNode) return;
    const name = child.name.toLowerCase();
    if (name.includes('atom') || name.includes('carbon') || name.includes('c_')) {
      child.material = atomMaterial;
    } else if (name.includes('bond')) {
      child.material = bondMaterial;
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

const isPubchem6233Model = (url: string): boolean => getAssetKey(url) === PUBCHEM_6233_MODEL_KEY;

const isNitrobenzeneModel = (url: string): boolean => getAssetKey(url) === NITROBENZENE_MODEL_KEY;

const isDiamondUnitCellModel = (url: string): boolean => getAssetKey(url) === DIAMOND_UNIT_CELL_KEY;

const isDiamondModel = (url: string): boolean => getAssetKey(url) === DIAMOND_MODEL_KEY;

const classifyPubchemAtomTriangle = (center: THREE.Vector3): PubchemPartKind => {
  if (center.x < -2.05) return 'left-methyl';
  if (center.x > 2.05) return 'right-methyl';
  return 'core';
};

const classifyPubchemBondTriangle = (center: THREE.Vector3): PubchemPartKind => {
  if (center.x < -2.15) return 'left-methyl';
  if (center.x > 2.15) return 'right-methyl';
  return 'core';
};

const isPubchemMethylHydrogenSite = (center: THREE.Vector3): boolean => (
  Math.abs(center.x) > 3.05 &&
  center.y < -0.75
);

const getAttributeColorComponent = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined, index: number, component: number): number => {
  if (!attribute) return 1;

  const value = component === 0
    ? attribute.getX(index)
    : component === 1
      ? attribute.getY(index)
      : component === 2
        ? attribute.getZ(index)
        : 1;

  return value > 1 ? value / 255 : value;
};

const clonePubchemMaterial = (source: THREE.Mesh): THREE.Material => {
  const sourceMaterial = Array.isArray(source.material) ? source.material[0] : source.material;
  const material = sourceMaterial?.clone() ?? new THREE.MeshStandardMaterial({
    roughness: 0.62,
    metalness: 0,
  });

  if ('vertexColors' in material) {
    (material as THREE.MeshStandardMaterial).vertexColors = true;
  }
  material.side = THREE.DoubleSide;
  material.depthWrite = true;
  return material;
};

const createPubchemSubsetMesh = (
  source: THREE.Mesh,
  partKind: PubchemPartKind,
  classifier: (center: THREE.Vector3) => PubchemPartKind,
  recolorHydrogenSites: boolean,
): THREE.Mesh | null => {
  const geometry = source.geometry;
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const color = geometry.getAttribute('color');
  const index = geometry.getIndex();

  if (!position || !index) return null;

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const center = new THREE.Vector3();

  const pushVertex = (vertexIndex: number, useHydrogenColor: boolean) => {
    positions.push(position.getX(vertexIndex), position.getY(vertexIndex), position.getZ(vertexIndex));

    if (normal) {
      normals.push(normal.getX(vertexIndex), normal.getY(vertexIndex), normal.getZ(vertexIndex));
    }

    if (useHydrogenColor) {
      colors.push(1, 1, 1);
    } else {
      colors.push(
        getAttributeColorComponent(color, vertexIndex, 0),
        getAttributeColorComponent(color, vertexIndex, 1),
        getAttributeColorComponent(color, vertexIndex, 2),
      );
    }
  };

  for (let i = 0; i < index.count; i += 3) {
    const ia = index.getX(i);
    const ib = index.getX(i + 1);
    const ic = index.getX(i + 2);

    a.set(position.getX(ia), position.getY(ia), position.getZ(ia));
    b.set(position.getX(ib), position.getY(ib), position.getZ(ib));
    c.set(position.getX(ic), position.getY(ic), position.getZ(ic));
    center.copy(a).add(b).add(c).multiplyScalar(1 / 3);

    if (classifier(center) !== partKind) continue;

    const useHydrogenColor = recolorHydrogenSites && isPubchemMethylHydrogenSite(center);
    pushVertex(ia, useHydrogenColor);
    pushVertex(ib, useHydrogenColor);
    pushVertex(ic, useHydrogenColor);
  }

  if (positions.length === 0) return null;

  const subsetGeometry = new THREE.BufferGeometry();
  subsetGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (normals.length > 0) {
    subsetGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  } else {
    subsetGeometry.computeVertexNormals();
  }
  subsetGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  subsetGeometry.computeBoundingBox();
  subsetGeometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(subsetGeometry, clonePubchemMaterial(source));
  mesh.name = `${source.name || 'pubchem'}-${partKind}`;
  mesh.castShadow = source.castShadow;
  mesh.receiveShadow = source.receiveShadow;
  mesh.position.copy(source.position);
  mesh.quaternion.copy(source.quaternion);
  mesh.scale.copy(source.scale);
  return mesh;
};

const isNitrobenzeneNitroColor = (color: THREE.Vector4): boolean => {
  const isOxygenRed = color.x > 0.75 && color.y < 0.35 && color.z < 0.35;
  const isNitrogenBlue = color.z > 0.55 && color.x < 0.45 && color.y < 0.65;
  return isOxygenRed || isNitrogenBlue;
};

const createNitrobenzeneSubsetMesh = (
  source: THREE.Mesh,
  partKind: NitrobenzenePartKind,
  includeNitro: (center: THREE.Vector3, color: THREE.Vector4) => boolean,
): THREE.Mesh | null => {
  const geometry = source.geometry;
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const color = geometry.getAttribute('color');
  const index = geometry.getIndex();

  if (!position || !index) return null;

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const center = new THREE.Vector3();
  const triangleColor = new THREE.Vector4();

  const pushVertex = (vertexIndex: number) => {
    positions.push(position.getX(vertexIndex), position.getY(vertexIndex), position.getZ(vertexIndex));

    if (normal) {
      normals.push(normal.getX(vertexIndex), normal.getY(vertexIndex), normal.getZ(vertexIndex));
    }

    colors.push(
      getAttributeColorComponent(color, vertexIndex, 0),
      getAttributeColorComponent(color, vertexIndex, 1),
      getAttributeColorComponent(color, vertexIndex, 2),
    );
  };

  for (let i = 0; i < index.count; i += 3) {
    const ia = index.getX(i);
    const ib = index.getX(i + 1);
    const ic = index.getX(i + 2);

    a.set(position.getX(ia), position.getY(ia), position.getZ(ia));
    b.set(position.getX(ib), position.getY(ib), position.getZ(ib));
    c.set(position.getX(ic), position.getY(ic), position.getZ(ic));
    center.copy(a).add(b).add(c).multiplyScalar(1 / 3);

    triangleColor.set(0, 0, 0, 0);
    [ia, ib, ic].forEach((vertexIndex) => {
      triangleColor.x += getAttributeColorComponent(color, vertexIndex, 0) / 3;
      triangleColor.y += getAttributeColorComponent(color, vertexIndex, 1) / 3;
      triangleColor.z += getAttributeColorComponent(color, vertexIndex, 2) / 3;
      triangleColor.w += getAttributeColorComponent(color, vertexIndex, 3) / 3;
    });

    const isNitro = includeNitro(center, triangleColor);
    if ((partKind === 'nitro') !== isNitro) continue;

    pushVertex(ia);
    pushVertex(ib);
    pushVertex(ic);
  }

  if (positions.length === 0) return null;

  const subsetGeometry = new THREE.BufferGeometry();
  subsetGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (normals.length > 0) {
    subsetGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  } else {
    subsetGeometry.computeVertexNormals();
  }
  subsetGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  subsetGeometry.computeBoundingBox();
  subsetGeometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(subsetGeometry, clonePubchemMaterial(source));
  mesh.name = `${source.name || 'nitrobenzene'}-${partKind}`;
  mesh.castShadow = source.castShadow;
  mesh.receiveShadow = source.receiveShadow;
  mesh.position.copy(source.position);
  mesh.quaternion.copy(source.quaternion);
  mesh.scale.copy(source.scale);
  return mesh;
};

const prepareNitrobenzeneModel = (root: THREE.Object3D): GrabbablePart[] => {
  const atoms = root.getObjectByName('atoms') as THREE.Mesh | undefined;
  const bonds = root.getObjectByName('bonds') as THREE.Mesh | undefined;

  if (!atoms || !bonds || !isMeshObject(atoms) || !isMeshObject(bonds)) {
    return [];
  }

  const parent = atoms.parent ?? root;
  const nitroGroup = new THREE.Group();
  const remainderGroup = new THREE.Group();
  nitroGroup.name = 'Nitrobenzene nitro group';
  remainderGroup.name = 'Nitrobenzene fixed benzene body';
  nitroGroup.userData.teachingRole = 'disassembly-part';

  const includeNitroAtoms = (_center: THREE.Vector3, color: THREE.Vector4) => isNitrobenzeneNitroColor(color);
  const includeNitroBonds = (center: THREE.Vector3, color: THREE.Vector4) => (
    isNitrobenzeneNitroColor(color) || center.x > 0.95
  );

  const nitroAtoms = createNitrobenzeneSubsetMesh(atoms, 'nitro', includeNitroAtoms);
  const nitroBonds = createNitrobenzeneSubsetMesh(bonds, 'nitro', includeNitroBonds);
  const remainderAtoms = createNitrobenzeneSubsetMesh(atoms, 'remainder', includeNitroAtoms);
  const remainderBonds = createNitrobenzeneSubsetMesh(bonds, 'remainder', includeNitroBonds);

  if (nitroAtoms) nitroGroup.add(nitroAtoms);
  if (nitroBonds) nitroGroup.add(nitroBonds);
  if (remainderAtoms) remainderGroup.add(remainderAtoms);
  if (remainderBonds) remainderGroup.add(remainderBonds);

  parent.add(remainderGroup);
  parent.add(nitroGroup);
  atoms.visible = false;
  bonds.visible = false;
  root.userData.grabbableParts = [nitroGroup, remainderGroup];

  return hasRenderableMesh(nitroGroup) ? [nitroGroup] : [];
};

const preparePubchem6233Model = (root: THREE.Object3D): GrabbablePart[] => {
  const atoms = root.getObjectByName('atoms') as THREE.Mesh | undefined;
  const bonds = root.getObjectByName('bonds') as THREE.Mesh | undefined;

  if (!atoms || !bonds || !isMeshObject(atoms) || !isMeshObject(bonds)) {
    return [];
  }

  const parent = atoms.parent ?? root;
  const groups: Record<PubchemPartKind, THREE.Group> = {
    'left-methyl': new THREE.Group(),
    'right-methyl': new THREE.Group(),
    core: new THREE.Group(),
  };

  groups['left-methyl'].name = 'PubChem 6233 left methyl';
  groups['right-methyl'].name = 'PubChem 6233 right methyl';
  groups.core.name = 'PubChem 6233 benzene core';
  groups['left-methyl'].userData.teachingRole = 'disassembly-part';
  groups['right-methyl'].userData.teachingRole = 'disassembly-part';
  groups.core.userData.disassemblable = false;

  (Object.keys(groups) as PubchemPartKind[]).forEach((partKind) => {
    const atomSubset = createPubchemSubsetMesh(atoms, partKind, classifyPubchemAtomTriangle, true);
    const bondSubset = createPubchemSubsetMesh(bonds, partKind, classifyPubchemBondTriangle, true);

    if (atomSubset) groups[partKind].add(atomSubset);
    if (bondSubset) groups[partKind].add(bondSubset);
    parent.add(groups[partKind]);
  });

  atoms.visible = false;
  bonds.visible = false;

  return [groups['left-methyl'], groups['right-methyl'], groups.core];
};

const isDisassemblablePart = (part: GrabbablePart): boolean => part.userData?.disassemblable !== false;

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
  layout: 'default' | 'heart' | 'earth' = 'default',
): Map<string, THREE.Vector3> => {
  const targets = new Map<string, THREE.Vector3>();
  const disassemblableParts = parts.filter(isDisassemblablePart);
  if (disassemblableParts.length === 0) return targets;

  const rootBox = new THREE.Box3();
  disassemblableParts.forEach((part) => rootBox.expandByObject(part));
  const rootCenter = rootBox.getCenter(new THREE.Vector3());
  const rootSize = rootBox.getSize(new THREE.Vector3());
  const maxDim = Math.max(rootSize.x, rootSize.y, rootSize.z, 0.001);
  const placed: THREE.Vector3[] = [];

  // Detect concentric parts (e.g. earth layers) — all share the same center
  const origPositions = disassemblableParts.map(getOriginalPosition);
  const isConcentric = disassemblableParts.length > 1 && origPositions.every(
    (p) => p.distanceTo(origPositions[0]) < 0.01
  );

  // Only the earth model should use the wide concentric-shell layout. Some
  // GLB files (notably the heart) also keep every part at the same local
  // origin, but spreading those as concentric shells pushes them off-screen.
  const useWideConcentricLayout = layout === 'earth' && isConcentric;
  const spreadDistance = useWideConcentricLayout
    ? maxDim * 0.9
    : layout === 'heart'
    ? maxDim * (0.06 + Math.min(strength, 1) * 0.12)
    : maxDim * (0.15 + Math.min(strength, 1) * 0.25);
  const maxHeartOffset = maxDim * 0.17;

  disassemblableParts.forEach((part, index) => {
    const original = getOriginalPosition(part);
    const partBox = new THREE.Box3().setFromObject(part);
    const partCenter = partBox.getCenter(new THREE.Vector3());
    const angle = (index / Math.max(1, disassemblableParts.length)) * Math.PI * 2;
    const fallbackDirection = new THREE.Vector3(
      Math.cos(angle),
      ((index % 3) - 1) * 0.32,
      Math.sin(angle),
    ).normalize();

    const direction = partCenter.sub(rootCenter);
    if (direction.lengthSq() < 0.0001) {
      direction.copy(fallbackDirection);
      // Concentric layers (e.g. earth): spread horizontally only, same Y level
      if (useWideConcentricLayout) direction.y = 0;
      if (direction.lengthSq() > 0.001) direction.normalize();
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

    if (layout === 'heart') {
      const offset = target.clone().sub(original);
      if (offset.length() > maxHeartOffset) {
        target.copy(original).add(offset.setLength(maxHeartOffset));
      }
    }

    placed.push(target.clone());
    targets.set(part.uuid, target);
  });

  return targets;
};

const createLocalLoadingManager = (assetUrls?: Record<string, string>) => {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((requestedUrl) => {
    return resolveAssetUrl(requestedUrl, assetUrls);
  });
  return manager;
};

const resolveAssetUrl = (requestedUrl: string, assetUrls?: Record<string, string>) => {
  if (!assetUrls || requestedUrl.startsWith('blob:') || requestedUrl.startsWith('data:')) {
    return requestedUrl;
  }

  const directUrl = assetUrls[requestedUrl] || assetUrls[requestedUrl.toLowerCase()];
  if (directUrl) return directUrl;

  const assetKey = getAssetKey(requestedUrl);
  return assetUrls[assetKey] || requestedUrl;
};

const isLikelyGitLfsPointer = (text: string) => text.startsWith('version https://git-lfs.github.com/spec/v1');

const MAX_SESSION_MODEL_TEMPLATES = 2;
const sessionModelTemplates = new Map<string, Promise<THREE.Object3D>>();
const validatedModelAssets = new Set<string>();

const isPublicBuiltInModel = (url: string, modelType: ModelType, assetUrls?: Record<string, string>) => {
  if (modelType !== 'glb' && modelType !== 'gltf') return false;
  if (assetUrls && Object.keys(assetUrls).length > 0) return false;

  try {
    const resolvedUrl = new URL(url, window.location.origin);
    return resolvedUrl.origin === window.location.origin && resolvedUrl.pathname.startsWith('/models/');
  } catch {
    return false;
  }
};

const cloneModelTemplate = (template: THREE.Object3D) => {
  const clone = cloneSkinnedModel(template);

  // Interaction and highlighting mutate materials, so template and live model stay independent.
  clone.traverse((child) => {
    if (!isMeshObject(child)) return;
    child.material = Array.isArray(child.material)
      ? child.material.map((material) => material.clone())
      : child.material.clone();
  });

  return clone;
};

const loadSessionModelTemplate = (
  url: string,
  loadingManager: THREE.LoadingManager,
  onProgress?: (event: ProgressEvent) => void,
) => {
  const cachedTemplate = sessionModelTemplates.get(url);
  if (cachedTemplate) {
    // Reinsert to keep the map in least-recently-used order.
    sessionModelTemplates.delete(url);
    sessionModelTemplates.set(url, cachedTemplate);
    return cachedTemplate;
  }

  const templatePromise = new Promise<THREE.Object3D>((resolve, reject) => {
    const loader = new GLTFLoader(loadingManager);
    loader.setMeshoptDecoder(MeshoptDecoder);
    const dracoLoader = new DRACOLoader(loadingManager);
    dracoLoader.setDecoderPath('/draco/');
    dracoLoader.setDecoderConfig({ type: 'wasm' });
    loader.setDRACOLoader(dracoLoader);

    loader.load(
      url,
      (gltf) => {
        dracoLoader.dispose();
        resolve(gltf.scene);
      },
      onProgress,
      (error) => {
        dracoLoader.dispose();
        reject(error);
      },
    );
  });

  sessionModelTemplates.set(url, templatePromise);
  while (sessionModelTemplates.size > MAX_SESSION_MODEL_TEMPLATES) {
    const oldestUrl = sessionModelTemplates.keys().next().value;
    if (!oldestUrl) break;
    sessionModelTemplates.delete(oldestUrl);
  }

  templatePromise.catch(() => {
    if (sessionModelTemplates.get(url) === templatePromise) {
      sessionModelTemplates.delete(url);
    }
  });

  return templatePromise;
};

const getModelLoadError = (error: unknown): ModelLoadError => {
  const rawMessage = error instanceof Error ? error.message : String(error || '');
  const message = rawMessage || '未知加载错误';

  if (message.includes('git-lfs.github.com/spec/v1') || message.includes('Git LFS')) {
    return {
      title: '模型资源未完整下载',
      detail: '当前 .glb 文件是 Git LFS 指针文件，请同步 Git LFS 后再打开模型。',
    };
  }

  return {
    title: '模型加载失败',
    detail: message,
  };
};

const assertModelAssetReady = async (requestedUrl: string, assetUrls?: Record<string, string>) => {
  const resolvedUrl = resolveAssetUrl(requestedUrl, assetUrls);
  if (resolvedUrl.startsWith('data:') || validatedModelAssets.has(resolvedUrl)) return;

  const response = await fetch(resolvedUrl, {
    headers: { Range: 'bytes=0-255' },
  });

  if (!response.ok && response.status !== 206) {
    throw new Error(`无法读取模型资源：HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  const firstChunk = reader ? await reader.read() : { value: undefined };
  await reader?.cancel();
  const text = firstChunk.value ? new TextDecoder().decode(firstChunk.value) : '';
  if (isLikelyGitLfsPointer(text)) {
    throw new Error('Git LFS pointer detected: version https://git-lfs.github.com/spec/v1');
  }

  validatedModelAssets.add(resolvedUrl);
};

const earthLayerMeta = [
  { key: 'crust', title: '地壳 Crust', detail: '5-70 km · 固态岩石圈', color: '#2f8f5b' },
  { key: 'mantle', title: '地幔 Mantle', detail: '~2900 km · 高温固态', color: '#e85a24' },
  { key: 'outercore', title: '外核 Outer Core', detail: '~2200 km · 液态金属', color: '#f5a623' },
  { key: 'innercore', title: '内核 Inner Core', detail: '~1220 km · 固态铁镍', color: '#f6d84a' },
] as const;

const EARTH_LAYER_LABEL_REVEAL_DISTANCE = 0.12;

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
  const [visibleLayerCount, setVisibleLayerCount] = useState(0);
  const visibleLayerCountRef = useRef(0);
  const cachedSizesRef = useRef<number[]>([]);

  // 预先计算包围盒大小，避免在每一帧中重复遍历网格顶点计算 Box3
  useEffect(() => {
    if (parts.length === 0) return;
    cachedSizesRef.current = parts.map((part) => {
      const box = new THREE.Box3().setFromObject(part);
      const size = box.getSize(new THREE.Vector3());
      return size.y;
    });
  }, [parts]);

  const updateVisibleLayerCount = (nextCount: number) => {
    if (visibleLayerCountRef.current === nextCount) return;
    visibleLayerCountRef.current = nextCount;
    setVisibleLayerCount(nextCount);
  };

  useFrame(() => {
    if (!enabled || !rootGroupRef.current || parts.length === 0) {
      labelRefs.current.forEach((label) => { if (label) label.visible = false; });
      updateVisibleLayerCount(0);
      return;
    }

    const maxLayers = Math.min(parts.length, 4);

    // 计算展开的层数 (每帧执行，只涉及 4 次 Vector3 距离计算，性能开销极低)
    let revealedCount = 1;
    for (let i = 0; i < maxLayers - 1; i++) {
      const distanceFromOriginal = parts[i].position.distanceTo(getOriginalPosition(parts[i]));
      if (distanceFromOriginal > EARTH_LAYER_LABEL_REVEAL_DISTANCE) {
        revealedCount = i + 2;
      } else {
        break;
      }
    }
    updateVisibleLayerCount(revealedCount);

    // 每帧更新标签位置 (移除 80ms 节流限制，实现 60fps 丝滑跟随动效)
    parts.slice(0, maxLayers).forEach((part, index) => {
      const label = labelRefs.current[index];
      if (!label) return;

      if (index >= revealedCount) {
        label.visible = false;
        return;
      }

      // 直接获取部件的世界坐标 (不再遍历网格计算包围盒中心，改用 precomputed size.y)
      const worldPosition = new THREE.Vector3();
      part.getWorldPosition(worldPosition);

      const sizeY = cachedSizesRef.current[index] || 1.0;
      worldPosition.y += Math.max(0.35, sizeY * 0.58);
      
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
            {index < visibleLayerCount && (
              <Html distanceFactor={10} center>
                <div className="bg-white/95 backdrop-blur-md px-3 py-2 rounded-xl text-slate-800 text-[10px] whitespace-nowrap border shadow-lg font-bold" style={{ borderColor: meta.color }}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
                    <span style={{ color: meta.color }} className="text-[11px] font-extrabold">{meta.title}</span>
                  </div>
                  <div className="font-medium text-slate-500 leading-relaxed text-[9px]">{meta.detail}</div>
                </div>
              </Html>
            )}
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
const LayeredModel: React.FC<{ url: string; modelType: ModelType; assetUrls?: Record<string, string>; controlRef: React.MutableRefObject<ControlRefs>; cameraTarget: CameraTarget; showEarthLabels?: boolean; crossSectionEnabled?: boolean; wireframeEnabled?: boolean; accent?: string; onLoadProgress?: (progress: LoadProgress) => void; onLoadComplete?: () => void; onLoadError?: (error: ModelLoadError) => void; onPartMoved?: (partName: string) => void }> = ({ url, modelType, assetUrls, controlRef, cameraTarget, showEarthLabels = false, crossSectionEnabled = false, wireframeEnabled = false, accent = '#86e3ce', onLoadProgress, onLoadComplete, onLoadError, onPartMoved }) => {
  const [modelScene, setModelScene] = useState<THREE.Object3D | null>(null);
  const [modelParts, setModelParts] = useState<GrabbablePart[]>([]);
  const [grabbableParts, setGrabbableParts] = useState<GrabbablePart[]>([]);
  const groupRef = useRef<THREE.Group>(null);
  const { camera, raycaster, scene, gl } = useThree();
  const orbitControls = useThree((threeState) => (threeState as any).controls as {
    enabled?: boolean;
    target?: THREE.Vector3;
    update?: () => void;
  } | undefined);
  const orbitTarget = useMemo(() => vectorFromTarget(cameraTarget), [cameraTarget]);

  // ========== 一比一复刻第一版变量 ==========
  const isGrabbingRef = useRef(false);
  const grabbedPartRef = useRef<GrabbablePart | null>(null);
  const grabbedParentRef = useRef<THREE.Object3D | null>(null);
  const grabStartPositionRef = useRef(new THREE.Vector3());
  const grabMovedRef = useRef(false);
  const grabOffsetRef = useRef(new THREE.Vector3());
  const dragPlaneRef = useRef(new THREE.Plane());
  const dragTargetPositionRef = useRef(new THREE.Vector3());
  const lastGrabPinchTimeRef = useRef(0);
  const raycastTargetsRef = useRef<THREE.Object3D[]>([]);
  const meshToPartRef = useRef<WeakMap<THREE.Object3D, GrabbablePart>>(new WeakMap());
  const highlightMaterialsRef = useRef<WeakMap<GrabbablePart, HighlightMaterial[]>>(new WeakMap());
  const dragPickProxiesRef = useRef<DragPickProxy[]>([]);

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
  const handProjectionScratchRef = useRef({
    cameraDir: new THREE.Vector3(),
    rayDir: new THREE.Vector3(),
    points: Array.from({ length: 21 }, () => new THREE.Vector3()),
    offset: new THREE.Vector3(),
    worldPos: new THREE.Vector3(),
    worldQuat: new THREE.Quaternion(),
    worldScale: new THREE.Vector3(),
    intersectPoint: new THREE.Vector3(),
    targetPoint: new THREE.Vector3(),
    targetLocal: new THREE.Vector3(),
    pickPoint: new THREE.Vector3()
  });

  // Persistent spherical coords for smooth camera orbit (avoids zoom+rotation conflict)
  const sphericalRef = useRef(new THREE.Spherical());
  const cameraInitialized = useRef(false);
  const wasCameraGestureActiveRef = useRef(false);
  const disassemblyTargetsRef = useRef<Map<string, THREE.Vector3>>(new Map());
  const lastDisassemblyActionRef = useRef(-1);
  // Smoothed rotation velocity to prevent abrupt camera start/stop stutter
  const smoothedRotVelRef = useRef({ x: 0, y: 0 });
  const smoothedZoomRef = useRef(0);
  const clippingPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(-1, 0, 0), -1.8));
  const clippingConstantRef = useRef(-1.8);
  const clippingAppliedRef = useRef(false);

  useEffect(() => {
    const previous = gl.localClippingEnabled;
    gl.localClippingEnabled = true;
    return () => {
      gl.localClippingEnabled = previous;
    };
  }, [gl]);

  useEffect(() => {
    if (!modelScene) return undefined;
    const materials = new Set<THREE.Material>();
    modelScene.traverse((child) => {
      if (!isMeshObject(child) || !child.material) return;
      (Array.isArray(child.material) ? child.material : [child.material]).forEach((material) => materials.add(material));
    });
    const originalState = new Map(Array.from(materials, (material) => [material, {
      clippingPlanes: material.clippingPlanes,
      wireframe: 'wireframe' in material ? Boolean((material as THREE.MeshBasicMaterial).wireframe) : undefined,
    }]));

    return () => {
      originalState.forEach((state, material) => {
        material.clippingPlanes = state.clippingPlanes;
        if (state.wireframe !== undefined && 'wireframe' in material) {
          (material as THREE.MeshBasicMaterial).wireframe = state.wireframe;
        }
        material.needsUpdate = true;
      });
      clippingAppliedRef.current = false;
      clippingConstantRef.current = -1.8;
      clippingPlaneRef.current.constant = -1.8;
    };
  }, [modelScene]);

  useEffect(() => {
    if (!modelScene) return;
    modelScene.traverse((child) => {
      if (!isMeshObject(child) || !child.material) return;
      (Array.isArray(child.material) ? child.material : [child.material]).forEach((material) => {
        if ('wireframe' in material) {
          (material as THREE.MeshBasicMaterial).wireframe = wireframeEnabled;
          material.needsUpdate = true;
        }
      });
    });
  }, [modelScene, wireframeEnabled]);

  useEffect(() => {
    if (!modelScene) return;
    if (crossSectionEnabled) {
      if (!clippingAppliedRef.current) {
        clippingConstantRef.current = -1.8;
        clippingPlaneRef.current.constant = -1.8;
      }
      modelScene.traverse((child) => {
        if (!isMeshObject(child) || !child.material) return;
        (Array.isArray(child.material) ? child.material : [child.material]).forEach((material) => {
          material.clippingPlanes = [clippingPlaneRef.current];
          material.clipShadows = true;
          material.needsUpdate = true;
        });
      });
      clippingAppliedRef.current = true;
    }
  }, [crossSectionEnabled, modelScene]);

  // Load model and detect whether the file contains detachable internal layers.
  useEffect(() => {
    let disposed = false;
    let loadedRoot: THREE.Object3D | null = null;
    let loadedParts: GrabbablePart[] = [];
    let dracoLoader: DRACOLoader | null = null;
    const loadingManager = createLocalLoadingManager(assetUrls);

    setModelScene(null);
    setModelParts([]);
    setGrabbableParts([]);
    grabbedPartRef.current = null;
    grabbedParentRef.current = null;
    isGrabbingRef.current = false;
    grabMovedRef.current = false;
    lastGrabPinchTimeRef.current = 0;
    raycastTargetsRef.current = [];
    meshToPartRef.current = new WeakMap();
    highlightMaterialsRef.current = new WeakMap();
    dragPickProxiesRef.current = [];
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
      if (!hasRenderableMesh(root)) {
        throw new Error('模型文件已读取，但没有发现可渲染的网格对象。');
      }
      configureModel(root, targetSize);

      if (isDiamondModel(url)) {
        enhanceDiamondModel(root);
      }

      const customParts = isNitrobenzeneModel(url)
        ? prepareNitrobenzeneModel(root)
        : isPubchem6233Model(url)
          ? preparePubchem6233Model(root)
          : [];
      const parts = isDiamondModel(url) || isDiamondUnitCellModel(url)
        ? []
        : customParts.length > 0
          ? customParts
          : findLayerRoots(root);
      const interactionParts = Array.isArray(root.userData.grabbableParts)
        ? root.userData.grabbableParts as GrabbablePart[]
        : parts;

      Array.from(new Set([...parts, ...interactionParts])).forEach((part) => {
        part.userData.originalPosition = part.position.clone();
      });

      const nextMeshToPart = new WeakMap<THREE.Object3D, GrabbablePart>();
      const nextHighlightMaterials = new WeakMap<GrabbablePart, HighlightMaterial[]>();
      const nextRaycastTargets: THREE.Object3D[] = [];
      const nextDragPickProxies: DragPickProxy[] = [];

      interactionParts.forEach((part) => {
        const meshes = collectMeshes(part);
        meshes.forEach((mesh) => {
          nextMeshToPart.set(mesh, part);
          nextRaycastTargets.push(mesh);
        });
        nextHighlightMaterials.set(part, collectHighlightMaterials(part));
        const pickProxy = createDragPickProxy(part);
        if (pickProxy) {
          nextDragPickProxies.push(pickProxy);
        }
      });

      raycastTargetsRef.current = nextRaycastTargets;
      meshToPartRef.current = nextMeshToPart;
      highlightMaterialsRef.current = nextHighlightMaterials;
      dragPickProxiesRef.current = nextDragPickProxies;

      loadedRoot = root;
      loadedParts = interactionParts;
      setModelParts(parts);
      setGrabbableParts(interactionParts);
      setModelScene(root);

      const format = modelType.toUpperCase();
      const message = parts.length > 0
        ? `${format}加载完成，检测到 ${parts.length} 个可拆解层级`
        : `${format}加载完成，当前模型没有可拆解层级`;
      console.log(message);
    };

    const handleLoadError = (error: unknown) => {
      if (disposed) return;
      const loadError = getModelLoadError(error);
      console.error('模型加载失败:', error);
      onLoadError?.(loadError);
    };

    const handleProgress = (event: ProgressEvent) => {
      if (onLoadProgress && event.total > 0) {
        onLoadProgress({
          loaded: event.loaded,
          total: event.total,
          percent: Math.round((event.loaded / event.total) * 100),
        });
      }
    };

    const handleLoadedModelAndNotify = (root: THREE.Object3D) => {
      try {
        handleLoadedModel(root);
        onLoadComplete?.();
      } catch (error) {
        handleLoadError(error);
      }
    };

    const loadModel = async () => {
      try {
        await assertModelAssetReady(url, assetUrls);
        if (disposed) return;

        if (isPublicBuiltInModel(url, modelType, assetUrls)) {
          const template = await loadSessionModelTemplate(url, loadingManager, handleProgress);
          if (disposed) return;
          handleLoadedModelAndNotify(cloneModelTemplate(template));
        } else if (modelType === 'fbx') {
          const loader = new FBXLoader(loadingManager);
          loader.load(url, handleLoadedModelAndNotify, handleProgress, handleLoadError);
        } else {
          const loader = new GLTFLoader(loadingManager);
          loader.setMeshoptDecoder(MeshoptDecoder);
          dracoLoader = new DRACOLoader(loadingManager);
          dracoLoader.setDecoderPath('/draco/');
          dracoLoader.setDecoderConfig({ type: 'wasm' });
          loader.setDRACOLoader(dracoLoader);
          loader.load(url, (gltf) => handleLoadedModelAndNotify(gltf.scene), handleProgress, handleLoadError);
        }
      } catch (error) {
        handleLoadError(error);
      }
    };

    loadModel();

    return () => {
      disposed = true;
      dracoLoader?.dispose();
      loadedParts.forEach((part) => {
        if (part.parent === scene) {
          scene.remove(part);
        }
      });
    };
  }, [assetUrls, modelType, onLoadError, scene, url]);

  // 更新手部状态 (一比一复刻第一版 updateHandState)
  const updateHandState = (landmarks: { x: number; y: number; z: number }[]) => {
    const state = interactionHandStateRef.current;
    state.exists = true;
    const scratch = handProjectionScratchRef.current;

    // 更新虚拟平面
    const planeDistance = 2;
    camera.getWorldDirection(scratch.cameraDir);

    // 将landmarks投影到3D世界坐标
    const project3D = (lmk: { x: number; y: number; z: number }, point: THREE.Vector3) => {
      const ndcX = (0.5 - lmk.x) * 2;
      const ndcY = -(lmk.y - 0.5) * 2;
      point.set(ndcX, ndcY, 0.5).unproject(camera);
      scratch.rayDir.copy(point).sub(camera.position).normalize();
      const planeHitDistance = planeDistance / Math.max(0.0001, scratch.rayDir.dot(scratch.cameraDir));
      point.copy(camera.position).addScaledVector(scratch.rayDir, planeHitDistance);
    };
    for (let i = 0; i < 21; i += 1) {
      project3D(landmarks[i], scratch.points[i]);
    }

    const wrist = scratch.points[0];
    const middleMCP = scratch.points[9];
    const handScale = wrist.distanceTo(middleMCP);

    // 计算指尖到腕关节的平均距离
    const tipIndices = [4, 8, 12, 16, 20];
    let totalDist = 0;
    tipIndices.forEach(i => {
      totalDist += scratch.points[i].distanceTo(wrist);
    });
    const avgDist = totalDist / 5;

    // 归一化距离 (一比一复刻第一版阈值)
    const normalizedDist = handScale > 0 ? avgDist / handScale : 0;
    state.isFist = normalizedDist < 1.2;
    state.isOpen = normalizedDist > 1.8;

    // 捏合检测 (一比一复刻第一版)
    const thumbTip = scratch.points[4];
    const indexTip = scratch.points[8];
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
    const didMove = Boolean(
      part
      && grabMovedRef.current
      && part.position.distanceTo(grabStartPositionRef.current) >= PART_MOVE_LOG_THRESHOLD,
    );
    const partName = part ? getReadablePartLabel(part) : null;
    if (part) {
      part.userData.manualTargetPosition = part.position.clone();
      const highlightMaterials = highlightMaterialsRef.current.get(part);
      if (highlightMaterials) {
        highlightMaterials.forEach((material) => material.emissive?.setHex(0x000000));
      } else {
        setPartHighlight(part, 0x000000);
      }
    }

    if (didMove && partName) onPartMoved?.(partName);

    isGrabbingRef.current = false;
    grabbedPartRef.current = null;
    grabbedParentRef.current = null;
    grabMovedRef.current = false;
    lastGrabPinchTimeRef.current = 0;
  };

  const pickGrabbablePart = (): GrabbablePart | null => {
    const proxies = dragPickProxiesRef.current;
    const scratch = handProjectionScratchRef.current;

    if (proxies.length > 0) {
      groupRef.current?.updateWorldMatrix(true, true);

      let bestPart: GrabbablePart | null = null;
      let bestDistanceSq = Infinity;

      proxies.forEach((proxy) => {
        proxy.worldBox.copy(proxy.localBox).applyMatrix4(proxy.part.matrixWorld);
        const hitPoint = raycaster.ray.intersectBox(proxy.worldBox, scratch.pickPoint);
        if (!hitPoint) return;

        const distanceSq = raycaster.ray.origin.distanceToSquared(hitPoint);
        if (distanceSq < bestDistanceSq) {
          bestDistanceSq = distanceSq;
          bestPart = proxy.part;
        }
      });

      return bestPart;
    }

    const raycastTargets = raycastTargetsRef.current;
    const intersects = raycaster.intersectObjects(
      raycastTargets.length > 0 ? raycastTargets : grabbableParts,
      raycastTargets.length === 0
    );
    if (intersects.length === 0) return null;

    const hitObject = intersects[0].object;
    return meshToPartRef.current.get(hitObject) || grabbableParts.find((part) => isDescendantOf(hitObject, part)) || null;
  };

  useFrame((state, delta) => {
    if (!modelScene || !groupRef.current) return;

    if (clippingAppliedRef.current) {
      const target = crossSectionEnabled ? 0 : -1.8;
      clippingConstantRef.current = THREE.MathUtils.damp(clippingConstantRef.current, target, 5.5, delta);
      clippingPlaneRef.current.constant = clippingConstantRef.current;
      if (!crossSectionEnabled && Math.abs(clippingConstantRef.current + 1.8) < 0.005) {
        modelScene.traverse((child) => {
          if (!isMeshObject(child) || !child.material) return;
          (Array.isArray(child.material) ? child.material : [child.material]).forEach((material) => {
            material.clippingPlanes = null;
            material.clipShadows = false;
            material.needsUpdate = true;
          });
        });
        clippingAppliedRef.current = false;
      }
    }

    const { rotationVelocity, rotationLocked, zoomSpeed, interactionHandLandmarks } = controlRef.current;

    // 调试：每 60 帧打一次 rotationVelocity
    if (Math.floor(state.clock.elapsedTime * 10) % 60 === 0 && (rotationVelocity.x !== 0 || rotationVelocity.y !== 0)) {
      console.log('[ModelViewer] rotationVelocity=', rotationVelocity, 'rotationLocked=', rotationLocked, 'smoothRotY=', smoothedRotVelRef.current.y);
    }

    // Smooth rotation/zoom velocity to avoid abrupt camera start/stop stutter
    const smoothFactor = 1 - Math.exp(-delta * 18);
    if (rotationLocked) {
      smoothedRotVelRef.current.x = 0;
      smoothedRotVelRef.current.y = 0;
    } else {
      smoothedRotVelRef.current.x += (rotationVelocity.x - smoothedRotVelRef.current.x) * smoothFactor;
      smoothedRotVelRef.current.y += (rotationVelocity.y - smoothedRotVelRef.current.y) * smoothFactor;
    }
    smoothedZoomRef.current += (zoomSpeed - smoothedZoomRef.current) * smoothFactor;

    const smoothRotX = smoothedRotVelRef.current.x;
    const smoothRotY = smoothedRotVelRef.current.y;
    const smoothZoom = smoothedZoomRef.current;
    const frameScale = Math.min(delta * 60, 2);

    const hasRotationGestureInput =
      Math.abs(smoothRotX) > 0.0001 ||
      Math.abs(smoothRotY) > 0.0001;
    const hasCameraGestureInput =
      hasRotationGestureInput ||
      Math.abs(smoothZoom) > 0.0001;

    const scratch = handProjectionScratchRef.current;
    const offset = scratch.offset.subVectors(camera.position, orbitTarget);
    if (!cameraInitialized.current || !wasCameraGestureActiveRef.current) {
      sphericalRef.current.setFromVector3(offset);
      cameraInitialized.current = true;
    }

    const sph = sphericalRef.current;

    // 旋转 — modify angles on persistent spherical (uses smoothed velocity)
    if (hasCameraGestureInput && (Math.abs(smoothRotX) > 0.0001 || Math.abs(smoothRotY) > 0.0001)) {
      const sensitivity = 0.31 * (controlRef.current.interactionSettings?.rotationSpeed ?? 1.0);
      sph.theta -= smoothRotY * sensitivity * frameScale;
      sph.phi -= smoothRotX * sensitivity * frameScale;
      sph.phi = Math.max(0.1, Math.min(Math.PI - 0.1, sph.phi));
      sph.makeSafe();
    }

    // 缩放 — modify radius on persistent spherical (no conflict with rotation)
    if (hasCameraGestureInput && Math.abs(smoothZoom) > 0.0001) {
      sph.radius = Math.max(
        3,
        Math.min(12, sph.radius - smoothZoom * 0.13 * frameScale * (controlRef.current.interactionSettings?.zoomSpeed ?? 1.0))
      );
    }

    // Apply spherical to camera
    if (hasCameraGestureInput) {
      if (orbitControls) {
        orbitControls.enabled = false;
      }
      camera.position.setFromSpherical(sph).add(orbitTarget);
      camera.lookAt(orbitTarget);
    } else {
      sphericalRef.current.setFromVector3(offset);
      if (wasCameraGestureActiveRef.current) {
        if (orbitControls?.target) {
          orbitControls.target.copy(orbitTarget);
          orbitControls.update?.();
        }
        if (orbitControls) {
          orbitControls.enabled = true;
        }
      }
    }
    wasCameraGestureActiveRef.current = hasCameraGestureInput;

    const disassembly = controlRef.current.agentDisassembly;
    if (disassembly && disassembly.actionId !== lastDisassemblyActionRef.current) {
      grabbableParts.forEach((part) => {
        delete part.userData.manualTargetPosition;
      });
      disassemblyTargetsRef.current = disassembly.enabled
        ? calculateDisassemblyTargets(
            modelParts,
            disassembly.strength,
            disassembly.spacing,
            url.toLowerCase().includes('heart')
              ? 'heart'
              : url.toLowerCase().includes('earth-layers')
                ? 'earth'
                : 'default',
          )
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
    const activeInteractionLandmarks = interactionHandLandmarks;
    const handState = interactionHandStateRef.current;

    if (activeInteractionLandmarks && activeInteractionLandmarks.length >= 21) {
      updateHandState(activeInteractionLandmarks);
      const nowMs = performance.now();
      if (handState.isPinching) {
        lastGrabPinchTimeRef.current = nowMs;
      }
      const keepGrabAlive =
        isGrabbingRef.current &&
        nowMs - lastGrabPinchTimeRef.current <= PINCH_RELEASE_GRACE_MS;

      // 抓取逻辑 (一比一复刻 executeInteractions)
      if (!hasRotationGestureInput && handState.isPinching && !isGrabbingRef.current && handState.ndc && grabbableParts.length > 0) {
        raycaster.setFromCamera(handState.ndc, camera);
        const hitPart = pickGrabbablePart();

        if (hitPart) {
          isGrabbingRef.current = true;
          grabbedPartRef.current = hitPart;
          grabbedParentRef.current = hitPart.parent;
          grabStartPositionRef.current.copy(hitPart.position);
          grabMovedRef.current = false;
          lastGrabPinchTimeRef.current = nowMs;

          // 获取世界坐标
          const { worldPos } = scratch;
          hitPart.getWorldPosition(worldPos);

          // 高亮
          const highlightMaterials = highlightMaterialsRef.current.get(hitPart);
          if (highlightMaterials) {
            highlightMaterials.forEach((material) => material.emissive?.setHex(0x333333));
          } else {
            setPartHighlight(hitPart, 0x333333);
          }

          // 设置拖拽平面
          dragPlaneRef.current.setFromNormalAndCoplanarPoint(
            camera.getWorldDirection(scratch.cameraDir),
            worldPos
          );

          // 计算偏移
          raycaster.ray.intersectPlane(dragPlaneRef.current, scratch.intersectPoint);
          grabOffsetRef.current.copy(worldPos).sub(scratch.intersectPoint);
          dragTargetPositionRef.current.copy(worldPos);
        }
      } else if (!handState.isPinching && isGrabbingRef.current && !keepGrabAlive) {
        releaseGrab();
      }

      // 拖拽
      if (isGrabbingRef.current && grabbedPartRef.current && handState.ndc) {
        raycaster.setFromCamera(handState.ndc, camera);
        if (raycaster.ray.intersectPlane(dragPlaneRef.current, scratch.targetPoint)) {
          dragTargetPositionRef.current.copy(scratch.targetPoint).add(grabOffsetRef.current);
          const parent = grabbedParentRef.current || scene;
          scratch.targetLocal.copy(dragTargetPositionRef.current);
          parent.worldToLocal(scratch.targetLocal);
          grabbedPartRef.current.position.copy(scratch.targetLocal);
          if (grabbedPartRef.current.position.distanceTo(grabStartPositionRef.current) >= PART_MOVE_LOG_THRESHOLD) {
            grabMovedRef.current = true;
          }
        }
      }
    } else {
      // 手部丢失
      handState.exists = false;
      if (
        isGrabbingRef.current &&
        performance.now() - lastGrabPinchTimeRef.current > PINCH_RELEASE_GRACE_MS
      ) {
        releaseGrab();
      }
    }

    // 待机动画 — 关闭默认自转，模型静止展示，只响应语音/手势指令
    // if (!rotationLocked && !hasCameraGestureInput && !isGrabbingRef.current) {
    //   groupRef.current.rotation.y += Math.sin(state.clock.elapsedTime * 0.3) * 0.001 * frameScale;
    // }
  }, -1);

  if (!modelScene) {
    return (
      <group>
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[0.5, 16, 16]} />
          <meshStandardMaterial color={accent} wireframe />
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
const HAND_VISIBILITY_GRACE_MS = 180;
const HAND_POSITION_SMOOTHING = 0.36;
const HAND_PLANE_DISTANCE = 2.85;
const HAND_DEPTH_SCALE = 0.48;
const HAND_DEPTH_LIMIT = 0.18;
const HAND_RENDER_ORDER = 40;
const PINCH_VISUAL_THRESHOLD = 0.055;
const HAND_FINGERTIPS = new Set([4, 8, 12, 16, 20]);
const HAND_HIGHLIGHT_JOINTS = new Set([4, 8]);

const VirtualHand: React.FC<{ controlRef: React.MutableRefObject<ControlRefs> }> = ({ controlRef }) => {
  const { camera } = useThree();

  // 为每只手创建21个关节点引用
  const leftJointsRef = useRef<THREE.Mesh[]>([]);
  const rightJointsRef = useRef<THREE.Mesh[]>([]);
  const leftLinesRef = useRef<THREE.Line[]>([]);
  const rightLinesRef = useRef<THREE.Line[]>([]);
  const leftPinchLineRef = useRef<THREE.Line | null>(null);
  const rightPinchLineRef = useRef<THREE.Line | null>(null);
  const leftPositionsRef = useRef<THREE.Vector3[]>(Array.from({ length: 21 }, () => new THREE.Vector3()));
  const rightPositionsRef = useRef<THREE.Vector3[]>(Array.from({ length: 21 }, () => new THREE.Vector3()));
  const virtualHandScratchRef = useRef({
    targetLocal: new THREE.Vector3()
  });
  const leftLastSeenRef = useRef(0);
  const rightLastSeenRef = useRef(0);

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
    const createJointMaterial = (color: number, opacity: number) => new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    const createLineMaterial = (color: number, opacity: number) => new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });

    const leftMaterial = createJointMaterial(0xff8a5b, 0.74);
    const rightMaterial = createJointMaterial(0x2dd4ff, 0.76);
    const thumbMaterial = createJointMaterial(0xff4d5a, 0.95);
    const indexMaterial = createJointMaterial(0xffd54a, 0.95);

    const jointGeometry = new THREE.SphereGeometry(1, 12, 12);
    const lineMaterial = createLineMaterial(0x2dd4ff, 0.58);
    const leftLineMaterial = createLineMaterial(0xff8a5b, 0.56);
    const pinchLineMaterial = createLineMaterial(0xfff1a6, 0.92);

    const applyOverlayStyle = (object: THREE.Object3D) => {
      object.renderOrder = HAND_RENDER_ORDER;
      object.frustumCulled = false;
    };

    // 创建左手关节点
    leftJointsRef.current = [];
    for (let i = 0; i < 21; i++) {
      const material = i === 4 ? thumbMaterial : i === 8 ? indexMaterial : leftMaterial;
      const sphere = new THREE.Mesh(jointGeometry, material);
      sphere.visible = false;
      sphere.scale.setScalar(HAND_FINGERTIPS.has(i) ? 0.022 : 0.014);
      applyOverlayStyle(sphere);
      groupRef.current.add(sphere);
      leftJointsRef.current.push(sphere);
    }

    // 创建右手关节点
    rightJointsRef.current = [];
    for (let i = 0; i < 21; i++) {
      const material = i === 4 ? thumbMaterial : i === 8 ? indexMaterial : rightMaterial;
      const sphere = new THREE.Mesh(jointGeometry, material);
      sphere.visible = false;
      sphere.scale.setScalar(HAND_FINGERTIPS.has(i) ? 0.022 : 0.014);
      applyOverlayStyle(sphere);
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
      applyOverlayStyle(leftLine);
      groupRef.current!.add(leftLine);
      leftLinesRef.current.push(leftLine);

      // 右手连线
      const rightGeo = new THREE.BufferGeometry();
      rightGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const rightLine = new THREE.Line(rightGeo, lineMaterial);
      rightLine.visible = false;
      applyOverlayStyle(rightLine);
      groupRef.current!.add(rightLine);
      rightLinesRef.current.push(rightLine);
    });

    const createPinchLine = () => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geo, pinchLineMaterial);
      line.visible = false;
      applyOverlayStyle(line);
      groupRef.current!.add(line);
      return line;
    };
    leftPinchLineRef.current = createPinchLine();
    rightPinchLineRef.current = createPinchLine();

    setInitialized(true);
  }, []);

  useFrame(() => {
    if (!initialized || !groupRef.current) return;

    const { handLandmarks } = controlRef.current;
    groupRef.current.position.copy(camera.position);
    groupRef.current.quaternion.copy(camera.quaternion);

    // 更新手部可视化的辅助函数
    const updateHand = (
      landmarks: { x: number; y: number; z: number }[] | null,
      joints: THREE.Mesh[],
      lines: THREE.Line[],
      pinchLine: THREE.Line | null,
      cachedPositionsRef: React.MutableRefObject<THREE.Vector3[]>,
      lastSeenRef: React.MutableRefObject<number>
    ) => {
      const hideHand = () => {
        joints.forEach(j => j.visible = false);
        lines.forEach(l => l.visible = false);
        if (pinchLine) pinchLine.visible = false;
      };

      const renderHand = (positions: THREE.Vector3[], isPinching: boolean) => {
        if (positions.length < 21) {
          hideHand();
          return;
        }

        positions.forEach((position, i) => {
          joints[i].position.copy(position);
          const baseScale = HAND_FINGERTIPS.has(i) ? 0.022 : 0.014;
          const pinchScale = isPinching && HAND_HIGHLIGHT_JOINTS.has(i) ? 1.45 : 1;
          joints[i].scale.setScalar(baseScale * pinchScale);
          joints[i].visible = true;
        });

        // Update every line from the same cached point set so visible bones stay connected.
        HAND_CONNECTIONS.forEach((conn, i) => {
          const start = positions[conn[0]];
          const end = positions[conn[1]];
          if (!start || !end) {
            lines[i].visible = false;
            return;
          }

          const line = lines[i];
          const posArray = line.geometry.attributes.position.array as Float32Array;

          posArray[0] = start.x;
          posArray[1] = start.y;
          posArray[2] = start.z;
          posArray[3] = end.x;
          posArray[4] = end.y;
          posArray[5] = end.z;

          line.geometry.attributes.position.needsUpdate = true;
          line.visible = true;
        });

        if (pinchLine) {
          const thumbTip = positions[4];
          const indexTip = positions[8];
          if (isPinching && thumbTip && indexTip) {
            const posArray = pinchLine.geometry.attributes.position.array as Float32Array;
            posArray[0] = thumbTip.x;
            posArray[1] = thumbTip.y;
            posArray[2] = thumbTip.z;
            posArray[3] = indexTip.x;
            posArray[4] = indexTip.y;
            posArray[5] = indexTip.z;
            pinchLine.geometry.attributes.position.needsUpdate = true;
            pinchLine.visible = true;
          } else {
            pinchLine.visible = false;
          }
        }
      };

      const now = performance.now();
      if (!landmarks || landmarks.length < 21) {
        if (lastSeenRef.current > 0 && now - lastSeenRef.current <= HAND_VISIBILITY_GRACE_MS) {
          renderHand(cachedPositionsRef.current, false);
        } else {
          hideHand();
        }
        return;
      }
      // 虚拟平面设置
      const scratch = virtualHandScratchRef.current;
      const positions = cachedPositionsRef.current;
      const hasPreviousPositions = lastSeenRef.current > 0;
      const isPerspectiveCamera = (camera as THREE.PerspectiveCamera).isPerspectiveCamera;
      const isOrthographicCamera = (camera as THREE.OrthographicCamera).isOrthographicCamera;
      let halfWidth = 1;
      let halfHeight = 1;
      if (isPerspectiveCamera) {
        const perspectiveCamera = camera as THREE.PerspectiveCamera;
        halfHeight = Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov) / 2) * HAND_PLANE_DISTANCE;
        halfWidth = halfHeight * perspectiveCamera.aspect;
      } else if (isOrthographicCamera) {
        const orthographicCamera = camera as THREE.OrthographicCamera;
        halfWidth = (orthographicCamera.right - orthographicCamera.left) / (2 * orthographicCamera.zoom);
        halfHeight = (orthographicCamera.top - orthographicCamera.bottom) / (2 * orthographicCamera.zoom);
      }

      landmarks.forEach((pt, i) => {
        // NDC坐标转换 (镜像X轴)
        const ndcX = (0.5 - pt.x) * 2;
        const ndcY = -(pt.y - 0.5) * 2;

        const depthOffset = THREE.MathUtils.clamp((pt.z || 0) * HAND_DEPTH_SCALE, -HAND_DEPTH_LIMIT, HAND_DEPTH_LIMIT);
        scratch.targetLocal.set(
          ndcX * halfWidth,
          ndcY * halfHeight,
          -HAND_PLANE_DISTANCE + depthOffset
        );

        if (hasPreviousPositions) {
          positions[i].lerp(scratch.targetLocal, HAND_POSITION_SMOOTHING);
        } else {
          positions[i].copy(scratch.targetLocal);
        }
      });

      const pinchDistance = Math.sqrt(
        Math.pow(landmarks[4].x - landmarks[8].x, 2) +
        Math.pow(landmarks[4].y - landmarks[8].y, 2)
      );
      const isPinching = pinchDistance < PINCH_VISUAL_THRESHOLD;

      cachedPositionsRef.current = positions;
      lastSeenRef.current = now;
      renderHand(positions, isPinching);
    };

    // 更新左右手
    updateHand(handLandmarks.left, leftJointsRef.current, leftLinesRef.current, leftPinchLineRef.current, leftPositionsRef, leftLastSeenRef);
    updateHand(handLandmarks.right, rightJointsRef.current, rightLinesRef.current, rightPinchLineRef.current, rightPositionsRef, rightLastSeenRef);
  });

  return <group ref={groupRef} />;
};

/** Sets the camera initial position based on model type */
const CameraInit: React.FC<{ modelUrl: string; target: CameraTarget }> = ({ modelUrl, target }) => {
  const { camera } = useThree();
  const controls = useThree((s) => (s as any).controls);

  useEffect(() => {
    const lower = modelUrl.toLowerCase();
    if (lower.includes('心脏模型') || lower.includes('heart')) {
      camera.position.set(0, 1.5, 4.5);
    } else {
      camera.position.set(3.5, 4, 3.5);
    }
    camera.lookAt(...target);
    controls?.update?.();
  }, [modelUrl]);

  return null;
};

const CameraPresentationTransition: React.FC<{ active: boolean; target: CameraTarget }> = ({ active, target }) => {
  const { camera } = useThree();
  const controls = useThree((state) => (state as any).controls);
  const currentFactorRef = useRef(1);
  const targetFactorRef = useRef(1);
  const targetVector = useMemo(() => new THREE.Vector3(...target), [target]);
  const offsetRef = useRef(new THREE.Vector3());

  useEffect(() => {
    targetFactorRef.current = active ? 1.15 : 1;
    const reduceMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion || currentFactorRef.current === targetFactorRef.current) return;

    const ratio = targetFactorRef.current / currentFactorRef.current;
    offsetRef.current.subVectors(camera.position, targetVector).multiplyScalar(ratio);
    camera.position.copy(targetVector).add(offsetRef.current);
    camera.lookAt(targetVector);
    controls?.update?.();
    currentFactorRef.current = targetFactorRef.current;
  }, [active, camera, controls, targetVector]);

  useFrame((_, delta) => {
    const current = currentFactorRef.current;
    const desired = targetFactorRef.current;
    if (Math.abs(current - desired) < 0.0005) {
      currentFactorRef.current = desired;
      return;
    }

    const next = THREE.MathUtils.damp(current, desired, 6.5, delta);
    const ratio = next / current;
    offsetRef.current.subVectors(camera.position, targetVector).multiplyScalar(ratio);
    camera.position.copy(targetVector).add(offsetRef.current);
    camera.lookAt(targetVector);
    controls?.update?.();
    currentFactorRef.current = next;
  });

  return null;
};

const ModelViewer: React.FC<ModelViewerProps> = ({ modelUrl, modelType, assetUrls, controlRef, showLabels: externalShowLabels, onShowLabelsChange, onLoadProgress, onLoadComplete, onLoadError, onPartMoved, quizMode = false, presentationSplitActive = false, crossSectionEnabled = false, wireframeEnabled = false }) => {
  const { themeDef } = useTheme();
  const dirLightRef = useRef<THREE.DirectionalLight>(null);
  const [internalShowLabels, setInternalShowLabels] = useState(false);
  const showLabels = externalShowLabels !== undefined ? externalShowLabels : internalShowLabels;
  const setShowLabels = onShowLabelsChange || setInternalShowLabels;
  const lastAutoLabelActionRef = useRef(-1);
  const terrainLoadNotifiedRef = useRef<string | null>(null);
  const lowerModelUrl = modelUrl.toLowerCase();
  const assetModelUrl = resolveModelAssetUrl(modelUrl);
  const cameraTarget = useMemo<CameraTarget>(() => {
    if (lowerModelUrl.includes('earth-layers')) return [0, 1.5, 0];
    if (lowerModelUrl.includes('terrain-topography')) return [0, 0.5, 0];
    return [0, 0.3, 0];
  }, [lowerModelUrl]);

  useEffect(() => {
    if (lowerModelUrl.includes('earth-layers')) {
      setShowLabels(true);
    } else {
      setShowLabels(false);
    }
    lastAutoLabelActionRef.current = controlRef.current.agentDisassembly?.actionId ?? -1;
  }, [controlRef, modelUrl, lowerModelUrl]);

  useEffect(() => {
    if (!lowerModelUrl.includes('terrain-topography')) {
      terrainLoadNotifiedRef.current = null;
      return;
    }
    if (terrainLoadNotifiedRef.current === modelUrl) return;
    terrainLoadNotifiedRef.current = modelUrl;
    onLoadComplete?.();
  }, [lowerModelUrl, modelUrl, onLoadComplete]);

  useEffect(() => {
    let animationFrame = 0;

    const syncEarthLabelsWithDisassembly = () => {
      const disassembly = controlRef.current.agentDisassembly;
      const isNewEarthDisassembly =
        lowerModelUrl.includes('earth-layers') &&
        Boolean(disassembly?.enabled) &&
        disassembly.actionId !== lastAutoLabelActionRef.current;

      if (isNewEarthDisassembly) {
        lastAutoLabelActionRef.current = disassembly.actionId;
        setShowLabels(true);
      }

      animationFrame = requestAnimationFrame(syncEarthLabelsWithDisassembly);
    };

    animationFrame = requestAnimationFrame(syncEarthLabelsWithDisassembly);
    return () => cancelAnimationFrame(animationFrame);
  }, [controlRef, lowerModelUrl]);

  return (
    <div className="w-full h-full bg-transparent relative">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [3.5, 4, 3.5], fov: 45, near: 0.1, far: 100 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, alpha: true }}
        raycaster={{ far: 100 }}
        onCreated={({ gl }) => { gl.setClearColor('#020812', 0); }}
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

          {/* ---- Uploaded Model ---- */}
          {lowerModelUrl.includes('terrain-topography') ? (
            <ProceduralTerrain controlRef={controlRef} showLabels={showLabels} cameraTarget={cameraTarget} />
          ) : (
            <>
              <LayeredModel
                url={assetModelUrl}
                modelType={modelType}
                assetUrls={assetUrls}
                controlRef={controlRef}
                cameraTarget={cameraTarget}
                accent={themeDef.accent}
                showEarthLabels={lowerModelUrl.includes('earth-layers') && showLabels}
                crossSectionEnabled={crossSectionEnabled}
                wireframeEnabled={wireframeEnabled}
                onLoadProgress={onLoadProgress}
                onLoadComplete={onLoadComplete}
                onLoadError={onLoadError}
                onPartMoved={onPartMoved}
              />
            </>
          )}

          {/* 3D虚拟手骨架可视化 */}
          {!quizMode && <VirtualHand controlRef={controlRef} />}

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
            minDistance={3}
            maxDistance={12}
            enableDamping
            dampingFactor={0.045}
            rotateSpeed={0.35}
            zoomSpeed={0.9}
          />
          <CameraInit modelUrl={modelUrl} target={cameraTarget} />
          <CameraPresentationTransition key={modelUrl} active={presentationSplitActive} target={cameraTarget} />
        </Suspense>
      </Canvas>
    </div>
  );
};

export default ModelViewer;
