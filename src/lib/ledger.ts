import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { hasActiveCreatorSubscription } from "@/lib/subscription";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonArray;
type JsonArray = JsonValue[];
type JsonObject = { [key: string]: JsonValue };

function normalizeJsonValue(value: unknown): JsonValue | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    const normalizedItems = value
      .map((item) => normalizeJsonValue(item))
      .filter((item): item is JsonValue => item !== undefined);

    return normalizedItems;
  }

  if (typeof value === "object") {
    const normalizedEntries: Record<string, JsonValue> = {};

    for (const [key, entryValue] of Object.entries(
      value as Record<string, unknown>
    )) {
      const normalized = normalizeJsonValue(entryValue);
      if (normalized !== undefined) {
        normalizedEntries[key] = normalized;
      }
    }

    return normalizedEntries;
  }

  return undefined;
}

export type LedgerEntryKind =
  | "CREDIT"
  | "PAYMENT"
  | "ADJUSTMENT"
  | "EDIT_REQUEST"
  | "DELETE_REQUEST";
export type LedgerDecision = "ACCEPT" | "DECLINE";

export interface LedgerEntryInput {
  connectionId: string;
  actorId: string;
  entryType: LedgerEntryKind;
  amount: number;
  items?: unknown;
  notes?: string;
  dueDate?: Date | null;
  supersedesId?: string | null;
}

export async function createLedgerEntry(input: LedgerEntryInput) {
  const {
    connectionId,
    actorId,
    entryType,
    amount,
    items,
    notes,
    dueDate,
    supersedesId,
  } = input;

  if (amount <= 0) {
    throw new Error("Amount must be positive");
  }

  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { status: true },
  });

  if (!actor) {
    throw new Error("Account not found");
  }

  if (actor.status !== "ACTIVE") {
    throw new Error("Your account is not active. Contact support.");
  }

  const connection = await prisma.connection.findUnique({
    where: { id: connectionId },
    include: { parent: true, child: true, deletion: true },
  });

  if (!connection || connection.status !== "ACTIVE") {
    throw new Error("Connection is not active");
  }

  if (connection.parentId !== actorId && connection.childId !== actorId) {
    throw new Error("You are not part of this connection");
  }

  if (
    connection.deletion &&
    connection.deletion.requestedById !== actorId &&
    connection.deletion.acknowledgedById !== actorId
  ) {
    throw new Error(
      "This ledger is read-only because your partner scheduled deletion."
    );
  }

  const creatorSubscriptionActive = await hasActiveCreatorSubscription(
    connection.parentId
  );

  if (!creatorSubscriptionActive) {
    const message =
      connection.parentId === actorId
        ? "Your creator subscription is inactive. Renew it to unlock ledger actions."
        : "Ledger actions are unavailable because the creator subscription is inactive.";
    throw Object.assign(new Error(message), { name: "SubscriptionError" });
  }

  const counterpartyId =
    connection.parentId === actorId ? connection.childId : connection.parentId;

  const ledgerEntry = await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      const jsonItems =
        items === undefined || items === null
          ? undefined
          : normalizeJsonValue(items);
      const safeItems: Prisma.InputJsonValue | undefined =
        jsonItems === undefined
          ? undefined
          : (jsonItems as Prisma.InputJsonValue);

      const entryData: Prisma.LedgerEntryUncheckedCreateInput = {
        connectionId,
        createdById: actorId,
        entryType,
        amount,
        notes: notes ?? null,
        dueDate: dueDate ?? null,
        supersedesId: supersedesId ?? null,
        ...(safeItems !== undefined
          ? { items: safeItems as Prisma.InputJsonValue }
          : {}),
      };

      const entry = await tx.ledgerEntry.create({
        data: entryData,
      });

      await tx.ledgerStatusEvent.create({
        data: {
          ledgerEntryId: entry.id,
          actorId,
          action: "CREATED",
          metadata: {
            entryType,
          },
        },
      });

      await tx.notification.create({
        data: {
          accountId: counterpartyId,
          channel: "IN_APP",
          type: "LEDGER_ACTION",
          title: `New ${entryType.toLowerCase()} entry awaiting approval`,
          body: notes ?? "Review and approve the pending entry.",
          payload: {
            connectionId,
            ledgerEntryId: entry.id,
          },
        },
      });

      return entry;
    }
  );

  return ledgerEntry;
}

