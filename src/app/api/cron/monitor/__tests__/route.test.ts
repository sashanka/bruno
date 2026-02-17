import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRunMonitorCycle = vi.fn();

vi.mock("@/lib/monitor", () => ({
  runMonitorCycle: (...args: unknown[]) => mockRunMonitorCycle(...args),
}));

import { GET } from "../route";

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader) {
    headers.set("Authorization", authHeader);
  }
  return new Request("http://localhost/api/cron/monitor", { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env["CRON_SECRET"] = "test-secret";
});

describe("GET /api/cron/monitor", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 when secret is invalid", async () => {
    const res = await GET(makeRequest("Bearer wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when CRON_SECRET env var is not set", async () => {
    delete process.env["CRON_SECRET"];

    const res = await GET(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(401);
  });

  it("calls runMonitorCycle and returns result on valid auth", async () => {
    mockRunMonitorCycle.mockResolvedValue({
      scanned: 2,
      changed: 1,
      errors: [],
    });

    const res = await GET(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.scanned).toBe(2);
    expect(json.changed).toBe(1);
    expect(mockRunMonitorCycle).toHaveBeenCalledOnce();
  });
});
