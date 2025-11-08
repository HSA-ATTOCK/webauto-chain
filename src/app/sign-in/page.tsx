import { SignInForm } from "@/components/auth/sign-in-form";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { sendMagicLink, signInWithCredentials } from "./actions";

export default function SignInPage() {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-8 px-4 py-16">
      <div className="max-w-lg text-center">
        <h1 className="text-3xl font-semibold text-foreground">
          Sign in to WebAuto Chain
        </h1>
        {/* <p className="mt-3 text-muted-foreground">
          Need a creator subscription?{" "}
          <Link href="/sign-up" className="text-primary underline">
            Create an account
          </Link>{" "}
          to start inviting partners.
        </p> */}
      </div>
      <SignInForm
        credentialAction={signInWithCredentials}
        magicLinkAction={sendMagicLink}
      />
      <Card className="max-w-lg border-dashed">
        <CardContent className="space-y-3 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">
            Two minute onboarding tips
          </p>
          <Separator className="opacity-30" />
          <ul className="list-disc space-y-1 pl-6">
            <li>
              Distributors pay once to create unlimited downstream connections.
            </li>
            <li>All transactions require acceptance before balances update.</li>
            <li>
              Offline entries queue automatically and sync after you reconnect.
            </li>
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
