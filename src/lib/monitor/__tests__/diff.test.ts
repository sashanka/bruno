import { describe, it, expect } from "vitest";
import { diffScorecards } from "../diff";
import type { Scorecard } from "@/lib/schemas/scorecard";

function makeScorecard(overrides: Partial<Scorecard> = {}): Scorecard {
  return {
    vendor: "example.com",
    analyzedAt: "2025-01-01T00:00:00Z",
    overallRiskLevel: "LOW",
    categories: {
      aiTraining: { riskLevel: "LOW", findings: [] },
      subProcessors: { riskLevel: "LOW", findings: [] },
      telemetryRetention: { riskLevel: "LOW", findings: [] },
    },
    summary: "Low risk vendor.",
    ...overrides,
  };
}

const sampleFinding = {
  title: "AI Training on Customer Data",
  severity: "HIGH" as const,
  detected: true,
  evidence: "We may use your data.",
  sourceDocument: "tos" as const,
  explanation: "Vendor trains on customer data.",
  frameworkRef: "GDPR Art. 6",
};

describe("diffScorecards", () => {
  it("reports no changes when scorecards are identical", () => {
    const scorecard = makeScorecard();
    const diff = diffScorecards(scorecard, scorecard);

    expect(diff.overallRiskChanged).toBe(false);
    expect(diff.categoryChanges).toEqual([]);
    expect(diff.newFindings).toEqual([]);
    expect(diff.removedFindings).toEqual([]);
  });

  it("detects overall risk escalation", () => {
    const prev = makeScorecard({ overallRiskLevel: "LOW" });
    const curr = makeScorecard({ overallRiskLevel: "HIGH" });
    const diff = diffScorecards(prev, curr);

    expect(diff.overallRiskChanged).toBe(true);
    expect(diff.previousRisk).toBe("LOW");
    expect(diff.currentRisk).toBe("HIGH");
  });

  it("detects overall risk decrease", () => {
    const prev = makeScorecard({ overallRiskLevel: "CRITICAL" });
    const curr = makeScorecard({ overallRiskLevel: "MEDIUM" });
    const diff = diffScorecards(prev, curr);

    expect(diff.overallRiskChanged).toBe(true);
    expect(diff.previousRisk).toBe("CRITICAL");
    expect(diff.currentRisk).toBe("MEDIUM");
  });

  it("detects category-level risk changes", () => {
    const prev = makeScorecard();
    const curr = makeScorecard({
      categories: {
        aiTraining: { riskLevel: "HIGH", findings: [] },
        subProcessors: { riskLevel: "LOW", findings: [] },
        telemetryRetention: { riskLevel: "LOW", findings: [] },
      },
    });
    const diff = diffScorecards(prev, curr);

    expect(diff.categoryChanges).toEqual([
      { category: "aiTraining", previousRisk: "LOW", currentRisk: "HIGH" },
    ]);
  });

  it("detects new findings", () => {
    const prev = makeScorecard();
    const curr = makeScorecard({
      categories: {
        aiTraining: { riskLevel: "HIGH", findings: [sampleFinding] },
        subProcessors: { riskLevel: "LOW", findings: [] },
        telemetryRetention: { riskLevel: "LOW", findings: [] },
      },
    });
    const diff = diffScorecards(prev, curr);

    expect(diff.newFindings).toEqual(["AI Training on Customer Data"]);
    expect(diff.removedFindings).toEqual([]);
  });

  it("detects removed findings", () => {
    const prev = makeScorecard({
      categories: {
        aiTraining: { riskLevel: "HIGH", findings: [sampleFinding] },
        subProcessors: { riskLevel: "LOW", findings: [] },
        telemetryRetention: { riskLevel: "LOW", findings: [] },
      },
    });
    const curr = makeScorecard();
    const diff = diffScorecards(prev, curr);

    expect(diff.removedFindings).toEqual(["AI Training on Customer Data"]);
    expect(diff.newFindings).toEqual([]);
  });

  it("handles initial scan (previous is null)", () => {
    const curr = makeScorecard({
      categories: {
        aiTraining: { riskLevel: "HIGH", findings: [sampleFinding] },
        subProcessors: { riskLevel: "LOW", findings: [] },
        telemetryRetention: { riskLevel: "LOW", findings: [] },
      },
    });
    const diff = diffScorecards(null, curr);

    expect(diff.overallRiskChanged).toBe(true);
    expect(diff.previousRisk).toBeNull();
    expect(diff.currentRisk).toBe("LOW");
    expect(diff.newFindings).toEqual(["AI Training on Customer Data"]);
    expect(diff.categoryChanges).toHaveLength(3); // all categories are "new"
  });
});
