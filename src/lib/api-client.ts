import type {
  AdminNetworkOverview,
  AdminUserSummary,
  PendingConnectionDeletionSummary,
} from "@/lib/admin";
import type { ConnectionSummary } from "@/lib/connections";
import type { LedgerEntryRecord } from "@/lib/ledger";
import type {
  MonthlyLedgerSummary,
  SerializedLedgerEntrySummary,
} from "@/lib/reports";

export async function apiFetch<T>(
  input: RequestInfo,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(input, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "";

    let message = text || response.statusText;

    if (text && contentType.includes("application/json")) {
      try {
        const parsed = JSON.parse(text) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const candidate =
            typeof (parsed as { error?: unknown }).error === "string"
              ? (parsed as { error: string }).error
              : typeof (parsed as { message?: unknown }).message === "string"
              ? (parsed as { message: string }).message
              : null;

          if (candidate) {
            message = candidate;
          }
        } else if (typeof parsed === "string") {
          message = parsed;
        }
      } catch {
        // Ignore JSON parse errors; fall back to raw text
      }
    }

    if (!message) {
      message = "Request failed";
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export interface AccountSubscriptionSummary {
  id: string;
  plan: "CREATOR_BASIC" | "CREATOR_PRO";
  activatedAt: string | null;
  expiresAt: string | null;
}

export interface AccountProfileSummary {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  subscriptions: AccountSubscriptionSummary[];
}

export interface ConnectionsResponse {
  connections: ConnectionSummary[];
  account?: AccountProfileSummary | null;
}

export async function getConnections(): Promise<ConnectionsResponse> {
  return apiFetch<ConnectionsResponse>("/api/connections");
}

export interface ConnectionResponse {
  connection: ConnectionSummary;
}

export async function createConnectionRequest(
  payload: Record<string, unknown>
): Promise<ConnectionResponse> {
  return apiFetch<ConnectionResponse>("/api/connections", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function scheduleConnectionDeletionRequest(
  connectionId: string
): Promise<ConnectionResponse> {
  return apiFetch<ConnectionResponse>(`/api/connections/${connectionId}`, {
    method: "DELETE",
  });
}

export async function updateConnectionAliasRequest(
  connectionId: string,
  payload: { alias: string | null }
): Promise<ConnectionResponse> {
  return apiFetch<ConnectionResponse>(
    `/api/connections/${connectionId}/alias`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    }
  );
}

export async function acceptConnectionRequest(
  connectionId: string
): Promise<ConnectionResponse> {
  return apiFetch<ConnectionResponse>(
    `/api/connections/${connectionId}/accept`,
    {
      method: "POST",
    }
  );
}

export async function declineConnectionRequest(
  connectionId: string
): Promise<ConnectionResponse> {
  return apiFetch<ConnectionResponse>(
    `/api/connections/${connectionId}/decline`,
    {
      method: "POST",
    }
  );
}

export interface LedgerResponse {
  entries: LedgerEntryRecord[];
}

export async function getLedger(connectionId: string): Promise<LedgerResponse> {
  return apiFetch<LedgerResponse>(`/api/connections/${connectionId}/ledger`);
}

export async function createLedgerEntryRequest(
  connectionId: string,
  payload: Record<string, unknown>
) {
  return apiFetch(`/api/connections/${connectionId}/ledger`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function respondLedgerEntry(
  entryId: string,
  payload: Record<string, unknown>
) {
  return apiFetch(`/api/ledger/${entryId}/decision`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateLedgerEntryRequest(
  entryId: string,
  payload: Record<string, unknown>
) {
  return apiFetch(`/api/ledger/${entryId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteLedgerEntryRequest(
  entryId: string,
  payload?: Record<string, unknown>
) {
  return apiFetch(`/api/ledger/${entryId}`, {
    method: "DELETE",
    body: payload ? JSON.stringify(payload) : undefined,
  });
}

export interface MonthlyReportResponse {
  summary: {
    connection: MonthlyLedgerSummary["connection"];
    totals: Omit<
      MonthlyLedgerSummary["totals"],
      "periodStart" | "periodEnd"
    > & {
      periodStart: string;
      periodEnd: string;
    };
    entries: SerializedLedgerEntrySummary[];
    csv: string;
    csvFilename: string;
  };
}

export async function getMonthlyReport(
  connectionId: string,
  options?: {
    month?: string;
    startDate?: string;
    endDate?: string;
  }
): Promise<MonthlyReportResponse> {
  const params = new URLSearchParams({ connectionId });
  if (options?.month) {
    params.set("month", options.month);
  }
  if (options?.startDate) {
    params.set("startDate", options.startDate);
  }
  if (options?.endDate) {
    params.set("endDate", options.endDate);
  }

  return apiFetch<MonthlyReportResponse>(
    `/api/reports/monthly?${params.toString()}`
  );
}

export interface AdminUsersResponse {
  users: AdminUserSummary[];
}

export async function getAdminUsers(): Promise<AdminUsersResponse> {
  return apiFetch<AdminUsersResponse>("/api/admin/users");
}

export async function updateAdminUserStatus(
  userId: string,
  status: "ACTIVE" | "DEACTIVATED" | "SUSPENDED"
): Promise<{ user: AdminUserSummary }> {
  return apiFetch<{ user: AdminUserSummary }>("/api/admin/users", {
    method: "PATCH",
    body: JSON.stringify({ userId, status }),
  });
}

export async function updateAdminManagedUser(
  userId: string,
  payload: {
    name: string;
    email: string;
    phone: string | null;
    status: "ACTIVE" | "DEACTIVATED" | "SUSPENDED";
    password?: string;
  }
): Promise<{ user: AdminUserSummary }> {
  return apiFetch<{ user: AdminUserSummary }>(`/api/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteAdminManagedUser(
  userId: string
): Promise<{ success: true }> {
  return apiFetch<{ success: true }>(`/api/admin/users/${userId}`, {
    method: "DELETE",
  });
}

export async function activateCreatorSubscription(payload: {
  ownerId: string;
  plan: "CREATOR_BASIC" | "CREATOR_PRO";
  durationDays?: number;
}): Promise<{ subscription: unknown }> {
  return apiFetch(`/api/admin/subscriptions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function revokeCreatorSubscription(payload: {
  ownerId: string;
}): Promise<{ subscription: unknown }> {
  return apiFetch(`/api/admin/subscriptions`, {
    method: "DELETE",
    body: JSON.stringify(payload),
  });
}

export interface PendingConnectionDeletionsResponse {
  deletions: PendingConnectionDeletionSummary[];
}

export async function getPendingConnectionDeletions(): Promise<PendingConnectionDeletionsResponse> {
  return apiFetch<PendingConnectionDeletionsResponse>(
    "/api/admin/connection-deletions"
  );
}

export async function restoreConnectionDeletionRequest(
  connectionId: string
): Promise<ConnectionResponse> {
  return apiFetch<ConnectionResponse>(
    "/api/admin/connection-deletions/restore",
    {
      method: "POST",
      body: JSON.stringify({ connectionId }),
    }
  );
}

export async function getAdminNetworkOverview(): Promise<AdminNetworkOverview> {
  const response = await apiFetch<{ overview: AdminNetworkOverview }>(
    "/api/admin/network"
  );
  return response.overview;
}
