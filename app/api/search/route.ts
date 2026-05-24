import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, badRequest, forbidden } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { getFeatureFlag } from "@/lib/feature-flags";
import {
  MAX_LIMIT,
  MIN_QUERY_LENGTH,
  searchAll,
  searchClients,
  searchJobs,
  searchKnowledge,
  searchPosts,
  type SearchScope,
} from "@/lib/search/queries";

const querySchema = z.object({
  q: z.string().min(MIN_QUERY_LENGTH).max(200),
  scope: z.enum(["all", "jobs", "clients", "posts", "knowledge"]).default("all"),
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional(),
  cursor: z.string().min(1).optional(),
});

/**
 * GET /api/search?q=...&scope=all|jobs|clients|posts|knowledge&limit=&cursor=
 * Returns permission-filtered results. `clients` scope is admin-only.
 * `knowledge` scope and bucket disappear when `knowledge_articles_enabled` is off.
 */
export async function GET(req: Request) {
  const authResult = await requireAuth();
  if (authResult.error) return authResult.error;
  const { user } = authResult;

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    q: searchParams.get("q")?.trim() ?? "",
    scope: searchParams.get("scope") ?? "all",
    limit: searchParams.get("limit") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
  });
  if (!parsed.success) return badRequest(parsed.error.issues);

  const { q, scope, limit, cursor } = parsed.data;

  if (scope === "clients" && !isAdmin(user)) {
    return forbidden("Clients search is admin only.");
  }

  const knowledgeEnabled = await getFeatureFlag("knowledge_articles_enabled");
  if (scope === "knowledge" && !knowledgeEnabled) {
    return forbidden("Knowledge search is disabled.");
  }

  const opts = { limit, cursor };

  let results: unknown;
  if (scope === "all") {
    const all = await searchAll(user, q, { includeKnowledge: knowledgeEnabled });
    if (!knowledgeEnabled) {
      const { knowledge: _omit, ...rest } = all;
      void _omit;
      results = rest;
    } else {
      results = all;
    }
  } else if (scope === "jobs") {
    results = { jobs: await searchJobs(user, q, opts) };
  } else if (scope === "clients") {
    results = { clients: await searchClients(user, q, opts) };
  } else if (scope === "knowledge") {
    results = { knowledge: await searchKnowledge(user, q, opts) };
  } else {
    results = { posts: await searchPosts(user, q, opts) };
  }

  return NextResponse.json({ q, scope: scope as SearchScope, results });
}
