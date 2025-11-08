import { prisma } from "@/lib/prisma";
import {
  assertActiveCreatorSubscription,
  hasActiveCreatorSubscription,
} from "@/lib/subscription";

type UserSummary = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
};

export type ConnectionStatus = "PENDING" | "ACTIVE" | "BLOCKED" | "ARCHIVED";

export interface ConnectionDeletionSummary {
  requestedById: string;
  acknowledgedById: string | null;
  acknowledgedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

export interface ConnectionSummary {
  id: string;
  status: ConnectionStatus;
  createdAt: Date;
  updatedAt: Date;
  createdById: string | null;
  parentAlias: string | null;
  childAlias: string | null;
  parent: UserSummary;
  child: UserSummary;
  balance: {
    totalCredit: number;
    totalPayments: number;
    outstanding: number;
  } | null;
  deletion: ConnectionDeletionSummary | null;
  creatorSubscriptionActive: boolean;
}

export const connectionSummaryInclude = {
  parent: {
    select: { id: true, name: true, email: true, phone: true, status: true },
  },
  child: {
    select: { id: true, name: true, email: true, phone: true, status: true },
  },
  balance: true,
  deletion: {
    select: {
      requestedById: true,
      acknowledgedById: true,
      acknowledgedAt: true,
      expiresAt: true,
      createdAt: true,
    },
  },
} as const;

export type ConnectionWithRelations = {
  id: string;
  status: ConnectionStatus;
  createdAt: Date;
  updatedAt: Date;
  createdById: string | null;
  parentId: string;
  childId: string;
  parentAlias?: string | null;
  childAlias?: string | null;
  parent: UserSummary;
  child: UserSummary;
  balance: {
    totalCredit: unknown;
    totalPayments: unknown;
    outstanding: unknown;
  } | null;
  deletion?: {
    requestedById: string;
    acknowledgedById?: string | null;
    acknowledgedAt?: Date | null;
    expiresAt: Date;
    createdAt: Date;
  } | null;
};

export function normalizeConnection(
  connection: ConnectionWithRelations,
  options: { creatorSubscriptionActive?: boolean } = {}
): ConnectionSummary {
  return {
    id: connection.id,
    status: connection.status,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
    createdById: connection.createdById,
    parentAlias: connection.parentAlias ?? null,
    childAlias: connection.childAlias ?? null,
    parent: connection.parent,
    child: connection.child,
    balance: connection.balance
      ? {
          totalCredit: Number(connection.balance.totalCredit),
          totalPayments: Number(connection.balance.totalPayments),
          outstanding: Number(connection.balance.outstanding),
        }
      : null,
    deletion: connection.deletion
      ? {
          requestedById: connection.deletion.requestedById,
          acknowledgedById: connection.deletion.acknowledgedById ?? null,
          acknowledgedAt: connection.deletion.acknowledgedAt ?? null,
          expiresAt: connection.deletion.expiresAt,
          createdAt: connection.deletion.createdAt,
        }
      : null,
    creatorSubscriptionActive: options.creatorSubscriptionActive ?? true,
  };
}

const CONNECTION_DELETION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export async function purgeExpiredConnectionDeletions() {
  const now = new Date();
  const expired = await prisma.connectionDeletion.findMany({
    where: {
      expiresAt: { lt: now },
    },
    select: {
      connectionId: true,
    },
  });

  if (expired.length === 0) {
    return;
  }

  const connectionIds = expired.map((record) => record.connectionId);

  await prisma.$transaction([
    prisma.connection.updateMany({
      where: { id: { in: connectionIds } },
      data: { status: "ARCHIVED" },
    }),
    prisma.connectionDeletion.deleteMany({
      where: { connectionId: { in: connectionIds } },
    }),
  ]);
}

export async function getUserConnections(
  userId: string
): Promise<ConnectionSummary[]> {
  await purgeExpiredConnectionDeletions();

  const connections = await prisma.connection.findMany({
    where: {
      OR: [{ parentId: userId }, { childId: userId }],
      status: { not: "ARCHIVED" },
    },
    include: {
      ...connectionSummaryInclude,
    },
    orderBy: { createdAt: "desc" },
  });

  const parentIds = Array.from(
    new Set(connections.map((connection) => connection.parentId))
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
  const activeOwnerIds = new Set(activeSubscriptions.map((sub) => sub.ownerId));

  return connections
    .map((connection) =>
      normalizeConnection(connection as ConnectionWithRelations, {
        creatorSubscriptionActive: activeOwnerIds.has(connection.parentId),
      })
    )
    .filter((connection) => {
      if (!connection.deletion) {
        return true;
      }

      const { requestedById, acknowledgedById } = connection.deletion;
      return requestedById !== userId && acknowledgedById !== userId;
    });
}

interface InviteExistingInput {
  parentId: string;
  childId?: string;
  childEmail?: string;
  childName?: string;
  creatorId: string;
}

export async function createConnection(
  input: InviteExistingInput
): Promise<ConnectionSummary> {
  const { parentId, childId, childEmail, creatorId } = input;
  await assertActiveCreatorSubscription(creatorId);

  if (!childId && !childEmail) {
    throw new Error("childId or childEmail is required");
  }

  const parent = await prisma.user.findUnique({ where: { id: parentId } });
  if (!parent) {
    throw new Error("Parent account not found");
  }

  const existingChild = childId
    ? await prisma.user.findUnique({ where: { id: childId } })
    : childEmail
    ? await prisma.user.findUnique({ where: { email: childEmail } })
    : null;

  if (!existingChild) {
    if (childId) {
      throw new Error("Selected partner account no longer exists.");
    }

    throw new Error("No user found with that email.");
  }

  const targetChildId = existingChild.id;

  if (targetChildId === parentId) {
    throw new Error("You cannot invite your own account.");
  }

  const duplicate = await prisma.connection.findFirst({
    where: {
      parentId,
      childId: targetChildId,
      status: { not: "ARCHIVED" },
    },
  });

  if (duplicate) {
    throw new Error("Connection already exists");
  }

  const connection = await prisma.connection.create({
    data: {
      parentId,
      childId: targetChildId,
      createdById: creatorId,
      status: "PENDING",
    },
    include: connectionSummaryInclude,
  });

  return normalizeConnection(connection as ConnectionWithRelations, {
    creatorSubscriptionActive: true,
  });
}

export async function scheduleConnectionDeletion({
  connectionId,
  actorId,
}: {
  connectionId: string;
  actorId: string;
}): Promise<ConnectionSummary> {
  await purgeExpiredConnectionDeletions();

  const connection = await prisma.connection.findUnique({
    where: { id: connectionId },
    include: connectionSummaryInclude,
  });

  if (!connection) {
    throw new Error("Connection not found");
  }

  const typed = connection as ConnectionWithRelations;

  if (typed.status === "ARCHIVED") {
    throw new Error("Connection is already archived");
  }

  if (typed.parentId !== actorId && typed.childId !== actorId) {
    throw new Error("You are not part of this connection");
  }

  const outstandingAmount = typed.balance
    ? Number(typed.balance.outstanding)
    : 0;

  if (Math.abs(outstandingAmount) > 0.005) {
    throw new Error(
      "Settle the outstanding balance before deleting this connection."
    );
  }

  const expiresAt = new Date(Date.now() + CONNECTION_DELETION_WINDOW_MS);

  if (typed.deletion) {
    const nextExpiry =
      typed.deletion.expiresAt.getTime() > expiresAt.getTime()
        ? typed.deletion.expiresAt
        : expiresAt;

    if (typed.deletion.requestedById === actorId) {
      await prisma.connectionDeletion.update({
        where: { connectionId },
        data: { expiresAt: nextExpiry },
      });
    } else if (!typed.deletion.acknowledgedById) {
      await prisma.connectionDeletion.update({
        where: { connectionId },
        data: {
          acknowledgedById: actorId,
          acknowledgedAt: new Date(),
          expiresAt: nextExpiry,
        },
      });
    } else if (typed.deletion.acknowledgedById === actorId) {
      await prisma.connectionDeletion.update({
        where: { connectionId },
        data: { expiresAt: nextExpiry },
      });
    } else {
      throw new Error(
        "Deletion already confirmed by both parties. Contact your admin to restore it."
      );
    }
  } else {
    await prisma.connectionDeletion.create({
      data: {
        connectionId,
        requestedById: actorId,
        expiresAt,
      },
    });
  }

  const refreshed = await prisma.connection.findUnique({
    where: { id: connectionId },
    include: connectionSummaryInclude,
  });

  if (!refreshed) {
    throw new Error("Connection not found after updating deletion state");
  }

  const creatorSubscriptionActive = await hasActiveCreatorSubscription(
    refreshed.parentId
  );

  return normalizeConnection(refreshed as ConnectionWithRelations, {
    creatorSubscriptionActive,
  });
}

export async function updateConnectionAlias({
  connectionId,
  actorId,
  alias,
}: {
  connectionId: string;
  actorId: string;
  alias: string | null;
}): Promise<ConnectionSummary> {
  const connection = await prisma.connection.findUnique({
    where: { id: connectionId },
    select: {
      id: true,
      parentId: true,
      childId: true,
    },
  });

  if (!connection) {
    throw new Error("Connection not found");
  }

  const trimmed = alias?.trim();
  const normalizedAlias = trimmed && trimmed.length > 0 ? trimmed : null;

  let updateData: { parentAlias?: string | null; childAlias?: string | null };

  if (connection.parentId === actorId) {
    updateData = { parentAlias: normalizedAlias };
  } else if (connection.childId === actorId) {
    if (normalizedAlias === null) {
      throw new Error("Alias cannot be empty for upstream partners");
    }
    updateData = { childAlias: normalizedAlias };
  } else {
    throw new Error("You are not part of this connection");
  }

  const updated = await prisma.connection.update({
    where: { id: connectionId },
    data: updateData as Record<string, unknown>,
    include: connectionSummaryInclude,
  });

  const creatorSubscriptionActive = await hasActiveCreatorSubscription(
    updated.parentId
  );

  return normalizeConnection(updated as ConnectionWithRelations, {
    creatorSubscriptionActive,
  });
}

export async function acceptConnection(connectionId: string, actorId: string) {
  const connection = await prisma.connection.findUnique({
    where: { id: connectionId },
    include: { child: true },
  });

  if (!connection || connection.childId !== actorId) {
    throw new Error("Connection not found or not authorized");
  }

  if (connection.status === "ACTIVE") {
    return connection;
  }

  const updated = await prisma.connection.update({
    where: { id: connectionId },
    data: {
      status: "ACTIVE",
    },
  });

  await prisma.notification.create({
    data: {
      accountId: connection.createdById ?? connection.parentId,
      channel: "IN_APP",
      type: "CONNECTION_ACCEPTED",
      title: "Connection accepted",
      body: `${
        connection.child.name ?? "Partner"
      } accepted your connection request`,
      payload: { connectionId },
    },
  });

  return updated;
}

export async function declineConnection(connectionId: string, actorId: string) {
  const connection = await prisma.connection.findUnique({
    where: { id: connectionId },
  });

  if (!connection || connection.childId !== actorId) {
    throw new Error("Connection not found or not authorized");
  }

  const updated = await prisma.connection.update({
    where: { id: connectionId },
    data: { status: "ARCHIVED" },
  });

  await prisma.notification.create({
    data: {
      accountId: connection.createdById ?? connection.parentId,
      channel: "IN_APP",
      type: "CONNECTION_DECLINED",
      title: "Connection declined",
      body: "Your invitation was declined.",
      payload: { connectionId },
    },
  });

  return updated;
}

export async function restoreConnectionDeletion(
  connectionId: string
): Promise<ConnectionSummary> {
  await purgeExpiredConnectionDeletions();

  const deletion = await prisma.connectionDeletion.findUnique({
    where: { connectionId },
  });

  if (!deletion) {
    throw new Error("Deletion request not found or already resolved");
  }

  await prisma.connectionDeletion.delete({
    where: { connectionId },
  });

  const connection = await prisma.connection.findUnique({
    where: { id: connectionId },
    include: connectionSummaryInclude,
  });

  if (!connection) {
    throw new Error("Connection not found");
  }

  const creatorSubscriptionActive = await hasActiveCreatorSubscription(
    connection.parentId
  );

  return normalizeConnection(connection as ConnectionWithRelations, {
    creatorSubscriptionActive,
  });
}
