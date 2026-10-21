"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" tabIndex={-1} className="container section">
      <div className="empty-state">
        <h1>Something interrupted your request.</h1>
        <p>
          We couldn’t load this page. Please retry. Any form input still visible
          in your browser can be kept.
        </p>
        <button onClick={reset} className="button">
          Try again
        </button>{" "}
        <Link href="/" className="button secondary">
          Go home
        </Link>
      </div>
    </main>
  );
}
