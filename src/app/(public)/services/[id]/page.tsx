import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, LockKeyhole } from "lucide-react";
import { getService } from "@/lib/services/catalog";
import { publicServiceReviews } from "@/lib/services/reviews";
import { currentUser } from "@/lib/permissions";
import { uuid } from "@/lib/validation";
import { Badge, EmptyState, Notice, PageTitle, Rating } from "@/components/ui";
import { ApiForm } from "@/components/forms";
import { ReviewCard } from "@/components/review";
export default async function ServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const service = await getService(id);
  if (!service) notFound();
  const s = await searchParams,
    page = Math.max(1, Math.min(Number(s.page) || 1, 10000)),
    sort = s.sort || "recent",
    stars = Number(s.stars) || undefined;
  const [reviews, user] = await Promise.all([
    publicServiceReviews(id, page, sort, stars),
    currentUser(),
  ]);
  return (
    <div className="container">
      <div className="breadcrumb">
        <Link href="/organizations">Organizations</Link>
        <span>/</span>
        <Link href={`/organizations/${service.organization_id}`}>
          {service.organization_name}
        </Link>
        <span>/</span>
        <span>Service</span>
      </div>
      <PageTitle
        eyebrow={service.organization_name}
        title={service.name}
        description={
          service.description ||
          "Read consumer experiences and share feedback about this service."
        }
        action={<Badge>{service.sector}</Badge>}
      />
      <div className="two-column">
        <div className="stack">
          <section className="card">
            <div className="section-heading">
              <div>
                <h2>Consumer reviews</h2>
                <p className="muted">
                  The latest active rating from each consumer contributes to the
                  average.
                </p>
              </div>
              <Rating
                average={service.average_rating}
                count={service.reviewer_count}
              />
            </div>
            <form method="get" className="search-form mb-6">
              <div className="field">
                <label htmlFor="sort-reviews">Sort reviews</label>
                <select id="sort-reviews" name="sort" defaultValue={sort}>
                  <option value="recent">Most recent</option>
                  <option value="highest">Highest rating</option>
                  <option value="lowest">Lowest rating</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="filter-stars">Rating</label>
                <select
                  id="filter-stars"
                  name="stars"
                  defaultValue={s.stars || ""}
                >
                  <option value="">All ratings</option>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option value={n} key={n}>
                      {n} stars
                    </option>
                  ))}
                </select>
              </div>
              <button className="button secondary small">Apply</button>
            </form>
            {reviews.length ? (
              reviews.map((r) => (
                <ReviewCard
                  key={r.id}
                  review={r}
                  user={user}
                  organizationId={service.organization_id}
                />
              ))
            ) : (
              <EmptyState
                title={stars ? "No reviews with this rating" : "No reviews yet"}
                description={
                  stars
                    ? "Choose a different rating filter to see more experiences."
                    : "Have you used this service? Share a thoughtful review to help others understand the experience."
                }
              />
            )}
            <nav className="pagination" aria-label="Review pages">
              {page > 1 && (
                <Link
                  href={`?sort=${sort}&stars=${stars || ""}&page=${page - 1}`}
                  className="text-link"
                >
                  Previous
                </Link>
              )}
              {reviews.length === 20 && (
                <Link
                  href={`?sort=${sort}&stars=${stars || ""}&page=${page + 1}`}
                  className="text-link"
                >
                  Next reviews
                </Link>
              )}
            </nav>
          </section>
          <section className="card" id="write-review">
            <h2>How was your experience?</h2>
            <p className="muted">
              Be specific, respectful, and helpful. Your username and profile
              picture are public.
            </p>
            {!user ? (
              <Notice>
                <Link href="/login">Sign in</Link> or{" "}
                <Link href="/register">create an account</Link> to write a
                review.
              </Notice>
            ) : !user.email_verified_at ? (
              <Notice>
                <Link href="/verify-email">Verify your email</Link> before
                posting a review.
              </Notice>
            ) : (
              <ApiForm
                endpoint={`/api/v1/services/${id}/reviews`}
                submitLabel="Publish review"
                fields={[
                  { name: "stars", label: "Your rating", type: "rating" },
                  {
                    name: "comment",
                    label: "Tell us about the service",
                    type: "textarea",
                    placeholder: "What went well? What could have been better?",
                    required: true,
                    minLength: 10,
                    maxLength: 10000,
                    hint: "You can retain two reviews for this service in a rolling three-calendar-month period. Editing keeps the original creation date. Deleting frees a slot.",
                  },
                ]}
              />
            )}
          </section>
        </div>
        <aside className="stack">
          <section className="card">
            <LockKeyhole size={23} className="mb-4" />
            <h2>Need a problem addressed?</h2>
            <p className="muted">
              A private complaint goes to the organization and its assigned
              assessor. Your complaint and evidence are not published.
            </p>
            {service.accepts_complaints ? (
              <Link
                href={`/workspace/complaints/new?service=${id}`}
                className="button w-full"
              >
                Report a problem
                <ArrowUpRight size={15} />
              </Link>
            ) : (
              <Notice>
                This organization needs an active assessing authority before
                complaints can be submitted.
              </Notice>
            )}
            <p className="muted text-[10px] mt-4">
              The organization has 72 hours to provide its first response. Only
              you can confirm a proposed resolution.
            </p>
          </section>
          <section className="card">
            <h3>About the ratings</h3>
            <p className="muted text-xs mt-3">
              A verified email confirms mailbox access. Reviews reflect
              individual experiences and are not verified purchases or official
              compliance findings.
            </p>
            <Link
              className="text-link mt-5"
              href={`/organizations/${service.organization_id}`}
            >
              View organization
              <ArrowUpRight size={14} />
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
