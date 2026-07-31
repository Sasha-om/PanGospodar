import { Suspense } from "react";
import CatalogBrowser from "@/components/CatalogBrowser";
import PageHeader from "@/components/PageHeader";

export default function CatalogPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-orange-100/50 to-stone-100">
      <PageHeader
        title="Каталог товарів"
        subtitle="Бензо- та електроінструмент провідних брендів. Скористайтеся фільтрами та сортуванням, щоб швидко підібрати потрібну модель."
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6">
        <Suspense
          fallback={
            <p className="text-sm text-stone-500">Завантаження каталогу...</p>
          }
        >
          <CatalogBrowser showCategoryFilter />
        </Suspense>
      </main>
    </div>
  );
}
