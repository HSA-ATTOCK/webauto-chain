import NextAuth from "next-auth";
import type { Adapter } from "next-auth/adapters";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import EmailProvider from "next-auth/providers/email";
import nodemailer from "nodemailer";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { verifyPassword } from "@/lib/auth/password";

const PERSISTENT_SESSION_MAX_AGE = 60 * 60 * 24 * 365 * 5; // ~5 years

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  intent: z.enum(["USER", "ADMIN"]).optional(),
});

const transporter = env.EMAIL_SERVER
  ? nodemailer.createTransport(env.EMAIL_SERVER)
  : null;

const emailProvider = EmailProvider({
  server: env.EMAIL_SERVER,
  from: env.EMAIL_FROM,
  async sendVerificationRequest({ identifier, url }) {
    if (!transporter || !env.EMAIL_FROM) {
      throw new Error("Email transport is not configured.");
    }

    await transporter.sendMail({
      to: identifier,
      from: env.EMAIL_FROM,
      subject: "Your WebAuto Chain sign-in link",
      text: `Sign in to WebAuto Chain by clicking the link: ${url}`,
      html: `<p>Sign in to <strong>WebAuto Chain</strong> by clicking the link below:</p><p><a href="${url}">${url}</a></p>`,
    });
  },
});

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  adapter: PrismaAdapter(prisma) as Adapter,
  session: {
    strategy: "jwt",
    maxAge: PERSISTENT_SESSION_MAX_AGE,
    updateAge: 60 * 60 * 24,
  },
  jwt: {
    maxAge: PERSISTENT_SESSION_MAX_AGE,
  },
  pages: {
    signIn: "/sign-in",
  },
  providers: [
    emailProvider,
    Credentials({
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) {
          return null;
        }

        const { email, password, intent } = parsed.data;
        const desiredIntent = intent ?? "USER";
        const user = await prisma.user.findFirst({
          where: { email },
        });

        if (!user?.passwordHash) {
          return null;
        }

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid || user.status !== "ACTIVE") {
          return null;
        }

        if (user.isAdmin && desiredIntent !== "ADMIN") {
          return null;
        }

        if (!user.isAdmin && desiredIntent === "ADMIN") {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email ?? undefined,
          phone: user.phone ?? undefined,
          status: user.status,
          isAdmin: user.isAdmin,
        };
      },
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (token.sub) {
        const user = await prisma.user.findUnique({
          where: { id: token.sub },
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            isAdmin: true,
          },
        });

        if (user) {
          session.user = {
            id: user.id,
            name: user.name,
            email: user.email ?? undefined,
            phone: user.phone ?? undefined,
            status: user.status,
            isAdmin: user.isAdmin,
          } as typeof session.user & {
            status: string;
            isAdmin: boolean;
            phone?: string | null;
          };
        }
      }

      return session;
    },
    async jwt({ token }) {
      if (!token.sub) {
        return token;
      }

      const user = await prisma.user.findUnique({
        where: { id: token.sub },
        select: { status: true, isAdmin: true },
      });

      if (user) {
        token.status = user.status;
        token.isAdmin = user.isAdmin;
      }

      return token;
    },
    authorized({ auth: session }) {
      return !!session;
    },
  },
});
