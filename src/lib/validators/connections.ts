import { z } from "zod";

import { normalizePhone, isValidPhone } from "@/lib/validators/contact";

export const createConnectionSchema = z
  .object({
    childId: z.string().cuid().optional(),
    childEmail: z
      .string()
      .trim()
      .toLowerCase()
      .email({ message: "Enter a valid partner email" })
      .optional(),
    childPhone: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    const hasContact = Boolean(value.childEmail) || Boolean(value.childPhone);

    if (!value.childId && !hasContact) {
      ctx.addIssue({
        code: "custom",
        path: ["childId"],
        message: "Provide the partner email, phone, or account id",
      });
    }

    if (value.childEmail && value.childPhone) {
      ctx.addIssue({
        code: "custom",
        path: ["childPhone"],
        message: "Provide either an email or phone, not both",
      });
    }

    if (value.childPhone) {
      const normalized = normalizePhone(value.childPhone);
      if (!isValidPhone(normalized)) {
        ctx.addIssue({
          code: "custom",
          path: ["childPhone"],
          message: "Enter a valid partner phone number",
        });
      }
    }
  })
  .transform((value) => ({
    ...value,
    childPhone: value.childPhone ? normalizePhone(value.childPhone) : undefined,
  }));

export type CreateConnectionInput = z.infer<typeof createConnectionSchema>;
