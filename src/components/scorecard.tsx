"use client";

import type { Scorecard, CategoryResult } from "@/lib/schemas/scorecard";
import { FindingCard } from "./finding-card";

type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;

type PartialScorecard = DeepPartial<Scorecard>;
type PartialCategoryResult = DeepPartial<CategoryResult>;

const RISK_BADGE_STYLES: Record<string, string> = {
  CRITICAL: "bg-red-600 text-white",
  HIGH: "bg-orange-500 text-white",
  MEDIUM: "bg-yellow-500 text-black",
  LOW: "bg-blue-500 text-white",
  NONE: "bg-green-500 text-white",
};

const CATEGORY_LABELS: Record<string, { title: string; description: string }> = {
  aiTraining: {
    title: "AI Training",
    description: "Does the vendor use customer data to train AI models?",
  },
  subProcessors: {
    title: "Sub-Processors",
    description: "Are third-party AI providers involved in data processing?",
  },
  telemetryRetention: {
    title: "Telemetry & Retention",
    description: "How is usage data collected, retained, and deleted?",
  },
};

function RiskBadge({ level }: { level: string | undefined }) {
  if (!level) return null;
  const style = RISK_BADGE_STYLES[level] ?? "bg-zinc-500 text-white";
  return (
    <span className={`inline-block rounded-md px-3 py-1 text-sm font-bold uppercase ${style}`}>
      {level}
    </span>
  );
}

function CategorySection({
  categoryKey,
  category,
}: {
  categoryKey: string;
  category: PartialCategoryResult | undefined;
}) {
  const label = CATEGORY_LABELS[categoryKey];
  if (!label) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {label.title}
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {label.description}
          </p>
        </div>
        <RiskBadge level={category?.riskLevel} />
      </div>

      {category?.findings && category.findings.length > 0 && (
        <div className="space-y-2">
          {category.findings.map((finding, i) => (
            <FindingCard key={i} finding={finding ?? {}} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ScorecardView({ data }: { data: PartialScorecard }) {
  const categories = data.categories;

  return (
    <div className="w-full max-w-2xl space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              {data.vendor ?? "Analyzing..."}
            </h2>
            {data.analyzedAt && (
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                {new Date(data.analyzedAt).toLocaleDateString()}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Overall Risk
            </p>
            <RiskBadge level={data.overallRiskLevel} />
          </div>
        </div>

        {data.summary && (
          <p className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {data.summary}
          </p>
        )}
      </div>

      {/* Category Sections */}
      {categories && (
        <div className="space-y-6">
          {(["aiTraining", "subProcessors", "telemetryRetention"] as const).map(
            (key) => (
              <CategorySection
                key={key}
                categoryKey={key}
                category={categories[key]}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
