import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { CartProvider } from "@/context/CartContext";
import { ProductsProvider } from "@/context/ProductsContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ПанГосподар — господарські та садові інструменти",
  description:
    "Магазин інструментів у смт Ратне. Бензо- та електроінструмент провідних брендів з офіційною гарантією до 24 місяців.",
};

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
            <Header />
            {children}
            <Footer />
          </ProductsProvider>
        </CartProvider>
      </body>
    </html>
  );
}
