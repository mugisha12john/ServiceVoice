import "server-only";
import { sql } from "drizzle-orm";
import { hash } from "bcryptjs";
import { z } from "zod";
import { query, one, getDb } from "../db";
import { requireAdmin, type Viewer } from "../permissions";
import { AppError } from "../errors";
import {
  organizationInput,
  registerInput,
  membershipInput,
  assignmentInput,
} from "../validation";
import type { Organization } from "./catalog";

export async function adminOverview(u: Viewer) {
  requireAdmin(u);
  const [stats, organizations, users, memberships, assignments, reports] =
    await Promise.all([
      one<{
        organizations: number;
        users: number;
        services: number;
        reports: number;
      }>(
        sql`SELECT (SELECT count(*)::int FROM company_feedback.organizations) AS organizations,(SELECT count(*)::int FROM company_feedback.users) AS users,(SELECT count(*)::int FROM company_feedback.services) AS services,(SELECT count(*)::int FROM company_feedback.public_content_reports WHERE status='OPEN') AS reports`,
      ),
      query<Organization>(
        sql`SELECT o.*,(SELECT count(*)::int FROM company_feedback.services s WHERE s.organization_id=o.id AND s.is_active) AS service_count FROM company_feedback.organizations o ORDER BY o.name LIMIT 500`,
      ),
      query<{
        id: string;
        username: string;
        email: string;
        is_active: boolean;
        is_super_admin: boolean;
      }>(
        sql`SELECT id,username,email,is_active,is_super_admin FROM company_feedback.users ORDER BY created_at DESC LIMIT 500`,
      ),
      query<{
        id: string;
        username: string;
        organization_name: string;
        role: string;
        is_active: boolean;
      }>(
        sql`SELECT m.id,u.username,o.name AS organization_name,m.role,m.is_active FROM company_feedback.memberships m JOIN company_feedback.users u ON u.id=m.user_id JOIN company_feedback.organizations o ON o.id=m.organization_id ORDER BY m.created_at DESC LIMIT 500`,
      ),
      query<{
        id: string;
        organization_name: string;
        authority_name: string;
        ended_at: Date | null;
      }>(
        sql`SELECT a.id,o.name AS organization_name,t.name AS authority_name,a.ended_at FROM company_feedback.assessor_assignments a JOIN company_feedback.organizations o ON o.id=a.organization_id JOIN company_feedback.organizations t ON t.id=a.authority_id ORDER BY a.assigned_at DESC LIMIT 500`,
      ),
      query<{
        id: string;
        reason: string;
        status: string;
        comment: string;
        reported_by: string;
        created_at: Date;
      }>(
        sql`SELECT f.id,f.reason,f.status,coalesce(r.comment,p.body) AS comment,u.username AS reported_by,f.created_at FROM company_feedback.public_content_reports f LEFT JOIN company_feedback.reviews r ON r.id=f.review_id LEFT JOIN company_feedback.review_replies p ON p.id=f.reply_id JOIN company_feedback.users u ON u.id=f.reported_by WHERE f.status='OPEN' ORDER BY f.created_at LIMIT 100`,
      ),
    ]);
  return {
    stats: stats!,
    organizations,
    users,
    memberships,
    assignments,
    reports,
  };
}
export async function createOrganization(u: Viewer, raw: unknown) {
  requireAdmin(u);
  const i = organizationInput.parse(raw);
  return one<{ id: string }>(
    sql`INSERT INTO company_feedback.organizations(name,sector,organization_type,can_assess,description,contact_email,contact_phone,address,is_active) VALUES (${i.name},${i.sector},${i.organizationType},${i.canAssess},${i.description},${i.contactEmail || null},${i.contactPhone || null},${i.address || null},${i.isActive}) RETURNING id`,
  );
}
export async function adminUpdateOrganization(
  u: Viewer,
  id: string,
  raw: unknown,
) {
  requireAdmin(u);
  if (
    raw &&
    typeof raw === "object" &&
    Object.keys(raw).length === 1 &&
    "isActive" in raw
  ) {
    const i = z.object({ isActive: z.boolean() }).parse(raw);
    const r = await one(
      sql`UPDATE company_feedback.organizations SET is_active=${i.isActive} WHERE id=${id} RETURNING id`,
    );
    if (!r) throw new AppError(404, "Organization not found.");
    return {
      message: "Organization access updated. Existing records are preserved.",
    };
  }
  const i = organizationInput.parse(raw);
  const r = await one(
    sql`UPDATE company_feedback.organizations SET name=${i.name},sector=${i.sector},organization_type=${i.organizationType},can_assess=${i.canAssess},description=${i.description},contact_email=${i.contactEmail || null},contact_phone=${i.contactPhone || null},address=${i.address || null},is_active=${i.isActive} WHERE id=${id} RETURNING id`,
  );
  if (!r) throw new AppError(404, "Organization not found.");
  return { message: "Organization registration updated." };
}
export async function createStaff(u: Viewer, raw: unknown) {
  requireAdmin(u);
  const i = registerInput.parse(raw),
    passwordHash = await hash(i.password, 12);
  return one<{ id: string }>(
    sql`INSERT INTO company_feedback.users(username,email,password_hash) VALUES (${i.username},${i.email},${passwordHash}) RETURNING id`,
  );
}
export async function createMembership(u: Viewer, raw: unknown) {
  requireAdmin(u);
  const i = membershipInput.parse(raw);
  const org = await one<{ can_assess: boolean; is_active: boolean }>(
    sql`SELECT can_assess,is_active FROM company_feedback.organizations WHERE id=${i.organizationId}`,
  );
  if (!org?.is_active || (i.role === "ASSESSOR" && !org.can_assess))
    throw new AppError(
      400,
      "Assessors must belong to an active assessing authority; representatives need an active organization.",
    );
  await query(
    sql`INSERT INTO company_feedback.memberships(user_id,organization_id,role) VALUES (${i.userId},${i.organizationId},${i.role}) ON CONFLICT (user_id,organization_id,role) DO UPDATE SET is_active=true`,
  );
  return { message: "Membership assigned." };
}
export async function setMembershipAccess(u: Viewer, id: string, raw: unknown) {
  requireAdmin(u);
  const i = z.object({ isActive: z.boolean() }).parse(raw);
  if (i.isActive) {
    const eligible = await one<{ allowed: boolean }>(
      sql`SELECT (o.is_active AND (m.role='REPRESENTATIVE' OR o.can_assess)) AS allowed FROM company_feedback.memberships m JOIN company_feedback.organizations o ON o.id=m.organization_id WHERE m.id=${id}`,
    );
    if (!eligible?.allowed)
      throw new AppError(
        400,
        "This membership needs an active organization; assessors also need assessment enabled.",
      );
  }
  const r = await one(
    sql`UPDATE company_feedback.memberships SET is_active=${i.isActive} WHERE id=${id} RETURNING id`,
  );
  if (!r) throw new AppError(404, "Membership not found.");
  return { message: "Membership access updated." };
}
export async function setUserAccess(u: Viewer, id: string, raw: unknown) {
  requireAdmin(u);
  const i = z.object({ isActive: z.boolean() }).parse(raw);
  if (id === u.id)
    throw new AppError(400, "You cannot disable your own account.");
  return getDb().transaction(async (tx) => {
    const r = await one(
      sql`UPDATE company_feedback.users SET is_active=${i.isActive} WHERE id=${id} AND NOT is_super_admin RETURNING id`,
      tx,
    );
    if (!r)
      throw new AppError(
        400,
        "Account not found, or it is an administrator account requiring the secure administrative procedure.",
      );
    if (!i.isActive)
      await query(
        sql`DELETE FROM company_feedback.app_sessions WHERE user_id=${id}`,
        tx,
      );
    return {
      message:
        "Account access updated. Disabled account sessions have been revoked.",
    };
  });
}
export async function assignAuthority(u: Viewer, raw: unknown) {
  requireAdmin(u);
  const i = assignmentInput.parse(raw);
  return getDb().transaction(async (tx) => {
    await query(
      sql`SELECT id FROM company_feedback.organizations WHERE id=${i.organizationId} FOR UPDATE`,
      tx,
    );
    await query(
      sql`UPDATE company_feedback.assessor_assignments SET ended_at=statement_timestamp() WHERE organization_id=${i.organizationId} AND ended_at IS NULL`,
      tx,
    );
    await query(
      sql`INSERT INTO company_feedback.assessor_assignments(organization_id,authority_id,assigned_by) VALUES (${i.organizationId},${i.authorityId},${u.id})`,
      tx,
    );
    return {
      message:
        "Authority assigned. Existing complaints retain their original assignment.",
    };
  });
}
export async function endAssignment(u: Viewer, id: string) {
  requireAdmin(u);
  await query(
    sql`UPDATE company_feedback.assessor_assignments SET ended_at=statement_timestamp() WHERE id=${id} AND ended_at IS NULL`,
  );
  return {
    message:
      "Assignment ended. Existing complaints retain their original authority.",
  };
}
export async function moderateReport(u: Viewer, id: string, raw: unknown) {
  requireAdmin(u);
  const i = z
    .object({
      status: z.enum(["HIDDEN", "DISMISSED"]),
      note: z.string().trim().min(10).max(2000),
    })
    .parse(raw);
  const row = await one(
    sql`UPDATE company_feedback.public_content_reports SET status=${i.status},moderation_note=${i.note},reviewed_by=${u.id},reviewed_at=statement_timestamp() WHERE id=${id} AND status='OPEN' RETURNING id`,
  );
  if (!row)
    throw new AppError(
      404,
      "This report has already been reviewed or is unavailable.",
    );
  return {
    message:
      i.status === "HIDDEN"
        ? "Reported content hidden from public pages. Rating calculations and review history are retained."
        : "Report dismissed; public content remains visible.",
  };
}
