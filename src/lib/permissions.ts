import "server-only";
import { cache } from "react";
import { sql } from "drizzle-orm";
import { auth } from "@/auth";
import { one, query, type Executor } from "./db";
import { AppError } from "./errors";
export type Membership = {
  id: string;
  organization_id: string;
  organization_name: string;
  role: "REPRESENTATIVE" | "ASSESSOR";
};
export type Viewer = {
  id: string;
  username: string;
  email: string;
  profile_picture_url: string | null;
  email_verified_at: Date | null;
  is_super_admin: boolean;
  memberships: Membership[];
};
export const currentUser = cache(async (): Promise<Viewer | null> => {
  if (!process.env.AUTH_SECRET) return null;
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await one<Omit<Viewer, "memberships">>(
    sql`SELECT id,username,email,profile_picture_url,email_verified_at,is_super_admin FROM company_feedback.users WHERE id=${session.user.id} AND is_active`,
  );
  if (!user) return null;
  const memberships = await query<Membership>(
    sql`SELECT m.id,m.organization_id,o.name AS organization_name,m.role FROM company_feedback.memberships m JOIN company_feedback.organizations o ON o.id=m.organization_id WHERE m.user_id=${user.id} AND m.is_active AND o.is_active`,
  );
  return { ...user, memberships };
});
export async function requireUser(verified = false) {
  const u = await currentUser();
  if (!u) throw new AppError(401, "Please sign in to continue.");
  if (verified && !u.email_verified_at)
    throw new AppError(403, "Verify your email before contributing.");
  return u;
}
export function requireAdmin(u: Viewer) {
  if (!u.is_super_admin)
    throw new AppError(403, "Administrator access is required.");
}
export async function requireRepresentative(
  u: Viewer,
  organizationId: string,
  executor?: Executor,
) {
  const r = await one<{ allowed: boolean }>(
    sql`SELECT company_feedback.is_org_representative(${u.id}::uuid,${organizationId}::uuid) AS allowed`,
    executor,
  );
  if (!r?.allowed)
    throw new AppError(403, "You do not represent this organization.");
}
export async function requireParticipant(
  u: Viewer,
  complaintId: string,
  executor?: Executor,
) {
  const r = await one<{ allowed: boolean }>(
    sql`SELECT company_feedback.is_complaint_participant(${u.id}::uuid,${complaintId}::uuid) AS allowed`,
    executor,
  );
  if (!r?.allowed)
    throw new AppError(
      404,
      "This complaint is unavailable or you do not have access.",
    );
}
