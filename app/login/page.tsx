import PageHeader from "@/components/PageHeader";
import LoginForm from "@/components/LoginForm";
import { hashClientIp } from "@/lib/client-ip";
import { needsCaptcha } from "@/lib/login-rate-limit";
import { isAdminTotpEnabled } from "@/lib/totp";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const safeFrom = from && from.startsWith("/admin") ? from : undefined;
  // Costs a database round trip only when Turnstile is configured at all —
  // `needsCaptcha` short-circuits otherwise.
  const captchaRequired = await needsCaptcha(
    "admin",
    await hashClientIp("panhospodar-admin-login"),
  );

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-orange-100/50 to-stone-100">
      <PageHeader
        title="Авторизація"
        subtitle="Увійдіть, щоб керувати каталогом, замовленнями та налаштуваннями магазину."
      />

      <main className="mx-auto flex w-full max-w-md flex-1 items-start px-4 py-12 sm:px-6">
        <div className="w-full">
          <LoginForm
            from={safeFrom}
            totpEnabled={isAdminTotpEnabled()}
            captchaRequired={captchaRequired}
          />
        </div>
      </main>
    </div>
  );
}
