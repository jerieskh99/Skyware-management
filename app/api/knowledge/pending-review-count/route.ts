import { NextResponse } from "next/server";
import { requireAuth, notFound } from "@/lib/api-utils";
import { isAdmin } from "@/lib/permissions";
import { getFeatureFlag } from "@/lib/feature-flags";
import { pendingReviewCount } from "@/lib/knowledge/queries";

/**
 * GET /api/knowledge/pending-review-count — sidebar polling endpoint.
 *
 * Returns `{ count: number }` where:
 *   - admins receive the count of `pending_review` articles NOT authored by
 *     themselves (the actionable review queue size),
 *   - non-admins always receive `{ count: 0 }` because V1 only admins
 *     review (per the permissions matrix), so the badge would never apply,
 *   - when the `knowledge_articles_enabled` feature flag is off, returns
 *     404 so the sidebar stops polling.
 *
 * The sidebar polls every 60s and silently degrades to 0 on any non-2xx,
 * so a flag-off environment never shows the badge.
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const enabled = await getFeatureFlag("knowledge_articles_enabled");
  if (!enabled) return notFound("Knowledge articles");

  if (!isAdmin(auth.user)) {
    return NextResponse.json({ count: 0 });
  }

  const count = await pendingReviewCount(auth.user);
  return NextResponse.json({ count });
}
