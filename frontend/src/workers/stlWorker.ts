import { computeStats, parseSTL, serializeSTL } from "../lib/stl";

export type WorkerRequest =
  | { id: number; op: "parse"; buffer: ArrayBuffer }
  | { id: number; op: "serialize"; positions: Float32Array }
  | { id: number; op: "stats"; positions: Float32Array };

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  try {
    switch (msg.op) {
      case "parse": {
        const positions = parseSTL(msg.buffer);
        respond(msg.id, positions, [positions.buffer]);
        break;
      }
      case "serialize": {
        const buffer = serializeSTL(msg.positions);
        respond(msg.id, buffer, [buffer]);
        break;
      }
      case "stats": {
        respond(msg.id, computeStats(msg.positions));
        break;
      }
    }
  } catch (err) {
    const response: WorkerResponse = {
      id: msg.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};

function respond(id: number, result: unknown, transfer: Transferable[] = []): void {
  const response: WorkerResponse = { id, ok: true, result };
  self.postMessage(response, { transfer });
}
