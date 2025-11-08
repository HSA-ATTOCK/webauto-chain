import {
  connectionSummaryInclude,
  normalizeConnection,
  purgeExpiredConnectionDeletions,
  type ConnectionSummary,
  type ConnectionWithRelations,
} from "@/lib/connections";
import { hashPassword } from "@/lib/auth/password";
import type { LedgerEntryKind } from "@/lib/ledger";
import { prisma } from "@/lib/prisma";

const adminUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  status: true,
  isAdmin: true,
  createdAt: true,
  parentConnections: {
    select: { id: true },
  },
  childConnections: {
    select: { id: true },
  },
  subscriptions: {
    where: { status: "ACTIVE" },
    orderBy: { activatedAt: "desc" },
    select: {
      id: true,
      plan: true,
      expiresAt: true,
      activatedAt: true,
    },
  },
} as const;

const MANAGE_EMAIL_REGEX =
  /^(?:[a-zA-Z0-9_'^&/+-])+(?:\.(?:[a-zA-Z0-9_'^&/+-])+)*@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
const MANAGE_PHONE_REGEX = /^[0-9+\-\s]{7,15}$/;

type AdminUserRecord = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  isAdmin: boolean;
  createdAt: Date;
  parentConnections: Array<{ id: string }>;
  childConnections: Array<{ id: string }>;
  subscriptions: Array<{
    id: string;
    plan: string;
    activatedAt: Date | null;
    expiresAt: Date | null;
  }>;
};

export interface AdminSubscriptionSummary {
  id: string;
  plan: string;
  activatedAt: string | null;
  expiresAt: string | null;
}

export interface AdminUserSummary {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  isAdmin: boolean;
  createdAt: string;
  upstreamCount: number;
  downstreamCount: number;
  activeSubscriptions: AdminSubscriptionSummary[];
}

export interface PendingConnectionDeletionSummary {
  id: string;
  connection: ConnectionSummary;
  requestedBy: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
  };
  acknowledgedBy: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  createdAt: string;
  expiresAt: string;
  acknowledgedAt: string | null;
}

export interface AdminNetworkLedgerStatusEventSummary {
  id: string;
  action: string;
  metadata: unknown;
  createdAt: string;
  actor: {
    id: string;
    name: string | null;
  };
}

export interface AdminNetworkLedgerEntrySummary {
  id: string;
  entryType: LedgerEntryKind;
  approvalStatus: string;
  amount: number;
  notes: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    name: string | null;
  };
  items: unknown;
  history: AdminNetworkLedgerStatusEventSummary[];
}

export interface AdminNetworkConnectionDeletionSummary {
  requestedById: string;
  acknowledgedById: string | null;
  acknowledgedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface AdminNetworkConnectionSummary {
  id: string;
  status: ConnectionSummary["status"];
  createdAt: string;
  updatedAt: string;
  createdById: string | null;
  parentAlias: string | null;
  childAlias: string | null;
  parent: ConnectionSummary["parent"];
  child: ConnectionSummary["child"];
  balance: ConnectionSummary["balance"];
  creatorSubscriptionActive: boolean;
  deletion: AdminNetworkConnectionDeletionSummary | null;
  ledgerEntries: AdminNetworkLedgerEntrySummary[];
  ledgerEntryCount: number;
  lastActivityAt: string | null;
}

export interface AdminNetworkUserNode {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  isAdmin: boolean;
  createdAt: string;
  upstreamConnections: AdminNetworkConnectionSummary[];
  downstreamConnections: AdminNetworkConnectionSummary[];
  upstreamCount: number;
  downstreamCount: number;
  connectionCount: number;
  ledgerEntryCount: number;
  lastActivityAt: string | null;
}

export interface AdminNetworkOverview {
  generatedAt: string;
  totals: {
    userCount: number;
    connectionCount: number;
    ledgerEntryCount: number;
  };
  users: AdminNetworkUserNode[];
}

function toAdminUserSummary(record: AdminUserRecord): AdminUserSummary {
  return {
    id: record.id,
    name: record.name ?? null,
    email: record.email ?? null,
    phone: record.phone ?? null,
    status: record.status,
    isAdmin: record.isAdmin,
    createdAt: record.createdAt.toISOString(),
    upstreamCount: record.childConnections.length,
    downstreamCount: record.parentConnections.length,
    activeSubscriptions: record.subscriptions.map(
      (subscription: AdminUserRecord["subscriptions"][number]) => ({
        id: subscription.id,
        plan: subscription.plan,
        activatedAt: subscription.activatedAt
          ? subscription.activatedAt.toISOString()
          : null,
        expiresAt: subscription.expiresAt
          ? subscription.expiresAt.toISOString()
          : null,
      })
    ),
  };
}

export async function getAdminUserOverview(options?: {
  includeAdmins?: boolean;
}): Promise<AdminUserSummary[]> {
  const includeAdmins = options?.includeAdmins ?? false;

  const users = (await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: adminUserSelect,
    ...(includeAdmins ? {} : { where: { isAdmin: false } }),
  })) as AdminUserRecord[];

  return users.map(toAdminUserSummary);
}

