import "server-only";
import { sql } from "drizzle-orm";
import { one, query } from "../db";
import type { Viewer } from "../permissions";
import type { Organization } from "./catalog";
import type { Review } from "./reviews";
export async function dashboardStats(u: Viewer, scope = "consumer") {
  const role =
    scope === "organization"
      ? sql`company_feedback.is_org_representative(${u.id}::uuid,s.organization_id)`
      : scope === "assessor"
        ? sql`EXISTS(SELECT 1 FROM company_feedback.memberships m WHERE m.user_id=${u.id} AND m.organization_id=a.authority_id AND m.role='ASSESSOR' AND m.is_active)`
        : sql`c.consumer_id=${u.id}`;
  return one<{
    total: number;
    pending: number;
    resolved: number;
    overdue: number;
    reviews: number;
  }>(
    sql`SELECT count(*)::int AS total,count(*) FILTER(WHERE c.status='PENDING')::int AS pending,count(*) FILTER(WHERE c.status='RESOLVED')::int AS resolved,count(*) FILTER(WHERE c.status='PENDING' AND c.first_response_at IS NULL AND c.response_due_at<=statement_timestamp())::int AS overdue,(SELECT count(*)::int FROM company_feedback.reviews WHERE consumer_id=${u.id} AND deleted_at IS NULL) AS reviews FROM company_feedback.complaints c JOIN company_feedback.services s ON s.id=c.service_id JOIN company_feedback.assessor_assignments a ON a.id=c.assignment_id WHERE company_feedback.is_complaint_participant(${u.id}::uuid,c.id) AND ${role}`,
  );
}
export async function representativeOrganizations(u: Viewer) {
  return query<Organization>(
    sql`SELECT o.*,(SELECT count(*)::int FROM company_feedback.services s WHERE s.organization_id=o.id AND s.is_active) AS service_count FROM company_feedback.organizations o WHERE o.is_active AND company_feedback.is_org_representative(${u.id}::uuid,o.id) ORDER BY o.name`,
  );
}
export async function assignedOrganizations(u: Viewer) {
  return query<Organization & { authority_name: string }>(
    sql`SELECT DISTINCT o.*,(SELECT count(*)::int FROM company_feedback.services s WHERE s.organization_id=o.id AND s.is_active) AS service_count,authority.name AS authority_name FROM company_feedback.assessor_assignments a JOIN company_feedback.organizations o ON o.id=a.organization_id JOIN company_feedback.organizations authority ON authority.id=a.authority_id JOIN company_feedback.memberships m ON m.organization_id=a.authority_id WHERE m.user_id=${u.id} AND m.role='ASSESSOR' AND m.is_active AND authority.is_active AND a.ended_at IS NULL ORDER BY o.name`,
  );
}
export async function organizationReviews(u: Viewer, page = 1) {
  return query<Review>(
    sql`SELECT r.*,s.organization_id,s.name AS service_name,o.name AS organization_name,coalesce((SELECT json_agg(json_build_object('id',p.id,'body',p.body,'organization_name',o.name,'created_at',p.created_at) ORDER BY p.created_at,p.id) FROM company_feedback.review_replies p WHERE p.review_id=r.id),'[]'::json) AS replies FROM company_feedback.public_reviews r JOIN company_feedback.services s ON s.id=r.service_id JOIN company_feedback.organizations o ON o.id=s.organization_id WHERE company_feedback.is_org_representative(${u.id}::uuid,o.id) ORDER BY r.created_at DESC,r.id DESC LIMIT 50 OFFSET ${(page - 1) * 50}`,
  );
}
