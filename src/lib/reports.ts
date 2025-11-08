import { prisma } from "@/lib/prisma";
import type { LedgerEntryKind } from "@/lib/ledger";

const CSV_TIME_ZONE =
  process.env.LEDGER_EXPORT_TIME_ZONE ??
  process.env.NEXT_PUBLIC_LEDGER_EXPORT_TIME_ZONE ??
  process.env.TZ ??
  Intl.DateTimeFormat().resolvedOptions().timeZone ??
  "UTC";

export interface LedgerSummaryOptions {
  month?: string;
  start?: string;
  end?: string;
}

export interface LedgerEntrySummary {
  id: string;
  entryType: LedgerEntryKind;
  amount: number;
  notes: string | null;
  createdAt: Date;
  createdByName: string | null;
  approvalStatus: string;
  dueDate: Date | null;
  itemsLabel: string | null;
  historySummary: string;
}

export interface SerializedLedgerEntrySummary {
  id: string;
  entryType: LedgerEntryKind;
  amount: number;
  notes: string | null;
  createdAt: string;
  createdByName: string | null;
  approvalStatus: string;
  dueDate: string | null;
  itemsLabel: string | null;
  historySummary: string;
}

export interface MonthlyLedgerTotals {
  totalCredit: number;
  totalPayments: number;
  outstanding: number;
  periodStart: Date;
  periodEnd: Date;
}

export interface MonthlyLedgerSummary {
  connection: {
    id: string;
    parent: { id: string; name: string | null };
    child: { id: string; name: string | null };
    balance: {
      totalCredit: number;
      totalPayments: number;
      outstanding: number;
    } | null;
  };
  totals: MonthlyLedgerTotals;
  entries: SerializedLedgerEntrySummary[];
  csv: string;
  csvFilename: string;
}

