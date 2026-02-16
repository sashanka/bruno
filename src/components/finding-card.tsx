"use client";

import type { Finding } from "@/lib/schemas/scorecard";

type PartialFinding = Partial<Finding>;

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  HIGH: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  MEDIUM: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  LOW: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  NONE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

function SeverityBadge({ severity }: { severity: string | undefined }) {
  if (!severity) return null;
  const style = SEVERITY_STYLES[severity] ?? "bg-zinc-100 text-zinc-800";
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold uppercase ${style}`}>
      {severity}
    </span>
  );
}

export function FindingCard({ finding }: { finding: PartialFinding }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {finding.title ?? "Loading..."}
        </h4>
        <SeverityBadge severity={finding.severity} />
      </div>

      {finding.explanation && (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {finding.explanation}
        </p>
      )}

      {finding.evidence && (
        <blockquote className="mt-3 border-l-2 border-zinc-300 pl-3 text-xs italic text-zinc-500 dark:border-zinc-600 dark:text-zinc-500">
          &ldquo;{finding.evidence}&rdquo;
        </blockquote>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {finding.sourceDocument && (
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            Source: {finding.sourceDocument.toUpperCase()}
          </span>
        )}
        {finding.frameworkRef && (
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-mono text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            {finding.frameworkRef}
          </span>
        )}
      </div>
    </div>
  );
}
