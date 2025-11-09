import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import webpush from "web-push";
import { promises as fs } from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const secret = body?.secret as string | undefined;
    if (
      process.env.PUSH_ADMIN_SECRET &&
      secret !== process.env.PUSH_ADMIN_SECRET
    ) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 }
      );
    }

    const payload = body?.payload ?? {
      title: "Notification",
      body: "Server push",
    };

    const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
    const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
    const VAPID_SUBJECT =
      process.env.VAPID_SUBJECT || "mailto:admin@example.com";

    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return NextResponse.json(
        { ok: false, error: "VAPID keys not configured on server" },
        { status: 500 }
      );
    }

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

    const subsPath = path.resolve(
      process.cwd(),
      "notifications-subscriptions.json"
    );
    let subs: Array<Record<string, unknown>> = [];
    try {
      const raw = await fs.readFile(subsPath, "utf-8");
      subs = JSON.parse(raw) as Array<Record<string, unknown>>;
    } catch {
      subs = [];
    }

    if (!Array.isArray(subs) || subs.length === 0) {
      return NextResponse.json(
        { ok: false, error: "no subscriptions" },
        { status: 404 }
      );
    }

    const results: Array<{ endpoint?: string; ok: boolean; error?: string }> =
      [];

    for (const record of subs) {
      const subscription = record.subscription;
      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
        results.push({
          endpoint:
            (subscription && (subscription as any).endpoint) ?? undefined,
          ok: true,
        });
      } catch (err) {
        results.push({
          endpoint:
            (subscription && (subscription as any).endpoint) ?? undefined,
          ok: false,
          error: String(err),
        });
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    console.error("send push error", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
