import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans-loaded",
  display: "swap",
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-heading-loaded",
  display: "swap",
});

// Required for absolute OG/Twitter image URLs and the sitemap/robots
// canonical host — set NEXT_PUBLIC_SITE_URL to the real production domain
// when deploying. Falls back to localhost so dev/build never breaks.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const TITLE = "LinguABC — AI Coach for Language Mastery";
const DESCRIPTION =
  "LinguABC is an AI-powered English coaching platform that guides every learner through a personalized learning journey with Tuto, your AI English coach.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s — LinguABC",
  },
  description: DESCRIPTION,
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: "LinguABC",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#FF6B00",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.variable} ${plusJakartaSans.variable} h-full min-h-full antialiased`}>
        {children}
      </body>
    </html>
  );
}
