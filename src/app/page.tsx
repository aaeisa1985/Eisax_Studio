import Link from "next/link";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/session";
import { LOCALE_COOKIE, dirFor, getLocale, t, type DictKey } from "@/lib/i18n";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { Icon } from "@/components/Icon";
import { ThemeSwitcher, UI_THEME_COOKIE, type UiTheme } from "@/components/ThemeSwitcher";
import { PwaInstallButton } from "@/components/PwaManager";

export default async function LandingPage() {
  const jar = await cookies();
  const user = await getCurrentUser();
  const locale = getLocale(jar.get(LOCALE_COOKIE)?.value, user?.locale);
  const uiTheme: UiTheme = jar.get(UI_THEME_COOKIE)?.value === "light" ? "light" : "dark";
  const ar = locale === "ar";
  const tr = (k: DictKey) => t(locale, k);
  const rtl = dirFor(locale) === "rtl";

  const plans: Array<{ name: DictKey; price: DictKey; desc: DictKey; highlight?: boolean }> = [
    { name: "planFreeName", price: "planFreePrice", desc: "planFreeDesc" },
    { name: "planPersonalName", price: "planPersonalPrice", desc: "planPersonalDesc", highlight: true },
    { name: "planProName", price: "planProPrice", desc: "planProDesc" },
    { name: "planTeamsName", price: "planTeamsPrice", desc: "planTeamsDesc" },
  ];

  const features = ar
    ? [
        { icon: "export" as const, title: "تصدير حقيقي قابل للتحرير", body: "ملفات PPTX و DOCX بنصوص وأشكال أصلية تعدّلها في Office مباشرة — ليست لقطات شاشة." },
        { icon: "globe" as const, title: "العربية أولًا", body: "واجهة ومحتوى بالعربية بتخطيط RTL صحيح، وسطور عربية-إنجليزية مختلطة بلا انكسار." },
        { icon: "layers" as const, title: "محتوى منظم", body: "كل شريحة وفقرة تُخزَّن كبيانات مهيكلة يمكنك تعديلها بصريًا وإعادة توليدها في أي وقت." },
        { icon: "shield" as const, title: "خصوصية وملكية", body: "مشاريعك ملك لمساحة عملك، والتحكم بالوصول مفروض على الخادم — ولا نستخدم بياناتك للتدريب." },
        { icon: "spark" as const, title: "يعمل بذكاء اصطناعي… أو بدونه", body: "مشغّل تجريبي داخلي للتجربة، ومشغّلو ذكاء اصطناعي حقيقيون عبر إعداداتك الخاصة." },
        { icon: "history" as const, title: "استعادة أي نسخة", body: "كل تعديل يُحفظ كنسخة مرقّمة — استعد عملك بنقرة واحدة عند أي خطأ." },
      ]
    : [
        { icon: "export" as const, title: "Real, editable exports", body: "PPTX and DOCX with native text and shapes you can edit directly in Office — not screenshots." },
        { icon: "globe" as const, title: "Arabic-first", body: "A full Arabic interface with correct RTL layout and mixed Arabic–English lines that never break." },
        { icon: "layers" as const, title: "Structured content", body: "Every slide and paragraph is stored as structured data — edit it visually, regenerate any time." },
        { icon: "shield" as const, title: "Privacy & ownership", body: "Projects belong to your workspace with server-enforced access control. Your content stays yours." },
        { icon: "spark" as const, title: "AI when you want it", body: "A built-in demo provider for exploring, and real AI providers you configure yourself." },
        { icon: "history" as const, title: "Recover any version", body: "Every change is stored as a numbered revision — restore your work in one click after any mistake." },
      ];

  const steps = ar
    ? [
        { n: "١", title: "صِف ما تريد", body: "اكتب فكرتك بلغتك: موضوع، جمهور، نبرة، طول." },
        { n: "٢", title: "راجع الهيكل", body: "عنوان ومخطط جاهز للعرض أو المستند قبل التفاصيل." },
        { n: "٣", title: "حرّر بصريًا", body: "عدّل كل عنصر مباشرة مع حفظ تلقائي ونسخ سابقة." },
        { n: "٤", title: "صدّر وامتلكه", body: "PPTX أو DOCX أو PDF — ملفات حقيقية تظل ملكك." },
      ]
    : [
        { n: "1", title: "Describe it", body: "Write your idea in your own words: topic, audience, tone, length." },
        { n: "2", title: "Review the outline", body: "Get a validated structure for your deck or document before details." },
        { n: "3", title: "Edit visually", body: "Change every element directly, with autosave and revision history." },
        { n: "4", title: "Export & own it", body: "PPTX, DOCX or PDF — real files that remain fully yours." },
      ];

  const faqs: Array<{ q: DictKey; a: DictKey }> = [
    { q: "faq1Q", a: "faq1A" },
    { q: "faq2Q", a: "faq2A" },
    { q: "faq3Q", a: "faq3A" },
    { q: "faq4Q", a: "faq4A" },
  ];

  return (
    <div className="relative">
      <div className="bg-aurora" aria-hidden />
      <div className="bg-grid" aria-hidden />

      {/* ---------- Nav ---------- */}
      <header
        className="sticky top-0 z-20"
        style={{ background: "var(--nav-bg)", backdropFilter: "blur(10px)", borderBottom: "1px solid var(--border)" }}
      >
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <Link href="/" className="flex items-center gap-2.5 no-underline">
            <span
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-lg font-black"
              style={{ background: "linear-gradient(135deg, var(--turquoise), var(--sky))", color: "#04222b" }}
              aria-hidden
            >
              E
            </span>
            <span className="text-lg font-bold tracking-tight">
              EISAX<span style={{ color: "var(--turquoise)" }}>&nbsp;Studio</span>
            </span>
          </Link>
          <div className="hidden items-center gap-7 text-sm md:flex" style={{ color: "var(--text-dim)" }}>
            <a href="#how" className="no-underline whitespace-nowrap transition-colors hover:text-white">{ar ? "كيف يعمل" : "How it works"}</a>
            <a href="#features" className="no-underline whitespace-nowrap transition-colors hover:text-white">{ar ? "الميزات" : "Features"}</a>
            <a href="#pricing" className="no-underline whitespace-nowrap transition-colors hover:text-white">{tr("navPricing")}</a>
            <a href="#faq" className="no-underline whitespace-nowrap transition-colors hover:text-white">{tr("navFaq")}</a>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <PwaInstallButton locale={locale} />
            <ThemeSwitcher initialTheme={uiTheme} locale={locale} />
            <LocaleSwitcher current={locale} />
            {user ? (
              <Link href="/dashboard" className="btn btn-primary text-sm no-underline">
                {tr("dashboardTitle")}
              </Link>
            ) : (
              <>
                <Link href="/sign-in" className="hidden text-sm whitespace-nowrap no-underline transition-colors hover:text-white sm:block" style={{ color: "var(--text-dim)" }}>
                  {tr("signIn")}
                </Link>
                <Link href="/sign-up" className="btn btn-primary text-sm no-underline">
                  {tr("getStarted")}
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

      <main>
        {/* ---------- Hero ---------- */}
        <section className="mx-auto max-w-6xl px-5 pb-24 pt-20 md:pt-28">
          <div className="mx-auto max-w-3xl text-center">
            <span className="pill fade-up">
              <span className="pill-dot" aria-hidden />
              {ar ? "استوديو ينجزها الذكاء الاصطناعي · إنجليزي وعربي" : "AI-first studio · English & Arabic"}
            </span>
            <h1 className="display fade-up d1 mt-6 text-4xl sm:text-5xl md:text-6xl">
              {ar ? (
                <>
                  من فكرة بسيطة إلى <span className="text-gradient">مستند احترافي</span> تملكه بالكامل
                </>
              ) : (
                <>
                  From plain words to a <span className="text-gradient">professional document</span> you truly own
                </>
              )}
            </h1>
            <p className="fade-up d2 mx-auto mt-6 max-w-2xl text-base leading-relaxed md:text-lg" style={{ color: "var(--text-dim)" }}>
              {tr("heroBody")}
            </p>
            <div className="fade-up d3 mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link href={user ? "/dashboard" : "/sign-up"} className="btn btn-primary px-6 py-3 text-base no-underline">
                {tr("heroCta")}
                <Icon name="arrow" className="h-4 w-4 rtl:rotate-180" />
              </Link>
              <a href="#how" className="btn btn-ghost px-6 py-3 text-base no-underline">
                {ar ? "شاهد كيف يعمل" : "See how it works"}
              </a>
            </div>
            <p className="fade-up d4 mt-5 text-xs" style={{ color: "var(--text-dim)" }}>
              {ar
                ? "خطة مجانية · بدون بطاقة بنكية · يعمل في المتصفح"
                : "Free plan · No credit card · Works in your browser"}
            </p>
          </div>

          {/* Product mock — illustrative demo of the create flow */}
          <div className="fade-up d4 mx-auto mt-16 max-w-4xl">
            <div className="demo-shell">
              <div className="demo-bar" aria-hidden>
                <span className="demo-dot" style={{ background: "#ff6b6b" }} />
                <span className="demo-dot" style={{ background: "var(--gold)" }} />
                <span className="demo-dot" style={{ background: "var(--turquoise)" }} />
                <span className="ms-2 text-xs" style={{ color: "var(--text-dim)" }}>
                  {ar ? "eisax.studio / إنشاء جديد" : "eisax.studio / create"}
                </span>
              </div>
              <div className="p-5 md:p-7">
                <div className="editor-surface rounded-xl p-4 md:p-5" dir="auto">
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-0.5 inline-flex h-7 w-7 flex-none items-center justify-center rounded-lg"
                      style={{ background: "linear-gradient(135deg, var(--turquoise), var(--sky))", color: "#04222b" }}
                      aria-hidden
                    >
                      <Icon name="spark" className="h-4 w-4" />
                    </span>
                    <p className="text-sm leading-7 md:text-[0.95rem]">
                      <span className="demo-typing">
                        {ar
                          ? "أنشئ عرضًا من 5 شرائح عن فوائد الطاقة الشمسية لطلاب الجامعة، بنبرة ودّية، بالعربية."
                          : "Create a 5-slide presentation about solar energy benefits for university students, friendly tone."}
                      </span>
                      <span className="demo-caret" aria-hidden />
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-[1.2fr_2fr] gap-4">
                  <div className="card p-4">
                    <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>
                      <Icon name="slides" className="h-3.5 w-3.5" />
                      {ar ? "هيكل مقترح" : "Suggested outline"}
                    </p>
                    <div className="space-y-2">
                      {[85, 70, 78, 62, 74].map((w, i) => (
                        <div key={i} className="demo-line" style={{ width: `${w}%`, opacity: 0.35 + i * 0.12 }} />
                      ))}
                    </div>
                  </div>
                  <div className="card p-4">
                    <div className="grid grid-cols-3 gap-2.5">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="demo-slide rounded-lg border p-2.5"
                          style={{
                            borderColor: i === 0 ? "rgba(0,212,200,0.6)" : "var(--border)",
                            background: i === 0 ? "rgba(0,212,200,0.06)" : "rgba(255,255,255,0.02)",
                            animationDelay: `${2.4 + i * 0.35}s`,
                          }}
                        >
                          <div className="demo-line mb-2" style={{ width: "70%" }} />
                          <div className="demo-line mb-2" style={{ width: "90%", opacity: 0.5 }} />
                          <div className="demo-line" style={{ width: "55%", opacity: 0.3 }} />
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 flex items-center justify-center gap-2 text-xs" style={{ color: "var(--text-dim)" }}>
                      <Icon name="export" className="h-3.5 w-3.5" />
                      {ar ? "PPTX · DOCX · PDF قابلة للتحرير" : "Editable PPTX · DOCX · PDF"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-3 text-center text-xs" style={{ color: "var(--text-dim)" }}>
              {ar ? "معاينة توضيحية — لا تُرسل أي بيانات." : "Illustrative preview — no data is sent."}
            </p>
          </div>
        </section>

        {/* ---------- How it works ---------- */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16">
          <SectionHeading ar={ar} kicker={ar ? "سير العمل" : "Workflow"} title={ar ? "أربع خطوات من الفكرة إلى الملف" : "Four steps from idea to file"} />
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <div key={s.n} className="relative">
                <span
                  className="relative z-10 inline-flex h-11 w-11 items-center justify-center rounded-xl text-base font-extrabold"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border-strong)",
                    color: "var(--turquoise)",
                  }}
                >
                  {s.n}
                </span>
                {i < steps.length - 1 && <span className="step-line hidden lg:block" aria-hidden />}
                <h3 className="mt-4 font-bold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-dim)" }}>
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- Features ---------- */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16">
          <SectionHeading ar={ar} kicker={ar ? "لماذا EISAX" : "Why EISAX"} title={ar ? "مبني للعمل الحقيقي، لا للعرض فقط" : "Built for real work, not for show"} />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="card card-hover p-6">
                <span
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{ background: "rgba(0,212,200,0.08)", color: "var(--turquoise)", border: "1px solid rgba(0,212,200,0.25)" }}
                  aria-hidden
                >
                  <Icon name={f.icon} className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-base font-bold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-dim)" }} dir="auto">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- Pricing ---------- */}
        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16">
          <SectionHeading ar={ar} kicker={ar ? "الخطط" : "Plans"} title={tr("pricingTitle")} />
          <p className="mt-3 text-center text-sm" style={{ color: "var(--text-dim)" }}>
            {tr("pricingNote")}
          </p>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((p) => (
              <div key={p.name} className={`card card-hover relative p-6 ${p.highlight ? "pricing-pop" : ""}`}>
                {p.highlight && (
                  <span
                    className="absolute -top-3 start-6 rounded-full px-3 py-1 text-xs font-bold"
                    style={{ background: "linear-gradient(135deg, var(--turquoise), var(--sky))", color: "#04222b" }}
                  >
                    {ar ? "الأكثر اختيارًا" : "Most popular"}
                  </span>
                )}
                <h3 className="text-lg font-bold">{tr(p.name)}</h3>
                <p
                  className="mt-2 text-3xl font-extrabold tracking-tight"
                  style={{ color: p.highlight ? "var(--turquoise)" : "var(--text)" }}
                  dir="ltr"
                >
                  {tr(p.price)}
                </p>
                <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--text-dim)" }} dir="auto">
                  {tr(p.desc)}
                </p>
                <Link
                  href={user ? "/dashboard" : "/sign-up"}
                  className={`btn mt-5 w-full justify-center text-sm no-underline ${p.highlight ? "btn-primary" : "btn-ghost"}`}
                >
                  {ar ? "اختيار" : "Choose"}
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- FAQ ---------- */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-5 py-16">
          <SectionHeading ar={ar} kicker={ar ? "أسئلة" : "Answers"} title={tr("faqTitle")} />
          <div className="mt-10 space-y-3.5">
            {faqs.map((f) => (
              <details key={f.q} className="faq card px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  <span dir="auto">{tr(f.q)}</span>
                  <span className="faq-chevron text-xl leading-none" style={{ color: "var(--turquoise)" }} aria-hidden>
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--text-dim)" }} dir="auto">
                  {tr(f.a)}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* ---------- Final CTA ---------- */}
        <section className="mx-auto max-w-6xl px-5 pb-24 pt-4">
          <div
            className="relative overflow-hidden rounded-3xl border p-10 text-center md:p-14"
            style={{
              borderColor: "var(--border-strong)",
              background:
                "radial-gradient(40rem 16rem at 50% -20%, rgba(0,212,200,0.14), transparent 70%), var(--surface)",
            }}
          >
            <h2 className="display mx-auto max-w-2xl text-3xl md:text-4xl">
              {ar ? "جاهز لصنع أول مستند بجملة واحدة؟" : "Ready to make your first document in one sentence?"}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm md:text-base" style={{ color: "var(--text-dim)" }}>
              {ar ? "ابدأ مجانًا — بدون بطاقة بنكية، وبدون تثبيت أي شيء." : "Start free — no credit card, nothing to install."}
            </p>
            <Link href={user ? "/dashboard" : "/sign-up"} className="btn btn-primary mt-8 px-7 py-3 text-base no-underline">
              {tr("getStarted")}
              <Icon name="arrow" className="h-4 w-4 rtl:rotate-180" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t py-10 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}>
        <p className="font-semibold" style={{ color: "var(--text)" }}>
          EISAX<span style={{ color: "var(--turquoise)" }}>&nbsp;Studio</span>
        </p>
        <p className="mt-2 text-xs" dir="auto">
          {tr("brandTagline")} · © {new Date().getFullYear()} EISAX · {rtl ? "جميع الحقوق محفوظة" : "All rights reserved"}
        </p>
      </footer>
    </div>
  );
}

function SectionHeading({ ar, kicker, title }: { ar: boolean; kicker: string; title: string }) {
  return (
    <div className="text-center">
      <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: "var(--turquoise)" }}>
        {kicker}
      </p>
      <h2 className="display mt-3 text-3xl md:text-4xl">{title}</h2>
    </div>
  );
}
