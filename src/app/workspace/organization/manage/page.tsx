import Link from "next/link";
import { currentUser } from "@/lib/permissions";
import { representativeOrganizations } from "@/lib/services/workspace";
import { organizationServices } from "@/lib/services/catalog";
import { ApiForm, type FormField } from "@/components/forms";
import { PageTitle, Badge, EmptyState } from "@/components/ui";
import { Denied } from "@/components/workspace";
const serviceFields: FormField[] = [
  {
    name: "name",
    label: "Service name",
    required: true,
    minLength: 2,
    maxLength: 200,
  },
  {
    name: "description",
    label: "Description",
    type: "textarea",
    maxLength: 10000,
    hint: "Related services can be combined into one listing by describing them together here.",
  },
  { name: "isActive", label: "Active and publicly listed", type: "checkbox" },
];
export default async function ManageOrganizations() {
  const u = (await currentUser())!;
  if (!u.memberships.some((m) => m.role === "REPRESENTATIVE"))
    return <Denied />;
  const orgs = await representativeOrganizations(u);
  const all = await Promise.all(
    orgs.map(async (o) => ({
      org: o,
      services: await organizationServices(o.id, true),
    })),
  );
  return (
    <>
      <PageTitle
        eyebrow="Organization management"
        title="Profiles & services"
        description="Keep organization information useful and services easy to find. Deactivating a service preserves its history."
      />
      {all.length ? (
        <div className="stack">
          {all.map(({ org: o, services }) => (
            <section className="card" key={o.id}>
              <div className="section-heading">
                <div>
                  <h2>{o.name}</h2>
                  <p className="muted">{o.sector}</p>
                </div>
                <Link className="text-link" href={`/organizations/${o.id}`}>
                  Public profile
                </Link>
              </div>
              <details>
                <summary>Edit organization profile</summary>
                <ApiForm
                  endpoint={`/api/v1/organizations/${o.id}`}
                  method="PATCH"
                  defaults={{
                    name: o.name,
                    sector: o.sector,
                    description: o.description || "",
                    contactEmail: o.contact_email || "",
                    contactPhone: o.contact_phone || "",
                    address: o.address || "",
                  }}
                  fields={[
                    {
                      name: "name",
                      label: "Organization name",
                      required: true,
                      minLength: 2,
                      maxLength: 200,
                    },
                    {
                      name: "sector",
                      label: "Sector",
                      required: true,
                      minLength: 2,
                      maxLength: 100,
                    },
                    {
                      name: "description",
                      label: "Description",
                      type: "textarea",
                      maxLength: 10000,
                    },
                    {
                      name: "contactEmail",
                      label: "Public contact email",
                      type: "email",
                    },
                    {
                      name: "contactPhone",
                      label: "Public phone number",
                      maxLength: 40,
                    },
                    {
                      name: "address",
                      label: "Address",
                      type: "textarea",
                      maxLength: 1000,
                    },
                  ]}
                />
              </details>
              <div className="section-heading mt-8">
                <h3>Service listings</h3>
                <span className="muted text-xs">{services.length} total</span>
              </div>
              <div className="service-management">
                {services.map((s) => (
                  <article className="card !bg-[#f8faf4]" key={s.id}>
                    <div className="flex justify-between gap-3">
                      <h3>{s.name}</h3>
                      <Badge tone={s.is_active ? "green" : "neutral"}>
                        {s.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <details className="mt-5">
                      <summary>Edit this service</summary>
                      <ApiForm
                        endpoint={`/api/v1/services/${s.id}`}
                        method="PATCH"
                        defaults={{
                          name: s.name,
                          description: s.description || "",
                          isActive: s.is_active,
                        }}
                        fields={serviceFields}
                      />
                    </details>
                  </article>
                ))}
                <article className="card !border-dashed">
                  <h3>Add a service</h3>
                  <details className="mt-5">
                    <summary>Create a separate or combined listing</summary>
                    <ApiForm
                      endpoint={`/api/v1/organizations/${o.id}/services`}
                      submitLabel="Add service"
                      defaults={{ isActive: true }}
                      fields={serviceFields}
                    />
                  </details>
                </article>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No active organizations"
          description="Your administrator needs to assign an active representative membership."
        />
      )}
    </>
  );
}
