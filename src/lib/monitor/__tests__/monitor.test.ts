import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma
const mockFindMany = vi.fn();
const mockUpdate = vi.fn();
const mockAuditCreate = vi.fn();

vi.mock("@/lib/db/client", () => ({
  prisma: {
    vendor: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    auditLog: {
      create: (...args: unknown[]) => mockAuditCreate(...args),
    },
  },
}));

// Mock scraper
const mockScrape = vi.fn();
vi.mock("@/lib/scraper", () => ({
  scrapeVendorDocuments: (...args: unknown[]) => mockScrape(...args),
}));

// Mock AI SDK generateObject
const mockGenerateObject = vi.fn();
vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn(() => "mock-model"),
}));

import { runMonitorCycle } from "../index";

const validScorecard = {
  vendor: "example.com",
  analyzedAt: "2025-01-01T00:00:00Z",
  overallRiskLevel: "LOW",
  categories: {
    aiTraining: { riskLevel: "LOW", findings: [] },
    subProcessors: { riskLevel: "LOW", findings: [] },
    telemetryRetention: { riskLevel: "LOW", findings: [] },
  },
  summary: "Low risk.",
};

const changedScorecard = {
  ...validScorecard,
  overallRiskLevel: "HIGH",
  categories: {
    aiTraining: {
      riskLevel: "HIGH",
      findings: [
        {
          title: "AI Training Detected",
          severity: "HIGH",
          detected: true,
          evidence: "We use your data.",
          sourceDocument: "tos",
          explanation: "Risk.",
          frameworkRef: "GDPR Art. 6",
        },
      ],
    },
    subProcessors: { riskLevel: "LOW", findings: [] },
    telemetryRetention: { riskLevel: "LOW", findings: [] },
  },
};

function makeVendor(id: string, latestScorecard: unknown = null, latestScanAt: Date | null = null) {
  return {
    id,
    url: `https://${id}.com`,
    hostname: `${id}.com`,
    latestScorecard,
    latestScanAt,
    previousScorecard: null,
    previousScanAt: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdate.mockResolvedValue({});
  mockAuditCreate.mockResolvedValue({});
});