export async function getPendingConnectionDeletionOverview(): Promise<
  PendingConnectionDeletionSummary[]
> {
  await purgeExpiredConnectionDeletions();

  const deletions = await prisma.connectionDeletion.findMany({
    where: {
      expiresAt: {
        gt: new Date(),
      },
    },
    orderBy: { expiresAt: "asc" },
    include: {
      requestedBy: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      },
      acknowledgedBy: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      },
      connection: {
        include: connectionSummaryInclude,
      },
    },
  });

  const parentIds = Array.from(
    new Set(deletions.map((record) => record.connection.parentId))
  );

  const activeSubscriptions = parentIds.length
    ? await prisma.subscription.findMany({
        where: {
          ownerId: { in: parentIds },
          status: "ACTIVE",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { ownerId: true },
      })
    : [];

  const activeOwnerIds = new Set(
    activeSubscriptions.map((item) => item.ownerId)
  );

  return deletions.map((deletion) => ({
    id: deletion.id,
    connection: normalizeConnection(
      deletion.connection as unknown as ConnectionWithRelations,
      {
        creatorSubscriptionActive: activeOwnerIds.has(
          deletion.connection.parentId
        ),
      }
    ),
    requestedBy: {
      id: deletion.requestedBy.id,
      name: deletion.requestedBy.name,
      email: deletion.requestedBy.email,
      phone: deletion.requestedBy.phone,
    },
    acknowledgedBy: deletion.acknowledgedBy
      ? {
          id: deletion.acknowledgedBy.id,
          name: deletion.acknowledgedBy.name,
          email: deletion.acknowledgedBy.email,
          phone: deletion.acknowledgedBy.phone,
        }
      : null,
    createdAt: deletion.createdAt.toISOString(),
    expiresAt: deletion.expiresAt.toISOString(),
    acknowledgedAt: deletion.acknowledgedAt
      ? deletion.acknowledgedAt.toISOString()
      : null,
  }));
}

export async function setUserStatus(
  userId: string,
  status: "ACTIVE" | "DEACTIVATED" | "SUSPENDED"
): Promise<AdminUserSummary> {
  await prisma.user.update({
    where: { id: userId },
    data: { status },
  });

  if (status === "DEACTIVATED") {
    await prisma.connection.updateMany({
      where: {
        parentId: userId,
        status: { notIn: ["ARCHIVED", "BLOCKED"] },
      },
      data: { status: "BLOCKED" },
    });
  }

  if (status === "ACTIVE") {
    await prisma.connection.updateMany({
      where: {
        parentId: userId,
        status: "BLOCKED",
      },
      data: { status: "ACTIVE" },
    });
  }

  await prisma.notification.create({
    data: {
      accountId: userId,
      channel: "IN_APP",
      type: "ACCOUNT_STATUS",
      title: `Your account is now ${status.toLowerCase()}`,
      body:
        status === "DEACTIVATED"
          ? "You can only view ledgers created by your upstream partners."
          : "Access to your ledgers has been restored.",
    },
  });

  const refreshed = (await prisma.user.findUnique({
    where: { id: userId },
    select: adminUserSelect,
  })) as AdminUserRecord | null;

  if (!refreshed) {
    throw new Error("User not found");
  }

  return toAdminUserSummary(refreshed);
}

