import { openDB, type IDBPDatabase } from "idb";

export interface SavedCamera {
  position: [number, number, number];
  target: [number, number, number];
}

export interface SavedWorkspace {
  name: string;
  stl: Blob;
  savedAt: number;
  camera: SavedCamera | null;
}

const DB_NAME = "stl-studio";
const STORE = "workspace";
const KEY = "current";

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(database) {
        database.createObjectStore(STORE);
      },
    });
    // Ask the browser not to evict our data under storage pressure.
    navigator.storage?.persist?.().catch(() => {});
  }
  return dbPromise;
}

export async function saveWorkspace(workspace: SavedWorkspace): Promise<void> {
  await (await db()).put(STORE, workspace, KEY);
}

export async function loadWorkspace(): Promise<SavedWorkspace | undefined> {
  return (await db()).get(STORE, KEY);
}

export async function clearWorkspace(): Promise<void> {
  await (await db()).delete(STORE, KEY);
}
