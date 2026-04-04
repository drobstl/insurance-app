import type * as React from "react";
import { EB_Garamond, Figtree } from "next/font/google";

const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const scopedVars: React.CSSProperties & Record<string, string> = {
  backgroundColor: "#F5F0E8",
  "--card-border": "0 0% 10%",
  "--card-shadow": "4px 4px 0 0 hsl(0 0% 10%)",
  "--lavender-light": "277 100% 95%",
  "--primary": "172 96% 16%",
  "--primary-foreground": "0 0% 100%",
};

export default function ClosrStyleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${ebGaramond.variable} ${figtree.variable} closr-style-layout min-h-screen`} style={scopedVars}>
      {children}
    </div>
  );
}
