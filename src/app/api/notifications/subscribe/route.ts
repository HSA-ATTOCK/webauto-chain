import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();

    const outPath = path.resolve(
      process.cwd(),
      "notifications-subscriptions.json"
    );
    let existing: Array<Record<string, unknown>> = [];
    try {
      const raw = await fs.readFile(outPath, "utf-8");
      existing = JSON.parse(raw) as Array<Record<string, unknown>>;
    } catch {
      existing = [];
    }

    // Basic dedupe by endpoint when possible
    const maybeObj = body as Record<string, unknown> | null;
    const endpoint =
      maybeObj && typeof maybeObj.endpoint === "string"
        ? maybeObj.endpoint
        : null;
    if (endpoint) {
      existing = existing.filter((s) => (s.endpoint as unknown) !== endpoint);
    }

    existing.push({
      subscribedAt: new Date().toISOString(),
      subscription: body as Record<string, unknown>,
    });

    await fs.writeFile(outPath, JSON.stringify(existing, null, 2), "utf-8");

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("notifications subscribe error", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
