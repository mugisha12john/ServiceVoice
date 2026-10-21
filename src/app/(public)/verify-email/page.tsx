import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/permissions";
import { emailConfigured } from "@/lib/email";
import { ApiForm, ActionButton } from "@/components/forms";
import { Notice, PageTitle } from "@/components/ui";
export default async function VerifyEmail() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <div className="container max-w-xl">
      <PageTitle
        eyebrow="Account verification"
        title={
          user.email_verified_at
            ? "You’re ready to be heard."
            : "Verify your email."
        }
        description={
          user.email_verified_at
            ? "Your email has been verified."
            : `Request a six-digit code at ${user.email}, then enter it below.`
        }
      />
      <div className="card">
        {user.email_verified_at ? (
          <Link href="/workspace" className="button">
            Go to your workspace
          </Link>
        ) : (
          <>
            {!emailConfigured() && (
              <Notice error>
                Email delivery is not configured yet. Ask the administrator to
                set up the email provider, then return here to request a code.
              </Notice>
            )}
            <ActionButton endpoint="/api/v1/auth/resend-verification">
              Send a verification code
            </ActionButton>
            <div className="mt-7">
              <ApiForm
                endpoint="/api/v1/auth/verify-email"
                submitLabel="Verify email"
                redirectTo="/workspace"
                fields={[
                  {
                    name: "code",
                    label: "Six-digit verification code",
                    required: true,
                    minLength: 6,
                    maxLength: 6,
                    autoComplete: "one-time-code",
                    placeholder: "000000",
                    hint: "Codes expire after 10 minutes and allow five attempts. Request at most one new code per minute, five per hour.",
                  },
                ]}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