export async function respondToLedgerEntry(
  entryId: string,
  actorId: string,
  decision: LedgerDecision,
  note?: string
) {
  const entry = await prisma.ledgerEntry.findUnique({
    where: { id: entryId },
    include: {
      connection: {
        include: {
          deletion: true,
        },
      },
      statusEvents: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!entry) {
    throw new Error("Ledger entry not found");
  }

  if (entry.createdById === actorId) {
    throw new Error("Creator cannot approve their own entry");
  }

  const { connection } = entry;
  if (connection.childId !== actorId && connection.parentId !== actorId) {
    throw new Error("You are not part of this connection");
  }

  if (entry.approvalStatus !== "PENDING") {
    throw new Error("Entry has already been resolved");
  }

  if (
    entry.connection.deletion &&
    entry.connection.deletion.requestedById !== actorId &&
    entry.connection.deletion.acknowledgedById !== actorId
  ) {
    throw new Error(
      "This ledger is read-only because your partner scheduled deletion."
    );
  }

  const creatorSubscriptionActive = await hasActiveCreatorSubscription(
    connection.parentId
  );

  if (!creatorSubscriptionActive) {
    const message =
      connection.parentId === actorId
        ? "Your creator subscription is inactive. Renew it to unlock ledger actions."
        : "Ledger actions are unavailable because the creator subscription is inactive.";
    throw Object.assign(new Error(message), { name: "SubscriptionError" });
  }

  const counterpartyId =
    connection.parentId === actorId ? connection.childId : connection.parentId;

  const pendingEvent = entry.statusEvents.find(
    (event: (typeof entry.statusEvents)[number]) => {
      if (!event.metadata || typeof event.metadata !== "object") {
        return false;
      }
      return (
        (event.metadata as Record<string, unknown>).pendingType !== undefined &&
        event.actorId === entry.createdById
      );
    }
  );

  const pendingMetadata =
    pendingEvent &&
    pendingEvent.metadata &&
    typeof pendingEvent.metadata === "object"
      ? (pendingEvent.metadata as Record<string, unknown>)
      : undefined;
  const pendingType = pendingMetadata?.pendingType as
    | "UPDATE"
    | "DELETE"
    | undefined;

  const previousState = pendingMetadata?.previous as
    | {
        amount?: number;
        notes?: string | null;
        dueDate?: string | null;
        items?: unknown;
      }
    | undefined;

  const pendingReason =
    typeof pendingMetadata?.reason === "string"
      ? pendingMetadata.reason
      : undefined;

  const revertDataFromPrevious = () => {
    const data: Record<string, unknown> = {
      approvalStatus: "ACCEPTED",
    };

    if (!previousState) {
      return data;
    }

    if (typeof previousState.amount === "number") {
      data.amount = previousState.amount;
    }

    if (previousState.notes !== undefined) {
      data.notes = previousState.notes;
    }

    if (previousState.dueDate !== undefined) {
      data.dueDate = previousState.dueDate
        ? new Date(previousState.dueDate)
        : null;
    }

    if (previousState.items !== undefined) {
      data.items = previousState.items ?? null;
    }

    return data;
  };

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (pendingType === "UPDATE") {
      if (decision === "ACCEPT") {
        const previousAmount =
          typeof previousState?.amount === "number"
            ? previousState.amount
            : Number(entry.amount);
        const nextAmount = Number(entry.amount);
        const amountAdjustment = nextAmount - previousAmount;

        if (amountAdjustment !== 0) {
          await applyBalanceAdjustment(
            tx,
            {
              connectionId: entry.connectionId,
              entryType: entry.entryType as LedgerEntryKind,
              amount: nextAmount,
            },
            amountAdjustment,
            nextAmount
          );
        }

        const updatedEntry = await tx.ledgerEntry.update({
          where: { id: entryId },
          data: {
            approvalStatus: "ACCEPTED",
          },
        });

        await tx.ledgerStatusEvent.create({
          data: {
            ledgerEntryId: entryId,
            actorId,
            action: "APPROVED",
            metadata: {
              note,
              pendingType,
            },
          },
        });

        await tx.notification.create({
          data: {
            accountId: counterpartyId,
            channel: "IN_APP",
            type: "LEDGER_DECISION",
            title: "Ledger entry update approved",
            body:
              note ??
              previousState?.notes ??
              "Entry changes accepted and applied to your ledger.",
            payload: {
              connectionId: entry.connectionId,
              ledgerEntryId: entryId,
              decision,
            },
          },
        });

        return updatedEntry;
      }

      const revertedEntry = await tx.ledgerEntry.update({
        where: { id: entryId },
        data: revertDataFromPrevious(),
      });

      await tx.ledgerStatusEvent.create({
        data: {
          ledgerEntryId: entryId,
          actorId,
          action: "DECLINED",
          metadata: {
            note,
            pendingType,
          },
        },
      });

      await tx.notification.create({
        data: {
          accountId: counterpartyId,
          channel: "IN_APP",
          type: "LEDGER_DECISION",
          title: "Ledger entry update declined",
          body:
            note ??
            "The requested entry changes were declined. The original values remain.",
          payload: {
            connectionId: entry.connectionId,
            ledgerEntryId: entryId,
            decision,
          },
        },
      });

      return revertedEntry;
    }

    if (pendingType === "DELETE") {
      if (decision === "ACCEPT") {
        const amountNumber = Number(entry.amount);
        const credit = isCreditEntry(entry.entryType);
        const payment = isPaymentEntry(entry.entryType);

        if (credit || payment) {
          const updateData: Record<string, unknown> = {};

          if (credit) {
            updateData.totalCredit = { decrement: amountNumber };
            updateData.outstanding = { decrement: amountNumber };
          } else if (payment) {
            updateData.totalPayments = { decrement: amountNumber };
            updateData.outstanding = { increment: amountNumber };
          }

          try {
            await tx.connectionBalance.update({
              where: { connectionId: entry.connectionId },
              data: updateData,
            });
          } catch (error) {
            const isMissingRecord =
              typeof error === "object" &&
              error &&
              "code" in error &&
              (error as { code?: string }).code === "P2025";

            if (!isMissingRecord) {
              throw error;
            }
          }
        }

        const removedEntry = await tx.ledgerEntry.update({
          where: { id: entryId },
          data: {
            approvalStatus: "REVOKED",
          },
        });

        await tx.ledgerStatusEvent.create({
          data: {
            ledgerEntryId: entryId,
            actorId,
            action: "APPROVED",
            metadata: {
              note,
              pendingType,
              reason: pendingReason ?? null,
            },
          },
        });

        await tx.notification.create({
          data: {
            accountId: counterpartyId,
            channel: "IN_APP",
            type: "LEDGER_DECISION",
            title: "Ledger entry removal approved",
            body:
              note ?? pendingReason ?? "Entry marked as removed from ledger.",
            payload: {
              connectionId: entry.connectionId,
              ledgerEntryId: entryId,
              decision,
            },
          },
        });

        return removedEntry;
      }

      const restoredEntry = await tx.ledgerEntry.update({
        where: { id: entryId },
        data: {
          approvalStatus: "ACCEPTED",
        },
      });

      await tx.ledgerStatusEvent.create({
        data: {
          ledgerEntryId: entryId,
          actorId,
          action: "DECLINED",
          metadata: {
            note,
            pendingType,
            reason: pendingReason ?? null,
          },
        },
      });

      await tx.notification.create({
        data: {
          accountId: counterpartyId,
          channel: "IN_APP",
          type: "LEDGER_DECISION",
          title: "Ledger entry removal declined",
          body:
            note ??
            "Removal request was declined. The entry remains in the ledger.",
          payload: {
            connectionId: entry.connectionId,
            ledgerEntryId: entryId,
            decision,
          },
        },
      });

      return restoredEntry;
    }

    const statusAction = decision === "ACCEPT" ? "APPROVED" : "DECLINED";

    const updatedEntry = await tx.ledgerEntry.update({
      where: { id: entryId },
      data: {
        approvalStatus: decision === "ACCEPT" ? "ACCEPTED" : "DECLINED",
        notes: note ?? entry.notes,
      },
    });

    await tx.ledgerStatusEvent.create({
      data: {
        ledgerEntryId: entryId,
        actorId,
        action: statusAction,
        metadata: {
          note,
        },
      },
    });

    if (decision === "ACCEPT") {
      const isCredit = entry.entryType === "CREDIT";
      const isPayment =
        entry.entryType === "PAYMENT" || entry.entryType === "ADJUSTMENT";

      if (!isCredit && !isPayment) {
        throw new Error("Cannot accept this entry type yet");
      }

      await tx.connectionBalance.upsert({
        where: { connectionId: entry.connectionId },
        update: {
          totalCredit: isCredit ? { increment: entry.amount } : undefined,
          totalPayments: isPayment ? { increment: entry.amount } : undefined,
          outstanding: isCredit
            ? { increment: entry.amount }
            : isPayment
            ? { decrement: entry.amount }
            : undefined,
        },
        create: {
          connectionId: entry.connectionId,
          totalCredit: isCredit ? Number(entry.amount) : 0,
          totalPayments: isPayment ? Number(entry.amount) : 0,
          outstanding: isCredit
            ? Number(entry.amount)
            : Number(entry.amount) * -1,
        },
      });
    }

    await tx.notification.create({
      data: {
        accountId: counterpartyId,
        channel: "IN_APP",
        type: "LEDGER_DECISION",
        title: `Ledger entry ${
          decision === "ACCEPT" ? "approved" : "declined"
        }`,
        body: note ?? entry.notes ?? "Review and respond to this entry.",
        payload: {
          connectionId: entry.connectionId,
          ledgerEntryId: entryId,
          decision,
        },
      },
    });

    return updatedEntry;
  });
}

