import Link from "next/link";
import { Avatar, Stars, Badge } from "./ui";
import { ApiForm, ActionButton } from "./forms";
import { date } from "@/lib/utils";
import type { Review } from "@/lib/services/reviews";
import type { Viewer } from "@/lib/permissions";
export function ReviewCard({
  review: r,
  user,
  organizationId,
  editable = false,
}: {
  review: Review;
  user: Viewer | null;
  organizationId?: string;
  editable?: boolean;
}) {
  const canReply = user?.memberships.some(
    (m) => m.organization_id === organizationId && m.role === "REPRESENTATIVE",
  );
  return (
    <article className="review-card">
      <div className="review-header">
        <div className="review-author">
          <Avatar name={r.username} url={r.profile_picture_url} />
          <div>
            <strong>{r.username}</strong>
            <p>
              {r.service_name ? (
                <Link href={`/services/${r.service_id}`}>
                  {r.organization_name} · {r.service_name}
                </Link>
              ) : (
                "Consumer review"
              )}
            </p>
          </div>
        </div>
        <time dateTime={new Date(r.created_at).toISOString()}>
          {date(r.created_at)}
        </time>
      </div>
      <div className="mt-3">
        <Stars value={r.stars} />
      </div>
      <p className="review-body">{r.comment}</p>
      {new Date(r.updated_at).getTime() - new Date(r.created_at).getTime() >
        1000 && (
        <span className="muted text-[10px]">Edited {date(r.updated_at)}</span>
      )}
      {r.replies.map((reply) => (
        <div className="review-reply" key={reply.id}>
          <h4>
            {reply.username}
            <Badge tone="green">Organization reply</Badge>
          </h4>
          <p>{reply.body}</p>
          {user?.email_verified_at && (
            <details className="mt-3">
              <summary>Report this reply</summary>
              <ApiForm
                endpoint={`/api/v1/review-replies/${reply.id}/report`}
                compact
                submitLabel="Send report"
                fields={[
                  {
                    name: "reason",
                    label: "Why is this reply inappropriate?",
                    type: "textarea",
                    required: true,
                    minLength: 10,
                    maxLength: 2000,
                  },
                ]}
              />
            </details>
          )}
        </div>
      ))}
      <div className="review-actions">
        {editable && user?.id === r.consumer_id && (
          <>
            <details>
              <summary>Edit your review</summary>
              <ApiForm
                endpoint={`/api/v1/reviews/${r.id}`}
                method="PATCH"
                compact
                submitLabel="Save review"
                defaults={{ stars: r.stars, comment: r.comment }}
                fields={[
                  { name: "stars", label: "Your rating", type: "rating" },
                  {
                    name: "comment",
                    label: "Your experience",
                    type: "textarea",
                    required: true,
                    minLength: 10,
                    maxLength: 10000,
                  },
                ]}
              />
            </details>
            <ActionButton
              endpoint={`/api/v1/reviews/${r.id}`}
              method="DELETE"
              variant="danger"
              confirm="Delete this review? Its rating will be removed and its slot will be freed."
            >
              Delete review
            </ActionButton>
          </>
        )}
        {canReply && (
          <details>
            <summary>Reply as the organization</summary>
            <ApiForm
              endpoint={`/api/v1/reviews/${r.id}/replies`}
              compact
              submitLabel="Post public reply"
              fields={[
                {
                  name: "body",
                  label: "Your organization’s reply",
                  type: "textarea",
                  required: true,
                  minLength: 2,
                  maxLength: 10000,
                  hint: "This reply is public. Do not include private complaint details or personal information.",
                },
              ]}
            />
          </details>
        )}
        {user?.email_verified_at && !editable && (
          <details>
            <summary>Report inappropriate content</summary>
            <ApiForm
              endpoint={`/api/v1/reviews/${r.id}/report`}
              compact
              submitLabel="Send report"
              fields={[
                {
                  name: "reason",
                  label: "Tell us what should be reviewed",
                  type: "textarea",
                  required: true,
                  minLength: 10,
                  maxLength: 2000,
                  hint: "The administrator will review this report. Reporting does not automatically hide content.",
                },
              ]}
            />
          </details>
        )}
      </div>
    </article>
  );
}
