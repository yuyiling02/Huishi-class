#!/usr/bin/env python3
"""
Generate earth-political.glb — Political globe GLB for classroom use.
Uses PIL + numpy for texture generation, constructs GLB binary directly.
No Blender dependency. Natural Earth coastline data is downloaded for realism.

Output: public/models/earth-political.glb (target 15–35 MB)
"""

import numpy as np
from PIL import Image, ImageDraw, ImageFont
import json
import struct
import io
import os
import sys
import urllib.request
import math

# ── Config ────────────────────────────────────────────────────
TEX_WIDTH = 4096
TEX_HEIGHT = 2048
EARTH_RADIUS = 1.0
ATMOSPHERE_RADIUS = 1.02
LAT_SEGMENTS = 120  # latitude rings
LON_SEGMENTS = 240  # longitude segments
AXIS_TILT_DEG = 23.5
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "models", "earth-political.glb")

# Natural Earth 110m coastline GeoJSON URL (CC0 / public domain)
NE_COASTLINE_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/"
    "geojson/ne_110m_coastline.geojson"
)
NE_COUNTRIES_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/"
    "geojson/ne_110m_admin_0_countries.geojson"
)

# ── Helper: download with cache ──────────────────────────────
def download_geojson(url, cache_dir=None):
    """Download GeoJSON with local caching. Returns parsed dict or None."""
    if cache_dir is None:
        cache_dir = os.path.join(os.path.dirname(__file__), ".geo_cache")
    os.makedirs(cache_dir, exist_ok=True)
    cache_name = os.path.basename(url)
    cache_path = os.path.join(cache_dir, cache_name)

    if os.path.exists(cache_path):
        with open(cache_path, "r", encoding="utf-8") as f:
            return json.load(f)

    try:
        print(f"  Downloading {url} ...")
        req = urllib.request.Request(url, headers={"User-Agent": "earth-glb-generator/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(data, f)
        return data
    except Exception as e:
        print(f"  Download failed: {e}")
        return None


# ── GeoJSON rasterizer ───────────────────────────────────────
def latlon_to_pixel(lon, lat, w=TEX_WIDTH, h=TEX_HEIGHT):
    """Equirectangular projection: lon/lat → pixel (x, y)."""
    x = (lon + 180) / 360.0 * w
    y = (90 - lat) / 180.0 * h
    return x % w, max(0, min(h - 1, y))


def rasterize_geojson(geojson, w=TEX_WIDTH, h=TEX_HEIGHT, stroke_color=None, fill_color=None):
    """Rasterize GeoJSON features onto a PIL Image.
    Returns Image in RGBA mode suitable for compositing."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    features = geojson.get("features", [])
    total = len(features)
    for idx, feature in enumerate(features):
        if idx % max(1, total // 10) == 0:
            pct = int(idx / max(1, total) * 100)
            print(f"\r  Rasterizing features: {pct}%", end="", flush=True)

        geom = feature.get("geometry", {})
        geom_type = geom.get("type", "")
        coords = geom.get("coordinates", [])

        if geom_type == "Polygon":
            # coords = [outer_ring, hole1, hole2, ...]
            # each ring = [[lon, lat], [lon, lat], ...]
            rings = coords
        elif geom_type == "MultiPolygon":
            # coords = [[outer_ring, hole...], [outer_ring, hole...], ...]
            rings = []
            for poly in coords:
                rings.extend(poly)
        elif geom_type == "LineString":
            # coords = [[lon, lat], [lon, lat], ...]
            rings = [coords]
        elif geom_type == "MultiLineString":
            # coords = [[[lon, lat], ...], [[lon, lat], ...]]
            rings = coords
        else:
            continue

        for ring in rings:
            if len(ring) < 2:
                continue
            pixels = [latlon_to_pixel(lon, lat, w, h) for lon, lat in ring]
            if len(pixels) < 3 and fill_color:
                # Not enough for polygon fill, but can still stroke
                pass
            if fill_color and len(pixels) >= 3:
                draw.polygon(pixels, fill=fill_color)
            if stroke_color:
                draw.line(pixels + [pixels[0]], fill=stroke_color, width=1)

    print(f"\r  Rasterizing features: done ({total} features){' ' * 20}")
    return img


# ── Texture generation ───────────────────────────────────────
def generate_earth_texture():
    """Generate 4096x2048 equirectangular Earth texture with:
    - Ocean background
    - Landmasses from Natural Earth coastline
    - Country borders
    - Latitude/longitude grid
    - Chinese labels for continents and key countries
    """
    print("Generating Earth texture (4096x2048)...")

    img = Image.new("RGB", (TEX_WIDTH, TEX_HEIGHT))
    draw = ImageDraw.Draw(img)

    # ── 1. Ocean gradient ──
    print("  Drawing ocean background...")
    for y in range(TEX_HEIGHT):
        t = y / TEX_HEIGHT  # 0 at north pole, 1 at south pole
        # Darker at poles, lighter at equator
        r = int(30 + 20 * (1 - abs(t - 0.5) * 2))
        g = int(80 + 40 * (1 - abs(t - 0.5) * 2))
        b = int(140 + 40 * (1 - abs(t - 0.5) * 2))
        draw.line([(0, y), (TEX_WIDTH, y)], fill=(r, g, b))

    # ── 2. Download and rasterize coastline ──
    coastline_geo = download_geojson(NE_COASTLINE_URL)
    countries_geo = download_geojson(NE_COUNTRIES_URL)

    if coastline_geo:
        print("  Rasterizing landmasses...")
        land_mask = rasterize_geojson(coastline_geo, TEX_WIDTH, TEX_HEIGHT,
                                       fill_color=(80, 160, 80, 255))
        img.paste(land_mask, (0, 0), land_mask)

        # Add subtle terrain variation
        print("  Adding terrain shading...")
        land_pixels = img.load()
        land_alpha = land_mask.load()
        for y in range(TEX_HEIGHT):
            for x in range(TEX_WIDTH):
                if land_alpha[x, y][3] > 0:
                    r, g, b = land_pixels[x, y]
                    # Slight random variation for terrain texture
                    r = min(255, max(0, r + np.random.randint(-15, 15)))
                    g = min(255, max(0, g + np.random.randint(-15, 15)))
                    b = min(255, max(0, b + np.random.randint(-10, 10)))
                    land_pixels[x, y] = (r, g, b)

    if countries_geo:
        print("  Drawing country borders...")
        borders = rasterize_geojson(countries_geo, TEX_WIDTH, TEX_HEIGHT,
                                     stroke_color=(60, 60, 60, 200))
        img.paste(borders, (0, 0), borders)

    # ── 3. Latitude / Longitude grid ──
    print("  Drawing grid lines...")
    # Longitude lines every 15°
    for lon in range(-180, 180, 15):
        color = (200, 200, 200) if lon % 90 == 0 else (220, 220, 220)
        width = 2 if lon % 90 == 0 else 1
        for lat in range(-89, 90, 1):
            x1, y1 = latlon_to_pixel(lon, lat)
            x2, y2 = latlon_to_pixel(lon, lat + 1)
            draw.line([(x1, y1), (x2, y2)], fill=color, width=width)

    # Latitude lines every 15°
    for lat in range(-75, 76, 15):
        color = (200, 200, 200) if lat == 0 else (220, 220, 220)
        width = 2 if lat == 0 else 1
        for lon in range(-180, 179, 1):
            x1, y1 = latlon_to_pixel(lon, lat)
            x2, y2 = latlon_to_pixel(lon + 1, lat)
            draw.line([(x1, y1), (x2, y2)], fill=color, width=width)

    # Tropic and arctic lines (dashed)
    for lat, name, color in [(23.5, "北回归线", (255, 180, 100)),
                              (-23.5, "南回归线", (255, 180, 100)),
                              (66.5, "北极圈", (150, 180, 220)),
                              (-66.5, "南极圈", (150, 180, 220))]:
        for lon in range(-180, 178, 3):
            x1, y1 = latlon_to_pixel(lon, lat)
            x2, y2 = latlon_to_pixel(lon + 2, lat)
            draw.line([(x1, y1), (x2, y2)], fill=color, width=1)

    # ── 4. Chinese labels ──
    print("  Adding Chinese labels...")
    # Try to load a CJK font
    font_paths = [
        "C:/Windows/Fonts/msyh.ttc",       # Microsoft YaHei
        "C:/Windows/Fonts/simsun.ttc",      # SimSun
        "C:/Windows/Fonts/simhei.ttf",      # SimHei
        "C:/Windows/Fonts/Deng.ttf",        # DengXian
        "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    ]
    font = None
    font_size_large = 48
    font_size_small = 32
    for fp in font_paths:
        if os.path.exists(fp):
            try:
                font = ImageFont.truetype(fp, font_size_large)
                font_small = ImageFont.truetype(fp, font_size_small)
                print(f"  Using font: {fp}")
                break
            except Exception:
                continue

    if font is None:
        font = ImageFont.load_default()
        font_small = font
        print("  WARNING: No CJK font found — labels may not display correctly")

    # Continent labels
    continent_labels = [
        ("亚  洲", 90, 45),
        ("欧  洲", 10, 52),
        ("非  洲", 20, 0),
        ("北 美 洲", -98, 40),
        ("南 美 洲", -60, -15),
        ("大 洋 洲", 135, -22),
        ("南 极 洲", 0, -82),
    ]
    for text, lon, lat in continent_labels:
        x, y = latlon_to_pixel(lon, lat)
        bbox = draw.textbbox((0, 0), text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        # Shadow
        draw.text((x - tw // 2 + 2, y - th // 2 + 2), text, fill=(0, 0, 0), font=font)
        # White text
        draw.text((x - tw // 2, y - th // 2), text, fill=(255, 255, 255), font=font)

    # Ocean labels
    ocean_labels = [
        ("太 平 洋", -140, -10),
        ("大 西 洋", -25, -5),
        ("印 度 洋", 70, -15),
        ("北 冰 洋", 0, 80),
    ]
    for text, lon, lat in ocean_labels:
        x, y = latlon_to_pixel(lon, lat)
        bbox = draw.textbbox((0, 0), text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text((x - tw // 2 + 1, y - th // 2 + 1), text, fill=(30, 50, 120), font=font)
        draw.text((x - tw // 2, y - th // 2), text, fill=(200, 220, 255), font=font)

    # Key country labels
    country_labels = [
        ("中国", 104, 35),
        ("俄罗斯", 90, 60),
        ("美国", -100, 38),
        ("巴西", -55, -8),
        ("印度", 78, 22),
        ("澳大利亚", 134, -25),
        ("加拿大", -102, 58),
        ("阿根廷", -64, -35),
        ("日本", 138, 36),
        ("英国", -2, 54),
        ("法国", 2, 47),
        ("德国", 10, 51),
        ("埃及", 31, 27),
        ("南非", 25, -29),
    ]
    for text, lon, lat in country_labels:
        x, y = latlon_to_pixel(lon, lat)
        bbox = draw.textbbox((0, 0), text, font=font_small)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text((x - tw // 2 + 1, y - th // 2 + 1), text, fill=(0, 0, 0), font=font_small)
        draw.text((x - tw // 2, y - th // 2), text, fill=(255, 255, 200), font=font_small)

    print("  Texture generation complete.")
    return img


# ── 3D Geometry generators ───────────────────────────────────
def create_uv_sphere(radius, lat_segments, lon_segments, name="sphere"):
    """Create UV sphere vertices, normals, texcoords, indices.
    Returns dict with all arrays + metadata."""
    verts = []
    norms = []
    uvs = []
    indices = []

    # Generate vertices row by row (pole to pole)
    for lat_i in range(lat_segments + 1):
        phi = math.pi * lat_i / lat_segments  # 0 at north pole, pi at south pole
        y = math.cos(phi) * radius
        ring_radius = math.sin(phi) * radius

        for lon_i in range(lon_segments + 1):
            theta = 2 * math.pi * lon_i / lon_segments
            x = math.cos(theta) * ring_radius
            z = math.sin(theta) * ring_radius

            verts.append((x, y, z))
            # Normal = normalized position for a sphere
            n_len = math.sqrt(x * x + y * y + z * z)
            norms.append((x / n_len, y / n_len, z / n_len) if n_len > 0 else (0, 1, 0))
            # UV: u from 0 to 1, v from 0 to 1
            u = lon_i / lon_segments
            v = lat_i / lat_segments
            uvs.append((u, v))

    # Generate triangle indices (two per quad)
    for lat_i in range(lat_segments):
        for lon_i in range(lon_segments):
            a = lat_i * (lon_segments + 1) + lon_i
            b = a + lon_segments + 1
            c = a + 1
            d = b + 1

            indices.append((a, b, c))
            indices.append((c, b, d))

    # Pad UV seam at lon=360° to avoid texture wrap artifacts
    # (vertices at lon_i=lon_segments have u=1.0 which is correct for equirectangular)

    verts_arr = np.array(verts, dtype=np.float32)
    norms_arr = np.array(norms, dtype=np.float32)
    uvs_arr = np.array(uvs, dtype=np.float32)
    indices_arr = np.array(indices, dtype=np.uint32)

    return {
        "name": name,
        "vertices": verts_arr,
        "normals": norms_arr,
        "texcoords": uvs_arr,
        "indices": indices_arr,
        "vertex_count": len(verts),
        "index_count": len(indices) * 3,  # triangles * 3
        "min": verts_arr.min(axis=0).tolist(),
        "max": verts_arr.max(axis=0).tolist(),
    }


def create_cylinder(radius_bottom, radius_top, height, segments, name="cylinder"):
    """Create cylinder (or truncated cone) geometry."""
    verts = []
    norms = []
    uvs = []
    indices = []

    half_h = height / 2

    # Side vertices
    for i in range(segments + 1):
        angle = 2 * math.pi * i / segments
        nx = math.cos(angle)
        nz = math.sin(angle)
        x_bottom = nx * radius_bottom
        z_bottom = nz * radius_bottom
        x_top = nx * radius_top
        z_top = nz * radius_top
        u = i / segments

        # Bottom ring vertex
        verts.append((x_bottom, -half_h, z_bottom))
        norms.append((nx, 0, nz))
        uvs.append((u, 0))

        # Top ring vertex
        verts.append((x_top, half_h, z_top))
        norms.append((nx, 0, nz))
        uvs.append((u, 1))

    # Side triangles
    for i in range(segments):
        b0 = i * 2       # bottom
        t0 = i * 2 + 1   # top
        b1 = (i + 1) * 2
        t1 = (i + 1) * 2 + 1
        indices.append((b0, b1, t0))
        indices.append((t0, b1, t1))

    # Top cap
    top_center = len(verts)
    verts.append((0, half_h, 0))
    norms.append((0, 1, 0))
    uvs.append((0.5, 0.5))
    for i in range(segments):
        t0 = i * 2 + 1
        t1 = (i + 1) * 2 + 1
        indices.append((top_center, t0, t1))

    # Bottom cap
    bottom_center = len(verts)
    verts.append((0, -half_h, 0))
    norms.append((0, -1, 0))
    uvs.append((0.5, 0.5))
    for i in range(segments):
        b0 = i * 2
        b1 = (i + 1) * 2
        indices.append((bottom_center, b1, b0))

    verts_arr = np.array(verts, dtype=np.float32)
    norms_arr = np.array(norms, dtype=np.float32)
    uvs_arr = np.array(uvs, dtype=np.float32)
    indices_arr = np.array(indices, dtype=np.uint32)

    return {
        "name": name,
        "vertices": verts_arr,
        "normals": norms_arr,
        "texcoords": uvs_arr,
        "indices": indices_arr,
        "vertex_count": len(verts),
        "index_count": len(indices) * 3,
        "min": verts_arr.min(axis=0).tolist(),
        "max": verts_arr.max(axis=0).tolist(),
    }


def create_disc(radius, segments, y_position=0, name="disc"):
    """Create a flat disc at a given y position."""
    verts = []
    norms = []
    uvs = []
    indices = []

    center = len(verts)
    verts.append((0, y_position, 0))
    norms.append((0, 1, 0))
    uvs.append((0.5, 0.5))

    for i in range(segments + 1):
        angle = 2 * math.pi * i / segments
        x = math.cos(angle) * radius
        z = math.sin(angle) * radius
        verts.append((x, y_position, z))
        norms.append((0, 1, 0))
        uvs.append((0.5 + math.cos(angle) * 0.5, 0.5 + math.sin(angle) * 0.5))

    for i in range(segments):
        indices.append((center, center + 1 + i, center + 1 + i + 1))

    verts_arr = np.array(verts, dtype=np.float32)
    norms_arr = np.array(norms, dtype=np.float32)
    uvs_arr = np.array(uvs, dtype=np.float32)
    indices_arr = np.array(indices, dtype=np.uint32)

    return {
        "name": name,
        "vertices": verts_arr,
        "normals": norms_arr,
        "texcoords": uvs_arr,
        "indices": indices_arr,
        "vertex_count": len(verts),
        "index_count": len(indices) * 3,
        "min": verts_arr.min(axis=0).tolist(),
        "max": verts_arr.max(axis=0).tolist(),
    }


# ── GLB binary construction ──────────────────────────────────
def build_glb(earth_geo, atmosphere_geo, axis_geo, stand_geos, texture_img):
    """Build a complete GLB binary file from geometry and texture data.
    Returns bytes of the GLB file."""

    print("Building GLB binary...")

    # ── Prepare binary buffer ──
    buffers_parts = []
    buffer_view_list = []
    accessor_list = []

    def pack_float32_array(arr):
        """Pack numpy float32 array into bytes, return (offset, length)."""
        offset = sum(len(b) for b in buffers_parts)
        data = arr.tobytes()
        # Pad to 4-byte alignment
        if len(data) % 4:
            data += b'\x00' * (4 - len(data) % 4)
        buffers_parts.append(data)
        length = len(arr.tobytes())
        return offset, length

    def pack_uint32_array(arr):
        """Pack numpy uint32 array into bytes."""
        offset = sum(len(b) for b in buffers_parts)
        data = arr.tobytes()
        if len(data) % 4:
            data += b'\x00' * (4 - len(data) % 4)
        buffers_parts.append(data)
        length = len(arr.tobytes())
        return offset, length

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

    # ── Pack all geometry into binary buffer ──
    all_geos = [earth_geo]
    if atmosphere_geo:
        all_geos.append(atmosphere_geo)
    all_geos.append(axis_geo)
    all_geos.extend(stand_geos)

    mesh_data = []  # per-mesh: {name, accessors dict}

    for geo in all_geos:
        vo, vl = pack_float32_array(geo["vertices"].flatten())
        no, nl = pack_float32_array(geo["normals"].flatten())
        uo, ul = pack_float32_array(geo["texcoords"].flatten())
        idx_off, idx_len = pack_uint32_array(geo["indices"].flatten())

        vv = make_buffer_view(vo, vl, 34962)  # ARRAY_BUFFER
        nv = make_buffer_view(no, nl, 34962)
        uv = make_buffer_view(uo, ul, 34962)
        iv = make_buffer_view(idx_off, idx_len, 34963)  # ELEMENT_ARRAY_BUFFER

        va = make_accessor(vv, geo["vertex_count"], 5126, "VEC3", geo["min"], geo["max"])
        na = make_accessor(nv, geo["vertex_count"], 5126, "VEC3", None, None)
        ua = make_accessor(uv, geo["vertex_count"], 5126, "VEC2", None, None)
        ia = make_accessor(iv, geo["index_count"], 5125, "SCALAR", None, None)

        mesh_data.append({
            "name": geo["name"],
            "position_accessor": va,
            "normal_accessor": na,
            "texcoord_accessor": ua,
            "index_accessor": ia,
        })

    # ── Embed texture PNG ──
    tex_bytes_io = io.BytesIO()
    texture_img.save(tex_bytes_io, format="PNG", optimize=True)
    tex_bytes = tex_bytes_io.getvalue()
    print(f"  Texture PNG size: {len(tex_bytes) / 1024 / 1024:.1f} MB")

    # Pad texture to 4-byte alignment
    tex_offset = sum(len(b) for b in buffers_parts)
    if tex_offset % 4:
        buffers_parts.append(b'\x00' * (4 - tex_offset % 4))
        tex_offset = sum(len(b) for b in buffers_parts)

    buffers_parts.append(tex_bytes)
    tex_length = len(tex_bytes)

    # Create buffer view for texture
    tex_bv_idx = len(buffer_view_list)
    buffer_view_list.append({"buffer": 0, "byteOffset": tex_offset, "byteLength": tex_length})

    # ── Build JSON ──
    # Images
    image_idx = 0
    images = [{"bufferView": tex_bv_idx, "mimeType": "image/png"}]

    # Textures
    texture_idx = 0
    textures = [{"sampler": 0, "source": image_idx}]

    # Samplers
    samplers = [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}]

    # Materials
    # Earth material (opaque, textured)
    earth_material_idx = 0
    # Atmosphere material (transparent blue, no texture)
    atmosphere_material_idx = 1
    # Axis/Stand material (dark gray metallic)
    stand_material_idx = 2

    materials = [
        {  # Earth
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": texture_idx},
                "metallicFactor": 0.0,
                "roughnessFactor": 0.85,
            },
            "name": "Earth_Surface",
            "doubleSided": False,
        },
        {  # Atmosphere
            "pbrMetallicRoughness": {
                "baseColorFactor": [0.53, 0.81, 0.98, 0.15],
                "metallicFactor": 0.0,
                "roughnessFactor": 0.3,
            },
            "name": "Atmosphere",
            "alphaMode": "BLEND",
            "doubleSided": False,
        },
        {  # Stand
            "pbrMetallicRoughness": {
                "baseColorFactor": [0.25, 0.28, 0.32, 1.0],
                "metallicFactor": 0.6,
                "roughnessFactor": 0.3,
            },
            "name": "Stand_Material",
            "doubleSided": False,
        },
    ]

    # Meshes
    meshes = []
    for i, md in enumerate(mesh_data):
        mat_idx = 0  # default: Earth
        if "Atmosphere" in md["name"]:
            mat_idx = atmosphere_material_idx
        elif md["name"] not in ("Earth_Surface",):
            mat_idx = stand_material_idx

        prim = {
            "attributes": {
                "POSITION": md["position_accessor"],
                "NORMAL": md["normal_accessor"],
                "TEXCOORD_0": md["texcoord_accessor"],
            },
            "indices": md["index_accessor"],
            "material": mat_idx,
        }
        meshes.append({"name": md["name"], "primitives": [prim]})

    # Nodes — build the hierarchy
    nodes = []

    # Earth node
    earth_node_idx = len(nodes)
    nodes.append({
        "name": "Earth_Surface",
        "mesh": 0,  # earth_geo
    })

    # Atmosphere node (same position as Earth, no rotation)
    atmo_node_idx = len(nodes)
    nodes.append({
        "name": "Atmosphere",
        "mesh": 1,  # atmosphere_geo
    })

    # Earth group (Earth + Atmosphere together)
    earth_group_idx = len(nodes)
    nodes.append({
        "name": "Earth_Group",
        "children": [earth_node_idx, atmo_node_idx],
    })

    # Axis tilt quaternion: rotate 23.5° around Z axis
    half_angle = math.radians(AXIS_TILT_DEG) / 2.0
    qz = math.sin(half_angle)
    qw = math.cos(half_angle)

    # The axis line itself — a thin marker line that is NOT tilted
    # (it shows the rotation axis visually)
    axis_node_idx = len(nodes)
    nodes.append({
        "name": "Axis_23_5",
        "mesh": 2,  # axis_geo (tilted together with Earth)
    })

    # Tilted group — Earth + Atmosphere + Axis all tilted together
    tilted_group_idx = len(nodes)
    nodes.append({
        "name": "Tilted_Group",
        "rotation": [0, 0, qz, qw],  # quaternion [x, y, z, w]
        "children": [earth_group_idx, axis_node_idx],
    })

    # Stand nodes — children of root, alongside the tilted group
    stand_indices = []
    for si, sg in enumerate(stand_geos):
        mesh_idx_base = 3 + si  # meshes 3, 4, 5 for stand parts
        stand_node_idx = len(nodes)
        nodes.append({
            "name": sg["name"],
            "mesh": mesh_idx_base,
        })
        stand_indices.append(stand_node_idx)

    # Scene root: tilted group + stand parts
    scene_nodes = [tilted_group_idx] + stand_indices

    # ── Assemble JSON ──
    gltf_json = {
        "asset": {"version": "2.0", "generator": "earth-glb-generator"},
        "scene": 0,
        "scenes": [{"name": "PoliticalGlobe", "nodes": scene_nodes}],
        "nodes": nodes,
        "meshes": meshes,
        "materials": materials,
        "textures": textures,
        "images": images,
        "samplers": samplers,
        "accessors": accessor_list,
        "bufferViews": buffer_view_list,
        "buffers": [{"byteLength": sum(len(b) for b in buffers_parts)}],
    }

    json_str = json.dumps(gltf_json, separators=(",", ":"), ensure_ascii=False)
    # Pad JSON with spaces to 4-byte alignment
    while len(json_str) % 4 != 0:
        json_str += " "
    json_bytes = json_str.encode("utf-8")

    # ── Assemble GLB binary ──
    # Pad JSON chunk body to 4-byte boundary
    json_body_padded = json_bytes
    if len(json_body_padded) % 4:
        json_body_padded += b' ' * (4 - len(json_body_padded) % 4)

    # Combine all binary buffers
    bin_body = b''.join(buffers_parts)
    if len(bin_body) % 4:
        bin_body += b'\x00' * (4 - len(bin_body) % 4)

    # GLB header
    total_length = 12  # header
    total_length += 8 + len(json_body_padded)  # JSON chunk
    total_length += 8 + len(bin_body)  # BIN chunk

    header = struct.pack('<I', 0x46546C67)  # magic "glTF"
    header += struct.pack('<I', 2)           # version
    header += struct.pack('<I', total_length)

    # JSON chunk
    json_chunk = struct.pack('<I', len(json_body_padded))
    json_chunk += struct.pack('<I', 0x4E4F534A)  # "JSON"
    json_chunk += json_body_padded

    # BIN chunk
    bin_chunk = struct.pack('<I', len(bin_body))
    bin_chunk += struct.pack('<I', 0x004E4942)  # "BIN\0"
    bin_chunk += bin_body

    glb_data = header + json_chunk + bin_chunk

    print(f"  GLB total size: {len(glb_data) / 1024 / 1024:.1f} MB")
    print(f"  JSON chunk: {len(json_body_padded) / 1024:.1f} KB")
    print(f"  BIN chunk: {len(bin_body) / 1024 / 1024:.1f} MB")

    return glb_data


# ── Main ──────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("Earth Political Globe GLB Generator")
    print("=" * 60)

    # 1. Generate texture
    texture = generate_earth_texture()

    # 2. Create geometry
    print("\nCreating 3D geometry...")
    earth_geo = create_uv_sphere(EARTH_RADIUS, LAT_SEGMENTS, LON_SEGMENTS, "Earth_Surface")
    print(f"  Earth sphere: {earth_geo['vertex_count']} verts, {earth_geo['index_count']} indices")

    atmosphere_geo = create_uv_sphere(ATMOSPHERE_RADIUS, 60, 120, "Atmosphere")
    print(f"  Atmosphere sphere: {atmosphere_geo['vertex_count']} verts")

    # Axis: thin cylinder through Earth center
    axis_length = EARTH_RADIUS * 2.6  # extend beyond poles
    axis_geo = create_cylinder(0.02, 0.02, axis_length, 12, "Axis_23_5")
    # Center the axis vertically
    axis_geo["vertices"] = axis_geo["vertices"]  # already centered at origin
    print(f"  Axis: {axis_geo['vertex_count']} verts")

    # Stand: base disc + post
    stand_parts = []
    base_disc = create_disc(0.3, 32, y_position=-1.15, name="Stand_Base")
    stand_parts.append(base_disc)

    # Base cylinder
    base_cyl = create_cylinder(0.28, 0.25, 0.12, 32, "Stand_BaseRing")
    base_cyl["vertices"][:, 1] -= 1.09  # shift down
    stand_parts.append(base_cyl)

    # Post
    post = create_cylinder(0.04, 0.04, 0.45, 16, "Stand_Post")
    post["vertices"][:, 1] -= 0.9  # shift down
    stand_parts.append(post)

    for sp in stand_parts:
        sp_name = sp["name"]
        print(f"  {sp_name}: {sp['vertex_count']} verts")

    # 3. Build GLB
    print("")
    glb_data = build_glb(earth_geo, atmosphere_geo, axis_geo, stand_parts, texture)

    # 4. Write output
    output_dir = os.path.dirname(OUTPUT_PATH)
    os.makedirs(output_dir, exist_ok=True)
    with open(OUTPUT_PATH, "wb") as f:
        f.write(glb_data)

    file_size_mb = len(glb_data) / 1024 / 1024
    print(f"\n[OK] Written: {OUTPUT_PATH}")
    print(f"  File size: {file_size_mb:.1f} MB")
    print("Done!")


if __name__ == "__main__":
    main()
