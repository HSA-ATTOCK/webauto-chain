import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  NEXTAUTH_SECRET: z
    .string()
    .min(32, "NEXTAUTH_SECRET must be at least 32 characters")
    .optional(),
  NEXTAUTH_URL: z.string().url().optional(),
  EMAIL_SERVER: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  APP_ENCRYPTION_KEY: z.string().optional(),
  WHATSAPP_API_KEY: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

export const env: AppEnv = envSchema.parse(process.env);
