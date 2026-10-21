import "server-only";
import nodemailer from "nodemailer";
import { AppError } from "./errors";
export const emailConfigured = () =>
  Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD &&
    process.env.EMAIL_FROM,
  );
export async function sendEmail(
  to: string | string[],
  subject: string,
  text: string,
) {
  if (!emailConfigured())
    throw new AppError(
      503,
      "Email delivery is not configured. Ask the administrator to configure the email provider, then request a new code.",
    );
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    requireTLS:
      process.env.SMTP_REQUIRE_TLS !== "false" &&
      process.env.SMTP_SECURE !== "true",
    disableFileAccess: true,
    disableUrlAccess: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
  try {
    const result = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      ...(Array.isArray(to) ? { to: process.env.EMAIL_FROM, bcc: to } : { to }),
      subject,
      text,
    });
    if (result.rejected?.length) throw new Error("Provider rejected recipient");
  } catch {
    throw new AppError(
      503,
      "The email provider did not accept the message. Please try again later.",
    );
  }
}
