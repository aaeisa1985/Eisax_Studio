import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { BILLING_ENABLED } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!BILLING_ENABLED) {
    return NextResponse.json(
      { error: "billing_disabled", message: "Paid billing is disabled until approved." },
      { status: 503 },
    );
  }

  return NextResponse.json({ error: "stripe_checkout_not_configured" }, { status: 501 });
}
