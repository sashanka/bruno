import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock both Prisma and the adapter to avoid any real DB validation
const MockPrismaClient = vi.fn(function () {
  return { $connect: vi.fn(), $disconnect: vi.fn() };
});

vi.mock("@prisma/client", () => ({
  PrismaClient: MockPrismaClient,
}));

vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: vi.fn(function () {
    return { provider: "postgres" };
  }),
}));

describe("prisma client singleton", () => {
  beforeEach(() => {
    vi.resetModules();
    // Clear the global singleton between tests
    const g = globalThis as Record<string, unknown>;
    delete g.prisma;
  });

  it("exports an object created by PrismaClient constructor", async () => {
    const { prisma } = await import("../client");
    expect(prisma).toBeDefined();
    expect(prisma).toHaveProperty("$connect");
    expect(MockPrismaClient).toHaveBeenCalled();
  });

  it("returns the same instance on subsequent imports (singleton)", async () => {
    const { prisma: first } = await import("../client");
    // Second import within the same global context should return the cached instance
    const { prisma: second } = await import("../client");
    expect(first).toBe(second);
  });
});
