"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import type { SignInResult } from "@/lib/auth/sign-in-result";

const initialState: SignInResult = { success: false };

type Action = (
  state: SignInResult,
  formData: FormData
) => Promise<SignInResult>;

export function SignInForm({
  credentialAction,
  magicLinkAction,
}: {
  credentialAction: Action;
  magicLinkAction: Action;
}) {
  const [credentialState, credentialDispatch, credentialPending] =
    useActionState(credentialAction, initialState);
  const [magicState, magicDispatch, magicPending] = useActionState(
    magicLinkAction,
    initialState
  );
  const [showPassword, setShowPassword] = useState(false);

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Welcome back</CardTitle>
        <CardDescription>
          Access your private ledgers and subscriptions securely.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="password" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="password">Password</TabsTrigger>
            <TabsTrigger value="magic">Magic link</TabsTrigger>
          </TabsList>

          <TabsContent value="password">
            <form action={credentialDispatch} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signin-identifier">Email or phone</Label>
                <Input
                  id="signin-identifier"
                  name="identifier"
                  type="text"
                  placeholder="ledger@example.com or +923001234567"
                  required
                  autoComplete="username"
                  inputMode="text"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signin-password">Password</Label>
                <div className="relative">
                  <Input
                    id="signin-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((previous) => !previous)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              {credentialState.error ? (
                <p className="text-sm text-destructive">
                  {credentialState.error}
                </p>
              ) : null}
              <Button
                type="submit"
                className="w-full"
                disabled={credentialPending}
              >
                {credentialPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="magic">
            <form action={magicDispatch} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="magic-email">Email</Label>
                <Input
                  id="magic-email"
                  name="email"
                  type="email"
                  placeholder="ledger@example.com"
                  required
                />
              </div>
              {magicState.error ? (
                <p
                  className={`text-sm ${
                    magicState.success ? "text-primary" : "text-destructive"
                  }`}
                >
                  {magicState.error}
                </p>
              ) : null}
              <Button
                type="submit"
                variant="outline"
                className="w-full"
                disabled={magicPending}
              >
                {magicPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Email me a sign-in link"
                )}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
