import PageHeader from "@/components/PageHeader";

const stats = [
  { value: "Провідні бренди", label: "світових виробників" },
  { value: "Індивідуальний підхід", label: "до кожного клієнта" },
  { value: "Надійний помічник", label: "для вашого господарства" },
  { value: "до 24 місяців", label: "офіційної гарантії" },
];

const values = [
  {
    title: "Якість",
    description:
      "Працюємо лише з перевіреними виробниками — STIHL, Bosch, Makita, DeWalt, AL-KO та іншими світовими брендами.",
  },
  {
    title: "Надійність",
    description:
      "Кожна одиниця техніки проходить перевірку перед відправкою, а на всі товари діє офіційна гарантія виробника.",
  },
  {
    title: "Сервіс",
    description:
      "Консультуємо з підбором інструменту, допомагаємо з гарантійним обслуговуванням та відповідаємо на питання після покупки.",
  },
];

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-orange-100/50 to-stone-100">
      <PageHeader
        title="Про нас"
        subtitle="ПанГосподар — магазин господарських та садових інструментів для дому, дачі та професійного використання."
      />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
        <section>
          <h2 className="text-xl font-bold text-stone-800">Наша історія</h2>
          <p className="mt-3 text-stone-600">
            Компанія ПанГосподар почала свою роботу з невеликого магазину
            садового інвентарю та поступово виросла у надійного постачальника
            бензо- та електроінструменту для домашніх майстрів, дачників і
            професійних бригад. Сьогодні ми пропонуємо ретельно відібраний
            каталог техніки провідних світових виробників з офіційною
            гарантією та підтримкою після покупки.
          </p>
        </section>

        <section className="mt-10 grid grid-cols-1 gap-x-8 gap-y-7 rounded-sm border border-stone-200 bg-white p-6 sm:grid-cols-2 sm:p-8 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="min-w-0">
              <div className="text-lg font-extrabold leading-snug tracking-tight break-words text-accent-500 sm:text-xl">
                {stat.value}
              </div>
              <div className="mt-2 text-xs leading-relaxed text-stone-500">
                {stat.label}
              </div>
            </div>
          ))}
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-bold text-stone-800">
            Наші цінності
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {values.map((value) => (
              <div
                key={value.title}
                className="rounded-sm border border-stone-200 bg-white p-5"
              >
                <h3 className="font-bold text-stone-800">{value.title}</h3>
                <p className="mt-2 text-sm text-stone-600">
                  {value.description}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