export async function getMonthlyLedgerSummary(
  connectionId: string,
  actorId: string,
  options?: LedgerSummaryOptions
): Promise<MonthlyLedgerSummary> {
  const { start, end } = resolveLedgerRange(options);

  const connectionRecord = await prisma.connection.findFirst({
    where: {
      id: connectionId,
      OR: [{ parentId: actorId }, { childId: actorId }],
    },
    select: {
      id: true,
      parent: { select: { id: true, name: true } },
      child: { select: { id: true, name: true } },
      balance: {
        select: {
          totalCredit: true,
          totalPayments: true,
          outstanding: true,
        },
      },
    },
  });

  if (!connectionRecord) {
    throw new Error("Connection not found");
  }

  const entryRecords = await prisma.ledgerEntry.findMany({
    where: {
      connectionId,
      createdAt: {
        gte: start,
        lte: end,
      },
      approvalStatus: "ACCEPTED",
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      entryType: true,
      amount: true,
      notes: true,
      createdAt: true,
      approvalStatus: true,
      dueDate: true,
      items: true,
      createdBy: {
        select: {
          name: true,
        },
      },
      statusEvents: {
        orderBy: { createdAt: "asc" },
        select: {
          action: true,
          metadata: true,
          createdAt: true,
          actor: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  type RawLedgerEntry = (typeof entryRecords)[number];

  const detailedEntries: LedgerEntrySummary[] = entryRecords.map(
    (entry: RawLedgerEntry) => ({
      id: entry.id,
      entryType: entry.entryType,
      amount: Number(entry.amount),
      notes: entry.notes ?? null,
      createdAt: entry.createdAt,
      createdByName: entry.createdBy?.name ?? null,
      approvalStatus: entry.approvalStatus,
      dueDate: entry.dueDate ?? null,
      itemsLabel: formatItemLabel(entry.items) ?? null,
      historySummary: formatHistorySummary(entry.statusEvents, entry.items),
    })
  );

  const aggregateTotals = detailedEntries.reduce(
    (acc, entry) => {
      if (entry.entryType === "CREDIT") {
        acc.totalCredit += entry.amount;
      } else {
        acc.totalPayments += entry.amount;
      }
      return acc;
    },
    { totalCredit: 0, totalPayments: 0 }
  );

  const outstanding =
    aggregateTotals.totalCredit - aggregateTotals.totalPayments;

  const responseEntries: SerializedLedgerEntrySummary[] = detailedEntries.map(
    (entry) => ({
      id: entry.id,
      entryType: entry.entryType,
      amount: entry.amount,
      notes: entry.notes,
      createdAt: formatTimestampForCsv(entry.createdAt),
      createdByName: entry.createdByName,
      approvalStatus: entry.approvalStatus,
      dueDate: entry.dueDate ? formatTimestampForCsv(entry.dueDate) : null,
      itemsLabel: entry.itemsLabel,
      historySummary: entry.historySummary,
    })
  );

  const connectionLabel = [
    connectionRecord.parent.name ?? connectionRecord.parent.id,
    "<->",
    connectionRecord.child.name ?? connectionRecord.child.id,
  ].join(" ");

  const periodLabel = `${start.toISOString().slice(0, 10)} → ${end
    .toISOString()
    .slice(0, 10)}`;

  const csvLines = [
    ["Connection", connectionLabel],
    ["Period", periodLabel],
    [],
    [
      // "Entry ID",
      "Type",
      "Amount",
      "Notes",
      "Created At",
      "Created By",
      "Approval Status",
      // "Due Date",
      "Items",
      "History",
    ],
    ...detailedEntries.map((entry) => [
      // entry.id,
      entry.entryType,
      entry.amount.toFixed(2),
      entry.notes ?? "",
      formatTimestampForCsv(entry.createdAt),
      entry.createdByName ?? "",
      entry.approvalStatus,
      // entry.dueDate ? formatTimestampForCsv(entry.dueDate) : "",
      entry.itemsLabel ?? "",
      entry.historySummary || "",
    ]),
  ];

  const csv = csvLines.map((line) => line.map(escapeCsv).join(",")).join("\n");

  return {
    connection: {
      id: connectionRecord.id,
      parent: {
        id: connectionRecord.parent.id,
        name: connectionRecord.parent.name,
      },
      child: {
        id: connectionRecord.child.id,
        name: connectionRecord.child.name,
      },
      balance: connectionRecord.balance
        ? {
            totalCredit: Number(connectionRecord.balance.totalCredit),
            totalPayments: Number(connectionRecord.balance.totalPayments),
            outstanding: Number(connectionRecord.balance.outstanding),
          }
        : null,
    },
    totals: {
      totalCredit: aggregateTotals.totalCredit,
      totalPayments: aggregateTotals.totalPayments,
      outstanding,
      periodStart: start,
      periodEnd: end,
    },
    entries: responseEntries,
    csv,
    csvFilename: `ledger-${connectionId}-${start
      .toISOString()
      .slice(0, 10)}-${end.toISOString().slice(0, 10)}.csv`,
  };
}

export function resolveLedgerRange(options?: LedgerSummaryOptions) {
  if (options?.start || options?.end) {
    if (!options.start || !options.end) {
      throw new Error("Provide both start and end dates.");
    }

    const startDate = parseDateOnly(options.start);
    const endDate = parseDateOnly(options.end);

    if (!startDate || !endDate) {
      throw new Error("Provide valid start and end dates.");
    }

    const start = startOfDayUtc(startDate);
    const end = endOfDayUtc(endDate);

    if (start.getTime() > end.getTime()) {
      throw new Error("Start date must be before end date.");
    }

    return { start, end };
  }

  return resolveMonthRange(options?.month);
}

export function resolveMonthRange(monthIso?: string) {
  const reference = monthIso ? new Date(monthIso) : new Date();
  const year = reference.getUTCFullYear();
  const month = reference.getUTCMonth();

  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

  return { start, end };
}

export function escapeCsv(value: string | number): string {
  const stringValue = String(value ?? "");
  if (/[,"\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateOnly(value: string): Date | null {
  const match = DATE_ONLY_PATTERN.exec(value.trim());
  if (!match) {
    return null;
  }

  const [, yearString, monthString, dayString] = match;
  const year = Number(yearString);
  const month = Number(monthString) - 1;
  const day = Number(dayString);

  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return null;
  }

  const date = new Date(Date.UTC(year, month, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function startOfDayUtc(date: Date) {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      0,
      0,
      0
    )
  );
}

function endOfDayUtc(date: Date) {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999
    )
  );
}

type RawStatusEvent = {
  action: string;
  metadata: unknown;
  createdAt: Date;
  actor: { name: string | null } | null;
};

function formatTimestampForCsv(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: CSV_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });

  const parts = formatter.formatToParts(date);
  const find = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const base = `${find("year")}-${find("month")}-${find("day")} ${find(
    "hour"
  )}:${find("minute")}:${find("second")}`;
  const zone = find("timeZoneName")
    .replace(/[\u00a0\u202f]+/g, " ")
    .trim();
  return zone ? `${base} ${zone}` : base;
}

function formatHistorySummary(
  events: RawStatusEvent[],
  entryItems: unknown
): string {
  if (!events.length) {
    return "";
  }

  return events
    .map((event) => {
      const actorName = event.actor?.name ?? "Unknown";
      const timestamp = formatTimestampForCsv(event.createdAt);
      const { title, description } = describeStatusEvent(event, entryItems);
      const detail = description ? ` (${description})` : "";
      return `${timestamp} - ${title} by ${actorName}${detail}`;
    })
    .join("\n");
}

function formatItemLabel(items: unknown): string | null {
  const { productName, quantity } = extractItemDetails(items);
  const parts = [] as string[];

  if (productName) {
    parts.push(productName);
  }

  if (quantity) {
    parts.push(`Qty ${quantity}`);
  }

  return parts.length > 0 ? parts.join(" • ") : null;
}

function extractItemDetails(items: unknown): {
  productName: string;
  quantity: string;
} {
  if (!items || typeof items !== "object" || Array.isArray(items)) {
    return { productName: "", quantity: "" };
  }

  const record = items as Record<string, unknown>;
  return {
    productName:
      typeof record.productName === "string" ? record.productName.trim() : "",
    quantity: typeof record.quantity === "string" ? record.quantity.trim() : "",
  };
}

function getMetadataRecord(
  metadata: unknown
): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }
  return metadata as Record<string, unknown>;
}

function formatActionLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function summarizeUpdateEvent(event?: RawStatusEvent): string | null {
  if (!event) {
    return null;
  }

  const metadata = getMetadataRecord(event.metadata);
  if (!metadata) {
    return null;
  }

  const changes = getMetadataRecord(metadata.changes);
  if (!changes) {
    return "Updated";
  }

  const parts: string[] = [];

  const amountChange = getMetadataRecord(changes.amount);
  if (amountChange) {
    const fromValue = toNumber(amountChange.from);
    const toValue = toNumber(amountChange.to);

    if (
      Number.isFinite(fromValue) &&
      Number.isFinite(toValue) &&
      fromValue !== toValue
    ) {
      parts.push(
        `amount ${Number(fromValue).toFixed(2)} → ${Number(toValue).toFixed(2)}`
      );
    }
  }

  const dueDateChange = getMetadataRecord(changes.dueDate);
  if (dueDateChange) {
    const formatLabel = (value: unknown) => {
      if (!value) {
        return "none";
      }
      const asString = String(value);
      const date = new Date(asString);
      if (Number.isNaN(date.getTime())) {
        return "none";
      }
      return date.toISOString().slice(0, 10);
    };

    const fromLabel = formatLabel(dueDateChange.from);
    const toLabel = formatLabel(dueDateChange.to);

    if (fromLabel !== toLabel) {
      parts.push(`due date ${fromLabel} → ${toLabel}`);
    }
  }

  const notesChange = getMetadataRecord(changes.notes);
  if (notesChange) {
    const from = typeof notesChange.from === "string" ? notesChange.from : "";
    const to = typeof notesChange.to === "string" ? notesChange.to : "";

    if (from !== to) {
      parts.push("notes updated");
    }
  }

  const itemsChange = getMetadataRecord(changes.items);
  if (itemsChange) {
    const fromLabel = formatItemLabel(itemsChange.from);
    const toLabel = formatItemLabel(itemsChange.to);
    const fromDisplay = fromLabel ?? "—";
    const toDisplay = toLabel ?? "—";

    if (fromDisplay !== toDisplay) {
      parts.push(`items ${fromDisplay} → ${toDisplay}`);
    }
  }

  if (parts.length === 0) {
    return "Updated";
  }

  return `Updated (${parts.join(", ")})`;
}

function describeStatusEvent(
  event: RawStatusEvent,
  baseEntryItems: unknown
): { title: string; description: string | null } {
  const metadata = getMetadataRecord(event.metadata);
  const note =
    metadata && typeof metadata.note === "string" ? metadata.note : undefined;
  const reason =
    metadata && typeof metadata.reason === "string"
      ? metadata.reason
      : undefined;
  const pendingType =
    metadata && typeof metadata.pendingType === "string"
      ? (metadata.pendingType as "UPDATE" | "DELETE")
      : undefined;
  const metadataItems =
    metadata && Object.prototype.hasOwnProperty.call(metadata, "items")
      ? (metadata["items"] as unknown)
      : undefined;

  const parts: string[] = [];
  const push = (value?: string | null) => {
    if (value && value.trim().length > 0) {
      parts.push(value.trim());
    }
  };

  switch (event.action) {
    case "CREATED": {
      if (
        metadata &&
        typeof metadata.entryType === "string" &&
        metadata.entryType.length > 0
      ) {
        push(`Type: ${metadata.entryType}`);
      }
      const itemLabel = formatItemLabel(
        metadataItems ?? baseEntryItems ?? undefined
      );
      if (itemLabel) {
        push(`Items: ${itemLabel}`);
      }
      push(note);
      return {
        title: "Entry created",
        description: parts.length > 0 ? parts.join(" • ") : null,
      };
    }
    case "UPDATED": {
      const summary = summarizeUpdateEvent(event);
      push(summary ?? "Changes submitted for review");
      push(note);
      return {
        title: "Update requested",
        description: parts.length > 0 ? parts.join(" • ") : null,
      };
    }
    case "REVOKED": {
      push(reason ?? "Removal requested");
      return {
        title: "Removal requested",
        description: parts.length > 0 ? parts.join(" • ") : null,
      };
    }
    case "APPROVED": {
      if (pendingType === "UPDATE") {
        push(note ?? "Changes accepted");
        return {
          title: "Update approved",
          description: parts.length > 0 ? parts.join(" • ") : null,
        };
      }
      if (pendingType === "DELETE") {
        push(note ?? reason ?? "Removal accepted");
        return {
          title: "Removal approved",
          description: parts.length > 0 ? parts.join(" • ") : null,
        };
      }
      push(note ?? "Entry approved");
      return {
        title: "Entry approved",
        description: parts.length > 0 ? parts.join(" • ") : null,
      };
    }
    case "DECLINED": {
      if (pendingType === "UPDATE") {
        push(note ?? "Changes declined");
        return {
          title: "Update declined",
          description: parts.length > 0 ? parts.join(" • ") : null,
        };
      }
      if (pendingType === "DELETE") {
        push(note ?? reason ?? "Removal declined");
        return {
          title: "Removal declined",
          description: parts.length > 0 ? parts.join(" • ") : null,
        };
      }
      push(note ?? "Entry declined");
      return {
        title: "Entry declined",
        description: parts.length > 0 ? parts.join(" • ") : null,
      };
    }
    default: {
      push(note ?? reason ?? undefined);
      return {
        title: formatActionLabel(event.action),
        description: parts.length > 0 ? parts.join(" • ") : null,
      };
    }
  }
}

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? NaN : parsed;
  }

  return NaN;
}
