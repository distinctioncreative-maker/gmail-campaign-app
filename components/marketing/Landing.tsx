"use client";

import Link from "next/link";
import { Wordmark } from "@/components/ui/Logo";
import styles from "./landing.module.css";
import { ScrollReveal } from "./ScrollReveal";
import { Arrow, StartLink } from "./shared";
import { Hero } from "./sections/Hero";
import { Intro } from "./sections/Intro";
import { Workflow } from "./sections/Workflow";
import { Features } from "./sections/Features";
import { Trust } from "./sections/Trust";
import { Outcome } from "./sections/Outcome";
import { Pricing } from "./sections/Pricing";
import { Faq } from "./sections/Faq";
import { FinalCta } from "./sections/FinalCta";

/**
 * The page shell: skip link, nav, the order of the bands, footer.
 *
 * This file was 876 lines. It held nine bands, four helper components and
 * three data tables, so changing the pricing copy meant scrolling past the
 * hero, the workflow and the trust band to reach it, and every one of those
 * was a candidate for an accidental edit on the way. Each band is its own file
 * under sections/ now, owning its markup and the data only it uses. What is
 * left here is the one thing that genuinely is the whole page rather than any
 * band of it: what order they come in.
 */
export function Landing() {
  return (
    <div className={styles.root} data-landing-root>
      <ScrollReveal />
      <a className={styles.skipLink} href="#main">
        Skip to main content
      </a>

      <nav className={styles.nav} aria-label="Primary navigation">
        <div className={styles.navInner}>
          <Link className={styles.brand} href="/" aria-label="Cadence home">
            <Wordmark />
          </Link>
          <div className={styles.navLinks}>
            <a href="#workflow">How it works</a>
            <a href="#features">Product</a>
            <a href="#pricing">Pricing</a>
            <a href="#trust">Trust</a>
          </div>
          <div className={styles.navActions}>
            <a className={styles.login} href="/demo">
              See it live
            </a>
            <a className={styles.login} href="/sign-in">
              Log in
            </a>
            <StartLink className={styles.navStart}>
              Get started <Arrow />
            </StartLink>
          </div>
        </div>
      </nav>

      <main id="main">
        <Hero />
        <Intro />
        <Workflow />
        <Features />
        <Trust />
        <Outcome />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div>
            <Link className={styles.brand} href="/">
              <Wordmark />
            </Link>
            <p>
              AI-powered Gmail outreach with human review, deliberate pacing,
              and a clear next step.
            </p>
          </div>
          <div className={styles.footerLinks}>
            <a href="#workflow">Workflow</a>
            <a href="#features">Product</a>
            <a href="#controls">Live demo</a>
            <a href="#pricing">Pricing</a>
            <a href="#trust">Trust</a>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/acceptable-use">Anti-spam</Link>
            <Link href="/compliance">Compliance</Link>
            <Link href="/support">Support</Link>
            <Link href="/sign-in">Log in</Link>
          </div>
          <p className={styles.copyright}>
            {/* The old line said a signed order form completes the commercial
                and data terms, which is an enterprise-sales framing that stopped
                being true for most customers the moment self-serve checkout
                existed: nobody signs an order form to pay for a plan on Stripe.
                Both paths are now named, because both are real. */}
            © 2026 Cadence. Plans bought online are governed by the terms below.
            Enterprise rollouts are completed by a signed order form covering
            operating entity, jurisdiction, commercial, and data terms.
          </p>
        </div>
      </footer>
    </div>
  );
}
