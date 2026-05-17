#!/usr/bin/env python3
"""
Generate public/models/earth-layers.glb.

This version is a complete, four-layer classroom Earth. Each internal layer is
a top-level GLB node so the app can grab and peel layers with the existing
right-hand pinch workflow.
"""

from __future__ import annotations

import io
import json
import math
import os
import struct
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


SCRIPT_DIR = os.path.dirname(__file__)
OUTPUT_PATH = os.path.join(SCRIPT_DIR, "..", "public", "models", "earth-layers.glb")

LAT_SEGMENTS = 96
LON_SEGMENTS = 192

LAYER_SPECS = [
    {
        "key": "Crust",
        "label": "地壳",
        "radius": 2.20,
        "material": "CrustSurface",
        "extras": {"label": "地壳", "teachingRole": "earth-internal-layer"},
    },
    {
        "key": "Mantle",
        "label": "地幔",
        "radius": 1.72,
        "material": "MantleSurface",
        "extras": {"label": "地幔", "teachingRole": "earth-internal-layer"},
    },
    {
        "key": "OuterCore",
        "label": "外核",
        "radius": 1.02,
        "material": "OuterCoreSurface",
        "extras": {"label": "外核", "teachingRole": "earth-internal-layer"},
    },
    {
        "key": "InnerCore",
        "label": "内核",
        "radius": 0.50,
        "material": "InnerCoreSurface",
        "extras": {"label": "内核", "teachingRole": "earth-internal-layer"},
    },
]


def pad4(data: bytes, pad_byte: bytes = b"\x00") -> bytes:
    if len(data) % 4:
        data += pad_byte * (4 - len(data) % 4)
    return data


def create_earth_texture(width: int = 1536, height: int = 768) -> Image.Image:
    """Create a compact classroom-style Earth texture without external assets."""
    img = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(img)
    rng = np.random.default_rng(18)

    for y in range(height):
        latitude = abs((y / (height - 1)) * 2.0 - 1.0)
        polar = max(0.0, (latitude - 0.72) / 0.28)
        ocean = (
            int(18 + 38 * (1.0 - latitude)),
            int(73 + 72 * (1.0 - latitude)),
            int(118 + 70 * (1.0 - latitude)),
        )
        ice = (235, 243, 247)
        color = tuple(int(ocean[i] * (1.0 - polar) + ice[i] * polar) for i in range(3))
        draw.line([(0, y), (width, y)], fill=color)

    land = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    land_draw = ImageDraw.Draw(land)
    continents = [
        (0.16, 0.30, 0.18, 0.13, 46),
        (0.24, 0.58, 0.10, 0.20, 34),
        (0.50, 0.49, 0.13, 0.22, 56),
        (0.60, 0.29, 0.24, 0.13, 72),
        (0.74, 0.57, 0.10, 0.08, 28),
        (0.40, 0.92, 0.36, 0.06, 32),
        (0.31, 0.19, 0.06, 0.06, 12),
    ]
    for cx, cy, rx, ry, count in continents:
        for _ in range(count):
            ox = rng.normal(0, rx * width * 0.34)
            oy = rng.normal(0, ry * height * 0.30)
            rw = abs(rng.normal(rx * width * 0.20, rx * width * 0.07))
            rh = abs(rng.normal(ry * height * 0.22, ry * height * 0.08))
            x0 = int(max(0, cx * width + ox - rw))
            y0 = int(max(0, cy * height + oy - rh))
            x1 = int(min(width, cx * width + ox + rw))
            y1 = int(min(height, cy * height + oy + rh))
            if x1 <= x0 or y1 <= y0:
                continue
            color = (
                int(np.clip(rng.normal(76, 18), 34, 126)),
                int(np.clip(rng.normal(136, 22), 78, 188)),
                int(np.clip(rng.normal(72, 18), 38, 130)),
                255,
            )
            land_draw.ellipse([x0, y0, x1, y1], fill=color)

    land = land.filter(ImageFilter.GaussianBlur(radius=1.15))
    img.paste(land, (0, 0), land)

    draw = ImageDraw.Draw(img)
    for lon in range(-180, 181, 30):
        x = int((lon + 180) / 360.0 * width)
        draw.line([(x, 0), (x, height)], fill=(180, 214, 226), width=1)
    for lat in range(-60, 61, 30):
        y = int((90 - lat) / 180.0 * height)
        draw.line([(0, y), (width, y)], fill=(180, 214, 226), width=1)

    return img


