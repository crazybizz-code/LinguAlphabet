import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "LinguAlphabet — AI Coach for Language Mastery",
  description:
    "LinguAlphabet is an AI-powered English coaching platform that guides every learner through a personalized learning journey with Tuto, your AI English coach.",
  icons: {
    icon: "/favicon.svg",
  },
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
