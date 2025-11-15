"use client";

import {
  FormEvent,
  startTransition,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ChevronLeft,
  Loader2,
  Menu,
  Moon,
  Pencil,
  Plus,
  Trash2,
  Sun,
  RefreshCcw,
} from "lucide-react";
import Link from "next/link";

import type { SessionUser } from "@/lib/auth/session";
import type { ConnectionStatus, ConnectionSummary } from "@/lib/connections";
import type { LedgerEntryRecord } from "@/lib/ledger";
import {
  ConnectionsResponse,
  LedgerResponse,
  acceptConnectionRequest,
  createConnectionRequest,
  createLedgerEntryRequest,
  declineConnectionRequest,
  getConnections,
  getLedger,
  getMonthlyReport,
  deleteLedgerEntryRequest,
  respondLedgerEntry,
  scheduleConnectionDeletionRequest,
  updateConnectionAliasRequest,
  updateLedgerEntryRequest,
} from "@/lib/api-client";
import { enqueueMutation } from "@/lib/offline/queue";
import { useOfflineQueue } from "@/hooks/use-offline-queue";
import { useTheme } from "@/components/providers/theme-provider";
import { useConnectionStore } from "@/store/connection-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { signOut } from "next-auth/react";

import { z } from "zod";
import { parseContact } from "@/lib/validators/contact";

const REFRESH_INTERVAL_MS = 5000;

const amountField = z
  .string()
  .trim()
  .refine((value) => value.length > 0, {
    message: "Enter an amount",
  })
  .transform((value) => Number(value))
  .refine((value) => Number.isFinite(value) && value > 0, {
    message: "Enter an amount greater than 0",
  });

const notesField = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
  })
  .refine((value) => !value || value.length <= 500, {
    message: "Notes must be 500 characters or less",
  });

const dueDateField = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
  })
  .refine(
    (value) => {
      if (!value) {
        return true;
      }
      const normalized = value.length === 10 ? `${value}T00:00:00Z` : value;
      return !Number.isNaN(Date.parse(normalized));
    },
    {
      message: "Invalid due date",
    }
  );

const inviteSchema = z
  .object({
    partnerContact: z
      .string()
      .trim()
      .min(1, { message: "Enter the partner email or phone number" }),
  })
  .superRefine((value, ctx) => {
    if (!parseContact(value.partnerContact)) {
      ctx.addIssue({
        code: "custom",
        path: ["partnerContact"],
        message: "Enter a valid partner email or phone number",
      });
    }
  })
  .transform((value) => {
    const contact = parseContact(value.partnerContact);
    if (!contact) {
      throw new Error("Invalid partner contact");
    }

    if (contact.type === "email") {
      return {
        childEmail: contact.value,
      };
    }

    return {
      childPhone: contact.value,
    };
  });

type InviteFormValues = z.infer<typeof inviteSchema>;

const creatorEntrySchema = z.object({
  productName: z
    .string()
    .trim()
    .min(2, "Enter a product name")
    .max(120, "Product name is too long"),
  quantity: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed && trimmed.length > 0 ? trimmed : undefined;
    }),
  amount: amountField,
  dueDate: dueDateField,
  notes: notesField,
});

const partnerEntrySchema = z.object({
  amount: amountField,
  notes: notesField,
});

type EntryPayload = {
  entryType: "CREDIT" | "PAYMENT";
  amount: number;
  notes?: string;
  dueDate?: string;
  items?: {
    productName: string;
    quantity?: string;
  };
};

type DashboardView = "dashboard" | "ledger" | "account" | "manage";

const STATUS_VARIANT: Record<
  ConnectionStatus,
  "default" | "secondary" | "destructive" | "muted"
> = {
  ACTIVE: "default",
  PENDING: "secondary",
  BLOCKED: "destructive",
  ARCHIVED: "muted",
};

const APPROVAL_VARIANT: Record<
  "PENDING" | "ACCEPTED" | "DECLINED" | "REVOKED",
  "secondary" | "success" | "destructive" | "muted"
> = {
  PENDING: "secondary",
  ACCEPTED: "success",
  DECLINED: "destructive",
  REVOKED: "muted",
};

function formatTimeUntil(deadline: Date): string {
  const timestamp = deadline.getTime();

  if (!Number.isFinite(timestamp)) {
    return "Unknown";
  }

  const diffMs = timestamp - Date.now();

  if (diffMs <= 0) {
    return "Expired";
  }

  const dayMs = 1000 * 60 * 60 * 24;
  const hourMs = 1000 * 60 * 60;

  const days = Math.floor(diffMs / dayMs);

  if (days >= 1) {
    return `${days} day${days === 1 ? "" : "s"} remaining`;
  }

  const hours = Math.ceil(diffMs / hourMs);
  return `${hours} hour${hours === 1 ? "" : "s"} remaining`;
}

