import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session";
import { createConnection, getUserConnections } from "@/lib/connections";
import { createConnectionSchema } from "@/lib/validators/connections";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const connections = await getUserConnections(user.id);
    const accountRecord = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        subscriptions: {
          where: {
            status: "ACTIVE",
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          orderBy: { activatedAt: "desc" },
          select: {
            id: true,
            plan: true,
            activatedAt: true,
            expiresAt: true,
          },
        },
      },
    });

    const account = accountRecord
      ? {
          id: accountRecord.id,
          name: accountRecord.name ?? null,
          email: accountRecord.email ?? null,
          phone: accountRecord.phone ?? null,
          status: accountRecord.status,
          subscriptions: accountRecord.subscriptions.map((subscription) => ({
            id: subscription.id,
            plan: subscription.plan,
            activatedAt: subscription.activatedAt
              ? subscription.activatedAt.toISOString()
              : null,
            expiresAt: subscription.expiresAt
              ? subscription.expiresAt.toISOString()
              : null,
          })),
        }
      : null;

    return NextResponse.json({ connections, account });
  } catch (error) {
    console.error("Failed to load connections", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const parsed = createConnectionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const connection = await createConnection({
      parentId: user.id,
      creatorId: user.id,
      childId: parsed.data.childId,
      childEmail: parsed.data.childEmail,
      childName: parsed.data.childName,
    });

    return NextResponse.json({ connection }, { status: 201 });
  } catch (error) {
    console.error("Failed to create connection", error);

    if ((error as Error).name === "SubscriptionError") {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 402 }
      );
    }

    if ((error as Error).message === "No user found with that email.") {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: (error as Error).message ?? "Unable to create connection" },
      { status: 400 }
    );
  }
}
