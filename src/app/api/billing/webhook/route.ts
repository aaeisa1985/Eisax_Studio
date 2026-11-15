import { NextResponse } from "next/server";
import { BILLING_ENABLED } from "@/lib/billing/plans";
import { applyStripeEvent, verifyStripeSignature, type StripeWebhookEvent } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!BILLING_ENABLED) {
    return NextResponse.json({ error: "billing_disabled" }, { status: 503 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!verifyStripeSignature(rawBody, sig, secret)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  try {
    const event = JSON.parse(rawBody) as StripeWebhookEvent;
    const res = await applyStripeEvent(event);
    return NextResponse.json({ received: true, applied: res.applied });
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
}
