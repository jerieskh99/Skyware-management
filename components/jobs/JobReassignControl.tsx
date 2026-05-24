"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { UserCog } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/lib/i18n/client";

interface ActiveUser {
  id: string;
  username: string;
  displayName: string;
  department: { key: string; nameEn: string };
}

interface Props {
  jobId: string;
  currentAssigneeId: string | null;
}

export function JobReassignControl({ jobId, currentAssigneeId }: Props) {
  const { t } = useT();
  const router = useRouter();
  const toast = useToast();
  const [target, setTarget] = useState<ActiveUser | null>(null);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: users = [] } = useQuery<ActiveUser[]>({
    queryKey: ["active-users"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });

  const assignable = users.filter((u) => u.id !== currentAssigneeId);

  async function doReassign() {
    if (!target) return;
    setPending(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedEmployeeId: target.id }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setErrorMessage(body.error ?? "Reassign failed.");
        return;
      }
      toast.push({ tone: "success", title: t("jobs.detail.reassignSuccess") });
      setTarget(null);
      router.refresh();
    } catch {
      setErrorMessage("Reassign failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <UserCog className="h-3.5 w-3.5" />
              {t("jobs.detail.reassignTo")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
            <DropdownMenuLabel>{t("jobs.detail.reassignTo")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {assignable.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                {t("common.none")}
              </div>
            )}
            {assignable.map((u) => (
              <DropdownMenuItem key={u.id} onSelect={() => setTarget(u)}>
                <div className="flex flex-col">
                  <span>{u.displayName}</span>
                  <span className="text-xs text-muted-foreground">
                    {u.department.nameEn} · {u.username}
                  </span>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <InfoTooltip label={t("jobs.detail.tooltipReassign")}>
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] text-muted-foreground"
            aria-hidden="true"
          >
            ?
          </span>
        </InfoTooltip>
      </div>

      <ConfirmDialog
        open={!!target}
        onOpenChange={(open) => {
          if (!open) {
            setTarget(null);
            setErrorMessage(null);
          }
        }}
        title={t("jobs.detail.reassignConfirmTitle")}
        description={t("jobs.detail.reassignConfirmBody").replace(
          "{user}",
          target?.displayName ?? ""
        )}
        confirmLabel={t("jobs.detail.reassignButton")}
        destructive={false}
        pending={pending}
        errorMessage={errorMessage}
        onConfirm={doReassign}
      />
    </>
  );
}
