import { getT } from "@/lib/i18n/server";
import { LocaleProvider } from "@/lib/i18n/client";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { locale, dict } = await getT();

  return (
    <LocaleProvider locale={locale} dict={dict}>
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        {children}
      </div>
    </LocaleProvider>
  );
}