export function DashboardShell({ user }: { user: SessionUser }) {
  const { theme, toggleTheme } = useTheme();
  const queryClient = useQueryClient();
  const { selectedConnectionId, setSelectedConnectionId, offlineQueueCount } =
    useConnectionStore();
  useOfflineQueue();

  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [aliasDialogOpen, setAliasDialogOpen] = useState(false);
  const [aliasTargetId, setAliasTargetId] = useState<string | null>(null);
  const [aliasValue, setAliasValue] = useState("");
  const [aliasError, setAliasError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<LedgerEntryRecord | null>(
    null
  );
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [deleteEntryTarget, setDeleteEntryTarget] =
    useState<LedgerEntryRecord | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteConnectionTarget, setDeleteConnectionTarget] =
    useState<ConnectionSummary | null>(null);
  const [deleteConnectionError, setDeleteConnectionError] = useState<
    string | null
  >(null);
  const [isSigningOut, startSignOut] = useTransition();
  const [historyEntry, setHistoryEntry] = useState<LedgerEntryRecord | null>(
    null
  );
  const [statementDialogOpen, setStatementDialogOpen] = useState(false);
  const [statementStartDate, setStatementStartDate] = useState("");
  const [statementEndDate, setStatementEndDate] = useState("");
  const [statementError, setStatementError] = useState<string | null>(null);
  const [isDownloadingStatement, setIsDownloadingStatement] = useState(false);
  const [viewMode, setViewMode] = useState<DashboardView>("dashboard");
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    startTransition(() => {
      setIsMounted(true);
    });
  }, []);

  const connectionsQuery = useQuery<ConnectionsResponse>({
    queryKey: ["connections"],
    queryFn: getConnections,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: "always",
    refetchOnMount: "always",
    staleTime: REFRESH_INTERVAL_MS,
    placeholderData: keepPreviousData,
  });

  const connections: ConnectionSummary[] = useMemo(
    () => connectionsQuery.data?.connections ?? [],
    [connectionsQuery.data]
  );

  const accountProfile = connectionsQuery.data?.account ?? null;
  const accountPhone = accountProfile?.phone ?? user.phone ?? null;
  const accountSubscriptions = accountProfile?.subscriptions ?? [];
  const hasActiveAccountSubscription = accountSubscriptions.length > 0;

  const selectedConnection = useMemo(() => {
    return connections.find(
      (connection) => connection.id === selectedConnectionId
    );
  }, [connections, selectedConnectionId]);

  const ledgerQuery = useQuery<LedgerResponse>({
    queryKey: ["ledger", selectedConnectionId],
    queryFn: () => getLedger(selectedConnectionId as string),
    enabled:
      Boolean(selectedConnectionId) &&
      !(selectedConnection && !selectedConnection.creatorSubscriptionActive),
    refetchInterval: selectedConnectionId ? REFRESH_INTERVAL_MS : false,
    refetchIntervalInBackground: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: "always",
    refetchOnMount: "always",
    staleTime: REFRESH_INTERVAL_MS,
    placeholderData: keepPreviousData,
  });

  const aliasTargetConnection = useMemo(() => {
    if (!aliasTargetId) {
      return null;
    }

    return (
      connections.find((connection) => connection.id === aliasTargetId) ?? null
    );
  }, [connections, aliasTargetId]);

  const isCreator = selectedConnection
    ? selectedConnection.parent.id === user.id
    : false;
  const isPartner = selectedConnection
    ? selectedConnection.child.id === user.id
    : false;
  const creatorSubscriptionActive = selectedConnection
    ? selectedConnection.creatorSubscriptionActive
    : true;
  const ledgerLockedBySubscription = Boolean(selectedConnection)
    ? !creatorSubscriptionActive
    : false;
  const hideLedgerForSubscription = ledgerLockedBySubscription;
  const creatorSubscriptionPrompt =
    "Purchase a subscription to open your downstream ledgers.";
  const partnerSubscriptionPrompt =
    "Ask the creator to pay for a subscription to open this ledger.";
  const viewerSubscriptionLockMessage = isCreator
    ? creatorSubscriptionPrompt
    : isPartner
    ? partnerSubscriptionPrompt
    : "Creator subscription inactive. Ledger locked until it is renewed.";

  const aliasDialogConnection = aliasTargetConnection ?? selectedConnection;
  const aliasDialogIsCreator = aliasDialogConnection
    ? aliasDialogConnection.parent.id === user.id
    : false;
  const createEntryMutation = useMutation({
    mutationFn: async (values: EntryPayload) => {
      if (!selectedConnectionId) {
        throw new Error("Select a connection first");
      }

      const body = {
        entryType: values.entryType,
        amount: values.amount,
        notes: values.notes,
        dueDate: values.dueDate,
        items: values.items,
      };

      try {
        await createLedgerEntryRequest(selectedConnectionId, body);
        setFeedback("Entry submitted for approval.");
        setEntryDialogOpen(false);
        setEntryError(null);
      } catch (error) {
        if (
          typeof navigator !== "undefined" &&
          (!navigator.onLine || error instanceof TypeError)
        ) {
          await enqueueMutation({
            endpoint: `/api/connections/${selectedConnectionId}/ledger`,
            method: "POST",
            payload: body,
          });
          setFeedback(
            "Offline entry queued. It will sync automatically once you reconnect."
          );
          setEntryDialogOpen(false);
          setEntryError(null);
        } else {
          throw error;
        }
      }
    },
    onMutate: async (values: EntryPayload) => {
      if (!selectedConnectionId) {
        return undefined;
      }

      await queryClient.cancelQueries({
        queryKey: ["ledger", selectedConnectionId],
      });

      const previousLedger = queryClient.getQueryData<LedgerResponse>([
        "ledger",
        selectedConnectionId,
      ]);

      const optimisticId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `optimistic-${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const timestamp = new Date().toISOString();
      const optimisticEntry: LedgerEntryRecord = {
        id: optimisticId,
        connectionId: selectedConnectionId,
        createdById: user.id,
        createdBy: { id: user.id, name: user.name ?? null },
        entryType: values.entryType,
        amount: values.amount,
        notes: values.notes ?? null,
        dueDate: values.dueDate ?? null,
        items: values.items ?? null,
        approvalStatus: "PENDING",
        createdAt: timestamp,
        supersedesId: null,
        statusEvents: [
          {
            id: `${optimisticId}-status`,
            action: "CREATED",
            metadata: { entryType: values.entryType },
            createdAt: timestamp,
            actor: { id: user.id, name: user.name ?? null },
          },
        ],
        pendingMutation: null,
      } as unknown as LedgerEntryRecord;

      queryClient.setQueryData<LedgerResponse>(
        ["ledger", selectedConnectionId],
        (previous) => {
          const entries = previous?.entries ?? [];
          return {
            entries: [optimisticEntry, ...entries],
          };
        }
      );

      return { previousLedger, optimisticEntryId: optimisticId };
    },
    onError: (error: unknown, _values, context) => {
      setEntryError((error as Error).message ?? "Could not create entry");

      if (context?.previousLedger && selectedConnectionId) {
        queryClient.setQueryData<LedgerResponse>(
          ["ledger", selectedConnectionId],
          context.previousLedger
        );
      }
    },
    onSuccess: async () => {
      if (selectedConnectionId) {
        queryClient.invalidateQueries({
          queryKey: ["ledger", selectedConnectionId],
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["connections"] });
    },
  });

  const decisionMutation = useMutation({
    mutationFn: async ({
      entryId,
      decision,
    }: {
      entryId: string;
      decision: "ACCEPT" | "DECLINE";
    }) => {
      await respondLedgerEntry(entryId, { decision });
    },
    onSuccess: () => {
      if (selectedConnectionId) {
        queryClient.invalidateQueries({
          queryKey: ["ledger", selectedConnectionId],
        });
        queryClient.invalidateQueries({ queryKey: ["connections"] });
      }
    },
    onError: (error) => {
      setFeedback(error.message ?? "Unable to update entry");
    },
  });

  const connectionDecisionMutation = useMutation({
    mutationFn: async ({
      connectionId,
      action,
    }: {
      connectionId: string;
      action: "accept" | "decline";
    }) => {
      if (action === "accept") {
        await acceptConnectionRequest(connectionId);
      } else {
        await declineConnectionRequest(connectionId);
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      if (
        variables.action === "decline" &&
        selectedConnectionId === variables.connectionId
      ) {
        setSelectedConnectionId(undefined);
      }
      setFeedback("Connection status updated.");
    },
    onError: (error) => {
      setFeedback((error as Error).message ?? "Could not update connection");
    },
  });

  const createConnectionMutation = useMutation({
    mutationFn: async (values: InviteFormValues) => {
      return createConnectionRequest(values);
    },
    onSuccess: (response: { connection?: ConnectionSummary }) => {
      setInviteDialogOpen(false);
      setInviteError(null);
      setFeedback("Invitation sent. We will notify you when it is accepted.");
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      if (response?.connection?.id) {
        setSelectedConnectionId(response.connection.id);
      }
    },
    onError: (error) => {
      setInviteError((error as Error).message ?? "Unable to send invitation");
    },
  });

  const updateAliasMutation = useMutation({
    mutationFn: async ({ alias }: { alias: string | null }) => {
      if (!aliasTargetId) {
        throw new Error("Select a connection first");
      }

      return updateConnectionAliasRequest(aliasTargetId, { alias });
    },
    onSuccess: (response) => {
      queryClient.setQueryData<ConnectionsResponse>(
        ["connections"],
        (previous) => {
          if (!previous) {
            return previous;
          }

          return {
            ...previous,
            connections: previous.connections.map((connection) =>
              connection.id === response.connection.id
                ? response.connection
                : connection
            ),
          } satisfies ConnectionsResponse;
        }
      );

      queryClient.invalidateQueries({ queryKey: ["connections"] });

      if (selectedConnectionId === response.connection.id) {
        setSelectedConnectionId(response.connection.id);
      }

      setAliasDialogOpen(false);
      setAliasError(null);
      setAliasTargetId(null);
      setAliasValue("");

      const viewerAlias =
        response.connection.parent.id === user.id
          ? response.connection.parentAlias
          : response.connection.childAlias;

      setFeedback(
        viewerAlias && viewerAlias.length > 0
          ? "Alias updated."
          : "Alias removed."
      );
    },
    onError: (error) => {
      setAliasError((error as Error).message ?? "Unable to update alias");
    },
  });

  const deleteConnectionMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const response = await scheduleConnectionDeletionRequest(connectionId);
      return response.connection;
    },
    onSuccess: (connection, connectionId) => {
      queryClient.setQueryData<ConnectionsResponse>(
        ["connections"],
        (previous) => {
          if (!previous) {
            return previous;
          }

          return {
            ...previous,
            connections: previous.connections.filter(
              (connection) => connection.id !== connectionId
            ),
          } satisfies ConnectionsResponse;
        }
      );

      queryClient.invalidateQueries({ queryKey: ["connections"] });
      queryClient.invalidateQueries({ queryKey: ["ledger", connectionId] });

      if (selectedConnectionId === connectionId) {
        setSelectedConnectionId(undefined);
        setViewMode("dashboard");
      }

      setDeleteConnectionTarget(null);
      setDeleteConnectionError(null);
      const deletion = connection.deletion;
      const counterpartId =
        connection.parent.id === user.id
          ? connection.child.id
          : connection.parent.id;
      const partnerStillHasReadOnlyAccess = Boolean(
        deletion &&
          deletion.requestedById !== counterpartId &&
          deletion.acknowledgedById !== counterpartId
      );
      setFeedback(
        partnerStillHasReadOnlyAccess
          ? "Connection removed from your dashboard. Your partner retains read-only access until they delete it too."
          : "Connection removed from your dashboard."
      );
    },
    onError: (error) => {
      setDeleteConnectionError(
        (error as Error).message ?? "Unable to delete connection"
      );
    },
  });

  const updateEntryMutation = useMutation({
    mutationFn: async ({
      entryId,
      payload,
    }: {
      entryId: string;
      payload: Record<string, unknown>;
    }) => updateLedgerEntryRequest(entryId, payload),
    onSuccess: () => {
      if (selectedConnectionId) {
        queryClient.invalidateQueries({
          queryKey: ["ledger", selectedConnectionId],
        });
      }
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      setFeedback("Entry updated successfully.");
      setEditingEntry(null);
      setUpdateError(null);
    },
    onError: (error) => {
      setUpdateError((error as Error).message ?? "Unable to update entry");
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: async ({
      entryId,
      reason,
    }: {
      entryId: string;
      reason?: string;
    }) => deleteLedgerEntryRequest(entryId, reason ? { reason } : undefined),
    onSuccess: () => {
      if (selectedConnectionId) {
        queryClient.invalidateQueries({
          queryKey: ["ledger", selectedConnectionId],
        });
      }
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      setFeedback("Entry removed.");
      setDeleteEntryTarget(null);
      setDeleteError(null);
    },
    onError: (error) => {
      setDeleteError((error as Error).message ?? "Unable to remove entry");
    },
  });

  const ledgerEntries: LedgerEntryRecord[] = hideLedgerForSubscription
    ? []
    : ledgerQuery.data?.entries ?? [];

  const outstanding = selectedConnection?.balance?.outstanding
    ? Number(selectedConnection.balance.outstanding)
    : 0;

  const connectionAlias = selectedConnection
    ? isCreator
      ? selectedConnection.parentAlias
      : selectedConnection.childAlias
    : null;

  const aliasDialogAlias = aliasDialogConnection
    ? aliasDialogIsCreator
      ? aliasDialogConnection.parentAlias
      : aliasDialogConnection.childAlias
    : null;

  const partnerActualName = selectedConnection
    ? isCreator
      ? selectedConnection.child.name ?? selectedConnection.child.email
      : selectedConnection.parent.name ?? selectedConnection.parent.email
    : null;

  const aliasDialogPartnerActualName = aliasDialogConnection
    ? aliasDialogIsCreator
      ? aliasDialogConnection.child.name ?? aliasDialogConnection.child.email
      : aliasDialogConnection.parent.name ?? aliasDialogConnection.parent.email
    : null;

  const partnerDisplayName =
    connectionAlias && connectionAlias.length > 0
      ? connectionAlias
      : partnerActualName;

  const showPartnerActualName = Boolean(
    connectionAlias &&
      connectionAlias.length > 0 &&
      partnerActualName &&
      connectionAlias !== partnerActualName
  );

  const totalConnections = connections.length;
  const activeConnections = connections.filter(
    (connection) => connection.status === "ACTIVE"
  ).length;
  const pendingConnections = connections.filter(
    (connection) => connection.status === "PENDING"
  ).length;
  const blockedConnections = connections.filter(
    (connection) => connection.status === "BLOCKED"
  ).length;
  const manageableConnections = connections;

  const selectedConnectionDeletionDeadline = selectedConnection?.deletion
    ? new Date(selectedConnection.deletion.expiresAt)
    : null;
  const partnerScheduledDeletion = Boolean(
    selectedConnection?.deletion &&
      selectedConnection.deletion.requestedById !== user.id
  );
  const hideLedgerForBlockedPartner =
    selectedConnection?.status === "BLOCKED" && isPartner;

  const canCreateEntry =
    selectedConnection?.status === "ACTIVE" &&
    !partnerScheduledDeletion &&
    creatorSubscriptionActive;
  const partnerDeletionCountdown =
    partnerScheduledDeletion && selectedConnectionDeletionDeadline
      ? formatTimeUntil(selectedConnectionDeletionDeadline)
      : null;
  const partnerDeletionRequestedByName = selectedConnection?.deletion
    ? selectedConnection.deletion.requestedById === selectedConnection.parent.id
      ? selectedConnection.parent.name ?? selectedConnection.parent.email
      : selectedConnection.child.name ?? selectedConnection.child.email
    : null;

  const ledgerEntryViews = ledgerEntries.map((entry) => {
    const entryCreatorId = entry.createdById ?? entry.createdBy?.id ?? null;
    const pendingApproval =
      entry.approvalStatus === "PENDING" &&
      ((isCreator && entryCreatorId === selectedConnection?.child.id) ||
        (isPartner && entryCreatorId === selectedConnection?.parent.id));
    const isEntryOwner = entryCreatorId === user.id;
    const canModifyEntry =
      isEntryOwner &&
      entry.approvalStatus === "ACCEPTED" &&
      !partnerScheduledDeletion &&
      creatorSubscriptionActive;
    const entryRevoked = entry.approvalStatus === "REVOKED";
    const amount = Number(entry.amount);
    const createdAt = new Date(entry.createdAt).toLocaleString();
    const statusEvents = entry.statusEvents ?? [];
    const latestUpdateEvent = [...statusEvents]
      .reverse()
      .find((event) => event.action === "UPDATED");
    const latestRevokeEvent = [...statusEvents]
      .reverse()
      .find((event) => event.action === "REVOKED");
    const updateSummary = summarizeUpdateEvent(latestUpdateEvent);
    const updateTimestamp = latestUpdateEvent
      ? new Date(latestUpdateEvent.createdAt).toLocaleString()
      : null;
    const revokeMetadata = getMetadataRecord(latestRevokeEvent?.metadata);
    const revokeReason =
      revokeMetadata && typeof revokeMetadata.reason === "string"
        ? revokeMetadata.reason
        : undefined;
    const revokeTimestamp = latestRevokeEvent
      ? new Date(latestRevokeEvent.createdAt).toLocaleString()
      : null;
    const hasRevokeEvent = Boolean(latestRevokeEvent);
    const itemLabel =
      entry.entryType === "CREDIT" ? formatItemLabel(entry.items) : undefined;

    return {
      entry,
      pendingApproval,
      canModifyEntry,
      entryRevoked,
      amount,
      createdAt,
      updateSummary,
      updateTimestamp,
      revokeReason,
      revokeTimestamp,
      hasRevokeEvent,
      itemLabel,
    };
  });

  const handleDownloadStatement = async (
    startDate: string,
    endDate: string
  ) => {
    if (!selectedConnectionId) {
      setStatementError("Select a ledger first.");
      return;
    }

    setIsDownloadingStatement(true);
    setStatementError(null);

    try {
      const report = await getMonthlyReport(selectedConnectionId, {
        startDate,
        endDate,
      });
      const blob = new Blob([report.summary.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = report.summary.csvFilename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatementDialogOpen(false);
      setFeedback("Statement downloaded.");
    } catch (error) {
      setStatementError(
        (error as Error).message ?? "Unable to download statement."
      );
    } finally {
      setIsDownloadingStatement(false);
    }
  };

  const formatDateForInput = (value?: string | null) => {
    if (!value) {
      return "";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toISOString().split("T")[0];
  };

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
        typeof record.productName === "string" ? record.productName : "",
      quantity: typeof record.quantity === "string" ? record.quantity : "",
    };
  }

  function formatItemLabel(items: unknown): string | undefined {
    const { productName, quantity } = extractItemDetails(items);
    const trimmedName = productName.trim();
    const trimmedQuantity = quantity.trim();
    const parts: string[] = [];
    if (trimmedName) {
      parts.push(trimmedName);
    }
    if (trimmedQuantity) {
      parts.push(`Qty ${trimmedQuantity}`);
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

  function formatActionLabel(value: string): string {
    return value
      .toLowerCase()
      .replace(/_/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function summarizeUpdateEvent(
    event?: LedgerEntryRecord["statusEvents"][number]
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
      const fromValue =
        typeof amountChange.from === "number"
          ? amountChange.from
          : Number((amountChange.from as unknown) ?? NaN);
      const toValue =
        typeof amountChange.to === "number"
          ? amountChange.to
          : Number((amountChange.to as unknown) ?? NaN);

      if (
        Number.isFinite(fromValue) &&
        Number.isFinite(toValue) &&
        fromValue !== toValue
      ) {
        parts.push(
          `amount ${Number(fromValue).toFixed(2)} → ${Number(toValue).toFixed(
            2
          )}`
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
    event: LedgerEntryRecord["statusEvents"][number],
    baseEntry?: LedgerEntryRecord
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
        const baseItems = baseEntry
          ? (baseEntry as { items?: unknown }).items
          : undefined;
        const itemLabel = formatItemLabel(metadataItems ?? baseItems);
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

  const handleEditSubmit = (formData: FormData) => {
    if (!editingEntry) {
      return;
    }

    setUpdateError(null);

    if (editingEntry.entryType === "CREDIT") {
      const parsed = creatorEntrySchema.safeParse({
        productName: formData.get("productName")?.toString() ?? "",
        quantity: formData.get("quantity")?.toString(),
        amount: formData.get("amount")?.toString() ?? "",
        dueDate: formData.get("dueDate")?.toString(),
        notes: formData.get("notes")?.toString(),
      });

      if (!parsed.success) {
        setUpdateError(parsed.error.issues[0]?.message ?? "Invalid entry");
        return;
      }

      updateEntryMutation.mutate({
        entryId: editingEntry.id,
        payload: {
          amount: parsed.data.amount,
          notes: parsed.data.notes ?? null,
          dueDate: parsed.data.dueDate ?? null,
          items: {
            productName: parsed.data.productName,
            ...(parsed.data.quantity ? { quantity: parsed.data.quantity } : {}),
          },
        },
      });

      return;
    }

    if (editingEntry.entryType === "PAYMENT") {
      const parsed = partnerEntrySchema.safeParse({
        amount: formData.get("amount")?.toString() ?? "",
        notes: formData.get("notes")?.toString(),
      });

      if (!parsed.success) {
        setUpdateError(parsed.error.issues[0]?.message ?? "Invalid entry");
        return;
      }

      updateEntryMutation.mutate({
        entryId: editingEntry.id,
        payload: {
          amount: parsed.data.amount,
          notes: parsed.data.notes ?? null,
        },
      });

      return;
    }

    setUpdateError("Editing this entry type is not supported yet.");
  };

  const handleDeleteSubmit = (formData: FormData) => {
    if (!deleteEntryTarget) {
      return;
    }

    setDeleteError(null);

    const reason = formData.get("reason")?.toString().trim();

    deleteEntryMutation.mutate({
      entryId: deleteEntryTarget.id,
      reason: reason || undefined,
    });
  };

  const handleEntrySubmit = (formData: FormData) => {
    setEntryError(null);

    if (!selectedConnectionId) {
      setEntryError("Select a connection first");
      return;
    }

    if (!isCreator && !isPartner) {
      setEntryError("You are not part of this connection.");
      return;
    }

    if (isCreator) {
      const parsed = creatorEntrySchema.safeParse({
        productName: formData.get("productName")?.toString() ?? "",
        quantity: formData.get("quantity")?.toString(),
        amount: formData.get("amount")?.toString() ?? "",
        dueDate: formData.get("dueDate")?.toString(),
        notes: formData.get("notes")?.toString(),
      });

      if (!parsed.success) {
        setEntryError(parsed.error.issues[0]?.message ?? "Invalid entry");
        return;
      }

      const payload: EntryPayload = {
        entryType: "CREDIT",
        amount: parsed.data.amount,
        notes: parsed.data.notes,
        dueDate: parsed.data.dueDate,
        items: {
          productName: parsed.data.productName,
          ...(parsed.data.quantity ? { quantity: parsed.data.quantity } : {}),
        },
      };

      createEntryMutation.mutate(payload);
      return;
    }

    const parsed = partnerEntrySchema.safeParse({
      amount: formData.get("amount")?.toString() ?? "",
      notes: formData.get("notes")?.toString(),
    });

    if (!parsed.success) {
      setEntryError(parsed.error.issues[0]?.message ?? "Invalid entry");
      return;
    }

    const payload: EntryPayload = {
      entryType: "PAYMENT",
      amount: parsed.data.amount,
      notes: parsed.data.notes,
    };

    createEntryMutation.mutate(payload);
  };

  const handleInviteSubmit = (formData: FormData) => {
    setInviteError(null);
    const parsed = inviteSchema.safeParse({
      partnerContact: formData.get("partnerContact")?.toString()?.trim() ?? "",
    });

    if (!parsed.success) {
      setInviteError(
        parsed.error.issues[0]?.message ?? "Invalid invitation details"
      );
      return;
    }

    createConnectionMutation.mutate(parsed.data);
  };

  const openAliasDialog = (connection: ConnectionSummary | null) => {
    if (!connection) {
      return;
    }

    const isCreatorPerspective = connection.parent.id === user.id;
    const alias = isCreatorPerspective
      ? connection.parentAlias
      : connection.childAlias;

    setAliasTargetId(connection.id);
    setAliasValue(alias ?? "");
    setAliasError(null);
    setAliasDialogOpen(true);
  };

  const handleAliasSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!aliasDialogConnection) {
      setAliasError("Connection details unavailable.");
      return;
    }

    const trimmed = aliasValue.trim();

    if (trimmed.length > 0 && trimmed.length < 2) {
      setAliasError("Alias must be at least 2 characters.");
      return;
    }

    if (!aliasDialogIsCreator && trimmed.length === 0) {
      setAliasError("Alias is required.");
      return;
    }

    if (trimmed.length > 80) {
      setAliasError("Alias must be 80 characters or fewer.");
      return;
    }

    setAliasError(null);
    if (!aliasTargetId) {
      setAliasError("Unable to determine connection context.");
      return;
    }

    updateAliasMutation.mutate({
      alias: trimmed.length > 0 ? trimmed : null,
    });
  };

  const showLedgerView = viewMode === "ledger" && Boolean(selectedConnection);
  const showManageView = viewMode === "manage";
  const showAccountView = viewMode === "account";
  const headerTitle = showLedgerView
    ? partnerDisplayName
      ? `Ledger with ${partnerDisplayName}`
      : "Ledger overview"
    : showManageView
    ? "Manage connections"
    : showAccountView
    ? "Account details"
    : "Dashboard overview";
  const headerSubtitle = showLedgerView
    ? "Pending entries require both parties to approve before balances update."
    : showManageView
    ? "Rename partners, review statuses, and schedule removals when needed."
    : showAccountView
    ? "Manage your personal information and account status."
    : "Review your links and stay on top of activity.";
  // Hide subtitles on small screens for non-ledger views (manage view already hidden)
  const headerSubtitleClassName = showLedgerView
    ? "hidden text-xs text-muted-foreground sm:block sm:text-sm"
    : "hidden text-xs text-muted-foreground sm:block sm:text-sm";
  const accountRoleLabel = user.isAdmin
    ? "Administrator"
    : isCreator
    ? "Creator"
    : isPartner
    ? "Partner"
    : "Member";

  return (
    <div className="min-h-[calc(100vh-8rem)] px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {viewMode !== "dashboard" ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setViewMode("dashboard");
                if (viewMode === "account") {
                  return;
                }
                setSelectedConnectionId(undefined);
              }}
              aria-label="Go back"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          ) : null}
          <div>
            <h1 className="text-lg font-semibold text-foreground sm:text-2xl">
              {headerTitle}
            </h1>
            <p className={headerSubtitleClassName}>{headerSubtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="destructive"
            onClick={() => window.location.reload()}
            aria-label="Refresh page"
            className="whitespace-nowrap sm:hidden"
          >
            <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle theme"
            onClick={toggleTheme}
          >
            {isMounted ? (
              theme === "dark" ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )
            ) : (
              <div className="h-5 w-5" />
            )}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link href="/contact">Contact support</Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  setSelectedConnectionId(undefined);
                  setViewMode("manage");
                }}
              >
                Manage connections
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setViewMode("account")}>
                Account
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  startSignOut(async () => {
                    await signOut({ callbackUrl: "/sign-in" });
                  })
                }
                disabled={isSigningOut}
              >
                {isSigningOut ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {viewMode !== "ledger" ? (
        <Tabs
          value={viewMode}
          onValueChange={(value) => {
            if (value === "ledger") {
              return;
            }
            const next = value as DashboardView;
            setViewMode(next);
            setSelectedConnectionId(undefined);
          }}
          className="mb-4"
        >
          <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
            <TabsTrigger value="dashboard">Overview</TabsTrigger>
            <TabsTrigger value="manage">Manage connections</TabsTrigger>
            <TabsTrigger value="account">Account</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside
          className={
            viewMode === "ledger" || showManageView
              ? "hidden lg:block lg:space-y-6"
              : "space-y-6"
          }
        >
          <Card className={showAccountView ? "hidden md:block" : undefined}>
            <CardHeader className="space-y-3">
              <CardTitle className="text-xl">
                Welcome, {user.name ?? user.email}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Offline queue</span>
                <Badge
                  variant={offlineQueueCount > 0 ? "destructive" : "secondary"}
                >
                  {offlineQueueCount}
                </Badge>
              </div>
              <div>
                <p className="font-medium text-foreground">Quick links</p>
                <ul className="mt-2 space-y-1">
                  {/* <li>
                    <button
                      type="button"
                      className="text-left text-primary underline"
                      onClick={() => {
                        setSelectedConnectionId(undefined);
                        setViewMode("manage");
                      }}
                    >
                      Manage connections
                    </button>
                  </li> */}
                  <li>
                    <Link href="/contact" className="text-primary underline">
                      Contact support
                    </Link>
                  </li>
                </ul>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setInviteDialogOpen(true);
                  setInviteError(null);
                }}
              >
                <Plus className="mr-2 h-4 w-4" /> Invite partner
              </Button>
            </CardContent>
          </Card>

          <Card
            className={`${
              showAccountView ? "hidden md:block" : ""
            } h-full overflow-hidden`}
          >
            <CardHeader>
              <CardTitle className="text-base">Connections</CardTitle>
              <CardDescription>
                {connectionsQuery.isPending
                  ? "Loading your network..."
                  : connections.length > 0
                  ? "Select a ledger to review activity."
                  : "Invite a partner to activate your first ledger."}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[60vh] sm:max-h-[420px]">
                <div className="space-y-2 px-4 pb-4">
                  {connectionsQuery.isError ? (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                      Unable to load connections. Refresh to try again.
                    </div>
                  ) : null}
                  {connectionsQuery.isPending ? (
                    <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Fetching
                      connections...
                    </div>
                  ) : null}
                  {!connectionsQuery.isPending && connections.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                      Activate your creator subscription to invite wholesalers
                      and shopkeepers.
                    </div>
                  ) : null}
                  {connections.map((connection) => {
                    const isSelected = connection.id === selectedConnectionId;
                    const counterparty =
                      connection.parent.id === user.id
                        ? connection.child
                        : connection.parent;
                    const viewingAsParent = connection.parent.id === user.id;
                    const aliasLabel = viewingAsParent
                      ? connection.parentAlias
                      : connection.childAlias;
                    const counterpartyLabel =
                      counterparty.name ?? counterparty.email ?? "Unnamed";
                    const counterpartyEmail = counterparty.email;
                    const counterpartyPhone = counterparty.phone;
                    const displayLabel =
                      aliasLabel && aliasLabel.length > 0
                        ? aliasLabel
                        : counterpartyLabel;
                    const showActualLabel =
                      aliasLabel &&
                      aliasLabel.length > 0 &&
                      aliasLabel !== counterpartyLabel;
                    const variant = STATUS_VARIANT[connection.status];
                    const showDecisionButtons =
                      connection.status === "PENDING" &&
                      connection.child.id === user.id;
                    const deletionDeadline = connection.deletion
                      ? new Date(connection.deletion.expiresAt)
                      : null;
                    const partnerRequestedDeletion = Boolean(
                      connection.deletion &&
                        connection.deletion.requestedById !== user.id
                    );
                    const deletionCountdown =
                      partnerRequestedDeletion && deletionDeadline
                        ? formatTimeUntil(deletionDeadline)
                        : null;

                    return (
                      <div
                        key={connection.id}
                        className={`rounded-xl border p-4 transition ${
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (!connection.creatorSubscriptionActive) {
                              const lockMessage =
                                connection.parent.id === user.id
                                  ? creatorSubscriptionPrompt
                                  : partnerSubscriptionPrompt;
                              setFeedback(lockMessage);
                              setSelectedConnectionId(undefined);
                              setViewMode("dashboard");
                              return;
                            }
                            setSelectedConnectionId(connection.id);
                            setViewMode("ledger");
                          }}
                          className="w-full text-left"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-medium text-foreground">
                                {displayLabel}
                              </p>
                              {showActualLabel ? (
                                <p className="text-xs text-muted-foreground">
                                  {counterpartyLabel}
                                </p>
                              ) : null}
                              {counterpartyEmail ? (
                                <p className="text-xs text-muted-foreground">
                                  {counterpartyEmail}
                                </p>
                              ) : null}
                              {counterpartyPhone ? (
                                <p className="text-xs text-muted-foreground">
                                  {counterpartyPhone}
                                </p>
                              ) : null}
                            </div>
                            <Badge variant={variant}>{connection.status}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Outstanding:{" "}
                            {connection.balance
                              ? Number(connection.balance.outstanding).toFixed(
                                  2
                                )
                              : "0.00"}
                          </p>
                          {!connection.creatorSubscriptionActive ? (
                            <p className="mt-1 text-xs text-amber-600">
                              {connection.parent.id === user.id
                                ? creatorSubscriptionPrompt
                                : partnerSubscriptionPrompt}
                            </p>
                          ) : null}
                          {partnerRequestedDeletion && deletionCountdown ? (
                            <p className="mt-1 text-xs text-destructive">
                              Removal scheduled by partner • {deletionCountdown}
                            </p>
                          ) : null}
                        </button>
                        {showDecisionButtons ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={connectionDecisionMutation.isPending}
                              onClick={() =>
                                connectionDecisionMutation.mutate({
                                  connectionId: connection.id,
                                  action: "decline",
                                })
                              }
                            >
                              Decline
                            </Button>
                            <Button
                              size="sm"
                              disabled={connectionDecisionMutation.isPending}
                              onClick={() =>
                                connectionDecisionMutation.mutate({
                                  connectionId: connection.id,
                                  action: "accept",
                                })
                              }
                            >
                              Accept & open ledger
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </aside>

        {showLedgerView ? (
          <section className="space-y-6">
            <div className="flex flex-col gap-3 rounded-3xl border border-border/60 bg-card/50 p-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-foreground">
                  {partnerDisplayName
                    ? `Ledger with ${partnerDisplayName}`
                    : "No ledger selected"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Running balance reflects only accepted entries. Pending items
                  stay out until both parties approve.
                </p>
                {showPartnerActualName && partnerActualName ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Actual name: {partnerActualName}
                  </p>
                ) : null}
                {!creatorSubscriptionActive ? (
                  <div className="mt-3 rounded-md border border-amber-300/70 bg-amber-100/50 p-3 text-xs text-amber-900">
                    {isCreator
                      ? creatorSubscriptionPrompt
                      : partnerSubscriptionPrompt}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Outstanding balance
                  </p>
                  <p className="text-2xl font-semibold text-foreground">
                    {outstanding.toFixed(2)}
                  </p>
                  {/* {!outstandingIsSettled ? (
                    <p className="mt-1 text-xs text-destructive">
                      Balance must be zero to delete this connection.
                    </p>
                  ) : null} */}
                </div>
                <Separator
                  orientation="vertical"
                  className="hidden h-10 sm:block"
                />
                <Dialog
                  open={statementDialogOpen}
                  onOpenChange={(open) => {
                    setStatementDialogOpen(open);
                    if (open) {
                      const now = new Date();
                      const end = new Date(now);
                      const start = new Date(now);
                      start.setDate(start.getDate() - 30);

                      const toInputDate = (date: Date) =>
                        date.toISOString().split("T")[0];

                      setStatementStartDate(toInputDate(start));
                      setStatementEndDate(toInputDate(end));
                      setStatementError(null);
                    } else {
                      setStatementError(null);
                      setIsDownloadingStatement(false);
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      disabled={
                        !selectedConnectionId ||
                        hideLedgerForBlockedPartner ||
                        hideLedgerForSubscription
                      }
                    >
                      Download statement
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Download statement</DialogTitle>
                      <DialogDescription>
                        Choose a date range to export accepted ledger entries
                        for this ledger.
                      </DialogDescription>
                    </DialogHeader>
                    {statementError ? (
                      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                        {statementError}
                      </div>
                    ) : null}
                    <form
                      className="space-y-4"
                      onSubmit={(event) => {
                        event.preventDefault();

                        if (!statementStartDate || !statementEndDate) {
                          setStatementError("Select both start and end dates.");
                          return;
                        }

                        if (statementStartDate > statementEndDate) {
                          setStatementError(
                            "Start date must be before end date."
                          );
                          return;
                        }

                        void handleDownloadStatement(
                          statementStartDate,
                          statementEndDate
                        );
                      }}
                    >
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="statement-start">Start date</Label>
                          <Input
                            id="statement-start"
                            name="statement-start"
                            type="date"
                            value={statementStartDate}
                            onChange={(event) =>
                              setStatementStartDate(event.target.value)
                            }
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="statement-end">End date</Label>
                          <Input
                            id="statement-end"
                            name="statement-end"
                            type="date"
                            value={statementEndDate}
                            onChange={(event) =>
                              setStatementEndDate(event.target.value)
                            }
                            required
                          />
                        </div>
                      </div>
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={isDownloadingStatement}
                      >
                        {isDownloadingStatement ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Download CSV"
                        )}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
                {/* <Button
                  onClick={() => openAliasDialog(selectedConnection ?? null)}
                  variant="outline"
                  disabled={!selectedConnectionId}
                >
                  <Pencil className="mr-2 h-4 w-4" /> Edit alias
                </Button> */}
                {/* <Button
                  onClick={() => {
                    if (!selectedConnection) {
                      return;
                    }
                    setDeleteConnectionTarget(selectedConnection);
                    setDeleteConnectionError(null);
                  }}
                  variant="destructive"
                  disabled={
                    !selectedConnectionId ||
                    deleteConnectionMutation.isPending ||
                    !canDeleteSelectedConnection
                  }
                  title={
                    !canDeleteSelectedConnection
                      ? "Settle the outstanding balance before deleting"
                      : undefined
                  }
                >
                  {deleteConnectionMutation.isPending &&
                  deleteConnectionTarget?.id === selectedConnectionId ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Delete connection
                </Button> */}
                <Dialog
                  open={entryDialogOpen}
                  onOpenChange={setEntryDialogOpen}
                >
                  <DialogTrigger asChild>
                    <Button
                      disabled={
                        !canCreateEntry ||
                        hideLedgerForBlockedPartner ||
                        hideLedgerForSubscription
                      }
                    >
                      Create entry
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>New ledger entry</DialogTitle>
                      <DialogDescription>
                        Entries need approval from your partner before balances
                        adjust.
                      </DialogDescription>
                    </DialogHeader>
                    {entryError ? (
                      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                        {entryError}
                      </div>
                    ) : null}
                    <form
                      className="space-y-4"
                      onSubmit={(event) => {
                        event.preventDefault();
                        handleEntrySubmit(new FormData(event.currentTarget));
                        if (!createEntryMutation.isError) {
                          event.currentTarget.reset();
                        }
                      }}
                    >
                      {isCreator ? (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="productName">Product name</Label>
                            <Input
                              id="productName"
                              name="productName"
                              placeholder="e.g. Premium rice 20kg"
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="quantity">
                              Quantity (optional)
                            </Label>
                            <Input
                              id="quantity"
                              name="quantity"
                              placeholder="e.g. 25 bags"
                            />
                          </div>
                        </>
                      ) : null}
                      <div className="space-y-2">
                        <Label htmlFor="amount">
                          {isCreator ? "Amount" : "Amount paid"}
                        </Label>
                        <Input
                          id="amount"
                          name="amount"
                          placeholder="0.00"
                          required
                          inputMode="decimal"
                        />
                      </div>
                      {/* {isCreator ? (
                        <div className="space-y-2">
                          <Label htmlFor="dueDate">Due date (optional)</Label>
                          <Input id="dueDate" name="dueDate" type="date" />
                        </div>
                      ) : null} */}
                      <div className="space-y-2">
                        <Label htmlFor="notes">Notes (optional)</Label>
                        <Textarea
                          id="notes"
                          name="notes"
                          rows={3}
                          placeholder={
                            isCreator
                              ? "Invoice reference or delivery details."
                              : "Add an optional reference."
                          }
                        />
                      </div>
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={createEntryMutation.isPending}
                      >
                        {createEntryMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Submit for approval"
                        )}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {partnerScheduledDeletion && partnerDeletionCountdown ? (
              <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                <p>
                  Removal scheduled by{" "}
                  {partnerDeletionRequestedByName ?? "partner"} •{" "}
                  {partnerDeletionCountdown}
                </p>
                <p className="mt-1 text-xs text-destructive/80">
                  Ledger is read-only until you delete it from your side or an
                  administrator restores the connection.
                </p>
              </div>
            ) : null}

            <Dialog
              open={Boolean(editingEntry)}
              onOpenChange={(open) => {
                if (!open) {
                  setEditingEntry(null);
                  setUpdateError(null);
                }
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit ledger entry</DialogTitle>
                  <DialogDescription>
                    Update the accepted entry. Changes are shared with your
                    partner automatically.
                  </DialogDescription>
                </DialogHeader>
                {updateError ? (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    {updateError}
                  </div>
                ) : null}
                {editingEntry ? (
                  <form
                    key={editingEntry.id}
                    className="space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      handleEditSubmit(new FormData(event.currentTarget));
                    }}
                  >
                    {editingEntry.entryType === "CREDIT" ? (
                      (() => {
                        const items = extractItemDetails(editingEntry.items);
                        const rawDueDate = editingEntry.dueDate
                          ? typeof editingEntry.dueDate === "string"
                            ? editingEntry.dueDate
                            : editingEntry.dueDate.toISOString()
                          : null;
                        const dueDateValue = formatDateForInput(rawDueDate);

                        return (
                          <>
                            <div className="space-y-2">
                              <Label htmlFor="edit-productName">
                                Product name
                              </Label>
                              <Input
                                id="edit-productName"
                                name="productName"
                                defaultValue={items.productName}
                                required
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="edit-quantity">
                                Quantity (optional)
                              </Label>
                              <Input
                                id="edit-quantity"
                                name="quantity"
                                defaultValue={items.quantity}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="edit-amount">Amount</Label>
                              <Input
                                id="edit-amount"
                                name="amount"
                                defaultValue={Number(
                                  editingEntry.amount
                                ).toFixed(2)}
                                required
                                inputMode="decimal"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="edit-dueDate">
                                Due date (optional)
                              </Label>
                              <Input
                                id="edit-dueDate"
                                name="dueDate"
                                type="date"
                                defaultValue={dueDateValue}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="edit-notes">
                                Notes (optional)
                              </Label>
                              <Textarea
                                id="edit-notes"
                                name="notes"
                                rows={3}
                                defaultValue={
                                  typeof editingEntry.notes === "string"
                                    ? editingEntry.notes
                                    : ""
                                }
                              />
                            </div>
                          </>
                        );
                      })()
                    ) : editingEntry.entryType === "PAYMENT" ? (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="edit-amount">Amount paid</Label>
                          <Input
                            id="edit-amount"
                            name="amount"
                            defaultValue={Number(editingEntry.amount).toFixed(
                              2
                            )}
                            required
                            inputMode="decimal"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-notes">Notes (optional)</Label>
                          <Textarea
                            id="edit-notes"
                            name="notes"
                            rows={3}
                            defaultValue={
                              typeof editingEntry.notes === "string"
                                ? editingEntry.notes
                                : ""
                            }
                          />
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Editing is not supported for this entry type yet.
                      </p>
                    )}
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setEditingEntry(null);
                          setUpdateError(null);
                        }}
                        disabled={updateEntryMutation.isPending}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={updateEntryMutation.isPending}
                      >
                        {updateEntryMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Save changes"
                        )}
                      </Button>
                    </DialogFooter>
                  </form>
                ) : null}
              </DialogContent>
            </Dialog>

            <Dialog
              open={Boolean(deleteEntryTarget)}
              onOpenChange={(open) => {
                if (!open) {
                  setDeleteEntryTarget(null);
                  setDeleteError(null);
                }
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Remove ledger entry</DialogTitle>
                  <DialogDescription>
                    This entry will be marked as removed and balances will
                    update accordingly.
                  </DialogDescription>
                </DialogHeader>
                {deleteError ? (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    {deleteError}
                  </div>
                ) : null}
                {deleteEntryTarget ? (
                  <form
                    key={deleteEntryTarget.id}
                    className="space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      handleDeleteSubmit(new FormData(event.currentTarget));
                    }}
                  >
                    <div className="space-y-2">
                      <Label htmlFor="remove-reason">
                        Reason (shared with your partner, optional)
                      </Label>
                      <Textarea
                        id="remove-reason"
                        name="reason"
                        rows={3}
                        placeholder="e.g. Entry logged in error"
                      />
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setDeleteEntryTarget(null);
                          setDeleteError(null);
                        }}
                        disabled={deleteEntryMutation.isPending}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        variant="destructive"
                        disabled={deleteEntryMutation.isPending}
                      >
                        {deleteEntryMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Remove entry"
                        )}
                      </Button>
                    </DialogFooter>
                  </form>
                ) : null}
              </DialogContent>
            </Dialog>

            <Dialog
              open={Boolean(historyEntry)}
              onOpenChange={(open) => {
                if (!open) {
                  setHistoryEntry(null);
                }
              }}
            >
              <DialogContent className="max-w-[90vw] p-4 sm:max-w-lg sm:p-6">
                <DialogHeader>
                  <DialogTitle>Entry history</DialogTitle>
                  <DialogDescription>
                    Review every action recorded for this ledger entry.
                  </DialogDescription>
                </DialogHeader>
                {historyEntry
                  ? (() => {
                      const { productName, quantity } = extractItemDetails(
                        historyEntry.items
                      );
                      const trimmedName = productName.trim();
                      const trimmedQuantity = quantity.trim();
                      const hasItemDetails = trimmedName || trimmedQuantity;

                      return (
                        <div className="space-y-4">
                          <div className="rounded-lg border border-border/60 bg-muted/40 p-4 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold">
                                {historyEntry.entryType}
                              </span>
                              <span className="text-muted-foreground">
                                {Number(historyEntry.amount).toFixed(2)}
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Created{" "}
                              {new Date(
                                historyEntry.createdAt
                              ).toLocaleString()}
                            </div>
                            {hasItemDetails ? (
                              <div className="mt-3 space-y-1 text-xs">
                                {trimmedName ? (
                                  <div>
                                    <span className="text-muted-foreground">
                                      Product:
                                    </span>{" "}
                                    <span className="font-medium text-foreground">
                                      {trimmedName}
                                    </span>
                                  </div>
                                ) : null}
                                {trimmedQuantity ? (
                                  <div>
                                    <span className="text-muted-foreground">
                                      Quantity:
                                    </span>{" "}
                                    <span className="font-medium text-foreground">
                                      {trimmedQuantity}
                                    </span>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                            {historyEntry.notes ? (
                              <div className="mt-2 text-sm text-muted-foreground">
                                {historyEntry.notes}
                              </div>
                            ) : null}
                          </div>

                          <ScrollArea className="h-60 sm:h-80">
                            <ul className="space-y-3 pr-3">
                              {(historyEntry.statusEvents ?? []).map(
                                (event) => {
                                  const { title, description } =
                                    describeStatusEvent(event, historyEntry);
                                  const timestamp = new Date(
                                    event.createdAt
                                  ).toLocaleString();
                                  const actorName = event.actor?.name;

                                  return (
                                    <li
                                      key={event.id}
                                      className="rounded-md border border-border/70 bg-background/70 p-3"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-medium">
                                          {title}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                          {timestamp}
                                        </span>
                                      </div>
                                      {actorName ? (
                                        <div className="mt-1 text-xs text-muted-foreground">
                                          By {actorName}
                                        </div>
                                      ) : null}
                                      {description ? (
                                        <div className="mt-2 text-xs text-muted-foreground">
                                          {description}
                                        </div>
                                      ) : null}
                                    </li>
                                  );
                                }
                              )}
                            </ul>
                          </ScrollArea>
                        </div>
                      );
                    })()
                  : null}
              </DialogContent>
            </Dialog>

            {feedback ? (
              <div className="rounded-xl border border-border/70 bg-background/80 p-4 text-sm text-muted-foreground">
                {feedback}
              </div>
            ) : null}

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle>Ledger history</CardTitle>
                  <CardDescription>
                    {hideLedgerForSubscription
                      ? viewerSubscriptionLockMessage
                      : `${ledgerEntries.length} transaction${
                          ledgerEntries.length === 1 ? "" : "s"
                        } recorded for this connection.`}
                  </CardDescription>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">Actions</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() =>
                        selectedConnectionId &&
                        queryClient.invalidateQueries({
                          queryKey: ["ledger", selectedConnectionId],
                        })
                      }
                    >
                      Refresh data
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent className="p-0">
                {hideLedgerForSubscription ? (
                  <div className="flex h-[480px] items-center justify-center p-6 text-center">
                    <div className="space-y-2">
                      <Badge variant="secondary">Ledger locked</Badge>
                      <p className="max-w-sm text-sm text-muted-foreground">
                        {viewerSubscriptionLockMessage}
                      </p>
                    </div>
                  </div>
                ) : hideLedgerForBlockedPartner ? (
                  <div className="flex h-[480px] items-center justify-center p-6 text-center">
                    <div className="space-y-2">
                      <Badge variant="destructive">Connection blocked</Badge>
                      <p className="max-w-sm text-sm text-muted-foreground">
                        Ledger history is hidden while this connection is
                        blocked. Reach out to the creator to regain access.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3 p-4 md:hidden">
                      {ledgerQuery.isPending ? (
                        <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" /> Loading
                          ledger...
                        </div>
                      ) : null}
                      {ledgerQuery.isError ? (
                        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                          Unable to load ledger entries. Refresh to retry.
                        </div>
                      ) : null}
                      {!ledgerQuery.isPending &&
                      !ledgerQuery.isError &&
                      ledgerEntryViews.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                          No entries yet. Create your first entry to get
                          started.
                        </div>
                      ) : null}
                      {ledgerEntryViews.map(
                        ({
                          entry,
                          pendingApproval,
                          canModifyEntry,
                          entryRevoked,
                          amount,
                          createdAt,
                          updateSummary,
                          updateTimestamp,
                          revokeReason,
                          revokeTimestamp,
                          hasRevokeEvent,
                          itemLabel,
                        }) => (
                          <div
                            key={entry.id}
                            className={`rounded-xl border border-border/70 bg-background p-4 text-sm ${
                              entryRevoked ? "opacity-75" : ""
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <Badge
                                variant={APPROVAL_VARIANT[entry.approvalStatus]}
                              >
                                {entry.approvalStatus}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {createdAt}
                              </span>
                            </div>
                            <div className="mt-2 flex items-baseline justify-between gap-4">
                              <Badge
                                variant={
                                  entry.entryType === "CREDIT"
                                    ? "secondary"
                                    : "outline"
                                }
                              >
                                {entry.entryType}
                              </Badge>
                              <span className="text-lg font-semibold text-foreground">
                                {amount.toFixed(2)}
                              </span>
                            </div>
                            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                              {entry.notes ? <p>{entry.notes}</p> : null}
                              {itemLabel ? (
                                <p className="text-xs">
                                  <span className="font-medium text-foreground">
                                    Items:
                                  </span>{" "}
                                  {itemLabel}
                                </p>
                              ) : null}
                              {!entry.notes && !itemLabel ? (
                                <span>—</span>
                              ) : null}
                            </div>
                            {updateSummary ? (
                              <div className="mt-1 text-xs text-muted-foreground">
                                {updateSummary}
                                {updateTimestamp ? ` • ${updateTimestamp}` : ""}
                              </div>
                            ) : null}
                            {hasRevokeEvent ? (
                              <div className="mt-1 text-xs text-destructive">
                                {revokeReason
                                  ? `Removed: ${revokeReason}`
                                  : "Entry removed"}
                                {revokeTimestamp ? ` • ${revokeTimestamp}` : ""}
                              </div>
                            ) : null}
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="link"
                                className="h-auto p-0 text-xs"
                                onClick={() => setHistoryEntry(entry)}
                              >
                                View history
                              </Button>
                            </div>
                            {pendingApproval ? (
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={
                                    decisionMutation.isPending ||
                                    !creatorSubscriptionActive
                                  }
                                  onClick={() =>
                                    decisionMutation.mutate({
                                      entryId: entry.id,
                                      decision: "DECLINE",
                                    })
                                  }
                                >
                                  Decline
                                </Button>
                                <Button
                                  size="sm"
                                  disabled={
                                    decisionMutation.isPending ||
                                    !creatorSubscriptionActive
                                  }
                                  onClick={() =>
                                    decisionMutation.mutate({
                                      entryId: entry.id,
                                      decision: "ACCEPT",
                                    })
                                  }
                                >
                                  Accept
                                </Button>
                              </div>
                            ) : canModifyEntry ? (
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={
                                    updateEntryMutation.isPending &&
                                    editingEntry?.id === entry.id
                                  }
                                  onClick={() => {
                                    setEditingEntry(entry);
                                    setUpdateError(null);
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={
                                    deleteEntryMutation.isPending &&
                                    deleteEntryTarget?.id === entry.id
                                  }
                                  onClick={() => {
                                    setDeleteEntryTarget(entry);
                                    setDeleteError(null);
                                  }}
                                >
                                  {deleteEntryMutation.isPending &&
                                  deleteEntryTarget?.id === entry.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    "Delete"
                                  )}
                                </Button>
                              </div>
                            ) : entryRevoked ? (
                              <p className="mt-2 text-xs text-muted-foreground">
                                Removed
                              </p>
                            ) : null}
                          </div>
                        )
                      )}
                    </div>
                    <ScrollArea className="hidden h-[480px] md:block">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Created</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Notes</TableHead>
                            <TableHead className="text-right">
                              Actions
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ledgerQuery.isPending ? (
                            <TableRow>
                              <TableCell
                                colSpan={6}
                                className="text-center text-muted-foreground"
                              >
                                <div className="flex items-center justify-center gap-2">
                                  <Loader2 className="h-4 w-4 animate-spin" />{" "}
                                  Loading ledger...
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : null}

                          {ledgerQuery.isError ? (
                            <TableRow>
                              <TableCell
                                colSpan={6}
                                className="text-center text-destructive"
                              >
                                Unable to load ledger entries. Refresh to retry.
                              </TableCell>
                            </TableRow>
                          ) : null}

                          {!ledgerQuery.isPending &&
                          !ledgerQuery.isError &&
                          ledgerEntryViews.length === 0 ? (
                            <TableRow>
                              <TableCell
                                colSpan={6}
                                className="text-center text-muted-foreground"
                              >
                                No entries yet. Create your first entry to get
                                started.
                              </TableCell>
                            </TableRow>
                          ) : null}

                          {ledgerEntryViews.map(
                            ({
                              entry,
                              pendingApproval,
                              canModifyEntry,
                              entryRevoked,
                              amount,
                              createdAt,
                              updateSummary,
                              updateTimestamp,
                              revokeReason,
                              revokeTimestamp,
                              hasRevokeEvent,
                              itemLabel,
                            }) => (
                              <TableRow
                                key={entry.id}
                                className={
                                  entryRevoked ? "opacity-70" : undefined
                                }
                              >
                                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                                  {createdAt}
                                </TableCell>
                                <TableCell className="whitespace-nowrap font-medium">
                                  <Badge
                                    variant={
                                      entry.entryType === "CREDIT"
                                        ? "secondary"
                                        : "outline"
                                    }
                                  >
                                    {entry.entryType}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-semibold">
                                  {amount.toFixed(2)}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      APPROVAL_VARIANT[entry.approvalStatus]
                                    }
                                  >
                                    {entry.approvalStatus}
                                  </Badge>
                                </TableCell>
                                <TableCell className="min-w-[200px] text-sm text-muted-foreground">
                                  <div className="space-y-1">
                                    {entry.notes ? <p>{entry.notes}</p> : null}
                                    {itemLabel ? (
                                      <p className="text-xs">
                                        <span className="font-medium text-foreground">
                                          Items:
                                        </span>{" "}
                                        {itemLabel}
                                      </p>
                                    ) : null}
                                    {!entry.notes && !itemLabel ? (
                                      <span>—</span>
                                    ) : null}
                                  </div>
                                  {updateSummary ? (
                                    <div className="mt-1 text-xs text-muted-foreground">
                                      {updateSummary}
                                      {updateTimestamp
                                        ? ` • ${updateTimestamp}`
                                        : ""}
                                    </div>
                                  ) : null}
                                  {hasRevokeEvent ? (
                                    <div className="mt-1 text-xs text-destructive">
                                      {revokeReason
                                        ? `Removed: ${revokeReason}`
                                        : "Entry removed"}
                                      {revokeTimestamp
                                        ? ` • ${revokeTimestamp}`
                                        : ""}
                                    </div>
                                  ) : null}
                                  <Button
                                    type="button"
                                    variant="link"
                                    className="mt-2 h-auto p-0 text-xs"
                                    onClick={() => setHistoryEntry(entry)}
                                  >
                                    View history
                                  </Button>
                                </TableCell>
                                <TableCell className="text-right">
                                  {pendingApproval ? (
                                    <div className="flex items-center justify-end gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={
                                          decisionMutation.isPending ||
                                          !creatorSubscriptionActive
                                        }
                                        onClick={() =>
                                          decisionMutation.mutate({
                                            entryId: entry.id,
                                            decision: "DECLINE",
                                          })
                                        }
                                      >
                                        Decline
                                      </Button>
                                      <Button
                                        size="sm"
                                        disabled={
                                          decisionMutation.isPending ||
                                          !creatorSubscriptionActive
                                        }
                                        onClick={() =>
                                          decisionMutation.mutate({
                                            entryId: entry.id,
                                            decision: "ACCEPT",
                                          })
                                        }
                                      >
                                        Accept
                                      </Button>
                                    </div>
                                  ) : canModifyEntry ? (
                                    <div className="flex items-center justify-end gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={
                                          updateEntryMutation.isPending &&
                                          editingEntry?.id === entry.id
                                        }
                                        onClick={() => {
                                          setEditingEntry(entry);
                                          setUpdateError(null);
                                        }}
                                      >
                                        Edit
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        disabled={
                                          deleteEntryMutation.isPending &&
                                          deleteEntryTarget?.id === entry.id
                                        }
                                        onClick={() => {
                                          setDeleteEntryTarget(entry);
                                          setDeleteError(null);
                                        }}
                                      >
                                        {deleteEntryMutation.isPending &&
                                        deleteEntryTarget?.id === entry.id ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          "Delete"
                                        )}
                                      </Button>
                                    </div>
                                  ) : entryRevoked ? (
                                    <span className="text-xs text-muted-foreground">
                                      Removed
                                    </span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">
                                      —
                                    </span>
                                  )}
                                </TableCell>
                              </TableRow>
                            )
                          )}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </>
                )}
              </CardContent>
            </Card>
          </section>
        ) : showManageView ? (
          <section className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Connection tools</CardTitle>
                <CardDescription>
                  Rename ledgers, jump into activity, or schedule a deletion
                  when a partnership ends.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Deleted connections disappear from your dashboard right away
                  but stay recoverable for 7 days. Ask an administrator to
                  restore them during that window.
                </p>
                <p>
                  Partners can also request deletion. If you see a pending
                  removal banner, coordinate with your admin before the
                  deadline.
                </p>
              </CardContent>
            </Card>

            {manageableConnections.length === 0 ? (
              <Card className="border-dashed bg-card/40">
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  You do not have any connections yet. Invite a partner to get
                  started.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {manageableConnections.map((connection) => {
                  const isCreatorPerspective = connection.parent.id === user.id;
                  const alias = isCreatorPerspective
                    ? connection.parentAlias
                    : connection.childAlias;
                  const partner = isCreatorPerspective
                    ? connection.child
                    : connection.parent;
                  const displayName =
                    alias && alias.length > 0
                      ? alias
                      : partner.name ?? partner.email ?? "Unnamed partner";
                  const showActualName =
                    alias &&
                    alias.length > 0 &&
                    partner.name &&
                    alias !== partner.name;
                  const outstandingValue = connection.balance
                    ? Number(connection.balance.outstanding)
                    : 0;
                  const outstandingDisplay = outstandingValue.toFixed(2);
                  const balanceSettled = Math.abs(outstandingValue) < 0.005;
                  const statusVariant = STATUS_VARIANT[connection.status];
                  const deletionDeadline = connection.deletion
                    ? new Date(connection.deletion.expiresAt)
                    : null;
                  const partnerRequestedDeletion = Boolean(
                    connection.deletion &&
                      connection.deletion.requestedById !== user.id
                  );
                  const deletionCountdown =
                    connection.deletion && deletionDeadline
                      ? formatTimeUntil(deletionDeadline)
                      : null;
                  const deletingThisConnection =
                    deleteConnectionMutation.isPending &&
                    deleteConnectionTarget?.id === connection.id;
                  const canDeleteConnection = balanceSettled;

                  return (
                    <Card key={connection.id} className="flex flex-col">
                      <CardHeader className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-lg">
                            {displayName}
                          </CardTitle>
                          <Badge variant={statusVariant}>
                            {connection.status}
                          </Badge>
                        </div>
                        <CardDescription className="space-y-1 text-sm">
                          {showActualName ? <p>{partner.name}</p> : null}
                          {partner.email ? <p>{partner.email}</p> : null}
                          {partner.phone ? <p>{partner.phone}</p> : null}
                          <p>
                            Linked on{" "}
                            {new Date(
                              connection.createdAt
                            ).toLocaleDateString()}
                          </p>
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="rounded-full border border-border/70 px-3 py-1">
                            Outstanding {outstandingDisplay}
                          </span>
                          <span className="rounded-full border border-border/70 px-3 py-1">
                            Role: {isCreatorPerspective ? "Creator" : "Partner"}
                          </span>
                        </div>
                        {!balanceSettled ? (
                          <p className="text-xs text-destructive">
                            Settle the outstanding balance before deleting this
                            connection.
                          </p>
                        ) : null}
                        {connection.deletion ? (
                          <div
                            className={`rounded-md border p-3 text-xs ${
                              partnerRequestedDeletion
                                ? "border-destructive/40 bg-destructive/10 text-destructive"
                                : "border-border/60 bg-muted/30 text-muted-foreground"
                            }`}
                          >
                            {partnerRequestedDeletion ? (
                              <span className="flex flex-col gap-1">
                                <span>
                                  Partner removed this ledger from their
                                  dashboard • {deletionCountdown ?? "Pending"}
                                </span>
                                <span className="text-destructive/80">
                                  Ledger is read-only until you delete it from
                                  your side.
                                </span>
                              </span>
                            ) : (
                              <span>
                                Removal scheduled •{" "}
                                {deletionCountdown ?? "Pending"}
                              </span>
                            )}
                          </div>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            onClick={() => {
                              if (!connection.creatorSubscriptionActive) {
                                const lockMessage =
                                  connection.parent.id === user.id
                                    ? creatorSubscriptionPrompt
                                    : partnerSubscriptionPrompt;
                                setFeedback(lockMessage);
                                setSelectedConnectionId(undefined);
                                setViewMode("dashboard");
                                return;
                              }
                              setSelectedConnectionId(connection.id);
                              setViewMode("ledger");
                            }}
                          >
                            Open ledger
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => openAliasDialog(connection)}
                            disabled={partnerRequestedDeletion}
                            title={
                              partnerRequestedDeletion
                                ? "Ledger is read-only while partner deletion is pending"
                                : undefined
                            }
                          >
                            <Pencil className="mr-2 h-4 w-4" /> Edit Name
                          </Button>
                          <Button
                            variant="destructive"
                            disabled={
                              deleteConnectionMutation.isPending ||
                              !canDeleteConnection
                            }
                            onClick={() => {
                              setDeleteConnectionTarget(connection);
                              setDeleteConnectionError(null);
                            }}
                            title={
                              !canDeleteConnection
                                ? "Settle the outstanding balance before deleting"
                                : undefined
                            }
                          >
                            {deletingThisConnection ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="mr-2 h-4 w-4" />
                            )}
                            Delete
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        ) : showAccountView ? (
          <section className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Account profile</CardTitle>
                <CardDescription>
                  Review the information associated with your signed-in account.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-medium text-foreground">
                    {user.name ?? "—"}
                  </span>
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-medium text-foreground">
                    {user.email ?? "—"}
                  </span>
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Phone</span>
                  <span className="font-medium text-foreground">
                    {accountPhone ?? "—"}
                  </span>
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Role</span>
                  <span className="font-medium text-foreground">
                    {accountRoleLabel}
                  </span>
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Status</span>
                  <Badge>{user.status}</Badge>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Subscription status</CardTitle>
                <CardDescription>
                  {hasActiveAccountSubscription
                    ? "Active creator subscriptions linked to your account."
                    : "No active creator subscription on file."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {hasActiveAccountSubscription ? (
                  accountSubscriptions.map((subscription) => {
                    const planLabel =
                      subscription.plan === "CREATOR_PRO"
                        ? "Creator Pro"
                        : "Creator Basic";
                    const activatedLabel = subscription.activatedAt
                      ? new Date(subscription.activatedAt).toLocaleDateString()
                      : "Not recorded";
                    const expiresLabel = subscription.expiresAt
                      ? new Date(subscription.expiresAt).toLocaleDateString()
                      : "No expiry";

                    return (
                      <div
                        key={subscription.id}
                        className="rounded-lg border border-border/70 bg-card/60 p-4"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground">
                            {planLabel}
                          </span>
                          <Badge variant="secondary">Active</Badge>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Activated {activatedLabel} • Expires {expiresLabel}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-muted-foreground">
                    Purchase a creator subscription to unlock downstream
                    ledgers.
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Connections snapshot</CardTitle>
                <CardDescription>
                  Track how many ledgers you have across different states.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border/70 bg-card/60 p-4 text-sm">
                    <dt className="text-muted-foreground">Total</dt>
                    <dd className="text-2xl font-semibold">
                      {totalConnections}
                    </dd>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-card/60 p-4 text-sm">
                    <dt className="text-muted-foreground">Active</dt>
                    <dd className="text-2xl font-semibold">
                      {activeConnections}
                    </dd>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-card/60 p-4 text-sm">
                    <dt className="text-muted-foreground">Pending invites</dt>
                    <dd className="text-2xl font-semibold">
                      {pendingConnections}
                    </dd>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-card/60 p-4 text-sm">
                    <dt className="text-muted-foreground">Blocked</dt>
                    <dd className="text-2xl font-semibold">
                      {blockedConnections}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </section>
        ) : (
          <>
            <section className="hidden flex-col items-center justify-center rounded-3xl border border-dashed border-border/70 bg-card/40 p-10 text-center md:flex">
              <h2 className="text-xl font-semibold text-foreground">
                No ledger selected
              </h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                Pick a connection from the list to open its ledger. You can also
                invite a new partner if you do not see them yet.
              </p>
              <Button
                className="mt-4"
                variant="outline"
                onClick={() => {
                  setInviteDialogOpen(true);
                  setInviteError(null);
                }}
              >
                <Plus className="mr-2 h-4 w-4" /> Invite partner
              </Button>
            </section>
            <section className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card/40 p-6 text-sm md:hidden">
              <p className="text-center text-muted-foreground">
                Select a connection above to open its ledger. You can always
                invite new partners from the menu.
              </p>
            </section>
          </>
        )}
      </div>

      <Dialog
        open={aliasDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setAliasDialogOpen(false);
            setAliasError(null);
            setAliasTargetId(null);
            setAliasValue("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit partner alias</DialogTitle>
            <DialogDescription>
              Choose a nickname to help you recognize this ledger. This alias is
              only visible to you.
            </DialogDescription>
          </DialogHeader>
          {aliasError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {aliasError}
            </div>
          ) : null}
          {aliasDialogConnection ? (
            <form className="space-y-4" onSubmit={handleAliasSubmit}>
              <div className="space-y-2">
                <Label htmlFor="connection-alias">Alias</Label>
                <Input
                  id="connection-alias"
                  name="alias"
                  value={aliasValue}
                  onChange={(event) => setAliasValue(event.target.value)}
                  placeholder="e.g. Main bazaar branch"
                  autoComplete="off"
                />
                {aliasDialogPartnerActualName ? (
                  <p className="text-xs text-muted-foreground">
                    Actual name: {aliasDialogPartnerActualName}
                  </p>
                ) : null}
              </div>
              <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                {aliasDialogIsCreator && aliasDialogAlias ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="sm:mr-auto"
                    onClick={() => {
                      setAliasValue("");
                      setAliasError(null);
                      updateAliasMutation.mutate({ alias: null });
                    }}
                    disabled={updateAliasMutation.isPending}
                  >
                    Remove alias
                  </Button>
                ) : null}
                <Button
                  type="submit"
                  className="w-full sm:w-auto"
                  disabled={updateAliasMutation.isPending}
                >
                  {updateAliasMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Save alias"
                  )}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Connection details are no longer available.
            </p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteConnectionTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteConnectionTarget(null);
            setDeleteConnectionError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule connection deletion</DialogTitle>
            <DialogDescription>
              We hide this ledger from your dashboard immediately and
              permanently remove it in 7 days unless an admin restores it.
            </DialogDescription>
          </DialogHeader>
          {deleteConnectionError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {deleteConnectionError}
            </div>
          ) : null}
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Deleted connections can only be recovered by an administrator
              during the one-week grace period. Reach out to support if you need
              to reverse this action.
            </p>
            <p>
              The historical ledger remains intact for your partner until the
              deletion window expires.
            </p>
          </div>
          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDeleteConnectionTarget(null);
                setDeleteConnectionError(null);
              }}
              disabled={deleteConnectionMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={
                !deleteConnectionTarget || deleteConnectionMutation.isPending
              }
              onClick={() => {
                if (!deleteConnectionTarget) {
                  return;
                }
                deleteConnectionMutation.mutate(deleteConnectionTarget.id);
              }}
            >
              {deleteConnectionMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Delete connection"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="max-w-[90vw] p-4 sm:max-w-lg sm:p-6">
          <DialogHeader>
            <DialogTitle>Invite a downstream partner</DialogTitle>
            <DialogDescription>
              Creator plans cover invites. Your partner will receive
              instructions to join WebAuto Chain.
            </DialogDescription>
          </DialogHeader>
          {inviteError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {inviteError}
            </div>
          ) : null}
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              handleInviteSubmit(new FormData(event.currentTarget));
              if (!createConnectionMutation.isError) {
                event.currentTarget.reset();
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="partnerContact">Partner email or phone</Label>
              <Input
                id="partnerContact"
                name="partnerContact"
                placeholder="name@example.com or +92 300 1234567"
                type="text"
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={createConnectionMutation.isPending}
            >
              {createConnectionMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Send invitation"
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
