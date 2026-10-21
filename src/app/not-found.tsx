import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="container section">
      <div className="empty-state">
        <p className="eyebrow">404 · Page unavailable</p>
        <h1>We couldn’t find that page.</h1>
        <p>
          The link may have changed, or the record is no longer publicly
          available.
        </p>
        <Link href="/organizations" className="button">
          Explore organizations
        </Link>
      </div>
    </main>
  );
}
