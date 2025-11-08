import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session";
import { createLedgerEntry, getLedgerEntries } from "@/lib/ledger";
import { ledgerEntrySchema } from "@/lib/validators/ledger";

interface RouteParams {
  params: Promise<{ connectionId: string }>;
}

export async function GET(_request: Request, context: RouteParams) {
  try {
    const user = await requireSessionUser();
    const { connectionId } = await context.params;
    const entries = await getLedgerEntries(connectionId, user.id);

    return NextResponse.json({ entries });
  } catch (error) {
    const status = (error as Error).name === "SubscriptionError" ? 403 : 400;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
}

export async function POST(request: Request, context: RouteParams) {
  try {
    const user = await requireSessionUser();
    const { connectionId } = await context.params;
    const payload = await request.json();
    const parsed = ledgerEntrySchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const dueDate = parsed.data.dueDate
      ? new Date(
          parsed.data.dueDate.length === 10
            ? `${parsed.data.dueDate}T00:00:00Z`
            : parsed.data.dueDate
        )
      : undefined;
    const entry = await createLedgerEntry({
      connectionId,
      actorId: user.id,
      entryType: parsed.data.entryType,
      amount: parsed.data.amount,
      items: parsed.data.items,
      notes: parsed.data.notes,
      dueDate,
      supersedesId: parsed.data.supersedesId,
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    const status = (error as Error).name === "SubscriptionError" ? 403 : 400;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
}
