import "server-only";
import { sql } from "drizzle-orm";
import { one, query } from "../db";
import { AppError } from "../errors";
import { requireRepresentative, type Viewer } from "../permissions";
import { bodyInput, reviewInput, reportInput } from "../validation";
import { rateLimit } from "../security";
export type Reply = {
  id: string;
  body: string;
  organization_name: string;
  created_at: string;
};
export type Review = {
  id: string;
  service_id: string;
  consumer_id: string;
  username: string;
  profile_picture_url: string | null;
  stars: number;
  comment: string;
  created_at: Date;
  updated_at: Date;
  replies: Reply[];
  service_name?: string;
  organization_name?: string;
  organization_id?: string;
};
export async function publicServiceReviews(
  id: string,
  page = 1,
  sort = "recent",
  stars?: number,
) {
  const order =
    sort === "highest"
      ? sql`r.stars DESC,r.created_at DESC,r.id DESC`
      : sort === "lowest"
        ? sql`r.stars ASC,r.created_at DESC,r.id DESC`
        : sql`r.created_at DESC,r.id DESC`;
  return query<Review>(
    sql`SELECT r.*,coalesce((SELECT json_agg(json_build_object('id',p.id,'body',p.body,'organization_name',o.name,'created_at',p.created_at) ORDER BY p.created_at,p.id) FROM company_feedback.review_replies p WHERE p.review_id=r.id AND NOT EXISTS(SELECT 1 FROM company_feedback.public_content_reports f WHERE f.reply_id=p.id AND f.status='HIDDEN')),'[]'::json) AS replies FROM company_feedback.public_reviews r JOIN company_feedback.services s ON s.id=r.service_id JOIN company_feedback.organizations o ON o.id=s.organization_id WHERE r.service_id=${id} AND (${stars || 0}=0 OR r.stars=${stars || 0}) AND NOT EXISTS(SELECT 1 FROM company_feedback.public_content_reports f WHERE f.review_id=r.id AND f.status='HIDDEN') ORDER BY ${order} LIMIT 20 OFFSET ${(Math.max(1, page) - 1) * 20}`,
  );
}
export async function createReview(u: Viewer, serviceId: string, raw: unknown) {
  const i = reviewInput.parse(raw);
  if (!u.email_verified_at)
    throw new AppError(403, "Verify your email before posting a review.");
  return (await one<{ id: string }>(
    sql`INSERT INTO company_feedback.reviews(consumer_id,service_id,stars,comment) VALUES (${u.id},${serviceId},${i.stars},${i.comment}) RETURNING id`,
  ))!;
}
export async function editReview(u: Viewer, id: string, raw: unknown) {
  const i = reviewInput.parse(raw);
  const row = await one<{ id: string }>(
    sql`UPDATE company_feedback.reviews SET stars=${i.stars},comment=${i.comment} WHERE id=${id} AND consumer_id=${u.id} AND deleted_at IS NULL RETURNING id`,
  );
  if (!row)
    throw new AppError(
      404,
      "This review is unavailable or does not belong to you.",
    );
  return {
    message:
      "Review updated. Its original creation date still determines your latest rating.",
  };
}
export async function deleteReview(u: Viewer, id: string) {
  const row = await one<{ id: string }>(
    sql`UPDATE company_feedback.reviews SET deleted_at=statement_timestamp() WHERE id=${id} AND consumer_id=${u.id} AND deleted_at IS NULL RETURNING id`,
  );
  if (!row)
    throw new AppError(
      404,
      "This review is unavailable or does not belong to you.",
    );
  return {
    message:
      "Review deleted. Its slot is available, and your newest remaining rating now contributes to the average.",
  };
}
export async function replyToReview(u: Viewer, id: string, raw: unknown) {
  const i = bodyInput.parse(raw);
  const row = await one<{ organization_id: string }>(
    sql`SELECT s.organization_id FROM company_feedback.reviews r JOIN company_feedback.services s ON s.id=r.service_id WHERE r.id=${id} AND r.deleted_at IS NULL`,
  );
  if (!row) throw new AppError(404, "Review not found.");
  await requireRepresentative(u, row.organization_id);
  await query(
    sql`INSERT INTO company_feedback.review_replies(review_id,author_id,body) VALUES (${id},${u.id},${i.body})`,
  );
  return { message: "Your public reply has been posted." };
}
export async function myReviews(u: Viewer, page = 1) {
  return query<Review>(
    sql`SELECT r.id,r.service_id,r.consumer_id,${u.username}::text AS username,${u.profile_picture_url}::text AS profile_picture_url,r.stars,r.comment,r.created_at,r.updated_at,s.name AS service_name,o.name AS organization_name,'[]'::json AS replies FROM company_feedback.reviews r JOIN company_feedback.services s ON s.id=r.service_id JOIN company_feedback.organizations o ON o.id=s.organization_id WHERE r.consumer_id=${u.id} AND r.deleted_at IS NULL ORDER BY r.created_at DESC,r.id DESC LIMIT 50 OFFSET ${(page - 1) * 50}`,
  );
}
export async function reportContent(
  u: Viewer,
  id: string,
  kind: "review" | "reply",
  raw: unknown,
) {
  const i = reportInput.parse(raw);
  await rateLimit(`content-report:${u.id}`, 10, 3600);
  if (kind === "review")
    await query(
      sql`INSERT INTO company_feedback.public_content_reports(review_id,reported_by,reason) VALUES (${id},${u.id},${i.reason})`,
    );
  else
    await query(
      sql`INSERT INTO company_feedback.public_content_reports(reply_id,reported_by,reason) VALUES (${id},${u.id},${i.reason})`,
    );
  return { message: "Your report has been sent for administrator review." };
}
