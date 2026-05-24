import type { AttachmentVisibility } from "@prisma/client";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";

/**
 * Visibility check used by attachment GET and link endpoints.
 * `public_in_org` is readable by any authenticated user; `admin_only`
 * is admin-gated. Resource-level scope (e.g. canReadJob) is applied
 * separately by the caller.
 */
export function canReadAttachmentVisibility(
  user: SessionUser,
  visibility: AttachmentVisibility,
): boolean {
  if (visibility === "admin_only") return isAdmin(user);
  return true;
}

/**
 * An attachment row may be deleted by the original uploader or any admin.
 */
export function canDeleteAttachment(
  user: SessionUser,
  uploadedByUserId: string,
): boolean {
  return isAdmin(user) || uploadedByUserId === user.id;
}
