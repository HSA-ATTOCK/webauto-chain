import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session";
import { respondToLedgerEntry } from "@/lib/ledger";
import { ledgerDecisionSchema } from "@/lib/validators/ledger";

interface RouteParams {
  params: Promise<{ entryId: string }>;
}

export async function POST(request: Request, context: RouteParams) {
  try {
    const user = await requireSessionUser();
    const { entryId } = await context.params;
    const body = await request.json();
    const parsed = ledgerDecisionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const updated = await respondToLedgerEntry(
      entryId,
      user.id,
      parsed.data.decision,
      parsed.data.note
    );

    return NextResponse.json({ entry: updated });
  } catch (error) {
    const status = (error as Error).name === "SubscriptionError" ? 403 : 400;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
}
