"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Globe2,
  Loader2,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { signOut } from "next-auth/react";

import type {
  AdminNetworkConnectionSummary,
  AdminNetworkLedgerEntrySummary,
  AdminNetworkLedgerStatusEventSummary,
  AdminNetworkUserNode,
  AdminUserSummary,
  PendingConnectionDeletionSummary,
} from "@/lib/admin";
import type { SessionUser } from "@/lib/auth/session";
import {
  activateCreatorSubscription,
  revokeCreatorSubscription,
  getAdminUsers,
  getAdminNetworkOverview,
  getPendingConnectionDeletions,
  restoreConnectionDeletionRequest,
  updateAdminUserStatus,
  updateAdminManagedUser,
  deleteAdminManagedUser,
} from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface AdminDashboardProps {
  initialUsers: AdminUserSummary[];
  adminProfile: SessionUser;
  initialDeletions?: PendingConnectionDeletionSummary[];
  adminAccount?: AdminUserSummary | null;
}

type SubscriptionFormState = {
  plan: "CREATOR_BASIC" | "CREATOR_PRO";
  durationDays: string;
};

const STATUS_OPTIONS: Array<{
  value: "ACTIVE" | "DEACTIVATED" | "SUSPENDED";
  label: string;
}> = [
  { value: "ACTIVE", label: "Active" },
  { value: "DEACTIVATED", label: "Deactivated" },
  { value: "SUSPENDED", label: "Suspended" },
];

const CONNECTION_STATUS_VARIANT: Record<
  "ACTIVE" | "PENDING" | "BLOCKED" | "ARCHIVED",
  "default" | "secondary" | "destructive" | "muted"
> = {
  ACTIVE: "default",
  PENDING: "secondary",
  BLOCKED: "destructive",
  ARCHIVED: "muted",
};

const DAY_MS = 1000 * 60 * 60 * 24;
const HOUR_MS = 1000 * 60 * 60;

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "PKR",
  minimumFractionDigits: 2,
});

function formatAmountForDisplay(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return currencyFormatter.format(value);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return "—";
  }
  return new Date(timestamp).toLocaleString();
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return value ? String(value) : "";
  }
}

function extractLedgerItemDetails(items: unknown): {
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

function formatLedgerItemLabel(items: unknown): string | undefined {
  const { productName, quantity } = extractLedgerItemDetails(items);
  const parts: string[] = [];

  if (productName) {
    parts.push(productName);
  }

  if (quantity) {
    parts.push(`Qty ${quantity}`);
  }

  return parts.length > 0 ? parts.join(" • ") : undefined;
}

function getMetadataRecord(
  metadata: unknown
): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }

  return metadata as Record<string, unknown>;
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

function formatHistoryActionLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function summarizeLedgerUpdateEvent(
  event?: AdminNetworkLedgerStatusEventSummary
): string | null {
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
      return date.toLocaleDateString();
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
    const fromLabel = formatLedgerItemLabel(itemsChange.from);
    const toLabel = formatLedgerItemLabel(itemsChange.to);
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

// Mirrors the customer dashboard history formatter so admins see full change context.
function describeLedgerStatusEvent(
  event: AdminNetworkLedgerStatusEventSummary,
  entry: AdminNetworkLedgerEntrySummary
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
      const itemLabel = formatLedgerItemLabel(
        metadataItems ?? entry.items ?? undefined
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
      const summary = summarizeLedgerUpdateEvent(event);
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
        title: formatHistoryActionLabel(event.action),
        description: parts.length > 0 ? parts.join(" • ") : null,
      };
    }
  }
}

function describeRemaining(expiresAt: string): string {
  const deadline = new Date(expiresAt);
  const timestamp = deadline.getTime();

  if (!Number.isFinite(timestamp)) {
    return "Unknown";
  }

  const diff = timestamp - Date.now();

  if (diff <= 0) {
    return "Expired";
  }

  const days = Math.floor(diff / DAY_MS);

  if (days >= 1) {
    return `${days} day${days === 1 ? "" : "s"} remaining`;
  }

  const hours = Math.ceil(diff / HOUR_MS);
  return `${hours} hour${hours === 1 ? "" : "s"} remaining`;
}

const MANAGE_EMAIL_REGEX =
  /^(?:[a-zA-Z0-9_'^&/+-])+(?:\.(?:[a-zA-Z0-9_'^&/+-])+)*@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
const MANAGE_PHONE_REGEX = /^[0-9+\-\s]{7,15}$/;

type UserEditFormState = {
  name: string;
  email: string;
  phone: string;
  status: "ACTIVE" | "DEACTIVATED" | "SUSPENDED";
  password: string;
};

type UserEditFormErrors = {
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
};

function normalizeManageStatus(
  status: string
): "ACTIVE" | "DEACTIVATED" | "SUSPENDED" {
  return status === "DEACTIVATED" || status === "SUSPENDED" ? status : "ACTIVE";
}

function toEditFormState(
  user: AdminUserSummary | null
): UserEditFormState | null {
  if (!user) {
    return null;
  }

  return {
    name: user.name ?? "",
    email: user.email ?? "",
    phone: user.phone ?? "",
    status: normalizeManageStatus(user.status),
    password: "",
  };
}

function matchesUserQuery(
  user: { name: string | null; email: string | null; phone: string | null },
  query: string
): boolean {
  if (!query.trim()) {
    return true;
  }

  const normalized = query.trim().toLowerCase();

  return (
    (user.name ?? "").toLowerCase().includes(normalized) ||
    (user.email ?? "").toLowerCase().includes(normalized) ||
    (user.phone ?? "").toLowerCase().includes(normalized)
  );
}

