import { openDB } from "idb";
import type { AppData } from "../types";

// Local repository is deliberately separate from presentation and future API clients.
// File blobs remain in this browser; nothing is sent to a model or external server.
const database = openDB("offerguard-workspace", 1, {
  upgrade(db) {
    db.createObjectStore("workspace");
    db.createObjectStore("personal-assets");
  },
});
export const emptyData = (): AppData => ({
  annotations: [],
  records: [],
  cases: [],
  materials: [],
  versions: [],
  todos: [],
  communications: [],
  events: [],
  assets: [],
  profile: { name: "", school: "", role: "" },
});
export async function readData(): Promise<AppData> {
  const db = await database;
  const saved = await db.get("workspace", "data");
  const assets = await db.getAll("personal-assets");
  return { ...emptyData(), ...saved, assets };
}
export async function writeData(data: AppData) {
  const db = await database;
  const tx = db.transaction(["workspace", "personal-assets"], "readwrite");
  const { assets, ...workspace } = data;
  await tx.objectStore("workspace").put(workspace, "data");
  await tx.objectStore("personal-assets").clear();
  for (const asset of assets)
    await tx.objectStore("personal-assets").put(asset, asset.id);
  await tx.done;
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
