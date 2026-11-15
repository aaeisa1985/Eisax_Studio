import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { assets, workspaceMembers } from "@/lib/db/schema";
import { MAX_UPLOAD_BYTES, storage } from "@/lib/storage";

export type SafeImageMime = "image/png" | "image/jpeg" | "image/webp";

/** Sniff actual magic bytes rather than trusting client-supplied Content-Type. */
export function sniffRasterImageMime(bytes: Buffer): SafeImageMime | null {
  if (bytes.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // WebP: RIFF .... WEBP
  if (
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export async function saveWorkspaceAsset(args: {
  userId: string;
  workspaceId: string;
  bytes: Buffer;
  originalName?: string;
}): Promise<{ ok: true; id: string; mimeType: SafeImageMime; sizeBytes: number } | { ok: false; error: string }> {
  if (args.bytes.length === 0 || args.bytes.length > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "invalid_file_size" };
  }
  const mimeType = sniffRasterImageMime(args.bytes);
  if (!mimeType) {
    return { ok: false, error: "unsupported_file_type" };
  }

  const { key } = await storage.put({
    workspaceId: args.workspaceId,
    mimeType,
    bytes: args.bytes,
  });

  const db = await getDb();
  const inserted = await db
    .insert(assets)
    .values({
      workspaceId: args.workspaceId,
      ownerId: args.userId,
      storageKey: key,
      mimeType,
      sizeBytes: args.bytes.length,
      meta: args.originalName ? { name: args.originalName.slice(0, 120) } : {},
    })
    .returning({ id: assets.id });

  const id = inserted[0]?.id;
  if (!id) return { ok: false, error: "insert_failed" };
  return { ok: true, id, mimeType, sizeBytes: args.bytes.length };
}

export async function getWorkspaceAsset(args: {
  userId: string;
  assetId: string;
}): Promise<{ id: string; mimeType: string; data: Buffer } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(args.assetId)) return null;
  const db = await getDb();
  const rows = await db
    .select({
      id: assets.id,
      workspaceId: assets.workspaceId,
      storageKey: assets.storageKey,
      mimeType: assets.mimeType,
    })
    .from(assets)
    .where(eq(assets.id, args.assetId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const membership = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, row.workspaceId),
        eq(workspaceMembers.userId, args.userId),
      ),
    )
    .limit(1);
  if (membership.length === 0) return null;

  const data = await storage.get(row.storageKey);
  if (!data) return null;
  return { id: row.id, mimeType: row.mimeType, data };
}

export type AssetResolver = (assetId: string) => Promise<{ mimeType: string; data: Buffer } | null>;

export function createAssetResolver(userId: string): AssetResolver {
  return async (assetId: string) => {
    const found = await getWorkspaceAsset({ userId, assetId });
    if (!found) return null;
    return { mimeType: found.mimeType, data: found.data };
  };
}
