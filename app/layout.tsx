import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import CompareBar from "@/components/CompareBar";
import { CartProvider } from "@/context/CartContext";
import { CompareProvider } from "@/context/CompareContext";
import { FavoritesProvider } from "@/context/FavoritesContext";
import { ProductsProvider } from "@/context/ProductsContext";
import { getCustomerId } from "@/lib/customer-session";
import { getStoreSettings, hasDatabase, listFavorites } from "@/lib/db";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Async so the browser tab title follows the store name set in the admin panel.
export async function generateMetadata(): Promise<Metadata> {
  const { name } = await getStoreSettings();
  return {
    title: `${name} — господарські та садові інструменти`,
    description:
      "Магазин інструментів у смт Ратне. Бензо- та електроінструмент провідних брендів з офіційною гарантією до 24 місяців.",
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolved here so the heart renders in its true state on first paint for a
  // signed-in customer, instead of flashing empty until the client catches up.
  const customerId = await getCustomerId();
  const favorites =
    customerId && hasDatabase() ? await listFavorites(customerId) : [];

  return (
    <html
      lang="uk"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gradient-to-b from-orange-100/50 to-stone-100 text-stone-800">
        <CartProvider>
          <ProductsProvider>
            <CompareProvider>
              <FavoritesProvider
                signedIn={customerId !== null}
                initialSkus={favorites}
              >
                <Header />
                {children}
                <Footer />
                <CompareBar />
              </FavoritesProvider>
            </CompareProvider>
          </ProductsProvider>
        </CartProvider>
      </body>
    </html>
  );
}
