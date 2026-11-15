import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getPrimaryWorkspaceId } from "@/lib/auth/session";
import { getProject } from "@/lib/projects/service";
import { LOCALE_COOKIE, getLocale, t } from "@/lib/i18n";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

/** Print/PDF view: light, high-contrast, paginated by the browser (Save as PDF). */
export default async function ProjectPrintPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const workspaceId = await getPrimaryWorkspaceId(user.id);
  const project = workspaceId ? await getProject(user.id, id) : null;
  if (!project) redirect("/dashboard");

  const jar = await cookies();
  const locale = getLocale(jar.get(LOCALE_COOKIE)?.value, project.language);
  const ar = locale === "ar";

  const content = project.content as {
    slides?: Array<{ id: string; title: string; subtitle: string; dir: string }>;
    blocks?: Array<{ id: string; kind: "heading" | "paragraph"; level?: number; text: string; dir: string }>;
  };

  return (
    <div style={{ background: "#fff", color: "#17222e", minHeight: "100vh" }}>
      <PrintButton projectId={project.id} />
      <main className="mx-auto max-w-3xl px-8 pb-20">
        <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }} dir="auto">
          {project.title}
        </h1>
        <p style={{ fontSize: 12, color: "#5a6a7a" }}>
          EISAX Studio · {new Date().toLocaleDateString(ar ? "ar" : "en-GB", { dateStyle: "long" })}
        </p>
        <hr style={{ margin: "18px 0", borderColor: "#e2e8f0" }} />

        {project.type === "presentation" ? (
          <div className="print-slides">
            {(content.slides ?? []).map((s, i) => (
              <section
                key={s.id}
                className="print-slide"
                style={{ pageBreakInside: "avoid", breakInside: "avoid", marginBottom: 18 }}
                dir="auto"
              >
                <p style={{ fontSize: 10, color: "#8a99a9", marginBottom: 4 }}>
                  {ar ? `شريحة ${i + 1}` : `Slide ${i + 1}`}
                </p>
                <h2 style={{ fontSize: 19, fontWeight: 700 }}>{s.title || "—"}</h2>
                {s.subtitle && <p style={{ fontSize: 13, color: "#44586e", marginTop: 2 }}>{s.subtitle}</p>}
              </section>
            ))}
          </div>
        ) : (
          <article>
            {(content.blocks ?? []).map((b) =>
              b.kind === "heading" ? (
                <h2
                  key={b.id}
                  style={{
                    fontSize: b.level === 1 ? 22 : b.level === 3 ? 16 : 19,
                    fontWeight: 700,
                    margin: "18px 0 6px",
                  }}
                  dir="auto"
                >
                  {b.text}
                </h2>
              ) : (
                <p key={b.id} style={{ fontSize: 13, lineHeight: 1.9, margin: "6px 0" }} dir="auto">
                  {b.text}
                </p>
              ),
            )}
          </article>
        )}
      </main>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .print-slide { page-break-after: always; }
        }
      `}</style>
      <noscript>
        <Link href={`/projects/${project.id}`}>Back</Link>
      </noscript>
    </div>
  );
}
