import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { one } from "./db";
import { AppError } from "./errors";
export function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32)
    throw new AppError(
      503,
      "Authentication is not configured. Please contact the system administrator.",
    );
  return value;
}
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const keyedHash = (value: string) =>
  createHmac("sha256", secret()).update(value).digest("hex");
export function constantEqual(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export async function rateLimit(key: string, limit: number, seconds: number) {
  const hash = keyedHash(key),
    bucket = Math.floor(Date.now() / 1000 / seconds),
    expires = new Date((bucket + 1) * seconds * 1000);
  const result = await one<{ hits: number }>(
    sql`INSERT INTO company_feedback.security_rate_limits(key_hash,bucket,hits,expires_at) VALUES (${hash},${bucket},1,${expires}) ON CONFLICT (key_hash,bucket) DO UPDATE SET hits=company_feedback.security_rate_limits.hits+1 RETURNING hits`,
  );
  if (!result || result.hits > limit)
    throw new AppError(
      429,
      "Too many attempts. Please wait before trying again.",
    );
}
export function assertOrigin(request: Request) {
  const allowed = process.env.APP_URL || process.env.AUTH_URL;
  if (!allowed)
    throw new AppError(503, "The application URL is not configured.");
  if (request.headers.get("origin") !== new URL(allowed).origin)
    throw new AppError(403, "This request must be made from this application.");
}
