import { z } from "zod";

import {
  emailRegex,
  normalizeEmail,
  normalizePhone,
  phoneRegex,
} from "@/lib/auth/identifiers";

const optionalContactField = z.preprocess((value) => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().optional());

export const registerSchema = z
  .object({
    name: z.preprocess(
      (value) => (typeof value === "string" ? value.trim() : value),
      z
        .string({ required_error: "Name is required." })
        .min(2, "Name must be at least 2 characters.")
        .max(80, "Name cannot exceed 80 characters.")
    ),
    email: optionalContactField,
    phone: optionalContactField,
    password: z.preprocess(
      (value) => (typeof value === "string" ? value : undefined),
      z
        .string({ required_error: "Password is required." })
        .min(8, "Password must be at least 8 characters.")
    ),
  })
  .superRefine((data, ctx) => {
    const hasEmail = Boolean(data.email);
    const hasPhone = Boolean(data.phone);

    if (!hasEmail && !hasPhone) {
      const message = "Provide an email or phone number.";
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message,
        path: ["email"],
      });
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message,
        path: ["phone"],
      });
      return;
    }

    if (hasEmail && (!data.email || !emailRegex.test(data.email))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid email address.",
        path: ["email"],
      });
    }

    if (hasPhone) {
      const normalizedPhone = normalizePhone(data.phone ?? "");
      if (!phoneRegex.test(normalizedPhone)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter a valid phone number.",
          path: ["phone"],
        });
      }
    }
  })
  .transform((data) => ({
    name: data.name,
    email: data.email ? normalizeEmail(data.email) : undefined,
    phone: data.phone ? normalizePhone(data.phone) : undefined,
    password: data.password,
  }));

export type RegisterInput = z.infer<typeof registerSchema>;
