#!/usr/bin/env python3
"""
Generate public/models/earth-layers.glb.

The model is intentionally diagrammatic for classroom use: a large opaque
cutaway Earth with exaggerated layer thickness, callout labels, and clear
colored cross-sections. The four top-level layer groups remain detachable in
the app's hand-interaction workflow.
"""

import io
import json
import math
import os
import struct
from typing import Dict, Iterable, List, Sequence, Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


SCRIPT_DIR = os.path.dirname(__file__)
OUTPUT_PATH = os.path.join(SCRIPT_DIR, "..", "public", "models", "earth-layers.glb")

LAT_SEGMENTS = 88
LON_SEGMENTS = 176
CUT_CENTER = math.radians(45.0)
CUT_ANGLE = math.radians(104.0)
THETA_START = CUT_CENTER + CUT_ANGLE / 2.0
THETA_END = CUT_CENTER + (math.pi * 2.0) - CUT_ANGLE / 2.0

FRONT_DIR = np.array([math.cos(CUT_CENTER), 0.0, math.sin(CUT_CENTER)], dtype=np.float32)
LABEL_NORMAL = np.array([0.58, 0.58, 0.58], dtype=np.float32)
WORLD_UP = np.array([0.0, 1.0, 0.0], dtype=np.float32)

LAYER_SPECS = [
    {
        "key": "Crust",
        "title": "地壳",
        "subtitle": "固态薄壳",
        "outer": 2.20,
        "inner": 1.98,
        "color": (0.24, 0.58, 0.40),
        "cut_color": (0.32, 0.70, 0.45),
        "label_y": 1.35,
    },
    {
        "key": "Mantle",
        "title": "地幔",
        "subtitle": "高温固态",
        "outer": 1.98,
        "inner": 1.12,
        "color": (0.93, 0.34, 0.11),
        "cut_color": (0.96, 0.42, 0.13),
        "label_y": 0.58,
    },
    {
        "key": "OuterCore",
        "title": "外核",
        "subtitle": "液态金属",
        "outer": 1.12,
        "inner": 0.55,
        "color": (1.00, 0.64, 0.10),
        "cut_color": (1.00, 0.70, 0.13),
        "label_y": -0.20,
    },
    {
        "key": "InnerCore",
        "title": "内核",
        "subtitle": "高压固态",
        "outer": 0.55,
        "inner": 0.00,
        "color": (1.00, 0.92, 0.34),
        "cut_color": (1.00, 0.96, 0.42),
        "label_y": -0.88,
    },
]


def normalize(v: np.ndarray) -> np.ndarray:
    length = float(np.linalg.norm(v))
    if length <= 1e-8:
        return v.astype(np.float32)
    return (v / length).astype(np.float32)


def sphere_point(radius: float, phi: float, theta: float) -> np.ndarray:
    sin_phi = math.sin(phi)
    return np.array(
        [
            radius * sin_phi * math.cos(theta),
            radius * math.cos(phi),
            radius * sin_phi * math.sin(theta),
        ],
        dtype=np.float32,
    )


def theta_tangent(theta: float) -> np.ndarray:
    return normalize(np.array([-math.sin(theta), 0.0, math.cos(theta)], dtype=np.float32))


def make_geometry(
    name: str,
    layer: str,
    material: str,
    vertices: Sequence[Sequence[float]],
    normals: Sequence[Sequence[float]],
    texcoords: Sequence[Sequence[float]],
    indices: Sequence[Sequence[int]],
) -> Dict:
    verts = np.array(vertices, dtype=np.float32).reshape((-1, 3))
    norms = np.array(normals, dtype=np.float32).reshape((-1, 3))
    uvs = np.array(texcoords, dtype=np.float32).reshape((-1, 2))
    inds = np.array(indices, dtype=np.uint32).reshape((-1, 3))
    return {
        "name": name,
        "layer": layer,
        "material": material,
        "vertices": verts,
        "normals": norms,
        "texcoords": uvs,
        "indices": inds,
        "vertex_count": int(verts.shape[0]),
        "index_count": int(inds.size),
        "min": verts.min(axis=0).tolist(),
        "max": verts.max(axis=0).tolist(),
    }


