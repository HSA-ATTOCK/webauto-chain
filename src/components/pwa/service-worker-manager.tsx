"use client";

import { useEffect } from "react";

export function ServiceWorkerManager() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!("serviceWorker" in navigator)) {
      return;
    }

    const hostname = window.location.hostname;
    const isLocalhost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]";

    // Chrome on Android only treats the site as installable when the
    // service worker is active on a secure origin. Localhost is allowed.
    const isSecureOrigin = window.isSecureContext || isLocalhost;

    if (!isSecureOrigin) {
      console.warn(
        "Service worker disabled: site must be served over HTTPS or localhost for Android install prompts."
      );
      return;
    }

    const shouldRegister = process.env.NODE_ENV === "production" || isLocalhost;

    if (!shouldRegister) {
      return;
    }

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register(
          "/service-worker.js",
          {
            scope: "/",
          }
        );

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              if (confirm("WebAuto Chain has an update. Refresh now?")) {
                window.location.reload();
              }
            }
          });
        });
      } catch (error) {
        console.error("Service worker registration failed", error);
      }
    };

    register().catch((error) => {
      console.error("Service worker registration error", error);
    });
  }, []);

  return null;
}
