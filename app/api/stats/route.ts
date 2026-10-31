import { NextResponse } from "next/server";
import { dbEnabled, fetchStats } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!dbEnabled) {
    return NextResponse.json(
      { ok: false, reason: "db-not-configured" },
      { status: 503 },
    );
  }
  try {
    const data = await fetchStats();
    return NextResponse.json({ ok: true, ...data });
  } catch (err) {
    console.error("[stats] failed", err);
    return NextResponse.json(
      { ok: false, reason: err instanceof Error ? err.message : "unknown" },
      { status: 502 },
    );
  }
}
