import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const featureHighlights = [
  {
    title: "Chain-aware roles",
    description:
      "Distributors, wholesalers, and shopkeepers auto-adjust based on who invited whom. No manual role management needed.",
  },
  {
    title: "Dual approvals",
    description:
      "Every credit or payment entry requires confirmation from both sides, eliminating ledger disputes permanently.",
  },
  {
    title: "Creator-paid subscriptions",
    description:
      "The party who creates connections pays the subscription. Invitees join free, keeping expansion frictionless.",
  },
];

const workflowSteps = [
  "Invite downstream partners after activating your creator subscription.",
  "Record credit or payment entries with item-level detail and due dates.",
  "Counterparties approve or decline instantly via web or installed PWA.",
  "Generate monthly statements and CSV exports for compliance-ready audits.",
];

export default function AboutPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-16 px-6 py-20 lg:px-12">
      <section className="grid gap-10 lg:grid-cols-[2fr_3fr] lg:items-center">
        <div className="space-y-6">
          <Badge className="bg-primary/10 text-primary">WebAuto Chain</Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Digital credit ledgers with bulletproof transparency across your
            entire supply chain.
          </h1>
          <p className="text-lg text-muted-foreground">
            Replace paper registers and WhatsApp confirmations with a real-time
            PWA that keeps distributors, wholesalers, and shopkeepers in sync.
            Each transaction is mutually verified, fully auditable, and ready
            for export.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/sign-in">Sign in to your network</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/sign-up">Create creator account</Link>
            </Button>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <span>Offline ready</span>
            <Separator orientation="vertical" className="h-4" />
            <span>Installable on Android &amp; iOS</span>
            <Separator orientation="vertical" className="h-4" />
            <span>Postgres (Neon) powered</span>
          </div>
        </div>
        <Card className="border-primary/20 bg-linear-to-br from-primary/5 via-background to-background">
          <CardContent className="space-y-6 p-8">
            <header>
              <p className="text-sm uppercase tracking-wide text-muted-foreground">
                Why it works
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">
                Trust-first ledger architecture
              </h2>
            </header>
            <ul className="space-y-4">
              {featureHighlights.map((feature) => (
                <li
                  key={feature.title}
                  className="rounded-lg border border-border/50 bg-background/60 p-4"
                >
                  <h3 className="text-lg font-medium text-foreground">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-10 rounded-3xl border border-border/40 bg-card/60 p-10 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">
            Connected workflows everyone agrees on
          </h2>
          <p className="text-muted-foreground">
            WebAuto Chain mirrors real-world supply dynamics. The creator of a
            relationship covers the subscription cost, while every participating
            ledger stays private between just two parties. No top-level spying,
            complete accountability.
          </p>
        </div>
        <div className="space-y-3 text-sm">
          {workflowSteps.map((step, index) => (
            <div
              key={step}
              className="flex gap-3 rounded-xl border border-border/30 bg-background/80 p-4"
            >
              <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {index + 1}
              </span>
              <p className="text-muted-foreground">{step}</p>
            </div>
          ))}
        </div>
      </section>

      {/* <section className="grid gap-8 rounded-3xl border border-border/40 bg-background/80 p-10 text-center">
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold text-foreground">
            Ready to deploy on Vercel + Neon
          </h2>
          <p className="text-muted-foreground">
            Optimized for Postgres, Prisma, and serverless functions. Configure
            env vars, run migrations, and your market-wide ledger is live.
          </p>
        </div>
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/docs">View architecture docs</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/sign-up">Onboard your distribution network</Link>
          </Button>
        </div>
      </section> */}
    </main>
  );
}
