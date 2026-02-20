import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AgentForLife | Kill Chargebacks & Explode Your Referrals",
  description: "Stop losing commissions to chargebacks. AgentForLife gives insurance agents a white-label app with automated touchpoints, one-tap referrals, and an AI business line.",
  keywords: ["insurance agent chargebacks", "insurance agent retention", "insurance referrals", "stop chargebacks", "client retention app", "insurance CRM", "white label insurance app"],
  authors: [{ name: "AgentForLife" }],
  creator: "AgentForLife",
  publisher: "AgentForLife",
  icons: {
    icon: [
      { url: "/logo.png", type: "image/png" },
    ],
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://agentforlife.app",
    title: "AgentForLife | Kill Chargebacks & Explode Your Referrals",
    description: "Stop losing commissions to chargebacks. AgentForLife gives insurance agents a white-label app with automated touchpoints, one-tap referrals, and an AI business line.",
    siteName: "AgentForLife",
  },
  twitter: {
    card: "summary_large_image",
    title: "AgentForLife | Kill Chargebacks & Explode Your Referrals",
    description: "Stop losing commissions to chargebacks. AgentForLife gives insurance agents a white-label app with automated touchpoints, one-tap referrals, and an AI business line.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${montserrat.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
