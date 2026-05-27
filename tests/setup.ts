import { vi } from "vitest";
import "@testing-library/jest-dom";

// ---- Prisma mock ----
// Hand-rolled, deterministic Prisma stub. Each test that needs Prisma imports
// from `tests/helpers/prisma` and configures the methods it uses with
// `mockResolvedValueOnce`, etc. The mock covers the model methods touched by
// route handlers in this codebase plus `$transaction` which executes its
// callback against the same mocked client (no real DB involved).
//
// `$transaction` accepts either a callback (interactive transactions) or an
// array of operations; both forms are supported here.

type AnyFn = (...args: unknown[]) => unknown;

function modelStub() {
  return {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
  };
}

function buildPrismaMock() {
  const client = {
    auditLog: modelStub(),
    user: modelStub(),
    role: modelStub(),
    department: modelStub(),
    job: modelStub(),
    jobStatusEvent: modelStub(),
    jobTag: modelStub(),
    tag: modelStub(),
    workReport: modelStub(),
    timeSession: modelStub(),
    client: modelStub(),
    payment: modelStub(),
    monthlyBillingItem: modelStub(),
    hourlyBank: modelStub(),
    hourlyBankUsage: modelStub(),
    oneTimeCharge: modelStub(),
    environmentNote: modelStub(),
    channel: modelStub(),
    channelPost: modelStub(),
    channelPostReply: modelStub(),
    communicationChannel: modelStub(),
    communicationPost: modelStub(),
    communicationReply: modelStub(),
    postTag: modelStub(),
    notification: modelStub(),
    featureFlag: modelStub(),
    savedView: modelStub(),
    companySettings: modelStub(),
    slaDefaults: modelStub(),
    receiptDocument: modelStub(),
    receiptDocumentSequence: modelStub(),
    attachment: modelStub(),
    jobAttachment: modelStub(),
    postAttachment: modelStub(),
    replyAttachment: modelStub(),
    recurringJobTemplate: modelStub(),
    knowledgeArticle: modelStub(),
    knowledgeArticleTag: modelStub(),
    knowledgeArticleRevision: modelStub(),
    knowledgeArticleReview: modelStub(),
    knowledgeArticleReference: modelStub(),
    clientHealthSnapshot: modelStub(),
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as AnyFn)(client);
      }
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      return undefined;
    }),
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  };
  return client;
}

const prismaMock = buildPrismaMock();

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

/** Reset all Prisma mock fn state. Tests can call this in `beforeEach`. */
export function resetPrisma() {
  for (const value of Object.values(prismaMock)) {
    if (value && typeof value === "object") {
      for (const fn of Object.values(value)) {
        if (typeof fn === "function" && "mockReset" in fn) {
          (fn as { mockReset: () => void }).mockReset();
        }
      }
    } else if (typeof value === "function" && "mockReset" in value) {
      (value as unknown as { mockReset: () => void }).mockReset();
    }
  }
  // Restore default $transaction behavior after reset.
  prismaMock.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as AnyFn)(prismaMock);
    }
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    return undefined;
  });
}

export { prismaMock };

// ---- NextAuth `auth()` mock ----
// The session helper (`tests/helpers/session.ts`) sets `currentMockUser` via
// `mockAuthAs`. The mocked `auth()` simply returns `{ user }` based on it.

interface MockSessionState {
  user: unknown;
}
const sessionState: MockSessionState = { user: null };

export function __setMockSessionUser(user: unknown) {
  sessionState.user = user;
}

// Use a plain async function (not a `vi.fn`) so that `vi.resetAllMocks()` in
// test `beforeEach` hooks cannot wipe its implementation. Session state is
// controlled via `mockAuthAs` in `tests/helpers/session.ts`.
vi.mock("@/lib/auth", () => ({
  auth: async () => {
    if (!sessionState.user) return null;
    return { user: sessionState.user };
  },
}));
