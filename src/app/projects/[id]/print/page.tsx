import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getPrimaryWorkspaceId } from "@/lib/auth/session";
import { getProject } from "@/lib/projects/service";
import { resolveSlideTheme } from "@/lib/projects/themes";
import { parseInlineSegments } from "@/lib/utils/inlineFormat";
import { LOCALE_COOKIE, getLocale } from "@/lib/i18n";
import { PrintButton } from "@/components/PrintButton";
import { SlideChart } from "@/components/SlideChart";
import type { EditorBlock, EditorSlide } from "@/components/ProjectEditor";

export const dynamic = "force-dynamic";

function InlineText({ text }: { text: string }) {
  const segments = parseInlineSegments(text);
  return (
    <>
      {segments.map((seg, idx) => {
        if (seg.bold) return <strong key={idx}>{seg.text}</strong>;
        if (seg.italic) return <em key={idx}>{seg.text}</em>;
        return <span key={idx}>{seg.text}</span>;
      })}
    </>
  );
}

/** Print/PDF view: themed 16:9 slides and clean semantic document blocks for browser Save as PDF. */
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
    theme?: string;
    slides?: EditorSlide[];
    blocks?: EditorBlock[];
  };
  const theme = resolveSlideTheme(content.theme);

  return (
    <div style={{ background: "#fff", color: "#17222e", minHeight: "100vh" }}>
      <PrintButton projectId={project.id} />
      <main className="mx-auto max-w-4xl px-8 pb-20">
        <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }} dir="auto">
          {project.title}
        </h1>
        <p style={{ fontSize: 12, color: "#5a6a7a" }}>
          EISAX Studio · {new Date().toLocaleDateString(ar ? "ar" : "en-GB", { dateStyle: "long" })}
        </p>
        <hr style={{ margin: "18px 0", borderColor: "#e2e8f0" }} />

        {project.type === "presentation" ? (
          <div className="print-slides space-y-6">
            {(content.slides ?? []).map((s, i) => {
              const bullets = (s.bullets ?? []).filter((b) => b.trim().length > 0);
              const accent = s.accentShape ?? "bar";
              return (
                <section
                  key={s.id}
                  className="print-slide relative rounded-xl border p-8"
                  style={{
                    pageBreakInside: "avoid",
                    breakInside: "avoid",
                    background: accent === "card" ? `#${theme.cardBgHex}` : `#${theme.bgHex}`,
                    color: `#${theme.titleHex}`,
                    borderColor: `#${theme.borderHex}`,
                    minHeight: 260,
                  }}
                  dir={s.dir === "rtl" ? "rtl" : "ltr"}
                >
                  {accent === "bar" && (
                    <span
                      aria-hidden
                      style={{
                        position: "absolute",
                        top: 24,
                        bottom: 24,
                        insetInlineStart: 14,
                        width: 5,
                        borderRadius: 999,
                        background: `#${theme.accentHex}`,
                      }}
                    />
                  )}
                  {accent === "badge" && (
                    <span
                      aria-hidden
                      style={{
                        display: "block",
                        width: 64,
                        height: 6,
                        borderRadius: 999,
                        marginBottom: 12,
                        background: `#${theme.accentHex}`,
                      }}
                    />
                  )}
                  <p style={{ fontSize: 10, color: `#${theme.subtitleHex}`, marginBottom: 6 }}>
                    {ar ? `شريحة ${i + 1}` : `Slide ${i + 1}`}
                  </p>
                  <div
                    style={{
                      display: s.chart || s.imageAssetId ? "grid" : "block",
                      gridTemplateColumns: s.chart || s.imageAssetId ? "1.15fr 0.85fr" : undefined,
                      gap: 20,
                      alignItems: "start",
                    }}
                  >
                    <div>
                      <h2 style={{ fontSize: 22, fontWeight: 800 }} dir="auto">
                        {s.title || "—"}
                      </h2>
                      {s.subtitle && (
                        <p style={{ fontSize: 14, color: `#${theme.subtitleHex}`, marginTop: 4 }} dir="auto">
                          {s.subtitle}
                        </p>
                      )}
                      {bullets.length > 0 && (
                        <ul
                          style={{
                            marginTop: 14,
                            paddingInlineStart: 20,
                            display: s.layout === "two-col" && !s.chart ? "grid" : "block",
                            gridTemplateColumns: s.layout === "two-col" && !s.chart ? "1fr 1fr" : undefined,
                            gap: 8,
                            color: `#${theme.bodyHex}`,
                            fontSize: 13,
                          }}
                        >
                          {bullets.map((b, bIdx) => (
                            <li key={bIdx} style={{ marginBottom: 4 }} dir="auto">
                              {b}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {(s.chart || s.imageAssetId) && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {s.chart && (
                          <SlideChart
                            chart={s.chart}
                            accentHex={`#${theme.accentHex}`}
                            goldHex="#D9A441"
                            titleColor={`#${theme.titleHex}`}
                            textColor={`#${theme.bodyHex}`}
                            mutedColor={`#${theme.subtitleHex}`}
                            surfaceBg={`#${theme.cardBgHex}`}
                            borderColor={`#${theme.borderHex}`}
                            rtl={s.dir === "rtl"}
                          />
                        )}
                        {s.imageAssetId && (
                          <div>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/assets/${s.imageAssetId}`}
                              alt={s.imageCaption || s.title || "Slide visual"}
                              style={{ maxHeight: 160, borderRadius: 8, objectFit: "contain" }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <article>
            {(content.blocks ?? []).map((b) => {
              if (b.kind === "heading") {
                return (
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
                );
              }
              if (b.kind === "list") {
                const Tag = b.ordered ? "ol" : "ul";
                return (
                  <Tag
                    key={b.id}
                    style={{
                      margin: "8px 0",
                      paddingInlineStart: 22,
                      fontSize: 13,
                      lineHeight: 1.8,
                      listStyleType: b.ordered ? "decimal" : "disc",
                    }}
                    dir={b.dir === "rtl" ? "rtl" : "ltr"}
                  >
                    {(b.items ?? []).map((item, idx) => (
                      <li key={idx} dir="auto">
                        <InlineText text={item} />
                      </li>
                    ))}
                  </Tag>
                );
              }
              if (b.kind === "table") {
                return (
                  <table
                    key={b.id}
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      margin: "12px 0",
                      fontSize: 12,
                    }}
                    dir={b.dir === "rtl" ? "rtl" : "ltr"}
                  >
                    <tbody>
                      {(b.rows ?? []).map((row, rIdx) => (
                        <tr key={rIdx} style={{ background: rIdx === 0 ? "#f1f5f9" : undefined }}>
                          {row.map((cell, cIdx) => (
                            <td
                              key={cIdx}
                              style={{
                                border: "1px solid #cbd5e1",
                                padding: "6px 8px",
                                fontWeight: rIdx === 0 ? 700 : 400,
                              }}
                              dir="auto"
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              }
              if (b.kind === "quote") {
                return (
                  <blockquote
                    key={b.id}
                    style={{
                      borderInlineStart: "4px solid #00a89e",
                      background: "#f8fafc",
                      padding: "8px 14px",
                      margin: "10px 0",
                      fontStyle: "italic",
                      color: "#334155",
                      fontSize: 13,
                    }}
                    dir="auto"
                  >
                    <InlineText text={b.text} />
                  </blockquote>
                );
              }
              if (b.kind === "link") {
                return (
                  <p key={b.id} style={{ fontSize: 13, margin: "6px 0" }} dir="auto">
                    <a
                      href={b.url && /^https?:\/\//i.test(b.url) ? b.url : "#"}
                      style={{ color: "#0284c7", textDecoration: "underline" }}
                    >
                      {b.text || b.url}
                    </a>
                  </p>
                );
              }
              if (b.kind === "image" && b.assetId) {
                return (
                  <figure key={b.id} style={{ margin: "12px 0", textAlign: "center" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/assets/${b.assetId}`}
                      alt={b.text || "Document visual"}
                      style={{ maxHeight: 280, margin: "0 auto", borderRadius: 8, objectFit: "contain" }}
                    />
                    {b.text && (
                      <figcaption style={{ fontSize: 11, color: "#5a6a7a", marginTop: 4 }} dir="auto">
                        {b.text}
                      </figcaption>
                    )}
                  </figure>
                );
              }
              if (b.kind === "chart" && b.chart) {
                return (
                  <div key={b.id} style={{ margin: "14px 0", maxWidth: 480 }}>
                    <SlideChart chart={b.chart} rtl={b.dir === "rtl"} />
                  </div>
                );
              }
              return (
                <p key={b.id} style={{ fontSize: 13, lineHeight: 1.9, margin: "6px 0" }} dir="auto">
                  <InlineText text={b.text} />
                </p>
              );
            })}
          </article>
        )}
      </main>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .print-slide { page-break-after: always; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <noscript>
        <Link href={`/projects/${project.id}`}>Back</Link>
      </noscript>
    </div>
  );
}
