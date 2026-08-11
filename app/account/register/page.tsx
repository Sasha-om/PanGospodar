import { redirect } from "next/navigation";
import AuthForm from "@/components/account/AuthForm";
import PageHeader from "@/components/PageHeader";
import { getCustomerId } from "@/lib/customer-session";

export const dynamic = "force-dynamic";

export default async function CustomerRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  if (await getCustomerId()) {
    redirect("/account");
  }
  const { from } = await searchParams;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-orange-100/50 to-stone-100">
      <PageHeader
        title="Реєстрація"
        subtitle="Створіть акаунт, щоб стежити за замовленнями та зберігати улюблені товари."
      />
      <main className="mx-auto flex w-full max-w-4xl flex-1 justify-center px-4 py-10 sm:px-6">
        <AuthForm mode="register" from={from} />
      </main>
    </div>
  );
}
