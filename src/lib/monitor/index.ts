import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { prisma } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";
import { scrapeVendorDocuments } from "@/lib/scraper";
import { ScorecardSchema, type Scorecard } from "@/lib/schemas/scorecard";
import { SYSTEM_PROMPT, buildUserPrompt } from "@/lib/ai/prompt";
import { diffScorecards } from "./diff";

const BATCH_SIZE = 2;
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface MonitorCycleResult {
  scanned: number;
  changed: number;
  errors: { vendorId: string; message: string }[];
}

/**
 * Runs a single drip-feed monitor cycle.
 * Fetches up to BATCH_SIZE stale vendors, rescrapes, scores, diffs, and logs changes.
 */
export async function runMonitorCycle(): Promise<MonitorCycleResult> {
  const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS);

  const vendors = await prisma.vendor.findMany({
    where: {
      OR: [
        { latestScanAt: null },
        { latestScanAt: { lt: staleThreshold } },
      ],
    },
    orderBy: { latestScanAt: "asc" },
    take: BATCH_SIZE,
  });

  const result: MonitorCycleResult = {
    scanned: 0,
    changed: 0,
    errors: [],
  };

  for (const vendor of vendors) {
    try {
      // 1. Scrape
      const scrapeResult = await scrapeVendorDocuments(vendor.url);

      // 2. Generate scorecard (non-streaming)
      const { object: scorecard } = await generateObject({
        model: anthropic("claude-sonnet-4-5-20250929"),
        schema: ScorecardSchema,
        schemaName: "Scorecard",
        system: SYSTEM_PROMPT,
        prompt: buildUserPrompt(scrapeResult.vendor, scrapeResult.combinedText),
        maxOutputTokens: 4096,
        temperature: 0,
      });

      // 3. Validate
      const validated = ScorecardSchema.parse(scorecard);

      // 4. Diff against previous
      const previousScorecard = vendor.latestScorecard
        ? ScorecardSchema.parse(vendor.latestScorecard)
        : null;

      const diff = diffScorecards(previousScorecard, validated);

      const hasMaterialChange =
        diff.overallRiskChanged ||
        diff.categoryChanges.length > 0 ||
        diff.newFindings.length > 0 ||
        diff.removedFindings.length > 0;

      // 5. Write audit log if changed
      if (hasMaterialChange) {
        const eventType = !previousScorecard
          ? "initial_scan"
          : diff.overallRiskChanged &&
              previousScorecard &&
              riskOrdinal(validated.overallRiskLevel) >
                riskOrdinal(previousScorecard.overallRiskLevel)
            ? "risk_increased"
            : diff.overallRiskChanged
              ? "risk_decreased"
              : diff.newFindings.length > 0
                ? "new_finding"
                : "finding_removed";

        const summary = buildSummary(eventType, diff, previousScorecard);

        await prisma.auditLog.create({
          data: {
            vendorId: vendor.id,
            eventType,
            summary,
            diff: diff as unknown as Prisma.InputJsonValue,
            scorecard: validated as unknown as Prisma.InputJsonValue,
          },
        });

        result.changed++;
      }

      // 6. Rotate scorecards
      await prisma.vendor.update({
        where: { id: vendor.id },
        data: {
          previousScorecard: vendor.latestScorecard as Prisma.InputJsonValue ?? undefined,
          previousScanAt: vendor.latestScanAt,
          latestScorecard: validated as unknown as Prisma.InputJsonValue,
          latestScanAt: new Date(),
        },
      });

      result.scanned++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push({ vendorId: vendor.id, message });
      result.scanned++;
    }
  }

  return result;
}

const RISK_ORDER: Record<string, number> = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

function riskOrdinal(level: string): number {
  return RISK_ORDER[level] ?? -1;
}

function buildSummary(
  eventType: string,
  diff: ReturnType<typeof diffScorecards>,
  previous: Scorecard | null
): string {
  switch (eventType) {
    case "initial_scan":
      return `Initial scan completed. Overall risk: ${diff.currentRisk}.`;
    case "risk_increased":
      return `Overall risk escalated from ${previous?.overallRiskLevel} to ${diff.currentRisk}.`;
    case "risk_decreased":
      return `Overall risk decreased from ${previous?.overallRiskLevel} to ${diff.currentRisk}.`;
    case "new_finding":
      return `New findings detected: ${diff.newFindings.join(", ")}.`;
    case "finding_removed":
      return `Findings removed: ${diff.removedFindings.join(", ")}.`;
    default:
      return `Change detected in vendor scorecard.`;
  }
}
