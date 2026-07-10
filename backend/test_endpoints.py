"""Smoke test for the mesh service. Run with the server up on :8000."""

import io
import urllib.request

import numpy as np
import trimesh

BASE = "http://localhost:8000"


def post(path: str, data: bytes) -> bytes:
    req = urllib.request.Request(
        BASE + path, data=data, headers={"Content-Type": "application/octet-stream"}
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        assert resp.status == 200, resp.status
        return resp.read()


def load(data: bytes) -> trimesh.Trimesh:
    return trimesh.load(io.BytesIO(data), file_type="stl")


def main() -> None:
    with urllib.request.urlopen(BASE + "/api/health", timeout=10) as resp:
        assert resp.status == 200
    print("health: ok")

    # Repair: sphere with a hole punched in it
    sphere = trimesh.creation.icosphere(subdivisions=4, radius=20.0)
    broken = trimesh.Trimesh(
        vertices=sphere.vertices.copy(), faces=sphere.faces[10:].copy(), process=False
    )
    assert not broken.is_watertight
    repaired = load(post("/api/mesh/repair", broken.export(file_type="stl")))
    print(f"repair: {len(broken.faces)} faces (holed) -> {len(repaired.faces)} faces, "
          f"watertight={repaired.is_watertight}")
    assert repaired.is_watertight

    # Decimate: 20480-face sphere down to ~2000
    decimated = load(
        post("/api/mesh/decimate?target_faces=2000", sphere.export(file_type="stl"))
    )
    print(f"decimate: {len(sphere.faces)} -> {len(decimated.faces)} faces")
    assert len(decimated.faces) <= 2200
    # Volume should be roughly preserved
    assert abs(decimated.volume - sphere.volume) / sphere.volume < 0.05

    # Malformed input is rejected cleanly
    try:
        post("/api/mesh/repair", b"this is not an stl file at all" * 10)
        raise AssertionError("expected 400")
    except urllib.error.HTTPError as e:
        assert e.code == 400, e.code
        print("malformed input: rejected with 400")

    print("all endpoint tests passed")


if __name__ == "__main__":
    main()
