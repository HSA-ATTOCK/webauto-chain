import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session";
import { revokeLedgerEntry, updateLedgerEntry } from "@/lib/ledger";
import {
  ledgerEntryDeleteSchema,
  ledgerEntryUpdateSchema,
} from "@/lib/validators/ledger";

interface RouteParams {
  params: Promise<{ entryId: string }>;
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export async function PATCH(request: Request, context: RouteParams) {
  try {
    const user = await requireSessionUser();
    const { entryId } = await context.params;
    const payload = await readJsonBody(request);
    const parsed = ledgerEntryUpdateSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const updates: {
      amount?: number;
      notes?: string | null;
      dueDate?: Date | null;
      items?: unknown;
    } = {};

    if (parsed.data.amount !== undefined) {
      updates.amount = parsed.data.amount;
    }

    if (parsed.data.notes !== undefined) {
      updates.notes = parsed.data.notes ?? null;
    }

    if (parsed.data.dueDate !== undefined) {
      if (parsed.data.dueDate === null) {
        updates.dueDate = null;
      } else {
        const value = parsed.data.dueDate;
        const normalized = value.length === 10 ? `${value}T00:00:00Z` : value;
        updates.dueDate = new Date(normalized);
      }
    }

    if (parsed.data.items !== undefined) {
      updates.items = parsed.data.items;
    }

    const entry = await updateLedgerEntry(entryId, user.id, updates);

    return NextResponse.json({ entry });
  } catch (error) {
    const status = (error as Error).name === "SubscriptionError" ? 403 : 400;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
}

export async function DELETE(request: Request, context: RouteParams) {
  try {
    const user = await requireSessionUser();
    const { entryId } = await context.params;
    const payload = await readJsonBody(request);
    const parsed = ledgerEntryDeleteSchema.safeParse(payload ?? {});

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const entry = await revokeLedgerEntry(entryId, user.id, parsed.data.reason);

    return NextResponse.json({ entry });
  } catch (error) {
    const status = (error as Error).name === "SubscriptionError" ? 403 : 400;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
}
