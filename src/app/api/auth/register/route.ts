import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { registerSchema } from "@/lib/validators/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email: parsed.data.email },
          parsed.data.phone ? { phone: parsed.data.phone } : undefined,
        ].filter(Boolean) as { email?: string; phone?: string }[],
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Account already exists" },
        { status: 409 }
      );
    }

    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        passwordHash: await hashPassword(parsed.data.password),
        status: "ACTIVE",
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Registration failed", error);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
