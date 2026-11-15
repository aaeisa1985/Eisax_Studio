import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryWorkspaceId } from "@/lib/auth/session";
import { getProject } from "@/lib/projects/service";
import { buildPptx } from "@/lib/export/pptx";
import { audit } from "@/lib/security/audit";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const workspaceId = await getPrimaryWorkspaceId(user.id);
  if (!workspaceId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const project = await getProject(user.id, id);
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (project.type !== "presentation") {
    return NextResponse.json({ error: "wrong_type" }, { status: 400 });
  }

  const result = await buildPptx(project.title, project.content);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  await audit(user.id, "export.pptx", { projectId: id });

  return new NextResponse(new Uint8Array(result.data), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
