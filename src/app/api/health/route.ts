import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const client = await getClient();
    const res = await client.query<{ ok: number }>("SELECT 1 AS ok");
    if (res.rows[0]?.ok !== 1) throw new Error("unexpected ping result");
    return NextResponse.json({ status: "ok", db: "ready" });
  } catch (e) {
    return NextResponse.json(
      { status: "degraded", db: "unavailable", detail: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}
