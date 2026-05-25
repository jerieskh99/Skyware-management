import { getFeatureFlag } from "@/lib/feature-flags";

/** True only when the env says production issuance is allowed. */
export function envAllowsProductionIssuance(): boolean {
  return process.env.ALLOW_PRODUCTION_ISSUANCE === "true";
}

/**
 * The three-gate lock per docs/audit-2026-05-billing/implementation_plan.md §6.5.
 * Returns true only when:
 *   feature flag receipt_finalize_enabled = true
 *   env ALLOW_PRODUCTION_ISSUANCE         = true
 *   feature flag pdf_watermark_disabled   = true
 * Any single false keeps the system in internal-testing mode and the
 * watermark on.
 */
export async function isCleanProductionIssuance(): Promise<boolean> {
  if (!envAllowsProductionIssuance()) return false;
  const [finalizeEnabled, watermarkDisabled] = await Promise.all([
    getFeatureFlag("receipt_finalize_enabled"),
    getFeatureFlag("pdf_watermark_disabled"),
  ]);
  return finalizeEnabled && watermarkDisabled;
}
