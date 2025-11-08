"use client";

import { useEffect } from "react";

import { flushMutations, getQueueCount } from "@/lib/offline/queue";
import { useConnectionStore } from "@/store/connection-store";

export function useOfflineQueue() {
  const setOfflineQueueCount = useConnectionStore(
    (state) => state.setOfflineQueueCount
  );

  useEffect(() => {
    const updateCount = async () => {
      const count = await getQueueCount();
      setOfflineQueueCount(count);
    };

    updateCount()
      .then(() => flushMutations())
      .then((result) => setOfflineQueueCount(result?.remaining ?? 0))
      .catch((error) => console.error("Offline queue bootstrap failed", error));

    const onlineListener = () => {
      flushMutations()
        .then((result) => setOfflineQueueCount(result.remaining))
        .catch((error) => console.error("Offline queue flush failed", error));
    };

    window.addEventListener("online", onlineListener);

    return () => {
      window.removeEventListener("online", onlineListener);
    };
  }, [setOfflineQueueCount]);
}
