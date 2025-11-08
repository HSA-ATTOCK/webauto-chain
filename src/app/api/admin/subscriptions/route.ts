import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/auth/session";
import { activateSubscription, revokeSubscription } from "@/lib/admin";

export async function POST(request: Request) {
  try {
    await requireAdminUser();
    const { ownerId, plan, durationDays } = (await request.json()) as {
      ownerId?: string;
      plan?: "CREATOR_BASIC" | "CREATOR_PRO";
      durationDays?: number;
    };

    if (!ownerId || !plan) {
      return NextResponse.json(
        { error: "ownerId and plan required" },
        { status: 422 }
      );
    }

    const subscription = await activateSubscription(
      ownerId,
      plan,
      durationDays ?? 365
    );
    return NextResponse.json({ subscription }, { status: 201 });
  } catch (error) {
    const status = (error as Error).name === "ForbiddenError" ? 403 : 400;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdminUser();
    const { ownerId } = (await request.json()) as {
      ownerId?: string;
    };

    if (!ownerId) {
      return NextResponse.json({ error: "ownerId required" }, { status: 422 });
    }

    const subscription = await revokeSubscription(ownerId);
    return NextResponse.json({ subscription }, { status: 200 });
  } catch (error) {
    const baseError = error as Error;
    if (baseError.name === "ForbiddenError") {
      return NextResponse.json({ error: baseError.message }, { status: 403 });
    }

    const status = baseError.name === "NotFoundError" ? 404 : 400;
    return NextResponse.json({ error: baseError.message }, { status });
  }
}
