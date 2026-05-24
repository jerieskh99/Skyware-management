import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { SessionUser } from "@/lib/permissions";
import { DisplayNameForm } from "@/components/settings/DisplayNameForm";
import { PasswordForm } from "@/components/settings/PasswordForm";
import { getT } from "@/lib/i18n/server";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;
  const { t } = await getT();

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("settings.description")}
        </p>
      </div>

      {/* Profile — read-only fields */}
      <section className="space-y-4 rounded-lg border p-6">
        <h2 className="text-base font-semibold">{t("settings.profile")}</h2>
        <dl className="grid grid-cols-[6rem_1fr] gap-y-3 text-sm">
          <dt className="text-muted-foreground">{t("settings.username")}</dt>
          <dd className="font-medium">{user.username}</dd>
          <dt className="text-muted-foreground">{t("settings.role")}</dt>
          <dd className="capitalize">{user.roleKey}</dd>
          <dt className="text-muted-foreground">{t("settings.department")}</dt>
          <dd className="capitalize">{user.departmentKey}</dd>
        </dl>
      </section>

      {/* Display name */}
      <section className="space-y-4 rounded-lg border p-6">
        <h2 className="text-base font-semibold">{t("settings.displayName")}</h2>
        <DisplayNameForm currentName={session.user.name ?? user.username} />
      </section>

      {/* Language */}
      <section className="space-y-4 rounded-lg border p-6">
        <h2 className="text-base font-semibold">{t("settings.language")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("settings.languageHint")}
        </p>
      </section>

      {/* Password */}
      <section className="space-y-4 rounded-lg border p-6">
        <h2 className="text-base font-semibold">{t("settings.changePassword")}</h2>
        <PasswordForm />
      </section>
    </div>
  );
}
