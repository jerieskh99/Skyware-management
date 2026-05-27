import type { KnowledgeArticleType } from "@prisma/client";
import { getFeatureFlag } from "@/lib/feature-flags";
import { redactSecrets } from "./secrets-scan";

/**
 * AI-structuring seam for Knowledge articles. V1 is a deterministic
 * dry-run: no network call, no LLM provider, no real model identity. The
 * structuring function returns a suggested title, summary, why-it-matters,
 * sectioned body, and tag suggestions derived from a static lexicon.
 *
 * The three-gate model is wired but no `real_llm` path is implemented.
 * `canCallRealLlm` returns true only when:
 *   1. feature flag `knowledge_ai_structuring_enabled` is on,
 *   2. env `ALLOW_KNOWLEDGE_AI` is the literal string "true",
 *   3. feature flag `knowledge_ai_provider_verified` is on.
 * Per the implementation plan §3.2 and the security audit §11, V1 ships
 * with at most one of these set to true so the path stays dormant.
 */

export interface AiStructureSourceContext {
  jobPublicNumber?: string;
  jobTitle?: string;
  clientCompanyName?: string;
}

export interface AiStructureInput {
  title: string;
  rawBody: string;
  kind: KnowledgeArticleType;
  sourceContext?: AiStructureSourceContext | null;
}

export interface AiStructureResult {
  /** Always `dry_run` in V1; `real_llm` reserved for the future provider path. */
  mode: "dry_run" | "real_llm";
  /** Light cleanup: trimmed, sentence-cased first letter. */
  title: string;
  /** Suggested summary: first two sentences, capped at 280 chars. */
  summary: string;
  /** Deterministic from `kind` + `sourceContext`. */
  whyItMatters: string;
  /**
   * Sectioned body with a Problem / Cause / Fix / Verification scaffold
   * pre-filled where context allows. The author edits in the editor.
   */
  body: string;
  /** Suggested tags discovered by keyword match in the raw body. */
  suggestedTags: string[];
  /** Count of secret-pattern matches redacted from `rawBody` before structuring. */
  redactionCount: number;
}

const SUMMARY_MAX = 280;

/** Article kinds eligible for AI structuring per review workflow §3. */
const AI_ELIGIBLE_KINDS: ReadonlyArray<KnowledgeArticleType> = [
  "internal_task_lesson",
  "troubleshooting_note",
  "how_to_guide",
];

/** Static lexicon: tag key -> trigger keywords. Lowercase substring match. */
const TAG_LEXICON: ReadonlyArray<{ tag: string; triggers: string[] }> = [
  { tag: "vpn", triggers: ["vpn", "openvpn", "wireguard", "anyconnect"] },
  { tag: "dns", triggers: ["dns", "nslookup", "dig ", "resolver"] },
  { tag: "email", triggers: ["smtp", "imap", "outlook", "exchange", "mailbox"] },
  { tag: "network", triggers: ["router", "switch", "vlan", "subnet", "firewall"] },
  { tag: "windows", triggers: ["windows", "powershell", "registry", "gpo "] },
  { tag: "linux", triggers: ["linux", "ubuntu", "debian", "centos", "systemctl"] },
  { tag: "backup", triggers: ["backup", "restore", "veeam", "snapshot"] },
  { tag: "security", triggers: ["malware", "ransomware", "phishing", "vulnerability", "cve-"] },
  { tag: "printer", triggers: ["printer", "spooler", "driver"] },
  { tag: "vendor:microsoft", triggers: ["microsoft", "azure", "office 365", "m365"] },
  { tag: "vendor:google", triggers: ["google", "gsuite", "workspace"] },
  { tag: "vendor:cisco", triggers: ["cisco", "meraki", "umbrella"] },
];

/**
 * Returns `true` only when all three production gates are open. V1 ships
 * with this returning `false` everywhere; calling `aiStructure` with the
 * dry-run path is the supported flow.
 */
export async function canCallRealLlm(): Promise<boolean> {
  if (process.env.ALLOW_KNOWLEDGE_AI !== "true") return false;
  const [enabled, providerVerified] = await Promise.all([
    getFeatureFlag("knowledge_ai_structuring_enabled"),
    getFeatureFlag("knowledge_ai_provider_verified"),
  ]);
  return enabled && providerVerified;
}

/** Sentence-case the first character without disturbing the rest. */
function sentenceCase(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) return "";
  const first = trimmed.charAt(0);
  return first.toUpperCase() + trimmed.slice(1);
}

/** Pull the first two sentences (split on `.!?`) and cap at SUMMARY_MAX. */
function buildSummary(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length === 0) return "";
  // Match up to two sentences ending in `.!?`, or fall back to the prefix.
  const sentenceMatch = flat.match(/^(.+?[.!?])\s+(.+?[.!?])/);
  let raw: string;
  if (sentenceMatch) {
    raw = `${sentenceMatch[1]} ${sentenceMatch[2]}`;
  } else {
    raw = flat.slice(0, SUMMARY_MAX);
  }
  if (raw.length > SUMMARY_MAX) {
    raw = `${raw.slice(0, SUMMARY_MAX - 1).trimEnd()}…`;
  }
  return raw;
}

