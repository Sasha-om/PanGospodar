import Link from "next/link";
import { redirect } from "next/navigation";
import AccountShell from "@/components/account/AccountShell";
import ChangePasswordForm from "@/components/account/ChangePasswordForm";
import { getCustomerId } from "@/lib/customer-session";
import {
  findCustomerById,
  hasDatabase,
  listFavorites,
  listOrdersForCustomer,
} from "@/lib/db";

// Nothing on this page may be cached or shared between visitors.
export const dynamic = "force-dynamic";

export default async function AccountPasswordPage() {
  const customerId = await getCustomerId();
  if (!customerId) {
    redirect("/account/login?from=/account/password");
  }

  const customer = hasDatabase() ? await findCustomerById(customerId) : null;
  if (!customer) {
    redirect("/account/login");
  }

  const [orders, favorites] = await Promise.all([
    listOrdersForCustomer(customerId, customer.email, customer.phone),
    listFavorites(customerId),
  ]);

  return (
    <AccountShell
      active="password"
      name={customer.name}
      email={customer.email}
      orderCount={orders.length}
      favoriteCount={favorites.length}
    >
      <div className="flex flex-col gap-4">
        <ChangePasswordForm />
        <p className="max-w-md text-sm text-stone-500">
          Не пам&apos;ятаєте поточний пароль?{" "}
          <Link
            href="/account/forgot-password"
            className="font-semibold text-accent-600 transition-colors hover:text-accent-700"
          >
            Відновіть його поштою
          </Link>
          .
        </p>
      </div>
    </AccountShell>
  );
}
