import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/auth/session";
import { getAdminUserOverview, setUserStatus } from "@/lib/admin";

export async function GET() {
  try {
    await requireAdminUser();
    const users = await getAdminUserOverview();
    return NextResponse.json({ users });
  } catch (error) {
    const status = (error as Error).name === "ForbiddenError" ? 403 : 401;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdminUser();
    const body = await request.json();
    const { userId, status } = body as { userId?: string; status?: string };

    if (
      !userId ||
      !status ||
      !["ACTIVE", "DEACTIVATED", "SUSPENDED"].includes(status)
    ) {
      return NextResponse.json({ error: "Invalid request" }, { status: 422 });
    }

    const user = await setUserStatus(
      userId,
      status as "ACTIVE" | "DEACTIVATED" | "SUSPENDED"
    );
    return NextResponse.json({ user });
  } catch (error) {
    const status = (error as Error).name === "ForbiddenError" ? 403 : 400;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
}
