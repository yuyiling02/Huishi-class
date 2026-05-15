#!/usr/bin/env python3
"""
Generate terrain-topography.glb — Terrain topography model.
Single height-mapped surface with 5 terrain types:
mountains, plateau, basin, plains, hills.
Includes contour lines, cross-section plane, and base platform.

Output: public/models/terrain-topography.glb
"""

import numpy as np
import json
import struct
import io
import os
import math

# ── Config ────────────────────────────────────────────────────
GRID_RES = 200          # terrain grid resolution (N x N)
GRID_SIZE = 4.0        # terrain covers [-2, 2] in X and Z
CONTOUR_INTERVAL = 0.2  # elevation interval for contour lines
CONTOUR_SAMPLE = 400    # sampling grid for contour tracing
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "models", "terrain-topography.glb")


# ══════════════════════════════════════════════════════════════
#  TERRAIN HEIGHT FIELD
# ══════════════════════════════════════════════════════════════

def terrain_height(x, z):
    """Height function combining 5 terrain types on one surface.
    x, z in range [-2, 2]. Returns elevation at (x, z)."""
    h = 0.0

    # ── Mountains (upper right: x>0, z>0) ──
    # Several overlapping Gaussian peaks forming a mountain range
    peaks = [
        (0.7,  0.5,  0.30, 1.6),   # (cx, cz, sigma, amplitude)
        (1.1,  0.9,  0.35, 2.0),
        (0.9,  1.3,  0.32, 1.7),
        (1.5,  0.7,  0.40, 1.3),
        (1.2,  0.5,  0.38, 1.1),
        (0.5,  1.0,  0.45, 0.9),
    ]
    for cx, cz, sigma, amp in peaks:
        r2 = (x - cx) ** 2 + (z - cz) ** 2
        h += amp * math.exp(-r2 / (2 * sigma ** 2))

    # Ridge line connecting peaks
    ridge_x = 0.4 + (z / 2.0) * 1.2
    ridge_dist = abs(x - ridge_x)
    ridge_factor = max(0, 1.0 - ridge_dist / 0.4)
    ridge_factor *= max(0, 1.0 - abs(z - 0.9) / 1.0)
    h += ridge_factor * 0.6

    # ── Plateau (upper left: x<0, z>0) ──
    # Flat elevated area with steep edges
    r = math.sqrt((x + 1.0) ** 2 + (z - 0.9) ** 2)
    plateau_h = 0.85 / (1.0 + math.exp((r - 0.65) / 0.04))
    h += plateau_h

    # Slight tilt on plateau surface
    inside_plateau = 1.0 / (1.0 + math.exp((r - 0.6) / 0.03))
    h += inside_plateau * 0.05 * (x + 2.0) / 4.0  # gentle slope

    # ── Basin (lower left: x<0, z<0) ──
    r_basin = math.sqrt((x + 1.0) ** 2 + (z + 1.0) ** 2)
    basin_depression = -0.55 * math.exp(-r_basin ** 2 / (2 * 0.45 ** 2))
    h += basin_depression

    # Basin rim (slight rise around the depression)
    rim_factor = math.exp(-((r_basin - 0.55) ** 2) / (2 * 0.12 ** 2))
    h += rim_factor * 0.15

    # ── Plains (lower right: x>0, z<0) ──
    # Very low-amplitude undulations
    plains_mask = 1.0 / (1.0 + math.exp(-(x - 0.1) / 0.2))
    plains_mask *= 1.0 / (1.0 + math.exp(-(-z - 0.1) / 0.2))
    h += plains_mask * 0.04 * math.sin(4.0 * x) * math.cos(4.0 * z)
    h += plains_mask * 0.02 * math.sin(7.0 * x + 1.5) * math.cos(7.0 * z - 0.8)

    # ── Hills (global overlay, strongest in center) ──
    # Multi-octave sinusoidal undulations
    hill_factor = 1.0 - abs(x) / 2.5
    hill_factor *= 1.0 - abs(z) / 2.5
    hill_factor = max(0, hill_factor)

    h += 0.18 * math.sin(2.5 * x + 0.3) * math.cos(2.5 * z - 0.2) * max(0.3, hill_factor)
    h += 0.10 * math.sin(5.0 * x - 0.7) * math.cos(5.0 * z + 0.6) * max(0.2, hill_factor)
    h += 0.05 * math.sin(10.0 * x + 1.2) * math.cos(10.0 * z - 0.4) * max(0.1, hill_factor)
    h += 0.03 * math.sin(20.0 * x + 2.1) * math.cos(20.0 * z + 1.3) * max(0.05, hill_factor)

    # ── Edge falloff ──
    edge_r = math.sqrt(x ** 2 + z ** 2)
    edge_falloff = 1.0 / (1.0 + math.exp((edge_r - 1.85) / 0.08))
    h *= edge_falloff

    return h


