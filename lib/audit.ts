import { Prisma } from "@prisma/client";

// Fields that must never appear in diff_json.
const REDACTED_FIELDS = new Set([
  "passwordHash",
  "password_hash",
  "password",
  "newPassword",
  "currentPassword",
  "secret",
  "token",
  "apiKey",
  "api_key",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
]);

/** Strip sensitive fields from a diff object before persisting. */
function redact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = REDACTED_FIELDS.has(k) ? "[REDACTED]" : v;
  }
  return out;
}

export interface AuditPayload {
  actorUserId?: string | null;
  action: string;       // "job.status_changed", "payment.marked_paid", etc.
  entityType: string;   // "Job", "Payment", etc.
  entityId: string;
  diff?: Record<string, { old: unknown; new: unknown }>;
  ipAddress?: string;
  userAgent?: string;
}

/** Write an AuditLog row inside an existing Prisma transaction (tx). */
export async function writeAudit(
  tx: Prisma.TransactionClient,
  payload: AuditPayload
): Promise<void> {
  const diffJson = payload.diff
    ? (redact(payload.diff as Record<string, unknown>) as Prisma.InputJsonValue)
    : Prisma.JsonNull;
  await tx.auditLog.create({
    data: {
      actorUserId: payload.actorUserId ?? null,
      action: payload.action,
      entityType: payload.entityType,
      entityId: payload.entityId,
      diffJson,
      ipAddress: payload.ipAddress ?? null,
      userAgent: payload.userAgent ?? null,
    },
  });
}
