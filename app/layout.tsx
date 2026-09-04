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
        {/*
          Dark first, set before paint so there is no flash of the wrong theme.

          This has now flipped twice, and the argument that set it to light is
          the reason it could flip back safely. That argument was: the thing
          being edited is an email, the place it lands is Gmail, and Gmail is
          light, so a composer that does not resemble the client it sends into
          makes every preview a guess.

          That is still true, and it is still honoured. It was an argument about
          EMAIL SURFACES rather than about the application, and it now lives
          where it belongs: [data-surface="email"] in globals.css keeps the
          composer and both preview panes light in either theme. The rest of the
          product is a control system for something that is running, and that is
          the half that reads better dark.

          The rule is "dark unless the person chose light". An explicit choice
          still wins in both directions, which is the part that matters.

          The navigation rail rides along for the same reason. Its width is CSS
          keyed off data-rail, so setting it here is what stops someone who
          collapsed the rail from watching it collapse again on every single
          navigation. React state could not do this without either a hydration
          mismatch or that flash.

          try/catch because localStorage throws outright in some privacy modes,
          and the fallback still sets a theme rather than leaving the attribute
          off, which would leave every token undefined. The rail has no such
          fallback because its default is the absence of the attribute.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var d=document.documentElement;var t=localStorage.getItem('massleader.theme');d.setAttribute('data-theme',t==='light'?'light':'dark');if(localStorage.getItem('massleader.rail')==='collapsed')d.setAttribute('data-rail','collapsed')}catch(e){document.documentElement.setAttribute('data-theme','dark')}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
