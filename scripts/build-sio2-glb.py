"""
SiO₂ (Cristobalite) 三维网状结构 GLB 模型生成器
生成 2×2×2 超胞 = 64 个 SiO₄ 四面体
每个四面体为独立 Group → 系统 findLayerRoots 识别为单零件
输出: public/models/sio2-crystal.glb
"""

import numpy as np
import struct
import json
import os
from itertools import product

# ── 可调参数 ──
LATTICE_A = 2.0
REPEAT = 2          # 2×2×2 超胞
SI_RADIUS = 0.25
O_RADIUS = 0.2
SUBDIVISIONS = 2    # 20 → 80 → 320 面/球

SI_COLOR = [0.27, 0.51, 0.71, 1.0]   # 蓝灰 SteelBlue
O_COLOR  = [1.00, 0.22, 0.22, 1.0]   # 红色
METALLIC = 0.0
ROUGHNESS = 0.3

OUTPUT_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                           'public', 'models', 'sio2-crystal.glb')


# ══════════════════════════════════════
# 1. 球体几何 (icosahedron 细分法)
# ══════════════════════════════════════

def create_icosahedron():
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
    verts, faces = create_icosahedron()
    for _ in range(subdivisions):
        verts, faces = subdivide(verts, faces)
    verts *= radius
    norms = verts / radius
    return verts, norms, faces


# ══════════════════════════════════════
# 2. 方石英 (Cristobalite) 晶格
# ══════════════════════════════════════

def diamond_fractional():
    """金刚石立方晶格 8 个原子的分数坐标"""
    return np.array([
        [0.0, 0.0, 0.0], [0.0, 0.5, 0.5], [0.5, 0.0, 0.5], [0.5, 0.5, 0.0],
        [0.25, 0.25, 0.25], [0.25, 0.75, 0.75], [0.75, 0.25, 0.75], [0.75, 0.75, 0.25],
    ], dtype=np.float32)


def generate_silicon_positions():
    """生成 2×2×2 超胞的全部 Si 原子位置（笛卡尔坐标，居中）"""
    basis = diamond_fractional()
    half = REPEAT / 2.0
    positions = []
    for nx, ny, nz in product(range(REPEAT), repeat=3):
        offset = np.array([nx - half, ny - half, nz - half], dtype=np.float32)
        for b in basis:
            pos = (offset + b) * LATTICE_A
            positions.append(pos)
    return np.array(positions, dtype=np.float32)


def find_nearest_neighbors(si_positions):
    """对每个 Si 找到 4 个最近邻 Si，返回邻居索引和 O 原子位置"""
    n = len(si_positions)
    # 计算所有两两距离
    diffs = si_positions[:, np.newaxis, :] - si_positions[np.newaxis, :, :]
    dist_sq = np.sum(diffs * diffs, axis=2)

    neighbors = []
    o_positions_rel = []  # 相对每个 Si 的 O 位置
    for i in range(n):
        # 排除自身 (距离 0)
        dist_sq[i, i] = np.inf
        # 找 4 个最近邻
        nn_idx = np.argpartition(dist_sq[i], 4)[:4]
        neighbors.append(nn_idx)

        # 计算 O 位置 = (Si_i + Si_j) / 2，相对于 Si_i
        o_rel = []
        for j in nn_idx:
            o_world = (si_positions[i] + si_positions[j]) * 0.5
            o_rel.append(o_world - si_positions[i])
        o_positions_rel.append(o_rel)

    return neighbors, o_positions_rel


# ══════════════════════════════════════
# 3. 构建 GLB
# ══════════════════════════════════════

def pad4(data: bytes) -> bytes:
    rem = len(data) % 4
    return data if rem == 0 else data + b'\x00' * (4 - rem)


