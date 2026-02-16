import { streamObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { ScorecardSchema } from "../schemas/scorecard";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";
import type { ScrapeResult } from "../scraper";

/**
 * Streams a structured Scorecard object from Claude given scraped vendor documents.
 *
 * Uses Vercel AI SDK `streamObject` with a Zod schema to enforce
 * strict JSON output via tool_choice. Returns the StreamObjectResult
 * so the caller (API route) can pipe it directly to the response.
 */
export function streamScorecard(scrapeResult: ScrapeResult) {
  return streamObject({
    model: anthropic("claude-sonnet-4-5-20250929"),
    schema: ScorecardSchema,
    schemaName: "Scorecard",
    schemaDescription:
      "Structured risk scorecard analyzing a vendor's legal documents for hidden AI training clauses, sub-processor risks, and telemetry retention policies.",
    system: SYSTEM_PROMPT,
    prompt: buildUserPrompt(scrapeResult.vendor, scrapeResult.combinedText),
    maxOutputTokens: 4096,
    temperature: 0,
    onError({ error }) {
      console.error("[streamScorecard] Stream error:", error);
    },
  });
}
