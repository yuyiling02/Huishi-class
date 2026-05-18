"""
Generate a styled diamond cubic unit-cell GLB.

The NIH3D source asset is an STL-derived single mesh without materials, so it
renders as a plain white model. This builder creates explicit carbon atoms,
covalent bonds, and a unit-cell frame with separate PBR materials.
"""

import json
import os
import struct
from itertools import product

import numpy as np


OUTPUT_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "public",
    "models",
    "diamond-unit-cell_NIH3D.glb",
)
BACKUP_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "public",
    "models",
    "diamond-unit-cell_NIH3D.white-original.glb",
)

CELL_SIZE = 2.4
SURFACE_RADIUS = 0.105
INTERNAL_RADIUS = 0.13
BOND_RADIUS = 0.035
FRAME_RADIUS = 0.022
SPHERE_SUBDIVISIONS = 2
CYLINDER_SEGMENTS = 18


def pad4(data: bytes, fill: bytes = b"\x00") -> bytes:
    rem = len(data) % 4
    return data if rem == 0 else data + fill * (4 - rem)


def create_icosahedron():
    phi = (1.0 + np.sqrt(5.0)) / 2.0
    verts = np.array(
        [
            [-1, phi, 0],
            [1, phi, 0],
            [-1, -phi, 0],
            [1, -phi, 0],
            [0, -1, phi],
            [0, 1, phi],
            [0, -1, -phi],
            [0, 1, -phi],
            [phi, 0, -1],
            [phi, 0, 1],
            [-phi, 0, -1],
            [-phi, 0, 1],
        ],
        dtype=np.float32,
    )
    verts /= np.linalg.norm(verts, axis=1, keepdims=True)
    faces = np.array(
        [
            [0, 11, 5],
            [0, 5, 1],
            [0, 1, 7],
            [0, 7, 10],
            [0, 10, 11],
            [1, 5, 9],
            [5, 11, 4],
            [11, 10, 2],
            [10, 7, 6],
            [7, 1, 8],
            [3, 9, 4],
            [3, 4, 2],
            [3, 2, 6],
            [3, 6, 8],
            [3, 8, 9],
            [4, 9, 5],
            [2, 4, 11],
            [6, 2, 10],
            [8, 6, 7],
            [9, 8, 1],
        ],
        dtype=np.uint32,
    )
    return verts, faces


def subdivide(verts, faces):
    new_verts = [v / np.linalg.norm(v) for v in verts]
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
        new_faces.extend([[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]])

    return np.array(new_verts, dtype=np.float32), np.array(new_faces, dtype=np.uint32)


def generate_sphere(radius):
    verts, faces = create_icosahedron()
    for _ in range(SPHERE_SUBDIVISIONS):
        verts, faces = subdivide(verts, faces)
    normals = verts.copy()
    verts = verts * radius
    return verts.astype(np.float32), normals.astype(np.float32), faces.astype(np.uint32).flatten()


def cylinder_between(start, end, radius, segments=CYLINDER_SEGMENTS):
    start = np.array(start, dtype=np.float32)
    end = np.array(end, dtype=np.float32)
    axis = end - start
    length = np.linalg.norm(axis)
    if length <= 1e-6:
        return None
    axis = axis / length

    helper = np.array([0.0, 1.0, 0.0], dtype=np.float32)
    if abs(np.dot(axis, helper)) > 0.92:
        helper = np.array([1.0, 0.0, 0.0], dtype=np.float32)
    tangent = np.cross(axis, helper)
    tangent = tangent / np.linalg.norm(tangent)
    bitangent = np.cross(axis, tangent)

    verts = []
    normals = []
    indices = []
    for i in range(segments):
        angle = (i / segments) * np.pi * 2.0
        normal = np.cos(angle) * tangent + np.sin(angle) * bitangent
        verts.append(start + normal * radius)
        verts.append(end + normal * radius)
        normals.append(normal)
        normals.append(normal)

    for i in range(segments):
        j = (i + 1) % segments
        a, b, c, d = i * 2, i * 2 + 1, j * 2 + 1, j * 2
        indices.extend([a, b, c, a, c, d])

    return (
        np.array(verts, dtype=np.float32),
        np.array(normals, dtype=np.float32),
        np.array(indices, dtype=np.uint32),
    )