def create_spherical_surface(
    name: str,
    layer: str,
    radius: float,
    normal_sign: float,
    material: str,
    lat_segments: int = LAT_SEGMENTS,
    lon_segments: int = LON_SEGMENTS,
) -> Dict:
    vertices: List[np.ndarray] = []
    normals: List[np.ndarray] = []
    texcoords: List[Tuple[float, float]] = []
    indices: List[Tuple[int, int, int]] = []

    for lat_i in range(lat_segments + 1):
        phi = math.pi * lat_i / lat_segments
        for lon_i in range(lon_segments + 1):
            theta = THETA_START + (THETA_END - THETA_START) * lon_i / lon_segments
            point = sphere_point(radius, phi, theta)
            normal = normalize(point) * normal_sign
            vertices.append(point)
            normals.append(normal)
            texcoords.append(((theta % (math.pi * 2.0)) / (math.pi * 2.0), phi / math.pi))

    row = lon_segments + 1
    for lat_i in range(lat_segments):
        for lon_i in range(lon_segments):
            a = lat_i * row + lon_i
            b = (lat_i + 1) * row + lon_i
            c = a + 1
            d = b + 1
            if normal_sign > 0:
                indices.append((a, b, c))
                indices.append((c, b, d))
            else:
                indices.append((a, c, b))
                indices.append((c, d, b))

    return make_geometry(name, layer, material, vertices, normals, texcoords, indices)


def create_cut_face(
    name: str,
    layer: str,
    outer_radius: float,
    inner_radius: float,
    theta: float,
    outward_sign: float,
    material: str,
    lat_segments: int = LAT_SEGMENTS,
) -> Dict:
    radial_segments = 1 if inner_radius > 0 else 24
    vertices: List[np.ndarray] = []
    normals: List[np.ndarray] = []
    texcoords: List[Tuple[float, float]] = []
    indices: List[Tuple[int, int, int]] = []

    radii = np.linspace(inner_radius, outer_radius, radial_segments + 1)
    normal = theta_tangent(theta) * outward_sign

    for lat_i in range(lat_segments + 1):
        phi = math.pi * lat_i / lat_segments
        for radius in radii:
            vertices.append(sphere_point(float(radius), phi, theta))
            normals.append(normal)
            texcoords.append((0.0 if outer_radius == 0 else float(radius) / outer_radius, phi / math.pi))

    row = radial_segments + 1
    for lat_i in range(lat_segments):
        for radial_i in range(radial_segments):
            a = lat_i * row + radial_i
            b = (lat_i + 1) * row + radial_i
            c = a + 1
            d = b + 1
            if outward_sign > 0:
                indices.append((a, b, c))
                indices.append((c, b, d))
            else:
                indices.append((a, c, b))
                indices.append((c, d, b))

    return make_geometry(name, layer, material, vertices, normals, texcoords, indices)


def create_meridian_tube(
    name: str,
    layer: str,
    radius: float,
    theta: float,
    tube_radius: float,
    material: str,
    segments: int = 112,
    sides: int = 8,
) -> Dict:
    vertices: List[np.ndarray] = []
    normals: List[np.ndarray] = []
    texcoords: List[Tuple[float, float]] = []
    indices: List[Tuple[int, int, int]] = []
    side_axis = theta_tangent(theta)

    for i in range(segments + 1):
        phi = math.pi * i / segments
        center = sphere_point(radius, phi, theta)
        tangent = normalize(
            np.array(
                [
                    radius * math.cos(phi) * math.cos(theta),
                    -radius * math.sin(phi),
                    radius * math.cos(phi) * math.sin(theta),
                ],
                dtype=np.float32,
            )
        )
        radial_axis = normalize(np.cross(tangent, side_axis))
        for side in range(sides):
            angle = math.pi * 2.0 * side / sides
            normal = normalize(math.cos(angle) * side_axis + math.sin(angle) * radial_axis)
            vertices.append(center + normal * tube_radius)
            normals.append(normal)
            texcoords.append((side / sides, i / segments))

    row = sides
    for i in range(segments):
        for side in range(sides):
            a = i * row + side
            b = (i + 1) * row + side
            c = i * row + ((side + 1) % sides)
            d = (i + 1) * row + ((side + 1) % sides)
            indices.append((a, b, c))
            indices.append((c, b, d))

    return make_geometry(name, layer, material, vertices, normals, texcoords, indices)


