import Link from "next/link";

import { RegisterForm } from "@/components/auth/register-form";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { registerAccount } from "./actions";

export default function SignUpPage() {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-10 px-4 py-16">
      <div className="max-w-2xl text-center">
        <h1 className="text-3xl font-semibold text-foreground">
          Launch your WebAuto Chain network
        </h1>
        <p className="mt-3 text-muted-foreground">
          Already invited by a partner?{" "}
          <Link href="/sign-in" className="text-primary underline">
            Sign in for free
          </Link>{" "}
          and accept the connection without paying anything.
        </p>
      </div>
      <RegisterForm action={registerAccount} />
      <Card className="max-w-xl border-dashed">
        <CardContent className="space-y-3 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">
            Creator subscription highlights
          </p>
          <Separator className="opacity-30" />
          <ul className="list-disc space-y-1 pl-6">
            <li>
              Create unlimited downstream connections under a single
              subscription.
            </li>
            <li>
              Real-time network map and admin panel are available after
              activation.
            </li>
            <li>
              Optional WhatsApp notifications can be toggled per connection.
            </li>
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
