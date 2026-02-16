import { NextResponse } from "next/server";
import { AnalyzeRequestSchema } from "@/lib/schemas/api";
import { scrapeVendorDocuments } from "@/lib/scraper";
import { streamScorecard } from "@/lib/ai";

export async function POST(request: Request) {
  // 1. Parse and validate the request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body" },
      { status: 400 }
    );
  }

  const parsed = AnalyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  // 2. Scrape vendor legal documents
  console.log("[analyze] Starting scrape for:", parsed.data.url);
  let scrapeResult;
  try {
    scrapeResult = await scrapeVendorDocuments(parsed.data.url);
    console.log("[analyze] Scrape complete:", scrapeResult.documents.length, "documents,", scrapeResult.combinedText.length, "chars");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scraping failed";
    console.error("[analyze] Scrape error:", message);
    return NextResponse.json(
      { error: `Failed to scrape vendor documents: ${message}` },
      { status: 502 }
    );
  }

  // 3. Stream the LLM scorecard response
  console.log("[analyze] Starting LLM stream...");
  try {
    const result = streamScorecard(scrapeResult);
    return result.toTextStreamResponse();
  } catch (err) {
    const message = err instanceof Error ? err.message : "LLM extraction failed";
    console.error("[analyze] LLM error:", message);
    return NextResponse.json(
      { error: `Analysis failed: ${message}` },
      { status: 500 }
    );
  }
}
