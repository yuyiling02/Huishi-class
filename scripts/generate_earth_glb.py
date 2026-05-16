#!/usr/bin/env python3
"""
Generate earth-political.glb: a classroom political globe.

The script builds a single self-contained GLB with:
- 4K base map texture from Natural Earth country polygons
- transparent political overlay with borders, graticule, and Chinese labels
- tilted globe axis, metal meridian ring, and stand

No Blender dependency. Requires Pillow and numpy.
"""

from __future__ import annotations

import io
import json
import math
import os
import struct
import urllib.request
from typing import Any, Iterable

import numpy as np
from PIL import Image, ImageDraw, ImageFont


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

TEX_WIDTH = 8192
TEX_HEIGHT = 4096

EARTH_RADIUS = 1.0
OVERLAY_RADIUS = 1.006
ATMOSPHERE_RADIUS = 1.035
LAT_SEGMENTS = 144
LON_SEGMENTS = 288
AXIS_TILT_DEG = 23.5

# Put East Asia near the first camera-facing side of the demo viewer.
FRONT_LONGITUDE_DEG = 104.0
FRONT_AZIMUTH_DEG = 45.0
SPHERE_PHASE = (FRONT_AZIMUTH_DEG - (FRONT_LONGITUDE_DEG + 180.0)) / 360.0

SCRIPT_DIR = os.path.dirname(__file__)
CACHE_DIR = os.path.join(SCRIPT_DIR, ".geo_cache")
OUTPUT_PATH = os.path.join(SCRIPT_DIR, "..", "public", "models", "earth-political.glb")

NE_BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson"
NE_COUNTRIES_URL = f"{NE_BASE}/ne_50m_admin_0_countries.geojson"
NE_BOUNDARY_URL = f"{NE_BASE}/ne_50m_admin_0_boundary_lines_land.geojson"
NE_COASTLINE_URL = f"{NE_BASE}/ne_50m_coastline.geojson"


COUNTRY_PALETTE = [
    (195, 219, 151),
    (244, 200, 116),
    (222, 139, 116),
    (158, 204, 196),
    (171, 178, 221),
    (231, 164, 185),
    (184, 210, 126),
    (236, 179, 107),
    (142, 190, 221),
    (207, 170, 215),
    (147, 197, 153),
    (225, 155, 135),
    (218, 204, 145),
]


# ---------------------------------------------------------------------------
# Natural Earth loading
# ---------------------------------------------------------------------------


