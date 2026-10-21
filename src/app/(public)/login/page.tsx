import Link from "next/link";
import { ApiForm } from "@/components/forms";
import { Notice } from "@/components/ui";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  return (
    <div className="auth-page">
      <div className="auth-story">
        <div>
          <p className="eyebrow">Welcome to ServiceVoice</p>
          <h1>
            Good service starts
            <br />
            with being heard.
          </h1>
          <p>
            One place for your service experiences, private complaints, and the
            conversations that move them forward.
          </p>
        </div>
        <div className="auth-story-bottom">
          Your public voice. A private path to resolution.
        </div>
      </div>
      <div className="auth-form">
        <h2>Welcome back.</h2>
        <p>Sign in to continue to your workspace.</p>
        {p.registered && (
          <Notice>
            Your account is ready. Sign in, then verify your email to start
            contributing.
          </Notice>
        )}
        <ApiForm
          endpoint="/api/v1/auth/login"
          submitLabel="Sign in"
          redirectTo="/workspace"
          fields={[
            {
              name: "email",
              label: "Email address",
              type: "email",
              required: true,
              autoComplete: "email",
              placeholder: "you@example.com",
            },
            {
              name: "password",
              label: "Password",
              type: "password",
              required: true,
              autoComplete: "current-password",
            },
          ]}
        />
        <div className="auth-switch">
          New here? <Link href="/register">Create a consumer account</Link>
        </div>
      </div>
    </div>
  );
}
