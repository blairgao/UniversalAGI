# Design Doc: STL Rendering & Editing Web App (MVP)

**Status:** Draft
**Author:** —
**Last updated:** 2026-07-10

## 1. Overview

A web application that lets users load STL files (the de facto standard for 3D printing and CAD mesh exchange), render them interactively in the browser, apply modifications (transforms, cuts, repairs), and download the modified result.

The core experience: drag an STL file into the browser, see the model instantly, orbit/zoom/inspect it, tweak it (scale, rotate, cut, repair), and export a new STL.

This MVP has **no accounts, no database, and no cloud storage**. Models live in the browser (IndexedDB) so work survives a reload. A small stateless backend exists solely to run mesh operations that are too heavy for the browser.

## 2. Goals & Non-Goals

### Goals

- Load and render STL files (both binary and ASCII formats) up to ~100 MB.
- Smooth interactive viewing: orbit, pan, zoom, display modes, measurement.
- Modify the model: transform (translate/rotate/scale/mirror), plane cut, mesh repair (fill holes, fix normals, remove degenerate triangles), decimation/simplification.
- Export the modified mesh as binary STL.
- Persist the working model locally in the browser so a reload doesn't lose work.

### Non-Goals (MVP)

- User accounts, auth, or sessions of any kind.
- Server-side persistence (no database, no object storage). The server holds files only for the duration of one operation.
- Sharing links, multi-user features, collaboration.
- Deployment/infra work beyond "runs locally with two dev servers".
- Full parametric CAD editing (this is a mesh tool, not Fusion/Onshape).
- Slicing for 3D printing (G-code generation).

## 3. User Stories

1. As a user, I can drag-and-drop an STL file and see it rendered in under 2 seconds for typical files (<20 MB).
2. As a user, I can orbit, pan, and zoom with mouse/touch, and toggle wireframe/shaded/x-ray modes.
3. As a user, I can see bounding box dimensions, triangle count, and volume, and measure distances between two points.
4. As a user, I can scale the model to target dimensions, rotate it, mirror it, and re-center it on the build plate.
5. As a user, I can cut the model with a plane and keep either half.
6. As a user, I can run "repair" and get a watertight mesh with consistent normals.
7. As a user, I can undo/redo any modification.
8. As a user, I can download the current state as a binary STL.
9. As a user, I can close the tab, reopen the app, and continue where I left off.

## 4. High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Browser                           │
│  React SPA                                               │
│  ├── Viewer (Three.js, WebGL2)                           │
│  ├── Edit tools UI (transform gizmos, plane cut, etc.)   │
│  ├── Web Worker: STL parse/serialize, light mesh ops     │
│  └── IndexedDB: current model + undo snapshots           │
└───────────────┬─────────────────────────────────────────┘
                │ HTTPS / REST (heavy ops only)
┌───────────────▼─────────────────────────────────────────┐
│              Mesh API Server (FastAPI, stateless)        │
│  trimesh / Open3D: repair, decimate                      │
│  request in → process → response out, nothing stored     │
└─────────────────────────────────────────────────────────┘
```

### Key architectural decisions

- **Rendering is 100% client-side** (Three.js). The server never renders pixels.
- **Light modifications run client-side** in a Web Worker: transforms, plane cuts, normal fixes. Instant feedback, no round trip.
- **Heavy operations run server-side, synchronously and statelessly**: the client POSTs the STL bytes, the server runs the operation (repair, decimation) and streams the result back in the same response. No job queue, no stored blobs — a request either completes or fails.
- **The browser is the only source of truth.** The current mesh and undo history live in memory and are checkpointed to IndexedDB. (IndexedDB rather than `localStorage` because `localStorage` is capped at ~5 MB and string-only; IndexedDB stores binary blobs at realistic STL sizes.)

## 5. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend framework | React + TypeScript + Vite | Ecosystem, type safety, fast dev loop |
| 3D rendering | Three.js (+ react-three-fiber) | Mature WebGL library, built-in STLLoader, TransformControls |
| Client mesh ops | Web Worker + three-bvh-csg / custom | Keep main thread at 60 fps |
| Local persistence | IndexedDB (via `idb`) | Binary blob storage, large quota |
| API server | Python + FastAPI | Async, OpenAPI docs for free, same language as mesh tooling |
| Mesh processing | trimesh (+ Open3D for repair/decimation) | Battle-tested Python mesh libraries |

No database, no queue, no auth provider, no cloud services.

## 6. Local Persistence Model

IndexedDB, one store:

```
workspace
  key: "current"
  value: {
    name:          string        // filename
    stl:           Blob          // current mesh, binary STL
    savedAt:       number        // epoch ms
    camera:        {position, target}   // restore viewpoint
  }
```

- The current mesh is checkpointed after each committed operation (debounced), so a crash or reload loses at most the in-flight gesture.
- Undo/redo history is kept in memory only (bounded by a memory budget); it does not survive a reload. Persisting full history is out of scope for MVP.
- MVP supports one working model at a time. A multi-model library is a natural follow-up (same store, keyed by UUID).

## 7. API Design (REST)

The backend exposes stateless mesh operations. Request and response bodies are raw binary STL (`application/octet-stream`); parameters go in the query string.

```
POST /api/mesh/repair                      -- fill holes, fix normals/winding,
                                              remove degenerate triangles
