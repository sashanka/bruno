import Firecrawl from "@mendable/firecrawl-js";
import { sanitizeUrl } from "../utils/url";

/**
 * Patterns used to identify legal document pages via Firecrawl map results.
 * Each pattern maps to a document classification.
 */
const LEGAL_PATH_PATTERNS: { pattern: RegExp; type: DocumentType }[] = [
  { pattern: /\/(terms|tos|terms-of-service|terms-of-use|termsofservice|termsofuse)/i, type: "tos" },
  { pattern: /\/(privacy|privacy-policy|privacypolicy|data-privacy)/i, type: "privacy" },
  { pattern: /\/(dpa|data-processing|dataprocessing|data-protection)/i, type: "dpa" },
  { pattern: /\/(subprocessor|sub-processor|subprocessors|sub-processors)/i, type: "subprocessor" },
  // Intentionally omit generic /legal and /policies index pages — they rarely contain useful text
];

type DocumentType = "tos" | "privacy" | "dpa" | "subprocessor" | "other";

export interface ScrapedDocument {
  type: DocumentType;
  sourceUrl: string;
  markdown: string;
}

export interface ScrapeResult {
  vendor: string;
  rootUrl: string;
  documents: ScrapedDocument[];
  combinedText: string;
  errors: { url: string; message: string }[];
}

class ScrapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScrapeError";
  }
}

function createFirecrawlClient(): Firecrawl {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new ScrapeError(
      "FIRECRAWL_API_KEY is not set. Add it to .env.local."
    );
  }
  return new Firecrawl({ apiKey });
}

/**
 * Locale segment pattern (e.g., /de-DE/, /fi-FI/, /pt-BR/).
 * Used to deprioritize localized versions of legal pages.
 */
const LOCALE_SEGMENT = /\/[a-z]{2}(-[A-Z]{2})?\//;

/**
 * Returns true if the URL contains a locale path segment.
 */
function isLocalizedUrl(url: string): boolean {
  return LOCALE_SEGMENT.test(new URL(url).pathname);
}

/**
 * Classify a URL against known legal document path patterns.
 * Returns the document type if matched, or null if no match.
 */
function classifyUrl(url: string): DocumentType | null {
  for (const { pattern, type } of LEGAL_PATH_PATTERNS) {
    if (pattern.test(url)) {
      return type;
    }
  }
  return null;
}

/**
 * Deduplicate discovered URLs, keeping one per document type.
 * Prefers non-localized (English/root) URLs, then shorter URLs as tiebreaker.
 */
function deduplicateByType(
  urls: { url: string; type: DocumentType }[]
): { url: string; type: DocumentType }[] {
  const byType = new Map<DocumentType, { url: string; type: DocumentType }>();

  for (const entry of urls) {
    const existing = byType.get(entry.type);
    if (!existing) {
      byType.set(entry.type, entry);
      continue;
    }

    const existingLocalized = isLocalizedUrl(existing.url);
    const entryLocalized = isLocalizedUrl(entry.url);

    // Prefer non-localized over localized
    if (existingLocalized && !entryLocalized) {
      byType.set(entry.type, entry);
    } else if (existingLocalized === entryLocalized && entry.url.length < existing.url.length) {
      // Same locale status — prefer shorter (more canonical)
      byType.set(entry.type, entry);
    }
  }

  return Array.from(byType.values());
}

/**
 * Use Firecrawl's map endpoint to discover all URLs on the domain,
 * then filter for legal document pages.
 */
async function discoverLegalPages(
  client: Firecrawl,
  rootUrl: string
): Promise<{ url: string; type: DocumentType }[]> {
  const mapResult = await client.map(rootUrl, {
    search: "terms of service privacy policy data processing agreement subprocessor legal",
    limit: 200,
  });

  if (!mapResult.links || mapResult.links.length === 0) {
    throw new ScrapeError(
      `Firecrawl map returned no links for ${rootUrl}. The site may be blocking crawlers.`
    );
  }

  const matched: { url: string; type: DocumentType }[] = [];

  for (const link of mapResult.links) {
    const type = classifyUrl(link.url);
    if (type) {
      matched.push({ url: link.url, type });
    }
  }

  return deduplicateByType(matched);
}

