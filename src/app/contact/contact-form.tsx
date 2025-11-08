"use client";

import { useEffect } from "react";
import { useFormState } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { submitContact, type ContactFormState } from "./actions";

const initialState: ContactFormState = {
  status: "idle",
  message: null,
};

export function ContactForm() {
  const [state, formAction] = useFormState(submitContact, initialState);

  useEffect(() => {
    if (state.status === "success") {
      const form = document.getElementById(
        "contact-form"
      ) as HTMLFormElement | null;
      form?.reset();
    }
  }, [state.status]);

  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        <form id="contact-form" className="space-y-4" action={formAction}>
          <div className="grid gap-2">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" name="name" placeholder="Name" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email address (optional)</Label>
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              placeholder="name@example.com"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phone">Phone number</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              placeholder="e.g. +923001234567"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="message">Message</Label>
            <Textarea
              id="message"
              name="message"
              rows={5}
              placeholder="Share how we can help you..."
              required
            />
          </div>
          <Button type="submit" className="w-full">
            Send message
          </Button>
        </form>
        {state.status !== "idle" && state.message ? (
          <div
            className={`rounded-md border p-3 text-sm ${
              state.status === "success"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-destructive/40 bg-destructive/10 text-destructive"
            }`}
          >
            {state.message}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
