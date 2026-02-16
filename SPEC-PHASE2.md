# SPEC-PHASE2.md — Bruno: Workspaces & Continuous Monitoring

---

## 1. Phase 2 Objective

Phase 1 delivered a stateless, single-request pipeline: URL in, streamed scorecard out. There is no persistence, no identity, and no way to track how a vendor's legal posture changes over time.

Phase 2 introduces two capabilities:

1. **Workspaces (Authentication):** Users sign in via Clerk, belong to a Workspace (multi-tenant org), and can save vendors to a persistent watchlist.
2. **Continuous Monitoring (State + Cron):** A daily Vercel Cron job rescrapes every saved vendor, generates a new scorecard, diffs it against the previous scorecard, and logs material changes to an audit trail.

### What This Phase Does NOT Include

- Slack/email notifications (future phase).
- PDF/CSV export of scorecards (future phase).
- Role-based access control beyond Clerk's built-in org roles (future phase).
- Billing or usage metering (future phase).

---

## 2. Tech Stack Additions

| Layer | Technology | Rationale |
|---|---|---|
| Auth | [Clerk](https://clerk.com) (Next.js App Router) | Drop-in auth with org/workspace support. `@clerk/nextjs` middleware protects routes without custom session logic. |
| Database | [Supabase](https://supabase.com) (PostgreSQL) | Managed Postgres with connection pooling. We connect via Prisma — Supabase is the host, not the ORM. |
| ORM | [Prisma](https://www.prisma.io) | Type-safe database client generated from a declarative schema. First-class TypeScript support. |
| Scheduling | [Vercel Cron](https://vercel.com/docs/cron-jobs) | Zero-infra cron via `vercel.json`. Hits an internal API route on a schedule. |

### New Environment Variables

Add to `.env.local` (never committed):

```
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Supabase (Prisma connects via this URL)
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres

# Cron secret (Vercel sets this automatically; used to authenticate cron requests)
CRON_SECRET=...
```

---

## 3. Database Schema (Prisma)

The schema introduces four models. All IDs use `cuid()` for portability. Clerk's `orgId` is stored as the workspace foreign key so we never duplicate Clerk's org state — Clerk remains the source of truth for membership and roles.

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

/// A Clerk organization. Created lazily on first API call from a new orgId.
model Workspace {
  id        String   @id @default(cuid())
  clerkOrgId String  @unique
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  vendors   Vendor[]

  @@map("workspaces")
}

/// A vendor being monitored by a workspace.
model Vendor {
  id          String   @id @default(cuid())
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  url         String   /// The root HTTPS URL (e.g. "https://openai.com")
  hostname    String   /// Extracted hostname for display
  name        String?  /// Optional human-friendly name

  /// The most recent scorecard JSON (full Scorecard object).
  /// Stored as JSONB so we can query fields without deserializing.
  latestScorecard  Json?
  latestScanAt     DateTime?

  /// The previous scorecard JSON, retained for one-cycle diffing.
  previousScorecard Json?
  previousScanAt    DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  auditLogs AuditLog[]

  @@unique([workspaceId, url])
  @@index([workspaceId])
  @@map("vendors")
}

/// Immutable log entry recording a material change detected by the cron monitor.
model AuditLog {
  id        String   @id @default(cuid())
  vendorId  String
  vendor    Vendor   @relation(fields: [vendorId], references: [id], onDelete: Cascade)

  /// What changed: "risk_increased", "risk_decreased", "new_finding", "finding_removed", "initial_scan"
  eventType String

  /// Human-readable summary of the change (e.g. "Overall risk escalated from LOW to HIGH")
  summary   String

  /// Structured diff payload for programmatic consumption
  diff      Json?

  /// Scorecard snapshot at the time of this event
  scorecard Json

  createdAt DateTime @default(now())

  @@index([vendorId, createdAt])
  @@map("audit_logs")
}
```

**Design decisions:**

- **No `User` model.** Clerk owns user identity. We store `clerkOrgId` on `Workspace` and resolve the current user's org via Clerk middleware (`auth().orgId`). This avoids syncing user tables and eliminates an entire class of consistency bugs.
- **`latestScorecard` + `previousScorecard`** rather than a `ScorecardHistory` table. For Phase 2 we only need one-cycle diffing. A full history table is deferred to avoid premature complexity.
- **`@@unique([workspaceId, url])`** prevents duplicate vendor entries within a workspace.
- **`AuditLog` is append-only.** No updates or deletes. Each entry snapshots the full scorecard at that point in time for auditability.

---

## 4. Boundaries & Constraints (CRITICAL)

### Do Not Break the Streaming Engine

The existing modules are **frozen for Phase 2**:

| Module | Status |
|---|---|
| `src/lib/scraper/index.ts` | **Read-only.** The `scrapeVendorDocuments()` function is reused as-is by the cron job. |
| `src/lib/ai/prompt.ts` | **Read-only.** |
| `src/lib/ai/index.ts` | **Read-only.** The `streamScorecard()` function continues to power the one-off streaming UI. |
| `src/lib/schemas/scorecard.ts` | **Read-only.** The `ScorecardSchema` Zod type is reused for validating stored JSON. |
| `src/lib/schemas/api.ts` | **Read-only.** |
| `src/lib/utils/url.ts` | **Read-only.** |
| `src/app/api/analyze/route.ts` | **Read-only.** The one-off analyze endpoint remains stateless and unauthenticated during Phase 2 (gating it behind auth is a Phase 3 concern). |

New code lives in new files. The only existing files that change are:

- `src/app/layout.tsx` — wraps children in `<ClerkProvider>`.
- `package.json` — new dependencies.
- `.env.local` — new variables (never committed).

### TypeScript

- `strict: true` remains enforced. `any` is forbidden.
- All Prisma-generated types must be used directly — no manual re-declarations.
- The `Json` fields (`latestScorecard`, `previousScorecard`, `diff`, `scorecard`) must be validated through `ScorecardSchema` at read time using `z.parse()` before being passed to application code.

### Testing

- Every new module must have Vitest tests before proceeding to the next task.
- Mock Prisma with `vi.mock()` — no test database required.
- Mock Clerk's `auth()` with `vi.mock("@clerk/nextjs/server")`.
- Cron endpoint tests must verify the CRON_SECRET gate, the diff logic, and the audit log writes.

### Out of Scope

- Slack Bot or any external notification integration.
- PDF/CSV generation.
- Custom RBAC beyond Clerk's built-in org roles.
- Migration of the one-off `/api/analyze` endpoint behind auth.

---

## 5. Project Structure (New Files)

```
bruno/
├── prisma/
│   └── schema.prisma                          # Prisma schema (Section 3)
├── vercel.json                                # Cron schedule configuration
├── src/
│   ├── app/
│   │   ├── layout.tsx                         # MODIFIED: wrap in <ClerkProvider>
│   │   ├── sign-in/[[...sign-in]]/page.tsx    # Clerk sign-in page
│   │   ├── sign-up/[[...sign-up]]/page.tsx    # Clerk sign-up page
│   │   ├── dashboard/
│   │   │   └── page.tsx                       # Workspace vendor list + "add vendor" UI
│   │   └── api/
│   │       ├── cron/
│   │       │   └── monitor/
│   │       │       └── route.ts               # GET: drip-feed cron endpoint (every 10 min)
│   │       └── vendors/
│   │           └── route.ts                   # POST: save vendor, GET: list vendors
│   ├── lib/
│   │   ├── db/
│   │   │   └── client.ts                      # Singleton PrismaClient
│   │   ├── auth/
│   │   │   └── workspace.ts                   # resolveWorkspace(clerkOrgId): find-or-create
│   │   └── monitor/
│   │       ├── diff.ts                        # diffScorecards(prev, next): structured diff
│   │       └── index.ts                       # runMonitorCycle(): scrape → score → diff → audit
│   └── middleware.ts                           # Clerk authMiddleware config
```

---

## 6. Gated Execution Plan

Each task is self-contained. Do not begin Task N+1 until Task N passes all tests.

---

### Task 1: Initialize Prisma + Supabase

**Goal:** Database layer is operational. Prisma Client can read/write all four models.

**Steps:**

1. Install dependencies: `prisma`, `@prisma/client`.
2. Create `prisma/schema.prisma` with the schema from Section 3.
3. Create `src/lib/db/client.ts` — singleton `PrismaClient` with the standard Next.js hot-reload guard:
   ```ts
   import { PrismaClient } from "@prisma/client";

   const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

   export const prisma = globalForPrisma.prisma ?? new PrismaClient();

   if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
   ```
4. Run `npx prisma generate` to produce the typed client.
5. Run `npx prisma db push` to sync the schema to Supabase.
6. Add `"db:push": "prisma db push"` and `"db:generate": "prisma generate"` scripts to `package.json`.

**Tests (`src/lib/db/__tests__/client.test.ts`):**
- Verify the module exports a `PrismaClient` instance.
- Verify the singleton pattern (importing twice returns the same reference).

**Exit Criteria:** `npx prisma db push` succeeds against the Supabase instance. `npm test` passes.

---

### Task 2: Clerk Authentication + Workspace Resolution

**Goal:** Users can sign in. Authenticated API routes resolve the current workspace. The dashboard page is protected.

**Steps:**

1. Install dependencies: `@clerk/nextjs`.
2. Create `src/middleware.ts` using Clerk's `clerkMiddleware()`. Protect `/dashboard(.*)` and `/api/vendors(.*)`. Leave `/api/analyze` and `/api/cron/monitor` unprotected (analyze is stateless; cron uses a secret).
3. Modify `src/app/layout.tsx` — wrap `{children}` in `<ClerkProvider>`.
4. Create `src/app/sign-in/[[...sign-in]]/page.tsx` and `src/app/sign-up/[[...sign-up]]/page.tsx` using Clerk's `<SignIn />` and `<SignUp />` components.
5. Create `src/lib/auth/workspace.ts`:
   ```ts
   export async function resolveWorkspace(clerkOrgId: string, orgName: string): Promise<Workspace>
   ```
   Uses `prisma.workspace.upsert()` on `clerkOrgId`. Returns the workspace record.
6. Create `src/app/api/vendors/route.ts`:
   - **POST**: Accepts `{ url: string, name?: string }`. Validates URL via `sanitizeUrl()`. Calls `resolveWorkspace()`. Creates a `Vendor` record. Returns 201.
   - **GET**: Returns all vendors for the current workspace. Requires auth.
7. Create `src/app/dashboard/page.tsx` — lists vendors for the workspace, with an "Add Vendor" form that POSTs to `/api/vendors`.

**Tests:**
- `src/lib/auth/__tests__/workspace.test.ts`: Mock Prisma. Test upsert-on-new, return-existing, missing orgId throws.
- `src/app/api/vendors/__tests__/route.test.ts`: Mock Prisma + Clerk `auth()`. Test POST validation, duplicate vendor 409, GET returns list, unauthenticated 401.

**Exit Criteria:** A signed-in user can add a vendor to their workspace and see it listed on `/dashboard`. `npm test` passes.

---

### Task 3: Continuous Monitoring Cron + Diffing

**Goal:** A drip-feed cron job rescrapes stale vendors in small batches, generates a non-streaming scorecard, diffs it against the stored scorecard, and writes material changes to the audit log. The drip-feed pattern avoids Vercel's 300-second serverless execution limit by processing at most 2 vendors per invocation, with the cron firing every 10 minutes to drain the backlog.

**Steps:**

1. Create `src/lib/monitor/diff.ts`:
   ```ts
   export interface ScorecardDiff {
     overallRiskChanged: boolean;
     previousRisk: string | null;
     currentRisk: string;
     categoryChanges: {
       category: string;
       previousRisk: string | null;
       currentRisk: string;
     }[];
     newFindings: string[];
     removedFindings: string[];
   }

   export function diffScorecards(
     previous: Scorecard | null,
     current: Scorecard
   ): ScorecardDiff
   ```
   Compares `overallRiskLevel`, each category's `riskLevel`, and finding titles. Returns a structured diff.

2. Create `src/lib/monitor/index.ts`:
   ```ts
   export async function runMonitorCycle(): Promise<{
     scanned: number;
     changed: number;
     errors: { vendorId: string; message: string }[];
   }>
   ```
   - Queries the database for up to **2** `Vendor` records where `latestScanAt` is older than 24 hours (or `null`), ordered by `latestScanAt` ascending (stalest first). It only processes these 2 vendors per execution, ensuring the API route safely completes well within Vercel's execution limit.
   - For each vendor: calls `scrapeVendorDocuments()`, then uses the AI SDK's `generateObject()` (non-streaming variant) to produce a complete `Scorecard`.
   - Validates the result against `ScorecardSchema`.
   - Calls `diffScorecards()` against `vendor.latestScorecard`.
   - If material change detected: writes an `AuditLog` entry.
   - Rotates `latestScorecard` → `previousScorecard`, stores new scorecard in `latestScorecard`.
   - Catches per-vendor errors without aborting the entire cycle.

3. Create `src/app/api/cron/monitor/route.ts`:
   - Export `const maxDuration = 300;` at the top of the file to configure Vercel to use the maximum allowed execution window for the route.
   - **GET** handler (Vercel Cron sends GET).
   - Validates `Authorization: Bearer ${CRON_SECRET}` header. Returns 401 if missing/invalid.
   - Calls `runMonitorCycle()`.
   - Returns JSON summary: `{ scanned, changed, errors }`.

4. Create `vercel.json`:
   ```json
   {
     "crons": [
       {
         "path": "/api/cron/monitor",
         "schedule": "*/10 * * * *"
       }
     ]
   }
   ```

**Key design notes:**
- **Drip-feed, not batch.** The cron fires every 10 minutes and processes at most 2 stale vendors per invocation. With a ~30-second scrape+LLM cycle per vendor, each invocation completes in ~60 seconds — well within Vercel's 300-second limit (configured via `export const maxDuration = 300`). A workspace with 100 vendors fully refreshes in ~500 minutes (~8.3 hours), which is acceptable for daily monitoring SLAs.
- The cron job uses `generateObject()` (not `streamObject()`) because there is no client to stream to. This is the only place we call the AI SDK differently from the one-off flow. We import `anthropic` and `ScorecardSchema` from the existing modules — no duplication.

**Tests:**
- `src/lib/monitor/__tests__/diff.test.ts`: Test no-change, risk escalation, risk decrease, new finding added, finding removed, initial scan (previous is null).
- `src/lib/monitor/__tests__/monitor.test.ts`: Mock Prisma, scraper, and AI SDK. Test full cycle with 2 stale vendors (one changed, one unchanged). Test per-vendor error isolation. Test empty vendor list (no stale vendors). Test that at most 2 vendors are fetched per invocation.
- `src/app/api/cron/monitor/__tests__/route.test.ts`: Test missing CRON_SECRET 401, invalid secret 401, happy path calls `runMonitorCycle()`.

**Exit Criteria:** `npm test` passes. A manual `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/monitor` triggers a scan cycle and writes results to Supabase.

---

## 7. Verification Checklist

Before declaring Phase 2 complete:

- [ ] `npx prisma db push` succeeds against Supabase.
- [ ] `npm test` — all tests pass (Phase 1 + Phase 2).
- [ ] `npx tsc --noEmit` — zero type errors.
- [ ] `npm run lint` — zero lint errors.
- [ ] No `any` types in the codebase (`grep -r ": any" src/` returns nothing).
- [ ] `.env.local` is in `.gitignore` and contains all new variables.
- [ ] The one-off `/api/analyze` streaming endpoint still works unchanged.
- [ ] A signed-in user can add a vendor, see it on the dashboard.
- [ ] The cron endpoint rescrapes a saved vendor and writes an audit log on change.
