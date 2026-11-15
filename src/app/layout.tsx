import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { LOCALE_COOKIE, dirFor, getLocale } from "@/lib/i18n";
import { getCurrentUser } from "@/lib/auth/session";
import { PwaRegistry } from "@/components/PwaManager";
import { UI_THEME_COOKIE, type UiTheme } from "@/components/ThemeSwitcher";

export const metadata: Metadata = {
  title: "EISAX Studio — Word, Slides & Native Office",
  description:
    "Lightweight full-screen Office suite for Word (.docx) and PowerPoint (.pptx) editing with first-class Arabic RTL & mixed-language support.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "EISAX Studio",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#060b14" },
    { media: "(prefers-color-scheme: light)", color: "#f4f7fb" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const user = await getCurrentUser();
  const locale = getLocale(jar.get(LOCALE_COOKIE)?.value, user?.locale);
  const dir = dirFor(locale);
  const rawTheme = jar.get(UI_THEME_COOKIE)?.value;
  const uiTheme: UiTheme = rawTheme === "light" ? "light" : "dark";

  return (
    <html lang={locale} dir={dir} data-ui-theme={uiTheme}>
      <body>
        <PwaRegistry />
        {children}
      </body>
    </html>
  );
}
