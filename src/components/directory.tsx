import Link from "next/link";
import {
  Search,
  ArrowUpRight,
  Building2,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { directory, type Organization } from "@/lib/services/catalog";
import { Badge, EmptyState, Notice } from "./ui";
function OrganizationCard({ organization: o }: { organization: Organization }) {
  return (
    <article className="organization-card">
      <div className="org-card-top">
        <span className="org-initials" aria-hidden="true">
          {o.name
            .split(/\s+/)
            .map((s) => s[0])
            .slice(0, 2)
            .join("")}
        </span>
        <Badge
          tone={o.organization_type === "GOVERNMENT" ? "green" : "neutral"}
        >
          {o.organization_type === "GOVERNMENT"
            ? "Public institution"
            : "Private company"}
        </Badge>
      </div>
      <h3>
        <Link href={`/organizations/${o.id}`}>{o.name}</Link>
      </h3>
      <p className="sector">
        {o.sector}
        {o.can_assess ? " · Assessing authority" : ""}
      </p>
      <p className="description">
        {o.description ||
          "Explore this organization’s listed services and public feedback."}
      </p>
      <div className="org-card-bottom">
        <span>
          {o.service_count} {o.service_count === 1 ? "service" : "services"}{" "}
          listed
        </span>
        <Link
          href={`/organizations/${o.id}`}
          className="text-link"
          aria-label={`View ${o.name}`}
        >
          View profile
          <ArrowUpRight size={15} />
        </Link>
      </div>
    </article>
  );
}
export async function Directory({
  q = "",
  sector = "",
  type = "",
  page = 1,
  home = false,
}: {
  q?: string;
  sector?: string;
  type?: string;
  page?: number;
  home?: boolean;
}) {
  let data: Awaited<ReturnType<typeof directory>> | null = null;
  try {
    data = await directory({ q, sector, type, page });
  } catch {
    /* An unavailable database is displayed honestly below. */
  }
  const link = (changes: Record<string, string>) => {
    const p = new URLSearchParams({
      ...(q ? { q } : {}),
      ...(sector ? { sector } : {}),
      ...(type ? { type } : {}),
      ...changes,
    });
    return `/organizations?${p.toString()}`;
  };
  const Heading = home ? "h2" : "h1";
  return (
    <section
      className="section"
      id="directory"
      aria-labelledby="directory-heading"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">The service directory</p>
          <Heading id="directory-heading">
            Find the service. Hear the experience.
          </Heading>
          <p className="muted">
            Explore private companies and public institutions, one service at a
            time.
          </p>
        </div>
        {home && (
          <Link href="/organizations" className="text-link">
            Browse directory
            <ArrowUpRight size={15} />
          </Link>
        )}
      </div>
      <form className="search-form" action="/organizations" method="get">
        <div className="search-box">
          <label className="sr-only" htmlFor="directory-search">
            Search organizations or services
          </label>
          <Search size={19} />
          <input
            id="directory-search"
            type="search"
            name="q"
            placeholder="Search an organization or a service…"
            defaultValue={q}
            maxLength={200}
          />
        </div>
        <div className="field">
          <label htmlFor="directory-sector">Sector</label>
          <select id="directory-sector" name="sector" defaultValue={sector}>
            <option value="">All sectors</option>
            {data?.sectors.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="directory-type">Organization type</label>
          <select id="directory-type" name="type" defaultValue={type}>
            <option value="">All organizations</option>
            <option value="PRIVATE">Private companies</option>
            <option value="GOVERNMENT">Public institutions</option>
          </select>
        </div>
        <button className="button" type="submit">
          Search
          <ArrowRight size={16} />
        </button>
      </form>
      {!!data?.sectors.length && (
        <div className="filter-chips" aria-label="Quick sector filters">
          <Link
            className={`chip ${!sector ? "active" : ""}`}
            href={link({ sector: "" })}
          >
            All sectors
          </Link>
          {data.sectors.slice(0, 6).map((s) => (
            <Link
              key={s}
              className={`chip ${sector === s ? "active" : ""}`}
              href={link({ sector: s })}
            >
              {s}
            </Link>
          ))}
        </div>
      )}
      <div className="results-heading">
        <span>
          {data
            ? `${data.total} ${data.total === 1 ? "organization" : "organizations"}${q ? ` matching “${q}”` : " in the directory"}`
            : "Directory availability"}
        </span>
        <span className="hide-mobile">Listed alphabetically</span>
      </div>
      {!data ? (
        <Notice error>
          The directory is temporarily unavailable. Please try again shortly or
          contact the administrator if this continues.
        </Notice>
      ) : data.items.length ? (
        <div className="organization-grid">
          {data.items.map((o) => (
            <OrganizationCard organization={o} key={o.id} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={
            q || sector || type
              ? "No organizations match your search"
              : "The directory is ready for its first organizations"
          }
          description={
            q || sector || type
              ? "Try another name, a broader service term, or remove a filter."
              : "Organizations and their services will appear here after they have been registered by the administrator."
          }
          action={
            q || sector || type ? (
              <Link href="/organizations" className="button secondary small">
                Clear filters
              </Link>
            ) : (
              <Building2 size={20} />
            )
          }
        />
      )}
      {data && data.pages > 1 && (
        <nav className="pagination" aria-label="Directory pages">
          {page > 1 && (
            <Link
              className="button secondary small"
              href={link({ page: String(page - 1) })}
            >
              <ArrowLeft size={14} />
              Previous
            </Link>
          )}
          <span>
            Page {page} of {data.pages}
          </span>
          {page < data.pages && (
            <Link
              className="button secondary small"
              href={link({ page: String(page + 1) })}
            >
              Next
              <ArrowRight size={14} />
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}
