import type { Metadata } from "next";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { env } from "@/lib/env";

/**
 * Brand typography (see docs/brand.md).
 *
 * One superfamily, two optical sizes. Inter Tight carries headings and
 * figures; Inter carries body and dense UI. A single family across the whole
 * product is what makes an interface feel seamless rather than assembled, and
 * it is the reason enterprise software converged on this approach.
 *
 * This replaces a display serif (Fraunces), which had real character but read
 * as editorial and slightly quirky rather than as enterprise software. A
 * quirky headline face is a liability on a screen someone stares at all day.
 *
 * Mono: JetBrains Mono for data, tokens, and technical labels.
 */
const display = Inter_Tight({
  variable: "--font-display",
  subsets: ["latin"],
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
