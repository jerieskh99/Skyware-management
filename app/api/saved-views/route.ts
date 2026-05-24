import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, badRequest } from "@/lib/api-utils";
import { writeAudit } from "@/lib/audit";
import { createForUser, listForUser, setDefaultForUser } from "@/lib/saved-views/queries";

const SCOPE_KEYS = ["jobs", "clients", "billing"] as const;
const scopeSchema = z.enum(SCOPE_KEYS);

const filterRecordSchema = z.record(z.string(), z.string());

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(req.url);
  const parsed = scopeSchema.safeParse(searchParams.get("scope"));
  if (!parsed.success) return badRequest(parsed.error.issues);

  const views = await listForUser(auth.user.id, parsed.data);
  return NextResponse.json(views);
}

const createBody = z.object({
  scope: scopeSchema,
  name: z.string().min(1).max(80).trim(),
  filterJson: filterRecordSchema,
  isDefault: z.boolean().optional(),
});

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = createBody.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);
  const { scope, name, filterJson, isDefault } = parsed.data;

  const created = await prisma.$transaction(async (tx) => {
    const view = await createForUser(
      auth.user.id,
      scope,
      { name, filterJson, isDefault: isDefault === true },
      tx,
    );
    if (isDefault === true) {
      await setDefaultForUser(auth.user.id, scope, view.id, tx);
    }
    await writeAudit(tx, {
      actorUserId: auth.user.id,
      action: "saved_view.created",
      entityType: "SavedView",
      entityId: view.id,
      diff: {
        scope: { old: null, new: scope },
        name: { old: null, new: name },
        isDefault: { old: null, new: isDefault === true },
      },
    });
    return view;
  });

  return NextResponse.json({ ...created, isDefault: isDefault === true }, { status: 201 });
}
