"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/lib/i18n/client";

type CompanySettingsDTO = {
  legalNameEn?: string | null;
  legalNameHe?: string | null;
  companyNumber?: string | null;
  vatNumber?: string | null;
  timezone?: string;
  defaultVatBasisPoints?: number;
  defaultCurrency?: "ILS" | "USD" | "EUR";
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string;
  websiteUrl?: string | null;
  receiptFooterEn?: string | null;
  receiptFooterHe?: string | null;
};

interface Props {
  initial: CompanySettingsDTO;
}

interface FormState {
  legalNameEn: string;
  legalNameHe: string;
  companyNumber: string;
  vatNumber: string;
  timezone: string;
  defaultVatBasisPoints: string;
  defaultCurrency: "ILS" | "USD" | "EUR";
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  country: string;
  websiteUrl: string;
  receiptFooterEn: string;
  receiptFooterHe: string;
}

function init(initial: CompanySettingsDTO): FormState {
  return {
    legalNameEn: initial.legalNameEn ?? "",
    legalNameHe: initial.legalNameHe ?? "",
    companyNumber: initial.companyNumber ?? "",
    vatNumber: initial.vatNumber ?? "",
    timezone: initial.timezone ?? "Asia/Jerusalem",
    defaultVatBasisPoints:
      typeof initial.defaultVatBasisPoints === "number"
        ? String(initial.defaultVatBasisPoints)
        : "1800",
    defaultCurrency: initial.defaultCurrency ?? "ILS",
    email: initial.email ?? "",
    phone: initial.phone ?? "",
    addressLine1: initial.addressLine1 ?? "",
    addressLine2: initial.addressLine2 ?? "",
    city: initial.city ?? "",
    postalCode: initial.postalCode ?? "",
    country: initial.country ?? "IL",
    websiteUrl: initial.websiteUrl ?? "",
    receiptFooterEn: initial.receiptFooterEn ?? "",
    receiptFooterHe: initial.receiptFooterHe ?? "",
  };
}

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function CompanySettingsForm({ initial }: Props) {
  const { t } = useT();
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(() => init(initial));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((s) => ({ ...s, [key]: value }));
  }

  function validate(): string | null {
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      return t("admin.company.validation.emailInvalid");
    }
    if (form.websiteUrl && !/^https?:\/\/.+/i.test(form.websiteUrl)) {
      return t("admin.company.validation.urlInvalid");
    }
    if (form.companyNumber && !/^[0-9][0-9\-/. ]*$/.test(form.companyNumber)) {
      return t("admin.company.validation.companyNumberInvalid");
    }
    if (form.vatNumber && !/^[0-9][0-9\-/. ]*$/.test(form.vatNumber)) {
      return t("admin.company.validation.vatNumberInvalid");
    }
    const bp = Number(form.defaultVatBasisPoints);
    if (!Number.isInteger(bp) || bp < 0 || bp > 10000) {
      return t("admin.company.validation.vatBpOutOfRange");
    }
    if (form.country && form.country.trim().length !== 2) {
      return t("admin.company.validation.countryInvalid");
    }
    return null;
  }

  function buildPayload(): Record<string, unknown> {
    return {
      legalNameEn: form.legalNameEn,
      legalNameHe: form.legalNameHe,
      companyNumber: form.companyNumber,
      vatNumber: form.vatNumber,
      timezone: form.timezone,
      defaultVatBasisPoints: Number(form.defaultVatBasisPoints),
      defaultCurrency: form.defaultCurrency,
      email: form.email,
      phone: form.phone,
      addressLine1: form.addressLine1,
      addressLine2: form.addressLine2,
      city: form.city,
      postalCode: form.postalCode,
      country: form.country.toUpperCase(),
      websiteUrl: form.websiteUrl,
      receiptFooterEn: form.receiptFooterEn,
      receiptFooterHe: form.receiptFooterHe,
    };
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/admin/company-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? t("admin.company.saveFailed"));
        return;
      }
      toast.push({ tone: "success", title: t("admin.company.saved") });
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.company.sections.identity")}</CardTitle>
          <CardDescription>{t("admin.company.sectionHints.identity")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FieldText
            id="legalNameEn"
            label={t("admin.company.fields.legalNameEn")}
            value={form.legalNameEn}
            onChange={(v) => set("legalNameEn", v)}
            placeholder="Skyware IT LTD"
          />
          <FieldText
            id="legalNameHe"
            label={t("admin.company.fields.legalNameHe")}
            value={form.legalNameHe}
            onChange={(v) => set("legalNameHe", v)}
            dir="rtl"
            placeholder='סקייוור אי.טי בע"מ'
          />
          <FieldText
            id="email"
            label={t("admin.company.fields.email")}
            type="email"
            value={form.email}
            onChange={(v) => set("email", v)}
            placeholder="billing@example.com"
          />
          <FieldText
            id="phone"
            label={t("admin.company.fields.phone")}
            value={form.phone}
            onChange={(v) => set("phone", v)}
            placeholder="+972-X-XXXXXXX"
          />
          <FieldText
            id="websiteUrl"
            label={t("admin.company.fields.websiteUrl")}
            value={form.websiteUrl}
            onChange={(v) => set("websiteUrl", v)}
            placeholder="https://example.com"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.company.sections.tax")}</CardTitle>
          <CardDescription>{t("admin.company.sectionHints.tax")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FieldText
            id="companyNumber"
            label={t("admin.company.fields.companyNumber")}
            value={form.companyNumber}
            onChange={(v) => set("companyNumber", v)}
            placeholder="5X-XXXXXXX"
          />
          <FieldText
            id="vatNumber"
            label={t("admin.company.fields.vatNumber")}
            value={form.vatNumber}
            onChange={(v) => set("vatNumber", v)}
            placeholder="5XXXXXXXX"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.company.sections.address")}</CardTitle>
          <CardDescription>{t("admin.company.sectionHints.address")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FieldText
            id="addressLine1"
            label={t("admin.company.fields.addressLine1")}
            value={form.addressLine1}
            onChange={(v) => set("addressLine1", v)}
            className="sm:col-span-2"
          />
          <FieldText
            id="addressLine2"
            label={t("admin.company.fields.addressLine2")}
            value={form.addressLine2}
            onChange={(v) => set("addressLine2", v)}
            className="sm:col-span-2"
          />
          <FieldText
            id="city"
            label={t("admin.company.fields.city")}
            value={form.city}
            onChange={(v) => set("city", v)}
          />
          <FieldText
            id="postalCode"
            label={t("admin.company.fields.postalCode")}
            value={form.postalCode}
            onChange={(v) => set("postalCode", v)}
          />
          <FieldText
            id="country"
            label={t("admin.company.fields.country")}
            value={form.country}
            onChange={(v) => set("country", v.toUpperCase())}
            maxLength={2}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.company.sections.receiptFooter")}</CardTitle>
          <CardDescription>{t("admin.company.sectionHints.receiptFooter")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="receiptFooterEn">{t("admin.company.fields.receiptFooterEn")}</Label>
            <Textarea
              id="receiptFooterEn"
              value={form.receiptFooterEn}
              onChange={(e) => set("receiptFooterEn", e.target.value)}
              rows={4}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="receiptFooterHe">{t("admin.company.fields.receiptFooterHe")}</Label>
            <Textarea
              id="receiptFooterHe"
              dir="rtl"
              value={form.receiptFooterHe}
              onChange={(e) => set("receiptFooterHe", e.target.value)}
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.company.sections.defaults")}</CardTitle>
          <CardDescription>{t("admin.company.sectionHints.defaults")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <FieldText
            id="timezone"
            label={t("admin.company.fields.timezone")}
            value={form.timezone}
            onChange={(v) => set("timezone", v)}
          />
          <div className="space-y-1.5">
            <Label htmlFor="defaultVatBasisPoints">
              {t("admin.company.fields.defaultVatBasisPoints")}
            </Label>
            <Input
              id="defaultVatBasisPoints"
              inputMode="numeric"
              value={form.defaultVatBasisPoints}
              onChange={(e) => set("defaultVatBasisPoints", e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              {t("admin.company.fields.defaultVatBasisPointsHint")}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="defaultCurrency">
              {t("admin.company.fields.defaultCurrency")}
            </Label>
            <select
              id="defaultCurrency"
              value={form.defaultCurrency}
              onChange={(e) =>
                set("defaultCurrency", e.target.value as FormState["defaultCurrency"])
              }
              className={selectClass}
            >
              <option value="ILS">ILS</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? t("common.saving") : t("admin.company.save")}
        </Button>
      </div>
    </form>
  );
}

interface FieldTextProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  dir?: "rtl" | "ltr";
  className?: string;
  maxLength?: number;
}

function FieldText({
  id,
  label,
  value,
  onChange,
  placeholder,
  type,
  dir,
  className,
  maxLength,
}: FieldTextProps) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`.trim()}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        dir={dir}
        maxLength={maxLength}
      />
    </div>
  );
}
