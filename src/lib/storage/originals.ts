import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";

function originalPath(projectId: string) {
  if (!/^[a-f0-9-]{36}$/i.test(projectId)) throw new Error("invalid_project_id");
  return path.resolve(process.env.EISAX_DATA_DIR || path.resolve(process.cwd(), ".data"), "originals", projectId);
}

export async function saveOriginal(projectId: string, bytes: Buffer) {
  const target = originalPath(projectId);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: "wx" });
}

export async function hasOriginal(projectId: string) {
  try { await access(originalPath(projectId)); return true; } catch { return false; }
}

export async function readOriginal(projectId: string) {
  try { return await readFile(originalPath(projectId)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
