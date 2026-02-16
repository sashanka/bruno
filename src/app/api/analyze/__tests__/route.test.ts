import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@/lib/scraper", () => ({
  scrapeVendorDocuments: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  streamScorecard: vi.fn(),
}));

import { POST } from "../route";
import { scrapeVendorDocuments } from "@/lib/scraper";
import { streamScorecard } from "@/lib/ai";

const mockScrape = vi.mocked(scrapeVendorDocuments);
const mockStream = vi.mocked(streamScorecard);

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeInvalidJsonRequest(): Request {
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not valid json{{{",
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("POST /api/analyze", () => {
  it("returns 400 for invalid JSON body", async () => {
    const res = await POST(makeInvalidJsonRequest());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Invalid JSON");
  });

  it("returns 400 for missing url field", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 502 on scrape error", async () => {
    mockScrape.mockRejectedValue(new Error("Scrape failed"));

    const res = await POST(makeRequest({ url: "https://example.com" }));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toContain("Scrape failed");
  });

  it("returns 500 on LLM error", async () => {
    mockScrape.mockResolvedValue({
      vendor: "example.com",
      rootUrl: "https://example.com",
      documents: [],
      combinedText: "text",
      errors: [],
    });
    mockStream.mockImplementation(() => {
      throw new Error("LLM failed");
    });

    const res = await POST(makeRequest({ url: "https://example.com" }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain("LLM failed");
  });

  it("calls toTextStreamResponse on happy path", async () => {
    const mockResponse = new Response("streamed data", { status: 200 });
    mockScrape.mockResolvedValue({
      vendor: "example.com",
      rootUrl: "https://example.com",
      documents: [],
      combinedText: "text",
      errors: [],
    });
    mockStream.mockReturnValue({
      toTextStreamResponse: () => mockResponse,
    } as ReturnType<typeof streamScorecard>);

    const res = await POST(makeRequest({ url: "https://example.com" }));
    expect(res.status).toBe(200);
    expect(mockStream).toHaveBeenCalledOnce();
  });
});