def create_segment_tube(
    name: str,
    layer: str,
    start: np.ndarray,
    end: np.ndarray,
    tube_radius: float,
    material: str,
    segments: int = 12,
    sides: int = 8,
) -> Dict:
    vertices: List[np.ndarray] = []
    normals: List[np.ndarray] = []
    texcoords: List[Tuple[float, float]] = []
    indices: List[Tuple[int, int, int]] = []

    axis = normalize(end - start)
    side_axis = normalize(np.cross(WORLD_UP, axis))
    if float(np.linalg.norm(side_axis)) <= 1e-5:
        side_axis = np.array([1.0, 0.0, 0.0], dtype=np.float32)
    up_axis = normalize(np.cross(axis, side_axis))

    for i in range(segments + 1):
        t = i / segments
        center = start * (1.0 - t) + end * t
        for side in range(sides):
            angle = math.pi * 2.0 * side / sides
            normal = normalize(math.cos(angle) * side_axis + math.sin(angle) * up_axis)
            vertices.append(center + normal * tube_radius)
            normals.append(normal)
            texcoords.append((side / sides, t))

    row = sides
    for i in range(segments):
        for side in range(sides):
            a = i * row + side
            b = (i + 1) * row + side
            c = i * row + ((side + 1) % sides)
            d = (i + 1) * row + ((side + 1) % sides)
            indices.append((a, b, c))
            indices.append((c, b, d))

    return make_geometry(name, layer, material, vertices, normals, texcoords, indices)


def create_label_plane(
    name: str,
    layer: str,
    center: np.ndarray,
    width: float,
    height: float,
    material: str,
) -> Tuple[Dict, np.ndarray]:
    normal = normalize(LABEL_NORMAL)
    right = normalize(np.cross(WORLD_UP, normal))
    up = normalize(np.cross(normal, right))
    half_w = width / 2.0
    half_h = height / 2.0

    vertices = [
        center - right * half_w + up * half_h,
        center - right * half_w - up * half_h,
        center + right * half_w - up * half_h,
        center + right * half_w + up * half_h,
    ]
    normals = [normal, normal, normal, normal]
    texcoords = [(0.0, 0.0), (0.0, 1.0), (1.0, 1.0), (1.0, 0.0)]
    indices = [(0, 1, 2), (0, 2, 3)]
    left_anchor = center - right * half_w
    return make_geometry(name, layer, material, vertices, normals, texcoords, indices), left_anchor


def find_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        r"C:\Windows\Fonts\msyhbd.ttc" if bold else r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\simhei.ttf",
        r"C:\Windows\Fonts\simsun.ttc",
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()


def generate_crust_texture(width: int = 1536, height: int = 768) -> Image.Image:
    print(f"Generating crust texture {width}x{height}...")
    img = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(img)
    rng = np.random.default_rng(42)

    for y in range(height):
        latitude_factor = 1.0 - abs((y / height) - 0.5) * 2.0
        r = int(9 + 16 * latitude_factor)
        g = int(48 + 50 * latitude_factor)
        b = int(92 + 72 * latitude_factor)
        draw.line([(0, y), (width, y)], fill=(r, g, b))

    land = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    land_draw = ImageDraw.Draw(land)
    continents = [
        (0.17, 0.30, 0.17, 0.12, 42),
        (0.23, 0.58, 0.08, 0.18, 28),
        (0.50, 0.48, 0.10, 0.22, 44),
        (0.60, 0.28, 0.22, 0.13, 58),
        (0.77, 0.58, 0.08, 0.07, 22),
        (0.40, 0.92, 0.35, 0.06, 30),
        (0.31, 0.18, 0.05, 0.06, 12),
    ]
    for cx, cy, rx, ry, count in continents:
        for _ in range(count):
            ox = rng.normal(0, rx * width * 0.32)
            oy = rng.normal(0, ry * height * 0.30)
            rw = abs(rng.normal(rx * width * 0.20, rx * width * 0.07))
            rh = abs(rng.normal(ry * height * 0.22, ry * height * 0.08))
            x0 = int(max(0, cx * width + ox - rw))
            y0 = int(max(0, cy * height + oy - rh))
            x1 = int(min(width, cx * width + ox + rw))
            y1 = int(min(height, cy * height + oy + rh))
            color = (
                int(np.clip(rng.normal(74, 17), 28, 130)),
                int(np.clip(rng.normal(135, 22), 70, 190)),
                int(np.clip(rng.normal(63, 16), 32, 120)),
                255,
            )
            if x1 > x0 and y1 > y0:
                land_draw.ellipse([x0, y0, x1, y1], fill=color)

    land = land.filter(ImageFilter.GaussianBlur(radius=1.2))
    img.paste(land, (0, 0), land)
    draw = ImageDraw.Draw(img)

    for lon in range(-180, 181, 30):
        x = (lon + 180) / 360.0 * width
        draw.line([(x, 0), (x, height)], fill=(185, 216, 230), width=1)
    for lat in range(-60, 61, 30):
        y = (90 - lat) / 180.0 * height
        draw.line([(0, y), (width, y)], fill=(185, 216, 230), width=1)

    draw.rectangle([0, 0, width, int(height * 0.07)], fill=(238, 244, 248))
    draw.rectangle([0, int(height * 0.92), width, height], fill=(238, 244, 248))
    return img