export function AdminDashboard({
  initialUsers,
  adminProfile,
  initialDeletions = [],
  adminAccount,
}: AdminDashboardProps) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [subscriptionForms, setSubscriptionForms] = useState<
    Record<string, SubscriptionFormState>
  >({});
  const [isSigningOut, startSignOut] = useTransition();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(() => {
    const firstManaged = initialUsers.find((user) => !user.isAdmin);
    return firstManaged ? firstManaged.id : null;
  });
  const [editForm, setEditForm] = useState<UserEditFormState | null>(() =>
    toEditFormState(initialUsers.find((user) => !user.isAdmin) ?? null)
  );
  const [editErrors, setEditErrors] = useState<UserEditFormErrors>({});
  const [manageFeedback, setManageFeedback] = useState<string | null>(null);
  const [showManagePassword, setShowManagePassword] = useState(false);
  const [networkFilter, setNetworkFilter] = useState("");
  const [selectedNetworkUserId, setSelectedNetworkUserId] = useState<
    string | null
  >(null);
  const [networkCollapsedSections, setNetworkCollapsedSections] = useState({
    downstream: false,
    upstream: false,
  });
  const [collapsedConnections, setCollapsedConnections] = useState<
    Record<string, boolean>
  >({});

  const toggleConnectionCollapse = (connectionId: string) => {
    setCollapsedConnections((previous) => {
      const next = { ...previous };
      if (next[connectionId]) {
        delete next[connectionId];
      } else {
        next[connectionId] = true;
      }
      return next;
    });
  };

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: getAdminUsers,
    initialData: { users: initialUsers },
  });

  const deletionsQuery = useQuery({
    queryKey: ["admin-connection-deletions"],
    queryFn: getPendingConnectionDeletions,
    initialData: { deletions: initialDeletions },
  });

  const networkQuery = useQuery({
    queryKey: ["admin-network-overview"],
    queryFn: getAdminNetworkOverview,
    staleTime: 60 * 1000,
  });

  const usersResponse = usersQuery.data?.users ?? initialUsers;
  const managedUsers = usersResponse.filter((user) => !user.isAdmin);
  const pendingDeletions = deletionsQuery.data?.deletions ?? initialDeletions;
  const networkOverview = networkQuery.data ?? null;
  const visibleNetworkUsers = useMemo<AdminNetworkUserNode[]>(() => {
    if (!networkOverview) {
      return [];
    }

    return networkOverview.users.filter(
      (user) => !user.isAdmin && user.id !== adminProfile.id
    );
  }, [networkOverview, adminProfile.id]);
  const filteredNetworkUsers = useMemo<AdminNetworkUserNode[]>(() => {
    if (visibleNetworkUsers.length === 0) {
      return [];
    }

    return visibleNetworkUsers.filter((user) =>
      matchesUserQuery(user, networkFilter)
    );
  }, [visibleNetworkUsers, networkFilter]);

  useEffect(() => {
    if (!networkOverview) {
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (filteredNetworkUsers.length === 0) {
      if (selectedNetworkUserId !== null) {
        timeoutId = setTimeout(() => {
          setSelectedNetworkUserId(null);
        }, 0);
      }
    } else {
      const hasSelection = filteredNetworkUsers.some(
        (user) => user.id === selectedNetworkUserId
      );

      if (!hasSelection) {
        const nextId = filteredNetworkUsers[0]?.id ?? null;
        if (nextId !== null) {
          timeoutId = setTimeout(() => {
            setSelectedNetworkUserId(nextId);
          }, 0);
        }
      }
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [networkOverview, filteredNetworkUsers, selectedNetworkUserId]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setNetworkCollapsedSections({ downstream: false, upstream: false });
      setCollapsedConnections({});
    }, 0);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [selectedNetworkUserId]);

  const selectedNetworkUser: AdminNetworkUserNode | null = selectedNetworkUserId
    ? filteredNetworkUsers.find((user) => user.id === selectedNetworkUserId) ??
      visibleNetworkUsers.find((user) => user.id === selectedNetworkUserId) ??
      null
    : null;

  useEffect(() => {
    if (!selectedNetworkUser) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setCollapsedConnections((previous) => {
        const allowedIds = new Set([
          ...selectedNetworkUser.downstreamConnections.map(
            (connection) => connection.id
          ),
          ...selectedNetworkUser.upstreamConnections.map(
            (connection) => connection.id
          ),
        ]);

        const next: Record<string, boolean> = {};
        for (const [connectionId, isCollapsed] of Object.entries(previous)) {
          if (allowedIds.has(connectionId) && isCollapsed) {
            next[connectionId] = true;
          }
        }
        return next;
      });
    }, 0);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [selectedNetworkUser]);

  const networkTotals = useMemo(() => {
    if (!networkOverview) {
      return null;
    }

    return {
      userCount: visibleNetworkUsers.length,
      connectionCount: networkOverview.totals.connectionCount,
      ledgerEntryCount: networkOverview.totals.ledgerEntryCount,
    };
  }, [networkOverview, visibleNetworkUsers]);

  const selectedNetworkTotals = useMemo(() => {
    if (!selectedNetworkUser) {
      return null;
    }

    const connections = [
      ...selectedNetworkUser.downstreamConnections,
      ...selectedNetworkUser.upstreamConnections,
    ];

    return connections.reduce(
      (acc, connection) => {
        acc.outstanding += connection.balance?.outstanding ?? 0;
        acc.credit += connection.balance?.totalCredit ?? 0;
        acc.payments += connection.balance?.totalPayments ?? 0;
        return acc;
      },
      { outstanding: 0, credit: 0, payments: 0 }
    );
  }, [selectedNetworkUser]);

  const renderConnectionSection = (
    connections: AdminNetworkConnectionSummary[],
    perspective: "downstream" | "upstream",
    collapsed: boolean
  ): ReactNode => {
    if (connections.length === 0) {
      const label = perspective === "downstream" ? "downstream" : "upstream";
      return (
        <div className="rounded-md border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
          No {label} connections recorded.
        </div>
      );
    }

    if (collapsed) {
      return (
        <div className="rounded-md border border-dashed border-border/70 p-4 text-xs text-muted-foreground">
          Section collapsed. Expand to audit ledger activity.
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {connections.map((connection) => {
          const counterpart =
            perspective === "downstream" ? connection.child : connection.parent;
          const alias =
            perspective === "downstream"
              ? connection.parentAlias
              : connection.childAlias;
          const outstanding = connection.balance?.outstanding ?? 0;
          const totalCredit = connection.balance?.totalCredit ?? 0;
          const totalPayments = connection.balance?.totalPayments ?? 0;
          const isCollapsed = Boolean(collapsedConnections[connection.id]);

          return (
            <div
              key={connection.id}
              className="rounded-lg border border-border/60 bg-muted/20 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => toggleConnectionCollapse(connection.id)}
                  className="flex flex-1 items-start gap-3 text-left text-sm font-semibold text-foreground transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  {isCollapsed ? (
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <div className="space-y-1">
                    <p>{counterpart.name}</p>
                    <p className="text-xs font-normal text-muted-foreground">
                      {counterpart.email ?? counterpart.phone ?? counterpart.id}
                    </p>
                    {alias ? (
                      <p className="text-xs font-normal text-muted-foreground">
                        Alias: {alias}
                      </p>
                    ) : null}
                  </div>
                </button>
                <Badge
                  variant={
                    CONNECTION_STATUS_VARIANT[connection.status] ?? "secondary"
                  }
                >
                  {connection.status}
                </Badge>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <span>Created {formatDateTime(connection.createdAt)}</span>
                <span>
                  Last activity {formatDateTime(connection.lastActivityAt)}
                </span>
                <span>Outstanding {formatAmountForDisplay(outstanding)}</span>
                <span>
                  Volume {formatAmountForDisplay(totalCredit)} credit /{" "}
                  {formatAmountForDisplay(totalPayments)} payments
                </span>
              </div>
              {isCollapsed ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Ledger history hidden. Expand to review entries.
                </p>
              ) : connection.ledgerEntryCount === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  No ledger activity recorded yet.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {connection.ledgerEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-md border border-border/40 bg-background p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                        <span>{entry.entryType}</span>
                        <span className="text-muted-foreground">
                          {formatAmountForDisplay(entry.amount)}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {entry.approvalStatus}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Created {formatDateTime(entry.createdAt)} by{" "}
                        {entry.createdBy.name ?? entry.createdBy.id}
                      </p>
                      {entry.dueDate ? (
                        <p className="text-xs text-muted-foreground">
                          Due {formatDateTime(entry.dueDate)}
                        </p>
                      ) : null}
                      {entry.notes ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Notes: {entry.notes}
                        </p>
                      ) : null}
                      {entry.items ? (
                        <pre className="mt-2 overflow-x-auto rounded-md bg-muted/60 p-2 text-xs leading-relaxed text-muted-foreground">
                          {formatJson(entry.items)}
                        </pre>
                      ) : null}
                      {entry.history.length > 0 ? (
                        <ul className="mt-3 space-y-2 text-[11px]">
                          {entry.history.map((event) => {
                            const { title, description } =
                              describeLedgerStatusEvent(event, entry);
                            const timestamp = formatDateTime(event.createdAt);
                            const actorName =
                              event.actor.name ?? event.actor.id;

                            return (
                              <li
                                key={event.id}
                                className="rounded-md border border-border/40 bg-background/80 p-2"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-medium text-foreground">
                                    {title}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {timestamp}
                                  </span>
                                </div>
                                <div className="mt-1 text-[10px] text-muted-foreground">
                                  By {actorName}
                                </div>
                                {description ? (
                                  <div className="mt-1 text-[10px] text-muted-foreground">
                                    {description}
                                  </div>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
              {!isCollapsed && connection.deletion ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Deletion pending - request expires{" "}
                  {formatDateTime(connection.deletion.expiresAt)}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  const filteredUsers = managedUsers.filter((user) =>
    matchesUserQuery(user, filter)
  );

  const selectedManagedUser = selectedUserId
    ? managedUsers.find((user) => user.id === selectedUserId) ?? null
    : null;

  const handleFilterChange = (value: string) => {
    setFilter(value);

    const matches = managedUsers.filter((user) =>
      matchesUserQuery(user, value)
    );

    if (matches.length === 0) {
      setSelectedUserId(null);
      setEditForm(null);
      setEditErrors({});
      setManageFeedback(null);
      setShowManagePassword(false);
      return;
    }

    const nextId =
      selectedUserId && matches.some((user) => user.id === selectedUserId)
        ? selectedUserId
        : matches[0].id;

    const nextUser = matches.find((user) => user.id === nextId) ?? null;
    setSelectedUserId(nextId);
    setEditForm(toEditFormState(nextUser));
    setEditErrors({});
    setManageFeedback(null);
    setShowManagePassword(false);
  };

  const handleSelectUser = (userId: string) => {
    const nextUser = managedUsers.find((user) => user.id === userId) ?? null;
    setSelectedUserId(nextUser ? userId : null);
    setEditForm(toEditFormState(nextUser));
    setEditErrors({});
    setManageFeedback(null);
    setShowManagePassword(false);
  };

  const validateManageForm = (state: UserEditFormState): UserEditFormErrors => {
    const nextErrors: UserEditFormErrors = {};
    const name = state.name.trim();
    const email = state.email.trim();
    const phone = state.phone.trim();

    if (!name) {
      nextErrors.name = "Name is required.";
    }

    if (!email) {
      nextErrors.email = "Email is required.";
    } else if (!MANAGE_EMAIL_REGEX.test(email)) {
      nextErrors.email = "Provide a valid email address.";
    }

    if (phone && !MANAGE_PHONE_REGEX.test(phone)) {
      nextErrors.phone = "Provide a valid phone number.";
    }

    if (
      state.password &&
      state.password.length > 0 &&
      state.password.length < 8
    ) {
      nextErrors.password = "Password must be at least 8 characters.";
    }

    return nextErrors;
  };

  const handleFieldChange = (
    field: "name" | "email" | "phone" | "password",
    value: string
  ) => {
    setEditForm((previous) =>
      previous
        ? {
            ...previous,
            [field]: value,
          }
        : previous
    );
    setEditErrors((previous) => ({
      ...previous,
      [field]: undefined,
    }));
    setManageFeedback(null);
  };

  const handleStatusChange = (
    status: "ACTIVE" | "DEACTIVATED" | "SUSPENDED"
  ) => {
    setEditForm((previous) =>
      previous
        ? {
            ...previous,
            status,
          }
        : previous
    );
    setManageFeedback(null);
  };

  const statusMutation = useMutation({
    mutationFn: async ({
      userId,
      status,
    }: {
      userId: string;
      status: "ACTIVE" | "DEACTIVATED" | "SUSPENDED";
    }) => {
      const response = await updateAdminUserStatus(userId, status);
      return response.user;
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(
        ["admin-users"],
        (previous: { users: AdminUserSummary[] } | undefined) => {
          if (!previous) {
            return { users: [updatedUser] };
          }

          return {
            users: previous.users.map((user) =>
              user.id === updatedUser.id ? updatedUser : user
            ),
          };
        }
      );
      setFeedback(
        `Updated ${
          updatedUser.name ?? updatedUser.email ?? "user"
        } to ${updatedUser.status.toLowerCase()}.`
      );
    },
    onError: (error) => {
      setFeedback((error as Error).message ?? "Unable to update user status");
    },
  });

  const subscriptionMutation = useMutation({
    mutationFn: activateCreatorSubscription,
    onMutate: () => setFeedback(null),
    onError: (error) => {
      setFeedback(
        (error as Error).message ?? "Unable to activate subscription."
      );
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      const target =
        managedUsers.find((user) => user.id === variables.ownerId) ??
        initialUsers.find((user) => user.id === variables.ownerId);
      const displayName =
        target?.name ?? target?.email ?? target?.phone ?? "this account";

      setSubscriptionForms((previous) => ({
        ...previous,
        [variables.ownerId]: {
          plan: previous[variables.ownerId]?.plan ?? "CREATOR_BASIC",
          durationDays: "365",
        },
      }));

      const planLabel =
        variables.plan === "CREATOR_PRO" ? "Creator Pro" : "Creator Basic";
      setFeedback(`Activated ${planLabel} for ${displayName}.`);
    },
  });

  const revokeSubscriptionMutation = useMutation({
    mutationFn: revokeCreatorSubscription,
    onMutate: () => setFeedback(null),
    onError: (error) => {
      setFeedback((error as Error).message ?? "Unable to revoke subscription.");
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      const target =
        managedUsers.find((user) => user.id === variables.ownerId) ??
        initialUsers.find((user) => user.id === variables.ownerId);
      const displayName =
        target?.name ?? target?.email ?? target?.phone ?? "this account";

      setFeedback(`Revoked creator subscription for ${displayName}.`);
    },
  });

  const restoreDeletionMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const response = await restoreConnectionDeletionRequest(connectionId);
      return response.connection;
    },
    onSuccess: (connection) => {
      queryClient.invalidateQueries({
        queryKey: ["admin-connection-deletions"],
      });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });

      const parentLabel =
        connection.parentAlias ??
        connection.parent.name ??
        connection.parent.email ??
        "Parent";
      const childLabel =
        connection.childAlias ??
        connection.child.name ??
        connection.child.email ??
        "Child";

      setFeedback(
        `Restored connection between ${parentLabel} and ${childLabel}.`
      );
    },
    onError: (error) => {
      setFeedback((error as Error).message ?? "Unable to restore connection.");
    },
  });

  const manageUpdateMutation = useMutation({
    mutationFn: async ({
      userId,
      payload,
    }: {
      userId: string;
      payload: {
        name: string;
        email: string;
        phone: string | null;
        status: "ACTIVE" | "DEACTIVATED" | "SUSPENDED";
        password?: string;
      };
    }) => {
      const response = await updateAdminManagedUser(userId, payload);
      return response.user;
    },
    onMutate: () => {
      setManageFeedback(null);
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(
        ["admin-users"],
        (previous: { users: AdminUserSummary[] } | undefined) => {
          if (!previous) {
            return { users: [updatedUser] };
          }

          return {
            users: previous.users.map((user) =>
              user.id === updatedUser.id ? updatedUser : user
            ),
          };
        }
      );
      setEditForm(toEditFormState(updatedUser));
      setEditErrors({});
      setShowManagePassword(false);
      setManageFeedback(
        `Updated ${updatedUser.name ?? updatedUser.email ?? "user"} details.`
      );
    },
    onError: (error) => {
      setManageFeedback(
        (error as Error).message ?? "Unable to update user details."
      );
    },
  });

  const manageDeleteMutation = useMutation({
    mutationFn: async ({ userId }: { userId: string; label: string }) => {
      await deleteAdminManagedUser(userId);
      return { userId };
    },
    onMutate: () => {
      setManageFeedback(null);
    },
    onSuccess: (_result, variables) => {
      const removedId = variables.userId;
      queryClient.setQueryData(
        ["admin-users"],
        (previous: { users: AdminUserSummary[] } | undefined) => {
          if (!previous) {
            return { users: [] };
          }

          return {
            users: previous.users.filter((user) => user.id !== removedId),
          };
        }
      );

      setSubscriptionForms((previous) => {
        if (!previous[removedId]) {
          return previous;
        }
        const next = { ...previous };
        delete next[removedId];
        return next;
      });

      const updatedUsers =
        queryClient.getQueryData<{ users: AdminUserSummary[] }>(["admin-users"])
          ?.users ?? [];
      const available = updatedUsers.filter(
        (user) => !user.isAdmin && matchesUserQuery(user, filter)
      );
      const nextUser = available[0] ?? null;

      setSelectedUserId(nextUser ? nextUser.id : null);
      setEditForm(toEditFormState(nextUser));
      setEditErrors({});
      setShowManagePassword(false);
      setManageFeedback(
        `Removed ${variables.label || "the selected user"} from the workspace.`
      );
    },
    onError: (error) => {
      setManageFeedback(
        (error as Error).message ?? "Unable to remove the selected user."
      );
    },
  });

  const handleEditSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedUserId || !editForm) {
      return;
    }

    const draft: UserEditFormState = {
      ...editForm,
      name: editForm.name.trim(),
      email: editForm.email.trim(),
      phone: editForm.phone.trim(),
      status: editForm.status,
      password: editForm.password,
    };

    const errors = validateManageForm(draft);
    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      return;
    }

    setEditErrors({});

    manageUpdateMutation.mutate({
      userId: selectedUserId,
      payload: {
        name: draft.name,
        email: draft.email,
        phone: draft.phone ? draft.phone : null,
        status: draft.status,
        ...(draft.password ? { password: draft.password } : {}),
      },
    });
  };

  const handleDeleteUser = () => {
    if (!selectedUserId || !selectedManagedUser) {
      return;
    }

    const label =
      selectedManagedUser.name ??
      selectedManagedUser.email ??
      selectedManagedUser.phone ??
      "this account";

    const confirmed = window.confirm(
      `Delete ${label}? This action cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    manageDeleteMutation.mutate({
      userId: selectedManagedUser.id,
      label,
    });
  };

  const updateSubscriptionForm = (
    userId: string,
    updates: Partial<SubscriptionFormState>
  ) => {
    setSubscriptionForms((previous) => {
      const existing = previous[userId] ?? {
        plan: "CREATOR_BASIC",
        durationDays: "365",
      };
      return {
        ...previous,
        [userId]: {
          ...existing,
          ...updates,
        },
      };
    });
  };

  const totalManaged = managedUsers.length;
  const adminStatusVariant =
    adminProfile.status === "ACTIVE"
      ? "success"
      : adminProfile.status === "SUSPENDED"
      ? "secondary"
      : "destructive";
  const adminRoleLabel = adminProfile.isAdmin ? "Administrator" : "User";
  const adminPhone = adminAccount?.phone ?? adminProfile.phone ?? null;
  // const adminSubscriptions = adminAccount?.activeSubscriptions ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-2">
          <CardTitle>Administrator profile</CardTitle>
          <CardDescription>
            Signed in with elevated privileges. Keep your credentials secure.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid gap-3 text-sm text-muted-foreground">
            <div>
              <p className="text-xs uppercase tracking-wide">Name</p>
              <p className="text-base text-foreground">
                {adminProfile.name ?? adminProfile.email ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide">Email</p>
              <p className="text-base text-foreground">
                {adminProfile.email ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide">Phone</p>
              <p className="text-base text-foreground">{adminPhone ?? "—"}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <p className="text-xs uppercase tracking-wide">Role</p>
                <Badge variant="secondary">{adminRoleLabel}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-xs uppercase tracking-wide">Status</p>
                <Badge variant={adminStatusVariant}>
                  {adminProfile.status}
                </Badge>
              </div>
            </div>
            {/* <div>
              <p className="text-xs uppercase tracking-wide">Subscriptions</p>
              {adminSubscriptions.length > 0 ? (
                <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                  {adminSubscriptions.map((subscription) => {
                    const planLabel =
                      subscription.plan === "CREATOR_PRO"
                        ? "Creator Pro"
                        : "Creator Basic";
                    const expiresLabel = subscription.expiresAt
                      ? new Date(subscription.expiresAt).toLocaleDateString()
                      : "No expiry";

                    return (
                      <li
                        key={subscription.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/40 bg-muted/30 px-2 py-1"
                      >
                        <span className="font-medium text-foreground">
                          {planLabel}
                        </span>
                        <span className="text-muted-foreground">
                          Expires {expiresLabel}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  No active subscriptions.
                </p>
              )}
            </div> */}
          </div>
          <Button
            type="button"
            variant="secondary"
            className="flex items-center justify-center gap-2 sm:w-auto"
            disabled={isSigningOut}
            onClick={() =>
              startSignOut(async () => {
                await signOut({ callbackUrl: "/sign-in" });
              })
            }
          >
            {isSigningOut ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            <span>{isSigningOut ? "Signing out" : "Sign out"}</span>
          </Button>
        </CardContent>
      </Card>

      {feedback ? (
        <div className="rounded-lg border border-border/70 bg-muted/40 p-3 text-sm text-muted-foreground">
          {feedback}
        </div>
      ) : null}

      <Tabs defaultValue="accounts" className="space-y-6">
        <TabsList className="flex w-full justify-start gap-2 overflow-x-auto">
          <TabsTrigger value="accounts">Subscriptions</TabsTrigger>
          <TabsTrigger value="network">Network monitor</TabsTrigger>
          <TabsTrigger value="manage-users">Manage users</TabsTrigger>
          <TabsTrigger value="deletions">Deletion requests</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="space-y-6">
          <Card>
            <CardHeader className="space-y-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <CardTitle>Admin control center</CardTitle>
              </div>
              <CardDescription>
                Audit account health, manage access, and track subscription
                coverage across the network.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Input
                value={filter}
                onChange={(event) => handleFilterChange(event.target.value)}
                placeholder="Search by name, email, or phone"
                className="sm:max-w-sm"
              />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Total managed</span>
                <Badge variant="secondary">{totalManaged}</Badge>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {usersQuery.isLoading ? (
              <div className="col-span-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 p-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts...
              </div>
            ) : null}

            {filteredUsers.map((user) => {
              const form = subscriptionForms[user.id] ?? {
                plan: "CREATOR_BASIC" as const,
                durationDays: "365",
              };
              const isActivating =
                subscriptionMutation.isPending &&
                subscriptionMutation.variables?.ownerId === user.id;
              const isRevoking =
                revokeSubscriptionMutation.isPending &&
                revokeSubscriptionMutation.variables?.ownerId === user.id;
              const buttonLabel =
                user.activeSubscriptions.length > 0
                  ? "Renew subscription"
                  : "Activate subscription";

              return (
                <Card key={user.id} className="flex flex-col justify-between">
                  <CardHeader className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-lg">
                        {user.name ?? user.email ?? "Unnamed account"}
                      </CardTitle>
                      <Badge
                        variant={
                          user.status === "ACTIVE"
                            ? "success"
                            : user.status === "SUSPENDED"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {user.status}
                      </Badge>
                    </div>
                    <CardDescription className="space-y-1 text-sm">
                      {user.email ? <p>{user.email}</p> : null}
                      {user.phone ? <p>{user.phone}</p> : null}
                      <p>
                        Joined {new Date(user.createdAt).toLocaleDateString()}
                      </p>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                      <Badge variant="secondary">
                        Downstream: {user.downstreamCount}
                      </Badge>
                      <Badge variant="secondary">
                        Upstream: {user.upstreamCount}
                      </Badge>
                      <Badge variant="outline">
                        Subscriptions: {user.activeSubscriptions.length}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <label
                        className="flex items-center gap-2 text-sm text-muted-foreground"
                        htmlFor={`status-${user.id}`}
                      >
                        Status
                      </label>
                      <select
                        id={`status-${user.id}`}
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                        defaultValue={user.status}
                        onChange={(event) =>
                          statusMutation.mutate({
                            userId: user.id,
                            status: event.target.value as
                              | "ACTIVE"
                              | "DEACTIVATED"
                              | "SUSPENDED",
                          })
                        }
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {statusMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                    </div>
                    <div className="space-y-3">
                      {user.activeSubscriptions.length > 0 ? (
                        <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="font-medium text-foreground">
                                Active subscription
                              </p>
                              <ul className="mt-2 space-y-1">
                                {user.activeSubscriptions.map(
                                  (subscription) => (
                                    <li key={subscription.id}>
                                      {subscription.plan} — expires{" "}
                                      {subscription.expiresAt
                                        ? new Date(
                                            subscription.expiresAt
                                          ).toLocaleDateString()
                                        : "N/A"}
                                    </li>
                                  )
                                )}
                              </ul>
                            </div>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              disabled={isRevoking}
                              onClick={() =>
                                revokeSubscriptionMutation.mutate({
                                  ownerId: user.id,
                                })
                              }
                            >
                              {isRevoking ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Revoking...
                                </>
                              ) : (
                                "Revoke access"
                              )}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No active creator subscription. Activate one below to
                          enable downstream invitations.
                        </p>
                      )}
                      <div className="flex flex-wrap items-end gap-3 rounded-md border border-dashed border-border/70 bg-background/40 p-3">
                        <div className="flex flex-col gap-1">
                          <Label
                            htmlFor={`plan-${user.id}`}
                            className="text-xs"
                          >
                            Plan
                          </Label>
                          <select
                            id={`plan-${user.id}`}
                            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                            value={form.plan}
                            onChange={(event) =>
                              updateSubscriptionForm(user.id, {
                                plan: event.target.value as
                                  | "CREATOR_BASIC"
                                  | "CREATOR_PRO",
                              })
                            }
                          >
                            <option value="CREATOR_BASIC">Creator Basic</option>
                            <option value="CREATOR_PRO">Creator Pro</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label
                            htmlFor={`duration-${user.id}`}
                            className="text-xs"
                          >
                            Duration (days)
                          </Label>
                          <Input
                            id={`duration-${user.id}`}
                            type="number"
                            min={30}
                            value={form.durationDays}
                            onChange={(event) =>
                              updateSubscriptionForm(user.id, {
                                durationDays: event.target.value,
                              })
                            }
                            className="w-32"
                          />
                        </div>
                        <Button
                          type="button"
                          disabled={isActivating}
                          onClick={() => {
                            const parsed = Number.parseInt(
                              form.durationDays,
                              10
                            );
                            const normalized =
                              Number.isFinite(parsed) && parsed > 0
                                ? parsed
                                : 365;
                            subscriptionMutation.mutate({
                              ownerId: user.id,
                              plan: form.plan,
                              durationDays: normalized,
                            });
                          }}
                        >
                          {isActivating ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            buttonLabel
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {!usersQuery.isLoading && filteredUsers.length === 0 ? (
              <div className="col-span-full rounded-lg border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                No accounts match your filters.
              </div>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="network" className="space-y-6">
          <Card>
            <CardHeader className="space-y-2">
              <div className="flex items-center gap-2">
                <Globe2 className="h-5 w-5 text-primary" />
                <CardTitle>Network monitor</CardTitle>
              </div>
              <CardDescription>
                Inspect every upstream and downstream ledger across the network.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span>
                  Last synced{" "}
                  {networkOverview
                    ? formatDateTime(networkOverview.generatedAt)
                    : "—"}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => networkQuery.refetch()}
                  disabled={networkQuery.isFetching}
                >
                  {networkQuery.isFetching ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    "Refresh"
                  )}
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Accounts
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {networkTotals ? networkTotals.userCount : "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Connections
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {networkTotals ? networkTotals.connectionCount : "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Ledger entries
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {networkTotals ? networkTotals.ledgerEntryCount : "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <Card>
              <CardHeader className="space-y-2">
                <CardTitle>Accounts</CardTitle>
                <CardDescription>
                  Browse participants and select one to audit their ledgers.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={networkFilter}
                    onChange={(event) => setNetworkFilter(event.target.value)}
                    placeholder="Search by name, email, or phone"
                    className="pl-9"
                  />
                </div>
                <ScrollArea className="h-80">
                  <div className="space-y-2 pr-2">
                    {networkQuery.isLoading ? (
                      <div className="rounded-md border border-dashed border-border/70 p-4 text-center text-sm text-muted-foreground">
                        Loading network graph...
                      </div>
                    ) : filteredNetworkUsers.length === 0 ? (
                      <div className="rounded-md border border-dashed border-border/70 p-4 text-center text-sm text-muted-foreground">
                        No accounts match your filters.
                      </div>
                    ) : (
                      filteredNetworkUsers.map((user) => {
                        const isCurrent = selectedNetworkUserId === user.id;
                        const baseClass =
                          "w-full rounded-md border px-3 py-2 text-left text-sm transition focus:outline-none";
                        const stateClass = isCurrent
                          ? "border-primary bg-primary/10 text-foreground shadow-sm"
                          : "border-border/60 bg-background hover:border-primary/60";

                        return (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => setSelectedNetworkUserId(user.id)}
                            className={`${baseClass} ${stateClass}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">
                                {user.name ?? user.email ?? user.id}
                              </span>
                              <Badge
                                variant={
                                  user.status === "ACTIVE"
                                    ? "success"
                                    : user.status === "SUSPENDED"
                                    ? "secondary"
                                    : "destructive"
                                }
                              >
                                {user.status}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Upstream {user.upstreamCount} | Downstream{" "}
                              {user.downstreamCount}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Ledger entries {user.ledgerEntryCount}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Last activity{" "}
                              {formatDateTime(user.lastActivityAt)}
                            </p>
                          </button>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="min-h-112">
              <CardHeader className="space-y-1">
                <CardTitle>
                  {selectedNetworkUser
                    ? selectedNetworkUser.name ??
                      selectedNetworkUser.email ??
                      selectedNetworkUser.id
                    : "Select an account"}
                </CardTitle>
                <CardDescription>
                  {selectedNetworkUser
                    ? "Full ledger visibility for this account."
                    : "Choose an account to inspect their connections and entries."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {networkQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading ledger activity...
                  </div>
                ) : null}
                {!selectedNetworkUser && !networkQuery.isLoading ? (
                  <div className="rounded-md border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                    Select an account from the list to view their network.
                  </div>
                ) : null}
                {selectedNetworkUser ? (
                  <div className="space-y-6">
                    <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                      <span>Email: {selectedNetworkUser.email ?? "—"}</span>
                      <span>Phone: {selectedNetworkUser.phone ?? "—"}</span>
                      <span>
                        Connections: {selectedNetworkUser.connectionCount}
                      </span>
                      <span>
                        Ledger entries: {selectedNetworkUser.ledgerEntryCount}
                      </span>
                      <span>
                        Last activity:{" "}
                        {formatDateTime(selectedNetworkUser.lastActivityAt)}
                      </span>
                      <span>
                        Outstanding balance:{" "}
                        {formatAmountForDisplay(
                          selectedNetworkTotals?.outstanding ?? 0
                        )}
                      </span>
                      <span>
                        Total credit:{" "}
                        {formatAmountForDisplay(
                          selectedNetworkTotals?.credit ?? 0
                        )}
                      </span>
                      <span>
                        Total payments:{" "}
                        {formatAmountForDisplay(
                          selectedNetworkTotals?.payments ?? 0
                        )}
                      </span>
                    </div>

                    <section className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setNetworkCollapsedSections((previous) => ({
                              ...previous,
                              downstream: !previous.downstream,
                            }))
                          }
                          className="inline-flex items-center gap-2 text-sm font-semibold text-foreground transition hover:text-primary"
                        >
                          {networkCollapsedSections.downstream ? (
                            <ChevronRight className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                          <span>Downstream connections</span>
                        </button>
                        <span className="text-xs text-muted-foreground">
                          {selectedNetworkUser.downstreamCount} linked
                        </span>
                      </div>
                      {renderConnectionSection(
                        selectedNetworkUser.downstreamConnections,
                        "downstream",
                        networkCollapsedSections.downstream
                      )}
                    </section>

                    <section className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setNetworkCollapsedSections((previous) => ({
                              ...previous,
                              upstream: !previous.upstream,
                            }))
                          }
                          className="inline-flex items-center gap-2 text-sm font-semibold text-foreground transition hover:text-primary"
                        >
                          {networkCollapsedSections.upstream ? (
                            <ChevronRight className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                          <span>Upstream connections</span>
                        </button>
                        <span className="text-xs text-muted-foreground">
                          {selectedNetworkUser.upstreamCount} linked
                        </span>
                      </div>
                      {renderConnectionSection(
                        selectedNetworkUser.upstreamConnections,
                        "upstream",
                        networkCollapsedSections.upstream
                      )}
                    </section>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="manage-users" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <Card>
              <CardHeader className="space-y-2">
                <CardTitle>Managed accounts</CardTitle>
                <CardDescription>
                  Search and select a user to edit contact details, credentials,
                  or status.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={filter}
                    onChange={(event) => handleFilterChange(event.target.value)}
                    placeholder="Search by name, email, or phone"
                    className="pl-9"
                  />
                </div>
                <ScrollArea className="h-80">
                  <div className="space-y-2 pr-2">
                    {filteredUsers.length === 0 ? (
                      <div className="rounded-md border border-dashed border-border/70 p-4 text-center text-sm text-muted-foreground">
                        No accounts match your filters.
                      </div>
                    ) : (
                      filteredUsers.map((user) => {
                        const isCurrent = selectedUserId === user.id;
                        const baseClass =
                          "w-full rounded-md border px-3 py-2 text-left text-sm transition focus:outline-none";
                        const stateClass = isCurrent
                          ? "border-primary bg-primary/10 text-foreground shadow-sm"
                          : "border-border/60 bg-background hover:border-primary/60";

                        return (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => handleSelectUser(user.id)}
                            className={`${baseClass} ${stateClass}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">
                                {user.name ?? user.email ?? "Unnamed account"}
                              </span>
                              <Badge
                                variant={
                                  user.status === "ACTIVE"
                                    ? "success"
                                    : user.status === "SUSPENDED"
                                    ? "secondary"
                                    : "destructive"
                                }
                              >
                                {user.status}
                              </Badge>
                            </div>
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {user.email ??
                                user.phone ??
                                "No contact information"}
                            </p>
                          </button>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="space-y-2">
                <CardTitle>Account editor</CardTitle>
                <CardDescription>
                  Update profile information, reset credentials, or permanently
                  delete the account.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {editForm && selectedManagedUser ? (
                  <form onSubmit={handleEditSubmit} className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 p-2 text-xs text-muted-foreground">
                      <span>
                        Managing{" "}
                        {selectedManagedUser.name ??
                          selectedManagedUser.email ??
                          selectedManagedUser.phone ??
                          "selected account"}
                      </span>
                      <Badge
                        variant={
                          selectedManagedUser.status === "ACTIVE"
                            ? "success"
                            : selectedManagedUser.status === "SUSPENDED"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {selectedManagedUser.status}
                      </Badge>
                    </div>
                    {manageFeedback ? (
                      <div className="rounded-md border border-border/60 bg-muted/30 p-2 text-sm text-muted-foreground">
                        {manageFeedback}
                      </div>
                    ) : null}
                    <div className="grid gap-2">
                      <Label htmlFor="manage-name">Name</Label>
                      <Input
                        id="manage-name"
                        value={editForm.name}
                        onChange={(event) =>
                          handleFieldChange("name", event.target.value)
                        }
                        placeholder="Full name"
                      />
                      {editErrors.name ? (
                        <p className="text-xs text-destructive">
                          {editErrors.name}
                        </p>
                      ) : null}
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="manage-email">Email</Label>
                      <Input
                        id="manage-email"
                        type="email"
                        value={editForm.email}
                        onChange={(event) =>
                          handleFieldChange("email", event.target.value)
                        }
                        placeholder="name@example.com"
                      />
                      {editErrors.email ? (
                        <p className="text-xs text-destructive">
                          {editErrors.email}
                        </p>
                      ) : null}
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="manage-phone">Phone</Label>
                      <Input
                        id="manage-phone"
                        value={editForm.phone}
                        onChange={(event) =>
                          handleFieldChange("phone", event.target.value)
                        }
                        placeholder="Optional contact number"
                      />
                      {editErrors.phone ? (
                        <p className="text-xs text-destructive">
                          {editErrors.phone}
                        </p>
                      ) : null}
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="manage-status">Status</Label>
                      <select
                        id="manage-status"
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                        value={editForm.status}
                        onChange={(event) =>
                          handleStatusChange(
                            event.target.value as
                              | "ACTIVE"
                              | "DEACTIVATED"
                              | "SUSPENDED"
                          )
                        }
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="manage-password">Reset password</Label>
                      <div className="relative">
                        <Input
                          id="manage-password"
                          type={showManagePassword ? "text" : "password"}
                          value={editForm.password}
                          onChange={(event) =>
                            handleFieldChange("password", event.target.value)
                          }
                          placeholder="Leave blank to keep current password"
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowManagePassword((previous) => !previous)
                          }
                          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                          aria-label={
                            showManagePassword
                              ? "Hide password"
                              : "Show password"
                          }
                        >
                          {showManagePassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      {editErrors.password ? (
                        <p className="text-xs text-destructive">
                          {editErrors.password}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Minimum 8 characters. Leave blank to keep the existing
                          password.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        type="submit"
                        disabled={manageUpdateMutation.isPending}
                      >
                        {manageUpdateMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving
                          </>
                        ) : (
                          "Save changes"
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={manageDeleteMutation.isPending}
                        onClick={handleDeleteUser}
                      >
                        {manageDeleteMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Removing
                          </>
                        ) : (
                          <>
                            <Trash2 className="mr-2 h-4 w-4" /> Delete user
                          </>
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Account created{" "}
                      {new Date(selectedManagedUser.createdAt).toLocaleString()}
                    </p>
                  </form>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Select a user from the list to manage their profile.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="deletions" className="space-y-6">
          <Card>
            <CardHeader className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle>Pending connection deletions</CardTitle>
                  <CardDescription>
                    Ledgers recoverable within the seven-day grace period.
                  </CardDescription>
                </div>
                <Badge variant="secondary">{pendingDeletions.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {deletionsQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading
                  deletions...
                </div>
              ) : null}
              {deletionsQuery.isError ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  Unable to load pending deletions. Refresh to retry.
                </div>
              ) : null}
              {pendingDeletions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No deletion requests are awaiting review.
                </p>
              ) : (
                <div className="space-y-3">
                  {pendingDeletions.map((deletion) => {
                    const { connection } = deletion;
                    const parentLabel =
                      connection.parentAlias ??
                      connection.parent.name ??
                      connection.parent.email ??
                      "Parent";
                    const childLabel =
                      connection.childAlias ??
                      connection.child.name ??
                      connection.child.email ??
                      "Child";
                    const requestedByLabel =
                      deletion.requestedBy.name ??
                      deletion.requestedBy.email ??
                      deletion.requestedBy.phone ??
                      "User";
                    const acknowledgedByLabel = deletion.acknowledgedBy
                      ? deletion.acknowledgedBy.name ??
                        deletion.acknowledgedBy.email ??
                        deletion.acknowledgedBy.phone ??
                        "User"
                      : null;
                    const outstanding = connection.balance
                      ? Number(connection.balance.outstanding).toFixed(2)
                      : "0.00";
                    const remaining = describeRemaining(deletion.expiresAt);
                    const restoring =
                      restoreDeletionMutation.isPending &&
                      restoreDeletionMutation.variables === connection.id;

                    return (
                      <div
                        key={deletion.id}
                        className="flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/30 p-4 text-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-medium text-foreground">
                              {parentLabel}
                              {" <-> "}
                              {childLabel}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Requested by {requestedByLabel}
                            </p>
                            {acknowledgedByLabel ? (
                              <p className="text-xs text-muted-foreground">
                                Confirmed by {acknowledgedByLabel}
                              </p>
                            ) : null}
                          </div>
                          <Badge
                            variant={
                              CONNECTION_STATUS_VARIANT[connection.status] ??
                              "secondary"
                            }
                          >
                            {connection.status}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="rounded-full border border-border/60 px-3 py-1">
                            Outstanding {outstanding}
                          </span>
                          <span className="rounded-full border border-border/60 px-3 py-1">
                            Expires {remaining}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={restoring}
                            onClick={() =>
                              restoreDeletionMutation.mutate(connection.id)
                            }
                          >
                            {restoring ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Restoring
                              </>
                            ) : (
                              "Restore connection"
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
