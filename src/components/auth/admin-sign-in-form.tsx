"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

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

import type { SignInResult } from "@/lib/auth/sign-in-result";

const initialState: SignInResult = { success: false };

type Action = (
  state: SignInResult,
  formData: FormData
) => Promise<SignInResult>;

export function AdminSignInForm({
  credentialAction,
}: {
  credentialAction: Action;
}) {
  const [credentialState, credentialDispatch] = useActionState(
    credentialAction,
    initialState
  );
  const [showPassword, setShowPassword] = useState(false);

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Admin sign-in</CardTitle>
        <CardDescription>
          Only administrators with elevated access can continue.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={credentialDispatch} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="admin-email">Email</Label>
            <Input
              id="admin-email"
              name="email"
              type="email"
              placeholder="admin@example.com"
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-password">Password</Label>
            <div className="relative">
              <Input
                id="admin-password"
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
                aria-label={showPassword ? "Hide password" : "Show password"}
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
            <p className="text-sm text-destructive">{credentialState.error}</p>
          ) : null}
          <Button type="submit" className="w-full">
            Sign in as admin
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
