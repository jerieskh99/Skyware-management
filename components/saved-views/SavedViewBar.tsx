"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus, Star, StarOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/lib/i18n/client";
import { useToast } from "@/components/ui/toast";
import { SaveCurrentDialog } from "./SaveCurrentDialog";
import { SavedViewsManageMenu } from "./SavedViewsManageMenu";
import {
  type FilterRecord,
  normalizeFilters,
  parseFilterJson,
  toHref,
} from "./filters";

export type SavedViewScope = "jobs" | "clients" | "billing";

interface SavedViewDTO {
  id: string;
  userId: string | null;
  scope: string;
  name: string;
  filterJson: unknown;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  scope: SavedViewScope;
  currentFilters: Record<string, string | undefined>;
}

function listKey(scope: SavedViewScope) {
  return ["saved-views", scope] as const;
}

async function fetchViews(scope: SavedViewScope): Promise<SavedViewDTO[]> {
  const res = await fetch(`/api/saved-views?scope=${scope}`);
  if (!res.ok) throw new Error("Failed to load saved views.");
  return (await res.json()) as SavedViewDTO[];
}

export function SavedViewBar({ scope, currentFilters }: Props) {
  const { t } = useT();
  const pathname = usePathname();
  const toast = useToast();
  const queryClient = useQueryClient();

  const normalized: FilterRecord = useMemo(
    () => normalizeFilters(currentFilters),
    [currentFilters],
  );
  const hasFilters = Object.keys(normalized).length > 0;

  const query = useQuery({
    queryKey: listKey(scope),
    queryFn: () => fetchViews(scope),
  });

  const [saveOpen, setSaveOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<SavedViewDTO | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedViewDTO | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: listKey(scope) });
  }

  const createMutation = useMutation({
    mutationFn: async (input: { name: string; isDefault: boolean }) => {
      const res = await fetch("/api/saved-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          name: input.name,
          filterJson: normalized,
          isDefault: input.isDefault,
        }),
      });
      if (!res.ok) throw new Error("create_failed");
      return (await res.json()) as SavedViewDTO;
    },
    onSuccess: (view) => {
      setSaveOpen(false);
      setMutationError(null);
      invalidate();
      toast.push({ tone: "success", title: t("savedViews.saved"), description: view.name });
    },
    onError: () => setMutationError(t("savedViews.saveFailed")),
  });

  const renameMutation = useMutation({
    mutationFn: async (input: { id: string; name: string }) => {
      const res = await fetch(`/api/saved-views/${input.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: input.name }),
      });
      if (!res.ok) throw new Error("rename_failed");
      return (await res.json()) as SavedViewDTO;
    },
    onSuccess: () => {
      setRenameTarget(null);
      setMutationError(null);
      invalidate();
      toast.push({ tone: "success", title: t("savedViews.renamed") });
    },
    onError: () => setMutationError(t("savedViews.saveFailed")),
  });

  const togglePinMutation = useMutation({
    mutationFn: async (input: { id: string; isDefault: boolean }) => {
      const res = await fetch(`/api/saved-views/${input.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: input.isDefault }),
      });
      if (!res.ok) throw new Error("toggle_failed");
      return (await res.json()) as SavedViewDTO;
    },
    onSuccess: (view) => {
      invalidate();
      toast.push({
        tone: "success",
        title: view.isDefault ? t("savedViews.pinned") : t("savedViews.unpinned"),
        description: view.name,
      });
    },
    onError: () => toast.push({ tone: "error", title: t("savedViews.saveFailed") }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/saved-views/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete_failed");
    },
    onSuccess: () => {
      setDeleteTarget(null);
      setMutationError(null);
      invalidate();
      toast.push({ tone: "success", title: t("savedViews.deleted") });
    },
    onError: () => setMutationError(t("savedViews.deleteFailed")),
  });

  const views = query.data ?? [];

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/20 px-3 py-2">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("savedViews.title")}
      </span>

      {query.isLoading ? (
        <span className="text-xs text-muted-foreground">{t("common.loading")}</span>
      ) : views.length === 0 ? (
        <span className="text-xs text-muted-foreground">{t("savedViews.empty")}</span>
      ) : (
        views.map((view) => {
          const filters = parseFilterJson(view.filterJson);
          const href = toHref(pathname, filters);
          return (
            <span
              key={view.id}
              className={`inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs ${
                view.isDefault ? "border-primary/40 bg-primary/5" : "border-border"
              }`}
            >
              <Link
                href={href}
                className="font-medium text-foreground hover:underline"
                title={view.name}
              >
                {view.name}
              </Link>
              <button
                type="button"
                aria-label={
                  view.isDefault ? t("savedViews.unpinDefault") : t("savedViews.pinDefault")
                }
                title={
                  view.isDefault ? t("savedViews.unpinDefault") : t("savedViews.pinDefault")
                }
                onClick={() =>
                  togglePinMutation.mutate({ id: view.id, isDefault: !view.isDefault })
                }
                disabled={togglePinMutation.isPending}
                className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
              >
                {view.isDefault ? (
                  <Star className="h-3 w-3 fill-current" />
                ) : (
                  <StarOff className="h-3 w-3" />
                )}
              </button>
              <SavedViewsManageMenu
                onRename={() => {
                  setMutationError(null);
                  setRenameTarget(view);
                }}
                onDelete={() => {
                  setMutationError(null);
                  setDeleteTarget(view);
                }}
                disabled={togglePinMutation.isPending}
              />
            </span>
          );
        })
      )}

      <div className="ms-auto">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!hasFilters || createMutation.isPending}
          title={hasFilters ? undefined : t("savedViews.applyFirst")}
          onClick={() => {
            setMutationError(null);
            setSaveOpen(true);
          }}
        >
          <BookmarkPlus className="me-1.5 h-3.5 w-3.5" />
          {t("savedViews.saveCurrent")}
        </Button>
      </div>

      <SaveCurrentDialog
        open={saveOpen}
        onOpenChange={(o) => {
          setSaveOpen(o);
          if (!o) setMutationError(null);
        }}
        pending={createMutation.isPending}
        errorMessage={mutationError}
        description={hasFilters ? undefined : t("savedViews.applyFirst")}
        onSubmit={(input) => createMutation.mutate(input)}
      />

      <RenameDialog
        target={renameTarget}
        pending={renameMutation.isPending}
        errorMessage={mutationError}
        onClose={() => {
          setRenameTarget(null);
          setMutationError(null);
        }}
        onSubmit={(name) => {
          if (renameTarget) renameMutation.mutate({ id: renameTarget.id, name });
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteTarget(null);
            setMutationError(null);
          }
        }}
        title={t("savedViews.deleteConfirmTitle")}
        description={
          deleteTarget ? (
            <>
              <span className="font-medium text-foreground">{deleteTarget.name}</span>
              {" — "}
              {t("savedViews.deleteConfirmBody")}
            </>
          ) : (
            ""
          )
        }
        pending={deleteMutation.isPending}
        errorMessage={mutationError}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}

function RenameDialog({
  target,
  pending,
  errorMessage,
  onClose,
  onSubmit,
}: {
  target: SavedViewDTO | null;
  pending: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const { t } = useT();
  const [name, setName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setName(target.name);
      setLocalError(null);
    } else {
      setName("");
    }
  }, [target]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setLocalError(t("savedViews.nameRequired"));
      return;
    }
    if (trimmed.length > 80) {
      setLocalError(t("savedViews.nameTooLong"));
      return;
    }
    setLocalError(null);
    onSubmit(trimmed);
  }

  const shownError = localError ?? errorMessage ?? null;

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("savedViews.rename")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="saved-view-rename">
              {t("savedViews.nameLabel")}
            </label>
            <Input
              id="saved-view-rename"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              disabled={pending}
              autoFocus
            />
          </div>
          {shownError && (
            <p className="text-sm text-destructive" role="alert">
              {shownError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
