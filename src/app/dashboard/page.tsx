import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction } from "@/lib/auth/actions";
import { getCurrentUser, getPrimaryWorkspaceId } from "@/lib/auth/session";
import { listProjects } from "@/lib/projects/service";
import { getMonthlyUsage } from "@/lib/billing/usage";
import { BILLING_ENABLED } from "@/lib/billing/plans";
import { LOCALE_COOKIE, getLocale, t } from "@/lib/i18n";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { CreateProjectDialog } from "@/components/CreateProjectDialog";
import { ProjectCard } from "@/components/ProjectCard";
import { ThemeSwitcher, UI_THEME_COOKIE, type UiTheme } from "@/components/ThemeSwitcher";
import { FullscreenButton, PwaInstallButton } from "@/components/PwaManager";

export const dynamic = "force-dynamic";

export default async function DashboardPage(props: {
  searchParams: Promise<{ q?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const workspaceId = await getPrimaryWorkspaceId(user.id);
  const jar = await cookies();
  const locale = getLocale(jar.get(LOCALE_COOKIE)?.value, user.locale);
  const uiTheme: UiTheme = jar.get(UI_THEME_COOKIE)?.value === "light" ? "light" : "dark";
  const ar = locale === "ar";
  const tr = (k: Parameters<typeof t>[1]) => t(locale, k);

  const sp = await props.searchParams;
  const q = sp.q?.trim() || undefined;
  const projects = workspaceId ? await listProjects(user.id, workspaceId, { q }) : [];
  const usage = await getMonthlyUsage(user.id, workspaceId);

  return (
    <div className="min-h-dvh">
      <header className="border-b" style={{ background: "var(--obsidian-2)", borderColor: "var(--border)" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <Link href="/" className="font-bold no-underline">
            EISAX&nbsp;Studio
          </Link>
          <div className="flex items-center gap-3">
            <span
              className="hidden rounded-full border px-3 py-1 text-xs sm:inline-flex"
              style={{ borderColor: "var(--border-strong)", color: "var(--text-dim)" }}
              title={
                BILLING_ENABLED
                  ? undefined
                  : ar
                    ? "الفوترة معطّلة (خطة مجانية)"
                    : "Billing disabled (Free plan active)"
              }
            >
              {ar ? "الخطة:" : "Plan:"}&nbsp;
              <strong style={{ color: "var(--turquoise)" }}>{usage.planId.toUpperCase()}</strong>
              &nbsp;·&nbsp;
              {ar ? "AI:" : "AI:"} {usage.used}/{usage.limit}
            </span>
            <PwaInstallButton locale={locale} />
            <ThemeSwitcher initialTheme={uiTheme} locale={locale} />
            <FullscreenButton locale={locale} />
            <LocaleSwitcher current={locale} />
            <span className="hidden text-sm sm:inline" style={{ color: "var(--text-dim)" }} dir="auto">
              {user.displayName}
            </span>
            <form action={signOutAction}>
              <button type="submit" className="btn btn-ghost text-sm">
                {tr("signOut")}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-bold">{tr("dashboardTitle")}</h1>
          <CreateProjectDialog locale={locale} initialUsage={{ used: usage.used, limit: usage.limit }} />
        </div>

        <form className="mt-6" role="search">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder={tr("search")}
            aria-label={tr("search")}
            className="input max-w-md"
          />
        </form>

        {sp.error === "create" && (
          <p role="alert" className="mt-4 rounded-lg border p-3 text-sm" style={{ borderColor: "var(--danger-border)", color: "var(--danger)" }}>
            {tr("errorGeneric")}
          </p>
        )}

        {projects.length === 0 ? (
          <div className="card mt-10 p-12 text-center" style={{ color: "var(--text-dim)" }}>
            <p className="text-lg">{tr("emptyProjects")}</p>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                locale={locale}
                project={{
                  id: p.id,
                  type: p.type as "presentation" | "document",
                  title: p.title,
                  language: p.language,
                  updatedAt: p.updatedAt.toISOString(),
                }}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
