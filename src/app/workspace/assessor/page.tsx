import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { currentUser } from "@/lib/permissions";
import { dashboardStats } from "@/lib/services/workspace";
import { listComplaints } from "@/lib/services/complaints";
import { PageTitle } from "@/components/ui";
import { ComplaintTable, Denied, StatCards } from "@/components/workspace";
export default async function AssessorDashboard() {
  const u = (await currentUser())!;
  if (!u.memberships.some((m) => m.role === "ASSESSOR")) return <Denied />;
  const [stats, items] = await Promise.all([
    dashboardStats(u, "assessor"),
    listComplaints(u, "assessor", "overdue"),
  ]);
  return (
    <>
      <PageTitle
        eyebrow="Assessment workspace"
        title="Clear oversight. Informed follow-up."
        description="Inspect evidence, request information, and record your findings in each complaint discussion."
        action={
          <Link
            href="/workspace/assessor/organizations"
            className="button small"
          >
            Assigned organizations
          </Link>
        }
      />
      <div className="dashboard-welcome">
        <div>
          <h2>Give unanswered reports the attention they need.</h2>
          <p>
            An assessor’s message does not satisfy the organization’s
            first-response deadline. Your findings remain part of the private
            discussion.
          </p>
        </div>
        <ShieldCheck size={44} />
      </div>
      <StatCards
        cards={[
          {
            label: "Assigned complaints",
            value: stats!.total,
            note: "Routed to your assessing authorities",
          },
          {
            label: "Unanswered and overdue",
            value: stats!.overdue,
            note: "No organization response within 72 hours",
            type: "pending",
          },
          {
            label: "Consumer-confirmed resolutions",
            value: stats!.resolved,
            note: "Closed by the submitting consumers",
            type: "resolved",
          },
        ]}
      />
      <section className="card">
        <div className="section-heading">
          <div>
            <h2>Needs follow-up</h2>
            <p className="muted">
              Pending reports with an overdue organization response.
            </p>
          </div>
          <Link
            href="/workspace/complaints?scope=assessor&filter=overdue"
            className="text-link"
          >
            View all
          </Link>
        </div>
        <ComplaintTable
          items={items.slice(0, 6)}
          emptyTitle="No unanswered overdue reports"
          emptyDescription="Reports that pass the 72-hour first-response deadline will appear here."
        />
      </section>
    </>
  );
}
