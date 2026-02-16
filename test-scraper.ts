/**
 * Manual test script for the scraper pipeline.
 *
 * Prerequisites:
 *   - FIRECRAWL_API_KEY set in .env.local
 *
 * Run:
 *   npx tsx --env-file=.env.local test-scraper.ts
 */

import { scrapeVendorDocuments } from "./src/lib/scraper/index";

const TARGET_URL = process.argv[2] ?? "https://openai.com";

async function main(): Promise<void> {
  console.log(`\n🔍 Scraping legal documents for: ${TARGET_URL}\n`);

  const result = await scrapeVendorDocuments(TARGET_URL);

  console.log(`✅ Vendor: ${result.vendor}`);
  console.log(`   Root URL: ${result.rootUrl}`);
  console.log(`   Documents found: ${result.documents.length}`);
  console.log(`   Errors: ${result.errors.length}\n`);

  for (const doc of result.documents) {
    console.log(`📄 [${doc.type.toUpperCase()}] ${doc.sourceUrl}`);
    console.log(`   Length: ${doc.markdown.length} chars`);
    console.log(`   Preview: ${doc.markdown.slice(0, 200).replace(/\n/g, " ")}...`);
    console.log();
  }

  if (result.errors.length > 0) {
    console.log("⚠️  Errors:");
    for (const err of result.errors) {
      console.log(`   ${err.url}: ${err.message}`);
    }
    console.log();
  }

  console.log("--- COMBINED TEXT STATS ---");
  console.log(`Total combined length: ${result.combinedText.length} chars`);
  console.log(`Approx tokens: ~${Math.round(result.combinedText.length / 4)}`);
  console.log();

  // Uncomment to see the full combined text:
  // console.log(result.combinedText);
}

main().catch((err: unknown) => {
  console.error("\n❌ Scraper failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
