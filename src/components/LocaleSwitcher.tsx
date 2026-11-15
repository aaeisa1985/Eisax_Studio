"use client";

import { setLocaleAction } from "@/app/actions";

export function LocaleSwitcher({ current }: { current: "en" | "ar" }) {
  return (
    <form action={setLocaleAction}>
      <select
        name="locale"
        defaultValue={current}
        aria-label="Language / اللغة"
        className="input !w-auto !py-1.5 text-sm"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="en">English</option>
        <option value="ar">العربية</option>
      </select>
      <noscript>
        <button type="submit" className="btn-ghost text-sm">
          OK
        </button>
      </noscript>
    </form>
  );
}
