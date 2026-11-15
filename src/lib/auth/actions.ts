"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { users, workspaces, workspaceMembers } from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession, getCurrentUser } from "@/lib/auth/session";
import { signInSchema, signUpSchema } from "@/lib/validation/projects";
import { rateLimit } from "@/lib/security/rateLimit";
import { audit } from "@/lib/security/audit";

export type AuthResult = { ok: true } | { ok: false; error: "invalid_credentials" | "email_taken" | "rate_limited" | "invalid_input" };

async function clientKey(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

export async function signUpAction(_prev: AuthResult | null, formData: FormData): Promise<AuthResult> {
  const rl = rateLimit(`signup:${await clientKey()}`, 5, 60_000);
  if (!rl.ok) return { ok: false, error: "rate_limited" };

  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const db = await getDb();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (existing.length > 0) return { ok: false, error: "email_taken" };

  const inserted = await db
    .insert(users)
    .values({
      email: parsed.data.email,
      passwordHash: hashPassword(parsed.data.password),
      displayName: parsed.data.displayName,
    })
    .returning({ id: users.id });
  const user = inserted[0];
  if (!user) return { ok: false, error: "invalid_input" };
  // Personal workspace
  const ws = await db
    .insert(workspaces)
    .values({ name: `${parsed.data.displayName}'s workspace`, ownerId: user.id })
    .returning({ id: workspaces.id });
  if (ws[0]) {
    await db.insert(workspaceMembers).values({ workspaceId: ws[0].id, userId: user.id, role: "owner" });
  }

  await createSession(user.id);
  await audit(user.id, "user.sign_up");
  redirect("/dashboard");
}

export async function signInAction(_prev: AuthResult | null, formData: FormData): Promise<AuthResult> {
  const rl = rateLimit(`signin:${await clientKey()}`, 10, 60_000);
  if (!rl.ok) return { ok: false, error: "rate_limited" };

  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_credentials" };

  const db = await getDb();
  const rows = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);
  const user = rows[0];
  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return { ok: false, error: "invalid_credentials" };
  }

  await createSession(user.id);
  await audit(user.id, "user.sign_in");
  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  await destroySession();
  await audit(null, "user.sign_out");
  redirect("/");
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}
