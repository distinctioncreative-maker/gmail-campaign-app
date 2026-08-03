import type { Metadata } from "next";
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { env } from "@/lib/env";

/**
 * Brand typography (see docs/brand.md).
 *
 * Display: Fraunces. A warm editorial serif, set at a low optical size and
 * modest weight so it reads as considered rather than decorative. A serif in
 * the headline is the cheapest signal that a product was designed rather than
 * assembled, and it pairs with the ivory paper the way print does.
 * Text: Inter. The workhorse, tuned for dense product UI at small sizes.
 * Mono: JetBrains Mono for data, tokens, and technical labels.
 */
// Variable weight, so `weight` is omitted: next/font rejects a fixed weight
// list alongside custom axes. SOFT/WONK/opsz are driven from globals.css.
const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  display: "swap",
});

const sans = Inter({
  variable: "--font-sans-base",
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono-base",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(env.APP_BASE_URL),
  title: {
    default: "Cadence | AI-powered Gmail outreach for qualified conversations",
    template: "%s | Cadence",
  },
  description:
    "Turn lead lists into human-reviewed Gmail campaigns, send at a deliberate pace, and keep replies, reporting, and next steps in one focused workspace.",
  applicationName: "Cadence",
  keywords: [
    "Gmail outreach",
    "AI email assistant",
    "sales engagement",
    "campaign reporting",
    "email personalization",
  ],
  openGraph: {
    type: "website",
    siteName: "Cadence",
    title: "Cadence | Gmail outreach built for qualified conversations",
    description:
      "AI-assisted campaign preparation, visible sending controls, and reply-focused reporting in one Gmail-connected workflow.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cadence | Gmail outreach built for qualified conversations",
    description:
      "AI-assisted campaign preparation, visible sending controls, and reply-focused reporting in one Gmail-connected workflow.",
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
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Set the theme before paint to avoid a flash of the wrong colors. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('massleader.theme');if(t==='dark'||(!t&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.setAttribute('data-theme','dark')}}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
