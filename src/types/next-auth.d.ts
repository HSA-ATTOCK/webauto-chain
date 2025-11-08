import "next-auth";

declare module "next-auth" {
  interface Session {
    user?: {
      id: string;
      name?: string | null;
      email?: string;
      status: string;
      isAdmin: boolean;
    };
  }

  interface User {
    status: string;
    isAdmin: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    status?: string;
    isAdmin?: boolean;
  }
}

declare module "next-auth/adapters" {
  interface AdapterUser {
    status: string;
    isAdmin: boolean;
  }
}
