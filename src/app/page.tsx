import Link from "next/link";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/session";
import { LOCALE_COOKIE, dirFor, getLocale, t, type DictKey } from "@/lib/i18n";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";

export default async function LandingPage() {
  const jar = await cookies();
  const user = await getCurrentUser();
  const locale = getLocale(jar.get(LOCALE_COOKIE)?.value, user?.locale);
  const tr = (k: DictKey) => t(locale, k);

  const plans: Array<{ name: DictKey; price: DictKey; desc: DictKey; highlight?: boolean }> = [
    { name: "planFreeName", price: "planFreePrice", desc: "planFreeDesc" },
    { name: "planPersonalName", price: "planPersonalPrice", desc: "planPersonalDesc", highlight: true },
    { name: "planProName", price: "planProPrice", desc: "planProDesc" },
    { name: "planTeamsName", price: "planTeamsPrice", desc: "planTeamsDesc" },
  ];

  const faqs: Array<{ q: DictKey; a: DictKey }> = [
    { q: "faq1Q", a: "faq1A" },
    { q: "faq2Q", a: "faq2A" },
    { q: "faq3Q", a: "faq3A" },
    { q: "faq4Q", a: "faq4A" },
  ];

  return (
    <div>
      <header className="sticky top-0 z-10 backdrop-blur-sm" style={{ background: "rgba(6,11,20,0.85)", borderBottom: "1px solid var(--border)" }}>
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <Link href="/" className="flex items-center gap-2 no-underline">
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg font-black"
              style={{ background: "linear-gradient(135deg, var(--turquoise), var(--sky))", color: "#04222b" }}
              aria-hidden
            >
              E
            </span>
            <span className="text-lg font-bold tracking-tight">EISAX&nbsp;Studio</span>
          </Link>
          <div className="flex items-center gap-3">
            <LocaleSwitcher current={locale} />
            {user ? (
              <Link href="/dashboard" className="btn btn-primary text-sm no-underline">
                {tr("dashboardTitle")}
              </Link>
            ) : (
              <>
                <Link href="/sign-in" className="text-sm no-underline" style={{ color: "var(--text-dim)" }}>
                  {tr("signIn")}
                </Link>
                <Link href="/sign-up" className="btn btn-primary text-sm no-underline">
                  {tr("signUp")}
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-5 pb-16 pt-20 text-center">
          <p className="mb-3 text-sm font-semibold tracking-wide" style={{ color: "var(--turquoise)" }}>
            {tr("brandTagline")}
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight md:text-5xl">
            {tr("heroTitle")}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed md:text-lg" style={{ color: "var(--text-dim)" }}>
            {tr("heroBody")}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href={user ? "/dashboard" : "/sign-up"} className="btn btn-primary text-base no-underline">
              {user ? tr("heroCta") : tr("getStarted")}
            </Link>
          </div>
          <div
            className="mx-auto mt-14 max-w-4xl rounded-2xl border p-6 text-start"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div className="editor-surface rounded-xl p-5 text-sm leading-7 shadow-lg" dir="auto">
              <strong>Prompt:</strong>{" "}
              {locale === "ar"
                ? "أنشئ عرضًا من 5 شرائح لطلاب السنة الأولى عن فوائد الطاقة الشمسية، بنبرة ودّية، باللغة العربية."
                : "Create a 5-slide presentation for first-year students about the benefits of solar energy, friendly tone, in English."}
              <div className="mt-3 rounded-lg border p-3" style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}>
                <em>Outline preview (demo) — Phase 3 delivers the full AI pipeline.</em>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-center text-3xl font-bold">{tr("pricingTitle")}</h2>
          <p className="mt-2 text-center text-sm" style={{ color: "var(--text-dim)" }}>
            {tr("pricingNote")}
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((p) => (
              <div
                key={p.name}
                className="card p-6"
                style={p.highlight ? { borderColor: "var(--turquoise)", borderWidth: 1.5 } : undefined}
              >
                <h3 className="text-lg font-bold">{tr(p.name)}</h3>
                <p className="mt-1 text-2xl font-extrabold" style={{ color: "var(--turquoise)" }}>
                  {tr(p.price)}
                </p>
                <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--text-dim)" }}>
                  {tr(p.desc)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-3xl px-5 py-16">
          <h2 className="text-center text-3xl font-bold">{tr("faqTitle")}</h2>
          <div className="mt-10 space-y-4">
            {faqs.map((f) => (
              <details key={f.q} className="card p-5">
                <summary className="cursor-pointer font-semibold">{tr(f.q)}</summary>
                <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--text-dim)" }} dir="auto">
                  {tr(f.a)}
                </p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t py-8 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}>
        © {new Date().getFullYear()} EISAX Studio · {dirFor(locale) === "rtl" ? "جميع الحقوق محفوظة" : "All rights reserved"}
      </footer>
    </div>
  );
}
