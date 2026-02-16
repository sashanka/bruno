"use client";

import { useEffect, useState } from "react";
import { useOrganization } from "@clerk/nextjs";

interface Vendor {
  id: string;
  url: string;
  hostname: string;
  name: string | null;
  latestScanAt: string | null;
  createdAt: string;
}

export default function DashboardPage() {
  const { organization, isLoaded } = useOrganization();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (!isLoaded || !organization) return;
    fetchVendors();
  }, [isLoaded, organization]);

  async function fetchVendors() {
    const res = await fetch("/api/vendors");
    if (res.ok) {
      setVendors(await res.json());
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsAdding(true);

    try {
      const res = await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), name: name.trim() || undefined }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to add vendor");
        return;
      }

      setUrl("");
      setName("");
      await fetchVendors();
    } finally {
      setIsAdding(false);
    }
  }

  if (!isLoaded) {
    return <div className="p-8 text-center text-zinc-500">Loading...</div>;
  }

  if (!organization) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <p className="text-zinc-500">
          Select or create an organization to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        {organization.name} — Vendors
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Add vendors to monitor their legal documents for AI risk.
      </p>

      {/* Add vendor form */}
      <form onSubmit={handleAdd} className="mt-6 flex gap-3">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Vendor URL (e.g. openai.com)"
          required
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          className="w-40 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <button
          type="submit"
          disabled={isAdding || !url.trim()}
          className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {isAdding ? "Adding..." : "Add"}
        </button>
      </form>

      {error && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* Vendor list */}
      <div className="mt-8 space-y-3">
        {vendors.length === 0 ? (
          <p className="text-sm text-zinc-400">No vendors added yet.</p>
        ) : (
          vendors.map((v) => (
            <div
              key={v.id}
              className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">
                    {v.name ?? v.hostname}
                  </p>
                  <p className="text-xs text-zinc-400">{v.url}</p>
                </div>
                <span className="text-xs text-zinc-400">
                  {v.latestScanAt
                    ? `Scanned ${new Date(v.latestScanAt).toLocaleDateString()}`
                    : "Not scanned yet"}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
