import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LOCAL_MODE } from "@/lib/auth/local";
import { getCurrentUser } from "@/lib/auth/session";
import { LOCALE_COOKIE, getLocale } from "@/lib/i18n";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { ThemeSwitcher, UI_THEME_COOKIE, type UiTheme } from "@/components/ThemeSwitcher";

export default async function LandingPage() {
  if (LOCAL_MODE) redirect("/dashboard");
  const user = await getCurrentUser();
  const jar = await cookies();
  const locale = getLocale(jar.get(LOCALE_COOKIE)?.value, user?.locale);
  const ar = locale === "ar";
  const theme: UiTheme = jar.get(UI_THEME_COOKIE)?.value === "light" ? "light" : "dark";
  const href = user ? "/dashboard" : "/sign-in";
  const features = ar ? [
    ["مستندات يومية", "كتابة وتنسيق وفقرات وقوائم وجداول وصور، مع دعم العربية والإنجليزية."],
    ["عروض واضحة", "عدّل النصوص والأشكال والصور والرسوم، ورتّب الشرائح بصريًا."],
    ["افتح، عدّل، واحفظ", "استورد DOCX وPPTX، وصدّر نسخة قابلة للتحرير أو اطبع إلى PDF."],
    ["مساعد اختياري", "أعد الصياغة أو اختصر أو ترجم أو أنشئ مسودة بالذكاء الاصطناعي عند الحاجة."],
  ] : [
    ["Everyday documents", "Write and format paragraphs, lists, tables and images in Arabic and English."],
    ["Clear presentations", "Edit text, shapes, images and charts, and arrange slides visually."],
    ["Open, edit, save", "Import DOCX and PPTX, download an editable copy, or print to PDF."],
    ["Optional assistance", "Rewrite, shorten, translate or generate a draft with AI when you need it."],
  ];
  return <div className="min-h-dvh">
    <header className="border-b" style={{ borderColor: "var(--border)" }}>
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
        <Link href="/" className="text-lg font-bold no-underline">EISAX Studio</Link>
        <div className="flex items-center gap-3"><ThemeSwitcher initialTheme={theme} locale={locale} /><LocaleSwitcher current={locale} />
          <Link href={href} className="btn btn-primary no-underline">{ar ? "افتح مساحة العمل" : "Open workspace"}</Link>
        </div>
      </nav>
    </header>
    <main className="mx-auto max-w-6xl px-5 py-16">
      <p className="pill">{ar ? "محرر خفيف للمستندات والعروض" : "Lightweight documents & presentations"}</p>
      <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-tight md:text-6xl">{ar ? "ملفاتك، وأدواتك اليومية، ببساطة." : "Your files. Everyday tools. Less friction."}</h1>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed" style={{ color: "var(--text-dim)" }}>{ar ? "ابدأ بمستند أو عرض فارغ، أو افتح ملف Word أو PowerPoint موجودًا وعدّله. الذكاء الاصطناعي أداة مساعدة داخل المحرر." : "Start with a blank document or presentation, or open an existing Word or PowerPoint file and edit it. AI is an optional tool inside the editor."}</p>
      <div className="mt-8 flex flex-wrap gap-3"><Link href={href} className="btn btn-primary no-underline">{ar ? "افتح أو أنشئ ملفًا" : "Open or create a file"}</Link>
        {!user && <Link href="/sign-up" className="btn btn-ghost no-underline">{ar ? "إنشاء حساب لمساحة العمل" : "Create workspace account"}</Link>}
      </div>
      <div className="mt-14 grid gap-5 sm:grid-cols-2">{features.map(([title, body]) => <section key={title} className="card p-6"><h2 className="text-lg font-bold">{title}</h2><p className="mt-3 leading-relaxed" style={{ color: "var(--text-dim)" }}>{body}</p></section>)}</div>
      <section className="card mt-8 p-6"><h2 className="font-bold">{ar ? "حدود التوافق واضحة" : "Clear compatibility boundaries"}</h2><p className="mt-3 leading-relaxed" style={{ color: "var(--text-dim)" }}>{ar ? "أدوات للاستخدام اليومي، مع تحذيرات عند استيراد عناصر معقدة لا يدعمها المحرر بالكامل. يحتفظ التطبيق بالأصل منفصلًا عن نسخة التحرير." : "Tools for everyday work, with warnings for complex imported elements the editor does not fully support. The original is retained separately from the editable copy."}</p></section>
    </main>
  </div>;
}
