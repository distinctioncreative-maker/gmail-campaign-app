import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export function LegalPage({
  eyebrow,
  title,
  summary,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/" aria-label="Cadence home">
            <Logo size={24} />
          </Link>
          <nav className="flex items-center gap-2 text-sm" aria-label="Legal navigation">
            <Link href="/compliance" className="min-h-11 rounded-lg px-3 py-3 text-muted hover:text-foreground">
              Compliance
            </Link>
            <Link href="/sign-in" className="btn-ghost min-h-11 px-4 py-2.5">
              Log in
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground">
          {eyebrow}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">
          {title}
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-8 text-muted sm:text-lg">
          {summary}
        </p>
        <div className="alert-warning mt-8 rounded-xl border p-4 text-sm leading-6 text-foreground">
          Cadence is currently in early access. The signed order form
          identifies the operating entity, legal contact, governing law, commercial terms, and
          any negotiated data terms. If an order form conflicts with these public terms,
          the signed order form controls.
        </div>
        <article className="mt-10 space-y-10 text-[15px] leading-7 text-muted">
          {children}
        </article>
      </main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-8 text-xs text-muted sm:px-8">
          <div className="flex flex-wrap gap-x-5 gap-y-3">
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/acceptable-use" className="hover:text-foreground">Acceptable use</Link>
            <Link href="/compliance" className="hover:text-foreground">Compliance</Link>
            <Link href="/support" className="hover:text-foreground">Support</Link>
            <Link href="/#contact" className="hover:text-foreground">Contact</Link>
          </div>
          <p>Last updated August 3, 2026.</p>
        </div>
      </footer>
    </div>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}
