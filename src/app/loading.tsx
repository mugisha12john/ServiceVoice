export default function Loading() {
  return (
    <div className="container section" role="status" aria-label="Loading page">
      <div
        className="skeleton"
        style={{ height: 35, width: "55%", marginBottom: 25 }}
      />
      <div className="organization-grid">
        {[0, 1, 2].map((i) => (
          <div className="skeleton" key={i} style={{ height: 230 }} />
        ))}
      </div>
      <span className="sr-only">Loading, please wait…</span>
    </div>
  );
}
