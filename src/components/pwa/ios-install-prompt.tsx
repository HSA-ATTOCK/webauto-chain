"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

const IOS_REGEX = /iphone|ipad|ipod/i;
type StandaloneCapableNavigator = Navigator & {
  standalone?: boolean;
};

const isIOS = (navigator?: Navigator) => {
  if (!navigator) {
    return false;
  }

  const userAgent = navigator.userAgent ?? "";
  return IOS_REGEX.test(userAgent);
};

const isStandaloneMode = (targetWindow?: Window) => {
  if (!targetWindow) {
    return false;
  }

  const nav = targetWindow.navigator as StandaloneCapableNavigator;
  if (typeof nav.standalone === "boolean") {
    return nav.standalone;
  }

  return (
    targetWindow.matchMedia?.("(display-mode: standalone)").matches ?? false
  );
};

export function IOSInstallPrompt() {
  const [isEligible] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return isIOS(window.navigator) && !isStandaloneMode(window);
  });
  const [showPopup, setShowPopup] = useState(false);
  const [autoShown, setAutoShown] = useState(false);

  useEffect(() => {
    if (!isEligible || autoShown) {
      return;
    }

    const timer = window.setTimeout(() => {
      setShowPopup(true);
      setAutoShown(true);
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [isEligible, autoShown]);

  if (!isEligible) {
    return null;
  }

  return (
    <>
      <Button
        onClick={() => setShowPopup(true)}
        className="fixed bottom-24 right-6 z-9998 shadow-lg"
      >
        Install App
      </Button>
      {showPopup ? (
        <div className="fixed bottom-6 left-4 right-4 z-9999 rounded-xl bg-white p-5 shadow-xl">
          <div className="text-black">
            <div className="font-semibold">Install This App</div>

            <p className="mt-2 text-sm">
              1. Tap the <span className="font-bold">⋯</span> (three dots)
            </p>

            <p className="mt-1 text-sm">
              2. Select <strong>Share</strong>
            </p>

            <p className="mt-1 text-sm">
              3. Select <strong>Add to Home Screen</strong>
            </p>
          </div>

          <Button
            variant="outline"
            className="mt-4 w-full"
            onClick={() => setShowPopup(false)}
          >
            Close
          </Button>
        </div>
      ) : null}
    </>
  );
}
