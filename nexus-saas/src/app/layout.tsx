import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { WhatsAppSupportButton } from "@/components/support/whatsapp-support-button";

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
    default: "TechDalt | Data Bundle Business Software",
    template: "%s | TechDalt",
  },
  description:
    "TechDalt helps data bundle sellers run a shop link, payments, agents, resellers, wallets, and orders from one simple dashboard.",
  keywords: [
    "TechDalt",
    "VTU SaaS Ghana",
    "data bundle platform Ghana",
    "reseller shop",
    "agent wallet system",
    "Paystack data bundle checkout Ghana",
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
    title: "TechDalt | Data Bundle Business Software",
    description:
      "Launch a shop link, manage agents and resellers, collect Paystack payments, and process data bundle orders clearly.",
  },
  twitter: {
    card: "summary",
    title: "TechDalt | Data Bundle Business Software",
    description:
      "Ghana-focused software for data bundle shops, Paystack checkout, agents, resellers, wallets, and orders.",
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
        <WhatsAppSupportButton variant="floating" />
        <Toaster />
      </body>
    </html>
  );
}
