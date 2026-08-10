import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import CompareBar from "@/components/CompareBar";
import { CartProvider } from "@/context/CartContext";
import { CompareProvider } from "@/context/CompareContext";
import { ProductsProvider } from "@/context/ProductsContext";
import { getStoreSettings } from "@/lib/db";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="uk"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gradient-to-b from-orange-100/50 to-stone-100 text-stone-800">
        <CartProvider>
          <ProductsProvider>
            <CompareProvider>
              <Header />
              {children}
              <Footer />
              <CompareBar />
            </CompareProvider>
          </ProductsProvider>
        </CartProvider>
      </body>
    </html>
  );
}
