import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpsert = vi.fn();

vi.mock("@/lib/db/client", () => ({
  prisma: {
    workspace: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
  },
}));

import { resolveWorkspace } from "../workspace";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveWorkspace", () => {
  const mockWorkspace = {
    id: "ws_123",
    clerkOrgId: "org_abc",
    name: "Acme Corp",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("upserts and returns a workspace for a new org", async () => {
    mockUpsert.mockResolvedValue(mockWorkspace);

    const result = await resolveWorkspace("org_abc", "Acme Corp");

    expect(result).toEqual(mockWorkspace);
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { clerkOrgId: "org_abc" },
      update: { name: "Acme Corp" },
      create: { clerkOrgId: "org_abc", name: "Acme Corp" },
    });
  });

  it("returns existing workspace on subsequent calls", async () => {
    mockUpsert.mockResolvedValue(mockWorkspace);

    const result = await resolveWorkspace("org_abc", "Acme Corp");

    expect(result.id).toBe("ws_123");
    expect(mockUpsert).toHaveBeenCalledOnce();
  });

  it("throws when clerkOrgId is empty", async () => {
    await expect(resolveWorkspace("", "Acme Corp")).rejects.toThrow(
      "clerkOrgId is required"
    );
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
