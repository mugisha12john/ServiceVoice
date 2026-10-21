import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { one, query } from "@/lib/db";
import { loginInput } from "@/lib/validation";
import { digest, rateLimit, secret } from "@/lib/security";

export const { handlers, auth, signIn, signOut } = NextAuth({
  basePath: "/api/v1/auth/session",
  trustHost:
    Boolean(process.env.AUTH_URL) || process.env.AUTH_TRUST_HOST === "true",
  secret: process.env.AUTH_SECRET,
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  providers: [
    Credentials({
      credentials: { email: { type: "email" }, password: { type: "password" } },
      async authorize(credentials) {
        secret();
        const parsed = loginInput.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        await rateLimit(`login:${email}`, 10, 900);
        const user = await one<{
          id: string;
          username: string;
          email: string;
          password_hash: string;
          is_active: boolean;
        }>(
          sql`SELECT id,username,email,password_hash,is_active FROM company_feedback.users WHERE email=${email}`,
        );
        // Always do a password comparison to limit timing differences for unknown users.
        const valid = await compare(
          password,
          user?.password_hash ||
            "$2b$12$C6UzMDM.H6dfI/f/IKcEe.5q8vT8OGkR0QZQqJgN7e4KJ0r9G5a3K",
        );
        if (!user?.is_active || !valid) return null;
        return { id: user.id, name: user.username, email: user.email };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        const sid = randomBytes(32).toString("hex");
        await query(
          sql`INSERT INTO company_feedback.app_sessions(token_hash,user_id,expires_at) VALUES (${digest(sid)},${user.id},statement_timestamp()+interval '7 days')`,
        );
        token.sid = sid;
      }
      if (typeof token.sid !== "string") return null;
      const active = await one<{ id: string }>(
        sql`SELECT u.id FROM company_feedback.app_sessions s JOIN company_feedback.users u ON u.id=s.user_id WHERE s.token_hash=${digest(token.sid)} AND s.user_id=${token.sub} AND s.expires_at>statement_timestamp() AND u.is_active`,
      );
      return active ? token : null;
    },
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
  events: {
    async signOut(message) {
      if ("token" in message && typeof message.token?.sid === "string")
        await query(
          sql`DELETE FROM company_feedback.app_sessions WHERE token_hash=${digest(message.token.sid)}`,
        );
    },
  },
  logger: {
    error() {
      console.error(
        "Authentication request failed; sensitive details withheld.",
      );
    },
  },
});
