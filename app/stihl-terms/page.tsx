import PageHeader from "@/components/PageHeader";

const orderSteps = [
  {
    step: "1",
    title: "Оберіть товар",
    description:
      "Знайдіть потрібну модель техніки, інструменту, аксесуар або витратний матеріал STIHL у каталозі.",
  },
  {
    step: "2",
    title: "Надішліть замовлення",
    description:
      "Оформіть замовлення онлайн — воно автоматично потрапляє до найближчого магазину дилерської мережі STIHL.",
  },
  {
    step: "3",
    title: "Узгодьте доставку",
    description:
      "Дилер зателефонує вам, щоб підтвердити наявність і домовитися про зручний спосіб отримання замовлення.",
  },
];

const deliveryMethods = [
  {
    step: "1",
    title: "Самовивіз з магазину дилера",
    description:
      "Доступний для всіх товарів STIHL без винятку. Заберіть замовлення особисто одразу після підтвердження дилером.",
  },
  {
    step: "2",
    title: "Доставка перевізником або кур'єром",
    description:
      "Доставка до найближчого відділення перевізника (перерахунок перевізників) або його кур'єрською службою за вашою адресою — даним способом можна замовити цю продукцію фірми Stihl: приладдя, AC, AK системи, мийки, пилососи.",
  },
  {
    step: "3",
    title: "Фахова доставка офіційного дилера",
    description:
      "Для товарів, що продаються (на вимогу виробника) з обов'язковим інструктажем щодо правил користування та безпеки. Фахівець привозить товар у зібраному вигляді або збирає його на місці, встановлює гарнітуру, навісне обладнання та оснащення, проводить тестовий запуск, інструктує з правильного та безпечного користування й консультує з обслуговування.",
  },
];

export default function StihlTermsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-orange-100/50 to-stone-100">
      <PageHeader
        title="Умови доставки та оплати товарів STIHL"
        subtitle="Замовлення техніки, інструменту та аксесуарів STIHL оформлюється у офіційного дилера — з фаховою консультацією, перевіркою товару та передбаченим виробником сервісом."
      />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
        <section className="flex flex-col gap-4 text-stone-600">
          <p>
            Через наш офіційний онлайн-сервіс ви можете замовити будь-яку
            моторизовану техніку та інструмент STIHL, а також аксесуари,
            комплектуючі й приладдя до них у найближчому магазині дилерської
            мережі. Замовлення оформлюється безпосередньо у офіційного
            дилера, тому покупець отримує професійну консультацію та
            допомогу у виборі моделі, що відповідає його потребам.
          </p>
          <p>
            Перед видачею покупцю техніка проходить перевірку, збирається
            фахівцем і передається готовою до експлуатації. Це гарантує, що
            ви отримуєте справжню продукцію STIHL разом із кваліфікованим
            сервісом на кожному етапі — від оформлення замовлення до
            передачі товару в руки.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-bold text-stone-800">
            Як оформити замовлення
          </h2>
          <ol className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {orderSteps.map((item) => (
              <li
                key={item.step}
                className="flex gap-4 rounded-sm border border-stone-200 bg-white p-5"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-950 text-sm font-bold text-accent-500">
                  {item.step}
                </span>
                <div>
                  <h3 className="font-bold text-stone-800">{item.title}</h3>
                  <p className="mt-1 text-sm text-stone-600">
                    {item.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-bold text-stone-800">
            Способи доставки
          </h2>
          <ol className="mt-4 flex flex-col gap-4">
            {deliveryMethods.map((method) => (
              <li
                key={method.step}
                className="flex gap-4 rounded-sm border border-stone-200 border-l-4 border-l-accent-500 bg-white p-5"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-950 text-sm font-bold text-accent-500">
                  {method.step}
                </span>
                <div>
                  <h3 className="font-bold text-stone-800">
                    {method.title}
                  </h3>
                  <p className="mt-2 text-sm text-stone-600">
                    {method.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-10 rounded-sm bg-stone-950 p-6 text-white">
          <h2 className="text-lg font-bold">Уточнюйте перед замовленням</h2>
          <p className="mt-2 text-sm text-stone-300">
            Наявність фахової доставки та точні умови її надання залежать
            від конкретної моделі та регіону, тому будь ласка, уточнюйте
            наявність сервісу та умови фахової доставки безпосередньо в
            офіційного дилера STIHL.
          </p>
        </section>
      </main>
    </div>
  );
}
