"use client";

import { useActionState, useCallback, useMemo, useState } from "react";
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

import type { RegisterResult } from "@/app/sign-up/actions";

const initialState: RegisterResult = { success: false };

type RegisterAction = (
  state: RegisterResult,
  formData: FormData
) => Promise<RegisterResult>;

function validateEmail(value: string): string | null {
  if (!value || value.trim().length === 0) {
    return null;
  }

  // Basic RFC 5322 compliant pattern for client-side guidance
  const pattern =
    /^(?:[a-zA-Z0-9_'^&/+-])+(?:\.(?:[a-zA-Z0-9_'^&/+-])+)*@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;

  if (!pattern.test(value.trim())) {
    return "Enter a valid email address.";
  }

  return null;
}

function validatePhone(value: string): string | null {
  if (!value || value.trim().length === 0) {
    return null;
  }

  const normalized = value.replace(/[\s\-()]/g, "");
  if (!/^\+?[0-9]{7,15}$/.test(normalized)) {
    return "Enter a valid phone number.";
  }

  return null;
}

function validatePassword(value: string): string | null {
  if (!value || value.length === 0) {
    return "Password is required.";
  }

  if (value.length < 8) {
    return "Password must be at least 8 characters long.";
  }

  return null;
}

export function RegisterForm({ action }: { action: RegisterAction }) {
  const [state, dispatch] = useActionState(action, initialState);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const hasClientErrors = useMemo(
    () => Boolean(emailError) || Boolean(phoneError) || Boolean(passwordError),
    [emailError, phoneError, passwordError]
  );

  const validateFormFields = useCallback((form: HTMLFormElement | null) => {
    if (!form) {
      return { emailIssue: null, phoneIssue: null, passwordIssue: null };
    }

    const formData = new FormData(form);
    const emailValue = String(formData.get("email") ?? "");
    const phoneValue = String(formData.get("phone") ?? "");
    const emailIssue = validateEmail(emailValue);
    const phoneIssue = validatePhone(phoneValue);
    const missingContact =
      (!emailValue || emailValue.trim().length === 0) &&
      (!phoneValue || phoneValue.trim().length === 0)
        ? "Provide an email or phone number."
        : null;
    const passwordIssue = validatePassword(
      String(formData.get("password") ?? "")
    );

    setEmailError(missingContact ?? emailIssue);
    setPhoneError(missingContact ?? phoneIssue);
    setPasswordError(passwordIssue);

    return {
      emailIssue: missingContact ?? emailIssue,
      phoneIssue: missingContact ?? phoneIssue,
      passwordIssue,
    };
  }, []);

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Create your creator account</CardTitle>
        <CardDescription>
          Once activated, you can invite downstream partners and build your
          network.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          action={dispatch}
          className="space-y-4"
          onSubmit={(event) => {
            const { emailIssue, phoneIssue, passwordIssue } =
              validateFormFields(event.currentTarget);

            if (emailIssue || phoneIssue || passwordIssue) {
              event.preventDefault();
            }
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="signup-name">Full name</Label>
            <Input
              id="signup-name"
              name="name"
              placeholder="XYZ Traders"
              required
              autoComplete="name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-email">Work email</Label>
            <Input
              id="signup-email"
              name="email"
              type="email"
              placeholder="you@company.com"
              autoComplete="email"
              aria-invalid={emailError ? "true" : "false"}
              aria-describedby={emailError ? "signup-email-error" : undefined}
              onBlur={(event) => {
                const result = validateFormFields(event.currentTarget.form);
                setEmailError(result.emailIssue);
                setPhoneError(result.phoneIssue);
              }}
              onChange={(event) => {
                if (emailError || phoneError) {
                  const result = validateFormFields(event.currentTarget.form);
                  setEmailError(result.emailIssue);
                  setPhoneError(result.phoneIssue);
                }
              }}
            />
            {emailError ? (
              <p
                id="signup-email-error"
                className="text-xs text-destructive"
                role="alert"
              >
                {emailError}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-phone">Phone</Label>
            <Input
              id="signup-phone"
              name="phone"
              type="tel"
              placeholder="0300 0000000"
              autoComplete="tel"
              aria-invalid={phoneError ? "true" : "false"}
              aria-describedby={phoneError ? "signup-phone-error" : undefined}
              onBlur={(event) => {
                const result = validateFormFields(event.currentTarget.form);
                setEmailError(result.emailIssue);
                setPhoneError(result.phoneIssue);
              }}
              onChange={(event) => {
                if (emailError || phoneError) {
                  const result = validateFormFields(event.currentTarget.form);
                  setEmailError(result.emailIssue);
                  setPhoneError(result.phoneIssue);
                }
              }}
            />
            {phoneError ? (
              <p
                id="signup-phone-error"
                className="text-xs text-destructive"
                role="alert"
              >
                {phoneError}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-password">Password</Label>
            <div className="relative">
              <Input
                id="signup-password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Minimum 8 characters"
                required
                autoComplete="new-password"
                aria-invalid={passwordError ? "true" : "false"}
                aria-describedby={
                  passwordError ? "signup-password-error" : undefined
                }
                onBlur={(event) =>
                  setPasswordError(validatePassword(event.target.value))
                }
                onChange={(event) => {
                  if (passwordError) {
                    setPasswordError(validatePassword(event.target.value));
                  }
                }}
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
            {passwordError ? (
              <p
                id="signup-password-error"
                className="text-xs text-destructive"
                role="alert"
              >
                {passwordError}
              </p>
            ) : null}
          </div>
          {state.message ? (
            <p
              className={`text-sm ${
                state.success ? "text-primary" : "text-destructive"
              }`}
            >
              {state.message}
            </p>
          ) : null}
          <Button
            type="submit"
            className="w-full"
            disabled={hasClientErrors}
            onClick={(event) => {
              const { emailIssue, phoneIssue, passwordIssue } =
                validateFormFields(event.currentTarget.form ?? null);

              if (emailIssue || phoneIssue || passwordIssue) {
                event.preventDefault();
              }
            }}
          >
            Register and proceed
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
