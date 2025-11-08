import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session";
import { declineConnection } from "@/lib/connections";

interface RouteParams {
  params: Promise<{ connectionId: string }>;
}

export async function POST(_request: Request, context: RouteParams) {
  try {
    const user = await requireSessionUser();
    const { connectionId } = await context.params;
    const connection = await declineConnection(connectionId, user.id);

    return NextResponse.json({ connection });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