def download_geojson(url: str) -> dict[str, Any] | None:
    """Download a GeoJSON file with local caching."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    cache_path = os.path.join(CACHE_DIR, os.path.basename(url))

    if os.path.exists(cache_path):
        with open(cache_path, "r", encoding="utf-8") as f:
            return json.load(f)

    try:
        print(f"  Downloading {url}")
        req = urllib.request.Request(url, headers={"User-Agent": "earth-glb-generator/2.0"})
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        return data
    except Exception as exc:  # pragma: no cover - fallback path for offline use
        print(f"  WARNING: download failed: {exc}")
        return None


# ---------------------------------------------------------------------------
# Map projection and drawing helpers
# ---------------------------------------------------------------------------


def latlon_to_pixel(lon: float, lat: float, w: int = TEX_WIDTH, h: int = TEX_HEIGHT) -> tuple[float, float]:
    x = (lon + 180.0) / 360.0 * w
    y = (90.0 - lat) / 180.0 * h
    return x, max(0.0, min(float(h - 1), y))


def iter_polygon_rings(geometry: dict[str, Any]) -> Iterable[list[list[float]]]:
    geom_type = geometry.get("type")
    coords = geometry.get("coordinates") or []

    if geom_type == "Polygon":
        for ring in coords:
            yield ring
    elif geom_type == "MultiPolygon":
        for polygon in coords:
            for ring in polygon:
                yield ring


def iter_line_rings(geometry: dict[str, Any]) -> Iterable[list[list[float]]]:
    geom_type = geometry.get("type")
    coords = geometry.get("coordinates") or []

    if geom_type == "LineString":
        yield coords
    elif geom_type == "MultiLineString":
        for line in coords:
            yield line
    elif geom_type in ("Polygon", "MultiPolygon"):
        yield from iter_polygon_rings(geometry)


def unwrap_ring(ring: list[list[float]]) -> list[tuple[float, float]]:
    """Unwrap longitudes so antimeridian-crossing rings draw locally."""
    clean: list[tuple[float, float]] = []
    for point in ring:
        if len(point) < 2:
            continue
        lon = float(point[0])
        lat = max(-89.999, min(89.999, float(point[1])))
        if math.isfinite(lon) and math.isfinite(lat):
            clean.append((lon, lat))

    if not clean:
        return []

    unwrapped = [clean[0]]
    prev_lon = clean[0][0]
    for raw_lon, lat in clean[1:]:
        lon = raw_lon
        while lon - prev_lon > 180.0:
            lon -= 360.0
        while lon - prev_lon < -180.0:
            lon += 360.0
        unwrapped.append((lon, lat))
        prev_lon = lon
    return unwrapped


def ring_pixels(ring: list[list[float]], x_shift: float = 0.0) -> list[tuple[float, float]]:
    points = []
    for lon, lat in unwrap_ring(ring):
        x, y = latlon_to_pixel(lon, lat)
        points.append((x + x_shift, y))
    return points


def bbox_intersects_canvas(points: list[tuple[float, float]]) -> bool:
    if not points:
        return False
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return max(xs) >= 0 and min(xs) <= TEX_WIDTH and max(ys) >= 0 and min(ys) <= TEX_HEIGHT


def draw_wrapped_polygon(draw: ImageDraw.ImageDraw, ring: list[list[float]], fill: tuple[int, int, int, int]) -> None:
    if len(ring) < 3:
        return
    for shift in (-TEX_WIDTH, 0, TEX_WIDTH):
        pts = ring_pixels(ring, shift)
        if len(pts) >= 3 and bbox_intersects_canvas(pts):
            draw.polygon(pts, fill=fill)


def draw_wrapped_line(
    draw: ImageDraw.ImageDraw,
    ring: list[list[float]],
    fill: tuple[int, int, int, int],
    width: int = 1,
    closed: bool = False,
) -> None:
    if len(ring) < 2:
        return
    for shift in (-TEX_WIDTH, 0, TEX_WIDTH):
        pts = ring_pixels(ring, shift)
        if len(pts) >= 2 and bbox_intersects_canvas(pts):
            if closed:
                pts = pts + [pts[0]]
            draw.line(pts, fill=fill, width=width, joint="curve")


def palette_color(properties: dict[str, Any]) -> tuple[int, int, int, int]:
    idx = properties.get("MAPCOLOR13") or properties.get("MAPCOLOR9") or properties.get("MAPCOLOR7") or 1
    try:
        idx_i = int(idx) - 1
    except Exception:
        idx_i = 0

    r, g, b = COUNTRY_PALETTE[idx_i % len(COUNTRY_PALETTE)]
    continent = str(properties.get("CONTINENT") or "")
    continent_bias = {
        "Asia": (6, 4, -2),
        "Europe": (2, 3, 8),
        "Africa": (8, 3, -6),
        "North America": (-4, 5, 8),
        "South America": (0, 8, -4),
        "Oceania": (5, 4, 4),
        "Antarctica": (28, 30, 34),
    }.get(continent, (0, 0, 0))
    return (
        max(0, min(255, r + continent_bias[0])),
        max(0, min(255, g + continent_bias[1])),
        max(0, min(255, b + continent_bias[2])),
        255,
    )


def draw_country_fills(country_layer: Image.Image, countries_geo: dict[str, Any] | None) -> None:
    draw = ImageDraw.Draw(country_layer, "RGBA")
    if not countries_geo:
        print("  WARNING: no country polygons; using fallback schematic land.")
        fallback = [
            [(-170, 72), (-55, 72), (-55, 10), (-100, 5), (-170, 25)],
            [(-85, 12), (-34, 10), (-45, -55), (-80, -55)],
            [(-20, 72), (160, 72), (150, 5), (60, -10), (-20, 35)],
            [(-20, 35), (50, 35), (55, -35), (15, -35), (-18, 0)],
            [(110, -10), (155, -10), (155, -45), (110, -45)],
            [(-180, -65), (180, -65), (180, -89), (-180, -89)],
        ]
        for poly in fallback:
            draw_wrapped_polygon(draw, [[lon, lat] for lon, lat in poly], (166, 204, 137, 255))
        return

    features = countries_geo.get("features", [])
    for index, feature in enumerate(features):
        if index % 40 == 0:
            print(f"\r  Filling countries: {index}/{len(features)}", end="", flush=True)

        geometry = feature.get("geometry") or {}
        properties = feature.get("properties") or {}
        color = palette_color(properties)

        geom_type = geometry.get("type")
        coords = geometry.get("coordinates") or []
        polygons = [coords] if geom_type == "Polygon" else coords if geom_type == "MultiPolygon" else []
        for polygon in polygons:
            if polygon:
                # First ring is the exterior. Holes are ignored intentionally:
                # at globe scale, clean country color beats noisy lake cutouts.
                draw_wrapped_polygon(draw, polygon[0], color)

    print(f"\r  Filling countries: done ({len(features)} features)")


def apply_land_shading(base: Image.Image, land_alpha: Image.Image) -> Image.Image:
    print("  Adding subtle land shading...")
    resampling = getattr(Image, "Resampling", Image)
    rng = np.random.default_rng(12)
    small_noise = rng.normal(0.0, 1.0, (TEX_HEIGHT // 16, TEX_WIDTH // 16))
    small_noise = (small_noise - small_noise.min()) / max(1e-6, small_noise.max() - small_noise.min())
    noise_img = Image.fromarray((small_noise * 255).astype(np.uint8), "L")
    noise_img = noise_img.resize((TEX_WIDTH, TEX_HEIGHT), resample=resampling.BICUBIC)

    arr = np.asarray(base).astype(np.float32)
    mask = np.asarray(land_alpha).astype(np.float32) / 255.0
    noise = (np.asarray(noise_img).astype(np.float32) - 128.0) / 128.0

    lat = np.linspace(90.0, -90.0, TEX_HEIGHT, dtype=np.float32)
    warm_equator = (np.cos(np.radians(lat)) * 0.03).reshape(TEX_HEIGHT, 1)
    factor = 1.0 + noise * 0.055 + warm_equator
    arr = arr * (1.0 - mask[:, :, None]) + np.clip(arr * factor[:, :, None], 0, 255) * mask[:, :, None]
    return Image.fromarray(arr.astype(np.uint8), "RGB")


def create_ocean_texture() -> Image.Image:
    print("  Drawing ocean background...")
    y = np.linspace(-1.0, 1.0, TEX_HEIGHT, dtype=np.float32).reshape(TEX_HEIGHT, 1)
    x = np.linspace(0.0, 2.0 * math.pi, TEX_WIDTH, dtype=np.float32).reshape(1, TEX_WIDTH)
    equator = 1.0 - np.abs(y)
    bands = 0.5 + 0.5 * np.sin(x * 2.0 + y * 5.5)

    r = 30 + 22 * equator + 4 * bands
    g = 82 + 48 * equator + 6 * bands
    b = 142 + 58 * equator + 8 * bands
    arr = np.dstack([r, g, b]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGB")


def draw_graticule(draw: ImageDraw.ImageDraw) -> None:
    print("  Drawing graticule...")

    for lon in range(-180, 180, 15):
        major = lon % 90 == 0
        color = (255, 255, 255, 90 if major else 55)
        width = 2 if major else 1
        x, _ = latlon_to_pixel(lon, 0)
        draw.line([(x, 0), (x, TEX_HEIGHT)], fill=color, width=width)

    for lat in range(-75, 76, 15):
        major = lat == 0 or abs(lat) == 45
        color = (255, 255, 255, 95 if major else 55)
        width = 2 if major else 1
        _, y = latlon_to_pixel(0, lat)
        draw.line([(0, y), (TEX_WIDTH, y)], fill=color, width=width)

    for lat, color in [
        (23.5, (255, 208, 116, 150)),
        (-23.5, (255, 208, 116, 150)),
        (66.5, (192, 225, 255, 135)),
        (-66.5, (192, 225, 255, 135)),
    ]:
        _, y = latlon_to_pixel(0, lat)
        dash = 34
        gap = 20
        x = 0
        while x < TEX_WIDTH:
            draw.line([(x, y), (min(TEX_WIDTH, x + dash), y)], fill=color, width=2)
            x += dash + gap


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    font_paths = [
        "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/simhei.ttf",
        "C:/Windows/Fonts/simsun.ttc",
        "C:/Windows/Fonts/Deng.ttf",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
    ]
    for path in font_paths:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    print("  WARNING: no CJK font found; labels may not render correctly.")
    return ImageFont.load_default()


def draw_label(
    draw: ImageDraw.ImageDraw,
    text: str,
    lon: float,
    lat: float,
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    fill: tuple[int, int, int, int],
    stroke: tuple[int, int, int, int],
    stroke_width: int,
) -> None:
    x, y = latlon_to_pixel(lon, lat)
    bbox = draw.textbbox((0, 0), text, font=font, stroke_width=stroke_width)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]

    for shift in (-TEX_WIDTH, 0, TEX_WIDTH):
        px = x - tw / 2 + shift
        if -tw <= px <= TEX_WIDTH:
            draw.text(
                (px, y - th / 2),
                text,
                font=font,
                fill=fill,
                stroke_fill=stroke,
                stroke_width=stroke_width,
            )


def country_label_text(properties: dict[str, Any]) -> str:
    return (
        properties.get("NAME_ZH")
        or properties.get("NAME")
        or properties.get("ADMIN")
        or ""
    ).strip()


def country_label_font_size(properties: dict[str, Any], text: str) -> int:
    pop = float(properties.get("POP_EST") or 0)
    rank = int(properties.get("LABELRANK") or 6)

    if pop >= 100_000_000 or rank <= 2:
        size = 48
    elif pop >= 40_000_000 or rank <= 3:
        size = 40
    elif pop >= 10_000_000 or rank <= 4:
        size = 32
    elif pop >= 2_000_000 or rank <= 5:
        size = 26
    else:
        size = 21

    if len(text) >= 7:
        size -= 5
    elif len(text) >= 5:
        size -= 3
    return max(18, size)


def draw_country_labels(overlay: Image.Image, countries_geo: dict[str, Any] | None) -> None:
    if not countries_geo:
        return

    print("  Adding country labels from Natural Earth...")
    draw = ImageDraw.Draw(overlay, "RGBA")
    features = sorted(
        countries_geo.get("features", []),
        key=lambda item: (
            int((item.get("properties") or {}).get("LABELRANK") or 99),
            -float((item.get("properties") or {}).get("POP_EST") or 0),
        ),
    )

    label_count = 0
    for feature in features:
        properties = feature.get("properties") or {}
        text = country_label_text(properties)
        lon = properties.get("LABEL_X")
        lat = properties.get("LABEL_Y")

        if not text or lon is None or lat is None:
            continue

        try:
            lon_f = float(lon)
            lat_f = float(lat)
        except (TypeError, ValueError):
            continue

        size = country_label_font_size(properties, text)
        font = load_font(size)
        stroke_width = 3 if size >= 30 else 2
        fill = (255, 250, 210, 240) if size >= 30 else (255, 252, 225, 220)
        stroke = (27, 36, 40, 220) if size >= 30 else (27, 36, 40, 190)
        draw_label(draw, text, lon_f, lat_f, font, fill, stroke, stroke_width)
        label_count += 1

    print(f"  Country labels: {label_count}")


def draw_labels(overlay: Image.Image, countries_geo: dict[str, Any] | None) -> None:
    print("  Adding Chinese labels...")
    draw = ImageDraw.Draw(overlay, "RGBA")
    continent_font = load_font(58)
    ocean_font = load_font(48)
    line_font = load_font(26)

    continent_labels = [
        ("亚  洲", 88, 43),
        ("欧  洲", 13, 52),
        ("非  洲", 21, 2),
        ("北 美 洲", -104, 45),
        ("南 美 洲", -60, -18),
        ("大 洋 洲", 135, -24),
        ("南 极 洲", 40, -78),
    ]
    for text, lon, lat in continent_labels:
        draw_label(draw, text, lon, lat, continent_font, (255, 255, 245, 235), (22, 47, 62, 205), 4)

    ocean_labels = [
        ("太 平 洋", -148, -12),
        ("太 平 洋", 162, 4),
        ("大 西 洋", -30, 2),
        ("印 度 洋", 76, -18),
        ("北 冰 洋", 20, 79),
    ]
    for text, lon, lat in ocean_labels:
        draw_label(draw, text, lon, lat, ocean_font, (205, 229, 255, 210), (23, 58, 100, 180), 3)

    draw_country_labels(overlay, countries_geo)

    line_labels = [
        ("北回归线", 153, 23.5),
        ("南回归线", 153, -23.5),
        ("赤道", 154, 0),
        ("北极圈", 153, 66.5),
        ("南极圈", 153, -66.5),
    ]
    for text, lon, lat in line_labels:
        draw_label(draw, text, lon, lat, line_font, (255, 230, 166, 220), (23, 58, 85, 175), 2)


def draw_geo_boundaries(
    overlay: Image.Image,
    countries_geo: dict[str, Any] | None,
    boundary_geo: dict[str, Any] | None,
    coastline_geo: dict[str, Any] | None,
) -> None:
    draw = ImageDraw.Draw(overlay, "RGBA")
    print("  Drawing coastlines and borders...")

    if countries_geo:
        for feature in countries_geo.get("features", []):
            geometry = feature.get("geometry") or {}
            for ring in iter_polygon_rings(geometry):
                draw_wrapped_line(draw, ring, (35, 48, 42, 120), width=1, closed=True)

    if boundary_geo:
        for feature in boundary_geo.get("features", []):
            geometry = feature.get("geometry") or {}
            for ring in iter_line_rings(geometry):
                draw_wrapped_line(draw, ring, (33, 37, 34, 185), width=2, closed=False)

    if coastline_geo:
        for feature in coastline_geo.get("features", []):
            geometry = feature.get("geometry") or {}
            for ring in iter_line_rings(geometry):
                draw_wrapped_line(draw, ring, (20, 82, 97, 175), width=2, closed=False)


def generate_earth_textures() -> tuple[Image.Image, Image.Image]:
    print(f"Generating {TEX_WIDTH}x{TEX_HEIGHT} Earth textures...")
    countries_geo = download_geojson(NE_COUNTRIES_URL)
    boundary_geo = download_geojson(NE_BOUNDARY_URL)
    coastline_geo = download_geojson(NE_COASTLINE_URL)

    base = create_ocean_texture()
    country_layer = Image.new("RGBA", (TEX_WIDTH, TEX_HEIGHT), (0, 0, 0, 0))
    draw_country_fills(country_layer, countries_geo)
    base_rgba = base.convert("RGBA")
    base_rgba.alpha_composite(country_layer)
    base = apply_land_shading(base_rgba.convert("RGB"), country_layer.getchannel("A"))

    overlay = Image.new("RGBA", (TEX_WIDTH, TEX_HEIGHT), (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay, "RGBA")
    draw_graticule(overlay_draw)
    draw_geo_boundaries(overlay, countries_geo, boundary_geo, coastline_geo)
    draw_labels(overlay, countries_geo)
    return base, overlay


# ---------------------------------------------------------------------------
# 3D geometry helpers
# ---------------------------------------------------------------------------


def geometry_dict(
    name: str,
    vertices: np.ndarray,
    normals: np.ndarray,
    texcoords: np.ndarray,
    indices: np.ndarray,
) -> dict[str, Any]:
    vertices = vertices.astype(np.float32)
    normals = normals.astype(np.float32)
    texcoords = texcoords.astype(np.float32)
    indices = indices.astype(np.uint32)
    return {
        "name": name,
        "vertices": vertices,
        "normals": normals,
        "texcoords": texcoords,
        "indices": indices,
        "vertex_count": int(vertices.shape[0]),
        "index_count": int(indices.size),
        "min": vertices.min(axis=0).tolist(),
        "max": vertices.max(axis=0).tolist(),
    }


def create_uv_sphere(
    radius: float,
    lat_segments: int,
    lon_segments: int,
    name: str,
    phase: float = SPHERE_PHASE,
) -> dict[str, Any]:
    verts: list[tuple[float, float, float]] = []
    norms: list[tuple[float, float, float]] = []
    uvs: list[tuple[float, float]] = []
    indices: list[tuple[int, int, int]] = []

    for lat_i in range(lat_segments + 1):
        phi = math.pi * lat_i / lat_segments
        y = math.cos(phi) * radius
        ring_radius = math.sin(phi) * radius

        for lon_i in range(lon_segments + 1):
            u = lon_i / lon_segments
            theta = 2.0 * math.pi * (u + phase)
            x = math.cos(theta) * ring_radius
            z = math.sin(theta) * ring_radius
            verts.append((x, y, z))
            length = max(1e-9, math.sqrt(x * x + y * y + z * z))
            norms.append((x / length, y / length, z / length))
            uvs.append((u, lat_i / lat_segments))

    for lat_i in range(lat_segments):
        for lon_i in range(lon_segments):
            a = lat_i * (lon_segments + 1) + lon_i
            b = a + lon_segments + 1
            c = a + 1
            d = b + 1
            indices.append((a, b, c))
            indices.append((c, b, d))

    return geometry_dict(name, np.array(verts), np.array(norms), np.array(uvs), np.array(indices))


def create_cylinder(
    radius_bottom: float,
    radius_top: float,
    height: float,
    segments: int,
    name: str,
) -> dict[str, Any]:
    verts: list[tuple[float, float, float]] = []
    norms: list[tuple[float, float, float]] = []
    uvs: list[tuple[float, float]] = []
    indices: list[tuple[int, int, int]] = []
    half_h = height / 2.0

    for i in range(segments + 1):
        angle = 2.0 * math.pi * i / segments
        nx = math.cos(angle)
        nz = math.sin(angle)
        verts.append((nx * radius_bottom, -half_h, nz * radius_bottom))
        norms.append((nx, 0.0, nz))
        uvs.append((i / segments, 0.0))
        verts.append((nx * radius_top, half_h, nz * radius_top))
        norms.append((nx, 0.0, nz))
        uvs.append((i / segments, 1.0))

    for i in range(segments):
        b0 = i * 2
        t0 = b0 + 1
        b1 = (i + 1) * 2
        t1 = b1 + 1
        indices.append((b0, b1, t0))
        indices.append((t0, b1, t1))

    top_center = len(verts)
    verts.append((0.0, half_h, 0.0))
    norms.append((0.0, 1.0, 0.0))
    uvs.append((0.5, 0.5))
    bottom_center = len(verts)
    verts.append((0.0, -half_h, 0.0))
    norms.append((0.0, -1.0, 0.0))
    uvs.append((0.5, 0.5))

    for i in range(segments):
        t0 = i * 2 + 1
        t1 = (i + 1) * 2 + 1
        b0 = i * 2
        b1 = (i + 1) * 2
        indices.append((top_center, t0, t1))
        indices.append((bottom_center, b1, b0))

    return geometry_dict(name, np.array(verts), np.array(norms), np.array(uvs), np.array(indices))


def rotation_matrix_from_y(direction: np.ndarray) -> np.ndarray:
    b = direction.astype(np.float64)
    b = b / np.linalg.norm(b)
    a = np.array([0.0, 1.0, 0.0], dtype=np.float64)
    v = np.cross(a, b)
    c = float(np.dot(a, b))

    if np.linalg.norm(v) < 1e-9:
        if c > 0:
            return np.eye(3)
        return np.array([[1.0, 0.0, 0.0], [0.0, -1.0, 0.0], [0.0, 0.0, -1.0]])

    vx = np.array(
        [
            [0.0, -v[2], v[1]],
            [v[2], 0.0, -v[0]],
            [-v[1], v[0], 0.0],
        ],
        dtype=np.float64,
    )
    return np.eye(3) + vx + vx @ vx * (1.0 / (1.0 + c))


def transform_geometry(geo: dict[str, Any], matrix: np.ndarray, translation: np.ndarray | None = None) -> dict[str, Any]:
    if translation is None:
        translation = np.zeros(3, dtype=np.float32)
    vertices = (geo["vertices"] @ matrix.T).astype(np.float32) + translation.astype(np.float32)
    normals = (geo["normals"] @ matrix.T).astype(np.float32)
    norms = np.linalg.norm(normals, axis=1, keepdims=True)
    normals = normals / np.maximum(norms, 1e-9)
    return geometry_dict(geo["name"], vertices, normals, geo["texcoords"], geo["indices"])


def translate_geometry(geo: dict[str, Any], offset: tuple[float, float, float]) -> dict[str, Any]:
    return geometry_dict(
        geo["name"],
        geo["vertices"] + np.array(offset, dtype=np.float32),
        geo["normals"],
        geo["texcoords"],
        geo["indices"],
    )


def create_cylinder_between(
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radius: float,
    segments: int,
    name: str,
) -> dict[str, Any]:
    start_np = np.array(start, dtype=np.float32)
    end_np = np.array(end, dtype=np.float32)
    direction = end_np - start_np
    length = float(np.linalg.norm(direction))
    if length <= 1e-6:
        raise ValueError("Cylinder endpoints are too close.")

    geo = create_cylinder(radius, radius, length, segments, name)
    matrix = rotation_matrix_from_y(direction)
    midpoint = (start_np + end_np) / 2.0
    return transform_geometry(geo, matrix.astype(np.float32), midpoint)


def create_meridian_ring(
    radius: float,
    tube_radius: float,
    major_segments: int,
    tube_segments: int,
    name: str,
) -> dict[str, Any]:
    verts: list[tuple[float, float, float]] = []
    norms: list[tuple[float, float, float]] = []
    uvs: list[tuple[float, float]] = []
    indices: list[tuple[int, int, int]] = []

    for i in range(major_segments + 1):
        t = 2.0 * math.pi * i / major_segments
        center = np.array([math.sin(t) * radius, math.cos(t) * radius, 0.0], dtype=np.float32)
        radial = np.array([math.sin(t), math.cos(t), 0.0], dtype=np.float32)
        side = np.array([0.0, 0.0, 1.0], dtype=np.float32)

        for j in range(tube_segments + 1):
            a = 2.0 * math.pi * j / tube_segments
            normal = math.cos(a) * radial + math.sin(a) * side
            point = center + tube_radius * normal
            verts.append(tuple(float(v) for v in point))
            norms.append(tuple(float(v) for v in normal))
            uvs.append((i / major_segments, j / tube_segments))

    stride = tube_segments + 1
    for i in range(major_segments):
        for j in range(tube_segments):
            a = i * stride + j
            b = (i + 1) * stride + j
            c = a + 1
            d = b + 1
            indices.append((a, b, c))
            indices.append((c, b, d))

    return geometry_dict(name, np.array(verts), np.array(norms), np.array(uvs), np.array(indices))


def rotate_z(point: tuple[float, float, float], degrees: float) -> tuple[float, float, float]:
    x, y, z = point
    angle = math.radians(degrees)
    c = math.cos(angle)
    s = math.sin(angle)
    return (x * c - y * s, x * s + y * c, z)


# ---------------------------------------------------------------------------
# GLB binary construction
# ---------------------------------------------------------------------------


def build_glb(base_texture: Image.Image, overlay_texture: Image.Image, geometries: list[dict[str, Any]]) -> bytes:
    print("Building GLB binary...")

    buffer_parts: list[bytes] = []
    buffer_views: list[dict[str, Any]] = []
    accessors: list[dict[str, Any]] = []

    def current_offset() -> int:
        return sum(len(part) for part in buffer_parts)

    def append_aligned(data: bytes, pad_byte: bytes = b"\x00") -> tuple[int, int]:
        offset = current_offset()
        if offset % 4:
            pad = 4 - offset % 4
            buffer_parts.append(pad_byte * pad)
            offset += pad
        length = len(data)
        if length % 4:
            data += pad_byte * (4 - length % 4)
        buffer_parts.append(data)
        return offset, length

    def make_buffer_view(byte_offset: int, byte_length: int, target: int | None = None) -> int:
        view = {"buffer": 0, "byteOffset": byte_offset, "byteLength": byte_length}
        if target is not None:
            view["target"] = target
        buffer_views.append(view)
        return len(buffer_views) - 1

    def make_accessor(
        view_idx: int,
        count: int,
        component_type: int,
        accessor_type: str,
        min_vals: list[float] | None = None,
        max_vals: list[float] | None = None,
    ) -> int:
        accessor: dict[str, Any] = {
            "bufferView": view_idx,
            "componentType": component_type,
            "count": count,
            "type": accessor_type,
        }
        if min_vals is not None and max_vals is not None:
            accessor["min"] = min_vals
            accessor["max"] = max_vals
        accessors.append(accessor)
        return len(accessors) - 1

    mesh_records: list[dict[str, Any]] = []
    for geo in geometries:
        vo, vl = append_aligned(geo["vertices"].astype(np.float32).tobytes())
        no, nl = append_aligned(geo["normals"].astype(np.float32).tobytes())
        uo, ul = append_aligned(geo["texcoords"].astype(np.float32).tobytes())
        io_, il = append_aligned(geo["indices"].astype(np.uint32).reshape(-1).tobytes())

        pos_view = make_buffer_view(vo, vl, 34962)
        norm_view = make_buffer_view(no, nl, 34962)
        uv_view = make_buffer_view(uo, ul, 34962)
        idx_view = make_buffer_view(io_, il, 34963)

        mesh_records.append(
            {
                "name": geo["name"],
                "material": geo["material"],
                "position": make_accessor(pos_view, geo["vertex_count"], 5126, "VEC3", geo["min"], geo["max"]),
                "normal": make_accessor(norm_view, geo["vertex_count"], 5126, "VEC3"),
                "uv": make_accessor(uv_view, geo["vertex_count"], 5126, "VEC2"),
                "indices": make_accessor(idx_view, geo["index_count"], 5125, "SCALAR"),
            }
        )

    images: list[dict[str, Any]] = []
    textures: list[dict[str, Any]] = []

    for image in (base_texture, overlay_texture):
        image_bytes_io = io.BytesIO()
        image.save(image_bytes_io, format="PNG", optimize=True)
        png_bytes = image_bytes_io.getvalue()
        print(f"  Embedded PNG: {len(png_bytes) / 1024 / 1024:.1f} MB")

        offset, length = append_aligned(png_bytes)
        view_idx = make_buffer_view(offset, length)
        images.append({"bufferView": view_idx, "mimeType": "image/png"})
        textures.append({"sampler": 0, "source": len(images) - 1})

    materials = [
        {
            "name": "Earth_Surface",
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": 0},
                "metallicFactor": 0.0,
                "roughnessFactor": 0.9,
            },
            "doubleSided": False,
        },
        {
            "name": "Political_Overlay_CN",
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": 1},
                "baseColorFactor": [1.0, 1.0, 1.0, 1.0],
                "metallicFactor": 0.0,
                "roughnessFactor": 0.85,
            },
            "alphaMode": "BLEND",
            "doubleSided": False,
        },
        {
            "name": "Atmosphere",
            "pbrMetallicRoughness": {
                "baseColorFactor": [0.45, 0.75, 1.0, 0.18],
                "metallicFactor": 0.0,
                "roughnessFactor": 0.2,
            },
            "alphaMode": "BLEND",
            "doubleSided": False,
        },
        {
            "name": "Stand_Material",
            "pbrMetallicRoughness": {
                "baseColorFactor": [0.22, 0.24, 0.27, 1.0],
                "metallicFactor": 0.65,
                "roughnessFactor": 0.32,
            },
            "doubleSided": False,
        },
    ]

    meshes = []
    for record in mesh_records:
        meshes.append(
            {
                "name": record["name"],
                "primitives": [
                    {
                        "attributes": {
                            "POSITION": record["position"],
                            "NORMAL": record["normal"],
                            "TEXCOORD_0": record["uv"],
                        },
                        "indices": record["indices"],
                        "material": record["material"],
                    }
                ],
            }
        )

    mesh_index = {record["name"]: index for index, record in enumerate(mesh_records)}

    half_angle = math.radians(AXIS_TILT_DEG) / 2.0
    qz = math.sin(half_angle)
    qw = math.cos(half_angle)

    nodes: list[dict[str, Any]] = []

    def mesh_node(name: str) -> int:
        nodes.append({"name": name, "mesh": mesh_index[name]})
        return len(nodes) - 1

    earth_node = mesh_node("Earth_Surface")
    overlay_node = mesh_node("Political_Overlay_CN")
    atmosphere_node = mesh_node("Atmosphere")
    nodes.append({"name": "Earth_Group", "children": [earth_node, overlay_node, atmosphere_node]})
    earth_group = len(nodes) - 1

    tilted_children = [
        earth_group,
        mesh_node("Axis_23_5"),
        mesh_node("Meridian_Ring"),
        mesh_node("Axis_NorthHub"),
        mesh_node("Axis_SouthHub"),
    ]
    nodes.append(
        {
            "name": "Tilted_Globe_23_5",
            "rotation": [0.0, 0.0, qz, qw],
            "children": tilted_children,
        }
    )
    tilted_group = len(nodes) - 1

    stand_children = [
        mesh_node("Stand_Base"),
        mesh_node("Stand_Post"),
        mesh_node("Stand_SupportArm"),
    ]
    nodes.append({"name": "Stand", "children": stand_children})
    stand_group = len(nodes) - 1

    gltf_json = {
        "asset": {"version": "2.0", "generator": "earth-political-glb-generator"},
        "scene": 0,
        "scenes": [{"name": "PoliticalGlobe", "nodes": [tilted_group, stand_group]}],
        "nodes": nodes,
        "meshes": meshes,
        "materials": materials,
        "textures": textures,
        "images": images,
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}],
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": current_offset()}],
    }

    json_bytes = json.dumps(gltf_json, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    if len(json_bytes) % 4:
        json_bytes += b" " * (4 - len(json_bytes) % 4)

    bin_body = b"".join(buffer_parts)
    if len(bin_body) % 4:
        bin_body += b"\x00" * (4 - len(bin_body) % 4)

    total_length = 12 + 8 + len(json_bytes) + 8 + len(bin_body)
    header = struct.pack("<III", 0x46546C67, 2, total_length)
    json_chunk = struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
    bin_chunk = struct.pack("<II", len(bin_body), 0x004E4942) + bin_body
    glb_data = header + json_chunk + bin_chunk

    print(f"  GLB total size: {len(glb_data) / 1024 / 1024:.1f} MB")
    print(f"  JSON chunk: {len(json_bytes) / 1024:.1f} KB")
    print(f"  BIN chunk: {len(bin_body) / 1024 / 1024:.1f} MB")
    return glb_data


def attach_material(geo: dict[str, Any], material: int) -> dict[str, Any]:
    geo = dict(geo)
    geo["material"] = material
    return geo


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    print("=" * 72)
    print("Earth Political Globe GLB Generator")
    print("=" * 72)

    base_texture, overlay_texture = generate_earth_textures()

    print("\nCreating 3D geometry...")
    earth_geo = create_uv_sphere(EARTH_RADIUS, LAT_SEGMENTS, LON_SEGMENTS, "Earth_Surface")
    overlay_geo = create_uv_sphere(OVERLAY_RADIUS, LAT_SEGMENTS, LON_SEGMENTS, "Political_Overlay_CN")
    atmosphere_geo = create_uv_sphere(ATMOSPHERE_RADIUS, 72, 144, "Atmosphere")

    axis_geo = create_cylinder(0.018, 0.018, 2.42, 20, "Axis_23_5")
    meridian_ring = create_meridian_ring(1.09, 0.014, 192, 10, "Meridian_Ring")

    north_hub = translate_geometry(create_uv_sphere(0.055, 16, 32, "Axis_NorthHub", 0.0), (0.0, 1.21, 0.0))
    south_hub = translate_geometry(create_uv_sphere(0.055, 16, 32, "Axis_SouthHub", 0.0), (0.0, -1.21, 0.0))

    south_axis_world = rotate_z((0.0, -1.21, 0.0), AXIS_TILT_DEG)
    base_center_x = 0.28
    base_y = -1.57
    base = translate_geometry(create_cylinder(0.56, 0.50, 0.12, 64, "Stand_Base"), (base_center_x, base_y, 0.0))
    post = create_cylinder_between((base_center_x, base_y + 0.06, 0.0), (south_axis_world[0], -1.22, 0.0), 0.036, 20, "Stand_Post")
    support = create_cylinder_between((south_axis_world[0], -1.22, 0.0), south_axis_world, 0.042, 20, "Stand_SupportArm")

    geometries = [
        attach_material(earth_geo, 0),
        attach_material(overlay_geo, 1),
        attach_material(atmosphere_geo, 2),
        attach_material(axis_geo, 3),
        attach_material(meridian_ring, 3),
        attach_material(north_hub, 3),
        attach_material(south_hub, 3),
        attach_material(base, 3),
        attach_material(post, 3),
        attach_material(support, 3),
    ]

    for geo in geometries:
        print(f"  {geo['name']}: {geo['vertex_count']} verts, {geo['index_count']} indices")

    glb_data = build_glb(base_texture, overlay_texture, geometries)

    output_dir = os.path.dirname(OUTPUT_PATH)
    os.makedirs(output_dir, exist_ok=True)
    with open(OUTPUT_PATH, "wb") as f:
        f.write(glb_data)

    print(f"\n[OK] Written: {os.path.abspath(OUTPUT_PATH)}")
    print(f"  File size: {len(glb_data) / 1024 / 1024:.1f} MB")
    print("Done.")


if __name__ == "__main__":
    main()
