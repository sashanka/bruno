# SPEC.md — bruno: Shadow AI Liability Extractor

---

## 1. High-Level Vision

**bruno** is a B2B micro-SaaS that answers one question for IT Procurement and Security teams: *"Is this vendor quietly using our data to train AI models?"*

### The Problem

Enterprise vendors are embedding AI training clauses, broad telemetry retention policies, and opaque sub-processor chains deep inside their Terms of Service, Privacy Policies, and Data Processing Agreements. CISOs and procurement leads don't have time to read 40-page legal documents for every vendor evaluation. They need binary, framework-aligned risk signals — not conversational summaries.

### The Product

A user inputs a vendor URL. bruno uses the Firecrawl API to scrape the vendor's legal documents (ToS, Privacy Policy, DPA) in seconds, feeds the text to Claude 3.7 Sonnet, and streams a **structured JSON scorecard** back to the UI in real-time using the Vercel AI SDK.

### The User

The primary user is a **CISO or IT Procurement lead** performing vendor risk assessments. They want:
- **Binary answers**: YES/NO flags with severity ratings (CRITICAL / HIGH / MEDIUM / LOW / NONE).
- **Evidence**: Direct quotes from the source document backing each finding.
- **Speed & UX**: Real-time streaming of findings as the LLM thinks. No infinite loading spinners, no email notifications.

---

## 2. Tech Stack & Commands

### Core Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend & API | Next.js 14+ (App Router) | Server components, API routes, single deployable unit |
| UI | React 18+, Tailwind CSS 3+ | Rapid UI, utility-first styling |
| Language | TypeScript (strict mode) | Type safety across the entire stack |
| Scraping | Firecrawl API | Headless scraping via external API. Bypasses 50MB serverless binary limits and massive latency. |
| AI Engine | Anthropic API (Claude 3.7 Sonnet) | Massive context window. Forced structured JSON output via `tool_choice`. |
| Streaming | Vercel AI SDK (`ai` package) | Streams the LLM JSON output to the client progressively. |
| Validation | Zod | Runtime schema validation for LLM output and API boundaries |
| Testing | Vitest | Fast, native TypeScript support. |

### CLI Commands

```bash
# Install dependencies
npm install

# Run development server (http://localhost:3000)
npm run dev

# Production build
npm run build

# Start production server
npm start

# Lint
npm run lint

# Type check
npx tsc --noEmit

# Run tests
npm test
```

### Environment Variables

All secrets live in `.env.local` (never committed). Required variables:

```
ANTHROPIC_API_KEY=sk-ant-...
FIRECRAWL_API_KEY=fc-...
```

---

## 3. Project Structure

```
bruno/
├── SPEC.md
├── .env.local                  # secrets — NEVER committed
├── .env.example                # template with placeholder values
├── .gitignore
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── src/
│   ├── app/
│   │   ├── layout.tsx          # root layout
│   │   ├── page.tsx            # landing / input page / streaming UI
│   │   └── api/
│   │       └── analyze/
│   │           └── route.ts    # POST endpoint: Firecrawl scrape → Vercel AI SDK streamObject
│   ├── components/
│   │   ├── url-input.tsx       # vendor URL input form
│   │   ├── scorecard.tsx       # uses `useObject` to render streaming JSON
│   │   ├── finding-card.tsx    # individual finding with severity + evidence
│   │   └── loading-state.tsx   # progress indicator during analysis
│   ├── lib/
│   │   ├── scraper/
│   │   │   ├── index.ts        # public API: scrapeVendorDocuments(url) via Firecrawl
│   │   ├── ai/
│   │   │   ├── index.ts        # Anthropic streaming integration
│   │   │   └── prompt.ts       # system prompt instructions
│   │   ├── schemas/
│   │   │   ├── scorecard.ts    # Zod schema for the full scorecard (Tool definition)
│   │   │   └── api.ts          # Zod schemas for API request validation
│   │   └── utils/
│   │       └── url.ts          # URL normalization and validation
│   └── types/
│       └── index.ts            # shared TypeScript type definitions
```

