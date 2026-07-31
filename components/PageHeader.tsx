export default function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <section className="border-b border-stone-200">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="h-1 w-12 rounded-full bg-accent-500" aria-hidden="true" />
        <h1 className="mt-3 text-2xl font-extrabold text-stone-800 sm:text-3xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2 max-w-2xl text-stone-600">{subtitle}</p>
        ) : null}
      </div>
    </section>
  );
}
