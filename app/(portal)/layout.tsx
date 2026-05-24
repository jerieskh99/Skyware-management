import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { SessionUser } from "@/lib/permissions";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { TimerBar } from "@/components/timer/TimerBar";
import QueryProvider from "@/components/providers/QueryProvider";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user as SessionUser;

  return (
    <QueryProvider>
      <div className="app-shell-bg flex h-screen overflow-hidden">
        <Sidebar user={user} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header user={user} />
          {/* pb-16 reserves space so content isn't hidden behind TimerBar */}
          <main className="scrollbar-thin flex-1 overflow-y-auto px-4 py-6 pb-16 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
      <TimerBar />
    </QueryProvider>
  );
}
