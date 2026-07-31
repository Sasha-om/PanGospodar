import { Suspense } from "react";
import { notFound } from "next/navigation";
import CatalogBrowser from "@/components/CatalogBrowser";
import PageHeader from "@/components/PageHeader";
import { categories, getCategoryBySlug } from "@/lib/products";

export function generateStaticParams() {
  return categories.map((category) => ({ slug: category.slug }));
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = getCategoryBySlug(slug);

  if (!category) {
    notFound();
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-orange-100/50 to-stone-100">
      <PageHeader title={category.name} subtitle={category.description} />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6">
        {/* Live catalog scoped to this category (sourced from the УкрСклад feed). */}
        <Suspense
          fallback={
            <p className="text-sm text-stone-500">Завантаження каталогу...</p>
          }
        >
          <CatalogBrowser categorySlug={slug} />
        </Suspense>
      </main>
    </div>
  );
}