export async function updateManagedUser(
  userId: string,
  updates: {
    name: string;
    email: string;
    phone: string | null;
    status: "ACTIVE" | "DEACTIVATED" | "SUSPENDED";
    password?: string;
  }
): Promise<AdminUserSummary> {
  const existing = (await prisma.user.findUnique({
    where: { id: userId },
    select: adminUserSelect,
  })) as AdminUserRecord | null;

  if (!existing) {
    throw new Error("User not found.");
  }

  if (existing.isAdmin) {
    throw new Error("Administrators cannot be managed through this interface.");
  }

  const name = updates.name.trim();
  const email = updates.email.trim();
  const phone = updates.phone ? updates.phone.trim() : "";

  if (!name) {
    throw new Error("Name is required.");
  }

  if (!email) {
    throw new Error("Email is required.");
  }

  if (!MANAGE_EMAIL_REGEX.test(email)) {
    throw new Error("Provide a valid email address.");
  }

  if (phone && !MANAGE_PHONE_REGEX.test(phone)) {
    throw new Error("Provide a valid phone number.");
  }

  const [emailConflict, phoneConflict] = await Promise.all([
    prisma.user.findFirst({
      where: {
        id: { not: userId },
        email: {
          equals: email,
          mode: "insensitive",
        },
      },
      select: { id: true },
    }),
    phone
      ? prisma.user.findFirst({
          where: {
            id: { not: userId },
            phone: {
              equals: phone,
              mode: "insensitive",
            },
          },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  if (emailConflict) {
    throw new Error("Another account already uses that email address.");
  }

  if (phoneConflict) {
    throw new Error("Another account already uses that phone number.");
  }

  const updatePayload: {
    name: string;
    email: string;
    phone: string | null;
    status: "ACTIVE" | "DEACTIVATED" | "SUSPENDED";
    passwordHash?: string;
  } = {
    name,
    email,
    phone: phone ? phone : null,
    status: updates.status,
  };

  if (updates.password && updates.password.trim()) {
    const sanitized = updates.password.trim();
    if (sanitized.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }
    updatePayload.passwordHash = await hashPassword(sanitized);
  }

  const updated = (await prisma.user.update({
    where: { id: userId },
    data: updatePayload,
    select: adminUserSelect,
  })) as AdminUserRecord;

  return toAdminUserSummary(updated);
}

export async function deleteManagedUser(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isAdmin: true,
        parentConnections: { select: { id: true }, take: 1 },
        childConnections: { select: { id: true }, take: 1 },
      },
    });

    if (!target) {
      throw new Error("User not found.");
    }

    if (target.isAdmin) {
      throw new Error("Administrators cannot be removed.");
    }

    if (
      target.parentConnections.length > 0 ||
      target.childConnections.length > 0
    ) {
      throw new Error(
        "Disconnect the user's active ledgers before deleting the account."
      );
    }

    const ledgerEntries = await tx.ledgerEntry.count({
      where: { createdById: userId },
    });

    if (ledgerEntries > 0) {
      throw new Error(
        "Remove ledger activity created by this user before deleting the account."
      );
    }

    await tx.ledgerStatusEvent.deleteMany({ where: { actorId: userId } });
    await tx.connectionDeletion.deleteMany({
      where: { requestedById: userId },
    });
    await tx.connectionDeletion.deleteMany({
      where: { acknowledgedById: userId },
    });
    await tx.subscriptionInvoice.deleteMany({
      where: {
        subscription: {
          ownerId: userId,
        },
      },
    });
    await tx.subscription.deleteMany({ where: { ownerId: userId } });
    await tx.notification.deleteMany({ where: { accountId: userId } });
    await tx.auditLog.deleteMany({ where: { actorId: userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });
    await tx.authenticator.deleteMany({ where: { userId } });

    await tx.user.delete({ where: { id: userId } });
  });
}

