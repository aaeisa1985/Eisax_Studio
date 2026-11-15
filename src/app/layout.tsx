import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { LOCALE_COOKIE, dirFor, getLocale } from "@/lib/i18n";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "EISAX Studio — Describe it. Create it. Own it.",
  description:
    "AI-first studio that turns plain language into fully editable presentations and documents, exported to real Office formats.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const user = await getCurrentUser();
  const locale = getLocale(jar.get(LOCALE_COOKIE)?.value, user?.locale);
  const dir = dirFor(locale);
  return (
    <html lang={locale} dir={dir}>
      <body>{children}</body>
    </html>
  );
}
