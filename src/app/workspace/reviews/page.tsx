import Link from "next/link";
import { currentUser } from "@/lib/permissions";
import { myReviews } from "@/lib/services/reviews";
import { organizationReviews } from "@/lib/services/workspace";
import { ReviewCard } from "@/components/review";
import { EmptyState, PageTitle } from "@/components/ui";
import { Denied } from "@/components/workspace";
export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const u = (await currentUser())!,
    p = await searchParams,
    org = p.scope === "organization",
    page = Math.max(1, Math.min(Number(p.page) || 1, 10000));
  if (org && !u.memberships.some((m) => m.role === "REPRESENTATIVE"))
    return <Denied />;
  const items = org
    ? await organizationReviews(u, page)
    : await myReviews(u, page);
  return (
    <>
      <PageTitle
        eyebrow={org ? "Organization feedback" : "Your contributions"}
        title={org ? "Reviews & replies" : "My reviews"}
        description={
          org
            ? "Read feedback on your organization’s services and reply publicly."
            : "Edit your feedback or delete a review to free a slot. Creation time determines your latest rating."
        }
      />
      <section className="card">
        {items.length ? (
          items.map((r) => (
            <ReviewCard
              key={r.id}
              review={r}
              user={u}
              organizationId={r.organization_id}
              editable={!org}
            />
          ))
        ) : (
          <EmptyState
            title={
              org
                ? "No public reviews to respond to"
                : "You haven’t reviewed a service yet"
            }
            description={
              org
                ? "Consumer feedback will appear here when reviews are published."
                : "Find a service you have used and share a thoughtful, specific experience."
            }
            action={
              !org && (
                <Link href="/organizations" className="button secondary small">
                  Explore organizations
                </Link>
              )
            }
          />
        )}
      </section>
      {(page > 1 || items.length === 50) && (
        <nav className="pagination" aria-label="Review pages">
          {page > 1 && (
            <Link
              href={`?scope=${org ? "organization" : "consumer"}&page=${page - 1}`}
            >
              Previous
            </Link>
          )}
          {items.length === 50 && (
            <Link
              href={`?scope=${org ? "organization" : "consumer"}&page=${page + 1}`}
            >
              Next
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