def draw_text(draw: ImageDraw.ImageDraw, xy: Tuple[int, int], text: str, font, fill) -> None:
    draw.text(xy, text, font=font, fill=fill)


def generate_label_texture(title: str, subtitle: str, color_rgb: Tuple[int, int, int]) -> Image.Image:
    width, height = 512, 168
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    try:
        draw.rounded_rectangle(
            [6, 8, width - 6, height - 8],
            radius=28,
            fill=(255, 255, 255, 226),
            outline=(*color_rgb, 238),
            width=4,
        )
    except AttributeError:
        draw.rectangle([6, 8, width - 6, height - 8], fill=(255, 255, 255, 226), outline=(*color_rgb, 238))

    draw.rounded_rectangle([26, 26, 58, height - 26], radius=14, fill=(*color_rgb, 255))
    title_font = find_font(54, bold=True)
    subtitle_font = find_font(30, bold=False)
    draw_text(draw, (84, 34), title, title_font, (28, 35, 45, 255))
    draw_text(draw, (88, 102), subtitle, subtitle_font, (78, 87, 100, 255))
    return img


def material_color(rgb: Tuple[float, float, float], alpha: float = 1.0) -> List[float]:
    return [float(rgb[0]), float(rgb[1]), float(rgb[2]), float(alpha)]


