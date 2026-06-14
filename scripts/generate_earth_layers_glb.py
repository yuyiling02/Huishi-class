#!/usr/bin/env python3
"""
Generate public/models/earth-layers.glb.

The model is a complete four-layer Earth. The crust uses the project's real
Earth texture assets, while the internal layers use generated rock/metal
textures and subtle geometry relief so they do not read as flat plastic.
"""

from __future__ import annotations

import io
import json
import math
import os
import struct
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageFilter


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
OUTPUT_PATH = PROJECT_ROOT / "public" / "models" / "earth-layers.glb"
TEXTURE_DIR = PROJECT_ROOT / "public" / "textures"

LAT_SEGMENTS = 112
LON_SEGMENTS = 224

LAYER_SPECS = [
    {
        "key": "Crust",
        "radius": 2.20,
        "material": "CrustSurface",
        "children": ["Crust_Surface"],
        "extras": {"label": "Crust", "teachingRole": "earth-internal-layer"},
    },
    {
        "key": "Mantle",
        "radius": 1.72,
        "material": "MantleSurface",
        "children": ["Mantle_Surface"],
        "extras": {"label": "Mantle", "teachingRole": "earth-internal-layer"},
    },
    {
        "key": "OuterCore",
        "radius": 1.02,
        "material": "OuterCoreSurface",
        "children": ["OuterCore_Surface"],
        "extras": {"label": "Outer Core", "teachingRole": "earth-internal-layer"},
    },
    {
        "key": "InnerCore",
        "radius": 0.50,
        "material": "InnerCoreSurface",
        "children": ["InnerCore_Surface"],
        "extras": {"label": "Inner Core", "teachingRole": "earth-internal-layer"},
    },
]


def pad4(data: bytes, pad_byte: bytes = b"\x00") -> bytes:
    if len(data) % 4:
        data += pad_byte * (4 - len(data) % 4)
    return data


def load_texture(path: Path, size: tuple[int, int] | None = None) -> Image.Image:
    img = Image.open(path).convert("RGB")
    if size and img.size != size:
        img = img.resize(size, Image.Resampling.LANCZOS)
    return img


def create_earth_surface_texture() -> Image.Image:
    img = load_texture(TEXTURE_DIR / "earth_atmos_2048.jpg")
    arr = np.asarray(img, dtype=np.float32) / 255.0

    r = arr[..., 0]
    g = arr[..., 1]
    b = arr[..., 2]
    maxc = arr.max(axis=2)
    minc = arr.min(axis=2)
    saturation = (maxc - minc) / np.maximum(maxc, 1e-6)

    ocean_mask = (
        (b > r * 1.12)
        & (b >= g * 0.86)
        & (saturation > 0.12)
        & (maxc < 0.82)
    )

    depth = np.clip((0.62 - maxc) / 0.46, 0.0, 1.0)
    shore = np.clip((g - r + 0.12) / 0.32, 0.0, 1.0) * (1.0 - depth)
    deep_blue = np.array([0.015, 0.18, 0.48], dtype=np.float32)
    surface_blue = np.array([0.02, 0.38, 0.78], dtype=np.float32)
    shallow_blue = np.array([0.00, 0.62, 0.84], dtype=np.float32)

    target = deep_blue * depth[..., None] + surface_blue * (1.0 - depth[..., None])
    target = target * (1.0 - shore[..., None] * 0.38) + shallow_blue * (shore[..., None] * 0.38)

    mix = np.where(ocean_mask, 0.45 + depth * 0.18 + shore * 0.08, 0.0)[..., None]
    boosted = arr * (1.0 - mix) + target * mix
    boosted[..., 2] = np.where(ocean_mask, np.maximum(boosted[..., 2], arr[..., 2] * 1.12), boosted[..., 2])
    boosted[..., 1] = np.where(ocean_mask, np.maximum(boosted[..., 1], arr[..., 1] * 1.03), boosted[..., 1])

    return Image.fromarray(np.clip(boosted * 255.0, 0, 255).astype(np.uint8), mode="RGB")


