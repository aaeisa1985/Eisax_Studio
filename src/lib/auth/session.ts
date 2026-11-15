import { cookies } from "next/headers";
import { eq, and, gt, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { sessions, users, workspaces, workspaceMembers } from "@/lib/db/schema";
import { hashSessionToken, newSessionToken } from "./password";

export const SESSION_COOKIE = "eisax_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  locale: string;
};

export async function createSession(userId: string): Promise<string> {
  const token = newSessionToken();
  const db = await getDb();
  await db.insert(sessions).values({
    id: hashSessionToken(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return token;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, hashSessionToken(token)));
  }
  jar.delete(SESSION_COOKIE);
}

/** Resolve the signed-in user (server-side only). Returns null when anonymous. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      locale: users.locale,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.id, hashSessionToken(token)),
        gt(sessions.expiresAt, new Date()),
        isNull(sessions.revokedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** The user's personal workspace (auto-created at signup). */
export async function getPrimaryWorkspaceId(userId: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId))
    .limit(1);
  return rows[0]?.id ?? null;
}
