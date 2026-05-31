# Fix Plan: 骨骼驱动不跟随真实手运动

## 根因分析

### Bug 1: 父骨骼世界四元数陈旧
`components/RiggedVirtualHand.tsx` 行 283：`bone.parent.getWorldQuaternion(parentWorldQuat)`
当遍历手指骨骼链（如 metacarpal → proximal → intermediate）时，**链中父骨骼的 quaternion 已在同一帧被修改**，但 `getWorldQuaternion` 依赖 `updateMatrixWorld` 传播，而此时尚未调用，因此返回的是上一帧的值，导致子骨骼的旋转计算基于错误参考。

### Bug 2: 坐标系不匹配
行 287：`restDir.copy(rd).applyQuaternion(parentWorldQuat.clone().invert())`
`rd`（rest 方向）存储在 **group-local 空间**（初始化时 group 为单位矩阵），而 `parentWorldQuat` 来自 `getWorldQuaternion` 是 **world 空间**。两者混合计算缺少中间步骤。

### Bug 3: 场景缩放影响骨骼位置
动态缩放 `scene.scale` 会改变骨骼的 world 空间位置，使 `getWorldPosition` 和 `getWorldQuaternion` 的值偏离预期。

## 修复方案

### 核心思路
完全在 **group-local 空间** 工作，手动累加骨骼链中的父旋转：

```
group-local 空间 = 摄像机空间（group 跟随摄像机）
父骨骼 local = 链中前面骨骼的 quaternion 累乘
每个骨骼的 rest/target 方向 → 用父骨骼local.inverse() 转到父空间 → setFromUnitVectors
```

### 具体改动：`components/RiggedVirtualHand.tsx`

**1. 重写骨骼驱动循环（行 260-294）**

替换三个关键变量：
- 移除 `parentWorldQuat`（world 空间）
- 新增 `chainQuat`（group-local 空间的父旋转累加器，从单位矩阵开始）
- 骨骼间累加：`chainQuat.multiply(bone.quaternion)`

新逻辑：
```typescript
const chainQuat = new THREE.Quaternion(); // group-local父旋转累加

for (let b = 0; b < chain.length; b++) {
  // 计算 target 方向 (group-local)
  targetDir.copy(pos[iNext]).sub(pos[iCurr]);
  if (targetDir.lengthSq() < 1e-8) continue;
  targetDir.normalize();

  // rest 方向 (group-local, 初始化时记录)
  const rd = restDirs.get(bone);
  if (!rd) continue;

  // 用 chainQuat.inverse() 转到父空间
  const invParent = new THREE.Quaternion().copy(chainQuat).invert();
  restLocal.copy(rd).applyQuaternion(invParent);
  targetLocal.copy(targetDir).applyQuaternion(invParent);

  // 计算 local quat 并应用
  boneQuat.setFromUnitVectors(restLocal, targetLocal);
  bone.quaternion.copy(boneQuat);

  // 累加当前骨骼旋转，供子骨骼使用
  chainQuat.multiply(boneQuat);
}
```

**2. 保持动态缩放和位置偏移逻辑不变**

## 验证
- `npm run build` 无报错
- 启动 dev server，右手 GLB 模型应跟随真实手同步运动，大小匹配