def smooth_noise(width: int, height: int, seed: int, blur: float) -> np.ndarray:
    rng = np.random.default_rng(seed)
    raw = (rng.random((height, width)) * 255).astype(np.uint8)
    img = Image.fromarray(raw, mode="L").filter(ImageFilter.GaussianBlur(radius=blur))
    arr = np.asarray(img, dtype=np.float32) / 255.0
    return (arr - arr.min()) / max(float(arr.max() - arr.min()), 1e-6)


def create_layer_texture(
    width: int,
    height: int,
    palette: tuple[tuple[int, int, int], tuple[int, int, int], tuple[int, int, int]],
    seed: int,
    flow_strength: float,
    vein_strength: float,
) -> Image.Image:
    y = np.linspace(0.0, 1.0, height, dtype=np.float32)[:, None]
    x = np.linspace(0.0, 1.0, width, dtype=np.float32)[None, :]
    n1 = smooth_noise(width, height, seed, 18.0)
    n2 = smooth_noise(width, height, seed + 17, 7.0)
    n3 = smooth_noise(width, height, seed + 31, 3.0)

    flow = (
        np.sin((x * 8.0 + y * 2.2 + n1 * 1.7) * math.tau)
        + 0.55 * np.sin((x * 17.0 - y * 3.6 + n2 * 1.3) * math.tau)
    ) * 0.5 + 0.5
    veins = np.clip(1.0 - np.abs(flow - 0.52) * 8.0, 0.0, 1.0) ** 2.4
    grain = np.clip(n1 * 0.52 + n2 * 0.33 + n3 * 0.15, 0.0, 1.0)
    mix = np.clip(grain * (1.0 - flow_strength) + flow * flow_strength, 0.0, 1.0)

    low = np.array(palette[0], dtype=np.float32)
    mid = np.array(palette[1], dtype=np.float32)
    high = np.array(palette[2], dtype=np.float32)
    base = np.where(mix[..., None] < 0.55, low + (mid - low) * (mix[..., None] / 0.55), mid + (high - mid) * ((mix[..., None] - 0.55) / 0.45))
    base = base + veins[..., None] * vein_strength
    base = base * (0.86 + n3[..., None] * 0.24)
    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), mode="RGB")


def relief_value(theta: float, phi: float, seed: int) -> float:
    return (
        0.46 * math.sin(theta * 4.0 + seed * 0.37) * math.sin(phi * 3.0)
        + 0.28 * math.sin(theta * 9.0 - phi * 2.0 + seed)
        + 0.18 * math.cos(theta * 15.0 + phi * 5.0 + seed * 0.19)
        + 0.08 * math.sin(theta * 31.0 + phi * 11.0)
    )


def create_uv_sphere(name: str, radius: float, material: str, relief: float = 0.0, seed: int = 0) -> dict[str, Any]:
    vertices: list[list[float]] = []
    normals: list[list[float]] = []
    texcoords: list[list[float]] = []
    indices: list[list[int]] = []

    for lat_i in range(LAT_SEGMENTS + 1):
        phi = math.pi * lat_i / LAT_SEGMENTS
        sin_phi = math.sin(phi)
        cos_phi = math.cos(phi)
        polar_fade = min(1.0, max(0.0, sin_phi * 1.8))
        for lon_i in range(LON_SEGMENTS + 1):
            theta = math.tau * lon_i / LON_SEGMENTS
            sin_theta = math.sin(theta)
            cos_theta = math.cos(theta)
            normal = [sin_phi * cos_theta, cos_phi, sin_phi * sin_theta]
            local_radius = radius + relief * relief_value(theta, phi, seed) * polar_fade
            vertices.append([local_radius * normal[0], local_radius * normal[1], local_radius * normal[2]])
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


