import "server-only";
import { sql } from "drizzle-orm";
import { getDb, one, query } from "../db";
import { sendEmail, emailConfigured } from "../email";
import { reference } from "../utils";
export async function maintenance() {
  const started = Date.now();
  const queued = await one<{ count: number }>(
    sql`SELECT company_feedback.enqueue_overdue_complaints() AS count`,
  );
  await query(
    sql`DELETE FROM company_feedback.security_rate_limits WHERE expires_at<statement_timestamp()-interval '1 day'`,
  );
  await query(
    sql`DELETE FROM company_feedback.app_sessions WHERE expires_at<statement_timestamp()`,
  );
  await query(
    sql`DELETE FROM company_feedback.email_verification_codes WHERE expires_at<statement_timestamp()-interval '7 days'`,
  );
  if (!emailConfigured())
    return {
      queued: queued?.count || 0,
      delivered: 0,
      email: "not configured",
    };
  let delivered = 0,
    failed = 0;
  // Each small transaction claims one outbox task, preventing concurrent workers
  // from sending it simultaneously. SMTP is at-least-once across process crashes.
  for (let i = 0; i < 10 && Date.now() - started < 35000; i++) {
    const processed = await getDb().transaction(async (tx) => {
      const row = await one<{
        id: string;
        complaint_id: string;
        recipient_organization_id: string;
        recipient_role: string;
        event_type: string;
        reference_number: string;
      }>(
        sql`SELECT n.id,n.complaint_id,n.recipient_organization_id,n.recipient_role,n.event_type,c.reference_number FROM company_feedback.notification_outbox n JOIN company_feedback.complaints c ON c.id=n.complaint_id WHERE n.delivered_at IS NULL AND n.attempts<8 AND n.created_at+make_interval(secs=>least(3600,n.attempts*n.attempts*60))<=statement_timestamp() ORDER BY n.created_at,n.id LIMIT 1 FOR UPDATE OF n SKIP LOCKED`,
        tx,
      );
      if (!row) return false;
      await query(
        sql`UPDATE company_feedback.notification_outbox SET attempts=attempts+1 WHERE id=${row.id}`,
        tx,
      );
      const recipients = await query<{ email: string }>(
        sql`SELECT DISTINCT u.email FROM company_feedback.memberships m JOIN company_feedback.users u ON u.id=m.user_id JOIN company_feedback.organizations o ON o.id=m.organization_id WHERE m.organization_id=${row.recipient_organization_id} AND m.role=${row.recipient_role} AND m.is_active AND u.is_active AND u.email_verified_at IS NOT NULL AND o.is_active`,
        tx,
      );
      try {
        if (!recipients.length)
          throw new Error("No verified active recipients");
        const label = reference(row.reference_number);
        await sendEmail(
          recipients.map((recipient) => recipient.email),
          `${label}: ${row.event_type === "RESPONSE_OVERDUE" ? "first response overdue" : "new private complaint"}`,
          `${row.event_type === "RESPONSE_OVERDUE" ? "The organization's first-response deadline has passed." : "A private complaint is available to your organization."}\nReference: ${label}\nSign in to view it: ${process.env.APP_URL}/workspace/complaints/${row.complaint_id}\nThis email does not contain complaint contents.`,
        );
        await query(
          sql`UPDATE company_feedback.notification_outbox SET delivered_at=statement_timestamp(),last_error=NULL WHERE id=${row.id}`,
          tx,
        );
        delivered++;
      } catch {
        await query(
          sql`UPDATE company_feedback.notification_outbox SET last_error='Delivery failed or no active verified recipient; retry scheduled. Review configuration and memberships.' WHERE id=${row.id}`,
          tx,
        );
        failed++;
      }
      return true;
    });
    if (!processed) break;
  }
  const pending = await one<{ pending: number; exhausted: number }>(
    sql`SELECT count(*) FILTER (WHERE delivered_at IS NULL)::int AS pending,count(*) FILTER (WHERE delivered_at IS NULL AND attempts>=8)::int AS exhausted FROM company_feedback.notification_outbox`,
  );
  return { queued: queued?.count || 0, delivered, failed, ...pending };
}
