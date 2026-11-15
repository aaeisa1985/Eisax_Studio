import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser, getPrimaryWorkspaceId } from "@/lib/auth/session";
import { getProject, listRevisions } from "@/lib/projects/service";
import { getMonthlyUsage } from "@/lib/billing/usage";
import { LOCALE_COOKIE, getLocale } from "@/lib/i18n";
import { ProjectEditor, type EditorProject } from "@/components/ProjectEditor";

export const dynamic = "force-dynamic";

export default async function ProjectPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const workspaceId = await getPrimaryWorkspaceId(user.id);
  const project = workspaceId ? await getProject(user.id, id) : null;
  if (!project) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 text-center">
        <h1 className="text-xl font-bold">Not found / غير موجود</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-dim)" }}>
          This project does not exist or you do not have access to it.
        </p>
        <Link href="/dashboard" className="btn btn-ghost mt-5 self-center no-underline">
          ← Dashboard
        </Link>
      </main>
    );
  }

  const revisions = await listRevisions(user.id, id);
  const usage = await getMonthlyUsage(user.id, workspaceId);
  const jar = await cookies();
  const locale = getLocale(jar.get(LOCALE_COOKIE)?.value, project.language);

  const content = (project.content ?? {}) as EditorProject["content"];
  return (
    <ProjectEditor
      locale={locale}
      revisions={revisions.map((r) => ({ revisionNo: r.revisionNo, createdAt: r.createdAt.toISOString() }))}
      initialUsage={{ used: usage.used, limit: usage.limit }}
      project={{
        id: project.id,
        type: project.type as "presentation" | "document",
        title: project.title,
        language: project.language,
        content,
      }}
    />
  );
}
