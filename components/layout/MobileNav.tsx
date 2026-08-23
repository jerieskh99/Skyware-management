"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Menu, X } from "lucide-react";
import type { SessionUser } from "@/lib/permissions";
import { UserMenu } from "./UserMenu";
import { SidebarNav } from "./SidebarNav";
import { useT } from "@/lib/i18n/client";

interface Props {
  user: SessionUser;
  statisticsMeEnabled?: boolean;
  knowledgeEnabled?: boolean;
  billingRemindersEnabled?: boolean;
}

/**
 * Below the `lg` breakpoint the persistent {@link Sidebar} is hidden, so this
 * hamburger (rendered in the Header) opens the same {@link SidebarNav} as an
 * overlay drawer. Closes on link-click, backdrop-click, and Escape. The whole
 * control is `lg:hidden`, so the desktop layout is untouched.
 */
export function MobileNav({
  user,
  statisticsMeEnabled = false,
  knowledgeEnabled = false,
  billingRemindersEnabled = false,
}: Props) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  const close = useCallback(() => setOpen(false), []);

  // The drawer is portalled to <body> so its `position: fixed` is relative to
  // the viewport. Rendering it in place would trap it inside the Header's
  // `backdrop-filter`, which establishes a containing block for fixed children.
  useEffect(() => setMounted(true), []);

  // Close on Escape while the drawer is open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Move focus into the drawer on open, and restore it to the trigger only
  // after an actual close (never on the initial mount, which would otherwise
  // steal focus to the hamburger on every page load).
  useEffect(() => {
    if (open) {
      closeRef.current?.focus();
      wasOpenRef.current = true;
    } else if (wasOpenRef.current) {
      triggerRef.current?.focus();
      wasOpenRef.current = false;
    }
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("nav.openMenu")}
        aria-expanded={open}
        aria-controls="mobile-nav-drawer"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      {open && mounted && createPortal(
        <div className="lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40"
            aria-hidden
            onClick={close}
          />
          {/* Drawer */}
          <div
            id="mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={t("nav.openMenu")}
            className="fixed inset-y-0 start-0 z-50 flex w-64 max-w-[80%] flex-col border-e bg-card shadow-xl"
          >
            {/* Brand + close */}
            <div className="flex h-14 items-center gap-2.5 border-b px-4">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-brand-foreground font-semibold text-[13px] tracking-tight">
                S
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-none">Skyware</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  {t("nav.brandTagline")}
                </p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                aria-label={t("common.close")}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {/* Nav (shared with desktop) */}
            <SidebarNav
              user={user}
              statisticsMeEnabled={statisticsMeEnabled}
              knowledgeEnabled={knowledgeEnabled}
              billingRemindersEnabled={billingRemindersEnabled}
              onNavigate={close}
            />

            {/* User tile */}
            <div className="border-t p-2">
              <UserMenu user={user} />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