def combine_cylinders(segments):
    all_verts = []
    all_normals = []
    all_indices = []
    offset = 0
    for start, end, radius in segments:
        cyl = cylinder_between(start, end, radius)
        if cyl is None:
            continue
        verts, normals, indices = cyl
        all_verts.append(verts)
        all_normals.append(normals)
        all_indices.append(indices + offset)
        offset += len(verts)
    return (
        np.concatenate(all_verts).astype(np.float32),
        np.concatenate(all_normals).astype(np.float32),
        np.concatenate(all_indices).astype(np.uint32),
    )


def frac_to_world(frac):
    return (np.array(frac, dtype=np.float32) - 0.5) * CELL_SIZE


def diamond_atoms():
    atoms = []

    for frac in product([0.0, 1.0], repeat=3):
        atoms.append({"name": "C_corner", "frac": frac, "kind": "surface"})

    for axis in range(3):
        for side in [0.0, 1.0]:
            frac = [0.5, 0.5, 0.5]
            frac[axis] = side
            atoms.append({"name": "C_face", "frac": tuple(frac), "kind": "surface"})

    for frac in [
        (0.25, 0.25, 0.25),
        (0.25, 0.75, 0.75),
        (0.75, 0.25, 0.75),
        (0.75, 0.75, 0.25),
    ]:
        atoms.append({"name": "C_tetra", "frac": frac, "kind": "internal"})

    for atom in atoms:
        atom["pos"] = frac_to_world(atom["frac"])
    return atoms


def diamond_bonds(atoms):
    target = CELL_SIZE * np.sqrt(3.0) / 4.0
    bonds = []
    for i, left in enumerate(atoms):
        for right in atoms[i + 1 :]:
            if left["kind"] == right["kind"]:
                continue
            distance = np.linalg.norm(left["pos"] - right["pos"])
            if abs(distance - target) < 0.035:
                bonds.append((left["pos"], right["pos"], BOND_RADIUS))
    return bonds


def frame_edges():
    corners = [frac_to_world(frac) for frac in product([0.0, 1.0], repeat=3)]
    edges = []
    for i, a in enumerate(corners):
        for b in corners[i + 1 :]:
            diff = np.abs(a - b)
            if np.count_nonzero(diff > 1e-4) == 1:
                edges.append((a, b, FRAME_RADIUS))
    return edges


class GlbBuilder:
    def __init__(self):
        self.buffer = bytearray()
        self.buffer_views = []
        self.accessors = []

    def add_accessor(self, array, component_type, accessor_type, target=None, include_bounds=False):
        raw = array.tobytes()
        while len(self.buffer) % 4:
            self.buffer.append(0)
        offset = len(self.buffer)
        self.buffer.extend(raw)
        while len(self.buffer) % 4:
            self.buffer.append(0)

        view = {"buffer": 0, "byteOffset": offset, "byteLength": len(raw)}
        if target is not None:
            view["target"] = target
        view_index = len(self.buffer_views)
        self.buffer_views.append(view)

        accessor = {
            "bufferView": view_index,
            "componentType": component_type,
            "count": int(len(array)),
            "type": accessor_type,
        }
        if include_bounds:
            accessor["min"] = array.min(axis=0).astype(float).tolist()
            accessor["max"] = array.max(axis=0).astype(float).tolist()
        accessor_index = len(self.accessors)
        self.accessors.append(accessor)
        return accessor_index


