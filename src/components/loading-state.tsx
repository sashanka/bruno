"use client";

export function LoadingState() {
  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-4 py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-600 dark:border-t-zinc-100" />
      <div className="text-center">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Analyzing vendor documents...
        </p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Scraping legal pages and extracting risk signals. This takes 30-60 seconds.
        </p>
      </div>
    </div>
  );
}