interface LedgerEntryUpdateInput {
  amount?: number;
  notes?: string | null;
  dueDate?: Date | null;
  items?: unknown;
}

function isCreditEntry(entryType: LedgerEntryKind) {
  return entryType === "CREDIT";
}

function isPaymentEntry(entryType: LedgerEntryKind) {
  return entryType === "PAYMENT" || entryType === "ADJUSTMENT";
}

async function applyBalanceAdjustment(
  tx: Prisma.TransactionClient,
  entry: {
    connectionId: string;
    entryType: LedgerEntryKind;
    amount: number;
  },
  adjustment: number,
  fallbackAmount: number
) {
  if (adjustment === 0) {
    return;
  }

  const credit = isCreditEntry(entry.entryType);
  const payment = isPaymentEntry(entry.entryType);

  if (!credit && !payment) {
    return;
  }

  const updateData: Record<string, unknown> = {};

  if (credit) {
    updateData.totalCredit = { increment: adjustment };
    updateData.outstanding = { increment: adjustment };
  } else if (payment) {
    updateData.totalPayments = { increment: adjustment };
    updateData.outstanding = { decrement: adjustment };
  }

  try {
    await tx.connectionBalance.update({
      where: { connectionId: entry.connectionId },
      data: updateData,
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      (error as { code?: string }).code === "P2025"
    ) {
      await tx.connectionBalance.create({
        data: {
          connectionId: entry.connectionId,
          totalCredit: credit ? fallbackAmount : 0,
          totalPayments: payment ? fallbackAmount : 0,
          outstanding: credit ? fallbackAmount : fallbackAmount * -1,
        },
      });
    } else {
      throw error;
    }
  }
}

export async function updateLedgerEntry(
  entryId: string,
  actorId: string,
  updates: LedgerEntryUpdateInput
) {
  const entry = await prisma.ledgerEntry.findUnique({
    where: { id: entryId },
    include: {
      connection: {
        include: {
          deletion: true,
        },
      },
    },
  });

  if (!entry) {
    throw new Error("Ledger entry not found");
  }

  if (entry.createdById !== actorId) {
    throw new Error("Only the creator can edit this entry");
  }

  if (entry.approvalStatus !== "ACCEPTED") {
    throw new Error("Only accepted entries can be edited");
  }

  const deletion = entry.connection.deletion;

  if (
    deletion &&
    deletion.requestedById !== actorId &&
    deletion.acknowledgedById !== actorId
  ) {
    throw new Error(
      "This ledger is read-only because your partner scheduled deletion."
    );
  }

  const creatorSubscriptionActive = await hasActiveCreatorSubscription(
    entry.connection.parentId
  );

  if (!creatorSubscriptionActive) {
    throw Object.assign(
      new Error(
        "Your creator subscription is inactive. Renew it to update ledger entries."
      ),
      { name: "SubscriptionError" }
    );
  }

  const previousAmount = Number(entry.amount);
  const previousState = {
    amount: previousAmount,
    notes: entry.notes ?? null,
    dueDate: entry.dueDate ? entry.dueDate.toISOString() : null,
    items: entry.items ?? null,
  };

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const data: Record<string, unknown> = {};

    if (updates.amount !== undefined) {
      data.amount = updates.amount;
    }

    if (updates.notes !== undefined) {
      data.notes = updates.notes ?? null;
    }

    if (updates.dueDate !== undefined) {
      data.dueDate = updates.dueDate ?? null;
    }

    if (updates.items !== undefined) {
      data.items = updates.items;
    }

    const updated = await tx.ledgerEntry.update({
      where: { id: entry.id },
      data: {
        ...data,
        approvalStatus: "PENDING",
      },
    });

    const changes: Record<string, unknown> = {};

    if (updates.amount !== undefined && updates.amount !== previousAmount) {
      changes.amount = {
        from: previousAmount,
        to: updates.amount,
      };
    }

    if (updates.notes !== undefined && updates.notes !== previousState.notes) {
      changes.notes = {
        from: previousState.notes,
        to: updates.notes,
      };
    }

    const nextDueDateIso =
      updates.dueDate === undefined
        ? previousState.dueDate
        : updates.dueDate
        ? updates.dueDate.toISOString()
        : null;

    if (
      updates.dueDate !== undefined &&
      nextDueDateIso !== previousState.dueDate
    ) {
      changes.dueDate = {
        from: previousState.dueDate,
        to: nextDueDateIso,
      };
    }

    if (updates.items !== undefined && updates.items !== previousState.items) {
      changes.items = {
        from: previousState.items,
        to: updates.items,
      };
    }

    if (Object.keys(changes).length === 0) {
      throw new Error("No changes detected");
    }

    const normalizedMetadata = normalizeJsonValue({
      previous: previousState,
      changes,
      pendingType: "UPDATE",
    });

    const metadataPayload =
      normalizedMetadata !== undefined
        ? (normalizedMetadata as Prisma.InputJsonValue)
        : null;

    await tx.ledgerStatusEvent.create({
      data: {
        ledgerEntryId: entry.id,
        actorId,
        action: "UPDATED",
        metadata: metadataPayload ?? Prisma.JsonNull,
      },
    });

    const counterpartyId =
      entry.connection.parentId === actorId
        ? entry.connection.childId
        : entry.connection.parentId;

    await tx.notification.create({
      data: {
        accountId: counterpartyId,
        channel: "IN_APP",
        type: "LEDGER_ACTION",
        title: "Ledger entry update pending",
        body: "A previously accepted entry was updated and needs your review.",
        payload: {
          connectionId: entry.connectionId,
          ledgerEntryId: entry.id,
        },
      },
    });

    return updated;
  });
}

