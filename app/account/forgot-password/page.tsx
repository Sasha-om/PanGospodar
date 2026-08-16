import ForgotPasswordForm from "@/components/account/ForgotPasswordForm";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-orange-100/50 to-stone-100">
      <PageHeader
        title="Відновлення пароля"
        subtitle="Надішлемо на вашу пошту посилання для створення нового пароля."
      />
      <main className="mx-auto flex w-full max-w-4xl flex-1 justify-center px-4 py-10 sm:px-6">
        <ForgotPasswordForm />
      </main>
    </div>
  );
}
