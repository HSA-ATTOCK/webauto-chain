import { promises as fs } from "fs";
import path from "path";

import { Card, CardContent } from "@/components/ui/card";

export default async function DocsPage() {
  const filePath = path.join(process.cwd(), "docs", "architecture.md");
  const content = await fs.readFile(filePath, "utf8");

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-16">
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold text-foreground">
          Architecture overview
        </h1>
        <p className="text-muted-foreground">
          This page renders the canonical documentation from{" "}
          <code>docs/architecture.md</code>. Update the markdown file to keep
          this view in sync.
        </p>
      </div>
      <Card>
        <CardContent className="whitespace-pre-wrap wrap-break-word p-6 text-sm leading-relaxed text-foreground/90">
          {content}
        </CardContent>
      </Card>
    </main>
  );
}