def terrain_height_gradient(x, z):
    """Compute gradient (dh/dx, dh/dz) using central finite differences."""
    eps = 0.001
    dh_dx = (terrain_height(x + eps, z) - terrain_height(x - eps, z)) / (2 * eps)
    dh_dz = (terrain_height(x, z + eps) - terrain_height(x, z - eps)) / (2 * eps)
    return dh_dx, dh_dz


# ══════════════════════════════════════════════════════════════
#  VERTEX COLOR MAPPING
# ══════════════════════════════════════════════════════════════

def elevation_to_color(y):
    """Map elevation to RGB color."""
    if y < -0.1:
        # Deep basin: dark blue-green
        t = max(0, min(1, (y + 0.4) / 0.3))
        return (0.05 + 0.05 * t, 0.2 + 0.1 * t, 0.3 + 0.1 * t)
    elif y < 0.1:
        # Plains: green
        t = (y + 0.1) / 0.2
        return (0.15 + 0.1 * t, 0.5 + 0.1 * t, 0.1 + 0.05 * t)
    elif y < 0.4:
        # Hills: yellow-green
        t = (y - 0.1) / 0.3
        return (0.35 + 0.15 * t, 0.55 + 0.0 * t, 0.1 - 0.05 * t)
    elif y < 0.8:
        # Low mountains / plateau: brown
        t = (y - 0.4) / 0.4
        return (0.5 + 0.05 * t, 0.35 - 0.1 * t, 0.12 + 0.03 * t)
    elif y < 1.5:
        # Mountains: dark brown
        t = (y - 0.8) / 0.7
        return (0.45 - 0.05 * t, 0.22 - 0.05 * t, 0.1 + 0.02 * t)
    else:
        # Peaks: gray-white
        t = min(1.0, (y - 1.5) / 0.5)
        return (0.4 + 0.35 * t, 0.2 + 0.5 * t, 0.1 + 0.6 * t)


# ══════════════════════════════════════════════════════════════
#  GEOMETRY GENERATORS
# ══════════════════════════════════════════════════════════════

def create_grid_terrain():
    """Create a height-mapped terrain grid with vertex colors."""
    half = GRID_SIZE / 2.0
    verts = []
    norms = []
    colors = []
    indices = []

    print("  Generating terrain grid {}x{}...".format(GRID_RES, GRID_RES))

    # Vertices, normals, colors
    for iz in range(GRID_RES + 1):
        for ix in range(GRID_RES + 1):
            x = -half + ix * GRID_SIZE / GRID_RES
            z = -half + iz * GRID_SIZE / GRID_RES
            y = terrain_height(x, z)

            verts.append((x, y, z))

            # Normal from gradient
            dhx, dhz = terrain_height_gradient(x, z)
            nx = -dhx
            ny = 1.0
            nz = -dhz
            n_len = math.sqrt(nx * nx + ny * ny + nz * nz)
            norms.append((nx / n_len, ny / n_len, nz / n_len))

            colors.append(elevation_to_color(y))

    # Triangle indices
    row_len = GRID_RES + 1
    for iz in range(GRID_RES):
        for ix in range(GRID_RES):
            a = iz * row_len + ix
            b = a + row_len
            c = a + 1
            d = b + 1
            indices.append((a, b, c))
            indices.append((c, b, d))

    verts_arr = np.array(verts, dtype=np.float32)
    norms_arr = np.array(norms, dtype=np.float32)
    colors_arr = np.array(colors, dtype=np.float32)
    indices_arr = np.array(indices, dtype=np.uint32)

    return {
        "name": "TerrainSurface",
        "vertices": verts_arr,
        "normals": norms_arr,
        "colors": colors_arr,
        "indices": indices_arr,
        "vertex_count": len(verts),
        "index_count": len(indices) * 3,
        "min": verts_arr.min(axis=0).tolist(),
        "max": verts_arr.max(axis=0).tolist(),
    }


