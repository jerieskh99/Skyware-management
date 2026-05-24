import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ReactElement } from "react";
import { isValidElement } from "react";

import { resetPrisma } from "../helpers/prisma";
import { makeAdminSession, mockAuthAs } from "../helpers/session";

// `server-only` is a Next.js sentinel that throws in non-RSC environments.
vi.mock("server-only", () => ({}));
// `next/headers` cookies(); only used inside i18n's getLocale (which we override below).
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
// Avoid pulling the real i18n server (which calls into next/headers).
vi.mock("@/lib/i18n/server", () => ({
  getT: async () => ({ locale: "en", isRtl: false, dict: {}, t: (k: string) => k }),
  getLocale: async () => "en",
}));
// `next/navigation`: redirect/notFound throw special errors in Next; here they
// throw plain Errors so tests can detect them if needed.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

// Mock the job query and feature-flag reader before the page imports them.
vi.mock("@/lib/jobs/queries", () => ({
  getJobForUser: vi.fn(),
}));
vi.mock("@/lib/feature-flags", () => ({
  getFeatureFlag: vi.fn(),
}));

import JobDetailPage from "@/app/(portal)/my-jobs/[id]/page";
import { getJobForUser } from "@/lib/jobs/queries";
import { getFeatureFlag } from "@/lib/feature-flags";

const JOB_ID = "00000000-0000-0000-0000-000000000job";

function jobFixture() {
  return {
    id: JOB_ID,
    publicNumber: "JOB-001",
    title: "Server down",
    status: "assigned",
    priority: "high",
    severity: "major",
    description: null,
    adminNote: null,
    assignedTimestamp: new Date("2026-05-24T00:00:00Z"),
    startedTimestamp: null,
    slaTargetMinutes: 240,
    timeSpentMinutes: 0,
    createdAt: new Date("2026-05-24T00:00:00Z"),
    assignedEmployeeId: "u-1",
    department: { id: "d1", key: "helpdesk", nameEn: "Helpdesk" },
    client: { id: "c1", companyName: "Acme" },
    assignedEmployee: { id: "u-1", username: "u", displayName: "User" },
    createdBy: { id: "admin-1", username: "admin.ceo", displayName: "CEO" },
    tags: [],
    statusEvents: [],
    workReport: null,
    timeSessions: [],
    relatedPosts: [],
    linkedPayment: null,
    _count: { statusEvents: 0 },
  };
}

/** Walk the React element tree and collect every component's display name / tag. */
function collectComponentNames(node: unknown, acc: string[] = []): string[] {
  if (node === null || node === undefined || node === false) return acc;
  if (Array.isArray(node)) {
    for (const child of node) collectComponentNames(child, acc);
    return acc;
  }
  if (typeof node === "string" || typeof node === "number") return acc;
  if (!isValidElement(node)) return acc;
  const el = node as ReactElement<{ children?: unknown }>;
  const t = el.type;
  let name = "";
  if (typeof t === "string") name = t;
  else if (typeof t === "function") name = (t as { name?: string }).name ?? "";
  else if (t && typeof t === "object" && "displayName" in t) {
    name = String((t as { displayName?: string }).displayName ?? "");
  }
  if (name) acc.push(name);
  const children = el.props?.children;
  if (children !== undefined) collectComponentNames(children, acc);
  return acc;
}

describe("Job detail page — job_detail_tabs_enabled flag off", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetPrisma();
    mockAuthAs(makeAdminSession());
  });

  it("does not render the JobDetailTabs strip when the flag is off", async () => {
    vi.mocked(getJobForUser).mockResolvedValue(
      jobFixture() as unknown as Awaited<ReturnType<typeof getJobForUser>>
    );
    vi.mocked(getFeatureFlag).mockResolvedValue(false);

    const tree = await JobDetailPage({
      params: Promise.resolve({ id: JOB_ID }),
      searchParams: Promise.resolve({ from: "my-jobs" }),
    });

    const names = collectComponentNames(tree);
    expect(names).not.toContain("JobDetailTabs");
    expect(names).not.toContain("JobOverviewTab");
  });

  it("renders the JobDetailTabs strip when the flag is on", async () => {
    vi.mocked(getJobForUser).mockResolvedValue(
      jobFixture() as unknown as Awaited<ReturnType<typeof getJobForUser>>
    );
    vi.mocked(getFeatureFlag).mockResolvedValue(true);

    const tree = await JobDetailPage({
      params: Promise.resolve({ id: JOB_ID }),
      searchParams: Promise.resolve({ from: "my-jobs" }),
    });

    const names = collectComponentNames(tree);
    expect(names).toContain("JobDetailTabs");
  });
});
