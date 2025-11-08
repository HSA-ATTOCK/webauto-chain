import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { ContactForm } from "./contact-form";

export default function ContactPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">
            Contact support
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Reach out if you need assistance with ledgers, billing, or
            onboarding partners.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">
            Talk to our team
          </h2>
          <p className="text-sm text-muted-foreground">
            We typically respond within one business day. Include as much detail
            as you can so we can assist quickly.
          </p>
          <Card>
            <CardContent className="space-y-3 p-6 text-sm text-muted-foreground">
              <div>
                <p className="text-xs uppercase tracking-wide text-foreground/70">
                  Phone
                </p>
                <p className="mt-1 text-base font-medium text-foreground">
                  +92 315 0145266
                </p>
              </div>
              <Separator className="opacity-20" />
              <div>
                <p className="text-xs uppercase tracking-wide text-foreground/70">
                  Email
                </p>
                <a
                  href="mailto:webautochain@gmail.com"
                  className="mt-1 inline-flex text-base font-medium text-primary"
                >
                  webautochain@gmail.com
                </a>
              </div>
              <Separator className="opacity-20" />
              <div>
                <p className="text-xs uppercase tracking-wide text-foreground/70">
                  Office hours
                </p>
                <p className="mt-1 text-base font-medium text-foreground">
                  {/* Mon - Sat, 9:00 AM – 6:00 PM PKT */}
                  24/7 Support
                </p>
              </div>
            </CardContent>
          </Card>
        </section>
        <ContactForm />
      </div>
    </main>
  );
}