def create_uv_sphere(name: str, radius: float, material: str) -> dict[str, Any]:
    vertices: list[list[float]] = []
    normals: list[list[float]] = []
    texcoords: list[list[float]] = []
    indices: list[list[int]] = []

    for lat_i in range(LAT_SEGMENTS + 1):
        phi = math.pi * lat_i / LAT_SEGMENTS
        sin_phi = math.sin(phi)
        cos_phi = math.cos(phi)
        for lon_i in range(LON_SEGMENTS + 1):
            theta = math.tau * lon_i / LON_SEGMENTS
            sin_theta = math.sin(theta)
            cos_theta = math.cos(theta)
            normal = [sin_phi * cos_theta, cos_phi, sin_phi * sin_theta]
            vertices.append([radius * normal[0], radius * normal[1], radius * normal[2]])
            normals.append(normal)
            texcoords.append([lon_i / LON_SEGMENTS, lat_i / LAT_SEGMENTS])

    row = LON_SEGMENTS + 1
    for lat_i in range(LAT_SEGMENTS):
        for lon_i in range(LON_SEGMENTS):
            a = lat_i * row + lon_i
            b = (lat_i + 1) * row + lon_i
            c = a + 1
            d = b + 1
            indices.append([a, b, c])
            indices.append([c, b, d])

    verts = np.array(vertices, dtype=np.float32)
    norms = np.array(normals, dtype=np.float32)
    uvs = np.array(texcoords, dtype=np.float32)
    inds = np.array(indices, dtype=np.uint32)
    return {
        "name": name,
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


def material_color(rgb: tuple[float, float, float], alpha: float = 1.0) -> list[float]:
    return [float(rgb[0]), float(rgb[1]), float(rgb[2]), float(alpha)]


def build_glb() -> bytes:
    images = [create_earth_texture()]
    materials: list[dict[str, Any]] = [
        {
            "name": "CrustSurface",
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": 0},
                "baseColorFactor": [1.0, 1.0, 1.0, 1.0],
                "metallicFactor": 0.0,
                "roughnessFactor": 0.68,
            },
            "doubleSided": True,
        },
        {
            "name": "MantleSurface",
            "pbrMetallicRoughness": {
                "baseColorFactor": material_color((0.92, 0.30, 0.10)),
                "metallicFactor": 0.0,
                "roughnessFactor": 0.44,
            },
            "emissiveFactor": [0.14, 0.035, 0.012],
            "doubleSided": True,
        },
        {
            "name": "OuterCoreSurface",
            "pbrMetallicRoughness": {
                "baseColorFactor": material_color((1.00, 0.63, 0.08)),
                "metallicFactor": 0.05,
                "roughnessFactor": 0.35,
            },
            "emissiveFactor": [0.18, 0.075, 0.01],
            "doubleSided": True,
        },
        {
            "name": "InnerCoreSurface",
            "pbrMetallicRoughness": {
                "baseColorFactor": material_color((1.00, 0.92, 0.28)),
                "metallicFactor": 0.08,
                "roughnessFactor": 0.30,
            },
            "emissiveFactor": [0.20, 0.16, 0.04],
            "doubleSided": True,
        },
        {
            "name": "Atmosphere",
            "pbrMetallicRoughness": {
                "baseColorFactor": [0.36, 0.72, 1.0, 0.22],
                "metallicFactor": 0.0,
                "roughnessFactor": 0.2,
            },
            "emissiveFactor": [0.04, 0.16, 0.28],
            "alphaMode": "BLEND",
            "doubleSided": True,
        },
    ]
    material_index = {material["name"]: idx for idx, material in enumerate(materials)}

    geometries = [
        create_uv_sphere("Crust_Surface", 2.20, "CrustSurface"),
        create_uv_sphere("Atmosphere_Glow", 2.245, "Atmosphere"),
        create_uv_sphere("Mantle_Surface", 1.72, "MantleSurface"),
        create_uv_sphere("OuterCore_Surface", 1.02, "OuterCoreSurface"),
        create_uv_sphere("InnerCore_Surface", 0.50, "InnerCoreSurface"),
    ]

    binary = bytearray()
    buffer_views: list[dict[str, Any]] = []
    accessors: list[dict[str, Any]] = []

    def append_bytes(data: bytes, target: int | None = None) -> int:
        while len(binary) % 4:
            binary.append(0)
        offset = len(binary)
        binary.extend(data)
        view: dict[str, Any] = {"buffer": 0, "byteOffset": offset, "byteLength": len(data)}
        if target is not None:
            view["target"] = target
        buffer_views.append(view)
        return len(buffer_views) - 1

    def make_accessor(
        view_idx: int,
        count: int,
        component_type: int,
        acc_type: str,
        min_vals: list[float] | None = None,
        max_vals: list[float] | None = None,
    ) -> int:
        accessor: dict[str, Any] = {
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

    meshes: list[dict[str, Any]] = []
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

    image_defs: list[dict[str, Any]] = []
    textures: list[dict[str, Any]] = []
    for img in images:
        image_bytes = io.BytesIO()
        img.save(image_bytes, format="PNG", optimize=True)
        image_view = append_bytes(image_bytes.getvalue())
        image_defs.append({"bufferView": image_view, "mimeType": "image/png"})
        textures.append({"sampler": 0, "source": len(image_defs) - 1})

    nodes: list[dict[str, Any]] = [
        {"name": "Crust_Surface", "mesh": 0},
        {"name": "Atmosphere_Glow", "mesh": 1},
        {"name": "Mantle_Surface", "mesh": 2},
        {"name": "OuterCore_Surface", "mesh": 3},
        {"name": "InnerCore_Surface", "mesh": 4},
    ]

    layer_nodes = []
    mesh_children = {
        "Crust": [0, 1],
        "Mantle": [2],
        "OuterCore": [3],
        "InnerCore": [4],
    }
    for spec in LAYER_SPECS:
        node_idx = len(nodes)
        nodes.append(
            {
                "name": spec["key"],
                "children": mesh_children[spec["key"]],
                "extras": spec["extras"],
            }
        )
        layer_nodes.append(node_idx)

    root_idx = len(nodes)
    nodes.append(
        {
            "name": "Earth_Internal_Layers",
            "children": layer_nodes,
            "extras": {
                "description": "Complete four-layer Earth for hand-driven layer peeling",
                "detachableLayerCount": 4,
            },
        }
    )

    gltf_json = {
        "asset": {"version": "2.0", "generator": "earth-layers-complete-generator"},
        "scene": 0,
        "scenes": [{"name": "EarthInternalLayers", "nodes": [root_idx]}],
        "nodes": nodes,
        "meshes": meshes,
        "materials": materials,
        "textures": textures,
        "images": image_defs,
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}],
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": len(binary)}],
    }

    json_bytes = pad4(json.dumps(gltf_json, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), b" ")
    bin_bytes = pad4(bytes(binary), b"\x00")
    total_length = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)

    header = struct.pack("<III", 0x46546C67, 2, total_length)
    json_chunk = struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
    bin_chunk = struct.pack("<II", len(bin_bytes), 0x004E4942) + bin_bytes
    return header + json_chunk + bin_chunk


def main() -> None:
    glb_data = build_glb()
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "wb") as output_file:
        output_file.write(glb_data)
    print(f"[OK] Written: {os.path.abspath(OUTPUT_PATH)}")
    print(f"[OK] Size: {len(glb_data) / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    main()
