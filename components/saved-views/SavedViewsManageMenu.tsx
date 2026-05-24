"use client";

import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";

interface Props {
  onRename: () => void;
  onDelete: () => void;
  disabled?: boolean;
}

export function SavedViewsManageMenu({ onRename, onDelete, disabled }: Props) {
  const { t } = useT();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={t("savedViews.manage")}
          disabled={disabled}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-[8rem] rounded-md border bg-popover p-1 text-sm shadow-md"
        >
          <DropdownMenu.Item
            onSelect={(e) => {
              e.preventDefault();
              onRename();
            }}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none focus:bg-accent"
          >
            <Pencil className="h-3.5 w-3.5" />
            {t("savedViews.rename")}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={(e) => {
              e.preventDefault();
              onDelete();
            }}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-destructive outline-none focus:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("savedViews.delete")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
