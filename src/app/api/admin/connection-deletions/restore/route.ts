import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/auth/session";
import { restoreConnectionDeletion } from "@/lib/connections";

export async function POST(request: Request) {
  try {
    await requireAdminUser();
    const body = await request.json();
    const { connectionId } = body as { connectionId?: string };

    if (!connectionId) {
      return NextResponse.json(
        { error: "connectionId is required" },
        { status: 422 }
      );
    }

    const connection = await restoreConnectionDeletion(connectionId);
    return NextResponse.json({ connection });
  } catch (error) {
    const message = (error as Error).message ?? "Unable to restore connection";
    const status =
      (error as Error).name === "ForbiddenError"
        ? 403
        : message === "Deletion request not found or already resolved"
        ? 404
        : 400;

    return NextResponse.json({ error: message }, { status });
  }
}
