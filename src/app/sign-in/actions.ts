"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { signIn } from "@/auth";

import { SignInResult } from "@/lib/auth/sign-in-result";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { parseIdentifier, normalizePhone } from "@/lib/auth/identifiers";

const credentialsSchema = z.object({
  identifier: z.string().min(3, "Enter a valid email or phone number."),
  password: z.string().min(8),
});

const magicLinkSchema = z.object({
  email: z.string().email(),
});

export async function signInWithCredentials(
  _: unknown,
  formData: FormData
): Promise<SignInResult> {
  const credentials = credentialsSchema.safeParse({
    identifier:
      typeof formData.get("identifier") === "string"
        ? (formData.get("identifier") as string)
        : "",
    password: formData.get("password"),
  });

  if (!credentials.success) {
    return {
      success: false,
      error:
        credentials.error.issues[0]?.message ??
        "Enter a valid email or phone number and password.",
    };
  }

  const identifier = parseIdentifier(credentials.data.identifier);

  if (!identifier) {
    return {
      success: false,
      error: "Enter a valid email or phone number and password.",
    };
  }

  const normalizedInput = identifier.value;

  try {
    const result = await signIn("credentials", {
      identifier: normalizedInput,
      password: credentials.data.password,
      intent: "USER",
      redirect: false,
    });

    if (result?.error) {
      const user = await prisma.user.findFirst({
        where:
          identifier.kind === "email"
            ? {
                email: {
                  equals: identifier.value,
                  mode: "insensitive",
                },
              }
            : {
                OR: [
                  { phone: identifier.value },
                  { phone: credentials.data.identifier.trim() },
                  {
                    phone: normalizePhone(credentials.data.identifier),
                  },
                ],
              },
        select: { passwordHash: true, status: true },
      });

      if (
        user?.passwordHash &&
        user.status === "DEACTIVATED" &&
        (await verifyPassword(credentials.data.password, user.passwordHash))
      ) {
        return {
          success: false,
          error:
            "Your account is deactivated. Contact your administrator to restore access.",
        };
      }

      return {
        success: false,
        error: "Incorrect email/phone or password.",
      };
    }

    redirect("/dashboard");
  } catch (error) {
    if (
      error instanceof Error &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }

    console.error("Sign-in failed", error);
    return { success: false, error: "Incorrect email/phone or password." };
  }
}

export async function sendMagicLink(
  _: unknown,
  formData: FormData
): Promise<SignInResult> {
  const input = magicLinkSchema.safeParse({ email: formData.get("email") });

  if (!input.success) {
    return { success: false, error: "Enter a valid email address." };
  }

  try {
    const result = await signIn("email", {
      email: input.data.email,
      redirect: false,
    });

    if (result?.error) {
      return { success: false, error: "Unable to send magic link right now." };
    }

    return {
      success: true,
      error: "We sent you a sign-in link. Check your inbox within 10 minutes.",
    };
  } catch (error) {
    if (
      error instanceof Error &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }

    console.error("Magic link failed", error);
    return { success: false, error: "Unable to send magic link right now." };
  }
}
