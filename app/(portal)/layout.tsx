import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { SessionUser } from "@/lib/permissions";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { TimerBar } from "@/components/timer/TimerBar";
import QueryProvider from "@/components/providers/QueryProvider";
import { ToastProvider } from "@/components/ui/toast";
import { getT } from "@/lib/i18n/server";
import { LocaleProvider } from "@/lib/i18n/client";
import { getFeatureFlags } from "@/lib/feature-flags";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user as SessionUser;
  const [{ locale, dict }, flags] = await Promise.all([
    getT(),
    getFeatureFlags([
      "statistics_me_enabled",
      "knowledge_articles_enabled",
      "billing_reminders_enabled",
    ]),
  ]);
  const statisticsMeEnabled = flags["statistics_me_enabled"] ?? false;
  const knowledgeEnabled = flags["knowledge_articles_enabled"] ?? false;
  const billingRemindersEnabled = flags["billing_reminders_enabled"] ?? false;

  return (
    <LocaleProvider locale={locale} dict={dict}>
      <QueryProvider>
        <ToastProvider>
          <div className="app-shell-bg flex h-screen overflow-hidden">
            <Sidebar
              user={user}
              statisticsMeEnabled={statisticsMeEnabled}
              knowledgeEnabled={knowledgeEnabled}
              billingRemindersEnabled={billingRemindersEnabled}
            />
            <div className="flex flex-1 flex-col overflow-hidden">
              <Header
                user={user}
                statisticsMeEnabled={statisticsMeEnabled}
                knowledgeEnabled={knowledgeEnabled}
                billingRemindersEnabled={billingRemindersEnabled}
              />
              {/* pb-16 reserves space so content isn't hidden behind TimerBar */}
              <main className="scrollbar-thin flex-1 overflow-y-auto px-4 py-6 pb-16 sm:px-6 lg:px-8">
                <div className="mx-auto w-full max-w-6xl">{children}</div>
              </main>
            </div>
          </div>
          <TimerBar />
        </ToastProvider>
      </QueryProvider>
    </LocaleProvider>
  );
}
