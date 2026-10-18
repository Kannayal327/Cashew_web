import type { Metadata } from "next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { CartDrawer } from "@/components/cart-drawer";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  ),
  title: {
    default: "FarmDirect Cashews — Goodness, closer to its roots.",
    template: "%s | FarmDirect Cashews",
  },
  description:
    "Discover single-origin cashews: whole kernels, thoughtful flavours, kitchen essentials, cashew butter, and gifts. Straight from the source.",
  openGraph: {
    title: "FarmDirect Cashews",
    description: "Goodness, closer to its roots.",
    images: ["/images/cashews-hero.png"],
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <body>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <Header />
        <main id="main-content">{children}</main>
        <Footer />
        <CartDrawer />
      </body>
    </html>
  );
}
