import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/auth/session";
import { deleteManagedUser, updateManagedUser } from "@/lib/admin";

function normalizePhone(input: unknown): string | null {
  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (input === null) {
    return null;
  }

  return null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    await requireAdminUser();
    const { userId } = await context.params;

    if (!userId) {
      return NextResponse.json(
        { error: "User id is required." },
        { status: 400 }
      );
    }

    const body = (await request.json()) as {
      name?: unknown;
      email?: unknown;
      phone?: unknown;
      status?: unknown;
      password?: unknown;
    };

    const { name, email, phone, status, password } = body;

    if (typeof name !== "string" || typeof email !== "string") {
      return NextResponse.json(
        { error: "Invalid request payload." },
        { status: 422 }
      );
    }

    if (
      typeof status !== "string" ||
      !["ACTIVE", "DEACTIVATED", "SUSPENDED"].includes(status)
    ) {
      return NextResponse.json(
        { error: "Invalid status provided." },
        { status: 422 }
      );
    }

    const normalizedPhone = normalizePhone(phone);
    const sanitizedPassword =
      typeof password === "string" && password.trim().length > 0
        ? password
        : undefined;

    const user = await updateManagedUser(userId, {
      name,
      email,
      phone: normalizedPhone,
      status: status as "ACTIVE" | "DEACTIVATED" | "SUSPENDED",
      password: sanitizedPassword,
    });

    return NextResponse.json({ user });
  } catch (error) {
    const name = (error as Error).name;
    const status =
      name === "ForbiddenError"
        ? 403
        : name === "UnauthorizedError"
        ? 401
        : 400;
    const message = (error as Error).message ?? "Unable to update user.";

    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    await requireAdminUser();
    const { userId } = await context.params;

    if (!userId) {
      return NextResponse.json(
        { error: "User id is required." },
        { status: 400 }
      );
    }

    await deleteManagedUser(userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const name = (error as Error).name;
    const status =
      name === "ForbiddenError"
        ? 403
        : name === "UnauthorizedError"
        ? 401
        : 400;
    const message = (error as Error).message ?? "Unable to delete user.";

    return NextResponse.json({ error: message }, { status });
  }
}
