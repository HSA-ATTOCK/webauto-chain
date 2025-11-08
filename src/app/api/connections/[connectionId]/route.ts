import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session";
import { scheduleConnectionDeletion } from "@/lib/connections";

interface RouteParams {
  params: Promise<{ connectionId: string }>;
}

export async function DELETE(_request: Request, context: RouteParams) {
  try {
    const user = await requireSessionUser();
    const { connectionId } = await context.params;
    const connection = await scheduleConnectionDeletion({
      connectionId,
      actorId: user.id,
    });

    return NextResponse.json({ connection });
  } catch (error) {
    const message = (error as Error).message ?? "Unable to delete connection";
    const status =
      message === "Connection not found"
        ? 404
        : message === "You are not part of this connection"
        ? 403
        : message === "Connection is already archived"
        ? 409
        : 400;

    return NextResponse.json({ error: message }, { status });
  }
}
