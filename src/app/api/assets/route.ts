import { NextResponse } from "next/server";
import { getCurrentUser, getPrimaryWorkspaceId } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rateLimit";
import { saveWorkspaceAsset } from "@/lib/storage/assets";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rl = rateLimit(`upload:${user.id}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const workspaceId = await getPrimaryWorkspaceId(user.id);
  if (!workspaceId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_multipart" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const saved = await saveWorkspaceAsset({
    userId: user.id,
    workspaceId,
    bytes,
    originalName: file.name,
  });

  if (!saved.ok) {
    return NextResponse.json({ error: saved.error }, { status: 400 });
  }

  return NextResponse.json({
    id: saved.id,
    url: `/api/assets/${saved.id}`,
    mimeType: saved.mimeType,
    sizeBytes: saved.sizeBytes,
  });
}