def build_glb():
    atoms = diamond_atoms()
    surface_sphere = generate_sphere(SURFACE_RADIUS)
    internal_sphere = generate_sphere(INTERNAL_RADIUS)
    bond_mesh = combine_cylinders(diamond_bonds(atoms))
    frame_mesh = combine_cylinders(frame_edges())

    builder = GlbBuilder()
    meshes = []
    for verts, normals, indices, material in [
        (*surface_sphere, 0),
        (*internal_sphere, 1),
        (*bond_mesh, 2),
        (*frame_mesh, 3),
    ]:
        pos = builder.add_accessor(verts, 5126, "VEC3", 34962, include_bounds=True)
        norm = builder.add_accessor(normals, 5126, "VEC3", 34962)
        idx = builder.add_accessor(indices, 5125, "SCALAR", 34963)
        meshes.append(
            {
                "primitives": [
                    {
                        "attributes": {"POSITION": pos, "NORMAL": norm},
                        "indices": idx,
                        "material": material,
                    }
                ]
            }
        )

    materials = [
        {
            "name": "surface graphite carbon",
            "pbrMetallicRoughness": {
                "baseColorFactor": [0.20, 0.26, 0.33, 1.0],
                "metallicFactor": 0.08,
                "roughnessFactor": 0.28,
            },
            "emissiveFactor": [0.01, 0.025, 0.035],
        },
        {
            "name": "inner blue graphite carbon",
            "pbrMetallicRoughness": {
                "baseColorFactor": [0.07, 0.11, 0.16, 1.0],
                "metallicFactor": 0.12,
                "roughnessFactor": 0.22,
            },
            "emissiveFactor": [0.0, 0.045, 0.06],
        },
        {
            "name": "cyan covalent bonds",
            "pbrMetallicRoughness": {
                "baseColorFactor": [0.0, 0.78, 0.88, 0.78],
                "metallicFactor": 0.0,
                "roughnessFactor": 0.18,
            },
            "emissiveFactor": [0.0, 0.09, 0.10],
            "alphaMode": "BLEND",
            "doubleSided": True,
        },
        {
            "name": "warm amber unit-cell frame",
            "pbrMetallicRoughness": {
                "baseColorFactor": [1.0, 0.62, 0.18, 0.86],
                "metallicFactor": 0.08,
                "roughnessFactor": 0.24,
            },
            "emissiveFactor": [0.10, 0.045, 0.0],
            "alphaMode": "BLEND",
            "doubleSided": True,
        },
    ]

    nodes = [{"name": "diamond_unit_cell", "children": []}]
    for i, atom in enumerate(atoms):
        is_internal = atom["kind"] == "internal"
        nodes[0]["children"].append(len(nodes))
        nodes.append(
            {
                "name": f"{atom['name']}_{i}",
                "mesh": 1 if is_internal else 0,
                "translation": atom["pos"].astype(float).tolist(),
            }
        )

    nodes[0]["children"].append(len(nodes))
    nodes.append({"name": "covalent_bond_network", "mesh": 2})
    nodes[0]["children"].append(len(nodes))
    nodes.append({"name": "unit_cell_frame", "mesh": 3})

    gltf = {
        "asset": {"version": "2.0", "generator": "diamond-unit-cell-builder"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": nodes,
        "meshes": meshes,
        "materials": materials,
        "accessors": builder.accessors,
        "bufferViews": builder.buffer_views,
        "buffers": [{"byteLength": len(builder.buffer)}],
    }

    json_str = json.dumps(gltf, separators=(",", ":"))
    json_bytes = pad4(json_str.encode("utf-8"), b" ")
    bin_bytes = pad4(bytes(builder.buffer))

    header = struct.pack("<II", 0x46546C67, 2)
    header += struct.pack("<I", 12 + 8 + len(json_bytes) + 8 + len(bin_bytes))
    json_chunk = struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
    bin_chunk = struct.pack("<II", len(bin_bytes), 0x004E4942) + bin_bytes
    return header + json_chunk + bin_chunk, len(atoms), len(diamond_bonds(atoms))


if __name__ == "__main__":
    if os.path.exists(OUTPUT_PATH) and not os.path.exists(BACKUP_PATH):
        with open(OUTPUT_PATH, "rb") as src, open(BACKUP_PATH, "wb") as dst:
            dst.write(src.read())

    data, atom_count, bond_count = build_glb()
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "wb") as f:
        f.write(data)

    print(
        f"OK - diamond unit cell generated: {atom_count} atoms, "
        f"{bond_count} bonds, {len(data) / 1024:.1f} KB"
    )
    print(f"path: {OUTPUT_PATH}")
