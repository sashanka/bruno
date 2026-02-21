# SPEC-OPENSOURCE.md — Making Bruno Open Source

---

## 1. Objective

Prepare the Bruno repository for public open-source release. This covers licensing, security hardening, contributor experience, CI/CD automation, and documentation so that external developers can clone, configure, and contribute without friction — and without accidentally leaking secrets or breaking production.

---

## 2. License Selection

### Recommendation: MIT License

| Factor | MIT | Apache 2.0 | AGPL 3.0 |
|--------|-----|-----------|----------|
| Simplicity | Minimal, easy to understand | Longer, patent clause | Complex, copyleft |
| Adoption friction | Lowest — enterprises can use freely | Low — patent grant is a plus | High — copyleft deters enterprise use |
| Patent protection | None | Explicit grant | Implicit |
| Derivative works | No restrictions | No restrictions | Must open-source derivatives |
| Fit for Bruno | Best for maximizing adoption of a SaaS tool | Good if patent concerns arise | Bad — defeats the purpose of B2B adoption |

**Decision:** MIT. Bruno is a product-focused SaaS tool. MIT maximizes adoption and allows companies to fork and self-host without legal friction. The competitive moat is in execution and data, not in the codebase.

### Action

- Create `LICENSE` file at project root with MIT license text, copyright `2025 Sashanka Vishnuvajhala`.

---

## 3. Security Audit Before Going Public

Before making the repo public, audit for leaked secrets and sensitive data.

### 3.1 Git History Scan

Run a secrets scanner against the full git history to ensure no API keys, passwords, or tokens were ever committed — even in commits that were later amended or reverted.

```bash
# Install and run gitleaks
brew install gitleaks
gitleaks detect --source . --verbose
```

If secrets are found in history, the repository must be cleaned with `git filter-repo` or the repo must be recreated from a clean squash.

### 3.2 Files to Verify Are NOT Committed

| File/Pattern | Contains | Must be in .gitignore |
|---|---|---|
| `.env*` | All API keys and database URLs | Yes (already covered) |
| `.claude/` | Claude Code session data | Yes (already covered) |
| `.vercel/` | Vercel project config with org/project IDs | Yes (already covered) |
| `codebase.txt` | Full source dump | Yes (already covered) |
| `repomix-output.xml` | Full source dump | Yes (already covered) |

### 3.3 Environment Variable Template

Update `.env.example` to list all required variables with placeholder values and comments explaining where to obtain each key:

```env
# Firecrawl — sign up at https://firecrawl.dev
FIRECRAWL_API_KEY=fc-...

# Anthropic — get a key at https://console.anthropic.com
ANTHROPIC_API_KEY=sk-ant-...

# Clerk — get keys at https://dashboard.clerk.com
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Supabase PostgreSQL — get connection strings from Supabase project settings > Database
# Pooled connection (port 6543, used at runtime via PgBouncer)
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
# Direct connection (port 5432, used for prisma db push / migrations)
DIRECT_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres

# Cron authentication — generate with: openssl rand -base64 32
CRON_SECRET=...
```

---

## 4. GitHub Repository Configuration

### 4.1 Repo Visibility

Change from private to public:

```bash
gh repo edit sashanka/bruno --visibility public
```

### 4.2 Repository Settings

| Setting | Value | Why |
|---------|-------|-----|
| Default branch | `main` | Standard convention |
| Branch protection on `main` | Require PR reviews, require status checks (CI) | Prevent direct pushes from breaking prod |
| Issues | Enabled | Bug reports, feature requests |
| Discussions | Enabled (optional) | Q&A, general conversation |
| Wiki | Disabled | Docs live in the repo |
| Projects | Disabled | Overkill for now |

### 4.3 Issue and PR Templates

Create `.github/ISSUE_TEMPLATE/bug_report.md`:

```markdown
---
name: Bug Report
about: Report a bug
labels: bug
---

## Describe the bug
A clear description of the problem.

## Steps to reproduce
1. ...
2. ...

## Expected behavior
What should happen.

## Environment
- Node version:
- OS:
- Browser (if UI issue):
```

Create `.github/ISSUE_TEMPLATE/feature_request.md`:

```markdown
---
name: Feature Request
about: Suggest a new feature
labels: enhancement
---

## Problem
What problem does this solve?

## Proposed solution
How should it work?

## Alternatives considered
Other approaches you've thought about.
```

Create `.github/pull_request_template.md`:

