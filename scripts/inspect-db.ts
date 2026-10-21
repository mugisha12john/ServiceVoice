import { Client } from "pg";
import { writeFile } from "node:fs/promises";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing");
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
  });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const columns = (
      await client.query(
        "select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='company_feedback' order by table_name, ordinal_position",
      )
    ).rows;
    const constraints = (
      await client.query(
        "select conrelid::regclass::text as relation, conname as name, pg_get_constraintdef(oid) as definition from pg_constraint where connamespace = 'company_feedback'::regnamespace order by 1,2",
      )
    ).rows;
    const views = (
      await client.query(
        "select viewname, definition from pg_views where schemaname='company_feedback' order by viewname",
      )
    ).rows;
    const triggers = (
      await client.query(
        "select event_object_table, trigger_name, action_statement from information_schema.triggers where trigger_schema='company_feedback' order by 1,2",
      )
    ).rows;
    const functions = (
      await client.query(
        "select proname as name, pg_get_functiondef(oid) as definition from pg_proc where pronamespace='company_feedback'::regnamespace order by proname",
      )
    ).rows;
    const report = {
      inspectedAt: new Date().toISOString(),
      columns,
      constraints,
      views,
      triggers,
      functions,
    };
    await writeFile(
      "docs/schema-inspection.json",
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(
      `Read-only inspection complete: ${new Set(columns.map((x) => x.table_name)).size} tables/views, ${triggers.length} trigger events, ${functions.length} functions. Metadata saved to docs/schema-inspection.json. No user data was read.`,
    );
    await client.query("ROLLBACK");
  } finally {
    await client.end();
  }
}
main().catch(() => {
  console.error(
    "Schema inspection failed. Check DATABASE_URL, network access, and schema permissions. Connection details were withheld.",
  );
  process.exitCode = 1;
});
