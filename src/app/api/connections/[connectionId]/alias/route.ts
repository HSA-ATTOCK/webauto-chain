import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session";
import { updateConnectionAlias } from "@/lib/connections";

interface RouteParams {
  params: Promise<{ connectionId: string }>;
}

export async function PATCH(request: Request, context: RouteParams) {
  try {
    const user = await requireSessionUser();
    const { connectionId } = await context.params;

    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const aliasInput = (body as { alias?: unknown })?.alias;

    if (
      aliasInput !== undefined &&
      aliasInput !== null &&
      typeof aliasInput !== "string"
    ) {
      return NextResponse.json(
        { error: "Provide the alias as text." },
        { status: 422 }
      );
    }

    let alias: string | null = null;
    if (typeof aliasInput === "string") {
      const trimmed = aliasInput.trim();
      if (trimmed.length > 80) {
        return NextResponse.json(
          { error: "Alias must be 80 characters or fewer." },
          { status: 422 }
        );
      }
      if (trimmed.length > 0 && trimmed.length < 2) {
        return NextResponse.json(
          { error: "Alias must be at least 2 characters." },
          { status: 422 }
        );
      }
      alias = trimmed.length > 0 ? trimmed : null;
    }

    const connection = await updateConnectionAlias({
      connectionId,
      actorId: user.id,
      alias,
    });

    return NextResponse.json({ connection });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update alias";
    const status =
      message === "Connection not found"
        ? 404
        : message === "You are not part of this connection"
        ? 403
        : message === "Alias cannot be empty for upstream partners"
        ? 422
        : 400;

    return NextResponse.json({ error: message }, { status });
  }
}
