"use client";

import { experimental_useObject as useObject } from "@ai-sdk/react";
import { ScorecardSchema } from "@/lib/schemas/scorecard";
import { UrlInput } from "@/components/url-input";
import { ScorecardView } from "@/components/scorecard";
import { LoadingState } from "@/components/loading-state";

export default function Home() {
  const { object, submit, isLoading, error, stop } = useObject({
    api: "/api/analyze",
    schema: ScorecardSchema,
  });

  function handleSubmit(url: string) {
    submit({ url });
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-50 px-4 py-12 font-sans dark:bg-zinc-950">
      {/* Header */}
      <header className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          bruno
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Shadow AI Liability Extractor
        </p>
        <p className="mt-1 max-w-md text-xs text-zinc-400 dark:text-zinc-500">
          Enter a vendor URL to scan their legal documents for hidden AI training clauses,
          sub-processor risks, and telemetry retention policies.
        </p>
      </header>

      {/* Input */}
      <UrlInput onSubmit={handleSubmit} isLoading={isLoading} />

      {/* Loading */}
      {isLoading && !object && <LoadingState />}

      {/* Stop button */}
      {isLoading && (
        <button
          onClick={stop}
          className="mt-4 text-xs text-zinc-400 underline hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          Cancel analysis
        </button>
      )}

      {/* Error */}
      {error && (
        <div className="mt-6 w-full max-w-2xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          Analysis failed: {error.message}
        </div>
      )}

      {/* Scorecard */}
      {object && (
        <div className="mt-8">
          <ScorecardView data={object} />
        </div>
      )}
    </div>
  );
}
