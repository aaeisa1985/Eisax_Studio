import { getCurrentUser } from "@/lib/auth/session";
import { getProject } from "@/lib/projects/service";
import { readOriginal } from "@/lib/storage/originals";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const { id } = await context.params;
  const project = await getProject(user.id, id);
  if (!project) return new Response(null, { status: 404 });
  const bytes = await readOriginal(id);
  if (!bytes) return new Response(null, { status: 404 });
  const ext = project.type === "document" ? "docx" : "pptx";
  return new Response(new Uint8Array(bytes), { headers: {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="original.${ext}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