def build_scene_geometry() -> Tuple[List[Dict], Dict[str, Dict], List[Image.Image]]:
    images: List[Image.Image] = [generate_crust_texture()]
    materials: Dict[str, Dict] = {
        "CrustSurface": {
            "name": "CrustSurface",
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": 0},
                "baseColorFactor": [1.0, 1.0, 1.0, 1.0],
                "metallicFactor": 0.0,
                "roughnessFactor": 0.72,
            },
            "doubleSided": True,
        },
        "Atmosphere": {
            "name": "Atmosphere",
            "pbrMetallicRoughness": {
                "baseColorFactor": [0.38, 0.74, 1.0, 0.28],
                "metallicFactor": 0.0,
                "roughnessFactor": 0.35,
            },
            "emissiveFactor": [0.08, 0.22, 0.34],
            "alphaMode": "BLEND",
            "doubleSided": True,
        },
        "Boundary": {
            "name": "Boundary",
            "pbrMetallicRoughness": {
                "baseColorFactor": [0.08, 0.10, 0.12, 1.0],
                "metallicFactor": 0.0,
                "roughnessFactor": 0.45,
            },
            "doubleSided": True,
        },
    }

    geometries: List[Dict] = []
    for spec in LAYER_SPECS:
        layer = spec["key"]
        color = spec["color"]
        cut_color = spec["cut_color"]
        cut_material = f"{layer}Cut"
        label_material = f"{layer}Label"

        materials[cut_material] = {
            "name": cut_material,
            "pbrMetallicRoughness": {
                "baseColorFactor": material_color(cut_color),
                "metallicFactor": 0.05 if layer.endswith("Core") else 0.0,
                "roughnessFactor": 0.42,
            },
            "emissiveFactor": [color[0] * 0.10, color[1] * 0.06, color[2] * 0.03],
            "doubleSided": True,
        }

        label_rgb = tuple(int(np.clip(channel * 255, 0, 255)) for channel in cut_color)
        label_image_index = len(images)
        images.append(generate_label_texture(spec["title"], spec["subtitle"], label_rgb))
        materials[label_material] = {
            "name": label_material,
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": label_image_index},
                "baseColorFactor": [1.0, 1.0, 1.0, 1.0],
                "metallicFactor": 0.0,
                "roughnessFactor": 0.8,
            },
            "alphaMode": "BLEND",
            "doubleSided": True,
            "extensions": {"KHR_materials_unlit": {}},
        }

        if layer == "Crust":
            geometries.append(create_spherical_surface("Crust_Textured_Surface", layer, spec["outer"], 1.0, "CrustSurface"))
            geometries.append(create_spherical_surface("Atmosphere_Glow", layer, spec["outer"] + 0.035, 1.0, "Atmosphere", 64, 128))
            if spec["inner"] > 0:
                geometries.append(create_spherical_surface("Crust_Inner_Edge", layer, spec["inner"], -1.0, cut_material, 48, 128))
        else:
            geometries.append(create_spherical_surface(f"{layer}_Outer_Surface", layer, spec["outer"], 1.0, cut_material, 72, 144))
            if spec["inner"] > 0:
                geometries.append(create_spherical_surface(f"{layer}_Inner_Surface", layer, spec["inner"], -1.0, cut_material, 48, 128))

        geometries.append(create_cut_face(f"{layer}_Cut_Face_A", layer, spec["outer"], spec["inner"], THETA_START, -1.0, cut_material))
        geometries.append(create_cut_face(f"{layer}_Cut_Face_B", layer, spec["outer"], spec["inner"], THETA_END, 1.0, cut_material))

        tube_radius = 0.012 if layer != "Crust" else 0.010
        for theta in (THETA_START, THETA_END):
            geometries.append(create_meridian_tube(f"{layer}_Boundary_{theta:.2f}", layer, spec["outer"], theta, tube_radius, "Boundary"))

        label_center = FRONT_DIR * 1.38 + np.array([0.0, spec["label_y"], 0.0], dtype=np.float32)
        label_geo, label_anchor = create_label_plane(f"{layer}_Label", layer, label_center, 0.92, 0.30, label_material)
        geometries.append(label_geo)

        mid_radius = (spec["outer"] + spec["inner"]) * 0.5 if spec["inner"] > 0 else spec["outer"] * 0.48
        target_y = float(np.clip(spec["label_y"] * 0.55, -mid_radius * 0.84, mid_radius * 0.84))
        horizontal_radius = math.sqrt(max(mid_radius * mid_radius - target_y * target_y, 0.0))
        target = np.array(
            [
                horizontal_radius * math.cos(THETA_START),
                target_y,
                horizontal_radius * math.sin(THETA_START),
            ],
            dtype=np.float32,
        )
        geometries.append(create_segment_tube(f"{layer}_Callout_Line", layer, label_anchor, target, 0.009, cut_material))

    return geometries, materials, images


def pad4_bytes(data: bytes, pad_byte: bytes = b"\x00") -> bytes:
    if len(data) % 4:
        data += pad_byte * (4 - len(data) % 4)
    return data


