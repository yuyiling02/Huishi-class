"""
NaCl 离子晶体 GLB 模型生成器
生成 4×4×4 格子（64 个离子），每个离子为独立 Node → 系统 findLayerRoots 自动识别为可拆解零件
输出: public/models/nacl-crystal.glb
"""

import numpy as np
import struct
import json
import os

# ── 可调参数 ──
GRID_SIZE = 4
SPACING = 1.2
RADIUS = 0.45
SUBDIVISIONS = 2  # 20 → 80 → 320 面/球

NA_COLOR = [0.61, 0.15, 0.69, 1.0]  # 紫色 (CPK)
CL_COLOR = [0.12, 0.75, 0.34, 1.0]  # 绿色 (CPK)
METALLIC = 0.0
ROUGHNESS = 0.25

OUTPUT_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                           'public', 'models', 'nacl-crystal.glb')


# ══════════════════════════════════════
# 1. 球体几何: icosahedron 细分法
# ══════════════════════════════════════

def create_icosahedron():
    """构造单位正二十面体"""
    phi = (1.0 + np.sqrt(5.0)) / 2.0
    verts = np.array([
        [-1,  phi,  0], [ 1,  phi,  0], [-1, -phi,  0], [ 1, -phi,  0],
        [ 0,  -1, phi], [ 0,   1, phi], [ 0,  -1, -phi],[ 0,   1, -phi],
        [ phi, 0,  -1], [ phi, 0,   1], [-phi,  0,  -1],[-phi,  0,   1],
    ], dtype=np.float32)
    verts /= np.linalg.norm(verts, axis=1, keepdims=True)

    faces = np.array([
        [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
        [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
        [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
        [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1],
    ], dtype=np.uint32)
    return verts, faces


def subdivide(verts, faces):
    """将每个三角形分成 4 个，新顶点投影到单位球面"""
    new_verts = list(v / np.linalg.norm(v) for v in verts)
    mid_cache = {}
    new_faces = []

    def midpoint(i, j):
        key = (i, j) if i < j else (j, i)
        if key not in mid_cache:
            mid = (new_verts[i] + new_verts[j]) * 0.5
            mid = mid / np.linalg.norm(mid)
            mid_cache[key] = len(new_verts)
            new_verts.append(mid)
        return mid_cache[key]

    for a, b, c in faces:
        ab = midpoint(a, b)
        bc = midpoint(b, c)
        ca = midpoint(c, a)
        new_faces.append([a, ab, ca])
        new_faces.append([b, bc, ab])
        new_faces.append([c, ca, bc])
        new_faces.append([ab, bc, ca])

    return np.array(new_verts, dtype=np.float32), np.array(new_faces, dtype=np.uint32)


def generate_sphere(radius, subdivisions):
    """生成以原点为中心的球体网格"""
    verts, faces = create_icosahedron()
    for _ in range(subdivisions):
        verts, faces = subdivide(verts, faces)
    verts *= radius
    norms = verts / radius  # 法线 = 归一化位置
    # 防止除零 (不可能, 半径>0)
    return verts, norms, faces


# ══════════════════════════════════════
# 2. NaCl 晶格坐标
# ══════════════════════════════════════

def generate_nacl_positions():
    """生成 4×4×4 简单立方格子, 奇偶规则: even=Na, odd=Cl; 居中"""
    n = GRID_SIZE
    half = (n - 1) / 2.0
    positions = []
    types = []
    for i in range(n):
        for j in range(n):
            for k in range(n):
                positions.append([
                    (i - half) * SPACING,
                    (j - half) * SPACING,
                    (k - half) * SPACING,
                ])
                types.append(0 if (i + j + k) % 2 == 0 else 1)  # 0=Na, 1=Cl
    return np.array(positions, dtype=np.float32), np.array(types, dtype=np.uint8)


# ══════════════════════════════════════
# 3. GLB 二进制组装
# ══════════════════════════════════════

def pad4(data: bytes) -> bytes:
    """补齐到 4 字节对齐"""
    rem = len(data) % 4
    return data if rem == 0 else data + b'\x00' * (4 - rem)


def build_glb():
    verts, norms, faces = generate_sphere(RADIUS, SUBDIVISIONS)
    positions, types = generate_nacl_positions()

    n_verts = len(verts)
    indices = faces.astype(np.uint16).flatten()
    n_indices = len(indices)

    # ── 二进制 buffer 布局 ──
    # [vertex positions][vertex normals][indices]
    pos_data = verts.tobytes()
    norm_data = norms.tobytes()
    idx_data = indices.tobytes()

    buffer_data = pad4(pos_data + norm_data + idx_data)

    pos_offset = 0
    pos_len = len(pos_data)
    norm_offset = pos_offset + pos_len
    norm_len = len(norm_data)
    idx_offset = norm_offset + norm_len
    idx_len = len(idx_data)

    # ── Accessor min/max for positions ──
    pos_min = verts.min(axis=0).tolist()
    pos_max = verts.max(axis=0).tolist()

    # ── 构建 JSON ──
    n_atoms = len(positions)

    # Nodes: root + 各原子
    children = [i + 1 for i in range(n_atoms)]
    nodes = [{"name": "root", "children": children}]
    for idx in range(n_atoms):
        t = int(types[idx])
        nodes.append({
            "name": f"{'Na' if t == 0 else 'Cl'}_{idx}",
            "mesh": t,
            "translation": positions[idx].tolist(),
        })

    # Meshes: mesh[0]=Na, mesh[1]=Cl (共享几何)
    meshes = [
        {"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1},
                         "indices": 2, "material": 0}]},
        {"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1},
                         "indices": 2, "material": 1}]},
    ]

    accessors = [
        {"bufferView": 0, "componentType": 5126, "count": n_verts,
         "type": "VEC3", "max": pos_max, "min": pos_min},
        {"bufferView": 1, "componentType": 5126, "count": n_verts,
         "type": "VEC3"},
        {"bufferView": 2, "componentType": 5123, "count": n_indices,
         "type": "SCALAR"},
    ]

    buffer_views = [
        {"buffer": 0, "byteOffset": pos_offset, "byteLength": pos_len,
         "target": 34962},   # ARRAY_BUFFER
        {"buffer": 0, "byteOffset": norm_offset, "byteLength": norm_len,
         "target": 34962},   # ARRAY_BUFFER
        {"buffer": 0, "byteOffset": idx_offset, "byteLength": idx_len,
         "target": 34963},   # ELEMENT_ARRAY_BUFFER
    ]

    materials = [
        {"pbrMetallicRoughness": {
            "baseColorFactor": NA_COLOR,
            "metallicFactor": METALLIC,
            "roughnessFactor": ROUGHNESS,
        }},
        {"pbrMetallicRoughness": {
            "baseColorFactor": CL_COLOR,
            "metallicFactor": METALLIC,
            "roughnessFactor": ROUGHNESS,
        }},
    ]

    gltf = {
        "asset": {"version": "2.0", "generator": "nacl-crystal-builder"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": nodes,
        "meshes": meshes,
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": len(buffer_data)}],
        "materials": materials,
    }

    json_str = json.dumps(gltf, separators=(',', ':'))
    # JSON 补齐 4 字节
    pad = (4 - len(json_str) % 4) % 4
    json_str += ' ' * pad
    json_bytes = json_str.encode('utf-8')

    # ── GLB 封装 ──
    # Header (12 bytes)
    header = struct.pack('<II', 0x46546C67, 2)  # magic "glTF", version 2
    header += struct.pack('<I', 12 + 8 + len(json_bytes) + 8 + len(buffer_data))

    # JSON chunk
    json_chunk = struct.pack('<I', len(json_bytes))
    json_chunk += struct.pack('<I', 0x4E4F534A)  # "JSON"
    json_chunk += json_bytes

    # BIN chunk
    bin_chunk = struct.pack('<I', len(buffer_data))
    bin_chunk += struct.pack('<I', 0x004E4942)  # "BIN\0"
    bin_chunk += buffer_data

    return header + json_chunk + bin_chunk


# ══════════════════════════════════════
# 主入口
# ══════════════════════════════════════

if __name__ == '__main__':
    glb_data = build_glb()
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, 'wb') as f:
        f.write(glb_data)
    size_kb = len(glb_data) / 1024
    print(f"OK - nacl-crystal.glb generated ({size_kb:.1f} KB, 4x4x4 = {GRID_SIZE**3} atoms)")
    print(f"  path: {OUTPUT_PATH}")
