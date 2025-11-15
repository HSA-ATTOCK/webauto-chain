/* eslint-disable @typescript-eslint/no-require-imports */
const webpush = require("web-push");
const fs = require("fs");
const path = require("path");

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
  console.error(
    "Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in env when running this script."
  );
  process.exit(1);
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const subsPath = path.resolve(
  process.cwd(),
  "notifications-subscriptions.json"
);
if (!fs.existsSync(subsPath)) {
  console.error("No subscriptions file found at", subsPath);
  process.exit(1);
}

const subs = JSON.parse(fs.readFileSync(subsPath, "utf-8"));
if (!Array.isArray(subs) || subs.length === 0) {
  console.error("No subscriptions saved.");
  process.exit(1);
}

(async () => {
  for (const record of subs) {
    const subscription = record.subscription;
    try {
      await webpush.sendNotification(
        subscription,
        JSON.stringify({
          title: "Test notification",
          body: "This is a test from web-push",
          data: { url: "/" },
        })
      );
      console.log(
        "Sent to",
        subscription && subscription.endpoint
          ? subscription.endpoint.slice(0, 80)
          : "unknown"
      );
    } catch (err) {
      console.error(
        "Error sending to subscription",
        err && err.statusCode,
        (err && err.body) || err
      );
    }
  }
})();
