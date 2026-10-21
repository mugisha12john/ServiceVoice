import Link from "next/link";
import { currentUser } from "@/lib/permissions";
import { listComplaints } from "@/lib/services/complaints";
import { PageTitle } from "@/components/ui";
import { ComplaintTable, Denied } from "@/components/workspace";
export default async function ComplaintsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const u = (await currentUser())!,
    s = await searchParams,
    scope =
      s.scope === "organization"
        ? "organization"
        : s.scope === "assessor"
          ? "assessor"
          : "consumer",
    filter = s.filter || "all",
    page = Math.max(1, Math.min(Number(s.page) || 1, 10000));
  if (
    scope !== "consumer" &&
    !u.memberships.some(
      (m) =>
        m.role === (scope === "organization" ? "REPRESENTATIVE" : "ASSESSOR"),
    )
  )
    return <Denied />;
  const items = await listComplaints(u, scope, filter, page);
  const link = (f: string, p = 1) => `?scope=${scope}&filter=${f}&page=${p}`;
  return (
    <>
      <PageTitle
        eyebrow={
          scope === "consumer"
            ? "Private reporting"
            : scope === "assessor"
              ? "Assessment workspace"
              : "Organization workspace"
        }
        title={
          scope === "consumer"
            ? "My complaints"
            : scope === "assessor"
              ? "Assigned complaints"
              : "Complaint inbox"
        }
        description={
          scope === "consumer"
            ? "Follow discussions, add evidence, and confirm a proposed resolution."
            : "Review private reports and keep the next steps clear for everyone involved."
        }
        action={
          scope === "consumer" && (
            <Link href="/workspace/complaints/new" className="button small">
              Report a problem
            </Link>
          )
        }
      />
      <nav className="tabs" aria-label="Complaint filters">
        {[
          ["all", "All complaints"],
          ["pending", "Pending"],
          ["overdue", "Response overdue"],
          ["resolved", "Resolved"],
        ].map(([f, label]) => (
          <Link
            href={link(f)}
            key={f}
            className={`tab ${filter === f ? "active" : ""}`}
            aria-current={filter === f ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <section className="card">
        <ComplaintTable
          items={items}
          emptyTitle={
            filter === "overdue"
              ? "No unanswered overdue complaints"
              : "No complaints in this view"
          }
          emptyDescription={
            filter === "overdue"
              ? "There are no pending complaints awaiting the organization’s first response beyond 72 hours."
              : "Complaints you are authorized to view will appear here."
          }
        />
      </section>
      {(page > 1 || items.length === 50) && (
        <nav className="pagination" aria-label="Complaint pages">
          {page > 1 && <Link href={link(filter, page - 1)}>Previous</Link>}
          <span>Page {page}</span>
          {items.length === 50 && (
            <Link href={link(filter, page + 1)}>Next</Link>
          )}
        </nav>
      )}
    </>
  );
}
