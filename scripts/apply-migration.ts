import { Client } from "pg";
import { readFile } from "node:fs/promises";
async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error("Missing database configuration");
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
  });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('company_feedback.application_migration'))",
    );
    const result = await client.query(
      "SELECT to_regclass('company_feedback.app_sessions') AS sessions,to_regclass('company_feedback.security_rate_limits') AS limits,to_regclass('company_feedback.public_content_reports') AS reports",
    );
    const values = Object.values(result.rows[0]);
    if (values.every(Boolean)) {
      await client.query("ROLLBACK");
      console.log(
        "Application support tables are already present. No changes made.",
      );
      return;
    }
    if (values.some(Boolean))
      throw new Error("Partially installed migration requires manual review");
    const baseline = await client.query(
      "SELECT to_regclass('company_feedback.users') AS users,to_regprocedure('company_feedback.is_complaint_participant(uuid,uuid)') AS participant",
    );
    if (!baseline.rows[0].users || !baseline.rows[0].participant)
      throw new Error("Expected baseline schema is missing");
    const migration = (
      await readFile("migrations/001_application_support.sql", "utf8")
    )
      .replace(/^BEGIN;$/m, "")
      .replace(/^COMMIT;$/m, "");
    await client.query(migration);
    await client.query("COMMIT");
    console.log(
      "Applied migration 001: added session, rate-limit, and moderation-report tables. Existing schema objects and data were preserved.",
    );
  } catch {
    await client.query("ROLLBACK");
    throw new Error(
      "Migration not applied. Review baseline schema and permissions. Connection details withheld.",
    );
  } finally {
    await client.end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
