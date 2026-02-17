import { NextResponse } from "next/server";
import { runMonitorCycle } from "@/lib/monitor";

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env["CRON_SECRET"];

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[cron/monitor] Starting monitor cycle...");

  const result = await runMonitorCycle();

  console.log(
    `[cron/monitor] Cycle complete: ${result.scanned} scanned, ${result.changed} changed, ${result.errors.length} errors`
  );

  return NextResponse.json(result);
}