/** Build a deterministic why-it-matters from kind + source context. */
function buildWhyItMatters(
  kind: KnowledgeArticleType,
  ctx: AiStructureSourceContext | null | undefined,
): string {
  const pieces: string[] = [];
  switch (kind) {
    case "internal_task_lesson":
      pieces.push("Captures a lesson learned during real work so the next person hits the issue prepared.");
      break;
    case "troubleshooting_note":
      pieces.push("Reduces mean time to recovery the next time this symptom shows up.");
      break;
    case "how_to_guide":
      pieces.push("Standardises a repeated procedure so anyone in the team can carry it out reliably.");
      break;
    case "external_reference":
      pieces.push("Anchors institutional knowledge to a vetted external source.");
      break;
    case "architecture_decision":
      pieces.push("Records the trade-offs and the chosen path so we do not relitigate them.");
      break;
    case "process_policy_note":
      pieces.push("Documents organisational policy so behaviour stays consistent across people and time.");
      break;
  }
  if (ctx?.clientCompanyName) {
    pieces.push(`Linked to ${ctx.clientCompanyName}.`);
  }
  if (ctx?.jobPublicNumber) {
    pieces.push(`Originated from job ${ctx.jobPublicNumber}.`);
  }
  return pieces.join(" ");
}

/** Run the static tag lexicon over the (lowercased) raw body. */
function suggestTags(rawBody: string, ctx: AiStructureSourceContext | null | undefined): string[] {
  const lower = rawBody.toLowerCase();
  const found = new Set<string>();
  for (const { tag, triggers } of TAG_LEXICON) {
    if (triggers.some((trig) => lower.includes(trig))) {
      found.add(tag);
    }
  }
  // Add a client-scope tag if we have a related client.
  if (ctx?.clientCompanyName) {
    const slug = ctx.clientCompanyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (slug.length > 0) found.add(`client:${slug}`);
  }
  return Array.from(found).sort();
}

/**
 * Apply a Problem / Cause / Fix / Verification scaffold to the body. We
 * keep the author's text verbatim under the first section so they can
 * cut and paste into the structured slots themselves.
 */
function scaffoldBody(redactedRaw: string, kind: KnowledgeArticleType): string {
  const trimmed = redactedRaw.trim();
  if (kind === "how_to_guide") {
    return [
      "## Goal",
      "(Describe the end state in one sentence.)",
      "",
      "## Prerequisites",
      "(List what the reader must have before starting.)",
      "",
      "## Steps",
      "1. (Step one.)",
      "2. (Step two.)",
      "",
      "## Verification",
      "(How does the reader know it worked.)",
      "",
      "## Original notes",
      trimmed.length > 0 ? trimmed : "(No original notes provided.)",
    ].join("\n");
  }
  if (kind === "troubleshooting_note") {
    return [
      "## Symptom",
      "(One sentence describing what the user saw.)",
      "",
      "## Diagnostic steps",
      "1. (Step one.)",
      "2. (Step two.)",
      "",
      "## Root cause",
      "(The actual cause.)",
      "",
      "## Fix",
      "(What resolved it.)",
      "",
      "## Verification",
      "(How we confirmed it stayed fixed.)",
      "",
      "## Original notes",
      trimmed.length > 0 ? trimmed : "(No original notes provided.)",
    ].join("\n");
  }
  // internal_task_lesson and the other kinds get the lighter scaffold.
  return [
    "## Context",
    "(Why we were doing this and what we expected.)",
    "",
    "## What happened",
    "(The actual sequence of events.)",
    "",
    "## What I would do differently",
    "(The lesson.)",
    "",
    "## Original notes",
    trimmed.length > 0 ? trimmed : "(No original notes provided.)",
  ].join("\n");
}

export class AiStructureIneligibleError extends Error {
  constructor(public readonly kind: KnowledgeArticleType) {
    super(`AI structuring is not available for article kind: ${kind}`);
    this.name = "AiStructureIneligibleError";
  }
}

/**
 * V1: deterministic dry-run. No network call. The function is `async`
 * because future modes will be async and the route handler should not
 * have to switch shape when the gates open.
 */
export async function aiStructure(
  input: AiStructureInput,
): Promise<AiStructureResult> {
  if (!AI_ELIGIBLE_KINDS.includes(input.kind)) {
    throw new AiStructureIneligibleError(input.kind);
  }

  if (await canCallRealLlm()) {
    // The route is wired but the implementation is intentionally deferred
    // to Phase 2 per the implementation plan. We throw a clear sentinel so
    // a misconfigured environment cannot accidentally start sending
    // production text to a third-party.
    throw new Error("real LLM not implemented in V1");
  }

  const { redacted, findings } = redactSecrets(input.rawBody);
  return {
    mode: "dry_run",
    title: sentenceCase(input.title),
    summary: buildSummary(redacted),
    whyItMatters: buildWhyItMatters(input.kind, input.sourceContext),
    body: scaffoldBody(redacted, input.kind),
    suggestedTags: suggestTags(redacted, input.sourceContext),
    redactionCount: findings.length,
  };
}

/** Re-export the eligibility list for the permissions guard. */
export { AI_ELIGIBLE_KINDS };
