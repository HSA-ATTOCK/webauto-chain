import { z } from "zod";

export const createConnectionSchema = z
  .object({
    childId: z.string().cuid().optional(),
    childEmail: z.string().email().optional(),
    childName: z.string().min(2).max(80).optional(),
  })
  .refine((value) => value.childId || (value.childEmail && value.childName), {
    message: "Provide an existing childId or the child's name and email",
    path: ["childId"],
  });

export type CreateConnectionInput = z.infer<typeof createConnectionSchema>;
