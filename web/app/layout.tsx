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
  title: "AgentForLife - Insurance Agent Retention & Referral System",
  description: "Build a book that pays for life. White-label mobile app system for insurance agents to improve client retention, generate referrals, and eliminate chargebacks. $9.99/month.",
  keywords: ["insurance agent retention", "insurance referrals", "stop chargebacks", "client retention app", "insurance CRM", "white label insurance app"],
  authors: [{ name: "AgentForLife" }],
  creator: "AgentForLife",
  publisher: "AgentForLife",
  icons: {
    icon: "/favicon.svg",
    apple: "/logo.png",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://agentforlife.app",
    title: "AgentForLife - Insurance Agent Retention & Referral System",
    description: "Build a book that pays for life. White-label mobile app system for insurance agents to improve client retention, generate referrals, and eliminate chargebacks.",
    siteName: "AgentForLife",
  },
  twitter: {
    card: "summary_large_image",
    title: "AgentForLife - Insurance Agent Retention & Referral System",
    description: "Build a book that pays for life. White-label mobile app for insurance agents.",
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
