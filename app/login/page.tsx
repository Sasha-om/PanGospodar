import PageHeader from "@/components/PageHeader";
import LoginForm from "@/components/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const safeFrom = from && from.startsWith("/admin") ? from : undefined;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-orange-100/50 to-stone-100">
      <PageHeader
        title="Авторизація"
        subtitle="Увійдіть, щоб керувати каталогом, замовленнями та налаштуваннями магазину."
      />

      <main className="mx-auto flex w-full max-w-md flex-1 items-start px-4 py-12 sm:px-6">
        <div className="w-full">
          <LoginForm from={safeFrom} />
        </div>
      </main>
    </div>
  );
}
