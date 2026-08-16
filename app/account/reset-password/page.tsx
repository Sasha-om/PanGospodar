import Link from "next/link";
import { isResetTokenValid } from "@/app/actions/password-reset";
import ResetPasswordForm from "@/components/account/ResetPasswordForm";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

/**
 * The page the reset email links to.
 *
 * The token is checked here purely so a dead link says so up front instead of
 * after the customer has typed a new password twice. The check that counts
 * happens when the form is submitted — `consumePasswordReset` re-validates and
 * burns the ticket in one statement.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const valid = await isResetTokenValid(token ?? "");

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-orange-100/50 to-stone-100">
      <PageHeader
        title="Новий пароль"
        subtitle="Задайте новий пароль до особистого кабінету."
      />
      <main className="mx-auto flex w-full max-w-4xl flex-1 justify-center px-4 py-10 sm:px-6">
        {valid ? (
          <ResetPasswordForm token={token ?? ""} />
        ) : (
          <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-sm border border-stone-200 bg-white p-6 text-center">
            <h2 className="text-lg font-bold text-stone-800">
              Посилання більше не дійсне
            </h2>
            <p className="text-sm text-stone-600">
              Посилання для відновлення діє одну годину і спрацьовує один раз.
              Запросіть нове — це займе кілька секунд.
            </p>
            <Link
              href="/account/forgot-password"
              className="rounded-sm bg-accent-500 px-6 py-3 text-base font-bold text-white transition-colors hover:bg-accent-600"
            >
              Запросити нове посилання
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
