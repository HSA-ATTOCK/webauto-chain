"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { signIn } from "@/auth";
import { SignInResult } from "@/lib/auth/sign-in-result";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function adminSignIn(
  _: unknown,
  formData: FormData
): Promise<SignInResult> {
  const credentials = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!credentials.success) {
    return { success: false, error: "Enter a valid email and password." };
  }

  try {
    const result = await signIn("credentials", {
      email: credentials.data.email,
      password: credentials.data.password,
      intent: "ADMIN",
      redirect: false,
    });

    if (result?.error) {
      const user = await prisma.user.findUnique({
        where: { email: credentials.data.email },
        select: { passwordHash: true, status: true, isAdmin: true },
      });

      if (
        user?.passwordHash &&
        user.isAdmin &&
        user.status === "DEACTIVATED" &&
        (await verifyPassword(credentials.data.password, user.passwordHash))
      ) {
        return {
          success: false,
          error:
            "Your admin account is deactivated. Contact another administrator to restore access.",
        };
      }

      return { success: false, error: "Incorrect admin credentials." };
    }

    redirect("/admin");
  } catch (error) {
    if (
      error instanceof Error &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }

    console.error("Admin sign-in failed", error);
    return { success: false, error: "Incorrect admin credentials." };
  }
}
