# Bruno

Bruno is a Shadow AI Liability Extractor — a B2B micro-SaaS that scrapes vendor legal documents (Terms of Service, Privacy Policy, DPA, Acceptable Use Policy) and uses Claude to generate structured risk scorecards. It continuously monitors vendors for policy changes and alerts when risk levels shift.

## What It Does

1. **One-off Analysis** — Paste a vendor URL, get a real-time streamed risk scorecard covering AI training rights, sub-processor exposure, and telemetry/retention policies.
2. **Vendor Watchlist** — Save vendors to a persistent workspace. Each vendor is tracked with its latest and previous scorecard.
3. **Continuous Monitoring** — A cron job rescrapes saved vendors every 24 hours, diffs the new scorecard against the previous one, and logs material changes (risk escalations, new findings, removed findings) to an immutable audit trail.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐     ┌──────────────┐
│  Next.js UI  │────▶│  Firecrawl   │────▶│  Claude LLM   │────▶│  Scorecard   │
│  (App Router)│     │  (Scraper)   │     │  (AI SDK)     │     │  (Zod-typed) │
└──────┬───────┘     └──────────────┘     └───────────────┘     └──────────────┘
       │
       │  Auth: Clerk ──▶ Workspace resolution ──▶ Prisma ORM ──▶ Supabase (PostgreSQL)
       │
       │  Cron: Vercel Cron (every 10 min) ──▶ /api/cron/monitor ──▶ drip-feed 2 vendors/cycle
```

### Key Design Decisions

- **Drip-feed cron** — Vercel serverless functions have a 300-second execution limit. Instead of scanning all vendors in one shot, the cron fires every 10 minutes and processes at most 2 stale vendors per invocation (~60s total). A workspace with 100 vendors fully refreshes in ~8 hours.
- **Streaming vs batch** — The one-off `/api/analyze` endpoint uses `streamObject()` for real-time UI updates. The cron job uses `generateObject()` since there's no client to stream to.
- **No User model** — Clerk owns user identity. We store `clerkOrgId` on the Workspace model and resolve the current user's org via Clerk middleware. This avoids syncing user tables entirely.
- **Scorecard rotation** — Each vendor stores `latestScorecard` and `previousScorecard` (not a full history table). The cron diffs these two for change detection. Full history is captured in the append-only `AuditLog` table.

## Project Structure

```
bruno/
├── prisma/
│   └── schema.prisma              # Database schema (Workspace, Vendor, AuditLog)
├── prisma.config.ts               # Prisma 7 config (datasource URL)
├── vercel.json                    # Cron schedule: */10 * * * *
├── vitest.config.ts               # Test config with @ path alias
├── src/
│   ├── proxy.ts                   # Clerk middleware (route protection)
│   ├── app/
│   │   ├── page.tsx               # Landing page with one-off URL analyzer
│   │   ├── layout.tsx             # Root layout wrapped in ClerkProvider
│   │   ├── dashboard/page.tsx     # Vendor watchlist UI
│   │   ├── sign-in/               # Clerk sign-in page
│   │   ├── sign-up/               # Clerk sign-up page
│   │   └── api/
│   │       ├── analyze/route.ts   # POST: stateless one-off scorecard (streaming)
│   │       ├── vendors/route.ts   # POST: add vendor, GET: list vendors
│   │       └── cron/monitor/route.ts  # GET: drip-feed cron endpoint
│   ├── components/                # React components (scorecard, findings, URL input)
│   └── lib/
│       ├── ai/
│       │   ├── index.ts           # streamScorecard() — Vercel AI SDK wrapper
│       │   └── prompt.ts          # System prompt + user prompt builder
│       ├── auth/
│       │   └── workspace.ts       # resolveWorkspace() — Clerk org → Prisma upsert
│       ├── db/
│       │   └── client.ts          # Prisma singleton with pg adapter
│       ├── monitor/
│       │   ├── index.ts           # runMonitorCycle() — scrape → score → diff → audit
│       │   └── diff.ts            # diffScorecards() — structured change detection
│       ├── schemas/
│       │   ├── scorecard.ts       # Zod schema for LLM output validation
│       │   └── api.ts             # Zod schema for API request validation
│       ├── scraper/
│       │   └── index.ts           # scrapeVendorDocuments() via Firecrawl
│       └── utils/
│           └── url.ts             # sanitizeUrl() — SSRF protection
```

## Third-Party Services

| Service | Purpose | How It's Used |
|---------|---------|---------------|
| [Firecrawl](https://firecrawl.dev) | Web scraping | Maps vendor sites to find legal pages (ToS, Privacy, DPA, AUP), then scrapes each as markdown. Handles JavaScript-rendered pages. |
| [Anthropic Claude](https://anthropic.com) | LLM analysis | Analyzes scraped legal text via the Vercel AI SDK. Produces structured risk scorecards validated against a Zod schema. Model: `claude-sonnet-4-5-20250929`. |
| [Clerk](https://clerk.com) | Authentication | Drop-in auth with organization/workspace support. Protects dashboard and vendor API routes. No custom session logic needed. |
| [Supabase](https://supabase.com) | PostgreSQL database | Managed Postgres with connection pooling. Stores workspaces, vendors, scorecards, and audit logs. Accessed exclusively through Prisma ORM. |
| [Vercel](https://vercel.com) | Hosting + Cron | Deploys the Next.js app. Runs the monitoring cron job every 10 minutes via `vercel.json` configuration. Auto-deploys on push to `main`. |
| [Prisma](https://prisma.io) | ORM | Type-safe database client generated from `schema.prisma`. Uses the `@prisma/adapter-pg` adapter for Prisma 7 compatibility. |
| [Vercel AI SDK](https://sdk.vercel.ai) | AI integration | Provides `streamObject()` for real-time UI streaming and `generateObject()` for batch cron processing. Handles structured output with Zod schema validation. |

## Environment Variables

Create a `.env.local` file in the project root:

```env
# Firecrawl — get a key at https://firecrawl.dev
FIRECRAWL_API_KEY=fc-...

