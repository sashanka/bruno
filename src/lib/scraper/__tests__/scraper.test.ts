import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Firecrawl before importing the module under test
const mockMap = vi.fn();
const mockScrape = vi.fn();

vi.mock("@mendable/firecrawl-js", () => {
  const MockFirecrawl = vi.fn(function () {
    return { map: mockMap, scrape: mockScrape };
  });
  return { default: MockFirecrawl };
});

import { scrapeVendorDocuments } from "../index";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.FIRECRAWL_API_KEY = "test-key";
});

describe("scrapeVendorDocuments", () => {
  it("returns correct ScrapeResult on happy path", async () => {
    mockMap.mockResolvedValue({
      links: [
        { url: "https://example.com/terms-of-service" },
        { url: "https://example.com/privacy-policy" },
      ],
    });
    mockScrape.mockResolvedValue({ markdown: "# Document Content" });

    const result = await scrapeVendorDocuments("https://example.com");

    expect(result.vendor).toBe("example.com");
    expect(result.rootUrl).toBe("https://example.com");
    expect(result.documents.length).toBeGreaterThanOrEqual(2);
    expect(result.errors).toEqual([]);
    expect(result.combinedText).toContain("--- BEGIN TOS");
    expect(result.combinedText).toContain("--- BEGIN PRIVACY");
  });

  it("throws ScrapeError when map returns no links", async () => {
    mockMap.mockResolvedValue({ links: [] });

    await expect(scrapeVendorDocuments("https://example.com")).rejects.toThrow(
      "Firecrawl map returned no links"
    );
  });

  it("throws ScrapeError when no legal pages matched (fallbacks all fail)", async () => {
    mockMap.mockResolvedValue({
      links: [
        { url: "https://example.com/about" },
        { url: "https://example.com/contact" },
      ],
    });
    // All scrapes (fallback paths) fail
    mockScrape.mockRejectedValue(new Error("Not found"));

    await expect(scrapeVendorDocuments("https://example.com")).rejects.toThrow(
      "All scrape attempts failed"
    );
  });

  it("populates both documents and errors on partial scrape failure", async () => {
    mockMap.mockResolvedValue({
      links: [
        { url: "https://example.com/terms" },
        { url: "https://example.com/privacy" },
      ],
    });

    let callCount = 0;
    mockScrape.mockImplementation(() => {
      callCount++;
      // First call succeeds, rest fail
      if (callCount === 1) {
        return Promise.resolve({ markdown: "# Terms content" });
      }
      return Promise.reject(new Error("Scrape failed"));
    });

    const result = await scrapeVendorDocuments("https://example.com");

    expect(result.documents.length).toBeGreaterThanOrEqual(1);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it("throws ScrapeError when all scrapes fail", async () => {
    mockMap.mockResolvedValue({
      links: [
        { url: "https://example.com/terms" },
        { url: "https://example.com/privacy" },
      ],
    });
    mockScrape.mockRejectedValue(new Error("Scrape failed"));

    await expect(scrapeVendorDocuments("https://example.com")).rejects.toThrow(
      "All scrape attempts failed"
    );
  });

  it("throws ScrapeError when FIRECRAWL_API_KEY is missing", async () => {
    delete process.env.FIRECRAWL_API_KEY;

    await expect(scrapeVendorDocuments("https://example.com")).rejects.toThrow(
      "FIRECRAWL_API_KEY is not set"
    );
  });

  it("prefers non-localized URL over localized variant", async () => {
    mockMap.mockResolvedValue({
      links: [
        { url: "https://example.com/de-DE/policies/terms-of-use" },
        { url: "https://example.com/policies/terms-of-use" },
      ],
    });
    mockScrape.mockResolvedValue({ markdown: "# Content" });

    const result = await scrapeVendorDocuments("https://example.com");

    // The non-localized URL should be the one used for tos
    const tosDoc = result.documents.find((d) => d.type === "tos");
    expect(tosDoc).toBeDefined();
    expect(tosDoc!.sourceUrl).not.toContain("de-DE");
  });

  it("fills in missing document types with fallback paths", async () => {
    // Map only returns a terms page; fallbacks should add privacy, dpa, subprocessor
    mockMap.mockResolvedValue({
      links: [{ url: "https://example.com/terms-of-service" }],
    });
    mockScrape.mockResolvedValue({ markdown: "# Content" });

    const result = await scrapeVendorDocuments("https://example.com");

    const types = result.documents.map((d) => d.type);
    expect(types).toContain("tos");
    // Fallbacks should have added at least one more type
    expect(types.length).toBeGreaterThan(1);
  });

  it("produces combinedText with correct section markers", async () => {
    mockMap.mockResolvedValue({
      links: [{ url: "https://example.com/privacy-policy" }],
    });
    mockScrape.mockResolvedValue({ markdown: "Privacy content here" });

    const result = await scrapeVendorDocuments("https://example.com");

    expect(result.combinedText).toContain("--- BEGIN PRIVACY");
    expect(result.combinedText).toContain("--- END PRIVACY");
    expect(result.combinedText).toContain("Privacy content here");
  });
});
