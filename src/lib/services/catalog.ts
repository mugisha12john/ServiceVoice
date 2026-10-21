import "server-only";
import { sql } from "drizzle-orm";
import { one, query } from "../db";
import { AppError } from "../errors";
import { requireRepresentative, type Viewer } from "../permissions";
import { organizationProfileInput, serviceInput } from "../validation";
export type Organization = {
  id: string;
  name: string;
  sector: string;
  organization_type: string;
  can_assess: boolean;
  description: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  is_active: boolean;
  service_count: number;
};
export type Service = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  organization_name: string;
  sector: string;
  organization_type: string;
  reviewer_count: string;
  average_rating: string | null;
  accepts_complaints: boolean;
};
export async function directory(
  input: { q?: string; sector?: string; type?: string; page?: number } = {},
) {
  const search = (input.q || "").trim().slice(0, 200),
    page = Math.max(1, Math.min(input.page || 1, 10000)),
    limit = 12;
  const conditions = sql`o.is_active AND (${search}='' OR o.name ILIKE ${"%" + search + "%"} OR o.description ILIKE ${"%" + search + "%"} OR EXISTS (SELECT 1 FROM company_feedback.services s WHERE s.organization_id=o.id AND s.is_active AND s.name ILIKE ${"%" + search + "%"})) AND (${input.sector || ""}='' OR o.sector=${input.sector || ""}) AND (${input.type || ""}='' OR o.organization_type=${input.type || ""})`;
  const [items, total, sectors] = await Promise.all([
    query<Organization>(
      sql`SELECT o.*, (SELECT count(*)::int FROM company_feedback.services s WHERE s.organization_id=o.id AND s.is_active) AS service_count FROM company_feedback.organizations o WHERE ${conditions} ORDER BY o.name,o.id LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
    ),
    one<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM company_feedback.organizations o WHERE ${conditions}`,
    ),
    query<{ sector: string }>(
      sql`SELECT DISTINCT sector FROM company_feedback.organizations WHERE is_active ORDER BY sector`,
    ),
  ]);
  return {
    items,
    total: total?.count || 0,
    sectors: sectors.map((s) => s.sector),
    page,
    pages: Math.ceil((total?.count || 0) / limit),
  };
}
export async function getOrganization(id: string) {
  return one<Organization>(
    sql`SELECT o.*, (SELECT count(*)::int FROM company_feedback.services s WHERE s.organization_id=o.id AND s.is_active) AS service_count FROM company_feedback.organizations o WHERE o.id=${id} AND o.is_active`,
  );
}
const serviceSelect = sql`SELECT s.id,s.organization_id,s.name,s.description,s.is_active,o.name AS organization_name,o.sector,o.organization_type,r.reviewer_count,r.average_rating,EXISTS(SELECT 1 FROM company_feedback.assessor_assignments a JOIN company_feedback.organizations authority ON authority.id=a.authority_id WHERE a.organization_id=o.id AND a.ended_at IS NULL AND authority.is_active AND authority.can_assess) AS accepts_complaints FROM company_feedback.services s JOIN company_feedback.organizations o ON o.id=s.organization_id JOIN company_feedback.service_rating_summary r ON r.service_id=s.id`;
export async function getService(id: string) {
  return one<Service>(
    sql`${serviceSelect} WHERE s.id=${id} AND s.is_active AND o.is_active`,
  );
}
export async function organizationServices(
  id: string,
  includeInactive = false,
) {
  return query<Service>(
    sql`${serviceSelect} WHERE s.organization_id=${id} AND (${includeInactive} OR (s.is_active AND o.is_active)) ORDER BY s.name,s.id`,
  );
}
export async function serviceOptions() {
  return query<{ id: string; name: string; organization_name: string }>(
    sql`SELECT s.id,s.name,o.name AS organization_name FROM company_feedback.services s JOIN company_feedback.organizations o ON o.id=s.organization_id WHERE s.is_active AND o.is_active ORDER BY o.name,s.name LIMIT 500`,
  );
}
export async function updateOrganization(u: Viewer, id: string, raw: unknown) {
  await requireRepresentative(u, id);
  const i = organizationProfileInput.parse(raw);
  await query(
    sql`UPDATE company_feedback.organizations SET name=${i.name},sector=${i.sector},description=${i.description},contact_email=${i.contactEmail || null},contact_phone=${i.contactPhone || null},address=${i.address || null} WHERE id=${id}`,
  );
  return { message: "Organization profile updated." };
}
export async function createService(
  u: Viewer,
  organizationId: string,
  raw: unknown,
) {
  await requireRepresentative(u, organizationId);
  const i = serviceInput.parse(raw);
  return (await one<{ id: string }>(
    sql`INSERT INTO company_feedback.services(organization_id,name,description,is_active) VALUES (${organizationId},${i.name},${i.description},${i.isActive}) RETURNING id`,
  ))!;
}
export async function updateService(u: Viewer, id: string, raw: unknown) {
  const s = await one<{ organization_id: string }>(
    sql`SELECT organization_id FROM company_feedback.services WHERE id=${id}`,
  );
  if (!s) throw new AppError(404, "Service not found.");
  await requireRepresentative(u, s.organization_id);
  const i = serviceInput.parse(raw);
  await query(
    sql`UPDATE company_feedback.services SET name=${i.name},description=${i.description},is_active=${i.isActive} WHERE id=${id}`,
  );
  return {
    message: "Service updated. Existing reviews and complaints are preserved.",
  };
}