def make_materials() -> list[dict[str, Any]]:
    return [
        {
            "name": "CrustSurface",
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": 0},
                "baseColorFactor": [1.0, 1.0, 1.0, 1.0],
                "metallicFactor": 0.0,
                "roughnessFactor": 0.86,
            },
            "normalTexture": {"index": 1, "scale": 0.5},
            "doubleSided": True,
        },
        {
            "name": "Atmosphere",
            "pbrMetallicRoughness": {
                "baseColorFactor": [0.46, 0.76, 1.0, 0.18],
                "metallicFactor": 0.0,
                "roughnessFactor": 0.55,
            },
            "emissiveFactor": [0.035, 0.11, 0.18],
            "alphaMode": "BLEND",
            "doubleSided": True,
        },
        {
            "name": "MantleSurface",
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": 2},
                "baseColorFactor": [1.0, 0.96, 0.92, 1.0],
                "metallicFactor": 0.0,
                "roughnessFactor": 0.88,
            },
            "emissiveFactor": [0.035, 0.012, 0.004],
            "doubleSided": True,
        },
        {
            "name": "OuterCoreSurface",
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": 3},
                "baseColorFactor": [1.0, 0.96, 0.90, 1.0],
                "metallicFactor": 0.18,
                "roughnessFactor": 0.64,
            },
            "emissiveFactor": [0.05, 0.025, 0.005],
            "doubleSided": True,
        },
        {
            "name": "InnerCoreSurface",
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": 4},
                "baseColorFactor": [1.0, 0.98, 0.92, 1.0],
                "metallicFactor": 0.24,
                "roughnessFactor": 0.58,
            },
            "emissiveFactor": [0.045, 0.035, 0.012],
            "doubleSided": True,
        },
    ]


def build_glb() -> bytes:
    images = [
        create_earth_surface_texture(),
        load_texture(TEXTURE_DIR / "earth_normal_2048.jpg"),
        create_layer_texture(1024, 512, ((48, 19, 12), (145, 57, 26), (231, 122, 53)), 101, 0.42, 30.0),
        create_layer_texture(1024, 512, ((68, 39, 17), (178, 98, 28), (255, 189, 77)), 207, 0.55, 42.0),
        create_layer_texture(1024, 512, ((92, 77, 39), (205, 164, 70), (255, 233, 145)), 313, 0.30, 24.0),
    ]
    materials = make_materials()
    material_index = {material["name"]: idx for idx, material in enumerate(materials)}

    geometries = [
        create_uv_sphere("Crust_Surface", 2.20, "CrustSurface", relief=0.0),
        create_uv_sphere("Mantle_Surface", 1.72, "MantleSurface", relief=0.032, seed=4),
        create_uv_sphere("OuterCore_Surface", 1.02, "OuterCoreSurface", relief=0.018, seed=9),
        create_uv_sphere("InnerCore_Surface", 0.50, "InnerCoreSurface", relief=0.010, seed=15),
    ]
    mesh_index_by_name = {geo["name"]: idx for idx, geo in enumerate(geometries)}

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
        img.save(image_bytes, format="JPEG", quality=88, optimize=True)
        image_view = append_bytes(image_bytes.getvalue())
        image_defs.append({"bufferView": image_view, "mimeType": "image/jpeg"})
        textures.append({"sampler": 0, "source": len(image_defs) - 1})

    nodes: list[dict[str, Any]] = []
    for geo in geometries:
        nodes.append({"name": geo["name"], "mesh": mesh_index_by_name[geo["name"]]})

    layer_nodes: list[int] = []
    for spec in LAYER_SPECS:
        child_indices = [mesh_index_by_name[name] for name in spec["children"]]
        node_idx = len(nodes)
        nodes.append(
            {
                "name": spec["key"],
                "children": child_indices,
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
        "asset": {"version": "2.0", "generator": "earth-layers-realistic-generator"},
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
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_bytes(glb_data)
    print(f"[OK] Written: {OUTPUT_PATH}")
    print(f"[OK] Size: {len(glb_data) / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    main()
