import { redirect } from "next/navigation";
import AuthForm from "@/components/account/AuthForm";
import PageHeader from "@/components/PageHeader";
import { hashClientIp } from "@/lib/client-ip";
import { getCustomerId } from "@/lib/customer-session";
import { needsCaptcha } from "@/lib/login-rate-limit";

export const dynamic = "force-dynamic";

export default async function CustomerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  if (await getCustomerId()) {
    redirect("/account");
  }
  const { from } = await searchParams;
  // Address only — which account is being signed into is not known until the
  // form is posted. Costs nothing unless Turnstile is configured.
  const captchaRequired = await needsCaptcha(
    "customer",
    await hashClientIp("panhospodar-customer-login"),
  );

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-orange-100/50 to-stone-100">
      <PageHeader
        title="Вхід в особистий кабінет"
        subtitle="Увійдіть, щоб бачити історію замовлень і зберігати улюблені товари."
      />
      <main className="mx-auto flex w-full max-w-4xl flex-1 justify-center px-4 py-10 sm:px-6">
        <AuthForm mode="login" from={from} captchaRequired={captchaRequired} />
      </main>
    </div>
  );
}
