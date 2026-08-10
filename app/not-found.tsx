import Link from "next/link";

/**
 * The public 404, for someone who mistyped a marketing URL or followed a link to
 * a page that no longer exists.
 *
 * Standalone rather than reusing the dashboard shell: this renders for signed-out
 * visitors too, and a 404 that shows an empty sidebar and an account menu with no
 * account in it reads as a broken app rather than a wrong address.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-medium text-muted">404</p>
      <h1 className="mt-2 text-3xl font-semibold">Page not found</h1>
      <p className="mt-3 text-sm text-muted">
        That address does not exist. If you followed a link here, it was probably to a page that has
        since moved.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/" className="btn-primary min-h-11 px-4 py-2.5 text-sm no-underline">
          Go to the homepage
        </Link>
        <Link href="/sign-in" className="btn-secondary min-h-11 px-4 py-2.5 text-sm no-underline">
          Sign in
        </Link>
      </div>
    </main>
  );
}
