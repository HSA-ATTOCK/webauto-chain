import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/auth/session";
import { getPendingConnectionDeletionOverview } from "@/lib/admin";

export async function GET() {
  try {
    await requireAdminUser();
    const deletions = await getPendingConnectionDeletionOverview();
    return NextResponse.json({ deletions });
  } catch (error) {
    const status = (error as Error).name === "ForbiddenError" ? 403 : 401;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
}
