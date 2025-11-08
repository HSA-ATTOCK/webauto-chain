import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AdminSignInForm } from "@/components/auth/admin-sign-in-form";

import { adminSignIn } from "./actions";

export default async function AdminSignInPage() {
  const session = await auth();

  if (session?.user?.isAdmin) {
    redirect("/admin");
  }

  return (
    <main className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-8 px-4 py-16">
      <div className="max-w-lg text-center">
        <h1 className="text-3xl font-semibold text-foreground">Admin access</h1>
        <p className="mt-3 text-muted-foreground">
          Enter your administrator credentials to manage subscriptions and user
          accounts.
        </p>
        {/* <p className="mt-3 text-xs text-muted-foreground">
          Need the standard experience? Visit the{" "}
          <Link href="/sign-in" className="text-primary underline">
            customer sign-in page
          </Link>
          .
        </p> */}
      </div>
      <AdminSignInForm credentialAction={adminSignIn} />
    </main>
  );
}
