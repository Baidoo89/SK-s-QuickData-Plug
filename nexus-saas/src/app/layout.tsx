import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700", "800"],
});
const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://techdalt.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "TechDalt",
  title: {
    default: "TechDalt | VTU SaaS for Data Vendors, Agents, and Resellers",
    template: "%s | TechDalt",
  },
  description:
    "TechDalt is a Ghana-focused VTU SaaS platform for data bundle sellers, agents, resellers, storefront checkout, wallets, subscriptions, and manual fulfillment operations.",
  keywords: [
    "TechDalt",
    "VTU SaaS Ghana",
    "data bundle platform Ghana",
    "reseller storefront",
    "agent wallet system",
    "Paystack storefront Ghana",
    "MTN data reseller",
    "Telecel data reseller",
    "AirtelTigo data reseller",
  ],
  authors: [{ name: "TechDalt" }],
  creator: "TechDalt",
  publisher: "TechDalt",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: [{ url: "/apple-icon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    type: "website",
    locale: "en_GH",
    url: "/",
    siteName: "TechDalt",
    title: "TechDalt | VTU SaaS for Data Vendors, Agents, and Resellers",
    description:
      "Launch a branded VTU storefront, manage agents and resellers, collect customer payments, and fulfill data bundle orders with clean operational controls.",
  },
  twitter: {
    card: "summary",
    title: "TechDalt | VTU SaaS for Data Vendors, Agents, and Resellers",
    description:
      "Ghana-focused VTU SaaS for storefront checkout, subscriptions, wallets, agents, resellers, and order fulfillment.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={plusJakartaSans.variable}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