def build_glb(geometries: List[Dict], material_defs: Dict[str, Dict], images: List[Image.Image]) -> bytes:
    print("Building GLB...")

    material_names = list(material_defs.keys())
    material_index = {name: idx for idx, name in enumerate(material_names)}
    materials = [material_defs[name] for name in material_names]

    binary = bytearray()
    buffer_views: List[Dict] = []
    accessors: List[Dict] = []

    def append_bytes(data: bytes, target=None) -> int:
        while len(binary) % 4:
            binary.append(0)
        offset = len(binary)
        binary.extend(data)
        view = {"buffer": 0, "byteOffset": offset, "byteLength": len(data)}
        if target is not None:
            view["target"] = target
        buffer_views.append(view)
        return len(buffer_views) - 1

    def make_accessor(view_idx: int, count: int, component_type: int, acc_type: str, min_vals=None, max_vals=None) -> int:
        accessor = {
            "bufferView": view_idx,
            "componentType": component_type,
            "count": count,
            "type": acc_type,
        }
        if min_vals is not None and max_vals is not None:
            accessor["min"] = min_vals
            accessor["max"] = max_vals
        accessors.append(accessor)
        return len(accessors) - 1

    meshes: List[Dict] = []
    mesh_layers: List[str] = []
    for geo in geometries:
        pos_view = append_bytes(geo["vertices"].astype(np.float32).tobytes(), 34962)
        norm_view = append_bytes(geo["normals"].astype(np.float32).tobytes(), 34962)
        uv_view = append_bytes(geo["texcoords"].astype(np.float32).tobytes(), 34962)
        index_view = append_bytes(geo["indices"].astype(np.uint32).flatten().tobytes(), 34963)

        pos_accessor = make_accessor(pos_view, geo["vertex_count"], 5126, "VEC3", geo["min"], geo["max"])
        norm_accessor = make_accessor(norm_view, geo["vertex_count"], 5126, "VEC3")
        uv_accessor = make_accessor(uv_view, geo["vertex_count"], 5126, "VEC2")
        index_accessor = make_accessor(index_view, geo["index_count"], 5125, "SCALAR")

        meshes.append(
            {
                "name": geo["name"],
                "primitives": [
                    {
                        "attributes": {
                            "POSITION": pos_accessor,
                            "NORMAL": norm_accessor,
                            "TEXCOORD_0": uv_accessor,
                        },
                        "indices": index_accessor,
                        "material": material_index[geo["material"]],
                    }
                ],
            }
        )
        mesh_layers.append(geo["layer"])

    image_defs: List[Dict] = []
    textures: List[Dict] = []
    for img in images:
        image_bytes = io.BytesIO()
        img.save(image_bytes, format="PNG", optimize=True)
        view_idx = append_bytes(image_bytes.getvalue())
        image_defs.append({"bufferView": view_idx, "mimeType": "image/png"})
        textures.append({"sampler": 0, "source": len(image_defs) - 1})

    nodes: List[Dict] = []
    layer_children: Dict[str, List[int]] = {spec["key"]: [] for spec in LAYER_SPECS}
    for mesh_idx, mesh in enumerate(meshes):
        node_idx = len(nodes)
        nodes.append({"name": mesh["name"], "mesh": mesh_idx})
        layer_children[mesh_layers[mesh_idx]].append(node_idx)

    layer_node_indices: List[int] = []
    for spec in LAYER_SPECS:
        node_idx = len(nodes)
        nodes.append(
            {
                "name": spec["key"],
                "children": layer_children[spec["key"]],
                "extras": {"label": spec["title"], "teachingRole": "earth-internal-layer"},
            }
        )
        layer_node_indices.append(node_idx)

    assembly_idx = len(nodes)
    nodes.append(
        {
            "name": "Earth_Internal_Cutaway",
            "children": layer_node_indices,
            "extras": {"description": "Classroom cutaway model with detachable Earth layers"},
        }
    )

    gltf_json = {
        "asset": {"version": "2.0", "generator": "earth-layers-cutaway-generator"},
        "scene": 0,
        "scenes": [{"name": "EarthInternalCutaway", "nodes": [assembly_idx]}],
        "nodes": nodes,
        "meshes": meshes,
        "materials": materials,
        "textures": textures,
        "images": image_defs,
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}],
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": len(binary)}],
        "extensionsUsed": ["KHR_materials_unlit"],
    }

    json_bytes = pad4_bytes(json.dumps(gltf_json, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), b" ")
    bin_bytes = pad4_bytes(bytes(binary), b"\x00")
    total_length = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)

    header = struct.pack("<III", 0x46546C67, 2, total_length)
    json_chunk = struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
    bin_chunk = struct.pack("<II", len(bin_bytes), 0x004E4942) + bin_bytes
    print(f"  Meshes: {len(meshes)}")
    print(f"  Materials: {len(materials)}")
    print(f"  Images: {len(images)}")
    print(f"  GLB size: {total_length / 1024 / 1024:.2f} MB")
    return header + json_chunk + bin_chunk


def main() -> None:
    print("=" * 64)
    print("Earth internal cutaway teaching model")
    print("=" * 64)
    geometries, materials, images = build_scene_geometry()
    glb_data = build_glb(geometries, materials, images)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "wb") as output_file:
        output_file.write(glb_data)

    print(f"[OK] Written: {os.path.abspath(OUTPUT_PATH)}")


if __name__ == "__main__":
    main()
