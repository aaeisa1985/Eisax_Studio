"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signInAction, signUpAction, type AuthResult } from "@/lib/auth/actions";
import { t, type DictKey, type Locale } from "@/lib/i18n";

export function AuthForm({ mode, locale }: { mode: "sign-in" | "sign-up"; locale: Locale }) {
  const action = mode === "sign-up" ? signUpAction : signInAction;
  const [state, formAction, pending] = useActionState<AuthResult | null, FormData>(action, null);
  const tr = (k: DictKey) => t(locale, k);

  const error = (() => {
    if (!state || state.ok) return null;
    switch (state.error) {
      case "invalid_credentials":
        return tr("errorInvalidCredentials");
      case "email_taken":
        return tr("errorEmailTaken");
      case "rate_limited":
        return tr("errorRateLimited");
      default:
        return locale === "ar"
          ? "تحقق من المدخلات (كلمة المرور 10 أحرف على الأقل)."
          : "Check your inputs (password: at least 10 characters).";
    }
  })();

  return (
    <form action={formAction} className="space-y-4">
      {mode === "sign-up" && (
        <div>
          <label htmlFor="displayName" className="mb-1 block text-sm font-medium">
            {tr("displayName")}
          </label>
          <input
            id="displayName"
            name="displayName"
            required
            maxLength={80}
            autoComplete="name"
            dir="auto"
            className="input"
          />
        </div>
      )}
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">
          {tr("email")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="input"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          {tr("password")}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={mode === "sign-up" ? 10 : 1}
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          className="input"
        />
        {mode === "sign-up" && (
          <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
            {locale === "ar" ? "10 أحرف على الأقل" : "At least 10 characters"}
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-lg border p-2.5 text-sm" style={{ borderColor: "var(--danger-border)", color: "var(--danger)" }}>
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary w-full justify-center">
        {pending ? (locale === "ar" ? "…" : "…") : mode === "sign-up" ? tr("signUp") : tr("signIn")}
      </button>
      <p className="text-center text-sm" style={{ color: "var(--text-dim)" }}>
        <Link
          href={mode === "sign-up" ? "/sign-in" : "/sign-up"}
          className="no-underline"
          style={{ color: "var(--sky)" }}
        >
          {mode === "sign-up" ? tr("authSwitchToSignIn") : tr("authSwitchToSignUp")}
        </Link>
      </p>
    </form>
  );
}
