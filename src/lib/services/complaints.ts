import "server-only";
import { sql } from "drizzle-orm";
import { one, query, getDb } from "../db";
import { AppError } from "../errors";
import {
  requireParticipant,
  requireRepresentative,
  type Viewer,
} from "../permissions";
import { bodyInput, descriptionInput } from "../validation";
export type Complaint = {
  id: string;
  reference_number: string;
  consumer_id: string;
  service_id: string;
  assignment_id: string;
  description: string;
  status: "PENDING" | "RESOLVED";
  submitted_at: Date;
  response_due_at: Date;
  first_response_at: Date | null;
  resolved_at: Date | null;
  service_name: string;
  organization_name: string;
  organization_id: string;
  authority_name: string;
  overdue: boolean;
};
export type Message = {
  id: string;
  author_id: string;
  username: string;
  body: string;
  created_at: Date;
  author_role: string;
};
export type Attachment = {
  id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: string;
  created_at: Date;
};
export type Proposal = {
  id: string;
  description: string;
  proposed_at: Date;
  confirmed_at: Date | null;
  username: string;
};
const complaintSelect = sql`SELECT c.*,s.name AS service_name,o.name AS organization_name,o.id AS organization_id,authority.name AS authority_name,(c.status='PENDING' AND c.first_response_at IS NULL AND c.response_due_at<=statement_timestamp()) AS overdue FROM company_feedback.complaints c JOIN company_feedback.services s ON s.id=c.service_id JOIN company_feedback.organizations o ON o.id=s.organization_id JOIN company_feedback.assessor_assignments a ON a.id=c.assignment_id JOIN company_feedback.organizations authority ON authority.id=a.authority_id`;
export async function listComplaints(
  u: Viewer,
  scope = "all",
  filter = "all",
  page = 1,
) {
  const roleScope =
    scope === "consumer"
      ? sql`c.consumer_id=${u.id}`
      : scope === "organization"
        ? sql`company_feedback.is_org_representative(${u.id}::uuid,s.organization_id)`
        : scope === "assessor"
          ? sql`EXISTS(SELECT 1 FROM company_feedback.memberships m WHERE m.user_id=${u.id} AND m.organization_id=a.authority_id AND m.role='ASSESSOR' AND m.is_active)`
          : sql`true`;
  const filterSql =
    filter === "overdue"
      ? sql`c.status='PENDING' AND c.first_response_at IS NULL AND c.response_due_at<=statement_timestamp()`
      : filter === "resolved"
        ? sql`c.status='RESOLVED'`
        : filter === "pending"
          ? sql`c.status='PENDING'`
          : sql`true`;
  return query<Complaint>(
    sql`${complaintSelect} WHERE company_feedback.is_complaint_participant(${u.id}::uuid,c.id) AND ${roleScope} AND ${filterSql} ORDER BY c.submitted_at DESC,c.id DESC LIMIT 50 OFFSET ${(Math.max(1, page) - 1) * 50}`,
  );
}
export async function complaintDetail(u: Viewer, id: string) {
  await requireParticipant(u, id);
  const complaint = await one<Complaint>(
    sql`${complaintSelect} WHERE c.id=${id}`,
  );
  if (!complaint) throw new AppError(404, "Complaint not found.");
  const [messages, attachments, proposals] = await Promise.all([
    query<Message>(
      sql`SELECT m.id,m.author_id,u.username,m.body,m.created_at,CASE WHEN m.author_id=${complaint.consumer_id} THEN 'Consumer' WHEN company_feedback.is_org_representative(m.author_id,${complaint.organization_id}::uuid) THEN 'Organization' ELSE 'Assessor' END AS author_role FROM company_feedback.complaint_messages m JOIN company_feedback.users u ON u.id=m.author_id WHERE m.complaint_id=${id} ORDER BY m.created_at,m.id`,
    ),
    query<Attachment>(
      sql`SELECT id,original_filename,mime_type,size_bytes,created_at FROM company_feedback.complaint_attachments WHERE complaint_id=${id} ORDER BY created_at,id`,
    ),
    query<Proposal>(
      sql`SELECT p.id,p.description,p.proposed_at,p.confirmed_at,u.username FROM company_feedback.resolution_proposals p JOIN company_feedback.users u ON u.id=p.proposed_by WHERE p.complaint_id=${id} ORDER BY p.proposed_at DESC,p.id DESC`,
    ),
  ]);
  return { complaint, messages, attachments, proposals };
}
export async function createComplaint(
  u: Viewer,
  serviceId: string,
  raw: unknown,
) {
  const i = descriptionInput.parse(raw);
  if (!u.email_verified_at)
    throw new AppError(403, "Verify your email before submitting a complaint.");
  // The existing BEFORE INSERT trigger determines assignment, status, and deadline.
  return (await one<{
    id: string;
    reference_number: string;
    status: string;
    response_due_at: Date;
  }>(
    sql`INSERT INTO company_feedback.complaints(consumer_id,service_id,description) VALUES (${u.id},${serviceId},${i.description}) RETURNING id,reference_number,status,response_due_at`,
  ))!;
}
export async function addMessage(u: Viewer, id: string, raw: unknown) {
  const i = bodyInput.parse(raw);
  await requireParticipant(u, id);
  await query(
    sql`INSERT INTO company_feedback.complaint_messages(complaint_id,author_id,body) VALUES (${id},${u.id},${i.body})`,
  );
  return { message: "Your response has been added to the private discussion." };
}
export async function proposeResolution(u: Viewer, id: string, raw: unknown) {
  const i = descriptionInput.parse(raw);
  await requireParticipant(u, id);
  const c = await one<{ organization_id: string }>(
    sql`SELECT s.organization_id FROM company_feedback.complaints c JOIN company_feedback.services s ON s.id=c.service_id WHERE c.id=${id}`,
  );
  if (!c) throw new AppError(404, "Complaint not found.");
  await requireRepresentative(u, c.organization_id);
  await query(
    sql`INSERT INTO company_feedback.resolution_proposals(complaint_id,proposed_by,description) VALUES (${id},${u.id},${i.description})`,
  );
  return {
    message:
      "Resolution proposed. The complaint remains pending until its consumer confirms.",
  };
}
export async function confirmResolution(u: Viewer, id: string) {
  if (!u.email_verified_at)
    throw new AppError(403, "Verify your email before confirming resolution.");
  return getDb().transaction(async (tx) => {
    const proposal = await one<{ id: string; consumer_id: string }>(
      sql`SELECT p.id,c.consumer_id FROM company_feedback.resolution_proposals p JOIN company_feedback.complaints c ON c.id=p.complaint_id WHERE p.id=${id} AND p.confirmed_at IS NULL AND c.status='PENDING' FOR UPDATE OF c,p`,
      tx,
    );
    if (!proposal || proposal.consumer_id !== u.id)
      throw new AppError(
        404,
        "This proposal is unavailable or does not belong to your complaint.",
      );
    await query(
      sql`UPDATE company_feedback.resolution_proposals SET confirmed_by=${u.id} WHERE id=${id} AND confirmed_at IS NULL`,
      tx,
    );
    return {
      message:
        "You confirmed the proposed resolution. This complaint is now resolved.",
    };
  });
}
