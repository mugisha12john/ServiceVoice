import Link from "next/link";
import { ApiForm } from "@/components/forms";
export default function Register() {
  return (
    <div className="auth-page">
      <div className="auth-story">
        <div>
          <p className="eyebrow">Make your voice heard</p>
          <h1>
            A better experience
            <br />
            begins with you.
          </h1>
          <p>
            Review a service. Report a problem privately. Follow the
            conversation and confirm when it’s resolved.
          </p>
        </div>
        <div className="auth-story-bottom">
          Public registration creates a consumer account. Organization and
          assessor access is managed by the administrator.
        </div>
      </div>
      <div className="auth-form">
        <h2>Create your account.</h2>
        <p>Start with a username, email, and a secure password.</p>
        <ApiForm
          endpoint="/api/v1/auth/register"
          submitLabel="Create consumer account"
          redirectTo="/login?registered=1"
          fields={[
            {
              name: "username",
              label: "Public username",
              required: true,
              minLength: 2,
              maxLength: 80,
              autoComplete: "username",
              hint: "This name appears alongside your public reviews.",
            },
            {
              name: "email",
              label: "Email address",
              type: "email",
              required: true,
              autoComplete: "email",
              hint: "Your email address is kept private.",
            },
            {
              name: "password",
              label: "Password",
              type: "password",
              required: true,
              minLength: 12,
              maxLength: 72,
              autoComplete: "new-password",
              hint: "Use 12–72 characters. We’ll ask you to verify your email after signing in.",
            },
          ]}
        />
        <div className="auth-switch">
          Already registered? <Link href="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