def build_glb():
    # 生成球体几何（Si 和 O 共用几何，不同材质）
    si_verts, si_norms, faces = generate_sphere(SI_RADIUS, SUBDIVISIONS)
    o_verts, o_norms, _ = generate_sphere(O_RADIUS, SUBDIVISIONS)

    n_si_vert = len(si_verts)
    n_o_vert = len(o_verts)

    # 合并所有顶点到同一个 buffer
    indices = faces.astype(np.uint16).flatten()
    n_idx = len(indices)

    pos_data = si_verts.tobytes() + o_verts.tobytes()
    norm_data = si_norms.tobytes() + o_norms.tobytes()
    idx_data = indices.tobytes()

    buffer_data = pad4(pos_data + norm_data + idx_data)

    pos_len_si = len(si_verts) * 3 * 4  # bytes
    pos_len_o = len(o_verts) * 3 * 4
    norm_len_si = len(si_norms) * 3 * 4
    norm_len_o = len(o_norms) * 3 * 4

    # buffer layout: [Si pos][O pos][Si norm][O norm][indices]
    pos0_off = 0
    pos1_off = pos0_off + pos_len_si
    norm0_off = pos1_off + pos_len_o
    norm1_off = norm0_off + norm_len_si
    idx_off = norm1_off + norm_len_o

    # Accessors
    si_pos_min = si_verts.min(axis=0).tolist()
    si_pos_max = si_verts.max(axis=0).tolist()
    o_pos_min = o_verts.min(axis=0).tolist()
    o_pos_max = o_verts.max(axis=0).tolist()

    accessors = [
        # 0: Si positions
        {"bufferView": 0, "componentType": 5126, "count": n_si_vert,
         "type": "VEC3", "max": si_pos_max, "min": si_pos_min},
        # 1: Si normals
        {"bufferView": 1, "componentType": 5126, "count": n_si_vert,
         "type": "VEC3"},
        # 2: O positions
        {"bufferView": 2, "componentType": 5126, "count": n_o_vert,
         "type": "VEC3", "max": o_pos_max, "min": o_pos_min},
        # 3: O normals
        {"bufferView": 3, "componentType": 5126, "count": n_o_vert,
         "type": "VEC3"},
        # 4: indices (shared)
        {"bufferView": 4, "componentType": 5123, "count": n_idx,
         "type": "SCALAR"},
    ]

    buffer_views = [
        {"buffer": 0, "byteOffset": pos0_off, "byteLength": pos_len_si, "target": 34962},
        {"buffer": 0, "byteOffset": norm0_off, "byteLength": norm_len_si, "target": 34962},
        {"buffer": 0, "byteOffset": pos1_off, "byteLength": pos_len_o, "target": 34962},
        {"buffer": 0, "byteOffset": norm1_off, "byteLength": norm_len_o, "target": 34962},
        {"buffer": 0, "byteOffset": idx_off, "byteLength": len(idx_data), "target": 34963},
    ]

    # Meshes
    meshes = [
        {"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1},
                         "indices": 4, "material": 0}]},  # Si sphere
        {"primitives": [{"attributes": {"POSITION": 2, "NORMAL": 3},
                         "indices": 4, "material": 1}]},  # O sphere
    ]

    materials = [
        {"pbrMetallicRoughness": {"baseColorFactor": SI_COLOR,
                                   "metallicFactor": METALLIC,
                                   "roughnessFactor": ROUGHNESS}},
        {"pbrMetallicRoughness": {"baseColorFactor": O_COLOR,
                                   "metallicFactor": METALLIC,
                                   "roughnessFactor": ROUGHNESS}},
    ]

    # ── 生成晶格 ──
    si_positions = generate_silicon_positions()
    n_si = len(si_positions)
    print(f"  Si atoms: {n_si}")

    neighbors, o_relative = find_nearest_neighbors(si_positions)
    print(f"  Tetrahedra: {n_si}")

    # ── 构建节点树 ──
    # Node 0 = root Group, children = tetrahedron groups (1..n_si)
    # Each tetrahedron group has 5 children (1 Si + 4 O)
    node_idx = 1  # current node index
    tetra_nodes = []    # {name, children[...]}
    atom_nodes = []     # {name, mesh, translation}
    atom_node_idx = 1 + n_si  # atom nodes start after all tetra groups

    for i in range(n_si):
        tetra_name = f"T{i}"
        tetra_node = {"name": tetra_name}
        children = []
        # Si atom at center
        children.append(atom_node_idx)
        atom_nodes.append({
            "name": f"Si{i}",
            "mesh": 0,
            "translation": [0.0, 0.0, 0.0],
        })
        atom_node_idx += 1
        # 4 O atoms at tetrahedral vertices
        for j in range(4):
            children.append(atom_node_idx)
            o_pos = o_relative[i][j].tolist()
            atom_nodes.append({
                "name": f"O{i}_{j}",
                "mesh": 1,
                "translation": o_pos,
            })
            atom_node_idx += 1
        tetra_node["children"] = children
        tetra_nodes.append(tetra_node)
        node_idx += 1

    # Root node
    root_node = {"name": "root", "children": list(range(1, n_si + 1))}
    all_nodes = [root_node] + tetra_nodes + atom_nodes

    # Scene
    gltf = {
        "asset": {"version": "2.0", "generator": "sio2-crystal-builder"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": all_nodes,
        "meshes": meshes,
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": len(buffer_data)}],
        "materials": materials,
    }

    json_str = json.dumps(gltf, separators=(',', ':'))
    pad = (4 - len(json_str) % 4) % 4
    json_str += ' ' * pad
    json_bytes = json_str.encode('utf-8')

    # GLB binary
    header = struct.pack('<II', 0x46546C67, 2)
    header += struct.pack('<I', 12 + 8 + len(json_bytes) + 8 + len(buffer_data))

    json_chunk = struct.pack('<I', len(json_bytes)) + struct.pack('<I', 0x4E4F534A) + json_bytes
    bin_chunk = struct.pack('<I', len(buffer_data)) + struct.pack('<I', 0x004E4942) + buffer_data

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
    print(f"OK - sio2-crystal.glb generated ({size_kb:.1f} KB)")
    print(f"  path: {OUTPUT_PATH}")
