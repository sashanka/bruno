import { describe, it, expect } from "vitest";
import { ScorecardSchema } from "../scorecard";
import { AnalyzeRequestSchema } from "../api";

const validFinding = {
  title: "AI Training on Customer Data",
  severity: "HIGH" as const,
  detected: true,
  evidence: "We may use your data to improve our models.",
  sourceDocument: "tos" as const,
  explanation: "Vendor uses customer data for AI training by default.",
  frameworkRef: "GDPR Art. 6",
};

const validCategory = {
  riskLevel: "HIGH" as const,
  findings: [validFinding],
};

const validScorecard = {
  vendor: "acme.com",
  analyzedAt: "2025-01-01T00:00:00Z",
  overallRiskLevel: "HIGH" as const,
  categories: {
    aiTraining: validCategory,
    subProcessors: { riskLevel: "LOW" as const, findings: [] },
    telemetryRetention: { riskLevel: "MEDIUM" as const, findings: [validFinding] },
  },
  summary: "Acme uses customer data for AI training. Medium risk overall.",
};

describe("ScorecardSchema", () => {
  it("accepts a valid full scorecard", () => {
    const result = ScorecardSchema.safeParse(validScorecard);
    expect(result.success).toBe(true);
  });

  it("rejects invalid risk levels", () => {
    const invalid = {
      ...validScorecard,
      overallRiskLevel: "SUPER_HIGH",
    };
    const result = ScorecardSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const { vendor: _, ...noVendor } = validScorecard;
    const result = ScorecardSchema.safeParse(noVendor);
    expect(result.success).toBe(false);
  });
});

describe("AnalyzeRequestSchema", () => {
  it("accepts a valid request", () => {
    const result = AnalyzeRequestSchema.safeParse({ url: "https://example.com" });
    expect(result.success).toBe(true);
  });

  it("rejects empty url", () => {
    const result = AnalyzeRequestSchema.safeParse({ url: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing url", () => {
    const result = AnalyzeRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
