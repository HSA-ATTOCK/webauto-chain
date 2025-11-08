import { offlineDb, type OfflineMutation } from "@/lib/offline/db";

export async function enqueueMutation(
  mutation: Omit<OfflineMutation, "id" | "createdAt">
) {
  await offlineDb.mutations.add({
    ...mutation,
    createdAt: Date.now(),
  });

  return offlineDb.mutations.count();
}

export async function getQueueCount() {
  return offlineDb.mutations.count();
}

export async function flushMutations() {
  const pending = await offlineDb.mutations.orderBy("createdAt").toArray();
  let flushed = 0;

  for (const mutation of pending) {
    try {
      const response = await fetch(mutation.endpoint, {
        method: mutation.method,
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(mutation.payload),
      });

      if (!response.ok) {
        throw new Error(`Failed with status ${response.status}`);
      }

      if (mutation.id !== undefined) {
        await offlineDb.mutations.delete(mutation.id);
      }
      flushed += 1;
    } catch (error) {
      console.warn("Failed to flush offline mutation", error);
      break;
    }
  }

  return {
    flushed,
    remaining: await offlineDb.mutations.count(),
  };
}