export async function revokeLedgerEntry(
  entryId: string,
  actorId: string,
  reason?: string
) {
  const entry = await prisma.ledgerEntry.findUnique({
    where: { id: entryId },
    include: {
      connection: {
        include: {
          deletion: true,
        },
      },
    },
  });

  if (!entry) {
    throw new Error("Ledger entry not found");
  }

  if (entry.createdById !== actorId) {
    throw new Error("Only the creator can delete this entry");
  }

  if (entry.approvalStatus === "REVOKED") {
    throw new Error("Entry already removed");
  }

  if (entry.approvalStatus === "PENDING") {
    throw new Error("This entry already has a pending action");
  }

  const deletion = entry.connection.deletion;

  if (
    deletion &&
    deletion.requestedById !== actorId &&
    deletion.acknowledgedById !== actorId
  ) {
    throw new Error(
      "This ledger is read-only because your partner scheduled deletion."
    );
  }

  const creatorSubscriptionActive = await hasActiveCreatorSubscription(
    entry.connection.parentId
  );

  if (!creatorSubscriptionActive) {
    throw Object.assign(
      new Error(
        "Your creator subscription is inactive. Renew it to update ledger entries."
      ),
      { name: "SubscriptionError" }
    );
  }

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const removed = await tx.ledgerEntry.update({
      where: { id: entry.id },
      data: {
        approvalStatus: "PENDING",
      },
    });

    await tx.ledgerStatusEvent.create({
      data: {
        ledgerEntryId: entry.id,
        actorId,
        action: "REVOKED",
        metadata: {
          pendingType: "DELETE",
          reason: reason ?? null,
        },
      },
    });

    const counterpartyId =
      entry.connection.parentId === actorId
        ? entry.connection.childId
        : entry.connection.parentId;

    await tx.notification.create({
      data: {
        accountId: counterpartyId,
        channel: "IN_APP",
        type: "LEDGER_ACTION",
        title: "Ledger entry removal requested",
        body:
          reason ?? "A previously accepted entry was requested for removal.",
        payload: {
          connectionId: entry.connectionId,
          ledgerEntryId: entry.id,
        },
      },
    });

    return removed;
  });
}