export async function getAdminNetworkOverview(): Promise<AdminNetworkOverview> {
  await purgeExpiredConnectionDeletions();

  const [users, connections] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        isAdmin: true,
        createdAt: true,
      },
    }),
    prisma.connection.findMany({
      where: { status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "desc" },
      include: {
        ...connectionSummaryInclude,
        ledgerEntries: {
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
        },
      },
    }),
  ]);

  const parentIds = Array.from(
    new Set(connections.map((item) => item.parentId))
  );
  const now = new Date();
  const activeSubscriptions = parentIds.length
    ? await prisma.subscription.findMany({
        where: {
          ownerId: { in: parentIds },
          status: "ACTIVE",
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { ownerId: true },
      })
    : [];
  const activeOwnerIds = new Set(
    activeSubscriptions.map((record) => record.ownerId)
  );

  const connectionSummaries: AdminNetworkConnectionSummary[] = connections.map(
    (connection) => {
      const normalized = normalizeConnection(
        connection as unknown as ConnectionWithRelations,
        {
          creatorSubscriptionActive: activeOwnerIds.has(connection.parentId),
        }
      );

      let lastActivity: Date | null = normalized.updatedAt;

      const ledgerEntries: AdminNetworkLedgerEntrySummary[] =
        connection.ledgerEntries.map((entry) => {
          if (!lastActivity || entry.createdAt > lastActivity) {
            lastActivity = entry.createdAt;
          }

          const history: AdminNetworkLedgerStatusEventSummary[] =
            entry.statusEvents.map((event) => {
              if (!lastActivity || event.createdAt > lastActivity) {
                lastActivity = event.createdAt;
              }

              return {
                id: event.id,
                action: event.action,
                metadata: event.metadata ?? null,
                createdAt: event.createdAt.toISOString(),
                actor: {
                  id: event.actor.id,
                  name: event.actor.name ?? null,
                },
              };
            });

          return {
            id: entry.id,
            entryType: entry.entryType as LedgerEntryKind,
            approvalStatus: entry.approvalStatus,
            amount: Number(entry.amount),
            notes: entry.notes ?? null,
            dueDate: entry.dueDate ? entry.dueDate.toISOString() : null,
            createdAt: entry.createdAt.toISOString(),
            updatedAt: entry.updatedAt.toISOString(),
            createdBy: {
              id: entry.createdBy.id,
              name: entry.createdBy.name ?? null,
            },
            items: entry.items ?? null,
            history,
          };
        });

      const ledgerEntryCount = ledgerEntries.length;
      const lastActivityAt = lastActivity ? lastActivity.toISOString() : null;

      return {
        id: normalized.id,
        status: normalized.status,
        createdAt: normalized.createdAt.toISOString(),
        updatedAt: normalized.updatedAt.toISOString(),
        createdById: normalized.createdById,
        parentAlias: normalized.parentAlias,
        childAlias: normalized.childAlias,
        parent: normalized.parent,
        child: normalized.child,
        balance: normalized.balance,
        creatorSubscriptionActive: normalized.creatorSubscriptionActive,
        deletion: normalized.deletion
          ? {
              requestedById: normalized.deletion.requestedById,
              acknowledgedById: normalized.deletion.acknowledgedById ?? null,
              acknowledgedAt: normalized.deletion.acknowledgedAt
                ? normalized.deletion.acknowledgedAt.toISOString()
                : null,
              expiresAt: normalized.deletion.expiresAt.toISOString(),
              createdAt: normalized.deletion.createdAt.toISOString(),
            }
          : null,
        ledgerEntries,
        ledgerEntryCount,
        lastActivityAt,
      };
    }
  );

  const userMap = new Map<string, AdminNetworkUserNode>();

  users.forEach((user) => {
    userMap.set(user.id, {
      id: user.id,
      name: user.name ?? null,
      email: user.email ?? null,
      phone: user.phone ?? null,
      status: user.status,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt.toISOString(),
      upstreamConnections: [],
      downstreamConnections: [],
      upstreamCount: 0,
      downstreamCount: 0,
      connectionCount: 0,
      ledgerEntryCount: 0,
      lastActivityAt: null,
    });
  });

  const updateLastActivity = (
    node: AdminNetworkUserNode | undefined,
    lastActivityAt: string | null
  ) => {
    if (!node || !lastActivityAt) {
      return;
    }

    if (!node.lastActivityAt || lastActivityAt > node.lastActivityAt) {
      node.lastActivityAt = lastActivityAt;
    }
  };

  for (const connection of connectionSummaries) {
    const parentNode = userMap.get(connection.parent.id);
    if (parentNode) {
      parentNode.downstreamConnections.push(connection);
      parentNode.downstreamCount += 1;
      parentNode.connectionCount += 1;
      parentNode.ledgerEntryCount += connection.ledgerEntryCount;
      updateLastActivity(parentNode, connection.lastActivityAt);
    }

    const childNode = userMap.get(connection.child.id);
    if (childNode) {
      childNode.upstreamConnections.push(connection);
      childNode.upstreamCount += 1;
      childNode.connectionCount += 1;
      childNode.ledgerEntryCount += connection.ledgerEntryCount;
      updateLastActivity(childNode, connection.lastActivityAt);
    }
  }

  const sortedUsers = Array.from(userMap.values()).sort((a, b) => {
    const nameA = (a.name ?? "").toLowerCase();
    const nameB = (b.name ?? "").toLowerCase();

    if (nameA && nameB) {
      const comparison = nameA.localeCompare(nameB);
      if (comparison !== 0) {
        return comparison;
      }
    } else if (nameA) {
      return -1;
    } else if (nameB) {
      return 1;
    }

    return a.createdAt.localeCompare(b.createdAt);
  });

  const totalLedgerEntries = connectionSummaries.reduce(
    (sum, connection) => sum + connection.ledgerEntryCount,
    0
  );

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      userCount: sortedUsers.length,
      connectionCount: connectionSummaries.length,
      ledgerEntryCount: totalLedgerEntries,
    },
    users: sortedUsers,
  };
}

