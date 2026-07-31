import PageHeader from "@/components/PageHeader";

const deliveryMethods = [
  {
    title: "Нова Пошта — у відділення",
    description:
      "Забирайте замовлення у зручному відділенні Нової Пошти у вашому місті. Термін доставки — 1-3 робочих дні.",
  },
  {
    title: "Нова Пошта — кур'єром",
    description:
      "Кур'єр Нової Пошти доставить замовлення безпосередньо за вказаною адресою. Термін доставки — 1-3 робочих дні.",
  },
  {
    title: "Самовивіз",
    description:
      "Заберіть замовлення самостійно з нашого магазину після підтвердження менеджером.",
  },
];

const paymentMethods = [
  {
    title: "Оплата при отриманні",
    description:
      "Оплатіть готівкою або карткою кур'єру чи у відділенні Нової Пошти під час отримання замовлення.",
  },
  {
    title: "Оплата карткою онлайн",
    description:
      "Безпечна онлайн-оплата карткою Visa/Mastercard одразу під час оформлення замовлення.",
  },
  {
    title: "Безготівковий розрахунок",
    description:
      "Для юридичних осіб та ФОП — оплата за рахунком з відстрочкою узгодження реквізитів.",
  },
];

export default function DeliveryPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-orange-100/50 to-stone-100">
      <PageHeader
        title="Доставка та оплата"
        subtitle="Доставляємо інструмент по всій Україні службою Нова Пошта. Оберіть зручний спосіб оплати."
      />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
        <section>
          <h2 className="text-xl font-bold text-stone-800">
            Способи доставки
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {deliveryMethods.map((method) => (
              <div
                key={method.title}
                className="rounded-sm border border-stone-200 bg-white p-5"
              >
                <h3 className="font-bold text-stone-800">{method.title}</h3>
                <p className="mt-2 text-sm text-stone-600">
                  {method.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-bold text-stone-800">
            Способи оплати
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {paymentMethods.map((method) => (
              <div
                key={method.title}
                className="rounded-sm border border-stone-200 bg-white p-5"
              >
                <h3 className="font-bold text-stone-800">{method.title}</h3>
                <p className="mt-2 text-sm text-stone-600">
                  {method.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10 rounded-sm border border-stone-200 bg-white p-6">
          <h2 className="text-lg font-bold text-stone-800">
            Терміни доставки
          </h2>
          <p className="mt-2 text-sm text-stone-600">
            Замовлення, оформлені до 15:00, ми передаємо у відділення Нової
            Пошти того ж дня. Середній термін доставки по Україні — 1-3
            робочих дні залежно від міста отримувача.
          </p>
        </section>
      </main>
    </div>
  );
}
