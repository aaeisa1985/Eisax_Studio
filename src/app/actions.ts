"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function setLocaleAction(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? "");
  if (isLocale(locale)) {
    const jar = await cookies();
    jar.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    const user = await getCurrentUser();
    if (user) {
      const db = await getDb();
      await db.update(users).set({ locale }).where(eq(users.id, user.id));
    }
    revalidatePath("/", "layout");
  }
}