```markdown
## What changed?

Brief description of the changes.

## Why?

Context and motivation.

## How to test

Steps to verify the change works.

## Checklist

- [ ] Tests pass (`npm test`)
- [ ] Types check (`npx tsc --noEmit`)
- [ ] Lint passes (`npm run lint`)
- [ ] No secrets committed
```

---

## 5. CI/CD Pipeline (GitHub Actions)

### 5.1 CI Workflow: `.github/workflows/ci.yml`

Runs on every push and PR to `main`. Must pass before merging.

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx prisma generate
      - run: npx tsc --noEmit
      - run: npm run lint
      - run: npm test -- --coverage
```

### 5.2 What CI Does NOT Do

- **No deployment.** Vercel handles deployment via GitHub integration. CI only validates.
- **No secrets in CI.** Tests use `vi.mock()` — no API keys needed.
- **No database.** All Prisma calls are mocked in tests.

---

## 6. Contributing Guide

Create `CONTRIBUTING.md` at project root:

### Contents

1. **Prerequisites** — Node 18+, npm, accounts on Firecrawl/Anthropic/Clerk/Supabase (for local testing against real services).
2. **Setup** — Clone, `npm install`, copy `.env.example` to `.env.local`, fill in keys, `npx prisma generate`, `npm run dev`.
3. **Development workflow:**
   - Create a feature branch from `main`.
   - Write code + tests.
   - Run `npm test` (all 72+ tests must pass).
   - Run `npx tsc --noEmit` (zero type errors).
   - Run `npm run lint` (zero lint errors).
   - Open a PR against `main`.
4. **Code standards:**
   - TypeScript strict mode. No `any`.
   - Every new module needs tests with `vi.mock()` for external dependencies.
   - No direct API calls in tests — all external services are mocked.
   - Follow existing patterns: Zod validation at boundaries, early returns, single-responsibility functions.
5. **What NOT to do:**
   - Don't commit `.env.local` or any file with real API keys.
   - Don't modify Phase 1 modules (`src/lib/scraper`, `src/lib/ai`, `src/lib/schemas`, `src/lib/utils`) without discussion — they are considered stable.
   - Don't add dependencies without justification in the PR description.

---

## 7. Documentation Hygiene

### Files in Final State

| File | Purpose | Status |
|------|---------|--------|
| `README.md` | Project overview, architecture, setup, deployment | Done |
| `SPEC.md` | Phase 1 technical spec (historical reference) | Keep as-is |
| `SPEC-PHASE2.md` | Phase 2 technical spec (historical reference) | Keep as-is |
| `LICENSE` | MIT license | To create |
| `CONTRIBUTING.md` | Contributor guide | To create |
| `.env.example` | Env var template with all variables | To update |
| `.github/workflows/ci.yml` | CI pipeline | To create |
| `.github/ISSUE_TEMPLATE/bug_report.md` | Bug report template | To create |
| `.github/ISSUE_TEMPLATE/feature_request.md` | Feature request template | To create |
| `.github/pull_request_template.md` | PR template | To create |

### Files to Remove Before Going Public

| File | Reason |
|------|--------|
| `test-scraper.ts` | Development artifact, not part of the app |
| `codebase.txt` | Already gitignored, but verify not committed |
| `repomix-output.xml` | Already gitignored, but verify not committed |

---

## 8. Execution Checklist

Complete these steps in order:

### Phase A: Security

- [ ] Run `gitleaks detect` against full git history
- [ ] Verify `.env.local`, `.claude/`, `.vercel/` are gitignored and never committed
- [ ] Update `.env.example` with all 9 environment variables
- [ ] Remove `test-scraper.ts` from the repo

### Phase B: Legal & Docs

- [ ] Create `LICENSE` (MIT)
- [ ] Create `CONTRIBUTING.md`
- [ ] Verify `README.md` is complete (already done)

### Phase C: GitHub Infrastructure

- [ ] Create `.github/workflows/ci.yml`
- [ ] Create `.github/ISSUE_TEMPLATE/bug_report.md`
- [ ] Create `.github/ISSUE_TEMPLATE/feature_request.md`
- [ ] Create `.github/pull_request_template.md`

### Phase D: Go Public

- [ ] Run full test suite one final time: `npm test -- --coverage`
- [ ] Run type check: `npx tsc --noEmit`
- [ ] Run lint: `npm run lint`
- [ ] Push all changes to `main`
- [ ] Change repo visibility to public: `gh repo edit sashanka/bruno --visibility public`
- [ ] Verify CI runs successfully on GitHub Actions
- [ ] Enable branch protection on `main` (require CI pass + PR review)
