import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Clerk auth
const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}));

// Mock Prisma
const mockCreate = vi.fn();
const mockFindUnique = vi.fn();

vi.mock("@/lib/db/client", () => ({
  prisma: {
    workspace: {
      upsert: vi.fn().mockResolvedValue({
        id: "ws_123",
        clerkOrgId: "org_abc",
        name: "Test Org",
      }),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    vendor: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

// Mock workspace resolver (uses the mocked prisma above)
vi.mock("@/lib/auth/workspace", () => ({
  resolveWorkspace: vi.fn().mockResolvedValue({
    id: "ws_123",
    clerkOrgId: "org_abc",
    name: "Test Org",
  }),
}));

import { POST, GET } from "../route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/vendors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/vendors", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ orgId: null, orgSlug: null });

    const res = await POST(makeRequest({ url: "https://example.com" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValue({ orgId: "org_abc", orgSlug: "test" });

    const req = new Request("http://localhost/api/vendors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid json{{{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Invalid JSON");
  });

  it("returns 400 for missing url", async () => {
    mockAuth.mockResolvedValue({ orgId: "org_abc", orgSlug: "test" });

    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid URL", async () => {
    mockAuth.mockResolvedValue({ orgId: "org_abc", orgSlug: "test" });

    const res = await POST(makeRequest({ url: "http://localhost" }));
    expect(res.status).toBe(400);
  });

  it("returns 201 on successful vendor creation", async () => {
    mockAuth.mockResolvedValue({ orgId: "org_abc", orgSlug: "test" });
    mockCreate.mockResolvedValue({
      id: "v_1",
      workspaceId: "ws_123",
      url: "https://example.com",
      hostname: "example.com",
      name: null,
    });

    const res = await POST(makeRequest({ url: "https://example.com" }));
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.hostname).toBe("example.com");
  });

  it("returns 409 for duplicate vendor URL", async () => {
    mockAuth.mockResolvedValue({ orgId: "org_abc", orgSlug: "test" });
    mockCreate.mockRejectedValue(new Error("Unique constraint failed"));

    const res = await POST(makeRequest({ url: "https://example.com" }));
    expect(res.status).toBe(409);
  });
});

describe("GET /api/vendors", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ orgId: null });

    const req = new Request("http://localhost/api/vendors");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns vendor list for workspace", async () => {
    mockAuth.mockResolvedValue({ orgId: "org_abc" });
    mockFindUnique.mockResolvedValue({
      vendors: [
        { id: "v_1", hostname: "example.com", url: "https://example.com" },
      ],
    });

    const req = new Request("http://localhost/api/vendors");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0].hostname).toBe("example.com");
  });

  it("returns empty array when workspace not found", async () => {
    mockAuth.mockResolvedValue({ orgId: "org_new" });
    mockFindUnique.mockResolvedValue(null);

    const req = new Request("http://localhost/api/vendors");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toEqual([]);
  });
});
