import CheckoutForm from "@/components/checkout/CheckoutForm";
import PageHeader from "@/components/PageHeader";

export default function CheckoutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-orange-100/50 to-stone-100">
      <PageHeader
        title="Оформлення замовлення"
        subtitle="Заповніть контактні дані та оберіть відділення Нової Пошти — ми зв'яжемося з вами для підтвердження."
      />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <CheckoutForm />
      </main>
    </div>
  );
}
