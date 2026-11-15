"use client";

import { useEffect, useState } from "react";

export type UiTheme = "dark" | "light";
export const UI_THEME_COOKIE = "eisax_ui_theme";

function readClientTheme(initialTheme: UiTheme): UiTheme {
  if (typeof document === "undefined") return initialTheme;
  const attr = document.documentElement.getAttribute("data-ui-theme");
  if (attr === "light" || attr === "dark") return attr;
  return initialTheme;
}

function applyTheme(next: UiTheme) {
  document.documentElement.setAttribute("data-ui-theme", next);
  try {
    localStorage.setItem(UI_THEME_COOKIE, next);
  } catch {
    // ignore storage restriction
  }
  document.cookie = `${UI_THEME_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", next === "light" ? "#f4f7fb" : "#060b14");
  }
}

export function ThemeSwitcher({
  initialTheme = "dark",
  locale = "en",
}: {
  initialTheme?: UiTheme;
  locale?: "en" | "ar";
}) {
  const [theme, setTheme] = useState<UiTheme>(initialTheme);
  const ar = locale === "ar";

  useEffect(() => {
    setTheme(readClientTheme(initialTheme));
  }, [initialTheme]);

  function toggle() {
    const next: UiTheme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn btn-ghost !px-2.5 !py-1.5 text-xs"
      aria-label={ar ? "تبديل المظهر الفاتح/الداكن" : "Toggle Light/Dark theme"}
      title={
        theme === "dark"
          ? ar ? "التبديل إلى الوضع الفاتح" : "Switch to Light mode"
          : ar ? "التبديل إلى الوضع الداكن" : "Switch to Dark mode"
      }
      data-testid="theme-switcher"
    >
      <span aria-hidden>{theme === "dark" ? "☀️" : "🌙"}</span>
      <span className="hidden sm:inline">
        {theme === "dark" ? (ar ? "فاتح" : "Light") : ar ? "داكن" : "Dark"}
      </span>
    </button>
  );
}
