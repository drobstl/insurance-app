import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import PostHogProvider from "../components/PostHogProvider";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AgentForLife™ | Kill Chargebacks & Explode Your Referrals",
  description: "Stop losing commissions to chargebacks. AgentForLife gives insurance agents a white-label app with automated touchpoints, one-tap referrals, and an AFL referral assistant that books appointments for you.",
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
  // Phase 1 Track B — PWA manifest. The agent dashboard is installable
  // on iOS 16.4+, Android, and desktop Chrome/Edge so the
  // "Send from my phone" welcome flow has a fast home-screen launcher
  // and Web Push notifications can wake the agent's phone when a
  // welcome action item lands.
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "AgentForLife",
    statusBarStyle: "default",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://agentforlife.app",
    title: "AgentForLife | Kill Chargebacks & Explode Your Referrals",
    description: "Stop losing commissions to chargebacks. AgentForLife gives insurance agents a white-label app with automated touchpoints, one-tap referrals, and an AFL referral assistant that books appointments for you.",
    siteName: "AgentForLife",
  },
  twitter: {
    card: "summary_large_image",
    title: "AgentForLife | Kill Chargebacks & Explode Your Referrals",
    description: "Stop losing commissions to chargebacks. AgentForLife gives insurance agents a white-label app with automated touchpoints, one-tap referrals, and an AFL referral assistant that books appointments for you.",
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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(w){w.fpr=w.fpr||function(){w.fpr.q = w.fpr.q||[];w.fpr.q[arguments[0]=='set'?'unshift':'push'](arguments);};})(window);fpr("init", {cid:"dnd9y4t9"}); fpr("click");`,
          }}
        />
        <script src="https://cdn.firstpromoter.com/fpr.js" async />
      </head>
      <body className={`${montserrat.className} antialiased`}>
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
