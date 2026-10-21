import type { Client } from "pg";
import { hash } from "bcryptjs";
import { ZodError } from "zod";
import { registerInput } from "../../src/lib/validation";

const messages = {
  EXISTS:
    "A super administrator already exists. Sign in with the existing account. This command does not reset passwords or create additional administrators.",
  INTERACTIVE:
    "Run interactively in a trusted terminal. Passwords must not be passed as command arguments.",
  DATABASE_URL:
    "DATABASE_URL is missing. Configure it privately in .env.local.",
} as const;

export class AdminBootstrapError extends Error {
  constructor(reason: keyof typeof messages) {
    super(messages[reason]);
  }
}

export async function administratorExists(client: Client) {
  const result = await client.query(
    "SELECT EXISTS (SELECT 1 FROM company_feedback.users WHERE is_super_admin) AS exists",
  );
  return result.rows[0].exists === true;
}

/** Only for the trusted operator CLI; never promote or overwrite an account. */
export async function createFirstAdministrator(client: Client, value: unknown) {
  const input = registerInput.parse(value);
  await client.query("BEGIN");
  try {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('company_feedback.first_admin'))",
    );
    if (await administratorExists(client))
      throw new AdminBootstrapError("EXISTS");
    const hashed = await hash(input.password, 12);
    await client.query(
      "INSERT INTO company_feedback.users(username,email,password_hash,is_super_admin) VALUES ($1,$2,$3,true)",
      [input.username, input.email, hashed],
    );
    await client.query("COMMIT");
  } catch (error) {
    // A lost connection can make rollback fail; preserve the original error.
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

/** Allowlisted explanations only: pg errors can contain credentials or row data. */
export function adminBootstrapErrorMessage(error: unknown): string {
  if (error instanceof AdminBootstrapError) return error.message;
  if (error instanceof ZodError) {
    const field = error.issues[0]?.path[0];
    if (field === "password")
      return "Use an administrator password of 12–72 characters, within 72 UTF-8 bytes.";
    if (field === "email") return "Enter a valid administrator email address.";
    if (field === "username")
      return "Use a username of 2–80 characters containing letters, numbers, spaces, dots, underscores, or hyphens.";
    return "Check the administrator username, email, and password.";
  }
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  switch (code) {
    case "23505":
      return "An account already uses that username or email. No account was promoted and no password was changed. Use a different account or follow a deliberate administrator recovery procedure.";
    case "42P01":
    case "3F000":
      return "The company_feedback users table is unavailable. Check that DATABASE_URL selects the existing application database.";
    case "42501":
      return "The database role lacks bootstrap permissions. Use a trusted operator connection with access to the users table.";
    case "28P01":
    case "28000":
      return "PostgreSQL rejected the database credentials. Check DATABASE_URL privately.";
    case "3D000":
      return "The database selected in DATABASE_URL does not exist. Check the connection settings privately.";
    case "ENOTFOUND":
    case "EAI_AGAIN":
    case "ECONNREFUSED":
    case "ECONNRESET":
    case "ETIMEDOUT":
    case "08001":
    case "08006":
      return "Could not reach PostgreSQL. Check your network and DATABASE_URL host, then try again.";
    case "CERT_HAS_EXPIRED":
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
    case "ERR_TLS_CERT_ALTNAME_INVALID":
      return "PostgreSQL TLS certificate verification failed. Check the host and certificate configuration; keep TLS verification enabled.";
    default:
      return "Check database access and application schema. Unexpected diagnostic details were withheld to protect credentials and account data.";
  }
}
