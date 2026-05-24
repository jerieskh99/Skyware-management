"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  errorMessage?: string | null;
  description?: string;
  teamSharedEnabled?: boolean;
  onSubmit: (input: { name: string; isDefault: boolean; visibility: "personal" | "team" }) => void;
}

export function SaveCurrentDialog({
  open,
  onOpenChange,
  pending,
  errorMessage,
  description,
  teamSharedEnabled = false,
  onSubmit,
}: Props) {
  const { t } = useT();
  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [shareWithTeam, setShareWithTeam] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  function handleOpenChange(o: boolean) {
    if (!o) {
      setName("");
      setIsDefault(false);
      setShareWithTeam(false);
      setLocalError(null);
    }
    onOpenChange(o);
  }

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
    onSubmit({
      name: trimmed,
      isDefault,
      visibility: shareWithTeam ? "team" : "personal",
    });
  }

  const shownError = localError ?? errorMessage ?? null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("savedViews.saveCurrent")}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="saved-view-name">
              {t("savedViews.nameLabel")}
            </label>
            <Input
              id="saved-view-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("savedViews.namePlaceholder")}
              maxLength={80}
              disabled={pending}
              autoFocus
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              disabled={pending}
              className="h-4 w-4 rounded border-input"
            />
            {t("savedViews.pinDefault")}
          </label>
          {teamSharedEnabled && (
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={shareWithTeam}
                  onChange={(e) => setShareWithTeam(e.target.checked)}
                  disabled={pending}
                  className="h-4 w-4 rounded border-input"
                />
                {t("savedViews.shareWithTeam")}
              </label>
              <p className="ps-6 text-xs text-muted-foreground">
                {t("savedViews.teamHint")}
              </p>
            </div>
          )}
          {shownError && (
            <p className="text-sm text-destructive" role="alert">
              {shownError}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={pending}
            >
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
