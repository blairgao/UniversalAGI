import type { MeshStats } from "./stl";
import type { WorkerRequest, WorkerResponse } from "../workers/stlWorker";

const worker = new Worker(new URL("../workers/stlWorker.ts", import.meta.url), {
  type: "module",
});

let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
  const msg = event.data;
  const entry = pending.get(msg.id);
  if (!entry) return;
  pending.delete(msg.id);
  if (msg.ok) entry.resolve(msg.result);
  else entry.reject(new Error(msg.error));
};

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

function call(
  req: DistributiveOmit<WorkerRequest, "id">,
  transfer: Transferable[] = [],
): Promise<unknown> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ ...req, id }, transfer);
  });
}

/** Parse an STL file off the main thread. Takes ownership of the buffer. */
export function parseSTLAsync(buffer: ArrayBuffer): Promise<Float32Array> {
  return call({ op: "parse", buffer }, [buffer]) as Promise<Float32Array>;
}

/** Serialize to binary STL off the main thread. Positions are copied, not transferred. */
export function serializeSTLAsync(positions: Float32Array): Promise<ArrayBuffer> {
  return call({ op: "serialize", positions }) as Promise<ArrayBuffer>;
}

/** Compute full mesh stats off the main thread. Positions are copied, not transferred. */
export function computeStatsAsync(positions: Float32Array): Promise<MeshStats> {
  return call({ op: "stats", positions }) as Promise<MeshStats>;
}
