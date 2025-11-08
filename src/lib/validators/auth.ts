import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  phone: z
    .string()
    .regex(/^[0-9+\-\s]{7,15}$/i, "Enter a valid phone number")
    .optional(),
  password: z.string().min(8),
});

export type RegisterInput = z.infer<typeof registerSchema>;
