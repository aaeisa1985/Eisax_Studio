import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser, getPrimaryWorkspaceId } from "@/lib/auth/session";
import { importDocx } from "@/lib/import/docx";
import { importPptx } from "@/lib/import/pptx";
import { createProject, updateProject } from "@/lib/projects/service";
import { saveOriginal } from "@/lib/storage/originals";
import { audit } from "@/lib/security/audit";
import { rateLimit } from "@/lib/security/rateLimit";
import { saveWorkspaceAsset } from "@/lib/storage/assets";

export const dynamic = "force-dynamic";

const MAX_OFFICE_IMPORT_BYTES = 20 * 1024 * 1024;

function isZipHeader(bytes: Buffer): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

/**
 * Import an existing .docx or .pptx file into an editable EISAX Studio project.
 * Extracts supported content, formatting, tables, shapes, and raster media assets,
 * and records any fidelity warnings on the imported project without silently dropping info.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rl = rateLimit(`import:${user.id}`, 15, 60_000);
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

  const lower = file.name.toLowerCase();
  const kind = lower.endsWith(".docx")
    ? "document"
    : lower.endsWith(".pptx")
      ? "presentation"
      : null;
  if (!kind) {
    return NextResponse.json({ error: "unsupported_extension" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_OFFICE_IMPORT_BYTES) {
    return NextResponse.json({ error: "invalid_file_size" }, { status: 400 });
  }
  if (!isZipHeader(bytes)) {
    return NextResponse.json({ error: "invalid_office_archive" }, { status: 400 });
  }

  const saveAsset = async (args: { bytes: Buffer; originalName?: string }) => {
    const saved = await saveWorkspaceAsset({
      userId: user.id,
      workspaceId,
      bytes: args.bytes,
      originalName: args.originalName,
    });
    return saved.ok ? saved.id : null;
  };

  try {
    const fileStem = file.name.replace(/\.(docx|pptx)$/i, "").trim().slice(0, 140);
    if (kind === "document") {
      const imported = await importDocx(bytes, saveAsset);
      const title = fileStem || imported.title || "Imported Document";
      const created = await createProject(user.id, workspaceId, {
        title,
        type: "document",
        language: imported.language,
      });
      if (!created.ok) {
        return NextResponse.json({ error: created.error }, { status: 400 });
      }
      const saved = await updateProject(user.id, created.id, { content: imported.content });
      if (!saved.ok) return NextResponse.json({ error: saved.error ?? "import_save_failed" }, { status: 500 });
      await saveOriginal(created.id, bytes);
      await audit(user.id, "project.imported_docx", {
        projectId: created.id,
        blocks: imported.content.blocks.length,
        warnings: imported.warnings.length,
      });
      revalidatePath("/dashboard");
      return NextResponse.json({
        ok: true,
        projectId: created.id,
        type: "document",
        title,
        warnings: imported.warnings,
      });
    }

    const imported = await importPptx(bytes, saveAsset);
    const title = fileStem || imported.title || "Imported Presentation";
    const created = await createProject(user.id, workspaceId, {
      title,
      type: "presentation",
      language: imported.language,
    });
    if (!created.ok) {
      return NextResponse.json({ error: created.error }, { status: 400 });
    }
    const saved = await updateProject(user.id, created.id, { content: imported.content });
    if (!saved.ok) return NextResponse.json({ error: saved.error ?? "import_save_failed" }, { status: 500 });
    await saveOriginal(created.id, bytes);
    await audit(user.id, "project.imported_pptx", {
      projectId: created.id,
      slides: imported.content.slides.length,
      warnings: imported.warnings.length,
    });
    revalidatePath("/dashboard");
    return NextResponse.json({
      ok: true,
      projectId: created.id,
      type: "presentation",
      title,
      warnings: imported.warnings,
    });
  } catch (e) {
    console.error("[office import failed]", e);
    return NextResponse.json({ error: "import_parse_failed" }, { status: 422 });
  }
}