# Anthropic — get a key at https://console.anthropic.com
ANTHROPIC_API_KEY=sk-ant-...

# Clerk — get keys at https://dashboard.clerk.com
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Supabase PostgreSQL — get connection strings from your Supabase project settings
# Pooled connection (port 6543, used at runtime)
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
# Direct connection (port 5432, used for migrations)
DIRECT_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres

# Cron authentication — generate with: openssl rand -base64 32
CRON_SECRET=...
```

## Setup

### Prerequisites

- Node.js 18+
- npm
- Accounts on: [Firecrawl](https://firecrawl.dev), [Anthropic](https://console.anthropic.com), [Clerk](https://clerk.com), [Supabase](https://supabase.com), [Vercel](https://vercel.com)

### Local Development

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in environment variables
cp .env.example .env.local
# Edit .env.local with your API keys and database URLs

# 3. Generate Prisma client
npx prisma generate

# 4. Push schema to database
# Note: Prisma 7 requires env vars to be available at CLI runtime.
# Either source .env.local or pass inline:
source .env.local && npx prisma db push

# 5. Start the dev server
npm run dev
```

The app will be available at `http://localhost:3000`.

### Vercel Deployment

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Log in (opens browser)
vercel login

# 3. Link the project
vercel link --yes

# 4. Add environment variables
# For each variable in .env.local:
printf 'your-value' | vercel env add VARIABLE_NAME production --sensitive --force

# 5. Deploy
vercel --prod
```

After the first deploy, Vercel auto-deploys on every push to `main`. The cron job (`/api/cron/monitor`) starts running automatically every 10 minutes.

The `CRON_SECRET` environment variable must be set on Vercel — it's used to authenticate cron requests. Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` when triggering cron endpoints.

## Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `npm run dev` | `next dev` | Start development server with Turbopack |
| `npm run build` | `prisma generate && next build` | Generate Prisma client + production build |
| `npm start` | `next start` | Start production server |
| `npm test` | `vitest` | Run test suite (72 tests, ~97% coverage) |
| `npm run lint` | `eslint` | Lint the codebase |
| `npm run db:generate` | `prisma generate` | Regenerate Prisma client after schema changes |
| `npm run db:push` | `prisma db push` | Push schema changes to the database |

## Testing

Tests use [Vitest](https://vitest.dev) with `vi.mock()` for mocking external dependencies (Firecrawl, Anthropic, Prisma, Clerk). No test database or API keys required.

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run a specific test file
npm test -- src/lib/monitor/__tests__/diff.test.ts
```

## Database Schema

Three models in PostgreSQL via Prisma:

- **Workspace** — Maps 1:1 to a Clerk organization. Created lazily on first API call.
- **Vendor** — A vendor URL being monitored within a workspace. Stores the latest and previous scorecard as JSONB. Unique on `(workspaceId, url)`.
- **AuditLog** — Append-only record of material changes. Event types: `initial_scan`, `risk_increased`, `risk_decreased`, `new_finding`, `finding_removed`. Each entry snapshots the full scorecard for auditability.
