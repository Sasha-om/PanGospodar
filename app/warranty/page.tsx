import PageHeader from "@/components/PageHeader";

const warrantyTerms = [
  {
    title: "Гарантійний строк",
    description:
      "Офіційна гарантія до 24 місяців залежно від моделі та виробника — точний строк вказано у картці кожного товару та в гарантійному талоні.",
  },
  {
    title: "Що покриває гарантія",
    description:
      "Виробничі дефекти деталей та вузлів, несправності двигуна за умови дотримання правил експлуатації, зазначених в інструкції.",
  },
  {
    title: "Що не покриває гарантія",
    description:
      "Природний знос витратних частин (ланцюги, ножі, шнури, свічки), пошкодження через неправильну експлуатацію, самостійний ремонт або використання неоригінальних деталей.",
  },
];

const returnSteps = [
  {
    step: "1",
    title: "Зверніться до нас",
    description:
      "Напишіть або зателефонуйте протягом 14 днів з дня отримання товару та опишіть причину повернення.",
  },
  {
    step: "2",
    title: "Підготуйте товар",
    description:
      "Товар не повинен мати слідів використання, має зберігати товарний вигляд, оригінальну упаковку та комплектацію.",
  },
  {
    step: "3",
    title: "Надішліть товар",
    description:
      "Відправте товар відділенням Нової Пошти разом з квитанцією або накладною, що підтверджує покупку.",
  },
  {
    step: "4",
    title: "Отримайте кошти",
    description:
      "Після перевірки товару ми повертаємо кошти або обмінюємо на іншу модель протягом 3 робочих днів.",
  },
];

export default function WarrantyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-orange-100/50 to-stone-100">
      <PageHeader
        title="Гарантія та повернення"
        subtitle="На весь інструмент у нашому каталозі діє офіційна гарантія виробника, а повернення відбувається згідно із законодавством України."
      />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
        <section>
          <h2 className="text-xl font-bold text-stone-800">
            Умови гарантії
          </h2>
          <div className="mt-4 flex flex-col gap-4">
            {warrantyTerms.map((term) => (
              <div
                key={term.title}
                className="rounded-sm border border-stone-200 border-l-4 border-l-accent-500 bg-white p-5"
              >
                <h3 className="font-bold text-stone-800">{term.title}</h3>
                <p className="mt-2 text-sm text-stone-600">
                  {term.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-bold text-stone-800">
            Повернення та обмін
          </h2>
          <p className="mt-3 text-sm text-stone-600">
            Відповідно до Закону України «Про захист прав споживачів», ви
            маєте право повернути або обміняти товар належної якості протягом
            14 днів з моменту отримання, якщо він не був у використанні та
            зберіг товарний вигляд.
          </p>

          <ol className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {returnSteps.map((item) => (
              <li
                key={item.step}
                className="flex gap-4 rounded-sm border border-stone-200 bg-white p-5"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-950 text-sm font-bold text-accent-500">
                  {item.step}
                </span>
                <div>
                  <h3 className="font-bold text-stone-800">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-sm text-stone-600">
                    {item.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-10 rounded-sm bg-stone-950 p-6 text-white">
          <h2 className="text-lg font-bold">Гарантійний ремонт</h2>
          <p className="mt-2 text-sm text-stone-300">
            Якщо протягом гарантійного строку у товарі виявлено виробничий
            дефект, зв&apos;яжіться з нашою службою підтримки — ми
            організуємо безкоштовну діагностику та ремонт в авторизованому
            сервісному центрі виробника.
          </p>
        </section>
      </main>
    </div>
  );
}
