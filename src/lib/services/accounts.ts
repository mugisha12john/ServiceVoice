import "server-only";
import { sql } from "drizzle-orm";
import { hash } from "bcryptjs";
import { randomInt } from "node:crypto";
import { getDb, one, query } from "../db";
import { AppError } from "../errors";
import { constantEqual, keyedHash, rateLimit } from "../security";
import { sendEmail, emailConfigured } from "../email";
import { registerInput, profileInput, verificationInput } from "../validation";
import type { Viewer } from "../permissions";

export async function register(raw: unknown) {
  const input = registerInput.parse(raw);
  await rateLimit(`register:${input.email}`, 3, 3600);
  const passwordHash = await hash(input.password, 12);
  const user = await one<{ id: string }>(
    sql`INSERT INTO company_feedback.users(username,email,password_hash) VALUES (${input.username},${input.email},${passwordHash}) RETURNING id`,
  );
  return {
    message: "Account created. Sign in to verify your email.",
    id: user!.id,
    emailConfigured: emailConfigured(),
  };
}
export async function resendVerification(u: Viewer) {
  if (u.email_verified_at)
    throw new AppError(409, "Your email is already verified.");
  if (!emailConfigured())
    throw new AppError(
      503,
      "Email delivery is not configured. Ask the administrator to configure the email provider, then request a code.",
    );
  await rateLimit(`resend-minute:${u.id}`, 1, 60);
  await rateLimit(`resend-hour:${u.id}`, 5, 3600);
  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  const codeHash = keyedHash(`verify:${u.id}:${code}`);
  // Serialize issuance for an account; all earlier codes are invalidated.
  await getDb().transaction(async (tx) => {
    await query(
      sql`SELECT id FROM company_feedback.users WHERE id=${u.id} FOR UPDATE`,
      tx,
    );
    const recent = await one<{ minute: number; hour: number }>(
      sql`SELECT count(*) FILTER(WHERE created_at>statement_timestamp()-interval '60 seconds')::int AS minute,count(*)::int AS hour FROM company_feedback.email_verification_codes WHERE user_id=${u.id} AND created_at>statement_timestamp()-interval '1 hour'`,
      tx,
    );
    if (recent && (recent.minute >= 1 || recent.hour >= 5))
      throw new AppError(
        429,
        "Wait at least 60 seconds between verification emails. You can request up to five per hour.",
      );
    await query(
      sql`UPDATE company_feedback.email_verification_codes SET consumed_at=statement_timestamp() WHERE user_id=${u.id} AND consumed_at IS NULL`,
      tx,
    );
    await query(
      sql`INSERT INTO company_feedback.email_verification_codes(user_id,code_hash,expires_at) VALUES (${u.id},${codeHash},statement_timestamp()+interval '10 minutes')`,
      tx,
    );
  });
  try {
    await sendEmail(
      u.email,
      "Verify your ServiceVoice account",
      `Your verification code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
    );
  } catch (error) {
    await query(
      sql`UPDATE company_feedback.email_verification_codes SET consumed_at=statement_timestamp() WHERE user_id=${u.id} AND code_hash=${codeHash} AND consumed_at IS NULL`,
    );
    throw error;
  }
  return {
    message:
      "The email provider accepted your verification email. Check your inbox and spam folder.",
  };
}
export async function verifyEmail(u: Viewer, raw: unknown) {
  const { code } = verificationInput.parse(raw);
  await rateLimit(`verify:${u.id}`, 20, 3600);
  const result = await getDb().transaction(async (tx) => {
    await query(
      sql`SELECT id FROM company_feedback.users WHERE id=${u.id} FOR UPDATE`,
      tx,
    );
    const record = await one<{
      id: string;
      code_hash: string;
      failed_attempts: number;
      expired: boolean;
    }>(
      sql`SELECT id,code_hash,failed_attempts,expires_at<=statement_timestamp() AS expired FROM company_feedback.email_verification_codes WHERE user_id=${u.id} AND consumed_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE`,
      tx,
    );
    if (!record || record.expired || record.failed_attempts >= 5) return false;
    if (!constantEqual(record.code_hash, keyedHash(`verify:${u.id}:${code}`))) {
      await query(
        sql`UPDATE company_feedback.email_verification_codes SET failed_attempts=failed_attempts+1 WHERE id=${record.id}`,
        tx,
      );
      return false;
    }
    await query(
      sql`UPDATE company_feedback.email_verification_codes SET consumed_at=statement_timestamp() WHERE id=${record.id}`,
      tx,
    );
    await query(
      sql`UPDATE company_feedback.users SET email_verified_at=coalesce(email_verified_at,statement_timestamp()) WHERE id=${u.id}`,
      tx,
    );
    return true;
  });
  if (!result)
    throw new AppError(
      400,
      "The code is incorrect, expired, or has reached five attempts. Request a new code if needed.",
    );
  return {
    message:
      "Your email is verified. You can now write reviews and submit complaints.",
  };
}
export async function updateProfile(u: Viewer, raw: unknown) {
  const input = profileInput.parse(raw);
  await query(
    sql`UPDATE company_feedback.users SET username=${input.username},profile_picture_url=${input.profilePictureUrl || null} WHERE id=${u.id}`,
  );
  return { message: "Profile updated." };
}
