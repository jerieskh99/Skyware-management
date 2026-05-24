import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma, resetPrisma } from "../helpers/prisma";
import { makeEmployeeSession, makeAdminSession, mockAuthAs } from "../helpers/session";

// Capture redirect targets without actually throwing.
const redirectCalls: string[] = [];
vi.mock("next/navigation", () => ({
  redirect: vi.fn((target: string) => {
    redirectCalls.push(target);
    throw new Error(`__REDIRECT__:${target}`);
  }),
  notFound: vi.fn(),
}));

// `lib/i18n/server.ts` is `server-only` which Vite cannot resolve under jsdom.
// We stub it to a passthrough translator that returns the dot-key. The page
// only uses `t(...)` for labels, never asserted on in this test.
vi.mock("@/lib/i18n/server", () => ({
  getT: async () => ({
    locale: "en",
    isRtl: false,
    dict: {},
    t: (k: string) => k,
  }),
  getLocale: async () => "en",
}));

describe("/statistics/me — feature flag off", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    redirectCalls.length = 0;
  });

  it("redirects a non-admin employee to /dashboard when statistics_me_enabled is false", async () => {
    mockAuthAs(makeEmployeeSession({ department: "helpdesk" }, { id: "emp-1" }));
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: false });

    const mod = await import("@/app/(portal)/statistics/me/page");
    const Page = mod.default;

    let threw = false;
    try {
      await Page({ searchParams: Promise.resolve({}) });
    } catch (e) {
      threw = true;
      expect((e as Error).message).toContain("__REDIRECT__:/dashboard");
    }
    expect(threw).toBe(true);
    expect(redirectCalls).toEqual(["/dashboard"]);
  });

  it("does NOT redirect an admin when statistics_me_enabled is false (admin can preview)", async () => {
    mockAuthAs(makeAdminSession({ id: "admin-1" }));
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: false });

    // getSelfStats inputs — the page should reach it for admins.
    prisma.job.count.mockResolvedValue(0);
    prisma.jobStatusEvent.count.mockResolvedValue(0);
    prisma.job.aggregate.mockResolvedValue({ _sum: { timeSpentMinutes: 0 } });
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.job.findMany.mockResolvedValue([]);
    prisma.client.findMany.mockResolvedValue([]);

    const mod = await import("@/app/(portal)/statistics/me/page");
    const Page = mod.default;

    await Page({ searchParams: Promise.resolve({}) });
    expect(redirectCalls).toEqual([]);
  });

  it("renders for an employee when statistics_me_enabled is true (no redirect)", async () => {
    mockAuthAs(makeEmployeeSession({ department: "it" }, { id: "emp-2" }));
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });

    prisma.job.count.mockResolvedValue(0);
    prisma.jobStatusEvent.count.mockResolvedValue(0);
    prisma.job.aggregate.mockResolvedValue({ _sum: { timeSpentMinutes: 0 } });
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.job.findMany.mockResolvedValue([]);
    prisma.client.findMany.mockResolvedValue([]);

    const mod = await import("@/app/(portal)/statistics/me/page");
    const Page = mod.default;

    await Page({ searchParams: Promise.resolve({}) });
    expect(redirectCalls).toEqual([]);
  });
});
