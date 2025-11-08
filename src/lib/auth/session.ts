import { auth } from "@/auth";

export interface SessionUser {
  id: string;
  email?: string;
  name?: string | null;
  phone?: string | null;
  status: string;
  isAdmin: boolean;
}

export async function requireSessionUser(): Promise<SessionUser> {
  const session = await auth();

  if (!session?.user || !session.user.id) {
    throw new Error("Unauthorized");
  }

  return session.user as SessionUser;
}

export async function requireAdminUser() {
  const user = await requireSessionUser();
  if (!user.isAdmin) {
    const error = new Error("Forbidden");
    error.name = "ForbiddenError";
    throw error;
  }

  return user;
}