describe("runMonitorCycle", () => {
  it("processes stale vendors and detects changes", async () => {
    mockFindMany.mockResolvedValue([
      makeVendor("changed-vendor", validScorecard, new Date("2020-01-01")),
      makeVendor("unchanged-vendor", validScorecard, new Date("2020-01-01")),
    ]);

    mockScrape.mockResolvedValue({
      vendor: "example.com",
      rootUrl: "https://example.com",
      documents: [],
      combinedText: "text",
      errors: [],
    });

    // First vendor gets a changed scorecard, second gets the same
    mockGenerateObject
      .mockResolvedValueOnce({ object: changedScorecard })
      .mockResolvedValueOnce({ object: validScorecard });

    const result = await runMonitorCycle();

    expect(result.scanned).toBe(2);
    expect(result.changed).toBe(1);
    expect(result.errors).toEqual([]);
    expect(mockAuditCreate).toHaveBeenCalledOnce();
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  it("isolates per-vendor errors without aborting the cycle", async () => {
    mockFindMany.mockResolvedValue([
      makeVendor("failing-vendor", null, null),
      makeVendor("working-vendor", null, null),
    ]);

    mockScrape
      .mockRejectedValueOnce(new Error("Scrape failed"))
      .mockResolvedValueOnce({
        vendor: "example.com",
        rootUrl: "https://example.com",
        documents: [],
        combinedText: "text",
        errors: [],
      });

    mockGenerateObject.mockResolvedValue({ object: validScorecard });

    const result = await runMonitorCycle();

    expect(result.scanned).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].vendorId).toBe("failing-vendor");
    // Second vendor still processed successfully
    expect(mockUpdate).toHaveBeenCalledOnce();
  });

  it("returns zeros when no stale vendors exist", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await runMonitorCycle();

    expect(result.scanned).toBe(0);
    expect(result.changed).toBe(0);
    expect(result.errors).toEqual([]);
    expect(mockScrape).not.toHaveBeenCalled();
  });

  it("fetches at most 2 vendors per invocation", async () => {
    mockFindMany.mockResolvedValue([]);

    await runMonitorCycle();

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 2 })
    );
  });

  it("writes audit log for initial scan (no previous scorecard)", async () => {
    mockFindMany.mockResolvedValue([
      makeVendor("new-vendor", null, null),
    ]);

    mockScrape.mockResolvedValue({
      vendor: "example.com",
      rootUrl: "https://example.com",
      documents: [],
      combinedText: "text",
      errors: [],
    });

    mockGenerateObject.mockResolvedValue({ object: validScorecard });

    const result = await runMonitorCycle();

    expect(result.changed).toBe(1);
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "initial_scan" }),
      })
    );
  });

  it("logs risk_decreased when overall risk drops", async () => {
    const highScorecard = { ...validScorecard, overallRiskLevel: "HIGH" };
    mockFindMany.mockResolvedValue([
      makeVendor("decreasing-vendor", highScorecard, new Date("2020-01-01")),
    ]);

    mockScrape.mockResolvedValue({
      vendor: "example.com",
      rootUrl: "https://example.com",
      documents: [],
      combinedText: "text",
      errors: [],
    });

    mockGenerateObject.mockResolvedValue({ object: validScorecard }); // LOW

    await runMonitorCycle();

    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "risk_decreased" }),
      })
    );
  });

  it("logs new_finding when findings are added without overall risk change", async () => {
    const prevScorecard = { ...validScorecard, overallRiskLevel: "HIGH" };
    const currWithFinding = {
      ...validScorecard,
      overallRiskLevel: "HIGH",
      categories: {
        aiTraining: {
          riskLevel: "HIGH",
          findings: [{
            title: "New Risk Found",
            severity: "HIGH",
            detected: true,
            evidence: "quote",
            sourceDocument: "tos",
            explanation: "explanation",
            frameworkRef: "GDPR Art. 6",
          }],
        },
        subProcessors: { riskLevel: "LOW", findings: [] },
        telemetryRetention: { riskLevel: "LOW", findings: [] },
      },
    };

    mockFindMany.mockResolvedValue([
      makeVendor("finding-vendor", prevScorecard, new Date("2020-01-01")),
    ]);

    mockScrape.mockResolvedValue({
      vendor: "example.com",
      rootUrl: "https://example.com",
      documents: [],
      combinedText: "text",
      errors: [],
    });

    mockGenerateObject.mockResolvedValue({ object: currWithFinding });

    await runMonitorCycle();

    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "new_finding" }),
      })
    );
  });

  it("logs finding_removed when findings disappear without other changes", async () => {
    const prevWithFinding = {
      ...validScorecard,
      overallRiskLevel: "HIGH",
      categories: {
        aiTraining: {
          riskLevel: "HIGH",
          findings: [{
            title: "Old Risk",
            severity: "HIGH",
            detected: true,
            evidence: "quote",
            sourceDocument: "tos",
            explanation: "explanation",
            frameworkRef: "GDPR Art. 6",
          }],
        },
        subProcessors: { riskLevel: "LOW", findings: [] },
        telemetryRetention: { riskLevel: "LOW", findings: [] },
      },
    };
    const currNoFinding = { ...validScorecard, overallRiskLevel: "HIGH" };

    mockFindMany.mockResolvedValue([
      makeVendor("removed-vendor", prevWithFinding, new Date("2020-01-01")),
    ]);

    mockScrape.mockResolvedValue({
      vendor: "example.com",
      rootUrl: "https://example.com",
      documents: [],
      combinedText: "text",
      errors: [],
    });

    mockGenerateObject.mockResolvedValue({ object: currNoFinding });

    await runMonitorCycle();

    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "finding_removed" }),
      })
    );
  });
});
