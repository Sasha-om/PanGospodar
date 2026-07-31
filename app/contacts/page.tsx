import { MapPin } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import SocialLinks from "@/components/SocialLinks";

const MAP_URL = "https://maps.app.goo.gl/oZFzRkEMtAytRYZT8";

const contactItems = [
  {
    label: "Телефон",
    value: "+38 (067) 341-37-51",
    href: "tel:+380673413751",
  },
  {
    label: "Email",
    value: "pangospod@gmail.com",
    href: "mailto:pangospod@gmail.com",
  },
  {
    label: "Адреса",
    value: "вул. Центральна, 74, смт Ратне, Волинська область, 44100",
    href: MAP_URL,
  },
];

const workingHours = [
  { day: "Понеділок – П'ятниця", hours: "08:30 – 18:00" },
  { day: "Субота", hours: "09:00 – 15:00" },
  { day: "Неділя", hours: "Вихідний" },
];

export default function ContactsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-orange-100/50 to-stone-100">
      <PageHeader
        title="Контакти"
        subtitle="Звертайтеся будь-яким зручним способом — ми завжди раді допомогти з вибором інструменту."
      />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
          <section>
            <h2 className="text-xl font-bold text-stone-800">
              Наші контакти
            </h2>
            <ul className="mt-4 flex flex-col gap-4">
              {contactItems.map((item) => (
                <li key={item.label}>
                  <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    {item.label}
                  </div>
                  {item.href ? (
                    <a
                      href={item.href}
                      target={item.href.startsWith("http") ? "_blank" : undefined}
                      rel={
                        item.href.startsWith("http")
                          ? "noopener noreferrer"
                          : undefined
                      }
                      className="text-base font-semibold text-stone-800 transition-colors hover:text-accent-600"
                    >
                      {item.value}
                    </a>
                  ) : (
                    <div className="text-base font-semibold text-stone-800">
                      {item.value}
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <div className="mt-6">
              <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Ми в соцмережах
              </div>
              <div className="mt-3">
                <SocialLinks variant="light" />
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-stone-800">
              Графік роботи
            </h2>
            <ul className="mt-4 flex flex-col gap-2">
              {workingHours.map((entry) => (
                <li
                  key={entry.day}
                  className="flex items-center justify-between border-b border-stone-200 pb-2 text-sm"
                >
                  <span className="text-stone-600">{entry.day}</span>
                  <span className="font-semibold text-stone-800">
                    {entry.hours}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <a
          href={MAP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-10 flex h-56 flex-col items-center justify-center gap-2 rounded-sm border border-stone-200 bg-white text-center text-sm text-stone-600 transition-colors hover:border-accent-500 hover:text-accent-600"
        >
          <MapPin className="h-7 w-7 text-accent-500" aria-hidden="true" />
          <span className="font-semibold">
            вул. Центральна, 74, смт Ратне, Волинська область
          </span>
          <span className="text-xs text-stone-500">
            Натисніть, щоб відкрити карту проїзду в Google Maps
          </span>
        </a>
      </main>
    </div>
  );
}
