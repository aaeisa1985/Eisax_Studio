import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth/session";
import { LOCALE_COOKIE, getLocale, t } from "@/lib/i18n";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";

export default async function SignUpPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  const jar = await cookies();
  const locale = getLocale(jar.get(LOCALE_COOKIE)?.value);
  const tr = (k: "signUp" | "brandTagline") => t(locale, k);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-lg font-bold no-underline">
          EISAX&nbsp;Studio
        </Link>
        <LocaleSwitcher current={locale} />
      </div>
      <div className="card p-7">
        <h1 className="mb-1 text-2xl font-bold">{tr("signUp")}</h1>
        <p className="mb-6 text-sm" style={{ color: "var(--text-dim)" }}>
          {tr("brandTagline")}
        </p>
        <AuthForm mode="sign-up" locale={locale} />
      </div>
    </main>
  );
}