/**
 * Scrape a single URL and return its markdown content.
 */
async function scrapePage(
  client: Firecrawl,
  url: string
): Promise<string> {
  const result = await client.scrape(url, {
    formats: ["markdown"],
    onlyMainContent: true,
    timeout: 30000,
  });

  if (!result.markdown) {
    throw new ScrapeError(`No markdown content returned for ${url}`);
  }

  return result.markdown;
}

/**
 * Well-known paths for legal documents. Used as fallback when
 * Firecrawl map doesn't return results for a given document type.
 */
const FALLBACK_PATHS: { path: string; type: DocumentType }[] = [
  { path: "/policies/terms-of-use", type: "tos" },
  { path: "/terms-of-use", type: "tos" },
  { path: "/terms-of-service", type: "tos" },
  { path: "/terms", type: "tos" },
  { path: "/policies/privacy-policy", type: "privacy" },
  { path: "/privacy-policy", type: "privacy" },
  { path: "/privacy", type: "privacy" },
  { path: "/policies/data-processing-addendum", type: "dpa" },
  { path: "/dpa", type: "dpa" },
  { path: "/subprocessors", type: "subprocessor" },
  { path: "/sub-processors", type: "subprocessor" },
];

/**
 * Merge fallback paths into the discovered set, then re-deduplicate.
 * This ensures non-localized fallback URLs can replace localized map results.
 */
function mergeWithFallbacks(
  rootUrl: string,
  discovered: { url: string; type: DocumentType }[]
): { url: string; type: DocumentType }[] {
  const fallbacks: { url: string; type: DocumentType }[] = [];
  const seenFallbackTypes = new Set<DocumentType>();

  for (const { path, type } of FALLBACK_PATHS) {
    if (seenFallbackTypes.has(type)) continue;
    fallbacks.push({ url: `${rootUrl}${path}`, type });
    seenFallbackTypes.add(type);
  }

  // Combine both sets and let deduplication pick the best URL per type
  return deduplicateByType([...discovered, ...fallbacks]);
}

/**
 * Main public API for Task 1.
 *
 * Given a vendor URL:
 * 1. Sanitize and validate the URL
 * 2. Use Firecrawl map to discover legal document pages
 * 3. Fill in missing document types with well-known fallback paths
 * 4. Scrape each discovered page for markdown content
 * 5. Return structured results with combined text for LLM consumption
 */
export async function scrapeVendorDocuments(
  inputUrl: string
): Promise<ScrapeResult> {
  const { url: rootUrl, hostname } = sanitizeUrl(inputUrl);
  const client = createFirecrawlClient();

  // Step 1: Discover legal pages via map + fallbacks
  const discoveredPages = await discoverLegalPages(client, rootUrl);
  const legalPages = mergeWithFallbacks(rootUrl, discoveredPages);

  if (legalPages.length === 0) {
    throw new ScrapeError(
      `No legal document pages (terms, privacy, DPA) found on ${hostname}. ` +
      `The site may use non-standard URL patterns or block crawlers.`
    );
  }

  // Step 2: Scrape each discovered page
  const documents: ScrapedDocument[] = [];
  const errors: { url: string; message: string }[] = [];

  for (const page of legalPages) {
    try {
      const markdown = await scrapePage(client, page.url);
      documents.push({
        type: page.type,
        sourceUrl: page.url,
        markdown,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ url: page.url, message });
    }
  }

  if (documents.length === 0) {
    throw new ScrapeError(
      `All scrape attempts failed for ${hostname}. Errors: ${JSON.stringify(errors)}`
    );
  }

  // Step 3: Combine all document text with clear section markers
  const combinedText = documents
    .map(
      (doc) =>
        `\n--- BEGIN ${doc.type.toUpperCase()} (source: ${doc.sourceUrl}) ---\n\n${doc.markdown}\n\n--- END ${doc.type.toUpperCase()} ---\n`
    )
    .join("\n");

  return {
    vendor: hostname,
    rootUrl,
    documents,
    combinedText,
    errors,
  };
}
