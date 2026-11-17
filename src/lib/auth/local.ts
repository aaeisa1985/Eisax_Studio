import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, workspaces, workspaceMembers } from "@/lib/db/schema";

export const LOCAL_MODE = process.env.EISAX_LOCAL_MODE === "true";
const LOCAL_EMAIL = "local-profile@eisax.invalid";

/** A separate personal workspace; existing signed-in workspaces are untouched. */
export async function getLocalUser() {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.insert(users).values({ email: LOCAL_EMAIL, passwordHash: "local-profile-disabled", displayName: "Local", locale: "en" }).onConflictDoNothing();
    const [user] = await tx.select().from(users).where(eq(users.email, LOCAL_EMAIL)).limit(1);
    if (!user) throw new Error("local_profile_failed");
    const [workspace] = await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.ownerId, user.id)).limit(1);
    if (!workspace) {
      const [created] = await tx.insert(workspaces).values({ name: "Local files", ownerId: user.id }).returning({ id: workspaces.id });
      if (!created) throw new Error("local_workspace_failed");
      await tx.insert(workspaceMembers).values({ workspaceId: created.id, userId: user.id, role: "owner" });
    }
    return { id: user.id, email: user.email, displayName: user.displayName, locale: user.locale };
  });
}