---

## 4. Code Style & Rules

### TypeScript

* **Strict mode**: `strict: true` in `tsconfig.json`. No exceptions.
* **No `any`**: Every value must have an explicit type or be inferred.
* **No type assertions (`as`)** unless accompanied by a runtime validation (Zod `.parse()`).

### Functions

* **Single responsibility**: Each function does one thing.
* **Early returns over nested conditionals.**

### Error Handling

* **Fail loudly at boundaries**: API routes catch errors and return structured error responses with appropriate HTTP status codes (400 for bad input, 502 for scrape failures, 500 for LLM failures).
* **No silent swallowing**: Never `catch (e) {}`.

---

## 5. Boundaries (CRITICAL)

### Security

* **NEVER commit `.env`, `.env.local`, or any file containing API keys.**
* **Sanitize all user-supplied URLs** before passing to Firecrawl. Validate scheme (https only), reject internal/private IP ranges.

### Architecture

* **No Background Jobs or Databases:** The architecture must remain synchronous and eventless. No Inngest, no Trigger.dev, no Postgres, no Clerk, no email notifications. Everything happens in the single HTTP request using HTTP streaming.
* **No Playwright:** Do not install Puppeteer or Playwright. Rely strictly on Firecrawl API.

### LLM Integrity

* **Enforce Tool Use:** Do not rely on system prompts alone to format JSON. You MUST use Anthropic's tool calling API (`tool_choice`) with the Zod schema defined as the single available tool to guarantee strict JSON output.
* **Never Mock LLM Output:** If the stream fails, display an error state. Do not fall back to fabricated UI data.

---

## 6. Execution Plan

The build is broken into three isolated, sequential tasks. Each task produces a working module before the next begins.

### Task 1: The Scraper Pipeline

**Goal:** Given a vendor URL, use the Firecrawl API to extract the vendor's ToS, Privacy Policy, and DPA text.

**Scope:**

* `src/lib/scraper/*`
* `src/lib/utils/url.ts`

**Deliverable:** A module `scrapeVendorDocuments(url: string)` that calls the Firecrawl REST API or Node SDK. Instruct Firecrawl to specifically target and crawl legal, privacy, terms, and subprocessor pages associated with the root domain. Return a clean string of the combined legal text.

**Exit Criteria:** A local test script successfully hits Firecrawl and prints the extracted legal text of a known vendor (e.g., "https://openai.com") to the terminal.

---

### Task 2: The LLM Streaming Engine

**Goal:** Take the scraped text and pipe it through Claude 3.7 Sonnet using the Vercel AI SDK to generate a structured stream.

**Scope:**

* `src/lib/ai/*`
* `src/lib/schemas/*`
* `src/app/api/analyze/route.ts`

**Deliverables:**

1. **Zod schemas** defining the `Scorecard` structure (containing `vendor`, `overallRiskLevel`, and categories for `aiTraining`, `subProcessors`, `telemetryRetention`).
2. **API Route**: Write `/api/analyze/route.ts` using the Vercel AI SDK `streamObject` function. Pass the scraped text to Claude. You MUST use the `Scorecard` Zod schema as the enforced tool output.

**Exit Criteria:** Hitting the `/api/analyze` endpoint with Postman or cURL returns a stream of partial JSON chunks that eventually complete the full Zod schema.

---

### Task 3: The Streaming UI

**Goal:** Build the Next.js dashboard that consumes the stream.

**Scope:**

* `src/app/page.tsx`
* `src/components/*`

**Deliverables:**

1. **Landing page**: A single input field for the vendor URL.
2. **Streaming Consumer**: Use the `useObject` hook from the Vercel AI SDK (`ai/react`) on the client side (`page.tsx`). As the user submits the URL, show a loading state, and then progressively render the risk category cards as the JSON stream populates the object in real-time.

**Exit Criteria:** A user enters a URL, and the scorecard UI builds itself dynamically on the screen within 15-25 seconds, rendering the findings before the full document is even finished parsing.
