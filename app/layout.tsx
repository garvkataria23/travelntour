import type { Metadata } from "next";
import "./globals.css";
import { UpdateBanner } from "@/components/update-banner";

export const metadata: Metadata = {
  title: "FlyConnect | Travel & Tourism Platform",
  description: "Travel automation and booking operations for FlyConnect",
};

// The CSP in middleware.ts uses a per-request nonce, which cannot be baked into
// prerendered HTML. Opt the whole tree out of static rendering so Next.js stamps the
// nonce onto its inline hydration scripts. This app is entirely behind auth and serves no
// public content, so there is nothing to gain from static HTML.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <UpdateBanner />
        {children}
      </body>
    </html>
  );
}
