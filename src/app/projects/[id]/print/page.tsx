import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getPrimaryWorkspaceId } from "@/lib/auth/session";
import { getProject } from "@/lib/projects/service";
import { resolveSlideTheme } from "@/lib/projects/themes";
import { parseInlineSegments } from "@/lib/utils/inlineFormat";
import { resolveParagraphDir } from "@/lib/utils/bidi";
import { LOCALE_COOKIE, getLocale } from "@/lib/i18n";
import { PrintButton } from "@/components/PrintButton";
import { SlideChart } from "@/components/SlideChart";
import type {
  DocumentBlock,
  InlineRun,
  PageLayout,
  SlideElement,
  SlideItem,
} from "@/lib/validation/projects";

export const dynamic = "force-dynamic";

function InlineRunsText({ text, runs }: { text: string; runs?: InlineRun[] }) {
  if (runs && runs.length > 0) {
    return (
      <>
        {runs.map((r, idx) => {
          const style: React.CSSProperties = {
            fontWeight: r.bold ? 700 : undefined,
            fontStyle: r.italic ? "italic" : undefined,
            textDecoration:
              [r.underline ? "underline" : "", r.strike ? "line-through" : ""]
                .filter(Boolean)
                .join(" ") || undefined,
            color: r.color ? `#${r.color.replace(/^#/, "")}` : undefined,
            fontSize: r.fontSize ? `${r.fontSize}pt` : undefined,
          };
          if (r.href && /^https?:\/\//i.test(r.href)) {
            return (
              <a
                key={idx}
                href={r.href}
                style={{ ...style, color: style.color ?? "#0284c7", textDecoration: "underline" }}
              >
                {r.text}
              </a>
            );
          }
          return (
            <span key={idx} style={style}>
              {r.text}
            </span>
          );
        })}
      </>
    );
  }
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

function PrintSlideElement({
  el,
  themeHexes,
}: {
  el: SlideElement;
  themeHexes: { titleHex: string; accentHex: string; cardBgHex: string; borderHex: string; bodyHex: string; subtitleHex: string };
}) {
  const boxStyle: React.CSSProperties = {
    position: "absolute",
    left: `${el.x}%`,
    top: `${el.y}%`,
    width: `${el.w}%`,
    height: `${el.h}%`,
    zIndex: el.zIndex ?? 1,
  };

  if (el.kind === "image" && el.assetId) {
    return (
      <div style={boxStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/assets/${el.assetId}`}
          alt={el.text || "Slide image"}
          style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 4 }}
        />
      </div>
    );
  }

  if (el.kind === "chart" && el.chart) {
    return (
      <div style={{ ...boxStyle, overflow: "hidden" }}>
        <SlideChart
          chart={el.chart}
          accentHex={`#${themeHexes.accentHex}`}
          goldHex="#D9A441"
          titleColor={`#${themeHexes.titleHex}`}
          textColor={`#${themeHexes.bodyHex}`}
          mutedColor={`#${themeHexes.subtitleHex}`}
          surfaceBg={`#${themeHexes.cardBgHex}`}
          borderColor={`#${themeHexes.borderHex}`}
          rtl={el.dir === "rtl"}
        />
      </div>
    );
  }

  const fill = el.fillColor ? `#${el.fillColor.replace(/^#/, "")}` : undefined;
  const border = el.borderColor ? `#${el.borderColor.replace(/^#/, "")}` : undefined;
  const textColor = el.color ? `#${el.color.replace(/^#/, "")}` : `#${themeHexes.bodyHex}`;
  const rawElText = el.text || (el.runs ?? []).map((r) => r.text).join("");
  const elDir = resolveParagraphDir(rawElText, el.dir, "ltr");
  const textAlign = el.align ?? (elDir === "rtl" ? "right" : "left");

  if (el.kind === "shape") {
    const shape = el.shape ?? "rect";
    const stroke = border ?? (fill ? "transparent" : `#${themeHexes.accentHex}`);
    const sw = el.borderWidth ?? 2;
    return (
      <div style={boxStyle}>
        {shape === "triangle" ? (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
            <polygon
              points="50,2 98,98 2,98"
              fill={fill ?? "transparent"}
              stroke={stroke}
              strokeWidth={sw * 2}
            />
          </svg>
        ) : shape === "line" ? (
          <svg viewBox="0 0 100 20" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
            <line x1="0" y1="10" x2="100" y2="10" stroke={stroke === "transparent" ? `#${themeHexes.accentHex}` : stroke} strokeWidth={Math.max(2, sw * 2)} />
          </svg>
        ) : shape === "arrow" ? (
          <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
            <polygon
              points="0,9 75,9 75,2 100,15 75,28 75,21 0,21"
              fill={fill ?? `#${themeHexes.accentHex}`}
              stroke={border ?? "none"}
              strokeWidth={sw}
            />
          </svg>
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              backgroundColor: fill ?? "transparent",
              border: stroke !== "transparent" ? `${sw}px solid ${stroke}` : undefined,
              borderRadius: shape === "ellipse" ? "9999px" : shape === "roundRect" ? 10 : 0,
            }}
          />
        )}
        {(el.text || (el.runs && el.runs.length > 0)) && (
          <div
            dir={elDir}
            style={{
              position: "absolute",
              inset: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: el.align ?? "center",
              unicodeBidi: el.dir ? "isolate" : "plaintext",
              color: textColor,
              fontSize: `${Math.max(9, (el.fontSize ?? 14) * 0.65)}px`,
              fontWeight: el.bold ? 700 : 400,
              fontStyle: el.italic ? "italic" : "normal",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            <InlineRunsText text={el.text ?? ""} runs={el.runs} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      dir={elDir}
      style={{
        ...boxStyle,
        backgroundColor: fill,
        border: border ? `${el.borderWidth ?? 1}px solid ${border}` : undefined,
        color: textColor,
        fontSize: `${Math.max(9, (el.fontSize ?? 16) * 0.65)}px`,
        fontWeight: el.bold ? 700 : 400,
        fontStyle: el.italic ? "italic" : "normal",
        textAlign,
        unicodeBidi: el.dir ? "isolate" : "plaintext",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        padding: 4,
      }}
    >
      <InlineRunsText text={el.text ?? ""} runs={el.runs} />
    </div>
  );
}

/** Print/PDF view: themed 16:9 slides and rich document blocks for browser Save as PDF. */
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
    slides?: SlideItem[];
    blocks?: DocumentBlock[];
    pageLayout?: PageLayout;
  };
  const theme = resolveSlideTheme(content.theme);
  const layout = content.pageLayout ?? { size: "a4", orientation: "portrait", margins: "normal" };
  const docMaxWidth =
    layout.orientation === "landscape"
      ? 1060
      : layout.size === "letter"
        ? 816
        : 794;
  const docPaddingX = layout.margins === "narrow" ? 28 : layout.margins === "wide" ? 72 : 48;

  return (
    <div style={{ background: "#fff", color: "#17222e", minHeight: "100vh" }}>
      <PrintButton projectId={project.id} />
      <main
        className="mx-auto pb-20"
        style={{
          maxWidth: project.type === "document" ? docMaxWidth : 960,
          paddingInline: project.type === "document" ? docPaddingX : 32,
        }}
      >
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
              const hasFreeform = Array.isArray(s.elements);
              const slideBg = s.bgColor ? `#${s.bgColor.replace(/^#/, "")}` : `#${theme.bgHex}`;
              if (hasFreeform) {
                const sorted = [...(s.elements ?? [])].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
                return (
                  <section
                    key={s.id}
                    className="print-slide relative overflow-hidden rounded-xl border"
                    style={{
                      aspectRatio: "16 / 9",
                      width: "100%",
                      pageBreakInside: "avoid",
                      breakInside: "avoid",
                      background: slideBg,
                      borderColor: `#${theme.borderHex}`,
                    }}
                  >
                    {sorted.map((el) => (
                      <PrintSlideElement key={el.id} el={el} themeHexes={theme} />
                    ))}
                  </section>
                );
              }

              const bullets = (s.bullets ?? []).filter((b) => b.trim().length > 0);
              const accent = s.accentShape ?? "bar";
              return (
                <section
                  key={s.id}
                  className="print-slide relative rounded-xl border p-8"
                  style={{
                    pageBreakInside: "avoid",
                    breakInside: "avoid",
                    background: accent === "card" ? `#${theme.cardBgHex}` : slideBg,
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
              const alignStyle: React.CSSProperties = {
                textAlign: b.align ?? (b.dir === "rtl" ? "right" : "left"),
              };
              const blockDir = b.dir === "rtl" ? "rtl" : "ltr";

              if (b.kind === "heading") {
                return (
                  <h2
                    key={b.id}
                    style={{
                      ...alignStyle,
                      fontSize: b.level === 1 ? 22 : b.level === 3 ? 16 : b.level === 4 ? 14 : 19,
                      fontWeight: 700,
                      margin: "18px 0 6px",
                    }}
                    dir={blockDir}
                  >
                    <InlineRunsText text={b.text} runs={b.runs} />
                  </h2>
                );
              }
              if (b.kind === "list") {
                const Tag = b.ordered ? "ol" : "ul";
                return (
                  <Tag
                    key={b.id}
                    style={{
                      ...alignStyle,
                      margin: "8px 0",
                      paddingInlineStart: 22,
                      fontSize: 13,
                      lineHeight: 1.8,
                      listStyleType: b.ordered ? "decimal" : "disc",
                    }}
                    dir={blockDir}
                  >
                    {(b.items ?? []).map((item, idx) => (
                      <li key={idx} dir={blockDir}>
                        <InlineRunsText text={item} runs={b.listRuns?.[idx]} />
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
                    dir={blockDir}
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
                      ...alignStyle,
                      borderInlineStart: "4px solid #00a89e",
                      background: "#f8fafc",
                      padding: "8px 14px",
                      margin: "10px 0",
                      fontStyle: "italic",
                      color: "#334155",
                      fontSize: 13,
                    }}
                    dir={blockDir}
                  >
                    <InlineRunsText text={b.text} runs={b.runs} />
                  </blockquote>
                );
              }
              if (b.kind === "link") {
                return (
                  <p key={b.id} style={{ ...alignStyle, fontSize: 13, margin: "6px 0" }} dir={blockDir}>
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
                <p key={b.id} style={{ ...alignStyle, fontSize: 13, lineHeight: 1.9, margin: "6px 0" }} dir={blockDir}>
                  <InlineRunsText text={b.text} runs={b.runs} />
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
