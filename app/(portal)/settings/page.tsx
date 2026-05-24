import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { SessionUser } from "@/lib/permissions";
import { DisplayNameForm } from "@/components/settings/DisplayNameForm";
import { PasswordForm } from "@/components/settings/PasswordForm";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account preferences.
        </p>
      </div>

      {/* Profile — read-only fields */}
      <section className="space-y-4 rounded-lg border p-6">
        <h2 className="text-base font-semibold">Profile</h2>
        <dl className="grid grid-cols-[6rem_1fr] gap-y-3 text-sm">
          <dt className="text-muted-foreground">Username</dt>
          <dd className="font-medium">{user.username}</dd>
          <dt className="text-muted-foreground">Role</dt>
          <dd className="capitalize">{user.roleKey}</dd>
          <dt className="text-muted-foreground">Department</dt>
          <dd className="capitalize">{user.departmentKey}</dd>
        </dl>
      </section>

      {/* Display name */}
      <section className="space-y-4 rounded-lg border p-6">
        <h2 className="text-base font-semibold">Display name</h2>
        <DisplayNameForm currentName={session.user.name ?? user.username} />
      </section>

      {/* Language */}
      <section className="space-y-4 rounded-lg border p-6">
        <h2 className="text-base font-semibold">Language</h2>
        <p className="text-sm text-muted-foreground">
          Use the language toggle in the header to switch between English and
          Hebrew. The portal reloads with the selected language and direction.
        </p>
      </section>

      {/* Password */}
      <section className="space-y-4 rounded-lg border p-6">
        <h2 className="text-base font-semibold">Change password</h2>
        <PasswordForm />
      </section>
    </div>
  );
}
