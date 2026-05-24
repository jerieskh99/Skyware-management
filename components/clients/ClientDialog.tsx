"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { X } from "lucide-react";

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
    if (!companyName.trim()) { setError("Company name is required."); return; }
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
        setError(body.error ?? "Save failed.");
        return;
      }

      router.refresh();
      onClose();
    });
  }

  const inputCls = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-base font-semibold">
            {mode === "create" ? "Add client" : "Edit client"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 overflow-y-auto max-h-[70vh] p-6">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Company name *</label>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={isPending}
              maxLength={200}
              placeholder="Acme Ltd."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Contact person</label>
              <Input
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                disabled={isPending}
                maxLength={200}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isPending}
                maxLength={200}
                placeholder="contact@example.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Phone</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={isPending}
                maxLength={50}
                placeholder="+972 ..."
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Israeli tax ID{" "}
                <span className="text-xs font-normal text-muted-foreground">(ח&quot;פ / ע&quot;מ)</span>
              </label>
              <Input
                value={israeliTaxId}
                onChange={(e) => setIsraeliTaxId(e.target.value)}
                disabled={isPending}
                maxLength={30}
                placeholder="Placeholder — not verified"
              />
              <p className="text-[10px] text-muted-foreground">
                For reference only. Validate before use in tax documents.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Address</label>
            <Textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={isPending}
              maxLength={500}
              rows={2}
              placeholder="Street, city, ZIP"
            />
          </div>

          {mode === "edit" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
                disabled={isPending}
                className={inputCls}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Notes</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isPending}
              maxLength={3000}
              rows={3}
              placeholder="Internal notes about this client..."
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending ? "Saving..." : mode === "create" ? "Add client" : "Save changes"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
