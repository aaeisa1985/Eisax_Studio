import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

export const ALLOWED_UPLOAD_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MiB

export interface StorageAdapter {
  put(args: { workspaceId: string; mimeType: string; bytes: Buffer }): Promise<{ key: string }>;
  get(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
}

/**
 * Local filesystem adapter behind an S3-shaped interface.
 * Random UUID keys prevent path traversal and enumerable filenames.
 */
export class LocalStorageAdapter implements StorageAdapter {
  private readonly root: string;

  constructor(rootDir = path.resolve(process.env.EISAX_DATA_DIR || path.resolve(process.cwd(), ".data"), "storage")) {
    this.root = rootDir;
  }

  private resolveSafe(key: string): string {
    const normalized = key.replace(/[^a-zA-Z0-9/_-]/g, "");
    const target = path.resolve(this.root, normalized);
    if (!target.startsWith(this.root + path.sep)) {
      throw new Error("invalid_storage_key");
    }
    return target;
  }

  async put(args: { workspaceId: string; mimeType: string; bytes: Buffer }): Promise<{ key: string }> {
    if (!ALLOWED_UPLOAD_MIMES.has(args.mimeType)) {
      throw new Error("unsupported_mime_type");
    }
    if (args.bytes.length === 0 || args.bytes.length > MAX_UPLOAD_BYTES) {
      throw new Error("invalid_file_size");
    }
    const ext = args.mimeType.split("/")[1]?.replace("+xml", "") ?? "bin";
    const key = `${args.workspaceId}/${randomUUID()}.${ext}`;
    const dest = this.resolveSafe(key);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, args.bytes);
    return { key };
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolveSafe(key));
    } catch {
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolveSafe(key), { force: true });
  }
}

export const storage: StorageAdapter = new LocalStorageAdapter();
