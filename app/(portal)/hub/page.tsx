import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { SessionUser } from "@/lib/permissions";

export default async function HubLandingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;

  // Redirect to the user's department hub (or global for admins)
  const scope = user.isAdmin ? "global" : user.departmentKey;
  redirect(`/hub/${scope}`);
}
