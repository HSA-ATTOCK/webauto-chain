import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session";
import { getMonthlyLedgerSummary } from "@/lib/reports";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get("connectionId");
    const month = searchParams.get("month") ?? undefined;
    const startDate = searchParams.get("startDate") ?? undefined;
    const endDate = searchParams.get("endDate") ?? undefined;
    const format = searchParams.get("format") ?? "json";

    if (!connectionId) {
      return NextResponse.json(
        { error: "connectionId is required" },
        { status: 422 }
      );
    }

    const summary = await getMonthlyLedgerSummary(connectionId, user.id, {
      month: month || undefined,
      start: startDate,
      end: endDate,
    });

    if (format === "csv") {
      return new Response(summary.csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename=${summary.csvFilename}`,
        },
      });
    }

    return NextResponse.json({ summary });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
