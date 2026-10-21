import Link from "next/link";
import { currentUser } from "@/lib/permissions";
import { assignedOrganizations } from "@/lib/services/workspace";
import { PageTitle, EmptyState, Badge, Notice } from "@/components/ui";
import { Denied } from "@/components/workspace";
export default async function AssessorOrganizations() {
  const u = (await currentUser())!;
  if (!u.memberships.some((m) => m.role === "ASSESSOR")) return <Denied />;
  const orgs = await assignedOrganizations(u);
  return (
    <>
      <PageTitle
        eyebrow="Assessment coverage"
        title="Assigned organizations"
        description="Organizations currently assigned to the assessing authorities you belong to."
      />
      <Notice>
        Existing complaints retain their original authority when assignments
        change. Those reports remain available in your assigned complaint inbox.
      </Notice>
      {orgs.length ? (
        <div className="organization-grid">
          {orgs.map((o) => (
            <article className="organization-card" key={o.id}>
              <div className="org-card-top">
                <span className="org-initials">
                  {o.name.slice(0, 2).toUpperCase()}
                </span>
                <Badge tone="green">Current assignment</Badge>
              </div>
              <h3>{o.name}</h3>
              <p className="sector">
                {o.sector} · {o.authority_name}
              </p>
              <p className="description">
                {o.description ||
                  "View this organization’s services and public feedback."}
              </p>
              <Link
                href={`/organizations/${o.id}`}
                className="text-link mt-auto"
              >
                View organization →
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No current organization assignments"
          description="The administrator can assign an organization to your assessing authority."
        />
      )}
    </>
  );
}
