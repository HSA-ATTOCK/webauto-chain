<h1 align="center">WebAuto Chain</h1>

Multi-level credit ledger PWA for distributors, wholesalers, and shopkeepers. The platform enforces two-sided approval on every balance change, keeps immutable audit history, and works offline with background sync when connectivity returns.

## Features

- **Ledger workflows** – connection-scoped credit, payment, and adjustment entries with approval gates and running balances.
- **Creator-first billing model** – upstream partners own the subscription and invite their downstream network.
- **Offline resilience** – Dexie-backed mutation queue, installable PWA shell, service worker caching, and offline fallback page.
- **Reporting** – monthly CSV statements and summarized metrics generated directly from accepted ledger entries.
- **Admin console** – manage account status, subscription coverage, and hierarchy depth from `/admin`.
- **Secure auth** – NextAuth credentials/email providers, Prisma ORM, and typed validation via Zod on every API route.

## Tech Stack

- Next.js 16 App Router (TypeScript)
- Prisma ORM + PostgreSQL (Neon compatible)
- React Query, Zustand, Tailwind CSS v4, shadcn/ui
- Vitest + Testing Library, Playwright (scaffolded)
- Workbox-powered service worker with offline queue

## Local Development

1. Copy environment template and fill values:

   ```bash
   cp .env.example .env.local
   ```

2. Install dependencies and run Prisma generate:

   ```bash
   npm install
   npm run prisma:generate
   ```

3. Start the dev server:

   ```bash
   npm run dev
   ```

4. Visit `http://localhost:3000` for the marketing/auth experience or `http://localhost:3000/dashboard` after signing in.

### Scripts

| Command                  | Description                       |
| ------------------------ | --------------------------------- |
| `npm run dev`            | Start Next.js in development mode |
| `npm run build`          | Create production build           |
| `npm run start`          | Serve production build            |
| `npm run lint`           | Run ESLint                        |
| `npm test`               | Execute Vitest unit tests         |
| `npm run test:e2e`       | Execute Playwright E2E tests      |
| `npm run prisma:migrate` | Apply Prisma migrations           |

## Project Structure Highlights

- `src/app/` – App Router routes (landing, docs, auth, dashboard, admin panels)
- `src/lib/` – Prisma accessors, domain services, validators, and offline helpers
- `src/components/` – UI primitives, providers, dashboard/admin shells
- `prisma/` – database schema
- `public/` – PWA assets, icons, and offline fallback page

## Testing

Unit tests run with Vitest (`npm test`). Add new suites under `src/**/__tests__`. Playwright is prepared for end-to-end coverage (`npm run test:e2e`).

## Deployment Notes

- Target Vercel for the frontend/backend runtime and Neon for PostgreSQL.
- Configure environment secrets (`DATABASE_URL`, `NEXTAUTH_SECRET`, `EMAIL_*`) in hosting environment.
- Run `npm run prisma:migrate` as part of release automation.
- Ensure service worker and manifest stay registered by serving from root path.

## Android APK Packaging

Package the production PWA into an installable Android APK with Bubblewrap:

1. Install the CLI globally (requires Node.js):
   ```bash
   npm install -g @bubblewrap/cli
   ```
2. Initialize an Android project from the hosted manifest (replace the URL with your live domain):
   ```bash
   bubblewrap init --manifest=https://chain.webautosolutions.co.uk/manifest.webmanifest
   ```
   The command scaffolds a `./android` project directory preconfigured with your PWA metadata.
3. Build the APK release artifact:
   ```bash
   bubblewrap build
   ```
   The signed binary is emitted to `./build/app-release.apk`. Use Android Studio or the Play Console if you plan to upload to the Play Store; otherwise share the APK directly with users.

Prerequisites for signing uploads include Java JDK 11+ and the Android SDK. Local testing sideloads only need the APK output above.

## PWA & Offline Behavior

- Service worker (`public/service-worker.js`) uses cache-first strategies for static assets and background sync for queued ledger mutations.
- `/offline.html` provides user-friendly messaging when navigation occurs offline.
- Dashboard highlights queued mutations so partners know when entries will sync.

## Contributing

1. Create a feature branch and keep changes focused.
2. Add or update tests where behaviour changes.
3. Run `npm run lint` and `npm test` before opening a pull request.
4. Document significant architectural updates in `docs/`.
