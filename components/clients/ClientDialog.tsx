"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/lib/i18n/client";

interface ClientFormData {
  id?: string;
  companyName?: string;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  israeliTaxId?: string | null;
  status?: "active" | "inactive";
  notes?: string | null;
}

interface Props {
  mode: "create" | "edit";
  initialData?: ClientFormData;
  onClose: () => void;
}

export function ClientDialog({ mode, initialData, onClose }: Props) {
  const router = useRouter();
  const { t } = useT();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState(initialData?.companyName ?? "");
  const [contactPerson, setContactPerson] = useState(initialData?.contactPerson ?? "");
  const [email, setEmail] = useState(initialData?.email ?? "");
  const [phone, setPhone] = useState(initialData?.phone ?? "");
  const [address, setAddress] = useState(initialData?.address ?? "");
  const [israeliTaxId, setIsraeliTaxId] = useState(initialData?.israeliTaxId ?? "");
  const [status, setStatus] = useState<"active" | "inactive">(initialData?.status ?? "active");
  const [notes, setNotes] = useState(initialData?.notes ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyName.trim()) { setError(t("clients.companyNameRequired")); return; }
    setError(null);

    startTransition(async () => {
      const payload = {
        companyName: companyName.trim(),
        contactPerson: contactPerson.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        israeliTaxId: israeliTaxId.trim() || null,
        ...(mode === "edit" ? { status } : {}),
        notes: notes.trim() || null,
      };

      const url = mode === "create" ? "/api/clients" : `/api/clients/${initialData?.id}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? t("clients.saveFailed"));
        return;
      }

      router.refresh();
      onClose();
    });
  }

  const inputCls = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? t("clients.createTitle") : t("clients.editTitle")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("clients.companyName")} *</label>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={isPending}
              maxLength={200}
              placeholder={t("clients.companyNamePlaceholder")}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("clients.contactPerson")}</label>
              <Input
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                disabled={isPending}
                maxLength={200}
                placeholder={t("clients.contactPersonPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("settings.email")}</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isPending}
                maxLength={200}
                placeholder={t("clients.emailPlaceholder")}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("clients.phone")}</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={isPending}
                maxLength={50}
                placeholder={t("clients.phonePlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {t("clients.israeliTaxId")}{" "}
                <span className="text-xs font-normal text-muted-foreground">{t("clients.israeliTaxIdSuffix")}</span>
              </label>
              <Input
                value={israeliTaxId}
                onChange={(e) => setIsraeliTaxId(e.target.value)}
                disabled={isPending}
                maxLength={30}
                placeholder={t("clients.taxIdPlaceholder")}
              />
              <p className="text-[10px] text-muted-foreground">
                {t("clients.taxIdHint")}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("clients.address")}</label>
            <Textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={isPending}
              maxLength={500}
              rows={2}
              placeholder={t("clients.addressPlaceholder")}
            />
          </div>

          {mode === "edit" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("clients.status")}</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
                disabled={isPending}
                className={inputCls}
              >
                <option value="active">{t("common.active")}</option>
                <option value="inactive">{t("common.inactive")}</option>
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("clients.notes")}</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isPending}
              maxLength={3000}
              rows={3}
              placeholder={t("clients.notesPlaceholder")}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending ? t("common.saving") : mode === "create" ? t("clients.addClient") : t("clients.saveChanges")}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
