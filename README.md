# UniversalAGI
Technical coding interview

## STL Studio

A web app to view, modify, and export STL models. Design doc: [docs/DESIGN.md](docs/DESIGN.md).

- `frontend/` — React + TypeScript + Three.js single-page app. STL parsing/serialization runs in a Web Worker; the working model persists in the browser via IndexedDB.
- `backend/` — Stateless FastAPI service for heavy mesh operations (repair, decimation) using trimesh.

### Run locally

Backend (port 8000):

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --port 8000
```

Frontend (port 5173, proxies `/api` to the backend):

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and drop an STL file into the window.

### Features

- Drag-and-drop loading of binary and ASCII STL files
- Orbit/pan/zoom, shaded / wireframe / x-ray display modes, double-click to re-center the orbit pivot
- Move/rotate/scale gizmos plus precise numeric transforms
- Scale-to-size, mirror, center-on-plate, flip normals
- Undo/redo, binary STL export
- Server-side mesh repair (holes, winding, degenerate faces) and quadric decimation with cancel
- Workspace survives reloads (model + camera checkpointed to IndexedDB)
