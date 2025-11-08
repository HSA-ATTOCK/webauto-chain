import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from "@tanstack/react-query";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  getAdminUserOverview,
  getPendingConnectionDeletionOverview,
} from "@/lib/admin";
import type { SessionUser } from "@/lib/auth/session";

import { AdminDashboard } from "@/components/admin/admin-dashboard";

export default async function AdminPage() {
  const session = await auth();

  if (!session?.user?.isAdmin) {
    redirect("/admin/sign-in");
  }

  const allUsers = await getAdminUserOverview({ includeAdmins: true });
  const initialDeletions = await getPendingConnectionDeletionOverview();
  const adminProfile = session.user as SessionUser;
  const managedUsers = allUsers.filter((user) => !user.isAdmin);
  const adminAccount = allUsers.find((user) => user.id === adminProfile.id);
  const queryClient = new QueryClient();
  queryClient.setQueryData(["admin-users"], { users: managedUsers });
  queryClient.setQueryData(["admin-connection-deletions"], {
    deletions: initialDeletions,
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AdminDashboard
        initialUsers={managedUsers}
        adminProfile={adminProfile}
        adminAccount={adminAccount}
        initialDeletions={initialDeletions}
      />
    </HydrationBoundary>
  );
}
