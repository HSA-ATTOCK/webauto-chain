"use server";

import { redirect } from "next/navigation";

import { signIn } from "@/auth";
import { registerSchema } from "@/lib/validators/auth";

export type RegisterResult = {
  success: boolean;
  message?: string;
};

export async function registerAccount(
  _: unknown,
  formData: FormData
): Promise<RegisterResult> {
  const payload = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    password: formData.get("password"),
  });

  if (!payload.success) {
    const flattened = payload.error.flatten();
    const message =
      flattened.formErrors[0] ??
      Object.values(flattened.fieldErrors).flat().filter(Boolean)[0] ??
      "Provide valid user information.";

    return { success: false, message };
  }

  try {
    const response = await fetch(
      `${
        process.env.NEXTAUTH_URL ?? "http://localhost:3000"
      }/api/auth/register`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload.data),
      }
    );

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return { success: false, message: body.error ?? "Registration failed" };
    }

    await signIn("credentials", {
      identifier: payload.data.email ?? payload.data.phone ?? "",
      password: payload.data.password,
      redirect: false,
    });

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

    console.error("Registration failed", error);
    return { success: false, message: "Unable to create account right now." };
  }
}
