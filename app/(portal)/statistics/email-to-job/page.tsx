import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { SessionUser } from "@/lib/permissions";
import { isAdmin } from "@/lib/permissions";
import { EmailToJobForm } from "@/components/jobs/EmailToJobForm";
import { ArrowLeft, Mail } from "lucide-react";

export default async function EmailToJobPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;
  if (!isAdmin(user)) redirect("/dashboard");

  return (
    <div className="space-y-5 max-w-2xl">
      <Link
        href="/statistics"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Statistics
      </Link>

      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Mail className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Email → Job</h1>
          <p className="text-sm text-muted-foreground">
            Manually convert a support email into a job ticket.
          </p>
        </div>
      </div>

      <EmailToJobForm />
    </div>
  );
}
