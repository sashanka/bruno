# Contributing to Bruno

Thanks for your interest in contributing to Bruno! This guide covers everything you need to get started.

## Prerequisites

- Node.js 18+
- npm
- For local testing against real services, you'll need accounts on:
  - [Firecrawl](https://firecrawl.dev) (web scraping)
  - [Anthropic](https://console.anthropic.com) (LLM)
  - [Clerk](https://clerk.com) (auth)
  - [Supabase](https://supabase.com) (database)

Note: **You do not need any API keys to run the test suite.** All external services are mocked with `vi.mock()`.

## Setup

```bash
# Clone the repo
git clone https://github.com/sashanka/bruno.git
cd bruno

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local
# Fill in your API keys (only needed for local dev server, not for tests)

# Generate Prisma client
npx prisma generate

# Run tests (no API keys required)
npm test

# Start dev server (requires .env.local)
npm run dev
```

## Development Workflow

1. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feat/your-feature
   ```

2. **Write code and tests.** Every new module needs tests.

3. **Verify before pushing:**
   ```bash
   npm test              # All tests must pass
   npx tsc --noEmit      # Zero type errors
   npm run lint           # Zero lint errors
   ```

4. **Open a PR** against `main`. CI will run automatically.

## Code Standards

- **TypeScript strict mode.** No `any` types.
- **Zod validation at boundaries.** API inputs and LLM outputs are validated with Zod schemas.
- **Mock external services in tests.** Use `vi.mock()` — no real API calls in the test suite.
- **Early returns** over nested conditionals.
- **Single-responsibility functions.** Each function does one thing.
- Follow existing patterns in the codebase.

## What NOT to Do

- **Don't commit `.env.local`** or any file containing real API keys.
- **Don't modify stable modules** (`src/lib/scraper`, `src/lib/ai`, `src/lib/schemas`, `src/lib/utils`) without opening a discussion first.
- **Don't add dependencies** without justification in the PR description.
- **Don't skip tests.** If you add code, add tests for it.

## Reporting Issues

- Use the [bug report template](https://github.com/sashanka/bruno/issues/new?template=bug_report.md) for bugs.
- Use the [feature request template](https://github.com/sashanka/bruno/issues/new?template=feature_request.md) for new ideas.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
