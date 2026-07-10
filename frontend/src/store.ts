import { create } from "zustand";
import { computeFlatNormals, type MeshStats } from "./lib/stl";
import { computeStatsAsync, parseSTLAsync, serializeSTLAsync } from "./lib/workerClient";
import {
  clearWorkspace,
  loadWorkspace,
  saveWorkspace,
  type SavedCamera,
} from "./lib/persistence";
import { meshOperation } from "./lib/api";

export type DisplayMode = "shaded" | "wireframe" | "xray";
export type GizmoMode = "none" | "translate" | "rotate" | "scale";

const MAX_UNDO_BYTES = 256 * 1024 * 1024;
const CHECKPOINT_DEBOUNCE_MS = 1000;

interface StoreState {
  name: string | null;
  positions: Float32Array | null;
  normals: Float32Array | null;
  /** bumped on every geometry change so the viewport rebuilds BufferGeometry */
  geometryVersion: number;
  stats: MeshStats | null;
  displayMode: DisplayMode;
  gizmoMode: GizmoMode;
  /** label shown while a blocking operation runs, null when idle */
  busy: string | null;
  error: string | null;
  restoring: boolean;
  undoStack: Float32Array[];
  redoStack: Float32Array[];

  setDisplayMode: (mode: DisplayMode) => void;
  setGizmoMode: (mode: GizmoMode) => void;
  setError: (error: string | null) => void;
}

export const useStore = create<StoreState>((set) => ({
  name: null,
  positions: null,
  normals: null,
  geometryVersion: 0,
  stats: null,
  displayMode: "shaded",
  gizmoMode: "none",
  busy: null,
  error: null,
  restoring: true,
  undoStack: [],
  redoStack: [],

  setDisplayMode: (displayMode) => set({ displayMode }),
  setGizmoMode: (gizmoMode) => set({ gizmoMode }),
  setError: (error) => set({ error }),
}));

// Camera state lives outside React: the viewport writes it, checkpoints read it.
export const cameraRef: { current: SavedCamera | null } = { current: null };

let statsToken = 0;
let checkpointTimer: ReturnType<typeof setTimeout> | null = null;
let activeAbort: AbortController | null = null;

function refreshStatsAsync(positions: Float32Array): void {
  const token = ++statsToken;
  computeStatsAsync(positions).then((stats) => {
    if (token === statsToken) useStore.setState({ stats });
  });
}

function scheduleCheckpoint(): void {
  if (checkpointTimer) clearTimeout(checkpointTimer);
  checkpointTimer = setTimeout(async () => {
    checkpointTimer = null;
    const { positions, name } = useStore.getState();
    if (!positions || !name) return;
    try {
      const buffer = await serializeSTLAsync(positions);
      await saveWorkspace({
        name,
        stl: new Blob([buffer], { type: "application/octet-stream" }),
        savedAt: Date.now(),
        camera: cameraRef.current,
      });
    } catch (err) {
      console.warn("checkpoint failed", err);
    }
  }, CHECKPOINT_DEBOUNCE_MS);
}

function trimUndoStack(stack: Float32Array[]): Float32Array[] {
  let bytes = 0;
  const kept: Float32Array[] = [];
  for (let i = stack.length - 1; i >= 0; i--) {
    bytes += stack[i].byteLength;
    if (bytes > MAX_UNDO_BYTES && kept.length > 0) break;
    kept.unshift(stack[i]);
  }
  return kept;
}

/** Commit new geometry as an undoable step. */
export function commitPositions(next: Float32Array): void {
  const { positions, undoStack } = useStore.getState();
  useStore.setState({
    positions: next,
    normals: computeFlatNormals(next),
    geometryVersion: useStore.getState().geometryVersion + 1,
    undoStack: positions ? trimUndoStack([...undoStack, positions]) : undoStack,
    redoStack: [],
  });
  refreshStatsAsync(next);
  scheduleCheckpoint();
}

/** Load a freshly parsed model, resetting history. */
export function loadModel(name: string, positions: Float32Array): void {
  useStore.setState({
    name,
    positions,
    normals: computeFlatNormals(positions),
    geometryVersion: useStore.getState().geometryVersion + 1,
    stats: null,
    undoStack: [],
    redoStack: [],
    error: null,
    gizmoMode: "none",
  });
  refreshStatsAsync(positions);
  scheduleCheckpoint();
}

export async function openFile(file: File): Promise<void> {
  useStore.setState({ busy: "Loading model…", error: null });
  try {
    const positions = await parseSTLAsync(await file.arrayBuffer());
    cameraRef.current = null;
    loadModel(file.name, positions);
  } catch (err) {
    useStore.setState({ error: err instanceof Error ? err.message : String(err) });
  } finally {
    useStore.setState({ busy: null });
  }
}

export function undo(): void {
  const { undoStack, redoStack, positions } = useStore.getState();
  const previous = undoStack[undoStack.length - 1];
  if (!previous || !positions) return;
  useStore.setState({
    positions: previous,
    normals: computeFlatNormals(previous),
    geometryVersion: useStore.getState().geometryVersion + 1,
    undoStack: undoStack.slice(0, -1),
    redoStack: [...redoStack, positions],
  });
  refreshStatsAsync(previous);
  scheduleCheckpoint();
}

export function redo(): void {
  const { undoStack, redoStack, positions } = useStore.getState();
  const next = redoStack[redoStack.length - 1];
  if (!next || !positions) return;
  useStore.setState({
    positions: next,
    normals: computeFlatNormals(next),
    geometryVersion: useStore.getState().geometryVersion + 1,
    undoStack: [...undoStack, positions],
    redoStack: redoStack.slice(0, -1),
  });
  refreshStatsAsync(next);
  scheduleCheckpoint();
}

export async function exportSTL(): Promise<void> {
  const { positions, name } = useStore.getState();
  if (!positions) return;
  const buffer = await serializeSTLAsync(positions);
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (name ?? "model").replace(/\.stl$/i, "") + ".stl";
  a.click();
  URL.revokeObjectURL(url);
}

export async function newFile(): Promise<void> {
  await clearWorkspace().catch(() => {});
  cameraRef.current = null;
  useStore.setState({
    name: null,
    positions: null,
    normals: null,
    stats: null,
    undoStack: [],
    redoStack: [],
    error: null,
    gizmoMode: "none",
  });
}

/** Restore the saved workspace on app start, if one exists. */
export async function restoreWorkspace(): Promise<void> {
  try {
    const saved = await loadWorkspace();
    if (saved) {
      const positions = await parseSTLAsync(await saved.stl.arrayBuffer());
      cameraRef.current = saved.camera;
      loadModel(saved.name, positions);
    }
  } catch (err) {
    console.warn("workspace restore failed", err);
  } finally {
    useStore.setState({ restoring: false });
  }
}

/** Run a server-side mesh operation on the current model. */
export async function runServerOperation(
  path: "repair" | "decimate",
  label: string,
  params?: Record<string, string | number>,
): Promise<void> {
  const { positions, busy } = useStore.getState();
  if (!positions || busy) return;
  activeAbort = new AbortController();
  useStore.setState({ busy: label, error: null });
  try {
    const stl = await serializeSTLAsync(positions);
    const resultBuffer = await meshOperation(path, stl, activeAbort.signal, params);
    const resultPositions = await parseSTLAsync(resultBuffer);
    commitPositions(resultPositions);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      // user cancelled; not an error
    } else {
      useStore.setState({ error: err instanceof Error ? err.message : String(err) });
    }
  } finally {
    activeAbort = null;
    useStore.setState({ busy: null });
  }
}

export function cancelServerOperation(): void {
  activeAbort?.abort();
}
