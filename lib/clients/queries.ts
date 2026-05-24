import { prisma } from "@/lib/prisma";
import type { ClientStatus } from "@prisma/client";

export async function listClients(opts: {
  search?: string;
  status?: ClientStatus;
} = {}) {
  return prisma.client.findMany({
    where: {
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.search
        ? {
            OR: [
              { companyName: { contains: opts.search, mode: "insensitive" } },
              { contactPerson: { contains: opts.search, mode: "insensitive" } },
              { email: { contains: opts.search, mode: "insensitive" } },
              { phone: { contains: opts.search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      companyName: true,
      contactPerson: true,
      email: true,
      phone: true,
      status: true,
      createdAt: true,
      _count: { select: { jobs: true } },
    },
    orderBy: [{ status: "asc" }, { companyName: "asc" }],
    take: 200,
  });
}

export async function getClientDetail(id: string) {
  return prisma.client.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, displayName: true } },
      billingAccount: { select: { id: true, defaultCurrency: true } },
      _count: { select: { jobs: true, payments: true, receipts: true } },
    },
  });
}

export async function getClientJobs(clientId: string) {
  return prisma.job.findMany({
    where: { clientId },
    select: {
      id: true,
      publicNumber: true,
      title: true,
      status: true,
      priority: true,
      createdAt: true,
      updatedAt: true,
      assignedEmployee: { select: { id: true, displayName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function getClientEnvironmentNotes(clientId: string) {
  return prisma.clientEnvironmentNote.findMany({
    where: { clientId },
    select: {
      id: true,
      section: true,
      content: true,
      lastEditedAt: true,
      lastEditedBy: { select: { id: true, displayName: true } },
    },
    orderBy: { section: "asc" },
  });
}
