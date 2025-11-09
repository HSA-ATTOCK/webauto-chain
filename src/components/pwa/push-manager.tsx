"use client";

import { useEffect } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PushManagerComponent() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const trySubscribe = async () => {
      if (!("Notification" in window) || !("serviceWorker" in navigator)) {
        console.info(
          "Push: Notifications or service workers are not supported in this browser."
        );
        return;
      }

      try {
        // Ask for permission on every app open if not granted
        if (Notification.permission !== "granted") {
          // Browsers may refuse to show the prompt if previously denied; still attempt.
          await Notification.requestPermission();
        }

        if (Notification.permission !== "granted") {
          console.info("Push: permission not granted.");
          return;
        }

        const registration = await navigator.serviceWorker.ready;

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          const vapidKey = process.env.NEXT_PUBLIC_VAPID_KEY ?? "";
          if (!vapidKey) {
            console.warn(
              "Push: NEXT_PUBLIC_VAPID_KEY not set. Skipping subscription."
            );
            return;
          }

          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey),
          });
        }

        // Send subscription to server for storage
        await fetch("/api/notifications/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subscription),
        });

        console.info("Push: subscription successful");
      } catch (err) {
        console.error("Push: subscription failed", err);
      }
    };

    void trySubscribe();
  }, []);

  return null;
}
