import Link from "next/link";
import { Building2 } from "lucide-react";
import { currentUser } from "@/lib/permissions";
import { dashboardStats } from "@/lib/services/workspace";
import { listComplaints } from "@/lib/services/complaints";
import { PageTitle } from "@/components/ui";
import { ComplaintTable, Denied, StatCards } from "@/components/workspace";
export default async function OrganizationDashboard() {
  const u = (await currentUser())!;
  if (!u.memberships.some((m) => m.role === "REPRESENTATIVE"))
    return <Denied />;
  const [stats, complaints] = await Promise.all([
    dashboardStats(u, "organization"),
    listComplaints(u, "organization"),
  ]);
  return (
    <>
      <PageTitle
        eyebrow="Organization workspace"
        title="Service starts with listening."
        description="See what needs attention and keep your organization’s conversations moving."
        action={
          <Link className="button small" href="/workspace/organization/manage">
            Manage services
          </Link>
        }
      />
      <div className="dashboard-welcome">
        <div>
          <h2>Respond early. Make the next step clear.</h2>
          <p>
            The first organization response is due within 72 elapsed hours. A
            resolution proposal stays pending until the consumer confirms it.
          </p>
        </div>
        <Building2 size={43} />
      </div>
      <StatCards
        cards={[
          {
            label: "Pending complaints",
            value: stats!.pending,
            note: "Awaiting a response or confirmation",
            type: "pending",
          },
          {
            label: "First responses overdue",
            value: stats!.overdue,
            note: "Pending and past the 72-hour deadline",
            type: "pending",
          },
          {
            label: "Confirmed resolutions",
            value: stats!.resolved,
            note: "Confirmed by the submitting consumers",
            type: "resolved",
          },
        ]}
      />
      <section className="card">
        <div className="section-heading">
          <div>
            <h2>Complaint inbox</h2>
            <p className="muted">
              Recent complaints against the organizations you represent.
            </p>
          </div>
          <Link
            className="text-link"
            href="/workspace/complaints?scope=organization"
          >
            View all
          </Link>
        </div>
        <ComplaintTable
          items={complaints.slice(0, 6)}
          emptyTitle="No complaints in your inbox"
          emptyDescription="Complaints against the organizations you represent will appear here."
        />
      </section>
    </>
  );
}
