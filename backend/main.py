"""Stateless mesh-processing service for STL Studio.

Every endpoint takes raw binary STL in the request body and returns the
processed model as binary STL in the response. Nothing is persisted.
"""

import io

import numpy as np
import pymeshfix
import trimesh
from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware

MAX_BYTES = 100 * 1024 * 1024

app = FastAPI(title="STL Studio Mesh Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _read_mesh(request: Request) -> trimesh.Trimesh:
    length = request.headers.get("content-length")
    if length and int(length) > MAX_BYTES:
        raise HTTPException(413, f"File exceeds the {MAX_BYTES // (1024 * 1024)} MB limit")
    data = await request.body()
    if not data:
        raise HTTPException(400, "Request body is empty; expected binary STL")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, f"File exceeds the {MAX_BYTES // (1024 * 1024)} MB limit")
    try:
        mesh = trimesh.load(io.BytesIO(data), file_type="stl")
    except Exception as exc:
        raise HTTPException(400, f"Could not parse STL: {exc}") from exc
    if isinstance(mesh, trimesh.Scene):
        geometries = [g for g in mesh.geometry.values() if isinstance(g, trimesh.Trimesh)]
        if not geometries:
            raise HTTPException(400, "STL contains no triangles")
        mesh = trimesh.util.concatenate(geometries)
    if not isinstance(mesh, trimesh.Trimesh) or len(mesh.faces) == 0:
        raise HTTPException(400, "STL contains no triangles")
    return mesh


def _stl_response(mesh: trimesh.Trimesh) -> Response:
    return Response(
        content=mesh.export(file_type="stl"),
        media_type="application/octet-stream",
    )


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/mesh/repair")
async def repair(request: Request) -> Response:
    """Merge vertices, drop degenerate/duplicate faces, fix winding and
    normals, and fill holes. Best-effort: a mesh that cannot be made
    watertight is still returned improved."""
    mesh = await _read_mesh(request)
    mesh.process(validate=True)
    trimesh.repair.fix_winding(mesh)
    trimesh.repair.fix_inversion(mesh)
    trimesh.repair.fix_normals(mesh)
    trimesh.repair.fill_holes(mesh)
    mesh.remove_unreferenced_vertices()

    if not mesh.is_watertight and len(mesh.faces) > 0:
        # trimesh only fills trivial holes; MeshFix handles the general case.
        fixer = pymeshfix.MeshFix(
            np.asarray(mesh.vertices, dtype=np.float64),
            np.asarray(mesh.faces, dtype=np.int64),
        )
        fixer.repair(joincomp=True, remove_smallest_components=False)
        if len(fixer.faces) > 0:
            mesh = trimesh.Trimesh(fixer.points, fixer.faces)
            trimesh.repair.fix_normals(mesh)

    if len(mesh.faces) == 0:
        raise HTTPException(422, "Repair removed all faces; the mesh may be fully degenerate")
    return _stl_response(mesh)


@app.post("/api/mesh/decimate")
async def decimate(
    request: Request,
    target_faces: int = Query(..., ge=4, description="Desired triangle count"),
) -> Response:
    """Quadric edge-collapse simplification toward target_faces triangles."""
    mesh = await _read_mesh(request)
    if target_faces >= len(mesh.faces):
        return _stl_response(mesh)
    try:
        simplified = mesh.simplify_quadric_decimation(face_count=target_faces)
    except Exception as exc:
        raise HTTPException(422, f"Decimation failed: {exc}") from exc
    if not isinstance(simplified, trimesh.Trimesh) or len(simplified.faces) == 0:
        raise HTTPException(422, "Decimation produced an empty mesh")
    return _stl_response(simplified)
