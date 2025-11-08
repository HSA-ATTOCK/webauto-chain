import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/auth/session";
import { getAdminNetworkOverview } from "@/lib/admin";

export async function GET() {
  try {
    await requireAdminUser();
    const overview = await getAdminNetworkOverview();
    return NextResponse.json({ overview });
  } catch (error) {
    const name = (error as Error).name;
    const status = name === "ForbiddenError" ? 403 : 401;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
}
