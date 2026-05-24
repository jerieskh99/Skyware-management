import { prisma } from "@/lib/prisma";
import { canPostInChannel, isAdmin } from "@/lib/permissions";
import type { SessionUser } from "@/lib/permissions";
import type {
  DepartmentKey,
  JobStatus,
  JobPriority,
  KnowledgeArticleVisibility,
  Prisma,
} from "@prisma/client";

export type SearchScope = "all" | "jobs" | "clients" | "posts" | "knowledge";

export interface SearchOptions {
  limit?: number;
  cursor?: string | null;
}

export interface SearchPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface JobHit {
  id: string;
  publicNumber: string;
  title: string;
  status: JobStatus;
  priority: JobPriority;
  client: { id: string; companyName: string } | null;
  department: { key: string; nameEn: string };
  updatedAt: Date;
}

export interface ClientHit {
  id: string;
  companyName: string;
  contactPerson: string | null;
  email: string | null;
  status: string;
}

export interface PostHit {
  id: string;
  title: string;
  channelKey: string;
  channelNameEn: string;
  authorDisplayName: string;
  createdAt: Date;
}

export interface KnowledgeHit {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  visibility: KnowledgeArticleVisibility;
  updatedAt: Date;
}

export interface SearchAllResult {
  jobs: SearchPage<JobHit>;
  clients: SearchPage<ClientHit>;
  posts: SearchPage<PostHit>;
  knowledge: SearchPage<KnowledgeHit>;
}

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;
export const ALL_SCOPE_PER_BUCKET = 5;
export const MIN_QUERY_LENGTH = 2;

const ESCAPE_RE = /[\\%_]/g;

/** Escape `%`, `_`, and `\` so they are treated as literals inside ILIKE. */
export function buildLikePattern(q: string): string {
  return `%${q.replace(ESCAPE_RE, (ch) => `\\${ch}`)}%`;
}

function take(opts: SearchOptions): number {
  const requested = opts.limit ?? DEFAULT_LIMIT;
  if (requested <= 0) return DEFAULT_LIMIT;
  return Math.min(requested, MAX_LIMIT);
}

function nextCursorOf<T extends { id: string }>(rows: T[], limit: number): string | null {
  if (rows.length < limit) return null;
  const tail = rows[rows.length - 1];
  return tail ? tail.id : null;
}

function jobScopeWhere(user: SessionUser): Prisma.JobWhereInput {
  if (isAdmin(user)) return {};
  return {
    OR: [
      { assignedEmployeeId: user.id },
      { department: { key: user.departmentKey as DepartmentKey } },
      { department: { key: "global" as DepartmentKey } },
    ],
  };
}

export async function searchJobs(
  user: SessionUser,
  q: string,
  opts: SearchOptions = {}
): Promise<SearchPage<JobHit>> {
  if (q.length < MIN_QUERY_LENGTH) return { items: [], nextCursor: null };
  const limit = take(opts);
  const cursorWhere: Prisma.JobWhereInput = opts.cursor
    ? { id: { gt: opts.cursor } }
    : {};

  const rows = await prisma.job.findMany({
    where: {
      AND: [
        jobScopeWhere(user),
        cursorWhere,
        {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
            { publicNumber: { contains: q, mode: "insensitive" } },
          ],
        },
      ],
    },
    select: {
      id: true,
      publicNumber: true,
      title: true,
      status: true,
      priority: true,
      updatedAt: true,
      client: { select: { id: true, companyName: true } },
      department: { select: { key: true, nameEn: true } },
    },
    orderBy: { id: "asc" },
    take: limit,
  });

  return { items: rows, nextCursor: nextCursorOf(rows, limit) };
}