export async function getLedgerEntries(connectionId: string, actorId: string) {
  const [connection, user] = await Promise.all([
    prisma.connection.findUnique({
      where: { id: connectionId },
      select: {
        id: true,
        parentId: true,
        childId: true,
        status: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: actorId },
      select: { status: true },
    }),
  ]);

  if (!user) {
    throw new Error("Account not found");
  }

  if (!connection) {
    throw new Error("Connection not found");
  }

  const isParent = connection.parentId === actorId;
  const isChild = connection.childId === actorId;

  if (!isParent && !isChild) {
    throw new Error("You are not allowed to view this ledger");
  }

  if (connection.status !== "ACTIVE" && !isChild) {
    throw new Error("This ledger is unavailable");
  }

  if (user.status !== "ACTIVE" && !isChild) {
    throw new Error("Your access to this ledger is restricted.");
  }

  if (user.status !== "ACTIVE" && isChild && connection.status !== "ACTIVE") {
    throw new Error("Ledger is not active");
  }

  const creatorSubscriptionActive = await hasActiveCreatorSubscription(
    connection.parentId
  );

  if (!creatorSubscriptionActive) {
    const message = isParent
      ? "Your creator subscription is inactive. Renew it to access this ledger."
      : "This ledger is locked until the creator renews their subscription.";
    throw Object.assign(new Error(message), { name: "SubscriptionError" });
  }

  const entries = await prisma.ledgerEntry.findMany({
    where: { connectionId },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { id: true, name: true } },
      statusEvents: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          action: true,
          metadata: true,
          createdAt: true,
          actor: { select: { id: true, name: true } },
        },
      },
    },
  });

  return entries;
}

export type LedgerEntryRecord = Awaited<
  ReturnType<typeof getLedgerEntries>
> extends Array<infer Entry>
  ? Entry
  : never;