def generate_contour_lines(levels):
    """Generate contour line segments for given elevation levels.
    Uses Marching Squares on a dense sampling grid.
    Returns: (vertices array, indices array) for LINES mode."""
    half = GRID_SIZE / 2.0
    res = CONTOUR_SAMPLE
    dx = GRID_SIZE / res
    dz = GRID_SIZE / res

    print("  Generating contour lines ({} levels, {}x{} samples)...".format(
        len(levels), res, res))

    # Pre-sample height field
    h_grid = np.zeros((res + 1, res + 1), dtype=np.float32)
    for i in range(res + 1):
        for j in range(res + 1):
            x = -half + i * dx
            z = -half + j * dz
            h_grid[i, j] = terrain_height(x, z)

    all_verts = []
    all_indices = []

    for level in levels:
        # Find line segments at this level
        for i in range(res):
            for j in range(res):
                h00 = h_grid[i, j] - level
                h10 = h_grid[i + 1, j] - level
                h01 = h_grid[i, j + 1] - level
                h11 = h_grid[i + 1, j + 1] - level

                crossings = []

                # Bottom edge (i,j) → (i+1,j)
                if (h00 <= 0 < h10) or (h10 <= 0 < h00):
                    t = h00 / (h00 - h10) if h00 != h10 else 0.5
                    cx = -half + (i + t) * dx
                    cz = -half + j * dz
                    crossings.append((cx, level, cz))

                # Right edge (i+1,j) → (i+1,j+1)
                if (h10 <= 0 < h11) or (h11 <= 0 < h10):
                    t = h10 / (h10 - h11) if h10 != h11 else 0.5
                    cx = -half + (i + 1) * dx
                    cz = -half + (j + t) * dz
                    crossings.append((cx, level, cz))

                # Top edge (i,j+1) → (i+1,j+1)
                if (h11 <= 0 < h01) or (h01 <= 0 < h11):
                    t = h11 / (h11 - h01) if h11 != h01 else 0.5
                    cx = -half + (i + t) * dx
                    cz = -half + (j + 1) * dz
                    crossings.append((cx, level, cz))

                # Left edge (i,j) → (i,j+1)
                if (h01 <= 0 < h00) or (h00 <= 0 < h01):
                    t = h01 / (h01 - h00) if h01 != h00 else 0.5
                    cx = -half + i * dx
                    cz = -half + (j + t) * dz
                    crossings.append((cx, level, cz))

                # Form line segments from crossing points (pair up)
                for k in range(0, len(crossings) - 1, 2):
                    base = len(all_verts)
                    all_verts.append(crossings[k])
                    all_verts.append(crossings[k + 1])
                    all_indices.append(base)
                    all_indices.append(base + 1)

    print("  Generated {} line vertices, {} segments".format(
        len(all_verts), len(all_indices) // 2))

    if len(all_verts) == 0:
        # Provide a minimal dummy line to avoid empty geometry
        all_verts = [(0, 0, 0), (0.01, 0, 0)]
        all_indices = [0, 1]

    verts_arr = np.array(all_verts, dtype=np.float32)
    indices_arr = np.array(all_indices, dtype=np.uint32)
    all_pts = np.array(all_verts)
    y_vals = all_pts[:, 1] if len(all_pts) > 0 else np.array([0])

    return {
        "name": "ContourLines",
        "vertices": verts_arr,
        "indices": indices_arr,
        "vertex_count": len(all_verts),
        "index_count": len(all_indices),
        "min": [float(all_pts[:, 0].min()) if len(all_pts) > 0 else -2.0,
                float(y_vals.min()),
                float(all_pts[:, 2].min()) if len(all_pts) > 0 else -2.0],
        "max": [float(all_pts[:, 0].max()) if len(all_pts) > 0 else 2.0,
                float(y_vals.max()),
                float(all_pts[:, 2].max()) if len(all_pts) > 0 else 2.0],
    }


def create_cross_section():
    """Create a semi-transparent vertical plane for cross-section view."""
    half = GRID_SIZE / 2.0
    # Compute terrain height range at the center cross-section
    min_h = float('inf')
    max_h = float('-inf')
    for x in np.linspace(-half, half, 100):
        h = terrain_height(x, 0.0)
        min_h = min(min_h, h)
        max_h = max(max_h, h)

    # Extend slightly above/below terrain
    y_min = min_h - 0.3
    y_max = max_h + 0.3

    verts = [
        (-half, y_min, 0.0),
        (half,  y_min, 0.0),
        (half,  y_max, 0.0),
        (-half, y_max, 0.0),
    ]
    norms = [
        (0, 0, 1),
        (0, 0, 1),
        (0, 0, 1),
        (0, 0, 1),
    ]
    uvs = [
        (0, 0),
        (1, 0),
        (1, 1),
        (0, 1),
    ]
    indices = [(0, 1, 2), (0, 2, 3)]

    verts_arr = np.array(verts, dtype=np.float32)
    norms_arr = np.array(norms, dtype=np.float32)
    uvs_arr = np.array(uvs, dtype=np.float32)
    indices_arr = np.array(indices, dtype=np.uint32)

    return {
        "name": "CrossSection",
        "vertices": verts_arr,
        "normals": norms_arr,
        "texcoords": uvs_arr,
        "indices": indices_arr,
        "vertex_count": 4,
        "index_count": 6,
        "min": verts_arr.min(axis=0).tolist(),
        "max": verts_arr.max(axis=0).tolist(),
    }


def create_base_platform():
    """Create a flat circular base platform below the terrain."""
    radius = GRID_SIZE / 2.0 + 0.1
    segments = 64
    y_pos = -0.70  # below the basin

    verts = []
    norms = []
    uvs = []
    indices = []

    # Center vertex
    verts.append((0, y_pos, 0))
    norms.append((0, 1, 0))
    uvs.append((0.5, 0.5))

    # Ring vertices
    for i in range(segments + 1):
        angle = 2 * math.pi * i / segments
        x = math.cos(angle) * radius
        z = math.sin(angle) * radius
        verts.append((x, y_pos, z))
        norms.append((0, 1, 0))
        uvs.append((0.5 + math.cos(angle) * 0.5, 0.5 + math.sin(angle) * 0.5))

    for i in range(segments):
        indices.append((0, i + 1, i + 2))

    # Also create a bottom face and rim for a solid disc look
    # Bottom face (inverted)
    bottom_center = len(verts)
    verts.append((0, y_pos - 0.04, 0))
    norms.append((0, -1, 0))
    uvs.append((0.5, 0.5))

    for i in range(segments + 1):
        angle = 2 * math.pi * i / segments
        x = math.cos(angle) * radius
        z = math.sin(angle) * radius
        verts.append((x, y_pos - 0.04, z))
        norms.append((0, -1, 0))
        uvs.append((0.5 + math.cos(angle) * 0.5, 0.5 + math.sin(angle) * 0.5))

    for i in range(segments):
        indices.append((bottom_center, bottom_center + 2 + i, bottom_center + 1 + i))

    # Rim (side faces connecting top and bottom rings)
    rim_start = len(verts)
    for i in range(segments + 1):
        angle = 2 * math.pi * i / segments
        nx = math.cos(angle)
        nz = math.sin(angle)
        x = nx * radius
        z = nz * radius
        # Top edge
        verts.append((x, y_pos, z))
        norms.append((nx, 0, nz))
        uvs.append((i / segments, 0))
        # Bottom edge
        verts.append((x, y_pos - 0.04, z))
        norms.append((nx, 0, nz))
        uvs.append((i / segments, 1))

    for i in range(segments):
        t0 = rim_start + i * 2
        b0 = rim_start + i * 2 + 1
        t1 = rim_start + (i + 1) * 2
        b1 = rim_start + (i + 1) * 2 + 1
        indices.append((b0, b1, t0))
        indices.append((t0, b1, t1))

    verts_arr = np.array(verts, dtype=np.float32)
    norms_arr = np.array(norms, dtype=np.float32)
    uvs_arr = np.array(uvs, dtype=np.float32)
    indices_arr = np.array(indices, dtype=np.uint32)

    return {
        "name": "BasePlatform",
        "vertices": verts_arr,
        "normals": norms_arr,
        "texcoords": uvs_arr,
        "indices": indices_arr,
        "vertex_count": len(verts),
        "index_count": len(indices) * 3,
        "min": verts_arr.min(axis=0).tolist(),
        "max": verts_arr.max(axis=0).tolist(),
    }


# ══════════════════════════════════════════════════════════════
#  GLB BUILDER
# ══════════════════════════════════════════════════════════════

def build_glb(terrain_geo, contour_geo, section_geo, base_geo):
    """Build complete GLB for terrain topography model."""
    print("Building GLB binary...")

    buffers_parts = []
    buffer_view_list = []
    accessor_list = []

    def pack_float32_array(arr):
        offset = sum(len(b) for b in buffers_parts)
        data = arr.tobytes()
        if len(data) % 4:
            data += b'\x00' * (4 - len(data) % 4)
        buffers_parts.append(data)
        return offset, len(arr.tobytes())

    def pack_uint32_array(arr):
        offset = sum(len(b) for b in buffers_parts)
        data = arr.tobytes()
        if len(data) % 4:
            data += b'\x00' * (4 - len(data) % 4)
        buffers_parts.append(data)
        return offset, len(arr.tobytes())

    def make_buffer_view(byte_offset, byte_length, target=None):
        idx = len(buffer_view_list)
        bv = {"buffer": 0, "byteOffset": byte_offset, "byteLength": byte_length}
        if target:
            bv["target"] = target
        buffer_view_list.append(bv)
        return idx

    def make_accessor(view_idx, count, component_type, accessor_type, min_vals, max_vals):
        idx = len(accessor_list)
        acc = {
            "bufferView": view_idx,
            "componentType": component_type,
            "count": count,
            "type": accessor_type,
        }
        if min_vals is not None:
            acc["min"] = min_vals
            acc["max"] = max_vals
        accessor_list.append(acc)
        return idx

    # ── Pack each geometry ──
    # We need a flexible approach since different geometries have different attributes

    def pack_standard_geo(geo):
        """Pack geometry with POSITION, NORMAL, TEXCOORD_0, INDICES."""
        vo, vl = pack_float32_array(geo["vertices"].flatten())
        no, nl = pack_float32_array(geo["normals"].flatten())
        uo, ul = pack_float32_array(geo["texcoords"].flatten())
        io_, il_ = pack_uint32_array(geo["indices"].flatten())

        vv = make_buffer_view(vo, vl, 34962)
        nv = make_buffer_view(no, nl, 34962)
        uv = make_buffer_view(uo, ul, 34962)
        iv = make_buffer_view(io_, il_, 34963)

        va = make_accessor(vv, geo["vertex_count"], 5126, "VEC3", geo["min"], geo["max"])
        na = make_accessor(nv, geo["vertex_count"], 5126, "VEC3", None, None)
        ua = make_accessor(uv, geo["vertex_count"], 5126, "VEC2", None, None)
        ia = make_accessor(iv, geo["index_count"], 5125, "SCALAR", None, None)

        return {
            "position_accessor": va,
            "normal_accessor": na,
            "texcoord_accessor": ua,
            "index_accessor": ia,
        }

    def pack_terrain_geo(geo):
        """Pack terrain geometry with POSITION, NORMAL, COLOR_0, INDICES."""
        vo, vl = pack_float32_array(geo["vertices"].flatten())
        no, nl = pack_float32_array(geo["normals"].flatten())
        co, cl = pack_float32_array(geo["colors"].flatten())
        io_, il_ = pack_uint32_array(geo["indices"].flatten())

        vv = make_buffer_view(vo, vl, 34962)
        nv = make_buffer_view(no, nl, 34962)
        cv = make_buffer_view(co, cl, 34962)
        iv = make_buffer_view(io_, il_, 34963)

        va = make_accessor(vv, geo["vertex_count"], 5126, "VEC3", geo["min"], geo["max"])
        na = make_accessor(nv, geo["vertex_count"], 5126, "VEC3", None, None)
        ca = make_accessor(cv, geo["vertex_count"], 5126, "VEC3", None, None)
        ia = make_accessor(iv, geo["index_count"], 5125, "SCALAR", None, None)

        return {
            "position_accessor": va,
            "normal_accessor": na,
            "color_accessor": ca,
            "index_accessor": ia,
        }

    def pack_contour_geo(geo):
        """Pack contour line geometry with POSITION and INDICES only (LINES mode)."""
        vo, vl = pack_float32_array(geo["vertices"].flatten())
        io_, il_ = pack_uint32_array(geo["indices"].flatten())

        vv = make_buffer_view(vo, vl, 34962)
        iv = make_buffer_view(io_, il_, 34963)

        va = make_accessor(vv, geo["vertex_count"], 5126, "VEC3", geo["min"], geo["max"])
        ia = make_accessor(iv, geo["index_count"], 5125, "SCALAR", None, None)

        return {
            "position_accessor": va,
            "index_accessor": ia,
        }

    # Pack all geometries
    terrain_acc = pack_terrain_geo(terrain_geo)
    contour_acc = pack_contour_geo(contour_geo)
    section_acc = pack_standard_geo(section_geo)
    base_acc = pack_standard_geo(base_geo)

    # ── Materials ──
    materials = [
        {  # 0: Terrain surface (vertex-colored, opaque)
            "pbrMetallicRoughness": {
                "baseColorFactor": [1.0, 1.0, 1.0, 1.0],
                "metallicFactor": 0.0,
                "roughnessFactor": 0.85,
            },
            "name": "Terrain_Material",
            "doubleSided": True,
        },
        {  # 1: Contour lines (dark gray)
            "pbrMetallicRoughness": {
                "baseColorFactor": [0.12, 0.12, 0.12, 1.0],
                "metallicFactor": 0.0,
                "roughnessFactor": 0.5,
            },
            "name": "Contour_Material",
        },
        {  # 2: Cross-section plane (semi-transparent blue)
            "pbrMetallicRoughness": {
                "baseColorFactor": [0.35, 0.55, 0.85, 0.30],
                "metallicFactor": 0.0,
                "roughnessFactor": 0.5,
            },
            "name": "Section_Material",
            "alphaMode": "BLEND",
            "doubleSided": True,
        },
        {  # 3: Base platform (dark gray metallic)
            "pbrMetallicRoughness": {
                "baseColorFactor": [0.22, 0.25, 0.28, 1.0],
                "metallicFactor": 0.5,
                "roughnessFactor": 0.4,
            },
            "name": "Base_Material",
            "doubleSided": False,
        },
    ]

    # ── Meshes ──
    meshes = [
        {  # 0: Terrain surface
            "name": "TerrainSurface",
            "primitives": [{
                "attributes": {
                    "POSITION": terrain_acc["position_accessor"],
                    "NORMAL": terrain_acc["normal_accessor"],
                    "COLOR_0": terrain_acc["color_accessor"],
                },
                "indices": terrain_acc["index_accessor"],
                "material": 0,
            }],
        },
        {  # 1: Contour lines (LINES mode)
            "name": "ContourLines",
            "primitives": [{
                "attributes": {
                    "POSITION": contour_acc["position_accessor"],
                },
                "indices": contour_acc["index_accessor"],
                "material": 1,
                "mode": 1,  # LINES
            }],
        },
        {  # 2: Cross-section plane
            "name": "CrossSection",
            "primitives": [{
                "attributes": {
                    "POSITION": section_acc["position_accessor"],
                    "NORMAL": section_acc["normal_accessor"],
                    "TEXCOORD_0": section_acc["texcoord_accessor"],
                },
                "indices": section_acc["index_accessor"],
                "material": 2,
            }],
        },
        {  # 3: Base platform
            "name": "BasePlatform",
            "primitives": [{
                "attributes": {
                    "POSITION": base_acc["position_accessor"],
                    "NORMAL": base_acc["normal_accessor"],
                    "TEXCOORD_0": base_acc["texcoord_accessor"],
                },
                "indices": base_acc["index_accessor"],
                "material": 3,
            }],
        },
    ]

    # ── Nodes: all 4 siblings under scene root ──
    nodes = [
        {"name": "TerrainSurface", "mesh": 0},
        {"name": "ContourLines", "mesh": 1},
        {"name": "CrossSection", "mesh": 2},
        {"name": "BasePlatform", "mesh": 3},
    ]
    scene_nodes = [0, 1, 2, 3]

    # ── Assemble JSON ──
    gltf_json = {
        "asset": {"version": "2.0", "generator": "terrain-glb-generator"},
        "scene": 0,
        "scenes": [{"name": "TerrainTopography", "nodes": scene_nodes}],
        "nodes": nodes,
        "meshes": meshes,
        "materials": materials,
        "accessors": accessor_list,
        "bufferViews": buffer_view_list,
        "buffers": [{"byteLength": sum(len(b) for b in buffers_parts)}],
    }

    json_str = json.dumps(gltf_json, separators=(",", ":"), ensure_ascii=False)
    while len(json_str) % 4 != 0:
        json_str += " "
    json_bytes = json_str.encode("utf-8")

    json_body_padded = json_bytes
    if len(json_body_padded) % 4:
        json_body_padded += b' ' * (4 - len(json_body_padded) % 4)

    bin_body = b''.join(buffers_parts)
    if len(bin_body) % 4:
        bin_body += b'\x00' * (4 - len(bin_body) % 4)

    # GLB header
    total_length = 12 + 8 + len(json_body_padded) + 8 + len(bin_body)
    header = struct.pack('<I', 0x46546C67)
    header += struct.pack('<I', 2)
    header += struct.pack('<I', total_length)

    json_chunk = struct.pack('<I', len(json_body_padded))
    json_chunk += struct.pack('<I', 0x4E4F534A)
    json_chunk += json_body_padded

    bin_chunk = struct.pack('<I', len(bin_body))
    bin_chunk += struct.pack('<I', 0x004E4942)
    bin_chunk += bin_body

    glb_data = header + json_chunk + bin_chunk

    print("  GLB total size: {:.1f} MB".format(len(glb_data) / 1024 / 1024))
    print("  JSON chunk: {:.1f} KB".format(len(json_body_padded) / 1024))
    print("  BIN chunk: {:.1f} MB".format(len(bin_body) / 1024 / 1024))

    return glb_data


# ══════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════

def main():
    print("=" * 60)
    print("Terrain Topography GLB Generator")
    print("=" * 60)

    # 1. Create terrain mesh
    print("\n[1/4] Creating terrain surface...")
    terrain_geo = create_grid_terrain()
    print("  Vertices: {}, Triangles: {}".format(
        terrain_geo["vertex_count"], terrain_geo["index_count"] // 3))

    # 2. Generate contour lines
    print("\n[2/4] Generating contour lines...")
    # Determine elevation range
    half = GRID_SIZE / 2.0
    min_h = float('inf')
    max_h = float('-inf')
    for z in np.linspace(-half, half, 50):
        for x in np.linspace(-half, half, 50):
            h = terrain_height(x, z)
            min_h = min(min_h, h)
            max_h = max(max_h, h)
    print("  Elevation range: {:.2f} to {:.2f}".format(min_h, max_h))

    # Contour levels from 0 to max at interval
    start_level = math.ceil(min_h / CONTOUR_INTERVAL) * CONTOUR_INTERVAL
    contour_levels = []
    level = start_level
    while level <= max_h:
        contour_levels.append(round(level, 6))
        level += CONTOUR_INTERVAL

    contour_geo = generate_contour_lines(contour_levels)

    # 3. Create cross-section plane
    print("\n[3/4] Creating cross-section plane...")
    section_geo = create_cross_section()
    print("  Vertices: {}".format(section_geo["vertex_count"]))

    # 4. Create base platform
    print("\n[4/4] Creating base platform...")
    base_geo = create_base_platform()
    print("  Vertices: {}".format(base_geo["vertex_count"]))

    # 5. Build GLB
    print("")
    glb_data = build_glb(terrain_geo, contour_geo, section_geo, base_geo)

    # 6. Write output
    output_dir = os.path.dirname(OUTPUT_PATH)
    os.makedirs(output_dir, exist_ok=True)
    with open(OUTPUT_PATH, "wb") as f:
        f.write(glb_data)

    file_size_mb = len(glb_data) / 1024 / 1024
    print("\n[OK] Written: {}".format(OUTPUT_PATH))
    print("  File size: {:.1f} MB".format(file_size_mb))
    print("Done!")


if __name__ == "__main__":
    main()
