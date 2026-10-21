import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Sprout } from "lucide-react";
import { currentUser } from "@/lib/permissions";
import { dashboardStats } from "@/lib/services/workspace";
import { listComplaints } from "@/lib/services/complaints";
import { PageTitle, Notice } from "@/components/ui";
import { ComplaintTable, StatCards } from "@/components/workspace";
export default async function Dashboard() {
  const user = (await currentUser())!;
  if (user.is_super_admin) redirect("/workspace/admin");
  const [stats, complaints] = await Promise.all([
    dashboardStats(user),
    listComplaints(user, "consumer"),
  ]);
  return (
    <>
      <PageTitle
        eyebrow="Your voice, your workspace"
        title={`Hello, ${user.username}.`}
        description="Follow your feedback, keep conversations moving, and make your experience count."
        action={
          <Link href="/organizations" className="button small">
            Find a service
            <ArrowRight size={15} />
          </Link>
        }
      />
      {!user.email_verified_at && (
        <Notice>
          <Link href="/verify-email">Verify your email</Link> to publish reviews
          and submit private complaints.
        </Notice>
      )}
      <div className="dashboard-welcome">
        <div>
          <h2>A little feedback can go a long way.</h2>
          <p>
            Share a public review to help others, or open a private complaint
            when you need the organization and its assessor to address a
            problem.
          </p>
        </div>
        <Sprout size={46} />
      </div>
      <StatCards
        cards={[
          {
            label: "Your active reviews",
            value: stats!.reviews,
            note: "Your retained public feedback",
          },
          {
            label: "Pending complaints",
            value: stats!.pending,
            note: "Awaiting response or your confirmation",
            type: "pending",
          },
          {
            label: "Resolved complaints",
            value: stats!.resolved,
            note: "Solutions you have confirmed",
            type: "resolved",
          },
        ]}
      />
      <section className="card">
        <div className="section-heading">
          <div>
            <h2>Recent complaints</h2>
            <p className="muted">
              Your private conversations and their next steps.
            </p>
          </div>
          <Link href="/workspace/complaints" className="text-link">
            View all
            <ArrowRight size={15} />
          </Link>
        </div>
        <ComplaintTable items={complaints.slice(0, 5)} />
      </section>
    </>
  );
}
