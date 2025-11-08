import { prisma } from "@/lib/prisma";

export async function hasActiveCreatorSubscription(
  userId: string
): Promise<boolean> {
  const now = new Date();
  const subscription = await prisma.subscription.findFirst({
    where: {
      ownerId: userId,
      status: "ACTIVE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });

  return Boolean(subscription);
}

export async function assertActiveCreatorSubscription(userId: string) {
  const active = await hasActiveCreatorSubscription(userId);
  if (!active) {
    const error = new Error(
      "An active creator subscription is required to add new connections."
    );
    error.name = "SubscriptionError";
    throw error;
  }
}
