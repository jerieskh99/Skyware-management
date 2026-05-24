// Re-export the same mocked Prisma client registered in `tests/setup.ts`.
// Tests configure individual methods via:
//   prisma.<model>.<method>.mockResolvedValueOnce(...)
import type { Mock } from "vitest";
import { prismaMock, resetPrisma } from "../setup";

interface MockedModel {
  findUnique: Mock;
  findFirst: Mock;
  findMany: Mock;
  create: Mock;
  createMany: Mock;
  update: Mock;
  updateMany: Mock;
  upsert: Mock;
  delete: Mock;
  deleteMany: Mock;
  count: Mock;
  aggregate: Mock;
  groupBy: Mock;
}

// Fixed surface that covers every model touched by route handlers in this
// codebase. Use a non-optional shape so `noUncheckedIndexedAccess` does not
// force callers into nullable chains.
export interface MockedPrisma {
  auditLog: MockedModel;
  user: MockedModel;
  role: MockedModel;
  department: MockedModel;
  job: MockedModel;
  jobStatusEvent: MockedModel;
  jobTag: MockedModel;
  tag: MockedModel;
  workReport: MockedModel;
  timeSession: MockedModel;
  client: MockedModel;
  payment: MockedModel;
  monthlyBillingItem: MockedModel;
  hourlyBank: MockedModel;
  hourlyBankUsage: MockedModel;
  oneTimeCharge: MockedModel;
  environmentNote: MockedModel;
  channel: MockedModel;
  channelPost: MockedModel;
  channelPostReply: MockedModel;
  communicationChannel: MockedModel;
  communicationPost: MockedModel;
  communicationReply: MockedModel;
  postTag: MockedModel;
  notification: MockedModel;
  featureFlag: MockedModel;
  savedView: MockedModel;
  $transaction: Mock;
  $queryRaw: Mock;
  $executeRaw: Mock;
  $connect: Mock;
  $disconnect: Mock;
}

export const prisma = prismaMock as unknown as MockedPrisma;

export { resetPrisma };