POST /api/mesh/decimate?target_faces=N     -- quadric edge-collapse simplification
GET  /api/health
```

- Responses return the processed STL directly (same request/response cycle). Typical repair of a 50 MB mesh is tens of seconds; the client shows a blocking progress state with cancel (client-side abort).
- Request size limit (~100 MB) and a per-request processing timeout guard the server.
- Nothing is written to disk beyond OS temp files deleted at request end.

## 8. Frontend Design

### 8.1 Viewer

- **Loading:** file dropped → parsed in a Web Worker (binary STL: 80-byte header, uint32 triangle count, 50 bytes/triangle) → transferable `ArrayBuffer` of positions/normals → `BufferGeometry`. No main-thread jank.
- **Camera:** orbit controls with damping; double-click to re-center pivot on clicked surface point; "fit view" button.
- **Display modes:** shaded, wireframe overlay, x-ray/transparent, flat vs. smooth shading toggle.
- **Scene helpers:** ground grid ("build plate"), axes gizmo in the corner.
- **Info panel:** triangle count, bounding box (mm), surface area, volume, watertight status.

### 8.2 Interaction & Editing Tools

| Tool | Where it runs | Notes |
|---|---|---|
| Translate / rotate / scale | Client | Three.js TransformControls gizmo; numeric input fields for precision |
| Scale to size | Client | "Make longest dimension = X mm" |
| Mirror | Client | Flip across XY/XZ/YZ plane, re-fix winding order |
| Center / lay flat | Client | Drop lowest face to z=0 |
| Plane cut | Client (worker) | Interactive plane gizmo; keep A / keep B; cap the cut face |
| Measure | Client | Point-to-point distance, raycast surface picking |
| Fix normals | Client (worker) | Consistent winding + recompute normals |
| Repair (holes, non-manifold) | Server (`/api/mesh/repair`) | trimesh/Open3D; too heavy and fiddly for client |
| Decimate / simplify | Server (`/api/mesh/decimate`) | Quadric edge collapse, target triangle count |

### 8.3 Edit history

- Command-pattern undo/redo stack on the client. Transforms record their inverse; destructive ops (cuts, server results) record a geometry snapshot, capped by a memory budget.
- After each committed operation, the current mesh is serialized to binary STL in the worker and checkpointed to IndexedDB.
- "Export" downloads that same binary STL via the browser's save dialog.

### 8.4 UI layout

```
┌──────────────────────────────────────────────────────┐
│ Top bar: model name · undo/redo · export STL         │
├────────┬─────────────────────────────────┬───────────┤
│ Tool   │                                 │ Inspector │
│ rail   │        3D Viewport              │ - dims    │
│ (icons)│                                 │ - stats   │
│        │                                 │ - tool    │
│        │                                 │   params  │
├────────┴─────────────────────────────────┴───────────┤
│ Status bar: tri count · units · server op progress   │
└──────────────────────────────────────────────────────┘
```

On first load, if IndexedDB has a saved workspace, restore it; otherwise show the drop zone.

## 9. STL Handling Details

- **Format detection:** binary vs. ASCII sniffed by header + size heuristic (`solid` prefix alone is unreliable — some binary files start with it; validate against expected byte length).
- **Units:** STL is unitless. Default to millimeters (3D-printing convention) with a user-selectable unit and a "model is 0.05mm tall, did you mean inches?" nudge.
- **Validation on load:** max size, triangle count sanity, reject malformed files with a clear error.
- **Export:** binary STL (5–6x smaller than ASCII).

## 10. Performance Targets

| Metric | Target |
|---|---|
| Parse + first render, 20 MB binary STL | < 2 s on mid-range laptop |
| Viewport frame rate during orbit | 60 fps up to 2M triangles |
| Transform gizmo latency | < 16 ms (same frame) |
| Server repair, 50 MB mesh | < 60 s |
| IndexedDB checkpoint | Off main thread, no visible hitch |

## 11. Limits & Hardening

- Server validates STL structure (magic-byte/length check), not just extension; rejects files whose declared triangle count doesn't match the byte length (malicious STLs can be decompression-bomb-like: tiny file claiming 4B triangles).
- Per-request size limit (~100 MB), processing timeout, and memory cap on the mesh server.
- Client warns before loading meshes above a triangle budget rather than freezing the tab.

## 12. Milestones

| Milestone | Scope | Est. |
|---|---|---|
| **M1: Viewer** | Drop-to-load, worker STL parse, render, orbit/zoom, display modes, model stats | 1.5 wk |
| **M2: Client editing** | Transform gizmos + numeric input, scale-to-size, mirror, lay flat, undo/redo, binary STL export | 1.5 wk |
| **M3: Local persistence** | IndexedDB checkpoint/restore, camera restore, "new file" flow | 0.5 wk |
| **M4: Mesh server** | FastAPI service, repair + decimate endpoints, client integration with progress/cancel | 1.5 wk |
| **M5: Polish** | Plane cut with capping, measurements, mobile touch controls | 1 wk |

M1–M3 deliver a fully useful offline tool with zero backend; M4 is additive.

## 13. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Huge meshes tank browser performance | Triangle budget warnings, worker parsing, transferables |
| Mesh repair is an unsolved-in-general problem | Scope "repair" to hole filling + normal fixing + degenerate removal; results land as an undoable step, never silently overwrite |
| Synchronous server ops block on slow requests | Per-request timeout + client-side abort; if ops time out regularly, revisit with async jobs post-MVP |
| CSG/boolean ops are numerically fragile | MVP ships plane cut only (robust); full booleans deferred |
| Browser storage eviction wipes local work | Request persistent storage (`navigator.storage.persist()`); export is always one click away |

## 14. Open Questions

1. Should undo history (not just the current mesh) be persisted to IndexedDB, or is in-memory-only acceptable for MVP?
2. Decimation preview: is a client-side rough preview worth building, or is "run on server, undo if unhappy" enough?
3. Is OBJ export worth adding while the trimesh conversion path is essentially free on the server?