export async function searchClients(
  user: SessionUser,
  q: string,
  opts: SearchOptions = {}
): Promise<SearchPage<ClientHit>> {
  if (!isAdmin(user)) return { items: [], nextCursor: null };
  if (q.length < MIN_QUERY_LENGTH) return { items: [], nextCursor: null };
  const limit = take(opts);
  const cursorWhere: Prisma.ClientWhereInput = opts.cursor
    ? { id: { gt: opts.cursor } }
    : {};

  const rows = await prisma.client.findMany({
    where: {
      AND: [
        cursorWhere,
        {
          OR: [
            { companyName: { contains: q, mode: "insensitive" } },
            { contactPerson: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
          ],
        },
      ],
    },
    select: {
      id: true,
      companyName: true,
      contactPerson: true,
      email: true,
      status: true,
    },
    orderBy: { id: "asc" },
    take: limit,
  });

  return { items: rows, nextCursor: nextCursorOf(rows, limit) };
}

export async function searchPosts(
  user: SessionUser,
  q: string,
  opts: SearchOptions = {}
): Promise<SearchPage<PostHit>> {
  if (q.length < MIN_QUERY_LENGTH) return { items: [], nextCursor: null };
  const limit = take(opts);

  const channels = await prisma.communicationChannel.findMany({
    include: { department: { select: { key: true } } },
  });
  const visibleChannelIds = channels
    .filter((ch) => canPostInChannel(user, ch.department?.key ?? null))
    .map((ch) => ch.id);
  if (visibleChannelIds.length === 0) return { items: [], nextCursor: null };

  const cursorWhere: Prisma.CommunicationPostWhereInput = opts.cursor
    ? { id: { gt: opts.cursor } }
    : {};

  const rows = await prisma.communicationPost.findMany({
    where: {
      AND: [
        { channelId: { in: visibleChannelIds } },
        cursorWhere,
        {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { body: { contains: q, mode: "insensitive" } },
          ],
        },
      ],
    },
    select: {
      id: true,
      title: true,
      createdAt: true,
      channel: { select: { key: true, nameEn: true } },
      author: { select: { displayName: true } },
    },
    orderBy: { id: "asc" },
    take: limit,
  });

  const items: PostHit[] = rows.map((p) => ({
    id: p.id,
    title: p.title,
    channelKey: p.channel.key,
    channelNameEn: p.channel.nameEn,
    authorDisplayName: p.author.displayName,
    createdAt: p.createdAt,
  }));

  return { items, nextCursor: nextCursorOf(rows, limit) };
}

export async function searchKnowledge(
  user: SessionUser,
  q: string,
  opts: SearchOptions = {}
): Promise<SearchPage<KnowledgeHit>> {
  if (q.length < MIN_QUERY_LENGTH) return { items: [], nextCursor: null };
  const limit = take(opts);
  const cursorWhere: Prisma.KnowledgeArticleWhereInput = opts.cursor
    ? { id: { gt: opts.cursor } }
    : {};

  const visibilityWhere: Prisma.KnowledgeArticleWhereInput = isAdmin(user)
    ? {}
    : { visibility: "internal" };

  const rows = await prisma.knowledgeArticle.findMany({
    where: {
      AND: [
        { status: "published" },
        visibilityWhere,
        cursorWhere,
        {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { body: { contains: q, mode: "insensitive" } },
            { summary: { contains: q, mode: "insensitive" } },
          ],
        },
      ],
    },
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      visibility: true,
      updatedAt: true,
    },
    orderBy: { id: "asc" },
    take: limit,
  });

  return { items: rows, nextCursor: nextCursorOf(rows, limit) };
}

export interface SearchAllOptions {
  /** When false, the `knowledge` bucket is returned empty without hitting the DB. */
  includeKnowledge?: boolean;
}

export async function searchAll(
  user: SessionUser,
  q: string,
  options: SearchAllOptions = {}
): Promise<SearchAllResult> {
  const opts: SearchOptions = { limit: ALL_SCOPE_PER_BUCKET };
  const includeKnowledge = options.includeKnowledge ?? false;
  const [jobs, clients, posts, knowledge] = await Promise.all([
    searchJobs(user, q, opts),
    searchClients(user, q, opts),
    searchPosts(user, q, opts),
    includeKnowledge
      ? searchKnowledge(user, q, opts)
      : Promise.resolve<SearchPage<KnowledgeHit>>({ items: [], nextCursor: null }),
  ]);
  return { jobs, clients, posts, knowledge };
}