export async function activateSubscription(
  ownerId: string,
  plan: "CREATOR_BASIC" | "CREATOR_PRO",
  durationDays = 365
) {
  const subscription = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + durationDays * 24 * 60 * 60 * 1000
    );

    const nextState = {
      plan,
      activatedAt: now,
      expiresAt,
      status: "ACTIVE" as const,
      cancelledAt: null,
    };

    const existingActive = await tx.subscription.findUnique({
      where: {
        ownerId_status: {
          ownerId,
          status: "ACTIVE",
        },
      },
    });

    if (existingActive) {
      return tx.subscription.update({
        where: { id: existingActive.id },
        data: nextState,
      });
    }

    const existingCancelled = await tx.subscription.findFirst({
      where: { ownerId, status: "CANCELLED" },
      orderBy: { updatedAt: "desc" },
    });

    if (existingCancelled) {
      return tx.subscription.update({
        where: { id: existingCancelled.id },
        data: nextState,
      });
    }

    return tx.subscription.create({
      data: {
        ownerId,
        ...nextState,
      },
    });
  });

  return subscription;
}

export async function revokeSubscription(ownerId: string) {
  const subscription = await prisma.$transaction(async (tx) => {
    const active = await tx.subscription.findUnique({
      where: {
        ownerId_status: {
          ownerId,
          status: "ACTIVE",
        },
      },
    });

    if (!active) {
      const error = new Error("No active subscription found to revoke.");
      error.name = "NotFoundError";
      throw error;
    }

    await tx.subscription.deleteMany({
      where: {
        ownerId,
        status: "CANCELLED",
        NOT: { id: active.id },
      },
    });

    const now = new Date();

    return tx.subscription.update({
      where: { id: active.id },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        expiresAt: now,
      },
    });
  });

  await prisma.notification.create({
    data: {
      accountId: ownerId,
      channel: "IN_APP",
      type: "SUBSCRIPTION_RENEWAL",
      title: "Creator subscription revoked",
      body: "An administrator revoked your creator subscription. Renew to unlock downstream ledgers.",
    },
  });

  return subscription;
}
