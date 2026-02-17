import type { Scorecard } from "@/lib/schemas/scorecard";

export interface ScorecardDiff {
  overallRiskChanged: boolean;
  previousRisk: string | null;
  currentRisk: string;
  categoryChanges: {
    category: string;
    previousRisk: string | null;
    currentRisk: string;
  }[];
  newFindings: string[];
  removedFindings: string[];
}

const CATEGORY_KEYS = [
  "aiTraining",
  "subProcessors",
  "telemetryRetention",
] as const;

/**
 * Extracts all finding titles from a scorecard, across all categories.
 */
function getAllFindingTitles(scorecard: Scorecard): Set<string> {
  const titles = new Set<string>();
  for (const key of CATEGORY_KEYS) {
    for (const finding of scorecard.categories[key].findings) {
      titles.add(finding.title);
    }
  }
  return titles;
}

/**
 * Compares two scorecards and returns a structured diff.
 * If `previous` is null (initial scan), all current findings are "new".
 */
export function diffScorecards(
  previous: Scorecard | null,
  current: Scorecard
): ScorecardDiff {
  const overallRiskChanged = previous
    ? previous.overallRiskLevel !== current.overallRiskLevel
    : true;

  const categoryChanges: ScorecardDiff["categoryChanges"] = [];
  for (const key of CATEGORY_KEYS) {
    const prevRisk = previous?.categories[key].riskLevel ?? null;
    const currRisk = current.categories[key].riskLevel;
    if (prevRisk !== currRisk) {
      categoryChanges.push({
        category: key,
        previousRisk: prevRisk,
        currentRisk: currRisk,
      });
    }
  }

  const previousTitles = previous ? getAllFindingTitles(previous) : new Set<string>();
  const currentTitles = getAllFindingTitles(current);

  const newFindings = [...currentTitles].filter((t) => !previousTitles.has(t));
  const removedFindings = [...previousTitles].filter((t) => !currentTitles.has(t));

  return {
    overallRiskChanged,
    previousRisk: previous?.overallRiskLevel ?? null,
    currentRisk: current.overallRiskLevel,
    categoryChanges,
    newFindings,
    removedFindings,
  };
}
