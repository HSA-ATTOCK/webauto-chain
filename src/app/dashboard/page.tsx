import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from "@tanstack/react-query";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getUserConnections } from "@/lib/connections";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/sign-in");
  }

  const queryClient = new QueryClient();
  const connections = await getUserConnections(session.user.id);
  queryClient.setQueryData(["connections"], connections);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DashboardShell user={session.user} />
    </HydrationBoundary>
  );
}
