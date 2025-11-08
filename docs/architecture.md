# WebAuto Chain Architecture Overview

## Core Goals

- Provide a multi-level, creator-paid connection framework for distributors, wholesalers, and shopkeepers.
- Deliver a transparent, mutually approved credit ledger with immutable audit history and status tracking.
- Support PWA capabilities with offline access, background sync, and installability across devices.
- Enable administrative supervision for account lifecycle management and dispute resolution.

## High-Level Stack

- **Framework:** Next.js 16 (App Router) with server actions and API routes for deterministic data flows.
- **Language:** TypeScript across server and client code.
- **UI:** Tailwind CSS + shadcn/ui component primitives.
- **State Management:** Zustand for client session/UI state, React Query for data fetching and background sync.
- **Persistence:** PostgreSQL (Neon) managed via Prisma ORM.
- **Authentication:** NextAuth (passwordless email + optional password) with role-based authorization policies.
- **Real-Time/Notifications:** PostgreSQL logical replication triggers + WebSocket bridge (Pusher-compatible abstraction) supplemented by in-app notification queue and optional WhatsApp webhooks (deferred).
- **Background Jobs:** Vercel Cron + Neon functions for scheduled billing reminders and monthly statement generation.
- **Testing:** Vitest + Testing Library for units/components, Playwright for E2E critical flows.
- **Dev Tooling:** ESLint, Prettier (via ESLint config), Commitlint-ready Git hooks (later), API schema validated with Zod.

## Domain Model (Prisma)

```mermaid
erDiagram
    Account ||--o{ Connection : "createdLinks"
    Account ||--o{ Connection : "joinedLinks"
    Connection ||--o{ LedgerEntry : tracks
    LedgerEntry ||--o{ LedgerStatusEvent : versions
    Account ||--o{ Subscription : plans
    Subscription ||--o{ SubscriptionInvoice : invoices
    Account ||--o{ Notification : inbox

    Account {
        uuid id PK
        string displayName
        string email
        string phone
        string passwordHash
        string status // ACTIVE | DEACTIVATED | PENDING
        boolean emailVerified
        timestamp createdAt
        timestamp updatedAt
    }

    Connection {
        uuid id PK
        uuid createdById FK -> Account.id
        uuid parentId FK -> Account.id
        uuid childId FK -> Account.id
        enum status // PENDING | ACTIVE | BLOCKED | ARCHIVED
        boolean billingSettled
        timestamp createdAt
    }

    LedgerEntry {
        uuid id PK
        uuid connectionId FK -> Connection.id
        uuid createdById FK -> Account.id
        enum entryType // CREDIT | PAYMENT | ADJUSTMENT | EDIT_REQUEST | DELETE_REQUEST
        numeric amount
        jsonb items // item catalog breakdown
        string notes
        enum approvalStatus // PENDING | ACCEPTED | DECLINED | REVOKED
        uuid supersedesId // optional link for edit/delete workflows
        timestamp dueDate
        timestamp createdAt
    }

    LedgerStatusEvent {
        uuid id PK
        uuid ledgerEntryId FK -> LedgerEntry.id
        uuid actorId FK -> Account.id
        enum action // CREATED | UPDATED | APPROVED | DECLINED | REVOKED
        jsonb metadata
        timestamp createdAt
    }

    Subscription {
        uuid id PK
        uuid ownerId FK -> Account.id
        enum plan // CREATOR_BASIC | CREATOR_PRO
        timestamp activatedAt
        timestamp expiresAt
        enum status // ACTIVE | LAPSED | CANCELLED
    }

    SubscriptionInvoice {
        uuid id PK
        uuid subscriptionId FK -> Subscription.id
        numeric amount
        enum currency
        enum status // PAID | UNPAID
        string paymentProviderId
        timestamp issuedAt
        timestamp settledAt
    }

    Notification {
        uuid id PK
        uuid accountId FK -> Account.id
        enum channel // IN_APP | EMAIL | WHATSAPP
        string title
        string body
        jsonb payload
        boolean read
        timestamp createdAt
    }
```

## Connection Lifecycle

1. **Invitation Creation:** Upstream user creates connection → subscription check ensures they are an active creator.
2. **Join Acceptance:** Invitee receives notification, reviews summary, accepts/declines. Acceptance activates connection and unlocks ledger tab.
3. **Billing:** Connection creation writes a `billingEvent` row for invoicing/reporting; downstream user joins at no cost per rule.
4. **Deactivation:** Admin can toggle account status. On deactivation, owned connections switch to `BLOCKED`, child accounts lose access to the deactivated parent's tabs, while peers remain accessible.

## Transaction Workflow

1. Creator initiates entry using guided form (itemized credit, payment, or adjustment) with optional attachments.
2. Entry persisted in `PENDING` state. Counterparty receives real-time prompt via notification socket + offline fallback.
3. Counterparty response updates `approvalStatus`; accepted entries adjust running balance for both parties atomically using SQL transaction with materialized `ConnectionBalance` view for quick reads.
4. Edits/Deletes implemented by spawning new `LedgerEntry` with `entryType` of `EDIT_REQUEST`/`DELETE_REQUEST`, referencing original via `supersedesId`. Approval merges changes, decline keeps original unchanged.
5. Full history accessible in timeline UI, backed by `LedgerStatusEvent` table.

## Running Balance Projection

- Maintain `ledger_snapshots` materialized view recalculated via trigger on `ledger_entry` acceptance.
- Provide API endpoints for balances, monthly statements, CSV exports (leveraging Neon copy).

## Admin Console Highlights

- Role-based `admin` flag enabling access to `/admin` routes.
- Network graph view using D3/vis to inspect hierarchy.
- User moderation controls (activate/deactivate, reset password, view disputes).

## PWA Strategy

- `app/manifest.webmanifest` + dynamic icon pipeline.
- `src/lib/sw/service-worker.ts` with Workbox caching strategies:
  - `StaleWhileRevalidate` for navigation/documents.
  - `NetworkFirst` for API calls with background sync queue for ledger submissions.
  - `CacheFirst` for static assets (tailwind, fonts).
- Background Sync plugin to retry pending ledger actions when offline.
- In-app update prompt when service worker refreshes.

## Offline Mutation Queue

- Local IndexedDB (via Dexie wrapper) storing outbound ledger actions while offline.
- Sync worker flushes queue using authenticated fetch once connectivity restored.

## Security & Compliance

- Enforce per-connection access control; ledger APIs validate membership.
- Auditable trails for each action; data encryption at rest handled by Neon. Sensitive fields (passwords) hashed with bcrypt.
- Rate limiting on auth & connection creation.
- Data retention policies configurable via admin settings.

## Deployment Considerations

- Target Vercel for frontend + serverless functions, Neon for PostgreSQL.
- Environment variables managed by Vercel project settings (shared `.env` template added locally).
- Use Prisma migrate workflow for schema evolution; `drizzle-kit` optional but not required.
- CI pipeline (GitHub Actions) to lint, test, build, and run database migrations against a shadow database.

## Next Steps

1. Implement Prisma schema + initial migrations.
2. Configure authentication (NextAuth credentials + email OTP pipeline).
3. Build connection management APIs with subscription enforcement.
4. Develop ledger CRUD with approval logic and audit trails.
5. Ship PWA shell + offline sync infrastructure.
6. Deliver admin dashboard + reporting exports.
7. Finalize testing, docs, and deployment automation.
