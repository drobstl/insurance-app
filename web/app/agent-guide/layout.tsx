import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agent Resource Guide",
  description: "Your complete resource guide for getting started and succeeding as an insurance agent.",
  openGraph: {
    title: "Agent Resource Guide",
    description: "Your complete resource guide for getting started and succeeding as an insurance agent.",
    type: "website",
    images: [
      {
        url: "/agent-guide/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Crosswinds Financial Group",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent Resource Guide",
    description: "Your complete resource guide for getting started and succeeding as an insurance agent.",
    images: ["/agent-guide/og-image.jpg"],
  },
};

export default function AgentGuideLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
