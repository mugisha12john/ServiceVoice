import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, MapPin, Mail, Phone, Building2 } from "lucide-react";
import { getOrganization, organizationServices } from "@/lib/services/catalog";
import { uuid } from "@/lib/validation";
import { Badge, EmptyState, Rating, PageTitle } from "@/components/ui";
export default async function OrganizationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const org = await getOrganization(id);
  if (!org) notFound();
  const services = await organizationServices(id);
  return (
    <div className="container">
      <div className="breadcrumb">
        <Link href="/organizations">Organizations</Link>
        <span>/</span>
        <span>{org.name}</span>
      </div>
      <PageTitle
        eyebrow={org.sector}
        title={org.name}
        description={
          org.description ||
          "Explore the services offered by this organization."
        }
        action={
          <Badge tone="green">
            {org.organization_type === "GOVERNMENT"
              ? "Public institution"
              : "Private company"}
          </Badge>
        }
      />
      <div className="two-column">
        <section>
          <div className="section-heading">
            <h2>Services</h2>
            <span className="muted text-xs">{services.length} listed</span>
          </div>
          {services.length ? (
            <div className="service-list">
              {services.map((s) => (
                <article className="service-card" key={s.id}>
                  <Building2 size={19} className="muted" />
                  <h3>
                    <Link href={`/services/${s.id}`}>{s.name}</Link>
                  </h3>
                  <p>
                    {s.description ||
                      "Read public feedback or share your experience with this service."}
                  </p>
                  <div className="service-card-footer">
                    <Rating
                      average={s.average_rating}
                      count={s.reviewer_count}
                    />
                    <Link
                      className="text-link"
                      href={`/services/${s.id}`}
                      aria-label={`View ${s.name}`}
                    >
                      <ArrowRight size={17} />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No services listed yet"
              description="This organization has not published any active services."
            />
          )}
        </section>
        <aside className="card">
          <h2>Organization details</h2>
          <dl className="meta-list mt-6">
            <div>
              <dt>Sector</dt>
              <dd>{org.sector}</dd>
            </div>
            {org.can_assess && (
              <div>
                <dt>Role</dt>
                <dd>Registered assessing authority</dd>
              </div>
            )}
            {org.address && (
              <div>
                <dt className="flex items-center gap-1">
                  <MapPin size={12} />
                  Address
                </dt>
                <dd>{org.address}</dd>
              </div>
            )}
            {org.contact_email && (
              <div>
                <dt className="flex items-center gap-1">
                  <Mail size={12} />
                  Contact email
                </dt>
                <dd>
                  <a href={`mailto:${org.contact_email}`}>
                    {org.contact_email}
                  </a>
                </dd>
              </div>
            )}
            {org.contact_phone && (
              <div>
                <dt className="flex items-center gap-1">
                  <Phone size={12} />
                  Telephone
                </dt>
                <dd>{org.contact_phone}</dd>
              </div>
            )}
          </dl>
          <p className="muted text-xs mt-6">
            Reviews are written about specific services. Select a service to
            read feedback or report a problem.
          </p>
        </aside>
      </div>
    </div>
  );
}
