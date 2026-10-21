import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Download, LockKeyhole } from "lucide-react";
import { currentUser } from "@/lib/permissions";
import { complaintDetail } from "@/lib/services/complaints";
import { storageConfigured } from "@/lib/storage";
import { uuid } from "@/lib/validation";
import { AppError } from "@/lib/errors";
import { reference, date, datetime } from "@/lib/utils";
import { PageTitle, Badge, Notice, Avatar } from "@/components/ui";
import { Denied } from "@/components/workspace";
import { ApiForm, ActionButton, EvidenceUpload } from "@/components/forms";
export default async function ComplaintDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const u = (await currentUser())!;
  let data: Awaited<ReturnType<typeof complaintDetail>>;
  try {
    data = await complaintDetail(u, id);
  } catch (e) {
    if (e instanceof AppError && [403, 404].includes(e.status))
      return (
        <div className="section">
          <Denied message="Private complaint access is limited to its consumer, the organization’s active representatives, and its originally assigned authority’s active assessors." />
        </div>
      );
    throw e;
  }
  const { complaint: c, messages, attachments, proposals } = data,
    representative = u.memberships.some(
      (m) =>
        m.organization_id === c.organization_id && m.role === "REPRESENTATIVE",
    ),
    consumer = u.id === c.consumer_id;
  return (
    <>
      <div className="breadcrumb">
        <Link href="/workspace/complaints">Complaints</Link>
        <span>/</span>
        <span>{reference(c.reference_number)}</span>
      </div>
      <PageTitle
        eyebrow="Private complaint"
        title={reference(c.reference_number)}
        description={`${c.organization_name} · ${c.service_name}`}
        action={
          <Badge tone={c.status === "RESOLVED" ? "green" : "amber"}>
            {c.status === "RESOLVED" ? "Resolved" : "Pending"}
          </Badge>
        }
      />
      {c.overdue && (
        <Notice error>
          The organization’s 72-hour first-response deadline has passed. This
          complaint remains pending. An assessor’s message does not count as the
          organization’s response.
        </Notice>
      )}
      <div className="detail-grid">
        <div className="stack">
          <section className="card">
            <div className="section-heading">
              <h2>The reported problem</h2>
              <LockKeyhole size={16} className="muted" />
            </div>
            <p className="detail-description">{c.description}</p>
            <p className="muted text-[10px] mt-4">
              Submitted {datetime(c.submitted_at)}
            </p>
          </section>
          <section className="card">
            <h2>Discussion</h2>
            <p className="muted">
              A shared private conversation with the consumer, organization, and
              assigned assessor.
            </p>
            {messages.length ? (
              messages.map((m) => (
                <article className="discussion-item" key={m.id}>
                  <div className="review-header">
                    <div className="review-author">
                      <Avatar name={m.username} />
                      <div>
                        <strong>{m.username}</strong>
                        <p>{m.author_role}</p>
                      </div>
                    </div>
                    <time>{datetime(m.created_at)}</time>
                  </div>
                  <p>{m.body}</p>
                </article>
              ))
            ) : (
              <p className="muted text-xs py-6">
                No responses yet. New messages and assessment findings will
                appear here.
              </p>
            )}
            {c.status === "PENDING" ? (
              <div className="discussion-compose">
                <ApiForm
                  endpoint={`/api/v1/complaints/${id}/messages`}
                  submitLabel="Send private response"
                  fields={[
                    {
                      name: "body",
                      label: "Your response",
                      type: "textarea",
                      required: true,
                      minLength: 2,
                      maxLength: 10000,
                      placeholder: consumer
                        ? "Add information or respond to a question…"
                        : representative
                          ? "Acknowledge the issue and explain the next steps…"
                          : "Record findings, request information, or follow up…",
                      hint: "Visible only to the authorized participants of this complaint.",
                    },
                  ]}
                />
              </div>
            ) : (
              <Notice>
                This complaint has been resolved. The conversation is retained
                for reference.
              </Notice>
            )}
          </section>
          <section className="card">
            <h2>Resolution proposals</h2>
            <p className="muted">
              The organization proposes a solution. Only the submitting consumer
              can confirm it.
            </p>
            {proposals.length ? (
              proposals.map((p) => (
                <article className="proposal" key={p.id}>
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-xs">
                      Proposed by {p.username}
                    </strong>
                    <Badge tone={p.confirmed_at ? "green" : "neutral"}>
                      {p.confirmed_at ? "Confirmed" : "Awaiting confirmation"}
                    </Badge>
                  </div>
                  <p>{p.description}</p>
                  <span className="text-[10px] muted">
                    {date(p.proposed_at)}
                  </span>
                  {consumer && c.status === "PENDING" && !p.confirmed_at && (
                    <div className="mt-4">
                      <ActionButton
                        endpoint={`/api/v1/resolution-proposals/${p.id}/confirm`}
                        variant="primary"
                        confirm="Confirm that this proposed solution resolves your complaint? This closes the complaint as resolved."
                      >
                        Confirm this resolves my complaint
                      </ActionButton>
                    </div>
                  )}
                </article>
              ))
            ) : (
              <p className="muted text-xs py-5">
                No solution has been proposed yet.
              </p>
            )}
            {representative && c.status === "PENDING" && (
              <details className="mt-5">
                <summary>Propose a resolution</summary>
                <ApiForm
                  endpoint={`/api/v1/complaints/${id}/resolution-proposals`}
                  submitLabel="Send proposed resolution"
                  fields={[
                    {
                      name: "description",
                      label: "Your proposed solution",
                      type: "textarea",
                      required: true,
                      minLength: 20,
                      maxLength: 20000,
                      hint: "Submitting a proposal does not resolve the complaint. The consumer must confirm it.",
                    },
                  ]}
                />
              </details>
            )}
          </section>
        </div>
        <aside className="stack">
          <section className="card">
            <h2>Complaint details</h2>
            <dl className="meta-list mt-6">
              <div>
                <dt>Organization</dt>
                <dd>{c.organization_name}</dd>
              </div>
              <div>
                <dt>Service</dt>
                <dd>{c.service_name}</dd>
              </div>
              <div>
                <dt>Assigned assessing authority</dt>
                <dd>{c.authority_name}</dd>
              </div>
              <div>
                <dt>First-response deadline</dt>
                <dd>{datetime(c.response_due_at)}</dd>
              </div>
              <div>
                <dt>First organization response</dt>
                <dd>
                  {c.first_response_at
                    ? datetime(c.first_response_at)
                    : "Awaiting organization response"}
                </dd>
              </div>
              {c.resolved_at && (
                <div>
                  <dt>Resolved by consumer confirmation</dt>
                  <dd>{datetime(c.resolved_at)}</dd>
                </div>
              )}
            </dl>
          </section>
          <section className="card">
            <h2>Private evidence</h2>
            <p className="muted">
              Files are available only to authorized participants.
            </p>
            <div className="evidence-list">
              {attachments.map((a) => (
                <a
                  key={a.id}
                  href={`/api/v1/complaints/${id}/attachments/${a.id}`}
                >
                  <FileText size={17} />
                  <span>
                    {a.original_filename}
                    <small>
                      {(Number(a.size_bytes) / 1024).toFixed(0)} KB ·{" "}
                      {date(a.created_at)}
                    </small>
                  </span>
                  <Download size={14} />
                </a>
              ))}
            </div>
            {!attachments.length && (
              <p className="muted text-xs">No evidence files attached.</p>
            )}
            {storageConfigured() ? (
              <EvidenceUpload complaintId={id} />
            ) : (
              <div className="mt-5">
                <Notice>
                  Private file storage is not configured. Evidence uploads are
                  currently unavailable.
                </Notice>
              </div>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
